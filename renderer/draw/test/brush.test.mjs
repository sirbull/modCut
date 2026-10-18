import test from 'node:test';
import assert from 'node:assert/strict';
import { paintbrushOptions, blobOptions, nibWidth, calligraphicProfile } from '../geom/brush.mjs';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);
test('options are validated', () => {
  assert.equal(paintbrushOptions().size, 2); assert.throws(() => paintbrushOptions({ roundness: 120 }), /roundness/);
  assert.equal(blobOptions({ size: 5 }).size, 5); assert.throws(() => blobOptions({ size: 0 }), /size/);
});
test('a flat nib is thin along its angle and full across it', () => {
  const nib = { angle: 0, roundness: 20 };
  near(nibWidth(0, nib), .2, 1e-9); near(nibWidth(Math.PI / 2, nib), 1);
  near(nibWidth(0, { angle: 0, roundness: 100 }), 1, 1e-9);
});
test('a calligraphic stroke gets a width profile that follows its direction', () => {
  // Right along the nib, then down across it.
  const points = [...Array.from({ length: 11 }, (_, i) => [i, 0]), ...Array.from({ length: 10 }, (_, i) => [10, i + 1])];
  const profile = calligraphicProfile(points, { angle: 0, roundness: 20 }, 20);
  assert.equal(profile.length, 21);
  near(profile[2].left + profile[2].right, .2, 1e-9); near(profile[18].left + profile[18].right, 1, 1e-9);
  assert.equal(calligraphicProfile([[0, 0], [0, 0]], { angle: 0, roundness: 0 }), null);
});
