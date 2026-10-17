import test from 'node:test';
import assert from 'node:assert/strict';
import { outlineStroke } from '../geom/kernel-js.mjs';

const seg = (p) => ({ p, in: [0, 0], out: [0, 0] });
const area = (s) => s.segments.reduce((sum, g, i) => { const n = s.segments[(i + 1) % s.segments.length].p; return sum + g.p[0] * n[1] - n[0] * g.p[1]; }, 0) / 2;
const near = (a, b, tol = .02) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

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
