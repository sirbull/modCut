/** Pure swatch rules: the default library, document swatches and the Recent Colors list. */
import { normalizeHex } from './color.mjs';

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
export function addSwatch(data, hex, name, makeId) {
  if (!hex) throw new Error('Choose a color before adding a swatch.');
  const value = normalizeHex(hex), list = documentSwatches(data);
  const created = { id: makeId(), name: String(name || value).trim() || value, hex: value, group: 'Custom' };
  return { swatches: [...list.map((s) => ({ ...s })), created], created };
}
export function removeSwatch(data, id) {
  const list = documentSwatches(data);
  if (!list.some((s) => s.id === id)) throw new Error('Choose a swatch to delete.');
  // Deleting the last swatch brings the default library back, like a new document.
  return list.filter((s) => s.id !== id).map((s) => ({ ...s }));
}
export function editSwatch(data, id, { name, hex }) {
  const list = documentSwatches(data), value = hex === undefined ? undefined : normalizeHex(hex);
  if (!list.some((s) => s.id === id)) throw new Error('Choose a swatch to edit.');
  return list.map((s) => s.id === id ? { ...s, ...(name !== undefined ? { name: String(name).trim() || s.name } : {}), ...(value ? { hex: value } : {}) } : { ...s });
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
