import test from 'node:test';
import assert from 'node:assert/strict';
import { gridLine, snapMove, snapPoint } from '../tools/snapping.mjs';

const grid = { origin: { x: 5, y: 0 }, spacing: { x: 10, y: 10 } };

test('the grid counts from the artboard origin', () => {
  assert.equal(gridLine(13, 5, 10), 15);
  assert.equal(gridLine(-6, 0, 10), -10);
  assert.equal(gridLine(7, 0, 0), 7, 'no spacing, no snapping');
});

test('a drawn point takes a nearby point first, then a guide per axis, else the grid', () => {
  const points = [{ x: 20, y: 20, label: 'anchor' }];
  assert.deepEqual(snapPoint({ x: 21, y: 19 }, { points, grid, tolerance: 2 }),
    { x: 20, y: 20, guides: [{ axis: 'x', value: 20, label: 'anchor' }, { axis: 'y', value: 20, label: '' }] });
  const guided = snapPoint({ x: 31, y: 33 }, { points, guides: [{ axis: 'x', value: 30 }], grid, tolerance: 2 });
  assert.equal(guided.x, 30); assert.equal(guided.y, 30); assert.equal(guided.guides.length, 1);
  assert.deepEqual(snapPoint({ x: 31, y: 33 }, { tolerance: 2 }), { x: 31, y: 33, guides: [] }, 'nothing on: unchanged');
});

test('a move puts the grabbed point on a point, an edge on a guide, or the corner on the grid', () => {
  const box = { x: 0, y: 0, width: 10, height: 4 };
  const onPoint = snapMove(box, { x: 5, y: 2 }, [14, 0], { points: [{ x: 20, y: 3 }], tolerance: 2 });
  assert.deepEqual([onPoint.x, onPoint.y], [15, 1]);
  const onGuide = snapMove(box, { x: 5, y: 2 }, [9, 0], { guides: [{ axis: 'x', value: 20 }], tolerance: 2 });
  assert.equal(onGuide.x, 10, 'the right edge meets the guide'); assert.equal(onGuide.guides[0].label, 'guide');
  const onGrid = snapMove(box, { x: 5, y: 2 }, [12, 7], { grid, tolerance: 2 });
  assert.deepEqual([onGrid.x, onGrid.y], [15, 10]);
});
