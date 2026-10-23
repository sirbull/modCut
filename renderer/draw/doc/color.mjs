/** Pure color-mode conversions for the Color panel. Paint is stored as RGB; other modes are views. */
export const COLOR_MODES = Object.freeze({
  rgb: Object.freeze({ name: 'RGB', channels: Object.freeze([['R', 255], ['G', 255], ['B', 255]]) }),
  hsb: Object.freeze({ name: 'HSB', channels: Object.freeze([['H', 360], ['S', 100], ['B', 100]]) }),
  cmyk: Object.freeze({ name: 'CMYK', channels: Object.freeze([['C', 100], ['M', 100], ['Y', 100], ['K', 100]]) }),
  gray: Object.freeze({ name: 'Grayscale', channels: Object.freeze([['K', 100]]) }),
});
const round = (n, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
export function normalizeHex(value) {
  const text = String(value).trim().replace(/^#/, '');
  const full = /^[0-9a-f]{3}$/i.test(text) ? [...text].map((c) => c + c).join('') : text;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error('Enter a hex color such as #1A2B3C.');
  return `#${full.toUpperCase()}`;
}
export const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(normalizeHex(hex).slice(i, i + 2), 16));
export const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

function toHsb([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => v / 255), max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max * 100 : 0, max * 100];
}
function fromHsb([h, s, v]) {
  const S = s / 100, V = v / 100, c = V * S, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = V - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((n) => (n + m) * 255);
}
// Device CMYK without a color profile, matching the renderer's preview conversion.
function toCmyk([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => v / 255), k = 1 - Math.max(R, G, B);
  if (k >= 1) return [0, 0, 0, 100];
  return [...[R, G, B].map((v) => (1 - v - k) / (1 - k) * 100), k * 100];
}
const fromCmyk = ([c, m, y, k]) => [c, m, y].map((v) => 255 * (1 - v / 100) * (1 - k / 100));
// Grayscale K is ink coverage: 0 is white, 100 is black.
const toGray = ([r, g, b]) => [(1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255) * 100];
const fromGray = ([k]) => Array(3).fill(255 * (1 - k / 100));

export function colorValues(mode, hex) {
  const rgb = hexToRgb(hex);
  const values = { rgb: () => rgb, hsb: () => toHsb(rgb), cmyk: () => toCmyk(rgb), gray: () => toGray(rgb) }[mode];
  if (!values) throw new Error(`Unknown color mode: ${mode}`);
  return values().map((v) => round(v, mode === 'rgb' ? 0 : 1));
}
export function colorFromValues(mode, values) {
  const spec = COLOR_MODES[mode];
  if (!spec) throw new Error(`Unknown color mode: ${mode}`);
  if (values.length !== spec.channels.length) throw new Error(`${spec.name} needs ${spec.channels.length} values.`);
  values.forEach((v, i) => {
    const [label, max] = spec.channels[i];
    if (!Number.isFinite(v) || v < 0 || v > max) throw new Error(`${label} must be between 0 and ${max}.`);
  });
  const rgb = { rgb: (v) => v, hsb: fromHsb, cmyk: fromCmyk, gray: fromGray }[mode](mode === 'hsb' ? [values[0] % 360, values[1], values[2]] : values);
  return rgbToHex(rgb);
}
