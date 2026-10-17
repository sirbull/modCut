import test from 'node:test';
import assert from 'node:assert/strict';
import { transformEachMatrix, gridCells, compose } from '../geom/transform-each.mjs';

const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${a} vs ${b}`));
const box = { x: 10, y: 10, width: 20, height: 10 };

test('each object scales around its own centre, then moves', () => {
  const m = transformEachMatrix(box, { scaleX: 50, scaleY: 200, moveX: 5 });
  near(apply(m, [20, 15]), [25, 15]); near(apply(m, [30, 15]), [30, 15]); near(apply(m, [20, 20]), [25, 25]);
});

test('rotation is counterclockwise on screen, reflection and reference points apply', () => {
  near(apply(transformEachMatrix(box, { angle: 90 }), [30, 15]), [20, 5]);
  near(apply(transformEachMatrix(box, { reflectX: true }), [10, 15]), [30, 15]);
  near(apply(transformEachMatrix(box, { scaleX: 200, reference: [0, 0] }), [10, 10]), [10, 10]);
  assert.throws(() => transformEachMatrix(box, { scaleX: 0 }), /0 %/);
});

test('random scales every value by the object factor', () => {
  near(apply(transformEachMatrix(box, { moveX: 10, random: true }, .5), [20, 15]), [25, 15]);
  near(apply(transformEachMatrix(box, { moveX: 10, random: false }, .5), [20, 15]), [30, 15]);
  near(compose([2, 0, 0, 2, 0, 0], [1, 0, 0, 1, 3, 0]), [2, 0, 0, 2, 6, 0]);
});

test('grid cells fill the box with gutters', () => {
  const cells = gridCells({ x: 0, y: 0, width: 32, height: 20 }, { rows: 2, columns: 3, rowGutter: 2, columnGutter: 1 });
  assert.equal(cells.length, 6);
  near([cells[0].width, cells[0].height], [10, 9]); near([cells[5].x, cells[5].y], [22, 11]);
  assert.throws(() => gridCells({ x: 0, y: 0, width: 10, height: 10 }, { rows: 2, columns: 2, rowGutter: 20 }), /no room/);
});

test('free distort moves one corner and maps the rest bilinearly', async () => {
  const { distortPoint, distortSubpaths, boxCorners } = await import('../geom/transform-each.mjs');
  const b = { x: 0, y: 0, width: 10, height: 10 }, corners = boxCorners(b); corners[2] = [20, 20];
  near(distortPoint(b, corners, [10, 10]), [20, 20]); near(distortPoint(b, corners, [0, 0]), [0, 0]);
  near(distortPoint(b, corners, [5, 5]), [7.5, 7.5]);
  const [s] = distortSubpaths([{ closed: true, segments: [{ p: [10, 0], in: [0, 0], out: [0, 5] }] }], b, corners);
  near(s.segments[0].p, [10, 0]); near(s.segments[0].out, [5, 10]);
});
