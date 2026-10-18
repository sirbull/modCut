/**
 * Scribble (D5): a filled shape drawn as one back-and-forth line, as Illustrator's Effect > Stylize >
 * Scribble does. The shape is flattened, cut by parallel lines `spacing` apart at `angle`, and the pieces
 * are joined end to end; `overlap` lets the line run past the edge, `variation` jitters the turning points
 * (seeded, so the same settings always draw the same line) and `curviness` rounds the turns. Pure.
 */
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function random(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

/** Polygons ([[x, y], ...]) to scribble subpaths (open, in the same space). */
export function scribble(polygons, { angle = 30, spacing = 1, overlap = 0, variation = .2, curviness = 20, seed = 1 } = {}) {
  const rings = polygons.filter((p) => p.length >= 3);
  if (!rings.length || !(spacing > 0)) return [];
  const a = angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  // Work in a frame where the scan lines are horizontal.
  const turn = ([x, y]) => [x * c + y * s, -x * s + y * c], back = ([u, v]) => [u * c - v * s, u * s + v * c];
  const local = rings.map((r) => r.map(turn)), ys = local.flat().map((p) => p[1]);
  const top = Math.min(...ys), bottom = Math.max(...ys), rnd = random(seed), rows = [];
  for (let y = top + spacing / 2; y < bottom; y += spacing) {
    const xs = [];
    for (const ring of local) for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      if ((p[1] <= y) !== (q[1] <= y)) xs.push(p[0] + (y - p[1]) / (q[1] - p[1]) * (q[0] - p[0]));
    }
    xs.sort((m, n) => m - n);
    const spans = []; for (let i = 0; i + 1 < xs.length; i += 2) spans.push([xs[i] - overlap, xs[i + 1] + overlap]);
    if (spans.length) rows.push({ y, spans });
  }
  // Join the spans row by row, alternating direction; a row with several spans (holes, concave parts)
  // continues with its nearest span, and a span that cannot be reached starts a new line.
  const lines = [], used = rows.map((r) => r.spans.map(() => false));
  const jitter = () => (rnd() * 2 - 1) * variation;
  for (let r0 = 0; r0 < rows.length; r0++) for (let k0 = 0; k0 < rows[r0].spans.length; k0++) {
    if (used[r0][k0]) continue;
    const points = []; let r = r0, k = k0, forward = true;
    while (r < rows.length && k >= 0) {
      used[r][k] = true;
      const [x0, x1] = rows[r].spans[k], y = rows[r].y;
      if (forward) points.push([x0 + jitter(), y + jitter()], [x1 + jitter(), y + jitter()]); else points.push([x1 + jitter(), y + jitter()], [x0 + jitter(), y + jitter()]);
      forward = !forward; r++;
      if (r >= rows.length) break;
      const end = points.at(-1);
      k = rows[r].spans.findIndex((span, i) => !used[r][i] && end[0] >= span[0] - spacing * 2 && end[0] <= span[1] + spacing * 2);
    }
    if (points.length >= 2) lines.push(points.map(back));
  }
  const smooth = Math.max(0, Math.min(100, curviness)) / 100;
  return lines.map((points) => ({ closed: false, segments: points.map((p, i) => {
    if (!smooth || i === 0 || i === points.length - 1) return { p, in: [0, 0], out: [0, 0] };
    const prev = points[i - 1], next = points[i + 1], len = Math.min(near(prev, p), near(p, next)) * smooth / 2;
    const d = [next[0] - prev[0], next[1] - prev[1]], n = Math.hypot(...d) || 1;
    return { p, in: [-d[0] / n * len, -d[1] / n * len], out: [d[0] / n * len, d[1] / n * len] };
  }) }));
}
