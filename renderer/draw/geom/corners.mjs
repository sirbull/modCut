/** Live corner source data accompanies ordinary, resolved Bézier segments.
 * Consumers that only understand PathData still receive the rounded geometry. */
const sub=(a,b)=>a.map((n,i)=>n-b[i]);
const add=(a,b)=>a.map((n,i)=>n+b[i]);
const mul=(a,n)=>a.map(v=>v*n||0);
const length=a=>Math.hypot(...a);
export const editablePath=path=>({...path,segments:path.cornerData?.segments??path.segments});
export function cornerGeometry(path,index) {
  const segments=editablePath(path).segments,n=segments.length,s=segments[index];
  if(!s||n<3||!path.closed&&(index===0||index===n-1))return null;
  const prev=segments[(index+n-1)%n],next=segments[(index+1)%n];
  if(length(s.in)+length(s.out)+length(prev.out)+length(next.in)>1e-9)return null;
  const a=sub(prev.p,s.p),b=sub(next.p,s.p),la=length(a),lb=length(b);
  if(la<1e-9||lb<1e-9)return null;
  const u=mul(a,1/la),v=mul(b,1/lb),angle=Math.acos(Math.max(-1,Math.min(1,u[0]*v[0]+u[1]*v[1])));
  if(angle<1e-5||Math.PI-angle<1e-5)return null;
  const sum=add(u,v),bisector=mul(sum,1/length(sum)),sin=Math.sin(angle/2),tan=Math.tan(angle/2);
  return {p:s.p,u,v,angle,bisector,sin,tan,maxRadius:Math.min(la,lb)*tan/2,radius:path.cornerData?.radii[index]??0};
}
export function roundCorners(path,indices,radius) {
  if(!Number.isFinite(radius)||radius<0)throw new RangeError('Corner radius must be non-negative');
  const source=structuredClone(editablePath(path).segments),radii=source.map((_,i)=>path.cornerData?.radii[i]??0);
  for(const i of indices){const c=cornerGeometry(path,i);if(c)radii[i]=Math.min(radius,c.maxRadius);}
  return resolveCorners({...structuredClone(path),cornerData:{segments:source,radii}});
}
export function resolveCorners(path) {
  if(!path.cornerData)return structuredClone(path);
  const source=path.cornerData.segments,radii=[...path.cornerData.radii],segments=[];
  for(let i=0;i<source.length;i++) {
    const c=cornerGeometry(path,i),r=c?Math.min(radii[i],c.maxRadius):0;radii[i]=r;
    if(r<=1e-9){segments.push(structuredClone(source[i]));continue;}
    const d=r/c.tan,k=4/3*Math.tan((Math.PI-c.angle)/4)*r;
    segments.push({p:add(c.p,mul(c.u,d)),in:[0,0],out:mul(c.u,-k)},
      {p:add(c.p,mul(c.v,d)),in:mul(c.v,-k),out:[0,0]});
  }
  const {cornerData,...base}=path;
  return radii.some(r=>r>1e-9)?{...base,segments,cornerData:{segments:structuredClone(source),radii}}:{...base,segments};
}
/** Ordinary anchor operations use logical anchors, then resolve live corners. */
export function editCornerSource(path,edit) {
  const logical=structuredClone(editablePath(path));edit(logical);
  if(!path.cornerData)return logical;
  return resolveCorners({...logical,cornerData:{segments:logical.segments,radii:[...path.cornerData.radii]}});
}
export function bakeCorners(path) {const {cornerData,...plain}=structuredClone(path);return plain;}
