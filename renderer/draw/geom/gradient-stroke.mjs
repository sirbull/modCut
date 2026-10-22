/**
 * Gradient on a stroke, along or across it (Illustrator's "Apply gradient along/across stroke").
 * The stroke is cut into bands that each take one colour: along the path for `along`, from the left
 * edge to the right for `across`. `samples` are as for variableStrokeRings: points along one subpath
 * with unit normals to its left (`[{ p, n, t }]`, t by length from 0 to 1). Each band is
 * `{ rings, t }`: polygons filled together (nonzero) and the gradient offset of its colour.
 */
import { widthAt } from './width-profile.mjs';

const EPS = 1e-9;
const lerp = (a, b, f) => a + (b - a) * f;
// The sample at `t`, between its neighbours; normals are interpolated and renormalised.
function sampleAt(samples, t) {
  let i = samples.findIndex((s) => s.t >= t);
  if (i <= 0) return samples[Math.max(0, i)] ?? samples.at(-1);
  const a = samples[i - 1], b = samples[i], f = (t - a.t) / Math.max(EPS, b.t - a.t);
  const n = [lerp(a.n[0], b.n[0], f), lerp(a.n[1], b.n[1], f)], len = Math.hypot(...n) || 1;
  return { p: [lerp(a.p[0], b.p[0], f), lerp(a.p[1], b.p[1], f)], n: [n[0] / len, n[1] / len], t };
}
const offsetPoint = (s, width, profile, u) => {
  // u = 0 is the left edge, 1 the right edge.
  const [l, r] = widthAt(profile, s.t), o = (l - u * (l + r)) * width;
  return [s.p[0] + s.n[0] * o, s.p[1] + s.n[1] * o];
};
const pathLength = (samples) => samples.reduce((sum, s, i) => i ? sum + Math.hypot(s.p[0] - samples[i - 1].p[0], s.p[1] - samples[i - 1].p[1]) : 0, 0);
function capRing(s, width, profile, direction, cap) {
  // A cap beyond an end (`direction` points away from the path), in the end's colour.
  const [l, r] = widthAt(profile, s.t), half = (l + r) / 2 * width;
  if (cap === 'butt' || !(half > EPS)) return null;
  const centre = offsetPoint(s, width, profile, l / Math.max(EPS, l + r)), from = Math.atan2(s.n[1], s.n[0]);
  if (cap === 'square') {
    const a = offsetPoint(s, width, profile, 0), b = offsetPoint(s, width, profile, 1), d = [direction[0] * half, direction[1] * half];
    return [a, [a[0] + d[0], a[1] + d[1]], [b[0] + d[0], b[1] + d[1]], b];
  }
  const sweep = Math.sign(s.n[0] * direction[1] - s.n[1] * direction[0]) || 1, out = [];
  for (let i = 0; i <= 16; i++) { const a = from + sweep * Math.PI * i / 16; out.push([centre[0] + Math.cos(a) * half, centre[1] + Math.sin(a) * half]); }
  return out;
}

/**
 * Bands of a gradient stroke on one subpath. `opaque` lets each band overlap the next one, so no
 * hairline seams show between them; with transparent stops the bands only touch.
 */
export function gradientStrokeBands(samples, width, profile, { mode, closed = false, cap = 'butt', opaque = true, maxBands = 256 } = {}) {
  if (samples.length < 2 || !(width > 0)) return [];
  const list = closed ? [...samples, { ...samples[0], t: 1 }] : samples;
  if (mode === 'across') {
    const count = Math.max(8, Math.min(64, Math.ceil(width / .05)));
    return Array.from({ length: count }, (_, j) => {
      const u0 = j / count, u1 = Math.min(1, (j + (opaque && j < count - 1 ? 1.5 : 1)) / count);
      const a = list.map((s) => offsetPoint(s, width, profile, u0)), b = list.map((s) => offsetPoint(s, width, profile, u1));
      if (closed) return { rings: [a.slice(0, -1), b.slice(0, -1).reverse()], t: (j + .5) / count };
      // Square caps lengthen every band; round caps are drawn square across a stroke.
      if (cap !== 'butt') {
        const half = (s) => { const [l, r] = widthAt(profile, s.t); return (l + r) / 2 * width; }, first = list[0], last = list.at(-1);
        const back = [first.n[1], -first.n[0]], ahead = [-last.n[1], last.n[0]];
        for (const [ring, u] of [[a, u0], [b, u1]]) {
          const p0 = offsetPoint(first, width, profile, u), p1 = offsetPoint(last, width, profile, u);
          ring.unshift([p0[0] + back[0] * half(first), p0[1] + back[1] * half(first)]); ring.push([p1[0] + ahead[0] * half(last), p1[1] + ahead[1] * half(last)]);
        }
      }
      return { rings: [[...a, ...b.reverse()]], t: (j + .5) / count };
    });
  }
  const count = Math.max(16, Math.min(maxBands, Math.ceil(pathLength(list) / .4))), bands = [];
  // Caps first, so the bands draw over where they meet.
  if (!closed && cap !== 'butt') {
    const first = list[0], last = list.at(-1);
    const start = capRing(first, width, profile, [first.n[1], -first.n[0]], cap), end = capRing(last, width, profile, [-last.n[1], last.n[0]], cap);
    if (start) bands.push({ rings: [start], t: 0 });
    if (end) bands.push({ rings: [end], t: 1 });
  }
  for (let k = 0; k < count; k++) {
    const t0 = k / count, t1 = Math.min(1, (k + (opaque && k < count - 1 ? 1.5 : 1)) / count);
    const inside = list.filter((s) => s.t > t0 && s.t < t1), spine = [sampleAt(list, t0), ...inside, sampleAt(list, t1)];
    const left = spine.map((s) => offsetPoint(s, width, profile, 0)), right = spine.map((s) => offsetPoint(s, width, profile, 1));
    bands.push({ rings: [[...left, ...right.reverse()]], t: (k + .5) / count });
  }
  return bands;
}
