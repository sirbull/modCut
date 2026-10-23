import test from 'node:test';
import assert from 'node:assert/strict';
import { measurePath, reverseSubpath, pathRunStart, glyphFrame } from '../geom/path-measure.mjs';

const seg = (p, i = [0, 0], o = [0, 0]) => ({ p, in: i, out: o });
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);
// A circle of radius 10 from four cubic segments (kappa approximation).
const k = 10 * 0.5522847498;
const circle = { closed: true, segments: [seg([0, -10], [-k, 0], [k, 0]), seg([10, 0], [0, -k], [0, k]), seg([0, 10], [k, 0], [-k, 0]), seg([-10, 0], [0, k], [0, -k])] };

test('a straight path measures its length and tangent', () => {
  const m = measurePath({ closed: false, segments: [seg([0, 0]), seg([30, 40])] });
  near(m.length, 50); assert.deepEqual(m.at(25).p.map((v) => Math.round(v * 1e6) / 1e6), [15, 20]);
  near(m.at(10).t[0], .6); near(m.at(10).t[1], .8);
  assert.throws(() => measurePath({ closed: false, segments: [seg([0, 0])] }), /two points/);
});

test('curves are measured along the arc, including the closing segment', () => {
  const m = measurePath(circle);
  near(m.length, 2 * Math.PI * 10, .02);
  const quarter = m.at(m.length / 4);
  near(quarter.p[0], 10, .01); near(quarter.p[1], 0, .01); near(quarter.t[1], 1, .01);
});

test('reversing runs the same path the other way', () => {
  const open = { closed: false, segments: [seg([0, 0], [0, 0], [5, 0]), seg([10, 10], [0, -5], [0, 0])] };
  const r = reverseSubpath(open);
  assert.deepEqual(r.segments[0], { p: [10, 10], in: [0, 0], out: [0, -5] });
  near(measurePath(r).length, measurePath(open).length);
  assert.deepEqual(measurePath(r).at(0).p, [10, 10]);
  near(measurePath(reverseSubpath(circle)).length, measurePath(circle).length, 1e-6);
});

test('runs start at the offset and align in the remaining length', () => {
  assert.equal(pathRunStart(100, 20, { offset: 10 }), 10);
  assert.equal(pathRunStart(100, 20, { offset: 10, alignment: 'center' }), 45);
  assert.equal(pathRunStart(100, 20, { offset: 10, alignment: 'right' }), 80);
  assert.equal(pathRunStart(100, 200, { alignment: 'right' }), 0, 'a run longer than the path starts at the offset');
});

test('a glyph frame puts local up on the left of the direction of travel', () => {
  const m = measurePath({ closed: false, segments: [seg([0, 0]), seg([100, 0])] });
  const map = glyphFrame(m, 50);
  assert.deepEqual(map(0, 0), [50, 0]); assert.deepEqual(map(2, 3), [52, -3], 'up is toward smaller y on screen');
});
