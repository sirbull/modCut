import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { createNode } from '../doc/schema.mjs';
import { insertNode } from '../doc/commands.mjs';
import { appearance } from '../geometry.mjs';
import { inverseSelection, sameAs, magicWand, objectsOfKind, stackNeighbour, saveSelection, savedSelection, selectableObjects } from '../doc/select-rules.mjs';

const seg = (p) => ({ p, in: [0, 0], out: [0, 0] });
function setup() {
  const doc = new DrawDocument(), history = new History(doc), layer = doc.data.layers[0].id;
  const make = (fill, stroke, width = 1, extra = {}) => createNode('path', { subpaths: [{ closed: true, segments: [[0, 0], [5, 0], [5, 5]].map(seg) }], appearance: appearance(fill, stroke, width), ...extra });
  const red = make('#FF0000', '#000000', 1), red2 = make('#FA0505', null), blue = make('#0000FF', '#000000', 2, { opacity: .5 });
  const open = createNode('path', { subpaths: [{ closed: false, segments: [[0, 0], [9, 9]].map(seg) }], appearance: appearance(null, '#000000', 1) });
  const stray = createNode('path', { subpaths: [{ closed: false, segments: [seg([3, 3])] }], appearance: appearance(null, '#000000', 1) });
  const group = createNode('group', { children: [make('#FF0000', null)] });
  for (const n of [red, red2, blue, open, stray, group]) history.execute(insertNode(layer, n));
  return { doc, history, layer, red, red2, blue, open, stray, group, inner: group.children[0] };
}

test('inverse selects the other top-level objects', () => {
  const { doc, red, blue } = setup();
  assert.equal(inverseSelection(doc, [red.id, blue.id]).length, selectableObjects(doc).length - 2);
});

test('Same matches leaves anywhere by fill, stroke, weight and opacity', () => {
  const { doc, red, red2, blue, inner, open } = setup();
  assert.deepEqual(sameAs(doc, [red.id], 'fill-color'), [red.id, inner.id]);
  assert.deepEqual(sameAs(doc, [blue.id], 'stroke-weight'), [blue.id]);
  assert.deepEqual(sameAs(doc, [red.id], 'stroke-color').sort(), [red.id, blue.id, open.id, doc.data.layers[0].children[4].id].sort());
  assert.deepEqual(sameAs(doc, [blue.id], 'opacity'), [blue.id]);
  assert.throws(() => sameAs(doc, [red.id], 'text'), /text object/);
  assert.ok(!sameAs(doc, [red.id], 'fill-color').includes(red2.id), 'Exact colour, unlike Magic Wand');
});

test('Magic Wand matches close colours within the tolerance', () => {
  const { doc, red, red2, inner, blue } = setup();
  assert.deepEqual(magicWand(doc, red.id, { fillTolerance: 10 }), [red.id, red2.id, inner.id]);
  assert.deepEqual(magicWand(doc, red.id, { fillTolerance: 0 }), [red.id, inner.id]);
  assert.deepEqual(magicWand(doc, blue.id, { fill: false, opacity: true, opacityTolerance: 1 }), [blue.id]);
});

test('Select > Object, next object above and below, and saved selections', () => {
  const { doc, red, red2, blue, open, stray, inner } = setup();
  assert.deepEqual(objectsOfKind(doc, 'open-paths'), [open.id]);
  assert.deepEqual(objectsOfKind(doc, 'stray-points'), [stray.id]);
  assert.equal(objectsOfKind(doc, 'same-layers', [inner.id]).length, 6);
  assert.deepEqual(stackNeighbour(doc, [red2.id], 1), [blue.id]);
  assert.deepEqual(stackNeighbour(doc, [red2.id], -1), [red.id]);
  assert.deepEqual(stackNeighbour(doc, [red.id], -1), [red.id], 'The bottom object stays');
  const settings = saveSelection(doc.data.settings, ' Reds ', [red.id, red2.id]);
  assert.deepEqual(settings.savedSelections, [{ name: 'Reds', ids: [red.id, red2.id] }]);
  assert.throws(() => saveSelection(doc.data.settings, '', [red.id]), /name/);
  assert.throws(() => savedSelection(doc, 'Reds'), /no longer exists/);
});

test('Select > Same > Graphic Style: objects with the same document style as the reference', async () => {
  const { DrawDocument } = await import('../doc/document.mjs');
  const { createDocument, createNode } = await import('../doc/schema.mjs');
  const { appearance } = await import('../geometry.mjs');
  const { sameAs: same } = await import('../doc/select-rules.mjs');
  const look = appearance('#FF0000', '#000000', 1), other = appearance('#00FF00', null);
  const sq = (x, app) => createNode('path', { subpaths: [{ closed: true, segments: [[x, 0], [x + 1, 0], [x + 1, 1]].map((p) => ({ p, in: [0, 0], out: [0, 0] })) }], appearance: app });
  const nodes = [sq(0, look), sq(2, look), sq(4, other)];
  const data = createDocument({ graphicStyles: [{ id: 'red', name: 'Red', appearance: look, opacity: 1, blendMode: 'normal' }] }); data.layers[0].children = nodes;
  const doc = new DrawDocument(data);
  assert.deepEqual(same(doc, [nodes[0].id], 'graphic-style'), [nodes[0].id, nodes[1].id]);
  assert.throws(() => same(doc, [nodes[2].id], 'graphic-style'), /graphic styles/);
});
