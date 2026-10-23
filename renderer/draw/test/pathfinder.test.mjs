import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { runPathfinder, toSubpaths } from '../geom/pathfinder.mjs';

const scope = new paper.PaperScope(); scope.setup(new scope.Size(100, 100));
const rect = (x, y, w, h) => new scope.Path.Rectangle({ rectangle: [x, y, w, h], insert: false });
const circle = (x, y, r) => new scope.Path.Circle({ center: [x, y], radius: r, insert: false });
const area = (subpaths) => Math.abs(new scope.CompoundPath({ insert: false, children: subpaths.map((p) => new scope.Path({ insert: false, closed: p.closed, segments: p.segments.map((s) => new scope.Segment(s.p, s.in, s.out)) })) }).area);
const total = (results) => results.reduce((sum, r) => sum + area(r.subpaths), 0);
// Exclude returns rings of opposite orientation; compare the painted amount ring by ring.
const rings = (results) => results.reduce((sum, r) => sum + r.subpaths.reduce((s, p) => s + area([p]), 0), 0);
// Two 10 x 10 squares overlapping in a 5 x 5 corner: union 175, overlap 25.
const pair = (backFill = '#FF0000', frontFill = '#0000FF') => [{ id: 'back', item: rect(0, 0, 10, 10), fill: backFill }, { id: 'front', item: rect(5, 5, 10, 10), fill: frontFill }];
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} vs ${b}`);

test('shape modes give one result with the expected area and source', () => {
  for (const [op, expected, source] of [['unite', 175, 'front'], ['intersect', 25, 'front'], ['exclude', 150, 'front'], ['minusFront', 75, 'back']]) {
    const { results, grouped } = runPathfinder(pair(), op);
    assert.equal(results.length, 1, op); assert.equal(grouped, false); assert.equal(results[0].sourceId, source, op);
    near(op === 'exclude' ? rings(results) : total(results), expected, op);
  }
});

test('pathfinders split into pieces owned by the right object', () => {
  let r = runPathfinder(pair(), 'divide').results;
  assert.equal(r.length, 3, 'divide makes three regions'); near(total(r), 175, 'divide keeps the union area');
  assert.deepEqual(r.map((x) => x.sourceId).sort(), ['back', 'front', 'front'], 'the overlap belongs to the front object');
  r = runPathfinder(pair(), 'trim').results; near(total(r), 175, 'trim'); near(area(r.find((x) => x.sourceId === 'back').subpaths), 75, 'trim hides the back object behind the front');
  r = runPathfinder(pair(), 'crop').results; assert.equal(r.length, 1); assert.equal(r[0].sourceId, 'back'); near(total(r), 25, 'crop keeps the back object inside the front boundary');
  r = runPathfinder(pair('#FF0000', '#FF0000'), 'merge').results; assert.equal(r.length, 1, 'same fill merges'); near(total(r), 175, 'merge');
  r = runPathfinder(pair(), 'merge').results; assert.equal(r.length, 2, 'different fills stay separate');
  r = runPathfinder(pair(), 'minusBack').results; assert.equal(r[0].sourceId, 'front'); near(total(r), 75, 'minus back');
  r = runPathfinder(pair(), 'outline').results; assert.ok(r.every((x) => x.kind === 'outline') && r.length === 3);
});

test('crop keeps what lies inside the front object', () => {
  const ops = [{ id: 'a', item: rect(0, 0, 20, 20), fill: '#000000' }, { id: 'frame', item: rect(5, 5, 5, 5), fill: '#FFFFFF' }];
  const r = runPathfinder(ops, 'crop').results;
  assert.equal(r.length, 1); near(total(r), 25, 'crop'); assert.equal(r[0].sourceId, 'a');
});

test('curves survive: a circle minus a square keeps Bézier handles', () => {
  const { results } = runPathfinder([{ id: 'c', item: circle(0, 0, 10) }, { id: 's', item: rect(0, -20, 20, 40) }], 'minusFront');
  near(area(results[0].subpaths), Math.abs(circle(0, 0, 10).area) / 2, 'exactly half of the Bézier circle');
  assert.ok(results[0].subpaths[0].segments.some((s) => Math.hypot(...s.in, ...s.out) > 1), 'handles are kept');
});

test('holes become compound subpaths and bad input is rejected', () => {
  const { results } = runPathfinder([{ id: 'outer', item: rect(0, 0, 30, 30) }, { id: 'hole', item: rect(10, 10, 10, 10) }], 'minusFront');
  assert.equal(results[0].subpaths.length, 2, 'outer ring and hole'); near(total(results), 800, 'area with hole');
  assert.throws(() => runPathfinder([{ id: 'a', item: rect(0, 0, 1, 1) }], 'unite'), /at least two/);
  assert.throws(() => runPathfinder(pair(), 'melt'), /Unknown/);
  assert.equal(toSubpaths(rect(0, 0, 1, 1))[0].segments.length, 4);
});

test('Pathfinder commands replace the operands with the result in one undo step', async () => {
  const { createNode, createDocument } = await import('../doc/schema.mjs');
  const { DrawDocument } = await import('../doc/document.mjs');
  const { History } = await import('../doc/history.mjs');
  const { pathfinderCommands, stackingOrder, fillHex } = await import('../doc/pathfinder-commands.mjs');
  const { appearance } = await import('../geometry.mjs');
  const a = createNode('shape', { id: 'a', name: 'Back', appearance: appearance('#FF0000', '#000000', 1) });
  const b = createNode('shape', { id: 'b', name: 'Front', appearance: appearance('#0000FF', '#000000', 1), opacity: .5 });
  const other = createNode('shape', { id: 'c' });
  const doc = new DrawDocument(createDocument({ layers: [createNode('layer', { id: 'L', children: [a, other, b] })] }));
  const history = new History(doc);
  assert.deepEqual(stackingOrder(doc, ['b', 'a']), ['a', 'b']);
  assert.equal(fillHex(doc, 'a'), '#ff0000');
  const square = { closed: true, segments: [[0, 0], [1, 0], [1, 1], [0, 1]].map((p) => ({ p, in: [0, 0], out: [0, 0] })) };
  let { commands, ids } = pathfinderCommands(doc, ['b', 'a'], { results: [{ subpaths: [square], sourceId: 'b', kind: 'fill' }], grouped: false }, 'unite', 'Unite');
  history.transaction('Unite', () => commands.forEach((c) => history.execute(c)));
  let kids = doc.getNode('L').children;
  assert.deepEqual(kids.map((n) => n.id), ['c', ids[0]], 'result takes the front object\'s place');
  assert.equal(kids[1].name, 'Front'); assert.equal(kids[1].opacity, .5); assert.equal(kids[1].appearance.strokes.length, 1);
  history.undo(); assert.deepEqual(doc.getNode('L').children.map((n) => n.id), ['a', 'c', 'b'], 'one undo restores everything');
  ({ commands, ids } = pathfinderCommands(doc, ['a', 'b'], { results: [{ subpaths: [square], sourceId: 'a', kind: 'fill' }, { subpaths: [square], sourceId: 'b', kind: 'outline' }], grouped: true }, 'trim', 'Trim'));
  history.transaction('Trim', () => commands.forEach((c) => history.execute(c)));
  const group = doc.getNode(ids[0]);
  assert.equal(group.type, 'group'); assert.equal(group.children.length, 2);
  assert.equal(group.children[0].appearance.strokes.length, 0, 'Trim removes strokes');
  assert.equal(group.children[1].appearance.fills.length, 0, 'Outline pieces have no fill');
  assert.equal(group.children[1].appearance.strokes[0].paint.type, 'solid');
  assert.throws(() => pathfinderCommands(doc, ['c'], { results: [], grouped: false }, 'intersect', 'Intersect'), /no shape/);
});
