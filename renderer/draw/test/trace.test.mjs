import test from 'node:test';
import assert from 'node:assert/strict';
import { quantize, removeNoise, contours, ringArea, simplifyRing, traceScale, ringCorners } from '../geom/trace.mjs';

function image(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const c = paint(x, y), i = (y * width + x) * 4; data.set([...c, 255], i); }
  return { width, height, data };
}
const W = [255, 255, 255], K = [0, 0, 0], R = [220, 20, 20];

test('black and white: a square with a hole gives an outer ring and a hole winding the other way', () => {
  const img = image(10, 10, (x, y) => x >= 2 && x < 8 && y >= 2 && y < 8 && !(x >= 4 && x < 6 && y >= 4 && y < 6) ? K : W);
  const { labels, palette } = quantize(img, { mode: 'bw' });
  assert.deepEqual(palette, [[0, 0, 0]]);
  const rings = contours(labels, 10, 10, 0).map((r) => simplifyRing(r, .5));
  assert.equal(rings.length, 2);
  const areas = rings.map(ringArea).sort((a, b) => Math.abs(b) - Math.abs(a));
  assert.equal(Math.abs(areas[0]), 36); assert.equal(Math.abs(areas[1]), 4); assert.ok(Math.sign(areas[0]) !== Math.sign(areas[1]));
  assert.equal(rings.find((r) => Math.abs(ringArea(r)) === 36).length, 4, 'Straight runs collapse to four corners');
});

test('diagonal pixels at a saddle stay two separate rings', () => {
  const img = image(4, 4, (x, y) => (x === 1 && y === 1) || (x === 2 && y === 2) ? K : W);
  const rings = contours(quantize(img, { mode: 'bw' }).labels, 4, 4, 0);
  assert.equal(rings.length, 2); rings.forEach((r) => assert.equal(Math.abs(ringArea(r)), 1));
});

test('colour quantisation finds the colours, ignores white and noise is absorbed', () => {
  const img = image(20, 10, (x) => x < 10 ? R : W);
  const { labels, palette } = quantize(img, { mode: 'color', colors: 2, ignoreWhite: true });
  assert.equal(palette.length, 2); assert.equal(labels.filter((l) => l === -1).length, 100, 'White is ignored');
  const speck = Int32Array.from({ length: 100 }, (_, i) => i === 55 ? 1 : 0);
  assert.equal(removeNoise(speck, 10, 10, 4)[55], 0, 'A one-pixel speck takes the colour around it');
  assert.equal(traceScale(4000, 4000, 1_000_000), .25);
});
test('corners are the sharp turns, not the gentle ones', () => {
  assert.deepEqual(ringCorners([[0, 0], [20, 0], [20, 20], [0, 20]]), [0, 1, 2, 3]);
  const circle = Array.from({ length: 24 }, (_, i) => [Math.cos(i * Math.PI / 12) * 10, Math.sin(i * Math.PI / 12) * 10]);
  assert.deepEqual(ringCorners(circle), []);
});
