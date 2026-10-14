import { parseSVG } from '../svgimport.js';
import { createNode } from './doc/schema.mjs';
import { insertNode, updateDocument, updateArtboard } from './doc/commands.mjs';
import { appearance } from './geometry.mjs';

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
  const complex = !!svg.querySelector('text,image,clipPath,mask,linearGradient,radialGradient,filter');
  const holder = document.createElement('div'); holder.style.cssText = 'position:absolute;left:-10000px;visibility:hidden';
  document.body.append(holder); holder.append(svg);
  for (const el of svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon')) {
    const style = getComputedStyle(el);
    el.setAttribute('fill', style.fill); el.setAttribute('stroke', style.stroke);
  }
  holder.remove();
  return { node: svg, widthMm: w, heightMm: h, complex,
    warning: complex ? 'SVG text, clipping, gradients or effects were imported as an image to preserve appearance.' : null };
}
async function rasterAsset(dataUrl, widthMm, heightMm) {
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
export async function importArtwork(scope, state, prepared, name, layerId, { fitArtboard = false, alive = () => true } = {}) {
  if (state.document.readOnly) throw new Error('This Draw document is read-only. Create a new document to import artwork.');
  const board = state.document.data.artboards[0], offset = fitArtboard ? [board.x,board.y] : [board.x+10,board.y+10];
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
      let imported;
      const previous = window.paper;
      try {
        scope.activate(); imported = scope.project.importSVG(vector.node, { insert: false, expandShapes: true });
        if (!imported) throw new Error('No supported vector artwork found.');
        const convertColor = c => c ? '#'+[c.red,c.green,c.blue].map(v => Math.round(v*255).toString(16).padStart(2,'0')).join('') : null;
        function convert(item) {
          if (item.className === 'Path' || item.className === 'CompoundPath') {
            const paths = item.className === 'Path' ? [item] : item.children;
            const subpaths = paths.map(p => ({ closed: p.closed, segments: p.segments.map(s => {
              const point = p.localToGlobal(s.point), input = p.localToGlobal(s.point.add(s.handleIn)).subtract(point), output = p.localToGlobal(s.point.add(s.handleOut)).subtract(point);
              return { p: [point.x+offset[0],point.y+offset[1]], in: [input.x,input.y], out: [output.x,output.y] };
            }) }));
            const m = item.globalMatrix, scale = Math.sqrt(Math.abs(m.a*m.d-m.b*m.c));
            const paint = appearance(convertColor(item.fillColor),convertColor(item.strokeColor),item.strokeWidth*scale);
            if (paint.fills.length) paint.fills[0].opacity = item.fillColor.alpha;
            if (paint.strokes.length) Object.assign(paint.strokes[0], { opacity: item.strokeColor.alpha,
              cap: item.strokeCap, join: item.strokeJoin, miterLimit: item.miterLimit });
            return createNode('path', { name: item.name || name, subpaths, fillRule: item.fillRule || 'nonzero', opacity: item.opacity,
              appearance: paint });
          }
          const children = (item.children || []).filter(child => !child.clipMask).map(convert).filter(Boolean);
          return children.length ? createNode('group', { name: item.name || name, opacity: item.opacity, children }) : null;
        }
        const converted = convert(imported);
        if (!converted) throw new Error('No supported vector paths found.');
        nodes.push(converted);
      } finally { imported?.remove(); previous.activate(); }
    }
  }
  if (prepared.kind === 'image' || prepared.rasterDataUrl) await addImage(prepared.rasterDataUrl || prepared.dataUrl,prepared.widthMm,prepared.heightMm);
  if (!nodes.length) throw new Error('No supported artwork found.');
  if (!alive()) throw new Error('The target Draw document was closed or replaced.');
  const layer = state.document.getNode(layerId);
  if (!layer || layer.type !== 'layer' || !state.document.isEditable(layerId)) throw new Error('Select a visible, unlocked layer before importing.');
  state.history.transaction(`Import ${name}`, () => {
    if (fitArtboard && dimensions?.width > 0 && dimensions?.height > 0) state.history.execute(updateArtboard(board.id,dimensions));
    if (Object.keys(assets).length) state.history.execute(updateDocument({ assets: { ...state.document.data.assets, ...assets } }));
    for (const node of nodes) state.history.execute(insertNode(layerId,node));
  });
  return { ids: nodes.map(node => node.id), warning };
}
