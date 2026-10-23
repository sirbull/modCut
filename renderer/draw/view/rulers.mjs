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

/** Artboard fractions a dragged guide is drawn to. */
export const GUIDE_SNAPS = Object.freeze([1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4]);

/**
 * Magnetic guide snapping that lets go when the pointer keeps pushing: a fraction within `zone`
 * snaps, pulling past `release` frees it, and a freed fraction stays free until the pointer is
 * `rearm` away again, so values just beside it (49 %) are easy to reach.
 */
export function createGuideSnapper({ zone = 6, release = 12, rearm = 30 } = {}) {
  let snapped = null; const freed = new Set();
  const distanceOf = (raw, board, axis, pixel) => fraction =>
    Math.abs(raw - (board[axis] + fraction * board[axis === 'x' ? 'width' : 'height'])) * pixel;
  return {
    /** Starting from an existing guide keeps its value: it is held on the fraction it sits on, never pulled to a nearby one. */
    reset(start) {
      snapped = null; freed.clear(); if (!start) return;
      const distance = distanceOf(start.value, start.board, start.axis, start.pixel);
      for (const fraction of GUIDE_SNAPS) if (distance(fraction) <= zone) {
        if (distance(fraction) < .5 && snapped === null) snapped = fraction; else freed.add(fraction);
      }
    },
    /** `raw` and the result are world values; `pixel` is screen pixels per world unit. */
    snap(raw, board, axis, pixel, enabled = true) {
      const origin = board[axis], length = board[axis === 'x' ? 'width' : 'height'], distance = distanceOf(raw, board, axis, pixel);
      for (const fraction of freed) if (distance(fraction) > rearm) freed.delete(fraction);
      if (snapped !== null && distance(snapped) > release) { freed.add(snapped); snapped = null; }
      if (!enabled) { snapped = null; return { value: raw, fraction: null }; }
      if (snapped === null) {
        const near = GUIDE_SNAPS.filter(f => !freed.has(f) && distance(f) <= zone).sort((a, b) => distance(a) - distance(b))[0];
        snapped = near ?? null;
      }
      return snapped === null ? { value: raw, fraction: null } : { value: origin + snapped * length, fraction: snapped };
    },
  };
}

/** A guide's position from the artboard origin as percent, millimetres and inches. */
export function guideReadout(guide, board) {
  const horizontal = guide.axis === 'x', mm = guide.value - board[guide.axis];
  const percent = mm / board[horizontal ? 'width' : 'height'] * 100;
  const values = { '%': `${Number(percent.toFixed(2))} %`, mm: `${mm.toFixed(1)} mm`, in: `${(mm / 25.4).toFixed(3)} in` };
  return { axis: horizontal ? 'X' : 'Y', percent, mm, inches: mm / 25.4, values };
}

/** Status text with the ruler unit first, then the others. */
export function guideReadoutText(guide, board, unitId = 'mm') {
  const { axis, values } = guideReadout(guide, board), first = values[unitId] ? unitId : 'mm';
  return `Guide ${axis}  ${[values[first], ...Object.entries(values).filter(([id]) => id !== first).map(([, text]) => text)].join(' · ')}`;
}

const READOUT_DIGITS = Object.freeze({ mm: 2, cm: 3, in: 3, px: 1, pt: 1, pc: 2, '%': 1 });

/**
 * Status bar text in the ruler unit: the pointer from the artboard origin, as the rulers measure it,
 * then what a drag changes (move ΔX/ΔY, resize W/H, rotate angle).
 */
export function pointerReadoutText(point, board, unit, drag = null) {
  const digits = READOUT_DIGITS[unit.id] ?? 2;
  const n = (mm, axis) => { const v = Number((mm / rulerScale(unit, board, axis)).toFixed(digits)); return (v || 0).toFixed(digits); };
  const parts = [];
  if (point) parts.push(`X ${n(point.x - board.x, 'x')}  Y ${n(point.y - board.y, 'y')}`);
  if (drag?.kind === 'move') parts.push(`ΔX ${n(drag.dx, 'x')}  ΔY ${n(drag.dy, 'y')}`);
  if (drag?.kind === 'resize') parts.push(`W ${n(drag.width, 'x')}  H ${n(drag.height, 'y')}`);
  if (!parts.length) {
    // Nothing to follow yet: the artboard size, in millimetres when the unit is a percentage of it.
    const size = unit.id === '%' ? RULER_UNITS[0] : unit, d = READOUT_DIGITS[size.id];
    return `${(board.width / size.mm).toFixed(d)} × ${(board.height / size.mm).toFixed(d)} ${size.id}`;
  }
  const text = `${parts.join(' · ')} ${unit.id}`;
  return drag?.kind === 'rotate' ? `${text} · ${(Number(drag.angle.toFixed(1)) || 0).toFixed(1)}°` : text;
}
