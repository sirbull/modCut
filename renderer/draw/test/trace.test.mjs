import test from 'node:test';
import assert from 'node:assert/strict';
import { quantize, removeNoise, contours, ringArea, simplifyRing, traceScale, ringCorners, traceRegions } from '../geom/trace.mjs';

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

test('black and white retains white regions only when requested, and always ignores transparency', () => {
  const img = image(12, 6, x => x < 6 ? K : W);
  img.data[3] = 0;
  const result = quantize(img, { mode:'bw', ignoreWhite:false });
  assert.deepEqual(result.palette, [K, W]);
  assert.equal(result.labels[0], -1);
  assert.equal(result.labels[1], 0);
  assert.equal(result.labels[6], 1);
  assert.equal(traceRegions(img, {mode:'bw',ignoreWhite:false,noise:0}).length, 2);
  assert.equal(traceRegions(img, {mode:'bw',ignoreWhite:true,noise:0}).length, 1);
});

test('worker trace regions preserve holes, remove inner contours on request and filter physical details', () => {
  const img = image(20, 20, (x,y) => x >= 2 && x < 18 && y >= 2 && y < 18 && !(x >= 7 && x < 13 && y >= 7 && y < 13) ? K : W);
  const options = {mode:'bw',ignoreWhite:true,noise:0};
  const full = traceRegions(img, options);
  assert.equal(full[0].rings.length, 2);
  assert.ok(full[0].rings.some(r => ringArea(r) < 0));
  const outer = traceRegions(img, {...options,outerOnly:true});
  assert.equal(outer[0].rings.length, 1);
  assert.equal(ringArea(outer[0].rings[0]), 256);
  assert.deepEqual(traceRegions(img, {...options,minArea:300}), []);
  assert.deepEqual(traceRegions(img, {...options,threshold:0}), []);
});

test('path fidelity retains more boundary detail and corner sensitivity changes which turns are sharp', () => {
  const img = image(60, 60, (x,y) => Math.hypot(x-30,y-30) < 22 ? K : W);
  const low = traceRegions(img, {fidelity:0,noise:0})[0].rings[0];
  const high = traceRegions(img, {fidelity:100,noise:0})[0].rings[0];
  assert.ok(high.length > low.length, `${high.length} detailed anchors versus ${low.length}`);
  const square = [[0,0],[20,0],[20,20],[0,20]];
  assert.deepEqual(ringCorners(square,120), []);
  assert.deepEqual(ringCorners(square,45), [0,1,2,3]);
});
