import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { fitOutline } from '../geom/fit-outline.mjs';
import { outlineStroke } from '../geom/kernel-js.mjs';
import { variableStrokeRings } from '../geom/width-profile.mjs';

const seg=p=>({p,in:[0,0],out:[0,0]});
const path=(scope,s)=>new scope.Path({insert:false,closed:s.closed,segments:s.segments.map(g=>new scope.Segment(g.p,g.in,g.out))});
function verify(t,raw,tolerance=.005){
  const scope=new paper.PaperScope();scope.setup(new scope.Size(200,200));t.after(()=>scope.remove());
  const before=JSON.stringify(raw),fitted=fitOutline(scope,raw,tolerance);
  assert.equal(JSON.stringify(raw),before,'Fitting does not mutate the sampled stroke');
  assert.equal(fitted.length,raw.length,'Each hole/contour is retained');
  raw.forEach((ring,i)=>{
    const original=path(scope,ring),result=path(scope,fitted[i]);
    assert.equal(Math.sign(result.area),Math.sign(original.area),'Ring winding survives');
    for(let d=0;d<result.length;d+=.2){const p=result.getPointAt(d);assert.ok(original.getNearestPoint(p).getDistance(p)<=tolerance*1.3,'Curve stays within the boundary tolerance');}
    for(const s of original.segments)assert.ok(result.getNearestPoint(s.point).getDistance(s.point)<=tolerance*1.01,'The boundary stays within the curve tolerance');
  });
  return fitted;
}
test('smooth outlined curves use handles and far fewer anchors',async t=>{
  const raw=await outlineStroke([{closed:false,segments:[{...seg([10,10]),out:[0,80]},{...seg([100,10]),in:[0,80]}]}],{width:5,cap:'round',join:'round'});
  const fitted=verify(t,raw),count=r=>r.reduce((n,s)=>n+s.segments.length,0);
  assert.ok(count(fitted)<count(raw)/5,`${count(raw)} samples become ${count(fitted)} anchors`);
  assert.ok(fitted.some(r=>r.segments.some(s=>Math.hypot(...s.in,...s.out)>0)));
});
test('straight edges and sharp miter corners remain exact',async t=>{
  const raw=await outlineStroke([{closed:true,segments:[[0,0],[20,0],[20,20],[0,20]].map(seg)}],{width:2,join:'miter'});
  const fitted=verify(t,raw);
  fitted.forEach((ring,i)=>{assert.deepEqual(ring.segments.map(s=>s.p),raw[i].segments.map(s=>s.p));assert.equal(ring.segments.length,4);});
});
test('closed width profiles keep an empty interior and opposite winding',t=>{
  const samples=Array.from({length:720},(_,i)=>{const a=i/720*2*Math.PI;return {p:[60+30*Math.cos(a),60+30*Math.sin(a)],n:[Math.cos(a),Math.sin(a)],t:i/720};});
  const raw=variableStrokeRings(samples,6,[{t:0,left:.1,right:.2},{t:.5,left:1,right:.7},{t:1,left:.1,right:.2}],{closed:true}).map(r=>({closed:true,segments:r.map(seg)}));
  const fitted=verify(t,raw);
  assert.ok(fitted.every(r=>r.segments.length<40),JSON.stringify(fitted.map(r=>r.segments.length)));
  const scope=new paper.PaperScope();scope.setup(new scope.Size(200,200));t.after(()=>scope.remove());
  const shape=new scope.CompoundPath({insert:false,children:fitted.map(s=>path(scope,s)),fillRule:'nonzero'});
  assert.equal(shape.contains([60,60]),false,'No background is added inside the ring');
});
