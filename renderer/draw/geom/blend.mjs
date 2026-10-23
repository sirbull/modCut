/**
 * Blends (D4.2): the in-between shapes of two key objects, as Illustrator's Object > Blend makes them.
 * Geometry is subpaths `{ closed, segments: [{ p, in, out }] }` with handles relative to their anchor.
 * Shapes with different anchor counts are matched by splitting the longest segments, and closed paths are
 * turned and, if needed, reversed so each anchor travels the shortest way. Pure.
 */
export const BLEND_DEFAULTS = Object.freeze({ spacing: 'smooth', steps: 5, distance: 5, orientation: 'page' });
export const BLEND_SPACING = Object.freeze(['smooth', 'steps', 'distance']);
const MAX_STEPS = 1000;

/** Validated blend options. */
export function blendOptions(options = {}) {
  const o = { ...BLEND_DEFAULTS, ...options };
  if (!BLEND_SPACING.includes(o.spacing)) throw new Error('Choose Smooth Color, Specified Steps or Specified Distance.');
  if (!(Number.isInteger(o.steps) && o.steps >= 1 && o.steps <= MAX_STEPS)) throw new Error(`Use 1 to ${MAX_STEPS} steps.`);
  if (!(Number.isFinite(o.distance) && o.distance >= .01 && o.distance <= 10000)) throw new Error('Use a distance from 0.01 to 10000 mm.');
  if (!['page', 'path'].includes(o.orientation)) throw new Error('Unknown orientation.');
  const out = { spacing: o.spacing, steps: o.steps, distance: o.distance, orientation: o.orientation };
  if (o.spine) out.spine = spineOption(o.spine);
  return out;
}
/** A blend's spine: one subpath in the blend group's space, with at least two anchors. */
function spineOption(spine) {
  const vector = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
  if (!spine || typeof spine.closed !== 'boolean' || !Array.isArray(spine.segments) || spine.segments.length < 2
      || !spine.segments.every((s) => s && vector(s.p) && vector(s.in) && vector(s.out))) throw new Error('A blend spine is a path with at least two points.');
  return { closed: spine.closed, segments: spine.segments.map((s) => ({ p: [...s.p], in: [...s.in], out: [...s.out] })) };
}

const lerp = (a, b, t) => a + (b - a) * t;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export function boxOf(subpaths) {
  const pts = subpaths.flatMap((s) => s.segments.map((g) => g.p));
  if (!pts.length) return { x: 0, y: 0, width: 0, height: 0, centre: [0, 0] };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x = Math.min(...xs), y = Math.min(...ys), width = Math.max(...xs) - x, height = Math.max(...ys) - y;
  return { x, y, width, height, centre: [x + width / 2, y + height / 2] };
}

/**
 * Number of in-between steps. Smooth Color: enough that neighbouring colours differ by about one
 * 8-bit level in 4 (at least 1); with the same colours, about one step per 1 mm between centres.
 * `a` and `b` are `{ subpaths, colors: [[r, g, b] 0..1, ...] }`.
 */
export function blendStepCount(options, a, b, length = null) {
  // `length`: the way between the keys when it is not straight (along a spine).
  const o = blendOptions(options), dist = length ?? Math.hypot(...sub(boxOf(b.subpaths).centre, boxOf(a.subpaths).centre));
  if (o.spacing === 'steps') return o.steps;
  if (o.spacing === 'distance') return Math.min(MAX_STEPS, Math.max(1, Math.round(dist / o.distance) - 1));
  let delta = 0;
  (a.colors ?? []).forEach((c, i) => { const d = b.colors?.[i]; if (c && d) for (let k = 0; k < 3; k++) delta = Math.max(delta, Math.abs(c[k] - d[k])); });
  return Math.min(256, Math.max(1, delta > 1e-6 ? Math.round(delta * 255 / 4) : Math.round(dist)));
}

/** Splits segment `i` (to the next anchor) in half; returns new segments. */
function splitAt(segments, i, closed) {
  const a = segments[i], j = (i + 1) % segments.length, b = segments[j];
  if (!closed && j === 0) return segments;
  const p0 = a.p, p1 = add(a.p, a.out), p2 = add(b.p, b.in), p3 = b.p;
  const q0 = mix(p0, p1, .5), q1 = mix(p1, p2, .5), q2 = mix(p2, p3, .5), r0 = mix(q0, q1, .5), r1 = mix(q1, q2, .5), m = mix(r0, r1, .5);
  const out = segments.map((s) => ({ p: [...s.p], in: [...s.in], out: [...s.out] }));
  out[i].out = sub(q0, p0); out[j].in = sub(q2, p3);
  out.splice(i + 1, 0, { p: m, in: sub(r0, m), out: sub(r1, m) });
  return out;
}
const chord = (segments, i) => { const b = segments[(i + 1) % segments.length]; return Math.hypot(...sub(b.p, segments[i].p)) + Math.hypot(...segments[i].out) + Math.hypot(...b.in); };
/** `segments` with anchors added (longest segments split first) until there are `count`. */
export function withAnchors(segments, count, closed) {
  let out = segments;
  while (out.length < count) {
    const last = closed ? out.length : out.length - 1;
    if (last < 1) { out = [...out, { p: [...out[0].p], in: [0, 0], out: [0, 0] }]; continue; }
    let best = 0; for (let i = 1; i < last; i++) if (chord(out, i) > chord(out, best)) best = i;
    out = splitAt(out, best, closed);
  }
  return out;
}
const reversed = (segments) => [...segments].reverse().map((s) => ({ p: s.p, in: s.out, out: s.in }));
/** `b` turned (and reversed if closer) so its anchors line up with `a`'s; both closed, same length. */
function aligned(a, b) {
  let best = b, score = Infinity;
  for (const candidate of [b, reversed(b)]) for (let k = 0; k < candidate.length; k++) {
    let s = 0; for (let i = 0; i < a.length; i++) { const q = candidate[(i + k) % candidate.length].p; s += (a[i].p[0] - q[0]) ** 2 + (a[i].p[1] - q[1]) ** 2; }
    if (s < score - 1e-9) { score = s; best = candidate.slice(k).concat(candidate.slice(0, k)); }
  }
  return best;
}
const collapsed = (s) => { const c = boxOf([s]).centre; return { closed: s.closed, segments: s.segments.map(() => ({ p: [...c], in: [0, 0], out: [0, 0] })) }; };

/** Two shapes with the same subpaths and anchor counts, ready to interpolate. */
export function matchShapes(as, bs) {
  const n = Math.max(as.length, bs.length), outA = [], outB = [];
  for (let i = 0; i < n; i++) {
    // A subpath only one key has grows out of (or shrinks into) its own centre.
    let a = as[i] ?? collapsed(bs[i]), b = bs[i] ?? collapsed(as[i]);
    const closed = a.closed && b.closed, count = Math.max(a.segments.length, b.segments.length);
    let sa = withAnchors(a.segments, count, a.closed), sb = withAnchors(b.segments, count, b.closed);
    if (closed) sb = aligned(sa, sb);
    else if (!a.closed && !b.closed && Math.hypot(...sub(sa[0].p, sb.at(-1).p)) + Math.hypot(...sub(sa.at(-1).p, sb[0].p)) < Math.hypot(...sub(sa[0].p, sb[0].p)) + Math.hypot(...sub(sa.at(-1).p, sb.at(-1).p))) sb = reversed(sb);
    outA.push({ closed, segments: sa }); outB.push({ closed, segments: sb });
  }
  return [outA, outB];
}
/** The shape at `t` (0 is `a`, 1 is `b`) between two matched shapes. */
export const interpolateShapes = (as, bs, t) => as.map((a, i) => ({ closed: a.closed, segments: a.segments.map((s, j) => {
  const o = bs[i].segments[j]; return { p: mix(s.p, o.p, t), in: mix(s.in, o.in, t), out: mix(s.out, o.out, t) }; }) }));
export const lerpColor = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
/**
 * A spine as a function of distance: `at(u)` (u from 0 to 1 along its length) gives the point and the
 * direction in radians. Curves are measured as short straight pieces.
 */
export function spineCurve(spine, pieces = 32) {
  const s = spine.segments, count = spine.closed ? s.length : s.length - 1, points = [[...s[0].p]];
  for (let i = 0; i < count; i++) {
    const a = s[i], b = s[(i + 1) % s.length], p0 = a.p, p1 = add(a.p, a.out), p2 = add(b.p, b.in), p3 = b.p;
    for (let k = 1; k <= pieces; k++) {
      const t = k / pieces, u = 1 - t;
      points.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
  }
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(...sub(points[i], points[i - 1])));
  const total = lengths.at(-1);
  return {
    length: total,
    at(u) {
      const d = Math.min(1, Math.max(0, u)) * total;
      let i = 1; while (i < points.length - 1 && lengths[i] < d) i++;
      const a = points[i - 1], b = points[i], span = lengths[i] - lengths[i - 1] || 1, t = (d - lengths[i - 1]) / span;
      return { p: mix(a, b, Math.min(1, Math.max(0, t))), angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    },
  };
}
/** `subpaths` moved so their centre is at `to`, turned `angle` radians about it. */
export function placeOnSpine(subpaths, to, angle = 0) {
  const c = boxOf(subpaths).centre, cos = Math.cos(angle), sin = Math.sin(angle);
  const turn = (v) => [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos];
  return subpaths.map((path) => ({ closed: path.closed, segments: path.segments.map((g) => ({ p: add(turn(sub(g.p, c)), to), in: turn(g.in), out: turn(g.out) })) }));
}
/** Where key `k` of `count` keys sits on the spine (0 to 1). */
export const keyPosition = (k, count) => count > 1 ? k / (count - 1) : 0;

/** The `count` positions strictly between the keys, evenly spaced. */
export const stepPositions = (count) => Array.from({ length: count }, (_, i) => (i + 1) / (count + 1));
