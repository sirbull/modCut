import assert from 'node:assert/strict';
import test from 'node:test';
import { alignOffsets, alignReference, distributeOffsets, spacingOffsets, unionBox } from '../geom/align.mjs';

const boxes = [
  { id: 'a', x: 0, y: 0, width: 10, height: 10 },
  { id: 'b', x: 30, y: 5, width: 20, height: 4 },
  { id: 'c', x: 90, y: 20, width: 10, height: 30 },
];
const artboard = { x: 0, y: 0, width: 200, height: 100 };
const map = (result) => Object.fromEntries(result.map((r) => [r.id, r.offset]));

test('Align To selection, artboard and key object', () => {
  assert.equal(unionBox([]), null);
  assert.deepEqual(unionBox(boxes), { x: 0, y: 0, width: 100, height: 50 });
  const selection = alignReference(boxes, 'selection');
  assert.deepEqual(map(alignOffsets(boxes, 'right', selection)), { a: [90, 0], b: [50, 0], c: [0, 0] });
  assert.deepEqual(map(alignOffsets(boxes, 'centerY', selection)), { a: [0, 20], b: [0, 18], c: [0, -10] });
  assert.equal(alignReference([boxes[0]], 'selection', { artboard }).kind, 'artboard', 'One object aligns to the artboard');
  assert.deepEqual(map(alignOffsets(boxes, 'bottom', alignReference(boxes, 'artboard', { artboard }))), { a: [0, 90], b: [0, 91], c: [0, 50] });
  const key = alignReference(boxes, 'key', { keyId: 'b' });
  assert.deepEqual(map(alignOffsets(boxes, 'left', key)), { a: [30, 0], b: [0, 0], c: [-60, 0] });
  assert.deepEqual(map(alignOffsets(boxes, 'centerX', key)), { a: [35, 0], b: [0, 0], c: [-55, 0] });
  assert.throws(() => alignReference(boxes, 'key', { keyId: 'missing' }), /key object/);
  assert.throws(() => alignReference(boxes, 'artboard'), /artboard/);
  assert.throws(() => alignReference(boxes, 'page'), /Unknown/);
  assert.throws(() => alignOffsets(boxes, 'middle', selection), /Unknown/);
});

test('Distribute Objects spaces edges and centers evenly', () => {
  const selection = alignReference(boxes, 'selection');
  assert.deepEqual(map(distributeOffsets(boxes, 'left', selection)), { a: [0, 0], b: [15, 0], c: [0, 0] });
  assert.deepEqual(map(distributeOffsets(boxes, 'centerX', selection)), { a: [0, 0], b: [10, 0], c: [0, 0] });
  assert.deepEqual(map(distributeOffsets(boxes, 'top', selection)), { a: [0, 0], b: [0, 5], c: [0, 0] });
  assert.deepEqual(map(distributeOffsets(boxes.slice(0, 2), 'left', selection)), { a: [0, 0], b: [0, 0] }, 'Two objects need an artboard');
  const board = alignReference(boxes, 'artboard', { artboard });
  assert.deepEqual(map(distributeOffsets(boxes, 'right', board)), { a: [0, 0], b: [55, 0], c: [100, 0] });
  const key = alignReference(boxes, 'key', { keyId: 'c' });
  assert.deepEqual(map(distributeOffsets(boxes, 'left', key)), { a: [0, 0], b: [15, 0], c: [0, 0] });
  assert.throws(() => distributeOffsets(boxes, 'diagonal', selection), /Unknown/);
});

test('Distribute Spacing keeps outer objects or an exact key gap', () => {
  const selection = alignReference(boxes, 'selection');
  assert.deepEqual(map(spacingOffsets(boxes, 'x', selection)), { a: [0, 0], b: [10, 0], c: [0, 0] });
  assert.deepEqual(map(spacingOffsets(boxes.slice(0, 2), 'x', selection)), { a: [0, 0], b: [0, 0] });
  assert.deepEqual(map(spacingOffsets(boxes, 'x', alignReference(boxes, 'artboard', { artboard }))), { a: [0, 0], b: [60, 0], c: [100, 0] });
  const key = alignReference(boxes, 'key', { keyId: 'b' });
  assert.deepEqual(map(spacingOffsets(boxes, 'x', key, 5)), { a: [15, 0], b: [0, 0], c: [-35, 0] });
  assert.deepEqual(map(spacingOffsets(boxes, 'y', key, 0)), { a: [0, -5], b: [0, 0], c: [0, -11] });
  assert.deepEqual(map(spacingOffsets([boxes[0]], 'x', key, 5)), { a: [0, 0] });
  assert.throws(() => spacingOffsets(boxes, 'x', key, NaN), /valid spacing/);
  assert.throws(() => spacingOffsets(boxes, 'z', key), /Unknown/);
});

test('selection spacing preserves spatial order and endpoints with unequal and overlapping sizes', () => {
  // Selection order is deliberately different from the order on the canvas.
  for (const axis of ['x', 'y']) {
    const size = axis === 'x' ? 'width' : 'height';
    for (const middleSize of [20, 90]) {
      const items = [
        { id: 'last', x: 90, y: 90, width: 10, height: 10 },
        { id: 'first', x: 0, y: 0, width: 10, height: 10 },
        { id: 'middle', x: 30, y: 30, width: middleSize, height: middleSize },
      ];
      const offsets = map(spacingOffsets(items, axis, alignReference(items, 'selection')));
      assert.deepEqual(offsets.first, [0, 0]);
      assert.deepEqual(offsets.last, [0, 0]);
      const placed = items.map(b => ({ ...b, [axis]: b[axis] + offsets[b.id][axis === 'x' ? 0 : 1] })).sort((a,b) => a[axis] - b[axis]);
      assert.deepEqual(placed.map(b => b.id), ['first', 'middle', 'last']);
      assert.equal(placed[1][axis] - placed[0][axis] - placed[0][size], placed[2][axis] - placed[1][axis] - placed[1][size]);
    }
  }
});
