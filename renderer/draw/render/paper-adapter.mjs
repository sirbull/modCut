/** Retained model -> Paper view. Culling and Outline never change document data. */
import { createSelectionOverlay } from './overlays.mjs';
import { activeArtboard } from '../doc/artboards.mjs';
import { createAnchorOverlay } from './anchors.mjs';
import { transformProperties } from '../geometry.mjs';
import { editablePath,cornerGeometry,roundCorners } from '../geom/corners.mjs';
import { shapeSelectionKey } from '../doc/selection.mjs';
import { scaledStrokeProperties } from '../geom/transforms.mjs';
import { isOutputNode, layerContext, ROOT_CONTEXT } from '../doc/layers.mjs';
import { arrowShapes } from '../geom/arrows.mjs';
import { PT_TO_MM, textValues } from '../doc/text.mjs';
import { textSubpaths } from '../doc/text-layout.mjs';

export function createDrawRenderer(scope, state, { onImageLoad = () => {}, withScope = fn => fn() } = {}) {
  const boards = new scope.Layer({ name: 'Artboards' });
  const artwork = new scope.Layer({ name: 'Draw artwork' });
  const overlay = new scope.Layer({ name: 'Selection' });
  const labels = new scope.Group({insert:false}); overlay.addChild(labels);
  const textFrames = new scope.Group({insert:false}); overlay.addChild(textFrames);
  const ISOLATION_DIM = .35;
  const items = new Map(), records = new Map(), boardItems = new Map(), thumbnails = new Map();
  const worldBounds = new Map(), paintedBounds = new Map();
  const editPreviews=new Map();
  const transformPreviewIds=new Set();let transformPreview=null,transformPreviewOptions=null;
  let destroyed = false, outline = !!state.ui?.outline;
  let textPreview = null, textPreviewFrame=null;
  let labelColor='#435A50',labelBackground='#E7F5EF';
  const selection = createSelectionOverlay(scope, overlay, state, id => bounds(id), id => records.get(id)?.context.color);
  // Template layers stay previewed in Outline view; other layers may request Outline individually.
  const outlineFor = id => { const context = records.get(id)?.context ?? ROOT_CONTEXT; return !context.template && (outline || context.outline); };
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
    if (node.type === 'text') {
      const geometry=textSubpaths(node);
      if(geometry)return new scope.CompoundPath({insert:false,children:geometry.map(path)});
      const v = textValues(node);
      return new scope.PointText({ insert: false, point: [0, 0], content: v.text,
        fontFamily: v.fontFamily, fontSize: v.fontSize * PT_TO_MM, leading: v.leading * PT_TO_MM,
        fontWeight: [v.fontStyle === 'italic' ? 'italic' : '', v.fontWeight === 'bold' ? 'bold' : 'normal'].filter(Boolean).join(' '), justification: v.alignment });
    }
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
    if (node.type === 'text') return JSON.stringify([node.kind,node.frame,node.content, node.character, node.paragraph,node.layout]);
    if (node.type === 'path') return JSON.stringify([node.subpaths, node.fillRule]);
    if (node.type === 'shape') return JSON.stringify([node.shape, node.params]);
    if (node.type === 'image') return JSON.stringify([node.assetId, state.document.data.assets[node.assetId]]);
    return node.type;
  }
  // Appearance entries can be hidden from the Appearance panel; hidden ones never draw.
  const shown = list => (list || []).filter(entry => !entry.hidden);
  // More than one visible fill or stroke: a paint stack draws every entry, the item itself only holds geometry.
  function stacked(node) {
    return !node.children && node.type !== 'image' && (shown(node.appearance?.fills).length > 1 || shown(node.appearance?.strokes).length > 1);
  }
  function style(item, node, asOutline = outlineFor(node.id), stackOwned = false) {
    item.opacity = asOutline ? 1 : node.opacity * (node.type === 'image' ? records.get(node.id)?.context.dim ?? 1 : 1);
    item.data.baseOpacity = item.opacity;
    item.blendMode = asOutline ? 'normal' : node.blendMode;
    if (node.children || node.type === 'image') return;
    const bare = stackOwned && !asOutline && stacked(node);
    const fill = bare ? null : shown(node.appearance.fills)[0], stroke = bare ? null : shown(node.appearance.strokes)[0];
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
  // Paint stack: one geometry clone per visible fill, then per visible stroke, drawn in that order
  // (later entries on top). It shares the node's transform and id, so hit-testing finds the node.
  function paintStack(item, node, asOutline = outlineFor(node.id)) {
    if (!stacked(node) || asOutline) return null;
    const group = new scope.Group({ insert: false });
    group.applyMatrix = false; group.matrix = new scope.Matrix(...node.transform); group.data.nodeId = node.id; group.data.stack = true;
    group.opacity = node.opacity; group.data.baseOpacity = node.opacity; group.blendMode = node.blendMode;
    const entries = [...shown(node.appearance.fills).map(e => ['fills', e]), ...shown(node.appearance.strokes).map(e => ['strokes', e])];
    for (const [kind, entry] of entries) {
      const piece = item.clone({ insert: false }); piece.matrix = new scope.Matrix();
      style(piece, { ...node, opacity: 1, blendMode: 'normal', appearance: { ...node.appearance, fills: kind === 'fills' ? [entry] : [], strokes: kind === 'strokes' ? [entry] : [] } }, false);
      piece.blendMode = entry.blendMode ?? 'normal'; group.addChild(piece);
    }
    return group;
  }
  // Arrowheads are view items beside the path, sharing its transform and node id for hit-testing.
  function arrowGroup(item, node) {
    const stroke = node.appearance?.strokes[0];
    if (!stroke || (!stroke.startArrow && !stroke.endArrow) || node.children || node.type === 'image') return null;
    const path = item.children ? item.children[0] : item;
    if (!path?.segments?.length || path.closed || !(path.length > 0)) return null;
    const group = new scope.Group({ insert: false }), paint = color(stroke.paint);
    group.applyMatrix = false; group.matrix = new scope.Matrix(...node.transform); group.data.nodeId = node.id; group.data.arrows = true;
    if (paint) paint.alpha = stroke.opacity ?? 1;
    for (const [key, offset, sign] of [['startArrow', 0, -1], ['endArrow', path.length, 1]]) {
      if (!stroke[key]) continue;
      const p = path.getPointAt(offset), t = path.getTangentAt(offset);
      for (const shape of arrowShapes([p.x, p.y], [t.x * sign, t.y * sign], stroke.width, stroke[key])) {
        const piece = shape.kind === 'circle' ? new scope.Path.Circle({ center: shape.center, radius: shape.radius, insert: false })
          : new scope.Path({ segments: shape.points, closed: shape.kind === 'polygon', insert: false });
        if (shape.kind === 'polyline') Object.assign(piece, { strokeColor: paint, strokeWidth: stroke.width, strokeCap: 'round', strokeJoin: 'round' });
        else piece.fillColor = paint;
        group.addChild(piece);
      }
    }
    return group.children.length ? group : null;
  }
  function place(parent, item, index) {
    if (parent.children[index] !== item) parent.insertChild(index, item);
  }
  function reconcile(nodes, parent, alive, parentContext = ROOT_CONTEXT) {
    let index = 0;
    for (const node of nodes) {
      alive.add(node.id);
      const geometry = geometryKey(node), own = { ...node }; delete own.children;
      const context = layerContext(parentContext, node), fingerprint = JSON.stringify([own, context]);
      let record = records.get(node.id), item = items.get(node.id);
      const replaced = !record || record.node.type !== node.type || record.geometry !== geometry;
      if (replaced) {
        item?.remove(); record?.frame?.remove(); record?.arrows?.remove(); record?.stack?.remove();
        item = make(node); item.applyMatrix = false; item.data.nodeId = node.id;
        items.set(node.id, item);
        record = { node, geometry, context }; records.set(node.id, record);
      }
      if (replaced || record.fingerprint !== fingerprint) {
        record.node = node; record.fingerprint = fingerprint; record.context = context;
        item.matrix = new scope.Matrix(...node.transform);
        if (node.type === 'image' || node.type==='text'&&node.kind==='area') {
          if(node.type==='image')positionImage(item, node);
          record.frame?.remove();
          const [width, height] = node.type==='image'?imageSize(node):[node.frame.width,node.frame.height];
          record.frame = new scope.Path.Rectangle({ rectangle: [0, 0, width, height], insert: false });
          record.frame.applyMatrix = false; record.frame.matrix = new scope.Matrix(...node.transform);
          record.frame.data.nodeId = node.id; record.frame.strokeColor = '#071411'; record.frame.strokeScaling = false;
        }
        style(item, node, outlineFor(node.id), true);
        record.arrows?.remove(); record.arrows = arrowGroup(item, node);
        record.stack?.remove(); record.stack = paintStack(item, node);
      }
      // Bounds must be measured before viewport visibility is applied.
      item.visible = node.visible;
      place(parent, item, index++);
      if (record.frame) { record.frame.visible = false; place(parent, record.frame, index++); }
      if (record.arrows) place(parent, record.arrows, index++);
      if (record.stack) place(parent, record.stack, index++);
      if (node.children) reconcile(node.children, item, alive, context);
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
        const b = node.children ? visit(node.children, matrix) : records.get(node.id).frame
          ? records.get(node.id).frame.getBounds(matrix) : item.getBounds(matrix);
        if (b) {
          worldBounds.set(node.id, b.clone());
          // Stroke bounds preserve thick strokes intersecting the viewport edge.
          if (outlineFor(node.id) && !node.children && node.type !== 'image') style(item, node, false);
          paintedBounds.set(node.id, node.children || records.get(node.id).frame ? b.clone() : item.getStrokeBounds(matrix));
          if (outlineFor(node.id) && !node.children && node.type !== 'image') style(item, node);
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
      item.remove(); records.get(id).frame?.remove(); records.get(id).arrows?.remove(); records.get(id).stack?.remove(); items.delete(id); records.delete(id); thumbnails.delete(id);
    }
    updateBounds(); updateView();
  }
  function bounds(id) { return worldBounds.get(id)?.clone() || null; }
  function selectionBounds() {
    let result = null;
    for (const id of state.selection.ids) { const b = bounds(id); if (b) result = union(result, b); }
    return result;
  }
  // Isolation mode dims everything beside the isolated group and its ancestors.
  function isolationDimmed() {
    const iso = state.ui?.isolation;
    if (!iso || !state.document.getNode(iso)) return null;
    const keep = new Set([iso, ...state.document.ancestors(iso).map(n => n.id)]), dimmed = new Set();
    for (const id of records.keys()) {
      if (keep.has(id)) continue;
      const parentId = state.document.locate(id)?.parentId ?? null;
      if (parentId === null || keep.has(parentId) && parentId !== iso) dimmed.add(id);
    }
    return dimmed;
  }
  function areaFrame(node,matrix) {
    const group=new scope.Group({insert:false});group.data.textFrame=true;group.data.textId=node.id;
    const {width:w,height:h}=node.frame,color=node.layout?.overflow?'#C0392B':records.get(node.id)?.context.color??'#006B5C';
    const frame=new scope.Path({insert:false,segments:[[0,0],[w,0],[w,h],[0,h]].map(p=>new scope.Point(...p).transform(matrix)),closed:true,strokeColor:color,strokeWidth:1/scope.view.zoom});group.addChild(frame);
    if(node.layout?.overflow) {
      const p=new scope.Point(w,h).transform(matrix),r=4/scope.view.zoom;
      group.addChild(new scope.Path.Rectangle({insert:false,rectangle:[p.x-r,p.y-r,2*r,2*r],strokeColor:color,fillColor:'#FFFFFF',strokeWidth:1/scope.view.zoom}));
      for(const [from,to] of [[[p.x-r/2,p.y],[p.x+r/2,p.y]],[[p.x,p.y-r/2],[p.x,p.y+r/2]]])group.addChild(new scope.Path.Line({insert:false,from,to,strokeColor:color,strokeWidth:1/scope.view.zoom}));
    }
    return group;
  }
  function updateView() {
    const viewport = scope.view.bounds.expand(16 / scope.view.zoom), dimmed = isolationDimmed();
    textFrames.removeChildren();
    for (const [id, record] of records) {
      const item = items.get(id), node = record.node;
      if(node.strokeScaling===false){style(item,node,outlineFor(id),true);if(record.stack){const next=paintStack(item,node);record.stack.replaceWith(next);record.stack=next;}}
      const b = paintedBounds.get(id);
      const visible = node.visible && (!!node.children || !!b?.intersects(viewport));
      const asOutline = outlineFor(id);
      item.visible = visible && !(asOutline && node.type === 'image') && !editPreviews.has(id) && !transformPreviewIds.has(id);
      if (asOutline && !node.children && node.type !== 'image') item.strokeWidth = 1 / scope.view.zoom;
      if (record.frame) { record.frame.visible = visible && asOutline && node.type==='image'; record.frame.strokeWidth = 1 / scope.view.zoom; }
      if(node.type==='text'&&node.kind==='area'&&visible&&!transformPreviewIds.has(id)&&state.document.ancestors(id).every(n=>n.visible)&&
        (state.selection.ids.includes(id)||asOutline||node.layout?.overflow))textFrames.addChild(areaFrame(node,record.worldMatrix));
      if (record.arrows) record.arrows.visible = item.visible && !asOutline;
      if (record.stack) record.stack.visible = item.visible && !asOutline;
      const factor = dimmed?.has(id) ? ISOLATION_DIM : 1;
      if (item.data.baseOpacity !== undefined) item.opacity = item.data.baseOpacity * factor;
      if (record.stack) record.stack.opacity = (record.stack.data.baseOpacity ?? 1) * factor;
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
  /** A detached group with the printable artwork in preview mode: no templates, hidden objects, dimming or culling. */
  function exportArtwork() {
    const wasOutline = outline; if (wasOutline) setOutline(false);
    try {
      const isTextFrame=item=>{const record=records.get(item.data?.nodeId);return record?.node.type==='text'&&record.frame===item;};
      const fix = (original, copy) => {
        const id = original.data?.nodeId;
        if (id) {
          const node = state.document.getNode(id), record = records.get(id);
          copy.visible = original !== record?.frame;
          if (original.data.baseOpacity !== undefined) copy.opacity = node?.type === 'image' && original === items.get(id) ? node.opacity : original.data.baseOpacity;
        }
        const children = [...(copy.children ?? [])];
        (original.children ?? []).forEach((child, i) => {
          const childId = child.data?.nodeId;
          if (isTextFrame(child) || childId && !isOutputNode(state.document, childId)) children[i].remove(); else fix(child, children[i]);
        });
      };
      const group = new scope.Group({ insert: false });
      for (const child of artwork.children) {
        const id = child.data?.nodeId; if (isTextFrame(child) || id && !isOutputNode(state.document, id)) continue;
        const copy = child.clone({ insert: false, deep: true }); fix(child, copy); group.addChild(copy);
      }
      return group;
    } finally { if (wasOutline) setOutline(true); }
  }
  function setOutline(value) {
    outline = !!value;
    for (const [id, record] of records) {
      const item = items.get(id); style(item, record.node, outlineFor(id), true);
      const next = paintStack(item, record.node);
      if (record.stack && next) record.stack.replaceWith(next); else if (record.stack) record.stack.remove(); else if (next) next.insertAbove(record.arrows ?? item);
      record.stack = next;
    }
    updateView();
  }
  function hit(point) {
    const results=artwork.hitTestAll(point,{fill:!outline,stroke:true,pixel:!outline,tolerance:6/scope.view.zoom});
    for (const result of results) {
      let item=result.item; while(item && !item.data.nodeId) item=item.parent;
      // Locked or hidden objects let clicks through; a layer itself is never the hit (a click on a locked object must not select its layer).
      const iso = state.ui?.isolation;
      // In isolation mode only the isolated group's contents can be hit.
      if (iso && item?.data.nodeId && !state.document.ancestors(item.data.nodeId).some(n => n.id === iso)) continue;
      if (item?.data.nodeId && state.document.getNode(item.data.nodeId)?.type !== 'layer' && state.document.isEditable(item.data.nodeId)) return item.data.nodeId;
    }
    // Empty and overset frames remain editable even when no glyph can be hit.
    for(const [id,record] of [...records].reverse())if(record.node.type==='text'&&record.node.kind==='area'&&state.document.isEditable(id)&&
      (!state.ui?.isolation||state.document.ancestors(id).some(n=>n.id===state.ui.isolation))) {
      const local=new scope.Point(point).transform(record.worldMatrix.inverted()),{width,height}=record.node.frame;
      if(local.x>=0&&local.y>=0&&local.x<=width&&local.y<=height)return id;
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
        if(scaleStrokes!==null&&!outlineFor(item.data.nodeId)){const properties=scaledStrokeProperties(record.node,record.worldMatrix.values,matrix,scaleStrokes);if(properties.appearance)style(item,{...record.node,...properties},false);}}
        item.children?.forEach(prepare);
      };prepare(clone);clone.applyMatrix=false;clone.matrix=new scope.Matrix(...matrix).append(records.get(id).worldMatrix);transformPreview.addChild(clone);transformPreviewIds.add(id);
      const stack=records.get(id)?.stack;if(stack){const copy=stack.clone({insert:false});copy.matrix=clone.matrix.clone();copy.visible=true;transformPreview.addChild(copy);}
    }updateView();
  }
  // Layers panel thumbnails: a clone in world space with model visibility (ignoring viewport culling),
  // rasterized to fit a square. Cached per subtree fingerprint, so unchanged rows cost nothing.
  // Pathfinder operand: a closed world-space path for a path, shape or group (groups are united).
  function booleanOperand(id) {
    const node = state.document.getNode(id), record = records.get(id);
    if (!node || !record) throw new Error('Pathfinder needs objects that are drawn on the canvas.');
    if (node.type === 'path' || node.type === 'shape') {
      const item = make(node); item.applyMatrix = true;
      if (record.worldMatrix) item.transform(record.worldMatrix);
      return item;
    }
    if (node.type === 'group' || node.type === 'compoundPath') {
      const parts = state.document.descendants(id).filter(n => n.type === 'path' || n.type === 'shape').map(n => booleanOperand(n.id));
      if (!parts.length) throw new Error('This group has no paths to combine.');
      return parts.slice(1).reduce((a, b) => a.unite(b, { insert: false }), parts[0]);
    }
    throw new Error(`Pathfinder works on paths, shapes and groups, not ${node.type === 'image' ? 'images' : node.type}.`);
  }
  function thumbnail(id, size = 56) {
    const item = items.get(id), record = records.get(id); if (!item || !record) return null;
    const subtree = [id, ...state.document.descendants(id).map(n => n.id)];
    const key = subtree.map(n => { const r = records.get(n); return r ? r.fingerprint + r.geometry : ''; }).join('|') + size;
    const cached = thumbnails.get(id); if (cached?.key === key) return cached.url;
    let url = null;
    // A stacked object draws through its paint stack; its own item only holds geometry.
    const clone = (record.stack ?? item).clone({ insert: false, deep: true });
    try {
      if (record.worldMatrix) clone.matrix = record.worldMatrix.clone();
      const show = target => { const nodeId = target.data?.nodeId; target.visible = nodeId ? records.get(nodeId)?.node.visible !== false : true; target.children?.forEach(show); };
      show(clone); clone.visible = true;
      const box = clone.bounds;
      if (box.width > 0 || box.height > 0) {
        const extent = Math.max(box.width, box.height, 1e-6), inner = size - 4;
        // Hairlines vanish at thumbnail scale: give every stroke at least about 1.5 thumbnail pixels.
        const minimum = 1.5 * extent / inner;
        const thicken = target => {
          if (target.strokeColor && target.strokeWidth > 0) {
            const width = target.strokeScaling === false ? target.strokeWidth / scope.view.zoom : target.strokeWidth;
            target.strokeScaling = true; target.strokeWidth = Math.max(width, minimum);
          }
          target.children?.forEach(thicken);
        };
        thicken(clone);
        const raster = clone.rasterize({ resolution: 72 * inner / extent, insert: false });
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        const context = canvas.getContext('2d'), source = raster.canvas || raster.getSubCanvas?.(raster.bounds);
        if (source?.width && source?.height) {
          const scale = Math.min(inner / source.width, inner / source.height), w = source.width * scale, h = source.height * scale;
          context.drawImage(source, (size - w) / 2, (size - h) / 2, w, h); url = canvas.toDataURL('image/png');
        }
        raster.remove();
      }
    } catch { url = null; } finally { clone.remove(); }
    thumbnails.set(id, { key, url }); return url;
  }
  return { render, select: updateView, updateView, bounds, selectionBounds, hit, items, setOutline, thumbnail, exportArtwork, booleanOperand, selectionHandle:point=>selection.hit(point),
    previewText(node, parentId = null) {
      textPreview?.remove(); textPreview = null;textPreviewFrame?.remove();textPreviewFrame=null;
      render();
      if (node) {
        textPreview = new scope.Group({insert:false});textPreview.applyMatrix=false;
        textPreview.matrix = records.get(parentId)?.worldMatrix.clone() ?? new scope.Matrix();
        if(parentId)textPreview.opacity=[state.document.getNode(parentId),...state.document.ancestors(parentId)].reduce((alpha,n)=>alpha*n.opacity,1);
        const item=make(node);item.applyMatrix=false;item.matrix=new scope.Matrix(...node.transform);style(item,node,false,true);textPreview.addChild(item);
        const stack=paintStack(item,node,false);if(stack)textPreview.addChild(stack);
        overlay.addChild(textPreview);
        if(node.kind==='area') {
          for(const frame of textFrames.children)if(frame.data.textId===node.id)frame.visible=false;
          textPreviewFrame=areaFrame(node,new scope.Matrix(...node.transform).prepend(textPreview.matrix));overlay.addChild(textPreviewFrame);
        }
        for (const item of [items.get(node.id), records.get(node.id)?.stack, records.get(node.id)?.arrows]) if (item) item.visible = false;
      }
      scope.view.update();
    },
    setTheme({muted,background=labelBackground}) {labelColor=muted;labelBackground=background;for(const {label,labelRect} of boardItems.values()){label.fillColor=muted;labelRect.fillColor=background;}updateView();},
    shapePreview(node,sourceId=null) { const item=make(node);item.applyMatrix=false;style(item,node,false);item.opacity=.6;
      if(sourceId)item.matrix=records.get(sourceId).worldMatrix.clone();overlay.addChild(item);return item; },
    pointToWorld,
    editingNode,editPointToWorld,editPointToLocal,cornerWidgets,
    cornerHandle(point){return cornerWidgets().find(c=>c.point.getDistance(point)<=7/scope.view.zoom)??null;},
    editSpaceId(id){return state.document.getNode(id)?.type==='shape'?state.document.locate(id).parentId:id;},
    setEditPreview(nodes=[]){editPreviews.clear();for(const node of nodes)editPreviews.set(node.id,node);updateView();},
    previewTransform,clearTransformPreview,
    layerColor(id){return records.get(id)?.context.color??'#006B5C';},
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
      destroyed = true; textPreview?.remove();textPreviewFrame?.remove();textFrames.remove(); selection.destroy();anchors.destroy();clearTransformPreview();
      for (const record of records.values()) if (record.node.type === 'image') items.get(record.node.id).onLoad = null;
      boards.remove(); artwork.remove(); overlay.remove();
      items.clear(); records.clear(); boardItems.clear(); thumbnails.clear(); worldBounds.clear(); paintedBounds.clear();
    },
  };
}
