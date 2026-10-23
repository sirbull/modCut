import test from 'node:test';
import assert from 'node:assert/strict';
import { outlineStroke } from '../geom/kernel-js.mjs';

const seg = (p) => ({ p, in: [0, 0], out: [0, 0] });
const area = (s) => s.segments.reduce((sum, g, i) => { const n = s.segments[(i + 1) % s.segments.length].p; return sum + g.p[0] * n[1] - n[0] * g.p[1]; }, 0) / 2;
const near = (a, b, tol = .02) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);
const line = [{ closed: false, segments: [seg([0, 0]), seg([20, 0])] }];
const xRanges = rings => rings.map(r => {
  const xs = r.segments.map(s => s.p[0]); return [Math.min(...xs), Math.max(...xs)];
}).sort((a, b) => a[0] - b[0]);

test('dash lengths and gaps become separate filled contours', async () => {
  const rings = await outlineStroke(line, { width: 2, dash: { array: [4, 2] } });
  assert.deepEqual(xRanges(rings), [[0, 4], [6, 10], [12, 16], [18, 20]]);
  near(rings.reduce((sum, ring) => sum + Math.abs(area(ring)), 0), 28);
});

test('dash offset wraps in both directions, and each subpath restarts the pattern', async () => {
  const options = { width: 2, dash: { array: [4, 2], offset: 1 } };
  const expected = [[0, 3], [5, 9], [11, 15], [17, 20]];
  assert.deepEqual(xRanges(await outlineStroke(line, options)), expected);
  for (const offset of [-5, 13]) assert.deepEqual(xRanges(await outlineStroke(line, { ...options, dash: { ...options.dash, offset } })), expected);
  const other = { ...line[0], segments: [seg([0, 5]), seg([20, 5])] };
  assert.deepEqual(xRanges(await outlineStroke([...line, other], options)), expected.flatMap(r => [r, r]));
});

test('odd dash arrays repeat with alternating paint and gaps', async () => {
  const options = { width: 1, dash: { array: [3, 2, 1] } };
  assert.deepEqual(xRanges(await outlineStroke(line, options)), [[0, 3], [5, 6], [9, 11], [12, 15], [17, 18]]);
});

test('every dash gets the chosen end caps', async () => {
  const path = [{ closed: false, segments: [seg([0, 0]), seg([10, 0])] }];
  const options = { width: 2, dash: { array: [2, 4] } };
  assert.deepEqual(xRanges(await outlineStroke(path, { ...options, cap: 'square' })), [[-1, 3], [5, 9]]);
  const rounded = await outlineStroke(path, { ...options, cap: 'round', tolerance: .001 });
  assert.equal(rounded.length, 2);
  for (const ring of rounded) near(Math.abs(area(ring)), 4 + Math.PI, .01);
});

test('zero-length dashes make round dots and square dots aligned with the tangent', async () => {
  const options = { width: 2, dash: { array: [0, 4] } };
  assert.deepEqual(await outlineStroke(line, options), [], 'Butt caps paint no area for a zero-length dash');
  const dots = await outlineStroke(line, { ...options, cap: 'round', tolerance: .001 });
  assert.equal(dots.length, 6, 'Dots include both endpoints');
  for (const dot of dots) near(Math.abs(area(dot)), Math.PI, .01);
  const diagonal = [{ closed: false, segments: [seg([0, 0]), seg([10, 10])] }];
  const squares = await outlineStroke(diagonal, { ...options, cap: 'square' });
  assert.equal(squares.length, 4);
  near(xRanges(squares)[0][0], -Math.SQRT2);
  for (const dot of squares) near(Math.abs(area(dot)), 4);
});

test('closed paths join dashes across the seam and keep joins across zero gaps', async () => {
  const square = [{ closed: true, segments: [[0, 0], [10, 0], [10, 10], [0, 10]].map(seg) }];
  const rings = await outlineStroke(square, { width: 2, dash: { array: [12, 8], offset: 4 } });
  assert.equal(rings.length, 2);
  near(rings.reduce((sum, ring) => sum + Math.abs(area(ring)), 0), 48);
  for (const array of [[50, 1], [10, 0], [], [0, 0]]) {
    assert.deepEqual(await outlineStroke(square, { width: 2, dash: { array } }), await outlineStroke(square, { width: 2 }));
  }
  const dots = await outlineStroke(square, { width: 2, cap: 'round', dash: { array: [0, 10] } });
  assert.equal(dots.length, 4, 'A dot at the seam is painted once');
});

test('curved dashes follow arc length, preserving gaps along a cubic curve', async () => {
  const curve = [{ closed: false, segments: [
    { p: [0, 0], in: [0, 0], out: [0, 10] }, { p: [10, 0], in: [0, 10], out: [0, 0] }
  ] }]; // This cubic has a length of exactly 20.
  const rings = await outlineStroke(curve, { width: .2, dash: { array: [2, 3] }, tolerance: .001 });
  assert.equal(rings.length, 4);
  near(rings.reduce((sum, ring) => sum + Math.abs(area(ring)), 0), 1.6, .005);
  assert.ok(rings.every(ring => ring.closed && ring.segments.length >= 4));
});

test('dash validation rejects invalid data and bounds the work for tiny patterns', async () => {
  for (const dash of [{ array: [-1, 2] }, { array: [NaN] }, { array: [Infinity] }, { array: [1], offset: NaN }, { array: '2 1' }]) {
    await assert.rejects(outlineStroke(line, { width: 1, dash }), /Invalid stroke dash/);
  }
  await assert.rejects(outlineStroke(line, { width: 1, dash: { array: [1e-10, 1e-10] } }), error => error.code === 'GEOMETRY_LIMIT');
});

test('an open line becomes a rectangle with butt caps and longer with square caps', async () => {
  const line = [{ closed: false, segments: [seg([0, 0]), seg([10, 0])] }];
  const butt = await outlineStroke(line, { width: 2 });
  assert.equal(butt.length, 1); near(Math.abs(area(butt[0])), 20);
  const square = await outlineStroke(line, { width: 2, cap: 'square' });
  near(Math.abs(area(square[0])), 24);
  const round = await outlineStroke(line, { width: 2, cap: 'round' });
  near(Math.abs(area(round[0])), 20 + Math.PI, .05);
});

test('a closed square stroke becomes a band: an outer ring and a hole winding the other way', async () => {
  const square = [{ closed: true, segments: [[0, 0], [10, 0], [10, 10], [0, 10]].map(seg) }];
  const band = await outlineStroke(square, { width: 2 });
  assert.equal(band.length, 2);
  const areas = band.map(area).sort((a, b) => Math.abs(b) - Math.abs(a));
  near(Math.abs(areas[0]), 144); near(Math.abs(areas[1]), 64);
  assert.ok(Math.sign(areas[0]) !== Math.sign(areas[1]), 'the hole winds the other way');
  await assert.rejects(outlineStroke(square, { width: 0 }), /stroke width/);
});
