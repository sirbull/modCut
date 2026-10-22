import { laserPreviewIntent, withLaserAppearance } from '../view/laser-preview.mjs';
/** Retained model -> Paper view. Culling and Outline never change document data. */
import { createSelectionOverlay } from './overlays.mjs';
import { createViewGuides } from './view-guides.mjs';
import { activeArtboard } from '../doc/artboards.mjs';
import { createAnchorOverlay } from './anchors.mjs';
import { createGradientAnnotator } from './gradient-annotator.mjs';
import { transformProperties } from '../geometry.mjs';
import { editablePath,cornerGeometry,roundCorners } from '../geom/corners.mjs';
import { shapeSelectionKey } from '../doc/selection.mjs';
import { scaledStrokeProperties, strokeScalingPolicy } from '../geom/transforms.mjs';
import { isOutputNode, layerContext, ROOT_CONTEXT } from '../doc/layers.mjs';
import { arrowShapes } from '../geom/arrows.mjs';
import { normalizeProfile, variableStrokeRings } from '../geom/width-profile.mjs';
import { gradientStrokeBands } from '../geom/gradient-stroke.mjs';
import { colorAt, isGradient, opacityAt } from '../doc/gradient.mjs';
import { freeformPixels, isFreeform } from '../doc/freeform.mjs';
import { blendStepCount, matchShapes, interpolateShapes, stepPositions, lerpColor, spineCurve, placeOnSpine, keyPosition } from '../geom/blend.mjs';
import { PT_TO_MM, textValues } from '../doc/text.mjs';
import { applyVectorEffects, hasVectorEffects, dropShadow, livePathfinder, pixelEffects, scribbleOf, vectorEffects, withGroupEffects } from '../doc/effects.mjs';
import { offsetPathsSync, geometryReady } from '../geom/kernel-js.mjs';
import { toSubpaths, runPathfinder } from '../geom/pathfinder.mjs';
import { textSubpaths } from '../doc/text-layout.mjs';
import { envelopeMapping, envelopeSubpaths } from '../geom/envelope.mjs';
import { warpMapping } from '../geom/warp.mjs';

export function createDrawRenderer(scope, state, { onImageLoad = () => {}, onThumbnail = null, withScope = fn => fn(), getLaserProcesses = () => null } = {}) {
  const boards = new scope.Layer({ name: 'Artboards' });
  const artwork = new scope.Layer({ name: 'Draw artwork' });
  const overlay = new scope.Layer({ name: 'Selection' });
  const labels = new scope.Group({insert:false}); overlay.addChild(labels);
  const textFrames = new scope.Group({insert:false}); overlay.addChild(textFrames);
  const artboardControls = new scope.Group({insert:false}); overlay.addChild(artboardControls);
  let artboardAddPoints = [];
  const ISOLATION_DIM = .35;
  const items = new Map(), records = new Map(), boardItems = new Map(), thumbnails = new Map();
  const worldBounds = new Map(), paintedBounds = new Map();
  const editPreviews=new Map(),pathPreviewHidden=new Set();
  let pathPreview=null,measureLine=null,imageTracePreview=null,imageTraceId=null;
  const transformPreviewIds=new Set();let transformPreview=null;
  let destroyed = false, outline = !!state.ui?.outline, laserPreview = false;
  let textPreview = null, textPreviewFrame=null;
  let labelColor='#435A50',labelBackground='#E7F5EF';
  const viewGuides = createViewGuides(scope, state, boards, overlay);
  const selection = createSelectionOverlay(scope, overlay, state, id => bounds(id), id => records.get(id)?.context.color);
  const drawArtwork=artwork.draw;
  artwork.draw=function(ctx,...args){
    if(!laserPreview||outline)return drawArtwork.call(this,ctx,...args);
    const snapshot=getLaserProcesses(),cache=new Map(),roles=new Map();
    for(const [id,record] of records)for(const role of ['stack','arrows','shadow','raster'])if(record[role]){roles.set(record[role],{role,id});}
    const resolve=id=>{if(!cache.has(id))cache.set(id,laserPreviewIntent(state.document,id,snapshot));return cache.get(id);};
    return withLaserAppearance(this,{resolve,roles,zoom:scope.view.zoom},()=>drawArtwork.call(this,ctx,...args));
  };
  const drawBoards=boards.draw;
  boards.draw=function(ctx,...args){
    if(!laserPreview||outline)return drawBoards.call(this,ctx,...args);
    const saved=[...boardItems.values()].map(r=>[r.item,r.item.fillColor]);
    try{for(const [item] of saved)item.fillColor='#FFFFFF';return drawBoards.call(this,ctx,...args);}
    finally{for(const [item,color] of saved)item.fillColor=color;}
  };
  // Template layers stay previewed in Outline view; other layers may request Outline individually.
  const outlineFor = id => { const context = records.get(id)?.context ?? ROOT_CONTEXT; return !context.template && (outline || (!laserPreview && context.outline)); };
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
  // Gradient tool: the annotated gradient, drawn on the first painted object (see setGradientTarget).
  const gradientAnnotator=createGradientAnnotator(scope,overlay,state,id=>records.get(id)?.worldMatrix??null,(id,point)=>hit(point)===id);let gradientAnnotation={};

  function color(paint, opacity = 1) {
    if (paint?.type === 'linear' || paint?.type === 'radial') {
      // Gradient geometry is in the item's own coordinates; entry opacity multiplies each stop's.
      const stops = [...paint.stops].sort((a, b) => a.offset - b.offset).map(stop => { const c = color({ type: 'solid', color: stop.color }); c.alpha = (stop.opacity ?? 1) * opacity; return [c, stop.offset]; });
      const a = paint.angle * Math.PI / 180, destination = [paint.origin[0] + Math.cos(a) * paint.length, paint.origin[1] - Math.sin(a) * paint.length];
      return new scope.Color({ gradient: { stops, radial: paint.type === 'radial' }, origin: paint.origin, destination });
    }
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
  /**
   * Drop Shadow: the object's outline filled with the shadow colour, blurred and offset, as a raster at the
   * document's raster effects resolution, placed under the object in its own coordinates.
   */
  function shadowFor(item, node) {
    const e = dropShadow(node);
    if (!e || !['path', 'shape', 'text'].includes(node.type) || !item.pathData && !item.children?.length) return null;
    const local = item.clone({ insert: false }); local.matrix = new scope.Matrix();
    const b = local.bounds, pad = e.blur * 2 + .5, ppmm = Math.min((state.document.data.rasterEffectsPpi ?? 300) / 25.4, 4096 / Math.max(b.width + pad * 2, b.height + pad * 2, 1));
    const width = Math.max(1, Math.ceil((b.width + pad * 2) * ppmm)), height = Math.max(1, Math.ceil((b.height + pad * 2) * ppmm));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); ctx.filter = e.blur > 0 ? `blur(${e.blur / 2 * ppmm}px)` : 'none';
    ctx.setTransform(ppmm, 0, 0, ppmm, (pad - b.x) * ppmm, (pad - b.y) * ppmm); ctx.fillStyle = e.color; ctx.globalAlpha = e.opacity;
    const d = local.className === 'CompoundPath' ? local.pathData : local.children ? local.children.map(c => c.pathData).join(' ') : local.pathData;
    ctx.fill(new Path2D(d), (node.fillRule ?? 'nonzero') === 'evenodd' ? 'evenodd' : 'nonzero'); local.remove();
    const raster = new scope.Raster({ insert: false, canvas }); raster.applyMatrix = false; raster.smoothing = 'high';
    raster.matrix = new scope.Matrix(...node.transform).translate(b.x - pad + e.x + width / ppmm / 2, b.y - pad + e.y + height / ppmm / 2).scale(1 / ppmm);
    raster.opacity = node.opacity; raster.data.baseOpacity = node.opacity; raster.data.shadow = true;
    return raster;
  }
  /**
   * Rasterize effect: the object as it is painted (fills, strokes, arrowheads) drawn into pixels at the chosen
   * resolution, white behind it or transparent, placed where it is. The object itself is hidden, not changed.
   */
  function rasterFor(item, node, record) {
    // A group draws its drop shadow with its pixels too, since it has no outline of its own.
    const effects = node.type === 'group' ? (node.appearance?.effects ?? []).filter(x => !x.hidden && (x.type === 'drop-shadow' || pixelEffects(node).includes(x))) : pixelEffects(node);
    if (!effects.length || !['path', 'shape', 'text', 'group'].includes(node.type)) return null;
    const e = effects.filter(x => x.type === 'rasterize').at(-1) ?? { ppi: 0, background: 'transparent', padding: 0, antialias: true };
    // Room for blurs and glows to spread, plus any padding Rasterize asks for.
    const spread = effects.reduce((sum, x) => sum + (x.type === 'outer-glow' ? x.blur * 2 : x.type === 'gaussian-blur' ? x.radius * 2 : x.type === 'drop-shadow' ? Math.max(Math.abs(x.x), Math.abs(x.y)) + x.blur * 2 : 0), 0);
    // Opacity is applied to the pixels as a whole afterwards, as for the object itself.
    const parts = [item, record.stack, record.arrows].filter(Boolean).map(part => { const copy = part.clone({ insert: false }); copy.visible = true; copy.opacity = 1; return copy; });
    // In a group, children hidden only for this view (outside the viewport) are drawn; hidden ones stay hidden.
    if (node.type === 'group') parts[0].getItems({ match: x => !!x.data.nodeId }).forEach(x => { const n = state.document.getNode(x.data.nodeId); x.visible = !!n?.visible && !coveredIds.has(n.id); });
    const art = new scope.Group({ insert: false, children: parts }), box = art.strokeBounds.expand(e.padding * 2 + spread * 2);
    if (!(box.width > 0 && box.height > 0)) { art.remove(); return null; }
    art.insertChild(0, new scope.Path.Rectangle({ rectangle: box, fillColor: new scope.Color(1, 1, 1, 0), insert: false }));
    const ppi = e.ppi || (state.document.data.rasterEffectsPpi ?? 300), resolution = Math.min(ppi / 25.4 * 72, 4000 / Math.max(box.width, box.height) * 72);
    const first = art.rasterize({ resolution, insert: false }); art.remove();
    const canvas = first.canvas, ppmm = canvas.width / box.width;
    for (const x of effects) applyPixelEffect(canvas, x, ppmm);
    if (e.background === 'white') { const g = canvas.getContext('2d'); g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, canvas.width, canvas.height); }
    const raster = new scope.Raster({ insert: false, canvas }); raster.bounds = first.bounds; first.remove();
    raster.smoothing = e.antialias ? 'high' : 'off'; raster.data.nodeId = node.id; raster.data.rasterEffect = true;
    raster.data.baseOpacity = node.opacity; raster.opacity = node.opacity;
    return raster;
  }
  /** A canvas of the same size: the source's alpha, blurred by `sigma` pixels (in the alpha channel). */
  function blurredAlpha(canvas, sigma) {
    const out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height;
    const g = out.getContext('2d'); g.filter = sigma > 0 ? `blur(${sigma}px)` : 'none'; g.drawImage(canvas, 0, 0); return out;
  }
  /** Gaussian Blur, Feather, Outer and Inner Glow on the object's pixels (radius and blur in mm). */
  function applyPixelEffect(canvas, e, ppmm) {
    const g = canvas.getContext('2d', { willReadFrequently: true }), w = canvas.width, h = canvas.height;
    if (e.type === 'gaussian-blur') { const blurred = blurredAlpha(canvas, e.radius * ppmm / 2); g.clearRect(0, 0, w, h); g.drawImage(blurred, 0, 0); return; }
    if (e.type === 'feather') {
      // The edge fades inwards: alpha falls from full, a radius inside the edge, to none at the edge.
      const mask = blurredAlpha(canvas, e.radius * ppmm / 2).getContext('2d').getImageData(0, 0, w, h).data, data = g.getImageData(0, 0, w, h);
      for (let i = 3; i < data.data.length; i += 4) data.data[i] = Math.round(data.data[i] * Math.max(0, Math.min(1, mask[i] / 255 * 2 - 1)));
      g.putImageData(data, 0, 0); return;
    }
    if (e.type === 'drop-shadow') {
      const shade = document.createElement('canvas'); shade.width = w; shade.height = h;
      const sg = shade.getContext('2d'); sg.drawImage(canvas, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = e.color; sg.fillRect(0, 0, w, h);
      const soft = blurredAlpha(shade, e.blur * ppmm / 2);
      g.save(); g.globalAlpha = e.opacity; g.globalCompositeOperation = 'destination-over'; g.drawImage(soft, e.x * ppmm, e.y * ppmm); g.restore(); return;
    }
    if (e.type === 'outer-glow' || e.type === 'inner-glow') {
      const glow = document.createElement('canvas'); glow.width = w; glow.height = h;
      const gg = glow.getContext('2d'); gg.drawImage(canvas, 0, 0); gg.globalCompositeOperation = 'source-in'; gg.fillStyle = e.color; gg.fillRect(0, 0, w, h);
      if (e.type === 'outer-glow') { const soft = blurredAlpha(glow, e.blur * ppmm / 2); g.save(); g.globalAlpha = e.opacity; g.globalCompositeOperation = 'destination-over'; g.drawImage(soft, 0, 0); g.restore(); return; }
      // Inner glow: the colour where the object's blurred alpha falls below full, kept inside the object.
      const mask = blurredAlpha(canvas, e.blur * ppmm / 2).getContext('2d').getImageData(0, 0, w, h).data, data = gg.getImageData(0, 0, w, h), own = g.getImageData(0, 0, w, h).data;
      for (let i = 3; i < data.data.length; i += 4) data.data[i] = Math.round(own[i] * (1 - mask[i] / 255) * e.opacity);
      gg.putImageData(data, 0, 0); g.save(); g.globalCompositeOperation = 'source-atop'; g.drawImage(glow, 0, 0); g.restore();
    }
  }
  /** The drawn item: the node's own geometry, then its live vector effects (paths and shapes). */
  function make(node) {
    const base = makeBase(node);
    if (!['path', 'shape'].includes(node.type) || !hasVectorEffects(node)) return base;
    const out = applyVectorEffects(toSubpaths(base), node.appearance.effects, { offset: offsetPathsSync, fillRule: node.fillRule ?? 'nonzero' });
    base.remove();
    return out.length === 1 ? path(out[0]) : new scope.CompoundPath({ insert: false, children: out.map(path), fillRule: node.fillRule ?? 'nonzero' });
  }
  /** Geometry after live effects, in the space `expandedShape` and a path's own subpaths use; null without effects. */
  function effectiveSubpaths(id) {
    // The drawn node carries the effects of the groups around it.
    const node = records.get(id)?.node ?? state.document.getNode(id);
    if (!node || !['path', 'shape'].includes(node.type) || !hasVectorEffects(node)) return null;
    const item = make(node);
    if (node.type === 'shape') item.transform(new scope.Matrix(...node.transform));
    const out = toSubpaths(item); item.remove(); return out;
  }
  function makeBase(node) {
    if (node.children) return new scope.Group({ insert: false });
    if (node.type === 'text') {
      const geometry=textSubpaths(node);
      if(geometry)return new scope.CompoundPath({insert:false,children:geometry.map(path)});
      const v = textValues(node);
      return new scope.PointText({ insert: false, point: [0, 0], content: v.text,
        fontFamily: v.fontFamily, fontSize: v.fontSize * PT_TO_MM, leading: v.leading * PT_TO_MM,
        fontWeight: [v.fontStyle === 'italic' ? 'italic' : '', String(v.fontWeight)].filter(Boolean).join(' '), justification: v.alignment });
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
        // Crop Image is non-destructive: the asset stays whole, the raster shows only the cropped part.
        const crop = records.get(node.id).node.crop;
        if (crop && !raster.data.cropped && raster.image) {
          const img = raster.image, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(w * crop.width)); canvas.height = Math.max(1, Math.round(h * crop.height));
          canvas.getContext('2d').drawImage(img, w * crop.x, h * crop.y, w * crop.width, h * crop.height, 0, 0, canvas.width, canvas.height);
          raster.data.cropped = true; raster.setImage(canvas);
        }
        withScope(() => {
          positionImage(raster, records.get(node.id).node);
          updateBounds(); updateView(); onImageLoad();
        });
      };
      return raster;
    }
    return new scope.Group({ insert: false });
  }
  // Keys per node object (D4.6): edits share unchanged nodes between snapshots, so a node's keys are
  // worked out once, not on every render. Effect readiness and the image asset are checked each time.
  const nodeKeys = new WeakMap();
  function keysOf(node) {
    let keys = nodeKeys.get(node);
    if (!keys) { const own = { ...node }; delete own.children; keys = { own: JSON.stringify(own), geometry: null }; nodeKeys.set(node, keys); }
    return keys;
  }
  function geometryKey(node) {
    const keys = keysOf(node);
    if (node.type === 'image') { const asset = state.document.data.assets[node.assetId]; if (keys.asset !== asset) { keys.asset = asset; keys.geometry = JSON.stringify([node.assetId, asset?.width, asset?.height, asset?.data?.length, node.crop ?? null]); } return keys.geometry + (asset ? '' : '?'); }
    keys.geometry ??= node.type === 'text' ? JSON.stringify([node.kind,node.frame,node.onPath,node.content, node.character, node.paragraph,node.layout])
      // Live effects change the geometry; Offset Path waits for the polygon library, so its readiness counts too.
      : node.type === 'path' ? JSON.stringify([node.subpaths, node.fillRule, hasVectorEffects(node) ? node.appearance.effects.filter(e => !e.hidden) : null])
      : node.type === 'shape' ? JSON.stringify([node.shape, node.params, hasVectorEffects(node) ? node.appearance.effects.filter(e => !e.hidden) : null]) : node.type;
    return ['path', 'shape'].includes(node.type) && hasVectorEffects(node) ? keys.geometry + geometryReady() : keys.geometry;
  }
  // Appearance entries can be hidden from the Appearance panel; hidden ones never draw.
  const shown = list => (list || []).filter(entry => !entry.hidden);
  // More than one visible fill or stroke: a paint stack draws every entry, the item itself only holds geometry.
  // A stroke with a width profile is drawn as a filled outline, so it always goes through the paint stack.
  const profiled = (node, entry) => ['path', 'shape'].includes(node.type) && !!normalizeProfile(entry?.widthProfile);
  // A gradient along or across a stroke is drawn as coloured bands, so it goes through the paint stack too.
  const banded = (node, entry) => ['path', 'shape'].includes(node.type) && isGradient(entry?.paint) && ['along', 'across'].includes(entry.paint.strokeMode);
  function stacked(node) {
    return !node.children && node.type !== 'image' && (shown(node.appearance?.fills).length > 1 || shown(node.appearance?.strokes).length > 1
      || shown(node.appearance?.strokes).some(entry => profiled(node, entry) || banded(node, entry))
      // A freeform gradient is drawn as pixels clipped to the fill, so it goes through the paint stack too.
      || shown(node.appearance?.fills).some(entry => isFreeform(entry.paint)));
  }
  /**
   * Points along each subpath of `item` (its own space) with unit normals and length shares: each curve
   * is sampled by length, ends included, so corners keep their anchors (joins come out bevelled).
   */
  function strokeSamples(item) {
    const out = [];
    for (const path of (item.children ?? [item]).filter(p => p.curves?.length && p.length > 0)) {
      const total = path.length, samples = [];
      let before = 0;
      for (const curve of path.curves) {
        const length = curve.length, steps = Math.min(400, Math.max(1, Math.ceil(length / .2)));
        for (let i = 0; i <= steps; i++) {
          const at = length * i / steps, p = curve.getPointAt(at), n = curve.getNormalAt(at);
          if (n && Number.isFinite(n.x)) samples.push({ p: [p.x, p.y], n: [n.x, n.y], t: (before + at) / total });
        }
        before += length;
      }
      if (path.closed) samples.pop();
      out.push({ samples, closed: path.closed });
    }
    return out;
  }
  /** Variable-width stroke outline of `item`'s geometry as subpaths. */
  function variableStrokeSubpaths(item, stroke) {
    return strokeSamples(item).flatMap(({ samples, closed }) => variableStrokeRings(samples, stroke.width, stroke.widthProfile, { closed, cap: stroke.cap ?? 'butt' })
      .map(ring => ({ closed: true, segments: ring.map(p => ({ p, in: [0, 0], out: [0, 0] })) })));
  }
  function variableStroke(item, stroke) {
    if (banded({ type: 'path' }, stroke)) return gradientStroke(item, stroke);
    const piece = new scope.CompoundPath({ insert: false, fillRule: 'nonzero',
      children: variableStrokeSubpaths(item, stroke).map(s => new scope.Path({ insert: false, closed: true, segments: s.segments.map(g => g.p) })) });
    piece.fillColor = color(stroke.paint, stroke.opacity ?? 1);
    if (piece.fillColor && stroke.paint?.type === 'solid') piece.fillColor.alpha = stroke.opacity ?? 1;
    return piece;
  }
  /** A freeform fill: the colour field as pixels over the fill's box, clipped to its shape. */
  function freeformFill(item, fill) {
    const clip = item.clone({ insert: false }); clip.matrix = new scope.Matrix(); clip.clipMask = true;
    const box = clip.bounds, pixels = freeformPixels(fill.paint, { x: box.x, y: box.y, width: box.width, height: box.height });
    const canvas = document.createElement('canvas'); canvas.width = pixels.width; canvas.height = pixels.height;
    canvas.getContext('2d').putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
    const raster = new scope.Raster(canvas); raster.remove(); raster.smoothing = 'high'; raster.bounds = box;
    const group = new scope.Group({ insert: false, children: [clip, raster], clipped: true }); group.opacity = fill.opacity ?? 1;
    return group;
  }
  /** A gradient along or across the stroke: one filled band per colour step (dashes are not applied). */
  function gradientStroke(item, stroke) {
    const paint = stroke.paint, opaque = paint.stops.every(s => (s.opacity ?? 1) >= 1) && (stroke.opacity ?? 1) >= 1;
    const group = new scope.Group({ insert: false });
    for (const { samples, closed } of strokeSamples(item)) {
      for (const band of gradientStrokeBands(samples, stroke.width, stroke.widthProfile, { mode: paint.strokeMode, closed, cap: stroke.cap ?? 'butt', opaque })) {
        const piece = new scope.CompoundPath({ insert: false, fillRule: 'nonzero', children: band.rings.map(ring => new scope.Path({ insert: false, closed: true, segments: ring })) });
        piece.fillColor = color({ type: 'solid', color: colorAt(paint, band.t) }); piece.fillColor.alpha = opacityAt(paint, band.t) * (stroke.opacity ?? 1);
        group.addChild(piece);
      }
    }
    return group;
  }
  function style(item, node, asOutline = outlineFor(node.id), stackOwned = false) {
    item.opacity = asOutline ? 1 : node.opacity * (node.type === 'image' ? records.get(node.id)?.context.dim ?? 1 : 1);
    item.data.baseOpacity = item.opacity;
    item.blendMode = asOutline ? 'normal' : node.blendMode;
    if (node.children || node.type === 'image') return;
    const bare = stackOwned && !asOutline && stacked(node);
    const fill = bare ? null : shown(node.appearance.fills)[0], stroke = bare ? null : shown(node.appearance.strokes)[0];
    item.fillColor = asOutline ? null : color(fill?.paint, fill?.opacity ?? 1);
    item.strokeColor = asOutline ? '#071411' : color(stroke?.paint, stroke?.opacity ?? 1);
    if (item.fillColor && fill?.paint?.type === 'solid') item.fillColor.alpha = fill?.opacity ?? 1;
    if (item.strokeColor && !asOutline && stroke?.paint?.type === 'solid') item.strokeColor.alpha = stroke?.opacity ?? 1;
    const strokeZoom=!asOutline&&node.strokeScaling===false?scope.view.zoom:1;
    item.strokeWidth = asOutline ? 1 / scope.view.zoom : (stroke?.width ?? 0)*strokeZoom;
    item.strokeScaling = !asOutline && node.strokeScaling!==false;
    item.strokeCap = asOutline ? 'butt' : stroke?.cap ?? 'butt';
    item.strokeJoin = asOutline ? 'miter' : stroke?.join ?? 'miter';
    item.miterLimit = stroke?.miterLimit ?? 4;
    item.dashArray = asOutline ? [] : (stroke?.dash?.array ?? []).map(n=>n*strokeZoom);
    item.dashOffset = asOutline ? 0 : (stroke?.dash?.offset ?? 0)*strokeZoom;
    if (node.type === 'path') item.fillRule = node.fillRule;
    // Scribble: the scribbled line is drawn in the fill colour, as a stroke.
    const scribbled = !asOutline && !bare && ['path', 'shape'].includes(node.type) && scribbleOf(node);
    if (scribbled && fill) Object.assign(item, { fillColor: null, strokeColor: color(fill.paint, fill.opacity ?? 1), strokeWidth: scribbled.strokeWidth * strokeZoom, strokeCap: 'round', strokeJoin: 'round', dashArray: [] });
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
      if (kind === 'fills' && isFreeform(entry.paint)) { const piece = freeformFill(item, entry); piece.blendMode = entry.blendMode ?? 'normal'; group.addChild(piece); continue; }
      if (kind === 'strokes' && (profiled(node, entry) || banded(node, entry))) { const piece = variableStroke(item, entry); piece.blendMode = entry.blendMode ?? 'normal'; group.addChild(piece); continue; }
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
    // Arrowheads take a gradient stroke's first stop as a solid colour.
    const group = new scope.Group({ insert: false }), paint = color(stroke.paint?.stops ? { type: 'solid', color: [...stroke.paint.stops].sort((a, b) => a.offset - b.offset)[0].color } : stroke.paint);
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
  // Blends (D4.2): a group with `blend` draws the in-between shapes of each pair of neighbouring keys,
  // stacked between them. Only paths and shapes are keys; the steps are view items, not nodes.
  const BLEND_LIMIT = 2000;
  function keyLook(node) {
    const first = e => e?.paint?.stops ? { type: 'solid', color: [...e.paint.stops].sort((a, b) => a.offset - b.offset)[0].color } : e?.paint;
    const rgb = e => { const c = e && color(first(e)); return c ? [c.red, c.green, c.blue] : null; };
    const fill = shown(node.appearance?.fills)[0], stroke = shown(node.appearance?.strokes)[0];
    return { fill: rgb(fill), fillAlpha: fill?.opacity ?? 1, stroke: rgb(stroke), strokeAlpha: stroke?.opacity ?? 1, width: stroke?.width ?? 0,
      cap: stroke?.cap ?? 'butt', join: stroke?.join ?? 'miter', opacity: node.opacity ?? 1, fillRule: node.fillRule ?? 'nonzero' };
  }
  function keyShape(node) {
    // Text counts when its glyphs are known (it is drawn as their outlines).
    const item = items.get(node.id); if (!item || !(['path', 'shape'].includes(node.type) || node.type === 'text' && item.className === 'CompoundPath')) return null;
    const copy = item.clone({ insert: false }); copy.matrix = new scope.Matrix(...node.transform); copy.applyMatrix = true;
    const out = toSubpaths(copy); copy.remove(); return out.length ? out : null;
  }
  const mixLook = (a, b, t) => ({ fill: a.fill && b.fill ? lerpColor(a.fill, b.fill, t) : a.fill ?? b.fill, fillAlpha: a.fillAlpha + (b.fillAlpha - a.fillAlpha) * t,
    stroke: a.stroke && b.stroke ? lerpColor(a.stroke, b.stroke, t) : a.stroke ?? b.stroke, strokeAlpha: a.strokeAlpha + (b.strokeAlpha - a.strokeAlpha) * t,
    width: a.width + (b.width - a.width) * t, cap: a.cap, join: a.join, opacity: a.opacity + (b.opacity - a.opacity) * t, fillRule: a.fillRule });
  /** In-between shapes of blend group `node`, in the group's space: per neighbouring key pair, its steps. */
  function blendData(node) {
    const keys = node.children.filter(child => child.visible).map(child => ({ node: child, shape: keyShape(child), look: keyLook(child) })).filter(k => k.shape);
    const pairs = []; let total = 0;
    // With a spine the steps sit along it (keys at equal shares of its length) instead of on straight lines.
    const spine = node.blend.spine ? spineCurve(node.blend.spine) : null, along = node.blend.orientation === 'path';
    for (let i = 0; i + 1 < keys.length; i++) {
      const a = keys[i], b = keys[i + 1], share = spine ? spine.length / (keys.length - 1) : null;
      const count = Math.min(BLEND_LIMIT - total, blendStepCount(node.blend, { subpaths: a.shape, colors: [a.look.fill ?? a.look.stroke] }, { subpaths: b.shape, colors: [b.look.fill ?? b.look.stroke] }, share));
      if (count < 1) break; total += count;
      const [sa, sb] = matchShapes(a.shape, b.shape);
      const ua = keyPosition(i, keys.length), ub = keyPosition(i + 1, keys.length), angleA = spine?.at(ua).angle, angleB = spine?.at(ub).angle;
      const shaped = (t) => {
        const subpaths = interpolateShapes(sa, sb, t);
        if (!spine) return subpaths;
        const at = spine.at(ua + (ub - ua) * t);
        return placeOnSpine(subpaths, at.p, along ? at.angle - (angleA + (angleB - angleA) * t) : 0);
      };
      pairs.push({ after: a.node.id, before: b.node.id, steps: stepPositions(count).map(t => ({ subpaths: shaped(t), look: mixLook(a.look, b.look, t) })) });
    }
    return pairs;
  }
  function stepItem({ subpaths, look }, asOutline) {
    const item = new scope.CompoundPath({ insert: false, children: subpaths.map(path), fillRule: look.fillRule });
    if (asOutline) Object.assign(item, { strokeColor: '#071411', strokeWidth: 1, strokeScaling: false });
    else {
      if (look.fill) { item.fillColor = new scope.Color(...look.fill); item.fillColor.alpha = look.fillAlpha; }
      if (look.stroke && look.width > 0) { item.strokeColor = new scope.Color(...look.stroke); item.strokeColor.alpha = look.strokeAlpha; Object.assign(item, { strokeWidth: look.width, strokeCap: look.cap, strokeJoin: look.join }); }
      item.opacity = look.opacity;
    }
    return item;
  }
  function placeBlend(node, record) {
    if (!node.blend) { record.blendSteps = null; record.blendKey = null; return; }
    const asOutline = outlineFor(node.id), key = JSON.stringify([node.blend, node.children, asOutline]);
    if (record.blendKey !== key) {
      record.blendKey = key;
      record.blendSteps = blendData(node).map(pair => { const group = new scope.Group({ insert: false, children: pair.steps.map(step => stepItem(step, asOutline)) }); group.data.blendBefore = pair.before; return group; });
    }
    // Each pair's steps sit right under the upper key (under its shadow, if it has one).
    for (const group of record.blendSteps) { const before = records.get(group.data.blendBefore), below = before?.shadow ?? items.get(group.data.blendBefore); if (below) group.insertBelow(below); }
  }
  /**
   * Opacity masks (D4.3): a group with `mask` uses its top child's luminance as the alpha of the rest.
   * The mask art is hidden; a black copy whose alpha is that luminance is drawn last with destination-in.
   * A group blend other than normal makes Paper draw the group in its own layer, so only it is masked.
   * Without Clip the mask's background counts as white (outside the art stays visible); Invert flips both.
   */
  // Children not drawn themselves: opacity-mask art, and the parts of a live Pathfinder group.
  const coveredIds = new Set();
  const luminance = c => .2126 * c.red + .7152 * c.green + .0722 * c.blue;
  function alphaPaint(item, factor) {
    const convert = c => { if (!c) return c;
      if (c.gradient) { const g = c.clone(); for (const stop of g.gradient.stops) stop.color = new scope.Color(0, 0, 0, factor(luminance(stop.color), stop.color.alpha)); return g; }
      return new scope.Color(0, 0, 0, factor(luminance(c), c.alpha)); };
    if (item.className === 'Raster') {
      const w = item.width, h = item.height; if (!w || !h) return;
      const data = item.getImageData(new scope.Rectangle(0, 0, w, h));
      for (let i = 0; i < data.data.length; i += 4) { const a = factor((.2126 * data.data[i] + .7152 * data.data[i + 1] + .0722 * data.data[i + 2]) / 255, data.data[i + 3] / 255); data.data[i] = data.data[i + 1] = data.data[i + 2] = 0; data.data[i + 3] = Math.round(a * 255); }
      item.setImageData(data, new scope.Point(0, 0)); return;
    }
    if (item.fillColor) item.fillColor = convert(item.fillColor);
    if (item.strokeColor) item.strokeColor = convert(item.strokeColor);
    for (const child of item.children ?? []) alphaPaint(child, factor);
  }
  function placeOpacityMask(node, record, item) {
    const art = node.mask && node.children.length > 1 ? node.children.at(-1) : null, asOutline = outlineFor(node.id);
    record.maskView = null;
    if (!art) { if (item.blendMode === 'source-over') item.blendMode = node.blendMode ?? 'normal'; return; }
    coveredIds.add(art.id);
    if (asOutline) { item.blendMode = 'normal'; return; }
    if ((node.blendMode ?? 'normal') === 'normal') item.blendMode = 'source-over';
    // Clip makes the background black (hidden); Invert flips it, so it is white when both or neither are on.
    const background = !!node.mask.clip === !!node.mask.invert ? 1 : 0;
    const value = l => node.mask.invert ? 1 - l : l;
    const view = new scope.Group({ insert: false }); view.blendMode = 'destination-in'; view.data.opacityMask = true;
    const artRecord = records.get(art.id), source = artRecord?.stack ?? items.get(art.id);
    if (art.visible && source) {
      // The copy is only paint: without node ids, export and hit testing never take it for the hidden art.
      const copy = source.clone({ insert: false, deep: true }); copy.visible = true;
      for (const part of [copy, ...copy.getItems({ recursive: true })]) part.data = {};
      copy.matrix = (artRecord?.stack ? artRecord.stack.matrix : items.get(art.id).matrix).clone();
      if (background) {
        const box = item.internalBounds?.expand(1); if (box?.width > 0) view.addChild(new scope.Path.Rectangle({ rectangle: box, fillColor: new scope.Color(0, 0, 0, 1), insert: false }));
        alphaPaint(copy, (l, a) => a * (1 - value(l))); copy.blendMode = 'destination-out';
      } else alphaPaint(copy, (l, a) => a * value(l));
      view.addChild(copy);
    } else if (background) { const box = item.internalBounds?.expand(1); if (box?.width > 0) view.addChild(new scope.Path.Rectangle({ rectangle: box, fillColor: '#000', insert: false })); }
    item.addChild(view); record.maskView = view;
  }
  /**
   * Live Pathfinder (D4.3): a group with a Pathfinder effect draws the combination of its paths and
   * shapes (in the group's space) with each result's source look; the parts stay as they are, hidden.
   */
  function liveResults(node) {
    const op = livePathfinder(node); if (!op) return null;
    const operands = node.children.filter(child => child.visible && ['path', 'shape'].includes(child.type)).map(child => {
      const item = make(child); item.applyMatrix = true; item.transform(new scope.Matrix(...child.transform));
      return { id: child.id, item, fill: (child.appearance?.fills ?? []).find(e => !e.hidden)?.paint?.color?.values?.join(',') ?? null };
    });
    if (operands.length < 2) { operands.forEach(o => o.item.remove()); return null; }
    try { return runPathfinder(operands, op).results; } catch { return null; } finally { operands.forEach(o => o.item.remove()); }
  }
  function placeLivePathfinder(node, record, item) {
    const op = livePathfinder(node), asOutline = outlineFor(node.id);
    if (!op) { record.liveView = null; record.liveKey = null; return; }
    for (const child of node.children) if (['path', 'shape'].includes(child.type)) coveredIds.add(child.id);
    if (asOutline) { for (const child of node.children) coveredIds.delete(child.id); record.liveView = null; return; }
    const key = JSON.stringify([node.appearance.effects, node.children]);
    if (record.liveKey !== key || !record.liveView) {
      record.liveKey = key;
      const view = new scope.Group({ insert: false }); view.data.livePathfinder = true;
      for (const result of liveResults(node) ?? []) {
        const source = state.document.getNode(result.sourceId); if (!source) continue;
        const piece = new scope.CompoundPath({ insert: false, children: result.subpaths.map(path), fillRule: 'nonzero' });
        // Outline gives the edges as lines in the source's fill colour, as in Illustrator.
        const look = result.kind === 'outline' ? { ...source, appearance: { ...source.appearance, fills: [], strokes: [{ paint: (source.appearance.fills ?? [])[0]?.paint ?? { type: 'solid', color: { space: 'rgb', values: [0, 0, 0] } }, opacity: 1, width: .1, cap: 'butt', join: 'miter', miterLimit: 4, align: 'center', blendMode: 'normal', effects: [] }] } } : source;
        style(piece, { ...look, type: 'path', fillRule: 'nonzero', opacity: source.opacity ?? 1, blendMode: source.blendMode ?? 'normal' }, false);
        view.addChild(piece);
      }
      record.liveView = view;
    }
    item.addChild(record.liveView);
  }
  /**
   * Envelope Distort: a group with `envelope` draws its paths, shapes and compound paths bent into the outline of
   * its top child (all in the group's space); the parts and the envelope itself stay as they are, hidden.
   */
  const ENVELOPED = ['path', 'shape', 'compoundPath'];
  // Make with Warp: the envelope is a warp style over the artwork's box, with no shape of its own.
  const envelopeTop = node => node.envelope?.warp ? null : node.children.at(-1);
  function envelopeResults(node) {
    if (!node?.envelope || !node.children.length) return [];
    const top = envelopeTop(node); if (top && !['path', 'shape'].includes(top.type)) return [];
    const local = child => { const item = make(child); item.applyMatrix = true; item.transform(new scope.Matrix(...child.transform)); const out = toSubpaths(item); item.remove(); return out; };
    const outline = top ? local(top)[0] : null, parts = node.children.filter(child => child !== top && child.visible && ENVELOPED.includes(child.type)).map(child => ({ child, subpaths: local(child) })).filter(p => p.subpaths.length);
    if ((top && !outline) || !parts.length) return [];
    const pts = parts.flatMap(p => p.subpaths.flatMap(s => s.segments.map(g => g.p))), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    let map; try { map = top ? envelopeMapping(box, outline) : warpMapping(box, node.envelope.warp); } catch { return []; }
    return parts.map(({ child, subpaths }) => ({ sourceId: child.id, subpaths: envelopeSubpaths(subpaths, map, box) }));
  }
  function placeEnvelope(node, record, item) {
    if (!node.envelope) { record.envelopeView = null; record.envelopeKey = null; return; }
    if (outlineFor(node.id)) { record.envelopeView = null; return; }
    const results = record.envelopeKey === JSON.stringify(node.children) && record.envelopeView ? null : envelopeResults(node);
    if (results) {
      record.envelopeKey = JSON.stringify(node.children);
      const view = new scope.Group({ insert: false }); view.data.envelope = true;
      for (const { sourceId, subpaths } of results) {
        const source = state.document.getNode(sourceId); if (!source) continue;
        const piece = new scope.CompoundPath({ insert: false, children: subpaths.map(path), fillRule: source.fillRule ?? 'nonzero' });
        style(piece, { ...source, type: 'path', transform: [1, 0, 0, 1, 0, 0] }, false); view.addChild(piece);
      }
      record.envelopeView = view;
    }
    if (!record.envelopeView.children.length) return;
    for (const child of node.children) if (child === envelopeTop(node) || ENVELOPED.includes(child.type)) coveredIds.add(child.id);
    item.addChild(record.envelopeView);
  }
  /** An envelope group's distorted parts in its own space, with the node each takes its look from. */
  const envelopeSteps = id => envelopeResults(state.document.getNode(id));
  /** A live Pathfinder group's results in its own space, with the node each takes its look from. */
  const liveSteps = id => { const node = state.document.getNode(id); return livePathfinder(node) ? liveResults(node) ?? [] : []; };
  /** Blend steps as data for Expand: per pair, after which key, and each step's subpaths and look. */
  const blendSteps = id => { const node = state.document.getNode(id); return node?.blend ? blendData(node) : []; };
  function place(parent, item, index) {
    if (parent.children[index] !== item) parent.insertChild(index, item);
  }
  // Paths and shapes in a group with vector effects are drawn with those effects too; the object kept per node
  // and per inherited list keeps its cached keys while nothing changes.
  const inheritedNodes = new WeakMap();
  const effectiveNode = (node, inherited) => {
    if (!inherited.length || !['path', 'shape'].includes(node.type)) return node;
    const key = JSON.stringify(inherited), cached = inheritedNodes.get(node);
    if (cached?.key === key) return cached.node;
    const out = withGroupEffects(node, inherited); inheritedNodes.set(node, { key, node: out }); return out;
  };
  function reconcile(nodes, parent, alive, parentContext = ROOT_CONTEXT, inherited = []) {
    let index = 0;
    for (const original of nodes) {
      const node = effectiveNode(original, inherited);
      alive.add(node.id);
      const geometry = geometryKey(node), context = layerContext(parentContext, node), fingerprint = `[${keysOf(node).own},${JSON.stringify(context)}]`;
      let record = records.get(node.id), item = items.get(node.id);
      const replaced = !record || record.node.type !== node.type || record.geometry !== geometry;
      if (replaced) {
        item?.remove(); record?.frame?.remove(); record?.arrows?.remove(); record?.stack?.remove(); record?.maskStroke?.remove(); record?.shadow?.remove(); record?.raster?.remove();
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
        record.shadow?.remove(); record.shadow = shadowFor(item, node);
        if (node.type !== 'group') { record.raster?.remove(); record.raster = rasterFor(item, node, record); }
      }
      // Bounds must be measured before viewport visibility is applied.
      item.visible = node.visible;
      if (record.shadow) place(parent, record.shadow, index++);
      place(parent, item, index++);
      if (record.frame) { record.frame.visible = false; place(parent, record.frame, index++); }
      if (record.arrows) place(parent, record.arrows, index++);
      if (record.raster) place(parent, record.raster, index++);
      if (record.stack) place(parent, record.stack, index++);
      record.blendSteps?.forEach(g => g.remove()); record.maskView?.remove(); record.liveView?.remove(); record.envelopeView?.remove();
      if (node.children) reconcile(node.children, item, alive, context, node.type === 'group' ? [...vectorEffects(node), ...inherited] : inherited);
      if (node.type === 'group') {
        for (const child of node.children) coveredIds.delete(child.id);
        placeBlend(node, record); placeLivePathfinder(node, record, item); placeEnvelope(node, record, item); placeOpacityMask(node, record, item);
        // Pixel effects on a group are drawn from its finished children, so they are made after them.
        const pixelKey = JSON.stringify([node.appearance?.effects, node.children]);
        if (record.groupPixelKey !== pixelKey) { record.groupPixelKey = pixelKey; record.raster?.remove(); record.raster = rasterFor(item, node, record); }
        if (record.raster) record.raster.insertAbove(item);
      }
      // A clipping mask: the topmost child clips its siblings. Paper skips it when drawing and hit testing.
      if (node.type === 'group') {
        const mask = node.clip ? node.children.at(-1)?.id : null;
        for (const child of node.children) {
          const childItem = items.get(child.id), want = child.id === mask;
          if (childItem && childItem.clipMask !== want) { childItem.clipMask = want; if (!want) style(childItem, child, outlineFor(child.id), true); }
        }
        // Draw Inside keeps the clipping path's paint: its fill under the contents, its stroke above them.
        record.maskFill?.remove(); record.maskStroke?.remove(); record.maskFill = record.maskStroke = null;
        const maskNode = mask ? node.children.at(-1) : null, maskItem = maskNode && items.get(maskNode.id);
        if (maskItem && maskNode.visible) {
          const piece = (kind) => {
            const entries = shown(maskNode.appearance?.[kind]); if (!entries.length) return null;
            const copy = maskItem.clone({ insert: false }); copy.clipMask = false; copy.data = { nodeId: maskNode.id, maskPaint: true };
            style(copy, { ...maskNode, appearance: { ...maskNode.appearance, fills: kind === 'fills' ? entries : [], strokes: kind === 'strokes' ? entries : [] } }, false);
            return copy;
          };
          record.maskFill = piece('fills'); if (record.maskFill) item.insertChild(0, record.maskFill);
          record.maskStroke = piece('strokes');
          if (record.maskStroke) { record.maskStroke.matrix = item.matrix.clone().append(maskItem.matrix); place(parent, record.maskStroke, index++); }
        }
      }
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
        // A leaf whose matrix, geometry and look are unchanged keeps its bounds from the last render (D4.6).
        const record = records.get(node.id), boundsKey = node.children ? null : `${matrix.values}|${record.geometry}|${record.fingerprint}|${outlineFor(node.id)}`;
        if (boundsKey && record.bounds?.key === boundsKey) {
          worldBounds.set(node.id, record.bounds.world.clone()); paintedBounds.set(node.id, record.bounds.painted.clone());
          if (node.visible) combined = union(combined, record.bounds.world);
          continue;
        }
        // A clipping group is as large as its clipping path.
        const b = node.children ? (node.clip && node.children.length ? (visit(node.children, matrix), worldBounds.get(node.children.at(-1).id)?.clone() ?? null) : visit(node.children, matrix)) : record.frame
          ? record.frame.getBounds(matrix) : item.getBounds(matrix);
        if (b) {
          worldBounds.set(node.id, b.clone());
          // Stroke bounds preserve thick strokes intersecting the viewport edge.
          if (outlineFor(node.id) && !node.children && node.type !== 'image') style(item, node, false);
          paintedBounds.set(node.id, node.children || record.frame ? b.clone() : item.getStrokeBounds(matrix));
          if (outlineFor(node.id) && !node.children && node.type !== 'image') style(item, node);
          if (node.visible) combined = union(combined, b);
          if (boundsKey) record.bounds = { key: boundsKey, world: b.clone(), painted: paintedBounds.get(node.id).clone() };
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
      item.remove(); records.get(id).frame?.remove(); records.get(id).arrows?.remove(); records.get(id).stack?.remove(); records.get(id).shadow?.remove(); records.get(id).raster?.remove(); records.get(id).maskStroke?.remove(); items.delete(id); records.delete(id); thumbnails.delete(id);
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
  const segmentsOf=subpath=>subpath.segments.map(s=>new scope.Segment(new scope.Point(...s.p),new scope.Point(...s.in),new scope.Point(...s.out)));
  /** The unpainted path of Type on a Path, drawn like Illustrator's path guide, with an overflow plus at its end. */
  function pathGuide(node,matrix) {
    const group=new scope.Group({insert:false});group.data.textFrame=true;group.data.textId=node.id;
    const color=node.layout?.overflow?'#C0392B':records.get(node.id)?.context.color??'#006B5C';
    const line=new scope.Path({insert:false,segments:segmentsOf(node.onPath.subpath),closed:node.onPath.subpath.closed});line.transform(matrix);
    Object.assign(line,{strokeColor:color,strokeWidth:1/scope.view.zoom});group.addChild(line);
    if(node.layout?.overflow) {
      const p=line.closed?line.firstSegment.point:line.lastSegment.point,r=4/scope.view.zoom;
      group.addChild(new scope.Path.Rectangle({insert:false,rectangle:[p.x-r,p.y-r,2*r,2*r],strokeColor:color,fillColor:'#FFFFFF',strokeWidth:1/scope.view.zoom}));
      for(const [from,to] of [[[p.x-r/2,p.y],[p.x+r/2,p.y]],[[p.x,p.y-r/2],[p.x,p.y+r/2]]])group.addChild(new scope.Path.Line({insert:false,from,to,strokeColor:color,strokeWidth:1/scope.view.zoom}));
    }
    return group;
  }
  const textGuide=(node,matrix)=>node.kind==='onPath'?pathGuide(node,matrix):areaFrame(node,matrix);
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
  function updateView({ viewOnly = false } = {}) {
    const traceSource=imageTraceId&&items.get(imageTraceId);
    if(imageTracePreview&&traceSource?.parent)imageTracePreview.insertAbove(traceSource);
    const viewport = scope.view.bounds.expand(16 / scope.view.zoom), dimmed = isolationDimmed();
    textFrames.removeChildren();
    for (const [id, record] of records) {
      const item = items.get(id), node = record.node;
      if(node.strokeScaling===false){style(item,node,outlineFor(id),true);if(record.stack){const next=paintStack(item,node);record.stack.replaceWith(next);record.stack=next;}}
      const b = paintedBounds.get(id);
      const visible = node.visible && (!!node.children || !!b?.intersects(viewport));
      const asOutline = outlineFor(id);
      item.visible = visible && id!==imageTraceId && !(asOutline && node.type === 'image') && !editPreviews.has(id) && !transformPreviewIds.has(id) && !pathPreviewHidden.has(id) && !(coveredIds.has(id) && !asOutline);
      // A rasterized object shows its pixels; Outline view shows its paths.
      if (record.raster) { record.raster.visible = item.visible && !asOutline && !editPreviews.has(id); if (!asOutline) item.visible = false; }
      if (asOutline && !node.children && node.type !== 'image') item.strokeWidth = 1 / scope.view.zoom;
      if (record.frame) { record.frame.visible = visible && asOutline && node.type==='image'; record.frame.strokeWidth = 1 / scope.view.zoom; }
      if(node.type==='text'&&['area','onPath'].includes(node.kind)&&visible&&!transformPreviewIds.has(id)&&state.document.ancestors(id).every(n=>n.visible)&&
        (state.selection.ids.includes(id)||asOutline||node.layout?.overflow))textFrames.addChild(textGuide(node,record.worldMatrix));
      if (record.arrows) record.arrows.visible = item.visible && !asOutline;
      if (record.stack) record.stack.visible = item.visible && !asOutline;
      if (record.raster) record.raster.opacity = node.opacity * (dimmed?.has(id) ? ISOLATION_DIM : 1);
      if (record.maskFill) record.maskFill.visible = !asOutline;
      if (record.maskStroke) record.maskStroke.visible = item.visible && !asOutline;
      if (record.shadow) { record.shadow.visible = item.visible && !asOutline; record.shadow.opacity = (record.shadow.data.baseOpacity ?? 1) * (dimmed?.has(id) ? ISOLATION_DIM : 1); }
      const factor = dimmed?.has(id) ? ISOLATION_DIM : 1;
      if (item.data.baseOpacity !== undefined) item.opacity = item.data.baseOpacity * factor;
      if (record.stack) record.stack.opacity = (record.stack.data.baseOpacity ?? 1) * factor;
    }
    for (const [id,{item,label,labelRect}] of boardItems) {
      item.strokeWidth=(id===activeArtboard(state).id ? 2 : 1)/scope.view.zoom; item.visible=item.bounds.intersects(viewport);
      label.point=item.bounds.topLeft.add([0,-8/scope.view.zoom]);label.fontSize=12/scope.view.zoom;label.visible=item.visible;
      labelRect.bounds=label.bounds.expand(6/scope.view.zoom,4/scope.view.zoom);labelRect.visible=label.visible;
    }
    artboardControls.removeChildren(); artboardAddPoints=[];
    if(state.ui?.tool==='artboard' && !state.document.readOnly) for(const a of state.document.data.artboards) {
      const z=scope.view.zoom,gap=36/z,r=10/z;
      for(const [direction,x,y] of [['top',a.x+a.width/2,a.y-gap],['right',a.x+a.width+gap,a.y+a.height/2],['bottom',a.x+a.width/2,a.y+a.height+gap],['left',a.x-gap,a.y+a.height/2]]) {
        const point=new scope.Point(x,y); artboardAddPoints.push({boardId:a.id,direction,point});
        artboardControls.addChild(new scope.Path.Circle({center:point,radius:r,fillColor:labelBackground,strokeColor:labelColor,strokeWidth:1.5/z,insert:false}));
        for(const [from,to] of [[[x-4/z,y],[x+4/z,y]],[[x,y-4/z],[x,y+4/z]]])artboardControls.addChild(new scope.Path.Line({from,to,strokeColor:labelColor,strokeWidth:1.5/z,insert:false}));
      }
    }
    if(transformPreview)transformPreview.getItems({match:item=>!!item.data.nodeId}).forEach(item=>{
      const record=records.get(item.data.nodeId);if(!record)return;
      const proposed=item.data.transformPreviewNode;
      if(proposed&&!item.data.stack&&!item.data.arrows&&!item.data.rasterEffect)style(item,proposed,outlineFor(record.node.id),true);
    });
    // One draw per frame, however many updates an action makes (D4.6). Paper's own requestUpdate only
    // draws with autoUpdate on, which this view does not use.
    selection.update(); anchors.update(); gradientAnnotator.update(gradientAnnotation); viewGuides.update({foreground:labelColor,background:labelBackground}); requestDraw(viewOnly);
  }
  /**
   * Drawing (D4.6). Updates are drawn once per frame. When a full draw is slow (a big document) its frame is
   * kept; while only the view moves (pan, zoom, rotate) that frame is moved and scaled at once, and the
   * artwork is drawn sharp again when the view has been still for a moment.
   */
  let drawQueued = false, onlyView = true, lastFrame = null, settleTimer = null;
  const SLOW_DRAW_MS = 12;
  function requestDraw(viewOnly = false) {
    // A view that draws quickly (or has no frames, in unit tests) is drawn at once, as before; only slow
    // documents wait for the next frame.
    if (typeof requestAnimationFrame !== 'function' || (!lastFrame && !drawQueued)) { fullDraw(); return; }
    onlyView &&= viewOnly;
    if (drawQueued) return; drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false; const quick = onlyView && !!lastFrame; onlyView = true;
      if (quick) { blitFrame(); clearTimeout(settleTimer); settleTimer = setTimeout(() => { settleTimer = null; scope.view._needsUpdate = true; fullDraw(); }, 150); }
      else fullDraw();
    });
  }
  function fullDraw() {
    clearTimeout(settleTimer); settleTimer = null;
    const view = scope.view, started = performance.now();
    view.update();
    if (performance.now() - started < SLOW_DRAW_MS) { lastFrame = null; return; }
    const element = view.element, copy = lastFrame?.canvas ?? document.createElement('canvas');
    if (copy.width !== element.width || copy.height !== element.height) { copy.width = element.width; copy.height = element.height; }
    const ctx = copy.getContext('2d'); ctx.clearRect(0, 0, copy.width, copy.height); ctx.drawImage(element, 0, 0);
    lastFrame = { canvas: copy, matrix: view.matrix.clone() };
  }
  function blitFrame() {
    const view = scope.view, element = view.element, ctx = element.getContext('2d'), ratio = view.pixelRatio ?? 1;
    const m = view.matrix.clone().append(lastFrame.matrix.inverted());
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, element.width, element.height);
    ctx.setTransform(m.a, m.b, m.c, m.d, m.tx * ratio, m.ty * ratio); ctx.drawImage(lastFrame.canvas, 0, 0); ctx.restore();
  }
  /** A detached group with the printable artwork in preview mode: no templates, hidden objects, dimming or culling. */
  const filled = item => !!item.fillColor && item.fillColor.alpha !== 0;
  /** Cut `item` (detached, world space) by a world-space region: filled art becomes the overlapping area, strokes keep the parts inside. */
  const clipTo = (item, region) => item.intersect(region, { insert: false, trace: filled(item) });
  function worldOf(item) { const m = item.matrix.clone(); for (let p = item.parent; p; p = p.parent) m.prepend(p.matrix); return m; }
  /**
   * Replaces clipping masks in a detached export group with real geometry, for formats and machines
   * that cannot clip (PDF/EPS/DXF writers and Send to Cut). Images inside a mask stay whole.
   */
  function resolveClipping(group) {
    const masks = group.getItems({ match: item => item.clipMask });
    let images = false;
    for (const mask of masks) {
      const region = mask.clone({ insert: false }); region.applyMatrix = true; region.transform(worldOf(mask.parent));
      const parts = mask.parent.getItems({ match: item => !item.clipMask && (item.className === 'Path' || item.className === 'CompoundPath') && !(item.parent?.className === 'CompoundPath') });
      for (const part of parts) {
        const parentWorld = worldOf(part.parent), copy = part.clone({ insert: false });
        copy.applyMatrix = true; copy.transform(parentWorld);
        const result = clipTo(copy, region); copy.remove();
        result.transform(parentWorld.inverted()); result.data = { ...part.data }; result.visible = part.visible; result.opacity = part.opacity; result.blendMode = part.blendMode;
        part.replaceWith(result);
      }
      if (mask.parent.getItems({ match: item => item.className === 'Raster' }).length) images = true;
      region.remove();
    }
    for (const mask of masks) mask.remove();
    group.data.warnings = images ? ['Images inside clipping masks are exported whole.'] : [];
    return group;
  }
  /** Subpaths of a path or shape cut by every clipping mask above it, in the space of `matrix`; null when nothing clips it. */
  function clippedSubpaths(id, matrix) {
    const node = state.document.getNode(id);
    let region = null;
    for (const group of state.document.ancestors(id)) {
      if (group.type !== 'group' || !group.clip || !group.children.length) continue;
      const maskId = group.children.at(-1).id; if (maskId === id) continue;
      const mask = make(state.document.getNode(maskId)); mask.transform(records.get(maskId).worldMatrix);
      region = region ? region.intersect(mask, { insert: false }) : mask;
    }
    if (!region) return null;
    const item = make(node); item.transform(records.get(id).worldMatrix);
    if (!shown(node.appearance?.fills).length) item.fillColor = null; else item.fillColor = '#000';
    const result = clipTo(item, region); item.remove(); region.remove();
    result.transform(new scope.Matrix(...matrix).inverted());
    const subpaths = (result.children ?? [result]).filter(p => p.segments?.length).map(p => ({ closed: p.closed,
      segments: p.segments.map(s => ({ p: [s.point.x, s.point.y], in: [s.handleIn.x, s.handleIn.y], out: [s.handleOut.x, s.handleOut.y] })) }));
    result.remove();
    return subpaths;
  }
  /** Subpaths mapped by `matrix` and cut at `rect` (world space): filled art keeps the overlap, strokes the parts inside. */
  function clipToRect(subpaths, matrix, rect, filled) {
    const item = make({ type: 'path', subpaths, fillRule: 'nonzero', transform: [1, 0, 0, 1, 0, 0] }); item.transform(new scope.Matrix(...matrix));
    item.fillColor = filled ? '#000' : null;
    const region = new scope.Path.Rectangle({ rectangle: [rect.x, rect.y, rect.width, rect.height], insert: false });
    const result = clipTo(item, region); item.remove(); region.remove();
    const out = (result.children ?? [result]).filter(p => p.segments?.length).map(p => ({ closed: p.closed,
      segments: p.segments.map(s => ({ p: [s.point.x, s.point.y], in: [s.handleIn.x, s.handleIn.y], out: [s.handleOut.x, s.handleOut.y] })) }));
    result.remove(); return out;
  }
  /** `rasterMasks`: ppi at which opacity-masked groups become images, for formats without luminance masks. */
  function exportArtwork({ resolveClips = false, rasterMasks = null, only = null } = {}) {
    // `only`: node ids to keep (with their ancestors and descendants), for exporting single objects.
    const keep = only ? new Set([...only].flatMap(id => [id, ...state.document.ancestors(id).map(n => n.id), ...state.document.descendants(id).map(n => n.id)])) : null;
    const wasOutline = outline; if (wasOutline) setOutline(false);
    try {
      const isTextFrame=item=>{const record=records.get(item.data?.nodeId);return record?.node.type==='text'&&record.frame===item;};
      const fix = (original, copy) => {
        const id = original.data?.nodeId;
        if (id) {
          const node = state.document.getNode(id), record = records.get(id);
          // A rasterized object is exported as its pixels only.
          copy.visible = original !== record?.frame && !coveredIds.has(id) && !(record?.raster && original !== record.raster) && (!keep || keep.has(id));
          if (original.data.baseOpacity !== undefined) copy.opacity = node?.type === 'image' && original === items.get(id) ? node.opacity : original.data.baseOpacity;
        }
        const children = [...(copy.children ?? [])];
        (original.children ?? []).forEach((child, i) => {
          const childId = child.data?.nodeId;
          if (child.data?.tracePreview || isTextFrame(child) || childId && !isOutputNode(state.document, childId)) children[i].remove(); else fix(child, children[i]);
        });
        if (rasterMasks && id && records.get(id)?.maskView && copy.parent) {
          const box = copy.strokeBounds, resolution = Math.min(rasterMasks / 25.4 * 72, 6000 / Math.max(box.width, box.height, 1e-6) * 72);
          const raster = copy.rasterize({ resolution, insert: false }); raster.data.nodeId = id; copy.replaceWith(raster);
        }
      };
      const group = new scope.Group({ insert: false });
      for (const child of artwork.children) {
        const id = child.data?.nodeId; if (child.data?.tracePreview || isTextFrame(child) || id && !isOutputNode(state.document, id)) continue;
        const copy = child.clone({ insert: false, deep: true }); fix(child, copy); group.addChild(copy);
      }
      return resolveClips ? resolveClipping(group) : group;
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
    for(const [id,record] of [...records].reverse())if(record.node.type==='text'&&['area','onPath'].includes(record.node.kind)&&state.document.isEditable(id)&&
      (!state.ui?.isolation||state.document.ancestors(id).some(n=>n.id===state.ui.isolation))) {
      if(record.node.kind==='onPath') {
        // The text's path is a hit target too, so short or overset text stays easy to pick.
        const guide=new scope.Path({insert:false,segments:segmentsOf(record.node.onPath.subpath),closed:record.node.onPath.subpath.closed});guide.transform(record.worldMatrix);
        const near=guide.getNearestPoint(new scope.Point(point));guide.remove();
        if(near&&near.getDistance(new scope.Point(point))<=4/scope.view.zoom)return id;
        continue;
      }
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
  function clearTransformPreview(){transformPreview?.remove();transformPreview=null;transformPreviewIds.clear();}
  /** `matrix` is one matrix for all, or a function giving each object its own (Transform Each). */
  function previewTransform(ids,matrixOf,{scaleStrokes}={}){
    clearTransformPreview();transformPreview=new scope.Group({insert:false});overlay.addChild(transformPreview);
    for(const id of ids){const original=items.get(id);if(!original)continue;let clone=original.clone({insert:false});const matrix=typeof matrixOf==='function'?matrixOf(id):matrixOf,policy=scaleStrokes===undefined?strokeScalingPolicy(state.ui??{},matrix):scaleStrokes;
      const prepare=(item,root=false)=>{
        const record=records.get(item.data.nodeId);if(record){item.visible=record.node.visible;
          if(policy!==null&&!outlineFor(item.data.nodeId)&&!item.data.rasterEffect){
            const properties=scaledStrokeProperties(record.node,record.worldMatrix.values,matrix,policy,{baked:false,descendant:!root}),proposed={...record.node,...properties};
            if((hasVectorEffects(proposed)&&['path','shape'].includes(proposed.type))||item.data.stack||item.data.arrows){
              const geometry=make(proposed),next=item.data.stack?paintStack(geometry,proposed):item.data.arrows?arrowGroup(geometry,proposed):geometry;
              if(next){next.applyMatrix=false;next.matrix=item.matrix.clone();next.data={...item.data};if(item.parent)item.replaceWith(next);else item.remove();item=next;}
              if(next!==geometry)geometry.remove();
            }
            item.data.transformPreviewNode=proposed;if(!item.data.stack&&!item.data.arrows)style(item,proposed,false,true);
          }
        }
        for(const child of [...(item.children??[])])prepare(child);
        return item;
      };clone=prepare(clone,true);clone.applyMatrix=false;clone.matrix=new scope.Matrix(...matrix).append(records.get(id).worldMatrix);transformPreview.addChild(clone);transformPreviewIds.add(id);
      const stack=records.get(id)?.stack;if(stack){const copy=prepare(stack.clone({insert:false}),true);copy.matrix=clone.matrix.clone();copy.visible=true;transformPreview.addChild(copy);}
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
  const lateThumbnails = new Map();
  function thumbnail(id, size = 56, options = {}) {
    const item = items.get(id), record = records.get(id); if (!item || !record) return null;
    // Snapshots share unchanged nodes and copy every node above a change, so the node object itself is the
    // key for its whole subtree (plus the size, and the image assets and effect library that drawing uses).
    const key = `${size}|${geometryReady()}`, assets = state.document.data.assets, cached = thumbnails.get(id);
    const node = state.document.getNode(id);
    if (cached?.node === node && cached.key === key && cached.assets === assets) return cached.url;
    // A big group or layer keeps its last thumbnail while edits come in, and is redrawn once they pause.
    if (cached && !options.now && node?.children && state.document.descendants(id).length > 300) {
      clearTimeout(lateThumbnails.get(id));
      lateThumbnails.set(id, setTimeout(() => { lateThumbnails.delete(id); if (!records.has(id)) return; const url = withScope(() => thumbnail(id, size, { now: true })); if (url) onThumbnail?.(id, url); }, 1500));
      return cached.url;
    }
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
    thumbnails.set(id, { key, url, node, assets }); return url;
  }
  /**
   * Width tool: where `point` (world) lies against node `id`'s outline: the subpath, its position `t` (0 to 1
   * by length), the distance from the path and the side, in the node's own units (as the stroke weight).
   */
  function strokeLocation(id, point) {
    const item = items.get(id), record = records.get(id); if (!item || !record?.worldMatrix) return null;
    const local = record.worldMatrix.inverseTransform(new scope.Point(point[0], point[1]));
    let best = null;
    for (const [index, path] of (item.children ?? [item]).entries()) {
      if (!path.curves?.length || !(path.length > 0)) continue;
      const loc = path.getNearestLocation(local); if (!loc) continue;
      const d = local.getDistance(loc.point); if (best && d >= best.distance) continue;
      const n = loc.normal ?? path.getNormalAt(loc.offset), away = local.subtract(loc.point);
      best = { subpath: index, t: loc.offset / path.length, distance: d, side: n && away.dot(n) < 0 ? 'right' : 'left' };
    }
    return best;
  }
  /** World positions of each width point of `stroke` on node `id`: the point on the path and both side ends. */
  function widthHandles(id, stroke) {
    const item = items.get(id), record = records.get(id), points = normalizeProfile(stroke?.widthProfile); if (!item || !record?.worldMatrix || !points) return [];
    const out = [];
    for (const path of (item.children ?? [item]).filter(p => p.curves?.length && p.length > 0)) for (const [index, w] of points.entries()) {
      const at = Math.min(path.length, w.t * path.length), p = path.getPointAt(at), n = path.getNormalAt(at); if (!p || !n) continue;
      const world = q => { const r = q.transform(record.worldMatrix); return [r.x, r.y]; };
      out.push({ index, t: w.t, point: world(p), left: world(p.add(n.multiply(w.left * stroke.width))), right: world(p.add(n.multiply(-w.right * stroke.width))) });
    }
    return out;
  }
  /** The width-profiled stroke `entry` of node `id` as filled outline subpaths in the node's own space (Outline Stroke). */
  const profiledStroke = (id, entry) => { const item = items.get(id); return item ? variableStrokeSubpaths(item, entry) : null; };
  return { render, select: updateView,
    setGradientTarget: fn => gradientAnnotator.setTarget(fn), gradientHit: point => gradientAnnotator.hit(point), gradientProject: point => gradientAnnotator.project(point), gradientSpreadAt: point => gradientAnnotator.spreadAt(point),
    /** Annotator state during a drag (a stop marked for removal); redraws at once. */
    setGradientAnnotation(value) { gradientAnnotation = value ?? {}; gradientAnnotator.update(gradientAnnotation); scope.view.update(); }, updateView, requestDraw, bounds, painted: id => paintedBounds.get(id)?.clone() ?? bounds(id), profiledStroke, blendSteps, liveSteps, envelopeSteps, strokeLocation, widthHandles, selectionBounds, hit, items, setOutline, setLaserPreview(value){const next=!!value,changed=next!==laserPreview;if(!next&&!changed)return;laserPreview=next;lastFrame=null;if(changed)setOutline(outline);scope.view._needsUpdate=true;requestDraw();}, get laserPreview(){return laserPreview;}, laserIntent(id){return laserPreviewIntent(state.document,id,getLaserProcesses());}, thumbnail, exportArtwork, clippedSubpaths, clipToRect, effectiveSubpaths, booleanOperand, selectionHandle:point=>selection.hit(point),
    artboardAddHandles:()=>artboardAddPoints.map(h=>({...h,point:h.point.clone()})),
    artboardAddHit:point=>artboardAddPoints.find(h=>h.point.getDistance(point)<=12/scope.view.zoom) ?? null,
    artboardLabelHit:point=>[...boardItems].reverse().find(([,r])=>r.label.visible&&r.labelRect.bounds.contains(point))?.[0] ?? null,
    artboardLabelBounds:id=>boardItems.get(id)?.labelRect.bounds.clone() ?? null,
    glyphBounds(id,subpaths) {const item=new scope.CompoundPath({insert:false,children:subpaths.map(path)});try{return item.getBounds(records.get(id).worldMatrix).clone();}finally{item.remove();}},
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
        if(['area','onPath'].includes(node.kind)) {
          for(const frame of textFrames.children)if(frame.data.textId===node.id)frame.visible=false;
          textPreviewFrame=textGuide(node,new scope.Matrix(...node.transform).prepend(textPreview.matrix));overlay.addChild(textPreviewFrame);
        }
        for (const item of [items.get(node.id), records.get(node.id)?.stack, records.get(node.id)?.arrows]) if (item) item.visible = false;
      }
      scope.view.update();
    },
    viewGuides,
    setTheme({muted,background=labelBackground}) {labelColor=muted;labelBackground=background;for(const {label,labelRect} of boardItems.values()){label.fillColor=muted;labelRect.fillColor=background;}updateView();},
    shapePreview(node,sourceId=null) { const item=make(node);item.applyMatrix=false;style(item,node,false);item.opacity=.6;
      if(sourceId)item.matrix=records.get(sourceId).worldMatrix.clone();overlay.addChild(item);return item; },
    pointToWorld,
    editingNode,editPointToWorld,editPointToLocal,cornerWidgets,
    cornerHandle(point){return cornerWidgets().find(c=>c.point.getDistance(point)<=7/scope.view.zoom)??null;},
    editSpaceId(id){return state.document.getNode(id)?.type==='shape'?state.document.locate(id).parentId:id;},
    setEditPreview(nodes=[]){editPreviews.clear();for(const node of nodes)editPreviews.set(node.id,node);updateView();},
    /** Measure tool line in the overlay; null clears it. */
    setMeasure(points){measureLine?.remove();measureLine=null;if(!points)return scope.view.update();
      const [a,b]=points.map(p=>new scope.Point(...p)),w=1/scope.view.zoom;
      measureLine=new scope.Group({insert:false,children:[new scope.Path.Line({from:a,to:b,strokeColor:'#FFFFFF',strokeWidth:3*w}),new scope.Path.Line({from:a,to:b,strokeColor:'#C0392B',strokeWidth:w}),
        ...[a,b].map(center=>new scope.Path.Circle({center,radius:3*w,fillColor:'#FFFFFF',strokeColor:'#C0392B',strokeWidth:w}))]});
      overlay.addChild(measureLine);scope.view.update();},
    /** Trace in the source's stack and clipping context; exports still use the original image. */
    previewTrace(id=null,nodes=[],{outlines=false}={}){
      imageTracePreview?.remove();imageTracePreview=null;imageTraceId=null;
      const source=items.get(id),original=state.document.getNode(id);
      if(source?.parent&&original){
        imageTraceId=id;imageTracePreview=new scope.Group({insert:false,name:'Image Trace preview',opacity:original.opacity,blendMode:original.blendMode});
        imageTracePreview.data={nodeId:id,tracePreview:true};
        for(const node of nodes){
          const item=make(node);item.applyMatrix=false;item.matrix=new scope.Matrix(...node.transform);style(item,node,false,true);
          if(outlines){item.fillColor=null;item.strokeColor='#007D6B';item.strokeWidth=1/scope.view.zoom;item.strokeScaling=false;}
          imageTracePreview.addChild(item);
        }
        imageTracePreview.insertAbove(source);
      }
      updateView();scope.view.update();
    },
    /** Proposed paths for Offset Path and Simplify: drawn with their paint over the artwork; `hide` lists originals to hide meanwhile. */
    previewPaths(entries=[],hide=[]){
      pathPreview?.remove();pathPreview=null;pathPreviewHidden.clear();for(const id of hide)pathPreviewHidden.add(id);
      if(entries.length){
        pathPreview=new scope.Group({insert:false});
        for(const entry of entries){
          const node={type:'path',subpaths:entry.subpaths,fillRule:entry.fillRule??'nonzero',appearance:entry.appearance,opacity:1,blendMode:'normal',transform:[1,0,0,1,0,0],...(entry.strokeScaling!==undefined?{strokeScaling:entry.strokeScaling}:{})};
          const item=make(node);item.applyMatrix=false;item.matrix=new scope.Matrix(...entry.matrix);style(item,node,false,true);pathPreview.addChild(item);
        }
        overlay.addChild(pathPreview);
      }
      updateView();scope.view.update();
    },
    previewTransform,clearTransformPreview,
    layerColor(id){return records.get(id)?.context.color??'#006B5C';},
    /** An object's bounds in its own coordinates, where its gradient geometry lives. */
    localBounds(id){const node=state.document.getNode(id);if(!node||node.children)return null;const item=make(node),b=item.bounds;item.remove();return {x:b.x,y:b.y,width:b.width,height:b.height};},
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
      viewGuides.destroy(); boards.remove(); artwork.remove(); overlay.remove();
      items.clear(); records.clear(); boardItems.clear(); thumbnails.clear(); worldBounds.clear(); paintedBounds.clear();
    },
  };
}
