/**
 * Transform Each and Split Into Grid (D3.6). Pure: matrices are [a, b, c, d, e, f] (x' = a x + c y + e)
 * in world millimetres, boxes are { x, y, width, height }.
 */
export function compose(m, n) {
  // m after n.
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
const translate = (x, y) => [1, 0, 0, 1, x, y];
export const TRANSFORM_EACH_DEFAULTS = Object.freeze({ scaleX: 100, scaleY: 100, moveX: 0, moveY: 0, angle: 0, reflectX: false, reflectY: false, reference: [.5, .5], random: false, copy: false });
/**
 * One object's matrix: scale, reflect and rotate around its own reference point, then move. With
 * `random`, each value is scaled by that object's factor (0 to 1), as Illustrator's Random option does.
 */
export function transformEachMatrix(box, values, factor = 1) {
  const v = { ...TRANSFORM_EACH_DEFAULTS, ...values }, f = v.random ? factor : 1;
  const sx = (100 + (v.scaleX - 100) * f) / 100 * (v.reflectX ? -1 : 1), sy = (100 + (v.scaleY - 100) * f) / 100 * (v.reflectY ? -1 : 1);
  if (!(Math.abs(sx) > 1e-9) || !(Math.abs(sy) > 1e-9)) throw new Error('Scale must not be 0 %.');
  // Illustrator angles turn counterclockwise on screen; y points down here.
  const a = -(v.angle * f) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const px = box.x + box.width * v.reference[0], py = box.y + box.height * v.reference[1];
  let m = translate(-px, -py);
  m = compose([sx, 0, 0, sy, 0, 0], m);
  m = compose([cos, sin, -sin, cos, 0, 0], m);
  m = compose(translate(px + v.moveX * f, py + v.moveY * f), m);
  return m.map((n) => Math.abs(n) < 1e-12 ? 0 : n);
}
/** Split Into Grid: `rows` x `columns` cells inside `box`, separated by the gutters (mm), row by row. */
export function gridCells(box, { rows = 2, columns = 2, rowGutter = 0, columnGutter = 0 } = {}) {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 || rows * columns > 10000) throw new Error('Enter between 1 and 10,000 cells.');
  const height = (box.height - rowGutter * (rows - 1)) / rows, width = (box.width - columnGutter * (columns - 1)) / columns;
  if (!(height > 0) || !(width > 0)) throw new Error('The gutters leave no room for the cells.');
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) cells.push({ x: box.x + c * (width + columnGutter), y: box.y + r * (height + rowGutter), width, height });
  return cells;
}
/**
 * Free Distort: the box's corners [top-left, top-right, bottom-right, bottom-left] move to `corners`;
 * every point maps bilinearly. Subpaths are in world mm; handles map with their end points.
 */
export function distortPoint(box, corners, [x, y]) {
  const u = box.width ? (x - box.x) / box.width : 0, v = box.height ? (y - box.y) / box.height : 0;
  const [tl, tr, br, bl] = corners;
  return [0, 1].map((k) => (1 - u) * (1 - v) * tl[k] + u * (1 - v) * tr[k] + u * v * br[k] + (1 - u) * v * bl[k]);
}
export function distortSubpaths(subpaths, box, corners) {
  const map = (p) => distortPoint(box, corners, p);
  return subpaths.map((s) => ({ closed: s.closed, segments: s.segments.map((g) => {
    const p = map(g.p), i = map([g.p[0] + g.in[0], g.p[1] + g.in[1]]), o = map([g.p[0] + g.out[0], g.p[1] + g.out[1]]);
    return { p, in: [i[0] - p[0], i[1] - p[1]], out: [o[0] - p[0], o[1] - p[1]] };
  }) }));
}
export const boxCorners = (b) => [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]];
/**
 * Crop Image: insets (mm, from the visible edges; negative uncrops) give the new crop (fractions of the
 * source), visible size and transform, keeping the remaining part where it is.
 */
export function cropImage({ width, height, transform, crop = { x: 0, y: 0, width: 1, height: 1 } }, { left = 0, top = 0, right = 0, bottom = 0 }) {
  const fullW = width / crop.width, fullH = height / crop.height;
  const x = Math.max(0, crop.x + left / fullW), y = Math.max(0, crop.y + top / fullH);
  const x2 = Math.min(1, crop.x + crop.width - right / fullW), y2 = Math.min(1, crop.y + crop.height - bottom / fullH);
  if (!(x2 - x > 1e-6) || !(y2 - y > 1e-6)) throw new Error('The crop leaves nothing of the image.');
  const dx = (x - crop.x) * fullW, dy = (y - crop.y) * fullH, [a, b, c, d, e, f] = transform;
  const next = { x, y, width: x2 - x, height: y2 - y }, whole = next.x < 1e-9 && next.y < 1e-9 && next.width > 1 - 1e-9 && next.height > 1 - 1e-9;
  return { width: next.width * fullW, height: next.height * fullH, transform: [a, b, c, d, e + a * dx + c * dy, f + b * dx + d * dy], crop: whole ? null : next };
}
