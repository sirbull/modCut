/**
 * Variable stroke width (D4.1). A stroke's `widthProfile` is a list of width points
 * `{ t, left, right }`: `t` is the position along the path (0 to 1 by length), `left` and `right` are
 * each side's width as a share of the stroke weight (0.5 + 0.5 is the plain stroke). Changing the weight
 * scales the profile, as in Illustrator. Pure.
 */
export const WIDTH_PROFILES = Object.freeze({
  uniform: { label: 'Uniform', points: null },
  'profile-1': { label: 'Width Profile 1', points: [{ t: 0, left: 0, right: 0 }, { t: .5, left: .5, right: .5 }, { t: 1, left: 0, right: 0 }] },
  'profile-2': { label: 'Width Profile 2', points: [{ t: 0, left: .5, right: .5 }, { t: .5, left: .1, right: .1 }, { t: 1, left: .5, right: .5 }] },
  'profile-3': { label: 'Width Profile 3', points: [{ t: 0, left: .5, right: .5 }, { t: 1, left: 0, right: 0 }] },
  'profile-4': { label: 'Width Profile 4', points: [{ t: 0, left: 0, right: 0 }, { t: 1, left: .5, right: .5 }] },
  'profile-5': { label: 'Width Profile 5', points: [{ t: 0, left: 0, right: 0 }, { t: .15, left: .5, right: .5 }, { t: .85, left: .5, right: .5 }, { t: 1, left: 0, right: 0 }] },
  'profile-6': { label: 'Width Profile 6', points: [{ t: 0, left: .1, right: .1 }, { t: .5, left: .5, right: .5 }, { t: 1, left: .1, right: .1 }] },
});
const EPS = 1e-6, MAX_SIDE = 100;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** A valid profile, sorted by position, or null for the plain (uniform) stroke. */
export function normalizeProfile(points) {
  if (!Array.isArray(points) || !points.length) return null;
  const out = points.map((p) => ({ t: clamp(Number(p.t), 0, 1), left: clamp(Number(p.left), 0, MAX_SIDE), right: clamp(Number(p.right), 0, MAX_SIDE) }))
    .filter((p) => [p.t, p.left, p.right].every(Number.isFinite)).sort((a, b) => a.t - b.t);
  if (!out.length || out.every((p) => Math.abs(p.left - .5) < EPS && Math.abs(p.right - .5) < EPS)) return null;
  return out;
}
/** The profile preset a profile matches, or 'custom'. */
export function profileName(points) {
  const p = normalizeProfile(points);
  for (const [id, preset] of Object.entries(WIDTH_PROFILES)) {
    const q = normalizeProfile(preset.points);
    if (!p && !q) return id;
    if (p && q && p.length === q.length && p.every((a, i) => ['t', 'left', 'right'].every((k) => Math.abs(a[k] - q[i][k]) < 1e-4))) return id;
  }
  return 'custom';
}
/** Profile mirrored end to end (Flip Along), or side to side (Flip Across). */
export const flipAlong = (points) => normalizeProfile((points ?? []).map((p) => ({ t: 1 - p.t, left: p.right, right: p.left })));
export const flipAcross = (points) => normalizeProfile((points ?? []).map((p) => ({ t: p.t, left: p.right, right: p.left })));

const smooth = (u) => u * u * (3 - 2 * u);
/** [left, right] side widths (shares of the weight) at `t`, eased between width points and flat beyond the ends. */
export function widthAt(points, t) {
  const p = normalizeProfile(points);
  if (!p) return [.5, .5];
  if (t <= p[0].t) return [p[0].left, p[0].right];
  if (t >= p.at(-1).t) return [p.at(-1).left, p.at(-1).right];
  const i = p.findIndex((q) => q.t >= t), a = p[i - 1], b = p[i], u = smooth((t - a.t) / Math.max(EPS, b.t - a.t));
  return [a.left + (b.left - a.left) * u, a.right + (b.right - a.right) * u];
}

/**
 * Filled outline of a variable-width stroke. `samples` are points along one subpath with unit normals
 * pointing to its left (`[{ p:[x,y], n:[nx,ny], t }]`); `width` is the stroke weight. Open paths give one
 * ring (left side out, right side back, round ends with `cap: 'round'`), closed paths an outer and an
 * inner ring wound opposite ways, so a nonzero fill leaves the inside empty.
 */
export function variableStrokeRings(samples, width, points, { closed = false, cap = 'butt' } = {}) {
  if (samples.length < 2) return [];
  const side = (s, k) => { const [l, r] = widthAt(points, s.t), w = (k > 0 ? l : r) * width * k; return [s.p[0] + s.n[0] * w, s.p[1] + s.n[1] * w]; };
  const left = samples.map((s) => side(s, 1)), right = samples.map((s) => side(s, -1));
  if (closed) return [left, right.reverse()];
  const ring = [...left], last = samples.length - 1;
  const towards = (i, j) => [samples[j].p[0] - samples[i].p[0], samples[j].p[1] - samples[i].p[1]];
  if (cap === 'round') ring.push(...roundCap(samples[last], widthAt(points, samples[last].t), width, towards(last - 1, last), 1));
  ring.push(...right.reverse());
  if (cap === 'round') ring.push(...roundCap(samples[0], widthAt(points, samples[0].t), width, towards(1, 0), -1));
  return [ring];
}
// Half circle round an end, bulging along `d`: from the left side to the right (end, k = 1) or back (start, k = -1).
function roundCap(s, [l, r], width, d, k) {
  const radius = (l + r) / 2 * width, out = [], steps = 12;
  if (!(radius > EPS)) return out;
  const centre = [s.p[0] + s.n[0] * (l - r) / 2 * width, s.p[1] + s.n[1] * (l - r) / 2 * width];
  const from = Math.atan2(s.n[1] * k, s.n[0] * k), sweep = Math.sign(cross([s.n[0] * k, s.n[1] * k], d)) || 1;
  for (let i = 1; i < steps; i++) { const a = from + sweep * Math.PI * i / steps; out.push([centre[0] + Math.cos(a) * radius, centre[1] + Math.sin(a) * radius]); }
  return out;
}
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

/**
 * The profile after the Width tool sets the width at `t`: an existing point within `snap` of `t` (or
 * `index`) changes, otherwise one is added. `side` is 'both' (symmetric) or 'left'/'right' (Alt-drag).
 */
export function setWidthPoint(points, { t, index = -1, share, side = 'both', snap = .01 }) {
  const list = (normalizeProfile(points) ?? [{ t: 0, left: .5, right: .5 }, { t: 1, left: .5, right: .5 }]).map((p) => ({ ...p }));
  let i = index >= 0 && index < list.length ? index : list.findIndex((p) => Math.abs(p.t - t) <= snap);
  if (i < 0) { const [left, right] = widthAt(list, t); list.push({ t: clamp(t, 0, 1), left, right }); list.sort((a, b) => a.t - b.t); i = list.findIndex((p) => p.t === clamp(t, 0, 1)); }
  const v = clamp(share, 0, MAX_SIDE), p = list[i];
  if (side === 'left') p.left = v; else if (side === 'right') p.right = v; else { const total = p.left + p.right, k = total > EPS ? 2 * v / total : 1; p.left = total > EPS ? p.left * k : v; p.right = total > EPS ? p.right * k : v; }
  return { points: normalizeProfile(list), index: i };
}
/** The profile without width point `index`; ends are kept so the stroke never loses its length. */
export function removeWidthPoint(points, index) {
  const list = normalizeProfile(points);
  if (!list || index < 0 || index >= list.length) return list;
  return normalizeProfile(list.filter((_, i) => i !== index));
}
/** The profile with point `index` slid to `t` (between its neighbours). */
export function moveWidthPoint(points, index, t) {
  const list = normalizeProfile(points);
  if (!list?.[index]) return list;
  const lo = list[index - 1]?.t ?? 0, hi = list[index + 1]?.t ?? 1;
  list[index] = { ...list[index], t: clamp(t, lo, hi) };
  return list;
}
