/**
 * Pure Appearance panel rules on an appearance { fills, strokes, effects }. Fills draw first, then
 * strokes; within each list later entries draw on top. Every function returns a new appearance.
 */
import { appearance as makeAppearance } from '../geometry.mjs';

export const KINDS = Object.freeze(['fills', 'strokes']);
const kindOf = (kind) => { if (!KINDS.includes(kind)) throw new Error(`Unknown appearance kind: ${kind}`); return kind; };
const copy = (a) => structuredClone({ fills: a?.fills ?? [], strokes: a?.strokes ?? [], effects: a?.effects ?? [] });
const entryAt = (a, kind, index) => { const e = a[kindOf(kind)][index]; if (!e) throw new Error('Choose an appearance entry.'); return e; };

/** Panel rows top to bottom: the entry drawn last comes first, so strokes (newest first) then fills. */
export function appearanceRows(a) {
  const rows = [];
  for (const kind of ['strokes', 'fills']) (a?.[kind] ?? []).forEach((entry, index) => rows.push({ kind, index, entry }));
  return rows.sort((x, y) => (x.kind === y.kind ? y.index - x.index : x.kind === 'strokes' ? -1 : 1));
}
/** Add New Fill / Add New Stroke: a copy of the topmost entry of that kind, or a sensible default, on top. */
export function addEntry(a, kind, { color = kind === 'fills' ? '#FFFFFF' : '#071411', width = .5 } = {}) {
  const next = copy(a), list = next[kindOf(kind)];
  const base = list.at(-1) ? structuredClone(list.at(-1)) : makeAppearance(kind === 'fills' ? color : null, kind === 'strokes' ? color : null, width)[kind][0];
  delete base.hidden; list.push(base);
  return { appearance: next, index: list.length - 1 };
}
export function duplicateEntry(a, kind, index) {
  const next = copy(a), list = next[kindOf(kind)];
  list.splice(index + 1, 0, structuredClone(entryAt(next, kind, index)));
  return { appearance: next, index: index + 1 };
}
export function removeEntry(a, kind, index) {
  const next = copy(a); entryAt(next, kind, index); next[kind].splice(index, 1); return next;
}
export function toggleEntry(a, kind, index) {
  const next = copy(a), entry = entryAt(next, kind, index);
  if (entry.hidden) delete entry.hidden; else entry.hidden = true;
  return next;
}
/** Move within the same kind; `to` is clamped to the list. */
export function moveEntry(a, kind, from, to) {
  const next = copy(a), list = next[kindOf(kind)]; entryAt(next, kind, from);
  const target = Math.max(0, Math.min(list.length - 1, to));
  const [entry] = list.splice(from, 1); list.splice(target, 0, entry);
  return { appearance: next, index: target };
}
export function patchEntry(a, kind, index, patch) {
  const next = copy(a); Object.assign(entryAt(next, kind, index), structuredClone(patch)); return next;
}
/** Clear Appearance: no fill and no stroke, as in Illustrator. */
export function clearAppearance(a) { return { ...copy(a), fills: [], strokes: [] }; }
export function visibleCount(a, kind) { return (a?.[kind] ?? []).filter((e) => !e.hidden).length; }
