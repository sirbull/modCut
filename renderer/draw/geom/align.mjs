/** Pure Align panel math. Boxes are world-space {id,x,y,width,height}; results are per-object translations. */
const AXIS = { x: ['x', 'width'], y: ['y', 'height'] };
export const ALIGN_MODES = Object.freeze({ left: ['x', 0], centerX: ['x', .5], right: ['x', 1], top: ['y', 0], centerY: ['y', .5], bottom: ['y', 1] });
const edge = (box, axis, k) => box[AXIS[axis][0]] + box[AXIS[axis][1]] * k;
const offset = (axis, value) => axis === 'x' ? [value, 0] : [0, value];
export function unionBox(boxes) {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
}
/**
 * Reference box for Align To. One selected object aligns to the artboard, as in Illustrator.
 * The key object never moves.
 */
export function alignReference(boxes, alignTo, { artboard, keyId } = {}) {
  if (alignTo === 'artboard' || (alignTo === 'selection' && boxes.length === 1)) {
    if (!artboard) throw new Error('No active artboard.');
    return { box: artboard, kind: 'artboard' };
  }
  if (alignTo === 'key') {
    const key = boxes.find((b) => b.id === keyId);
    if (!key) throw new Error('Choose a key object from the selection.');
    return { box: key, kind: 'key', keyId };
  }
  if (alignTo !== 'selection') throw new Error(`Unknown Align To: ${alignTo}`);
  return { box: unionBox(boxes), kind: 'selection' };
}
export function alignOffsets(boxes, mode, reference) {
  const [axis, k] = ALIGN_MODES[mode] ?? [];
  if (!axis) throw new Error(`Unknown alignment: ${mode}`);
  const target = edge(reference.box, axis, k);
  return boxes.map((b) => ({ id: b.id, offset: b.id === reference.keyId ? [0, 0] : offset(axis, target - edge(b, axis, k)) }));
}
/** Distribute Objects: equal steps between the chosen edge or center of each object. */
export function distributeOffsets(boxes, mode, reference) {
  const [axis, k] = ALIGN_MODES[mode] ?? [];
  if (!axis) throw new Error(`Unknown distribution: ${mode}`);
  if (boxes.length < (reference.kind === 'artboard' ? 1 : 3)) return boxes.map((b) => ({ id: b.id, offset: [0, 0] }));
  const sorted = [...boxes].sort((a, b) => edge(a, axis, k) - edge(b, axis, k)), [pos, size] = AXIS[axis];
  const first = sorted[0], last = sorted.at(-1);
  const start = reference.kind === 'artboard' ? reference.box[pos] + first[size] * k : edge(first, axis, k);
  const end = reference.kind === 'artboard' ? reference.box[pos] + reference.box[size] - last[size] * (1 - k) : edge(last, axis, k);
  const step = sorted.length > 1 ? (end - start) / (sorted.length - 1) : 0;
  const result = new Map(sorted.map((b, i) => [b.id, offset(axis, start + step * i - edge(b, axis, k))]));
  if (reference.keyId) {
    // Keep the key object fixed by shifting the whole distribution.
    const shift = result.get(reference.keyId);
    for (const [id, value] of result) result.set(id, [value[0] - shift[0], value[1] - shift[1]]);
  }
  return boxes.map((b) => ({ id: b.id, offset: result.get(b.id) }));
}
/** Distribute Spacing: equal gaps, or an exact gap around the key object. */
export function spacingOffsets(boxes, axis, reference, spacing = null) {
  if (!AXIS[axis]) throw new Error(`Unknown spacing axis: ${axis}`);
  const [pos, size] = AXIS[axis], sorted = [...boxes].sort((a, b) => a[pos] - b[pos]);
  if (sorted.length < 2) return boxes.map((b) => ({ id: b.id, offset: [0, 0] }));
  const total = sorted.reduce((sum, b) => sum + b[size], 0);
  let start, gap;
  if (reference.kind === 'key' && spacing !== null) {
    if (!Number.isFinite(spacing)) throw new Error('Enter a valid spacing.');
    gap = spacing;
    const keyIndex = sorted.findIndex((b) => b.id === reference.keyId), before = sorted.slice(0, keyIndex).reduce((sum, b) => sum + b[size] + gap, 0);
    start = sorted[keyIndex][pos] - before;
  } else if (reference.kind === 'artboard') {
    start = reference.box[pos]; gap = (reference.box[size] - total) / (sorted.length - 1);
  } else {
    if (sorted.length < 3) return boxes.map((b) => ({ id: b.id, offset: [0, 0] }));
    start = sorted[0][pos]; gap = (Math.max(...sorted.map((b) => b[pos] + b[size])) - start - total) / (sorted.length - 1);
  }
  const result = new Map();
  let cursor = start;
  for (const b of sorted) { result.set(b.id, offset(axis, cursor - b[pos])); cursor += b[size] + gap; }
  return boxes.map((b) => ({ id: b.id, offset: result.get(b.id) }));
}
