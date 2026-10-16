/**
 * Neutral vector model of one artboard for the PDF, EPS and DXF writers.
 *
 * `artworkModel` walks the detached Paper group from the renderer's exportArtwork() and returns plain
 * data in artboard millimetres (origin at the artboard's top-left, y down): groups with opacity and
 * blending, paths as cubic segments with absolute control points, and placed images. Writers never
 * touch Paper, so they can be tested in Node.
 */
const IDENTITY = [1, 0, 0, 1, 0, 0];
export const BLEND_MODES = Object.freeze(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']);

/** [a,b,c,d,e,f] applied to [x,y]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export const multiply = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const values = (matrix) => matrix ? [matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty] : IDENTITY;
const paint = (color) => color && color.type !== 'gradient' && color.alpha !== 0
  ? { rgb: [color.red, color.green, color.blue].map((v) => Math.min(1, Math.max(0, v))), alpha: color.alpha ?? 1 } : null;

/**
 * @param group detached Paper group (top-level children are layers when they carry a node id)
 * @param board {x,y,width,height}
 * @param options.layerName id → layer name, for top-level groups
 * @param options.image raster → {width,height,rgba} pixels; images are skipped without it
 * @param options.viewZoom view zoom that non-scaling strokes were multiplied by
 */
export function artworkModel(group, board, { layerName = () => null, image = null, viewZoom = 1 } = {}) {
  const warnings = new Set(), origin = [1, 0, 0, 1, -board.x, -board.y];
  function walk(item, parent) {
    if (!item.visible) return null;
    const m = multiply(parent, values(item.matrix)), base = { opacity: item.opacity ?? 1, blend: BLEND_MODES.includes(item.blendMode) ? item.blendMode : 'normal' };
    if (item.className === 'Group' || item.className === 'Layer') {
      const children = (item.children ?? []).map((child) => walk(child, m)).filter(Boolean);
      return children.length ? { type: 'group', ...base, children } : null;
    }
    if (item.className === 'Path' || item.className === 'CompoundPath') {
      const paths = item.className === 'Path' ? [item] : item.children.filter((child) => child.className === 'Path');
      const subpaths = paths.map((path) => {
        const pm = path === item ? m : multiply(m, values(path.matrix));
        return { closed: path.closed, segments: path.segments.map((s) => {
          const p = [s.point.x, s.point.y];
          return { p: apply(pm, p), in: apply(pm, [p[0] + s.handleIn.x, p[1] + s.handleIn.y]), out: apply(pm, [p[0] + s.handleOut.x, p[1] + s.handleOut.y]) };
        }) };
      }).filter((sub) => sub.segments.length);
      const fill = paint(item.fillColor), strokeColor = paint(item.strokeColor);
      if (item.fillColor?.type === 'gradient' || item.strokeColor?.type === 'gradient') warnings.add('Gradients are exported as no paint.');
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      const width = item.strokeScaling === false ? item.strokeWidth / viewZoom : item.strokeWidth * scale;
      const stroke = strokeColor && width > 0 ? { ...strokeColor, width, cap: item.strokeCap ?? 'butt', join: item.strokeJoin ?? 'miter', miter: item.miterLimit ?? 4,
        dash: (item.dashArray ?? []).map((n) => n * (item.strokeScaling === false ? 1 / viewZoom : scale)), dashOffset: (item.dashOffset ?? 0) * scale } : null;
      if (!subpaths.length || (!fill && !stroke)) return null;
      return { type: 'path', ...base, subpaths, fill, fillRule: item.fillRule === 'evenodd' ? 'evenodd' : 'nonzero', stroke };
    }
    if (item.className === 'Raster') {
      if (!image) { warnings.add('Images are not included in this format.'); return null; }
      const pixels = image(item);
      if (!pixels) return null;
      // Paper centres a raster on its position; the unit square maps to its top-left-origin bounds.
      const w = item.width, h = item.height;
      return { type: 'image', ...base, matrix: multiply(m, [w, 0, 0, h, -w / 2, -h / 2]), ...pixels };
    }
    if (item.className === 'PointText') { warnings.add('Text without outlines is not included. Use Create Outlines or an installed font.'); return null; }
    return null;
  }
  const layers = [];
  for (const child of group.children ?? []) {
    const node = walk(child, origin);
    if (!node) continue;
    const name = child.data?.nodeId ? layerName(child.data.nodeId) : null;
    layers.push({ name: name || `Layer ${layers.length + 1}`, items: [node] });
  }
  return { width: board.width, height: board.height, name: board.name ?? '', background: board.background ?? null, layers, warnings: [...warnings] };
}

/** Paths and images with group opacity multiplied in, for writers that cannot nest transparency groups. */
export function* flatItems(items, opacity = 1) {
  for (const item of items) {
    if (item.type === 'group') yield* flatItems(item.children, opacity * item.opacity);
    else yield { ...item, opacity: item.opacity * opacity };
  }
}

/** Bounds of all path anchors and control points, or null when the model is empty. */
export function modelBounds(model) {
  let box = null;
  const add = ([x, y]) => { box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y]; };
  for (const layer of model.layers) for (const item of flatItems(layer.items)) {
    if (item.type === 'path') for (const sub of item.subpaths) for (const s of sub.segments) { add(s.p); add(s.in); add(s.out); }
    if (item.type === 'image') for (const corner of [[0, 0], [1, 0], [0, 1], [1, 1]]) add(apply(item.matrix, corner));
  }
  return box;
}

/** True when the segment pair is a straight line (both handles on the anchors). */
export const straight = (a, b) => a.out[0] === a.p[0] && a.out[1] === a.p[1] && b.in[0] === b.p[0] && b.in[1] === b.p[1];

/** Polyline through a subpath's cubic segments, within `tolerance` millimetres of the curve. */
export function flattenSubpath(sub, tolerance = 0.01) {
  const segs = sub.segments, out = [segs[0].p];
  const count = sub.closed ? segs.length : segs.length - 1;
  for (let i = 0; i < count; i++) {
    const a = segs[i], b = segs[(i + 1) % segs.length];
    if (straight(a, b)) { out.push(b.p); continue; }
    const p0 = a.p, p1 = a.out, p2 = b.in, p3 = b.p;
    // Flatness bound: the control polygon's deviation from the chord bounds the curve's.
    const dev = Math.max(Math.hypot(3 * p1[0] - 2 * p0[0] - p3[0], 3 * p1[1] - 2 * p0[1] - p3[1]), Math.hypot(3 * p2[0] - p0[0] - 2 * p3[0], 3 * p2[1] - p0[1] - 2 * p3[1]));
    const steps = Math.min(512, Math.max(1, Math.ceil(Math.sqrt(dev / (16 * tolerance)) * 2)));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, u = 1 - t, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      out.push([w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0], w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1]]);
    }
  }
  if (sub.closed && out.length > 1) { const [f, l] = [out[0], out.at(-1)]; if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) out.pop(); }
  return out;
}
