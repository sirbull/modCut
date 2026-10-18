/**
 * Live vector effects in `appearance.effects` (D3.2): applied in order to an object's geometry when it is
 * drawn, exported or sent to Cut, while the object keeps its own editable anchors. Hidden effects are
 * kept but skipped. Pure; Offset Path gets the polygon offset as a function.
 */
import { roundCorners } from '../geom/corners.mjs';
import { transformEachMatrix } from '../geom/transform-each.mjs';
import { WARP_STYLES, warpMapping } from '../geom/warp.mjs';
import { PATHFINDER_LABELS } from '../geom/pathfinder.mjs';
import { scribble } from '../geom/scribble.mjs';

export const EFFECTS = Object.freeze({
  'offset-path': { label: 'Offset Path', group: 'Path', defaults: { distance: 2, join: 'miter', miterLimit: 4 } },
  'round-corners': { label: 'Round Corners', group: 'Stylize', defaults: { radius: 2 } },
  transform: { label: 'Transform', group: 'Distort & Transform', defaults: { scaleX: 100, scaleY: 100, moveX: 5, moveY: 0, angle: 0, copies: 1 } },
  'zig-zag': { label: 'Zig Zag', group: 'Distort & Transform', defaults: { size: 1, ridges: 4, smooth: false } },
  'pucker-bloat': { label: 'Pucker & Bloat', group: 'Distort & Transform', defaults: { amount: 30 } },
  roughen: { label: 'Roughen', group: 'Distort & Transform', defaults: { size: .5, detail: 2, seed: 1 } },
  twist: { label: 'Twist', group: 'Distort & Transform', defaults: { angle: 45 } },
  warp: { label: 'Warp', group: 'Warp', defaults: { style: 'arc', bend: 50, horizontal: 0, vertical: 0, orientation: 'horizontal' } },
  // Live Pathfinder: on a group, its paths and shapes are drawn combined; the group keeps them editable.
  pathfinder: { label: 'Pathfinder', group: 'Pathfinder', container: true, defaults: { op: 'unite' } },
  // Scribble: the fill is drawn as one scribbled line in the fill colour (the renderer paints it as a stroke).
  scribble: { label: 'Scribble', group: 'Stylize', defaults: { angle: 30, spacing: 1, strokeWidth: .3, overlap: 0, variation: .2, curviness: 20, seed: 1 } },
  'drop-shadow': { label: 'Drop Shadow', group: 'Stylize', raster: true, defaults: { x: 1.5, y: 1.5, blur: 1.5, color: '#000000', opacity: .75 } },
});
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
/** A validated effect: `{ type, ...settings, hidden? }`. */
export function effect(type, settings = {}) {
  const definition = EFFECTS[type];
  if (!definition) throw new Error(`Unknown effect: ${type}`);
  const e = { type, ...definition.defaults, ...settings };
  const ok = type === 'offset-path' ? finite(e.distance, -1000, 1000) && ['miter', 'round', 'bevel'].includes(e.join) && finite(e.miterLimit, 1, 500)
    : type === 'round-corners' ? finite(e.radius, 0, 10000)
    : type === 'zig-zag' ? finite(e.size, -1000, 1000) && Number.isInteger(e.ridges) && e.ridges >= 0 && e.ridges <= 100 && typeof e.smooth === 'boolean'
    : type === 'pucker-bloat' ? finite(e.amount, -200, 200)
    : type === 'roughen' ? finite(e.size, 0, 1000) && finite(e.detail, 0, 100) && Number.isInteger(e.seed)
    : type === 'twist' ? finite(e.angle, -3600, 3600)
    : type === 'pathfinder' ? !!PATHFINDER_LABELS[e.op]
    : type === 'scribble' ? finite(e.angle, -360, 360) && finite(e.spacing, .05, 1000) && finite(e.strokeWidth, .01, 1000) && finite(e.overlap, -1000, 1000) && finite(e.variation, 0, 1000) && finite(e.curviness, 0, 100) && Number.isInteger(e.seed)
    : type === 'warp' ? !!WARP_STYLES[e.style] && finite(e.bend, -100, 100) && finite(e.horizontal, -100, 100) && finite(e.vertical, -100, 100) && ['horizontal', 'vertical'].includes(e.orientation)
    : type === 'drop-shadow' ? finite(e.x, -1000, 1000) && finite(e.y, -1000, 1000) && finite(e.blur, 0, 1000) && /^#[0-9A-Fa-f]{6}$/.test(e.color) && finite(e.opacity, 0, 1)
    : finite(e.scaleX, -100000, 100000) && finite(e.scaleY, -100000, 100000) && Math.abs(e.scaleX) > 1e-6 && Math.abs(e.scaleY) > 1e-6
      && finite(e.moveX, -100000, 100000) && finite(e.moveY, -100000, 100000) && finite(e.angle, -360, 360) && Number.isInteger(e.copies) && e.copies >= 0 && e.copies <= 1000;
  if (!ok) throw new Error(`Invalid ${definition.label} settings.`);
  const out = { type };
  for (const key of Object.keys(definition.defaults)) out[key] = e[key];
  if (settings.hidden) out.hidden = true;
  return out;
}
/** Illustrator's names in Effect > Pathfinder. */
export const LIVE_LABELS = Object.freeze({ unite: 'Add', intersect: 'Intersect', exclude: 'Exclude', minusFront: 'Subtract', minusBack: 'Minus Back', divide: 'Divide', trim: 'Trim', merge: 'Merge', crop: 'Crop', outline: 'Outline' });
export const effectLabel = (e) => e.type === 'pathfinder' ? `Pathfinder: ${LIVE_LABELS[e.op] ?? e.op}` : e.type === 'warp' ? `Warp: ${WARP_STYLES[e.style] ?? e.style}` : EFFECTS[e.type]?.label ?? e.type;
export const hasVectorEffects = (node) => (node.appearance?.effects ?? []).some((e) => !e.hidden && EFFECTS[e.type] && !EFFECTS[e.type].raster && !EFFECTS[e.type].container);
/** The live Pathfinder operation of a group, or null. */
export const livePathfinder = (node) => node?.type === 'group' ? (node.appearance?.effects ?? []).filter((e) => !e.hidden && e.type === 'pathfinder').at(-1)?.op ?? null : null;
/** The Scribble effect that decides how an object is painted (its fill becomes a stroked line), or null. */
export const scribbleOf = (node) => (node.appearance?.effects ?? []).filter((e) => !e.hidden && e.type === 'scribble').at(-1) ?? null;
/** The drop shadow drawn under an object: its last visible Drop Shadow effect, or null. */
export const dropShadow = (node) => (node.appearance?.effects ?? []).filter((e) => !e.hidden && e.type === 'drop-shadow').at(-1) ?? null;

// Curve helpers for the distortions: a cubic between two segments, sampled at t.
const at = (a, b, t) => { const p0 = a.p, p1 = [a.p[0] + a.out[0], a.p[1] + a.out[1]], p2 = [b.p[0] + b.in[0], b.p[1] + b.in[1]], p3 = b.p, u = 1 - t;
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]); };
const tangent = (a, b, t) => { const e = 1e-4, p = at(a, b, Math.max(0, t - e)), q = at(a, b, Math.min(1, t + e)), d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / d, (q[1] - p[1]) / d]; };
const pairs = (s) => s.segments.map((g, i) => [g, s.segments[i + 1] ?? (s.closed ? s.segments[0] : null)]).filter(([, b]) => b);
const centreOf = (subpaths) => { const b = boundsOf(subpaths); return [b.x + b.width / 2, b.y + b.height / 2, Math.hypot(b.width, b.height) / 2 || 1]; };
const corner = (p) => ({ p, in: [0, 0], out: [0, 0] });
/** Points along every segment, `count(a, b)` intervals each, with the anchors first. */
function resample(s, count, place) {
  const out = [];
  for (const [a, b] of pairs(s)) { const n = Math.max(1, count(a, b)); for (let k = 0; k < n; k++) out.push(place(a, b, k / n, k, n)); }
  if (!s.closed && s.segments.length) out.push(place(s.segments.at(-1), s.segments.at(-1), 0, 0, 1));
  return out;
}
const segmentLength = (a, b) => { let len = 0, prev = at(a, b, 0); for (let i = 1; i <= 16; i++) { const q = at(a, b, i / 16); len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; } return len; };
function random(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

const boundsOf = (subpaths) => {
  const pts = subpaths.flatMap((s) => s.segments.map((g) => g.p));
  if (!pts.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};
const mapSubpath = (s, [a, b, c, d, e, f]) => ({ closed: s.closed, segments: s.segments.map((g) => ({
  p: [a * g.p[0] + c * g.p[1] + e, b * g.p[0] + d * g.p[1] + f], in: [a * g.in[0] + c * g.in[1], b * g.in[0] + d * g.in[1]], out: [a * g.out[0] + c * g.out[1], b * g.out[0] + d * g.out[1]] })) });

/**
 * `subpaths` after the visible effects, in order. `offset(paths, options)` returns offset PathData or
 * null when the polygon library is not loaded yet; the effect is then skipped until the next draw.
 */
export function applyVectorEffects(subpaths, effects = [], { offset = () => null, fillRule = 'nonzero' } = {}) {
  let out = subpaths;
  for (const e of effects) {
    if (e.hidden || !EFFECTS[e.type] || EFFECTS[e.type].raster || EFFECTS[e.type].container || !out.length) continue;
    if (e.type === 'round-corners') out = out.map((s) => { const r = roundCorners(s, s.segments.map((_, i) => i), e.radius); const { cornerData, ...plain } = r; return plain; });
    else if (e.type === 'offset-path') { const result = offset([out], { distance: e.distance, join: e.join, miterLimit: e.miterLimit, fillRule }); if (result) out = result; }
    else if (e.type === 'zig-zag') out = out.map((s) => {
      // Each segment gets `ridges` points pushed alternately to either side; Smooth turns them into curves.
      let side = 1;
      const points = resample(s, () => e.ridges + 1, (a, b, t, k) => { const p = at(a, b, t), d = tangent(a, b, t); if (k === 0) return corner(p); side = -side;
        return corner([p[0] - d[1] * e.size * side, p[1] + d[0] * e.size * side]); });
      if (e.smooth) points.forEach((g, i) => { const prev = points[(i + points.length - 1) % points.length].p, next = points[(i + 1) % points.length].p, v = [(next[0] - prev[0]) / 6, (next[1] - prev[1]) / 6]; g.in = [-v[0], -v[1]]; g.out = v; });
      return { closed: s.closed, segments: points };
    });
    else if (e.type === 'pucker-bloat') {
      // Handles point away from the centre (Bloat, positive) or towards it (Pucker, negative).
      const [cx, cy] = centreOf(out), f = e.amount / 100;
      out = out.map((s) => ({ closed: s.closed, segments: s.segments.map((g) => ({ p: [...g.p], in: [(g.p[0] - cx) * f, (g.p[1] - cy) * f], out: [(g.p[0] - cx) * f, (g.p[1] - cy) * f] })) }));
    } else if (e.type === 'roughen') {
      // Seeded, so the same settings always draw the same outline.
      const rnd = random(e.seed);
      out = out.map((s) => ({ closed: s.closed, segments: resample(s, (a, b) => Math.ceil(segmentLength(a, b) * e.detail), (a, b, t) => { const p = at(a, b, t); return corner([p[0] + (rnd() * 2 - 1) * e.size, p[1] + (rnd() * 2 - 1) * e.size]); }) }));
    } else if (e.type === 'twist') {
      // Points turn more near the centre; curves are sampled first so the twist bends them.
      const [cx, cy, r] = centreOf(out);
      out = out.map((s) => ({ closed: s.closed, segments: resample(s, (a, b) => Math.max(4, Math.ceil(segmentLength(a, b) / Math.max(r / 24, .2))), (a, b, t) => {
        const p = at(a, b, t), dx = p[0] - cx, dy = p[1] - cy, angle = -e.angle * Math.PI / 180 * Math.max(0, 1 - Math.hypot(dx, dy) / r), c = Math.cos(angle), n = Math.sin(angle);
        return corner([cx + dx * c - dy * n, cy + dx * n + dy * c]); }) }));
    }
    else if (e.type === 'scribble') {
      // The outline is flattened (anchors kept) and filled with the scribbled line.
      const polygons = out.filter((sub) => sub.closed).map((sub) => resample(sub, (a, b) => Math.max(1, Math.ceil(segmentLength(a, b) / .25)), (a, b, t) => at(a, b, t)));
      out = scribble(polygons, e);
    }
    else if (e.type === 'warp') {
      // Curves are sampled densely enough that the bent outline stays smooth.
      const box = boundsOf(out), map = warpMapping(box, e), r = Math.hypot(box.width, box.height) / 2 || 1;
      out = out.map((s) => ({ closed: s.closed, segments: resample(s, (a, b) => Math.max(4, Math.ceil(segmentLength(a, b) / Math.max(r / 32, .1))), (a, b, t) => corner(map(at(a, b, t)))) }));
    }
    else if (e.type === 'transform') {
      // Transform with copies: each copy applies the transform once more to the previous one.
      const box = boundsOf(out), m = transformEachMatrix(box, e), copies = [out];
      let current = out;
      for (let i = 0; i < Math.max(1, e.copies); i++) { current = current.map((s) => mapSubpath(s, m)); copies.push(current); }
      out = e.copies ? copies.flat() : copies.at(-1);
    }
  }
  return out;
}
