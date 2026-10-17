import test from 'node:test';
import assert from 'node:assert/strict';
import { effect, applyVectorEffects, hasVectorEffects } from '../doc/effects.mjs';
import { offsetPaths, offsetPathsSync, loadGeometry } from '../geom/kernel-js.mjs';

const seg = (p) => ({ p, in: [0, 0], out: [0, 0] });
const square = [{ closed: true, segments: [[0, 0], [10, 0], [10, 10], [0, 10]].map(seg) }];
const bounds = (subpaths) => { const pts = subpaths.flatMap((s) => s.segments.map((g) => g.p)); return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]; };

test('effects are validated with defaults, and hidden ones are kept but skipped', () => {
  assert.deepEqual(effect('round-corners'), { type: 'round-corners', radius: 2 });
  assert.throws(() => effect('round-corners', { radius: -1 }), /Invalid Round Corners/);
  assert.throws(() => effect('blur'), /Unknown effect/);
  assert.deepEqual(applyVectorEffects(square, [effect('round-corners', { radius: 3, hidden: true })]), square);
  assert.equal(hasVectorEffects({ appearance: { effects: [effect('transform', { hidden: true })] } }), false);
});

test('Round Corners rounds every sharp corner; Transform adds moved copies', () => {
  const rounded = applyVectorEffects(square, [effect('round-corners', { radius: 3 })]);
  assert.equal(rounded[0].segments.length, 8);
  const copies = applyVectorEffects(square, [effect('transform', { moveX: 20, copies: 2 })]);
  assert.equal(copies.length, 3); assert.deepEqual(bounds(copies), [0, 0, 50, 10]);
  const moved = applyVectorEffects(square, [effect('transform', { moveX: 20, copies: 0 })]);
  assert.deepEqual(bounds(moved), [20, 0, 30, 10]);
});

test('Offset Path runs once the polygon library is loaded, in effect order', async () => {
  assert.equal(typeof offsetPaths, 'function');
  await loadGeometry();
  const grown = applyVectorEffects(square, [effect('offset-path', { distance: 2 }), effect('round-corners', { radius: 1 })], { offset: offsetPathsSync });
  assert.deepEqual(bounds(grown).map((v) => Math.round(v * 1000) / 1000), [-2, -2, 12, 12]);
  assert.ok(grown[0].segments.length > 4, 'Rounded after the offset');
});
