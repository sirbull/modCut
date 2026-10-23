/** Pure value logic for scrubby labels: drag a field's title to change its number. */
export const PIXELS_PER_STEP = 2;
export const FAST = 10, FINE = .1;

export function decimalsFor(step) {
  if (!(step > 0)) return 0;
  for (let d = 0; d < 6; d++) { const scaled = step * 10 ** d; if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return d; }
  return 6;
}
/** Default scrub step when a field accepts any value: millimetres move in tenths, other units in whole steps. */
export function inferStep(stepAttribute, label = '') {
  const step = Number.parseFloat(stepAttribute);
  if (Number.isFinite(step) && step > 0) return step;
  return /\bmm\b/.test(label) ? .1 : 1;
}
export function clampValue(value, min, max) {
  let result = value;
  if (Number.isFinite(min)) result = Math.max(min, result);
  if (Number.isFinite(max)) result = Math.min(max, result);
  return result;
}
/**
 * Accumulates horizontal pointer movement into a value. Each call adds the movement since the last
 * call using the modifiers held now, so switching Shift/Alt mid-drag never makes the value jump.
 */
export function createScrubber({ start, step = 1, min, max, pixelsPerStep = PIXELS_PER_STEP }) {
  let value = Number.isFinite(start) ? start : 0, remainder = 0;
  // Keep the finest precision seen so far: the start value's and every step size used.
  let precision = decimalsFor(Math.abs(value % 1));
  return {
    get value() { return value; },
    move(dx, { fast = false, fine = false } = {}) {
      remainder += dx;
      const steps = Math.trunc(remainder / pixelsPerStep);
      if (!steps) return value;
      remainder -= steps * pixelsPerStep;
      const size = step * (fast ? FAST : fine ? FINE : 1);
      precision = Math.max(precision, decimalsFor(size));
      value = clampValue(Number((value + steps * size).toFixed(precision)), min, max);
      return value;
    },
  };
}
/** Arrow-key stepping in a focused field: one step, or ten with Shift. */
export function stepValue(value, direction, { step = 1, min, max, fast = false } = {}) {
  const size = step * (fast ? FAST : 1), start = Number.isFinite(value) ? value : 0;
  return clampValue(Number((start + direction * size).toFixed(Math.max(decimalsFor(size), decimalsFor(Math.abs(start % 1))))), min, max);
}
