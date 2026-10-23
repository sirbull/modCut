import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { unite } from '../geom/kernel-js.mjs';
// Independent provisional oracle stays in test code; the geometry layer never imports Paper.js.
import { compare } from '../../../docs/draw/spike-fixtures.mjs';

const fixtures = JSON.parse(readFileSync(new URL('../../../docs/draw/vectorcraft-fixtures.json', import.meta.url)));
const cases = fixtures.cases.filter((c) => c.input.op === 'unite');
for (const fixture of cases) test(`JS union reference: ${fixture.name}`, async () => {
  const inputs = structuredClone([fixture.input.a, fixture.input.b]);
  const original = JSON.stringify(inputs);
  const result = await unite(inputs);
  const comparison = compare(fixture.expected, result.flat());
  assert.ok(comparison.pass, JSON.stringify(comparison));
  assert.equal(JSON.stringify(inputs), original);
  assert.deepEqual(await unite(inputs), result);
});
