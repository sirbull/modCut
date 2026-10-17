/**
 * Region tools on Paper geometry (D3.4): Shape Builder picks and merges regions, Knife splits filled
 * shapes along a freehand line, Eraser subtracts a brush stroke. Callers pass the active Paper scope;
 * geometry goes in and out as PathData in world millimetres.
 */
import { toSubpaths } from './pathfinder.mjs';

const OPTS = { insert: false };
export function itemFrom(scope, subpaths) {
  const paths = subpaths.map((s) => new scope.Path({ insert: false, closed: s.closed,
    segments: s.segments.map((g) => new scope.Segment(new scope.Point(...g.p), new scope.Point(...g.in), new scope.Point(...g.out))) }));
  return paths.length === 1 ? paths[0] : new scope.CompoundPath({ insert: false, children: paths, fillRule: 'nonzero' });
}
/** Points along the drag, at most `step` mm apart, so a quick drag still crosses every region. */
export function samplePoints(points, step = .5) {
  const out = [];
  points.forEach((p, i) => {
    if (!i) { out.push(p); return; }
    const q = points[i - 1], n = Math.max(1, Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / step));
    for (let k = 1; k <= n; k++) out.push([q[0] + (p[0] - q[0]) * k / n, q[1] + (p[1] - q[1]) * k / n]);
  });
  return out;
}
/** Shape Builder: indices of the regions the drag passes through. */
export function pickRegions(scope, regions, points) {
  const samples = samplePoints(points).map((p) => new scope.Point(...p)), picked = [];
  regions.forEach((region, i) => {
    const item = itemFrom(scope, region.subpaths);
    if (samples.some((p) => item.contains(p))) picked.push(i);
    item.remove();
  });
  return picked;
}
/** The union of the picked regions as PathData. */
export function mergeRegions(scope, regions, indices) {
  let merged = null;
  for (const i of indices) { const item = itemFrom(scope, regions[i].subpaths); merged = merged ? merged.unite(item, OPTS) : item; }
  const out = merged ? toSubpaths(merged) : [];
  merged?.remove();
  return out;
}
/** A closed band `width` mm wide around a polyline: the knife's cut or the eraser's stroke. */
export function bandAround(scope, points, width) {
  const line = new scope.Path({ insert: false, segments: points.map((p) => new scope.Point(...p)) });
  const half = width / 2, left = [], right = [];
  const samples = samplePoints(points, Math.max(width, .2));
  samples.forEach((p, i) => {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    left.push([p[0] - dy * half, p[1] + dx * half]); right.push([p[0] + dy * half, p[1] - dx * half]);
  });
  line.remove();
  const band = new scope.Path({ insert: false, closed: true, segments: [...left, ...right.reverse()].map((p) => new scope.Point(...p)) });
  // Round ends, so an eraser stroke has the brush's shape.
  const caps = [samples[0], samples.at(-1)].map((p) => new scope.Path.Circle({ insert: false, center: new scope.Point(...p), radius: half }));
  return caps.reduce((a, c) => { const r = a.unite(c, OPTS); a.remove(); c.remove(); return r; }, band);
}
/** Outer rings with the holes inside them, so each separate piece becomes its own path. */
export function pieces(item) {
  const rings = (item.children ?? [item]).filter((p) => p.segments.length > 2 && Math.abs(p.area) > 1e-6);
  if (!rings.length) return [];
  const sign = Math.sign(rings.reduce((big, r) => Math.abs(r.area) > Math.abs(big.area) ? r : big).area);
  const outers = rings.filter((r) => Math.sign(r.area) === sign), holes = rings.filter((r) => Math.sign(r.area) !== sign);
  return outers.map((outer) => [outer, ...holes.filter((h) => outer.contains(h.interiorPoint ?? h.firstSegment.point))]
    .flatMap((r) => toSubpaths(r)));
}
/** Knife: `subpaths` (a filled shape) cut along the line into separate pieces. */
export function knifeCut(scope, subpaths, points, gap = .02) {
  const item = itemFrom(scope, subpaths), band = bandAround(scope, points, gap), cut = item.subtract(band, OPTS);
  const out = pieces(cut);
  item.remove(); band.remove(); cut.remove();
  return out;
}
/** Eraser: `subpaths` minus a round brush of `size` mm along the drag; [] when nothing is left. */
export function erase(scope, subpaths, points, size) {
  const item = itemFrom(scope, subpaths), band = bandAround(scope, points, size), left = item.subtract(band, OPTS);
  const out = pieces(left);
  item.remove(); band.remove(); left.remove();
  return out;
}
/** Total filled area of PathData (nonzero), for telling whether a cut changed anything. */
export function areaOf(scope, subpaths) {
  if (!subpaths.length) return 0;
  const item = itemFrom(scope, subpaths), a = item.children ? item.children.reduce((sum, c) => sum + c.area, 0) : item.area;
  item.remove(); return Math.abs(a);
}
