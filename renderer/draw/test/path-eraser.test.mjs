import test from 'node:test';
import assert from 'node:assert/strict';
import { erasePath, smoothRange, sectionPoints } from '../geom/path-eraser.mjs';

const seg = (p, i = [0, 0], o = [0, 0]) => ({ p, in: i, out: o });
const r = (p) => p.map((v) => Math.round(v * 100) / 100);

test('erasing across the middle of a line leaves two pieces ending at the eraser', () => {
  const line = { closed: false, segments: [seg([0, 0]), seg([100, 0])] };
  const pieces = erasePath(line, [[50, -10], [50, 10]], 5);
  assert.equal(pieces.length, 2);
  assert.deepEqual(r(pieces[0].segments[0].p), [0, 0]); assert.deepEqual(r(pieces[0].segments.at(-1).p), [45, 0]);
  assert.deepEqual(r(pieces[1].segments[0].p), [55, 0]); assert.deepEqual(r(pieces[1].segments.at(-1).p), [100, 0]);
  assert.equal(erasePath(line, [[50, 30]], 5), null, 'Far away: nothing changes');
  assert.deepEqual(erasePath(line, [[0, 0], [100, 0]], 5), [], 'All of it: nothing is left');
});

test('a closed path opens where it is erased; curves stay on the original curve', () => {
  const square = { closed: true, segments: [seg([0, 0]), seg([10, 0]), seg([10, 10]), seg([0, 10])] };
  const [open] = erasePath(square, [[5, -3], [5, 3]], 1);
  assert.equal(open.segments.length, 6, 'One piece round the square from x 6 to x 4');
  assert.deepEqual(r(open.segments[0].p), [6, 0]); assert.deepEqual(r(open.segments.at(-1).p), [4, 0]);
  const arc = { closed: false, segments: [seg([0, 0], [0, 0], [0, -5.523]), seg([10, -10], [-5.523, 0], [0, 0])] };
  const [first] = erasePath(arc, [[10, -10]], 2);
  const end = first.segments.at(-1).p;
  assert.ok(Math.abs(Math.hypot(end[0] - 10, end[1]) - 10) < .05, `The cut lies on the quarter circle: ${end}`);
});

test('Smooth finds the run of anchors under the drag, with one more either side', () => {
  const zigzag = { closed: false, segments: [[0, 0], [5, 2], [10, 0], [15, 2], [20, 0], [25, 2], [30, 0]].map((p) => seg(p)) };
  assert.deepEqual(smoothRange(zigzag, [[9, 1], [16, 1]], 2), [1, 4]);
  assert.equal(smoothRange(zigzag, [[0, 50]], 2), null);
  assert.equal(sectionPoints(zigzag, 1, 4, 4).length, 13);
});
