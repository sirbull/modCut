/** Pure Bézier edits. Handles are vectors relative to their anchor. */
import { editablePath,editCornerSource,bakeCorners,resolveCorners } from './corners.mjs';
const add=(a,b)=>a.map((n,i)=>n+b[i]);
const sub=(a,b)=>a.map((n,i)=>n-b[i]);
const lerp=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
export const anchor=p=>({p:[...p],in:[0,0],out:[0,0]});
export function reversePath(path) {
  if(path.cornerData){const {segments,radii}=path.cornerData;return resolveCorners({...path,cornerData:{segments:[...segments].reverse().map(s=>({...structuredClone(s),in:[...s.out],out:[...s.in]})),radii:[...radii].reverse()}});}
  return {...structuredClone(path),segments:[...path.segments].reverse().map(s=>({...structuredClone(s),in:[...s.out],out:[...s.in]}))};
}
export function splitCurve(path,index,t) {
  if(!(t>0&&t<1))throw new RangeError('Split must be inside the curve');
  const result=bakeCorners(path),a=result.segments[index],b=result.segments[(index+1)%result.segments.length];
  if(!a||!b||!path.closed&&index===path.segments.length-1)throw new RangeError('Unknown curve');
  const p0=a.p,p1=add(a.p,a.out),p2=add(b.p,b.in),p3=b.p;
  const q0=lerp(p0,p1,t),q1=lerp(p1,p2,t),q2=lerp(p2,p3,t),r0=lerp(q0,q1,t),r1=lerp(q1,q2,t),p=lerp(r0,r1,t);
  a.out=sub(q0,p0);b.in=sub(q2,p3);
  result.segments.splice(index+1,0,{p,in:sub(r0,p),out:sub(r1,p)});return result;
}
/** Pull a cubic toward the grabbed point, like a rounded rubber-band peak.
 * Draw the control points inward toward the target before solving B(t) exactly,
 * so a straight segment forms sloping sides instead of a broad, vertical-sided arch.
 * Anchors and the neighboring segments' handles remain unchanged.
 */
export function bendCurve(path,index,t,delta) {
  if(!(t>0&&t<1)||!delta.every(Number.isFinite))throw new RangeError('Bend must be inside the curve with a finite delta');
  const result=bakeCorners(path),a=result.segments[index],b=result.segments[(index+1)%result.segments.length];
  if(!a||!b||!path.closed&&index===result.segments.length-1)throw new RangeError('Unknown curve');
  const distance=Math.hypot(...delta);if(!distance)return result;
  const u=1-t,w0=u*u*u,w1=3*u*u*t,w2=3*u*t*t,w3=t*t*t,total=w1*w1+w2*w2;
  const p1=add(a.p,a.out),p2=add(b.p,b.in);
  const target=a.p.map((n,i)=>w0*n+w1*p1[i]+w2*p2[i]+w3*b.p[i]+delta[i]);
  // Increase the inward pull continuously with drag distance; no initial jump.
  const span=Math.hypot(...sub(b.p,a.p))||Math.hypot(...sub(p2,p1))||1;
  const pull=1-Math.exp(-8*distance/span),c1=lerp(p1,target,pull),c2=lerp(p2,target,pull);
  const residual=target.map((n,i)=>n-(w0*a.p[i]+w1*c1[i]+w2*c2[i]+w3*b.p[i]));
  a.out=sub(add(c1,residual.map(n=>n*w1/total)),a.p);
  b.in=sub(add(c2,residual.map(n=>n*w2/total)),b.p);
  return result;
}
export function moveAnchors(subpaths,selected,delta) {
  const result=structuredClone(subpaths);
  for(const index of new Set(selected.map(a=>a.subpath)))result[index]=editCornerSource(result[index],path=>{
    for(const segment of new Set(selected.filter(a=>a.subpath===index).map(a=>a.segment)))path.segments[segment].p=add(path.segments[segment].p,delta);
  });
  return result;
}
export function deleteAnchors(subpaths,selected) {
  return subpaths.flatMap((path,i)=>{
    if(!selected.some(s=>s.subpath===i))return [structuredClone(path)];
    const keep=(_,j)=>!selected.some(s=>s.subpath===i&&s.segment===j),segments=structuredClone(editablePath(path).segments.filter(keep));
    if(segments.length<2)return [];
    return [path.cornerData?resolveCorners({...path,cornerData:{segments,radii:path.cornerData.radii.filter(keep)}}):{...structuredClone(path),segments}];
  });
}
export function convertAnchor(path,index,smooth=false) {
  if(path.cornerData)return editCornerSource(path,logical=>{logical.segments=convertAnchor({...logical,cornerData:undefined},index,smooth).segments;});
  const result=structuredClone(path),s=result.segments[index];
  s.in=[0,0];s.out=[0,0];
  if(smooth) {
    const n=path.segments.length,prev=path.segments[(index+n-1)%n],next=path.segments[(index+1)%n];
    const before=path.closed||index>0,after=path.closed||index<n-1;
    const direction=sub(after?next.p:s.p,before?prev.p:s.p),length=Math.hypot(...direction)||1;
    if(before)s.in=direction.map(v=>-v/length*Math.hypot(...sub(s.p,prev.p))/3);
    if(after)s.out=direction.map(v=>v/length*Math.hypot(...sub(next.p,s.p))/3);
  }
  return result;
}
export function constrain(point,origin) {
  const d=sub(point,origin),r=Math.hypot(...d),angle=Math.round(Math.atan2(d[1],d[0])/(Math.PI/4))*Math.PI/4;
  return [origin[0]+r*Math.cos(angle),origin[1]+r*Math.sin(angle)];
}
