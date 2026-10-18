import { parseSVG } from '../svgimport.js';
import { createNode } from './doc/schema.mjs';
import { insertNodes, updateDocument, updateArtboard } from './doc/commands.mjs';
import { appearance } from './geometry.mjs';
import { pointText, PT_TO_MM } from './doc/text.mjs';
import { activeArtboard } from './doc/artboards.mjs';
import { templateLayerCommands } from './doc/layers.mjs';

const IMAGE_PLACEHOLDER = 'modcut-draw-image-';
async function imageFrom(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}
function prepareVector(prepared) {
  if (!prepared.svgText) return { ...prepared, warning: null };
  const { svg, widthMm, heightMm, viewBox } = parseSVG(prepared.svgText);
  svg.querySelectorAll('script,foreignObject').forEach(el => el.remove());
  for (const el of [svg,...svg.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
    for (const key of ['href','xlink:href']) {
      const value = el.getAttribute(key);
      if (value && !value.startsWith('#') && !value.startsWith('data:image/')) el.removeAttribute(key);
    }
  }
  const w = widthMm || (viewBox?.[2] || 100)*25.4/96;
  const h = heightMm || (viewBox?.[3] || 100)*25.4/96;
  // Paper imports physical dimensions as unitless numbers. The viewport is in mm.
  svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h));
  // Masks and filters have no Draw equivalent yet, so such files keep their look as one image.
  const complex = !!svg.querySelector('mask,filter');
  // Embedded images become placeholder rectangles named by index; the converter turns them into image nodes.
  const images = [];
  if (!complex) for (const el of [...svg.querySelectorAll('image')]) {
    const href = el.getAttribute('href') ?? el.getAttribute('xlink:href');
    if (!href?.startsWith('data:image/')) { el.remove(); continue; }
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const key of ['x','y','width','height','transform']) if (el.hasAttribute(key)) rect.setAttribute(key, el.getAttribute(key));
    rect.setAttribute('id', `${IMAGE_PLACEHOLDER}${images.length}`); rect.setAttribute('fill', '#000');
    images.push(href); el.replaceWith(rect);
  }
  const holder = document.createElement('div'); holder.style.cssText = 'position:absolute;left:-10000px;visibility:hidden';
  document.body.append(holder); holder.append(svg);
  for (const el of svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon')) {
    const style = getComputedStyle(el);
    el.setAttribute('fill', style.fill); el.setAttribute('stroke', style.stroke);
  }
  holder.remove();
  return { node: svg, widthMm: w, heightMm: h, complex, images,
    warning: complex ? 'SVG masks or filters were imported as an image to preserve appearance.' : null };
}
export async function rasterAsset(dataUrl, widthMm, heightMm) {
  const image = await imageFrom(dataUrl);
  // Normalize raster input to an embedded PNG so assets are self-contained in Draw.
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  canvas.getContext('2d').drawImage(image,0,0);
  const png = canvas.toDataURL('image/png'), data = png.split(',')[1];
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const id = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('');
  return { id, asset: { mimeType: 'image/png', data, width: canvas.width, height: canvas.height },
    width: widthMm || canvas.width*25.4/96, height: heightMm || (widthMm ? widthMm*canvas.height/canvas.width : canvas.height*25.4/96) };
}
async function rasterize(vector) {
  const svg = vector.node.cloneNode(true);
  const width = Math.max(1,Math.min(4096,Math.ceil(vector.widthMm*144/25.4)));
  const height = Math.max(1,Math.min(4096,Math.ceil(vector.heightMm*144/25.4)));
  svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
  const source = `data:image/svg+xml;base64,${btoa(Array.from(new TextEncoder().encode(new XMLSerializer().serializeToString(svg)), n => String.fromCharCode(n)).join(''))}`;
  const image = await imageFrom(source);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(image,0,0,width,height);
  return canvas.toDataURL('image/png');
}

/** Prepare everything before committing one atomic command per imported file. */
/** `template: true` places the artwork on a new template layer below the active layer (Place > Template). */
export async function importArtwork(scope, state, prepared, name, layerId, { fitArtboard = false, template = false, alive = () => true, offset: at = null, label = null, unwrap = false } = {}) {
  if (state.document.readOnly) throw new Error('This Draw document is read-only. Create a new document to import artwork.');
  const board = activeArtboard(state), offset = at ?? (fitArtboard ? [board.x,board.y] : [board.x+10,board.y+10]);
  const nodes = [], assets = {};
  let dimensions = null;
  let warning = prepared.warning;
  async function addImage(source, width, height) {
    const raster = await rasterAsset(source,width,height);
    dimensions ||= {width:raster.width,height:raster.height};
    assets[raster.id] = raster.asset;
    nodes.push(createNode('image', { name, assetId: raster.id, width: raster.width, height: raster.height,
      ppiEffective: raster.asset.width/raster.width*25.4, transform: [1,0,0,1,...offset] }));
  }
  if (prepared.kind === 'vector' || prepared.vector) {
    const vector = prepareVector(prepared.vector || prepared);
    dimensions = {width:vector.widthMm,height:vector.heightMm};
    warning ||= vector.warning;
    if (vector.complex) await addImage(await rasterize(vector),vector.widthMm,vector.heightMm);
    else {
      let imported;const pending = [];
      const previous = window.paper;
      try {
        scope.activate(); imported = scope.project.importSVG(vector.node, { insert: false, expandShapes: true });
        if (!imported) throw new Error('No supported vector artwork found.');
        const convertColor = c => c && !c.gradient ? '#'+[c.red,c.green,c.blue].map(v => Math.round(v*255).toString(16).padStart(2,'0')).join('') : null;
        const shift = point => [point.x+offset[0],point.y+offset[1]];
        // Gradients keep their stops and vector, in the same space as the path's anchors.
        function gradientPaint(color, item) {
          const g = color.gradient, from = shift(item.localToGlobal(color.origin)), to = shift(item.localToGlobal(color.destination));
          const dx = to[0]-from[0], dy = to[1]-from[1], length = Math.max(Math.hypot(dx,dy),1e-6);
          return { type: g.radial ? 'radial' : 'linear', origin: from, angle: g.radial ? 0 : Math.atan2(-dy,dx)*180/Math.PI+0, length, aspect: 1,
            stops: g.stops.map(stop => ({ offset: Math.min(1,Math.max(0,stop.offset ?? 0)), color: { space:'rgb', values:[stop.color.red,stop.color.green,stop.color.blue] },
              ...(stop.color.alpha < 1 ? { opacity: stop.color.alpha } : {}) })) };
        }
        function paintOf(item, width) {
          const paint = appearance(convertColor(item.fillColor) ?? (item.fillColor?.gradient ? '#000000' : null),convertColor(item.strokeColor) ?? (item.strokeColor?.gradient ? '#000000' : null),width);
          if (paint.fills.length) { paint.fills[0].opacity = item.fillColor.alpha ?? 1; if (item.fillColor.gradient) paint.fills[0].paint = gradientPaint(item.fillColor,item); }
          if (paint.strokes.length) { Object.assign(paint.strokes[0], { opacity: item.strokeColor.alpha ?? 1, cap: item.strokeCap, join: item.strokeJoin, miterLimit: item.miterLimit });
            if (item.strokeColor.gradient) paint.strokes[0].paint = gradientPaint(item.strokeColor,item); }
          return paint;
        }
        const subpathsOf = item => (item.className === 'Path' ? [item] : item.className === 'CompoundPath' ? item.children : item.getItems({ match: i => i.className === 'Path' && i.parent?.className !== 'CompoundPath' || i.className === 'CompoundPath' })
          .flatMap(i => i.className === 'Path' ? [i] : i.children)).map(p => ({ closed: p.closed, segments: p.segments.map(s => {
            const point = p.localToGlobal(s.point), input = p.localToGlobal(s.point.add(s.handleIn)).subtract(point), output = p.localToGlobal(s.point.add(s.handleOut)).subtract(point);
            return { p: shift(point), in: [input.x,input.y], out: [output.x,output.y] };
          }) })).filter(p => p.segments.length);
        function convert(item) {
          // A placeholder rectangle: the image keeps the rectangle's corners (bottom left, top left, top right).
          const index = item.name?.startsWith(IMAGE_PLACEHOLDER) ? Number(item.name.slice(IMAGE_PLACEHOLDER.length)) : -1;
          if (index >= 0 && item.className === 'Path' && item.segments.length === 4) {
            const [bl,tl,tr] = item.segments.slice(0,3).map(s => shift(item.localToGlobal(s.point)));
            const width = Math.hypot(tr[0]-tl[0],tr[1]-tl[1]), height = Math.hypot(bl[0]-tl[0],bl[1]-tl[1]);
            if (width < 1e-6 || height < 1e-6) return null;
            const node = createNode('image', { name: item.name === `${IMAGE_PLACEHOLDER}${index}` ? name : item.name, assetId: 'pending', width, height, ppiEffective: 96,
              transform: [(tr[0]-tl[0])/width,(tr[1]-tl[1])/width,(bl[0]-tl[0])/height,(bl[1]-tl[1])/height,tl[0],tl[1]] });
            pending.push({ node, source: vector.images[index] });
            return node;
          }
          if (item.className === 'PointText') {
            // SVG text becomes point text at its baseline; Draw shapes it with the installed font when edited or sent.
            const m = item.globalMatrix, weight = String(item.fontWeight ?? 'normal');
            const numeric = Number.parseInt(weight,10), italic = /italic/.test(weight);
            const values = { text: item.content || ' ', fontFamily: String(item.fontFamily || 'Arial').split(',')[0].replace(/["']/g,'').trim() || 'Arial',
              fontSize: Math.min(10000,Math.max(.1,item.fontSize/PT_TO_MM)), leading: Math.min(10000,Math.max(.1,(item.leading || item.fontSize*1.2)/PT_TO_MM)),
              fontWeight: Number.isFinite(numeric) ? (numeric >= 1 && numeric <= 1000 ? numeric : 'normal') : /bold/.test(weight) ? 'bold' : 'normal', fontStyle: italic ? 'italic' : 'normal',
              alignment: { center: 'center', right: 'right' }[item.justification] ?? 'left' };
            if (!item.content?.trim()) return null;
            const node = pointText([0,0], values, { fill: convertColor(item.fillColor) ?? (item.fillColor?.gradient ? '#000000' : null), stroke: convertColor(item.strokeColor), strokeWidth: item.strokeWidth });
            return { ...node, name: item.name || name, opacity: item.opacity, transform: [m.a,m.b,m.c,m.d,m.tx+offset[0],m.ty+offset[1]] };
          }
          if (item.className === 'Path' || item.className === 'CompoundPath') {
            const m = item.globalMatrix, scale = Math.sqrt(Math.abs(m.a*m.d-m.b*m.c));
            return createNode('path', { name: item.name || name, subpaths: subpathsOf(item), fillRule: item.fillRule || 'nonzero', opacity: item.opacity,
              appearance: paintOf(item,item.strokeWidth*scale) });
          }
          // Paper leaves clipped primitives as Shapes; they become paths like the rest (inserted beside the
          // shape while they are read, so the parents' transforms still apply).
          if (item.className === 'Shape') { const path = item.toPath(true); path.clipMask = false; path.name = item.name; try { return convert(path); } finally { path.remove(); } }
          if (item.className === 'Raster') return null;
          // A clipped group: its clipping path (one or more paths) goes on top as the mask, unpainted.
          // The root's own mask is just the SVG viewport, so it is not kept as a clipping group.
          const mask = item === imported ? null : (item.children || []).find(child => child.clipMask);
          const children = (item.children || []).filter(child => !child.clipMask).map(convert).filter(Boolean);
          if (mask) {
            const shape = mask.className === 'Shape' ? mask.toPath(true) : null, subpaths = subpathsOf(shape ?? mask); shape?.remove();
            if (subpaths.length && children.length) return createNode('group', { name: item.name || name, opacity: item.opacity, clip: true,
              children: [...children, createNode('path', { name: 'Clipping Path', subpaths, fillRule: mask.fillRule || 'nonzero', appearance: appearance(null,null) })] });
          }
          return children.length ? createNode('group', { name: item.name || name, opacity: item.opacity, children }) : null;
        }
        const converted = convert(imported);
        if (!converted) throw new Error('No supported vector paths found.');
        // `unwrap`: the SVG root is only a container (Paste from Cut), so its children are inserted as they are.
        if (unwrap && converted.type === 'group') nodes.push(...converted.children); else nodes.push(converted);
      } finally { imported?.remove(); previous.activate(); }
      // Embedded images are normalised to PNG assets, as Place does, once Paper is back on its own scope.
      const ready = new Map();
      for (const { node, source } of pending) { const raster = await rasterAsset(source); assets[raster.id] = raster.asset; ready.set(node.id, { assetId: raster.id, ppiEffective: raster.asset.width/node.width*25.4 }); }
      // createNode copies its children, so the image nodes are found again by id in the finished tree.
      const fill = list => list.forEach(node => { if (ready.has(node.id)) Object.assign(node, ready.get(node.id)); if (node.children) fill(node.children); });
      fill(nodes);
    }
  }
  if (prepared.kind === 'image' || prepared.rasterDataUrl) await addImage(prepared.rasterDataUrl || prepared.dataUrl,prepared.widthMm,prepared.heightMm);
  if (!nodes.length) throw new Error('No supported artwork found.');
  if (!alive()) throw new Error('The target Draw document was closed or replaced.');
  const layer = state.document.getNode(layerId);
  if (!template && (!layer || layer.type !== 'layer' || !state.document.isEditable(layerId))) throw new Error('Select a visible, unlocked layer before importing.');
  state.history.transaction(label ?? `Import ${name}`, () => {
    if (fitArtboard && dimensions?.width > 0 && dimensions?.height > 0) state.history.execute(updateArtboard(board.id,dimensions));
    if (Object.keys(assets).length) state.history.execute(updateDocument({ assets: { ...state.document.data.assets, ...assets } }));
    if (template) templateLayerCommands(state.document, layer ? layerId : state.document.data.layers.at(-1).id, { name, nodes }).commands.forEach(command => state.history.execute(command));
    // One edit for all of them: a large import walks the layer once.
    else state.history.execute(insertNodes(nodes.map(node => [layerId,node])));
  });
  return { ids: nodes.map(node => node.id), warning };
}
