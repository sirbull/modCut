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

test('blur, feather and glows are pixel effects with their own checked settings, kept in order', async () => {
  const { pixelEffects } = await import('../doc/effects.mjs');
  assert.deepEqual(effect('gaussian-blur', { radius: 2 }), { type: 'gaussian-blur', radius: 2 });
  assert.deepEqual(effect('outer-glow'), { type: 'outer-glow', color: '#FFFF00', opacity: .75, blur: 2 });
  assert.throws(() => effect('inner-glow', { color: 'gold' }), /Invalid Inner Glow/); assert.throws(() => effect('feather', { radius: -1 }), /Invalid Feather/);
  const node = { appearance: { effects: [effect('round-corners'), effect('outer-glow'), effect('gaussian-blur'), { ...effect('feather'), hidden: true }] } };
  assert.deepEqual(pixelEffects(node).map((e) => e.type), ['outer-glow', 'gaussian-blur']);
});

test('a group\'s vector effects follow an object\'s own, inner group first', async () => {
  const { vectorEffects, withGroupEffects } = await import('../doc/effects.mjs');
  const own = effect('round-corners'), inner = effect('roughen'), shadow = effect('drop-shadow');
  const group = { type: 'group', appearance: { effects: [inner, shadow, { ...effect('twist'), hidden: true }] } };
  assert.deepEqual(vectorEffects(group), [inner], 'Raster and hidden effects are not inherited');
  const path = { type: 'path', appearance: { effects: [own] } };
  assert.deepEqual(withGroupEffects(path, [inner, effect('zig-zag')]).appearance.effects.map((e) => e.type), ['round-corners', 'roughen', 'zig-zag']);
  assert.equal(withGroupEffects(path, []), path); assert.equal(withGroupEffects({ type: 'text' }, [inner]).type, 'text');
});

test('Free Distort as an effect moves the box corners by shares of the box, keeping the anchors live', () => {
  const square = [{ closed: true, segments: [[0, 0], [10, 0], [10, 10], [0, 10]].map((p) => ({ p, in: [0, 0], out: [0, 0] })) }];
  const e = effect('free-distort', { trx: 50, try: -20 });
  assert.equal(e.type, 'free-distort'); assert.equal(e.tlx, 0);
  const out = applyVectorEffects(square, [e]);
  assert.deepEqual(out[0].segments.map((g) => g.p.map((v) => Math.round(v * 100) / 100)), [[0, 0], [15, -2], [10, 10], [0, 10]]);
  assert.throws(() => effect('free-distort', { blx: 5000 }), /Invalid Free Distort/);
});

test('Convert to Shape draws a rectangle, rounded rectangle or ellipse around the object, relative or absolute', async () => {
  const { effectLabel } = await import('../doc/effects.mjs');
  assert.deepEqual(effect('convert-to-shape'), { type: 'convert-to-shape', shape: 'rectangle', mode: 'relative', width: 0, height: 0, radius: 3 });
  assert.throws(() => effect('convert-to-shape', { shape: 'star' }), /Invalid Convert to Shape/);
  assert.throws(() => effect('convert-to-shape', { mode: 'absolute', width: 0 }), /Invalid Convert to Shape/);
  const triangle = [{ closed: true, segments: [[0, 0], [10, 0], [4, 6]].map(seg) }];
  const rect = applyVectorEffects(triangle, [effect('convert-to-shape', { width: 2, height: 4 })]);
  assert.equal(rect[0].segments.length, 4); assert.deepEqual(bounds(rect), [-1, -2, 11, 8]);
  const exact = applyVectorEffects(triangle, [effect('convert-to-shape', { shape: 'ellipse', mode: 'absolute', width: 4, height: 2 })]);
  assert.deepEqual(bounds(exact), [3, 2, 7, 4], 'Centred on the object');
  assert.ok(exact[0].segments.every((g) => Math.hypot(...g.out) > 0), 'Ellipse anchors are smooth');
  const rounded = applyVectorEffects(square, [effect('convert-to-shape', { shape: 'rounded-rectangle', radius: 2 })]);
  assert.equal(rounded[0].segments.length, 8); assert.deepEqual(bounds(rounded), [0, 0, 10, 10]);
  assert.equal(effectLabel(effect('convert-to-shape', { shape: 'rounded-rectangle' })), 'Rounded Rectangle');
  assert.equal(hasVectorEffects({ appearance: { effects: [effect('convert-to-shape')] } }), true);
});

test('Mosaic is a pixel effect with a checked cell size', async () => {
  const { pixelEffects } = await import('../doc/effects.mjs');
  assert.deepEqual(effect('mosaic', { cell: 2 }), { type: 'mosaic', cell: 2 });
  assert.throws(() => effect('mosaic', { cell: 0 }), /Invalid Mosaic/);
  assert.deepEqual(pixelEffects({ appearance: { effects: [effect('mosaic')] } }).map((e) => e.type), ['mosaic']);
  assert.equal(hasVectorEffects({ appearance: { effects: [effect('mosaic')] } }), false);
});

test('the Effect menu lists every effect once, under Illustrator and Photoshop headings', async () => {
  const { EFFECT_MENU } = await import('../ui/effect-menu.mjs');
  const { EFFECTS } = await import('../doc/effects.mjs');
  assert.deepEqual(EFFECT_MENU.map((s) => s.heading), ['Illustrator Effects', 'Photoshop Effects']);
  const commands = EFFECT_MENU.flatMap((s) => s.items).flatMap((i) => i.items ?? [i]).map((i) => i.command);
  assert.equal(new Set(commands).size, commands.length, 'No duplicates');
  for (const type of Object.keys(EFFECTS).filter((t) => !['pathfinder', 'warp', 'convert-to-shape'].includes(t))) assert.ok(commands.includes(`effect-${type}`), `${type} is in the menu`);
  for (const c of ['convert-rectangle', 'convert-rounded-rectangle', 'convert-ellipse', 'live-unite', 'warp-arc', 'effect-mosaic']) assert.ok(commands.includes(c), c);
});
