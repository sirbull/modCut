import test from 'node:test';
import assert from 'node:assert/strict';
import { scribble } from '../geom/scribble.mjs';
import { applyVectorEffects, effect, scribbleOf } from '../doc/effects.mjs';

const square = [[0, 0], [20, 0], [20, 20], [0, 20]];
test('a square becomes one back-and-forth line inside it', () => {
  const [line, ...rest] = scribble([square], { angle: 0, spacing: 2, variation: 0, curviness: 0 });
  assert.equal(rest.length, 0); assert.equal(line.closed, false);
  assert.equal(line.segments.length, 20, 'Ten rows, two ends each');
  assert.deepEqual(line.segments.slice(0, 4).map((s) => s.p), [[0, 1], [20, 1], [20, 3], [0, 3]]);
  for (const s of line.segments) assert.ok(s.p[0] >= -1e-9 && s.p[0] <= 20 + 1e-9 && s.p[1] > 0 && s.p[1] < 20);
});
test('holes split rows, angle turns the lines, the seed repeats the jitter', () => {
  const hole = [[8, 8], [12, 8], [12, 12], [8, 12]];
  const lines = scribble([square, hole], { angle: 0, spacing: 2, variation: 0 });
  const row = lines.flatMap((l) => l.segments.map((s) => s.p)).filter((p) => Math.abs(p[1] - 9) < 1e-9).map((p) => p[0]).sort((a, b) => a - b);
  assert.deepEqual(row, [0, 8, 12, 20], 'The row through the hole stops at its edges');
  const turned = scribble([square], { angle: 90, spacing: 2, variation: 0 })[0].segments;
  assert.ok(Math.abs(turned[0].p[0] - turned[1].p[0]) < 1e-9, 'At 90° the lines run vertically');
  assert.deepEqual(scribble([square], { seed: 7 }), scribble([square], { seed: 7 }));
});
test('the Scribble effect replaces the outline and asks for stroke painting', () => {
  const rect = [{ closed: true, segments: square.map((p) => ({ p, in: [0, 0], out: [0, 0] })) }];
  const e = effect('scribble', { spacing: 4, variation: 0 }), out = applyVectorEffects(rect, [e]);
  assert.ok(out.length >= 1 && out.every((s) => !s.closed));
  assert.equal(scribbleOf({ appearance: { effects: [e] } }).spacing, 4);
  assert.throws(() => effect('scribble', { spacing: 0 }), /Invalid Scribble/);
});
