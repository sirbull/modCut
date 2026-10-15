/** Pure Bézier edits. Handles are vectors relative to their anchor. */
const add=(a,b)=>a.map((n,i)=>n+b[i]);
const sub=(a,b)=>a.map((n,i)=>n-b[i]);
const lerp=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
export const anchor=p=>({p:[...p],in:[0,0],out:[0,0]});
export function reversePath(path) {
  return {...structuredClone(path),segments:[...path.segments].reverse().map(s=>({...structuredClone(s),in:[...s.out],out:[...s.in]}))};
}
export function splitCurve(path,index,t) {
  if(!(t>0&&t<1))throw new RangeError('Split must be inside the curve');
  const result=structuredClone(path),a=result.segments[index],b=result.segments[(index+1)%result.segments.length];
  if(!a||!b||!path.closed&&index===path.segments.length-1)throw new RangeError('Unknown curve');
  const p0=a.p,p1=add(a.p,a.out),p2=add(b.p,b.in),p3=b.p;
  const q0=lerp(p0,p1,t),q1=lerp(p1,p2,t),q2=lerp(p2,p3,t),r0=lerp(q0,q1,t),r1=lerp(q1,q2,t),p=lerp(r0,r1,t);
  a.out=sub(q0,p0);b.in=sub(q2,p3);
  result.segments.splice(index+1,0,{p,in:sub(r0,p),out:sub(r1,p)});return result;
}
export function moveAnchors(subpaths,selected,delta) {
  const result=structuredClone(subpaths);
  for(const {subpath,segment} of selected)result[subpath].segments[segment].p=add(result[subpath].segments[segment].p,delta);
  return result;
}
export function deleteAnchors(subpaths,selected) {
  return subpaths.flatMap((path,i)=>{
    if(!selected.some(s=>s.subpath===i))return [structuredClone(path)];
    const next={...structuredClone(path),segments:path.segments.filter((_,j)=>!selected.some(s=>s.subpath===i&&s.segment===j)).map(s=>structuredClone(s))};
    return next.segments.length>=2?[next]:[];
  });
}
export function convertAnchor(path,index,smooth=false) {
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
