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
/** Side widths at `t`: smooth interior controls, straight corner tapers and a continuous closed seam. */
export function widthAt(points, t, { closed = false, corners = [] } = {}) {
  let p = normalizeProfile(points);
  if (!p) return [.5, .5];
  if (closed) {
    // 0 and 1 are the same point, rather than two unrelated ends of an open path.
    if (p[0].t < EPS && p.at(-1).t > 1-EPS) p = p.slice(0,-1);
    if (p.length === 1) return [p[0].left,p[0].right];
    t = ((t % 1)+1)%1;
    p = [{...p.at(-1),t:p.at(-1).t-1},...p,{...p[0],t:p[0].t+1}];
  }
  if (t <= p[0].t) return [p[0].left, p[0].right];
  if (t >= p.at(-1).t) return [p.at(-1).left, p.at(-1).right];
  const i = p.findIndex((q) => q.t >= t), a = p[i - 1], b = p[i], f = (t - a.t) / Math.max(EPS, b.t - a.t);
  const corner = t => corners.some(c => Math.abs(c-t)<EPS || closed && Math.abs(Math.abs(c-t)-1)<EPS);
  // A hard corner keeps a pointed taper; an interior width point has a horizontal
  // tangent. Between two corners the taper is straight. With one interior point,
  // quadratic easing gives a rounded bulge without an S-shaped neck at the corner.
  const aCorner = corner(a.t), bCorner = corner(b.t);
  const u = aCorner ? (bCorner ? f : f * (2 - f)) : bCorner ? f * f : smooth(f);
  return [a.left + (b.left - a.left) * u, a.right + (b.right - a.right) * u];
}

/**
 * Filled outline of a variable-width stroke. `samples` are points along one subpath with unit normals
 * pointing to its left (`[{ p:[x,y], n:[nx,ny], t }]`); `width` is the stroke weight. Open paths give one
 * ring (left side out, right side back, round ends with `cap: 'round'`), closed paths an outer and an
 * inner ring wound opposite ways, so a nonzero fill leaves the inside empty.
 */
export function variableStrokeRings(samples, width, points, { closed = false, cap = 'butt', join = 'miter', miterLimit = 4, corners = [] } = {}) {
  if (samples.length < 2) return [];
  const options = {closed,corners}, at = t => widthAt(points,t,options);
  const side = (s, k, n = s.n) => { const [l, r] = at(s.t), w = (k > 0 ? l : r) * width * k; return [s.p[0] + n[0] * w, s.p[1] + n[1] * w]; };
  const groups=[];
  for(const s of samples){const previous=groups.at(-1);
    if(previous && distance(previous.p,s.p)<EPS){previous.out=s.n;continue;}
    groups.push({...s,in:s.incoming??s.n,out:s.n});
  }
  if(closed && groups.length>1 && distance(groups[0].p,groups.at(-1).p)<EPS){groups[0].in=groups.pop().in;}
  const edge = k => groups.flatMap((s,i)=>{
    const a=side(s,k,s.in),b=side(s,k,s.out);
    if(distance(a,b)<EPS)return [b];
    const previous=groups[(i+groups.length-1)%groups.length],next=groups[(i+1)%groups.length];
    const from=side(previous,k,previous.out),to=side(next,k,next.in),incoming=sub(a,from),outgoing=sub(to,b);
    const intersection=lineIntersection(a,incoming,b,outgoing),radius=Math.max(distance(s.p,a),EPS);
    const outer=cross(sub(s.p,previous.p),sub(a,s.p))*cross(sub(s.p,previous.p),sub(next.p,s.p))<0;
    if(intersection && (!outer || join==='miter' && distance(intersection,s.p)<=radius*miterLimit))return [intersection];
    if(!outer || join!=='round')return [a,b];
    const start=Math.atan2(a[1]-s.p[1],a[0]-s.p[0]),v=sub(a,s.p),w=sub(b,s.p),sweep=Math.atan2(cross(v,w),v[0]*w[0]+v[1]*w[1]);
    const steps=arcSteps(radius,Math.abs(sweep));
    return Array.from({length:steps+1},(_,j)=>[s.p[0]+Math.cos(start+sweep*j/steps)*radius,s.p[1]+Math.sin(start+sweep*j/steps)*radius]);
  });
  const left = edge(1), right = edge(-1);
  if (closed) return [left, right.reverse()];
  const ring = [...left], last = samples.length - 1;
  const towards = (i, j) => [samples[j].p[0] - samples[i].p[0], samples[j].p[1] - samples[i].p[1]];
  if (cap === 'round') ring.push(...roundCap(samples[last], at(samples[last].t), width, towards(last - 1, last), 1));
  ring.push(...right.reverse());
  if (cap === 'round') ring.push(...roundCap(samples[0], at(samples[0].t), width, towards(1, 0), -1));
  return [ring];
}
// Half circle round an end, bulging along `d`: from the left side to the right (end, k = 1) or back (start, k = -1).
function roundCap(s, [l, r], width, d, k) {
  const radius = (l + r) / 2 * width, out = [], steps = arcSteps(radius,Math.PI);
  if (!(radius > EPS)) return out;
  const centre = [s.p[0] + s.n[0] * (l - r) / 2 * width, s.p[1] + s.n[1] * (l - r) / 2 * width];
  const from = Math.atan2(s.n[1] * k, s.n[0] * k), sweep = Math.sign(cross([s.n[0] * k, s.n[1] * k], d)) || 1;
  for (let i = 1; i < steps; i++) { const a = from + sweep * Math.PI * i / steps; out.push([centre[0] + Math.cos(a) * radius, centre[1] + Math.sin(a) * radius]); }
  return out;
}
// Keep curved ends/joins smooth at any stroke weight. Twelve fixed chords were
// visibly polygonal on wide strokes and could not be fitted into accurate arcs.
function arcSteps(radius,sweep){
  if(!(radius>EPS))return 1;
  const tolerance=Math.min(.001,radius/2000);
  return Math.max(1,Math.min(4096,Math.ceil(sweep/(2*Math.acos(1-tolerance/radius)))));
}
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub = (a,b) => [a[0]-b[0],a[1]-b[1]];
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
function lineIntersection(a,u,b,v){const d=cross(u,v);if(Math.abs(d)<1e-12)return null;const t=cross(sub(b,a),v)/d;return [a[0]+u[0]*t,a[1]+u[1]*t];}

/**
 * The profile after the Width tool sets the width at `t`: an existing point within `snap` of `t` (or
 * `index`) changes, otherwise one is added. Sharp `corners` keep their original width until edited.
 * `side` is 'both' (symmetric) or 'left'/'right' (Alt-drag); a closed seam is one shared point.
 */
export function setWidthPoint(points, { t, index = -1, share, side = 'both', snap = .01, closed = false, corners = [] }) {
  const original=normalizeProfile(points),active=original?.[index]?.t;
  const list = (original ?? [{ t: 0, left: .5, right: .5 }, { t: 1, left: .5, right: .5 }]).map((p) => ({ ...p }));
  for(const at of corners)if(!list.some(p=>Math.abs(p.t-at)<EPS)){const [left,right]=widthAt(original,at,{closed,corners});list.push({t:at,left,right});}
  list.sort((a,b)=>a.t-b.t);
  t=active??t;
  if(closed && (t<snap || t>1-snap))t=0;
  let i = list.findIndex((p) => Math.abs(p.t - t) <= (active===undefined?snap:EPS));
  if (i < 0) { const [left, right] = widthAt(list, t, {closed,corners}); list.push({ t: clamp(t, 0, 1), left, right }); list.sort((a, b) => a.t - b.t); i = list.findIndex((p) => p.t === clamp(t, 0, 1)); }
  const v = clamp(share, 0, MAX_SIDE), p = list[i];
  if (side === 'left') p.left = v; else if (side === 'right') p.right = v; else { const total = p.left + p.right, k = total > EPS ? 2 * v / total : 1; p.left = total > EPS ? p.left * k : v; p.right = total > EPS ? p.right * k : v; }
  if(closed && (p.t<EPS || p.t>1-EPS))for(const end of list)if(end.t<EPS||end.t>1-EPS){end.left=p.left;end.right=p.right;}
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
