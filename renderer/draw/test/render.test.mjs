import assert from 'node:assert/strict';
import test from 'node:test';
import paper from 'paper';
import { createProjectDraw } from '../io/project.mjs';
import { createArtboard, createDocument, createNode } from '../doc/schema.mjs';
import { insertNode, moveNode, removeNode, updateNode, updateArtboard, insertArtboard } from '../doc/commands.mjs';
import { appearance } from '../geometry.mjs';
import { createDrawRenderer } from '../render.mjs';

const rectangle = (properties = {}) => createNode('shape', { appearance: appearance('#FF0000', '#071411', 2), ...properties });
function setup(t, children = [], options = {}) {
  const layer = createNode('layer', { children });
  const state = createProjectDraw(createDocument({ layers: [layer], ...options }));
  const scope = new paper.PaperScope(); scope.setup(new scope.Size(200, 200));
  scope.view.center = [100, 100]; scope.view.autoUpdate = false;
  const renderer = createDrawRenderer(scope, state); renderer.render();
  const unsubscribe = state.subscribe(() => renderer.render());
  t.after(() => { unsubscribe(); renderer.destroy(); scope.remove(); });
  return { state, scope, renderer, layer };
}
const rect = b => [b.x, b.y, b.width, b.height].map(n => Math.round(n * 1e6) / 1e6);

test('anchor hits, curve splitting locations and local coordinates follow transformed parents',t=>{
  const node=createNode('path',{appearance:appearance(null,'#071411'),subpaths:[{closed:false,segments:[{p:[0,0],in:[0,0],out:[10,10]},{p:[30,0],in:[-10,10],out:[0,0]}]}]});
  const group=createNode('group',{transform:[0,2,-3,0,80,30],children:[node]});
  const {state,scope,renderer}=setup(t,[group]);
  state.ui={tool:'direct-selection'};state.selection.setAnchors([{nodeId:node.id,subpath:0,segment:0}]);renderer.updateView();
  const world=renderer.pointToWorld(node.id,[10,10]);assert.deepEqual([world.x,world.y],[50,50]);
  assert.deepEqual(renderer.pathHit(world),{nodeId:node.id,subpath:0,segment:0,kind:'out'});
  const local=renderer.pointToLocal(node.id,world);assert.ok(local.getDistance(new scope.Point(10,10))<1e-9);
  const hit=renderer.curveHit(new scope.Point(57.5,60));assert.equal(hit.nodeId,node.id);assert.ok(Math.abs(hit.t-.5)<1e-6);
  state.history.execute(updateNode(group.id,{locked:true}));assert.equal(renderer.pathHit(world),null);assert.equal(renderer.curveHit(new scope.Point(57.5,60)),null);
});

test('expanding transformed shapes preserves local geometry, appearance and world bounds',t=>{
  const shape=rectangle({shape:'ellipse',params:{x:5,y:7,width:20,height:10},transform:[2,.5,0,1,8,9]});
  const group=createNode('group',{transform:[0,1,-1,0,60,0],children:[shape]});
  const {renderer}=setup(t,[group]),expanded=renderer.expandedShape(shape.id);
  assert.equal(expanded.id,shape.id);assert.deepEqual(expanded.transform,[1,0,0,1,0,0]);assert.deepEqual(expanded.appearance,shape.appearance);
  const view=new paper.CompoundPath({insert:false,children:expanded.subpaths.map(path=>new paper.Path({insert:false,closed:path.closed,segments:path.segments.map(s=>new paper.Segment(s.p,s.in,s.out))}))});
  assert.deepEqual(rect(view.getBounds(new paper.Matrix(...group.transform))),rect(renderer.bounds(shape.id)));view.remove();
});

test('diff retains unchanged geometry and containers across styling, transform, order and undo', t => {
  const a = rectangle(), b = rectangle({ transform: [1, 0, 0, 1, 20, 0] });
  const group = createNode('group', { children: [a, b] });
  const { state, renderer } = setup(t, [group]);
  const original = new Map(renderer.items), parent = original.get(group.id);
  let inserts = 0;
  const insert = parent.insertChild;
  parent.insertChild = function(...args) { inserts++; return insert.apply(this, args); };
  renderer.render();
  assert.equal(inserts, 0, 'unchanged nodes are not reinserted');
  state.history.execute(updateNode(group.id, { opacity: .4, transform: [2, 0, 0, 2, 5, 7] }));
  state.history.execute(updateNode(a.id, { appearance: appearance('#00FF00', null) }));
  for (const [id, item] of original) assert.equal(renderer.items.get(id), item);
  assert.equal(parent.opacity, .4);
  assert.equal(original.get(a.id).fillColor.toCSS(true), '#00ff00');
  assert.deepEqual(rect(renderer.bounds(a.id)), [5, 7, 20, 20]);
  state.history.execute(moveNode(b.id, group.id, 0));
  assert.deepEqual(parent.children.map(item => item.data.nodeId), [b.id, a.id]);
  state.history.undo();
  assert.deepEqual(parent.children.map(item => item.data.nodeId), [a.id, b.id]);
  state.history.execute(updateNode(a.id, { params: { width: 25, height: 15 } }));
  assert.notEqual(renderer.items.get(a.id), original.get(a.id));
  assert.equal(renderer.items.get(b.id), original.get(b.id));
  assert.equal(renderer.items.get(group.id), parent);
  state.history.execute(removeNode(group.id));
  assert.equal(renderer.items.has(a.id), false);
  assert.equal(renderer.items.has(b.id), false);
  state.history.undo();
  assert.equal(renderer.items.get(a.id).parent, renderer.items.get(group.id));
});

test('viewport culling follows pan, zoom and resize while retaining bounds and selection', t => {
  const near = rectangle(), far = rectangle({ transform: [1, 0, 0, 1, 1000, 1000] });
  const group = createNode('group', { children: [near, far], transform: [1, 0, 0, 1, 10, 20] });
  const { state, scope, renderer } = setup(t, [group]);
  const before = state.document.serialize(), original = renderer.items.get(far.id);
  state.selection.set([group.id]); renderer.select();
  const selection = rect(renderer.selectionBounds());
  assert.equal(renderer.items.get(near.id).visible, true);
  assert.equal(original.visible, false);
  assert.deepEqual(rect(renderer.bounds(group.id)), [10, 20, 1010, 1010]);
  scope.view.center = [1015, 1025]; renderer.updateView();
  assert.equal(original.visible, true);
  assert.equal(renderer.items.get(near.id).visible, false);
  assert.equal(renderer.hit(new scope.Point(1015, 1025)), far.id);
  assert.deepEqual(rect(renderer.selectionBounds()), selection, 'culling does not shrink a selected group');
  scope.view.center = [100, 100]; scope.view.zoom = .1; renderer.updateView();
  assert.equal(original.visible, true, 'zooming out restores offscreen geometry');
  scope.view.zoom = 1; scope.view.viewSize = [2400, 2400]; renderer.updateView();
  assert.equal(original.visible, true, 'resizing updates culling');
  assert.equal(renderer.items.get(far.id), original);
  assert.equal(state.document.serialize(), before);
  assert.equal(state.dirty, false);
});

test('culling preserves thick strokes at viewport edges, zero-width lines and hidden ancestors', t => {
  const thick = rectangle({ params: { x: 220, y: 10, width: 10, height: 10 }, appearance: appearance(null, '#000000', 60) });
  const line = rectangle({ shape: 'line', params: { x1: 100, y1: 30, x2: 100, y2: 0, height: 80 } });
  const hidden = createNode('group', { visible: false, children: [rectangle()] });
  const { scope, state, renderer } = setup(t, [thick, line, hidden]);
  assert.equal(renderer.items.get(thick.id).visible, true);
  assert.deepEqual(rect(renderer.bounds(line.id)), [100, 0, 0, 30], 'explicit zero endpoints are preserved');
  assert.equal(renderer.items.get(hidden.id).visible, false);
  assert.equal(renderer.hit(new scope.Point(5, 5)), null);
  renderer.setOutline(true);
  state.history.execute(updateNode(thick.id, { name: 'Edited in Outline' }));
  renderer.setOutline(false);
  assert.equal(renderer.items.get(thick.id).visible, true, 'normal stroke bounds survive edits in Outline');
  scope.view.center = [1000, 1000]; renderer.updateView();
  scope.view.center = [100, 100]; renderer.updateView();
  assert.equal(renderer.items.get(hidden.id).visible, false, 'pan never unhides document-hidden groups');
});

test('Outline is reversible, uses screen-sized solid hairlines and leaves history untouched', t => {
  const node = rectangle({ transform: [3, 0, 0, 2, 0, 0], opacity: .3, blendMode: 'multiply' });
  node.appearance.strokes[0].dash = { array: [3, 2], offset: 1 };
  const { scope, renderer, state } = setup(t, [node]);
  const item = renderer.items.get(node.id), before = state.document.serialize();
  renderer.setOutline(true);
  assert.equal(renderer.outline, true);
  assert.equal(item.fillColor, null); assert.equal(item.opacity, 1); assert.equal(item.blendMode, 'normal');
  assert.deepEqual(item.dashArray, []); assert.equal(item.strokeScaling, false);
  assert.equal(renderer.hit(new scope.Point(15, 10)), null, 'Outline hit testing ignores filled interiors');
  assert.equal(renderer.hit(new scope.Point(0, 10)), node.id);
  scope.view.zoom = 4; renderer.updateView();
  assert.equal(item.strokeWidth * scope.view.zoom, 1);
  renderer.setOutline(false);
  assert.equal(item.fillColor.toCSS(true), '#ff0000');
  assert.equal(item.opacity, .3); assert.equal(item.blendMode, 'multiply');
  assert.equal(item.strokeWidth, 2); assert.equal(item.strokeScaling, true);
  assert.deepEqual(item.dashArray, [3, 2]); assert.equal(item.dashOffset, 1);
  assert.equal(state.document.serialize(), before); assert.equal(state.dirty, false);
  assert.equal(state.history.canUndo, false);
});

test('path subpaths preserve curves and evenodd holes in Preview and Outline', t => {
  const ring = points => ({ closed: true, segments: points.map(p => ({ p, in: [0, 0], out: [0, 0] })) });
  const node = createNode('path', { fillRule: 'evenodd', appearance: appearance('#FF0000', null), subpaths: [
    ring([[10, 10], [90, 10], [90, 90], [10, 90]]), ring([[30, 30], [70, 30], [70, 70], [30, 70]]),
  ] });
  const curved = createNode('path', { appearance: appearance(null, '#000000'), subpaths: [{ closed: false,
    segments: [{ p: [110, 10], in: [0, 0], out: [20, 0] }, { p: [150, 50], in: [-20, 0], out: [0, 0] }] }] });
  const { scope, renderer } = setup(t, [node, curved]);
  assert.equal(renderer.items.get(node.id).className, 'CompoundPath');
  assert.equal(renderer.hit(new scope.Point(20, 20)), node.id);
  assert.equal(renderer.hit(new scope.Point(50, 50)), null);
  const handle = renderer.items.get(curved.id).firstSegment.handleOut;
  assert.deepEqual([handle.x, handle.y], [20, 0]);
  renderer.setOutline(true);
  assert.equal(renderer.hit(new scope.Point(30, 50)), node.id);
});

test('artboards are diffed individually and transparent boards remain transparent', t => {
  const { state, scope, renderer } = setup(t);
  const boards = scope.project.layers[0], original = boards.firstChild;
  const second = createArtboard({ x: 700, background: 'transparent' });
  state.history.execute(insertArtboard(second));
  assert.equal(boards.firstChild, original);
  assert.equal(boards.lastChild.fillColor, null);
  state.history.execute(updateArtboard(second.id, { width: 200 }));
  assert.equal(boards.firstChild, original);
  assert.equal(boards.lastChild.bounds.width, 200);
  state.history.undo(); state.history.undo();
  assert.equal(boards.children.length, 1);
  renderer.fit();
  assert.ok(scope.view.zoom > 0); assert.equal(boards.firstChild.strokeWidth * scope.view.zoom, 2);
});

test('reparenting and local transforms preserve correct world coordinates', t => {
  const node = rectangle(), group = createNode('group', { transform: [2, 0, 0, 2, 50, 30], children: [node] });
  const { state, renderer, layer } = setup(t, [group]);
  const original = renderer.items.get(node.id);
  assert.deepEqual(rect(renderer.bounds(node.id)), [50, 30, 20, 20]);
  assert.deepEqual(renderer.localMatrix(node.id, [1, 0, 0, 1, 10, 20]), [1, 0, 0, 1, 5, 10]);
  state.history.execute(moveNode(node.id, layer.id));
  assert.equal(renderer.items.get(node.id), original);
  assert.deepEqual(rect(renderer.bounds(node.id)), [0, 0, 10, 10]);
  state.history.execute(insertNode(group.id, rectangle()));
  assert.equal(renderer.items.get(group.id).children.length, 1);
});
test('live ellipse pie angles retain curved sector geometry and undo restores the full ellipse',t=>{
  const node=rectangle({shape:'ellipse',params:{x:10,y:20,width:40,height:20}}),{state,renderer}=setup(t,[node]);
  const full=Math.abs(renderer.items.get(node.id).area);
  state.history.execute(updateNode(node.id,{params:{...node.params,startAngle:0,endAngle:180}}));
  const item=renderer.items.get(node.id);assert.equal(item.closed,true);
  assert.ok(Math.abs(Math.abs(item.area)-full/2)<.001);
  assert.deepEqual(rect(renderer.bounds(node.id)),[10,30,40,10]);
  state.history.undo();assert.ok(Math.abs(Math.abs(renderer.items.get(node.id).area)-full)<.001);
});
