import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { newDrawDocument, artboardLayout, activeArtboard, ARTBOARD_PRESETS } from '../doc/artboards.mjs';
import { createNode, validateDocument } from '../doc/schema.mjs';
import { createProjectDraw } from '../io/project.mjs';
import { createDrawRenderer } from '../render.mjs';
import { createArtboardController } from '../tools/artboards.mjs';
import { resizeMatrix, rotationMatrix, transformedBox, snapTranslation } from '../tools/selection.mjs';
import { shapeFromDrag } from '../tools/shapes.mjs';
import { TOOL_GROUPS } from '../tools/toolbar.mjs';
import { changePaint } from '../doc/paint.mjs';
import { appearance } from '../geometry.mjs';

test('every registered drawing tool belongs to exactly one toolbar group',()=>{
  const ids=TOOL_GROUPS.flatMap(g=>g.tools);assert.equal(ids.length,49);assert.equal(new Set(ids).size,49);
  assert.equal(TOOL_GROUPS.filter(g=>g.tools.includes('ellipse')).length,1);
  assert.ok(TOOL_GROUPS.find(g=>g.id==='shapes').tools.includes('rounded-rectangle'));
});
test('New Draw presets have exact millimetre dimensions, stable board order and unique IDs',()=>{
  const bed={width:610,height:305};
  for(const preset of ARTBOARD_PRESETS.filter(p=>p.id!=='custom')) {
    const doc=newDrawDocument({preset:preset.id,count:3,columns:2,spacing:12},bed);
    assert.equal(validateDocument(doc).length,0);
    assert.equal(doc.artboards[0].width,preset.width ?? 610);assert.equal(doc.artboards[0].height,preset.height ?? 305);
    assert.equal(doc.artboards[1].x,doc.artboards[0].width+12);assert.equal(doc.artboards[2].y,doc.artboards[0].height+12);
    assert.equal(new Set(doc.artboards.map(a=>a.id)).size,3);
  }
});
test('artboard layout supports rows, columns and column-major grids with unequal sizes',()=>{
  const boards=Array.from({length:5},(_,i)=>({id:String(i),width:10+i,height:20}));
  const row=artboardLayout(boards,{layout:'row',spacing:3});assert.deepEqual(row.at(-1),{id:'4',x:68,y:0});
  const column=artboardLayout(boards,{layout:'column',spacing:3});assert.deepEqual(column.at(-1),{id:'4',x:0,y:92});
  const grid=artboardLayout(boards,{layout:'grid-column',columns:2,spacing:3});assert.deepEqual(grid[3],{id:'3',x:17,y:0});
});
test('document creation rejects nonfinite sizes, overlarge artboards and fractional/excess counts',()=>{
  for(const count of [0,1001,1.5,NaN])assert.throws(()=>newDrawDocument({count}));
  for(const width of [0,-1,NaN,Infinity,5780])assert.throws(()=>newDrawDocument({preset:'custom',width,height:20}));
  assert.throws(()=>newDrawDocument({spacing:-1}));assert.throws(()=>newDrawDocument({preset:'unknown'}));
});
function setup(t) {
  const node=createNode('shape',{params:{x:10,y:10,width:20,height:10},appearance:appearance()});
  const child=createNode('shape',{params:{x:50,y:20,width:10,height:10}}),group=createNode('group',{children:[child]});
  const doc=newDrawDocument({preset:'custom',width:100,height:80,count:3,columns:3});doc.layers[0].children=[node,group];
  const state=createProjectDraw(doc);state.ui={artboardId:doc.artboards[0].id,moveArtwork:true};
  const scope=new paper.PaperScope();scope.setup(new scope.Size(800,600));
  const renderer=createDrawRenderer(scope,state);renderer.render();
  const unsubscribe=state.subscribe(()=>renderer.render());
  const controller=createArtboardController(state,{refresh:()=>renderer.render(),fit:id=>renderer.fit(id),bounds:id=>renderer.bounds(id),localMatrix:(id,m)=>renderer.localMatrix(id,m)});
  t.after(()=>{unsubscribe();renderer.destroy();scope.remove();});return {state,scope,renderer,controller,node,group,child};
}
test('artboard moves and deep duplicates include editable artwork in one undo step',t=>{
  const {state,renderer,controller,node,group,child}=setup(t),original=state.document.serialize(),a=controller.active();
  controller.edit(a.id,{x:25,y:30,name:'Moved board'});
  assert.equal(renderer.bounds(node.id).x,35);assert.equal(renderer.bounds(group.id).y,50);
  assert.equal(state.history.entries.length,1);state.history.undo();assert.equal(state.document.serialize(),original);
  const copyId=controller.duplicate(),copy=state.document.getArtboard(copyId),children=state.document.data.layers[0].children;
  assert.equal(copy.x,120);assert.equal(children.length,4);assert.notEqual(children[3].children[0].id,child.id);
  assert.equal(renderer.bounds(children[2].id).x,130);
  state.history.undo();assert.equal(state.document.serialize(),original);
});
test('artboard order, rearrange, remove and undo retain artwork and valid active board',t=>{
  const {state,renderer,controller,node}=setup(t),original=state.document.serialize(),first=controller.active().id;
  controller.order(1);assert.equal(state.document.data.artboards[1].id,first);state.history.undo();
  controller.rearrange({layout:'column',spacing:10});assert.equal(state.document.data.artboards[1].y,90);
  assert.equal(renderer.bounds(node.id).x,10);state.history.undo();assert.equal(state.document.serialize(),original);
  controller.remove();assert.notEqual(activeArtboard(state).id,first);assert.equal(state.document.getNode(node.id).id,node.id);
  controller.remove();assert.throws(()=>controller.remove(),/at least one/);
});

test('side buttons duplicate the referenced artboard and artwork in all four directions with one undo',t=>{
  const {state,controller,renderer,node}=setup(t),board=controller.active(),before=state.document.serialize();
  for(const [side,dx,dy] of [['top',0,-100],['right',120,0],['bottom',0,100],['left',-120,0]]) {
    // The source is explicit, even when a different board was active.
    controller.choose(state.document.data.artboards[1].id);
    const id=controller.duplicateAdjacent(board.id,side),copy=state.document.getArtboard(id);
    assert.equal(copy.x,board.x+dx);assert.equal(copy.y,board.y+dy);
    assert.equal(copy.width,board.width);assert.equal(copy.height,board.height);assert.notEqual(copy.id,board.id);
    assert.equal(controller.active().id,id);
    const clone=state.document.data.layers[0].children[2];
    assert.equal(renderer.bounds(clone.id).x,renderer.bounds(node.id).x+dx);
    assert.equal(renderer.bounds(clone.id).y,renderer.bounds(node.id).y+dy);
    assert.equal(state.history.entries.filter(e=>e.applied).length,1);
    state.history.undo();assert.equal(state.document.serialize(),before);
  }
});
test('moving a board without artwork leaves geometry unchanged and invalid edits roll back atomically',t=>{
  const {state,renderer,controller,node}=setup(t),a=controller.active();
  state.ui.moveArtwork=false;controller.edit(a.id,{x:40});assert.equal(renderer.bounds(node.id).x,10);
  const before=state.document.serialize();assert.throws(()=>controller.edit(a.id,{width:6000}));assert.equal(state.document.serialize(),before);
});
test('bounding-box resize honours Shift aspect locking and Alt centre scaling',()=>{
  const box={x:10,y:20,width:40,height:20};
  assert.deepEqual(transformedBox(box,resizeMatrix(box,'se',[90,60])),{x:10,y:20,width:80,height:40});
  assert.deepEqual(transformedBox(box,resizeMatrix(box,'se',[90,50],{shift:true})),{x:10,y:20,width:80,height:40});
  assert.deepEqual(transformedBox(box,resizeMatrix(box,'e',[70,30],{alt:true})),{x:-10,y:20,width:80,height:20});
  assert.deepEqual(transformedBox(box,resizeMatrix(box,'e',[70,30],{alt:true,shift:true})),{x:-10,y:10,width:80,height:40});
});
test('rotation snaps to 45-degree steps and smart guides respect screen-derived tolerance',()=>{
  const box={x:0,y:0,width:10,height:10};
  const matrix=rotationMatrix(box,[10,5],[8,9],true);assert.ok(Math.abs(matrix[0]-Math.SQRT1_2)<1e-12);
  const snap=snapTranslation(box,[9.5,3],[{x:20,y:30,label:'edge'}],1);assert.equal(snap.x,10);assert.equal(snap.y,3);assert.equal(snap.guides[0].label,'edge');
  assert.equal(snapTranslation(box,[9.5,3],[{x:20,y:30}],.2).x,9.5);
});
test('shape drawing supports negative quadrants, Shift+Alt, exact line angles and live radial parameters',()=>{
  assert.deepEqual(shapeFromDrag('rectangle',[20,30],[10,25],{shift:true,alt:true}).params,{x:10,y:20,width:20,height:20});
  const line=shapeFromDrag('line',[0,0],[10,3],{shift:true});assert.equal(line.params.y2,0);
  const polygon=shapeFromDrag('polygon',[10,20],[40,60],{points:7});assert.equal(polygon.params.radius,50);assert.equal(polygon.params.sides,7);
  const star=shapeFromDrag('star',[0,0],[20,0],{points:9,ratio:.3});assert.equal(star.params.innerRadius,6);assert.equal(star.params.points,9);
  const round=shapeFromDrag('rounded-rectangle',[0,0],[10,20],{cornerRadius:40});assert.equal(round.params.cornerRadius,5);
});
test('paint edits preserve each object stroke geometry and do not mutate existing appearance',()=>{
  const original=appearance('#FF0000','#000000',2);original.strokes[0].cap='square';original.strokes[0].dash={array:[3,1],offset:2};
  const before=structuredClone(original),edited=changePaint(original,'stroke','#00FF00',{strokeWidth:9});
  assert.equal(edited.strokes[0].width,2);assert.equal(edited.strokes[0].cap,'square');assert.deepEqual(edited.strokes[0].dash,{array:[3,1],offset:2});
  assert.deepEqual(original,before);assert.equal(changePaint(original,'width',0,{}).strokes[0].width,0);
});
