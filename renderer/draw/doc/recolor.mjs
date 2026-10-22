/**
 * Recolor Artwork: every colour in the selection on one artistic (RYB) colour wheel, moved together.
 * A session keeps the original colours; the wheel settings (rotation, radial scale, harmony rule,
 * per-colour overrides, slider and library) map each original to its new colour, so edits never drift.
 * Wheel angle: degrees counterclockwise from red at 3 o'clock, as Adobe Color draws it.
 */
import { isGradient } from './gradient.mjs';

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const wrap = (a) => ((a % 360) + 360) % 360;
const signed = (a) => { const w = wrap(a); return w > 180 ? w - 360 : w; };
const hex2 = (n) => Math.round(clamp(n) * 255).toString(16).padStart(2, '0');
export const rgbHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
export const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** HSB with s and b from 0 to 1. */
export function rgbHsb([r, g, b]) {
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [wrap(h * 60), max ? d / max : 0, max];
}
export function hsbRgb([h, s, v]) {
  const c = v * s, x = c * (1 - Math.abs(((wrap(h) / 60) % 2) - 1)), m = v - c, k = Math.floor(wrap(h) / 60);
  return [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k % 6].map((n) => n + m);
}

// RGB hue to artistic wheel angle: yellow sits opposite purple and red opposite green, as on a painter's wheel.
const RGB_KNOTS = [0, 35, 60, 120, 180, 240, 300, 360], WHEEL_KNOTS = [0, 60, 100, 165, 210, 260, 315, 360];
const piecewise = (from, to, v) => { const x = wrap(v); const i = from.findIndex((k, n) => x <= from[n + 1]); return to[i] + (x - from[i]) / (from[i + 1] - from[i]) * (to[i + 1] - to[i]); };
export const wheelAngle = (rgbHue) => wrap(piecewise(RGB_KNOTS, WHEEL_KNOTS, rgbHue));
export const rgbHue = (angle) => wrap(piecewise(WHEEL_KNOTS, RGB_KNOTS, angle));

/** A colour on the wheel: `[angle, saturation, brightness]`. */
export const hexWheel = (hex) => { const [h, s, b] = rgbHsb(hexRgb(hex)); return [wheelAngle(h), s, b]; };
export const wheelHex = ([a, s, b]) => rgbHex(hsbRgb([rgbHue(a), clamp(s), clamp(b)]));

/** Harmony rules as hue offsets on the wheel, after Adobe Color. `null` keeps the colours' own hues. */
export const HARMONY_RULES = Object.freeze([
  ['custom', 'Custom', null],
  ['analogous', 'Analogous', [0, 30, -30]],
  ['monochromatic', 'Monochromatic', [0]],
  ['triad', 'Triad', [0, 120, 240]],
  ['complementary', 'Complementary', [0, 180]],
  ['split-complementary', 'Split Complementary', [0, 150, 210]],
  ['double-split-complementary', 'Double Split Complementary', [0, 30, 150, 210]],
  ['square', 'Square', [0, 90, 180, 270]],
  ['compound', 'Compound', [0, 30, 165]],
  ['shades', 'Shades', [0]],
].map(([id, name, offsets]) => Object.freeze({ id, name, offsets: offsets && Object.freeze(offsets) })));
export const harmonyRule = (id) => HARMONY_RULES.find((rule) => rule.id === id) ?? HARMONY_RULES[0];

const paintEntries = (node) => [...(node.appearance?.fills ?? []), ...(node.appearance?.strokes ?? [])];
function paintColors(paint, visit) {
  if (paint?.type === 'solid' && paint.color?.space === 'rgb') visit(rgbHex(paint.color.values));
  else if (isGradient(paint)) for (const stop of paint.stops) if (stop.color?.space === 'rgb') visit(rgbHex(stop.color.values));
}
/** Distinct colours of the nodes' fills, strokes and gradient stops, most used first: `[{ hex, weight }]`. */
export function collectColors(nodes) {
  const counts = new Map();
  for (const node of nodes) for (const entry of paintEntries(node)) paintColors(entry.paint, (hex) => counts.set(hex, (counts.get(hex) ?? 0) + 1));
  return [...counts].map(([hex, weight]) => ({ hex, weight })).sort((a, b) => b.weight - a.weight || a.hex.localeCompare(b.hex));
}
/** The appearance with each colour replaced through `map` (hex to hex); opacity and gradient geometry stay. */
export function remapAppearance(appearance, map) {
  const next = structuredClone(appearance), swap = (color) => {
    const to = color?.space === 'rgb' && map.get(rgbHex(color.values));
    if (to) color.values = hexRgb(to);
  };
  for (const entry of [...next.fills, ...next.strokes]) {
    if (entry.paint?.type === 'solid') {
      const before = rgbHex(entry.paint.color.values); swap(entry.paint.color);
      // A changed colour no longer matches its global swatch.
      if (rgbHex(entry.paint.color.values) !== before) delete entry.paint.swatch;
    }
    else if (isGradient(entry.paint)) entry.paint.stops.forEach((stop) => swap(stop.color));
  }
  return next;
}

/** Wheel settings with no effect: the artwork keeps its colours. */
export function neutralSettings(colors = []) {
  const chromatic = colors.findIndex(({ hex }) => hexWheel(hex)[1] > .08);
  return { rule: 'custom', base: Math.max(0, chromatic), rotation: 0, scale: { saturation: 1, brightness: 1 }, adjust: { saturation: 0, brightness: 0 },
    mode: 'saturation', linked: true, overrides: {}, library: null };
}
// Slider: -1 moves every colour's value toward 0, +1 toward 1.
const adjust = (v, amount) => amount >= 0 ? v + (1 - v) * amount : v * (1 + amount);

/**
 * Harmony hues: the base keeps its hue; the other chromatic colours, in order of hue from the base, fill the
 * rule's slots evenly (so even colours of one hue spread across the rule) and keep a little of their spread.
 */
function harmonyHues(wheels, base, offsets) {
  const baseAngle = wheels[base]?.[0] ?? 0, slots = [...offsets].sort((a, b) => wrap(a) - wrap(b));
  const order = wheels.map((w, i) => [i, wrap(w[0] - baseAngle)]).filter(([i]) => i !== base && wheels[i][1] > .08).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const groups = slots.map(() => []), hues = new Map([[base, baseAngle]]);
  // With fewer colours than slots, skip the base's slot so each colour gets a hue of its own.
  const skip = slots.length > 1 && order.length < slots.length ? 1 : 0;
  order.forEach((item, n) => groups[skip + Math.floor(n * (slots.length - skip) / order.length)].push(item));
  groups.forEach((group, slot) => {
    const mean = group.reduce((sum, [, d]) => sum + d, 0) / (group.length || 1);
    for (const [i, d] of group) hues.set(i, wrap(baseAngle + slots[slot] + (slots.length > 1 ? clamp(d - mean, -12, 12) : 0)));
  });
  return hues;
}
/** Each colour's place on the wheel before the slider and library: `[angle, saturation, brightness]`. */
export function wheelColors(colors, settings) {
  const wheels = colors.map(({ hex }) => hexWheel(hex)), rule = harmonyRule(settings.rule);
  const hues = rule.offsets ? harmonyHues(wheels, settings.base, rule.offsets) : null, baseWheel = wheels[settings.base];
  return wheels.map(([a, s, b], i) => {
    let angle = hues?.get(i) ?? a, sat = s;
    if (rule.id === 'shades' && baseWheel && s > .08) sat = baseWheel[1];
    angle += settings.rotation;
    sat *= settings.scale.saturation; let bri = b * settings.scale.brightness;
    const o = settings.overrides[colors[i].hex];
    if (o) { angle += o.angle ?? 0; sat += o.saturation ?? 0; bri += o.brightness ?? 0; }
    return [wrap(angle), clamp(sat), clamp(bri)];
  });
}
/** Each colour with the slider applied: where its handle sits on the wheel. */
export const adjustedColors = (colors, settings) => wheelColors(colors, settings).map(([a, s, b]) => [a, adjust(s, settings.adjust.saturation), adjust(b, settings.adjust.brightness)]);
/** The finished colours, as the artwork gets them: `[hex, ...]` in the order of `colors`. */
export function recolorHexes(colors, settings, library = null) {
  return adjustedColors(colors, settings).map((wheel) => { const hex = wheelHex(wheel); return library?.length ? nearestColor(hex, library) : hex; });
}
export function recolorMap(colors, settings, library = null) {
  const out = recolorHexes(colors, settings, library);
  return new Map(colors.map(({ hex }, i) => [hex, out[i]]));
}

/** A point on the wheel (x right, y down, unit radius) for a colour, by the wheel's mode. */
export function wheelPoint([angle, s, b], mode = 'saturation') {
  const r = mode === 'brightness' ? b : s, t = angle * Math.PI / 180;
  return [Math.cos(t) * r, -Math.sin(t) * r];
}
export function pointWheel([x, y]) { return [wrap(Math.atan2(-y, x) * 180 / Math.PI), clamp(Math.hypot(x, y))]; }
/** The wheel's background colour at a unit point; the other value comes from the slider. */
export function wheelPixel(point, mode, level) {
  const [angle, r] = pointWheel(point);
  return mode === 'brightness' ? hsbRgb([rgbHue(angle), level, r]) : hsbRgb([rgbHue(angle), r, level]);
}
/** The value the wheel shows outside its radius, from the slider: saturation mode shows brightness. */
export const wheelLevel = (settings) => settings.mode === 'brightness' ? adjust(.85, settings.adjust.saturation) : adjust(.9, settings.adjust.brightness);

/** Wheel gestures. Plain: rotate everything; `radial`: also scale in and out; `single`: only the dragged colour. */
export function dragSettings(start, colors, index, from, to, { radial = false, single = false } = {}) {
  const next = structuredClone(start), mode = start.mode, key = mode === 'brightness' ? 'brightness' : 'saturation';
  const [a0, r0] = pointWheel(from), [a1, r1] = pointWheel(to), turn = signed(a1 - a0);
  if (single || !start.linked) {
    const hex = colors[index].hex, o = { ...(next.overrides[hex] ?? {}) };
    o.angle = (o.angle ?? 0) + turn; o[key] = (o[key] ?? 0) + (r1 - r0);
    next.overrides[hex] = o; return next;
  }
  next.rotation = signed(start.rotation + turn);
  if (radial) next.scale[key] = clamp(start.scale[key] * (r0 > .02 ? r1 / r0 : 1), 0, 4);
  return next;
}

/** CIE Lab for nearest-colour matching (sRGB, D65). */
export const hexLab = (hex) => rgbLab(hexRgb(hex));
export function rgbLab(rgb) {
  const lin = rgb.map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  const xyz = [[.4124, .3576, .1805], [.2126, .7152, .0722], [.0193, .1192, .9505]].map((row) => row.reduce((s, k, i) => s + k * lin[i], 0));
  const f = (t) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116, [x, y, z] = [xyz[0] / .95047, xyz[1], xyz[2] / 1.08883].map(f);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
/** Index of the Lab colour in `labs` nearest to `lab`. */
export function nearestIndex([l, a, b], labs) {
  let best = 0, distance = Infinity;
  labs.forEach(([l2, a2, b2], i) => { const d = (l - l2) ** 2 + (a - a2) ** 2 + (b - b2) ** 2; if (d < distance) { distance = d; best = i; } });
  return best;
}
export const nearestColor = (hex, library) => library[nearestIndex(hexLab(hex), library.map(hexLab))];
