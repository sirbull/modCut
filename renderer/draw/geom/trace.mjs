/**
 * Image Trace (D3.3), pure: pixels in, closed polygons per colour out (pixel units, y down). The caller
 * maps them into the image's place and fits curves. `image` is { width, height, data: RGBA bytes }.
 */
export const TRACE_PRESETS = Object.freeze({
  'bw-logo': { label: 'Black and White Logo', mode: 'bw', threshold: 128, noise: 4, fidelity: 70, ignoreWhite: true },
  silhouettes: { label: 'Silhouettes', mode: 'bw', threshold: 200, noise: 12, fidelity: 50, ignoreWhite: true },
  'three-colors': { label: '3 Colors', mode: 'color', colors: 3, noise: 6, fidelity: 70, ignoreWhite: false },
  'six-colors': { label: '6 Colors', mode: 'color', colors: 6, noise: 6, fidelity: 70, ignoreWhite: false },
  'sixteen-colors': { label: '16 Colors', mode: 'color', colors: 16, noise: 4, fidelity: 80, ignoreWhite: false },
  grays: { label: 'Shades of Gray', mode: 'gray', colors: 6, noise: 4, fidelity: 70, ignoreWhite: false },
  'laser-cut': { label: 'Laser: Cut outline', mode: 'bw', threshold: 128, noise: 4, fidelity: 70, ignoreWhite: true, outerOnly: true, minDetailMm: .5 },
  'laser-engrave': { label: 'Laser: Engrave fill', mode: 'bw', threshold: 128, noise: 2, fidelity: 85, ignoreWhite: true },
});
const luminance = (d, i) => .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
/** Downscaled pixels so tracing stays fast: at most `maxPixels`. */
export function traceScale(width, height, maxPixels = 1_000_000) { return Math.min(1, Math.sqrt(maxPixels / Math.max(1, width * height))); }

/** Colour index per pixel (-1 for transparent and ignored white) and the palette as [r, g, b]. */
export function quantize(image, { mode = 'bw', threshold = 128, colors = 6, ignoreWhite = false } = {}) {
  const { width, height, data } = image, n = width * height, labels = new Int32Array(n).fill(-1);
  const opaque = (i) => data[i * 4 + 3] >= 128, white = (i) => data[i * 4] > 245 && data[i * 4 + 1] > 245 && data[i * 4 + 2] > 245;
  if (mode === 'bw') {
    for (let i = 0; i < n; i++) if (opaque(i) && luminance(data, i * 4) < threshold) labels[i] = 0;
    return { labels, palette: [[0, 0, 0]] };
  }
  if (mode === 'gray') {
    const levels = Math.max(2, Math.min(256, colors)), palette = [];
    for (let k = 0; k < levels; k++) { const v = Math.round(k * 255 / (levels - 1)); palette.push([v, v, v]); }
    for (let i = 0; i < n; i++) if (opaque(i)) { const k = Math.round(luminance(data, i * 4) / 255 * (levels - 1)); labels[i] = ignoreWhite && k === levels - 1 ? -1 : k; }
    return { labels, palette };
  }
  // Colour: k-means on a sample, seeded with evenly spread pixels so the result is the same every time.
  const k = Math.max(2, Math.min(256, colors)), sample = [], step = Math.max(1, Math.floor(n / 20000));
  for (let i = 0; i < n; i += step) if (opaque(i)) sample.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  if (!sample.length) return { labels, palette: [] };
  let centres = Array.from({ length: Math.min(k, sample.length) }, (_, j) => [...sample[Math.floor(j * sample.length / Math.min(k, sample.length))]]);
  const nearest = (r, g, b) => { let best = 0, d = Infinity; centres.forEach((c, j) => { const e = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (e < d) { d = e; best = j; } }); return best; };
  for (let round = 0; round < 8; round++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const [r, g, b] of sample) { const s = sums[nearest(r, g, b)]; s[0] += r; s[1] += g; s[2] += b; s[3]++; }
    centres = centres.map((c, j) => sums[j][3] ? sums[j].slice(0, 3).map((v) => v / sums[j][3]) : c);
  }
  centres = centres.map((c) => c.map(Math.round));
  const isWhite = centres.map((c) => c.every((v) => v > 235));
  for (let i = 0; i < n; i++) if (opaque(i)) { const j = nearest(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); labels[i] = ignoreWhite && isWhite[j] ? -1 : j; }
  void white;
  return { labels, palette: centres };
}
/** Connected regions (4-neighbour) smaller than `minPixels` take the colour around them, or vanish. */
export function removeNoise(labels, width, height, minPixels) {
  if (!(minPixels > 1)) return labels;
  const out = Int32Array.from(labels), seen = new Uint8Array(labels.length), stack = [];
  for (let start = 0; start < labels.length; start++) {
    if (seen[start]) continue;
    const label = out[start], region = []; stack.push(start); seen[start] = 1;
    const around = new Map();
    while (stack.length) {
      const i = stack.pop(); region.push(i); const x = i % width, y = (i - x) / width;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
        if (j < 0) continue;
        if (out[j] === label) { if (!seen[j]) { seen[j] = 1; stack.push(j); } } else around.set(out[j], (around.get(out[j]) ?? 0) + 1);
      }
    }
    if (region.length < minPixels) { const fill = [...around].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1; for (const i of region) out[i] = fill; }
  }
  return out;
}
/**
 * Boundaries of one colour as closed polygons along pixel edges, the inside on the right (y down), so
 * outer rings and holes wind opposite ways. Saddle points turn the same way every time.
 */
export function contours(labels, width, height, label) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height && labels[y * width + x] === label;
  const out = new Map(), key = (x, y) => y * (width + 1) + x;
  const add = (x1, y1, x2, y2) => { const k = key(x1, y1); if (!out.has(k)) out.set(k, []); out.get(k).push([x2, y2]); };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x, y - 1)) add(x, y, x + 1, y);
    if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!inside(x - 1, y)) add(x, y + 1, x, y);
  }
  const rings = [];
  for (const [k] of out) {
    while (out.get(k)?.length) {
      const sx = k % (width + 1), sy = (k - sx) / (width + 1), ring = [[sx, sy]];
      let [px, py] = [sx, sy], prev = null;
      for (let guard = 0; guard < 4 * labels.length + 8; guard++) {
        const options = out.get(key(px, py));
        if (!options?.length) break;
        // At a saddle, take the right-hand turn relative to the way we came.
        let pick = 0;
        if (options.length > 1 && prev) { const dx = px - prev[0], dy = py - prev[1]; pick = Math.max(0, options.findIndex(([nx, ny]) => (nx - px) === -dy && (ny - py) === dx)); }
        const [nx, ny] = options.splice(pick, 1)[0];
        prev = [px, py]; [px, py] = [nx, ny];
        if (px === sx && py === sy) break;
        ring.push([px, py]);
      }
      if (ring.length >= 4) rings.push(ring);
    }
  }
  return rings;
}
/** Signed area (positive: clockwise on screen). */
export const ringArea = (ring) => ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
/** Drops the corners of straight runs, then Ramer-Douglas-Peucker within `tolerance` pixels. */
export function simplifyRing(ring, tolerance = 1) {
  const pts = ring.filter((p, i) => { const a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length]; return (b[0] - a[0]) * (p[1] - a[1]) !== (b[1] - a[1]) * (p[0] - a[0]); });
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
  const far = (i, j) => { const [ax, ay] = pts[i], [bx, by] = pts[j], len = Math.hypot(bx - ax, by - ay) || 1; let best = -1, dist = 0;
    for (let k = i + 1; k < j; k++) { const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / len; if (d > dist) { dist = d; best = k; } } return [best, dist]; };
  const stack = [[0, pts.length - 1]];
  while (stack.length) { const [i, j] = stack.pop(), [k, d] = far(i, j); if (k > 0 && d > tolerance) { keep[k] = 1; stack.push([i, k], [k, j]); } }
  return pts.filter((_, i) => keep[i]);
}
/** Indices of the ring's corners: where the outline turns more than `degrees` (straight runs stay straight). */
export function ringCorners(ring, degrees = 60) {
  const limit = Math.cos(degrees * Math.PI / 180), out = [];
  ring.forEach((p, i) => {
    const a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length];
    const u = [p[0] - a[0], p[1] - a[1]], v = [b[0] - p[0], b[1] - p[1]], d = Math.hypot(...u) * Math.hypot(...v) || 1;
    if ((u[0] * v[0] + u[1] * v[1]) / d < limit) out.push(i);
  });
  return out;
}
