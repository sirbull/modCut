import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createFixtures, compare, decode, encode, oracle } from './spike-fixtures.mjs';

test('the committed provisional corpus is reproducible and has 30 named cases', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./vectorcraft-fixtures.json', import.meta.url)));
  const cases = createFixtures();
  assert.equal(cases.length, 30); assert.equal(new Set(cases.map((c) => c.name)).size, 30);
  assert.deepEqual(cases, fixtures.cases);
});

test('comparison measures filled area regardless of orientation of disjoint contours', () => {
  const item = createFixtures().find((c) => c.name === 'overlap-exclude');
  assert.ok(Math.abs(item.area - 500) < 1e-9);
  const flipped = decode(item.expected); flipped.children[1].reverse();
  assert.equal(compare(item.expected, encode(flipped)).pass, true);
  assert.equal(compare(item.expected, []).pass, false);
});

test('comparison rejects equal-area shapes with displaced boundaries and handles empty results', () => {
  const expected = encode(new oracle.Path.Rectangle({ point: [0, 0], size: [10, 10], insert: false }));
  const shifted = decode(expected); shifted.translate([.02, 0]);
  const result = compare(expected, encode(shifted));
  assert.ok(result.relativeAreaError < .001); assert.equal(result.pass, false);
  assert.equal(compare([], []).pass, true);
});
