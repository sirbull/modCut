/**
 * Object > Path commands as pure functions on PathData (subpaths of segments with p, in, out):
 * Join, Average, Reverse Path Direction, Add and Remove Anchor Points, and Clean Up.
 * Live corners are baked first, as Illustrator expands them before editing anchors.
 */
import { bakeCorners } from './corners.mjs';
import { reversePath, deleteAnchors } from './path-editing.mjs';

const JOIN_TOLERANCE = .01; // mm: endpoints closer than this become one anchor
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const plain = (subpath) => bakeCorners(subpath);
export function mapSubpath(subpath, [a, b, c, d, e, f]) {
  const point = ([x, y]) => [a * x + c * y + e, b * x + d * y + f], vector = ([x, y]) => [a * x + c * y, b * x + d * y];
  return { closed: subpath.closed, segments: plain(subpath).segments.map((s) => ({ p: point(s.p), in: vector(s.in), out: vector(s.out) })) };
}

/** Add Anchor Points: a new anchor halfway along every segment, keeping the curve exactly. */
export function addAnchorPoints(subpath) {
  const path = plain(subpath), s = path.segments, out = [];
  const count = path.closed ? s.length : s.length - 1;
  for (let i = 0; i < s.length; i++) {
    const a = structuredClone(s[i]);
    if (i >= count) { out.push(a); continue; }
    const b = s[(i + 1) % s.length], p0 = a.p, p1 = [a.p[0] + a.out[0], a.p[1] + a.out[1]], p2 = [b.p[0] + b.in[0], b.p[1] + b.in[1]], p3 = b.p;
    // de Casteljau at t = 0.5
    const q0 = lerp(p0, p1, .5), q1 = lerp(p1, p2, .5), q2 = lerp(p2, p3, .5), r0 = lerp(q0, q1, .5), r1 = lerp(q1, q2, .5), m = lerp(r0, r1, .5);
    const straight = !a.out[0] && !a.out[1] && !b.in[0] && !b.in[1];
    a.out = straight ? [0, 0] : [q0[0] - p0[0], q0[1] - p0[1]];
    out.push(a, { p: m, in: straight ? [0, 0] : [r0[0] - m[0], r0[1] - m[1]], out: straight ? [0, 0] : [r1[0] - m[0], r1[1] - m[1]] });
    // The next anchor's incoming handle shrinks to the second half.
    const next = i + 1 < s.length ? i + 1 : 0, nextIn = straight ? [0, 0] : [q2[0] - p3[0], q2[1] - p3[1]];
    if (next === 0) out[0].in = nextIn; else s[next] = { ...s[next], in: nextIn };
  }
  return { closed: path.closed, segments: out };
}
/** Remove Anchor Points: the selected anchors go, the path stays one piece. */
export function removeAnchorPoints(subpaths, anchors) { return deleteAnchors(subpaths.map(plain), anchors); }
export function reverseSubpaths(subpaths) { return subpaths.map((s) => reversePath(plain(s))); }

/** Average: the points move to their mean position along one or both axes (`horizontal` lines them up on one y). */
export function averagePoints(points, axis = 'both') {
  if (!points.length) throw new Error('Select anchor points to average.');
  const mean = [0, 1].map((k) => points.reduce((sum, p) => sum + p[k], 0) / points.length);
  return points.map(([x, y]) => [axis === 'horizontal' ? x : mean[0], axis === 'vertical' ? y : mean[1]]);
}

function concat(first, second) {
  const a = structuredClone(first.segments), b = structuredClone(second.segments);
  if (dist(a.at(-1).p, b[0].p) < JOIN_TOLERANCE) { const merged = { p: a.at(-1).p, in: a.at(-1).in, out: b[0].out }; a.pop(); b.shift(); a.push(merged); }
  return { closed: false, segments: [...a, ...b] };
}
/** Close an open subpath; coincident ends merge into one anchor. */
export function closeSubpath(subpath) {
  const path = plain(subpath);
  if (path.closed) throw new Error('The path is already closed.');
  if (path.segments.length < 2) throw new Error('Join needs a path with at least two points.');
  const s = structuredClone(path.segments);
  if (s.length > 2 && dist(s.at(-1).p, s[0].p) < JOIN_TOLERANCE) { s[0].in = s.at(-1).in; s.pop(); }
  return { closed: true, segments: s };
}
/**
 * Join two open subpaths. With `ends` ({a:'start'|'end', b:'start'|'end'}) the given endpoints meet;
 * without it the nearest pair does. The result runs from A's free end to B's free end.
 */
export function joinSubpaths(A, B, ends = null) {
  const a = plain(A), b = plain(B);
  if (a.closed || b.closed) throw new Error('Join works on open paths. Release or cut closed paths first.');
  const options = [['end', 'start'], ['end', 'end'], ['start', 'end'], ['start', 'start']];
  const at = (path, end) => end === 'start' ? path.segments[0].p : path.segments.at(-1).p;
  const [ea, eb] = ends ? [ends.a, ends.b] : options.reduce((best, pair) => dist(at(a, pair[0]), at(b, pair[1])) < dist(at(a, best[0]), at(b, best[1])) ? pair : best);
  const first = ea === 'end' ? a : reversePath(a), second = eb === 'start' ? b : reversePath(b);
  return concat(first, second);
}

/** Clean Up: stray points (paths with fewer than two anchors), unpainted objects and empty text. */
export function cleanUpTargets(doc) {
  const shown = (list) => (list ?? []).filter((e) => !e.hidden);
  const clipMasks = new Set(doc.descendants(null).filter((n) => n.type === 'group' && n.clip && n.children.length).map((n) => n.children.at(-1).id));
  return doc.descendants(null).filter((n) => {
    if (!doc.isEditable(n.id) || clipMasks.has(n.id)) return false;
    if (n.type === 'path') return n.subpaths.every((s) => s.segments.length < 2) || (!shown(n.appearance?.fills).length && !shown(n.appearance?.strokes).length);
    if (n.type === 'shape') return !shown(n.appearance?.fills).length && !shown(n.appearance?.strokes).length;
    if (n.type === 'text') return !n.content.runs.map((r) => r.text).join('').trim();
    return false;
  }).map((n) => n.id);
}
