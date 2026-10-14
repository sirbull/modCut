/** Original synthetic mm geometry; Paper.js MIT is an independent provisional oracle. */
import paper from 'paper';
paper.setup(new paper.Size(100, 100));
export const oracle = paper;
export function decode(contours) {
  return new paper.CompoundPath({ insert: false, children: contours.map((contour) => new paper.Path({ insert: false,
    closed: contour.closed, segments: contour.segments.map((s) => new paper.Segment(s.p, s.in, s.out)) })) });
}
export function encode(item) {
  const paths = item instanceof paper.CompoundPath ? item.children : [item];
  return paths.filter((p) => p.segments.length).map((p) => ({ closed: p.closed,
    segments: p.segments.map((s) => ({ p: [s.point.x, s.point.y], in: [s.handleIn.x, s.handleIn.y], out: [s.handleOut.x, s.handleOut.y] })) }));
}
function rect(x, y, w, h) { return new paper.Path.Rectangle({ point: [x, y], size: [w, h], insert: false }); }
function circle(x, y, r) { return new paper.Path.Circle({ center: [x, y], radius: r, insert: false }); }
function star() { return new paper.Path.Star({ center: [10, 10], points: 5, radius1: 4, radius2: 10, insert: false }); }
function glyph() { return new paper.Path({ insert: false, closed: true, segments: [[0, 20], [0, 0], [4, 0], [4, 8], [12, 8], [12, 0], [16, 0], [16, 20], [12, 20], [12, 12], [4, 12], [4, 20]] }); }
export function createFixtures() {
  const ring = new paper.CompoundPath({ insert: false, children: [circle(10, 10, 10), circle(10, 10, 4).reverse()] });
  const bow = new paper.Path({ insert: false, closed: true, segments: [[0, 0], [20, 20], [0, 20], [20, 0]] });
  const pairs = [
    ['overlap', rect(0, 0, 20, 20), rect(10, 5, 20, 20)],
    ['contained', rect(0, 0, 20, 20), rect(5, 5, 10, 10)],
    ['disjoint', rect(0, 0, 10, 10), rect(20, 0, 10, 10)],
    ['shared-edge', rect(0, 0, 10, 10), rect(10, 0, 10, 10)],
    ['corner-touch', rect(0, 0, 10, 10), rect(10, 10, 10, 10)],
    ['identical', rect(0, 0, 10, 10), rect(0, 0, 10, 10)],
    ['circles', circle(10, 10, 10), circle(20, 10, 10)],
    ['tangent-circles', circle(10, 10, 10), circle(30, 10, 10)],
    ['star', star(), rect(5, 5, 10, 10)],
    ['hole', ring, rect(10, 0, 20, 20)],
    ['self-crossing', bow, rect(5, 5, 10, 10)],
    ['glyph-contour', glyph(), rect(2, 4, 12, 12)],
  ];
  const operations = { unite: 'unite', intersect: 'intersect', minusFront: 'subtract', exclude: 'exclude' };
  const cases = [];
  for (const [name, a, b] of pairs) {
    for (const op of name === 'overlap' || name === 'circles' || name === 'hole' ? Object.keys(operations) : ['unite', 'minusFront']) {
      const result = a[operations[op]](b, { insert: false });
      result.reorient(true, true);
      cases.push({ name: `${name}-${op}`, input: { op, a: encode(a), b: encode(b) }, expected: encode(result), area: Math.abs(result.area) });
    }
  }
  return cases;
}
function directed(a, b) {
  const targets = b.children.filter((p) => p.segments.length);
  let max = 0;
  for (const path of a.children) {
    // Samples are spaced at most .05 mm apart; this is a sampled Hausdorff estimate.
    const steps = Math.max(1, Math.ceil(path.length / .05));
    for (let i = 0; i <= steps; i++) {
      const point = path.getPointAt(path.length * i / steps);
      if (!point) continue;
      let distance = Infinity;
      for (const target of targets) distance = Math.min(distance, point.getDistance(target.getNearestPoint(point)));
      max = Math.max(max, distance);
    }
  }
  return max;
}
export function compare(expected, actual) {
  const a = decode(expected), b = decode(actual);
  a.reorient(true, true); b.reorient(true, true);
  const area = Math.abs(a.area), actualArea = Math.abs(b.area);
  const relativeAreaError = Math.abs(area - actualArea) / Math.max(area, .000001);
  const distance = Math.max(directed(a, b), directed(b, a));
  return { relativeAreaError, sampledHausdorffMm: Number.isFinite(distance) ? distance : null,
    pass: relativeAreaError < .001 && distance < .01 };
}
