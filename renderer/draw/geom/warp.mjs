/**
 * Warp (D4.3): Illustrator's Effect > Warp styles as point mappings in the object's box. `u` runs -1..1 from
 * left to right and `v` -1..1 from top to bottom; `bend` is -1..1 (the dialog's -100..100 %). Vertical
 * orientation swaps the axes; Distortion leans the box like a perspective. Pure.
 */
export const WARP_STYLES = Object.freeze({
  arc: 'Arc', 'arc-lower': 'Arc Lower', 'arc-upper': 'Arc Upper', arch: 'Arch', bulge: 'Bulge', 'shell-lower': 'Shell Lower',
  'shell-upper': 'Shell Upper', flag: 'Flag', wave: 'Wave', fish: 'Fish', rise: 'Rise', fisheye: 'Fisheye', inflate: 'Inflate',
  squeeze: 'Squeeze', twist: 'Twist',
});
const bow = (u) => 1 - u * u;

/** [u, v] after the style, for -1..1 box coordinates (y down, so a positive bend lifts the middle). */
export function warpStyle(style, b, u, v) {
  switch (style) {
    case 'arc': {
      // The box bent round a circle: its middle line keeps its length.
      if (Math.abs(b) < 1e-6) return [u, v];
      const angle = u * b * Math.PI / 2, radius = 1 / (b * Math.PI / 2), r = radius + v;
      return [r * Math.sin(angle), radius - r * Math.cos(angle)];
    }
    case 'arc-lower': return [u, v - b * bow(u) * (1 + v) / 2];
    case 'arc-upper': return [u, v - b * bow(u) * (1 - v) / 2];
    case 'arch': return [u, v - b * bow(u)];
    case 'bulge': return [u, v * (1 + b * bow(u))];
    case 'shell-lower': return [u * (1 + b * (1 + v) / 4), v + b * bow(u) * (1 + v) / 2];
    case 'shell-upper': return [u * (1 + b * (1 - v) / 4), v - b * bow(u) * (1 - v) / 2];
    case 'flag': return [u, v - b * Math.sin(u * Math.PI) / 2];
    case 'wave': return [u, v - b * Math.sin(u * Math.PI) * (1 - v * v / 2) / 2];
    // Fish: fattest towards the head (left), back to the box at both ends.
    case 'fish': return [u, v * (1 + b * bow(u) * (1 - u))];
    // Rise: climbs to the right on a curve, centred so the box stays in place on average.
    case 'rise': return [u, v - b * ((u + 1) ** 2 / 4 - 1 / 3)];
    case 'fisheye': { const k = 1 + b * Math.max(0, 1 - (u * u + v * v) / 2); return [u * k, v * k]; }
    case 'inflate': return [u * (1 + b * bow(v) / 2), v * (1 + b * bow(u) / 2)];
    case 'squeeze': return [u * (1 - b * bow(v) / 2), v * (1 + b * bow(u) / 2)];
    case 'twist': { const a = -b * Math.PI / 2 * Math.max(0, 1 - Math.hypot(u, v) / Math.SQRT2), c = Math.cos(a), s = Math.sin(a); return [u * c - v * s, u * s + v * c]; }
    default: throw new Error(`Unknown warp style: ${style}`);
  }
}
/**
 * A function mapping a point inside `box` ({x, y, width, height}) through the warp. `bend`,
 * `horizontal` and `vertical` are percentages as in the dialog.
 */
export function warpMapping(box, { style = 'arc', bend = 50, horizontal = 0, vertical = 0, orientation = 'horizontal' } = {}) {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, hx = box.width / 2 || 1, hy = box.height / 2 || 1;
  const b = bend / 100, dh = horizontal / 100, dv = vertical / 100, swap = orientation === 'vertical';
  return ([x, y]) => {
    let u = (x - cx) / hx, v = (y - cy) / hy;
    if (swap) [u, v] = [v, u];
    // Distortion first: horizontal widens one side (left or right), vertical the top or bottom.
    let [p, q] = [u * (1 + dv * v / 2), v * (1 + dh * u / 2)];
    [p, q] = warpStyle(style, b, p, q);
    if (swap) [p, q] = [q, p];
    return [cx + p * hx, cy + q * hy];
  };
}
