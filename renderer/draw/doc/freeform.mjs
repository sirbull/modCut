/**
 * Freeform gradients, as Illustrator's: colour points placed anywhere in a fill, blending smoothly into
 * each other. In Lines mode, points can be joined by smooth lines; the colour then runs along each line
 * from point to point and spreads out from it.
 * Paint: `{ type: 'freeform', mode: 'points'|'lines', points: [{ position, color, opacity?, spread? }],
 * lines: [[i, j, ...]] }`, in the object's own coordinates (mm). `spread` is the radius (mm) around a
 * point that keeps its colour solid before blending starts.
 */
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const rgb = (hex) => ({ space: 'rgb', values: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) });
const rgbValues = (color) => color?.space === 'rgb' ? color.values : color?.space === 'gray' ? [color.values[0], color.values[0], color.values[0]] : [0, 0, 0];

export const isFreeform = (paint) => paint?.type === 'freeform';

/**
 * A freeform gradient across a box: four points inset from the corners, coloured from `colors`
 * (hex or colour objects), or white, black and two greys.
 */
export function defaultFreeform(box, colors = null) {
  const list = (colors?.length ? colors : ['#FFFFFF', '#808080', '#000000', '#C0C0C0']).map((c) => typeof c === 'string' ? rgb(c) : structuredClone(c));
  const inset = (u, v) => [box.x + box.width * u, box.y + box.height * v];
  const spots = [inset(.15, .15), inset(.85, .15), inset(.85, .85), inset(.15, .85)];
  return { type: 'freeform', mode: 'points', points: spots.map((position, i) => ({ position, color: structuredClone(list[i % list.length]) })), lines: [] };
}

/** Lines as smooth curves (Catmull-Rom through their points), sampled: `[{ a, b, ca, cb, oa, ob }]`. */
export function lineSegments(g, steps = 12) {
  const out = [];
  for (const line of g.mode === 'lines' ? g.lines ?? [] : []) {
    const pts = line.map((i) => g.points[i]).filter(Boolean);
    for (let k = 0; k + 1 < pts.length; k++) {
      const p0 = (pts[k - 1] ?? pts[k]).position, p1 = pts[k].position, p2 = pts[k + 1].position, p3 = (pts[k + 2] ?? pts[k + 1]).position;
      const at = (t) => [0, 1].map((d) => .5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t * t + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t * t * t));
      const c1 = rgbValues(pts[k].color), c2 = rgbValues(pts[k + 1].color), o1 = pts[k].opacity ?? 1, o2 = pts[k + 1].opacity ?? 1;
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps;
        out.push({ a: at(t0), b: at(t1), ca: c1.map((v, i) => v + (c2[i] - v) * t0), cb: c1.map((v, i) => v + (c2[i] - v) * t1), oa: o1 + (o2 - o1) * t0, ob: o1 + (o2 - o1) * t1,
          line: out.length, from: line[k], to: line[k + 1], t0, t1 });
      }
    }
  }
  return out;
}

/**
 * Colour and opacity at `p`: every point (and, in Lines mode, the nearest place on every line) pulls
 * towards its colour, more strongly the closer it is; inside a point's spread it pulls fully.
 * `soft` sets how far colours blend (mm, squared distance added to each weight).
 */
export function freeformColorAt(g, p, { soft = 1, segments = lineSegments(g) } = {}) {
  let total = 0, alpha = 0; const color = [0, 0, 0];
  const pull = (d, c, o) => { const w = 1 / (d * d + soft); total += w; alpha += w * o; for (let i = 0; i < 3; i++) color[i] += w * c[i]; };
  for (const point of g.points) pull(Math.max(0, Math.hypot(p[0] - point.position[0], p[1] - point.position[1]) - (point.spread ?? 0)), rgbValues(point.color), point.opacity ?? 1);
  for (const s of segments) {
    const v = [s.b[0] - s.a[0], s.b[1] - s.a[1]], len2 = v[0] * v[0] + v[1] * v[1];
    const t = len2 > 0 ? clamp(((p[0] - s.a[0]) * v[0] + (p[1] - s.a[1]) * v[1]) / len2) : 0;
    pull(Math.hypot(p[0] - s.a[0] - v[0] * t, p[1] - s.a[1] - v[1] * t), s.ca.map((c, i) => c + (s.cb[i] - c) * t), s.oa + (s.ob - s.oa) * t);
  }
  if (!(total > 0)) return { values: [0, 0, 0], alpha: 1 };
  return { values: color.map((c) => clamp(c / total)), alpha: clamp(alpha / total) };
}

/** RGBA pixels of the gradient over `box` (longest side `size` pixels), for drawing it clipped to the fill. */
export function freeformPixels(g, box, size = 160) {
  const scale = size / Math.max(box.width, box.height, 1e-6), width = Math.max(2, Math.round(box.width * scale)), height = Math.max(2, Math.round(box.height * scale));
  const data = new Uint8ClampedArray(width * height * 4), segments = lineSegments(g);
  // Blending reaches about a tenth of the object's size: wide enough to look smooth, small enough to keep points distinct.
  const soft = (Math.hypot(box.width, box.height) * .1) ** 2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = [box.x + (x + .5) / width * box.width, box.y + (y + .5) / height * box.height], c = freeformColorAt(g, p, { soft, segments }), k = (y * width + x) * 4;
    data[k] = Math.round(c.values[0] * 255); data[k + 1] = Math.round(c.values[1] * 255); data[k + 2] = Math.round(c.values[2] * 255); data[k + 3] = Math.round(c.alpha * 255);
  }
  return { width, height, data };
}

const softFor = (box) => (Math.hypot(box.width, box.height) * .1) ** 2;
/** The colour the gradient has at `p` (for a new point placed there). */
export function freeformColorHere(g, p, box) { const c = freeformColorAt(g, p, { soft: softFor(box) }); return { space: 'rgb', values: c.values }; }

/**
 * A new point at `position`, coloured as the gradient is there. In Lines mode it continues the line that
 * ends at `after` (or starts a line from `after`); with no `after` it stands alone.
 */
export function addFreeformPoint(g, position, box, { after = null } = {}) {
  const next = structuredClone(g), index = next.points.length;
  next.points.push({ position: [...position], color: freeformColorHere(g, position, box) });
  if (next.mode === 'lines' && after !== null && next.points[after]) {
    const line = next.lines.find((l) => l.at(-1) === after) ?? next.lines.find((l) => l[0] === after);
    if (line?.at(-1) === after) line.push(index); else if (line) line.unshift(index); else next.lines.push([after, index]);
  }
  return { gradient: next, index };
}
/** A point on a line segment (from `segmentHit`), inserted into that line between its neighbours. */
export function insertLinePoint(g, from, to, position, box) {
  const next = structuredClone(g), index = next.points.length;
  next.points.push({ position: [...position], color: freeformColorHere(g, position, box) });
  for (const line of next.lines) for (let k = 0; k + 1 < line.length; k++) if (line[k] === from && line[k + 1] === to) { line.splice(k + 1, 0, index); return { gradient: next, index }; }
  return { gradient: next, index };
}
/** Remove a point (at least one stays); lines through it close the gap, lines left with one point go. */
export function removeFreeformPoint(g, index) {
  if (g.points.length <= 1) throw new Error('A freeform gradient needs at least one point.');
  if (!g.points[index]) throw new Error('Choose a point.');
  const next = structuredClone(g);
  next.points.splice(index, 1);
  next.lines = (next.lines ?? []).map((line) => line.filter((i) => i !== index).map((i) => i > index ? i - 1 : i)).filter((line) => line.length >= 2);
  return next;
}
/** Change one point: `position`, `color` (#RRGGBB), `opacity` (0 to 1) or `spread` (mm). */
export function updateFreeformPoint(g, index, { position, color, opacity, spread } = {}) {
  if (!g.points[index]) throw new Error('Choose a point.');
  const next = structuredClone(g), point = next.points[index];
  if (position !== undefined) point.position = [...position];
  if (color !== undefined) { if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Enter a color as #RRGGBB.'); point.color = rgb(color); }
  if (opacity !== undefined) { if (!Number.isFinite(opacity)) throw new Error('Enter an opacity from 0 to 100 %.'); if (clamp(opacity) === 1) delete point.opacity; else point.opacity = clamp(opacity); }
  if (spread !== undefined) { if (!Number.isFinite(spread) || spread < 0) throw new Error('Enter a spread of 0 or more.'); if (spread === 0) delete point.spread; else point.spread = spread; }
  return next;
}
/** Points or Lines. Switching to Points keeps the lines for when Lines is chosen again. */
export function setFreeformMode(g, mode) {
  if (!['points', 'lines'].includes(mode)) throw new Error('Choose Points or Lines.');
  return { ...structuredClone(g), mode };
}
/** The colours of a linear or radial gradient as a freeform one over `box`, and back (first and last point). */
export function freeformFrom(g, box) {
  const stops = g?.stops ? [...g.stops].sort((a, b) => a.offset - b.offset) : null;
  return defaultFreeform(box, stops ? [0, 1 / 3, 2 / 3, 1].map((t) => stops.reduce((best, s) => Math.abs(s.offset - t) < Math.abs(best.offset - t) ? s : best).color) : null);
}
export function stopsFromFreeform(g) {
  const pts = g.points, first = pts[0], last = pts.at(-1) === first && pts.length > 1 ? pts[1] : pts.at(-1);
  return [{ offset: 0, color: structuredClone(first.color) }, { offset: 1, color: structuredClone(last.color) }];
}
/** A CSS preview: one soft spot per point. */
export function freeformCss(g) {
  const xs = g.points.map((p) => p.position[0]), ys = g.points.map((p) => p.position[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 || 1, h = Math.max(...ys) - y0 || 1;
  const css = (c, o = 1) => { const [r, gg, b] = rgbValues(c).map((v) => Math.round(clamp(v) * 255)); return `rgba(${r}, ${gg}, ${b}, ${o})`; };
  const spots = g.points.map((p) => `radial-gradient(circle at ${Math.round(15 + (p.position[0] - x0) / w * 70)}% ${Math.round(15 + (p.position[1] - y0) / h * 70)}%, ${css(p.color, p.opacity ?? 1)} 0%, ${css(p.color, 0)} 70%)`);
  return `${spots.join(', ')}, linear-gradient(${css(g.points[0].color, g.points[0].opacity ?? 1)}, ${css(g.points.at(-1).color, g.points.at(-1).opacity ?? 1)})`;
}
