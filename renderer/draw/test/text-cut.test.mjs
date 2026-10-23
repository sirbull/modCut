import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { pointText,DEFAULT_CHARACTER,textToOutlines } from '../doc/text.mjs';
import { textSignature } from '../doc/text-layout.mjs';
import { createDocument,createNode } from '../doc/schema.mjs';
import { createProjectDraw } from '../io/project.mjs';
import { createDrawRenderer } from '../render.mjs';
import { artboardCutSvg } from '../io/cut-svg.mjs';
import { insertNode,removeNode } from '../doc/commands.mjs';

const contour=(x,y,size)=>({closed:true,segments:[[x,y],[x+size,y],[x+size,y+size],[x,y+size]].map(p=>({p,in:[0,0],out:[0,0]}))});
test('automatic Cut text is identical to manual outlines, preserves holes/transforms and leaves Draw untouched',t=>{
  const node=pointText([10,20],{...DEFAULT_CHARACTER,text:'AB',alignment:'left'});
  node.layout={version:1,signature:textSignature(node),font:{family:'Fixture',style:'Regular',postscriptName:'Fixture-Regular'},lineWidths:[20],glyphs:[
    {line:0,glyphId:1,subpaths:[contour(0,-10,8),{...contour(2,-8,4),segments:contour(2,-8,4).segments.reverse()}]},
    {line:0,glyphId:2,subpaths:[contour(12,-10,8)]}]};
  const parent=createNode('group',{transform:[1.1,.1,-.1,1.1,7,9],children:[node]}),data=createDocument();data.layers[0].children=[parent];
  const state=createProjectDraw(data),scope=new paper.PaperScope();scope.setup(new scope.Size(200,200));const renderer=createDrawRenderer(scope,state);renderer.render();t.after(()=>{renderer.destroy();scope.remove();});
  const geometry={bounds:id=>renderer.bounds(id),worldMatrix:id=>renderer.worldMatrix(id),subpaths:id=>state.document.getNode(id).subpaths,glyphBounds:(id,p)=>renderer.glyphBounds(id,p)};
  const before=state.document.serialize(),automatic=artboardCutSvg(state.document,data.artboards[0].id,geometry);
  assert.equal(automatic.textCount,1);assert.equal(automatic.count,2);assert.deepEqual(automatic.errors,[]);assert.doesNotMatch(automatic.svg,/<text/);assert.equal(state.document.serialize(),before);
  const outlined=textToOutlines(node);state.history.transaction('Outlines',()=>{state.history.execute(removeNode(node.id));state.history.execute(insertNode(parent.id,outlined));});renderer.render();
  const manual=artboardCutSvg(state.document,data.artboards[0].id,geometry);assert.equal(automatic.svg,manual.svg);
  state.history.undo();assert.equal(state.document.serialize(),before);renderer.render();
  const stale={...node,content:{runs:[{text:'Changed'}]}};
  const invalid=artboardCutSvg(state.document,data.artboards[0].id,{...geometry,resolvedText:()=>stale});assert.equal(invalid.count,0);assert.match(invalid.errors.join(' '),/resolved font/);
  const overset={...node,kind:'area',frame:{width:30,height:1},layout:{...node.layout,visibleLines:0,overflow:true,glyphs:[]}};overset.layout.signature=textSignature(overset);
  const overflow=artboardCutSvg(state.document,data.artboards[0].id,{...geometry,resolvedText:()=>overset});assert.equal(overflow.count,0);assert.match(overflow.errors.join(' '),/overflows/);
});
