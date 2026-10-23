import { resolveCorners } from './geom/corners.mjs';
export function multiply(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3],
    a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function transformProperties(node, m, { scaleCorners = true } = {}) {
  const sx=Math.hypot(m[0],m[1]),sy=Math.hypot(m[2],m[3]),similarity=Math.abs(sx-sy)<1e-9*Math.max(1,sx,sy)&&Math.abs(m[0]*m[2]+m[1]*m[3])<1e-9*Math.max(1,sx*sy);
  if (node.type !== 'path') {
    // Without Scale Corners a uniformly scaled live rectangle keeps its visible corner radius.
    const keep = !scaleCorners && similarity && sx > 1e-12 && node.type === 'shape' && node.shape === 'rect' && node.params.cornerRadius > 0;
    return { transform: multiply(m, node.transform), ...(keep ? { params: { ...node.params, cornerRadius: node.params.cornerRadius / sx } } : {}) };
  }
  const point = (p, offset) => [m[0]*p[0]+m[2]*p[1]+(offset ? m[4] : 0), m[1]*p[0]+m[3]*p[1]+(offset ? m[5] : 0)];
  const segment=s=>({p:point(s.p,true),in:point(s.in,false),out:point(s.out,false)});
  return {subpaths:node.subpaths.map(path=>{
    const {cornerData,...base}=path,result={...base,segments:path.segments.map(segment)};
    // An arbitrary affine transform preserves resolved curves exactly. Circular
    // live radii survive similarities; nonuniform scaling bakes those radii.
    if(cornerData&&similarity&&sx>1e-12)return resolveCorners({...result,cornerData:{segments:cornerData.segments.map(segment),radii:cornerData.radii.map(r=>scaleCorners?r*sx:r)}});
    return result;
  })};
}
export function solidPaint(hex) {
  return { type: 'solid', color: { space: 'rgb', values: [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255) } };
}
export function appearance(fill = '#FFFFFF', stroke = '#071411', width = .5) {
  const entry = color => ({ paint: solidPaint(color), opacity: 1, blendMode: 'normal', effects: [] });
  return { fills: fill ? [entry(fill)] : [], strokes: stroke ? [{ ...entry(stroke), width,
    cap: 'round', join: 'round', miterLimit: 4, align: 'center' }] : [], effects: [] };
}
