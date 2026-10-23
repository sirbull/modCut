import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, isDraft } from '../doc/draft.mjs';

const freeze = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const tree = () => freeze({ name: 'doc', layers: [{ id: 'a', children: [{ id: 'x', p: [1, 2] }, { id: 'y', p: [3, 4] }] }, { id: 'b', children: [{ id: 'z', p: [5, 6] }] }] });

test('untouched branches are shared, written paths are copied', () => {
  const base = tree(), { draft, finish } = createDraft(base);
  draft.layers[0].children[1].p[0] = 9;
  const next = finish();
  assert.equal(base.layers[0].children[1].p[0], 3, 'The base is unchanged');
  assert.equal(next.layers[0].children[1].p[0], 9);
  assert.equal(next.layers[1], base.layers[1], 'The other layer is shared');
  assert.equal(next.layers[0].children[0], base.layers[0].children[0], 'The sibling is shared');
  assert.notEqual(next.layers[0], base.layers[0]); assert.ok(!isDraft(next.layers[0]));
});
test('splice, moves, Object.assign, delete and new objects', () => {
  const base = tree(), { draft, finish } = createDraft(base);
  const [moved] = draft.layers[0].children.splice(0, 1);
  draft.layers[1].children.splice(0, 0, moved);
  Object.assign(draft.layers[1].children[1], { p: [7, 8], extra: true });
  delete draft.layers[1].children[1].extra;
  draft.layers.push({ id: 'c', children: [] });
  draft.name = 'renamed';
  const next = finish();
  assert.deepEqual(JSON.parse(JSON.stringify(next)), { name: 'renamed', layers: [{ id: 'a', children: [{ id: 'y', p: [3, 4] }] }, { id: 'b', children: [{ id: 'x', p: [1, 2] }, { id: 'z', p: [7, 8] }] }, { id: 'c', children: [] }] });
  assert.equal(next.layers[1].children[0], base.layers[0].children[0], 'A moved, unchanged node is the same object');
  assert.equal(JSON.stringify(base), JSON.stringify(tree()));
});
test('reading a draft behaves like the data (keys, length, JSON, Array.isArray)', () => {
  const { draft, finish } = createDraft(tree());
  assert.equal(Array.isArray(draft.layers), true); assert.equal(draft.layers.length, 2);
  assert.deepEqual(Object.keys(draft.layers[0]), ['id', 'children']);
  assert.equal(JSON.stringify(draft.layers[1]), '{"id":"b","children":[{"id":"z","p":[5,6]}]}');
  assert.equal(draft.layers.find((l) => l.id === 'b').children[0].id, 'z');
  assert.equal(finish().layers.length, 2);
});

test('the document index stays right after edits that insert, move, update and remove', async () => {
  const { DrawDocument } = await import('../doc/document.mjs'), { History } = await import('../doc/history.mjs');
  const { createDocument, createNode } = await import('../doc/schema.mjs'), { insertNode, moveNode, removeNode, updateNode } = await import('../doc/commands.mjs');
  const a = createNode('path', { name: 'a' }), b = createNode('path', { name: 'b' }), g = createNode('group', { children: [createNode('path', { name: 'c' })] });
  const doc = new DrawDocument(createDocument({ layers: [createNode('layer', { children: [a, b, g] }), createNode('layer')] })), history = new History(doc);
  const check = () => { const fresh = new DrawDocument(doc.data); for (const n of doc.descendants(null)) assert.deepEqual(doc.locate(n.id), fresh.locate(n.id), n.name || n.type); };
  const layer2 = doc.data.layers[1].id, c = g.children[0].id;
  history.execute(updateNode(a.id, { name: 'a2' })); check();
  history.execute(insertNode(doc.data.layers[0].id, createNode('path', { name: 'd' }), 0)); check();
  history.execute(moveNode(g.id, layer2, 0)); check();
  history.execute(moveNode(c, doc.data.layers[0].id, 1)); check();
  history.execute(removeNode(b.id)); check(); assert.equal(doc.getNode(b.id), null);
  history.transaction('Many', () => { history.execute(updateNode(c, { name: 'c2' })); history.execute(removeNode(a.id)); history.execute(moveNode(c, layer2, 1)); }); check();
  while (history.undo()) check();
  while (history.redo()) check();
});
