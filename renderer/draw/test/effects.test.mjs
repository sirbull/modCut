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

test('Zig Zag, Pucker & Bloat, Roughen and Twist distort the outline', () => {
  const zig = applyVectorEffects(square, [effect('zig-zag', { size: 1, ridges: 3 })]);
  assert.equal(zig[0].segments.length, 16, 'Four segments, three ridges each plus the anchor');
  assert.deepEqual(bounds(zig), [-1, -1, 11, 11]);
  const bloat = applyVectorEffects(square, [effect('pucker-bloat', { amount: 50 })]);
  assert.deepEqual(bloat[0].segments[0].out, [-2.5, -2.5], 'Handles point away from the centre');
  const rough = applyVectorEffects(square, [effect('roughen', { size: .5, detail: 1, seed: 7 })]);
  assert.deepEqual(rough, applyVectorEffects(square, [effect('roughen', { size: .5, detail: 1, seed: 7 })]), 'Seeded');
  assert.equal(rough[0].segments.length, 40);
  const twisted = applyVectorEffects(square, [effect('twist', { angle: 90 })]);
  assert.ok(twisted[0].segments.length > 16);
  assert.equal(hasVectorEffects({ appearance: { effects: [effect('drop-shadow')] } }), false, 'Drop Shadow is a raster effect');
});

test('Rasterize: document resolution by default, a chosen ppi, background and padding; a raster effect', async () => {
  const { rasterizeOf } = await import('../doc/effects.mjs');
  assert.deepEqual(effect('rasterize'), { type: 'rasterize', ppi: 0, background: 'transparent', padding: 0, antialias: true });
  assert.deepEqual(effect('rasterize', { ppi: 150, background: 'white', padding: 2, antialias: false }), { type: 'rasterize', ppi: 150, background: 'white', padding: 2, antialias: false });
  assert.throws(() => effect('rasterize', { ppi: 5 }), /Invalid Rasterize/); assert.throws(() => effect('rasterize', { background: 'red' }), /Invalid Rasterize/);
  const node = { appearance: { effects: [effect('rasterize', { ppi: 72 }), { ...effect('rasterize', { ppi: 300 }), hidden: true }] } };
  assert.equal(rasterizeOf(node).ppi, 72, 'Hidden effects are skipped'); assert.equal(hasVectorEffects(node), false);
});
