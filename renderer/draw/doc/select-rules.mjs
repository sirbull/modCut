/**
 * Pure rules for the Select menu, Magic Wand and saved selections (D3.5). Objects are the editable,
 * visible nodes a click would select: top-level objects of the layers, or the children of the isolated
 * group. "Same" and Magic Wand compare painted leaves anywhere (paths, shapes and text).
 */
import { paintHex } from './paint.mjs';
import { gradientHex, isGradient } from './gradient.mjs';

const visible = (list) => (list ?? []).filter((e) => !e.hidden);
const LEAVES = new Set(['path', 'shape', 'text', 'image']);
/** The objects a click selects, in stacking order (bottom first). */
export function selectableObjects(doc, isolation = null) {
  const parents = isolation ? [doc.getNode(isolation)] : doc.data.layers;
  return parents.filter(Boolean).flatMap((p) => p.children).filter((n) => doc.isEditable(n.id)).map((n) => n.id);
}
/** Every editable leaf object, in stacking order. */
export function leaves(doc) {
  return doc.descendants(null).filter((n) => LEAVES.has(n.type) && doc.isEditable(n.id)).map((n) => n.id);
}
export function inverseSelection(doc, selected, isolation = null) {
  const chosen = new Set(selected);
  return selectableObjects(doc, isolation).filter((id) => !chosen.has(id));
}
const hex = (entry) => entry ? paintHex(entry)?.toUpperCase() ?? (isGradient(entry.paint) ? gradientHex(entry.paint) : null) : null;
const rgb = (h) => h ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null;
/** Within `tolerance` (0 to 255 per channel); `null` colours match only each other. */
function near(a, b, tolerance) {
  if (!a || !b) return a === b;
  const [x, y] = [rgb(a), rgb(b)];
  return x.every((v, i) => Math.abs(v - y[i]) <= tolerance);
}
export const SAME_MODES = Object.freeze({
  appearance: 'Appearance', 'fill-stroke': 'Fill & Stroke', 'fill-color': 'Fill Color', opacity: 'Opacity',
  'stroke-color': 'Stroke Color', 'stroke-weight': 'Stroke Weight', shape: 'Shape', text: 'Text',
});
/** What `mode` compares on a node. */
function key(node, mode) {
  const fill = hex(visible(node.appearance?.fills)[0]), strokeEntry = visible(node.appearance?.strokes)[0], stroke = hex(strokeEntry);
  switch (mode) {
    case 'fill-color': return fill;
    case 'stroke-color': return stroke;
    case 'stroke-weight': return strokeEntry ? Math.round((strokeEntry.width ?? 0) * 1000) / 1000 : null;
    case 'fill-stroke': return `${fill}|${stroke}`;
    case 'opacity': return Math.round((node.opacity ?? 1) * 1000);
    case 'appearance': return JSON.stringify([node.appearance ?? null, node.opacity ?? 1, node.blendMode ?? 'normal']);
    case 'shape': return node.type === 'shape' ? `shape:${node.shape}` : node.type;
    case 'text': return node.type === 'text' ? JSON.stringify([node.character?.fontFamily, node.character?.fontSize, node.character?.fontWeight, node.character?.fontStyle]) : null;
    default: throw new Error(`Unknown Select > Same mode: ${mode}`);
  }
}
/** Select > Same: every leaf matching any of the reference leaves in `mode`. */
export function sameAs(doc, referenceIds, mode) {
  const refs = referenceIds.flatMap((id) => { const n = doc.getNode(id); return n?.children ? doc.descendants(id).filter((c) => LEAVES.has(c.type)) : n ? [n] : []; });
  if (!refs.length) throw new Error('Select an object to match first.');
  if (mode === 'text' && !refs.some((n) => n.type === 'text')) throw new Error('Select a text object to match.');
  const wanted = new Set(refs.map((n) => key(n, mode)).filter((k) => k !== null && k !== 'null|null'));
  return leaves(doc).filter((id) => wanted.has(key(doc.getNode(id), mode)));
}
/** Magic Wand: leaves whose fill (and, when asked, stroke colour, stroke weight, opacity) is close to `id`'s. */
export function magicWand(doc, id, { fill = true, fillTolerance = 32, stroke = false, strokeTolerance = 32, weight = false, weightTolerance = .5, opacity = false, opacityTolerance = 5 } = {}) {
  const ref = doc.getNode(id);
  if (!ref) return [];
  const measure = (n) => ({ fill: hex(visible(n.appearance?.fills)[0]), stroke: hex(visible(n.appearance?.strokes)[0]), weight: visible(n.appearance?.strokes)[0]?.width ?? 0, opacity: (n.opacity ?? 1) * 100 });
  const r = measure(ref);
  return leaves(doc).filter((other) => {
    const m = measure(doc.getNode(other));
    return (!fill || near(r.fill, m.fill, fillTolerance)) && (!stroke || near(r.stroke, m.stroke, strokeTolerance))
      && (!weight || Math.abs(r.weight - m.weight) <= weightTolerance) && (!opacity || Math.abs(r.opacity - m.opacity) <= opacityTolerance);
  });
}
export const OBJECT_KINDS = Object.freeze({
  'same-layers': 'All on Same Layers', 'stray-points': 'Stray Points', 'open-paths': 'Open Paths',
  'clipping-masks': 'Clipping Masks', text: 'Text Objects', images: 'Raster Images',
});
/** Select > Object. */
export function objectsOfKind(doc, kind, selected = []) {
  const all = doc.descendants(null).filter((n) => n.type !== 'layer' && doc.isEditable(n.id));
  if (kind === 'same-layers') {
    const layers = new Set(selected.map((id) => doc.ancestors(id).find((a) => a.type === 'layer')?.id ?? (doc.getNode(id)?.type === 'layer' ? id : null)).filter(Boolean));
    if (!layers.size) throw new Error('Select an object first.');
    return [...layers].flatMap((l) => doc.getNode(l).children).filter((n) => doc.isEditable(n.id)).map((n) => n.id);
  }
  const match = {
    'stray-points': (n) => n.type === 'path' && n.subpaths.length && n.subpaths.every((s) => s.segments.length === 1),
    'open-paths': (n) => n.type === 'path' && n.subpaths.some((s) => !s.closed && s.segments.length > 1),
    'clipping-masks': (n) => { const parent = doc.getNode(doc.locate(n.id)?.parentId); return parent?.type === 'group' && parent.clip && parent.children.at(-1).id === n.id; },
    text: (n) => n.type === 'text', images: (n) => n.type === 'image',
  }[kind];
  if (!match) throw new Error(`Unknown Select > Object kind: ${kind}`);
  return all.filter(match).map((n) => n.id);
}
/** Next object above (+1) or below (-1) each selected one, among its siblings. */
export function stackNeighbour(doc, selected, direction) {
  return [...new Set(selected.map((id) => {
    const { parentId, index } = doc.locate(id) ?? {}, siblings = parentId === undefined ? [] : parentId === null ? doc.data.layers : doc.getNode(parentId).children;
    for (let i = index + direction; i >= 0 && i < siblings.length; i += direction) if (doc.isEditable(siblings[i].id)) return siblings[i].id;
    return id;
  }))];
}
/** Saved selections live in the document settings: `[{ name, ids }]`. */
export function saveSelection(settings, name, ids) {
  const label = String(name ?? '').trim();
  if (!label) throw new Error('Enter a name for the selection.');
  if (!ids.length) throw new Error('Select objects to save.');
  const list = (settings.savedSelections ?? []).filter((s) => s.name !== label);
  return { ...settings, savedSelections: [...list, { name: label, ids: [...ids] }] };
}
export function savedSelection(doc, name) {
  const entry = (doc.data.settings.savedSelections ?? []).find((s) => s.name === name);
  if (!entry) throw new Error('That saved selection no longer exists.');
  return entry.ids.filter((id) => doc.getNode(id) && doc.isEditable(id));
}
/** Even-odd point in polygon (Lasso): `polygon` is a list of [x, y]. */
export function insidePolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
