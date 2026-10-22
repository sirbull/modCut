/**
 * Snap to Point and Snap to Grid (View menu and Properties), as in Illustrator. Pure: world mm in, world mm out.
 * `points` are other objects' anchors, corners and centres; `guides` are ruler guides ({axis, value}: axis 'x'
 * is a vertical line at x = value); `grid` is {origin: {x, y}, spacing: {x, y}} and always snaps.
 * Results carry `guides` ({axis, value, label}) for the dashed feedback lines while dragging.
 */
export function gridLine(value, origin, spacing) {
  return spacing > 0 ? origin + Math.round((value - origin) / spacing) * spacing : value;
}
function nearestPoint(p, points, tolerance) {
  let best = null, distance = tolerance;
  for (const q of points) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < distance) { distance = d; best = q; }
  }
  return best;
}
function nearestGuide(values, axis, guides, tolerance) {
  let best = null, distance = tolerance;
  for (const guide of guides) {
    if (guide.axis !== axis) continue;
    for (const value of values) {
      const offset = guide.value - value;
      if (Math.abs(offset) < distance) { distance = Math.abs(offset); best = { offset, value: guide.value }; }
    }
  }
  return best;
}
const pointGuides = (q) => [{ axis: 'x', value: q.x, label: q.label ?? 'anchor' }, { axis: 'y', value: q.y, label: '' }];

/** Where a drawn point lands: a nearby point first, then a nearby ruler guide per axis, else the grid. */
export function snapPoint(p, { points = [], guides = [], grid = null, tolerance }) {
  const near = nearestPoint(p, points, tolerance);
  if (near) return { x: near.x, y: near.y, guides: pointGuides(near) };
  const result = { x: p.x, y: p.y, guides: [] };
  for (const axis of ['x', 'y']) {
    const guide = nearestGuide([p[axis]], axis, guides, tolerance);
    if (guide) { result[axis] = guide.value; result.guides.push({ axis, value: guide.value, label: 'guide' }); }
    else if (grid) result[axis] = gridLine(p[axis], grid.origin[axis], grid.spacing[axis]);
  }
  return result;
}

/**
 * A move of `box` by `delta` grabbed at `grab`: the grabbed point lands on a nearby point; otherwise each
 * axis takes the nearest ruler guide to an edge or the middle, else the box's top-left corner goes to the grid.
 */
export function snapMove(box, grab, delta, { points = [], guides = [], grid = null, tolerance }) {
  const moved = { x: grab.x + delta[0], y: grab.y + delta[1] };
  const near = nearestPoint(moved, points, tolerance);
  if (near) return { x: delta[0] + near.x - moved.x, y: delta[1] + near.y - moved.y, guides: pointGuides(near) };
  const result = { x: delta[0], y: delta[1], guides: [] };
  for (const [axis, size, index] of [['x', 'width', 0], ['y', 'height', 1]]) {
    const start = box[axis] + delta[index];
    const guide = nearestGuide([start, start + box[size] / 2, start + box[size]], axis, guides, tolerance);
    if (guide) { result[axis] += guide.offset; result.guides.push({ axis, value: guide.value, label: 'guide' }); }
    else if (grid) result[axis] += gridLine(start, grid.origin[axis], grid.spacing[axis]) - start;
  }
  return result;
}
