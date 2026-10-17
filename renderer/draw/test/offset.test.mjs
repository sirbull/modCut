import test from 'node:test';
import assert from 'node:assert/strict';
import { offsetPaths } from '../geom/kernel-js.mjs';

const seg = (p) => ({ p, in: [0, 0], out: [0, 0] });
const square = (s, x = 0, y = 0) => ({ closed: true, segments: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]].map(seg) });
const bounds = (paths) => { const pts = paths.flatMap((s) => s.segments.map((g) => g.p)); return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]; };
const area = (s) => Math.abs(s.segments.reduce((sum, g, i) => { const n = s.segments[(i + 1) % s.segments.length].p; return sum + g.p[0] * n[1] - n[0] * g.p[1]; }, 0)) / 2;
const near = (a, b, tol = .01) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test('a square grows with miter corners and shrinks with a negative offset', async () => {
  const grown = await offsetPaths([[square(10)]], { distance: 2 });
  assert.equal(grown.length, 1); bounds(grown).forEach((v, i) => near(v, [-2, -2, 12, 12][i]));
  assert.equal(grown[0].segments.length, 4, 'miter keeps four corners');
  const shrunk = await offsetPaths([[square(10)]], { distance: -2 });
  bounds(shrunk).forEach((v, i) => near(v, [2, 2, 8, 8][i]));
  assert.deepEqual(await offsetPaths([[square(10)]], { distance: -6 }), [], 'shrinking past the middle leaves nothing');
});

test('round joins add arcs, bevel cuts corners, and holes shrink as the outline grows', async () => {
  const round = await offsetPaths([[square(10)]], { distance: 2, join: 'round' });
  assert.ok(round[0].segments.length > 8); near(area(round[0]), 100 + 4 * 20 + Math.PI * 4, .1);
  const bevel = await offsetPaths([[square(10)]], { distance: 2, join: 'bevel' });
  assert.ok(area(bevel[0]) < 14 * 14 && area(bevel[0]) > 100 + 80);
  const frame = await offsetPaths([[square(20), square(10, 5, 5)]], { distance: 1, fillRule: 'evenodd' });
  assert.equal(frame.length, 2); const areas = frame.map(area).sort((a, b) => a - b); near(areas[0], 64); near(areas[1], 22 * 22);
});

test('a star shrunk by 2 mm with round joins stays one closed, simple path', async () => {
  const star = { closed: true, segments: Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 8 : 20, a = Math.PI / 5 * i - Math.PI / 2; return seg([r * Math.cos(a), r * Math.sin(a)]); }) };
  const result = await offsetPaths([[star]], { distance: -2, join: 'round' });
  assert.equal(result.length, 1); assert.equal(result[0].closed, true);
  // No self-crossing: every pair of non-adjacent edges is disjoint.
  const pts = result[0].segments.map((s) => s.p), n = pts.length, cross = (a, b, c, d) => {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) if (!(i === 0 && j === n - 1)) assert.equal(cross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]), false);
});

test('an open line becomes a closed outline; bad input is refused', async () => {
  const outline = await offsetPaths([[{ closed: false, segments: [seg([0, 0]), seg([10, 0])] }]], { distance: 1 });
  assert.equal(outline.length, 1); bounds(outline).forEach((v, i) => near(v, [0, -1, 10, 1][i]));
  await assert.rejects(offsetPaths([[square(1)]], { distance: Infinity }), /Offset/);
  await assert.rejects(offsetPaths([[square(1)]], { distance: 1, join: 'spiky' }), /join/);
});
