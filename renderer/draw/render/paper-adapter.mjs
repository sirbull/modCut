/** Retained model -> Paper view. Culling and Outline never change document data. */
import { createSelectionOverlay } from './overlays.mjs';
import { activeArtboard } from '../doc/artboards.mjs';
import { createAnchorOverlay } from './anchors.mjs';
import { transformProperties } from '../geometry.mjs';
import { editablePath,cornerGeometry,roundCorners } from '../geom/corners.mjs';
import { shapeSelectionKey } from '../doc/selection.mjs';
import { scaledStrokeProperties } from '../geom/transforms.mjs';

export function createDrawRenderer(scope, state, { onImageLoad = () => {}, withScope = fn => fn() } = {}) {
  const boards = new scope.Layer({ name: 'Artboards' });
  const artwork = new scope.Layer({ name: 'Draw artwork' });
  const overlay = new scope.Layer({ name: 'Selection' });
  const labels = new scope.Group({insert:false}); overlay.addChild(labels);
  const items = new Map(), records = new Map(), boardItems = new Map();
  const worldBounds = new Map(), paintedBounds = new Map();
  const editPreviews=new Map();
  const transformPreviewIds=new Set();let transformPreview=null,transformPreviewOptions=null;
  let destroyed = false, outline = !!state.ui?.outline;
  let labelColor='#435A50',labelBackground='#E7F5EF';
  const selection = createSelectionOverlay(scope, overlay, state, id => bounds(id));
  const pointToWorld=(id,point)=>new scope.Point(...point).transform(records.get(id).worldMatrix);
  const editingMatrix=id=>{
    const node=state.document.getNode(id),parentId=node?.type==='shape'?state.document.locate(id).parentId:id;
    return records.get(parentId)?.worldMatrix??new scope.Matrix();
  };
  const editPointToWorld=(id,p)=>new scope.Point(...p).transform(editingMatrix(id));
  const editPointToLocal=(id,p)=>new scope.Point(p).transform(editingMatrix(id).inverted());
  function editingNode(id,{logical=true,preview=true}={}){
    const original=state.document.getNode(id),node=(preview?editPreviews.get(id):null)??(original?.type==='shape'?expandedShape(id):original);
    return node?.type==='path'&&logical?{...node,subpaths:node.subpaths.map(editablePath)}:node;
  }
  function cornerWidgets(){
    if(state.ui?.tool!=='direct-selection'||state.document.readOnly)return [];
    const result=[],selected=state.selection.anchors;
    for(const id of state.selection.ids){const node=editingNode(id);if(node?.type!=='path'||!state.document.isEditable(id))continue;
      node.subpaths.forEach((path,subpath)=>path.segments.forEach((s,segment)=>{
        if(selected.length&&!selected.some(a=>a.nodeId===id&&a.subpath===subpath&&a.segment===segment))return;
        const corner=cornerGeometry(path,segment);if(!corner)return;
        const p=editPointToWorld(id,s.p),unit=editPointToWorld(id,s.p.map((n,i)=>n+corner.bisector[i])).subtract(p).length;
        const distance=corner.radius>0?corner.radius/corner.sin:Math.min(16/scope.view.zoom/(unit||1),corner.maxRadius/corner.sin*.65);
        const point=editPointToWorld(id,s.p.map((n,i)=>n+corner.bisector[i]*distance));
        result.push({nodeId:id,subpath,segment,kind:'corner',logical:true,shapeKey:state.document.getNode(id).type==='shape'?shapeSelectionKey(state.document.getNode(id)):undefined,point,corner});
      }));
    }return result;
  }
  const anchors=createAnchorOverlay(scope,overlay,state,editPointToWorld,id=>editingNode(id,{logical:['direct-selection','anchor-point','delete-anchor'].includes(state.ui?.tool)}),cornerWidgets);

  function color(paint) {
    if (!paint || paint.type !== 'solid') return null;
    const { space, values: v } = paint.color;
    if (space === 'rgb') return new scope.Color(...v);
    if (space === 'gray') return new scope.Color(v[0]);
    if (space === 'cmyk') return new scope.Color(...v.slice(0, 3).map(n => (1 - n) * (1 - v[3])));
    return new scope.Color({ hue: v[0] * 360, saturation: v[1], brightness: v[2] });
  }
  function path(data) {
    return new scope.Path({ insert: false, closed: data.closed, segments: data.segments.map(s =>
      new scope.Segment(new scope.Point(...s.p), new scope.Point(...s.in), new scope.Point(...s.out))) });
  }
  function imageSize(node) {
    const asset = state.document.data.assets[node.assetId];
    return [node.width ?? asset.width * 25.4 / 96, node.height ?? asset.height * 25.4 / 96];
  }
  function positionImage(item, node) {
    if (!item.loaded || !item.width || !item.height) return;
    const [width, height] = imageSize(node);
    // Scale the view matrix, retaining the full resolution source pixels.
    item.matrix = new scope.Matrix(...node.transform)
      .translate(width / 2, height / 2).scale(width / item.width, height / item.height);
  }
  function make(node) {
    if (node.children) return new scope.Group({ insert: false });
    if (node.type === 'path') return node.subpaths.length === 1 ? path(node.subpaths[0])
      : new scope.CompoundPath({ insert: false, children: node.subpaths.map(path) });
    if (node.type === 'shape') {
      const p = node.params, x = p.x ?? 0, y = p.y ?? 0;
      const rectangle = new scope.Rectangle(x, y, p.width ?? 0, p.height ?? 0);
      if (node.shape === 'rect') return new scope.Path.Rectangle({ rectangle, radius: p.cornerRadius ?? 0, insert: false });
      if (node.shape === 'ellipse') {
        const start=p.startAngle ?? 0, raw=(p.endAngle ?? 360)-start, sweep=((raw%360)+360)%360;
        if(Math.abs(raw)>=360 || Math.abs(sweep)<1e-9)return new scope.Path.Ellipse({rectangle,insert:false});
        const cx=rectangle.center.x,cy=rectangle.center.y,rx=rectangle.width/2,ry=rectangle.height/2;
        const points=[new scope.Segment([cx,cy])], count=Math.ceil(sweep/90),step=sweep*Math.PI/180/count;
        let angle=start*Math.PI/180;
        points.push(new scope.Segment([cx+rx*Math.cos(angle),cy+ry*Math.sin(angle)]));
        for(let i=0;i<count;i++) {
          const end=angle+step,k=4/3*Math.tan(step/4);
          points.at(-1).handleOut=new scope.Point(-rx*Math.sin(angle)*k,ry*Math.cos(angle)*k);
          points.push(new scope.Segment([cx+rx*Math.cos(end),cy+ry*Math.sin(end)],[rx*Math.sin(end)*k,-ry*Math.cos(end)*k]));
          angle=end;
        }
        return new scope.Path({segments:points,closed:true,insert:false});
      }
      if (node.shape === 'line') return new scope.Path({ segments: [[p.x1 ?? 0, p.y1 ?? 0], [p.x2 ?? p.width ?? 0, p.y2 ?? p.height ?? 0]], insert: false });
      if (node.shape === 'polygon') return new scope.Path.RegularPolygon({ center: [x, y], sides: p.sides ?? 6, radius: p.radius ?? 10, insert: false });
      if (node.shape === 'star') return new scope.Path.Star({ center: [x, y], points: p.points ?? 5, radius1: p.innerRadius ?? 5, radius2: p.outerRadius ?? 10, insert: false });
    }
    if (node.type === 'image') {
      const asset = state.document.data.assets[node.assetId];
      const raster = new scope.Raster({ source: `data:${asset.mimeType};base64,${asset.data}`, insert: false });
      raster.onLoad = () => {
        // A delayed load must not resurrect a removed/replaced item or use an old transform.
        if (destroyed || items.get(node.id) !== raster) return;
        withScope(() => {
          positionImage(raster, records.get(node.id).node);
          updateBounds(); updateView(); onImageLoad();
        });
      };
      return raster;
    }
    return new scope.Group({ insert: false });
  }
  function geometryKey(node) {
    if (node.type === 'path') return JSON.stringify([node.subpaths, node.fillRule]);
    if (node.type === 'shape') return JSON.stringify([node.shape, node.params]);
    if (node.type === 'image') return JSON.stringify([node.assetId, state.document.data.assets[node.assetId]]);
    return node.type;
  }
  function style(item, node, asOutline = outline) {
    item.opacity = asOutline ? 1 : node.opacity;
    item.blendMode = asOutline ? 'normal' : node.blendMode;
    if (node.children || node.type === 'image') return;
    const fill = node.appearance.fills[0], stroke = node.appearance.strokes[0];
    item.fillColor = asOutline ? null : color(fill?.paint);
    item.strokeColor = asOutline ? '#071411' : color(stroke?.paint);
    if (item.fillColor) item.fillColor.alpha = fill?.opacity ?? 1;
    if (item.strokeColor && !asOutline) item.strokeColor.alpha = stroke?.opacity ?? 1;
    const strokeZoom=!asOutline&&node.strokeScaling===false?scope.view.zoom:1;
    item.strokeWidth = asOutline ? 1 / scope.view.zoom : (stroke?.width ?? 0)*strokeZoom;
    item.strokeScaling = !asOutline && node.strokeScaling!==false;
    item.strokeCap = asOutline ? 'butt' : stroke?.cap ?? 'butt';
    item.strokeJoin = asOutline ? 'miter' : stroke?.join ?? 'miter';
    item.miterLimit = stroke?.miterLimit ?? 4;
    item.dashArray = asOutline ? [] : (stroke?.dash?.array ?? []).map(n=>n*strokeZoom);
    item.dashOffset = asOutline ? 0 : (stroke?.dash?.offset ?? 0)*strokeZoom;
    if (node.type === 'path') item.fillRule = node.fillRule;
  }
  function place(parent, item, index) {
    if (parent.children[index] !== item) parent.insertChild(index, item);
  }
  function reconcile(nodes, parent, alive) {
    let index = 0;
    for (const node of nodes) {
      alive.add(node.id);
      const geometry = geometryKey(node), own = { ...node }; delete own.children;
      const fingerprint = JSON.stringify(own);
      let record = records.get(node.id), item = items.get(node.id);
      const replaced = !record || record.node.type !== node.type || record.geometry !== geometry;
      if (replaced) {
        item?.remove(); record?.frame?.remove();
        item = make(node); item.applyMatrix = false; item.data.nodeId = node.id;
        items.set(node.id, item);
        record = { node, geometry }; records.set(node.id, record);
      }
      if (replaced || record.fingerprint !== fingerprint) {
        record.node = node; record.fingerprint = fingerprint;
        item.matrix = new scope.Matrix(...node.transform);
        if (node.type === 'image') {
          positionImage(item, node);
          record.frame?.remove();
          const [width, height] = imageSize(node);
          record.frame = new scope.Path.Rectangle({ rectangle: [0, 0, width, height], insert: false });
          record.frame.applyMatrix = false; record.frame.matrix = new scope.Matrix(...node.transform);
          record.frame.data.nodeId = node.id; record.frame.strokeColor = '#071411'; record.frame.strokeScaling = false;
        }
        style(item, node);
      }
      // Bounds must be measured before viewport visibility is applied.
      item.visible = node.visible;
      place(parent, item, index++);
      if (record.frame) { record.frame.visible = false; place(parent, record.frame, index++); }
      if (node.children) reconcile(node.children, item, alive);
    }
  }
  function union(a, b) { return a ? a.unite(b) : b.clone(); }
  function updateBounds() {
    worldBounds.clear(); paintedBounds.clear();
    function visit(nodes, parentMatrix = new scope.Matrix()) {
      let combined = null;
      for (const node of nodes) {
        const item = items.get(node.id);
        // Compose from the model: Paper may cache an old global matrix after reparenting.
        const matrix = new scope.Matrix(...node.transform).prepend(parentMatrix);
        records.get(node.id).worldMatrix = matrix;
        const b = node.children ? visit(node.children, matrix) : node.type === 'image'
          ? records.get(node.id).frame.getBounds(matrix) : item.getBounds(matrix);
        if (b) {
          worldBounds.set(node.id, b.clone());
          // Stroke bounds preserve thick strokes intersecting the viewport edge.
          if (outline && !node.children && node.type !== 'image') style(item, node, false);
          paintedBounds.set(node.id, node.children || node.type === 'image' ? b.clone() : item.getStrokeBounds(matrix));
          if (outline && !node.children && node.type !== 'image') style(item, node);
          if (node.visible) combined = union(combined, b);
        }
      }
      return combined;
    }
    visit(state.document.data.layers);
  }
  function render() {
    const data = state.document.data, alive = new Set();
    data.artboards.forEach((board, index) => {
      let record = boardItems.get(board.id);
      const key = JSON.stringify(board);
      if (!record || record.key !== key) {
        record?.item.remove(); record?.label.remove(); record?.labelRect.remove();
        const item = new scope.Path.Rectangle({ rectangle: [board.x, board.y, board.width, board.height], insert: false });
        item.fillColor = board.background === 'transparent' ? null : board.background;
        item.strokeColor = '#CFE6DC'; item.strokeScaling = false;
        const labelRect=new scope.Path.Rectangle({rectangle:[0,0,1,1],fillColor:labelBackground,insert:false});labels.addChild(labelRect);
        const label=new scope.PointText({point:[board.x,board.y],content:board.name,fillColor:labelColor,insert:false}); labels.addChild(label);
        record = { key, item, label, labelRect }; boardItems.set(board.id, record);
      }
      place(boards, record.item, index);
    });
    for (const [id, record] of boardItems) if (!data.artboards.some(b => b.id === id)) { record.item.remove(); record.label.remove(); record.labelRect.remove(); boardItems.delete(id); }
    reconcile(data.layers, artwork, alive);
    for (const [id, item] of items) if (!alive.has(id)) {
      item.remove(); records.get(id).frame?.remove(); items.delete(id); records.delete(id);
    }
    updateBounds(); updateView();
  }
  function bounds(id) { return worldBounds.get(id)?.clone() || null; }
  function selectionBounds() {
    let result = null;
    for (const id of state.selection.ids) { const b = bounds(id); if (b) result = union(result, b); }
    return result;
  }
  function updateView() {
    const viewport = scope.view.bounds.expand(16 / scope.view.zoom);
    for (const [id, record] of records) {
      const item = items.get(id), node = record.node;
      if(node.strokeScaling===false)style(item,node);
      const b = paintedBounds.get(id);
      const visible = node.visible && (!!node.children || !!b?.intersects(viewport));
      item.visible = visible && !(outline && node.type === 'image') && !editPreviews.has(id) && !transformPreviewIds.has(id);
      if (outline && !node.children && node.type !== 'image') item.strokeWidth = 1 / scope.view.zoom;
      if (record.frame) { record.frame.visible = visible && outline; record.frame.strokeWidth = 1 / scope.view.zoom; }
    }
    for (const [id,{item,label,labelRect}] of boardItems) {
      item.strokeWidth=(id===activeArtboard(state).id ? 2 : 1)/scope.view.zoom; item.visible=item.bounds.intersects(viewport);
      label.point=item.bounds.topLeft.add([0,-8/scope.view.zoom]);label.fontSize=12/scope.view.zoom;label.visible=item.visible;
      labelRect.bounds=label.bounds.expand(6/scope.view.zoom,4/scope.view.zoom);labelRect.visible=label.visible;
    }
    if(transformPreview)transformPreview.getItems({match:item=>!!item.data.nodeId}).forEach(item=>{
      const record=records.get(item.data.nodeId);if(!record)return;
      const {matrix,scaleStrokes}=transformPreviewOptions,properties=scaleStrokes===null?{}:scaledStrokeProperties(record.node,record.worldMatrix.values,matrix,scaleStrokes);
      if(properties.appearance||record.node.strokeScaling===false)style(item,{...record.node,...properties});
    });
    selection.update(); anchors.update(); scope.view.update();
  }
  function setOutline(value) {
    outline = !!value;
    for (const [id, record] of records) style(items.get(id), record.node);
    updateView();
  }
  function hit(point) {
    const results=artwork.hitTestAll(point,{fill:!outline,stroke:true,pixel:!outline,tolerance:6/scope.view.zoom});
    for (const result of results) {
      let item=result.item; while(item && !item.data.nodeId) item=item.parent;
      if (item?.data.nodeId && state.document.isEditable(item.data.nodeId)) return item.data.nodeId;
    }
    return null;
  }
  function expandedShape(id) {
    const node=state.document.getNode(id);if(node?.type!=='shape')return null;
    const item=make(node),parts=item.children||[item];
    let subpaths=parts.map(p=>({closed:p.closed,segments:p.segments.map(s=>({p:[s.point.x,s.point.y],in:[s.handleIn.x,s.handleIn.y],out:[s.handleOut.x,s.handleOut.y]}))}));item.remove();
    if(node.shape==='rect'&&(node.params.cornerRadius??0)<=Math.min(node.params.width??0,node.params.height??0)/2){
      const {x=0,y=0,width=0,height=0,cornerRadius=0}=node.params;
      const source={closed:true,segments:[[x,y+height],[x,y],[x+width,y],[x+width,y+height]].map(p=>({p,in:[0,0],out:[0,0]}))};
      subpaths=[roundCorners(source,[0,1,2,3],cornerRadius)];
    }
    const {shape,params,...base}=structuredClone(node),result={...base,type:'path',subpaths,fillRule:'nonzero',transform:[1,0,0,1,0,0]};
    return {...result,...transformProperties(result,node.transform)};
  }
  function clearTransformPreview(){transformPreview?.remove();transformPreview=null;transformPreviewOptions=null;transformPreviewIds.clear();}
  function previewTransform(ids,matrix,{scaleStrokes=null}={}){
    clearTransformPreview();transformPreviewOptions={matrix,scaleStrokes};transformPreview=new scope.Group({insert:false});overlay.addChild(transformPreview);
    for(const id of ids){const original=items.get(id);if(!original)continue;const clone=original.clone({insert:false});
      const prepare=item=>{const record=records.get(item.data.nodeId);if(record){item.visible=record.node.visible;
        if(scaleStrokes!==null&&!outline){const properties=scaledStrokeProperties(record.node,record.worldMatrix.values,matrix,scaleStrokes);if(properties.appearance)style(item,{...record.node,...properties},false);}}
        item.children?.forEach(prepare);
      };prepare(clone);clone.applyMatrix=false;clone.matrix=new scope.Matrix(...matrix).append(records.get(id).worldMatrix);transformPreview.addChild(clone);transformPreviewIds.add(id);
    }updateView();
  }
  return { render, select: updateView, updateView, bounds, selectionBounds, hit, items, setOutline, selectionHandle:point=>selection.hit(point),
    setTheme({muted,background=labelBackground}) {labelColor=muted;labelBackground=background;for(const {label,labelRect} of boardItems.values()){label.fillColor=muted;labelRect.fillColor=background;}updateView();},
    shapePreview(node,sourceId=null) { const item=make(node);item.applyMatrix=false;style(item,node,false);item.opacity=.6;
      if(sourceId)item.matrix=records.get(sourceId).worldMatrix.clone();overlay.addChild(item);return item; },
    pointToWorld,
    editingNode,editPointToWorld,editPointToLocal,cornerWidgets,
    cornerHandle(point){return cornerWidgets().find(c=>c.point.getDistance(point)<=7/scope.view.zoom)??null;},
    editSpaceId(id){return state.document.getNode(id)?.type==='shape'?state.document.locate(id).parentId:id;},
    setEditPreview(nodes=[]){editPreviews.clear();for(const node of nodes)editPreviews.set(node.id,node);updateView();},
    previewTransform,clearTransformPreview,
    worldMatrix(id){return [...records.get(id).worldMatrix.values];},
    pointToLocal(id,point) {return new scope.Point(point).transform(records.get(id).worldMatrix.inverted());},
    pathHit(point,{handles=true,endpoints=false,shapes=false,logical=false}={}) {
      const tolerance=7/scope.view.zoom,selected=state.selection.anchors;
      const nodes=[...state.selection.ids,...[...items.keys()].reverse()].filter((id,i,a)=>a.indexOf(id)===i);
      for(const id of nodes){const original=state.document.getNode(id);if(!original||!['path',...(shapes?['shape']:[])].includes(original.type)||!state.document.isEditable(id))continue;
        const node=editingNode(id,{logical,preview:false}),extra={...(logical?{logical:true}:{}),...(original.type==='shape'?{shapeKey:shapeSelectionKey(original)}:{})};
        for(const [subpath,path] of node.subpaths.entries())for(const [segment,s] of path.segments.entries()) {
          if(endpoints&&(path.closed||segment!==0&&segment!==path.segments.length-1))continue;
          if(handles&&selected.some(a=>a.nodeId===id&&a.subpath===subpath&&a.segment===segment))for(const kind of ['in','out']) {
            if(Math.hypot(...s[kind])&&editPointToWorld(id,s.p.map((n,i)=>n+s[kind][i])).getDistance(point)<=tolerance)return {nodeId:id,subpath,segment,kind,...extra};
          }
          if(editPointToWorld(id,s.p).getDistance(point)<=tolerance)return {nodeId:id,subpath,segment,kind:'point',...extra};
        }
      }
      return null;
    },
    curveHit(point,{shapes=false}={}) {
      let best=null;
      for(const [id,record] of [...records].reverse()) {
        if(!['path',...(shapes?['shape']:[])].includes(record.node.type)||!state.document.isEditable(id))continue;
        // Measure in world space so tolerance remains consistent under parent transforms.
        editingNode(id,{logical:false,preview:false}).subpaths.forEach((data,subpath)=>{const item=path(data);item.transform(editingMatrix(id));
          const location=item.getNearestLocation(point);if(location&&location.distance<=7/scope.view.zoom&&(!best||location.distance<best.distance))best={nodeId:id,subpath,segment:location.index,t:location.time,distance:location.distance};item.remove();});
      }return best;
    },
    expandedShape,
    get outline() { return outline; },
    localMatrix(id, matrix) {
      const parentId = state.document.locate(id)?.parentId;
      const parent = records.get(parentId)?.worldMatrix;
      return parent ? parent.inverted().append(new scope.Matrix(...matrix)).append(parent).values : matrix;
    },
    fit(artboardId = null) {
      const boards=artboardId ? [state.document.getArtboard(artboardId)].filter(Boolean) : state.document.data.artboards;
      const b = boards.reduce((r, a) => union(r, new scope.Rectangle(a.x, a.y, a.width, a.height)), null);
      if (!b) return;
      scope.view.zoom = Math.max(.00001, Math.min(100*(96/25.4), (scope.view.viewSize.width - 64) / b.width, (scope.view.viewSize.height - 64) / b.height));
      scope.view.center = b.center; updateView();
    },
    destroy() {
      destroyed = true; selection.destroy();anchors.destroy();clearTransformPreview();
      for (const record of records.values()) if (record.node.type === 'image') items.get(record.node.id).onLoad = null;
      boards.remove(); artwork.remove(); overlay.remove();
      items.clear(); records.clear(); boardItems.clear(); worldBounds.clear(); paintedBounds.clear();
    },
  };
}
