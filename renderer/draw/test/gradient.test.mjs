import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGradient, gradientVector, vectorGradient, colorAt, addStop, removeStop, updateStop, reverseGradient, setGradientType, setGradientAngle, changeGradient, gradientHex, colorHex, gradientCss } from '../doc/gradient.mjs';
import { appearance } from '../geometry.mjs';
import { createNode, createDocument, validateDocument } from '../doc/schema.mjs';

const box = { x: 10, y: 20, width: 40, height: 20 };
const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${a} vs ${b}`));

test('default gradients span the box: linear left to right, radial from the centre', () => {
  const linear = defaultGradient(box), v = gradientVector(linear);
  near(v.origin, [10, 30]); near(v.destination, [50, 30]);
  const radial = defaultGradient(box, { type: 'radial' });
  near(radial.origin, [30, 30]); assert.equal(radial.length, 20);
  const up = gradientVector(setGradientAngle(linear, 90, box));
  near(up.origin, [30, 40]); near(up.destination, [30, 20], '90° points up on screen');
});

test('the Gradient tool vector sets origin, angle and length', () => {
  const g = vectorGradient(defaultGradient(box), [0, 0], [0, -10]);
  assert.deepEqual(g.origin, [0, 0]); assert.equal(g.angle, 90); assert.equal(g.length, 10);
});

test('stops: add in the widest gap with the colour there, update, remove, reverse', () => {
  let g = defaultGradient(box);
  g = addStop(g); assert.equal(g.stops.length, 3); assert.equal(g.stops[1].offset, .5);
  assert.equal(colorHex(g.stops[1].color), '#808080');
  g = updateStop(g, 1, { color: '#FF0000', offset: .25, opacity: .5 });
  assert.equal(colorHex(g.stops[1].color), '#FF0000'); assert.equal(g.stops[1].opacity, .5);
  g = updateStop(g, 0, { offset: .9 }); assert.deepEqual(g.stops.map((s) => s.offset), [.25, .9, 1], 'stops stay ordered');
  g = reverseGradient(g); assert.deepEqual(g.stops.map((s) => Math.round(s.offset * 100)), [0, 10, 75]);
  g = removeStop(g, 0); assert.equal(g.stops.length, 2); assert.throws(() => removeStop(g, 0), /two stops/);
  assert.throws(() => updateStop(g, 0, { color: 'red' }), /RRGGBB/);
  assert.deepEqual(colorAt(defaultGradient(box), .5).values.map((v) => Math.round(v * 255)), [128, 128, 128]);
});

test('type and paint changes keep stops; gradients validate in a document', () => {
  const g = addStop(defaultGradient(box));
  const radial = setGradientType(g, 'radial', box); assert.equal(radial.type, 'radial'); assert.equal(radial.stops.length, 3);
  const look = changeGradient(appearance('#FF0000', null), 'fill', radial);
  assert.equal(look.fills[0].paint.type, 'radial'); assert.equal(look.fills[0].opacity, 1);
  const stroked = changeGradient(appearance('#FF0000', null), 'stroke', g, { strokeWidth: 2 });
  assert.equal(stroked.strokes[0].width, 2); assert.equal(stroked.strokes[0].paint.type, 'linear');
  assert.equal(gradientHex(g), '#FFFFFF'); assert.match(gradientCss(g), /^linear-gradient\(to right, rgba\(255, 255, 255, 1\) 0%/);
  const data = createDocument({ layers: [createNode('layer', { children: [createNode('path', { appearance: look })] })] });
  assert.deepEqual(validateDocument(data), []);
});

test('moving a stop past another keeps track of it; presets keep the vector of the same type', async () => {
  const { moveStop, applyGradientPreset, GRADIENT_PRESETS, gradientPreviewCss, gradientKey } = await import('../doc/gradient.mjs');
  let g = updateStop(addStop(defaultGradient(box)), 1, { color: '#FF0000' });
  const moved = moveStop(g, 0, .9); assert.equal(moved.index, 1); assert.equal(colorHex(moved.gradient.stops[1].color), '#FFFFFF');
  assert.equal(moveStop(g, 0, -1).gradient.stops[0].offset, 0, 'clamped');
  const sunset = GRADIENT_PRESETS.find((p) => p.id === 'sunset').gradient, sky = vectorGradient(defaultGradient(box), [0, 0], [0, -10]);
  const same = applyGradientPreset(sky, sunset, box); assert.deepEqual(same.origin, [0, 0]); assert.equal(same.angle, 90); assert.equal(same.stops.length, 3);
  const radial = applyGradientPreset(sky, GRADIENT_PRESETS.find((p) => p.gradient.type === 'radial').gradient, box);
  assert.equal(radial.type, 'radial'); near(radial.origin, [30, 30]);
  assert.equal(applyGradientPreset(null, sunset, box).length, 40, 'no gradient yet: fitted to the box');
  assert.match(gradientPreviewCss(radial), /^radial-gradient\(circle closest-side, /);
  assert.equal(gradientKey(same), gradientKey(sunset), 'the key ignores geometry');
  for (const p of GRADIENT_PRESETS) {
    const look = changeGradient(appearance('#FF0000', null), 'fill', applyGradientPreset(null, p.gradient, box));
    assert.deepEqual(validateDocument(createDocument({ layers: [createNode('layer', { children: [createNode('path', { appearance: look })] })] })), [], p.id);
  }
});

test('recent gradients: most recent first, no duplicates, limited, and they survive bad storage', async () => {
  const { recentGradients, rememberRecentGradient, RECENT_GRADIENT_LIMIT } = await import('../doc/recent-gradients.mjs');
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const a = defaultGradient(box), b = setGradientType(a, 'radial', box);
  rememberRecentGradient(a, [], storage); let list = rememberRecentGradient(b, [], storage);
  assert.deepEqual(list.map((g) => g.type), ['radial', 'linear']);
  list = rememberRecentGradient(vectorGradient(a, [0, 0], [5, 5]), [], storage);
  assert.deepEqual(list.map((g) => g.type), ['linear', 'radial'], 'the same look moves to the front');
  assert.equal(list[0].origin, undefined, 'only the look is kept');
  for (let i = 0; i < 15; i++) list = rememberRecentGradient(updateStop(a, 0, { offset: i / 20 }), [], storage);
  assert.equal(list.length, RECENT_GRADIENT_LIMIT);
  store.set('modcut_recent_gradients', '{bad'); assert.deepEqual(recentGradients([a], storage).map((g) => g.type), ['linear']);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(rememberRecentGradient(b, [a], broken).length, 2);
});
