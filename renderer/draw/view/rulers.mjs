export const RULER_SIZE = 23;
export const RULER_UNITS = Object.freeze([
  { id: 'mm', label: 'Millimeters', mm: 1 },
  { id: 'cm', label: 'Centimeters', mm: 10 },
  { id: 'in', label: 'Inches', mm: 25.4 },
  { id: 'px', label: 'Pixels', mm: 25.4 / 96 },
  { id: 'pt', label: 'Points (pt)', mm: 25.4 / 72 },
  { id: 'pc', label: 'Picas', mm: 25.4 / 6 },
  { id: '%', label: 'Percentage' },
]);

export function rulerUnit(state) {
  const id = state.ui?.rulerUnit ?? state.document.data.units;
  return RULER_UNITS.find(unit => unit.id === id) ?? RULER_UNITS[0];
}

export function rulerScale(unit, board, axis) {
  return unit.id === '%' ? board[axis === 'x' ? 'width' : 'height'] / 100 : unit.mm;
}

export function rulerNumber(value) {
  return String(Number(value.toFixed(10)));
}

/** Unit values at regular screen intervals; integer indices avoid accumulated rounding errors. */
export function rulerTicks(first, last, pixels) {
  const slope = (last - first) / pixels;
  if (!Number.isFinite(slope) || Math.abs(slope) < 1e-12 || pixels <= 0) return [];
  const nice = raw => {
    const base = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].find(n => n * base >= raw) * base;
  };
  let major = nice(65 * Math.abs(slope));
  const labelLength = Math.max(...[first, last].map(value => rulerNumber(Math.round(value / major) * major).length));
  major = nice(Math.max(65, labelLength * 5.5 + 14) * Math.abs(slope));
  const minor = major / 5;
  const low = Math.ceil(Math.min(first, last) / minor - 1e-9), high = Math.floor(Math.max(first, last) / minor + 1e-9);
  return Array.from({ length: Math.max(0, high - low + 1) }, (_, i) => {
    const index = low + i, value = index * minor;
    return { value, pixel: (value - first) / slope, major: index % 5 === 0 };
  });
}

export function rulerAt(point, size, visible) {
  if (!visible || point.x < 0 || point.y < 0 || point.x > size.width || point.y > size.height) return null;
  if (point.y < RULER_SIZE) return point.x < RULER_SIZE ? 'corner' : 'y';
  return point.x < RULER_SIZE ? 'x' : null;
}

/** Clip a world-axis guide to the usable screen, including when Rotate View is active. */
export function guideSegment(scope, guide, inset = 0) {
  const view = scope.view, vertical = guide.axis === 'x';
  const origin = view.projectToView(new scope.Point(vertical ? [guide.value, 0] : [0, guide.value]));
  const direction = new scope.Point(vertical ? [0, 1] : [1, 0]).rotate(view.rotation);
  let low = -Infinity, high = Infinity;
  for (const [axis, end] of [['x', view.viewSize.width], ['y', view.viewSize.height]]) {
    const d = direction[axis], p = origin[axis];
    if (Math.abs(d) < 1e-10) { if (p < inset || p > end) return null; }
    else {
      const a = (inset - p) / d, b = (end - p) / d;
      low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
    }
  }
  return low <= high ? [origin.add(direction.multiply(low)), origin.add(direction.multiply(high))] : null;
}
