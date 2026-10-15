import test from 'node:test';
import assert from 'node:assert/strict';
import { createScrubber, decimalsFor, inferStep, stepValue } from '../ui/scrub.mjs';

test('dragging two pixels moves one step', () => {
  const s = createScrubber({ start: 10, step: 1 });
  assert.equal(s.move(1), 10, 'less than one step does nothing yet');
  assert.equal(s.move(1), 11, 'remainder carries over');
  assert.equal(s.move(20), 21);
  assert.equal(s.move(-8), 17, 'dragging left decreases');
});

test('Shift is ten times faster and Alt ten times finer, switchable mid-drag', () => {
  const s = createScrubber({ start: 0, step: .1 });
  assert.equal(s.move(4), .2);
  assert.equal(s.move(4, { fast: true }), 2.2, 'Shift continues from the current value without a jump');
  assert.equal(s.move(2, { fine: true }), 2.21);
  assert.equal(s.move(2, { fine: true }), 2.22, 'no floating point drift');
});

test('start precision is kept', () => {
  assert.equal(createScrubber({ start: 12.345, step: 1 }).move(2), 13.345);
});

test('values clamp to min and max', () => {
  const s = createScrubber({ start: 98, step: 1, min: 0, max: 100 });
  assert.equal(s.move(40), 100);
  assert.equal(s.move(-400, { fast: true }), 0);
});

test('step inference and precision', () => {
  assert.equal(inferStep('any', 'X (mm)'), .1);
  assert.equal(inferStep('any', 'Rotate by (°)'), 1);
  assert.equal(inferStep('0.25', 'Weight'), .25);
  assert.equal(decimalsFor(.1), 1); assert.equal(decimalsFor(.01), 2); assert.equal(decimalsFor(1), 0); assert.equal(decimalsFor(.25), 2);
});

test('arrow stepping', () => {
  assert.equal(stepValue(5, 1, { step: 1 }), 6);
  assert.equal(stepValue(5, -1, { step: .1, fast: true }), 4);
  assert.equal(stepValue(0.2, 1, { step: .1 }), .3);
  assert.equal(stepValue(1, -1, { step: 1, min: 1 }), 1);
  assert.equal(stepValue(12.345, 1, { step: 1 }), 13.345, 'keeps the value\'s own precision');
});
