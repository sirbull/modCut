export function multiply(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3],
    a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function transformProperties(node, m) {
  if (node.type !== 'path') return { transform: multiply(m, node.transform) };
  const point = (p, offset) => [m[0]*p[0]+m[2]*p[1]+(offset ? m[4] : 0), m[1]*p[0]+m[3]*p[1]+(offset ? m[5] : 0)];
  return { subpaths: node.subpaths.map(path => ({ ...path, segments: path.segments.map(s => ({
    p: point(s.p, true), in: point(s.in, false), out: point(s.out, false),
  })) })) };
}
export function solidPaint(hex) {
  return { type: 'solid', color: { space: 'rgb', values: [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255) } };
}
export function appearance(fill = '#FFFFFF', stroke = '#071411', width = .5) {
  const entry = color => ({ paint: solidPaint(color), opacity: 1, blendMode: 'normal', effects: [] });
  return { fills: fill ? [entry(fill)] : [], strokes: stroke ? [{ ...entry(stroke), width,
    cap: 'round', join: 'round', miterLimit: 4, align: 'center' }] : [], effects: [] };
}
