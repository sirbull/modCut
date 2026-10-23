import test from 'node:test';
import assert from 'node:assert/strict';
import { blendOptions, blendStepCount, matchShapes, interpolateShapes, withAnchors, stepPositions, lerpColor } from '../geom/blend.mjs';

const poly = (points, closed = true) => ({ closed, segments: points.map((p) => ({ p, in: [0, 0], out: [0, 0] })) });
const square = (x, y, s) => poly([[x, y], [x + s, y], [x + s, y + s], [x, y + s]]);

test('options and step counts', () => {
  assert.deepEqual(blendOptions(), { spacing: 'smooth', steps: 5, distance: 5, orientation: 'page' });
  assert.throws(() => blendOptions({ steps: 0, spacing: 'steps' }), /steps/);
  const a = { subpaths: [square(0, 0, 10)], colors: [[0, 0, 0]] }, b = { subpaths: [square(40, 0, 10)], colors: [[1, 1, 1]] };
  assert.equal(blendStepCount({ spacing: 'steps', steps: 7 }, a, b), 7);
  assert.equal(blendStepCount({ spacing: 'distance', distance: 10 }, a, b), 3, '40 mm between centres at 10 mm: 3 in between');
  assert.equal(blendStepCount({ spacing: 'smooth' }, a, b), 64, 'Black to white');
  assert.equal(blendStepCount({ spacing: 'smooth' }, a, { ...b, colors: [[0, 0, 0]] }), 40, 'Same colour: about one per mm');
  assert.deepEqual(stepPositions(3), [.25, .5, .75]);
  assert.deepEqual(lerpColor([0, 0, 0], [1, .5, 0], .5), [.5, .25, 0]);
});
test('anchors are added by splitting the longest segment, on the curve', () => {
  const seg = withAnchors(poly([[0, 0], [10, 0], [10, 2]], false).segments, 4, false);
  assert.deepEqual(seg.map((s) => s.p), [[0, 0], [5, 0], [10, 0], [10, 2]]);
  const closed = withAnchors(square(0, 0, 10).segments, 5, true);
  assert.equal(closed.length, 5);
});
test('shapes are matched and interpolated; closed paths line up anchors', () => {
  const tri = poly([[30, 10], [40, 0], [40, 10]]);
  const [a, b] = matchShapes([square(0, 0, 10)], [tri]);
  assert.equal(a[0].segments.length, 4); assert.equal(b[0].segments.length, 4);
  // A square to the same square moved 20 mm but listed from another corner: each anchor moves 20 mm.
  const moved = square(20, 0, 10); moved.segments = [...moved.segments.slice(2), ...moved.segments.slice(0, 2)];
  const [p, q] = matchShapes([square(0, 0, 10)], [moved]);
  const half = interpolateShapes(p, q, .5)[0].segments.map((s) => s.p);
  assert.deepEqual(half, [[10, 0], [20, 0], [20, 10], [10, 10]]);
  // A missing subpath grows from its own centre.
  const [, extra] = matchShapes([square(0, 0, 10), square(2, 2, 2)], [square(0, 0, 10)]);
  assert.deepEqual(extra[1].segments.map((s) => s.p), Array(4).fill([3, 3]));
});

test('a spine: points and directions by share of its length, shapes placed and turned on it, kept in the options', async () => {
  const { spineCurve, placeOnSpine, keyPosition, blendOptions, blendStepCount } = await import('../geom/blend.mjs');
  const line = { closed: false, segments: [{ p: [0, 0], in: [0, 0], out: [0, 0] }, { p: [100, 0], in: [0, 0], out: [0, 0] }, { p: [100, 50], in: [0, 0], out: [0, 0] }] };
  const curve = spineCurve(line);
  assert.equal(Math.round(curve.length), 150);
  assert.deepEqual(curve.at(0).p, [0, 0]); assert.deepEqual(curve.at(1).p.map(Math.round), [100, 50]);
  assert.deepEqual(curve.at(1 / 3).p.map((v) => Math.round(v * 100) / 100), [50, 0]);
  assert.equal(Math.round(curve.at(.9).angle * 180 / Math.PI), 90, 'Along the second side the spine points down');
  const square = [{ closed: true, segments: [[0, 0], [10, 0], [10, 10], [0, 10]].map((p) => ({ p, in: [0, 0], out: [1, 0] })) }];
  const placed = placeOnSpine(square, [50, 50], Math.PI / 2);
  assert.deepEqual(placed[0].segments[0].p.map(Math.round), [55, 45]); assert.deepEqual(placed[0].segments[0].out.map(Math.round), [0, 1]);
  assert.deepEqual([0, 1, 2].map((k) => keyPosition(k, 3)), [0, .5, 1]);
  const options = blendOptions({ spacing: 'distance', distance: 10, spine: line });
  assert.deepEqual(options.spine, line); assert.equal(blendOptions({}).spine, undefined);
  assert.throws(() => blendOptions({ spine: { closed: false, segments: [line.segments[0]] } }), /at least two points/);
  assert.equal(blendStepCount(options, { subpaths: square }, { subpaths: square }, 150), 14, 'Distance steps follow the length along the spine');
});
