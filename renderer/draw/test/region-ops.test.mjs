import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { pickRegions, mergeRegions, knifeCut, erase, samplePoints } from '../geom/region-ops.mjs';
import { runPathfinder } from '../geom/pathfinder.mjs';

const scope = new paper.PaperScope(); scope.setup(new scope.Size(100, 100));
const seg = (p) => ({ p, in: [0, 0], out: [0, 0] });
const square = (x, y, s) => [{ closed: true, segments: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]].map(seg) }];
const area = (subpaths) => { const item = new scope.CompoundPath({ insert: false, children: subpaths.map((s) => new scope.Path({ insert: false, closed: true, segments: s.segments.map((g) => g.p) })) }); const a = Math.abs(item.area); item.remove(); return a; };

test('samples keep a quick drag from skipping regions', () => {
  assert.equal(samplePoints([[0, 0], [2, 0]], .5).length, 5);
});

test('Shape Builder picks the regions a drag crosses and merges them into one', () => {
  const operands = [square(0, 0, 10), square(5, 0, 10)].map((subpaths, i) => ({ id: `s${i}`, item: new scope.Path({ insert: false, closed: true, segments: subpaths[0].segments.map((g) => g.p) }), fill: '#000000' }));
  const { results } = runPathfinder(operands, 'divide');
  assert.equal(results.length, 3, 'Left, overlap and right');
  const picked = pickRegions(scope, results, [[2, 5], [7, 5]]);
  assert.equal(picked.length, 2, 'The drag crosses the left part and the overlap');
  const merged = mergeRegions(scope, results, picked);
  assert.ok(Math.abs(area(merged) - 100) < 1e-6, 'Left square area');
});

test('Knife splits a square into two pieces; Eraser removes a band', () => {
  const halves = knifeCut(scope, square(0, 0, 10), [[5, -2], [5, 12]]);
  assert.equal(halves.length, 2);
  halves.forEach((h) => assert.ok(Math.abs(area(h) - 50) < .2, `About half: ${area(h)}`));
  const erased = erase(scope, square(0, 0, 10), [[-2, 5], [12, 5]], 2);
  assert.equal(erased.length, 2, 'A stroke across leaves two pieces');
  assert.ok(Math.abs(erased.reduce((sum, p) => sum + area(p), 0) - 80) < .5);
  assert.deepEqual(erase(scope, square(0, 0, 10), [[-5, 5], [15, 5]], 30), [], 'A big brush leaves nothing');
});
