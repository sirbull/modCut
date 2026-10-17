/**
 * Live vector effects in `appearance.effects` (D3.2): applied in order to an object's geometry when it is
 * drawn, exported or sent to Cut, while the object keeps its own editable anchors. Hidden effects are
 * kept but skipped. Pure; Offset Path gets the polygon offset as a function.
 */
import { roundCorners } from '../geom/corners.mjs';
import { transformEachMatrix } from '../geom/transform-each.mjs';

export const EFFECTS = Object.freeze({
  'offset-path': { label: 'Offset Path', group: 'Path', defaults: { distance: 2, join: 'miter', miterLimit: 4 } },
  'round-corners': { label: 'Round Corners', group: 'Stylize', defaults: { radius: 2 } },
  transform: { label: 'Transform', group: 'Distort & Transform', defaults: { scaleX: 100, scaleY: 100, moveX: 5, moveY: 0, angle: 0, copies: 1 } },
});
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
/** A validated effect: `{ type, ...settings, hidden? }`. */
export function effect(type, settings = {}) {
  const definition = EFFECTS[type];
  if (!definition) throw new Error(`Unknown effect: ${type}`);
  const e = { type, ...definition.defaults, ...settings };
  const ok = type === 'offset-path' ? finite(e.distance, -1000, 1000) && ['miter', 'round', 'bevel'].includes(e.join) && finite(e.miterLimit, 1, 500)
    : type === 'round-corners' ? finite(e.radius, 0, 10000)
    : finite(e.scaleX, -100000, 100000) && finite(e.scaleY, -100000, 100000) && Math.abs(e.scaleX) > 1e-6 && Math.abs(e.scaleY) > 1e-6
      && finite(e.moveX, -100000, 100000) && finite(e.moveY, -100000, 100000) && finite(e.angle, -360, 360) && Number.isInteger(e.copies) && e.copies >= 0 && e.copies <= 1000;
  if (!ok) throw new Error(`Invalid ${definition.label} settings.`);
  const out = { type };
  for (const key of Object.keys(definition.defaults)) out[key] = e[key];
  if (settings.hidden) out.hidden = true;
  return out;
}
export const effectLabel = (e) => EFFECTS[e.type]?.label ?? e.type;
export const hasVectorEffects = (node) => (node.appearance?.effects ?? []).some((e) => !e.hidden && EFFECTS[e.type]);

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
    if (e.hidden || !EFFECTS[e.type] || !out.length) continue;
    if (e.type === 'round-corners') out = out.map((s) => { const r = roundCorners(s, s.segments.map((_, i) => i), e.radius); const { cornerData, ...plain } = r; return plain; });
    else if (e.type === 'offset-path') { const result = offset([out], { distance: e.distance, join: e.join, miterLimit: e.miterLimit, fillRule }); if (result) out = result; }
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
