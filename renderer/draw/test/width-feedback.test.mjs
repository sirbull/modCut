import assert from 'node:assert/strict';
import test from 'node:test';
import paper from 'paper';
import { createProjectDraw } from '../io/project.mjs';
import { createDocument, createNode } from '../doc/schema.mjs';
import { appearance } from '../geometry.mjs';
import { createDrawRenderer } from '../render.mjs';

function setup(t) {
  const line=createNode('path',{opacity:.6,appearance:appearance(null,'#2345AB',2),
    subpaths:[{closed:false,segments:[[10,40],[90,40]].map(p=>({p,in:[0,0],out:[0,0]}))}]});
  const clip=createNode('shape',{params:{x:0,y:0,width:120,height:80}});
  const parent=createNode('group',{clip:true,opacity:.4,transform:[1.5,.2,.4,.7,10,5],children:[line,clip]});
  const state=createProjectDraw(createDocument({layers:[createNode('layer',{children:[parent]})]}));
  const scope=new paper.PaperScope();scope.setup(new scope.Size(300,300));scope.view.autoUpdate=false;
  const renderer=createDrawRenderer(scope,state);renderer.render();
  t.after(()=>{renderer.destroy();scope.remove();});
  return {state,scope,renderer,line};
}

test('width hover and edge handles follow uniform and profiled strokes through affine parents',t=>{
  const {state,scope,renderer,line}=setup(t),stroke=line.appearance.strokes[0],before=state.document.serialize();
  const world=p=>renderer.pointToWorld(line.id,p),middle=world([50,40]);
  const location=renderer.strokeLocation(line.id,[middle.x,middle.y]);
  assert.ok(Math.abs(location.t-.5)<1e-9);
  const [hover]=renderer.widthHandles(line.id,stroke,location);
  assert.equal(hover.hover,true);
  assert.ok(new scope.Point(hover.point).getDistance(middle)<1e-9);
  assert.ok(new scope.Point(hover.left).getDistance(world([50,39]))<1e-9);
  assert.ok(new scope.Point(hover.right).getDistance(world([50,41]))<1e-9);
  const profiled={...stroke,widthProfile:[{t:0,left:.5,right:.5},{t:.5,left:2,right:1},{t:1,left:.5,right:.5}]};
  const handle=renderer.widthHandles(line.id,profiled).find(h=>h.index===1);
  assert.ok(new scope.Point(handle.left).getDistance(world([50,36]))<1e-9);
  assert.ok(new scope.Point(handle.right).getDistance(world([50,42]))<1e-9);
  assert.equal(state.document.serialize(),before);assert.equal(state.history.canUndo,false);
});

test('live width paint keeps color, clipping, transforms and opacity while export and history retain the committed stroke',t=>{
  const {state,scope,renderer,line}=setup(t),original=renderer.items.get(line.id);
  const exported=()=>{const item=renderer.exportArtwork();try{return item.exportJSON({asString:true});}finally{item.remove();}};
  const before=exported(),snapshot=state.document.serialize();
  const proposed=structuredClone(line);
  proposed.appearance.strokes[0].widthProfile=[{t:0,left:.5,right:.5},{t:.5,left:2,right:1},{t:1,left:.5,right:.5}];
  const preview=renderer.appearancePreview(proposed);renderer.setEditPreview([proposed]);
  assert.equal(original.visible,false);assert.equal(preview.parent,original.parent);assert.equal(preview.parent.clipped,true);
  assert.deepEqual(preview.globalMatrix.values,original.globalMatrix.values);
  const paints=preview.getItems({match:item=>item.fillColor?.toCSS(true)==='#2345ab'});
  assert.ok(paints.length>0,'The actual stroke color is painted, without a translucent blue overlay');
  let alpha=1;for(let item=paints[0];item&&item!==preview;item=item.parent)alpha*=item.opacity;
  assert.equal(alpha,.6);assert.equal(preview.parent.opacity,.4);
  assert.equal(exported(),before,'Export excludes live preview shapes');
  assert.equal(state.document.serialize(),snapshot);assert.equal(state.history.canUndo,false);
  preview.remove();renderer.setEditPreview();assert.equal(original.visible,true);assert.equal(exported(),before);
});
