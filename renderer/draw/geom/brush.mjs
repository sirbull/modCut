/**
 * Brushes (D4.4). Paintbrush: a calligraphic brush is a flat nib held at `angle`, so the stroke is widest
 * where it runs across the nib and `roundness` (0..100 %) of that where it runs along it; the result is a
 * stroke weight plus a width profile. Blob Brush settings. Pure.
 */
export const PAINTBRUSH_DEFAULTS = Object.freeze({ size: 2, angle: 30, roundness: 30, fidelity: 3, fillNew: false, keepSelected: false });
export const BLOB_DEFAULTS = Object.freeze({ size: 3, fidelity: 3, keepSelected: false, mergeWithSelection: false });

export function paintbrushOptions(options = {}) {
  const o = { ...PAINTBRUSH_DEFAULTS, ...options };
  if (!(Number.isFinite(o.size) && o.size > 0 && o.size <= 1000)) throw new Error('Use a brush size from 0.01 to 1000 mm.');
  if (!(Number.isFinite(o.angle) && o.angle >= -180 && o.angle <= 180)) throw new Error('Use an angle from -180° to 180°.');
  if (!(Number.isFinite(o.roundness) && o.roundness >= 0 && o.roundness <= 100)) throw new Error('Use a roundness from 0 to 100 %.');
  if (!(Number.isInteger(o.fidelity) && o.fidelity >= 1 && o.fidelity <= 5)) throw new Error('Fidelity is 1 to 5.');
  return { size: o.size, angle: o.angle, roundness: o.roundness, fidelity: o.fidelity, fillNew: !!o.fillNew, keepSelected: !!o.keepSelected };
}
export function blobOptions(options = {}) {
  const o = { ...BLOB_DEFAULTS, ...options };
  if (!(Number.isFinite(o.size) && o.size > 0 && o.size <= 1000)) throw new Error('Use a brush size from 0.01 to 1000 mm.');
  if (!(Number.isInteger(o.fidelity) && o.fidelity >= 1 && o.fidelity <= 5)) throw new Error('Fidelity is 1 to 5.');
  return { size: o.size, fidelity: o.fidelity, keepSelected: !!o.keepSelected, mergeWithSelection: !!o.mergeWithSelection };
}

/** Nib width (as a share of the size, 0..1) for a stroke heading `direction` radians (y down). */
export function nibWidth(direction, { angle, roundness }) {
  const across = Math.abs(Math.sin(direction + angle * Math.PI / 180)), r = roundness / 100;
  return r + (1 - r) * across;
}
/**
 * Width profile for a calligraphic stroke along `points` ([[x, y], ...]): `samples` points by length, each
 * side half the nib width there (shares of the brush size, which is the stroke weight).
 */
export function calligraphicProfile(points, brush, samples = 24) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = lengths.at(-1);
  if (!(total > 0)) return null;
  const out = [];
  for (let k = 0; k <= samples; k++) {
    const at = total * k / samples, i = Math.max(1, Math.min(points.length - 1, lengths.findIndex((l) => l >= at) || 1));
    // The heading over a short window, so single jittery points do not flip the width.
    const a = points[Math.max(0, i - 2)], b = points[Math.min(points.length - 1, i + 1)], w = nibWidth(Math.atan2(b[1] - a[1], b[0] - a[0]), brush);
    out.push({ t: k / samples, left: w / 2, right: w / 2 });
  }
  return out;
}
