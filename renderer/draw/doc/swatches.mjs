/**
 * Pure swatch rules: the default library, document swatches and the Recent Colors list.
 * A global swatch is remembered in each fill or stroke it paints (`paint.swatch`), so editing the swatch
 * recolors all of them. A gradient swatch holds a gradient's type, stops and angle (no `hex`).
 */
import { normalizeHex } from './color.mjs';
import { solidPaint } from '../geometry.mjs';

let nextId = 0;
const swatch = (name, hex, group) => Object.freeze({ id: `default-${++nextId}`, name, hex, group });
// Illustrator's basic library, without Registration, plus the four colors Cut maps to layers by default.
export const SWATCH_GROUPS = Object.freeze(['Basic', 'Grays', 'Laser layers', 'Custom']);
export const DEFAULT_SWATCHES = Object.freeze([
  swatch('White', '#FFFFFF', 'Basic'), swatch('Black', '#000000', 'Basic'), swatch('Red', '#ED1C24', 'Basic'),
  swatch('Yellow', '#FFF200', 'Basic'), swatch('Green', '#00A651', 'Basic'), swatch('Cyan', '#00AEEF', 'Basic'),
  swatch('Blue', '#2E3192', 'Basic'), swatch('Magenta', '#EC008C', 'Basic'), swatch('Orange', '#F7941D', 'Basic'),
  swatch('Brown', '#8B5E3C', 'Basic'), swatch('Purple', '#662D91', 'Basic'), swatch('Teal', '#00A99D', 'Basic'),
  ...[90, 80, 70, 60, 50, 40, 30, 20, 10].map((k) => {
    const v = Math.round(255 * (1 - k / 100)).toString(16).padStart(2, '0').toUpperCase();
    return swatch(`K=${k}`, `#${v}${v}${v}`, 'Grays');
  }),
  swatch('Laser red', '#FF0000', 'Laser layers'), swatch('Laser green', '#00AA00', 'Laser layers'),
  swatch('Laser blue', '#0000FF', 'Laser layers'), swatch('Laser black', '#000000', 'Laser layers'),
]);

/** A document without its own swatches shows the default library. */
export function documentSwatches(data) {
  return data.swatches?.length ? data.swatches : DEFAULT_SWATCHES;
}
export function addSwatch(data, color, name, makeId, { global = false } = {}) {
  if (!color) throw new Error('Choose a color before adding a swatch.');
  const list = documentSwatches(data);
  // A gradient paint makes a gradient swatch; anything else is a hex colour.
  if (typeof color === 'object') {
    const gradient = { type: color.type, stops: structuredClone(color.stops), angle: color.angle ?? 0 };
    const created = { id: makeId(), name: String(name || `${color.type === 'radial' ? 'Radial' : 'Linear'} gradient`).trim(), gradient, group: 'Custom' };
    return { swatches: [...list.map((s) => ({ ...s })), created], created };
  }
  const value = normalizeHex(color);
  const created = { id: makeId(), name: String(name || value).trim() || value, hex: value, group: 'Custom', ...(global ? { global: true } : {}) };
  return { swatches: [...list.map((s) => ({ ...s })), created], created };
}
/** The solid paint a swatch applies; a global swatch is remembered in the paint. */
export function swatchPaint(swatch) {
  return { ...solidPaint(swatch.hex), ...(swatch.global ? { swatch: swatch.id } : {}) };
}
/**
 * Appearance patches for every node painted with global swatch `id`: recolored to `hex`, or with the
 * link removed (colour kept) when `hex` is null. Returns [[nodeId, appearance], ...].
 */
export function linkedPaints(doc, id, hex) {
  const out = [];
  for (const node of doc.descendants(null)) {
    if (!node.appearance) continue;
    let changed = false;
    const relink = (entry) => {
      if (entry.paint?.swatch !== id) return entry;
      changed = true;
      if (hex) return { ...entry, paint: { ...solidPaint(normalizeHex(hex)), swatch: id } };
      const { swatch, ...paint } = entry.paint; return { ...entry, paint };
    };
    const appearance = { ...node.appearance, fills: node.appearance.fills.map(relink), strokes: node.appearance.strokes.map(relink) };
    if (changed) out.push([node.id, appearance]);
  }
  return out;
}
export function removeSwatch(data, id) {
  const list = documentSwatches(data);
  if (!list.some((s) => s.id === id)) throw new Error('Choose a swatch to delete.');
  // Deleting the last swatch brings the default library back, like a new document.
  return list.filter((s) => s.id !== id).map((s) => ({ ...s }));
}
export function editSwatch(data, id, { name, hex, global }) {
  const list = documentSwatches(data), value = hex === undefined || hex === null ? undefined : normalizeHex(hex);
  if (!list.some((s) => s.id === id)) throw new Error('Choose a swatch to edit.');
  return list.map((s) => s.id === id ? { ...s, ...(name !== undefined ? { name: String(name).trim() || s.name } : {}), ...(value && !s.gradient ? { hex: value } : {}),
    ...(global !== undefined && !s.gradient ? { global: !!global } : {}) } : { ...s });
}
export function groupSwatches(list) {
  const groups = new Map();
  for (const s of list) { const key = SWATCH_GROUPS.includes(s.group) ? s.group : 'Custom'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(s); }
  return SWATCH_GROUPS.filter((g) => groups.has(g)).map((name) => ({ name, swatches: groups.get(name) }));
}
export const RECENT_LIMIT = 10;
/** Most recent first, without duplicates. */
export function rememberColor(list = [], hex, limit = RECENT_LIMIT) {
  let value;
  try { value = normalizeHex(hex); } catch { return list; }
  return [value, ...list.filter((c) => c !== value)].slice(0, limit);
}
