/**
 * Linear and radial gradients as paint (schema: type, stops, origin, angle, length, aspect).
 * Geometry is in the object's own coordinates (mm). The angle is Illustrator's: degrees,
 * counterclockwise from the x axis on screen.
 */
import { appearance } from '../geometry.mjs';

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const rgb = (hex) => ({ space: 'rgb', values: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) });
export const colorHex = (color) => color?.space === 'rgb' ? '#' + color.values.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
export const isGradient = (paint) => paint?.type === 'linear' || paint?.type === 'radial';

/** A gradient across a box: linear from the left edge to the right, radial from the centre out. */
export function defaultGradient(box, { type = 'linear', stops = null, angle = 0 } = {}) {
  const width = Math.max(box.width, 1e-3), height = Math.max(box.height, 1e-3);
  const base = stops ?? [{ offset: 0, color: rgb('#FFFFFF') }, { offset: 1, color: rgb('#000000') }];
  if (type === 'radial') return { type, stops: structuredClone(base), origin: [box.x + width / 2, box.y + height / 2], angle: 0, length: Math.max(width, height) / 2, aspect: 1 };
  // A linear gradient spans the box along its angle, centred on the box.
  const a = angle * Math.PI / 180, dir = [Math.cos(a), -Math.sin(a)], span = Math.abs(dir[0]) * width + Math.abs(dir[1]) * height;
  const centre = [box.x + width / 2, box.y + height / 2];
  return { type, stops: structuredClone(base), origin: [centre[0] - dir[0] * span / 2, centre[1] - dir[1] * span / 2], angle, length: span, aspect: 1 };
}
/** Start and end of the gradient vector (for radial: centre and a point on the edge). */
export function gradientVector(g) {
  const a = g.angle * Math.PI / 180;
  return { origin: [...g.origin], destination: [g.origin[0] + Math.cos(a) * g.length, g.origin[1] - Math.sin(a) * g.length] };
}
/** The gradient whose vector runs from `from` to `to` (Gradient tool drag). */
export function vectorGradient(g, from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
  if (length < 1e-6) return structuredClone(g);
  return { ...structuredClone(g), origin: [...from], angle: Math.round(Math.atan2(-dy, dx) * 180 / Math.PI * 1e6) / 1e6 + 0, length };
}
export function colorAt(g, offset) {
  const s = [...g.stops].sort((a, b) => a.offset - b.offset), t = clamp(offset);
  if (t <= s[0].offset) return structuredClone(s[0].color);
  if (t >= s.at(-1).offset) return structuredClone(s.at(-1).color);
  const i = s.findIndex((stop) => stop.offset >= t), a = s[i - 1], b = s[i], f = (t - a.offset) / ((b.offset - a.offset) || 1);
  return { space: 'rgb', values: a.color.values.map((v, k) => v + (b.color.values[k] - v) * f) };
}
const sorted = (g) => ({ ...g, stops: [...g.stops].sort((a, b) => a.offset - b.offset) });
/** Add a stop in the middle of the widest gap (or at `offset`), coloured as the gradient is there. */
export function addStop(g, offset = null) {
  const s = sorted(g).stops;
  let at = offset;
  if (at === null) { let best = 0; for (let i = 1; i < s.length; i++) if (s[i].offset - s[i - 1].offset > s[best + 1].offset - s[best].offset) best = i - 1; at = (s[best].offset + s[best + 1].offset) / 2; }
  return sorted({ ...structuredClone(g), stops: [...structuredClone(s), { offset: clamp(at), color: colorAt(g, at) }] });
}
export function removeStop(g, index) {
  if (g.stops.length <= 2) throw new Error('A gradient needs at least two stops.');
  return { ...structuredClone(g), stops: g.stops.filter((_, i) => i !== index).map((s) => structuredClone(s)) };
}
/** Change one stop: `color` as hex, `offset` and `opacity` from 0 to 1. Stops stay ordered. */
export function updateStop(g, index, { color, offset, opacity } = {}) {
  if (!g.stops[index]) throw new Error('Choose a gradient stop.');
  const stops = structuredClone(g.stops), stop = stops[index];
  if (color !== undefined) { if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Enter a color as #RRGGBB.'); stop.color = rgb(color); }
  if (offset !== undefined) { if (!Number.isFinite(offset)) throw new Error('Enter a location from 0 to 100 %.'); stop.offset = clamp(offset); }
  if (opacity !== undefined) { if (!Number.isFinite(opacity)) throw new Error('Enter an opacity from 0 to 100 %.'); if (clamp(opacity) === 1) delete stop.opacity; else stop.opacity = clamp(opacity); }
  return sorted({ ...structuredClone(g), stops });
}
export function reverseGradient(g) {
  return sorted({ ...structuredClone(g), stops: g.stops.map((s) => ({ ...structuredClone(s), offset: 1 - s.offset })) });
}
/** Linear or radial, keeping stops; the vector is refitted to the box. */
export function setGradientType(g, type, box) { return { ...defaultGradient(box, { type, stops: g.stops, angle: type === 'linear' ? g.angle : 0 }) }; }
export function setGradientAngle(g, angle, box) {
  if (!Number.isFinite(angle)) throw new Error('Enter an angle.');
  return defaultGradient(box, { type: 'linear', stops: g.stops, angle: ((angle % 360) + 540) % 360 - 180 });
}
/** The first fill or stroke takes a gradient; a missing stroke gets the default width. */
export function changeGradient(original, kind, gradient, defaults = {}) {
  const result = structuredClone(original), key = kind === 'stroke' ? 'strokes' : 'fills';
  const first = result[key][0] ?? appearance(kind === 'fill' ? '#000000' : null, kind === 'stroke' ? '#000000' : null, defaults.strokeWidth ?? .5)[key][0];
  result[key] = [{ ...first, paint: structuredClone(gradient) }, ...result[key].slice(1)];
  return result;
}
/** A solid stand-in for places that need one colour (laser layers, legacy writers): the first stop. */
export function gradientHex(paint) { return isGradient(paint) ? colorHex([...paint.stops].sort((a, b) => a.offset - b.offset)[0].color) : null; }
/** CSS for the gradient bar in the panel (always left to right). */
export function gradientCss(g) {
  return `linear-gradient(to right, ${sorted(g).stops.map((s) => { const [r, gg, b] = s.color.values.map((v) => Math.round(clamp(v) * 255)); return `rgba(${r}, ${gg}, ${b}, ${s.opacity ?? 1}) ${Math.round(s.offset * 1000) / 10}%`; }).join(', ')})`;
}
