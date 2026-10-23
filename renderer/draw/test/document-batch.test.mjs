import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { createNode } from '../doc/schema.mjs';
import { insertNode, removeNode, updateNode } from '../doc/commands.mjs';

const square = (x, name = '') => createNode('path', { name, subpaths: [{ closed: true, segments: [[x, 0], [x + 1, 0], [x + 1, 1]].map((p) => ({ p, in: [0, 0], out: [0, 0] })) }] });
const setup = () => { const doc = new DrawDocument(), history = new History(doc); return { doc, history, layer: doc.data.layers[0].id }; };

test('a transaction validates once at the end; a bad edit rolls the whole transaction back', () => {
  const { doc, history, layer } = setup(), before = doc.data;
  const a = square(0, 'a');
  assert.throws(() => history.transaction('Bad', () => {
    history.execute(insertNode(layer, a));
    history.execute(insertNode(layer, { ...square(5), id: a.id }));
  }), /unique/);
  assert.equal(doc.data, before); assert.equal(doc.getNode(a.id), null); assert.equal(history.canUndo, false);
  history.transaction('Good', () => { history.execute(insertNode(layer, a)); history.execute(updateNode(a.id, { name: 'renamed' })); });
  assert.equal(doc.getNode(a.id).name, 'renamed');
});

test('the index follows inserts and removals in the middle of a long list, through undo and redo', () => {
  const { doc, history, layer } = setup(), nodes = Array.from({ length: 50 }, (_, i) => square(i, `n${i}`));
  history.transaction('Insert', () => nodes.forEach((n) => history.execute(insertNode(layer, n))));
  const middle = square(100, 'middle');
  history.execute(insertNode(layer, middle, 10));
  history.execute(removeNode(nodes[3].id));
  const check = () => doc.data.layers[0].children.forEach((n, i) => { const entry = doc.locate(n.id); assert.equal(entry.index, i, n.name); assert.equal(entry.node, n); });
  check(); assert.equal(doc.locate(middle.id).index, 9); assert.equal(doc.getNode(nodes[3].id), null);
  history.undo(); check(); assert.equal(doc.locate(nodes[3].id).index, 3);
  history.undo(); history.undo(); assert.equal(doc.data.layers[0].children.length, 0); assert.equal(doc.getNode(nodes[0].id), null);
  history.redo(); check(); assert.equal(doc.data.layers[0].children.length, 50);
});

test('an inserted node is a frozen copy: the caller keeps a node it can change', () => {
  const { doc, history, layer } = setup(), node = square(0, 'mine');
  history.execute(insertNode(layer, node));
  node.name = 'changed later';
  assert.equal(doc.getNode(node.id).name, 'mine'); assert.ok(Object.isFrozen(doc.getNode(node.id).subpaths[0].segments[0]));
});

test('a snapshot reverts the whole document in one undo step; Delete State drops the steps after', async () => {
  const { revertTo } = await import('../doc/commands.mjs');
  const { doc, history, layer } = setup(), a = square(0, 'a'), b = square(5, 'b');
  history.execute(insertNode(layer, a));
  const snapshot = doc.data;
  history.execute(insertNode(layer, b)); history.execute(updateNode(a.id, { name: 'changed' }));
  history.execute(revertTo(snapshot));
  assert.equal(doc.getNode(b.id), null); assert.equal(doc.getNode(a.id).name, 'a'); assert.equal(doc.data.layers[0], snapshot.layers[0], 'Unchanged parts are the snapshot\'s own objects');
  history.undo(); assert.equal(doc.getNode(a.id).name, 'changed'); assert.ok(doc.getNode(b.id));
  history.undo(); history.undo();
  assert.equal(history.discardRedo(), true); assert.equal(history.canRedo, false); assert.equal(history.entries.length, 1);
  assert.equal(history.discardRedo(), false);
});
