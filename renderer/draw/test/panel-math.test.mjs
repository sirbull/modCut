import assert from 'node:assert/strict';
import test from 'node:test';
import { REFERENCE_POINTS, panelMatrix } from '../geom/transforms.mjs';
import { transformProperties } from '../geometry.mjs';
import { createNode } from '../doc/schema.mjs';

const apply = (m, [x, y]) => [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
const close = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v-b[i]) < 1e-9, `${a} != ${b}`));
const box = { x: 10, y: 20, width: 40, height: 10 };

test('Transform panel edits keep the chosen reference point fixed', () => {
  assert.equal(REFERENCE_POINTS.length, 9);
  close(apply(panelMatrix(box, [0, 0], 'x', 0), [10, 20]), [0, 20]);
  close(apply(panelMatrix(box, [1, 1], 'y', 100), [50, 30]), [50, 100]);
  let m = panelMatrix(box, [1, 1], 'width', 80);
  close(apply(m, [50, 30]), [50, 30]); close(apply(m, [10, 20]), [-30, 20]);
  m = panelMatrix(box, [.5, .5], 'height', 20, { linked: true });
  close(apply(m, [30, 25]), [30, 25]); close(apply(m, [10, 20]), [-10, 15]);
  m = panelMatrix(box, [0, 0], 'rotate', 90);
  close(apply(m, [10, 20]), [10, 20]); close(apply(m, [20, 20]), [10, 10]);
  m = panelMatrix(box, [0, 1], 'shear', 45);
  close(apply(m, [10, 30]), [10, 30]); close(apply(m, [10, 20]), [20, 20]);
  assert.throws(() => panelMatrix(box, [0, 0], 'width', 0), /greater than zero/);
  assert.throws(() => panelMatrix({ ...box, height: 0 }, [0, 0], 'height', 5), /no height/);
  assert.throws(() => panelMatrix(box, [0, 0], 'shear', 90), /between/);
  assert.throws(() => panelMatrix(box, [0, 0], 'x', NaN), /finite/);
  assert.throws(() => panelMatrix(box, [0, 0], 'skew', 1), /Unknown/);
});

test('Scale corners can keep live rectangle and path radii', () => {
  const rect = createNode('shape', { shape: 'rect', params: { width: 10, height: 10, cornerRadius: 2 } });
  assert.equal(transformProperties(rect, [2, 0, 0, 2, 0, 0]).params, undefined);
  assert.equal(transformProperties(rect, [2, 0, 0, 2, 0, 0], { scaleCorners: false }).params.cornerRadius, 1);
  assert.equal(transformProperties(rect, [2, 0, 0, 3, 0, 0], { scaleCorners: false }).params, undefined, 'Nonuniform scale keeps the transform model');
  const square = { closed: true, segments: [[0, 0], [10, 0], [10, 10], [0, 10]].map(p => ({ p, in: [0, 0], out: [0, 0] })) };
  const path = createNode('path', { subpaths: [{ ...square, cornerData: { segments: square.segments, radii: [2, 2, 2, 2] } }] });
  assert.deepEqual(transformProperties(path, [2, 0, 0, 2, 0, 0]).subpaths[0].cornerData.radii, [4, 4, 4, 4]);
  assert.deepEqual(transformProperties(path, [2, 0, 0, 2, 0, 0], { scaleCorners: false }).subpaths[0].cornerData.radii, [2, 2, 2, 2]);
});
