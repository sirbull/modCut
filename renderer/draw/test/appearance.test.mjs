import test from 'node:test';
import assert from 'node:assert/strict';
import { appearance } from '../geometry.mjs';
import { addEntry, appearanceRows, clearAppearance, duplicateEntry, moveEntry, patchEntry, removeEntry, toggleEntry, visibleCount } from '../doc/appearance.mjs';

const base = () => appearance('#FF0000', '#000000', 1);
const hexOf = (e) => e.paint.color.values.map((v) => Math.round(v * 255)).join(',');

test('rows list strokes above fills, newest first, like the Appearance panel', () => {
  let a = addEntry(base(), 'strokes', {}).appearance;
  a = addEntry(a, 'fills', {}).appearance;
  assert.deepEqual(appearanceRows(a).map((r) => `${r.kind}:${r.index}`), ['strokes:1', 'strokes:0', 'fills:1', 'fills:0']);
});

test('add copies the top entry; duplicate inserts above; remove and clear', () => {
  const original = base();
  const { appearance: added, index } = addEntry(original, 'strokes', {});
  assert.equal(index, 1); assert.equal(added.strokes.length, 2); assert.equal(original.strokes.length, 1, 'input untouched');
  assert.deepEqual(added.strokes[1], added.strokes[0]);
  const fresh = addEntry({ fills: [], strokes: [], effects: [] }, 'fills', { color: '#00FF00' }).appearance;
  assert.equal(hexOf(fresh.fills[0]), '0,255,0');
  const dup = duplicateEntry(added, 'strokes', 0); assert.equal(dup.appearance.strokes.length, 3); assert.equal(dup.index, 1);
  assert.equal(removeEntry(dup.appearance, 'strokes', 2).strokes.length, 2);
  const cleared = clearAppearance(dup.appearance); assert.deepEqual([cleared.fills, cleared.strokes], [[], []]);
  assert.throws(() => removeEntry(base(), 'strokes', 5), /Choose an appearance entry/);
  assert.throws(() => addEntry(base(), 'effects'), /Unknown appearance kind/);
});

test('hide, move and patch single entries', () => {
  let a = addEntry(base(), 'strokes', {}).appearance;
  a = patchEntry(a, 'strokes', 1, { width: 4 });
  assert.deepEqual(a.strokes.map((s) => s.width), [1, 4]);
  const moved = moveEntry(a, 'strokes', 1, 0); assert.deepEqual(moved.appearance.strokes.map((s) => s.width), [4, 1]); assert.equal(moved.index, 0);
  assert.equal(moveEntry(a, 'strokes', 0, 99).index, 1, 'clamped');
  const hidden = toggleEntry(a, 'strokes', 0); assert.equal(hidden.strokes[0].hidden, true); assert.equal(visibleCount(hidden, 'strokes'), 1);
  assert.equal(toggleEntry(hidden, 'strokes', 0).strokes[0].hidden, undefined, 'toggling again shows it');
  assert.equal(addEntry(hidden, 'strokes', {}).appearance.strokes.at(-1).hidden, undefined, 'new entries are visible');
});
