/** Pure JS fallback in mm. No DOM/Paper.js. Clipper is loaded only in the worker/backend. */
export const DEFAULT_TOLERANCE = 0.001;
export const LIMITS = Object.freeze({ coordinate: 1_000_000, anchors: 1_000_000, points: 1_000_000, depth: 32 });
const SCALE = 1_000_000;
export const BACKEND = Object.freeze({ name: 'js', library: 'clipper-lib@6.4.2', approximate: true,
  toleranceMm: DEFAULT_TOLERANCE, capabilities: Object.freeze(['flatten', 'boolean:unite', 'offset', 'outline-stroke']) });

export class GeometryError extends Error {
  constructor(message, code = 'INVALID_GEOMETRY') { super(message); this.name = 'GeometryError'; this.code = code; }
}
function positive(value, name, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) throw new GeometryError(`Invalid ${name}`);
}
export function validatePath(path) {
  if (!Array.isArray(path)) throw new GeometryError('Path must be an array of subpaths');
  let count = 0;
  for (const subpath of path) {
    if (!subpath || typeof subpath.closed !== 'boolean' || !Array.isArray(subpath.segments)) throw new GeometryError('Invalid subpath');
    count += subpath.segments.length;
    if (count > LIMITS.anchors) throw new GeometryError('Too many anchors', 'GEOMETRY_LIMIT');
    for (const segment of subpath.segments) {
      for (const key of ['p', 'in', 'out']) {
        const pair = segment?.[key];
        if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= LIMITS.coordinate)) throw new GeometryError(`Invalid ${key} coordinates`);
      }
      for (const key of ['in', 'out']) if (segment.p.some((v, i) => Math.abs(v + segment[key][i]) > LIMITS.coordinate)) throw new GeometryError('Control point exceeds coordinate range');
    }
  }
  return count;
}
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
function distanceToSegment(p, a, b) {
  const x = b[0] - a[0], y = b[1] - a[1], length2 = x * x + y * y;
  const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / length2)) : 0;
  return Math.hypot(p[0] - a[0] - t * x, p[1] - a[1] - t * y);
}
/** De Casteljau subdivision: both controls must lie within tolerance of the chord segment. */
export function flattenPath(path, tolerance = DEFAULT_TOLERANCE) {
  validatePath(path); positive(tolerance, 'flatten tolerance');
  let count = 0;
  return path.map((subpath) => {
    const points = [];
    const push = (p) => {
      if (++count > LIMITS.points) throw new GeometryError('Flatten result exceeds point limit', 'GEOMETRY_LIMIT');
      points.push([...p]);
    };
    const segments = subpath.segments;
    if (!segments.length) return { closed: subpath.closed, points };
    push(segments[0].p);
    const curves = subpath.closed ? segments.length : segments.length - 1;
    for (let i = 0; i < curves; i++) {
      const a = segments[i], b = segments[(i + 1) % segments.length];
      const stack = [[a.p, a.p.map((v, j) => v + a.out[j]), b.p.map((v, j) => v + b.in[j]), b.p, 0]];
      while (stack.length) {
        const [p0, p1, p2, p3, depth] = stack.pop();
        if (Math.max(distanceToSegment(p1, p0, p3), distanceToSegment(p2, p0, p3)) <= tolerance) push(p3);
        else {
          if (depth >= LIMITS.depth) throw new GeometryError('Curve cannot meet tolerance within subdivision limit', 'GEOMETRY_LIMIT');
          const a = mid(p0, p1), b = mid(p1, p2), c = mid(p2, p3), d = mid(a, b), e = mid(b, c), f = mid(d, e);
          stack.push([f, e, c, p3, depth + 1], [p0, a, d, f, depth + 1]);
        }
      }
    }
    // Closure is explicit metadata. Do not duplicate the start vertex.
    if (subpath.closed && points.length > 1 && points.at(-1).every((v, j) => v === points[0][j])) points.pop();
    return { closed: subpath.closed, points };
  });
}
let library, loaded = null;
async function clipper() {
  library ||= import('../../../node_modules/clipper-lib/clipper.js').then((module) => {
    const value = module.default || globalThis.ClipperLib;
    if (!value?.Clipper) throw new GeometryError('Could not load polygon library', 'BACKEND_UNAVAILABLE');
    // Upstream's default Error uses alert. A worker must throw instead of opening UI.
    value.Error = (message) => { throw new GeometryError(String(message)); };
    loaded = value;
    return value;
  });
  return library;
}
/** Loads the polygon library; afterwards the `*Sync` functions work (live effects render synchronously). */
export const loadGeometry = () => clipper().then(() => true);
export const geometryReady = () => !!loaded;
function executeUnion(lib, paths, fill) {
  if (!paths.length) return [];
  const engine = new lib.Clipper(); engine.StrictlySimple = true;
  engine.AddPaths(paths, lib.PolyType.ptSubject, true);
  const result = [];
  if (!engine.Execute(lib.ClipType.ctUnion, result, fill, fill)) throw new GeometryError('Polygon union failed', 'GEOMETRY_FAILED');
  return result;
}
export async function unite(paths, { tolerance = DEFAULT_TOLERANCE, fillRule = 'nonzero' } = {}) {
  if (!Array.isArray(paths)) throw new GeometryError('Expected an array of paths');
  positive(tolerance, 'boolean tolerance', .0025);
  if (tolerance < 1 / SCALE) throw new GeometryError('Boolean tolerance is below integer resolution');
  if (!['nonzero', 'evenodd'].includes(fillRule)) throw new GeometryError('Invalid fill rule');
  let anchors = 0;
  for (const path of paths) anchors += validatePath(path);
  if (anchors > LIMITS.anchors) throw new GeometryError('Too many anchors', 'GEOMETRY_LIMIT');
  const lib = await clipper(), normalized = [];
  let pointCount = 0;
  for (const path of paths) {
    const contours = flattenPath(path, tolerance).map(({ points }) => {
      pointCount += points.length;
      if (pointCount > LIMITS.points) throw new GeometryError('Union exceeds point limit', 'GEOMETRY_LIMIT');
      return points.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
    }).filter((points) => points.length >= 3);
    // Filled open contours close implicitly. Normalize each operand separately so opposite
    // winding on two overlapping operands cannot cancel a region that both shapes paint.
    normalized.push(...executeUnion(lib, contours, fillRule === 'evenodd' ? lib.PolyFillType.pftEvenOdd : lib.PolyFillType.pftNonZero));
  }
  const result = executeUnion(lib, normalized, lib.PolyFillType.pftNonZero);
  if (!result.length) return [];
  return [result.map((ring) => ({ closed: true, segments: ring.map(({ X, Y }) => ({ p: [X / SCALE, Y / SCALE], in: [0, 0], out: [0, 0] })) }))];
}
/**
 * Offset Path: every subpath grown (positive) or shrunk (negative) by `distance` mm. Closed areas are
 * normalised with their fill rule first so holes shrink when the outline grows. Open paths become
 * closed outlines with butt ends. Joins: miter (with limit), round or bevel. Result: straight segments.
 */
export async function offsetPaths(paths, options = {}) { return offsetWith(await clipper(), paths, options); }
/** Offset Path once `loadGeometry()` has finished; null before that. */
export function offsetPathsSync(paths, options = {}) { return loaded ? offsetWith(loaded, paths, options) : null; }
function offsetWith(lib, paths, { distance, join = 'miter', miterLimit = 4, tolerance = .005, fillRule = 'nonzero' } = {}) {
  if (!Array.isArray(paths)) throw new GeometryError('Expected an array of paths');
  if (typeof distance !== 'number' || !Number.isFinite(distance) || Math.abs(distance) > 10000) throw new GeometryError('Offset must be between -10,000 and 10,000 mm');
  if (!['miter', 'round', 'bevel'].includes(join)) throw new GeometryError('Invalid join');
  positive(miterLimit, 'miter limit', 500); positive(tolerance, 'offset tolerance', 1);
  if (!['nonzero', 'evenodd'].includes(fillRule)) throw new GeometryError('Invalid fill rule');
  for (const path of paths) validatePath(path);
  const closed = [], open = [], fill = fillRule === 'evenodd' ? lib.PolyFillType.pftEvenOdd : lib.PolyFillType.pftNonZero;
  const ints = (points) => points.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
  for (const path of paths) {
    const contours = flattenPath(path, tolerance / 4);
    closed.push(...executeUnion(lib, contours.filter((c) => c.closed && c.points.length >= 3).map((c) => ints(c.points)), fill));
    open.push(...contours.filter((c) => !c.closed && c.points.length >= 2).map((c) => ints(c.points)));
  }
  const engine = new lib.ClipperOffset(Math.max(1, miterLimit), tolerance * SCALE);
  const joinType = { miter: lib.JoinType.jtMiter, round: lib.JoinType.jtRound, bevel: lib.JoinType.jtSquare }[join];
  if (closed.length) engine.AddPaths(closed, joinType, lib.EndType.etClosedPolygon);
  if (open.length) engine.AddPaths(open, joinType, lib.EndType.etOpenButt);
  const result = new lib.Paths(); engine.Execute(result, distance * SCALE);
  const rings = executeUnion(lib, result, lib.PolyFillType.pftNonZero).filter((ring) => ring.length >= 3);
  return rings.map((ring) => ({ closed: true, segments: ring.map(({ X, Y }) => ({ p: [X / SCALE, Y / SCALE], in: [0, 0], out: [0, 0] })) }));
}
/** Split flattened centre lines by arc length before offsetting, restarting the pattern per subpath. */
function dashedContours(contours, dash) {
  if (!dash) return contours;
  const array = dash.array, offset = dash.offset ?? 0;
  if (!Array.isArray(array) || array.length > LIMITS.points || array.some(n => !Number.isFinite(n) || n < 0)
    || !Number.isFinite(offset)) throw new GeometryError('Invalid stroke dash');
  const pattern = array.length % 2 ? [...array, ...array] : array;
  const period = pattern.reduce((sum, n) => sum + n, 0);
  if (!Number.isFinite(period)) throw new GeometryError('Invalid stroke dash');
  // Canvas/SVG treat an empty or all-zero dash array as a solid stroke.
  if (!period) return contours;
  const phase = ((offset % period) + period) % period, result = [];
  let events = 0, pointCount = 0;
  const count = n => {
    pointCount += n;
    if (pointCount > LIMITS.points) throw new GeometryError('Dash result exceeds point limit', 'GEOMETRY_LIMIT');
  };
  for (const contour of contours) {
    const points = contour.points.filter((p, i, all) => !i || p.some((v, j) => v !== all[i - 1][j]));
    if (points.length < 2) continue;
    if (contour.closed) points.push(points[0]);
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    const total = lengths.at(-1), intervals = [];
    for (let i = 0, from = -phase; from <= total; i++) {
      if (++events > LIMITS.points) throw new GeometryError('Dash result exceeds point limit', 'GEOMETRY_LIMIT');
      const span = pattern[i % pattern.length], to = from + span;
      if (i % 2 === 0 && (span ? to > 0 && from < total : from >= 0)) {
        const start = Math.max(0, from), end = Math.min(total, to), last = intervals.at(-1);
        // Zero-length gaps must keep the join, instead of introducing two caps at a corner.
        if (last && last[1] === start) last[1] = end;
        else intervals.push([start, end]);
      }
      from = to;
    }
    const at = distance => {
      let lo = 0, hi = points.length - 1;
      while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (lengths[mid] <= distance) lo = mid; else hi = mid; }
      const a = points[lo], b = points[hi], length = lengths[hi] - lengths[lo], t = (distance - lengths[lo]) / length;
      return { index: lo, point: a.map((v, j) => v + (b[j] - v) * t), tangent: b.map((v, j) => (v - a[j]) / length) };
    };
    const pieces = intervals.map(([from, to]) => {
      if (contour.closed && from === 0 && to === total) { count(points.length - 1); return contour; }
      const start = at(from), end = at(to), part = [start.point];
      if (to > from) {
        for (let i = start.index + 1; i < points.length && lengths[i] < to; i++) part.push(points[i]);
        part.push(end.point);
      }
      count(part.length);
      return { closed: false, points: part, tangent: start.tangent };
    });
    // A dash crossing a closed path's seam has a join there, with caps only at the real dash ends.
    if (contour.closed && pieces.length > 1 && intervals[0][0] === 0 && intervals.at(-1)[1] === total) {
      const first = pieces.shift(), last = pieces.pop();
      pieces.push({ closed: false, points: [...last.points, ...first.points.slice(1)], tangent: last.tangent });
    }
    for (const piece of pieces) result.push(piece);
  }
  return result;
}
/**
 * Outline Stroke: the area a stroke of `width` mm paints, as closed filled rings (holes wind the other
 * way). Closed subpaths give a band; open ones get butt, round or square caps. Result: straight segments.
 */
export async function outlineStroke(path, { width, join = 'miter', cap = 'butt', miterLimit = 4, tolerance = .005, dash } = {}) {
  positive(width, 'stroke width', 10000);
  if (!['miter', 'round', 'bevel'].includes(join)) throw new GeometryError('Invalid join');
  if (!['butt', 'round', 'square'].includes(cap)) throw new GeometryError('Invalid cap');
  positive(miterLimit, 'miter limit', 500); positive(tolerance, 'offset tolerance', 1);
  validatePath(path);
  const lib = await clipper(), ints = (points) => points.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
  // Small dots and round caps also need a relative tolerance to retain their circular silhouette.
  // Clipper's final step to an arc endpoint can be longer than its regular
  // steps. Reserve half the tolerance so refitting the arc stays within it.
  const engine = new lib.ClipperOffset(Math.max(1, miterLimit), Math.min(tolerance, width / 1000) / 2 * SCALE), dots = [];
  const joinType = { miter: lib.JoinType.jtMiter, round: lib.JoinType.jtRound, bevel: lib.JoinType.jtSquare }[join];
  const endType = { butt: lib.EndType.etOpenButt, round: lib.EndType.etOpenRound, square: lib.EndType.etOpenSquare }[cap];
  for (const contour of dashedContours(flattenPath(path, tolerance / 4), dash)) {
    if (contour.closed && contour.points.length >= 3) engine.AddPath(ints(contour.points), joinType, lib.EndType.etClosedLine);
    else if (contour.points.length >= 2) engine.AddPath(ints(contour.points), joinType, endType);
    else if (contour.tangent && cap === 'round') engine.AddPath(ints(contour.points), lib.JoinType.jtRound, endType);
    else if (contour.tangent && cap === 'square') {
      const [x, y] = contour.points[0], [dx, dy] = contour.tangent, r = width / 2;
      dots.push(ints([[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => [x + r * (a * dx - b * dy), y + r * (a * dy + b * dx)])));
    }
  }
  const result = new lib.Paths(); engine.Execute(result, width / 2 * SCALE);
  return executeUnion(lib, [...result, ...dots], lib.PolyFillType.pftNonZero).filter((ring) => ring.length >= 3)
    .map((ring) => ({ closed: true, segments: ring.map(({ X, Y }) => ({ p: [X / SCALE, Y / SCALE], in: [0, 0], out: [0, 0] })) }));
}
export async function runGeometry(method, params) {
  if (method === 'offset') return offsetPaths(params.paths, { distance: params.distance, join: params.join, miterLimit: params.miterLimit });
  if (method === 'outline-stroke') return outlineStroke(params.path, params);
  if (method === 'flatten') return flattenPath(params.path, params.tolerance);
  if (method === 'boolean' && params.op === 'unite') return unite(params.paths, params.options);
  throw new GeometryError(`Geometry operation not implemented: ${method}${method === 'boolean' ? `:${params.op}` : ''}`, 'NOT_IMPLEMENTED');
}
