/**
 * Envelope Distort (Object > Envelope Distort > Make with Top Object): artwork bent into the shape of the object
 * above it. The envelope's outline is cut into four sides at the anchors nearest the corners of its box, and the
 * artwork's box maps onto that outline as a Coons patch (each side is followed exactly, the inside blends between
 * them). Curves cannot stay curves under such a mapping, so the result is made of short straight pieces. Pure.
 */
import { boxOf, withAnchors } from './blend.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

/** Points along one cubic segment, the end included and the start left out. */
function piecesOf(a, b, count) {
  const p0 = a.p, p1 = add(a.p, a.out), p2 = add(b.p, b.in), p3 = b.p, out = [];
  for (let k = 1; k <= count; k++) {
    const t = k / count, u = 1 - t;
    out.push([0, 1].map((i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]));
  }
  return out;
}
/** A polyline as a function of its share of length (0 to 1). */
function along(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(...sub(points[i], points[i - 1])));
  const total = lengths.at(-1) || 1;
  return (u) => {
    const d = Math.min(1, Math.max(0, u)) * total;
    let i = 1; while (i < points.length - 1 && lengths[i] < d) i++;
    const a = points[i - 1], b = points[i], t = Math.min(1, Math.max(0, (d - lengths[i - 1]) / ((lengths[i] - lengths[i - 1]) || 1)));
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
}
const area = (segments) => segments.reduce((sum, s, i) => { const n = segments[(i + 1) % segments.length].p; return sum + s.p[0] * n[1] - n[0] * s.p[1]; }, 0) / 2;

/**
 * The four sides of a closed outline, as functions of 0..1: top (left to right), bottom (left to right),
 * left (top to bottom) and right (top to bottom). y runs down.
 */
export function envelopeSides(outline, pieces = 24) {
  if (!outline?.closed || outline.segments.length < 2) throw new Error('Use a closed path or shape on top as the envelope.');
  let segments = withAnchors(outline.segments, Math.max(4, outline.segments.length), true);
  // Clockwise on screen (y down) so that the corners come in the order top left, top right, bottom right, bottom left.
  if (area(segments) < 0) segments = [...segments].reverse().map((s) => ({ p: s.p, in: s.out, out: s.in }));
  const box = boxOf([{ closed: true, segments }]), corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]];
  const nearest = (c) => segments.reduce((best, s, i) => (Math.hypot(...sub(s.p, c)) < Math.hypot(...sub(segments[best].p, c)) ? i : best), 0);
  let picks = corners.map(nearest);
  // Four different anchors in order round the outline; otherwise split at even shares of the anchors.
  const ordered = picks.every((p, i) => i === 0 || (p - picks[0] + segments.length) % segments.length > (picks[i - 1] - picks[0] + segments.length) % segments.length);
  if (new Set(picks).size < 4 || !ordered) picks = [0, 1, 2, 3].map((k) => (picks[0] + Math.round(k * segments.length / 4)) % segments.length);
  const run = (from, to) => {
    const points = [[...segments[from].p]];
    for (let i = from; i !== to; i = (i + 1) % segments.length) points.push(...piecesOf(segments[i], segments[(i + 1) % segments.length], pieces));
    return points;
  };
  const [tl, tr, br, bl] = picks;
  return { top: along(run(tl, tr)), right: along(run(tr, br)), bottom: along(run(br, bl).reverse()), left: along(run(bl, tl).reverse()) };
}

/** A function taking points in `box` (the artwork's box) into the envelope. */
export function envelopeMapping(box, outline) {
  const { top, bottom, left, right } = envelopeSides(outline);
  const p00 = top(0), p10 = top(1), p01 = bottom(0), p11 = bottom(1);
  return ([x, y]) => {
    const u = box.width ? (x - box.x) / box.width : 0, v = box.height ? (y - box.y) / box.height : 0;
    const c0 = top(u), c1 = bottom(u), d0 = left(v), d1 = right(v);
    return [0, 1].map((k) => (1 - v) * c0[k] + v * c1[k] + (1 - u) * d0[k] + u * d1[k]
      - ((1 - u) * (1 - v) * p00[k] + u * (1 - v) * p10[k] + (1 - u) * v * p01[k] + u * v * p11[k]));
  };
}

/** `subpaths` taken through `map`, each segment as straight pieces (more for longer and curved ones). */
export function envelopeSubpaths(subpaths, map, box) {
  const size = Math.hypot(box.width, box.height) || 1;
  return subpaths.map((path) => {
    const s = path.segments, count = path.closed ? s.length : s.length - 1, points = [map(s[0].p)];
    for (let i = 0; i < count; i++) {
      const a = s[i], b = s[(i + 1) % s.length], curved = Math.hypot(...a.out) + Math.hypot(...b.in) > 0;
      const pieces = Math.max(curved ? 8 : 2, Math.min(64, Math.ceil(Math.hypot(...sub(b.p, a.p)) / size * 64)));
      points.push(...piecesOf(a, b, pieces).map(map));
    }
    if (path.closed) points.pop();
    return { closed: path.closed, segments: points.map((p) => ({ p, in: [0, 0], out: [0, 0] })) };
  });
}
