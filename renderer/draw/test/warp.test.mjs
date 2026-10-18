import test from 'node:test';
import assert from 'node:assert/strict';
import { WARP_STYLES, warpStyle, warpMapping } from '../geom/warp.mjs';
import { applyVectorEffects, effect } from '../doc/effects.mjs';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);
test('no bend leaves every style unchanged; arc keeps the middle line length', () => {
  for (const style of Object.keys(WARP_STYLES)) for (const [u, v] of [[-1, -1], [.3, .5], [1, 0]]) { const [p, q] = warpStyle(style, 0, u, v); near(p, u); near(q, v); }
  const [x, y] = warpStyle('arc', 1, 1, 0); near(Math.hypot(x, y - 2 / Math.PI), 2 / Math.PI, 1e-9);
  assert.deepEqual(warpStyle('arch', .5, 0, 0), [0, -.5], 'A positive bend lifts the middle (y down)');
});
test('the mapping works in the box, vertical orientation swaps axes', () => {
  const box = { x: 10, y: 20, width: 40, height: 20 }, flag = warpMapping(box, { style: 'flag', bend: 100 });
  assert.deepEqual(flag([10, 30]).map((v) => Math.round(v * 1e6) / 1e6), [10, 30]);
  near(flag([20, 30])[1], 30 - 10 * Math.sin(-Math.PI / 2) / 2);
  const vertical = warpMapping(box, { style: 'arch', bend: 50, orientation: 'vertical' });
  near(vertical([30, 30])[0], 30 - 20 * .5); near(vertical([30, 30])[1], 30);
});
test('the Warp effect bends a rectangle and is validated', () => {
  const rect = [{ closed: true, segments: [[0, 0], [40, 0], [40, 10], [0, 10]].map((p) => ({ p, in: [0, 0], out: [0, 0] })) }];
  const [out] = applyVectorEffects(rect, [effect('warp', { style: 'arch', bend: 50 })]);
  assert.ok(out.segments.length > 16, 'Sampled densely');
  const top = out.segments.filter((s) => Math.abs(s.p[0] - 20) < .6).map((s) => s.p[1]);
  assert.ok(Math.min(...top) < -2, `The middle of the top edge rises: ${top}`);
  assert.throws(() => effect('warp', { style: 'spiral' }), /Invalid Warp/);
});
