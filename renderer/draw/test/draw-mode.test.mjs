import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { createNode } from '../doc/schema.mjs';
import { insertNode } from '../doc/commands.mjs';
import { appearance } from '../geometry.mjs';
import { insideTarget, nextDrawMode, placement } from '../doc/draw-mode.mjs';

const square = (x) => createNode('path', { subpaths: [{ closed: true, segments: [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]].map((p) => ({ p, in: [0, 0], out: [0, 0] })) }], appearance: appearance('#FF0000', '#000000', 1) });
function setup() {
  const doc = new DrawDocument(), history = new History(doc), layer = doc.data.layers[0].id, a = square(0), b = square(20);
  history.execute(insertNode(layer, a)); history.execute(insertNode(layer, b));
  return { doc, history, layer, a, b };
}
const run = (history, p, node) => history.transaction('Draw', () => { p.commands.forEach((c) => history.execute(c)); history.execute(insertNode(p.parentId, node, p.index)); });

test('drawing modes cycle Normal, Behind, Inside', () => {
  assert.deepEqual(['normal', 'behind', 'inside'].map(nextDrawMode), ['behind', 'inside', 'normal']);
});

test('Draw Behind puts new objects under the selection, or at the bottom of the layer', () => {
  const { doc, history, layer, a, b } = setup();
  const n1 = square(40); run(history, placement(doc, 'behind', { parentId: layer, selection: [b.id] }), n1);
  assert.deepEqual(doc.data.layers[0].children.map((n) => n.id), [a.id, n1.id, b.id]);
  const n2 = square(60); run(history, placement(doc, 'behind', { parentId: layer, selection: [] }), n2);
  assert.equal(doc.data.layers[0].children[0].id, n2.id);
  assert.equal(placement(doc, 'normal', { parentId: layer }).index, undefined);
});

test('Draw Inside wraps the target in a clipping group that keeps its paint, then reuses it', () => {
  const { doc, history, layer, a, b } = setup();
  assert.equal(insideTarget(doc, [b.id]), b.id);
  assert.throws(() => insideTarget(doc, [a.id, b.id]), /one path or shape/);
  const first = square(22); run(history, placement(doc, 'inside', { parentId: layer, insideId: b.id }), first);
  const group = doc.data.layers[0].children[1];
  assert.equal(group.type, 'group'); assert.equal(group.clip, true);
  assert.deepEqual(group.children.map((n) => n.id), [first.id, b.id]);
  assert.equal(doc.getNode(b.id).appearance.fills.length, 1, 'The clipping path keeps its fill');
  const second = square(24); run(history, placement(doc, 'inside', { parentId: layer, insideId: b.id }), second);
  assert.deepEqual(doc.getNode(group.id).children.map((n) => n.id), [first.id, second.id, b.id]);
  assert.equal(insideTarget(doc, [group.id]), b.id, 'Selecting the clipping group targets its clipping path');
  history.undo(); history.undo();
  assert.deepEqual(doc.data.layers[0].children.map((n) => n.id), [a.id, b.id], 'Undo removes the group in one step');
});

test('Send to Cut fills a Draw Inside clipping path under the clipped objects and strokes it above them', async () => {
  const { artboardCutSvg } = await import('../io/cut-svg.mjs');
  const { doc, history, layer, b } = setup();
  const inner = createNode('path', { subpaths: square(22).subpaths, appearance: appearance('#0000FF', null) });
  run(history, placement(doc, 'inside', { parentId: layer, insideId: b.id }), inner);
  const board = doc.data.artboards[0];
  const { svg } = artboardCutSvg(doc, board.id, { bounds: () => ({ x: board.x + 1, y: board.y + 1, width: 5, height: 5 }), worldMatrix: () => [1, 0, 0, 1, 0, 0], subpaths: (id) => doc.getNode(id).subpaths });
  const order = [...svg.matchAll(/fill="([^"]+)" stroke="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
  const red = order.indexOf('#ff0000 none'), blue = order.indexOf('#0000ff none'), stroke = order.indexOf('none #000000');
  assert.ok(red >= 0 && blue > red && stroke > blue, order.join(' | '));
});
