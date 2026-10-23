import test from 'node:test';
import assert from 'node:assert/strict';
import {anchor,splitCurve,bendCurve,reversePath,moveAnchors,deleteAnchors,convertAnchor,constrain} from '../geom/path-editing.mjs';
import {createProjectDraw} from '../io/project.mjs';
import {createNode} from '../doc/schema.mjs';
import {insertNode,replaceLeaf} from '../doc/commands.mjs';
const close=(a,b)=>a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-9,`${a} != ${b}`));
const add=(a,b)=>a.map((n,i)=>n+b[i]);
const cubic=(a,b,t)=>a.p.map((n,i)=>n*(1-t)**3+3*(n+a.out[i])*(1-t)**2*t+3*(b.p[i]+b.in[i])*(1-t)*t*t+b.p[i]*t**3);
test('De Casteljau splitting preserves every point of an asymmetric cubic',()=>{
  const original={closed:false,segments:[{p:[0,0],in:[0,0],out:[10,40]},{p:[50,20],in:[-25,5],out:[0,0]}]},saved=structuredClone(original);
  const split=splitCurve(original,0,.37);
  for(let i=0;i<=100;i++){const t=i/100,k=t<.37?0:1,u=t<.37?t/.37:(t-.37)/.63;close(cubic(...original.segments,t),cubic(split.segments[k],split.segments[k+1],u));}
  assert.deepEqual(original,saved);assert.throws(()=>splitCurve(original,1,.5));assert.throws(()=>splitCurve(original,0,0));
});
test('closed closing-curve split and path reversal retain tangents',()=>{
  const path={closed:true,segments:[{...anchor([0,0]),in:[-3,2]},{...anchor([10,10]),out:[3,-4]}]};
  const split=splitCurve(path,1,.5);assert.equal(split.segments.length,3);close(split.segments[2].p,cubic(path.segments[1],path.segments[0],.5));
  assert.deepEqual(reversePath(reversePath(path)),path);close(add(reversePath(path).segments[0].p,reversePath(path).segments[0].in),[13,6]);
});
test('bending a cubic follows the grabbed parameter without moving anchors or adjacent handles',()=>{
  for(const curved of [false,true])for(const t of [.08,.23,.5,.81,.95]){
    const path={closed:false,segments:[{...anchor([0,0]),in:[-5,-7],out:curved?[10,40]:[0,0]},{...anchor([50,20]),in:curved?[-25,5]:[0,0],out:[7,9]},anchor([70,30])]},saved=structuredClone(path);
    const delta=[6,-11],result=bendCurve(path,0,t,delta);
    close(cubic(result.segments[0],result.segments[1],t),add(cubic(path.segments[0],path.segments[1],t),delta));
    for(let i=0;i<path.segments.length;i++)close(result.segments[i].p,path.segments[i].p);
    close(result.segments[0].in,path.segments[0].in);close(result.segments[1].out,path.segments[1].out);
    assert.deepEqual(result.segments[2],path.segments[2]);assert.deepEqual(path,saved);
  }
});
test('bending the closing segment preserves closure and rejects non-existent curves',()=>{
  const path={closed:true,segments:[anchor([0,0]),anchor([30,20]),anchor([0,40])]},t=.37,delta=[-9,4];
  const result=bendCurve(path,2,t,delta);assert.equal(result.closed,true);assert.equal(result.segments.length,3);
  close(cubic(result.segments[2],result.segments[0],t),add(cubic(path.segments[2],path.segments[0],t),delta));
  for(const time of [0,1,NaN])assert.throws(()=>bendCurve(path,0,time,delta),RangeError);
  assert.throws(()=>bendCurve({...path,closed:false},2,.5,delta),RangeError);
  assert.throws(()=>bendCurve(path,9,.5,delta),RangeError);
  assert.throws(()=>bendCurve(path,0,.5,[Infinity,0]),RangeError);
});
test('rubber-band bending pulls the sides inward into a narrower, rounded peak',()=>{
  const path={closed:false,segments:[anchor([0,0]),anchor([100,0])]};
  assert.deepEqual(bendCurve(path,0,.5,[0,0]),path,'A stationary grab changes nothing');
  const result=bendCurve(path,0,.5,[0,-40]),[a,b]=result.segments;
  close(cubic(a,b,.5),[50,-40]);
  assert.ok(a.out[0]>40&&b.in[0]<-40,'Both endpoint tangents slope toward the grabbed region');
  assert.ok(cubic(a,b,.25)[0]>25,'The flank at 75% height is closer to the peak than the old broad arch');
  const before=cubic(a,b,.5-1e-4),after=cubic(a,b,.5+1e-4);
  assert.ok(after[0]>before[0],'The peak has a nonzero tangent, not a cusp');
  close([before[1]],[after[1]]);
  const reversed=bendCurve(reversePath(path),0,.5,[0,-40]);
  assert.deepEqual(reversePath(reversed),result,'Pulling is independent of path direction');
});
test('moving, deleting and converting anchors do not alter unrelated subpaths',()=>{
  const paths=[{closed:false,segments:[[0,0],[10,0],[10,10]].map(anchor)},{closed:true,segments:[[20,20],[30,20],[30,30]].map(anchor)}],selected=[{subpath:0,segment:1}];
  const moved=moveAnchors(paths,selected,[3,4]);assert.deepEqual(moved[0].segments[1].p,[13,4]);assert.deepEqual(moved[1],paths[1]);assert.deepEqual(paths[0].segments[1].p,[10,0]);
  const smooth=convertAnchor(paths[0],1,true);close(smooth.segments[1].in,[-10/Math.sqrt(2)/3,-10/Math.sqrt(2)/3]);assert.deepEqual(convertAnchor(smooth,1).segments[1],paths[0].segments[1]);
  assert.equal(deleteAnchors(paths,[...selected,{subpath:0,segment:0}]).length,1);close(constrain([8,9],[0,0]),[Math.hypot(8,9)/Math.sqrt(2),Math.hypot(8,9)/Math.sqrt(2)]);
  const singleton={closed:false,segments:[anchor([50,50])]};
  assert.deepEqual(deleteAnchors([...paths,singleton],selected).at(-1),singleton,'Unselected subpaths are preserved even with only one anchor');
});
test('expanding a leaf retains identity and restores the exact shape on undo',()=>{
  const state=createProjectDraw(),shape=createNode('shape',{name:'Live',params:{width:20,height:10}}),parent=state.document.data.layers[0].id;
  state.history.execute(insertNode(parent,shape));state.history.markSaved();
  const replacement=createNode('path',{id:shape.id,name:shape.name,subpaths:[{closed:false,segments:[anchor([0,0]),anchor([20,10])]}]});
  state.history.execute(replaceLeaf(shape.id,replacement));assert.equal(state.document.getNode(shape.id).type,'path');assert.equal(state.dirty,true);
  state.history.undo();assert.deepEqual(state.document.getNode(shape.id),shape);assert.equal(state.dirty,false);
  state.history.redo();assert.deepEqual(state.document.getNode(shape.id),replacement);
  assert.throws(()=>replaceLeaf(shape.id,{...replacement,id:'other'}));
});
test('deleting an anchor without bridging opens a closed path there and splits an open one',()=>{
  const square={closed:true,segments:[[0,0],[10,0],[10,10],[0,10]].map(anchor)};
  const [opened]=deleteAnchors([square],[{subpath:0,segment:0}],{bridge:false});
  assert.equal(opened.closed,false);assert.deepEqual(opened.segments.map(s=>s.p),[[10,0],[10,10],[0,10]],'Starts after the deleted anchor, so nothing joins across the gap');
  const [kept]=deleteAnchors([square],[{subpath:0,segment:0}]);assert.equal(kept.closed,true);assert.equal(kept.segments.length,3);
  const pieces=deleteAnchors([square],[{subpath:0,segment:0},{subpath:0,segment:2}],{bridge:false});assert.equal(pieces.length,0,'Single anchors left over are dropped');
  const line={closed:false,segments:[[0,0],[10,0],[20,0],[30,0],[40,0]].map(anchor)};
  const split=deleteAnchors([line],[{subpath:0,segment:2}],{bridge:false});
  assert.deepEqual(split.map(p=>p.segments.map(s=>s.p[0])),[[0,10],[30,40]]);assert.ok(split.every(p=>!p.closed));
});
