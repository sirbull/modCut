import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { glyphSubpaths,hasTextLayout,textSignature,textSubpaths } from '../doc/text-layout.mjs';
import { pointText,DEFAULT_CHARACTER,textToOutlines } from '../doc/text.mjs';
import { createDocument,validateDocument } from '../doc/schema.mjs';
import { createProjectDraw } from '../io/project.mjs';
import { insertNode,removeNode,updateNode } from '../doc/commands.mjs';
import { createDrawRenderer } from '../render.mjs';
import { artboardCutSvg } from '../io/cut-svg.mjs';

function sample() {
  const node=pointText([10,20],{...DEFAULT_CHARACTER,text:'A',alignment:'left'});
  const subpaths=glyphSubpaths([{command:'moveTo',args:[0,0]},{command:'lineTo',args:[5,10]},
    {command:'quadraticCurveTo',args:[10,10,10,0]},{command:'bezierCurveTo',args:[7,-2,3,-2,0,0]},{command:'closePath',args:[]}],(x,y)=>[x,-y]);
  node.layout={version:1,signature:textSignature(node),font:{family:'Test',style:'Regular',postscriptName:'Test-Regular'},lineWidths:[10],glyphs:[{line:0,glyphId:1,subpaths}]};return node;
}
test('glyph contours preserve quadratic/cubic curves and merge their closing anchor',()=>{
  const p=textSubpaths(sample())[0];assert.equal(p.closed,true);assert.equal(p.segments.length,3);
  assert.deepEqual(p.segments[0].in,[3,2]);assert.ok(Math.abs(p.segments[1].out[0]-10/3)<1e-12);assert.equal(p.segments[1].out[1],0);
  assert.equal(p.segments[2].in[0],0);assert.ok(Math.abs(p.segments[2].in[1]+20/3)<1e-12);assert.deepEqual(p.segments[2].out,[-3,2]);
  assert.throws(()=>glyphSubpaths([{command:'lineTo',args:[0,0]}],(x,y)=>[x,y]),/Invalid/);
  assert.throws(()=>glyphSubpaths([{command:'moveTo',args:[NaN,0]}],(x,y)=>[x,y]),/invalid glyph coordinates/);
});
test('outlines retain text identity/appearance/transform, undo atomically and become Cut paths',t=>{
  const node=sample();node.opacity=.4;node.transform=[1,0,0,1,10,20];
  const data=createDocument();data.layers[0].children=[node];const state=createProjectDraw(data);
  const scope=new paper.PaperScope();scope.setup(new scope.Size(100,100));const renderer=createDrawRenderer(scope,state);renderer.render();
  t.after(()=>{renderer.destroy();scope.remove();});const before=renderer.bounds(node.id).clone();
  const group=textToOutlines(node);state.history.transaction('Create Outlines',()=>{state.history.execute(removeNode(node.id));state.history.execute(insertNode(data.layers[0].id,group));});renderer.render();
  const after=renderer.bounds(node.id);assert.ok(before.equals(after),'Visible bounds are unchanged within Paper precision');
  assert.equal(group.opacity,.4);assert.deepEqual(group.children[0].children[0].appearance,node.appearance);
  const cut=artboardCutSvg(state.document,data.artboards[0].id,{bounds:id=>renderer.bounds(id),worldMatrix:id=>renderer.worldMatrix(id),subpaths:id=>state.document.getNode(id).subpaths});
  assert.equal(cut.count,1);assert.deepEqual(cut.warnings,[]);assert.match(cut.svg,/<path/);
  state.history.undo();assert.equal(state.document.getNode(node.id).type,'text');assert.equal(hasTextLayout(state.document.getNode(node.id)),true);
  state.history.redo();assert.equal(state.document.getNode(node.id).type,'group');
});
test('stale, malformed and future layout caches are rejected instead of exporting old glyphs',()=>{
  const n=sample(),d=createDocument();d.layers[0].children=[n];assert.deepEqual(validateDocument(d),[]);
  n.character=Object.fromEntries(Object.entries(n.character).reverse());assert.equal(hasTextLayout(n),true,'JSON key order does not change glyph identity');
  n.content.runs[0].text='B';assert.equal(hasTextLayout(n),false);assert.equal(textSubpaths(n),null);assert.throws(()=>textToOutlines(n),/Resolve/);
  assert.ok(validateDocument(d).some(e=>e.path.endsWith('.signature')));
  n.content.runs[0].text='A';n.layout.glyphs[0].subpaths[0].segments[0].p[0]=NaN;assert.ok(validateDocument(d).length);
  n.layout.glyphs[0].subpaths[0].segments[0].p[0]=0;n.layout.version=99;assert.ok(validateDocument(d).some(e=>e.path.endsWith('.version')));
});
test('live text previews retain multiple fills and parent opacity, including from Outline view',t=>{
  const node=sample();node.appearance.fills.push({...structuredClone(node.appearance.fills[0]),opacity:.3});
  const data=createDocument();data.layers[0].opacity=.25;data.layers[0].children=[node];
  const state=createProjectDraw(data),scope=new paper.PaperScope();scope.setup(new scope.Size(100,100));
  const renderer=createDrawRenderer(scope,state);renderer.render();renderer.setOutline(true);t.after(()=>{renderer.destroy();scope.remove();});
  renderer.previewText(node,data.layers[0].id);
  const preview=scope.project.getItems({class:scope.Group,match:g=>g.opacity===.25&&g.children.length===2&&g.children[0].className==='CompoundPath'&&g.children[1].children?.length===2}).find(g=>g!==renderer.items.get(data.layers[0].id));
  assert.ok(preview);assert.equal(preview.children[1].children[1].fillColor.alpha,.3);
  assert.equal(renderer.items.get(node.id).visible,false);renderer.previewText(null);assert.equal(renderer.items.get(node.id).visible,true);
  renderer.setOutline(false);
  const paintItems=()=>scope.project.getItems({match:item=>item.data.nodeId===node.id}).length,before=paintItems();
  const next=structuredClone(node);next.character.fontSize=36;next.layout.signature=textSignature(next);
  state.history.execute(updateNode(node.id,{character:next.character,layout:next.layout}));renderer.render();
  assert.equal(paintItems(),before,'Rebuilding edited text removes its previous appearance stack');
});
