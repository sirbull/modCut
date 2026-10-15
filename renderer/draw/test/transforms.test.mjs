import test from 'node:test';
import assert from 'node:assert/strict';
import {operationMatrix,dragTransform,scaledStrokeProperties,dialogOperation} from '../geom/transforms.mjs';
import {createTransformController} from '../tools/transforms.mjs';
import {createNode,createDocument} from '../doc/schema.mjs';
import {createProjectDraw} from '../io/project.mjs';
import {updateNode} from '../doc/commands.mjs';
import {appearance} from '../geometry.mjs';
import {createDrawRenderer} from '../render.mjs';
import {roundCorners} from '../geom/corners.mjs';
import paper from 'paper';
const point=(m,p)=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
const close=(a,b)=>a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-8,`${a} != ${b}`));
function setup(t,children){
  const state=createProjectDraw(createDocument({layers:[createNode('layer',{children})]}));state.ui={};
  const scope=new paper.PaperScope();scope.setup(new scope.Size(200,200));const renderer=createDrawRenderer(scope,state);renderer.render();
  const unsubscribe=state.subscribe(()=>renderer.render()),selectedIds=()=>state.selection.ids;
  let controller;
  controller=createTransformController(state,{selectedIds,bounds:()=>renderer.selectionBounds(),localMatrix:(id,m)=>renderer.localMatrix(id,m),worldMatrix:id=>renderer.worldMatrix(id),select(ids){state.selection.set(ids);controller.selectionChanged();},update:()=>renderer.select()});
  state.selection.set(children.map(n=>n.id));controller.selectionChanged();
  t.after(()=>{unsubscribe();renderer.destroy();scope.remove();});return{state,scope,renderer,controller};
}
const rect=(props={})=>createNode('shape',{params:{x:10,y:20,width:20,height:10},appearance:appearance(null,'#071411',2),...props});
test('world matrices rotate CCW, reflect arbitrary axes and keep a fixed reference point',()=>{
  for(const operation of [{tool:'rotate',angle:90},{tool:'reflect',angle:90},{tool:'scale',x:2,y:3}])close(point(operationMatrix(operation,[10,20]),[10,20]),[10,20]);
  close(point(operationMatrix({tool:'rotate',angle:90},[10,20]),[20,20]),[10,10]);
  close(point(operationMatrix({tool:'reflect',angle:90},[10,20]),[20,30]),[0,30]);
  close(point(operationMatrix({tool:'reflect',angle:45},[0,0]),[2,3]),[-3,-2]);
  assert.throws(()=>operationMatrix({tool:'scale',x:0,y:1},[0,0]));assert.throws(()=>operationMatrix({tool:'rotate',angle:Infinity},[0,0]));
  assert.deepEqual(dialogOperation('scale',{mode:'uniform',uniform:150}),{tool:'scale',x:1.5,y:1.5});
});
test('drag transforms constrain rotation/reflection, scale independently and cross the reference point safely',()=>{
  assert.equal(dragTransform('rotate',[0,0],[10,0],[8,-8],true).angle,45);
  const reflected=operationMatrix(dragTransform('reflect',[0,0],[10,0],[0,10]),[0,0]);close(point(reflected,[10,0]),[0,10]);
  assert.deepEqual(dragTransform('scale',[0,0],[10,20],[20,60]),{tool:'scale',x:2,y:3});
  const uniform=dragTransform('scale',[0,0],[10,10],[-20,-20],true);close([uniform.x,uniform.y],[-2,-2]);
  assert.ok(Math.abs(dragTransform('scale',[0,0],[10,10],[0,0]).x)>0);
});
test('controller transforms copy/again atomically, with fresh descendant IDs and stable explicit pivot',t=>{
  const shape=rect(),group=createNode('group',{children:[shape]});const{state,controller}=setup(t,[group]);controller.setOrigin([0,0]);
  const before=state.snapshot();assert.equal(controller.apply([1,0,0,1,0,0]),false);assert.equal(state.dirty,false);
  controller.apply([1,0,0,1,5,2],'Move',{copy:true});assert.equal(state.document.data.layers[0].children.length,2);
  const copy=state.document.data.layers[0].children[1];assert.notEqual(copy.children[0].id,shape.id);assert.deepEqual(controller.origin(),[0,0]);
  controller.again();assert.equal(state.document.data.layers[0].children.length,3);close(state.document.data.layers[0].children[2].transform,[1,0,0,1,10,4]);
  state.history.undo();state.history.undo();assert.deepEqual(state.snapshot(),before);assert.equal(state.dirty,false);
  state.history.redo();assert.equal(state.document.data.layers[0].children.length,2);
});
test('Scale strokes option has the same world-mm result for paths, live shapes and groups',t=>{
  const path=createNode('path',{appearance:appearance(null,'#071411',2),subpaths:[{closed:false,segments:[[0,0],[10,10]].map(p=>({p,in:[0,0],out:[0,0]}))}]}),shape=rect({transform:[2,0,0,2,0,0]}),group=createNode('group',{children:[path,shape],transform:[1.5,0,0,1.5,0,0]});
  const{state,controller,renderer}=setup(t,[group]);controller.apply([2,0,0,2,0,0],'Scale',{scaleStrokes:false});
  assert.equal(state.document.getNode(path.id).appearance.strokes[0].width,3);assert.equal(state.document.getNode(shape.id).appearance.strokes[0].width,6);
  assert.equal(renderer.items.get(shape.id).strokeScaling,false);
  controller.again();assert.equal(state.document.getNode(shape.id).appearance.strokes[0].width,6);
  state.history.undo();state.history.undo();controller.apply([2,0,0,2,0,0],'Scale',{scaleStrokes:true});assert.equal(state.document.getNode(shape.id).appearance.strokes[0].width,12);
});
test('preview matches world-space geometry and does not mutate data, selection or dirty state',t=>{
  const node=rect(),{state,renderer,scope}=setup(t,[node]),before=JSON.stringify(state.snapshot());
  renderer.previewTransform([node.id],[2,0,0,2,0,0],{scaleStrokes:false});assert.equal(renderer.items.get(node.id).visible,false);
  const preview=scope.project.getItems({match:item=>item.data.nodeId===node.id&&item!==renderer.items.get(node.id)})[0];assert.equal(preview.strokeWidth,2);assert.equal(preview.strokeScaling,false);close([preview.bounds.x,preview.bounds.y,preview.bounds.width,preview.bounds.height],[20,40,40,20]);
  assert.equal(JSON.stringify(state.snapshot()),before);assert.equal(state.dirty,false);renderer.clearTransformPreview();renderer.updateView();assert.equal(renderer.items.get(node.id).visible,true);
});
test('world-mm strokes and dash lengths follow view zoom without scaling with object geometry',t=>{
  const node=rect({strokeScaling:false,transform:[3,0,0,2,0,0]});node.appearance.strokes[0].dash={array:[2,4],offset:1};
  const{state,renderer,scope}=setup(t,[node]),before=state.snapshot();
  for(const zoom of [.5,1,3]){scope.view.zoom=zoom;renderer.updateView();const item=renderer.items.get(node.id);assert.equal(item.strokeWidth,2*zoom);assert.deepEqual(item.dashArray,[2*zoom,4*zoom]);assert.equal(item.dashOffset,zoom);
    assert.ok(Math.abs(item.strokeBounds.width-item.bounds.width-2)<1e-6,'Physical stroke bounds remain constant in project mm');}
  assert.deepEqual(state.snapshot(),before);
});
test('world transforms respect rotated parents, preserve live corners and rollback locked descendant edits',t=>{
  const source={closed:true,segments:[[0,0],[20,0],[20,20],[0,20]].map(p=>({p,in:[0,0],out:[0,0]}))},path=createNode('path',{subpaths:[roundCorners(source,[0,1,2,3],2)]}),parent=createNode('group',{transform:[0,1,-1,0,50,10],children:[path]});
  const{state,controller,renderer}=setup(t,[parent]);state.selection.set([path.id]);controller.selectionChanged();const p=renderer.pointToWorld(path.id,[0,0]);controller.apply([1,0,0,1,3,4],'Move');
  const changed=state.document.getNode(path.id);assert.ok(changed.subpaths[0].cornerData);const logical=changed.subpaths[0].cornerData.segments[0].p,world=renderer.pointToWorld(path.id,logical);close([world.x,world.y],[p.x+3,p.y+4]);
  state.history.undo();state.selection.set([parent.id]);state.history.execute(updateNode(path.id,{locked:true}));const saved=state.snapshot(),last=controller.last;
  assert.throws(()=>controller.apply([2,0,0,2,0,0],'Scale',{scaleStrokes:true}),/locked/);assert.deepEqual(saved,state.snapshot());assert.deepEqual(controller.last,last);
});
test('stroke normalization preserves paint and opaque effects, scaling dash dimensions by area-equivalent factor',()=>{
  const node=rect();node.appearance.effects=[{type:'future',amount:3}];node.appearance.strokes[0].dash={array:[2,4],offset:1};const saved=structuredClone(node);
  const props=scaledStrokeProperties(node,[1,0,0,1,0,0],[2,0,0,8,0,0],true);assert.equal(props.appearance.strokes[0].width,8);assert.deepEqual(props.appearance.strokes[0].dash,{array:[8,16],offset:4});assert.deepEqual(props.appearance.effects,node.appearance.effects);assert.deepEqual(node,saved);
});
