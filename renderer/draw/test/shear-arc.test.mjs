import test from 'node:test';
import assert from 'node:assert/strict';
import { operationMatrix, dragTransform, dialogOperation, TRANSFORM_TOOLS } from '../geom/transforms.mjs';
import { shapeFromDrag, SHAPE_TOOLS } from '../tools/shapes.mjs';
import { createDocument, createNode, validateDocument } from '../doc/schema.mjs';

const apply = ([a, b, c, d, e, f], [x, y]) => [a * x + c * y + e, b * x + d * y + f].map((v) => Math.round(v * 1e5) / 1e5 + 0);

test('Shear slants the top right (horizontal) or the right side up (vertical) around the origin', () => {
  assert.ok(TRANSFORM_TOOLS.includes('shear'));
  const h = operationMatrix({ tool: 'shear', angle: 45, axis: 'horizontal' }, [0, 10]);
  assert.deepEqual(apply(h, [0, 0]), [10, 0]); assert.deepEqual(apply(h, [3, 10]), [3, 10], 'the origin line stays');
  const v = operationMatrix({ tool: 'shear', angle: 45, axis: 'vertical' }, [0, 0]);
  assert.deepEqual(apply(v, [10, 0]), [10, -10]);
  assert.throws(() => operationMatrix({ tool: 'shear', angle: 90, axis: 'horizontal' }, [0, 0]), /between/);
  assert.deepEqual(dialogOperation('shear', { angle: '30', axis: 'vertical' }), { tool: 'shear', angle: 30, axis: 'vertical' });
});

test('dragging with Shear follows the dragged point along the dominant axis', () => {
  const op = dragTransform('shear', [0, 10], [0, 0], [5, 0]);
  assert.equal(op.axis, 'horizontal'); assert.deepEqual(apply(operationMatrix(op, [0, 10]), [0, 0]), [5, 0]);
  const up = dragTransform('shear', [0, 0], [10, 0], [10, -4]);
  assert.equal(up.axis, 'vertical'); assert.deepEqual(apply(operationMatrix(up, [0, 0]), [10, 0]), [10, -4]);
  assert.equal(dragTransform('shear', [0, 0], [10, 0], [10, -4], true).axis, 'horizontal', 'Shift keeps the horizontal axis');
});

test('the Arc tool draws an open, stroked quarter ellipse as a plain path', () => {
  assert.ok(SHAPE_TOOLS.includes('arc'));
  const arc = shapeFromDrag('arc', [0, 0], [20, 10], { fill: '#FFFFFF', stroke: '#000000', strokeWidth: 1 });
  assert.equal(arc.type, 'path'); assert.equal(arc.subpaths[0].closed, false);
  assert.deepEqual(arc.subpaths[0].segments.map((s) => s.p), [[0, 0], [20, 10]]);
  assert.ok(Math.abs(arc.subpaths[0].segments[0].out[0] - 11.0457) < 1e-3 && arc.subpaths[0].segments[1].in[1] < 0);
  assert.equal(arc.appearance.fills.length, 0); assert.equal(arc.appearance.strokes[0].width, 1);
  const square = shapeFromDrag('arc', [0, 0], [20, 10], { shift: true });
  assert.deepEqual(square.subpaths[0].segments[1].p, [20, 20], 'Shift makes it a circular quarter');
  const data = createDocument({ layers: [createNode('layer', { children: [arc] })] }); assert.deepEqual(validateDocument(data), []);
});
