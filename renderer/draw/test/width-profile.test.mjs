import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDTH_PROFILES, normalizeProfile, profileName, widthAt, variableStrokeRings, setWidthPoint, removeWidthPoint, moveWidthPoint, flipAlong, flipAcross } from '../geom/width-profile.mjs';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);
// A straight line from (0,0) to (10,0); the left normal points up (y down on screen: -y).
const line = (n = 11) => Array.from({ length: n }, (_, i) => ({ p: [i * 10 / (n - 1), 0], n: [0, -1], t: i / (n - 1) }));

test('profiles: plain strokes are null, presets are recognised, flips mirror', () => {
  assert.equal(normalizeProfile([{ t: 0, left: .5, right: .5 }, { t: 1, left: .5, right: .5 }]), null);
  assert.equal(profileName(null), 'uniform'); assert.equal(profileName(WIDTH_PROFILES['profile-3'].points), 'profile-3');
  assert.equal(profileName(flipAlong(WIDTH_PROFILES['profile-3'].points)), 'profile-4');
  assert.deepEqual(flipAcross([{ t: 0, left: 1, right: 0 }]), [{ t: 0, left: 0, right: 1 }]);
});
test('width eases between points and is flat beyond the ends', () => {
  const p = WIDTH_PROFILES['profile-1'].points;
  assert.deepEqual(widthAt(p, 0), [0, 0]); assert.deepEqual(widthAt(p, .5), [.5, .5]); near(widthAt(p, .25)[0], .25);
  assert.deepEqual(widthAt([{ t: .5, left: 1, right: 1 }], .1), [1, 1]);
});
test('outline: open paths make one ring, closed paths two opposite rings, round caps bulge outwards', () => {
  const [ring] = variableStrokeRings(line(), 2, WIDTH_PROFILES['profile-3'].points);
  assert.deepEqual(ring[0], [0, -1]); near(ring[10][1], 0, 1e-9); assert.equal(ring.length, 22);
  const [round] = variableStrokeRings(line(), 2, null, { cap: 'round' });
  assert.ok(Math.max(...round.map((p) => p[0])) > 10.9 && Math.min(...round.map((p) => p[0])) < -.9, 'Both ends get a half circle beyond the path');
  const circle = Array.from({ length: 64 }, (_, i) => { const a = i / 64 * 2 * Math.PI; return { p: [Math.cos(a) * 10, Math.sin(a) * 10], n: [-Math.cos(a), -Math.sin(a)], t: i / 64 }; });
  const rings = variableStrokeRings(circle, 2, null, { closed: true });
  assert.equal(rings.length, 2); near(Math.hypot(...rings[0][0]), 9); near(Math.hypot(...rings[1][0]), 11);
});
test('Width tool edits: add, snap to an existing point, one side, move and remove', () => {
  let { points, index } = setWidthPoint(null, { t: .5, share: 1 });
  assert.deepEqual(points.map((p) => p.t), [0, .5, 1]); assert.equal(index, 1); assert.deepEqual([points[1].left, points[1].right], [1, 1]);
  ({ points } = setWidthPoint(points, { t: .505, share: 2, side: 'left' }));
  assert.equal(points.length, 3, 'Near an existing point it is edited, not added'); assert.deepEqual([points[1].left, points[1].right], [2, 1]);
  points = moveWidthPoint(points, 1, 1.5); assert.equal(points[1].t, 1, 'A point stays between its neighbours');
  assert.equal(removeWidthPoint(points, 1), null, 'Without the wide point the stroke is plain again');
});
