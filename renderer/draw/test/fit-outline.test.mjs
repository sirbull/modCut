import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { fitOutline } from '../geom/fit-outline.mjs';
import { outlineStroke } from '../geom/kernel-js.mjs';
import { variableStrokeRings } from '../geom/width-profile.mjs';
import { toSubpaths } from '../geom/pathfinder.mjs';

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

test('round stroke joins use two or three anchors per corner, with tangent handles',async t=>{
  const square=[{closed:true,segments:[[0,0],[40,0],[40,40],[0,40]].map(seg)}];
  for (const width of [.1,1,2,5,20]) {
    const tolerance=Math.min(.01,width/200);
    const raw=await outlineStroke(square,{width,join:'round'});
    // The polygon seam can start anywhere, including inside a rounded corner.
    raw[0].segments.push(...raw[0].segments.splice(0,3));
    const fitted=verify(t,raw,tolerance),outer=fitted[0];
    assert.ok(outer.segments.length>=8 && outer.segments.length<=12,`${width}mm stroke: ${outer.segments.length} anchors`);
    assert.equal(fitted[1].segments.length,4,'The sharp inner corners stay exact');
    const scope=new paper.PaperScope();scope.setup(new scope.Size(100,100));
    try {
      const result=path(scope,outer);
      const lines=result.curves.filter(c=>c.isStraight());
      assert.equal(lines.length,4,'Each side stays a single straight edge');
      for (const line of lines) {
        const direction=line.point2.subtract(line.point1).normalize();
        assert.ok(Math.abs(direction.cross(line.segment1.handleIn.normalize()))<1e-4,'The incoming round corner is tangent to the side');
        assert.ok(Math.abs(direction.cross(line.segment2.handleOut.normalize()))<1e-4,'The outgoing round corner is tangent to the side');
      }
    } finally { scope.remove(); }
  }
});

test('outlined cubic rounded rectangles keep at most three anchors per corner on both boundaries',async t=>{
  const scope=new paper.PaperScope();scope.setup(new scope.Size(200,200));t.after(()=>scope.remove());
  for (const radius of [2,10,20]) {
    const source=new scope.Path.Rectangle({insert:false,rectangle:[0,0,100,80],radius});
    source.rotate(23);
    const raw=await outlineStroke(toSubpaths(source),{width:2});
    const fitted=verify(t,raw,.01);
    assert.equal(fitted.length,2);
    for (const ring of fitted) assert.ok(ring.segments.length<=12,`${radius}mm radius: ${ring.segments.length} anchors`);
    source.remove();
  }
});

test('round caps and dashed round caps recover compact curves without closing the gaps',async t=>{
  const raw=await outlineStroke([{closed:false,segments:[[0,0],[30,0]].map(seg)}],{width:5,cap:'round',dash:{array:[6,8]}});
  const fitted=verify(t,raw,.01);
  assert.equal(fitted.length,3);
  for (const ring of fitted) assert.ok(ring.segments.length<=8,`${ring.segments.length} anchors per dash`);
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

test('general fitting minimizes eccentric ellipses and asymmetric concave contours',t=>{
  const cases=[
    {name:'eccentric ellipse',limit:10,point:a=>[60+40*Math.cos(a)+8*Math.sin(a),60+12*Math.sin(a)]},
    {name:'asymmetric lobes',limit:24,point:a=>{const r=25+4*Math.cos(3*a)+2*Math.sin(5*a);return [60+r*Math.cos(a),60+.7*r*Math.sin(a)];}},
  ];
  for(const shape of cases) for(const power of [1,1.7]){
    const raw=[{closed:true,segments:Array.from({length:480},(_,i)=>seg(shape.point((i/480)**power*2*Math.PI)))}];
    const fitted=verify(t,raw,.01)[0];
    assert.ok(fitted.segments.length<=shape.limit,`${shape.name}, sampling exponent ${power}: ${fitted.segments.length} anchors`);
  }
});

test('a two-cubic lens needs only two anchors regardless of rotation and storage seam',t=>{
  const scope=new paper.PaperScope();scope.setup(new scope.Size(200,200));t.after(()=>scope.remove());
  for(const rotation of [0,23,67]){
    const lens=new scope.Path({insert:false,closed:true,segments:[new scope.Segment([20,60],[0,20],[0,-20]),new scope.Segment([80,60],[0,-20],[0,20])]});
    lens.rotate(rotation);lens.flatten(.001);
    const raw=toSubpaths(lens);raw[0].segments.push(...raw[0].segments.splice(0,37));
    const fitted=verify(t,raw,.01);
    assert.equal(fitted[0].segments.length,2,'Artificial fitting seams do not impose extra anchors');
    lens.remove();
  }
});

test('outlined freehand S curves keep inflections with a small number of refitted cubics',async t=>{
  const raw=await outlineStroke([{closed:false,segments:[
    {...seg([10,10]),out:[50,0]},
    {...seg([90,90]),in:[-50,0],out:[40,0]},
    {...seg([160,10]),in:[-40,0]},
  ]}],{width:2,cap:'round',join:'round'});
  const fitted=verify(t,raw,.01);
  assert.ok(fitted[0].segments.length<=24,`${raw[0].segments.length} samples become ${fitted[0].segments.length} anchors`);
});
