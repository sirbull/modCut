/**
 * Path Eraser and Smooth (D2.8 and D3.4): pure functions on one subpath of segments `{ p, in, out }` (handles
 * relative to their anchor). The drag is a polyline in the same space.
 *  - `erasePath` removes the parts of the path within `radius` of the drag; what is left comes back as open
 *    pieces, the curves kept exactly (the cuts are found by bisection along each curve).
 *  - `smoothRange` finds the run of anchors the drag passed near, for the caller to fit again more loosely.
 */
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function controls(path, i) {
  const s = path.segments, a = s[i], b = s[(i + 1) % s.length];
  return [a.p, add(a.p, a.out), add(b.p, b.in), b.p];
}
export function bezierPoint([p0, p1, p2, p3], t) {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
}
/** The part of a cubic between t0 and t1, as four control points. */
function part(c, t0, t1) {
  const split = ([p0, p1, p2, p3], t) => {
    const q0 = lerp(p0, p1, t), q1 = lerp(p1, p2, t), q2 = lerp(p2, p3, t), r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t), m = lerp(r0, r1, t);
    return [[p0, q0, r0, m], [m, r1, q2, p3]];
  };
  let right = t0 > 0 ? split(c, t0)[1] : c;
  if (t1 < 1) right = split(right, (t1 - t0) / (1 - t0))[0];
  return right;
}
function distanceToPolyline(p, line) {
  if (line.length === 1) return Math.hypot(...sub(p, line[0]));
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], d = sub(b, a), len = d[0] * d[0] + d[1] * d[1];
    const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / len)) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t));
  }
  return best;
}

/** What is left of `subpath` after erasing within `radius` of `drag`: open subpaths, or null when nothing is touched. */
export function erasePath(subpath, drag, radius, samples = 48) {
  const path = subpath, n = path.segments.length, curves = path.closed ? n : n - 1;
  if (curves < 1 || !drag.length) return null;
  const inside = (s) => { const i = Math.min(curves - 1, Math.floor(s)), t = s - i; return distanceToPolyline(bezierPoint(controls(path, i), t), drag) <= radius; };
  // Sample positions s = curve index + t, then refine each change between erased and kept by bisection.
  const points = [];
  for (let i = 0; i < curves; i++) for (let k = 0; k < samples; k++) points.push(i + k / samples);
  points.push(curves);
  const state = points.map(inside);
  if (!state.some(Boolean)) return null;
  if (state.every(Boolean)) return [];
  const edges = [];
  for (let j = 1; j < points.length; j++) if (state[j] !== state[j - 1]) {
    let lo = points[j - 1], hi = points[j];
    for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (inside(mid) === state[j - 1]) lo = mid; else hi = mid; }
    edges.push({ at: (lo + hi) / 2, keepAfter: !state[j] });
  }
  // Kept runs [from, to] in s; on a closed path the run across the start joins up.
  const runs = [];
  let start = state[0] ? null : 0;
  for (const edge of edges) {
    if (edge.keepAfter) start = edge.at; else if (start !== null) { runs.push([start, edge.at]); start = null; }
  }
  if (start !== null) runs.push([start, curves]);
  if (path.closed && runs.length > 1 && runs[0][0] === 0 && runs.at(-1)[1] === curves) { const first = runs.shift(); runs[runs.length - 1] = [runs.at(-1)[0], curves + first[1]]; }
  return runs.map(([from, to]) => piece(path, curves, from, to)).filter((p) => p.segments.length >= 2 && length(p) > 1e-6);
}
function length(p) { let sum = 0; for (let i = 1; i < p.segments.length; i++) sum += Math.hypot(...sub(p.segments[i].p, p.segments[i - 1].p)); return sum; }
/** The open subpath from s = `from` to s = `to` (beyond `curves` wraps round a closed path). */
function piece(path, curves, from, to) {
  const segments = [];
  const push = ([p0, p1, p2, p3]) => {
    if (!segments.length) segments.push({ p: p0, in: [0, 0], out: sub(p1, p0) });
    else segments.at(-1).out = sub(p1, p0);
    segments.push({ p: p3, in: sub(p2, p3), out: [0, 0] });
  };
  let s = from;
  while (s < to - 1e-9) {
    const i = Math.floor(s + 1e-9), t0 = s - i, end = Math.min(to, i + 1), t1 = end - i;
    push(part(controls(path, i % curves), t0, t1));
    s = end;
  }
  return { closed: false, segments };
}

/** Smooth: the first and last anchor of the longest run the drag passed within `radius` of, or null. */
export function smoothRange(subpath, drag, radius) {
  const near = subpath.segments.map((g) => distanceToPolyline(g.p, drag) <= radius);
  let best = null, start = null;
  near.forEach((hit, i) => {
    if (hit && start === null) start = i;
    if ((!hit || i === near.length - 1) && start !== null) { const end = hit ? i : i - 1; if (!best || end - start > best[1] - best[0]) best = [start, end]; start = null; }
  });
  if (!best) return null;
  // One anchor either side keeps the ends of the smoothed part where they are.
  return [Math.max(0, best[0] - 1), Math.min(subpath.segments.length - 1, best[1] + 1)];
}
/** Points along the path from anchor `from` to anchor `to`, for fitting again. */
export function sectionPoints(subpath, from, to, perCurve = 12) {
  const out = [subpath.segments[from].p];
  for (let i = from; i < to; i++) { const c = controls(subpath, i); for (let k = 1; k <= perCurve; k++) out.push(bezierPoint(c, k / perCurve)); }
  return out;
}
