import test from 'node:test';
import assert from 'node:assert/strict';
import {roundCorners,editablePath,cornerGeometry,bakeCorners} from '../geom/corners.mjs';
import {anchor,moveAnchors,deleteAnchors,reversePath,splitCurve,convertAnchor} from '../geom/path-editing.mjs';
import {transformProperties} from '../geometry.mjs';
import {flattenPath} from '../geom/kernel-js.mjs';
import {createNode,createDocument,validateDocument} from '../doc/schema.mjs';
import {createProjectDraw} from '../io/project.mjs';
import {updateNode,replaceLeaf} from '../doc/commands.mjs';
import {shapeSelectionKey} from '../doc/selection.mjs';
const square=()=>({closed:true,segments:[[0,0],[20,0],[20,20],[0,20]].map(anchor)});
const close=(a,b)=>a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-8,`${a} != ${b}`));
test('round corners resolves tangent cubic arcs while retaining reversible source anchors',()=>{
  const source=square(),rounded=roundCorners(source,[0,1,2,3],4);
  assert.equal(rounded.segments.length,8);assert.deepEqual(editablePath(rounded).segments,source.segments);
  close(rounded.segments[0].p,[0,4]);close(rounded.segments[1].p,[4,0]);
  const k=4/3*Math.tan(Math.PI/8)*4;close(rounded.segments[0].out,[0,-k]);close(rounded.segments[1].in,[-k,0]);
  assert.deepEqual(roundCorners(rounded,[0,1,2,3],0),source);
  assert.deepEqual(roundCorners(roundCorners(rounded,[0,1,2,3],7),[0,1,2,3],4),rounded);
  assert.equal(source.segments.length,4);assert.equal(flattenPath([rounded],.01)[0].points.some(p=>p[0]===0&&p[1]===0),false,'Geometry consumers receive rounded curves');
});
test('corner limits prevent overlapping trims and ignore endpoints, curves and degenerate vertices',()=>{
  const source=square(),rounded=roundCorners(source,[0,1,2,3],100);close(rounded.cornerData.radii,[10,10,10,10]);
  const open={closed:false,segments:[[0,0],[10,0],[10,4]].map(anchor)};
  assert.equal(cornerGeometry(open,0),null);assert.equal(cornerGeometry(open,2),null);close([roundCorners(open,[1],100).cornerData.radii[1]],[2]);
  for(const points of [[[0,0],[0,0],[10,0]],[[0,0],[5,0],[10,0]],[[0,0],[5,0],[0,0]]])assert.equal(cornerGeometry({closed:false,segments:points.map(anchor)},1),null);
  const curved=square();curved.segments[0].out=[1,0];assert.equal(cornerGeometry(curved,0),null);assert.equal(cornerGeometry(curved,1),null);
  const concave={closed:true,segments:[[0,0],[20,0],[10,10],[20,20],[0,20]].map(anchor)};assert.ok(cornerGeometry(concave,2));
  assert.throws(()=>roundCorners(source,[0],-1));assert.throws(()=>roundCorners(source,[0],NaN));
});
test('anchor edits, delete, reverse, splitting and conversion keep corner sources consistent',()=>{
  const rounded=roundCorners(square(),[0,1,2,3],3),moved=moveAnchors([rounded],[{subpath:0,segment:0}],[2,1])[0];
  assert.deepEqual(editablePath(moved).segments[0].p,[2,1]);assert.equal(moved.segments.length,8);
  const deleted=deleteAnchors([rounded],[{subpath:0,segment:1}])[0];assert.equal(deleted.cornerData.segments.length,3);assert.equal(deleted.cornerData.radii.length,3);
  assert.deepEqual(reversePath(reversePath(rounded)),rounded);
  assert.equal(splitCurve(rounded,0,.5).cornerData,undefined,'Topology changes on resolved curves bake live metadata');
  const smooth=convertAnchor(rounded,1,true);assert.ok(Math.hypot(...editablePath(smooth).segments[1].out)>0);assert.equal(smooth.cornerData?.radii[1]??0,0);
  assert.deepEqual(bakeCorners(rounded).segments,rounded.segments);
});
test('similarity transforms retain live radii; arbitrary affine transforms retain exact resolved geometry',()=>{
  const rounded=roundCorners(square(),[0,1,2,3],3),node=createNode('path',{subpaths:[rounded]});
  const uniform=transformProperties(node,[0,2,-2,0,12,9]).subpaths[0];assert.deepEqual(uniform.cornerData.radii,[6,6,6,6]);
  close(uniform.segments[0].p,[6,9]);
  const stretched=transformProperties(node,[2,.5,0,1,4,7]).subpaths[0];assert.equal(stretched.cornerData,undefined);
  stretched.segments.forEach((s,i)=>close(s.p,[rounded.segments[i].p[0]*2+4,rounded.segments[i].p[0]*.5+rounded.segments[i].p[1]+7]));
});
test('live corner metadata validates, roundtrips, and follows atomic history and saved state',()=>{
  const node=createNode('path',{subpaths:[square()]}),doc=createDocument({layers:[createNode('layer',{children:[node]})]}),state=createProjectDraw(doc);
  state.history.execute(updateNode(node.id,{subpaths:[roundCorners(square(),[1],4)]}));assert.equal(validateDocument(state.snapshot()).length,0);
  const reloaded=createProjectDraw(JSON.parse(JSON.stringify(state.snapshot())));assert.deepEqual(reloaded.snapshot(),state.snapshot());assert.equal(reloaded.document.readOnly,false);
  state.history.undo();assert.equal(state.dirty,false);assert.deepEqual(state.document.getNode(node.id).subpaths,[square()]);state.history.redo();assert.equal(state.dirty,true);
  const invalid=structuredClone(state.snapshot());invalid.layers[0].children[0].subpaths[0].cornerData.radii[0]=-1;assert.ok(validateDocument(invalid).length);
  for(const cornerData of [null,{segments:[],radii:[]},{segments:[],radii:[1]},{segments:'bad',radii:[]},{segments:square().segments,radii:[1,1,1,1]}]){
    const stale=structuredClone(state.snapshot());stale.layers[0].children[0].subpaths[0].cornerData=cornerData;assert.ok(validateDocument(stale).length,'Malformed or stale live corner data is rejected');
  }
  const broken=structuredClone(state.snapshot());broken.layers[0].children[0].subpaths[0].segments=null;assert.ok(validateDocument(broken).length);
});
test('shape anchor selection is transient, signature guarded and survives expansion',()=>{
  const shape=createNode('shape'),state=createProjectDraw(createDocument({layers:[createNode('layer',{children:[shape]})]}));
  const selected={nodeId:shape.id,subpath:0,segment:1,shapeKey:shapeSelectionKey(shape),logical:true};
  state.selection.setAnchors([selected]);assert.equal(state.selection.anchors.length,1);assert.equal(state.dirty,false);
  state.history.execute(replaceLeaf(shape.id,createNode('path',{id:shape.id,subpaths:[square()]})));assert.equal(state.selection.anchors.length,1);
  state.history.undo();assert.equal(state.selection.anchors.length,1);
  state.history.execute(updateNode(shape.id,{params:{width:30,height:10}}));assert.equal(state.selection.anchors.length,0,'Changed shape geometry invalidates transient indices');
});
