import test from 'node:test';
import assert from 'node:assert/strict';
import { createNode, createDocument } from '../doc/schema.mjs';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { updateNode } from '../doc/commands.mjs';
import { arrangeCommands, groupCommands, hideCommands, lockCommands, multiply, showAllCommands, ungroupCommands, unlockAllCommands } from '../doc/arrange.mjs';

function setup() {
  const kids = ['a', 'b', 'c', 'd', 'e'].map((id) => createNode('shape', { id }));
  const doc = new DrawDocument(createDocument({ layers: [createNode('layer', { id: 'L', children: kids })] }));
  return { doc, history: new History(doc) };
}
const run = (history, commands) => history.transaction('Test', () => commands.forEach((c) => history.execute(c)));
const order = (doc, id = 'L') => doc.getNode(id).children.map((n) => n.id);

test('group takes the topmost place and keeps stacking order; ungroup restores it', () => {
  const { doc, history } = setup();
  const { commands, group } = groupCommands(doc, ['d', 'b']);
  run(history, commands);
  assert.deepEqual(order(doc), ['a', 'c', group.id, 'e']); assert.deepEqual(order(doc, group.id), ['b', 'd']);
  run(history, ungroupCommands(doc, [group.id]).commands);
  assert.deepEqual(order(doc), ['a', 'c', 'b', 'd', 'e']);
  history.undo(); history.undo(); assert.deepEqual(order(doc), ['a', 'b', 'c', 'd', 'e'], 'undo both steps');
  assert.throws(() => groupCommands(doc, []), /Select objects/);
  assert.throws(() => ungroupCommands(doc, ['a']), /Select a group/);
});

test('ungroup carries the group transform and opacity to the children', () => {
  const { doc, history } = setup();
  const { commands, group } = groupCommands(doc, ['a', 'b']); run(history, commands);
  history.execute(updateNode(group.id, { transform: [2, 0, 0, 2, 10, 5], opacity: .5 }));
  history.execute(updateNode('a', { transform: [1, 0, 0, 1, 3, 4] }));
  run(history, ungroupCommands(doc, [group.id]).commands);
  assert.deepEqual(doc.getNode('a').transform, [2, 0, 0, 2, 16, 13]); assert.equal(doc.getNode('b').opacity, .5);
  assert.deepEqual(multiply([1, 0, 0, 1, 0, 0], [0, 1, -1, 0, 2, 3]), [0, 1, -1, 0, 2, 3]);
});

test('arrange moves selected objects together within their parent', () => {
  const { doc, history } = setup();
  run(history, arrangeCommands(doc, ['b'], 'front')); assert.deepEqual(order(doc), ['a', 'c', 'd', 'e', 'b']); history.undo();
  run(history, arrangeCommands(doc, ['d', 'b'], 'back')); assert.deepEqual(order(doc), ['b', 'd', 'a', 'c', 'e']); history.undo();
  run(history, arrangeCommands(doc, ['b', 'c'], 'forward')); assert.deepEqual(order(doc), ['a', 'd', 'b', 'c', 'e']); history.undo();
  run(history, arrangeCommands(doc, ['d'], 'backward')); assert.deepEqual(order(doc), ['a', 'b', 'd', 'c', 'e']); history.undo();
  assert.deepEqual(arrangeCommands(doc, ['e'], 'front'), [], 'already in front: nothing to do');
  history.execute(updateNode('c', { locked: true }));
  run(history, arrangeCommands(doc, ['b'], 'front')); assert.deepEqual(order(doc), ['a', 'c', 'd', 'e', 'b'], 'locked neighbours do not block');
});

test('lock, hide, unlock all and show all', () => {
  const { doc, history } = setup();
  run(history, lockCommands(doc, ['a', 'b'])); run(history, hideCommands(doc, ['c']));
  assert.deepEqual(['a', 'b', 'c'].map((id) => [doc.getNode(id).locked, doc.getNode(id).visible]), [[true, true], [true, true], [false, false]]);
  history.execute(updateNode('L', { locked: false }));
  run(history, unlockAllCommands(doc)); run(history, showAllCommands(doc));
  assert.ok(doc.descendants(null).every((n) => !n.locked && n.visible));
});
