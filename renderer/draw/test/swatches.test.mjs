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

test('global swatches stay linked: editing recolors what they paint, deleting unlinks', async () => {
  const { DrawDocument } = await import('../doc/document.mjs'), { History } = await import('../doc/history.mjs');
  const { createNode } = await import('../doc/schema.mjs'), { insertNode, updateNode } = await import('../doc/commands.mjs');
  const { appearance } = await import('../geometry.mjs'), { changePaint, paintHex } = await import('../doc/paint.mjs');
  const { swatchPaint, linkedPaints } = await import('../doc/swatches.mjs');
  const doc = new DrawDocument(), history = new History(doc), layer = doc.data.layers[0].id;
  const { created } = addSwatch({ swatches: [] }, '#112233', 'Brand', () => 'g1', { global: true });
  assert.equal(created.global, true); assert.equal(swatchPaint(created).swatch, 'g1');
  const a = createNode('path', { appearance: appearance('#FFFFFF', null) }), b = createNode('path', { appearance: appearance('#FFFFFF', null) });
  history.execute(insertNode(layer, a)); history.execute(insertNode(layer, b));
  history.execute(updateNode(a.id, { appearance: changePaint(doc.getNode(a.id).appearance, 'fill', created.hex, {}, 'g1') }));
  const recolor = linkedPaints(doc, 'g1', '#AA0000');
  assert.deepEqual(recolor.map(([id]) => id), [a.id], 'Only the linked object changes');
  assert.equal(paintHex(recolor[0][1].fills[0]), '#aa0000'); assert.equal(recolor[0][1].fills[0].paint.swatch, 'g1');
  const unlinked = linkedPaints(doc, 'g1', null)[0][1].fills[0].paint;
  assert.equal(unlinked.swatch, undefined); assert.equal(paintHex({ paint: unlinked }), '#112233', 'Deleting keeps the colour');
});

test('a gradient paint makes a gradient swatch, and Global applies only to colour swatches', () => {
  const g = { type: 'radial', stops: [{ offset: 0, color: { space: 'rgb', values: [1, 1, 1] } }, { offset: 1, color: { space: 'rgb', values: [0, 0, 0] } }], origin: [0, 0], angle: 0, length: 5, aspect: 1 };
  const { swatches, created } = addSwatch({ swatches: [] }, g, '', () => 'r1', { global: true });
  assert.equal(created.hex, undefined); assert.equal(created.gradient.type, 'radial'); assert.equal(created.gradient.stops.length, 2); assert.equal(created.global, undefined);
  assert.equal(created.name, 'Radial gradient');
  const edited = editSwatch({ swatches }, 'r1', { name: 'Glow', hex: '#FF0000', global: true }).find((s) => s.id === 'r1');
  assert.equal(edited.name, 'Glow'); assert.equal(edited.hex, undefined); assert.equal(edited.global, undefined);
});
