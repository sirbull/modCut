import test from 'node:test';
import assert from 'node:assert/strict';
import { createNode, createDocument, validateDocument } from '../doc/schema.mjs';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { appearance } from '../geometry.mjs';
import { compoundCommands, releaseCompoundCommands, clipCommands, releaseClipCommands, clipGroupOf } from '../doc/compound.mjs';

const square = (x, y, s) => ({ closed: true, segments: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]].map((p) => ({ p, in: [0, 0], out: [0, 0] })) });
function setup() {
  const big = createNode('path', { id: 'big', subpaths: [square(0, 0, 40)], appearance: appearance('#FF0000', null) });
  const small = createNode('path', { id: 'small', subpaths: [square(10, 10, 10)], appearance: appearance('#0000FF', '#000000', 1) });
  const inner = createNode('path', { id: 'inner', subpaths: [square(0, 0, 5)], appearance: appearance('#00FF00', null) });
  const group = createNode('group', { id: 'g', transform: [2, 0, 0, 2, 100, 0], children: [inner] });
  const label = createNode('text', { id: 't', content: { runs: [{ text: 'A' }] } });
  const doc = new DrawDocument(createDocument({ layers: [createNode('layer', { id: 'L', children: [big, small, group, label] })] }));
  const worlds = { L: [1, 0, 0, 1, 0, 0], g: [2, 0, 0, 2, 100, 0] };
  const geometry = { parentWorld: (id) => worlds[doc.locate(id).parentId], subpaths: (id) => doc.getNode(id).subpaths };
  return { doc, history: new History(doc), geometry };
}
const run = (history, label, commands) => history.transaction(label, () => commands.forEach((c) => history.execute(c)));

test('Make Compound Path joins paths into one even-odd path with the backmost paint, in one step', () => {
  const { doc, history, geometry } = setup();
  const { commands, id } = compoundCommands(doc, ['small', 'big'], geometry);
  run(history, 'Make Compound Path', commands);
  const node = doc.getNode(id);
  assert.deepEqual(doc.data.layers[0].children.map((n) => n.id), [id, 'g', 't'], 'takes the topmost member\'s place');
  assert.equal(node.subpaths.length, 2); assert.equal(node.fillRule, 'evenodd');
  assert.deepEqual(node.appearance.fills[0], doc.data.layers[0].children[0].appearance.fills[0]);
  assert.equal(node.appearance.strokes.length, 0, 'the backmost object (big, no stroke) gives the paint');
  assert.deepEqual(validateDocument(doc.data), []);
  history.undo(); assert.deepEqual(doc.data.layers[0].children.map((n) => n.id), ['big', 'small', 'g', 't']);
});

test('group contents are flattened into the compound path in world space', () => {
  const { doc, geometry } = setup();
  const { commands, id } = compoundCommands(doc, ['big', 'g'], geometry);
  const history = new History(doc); run(history, 'Make', commands);
  const node = doc.getNode(id);
  assert.deepEqual(node.subpaths[1].segments[2].p, [110, 10], 'the scaled group is baked in');
  assert.throws(() => compoundCommands(doc, ['t', id], geometry), /outlines/);
  assert.throws(() => compoundCommands(doc, [], geometry), /Select paths/);
});

test('Release Compound Path gives one path per subpath in place', () => {
  const { doc, history, geometry } = setup();
  const made = compoundCommands(doc, ['big', 'small'], geometry); run(history, 'Make', made.commands);
  const { commands, ids } = releaseCompoundCommands(doc, [made.id]); run(history, 'Release', commands);
  assert.equal(ids.length, 2); assert.deepEqual(doc.data.layers[0].children.slice(0, 2).map((n) => n.id), ids);
  assert.ok(ids.every((id) => doc.getNode(id).subpaths.length === 1));
  assert.throws(() => releaseCompoundCommands(doc, ['big']), /compound path/);
});

test('Make Clipping Mask groups the selection with the topmost path as an unpainted clip', () => {
  const { doc, history } = setup();
  const { commands, group } = clipCommands(doc, ['big', 'small'], {});
  run(history, 'Make Clipping Mask', commands);
  const clip = doc.getNode(group.id);
  assert.equal(clip.clip, true); assert.deepEqual(clip.children.map((n) => n.id), ['big', 'small']);
  assert.deepEqual([doc.getNode('small').appearance.fills, doc.getNode('small').appearance.strokes], [[], []]);
  assert.equal(clipGroupOf(doc, 'big'), group.id); assert.deepEqual(validateDocument(doc.data), []);
  assert.throws(() => clipCommands(doc, ['big'], {}), /on top/);
  assert.throws(() => clipCommands(doc, ['big', 't'], {}), /path or shape/);
  run(history, 'Release', releaseClipCommands(doc, ['big']));
  assert.equal(doc.getNode(group.id).clip, false);
  history.undo(); history.undo(); assert.equal(doc.getNode(group.id), null);
});

test('a clipping group without a path on top is invalid', () => {
  const data = createDocument({ layers: [createNode('layer', { children: [createNode('group', { clip: true, children: [createNode('text', { content: { runs: [{ text: 'A' }] } })] })] })] });
  assert.ok(validateDocument(data).some((e) => e.path.endsWith('.clip')));
});
