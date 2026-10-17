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
