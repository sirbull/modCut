/**
 * Arc length along one Bézier subpath (PathData: segments with p, in, out). Pure: used by the font
 * service in main to place Type on a Path glyphs, and by tests. Curves are sampled finely enough
 * that glyph positions stay within a few micrometres of the true curve at laser sizes.
 */
const SAMPLES = 48;
const cubic = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };

/** The subpath run in the opposite direction (Flip). */
export function reverseSubpath(subpath) {
  const segments = [...subpath.segments].reverse().map((s) => ({ p: [...s.p], in: [...s.out], out: [...s.in] }));
  if (subpath.closed && segments.length) segments.push(segments.shift());
  return { closed: !!subpath.closed, segments };
}

/** Polyline samples with cumulative length; `at(s)` gives the point and unit tangent at length s. */
export function measurePath(subpath) {
  const s = subpath?.segments ?? [];
  if (s.length < 2) throw new Error('Type on a Path needs a path with at least two points.');
  const points = [[...s[0].p]];
  const pairs = s.map((seg, i) => [seg, s[i + 1]]).slice(0, -1);
  if (subpath.closed) pairs.push([s.at(-1), s[0]]);
  for (const [a, b] of pairs) {
    const c1 = [a.p[0] + a.out[0], a.p[1] + a.out[1]], c2 = [b.p[0] + b.in[0], b.p[1] + b.in[1]];
    const straight = !a.out[0] && !a.out[1] && !b.in[0] && !b.in[1], steps = straight ? 1 : SAMPLES;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      points.push([cubic(a.p[0], c1[0], c2[0], b.p[0], t), cubic(a.p[1], c1[1], c2[1], b.p[1], t)]);
    }
  }
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = lengths.at(-1);
  if (!(length > 1e-9)) throw new Error('Type on a Path needs a path with some length.');
  function at(distance) {
    const d = Math.min(Math.max(distance, 0), length);
    let lo = 0, hi = lengths.length - 1;
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (lengths[mid] <= d) lo = mid; else hi = mid; }
    // Skip zero-length steps so the tangent is always defined.
    while (hi < lengths.length - 1 && lengths[hi] - lengths[lo] < 1e-12) hi++;
    while (lo > 0 && lengths[hi] - lengths[lo] < 1e-12) lo--;
    const span = lengths[hi] - lengths[lo] || 1, f = (d - lengths[lo]) / span, a = points[lo], b = points[hi];
    const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
    return { p: [a[0] + dx * f, a[1] + dy * f], t: [dx / n, dy / n] };
  }
  return { length, closed: !!subpath.closed, at };
}

/**
 * Where a run of `width` mm starts on the path: from `offset`, aligned left, centered or right in
 * the remaining length. Glyph centres beyond the end do not fit (overflow).
 */
export function pathRunStart(length, width, { offset = 0, alignment = 'left' } = {}) {
  const from = Math.min(Math.max(offset, 0), length), room = length - from;
  if (alignment === 'center') return from + Math.max(0, (room - width) / 2);
  if (alignment === 'right') return from + Math.max(0, room - width);
  return from;
}

/** Rigid map for one glyph: local (x across, y up from baseline) around its centre at path length s. */
export function glyphFrame(measure, s) {
  const { p, t } = measure.at(s), n = [t[1], -t[0]];
  return (x, y) => [p[0] + x * t[0] + y * n[0], p[1] + x * t[1] + y * n[1]];
}
