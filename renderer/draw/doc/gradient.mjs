/**
 * Linear and radial gradients as paint (schema: type, stops, origin, angle, length, aspect).
 * Geometry is in the object's own coordinates (mm). The angle is Illustrator's: degrees,
 * counterclockwise from the x axis on screen.
 */
import { appearance } from '../geometry.mjs';
import { freeformCss, isFreeform } from './freeform.mjs';

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const rgb = (hex) => ({ space: 'rgb', values: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) });
export const colorHex = (color) => color?.space === 'rgb' ? '#' + color.values.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
export const isGradient = (paint) => paint?.type === 'linear' || paint?.type === 'radial';
/** Linear, radial or freeform: any paint the Gradient panel and tool edit. */
export const isAnyGradient = (paint) => isGradient(paint) || isFreeform(paint);

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
export function setGradientType(g, type, box) { return keepMode(g, defaultGradient(box, { type, stops: g.stops, angle: type === 'linear' ? g.angle : 0 })); }
// Refitting a gradient keeps how a stroke takes it.
const keepMode = (from, to) => from?.strokeMode ? { ...to, strokeMode: from.strokeMode } : to;
export function setGradientAngle(g, angle, box) {
  if (!Number.isFinite(angle)) throw new Error('Enter an angle.');
  return keepMode(g, defaultGradient(box, { type: 'linear', stops: g.stops, angle: ((angle % 360) + 540) % 360 - 180 }));
}
/** The first fill or stroke takes a gradient; a missing stroke gets the default width. */
export function changeGradient(original, kind, gradient, defaults = {}) {
  const result = structuredClone(original), key = kind === 'stroke' ? 'strokes' : 'fills';
  const first = result[key][0] ?? appearance(kind === 'fill' ? '#000000' : null, kind === 'stroke' ? '#000000' : null, defaults.strokeWidth ?? .5)[key][0];
  result[key] = [{ ...first, paint: structuredClone(gradient) }, ...result[key].slice(1)];
  return result;
}
/** A solid stand-in for places that need one colour (laser layers, legacy writers): the first stop. */
export function gradientHex(paint) { return isGradient(paint) ? colorHex([...paint.stops].sort((a, b) => a.offset - b.offset)[0].color) : isFreeform(paint) ? colorHex(paint.points[0].color) : null; }
/** CSS for the gradient bar in the panel (always left to right). */
export function gradientCss(g) {
  if (isFreeform(g)) return freeformCss(g);
  return `linear-gradient(to right, ${sorted(g).stops.map((s) => { const [r, gg, b] = s.color.values.map((v) => Math.round(clamp(v) * 255)); return `rgba(${r}, ${gg}, ${b}, ${s.opacity ?? 1}) ${Math.round(s.offset * 1000) / 10}%`; }).join(', ')})`;
}
/** Move one stop to `offset`; returns the gradient and the stop's index after reordering. */
export function moveStop(g, index, offset) {
  const next = updateStop(g, index, { offset }), moved = g.stops[index], at = clamp(offset);
  return { gradient: next, index: Math.max(0, next.stops.findIndex((s) => s.offset === at && colorHex(s.color) === colorHex(moved.color) && (s.opacity ?? 1) === (moved.opacity ?? 1))) };
}
/** CSS for a preset tile: linear left to right, radial from the centre. */
export function gradientPreviewCss(g) {
  if (isFreeform(g)) return freeformCss(g);
  const css = gradientCss(g);
  return g.type === 'radial' ? css.replace(/^linear-gradient\(to right, /, 'radial-gradient(circle closest-side, ') : css;
}
const presetStops = (list) => list.map(([hex, offset, opacity]) => ({ offset, color: rgb(hex), ...(opacity !== undefined && opacity < 1 ? { opacity } : {}) }));
/** Built-in gradients, as Illustrator's Document Library. */
export const GRADIENT_PRESETS = Object.freeze([
  ['white-black', 'White, Black', 'linear', [['#FFFFFF', 0], ['#000000', 1]]],
  ['black-transparent', 'Black, Transparent', 'linear', [['#000000', 0], ['#000000', 1, 0]]],
  ['sunset', 'Sunset', 'linear', [['#FFE600', 0], ['#FF8A00', .5], ['#E5243B', 1]]],
  ['sky', 'Sky', 'linear', [['#A8E0FF', 0], ['#1473E6', 1]]],
  ['mint', 'Mint', 'linear', [['#E3F7EF', 0], ['#00A07A', 1]]],
  ['violet', 'Violet', 'linear', [['#FF7EB3', 0], ['#6A3DE8', 1]]],
  ['steel', 'Steel', 'linear', [['#5A6270', 0], ['#E6E9EE', .45], ['#9AA2AE', .55], ['#3C424C', 1]]],
  ['spectrum', 'Spectrum', 'linear', [['#FF0000', 0], ['#FFFF00', .2], ['#00FF00', .4], ['#00FFFF', .6], ['#0000FF', .8], ['#FF00FF', 1]]],
  ['white-black-radial', 'White, Black (radial)', 'radial', [['#FFFFFF', 0], ['#000000', 1]]],
  ['glow', 'Fade to transparent', 'radial', [['#FFFFFF', 0], ['#FFFFFF', 1, 0]]],
  ['ember', 'Ember', 'radial', [['#FFF3B0', 0], ['#FF8A00', .45], ['#7A1010', 1]]],
].map(([id, name, type, stops]) => Object.freeze({ id, name, gradient: Object.freeze({ type, stops: presetStops(stops), angle: 0 }) })));
/**
 * A preset or recent gradient on an object: the same type keeps its vector and only takes the stops,
 * another type is fitted to the box.
 */
export function applyGradientPreset(current, preset, box) {
  if (current?.type === preset.type) return { ...structuredClone(current), stops: structuredClone(preset.stops) };
  return keepMode(current, defaultGradient(box, { type: preset.type, stops: preset.stops, angle: preset.type === 'linear' ? preset.angle ?? 0 : 0 }));
}
/** Type and stops only, for Recent and swatches; two gradients with the same look share a key. */
export function gradientLook(g) { return { type: g.type, stops: sorted(g).stops.map((s) => structuredClone(s)), angle: g.angle ?? 0 }; }
export const gradientKey = (g) => JSON.stringify([g.type, sorted(g).stops.map((s) => [colorHex(s.color), Math.round(s.offset * 1000), Math.round((s.opacity ?? 1) * 1000)])]);
/** Stop opacity at `offset`, between the stops around it. */
export function opacityAt(g, offset) {
  const s = sorted(g).stops, t = clamp(offset), o = (stop) => stop.opacity ?? 1;
  if (t <= s[0].offset) return o(s[0]);
  if (t >= s.at(-1).offset) return o(s.at(-1));
  const i = s.findIndex((stop) => stop.offset >= t), a = s[i - 1], b = s[i];
  return o(a) + (o(b) - o(a)) * (t - a.offset) / ((b.offset - a.offset) || 1);
}
export const STROKE_MODES = Object.freeze(['within', 'along', 'across']);
/** How a stroke takes its gradient: within (across the object's box, the default), along or across the stroke. */
export function setStrokeMode(g, mode) {
  if (!STROKE_MODES.includes(mode)) throw new Error('Choose within, along or across the stroke.');
  const next = structuredClone(g);
  if (mode === 'within') delete next.strokeMode; else next.strokeMode = mode;
  return next;
}
