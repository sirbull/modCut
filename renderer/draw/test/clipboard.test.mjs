import test from 'node:test';
import assert from 'node:assert/strict';
import { createNode, createDocument } from '../doc/schema.mjs';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { copyNodes, invert, pasteCommands } from '../doc/clipboard.mjs';
import { multiply } from '../doc/arrange.mjs';

function setup() {
  const inner = createNode('shape', { id: 'inner', transform: [1, 0, 0, 1, 5, 0] });
  const group = createNode('group', { id: 'g', transform: [2, 0, 0, 2, 10, 10], children: [inner] });
  const image = createNode('image', { id: 'img', assetId: 'asset1' });
  const doc = new DrawDocument(createDocument({ layers: [createNode('layer', { id: 'L', children: [group, image] }), createNode('layer', { id: 'M' })],
    assets: { asset1: { mimeType: 'image/png', data: 'AAA', width: 1, height: 1 } } }));
  return { doc, history: new History(doc) };
}
const worlds = { inner: [2, 0, 0, 2, 20, 10], g: [2, 0, 0, 2, 10, 10], img: [1, 0, 0, 1, 0, 0] };
const run = (history, commands) => history.transaction('Paste', () => commands.forEach((c) => history.execute(c)));

test('copy bakes the world transform and carries image assets', () => {
  const { doc } = setup();
  const clip = copyNodes(doc, ['img', 'inner'], (id) => worlds[id], { x: 0, y: 0, width: 40, height: 20 });
  assert.deepEqual(clip.nodes.map((n) => n.id), ['inner', 'img'], 'stacking order');
  assert.deepEqual(clip.nodes[0].transform, [2, 0, 0, 2, 20, 10]);
  assert.deepEqual(Object.keys(clip.assets), ['asset1']); assert.deepEqual(clip.center, [20, 10]);
  assert.throws(() => copyNodes(doc, ['L'], () => [1, 0, 0, 1, 0, 0]), /Select objects/);
});

test('paste makes fresh ids, keeps the world position inside a transformed parent, and offsets', () => {
  const { doc, history } = setup();
  const clip = copyNodes(doc, ['inner'], (id) => worlds[id], { x: 0, y: 0, width: 1, height: 1 });
  let { commands, ids } = pasteCommands(doc, clip, { parentId: 'g', index: 1, parentWorld: worlds.g });
  run(history, commands);
  const pasted = doc.getNode(ids[0]);
  assert.notEqual(pasted.id, 'inner'); assert.deepEqual(multiply(worlds.g, pasted.transform), worlds.inner, 'same place on the page');
  ({ commands, ids } = pasteCommands(doc, clip, { parentId: 'M', index: 0, offset: [3, 4] }));
  run(history, commands);
  assert.deepEqual(doc.getNode(ids[0]).transform, [2, 0, 0, 2, 23, 14]);
  assert.deepEqual(invert([2, 0, 0, 4, 6, 8]), [.5, 0, 0, .25, -3, -2]);
});

test('assets missing in the target document are added in the same step', () => {
  const { doc } = setup();
  const clip = copyNodes(doc, ['img'], (id) => worlds[id], { x: 0, y: 0, width: 1, height: 1 });
  const other = new DrawDocument(createDocument({ layers: [createNode('layer', { id: 'X' })] })), history = new History(other);
  run(history, pasteCommands(other, clip, { parentId: 'X', index: 0 }).commands);
  assert.equal(other.data.assets.asset1.data, 'AAA');
  history.undo(); assert.equal(other.data.assets.asset1, undefined, 'one undo removes both');
  assert.throws(() => pasteCommands(other, null, { parentId: 'X', index: 0 }), /Nothing to paste/);
});
