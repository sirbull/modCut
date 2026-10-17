/**
 * Document Info (D3.8): what a document contains, as Illustrator's Document Info panel lists it, with
 * what matters before Send to Cut. Pure; `scope` is 'document' or a list of selected ids.
 */
import { textContent } from './text.mjs';
import { isOutputNode } from './layers.mjs';

const TYPE_NAMES = { path: 'Paths', shape: 'Shapes', text: 'Text objects', image: 'Images', group: 'Groups' };
export function documentInfo(doc, ids = null) {
  const roots = ids ? ids.map((id) => doc.getNode(id)).filter(Boolean) : doc.data.layers;
  const nodes = roots.flatMap((n) => [n, ...doc.descendants(n.id)]).filter((n) => n.type !== 'layer');
  const counts = {}, fonts = new Map(), images = [];
  let anchors = 0, openPaths = 0, clipping = 0, hidden = 0, effects = 0;
  for (const n of nodes) {
    counts[n.type] = (counts[n.type] ?? 0) + 1;
    if (!isOutputNode(doc, n.id)) hidden++;
    if (n.type === 'path') { anchors += n.subpaths.reduce((sum, s) => sum + s.segments.length, 0); if (n.subpaths.some((s) => !s.closed)) openPaths++; }
    if (n.type === 'group' && n.clip) clipping++;
    if ((n.appearance?.effects ?? []).some((e) => !e.hidden)) effects++;
    if (n.type === 'text') {
      // Every face the text uses (its own and its styled runs), counted once per text object.
      const used = new Map();
      for (const c of [n.character, ...n.content.runs.filter((r) => r.character).map((r) => ({ ...n.character, ...r.character }))]) {
        const face = { family: c?.fontFamily ?? 'Arial', weight: c?.fontWeight ?? 'normal', style: c?.fontStyle ?? 'normal', source: n.character?.fontSource ?? 'system' };
        used.set(`${face.family}|${face.weight}|${face.style}`, face);
      }
      for (const [key, face] of used) fonts.set(key, { ...face, count: (fonts.get(key)?.count ?? 0) + 1 });
      if (!textContent(n).trim()) counts.emptyText = (counts.emptyText ?? 0) + 1;
    }
    if (n.type === 'image') {
      const asset = doc.data.assets[n.assetId];
      images.push({ id: n.id, name: n.name || 'Image', pixels: asset ? `${asset.width} × ${asset.height}` : '?', ppi: Math.round(n.ppiEffective ?? 0), reference: !!n.reference, cropped: !!n.crop });
    }
  }
  return {
    artboards: doc.data.artboards.length, layers: doc.data.layers.length,
    objects: Object.entries(TYPE_NAMES).map(([type, label]) => ({ label, count: counts[type] ?? 0 })).filter((o) => o.count),
    anchors, openPaths, clipping, hidden, effects, emptyText: counts.emptyText ?? 0,
    fonts: [...fonts.values()].sort((a, b) => a.family.localeCompare(b.family)), images,
    swatches: doc.data.swatches?.length ?? 0,
  };
}
