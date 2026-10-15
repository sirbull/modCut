import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SWATCHES, addSwatch, documentSwatches, editSwatch, groupSwatches, rememberColor, removeSwatch } from '../doc/swatches.mjs';

test('a new document shows the default library, including the laser layer colors', () => {
  const list = documentSwatches({ swatches: [] });
  assert.equal(list, DEFAULT_SWATCHES);
  assert.deepEqual(groupSwatches(list).map((g) => g.name), ['Basic', 'Grays', 'Laser layers']);
  assert.deepEqual(groupSwatches(list).find((g) => g.name === 'Laser layers').swatches.map((s) => s.hex), ['#FF0000', '#00AA00', '#0000FF', '#000000']);
  assert.equal(new Set(list.map((s) => s.id)).size, list.length);
});

test('adding, editing and deleting swatches materialises the library in the document', () => {
  let ids = 0;
  const { swatches, created } = addSwatch({ swatches: [] }, '#12ab34', '', () => `s${++ids}`);
  assert.equal(swatches.length, DEFAULT_SWATCHES.length + 1);
  assert.deepEqual(created, { id: 's1', name: '#12AB34', hex: '#12AB34', group: 'Custom' });
  assert.equal(groupSwatches(swatches).at(-1).name, 'Custom');
  const renamed = editSwatch({ swatches }, 's1', { name: ' Logo green ', hex: '#00ff00' });
  assert.deepEqual(renamed.at(-1), { id: 's1', name: 'Logo green', hex: '#00FF00', group: 'Custom' });
  const fewer = removeSwatch({ swatches: renamed }, DEFAULT_SWATCHES[0].id);
  assert.equal(fewer.length, swatches.length - 1);
  assert.throws(() => addSwatch({ swatches: [] }, null, '', () => 'x'), /Choose a color/);
  assert.throws(() => editSwatch({ swatches }, 's1', { hex: 'nope' }), /hex color/);
  assert.throws(() => removeSwatch({ swatches }, 'missing'), /Choose a swatch/);
});

test('Recent Colors keeps ten, newest first, without duplicates', () => {
  let list = [];
  for (let i = 0; i < 12; i++) list = rememberColor(list, `#0000${String(i).padStart(2, '0')}`);
  assert.equal(list.length, 10); assert.equal(list[0], '#000011');
  list = rememberColor(list, '#000005'); assert.equal(list[0], '#000005'); assert.equal(list.filter((c) => c === '#000005').length, 1);
  assert.equal(rememberColor(list, null), list); assert.equal(rememberColor(list, 'nope'), list);
});
