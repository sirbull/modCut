import test from 'node:test';
import assert from 'node:assert/strict';
import { withLaserAppearance, laserPreviewIntent } from '../view/laser-preview.mjs';
import { DrawDocument } from '../doc/document.mjs';
import { createNode,createDocument } from '../doc/schema.mjs';
import { appearance } from '../geometry.mjs';
const path=()=>({className:'Path',data:{nodeId:'p'},fillColor:'#00ff00',strokeColor:'#0000ff',strokeWidth:2,strokeScaling:true,dashArray:[4,2],opacity:.5,blendMode:'multiply',visible:true});
const resolved=operation=>({status:'resolved',operation});
test('Cut and Score use distinct red centre lines at every zoom and restore original view state',()=>{
  for(const operation of ['Cut','Score'])for(const zoom of [.5,2,8]){
    const item=path(),before=structuredClone(item);
    withLaserAppearance(item,{resolve:()=>resolved(operation),zoom},()=>{
      assert.equal(item.fillColor,null);assert.equal(item.strokeColor,'#C5221F');assert.equal(item.strokeWidth,1.5);assert.equal(item.strokeScaling,false);
      assert.equal(item.dashArray.length,operation==='Cut'?0:2);assert.equal(item.opacity,1);
    });
    // Paper style properties absent from the fixture become undefined after restore.
    for(const [key,value] of Object.entries(before))assert.deepEqual(item[key],value,key);
  }
});
test('engraving follows the painted vector silhouette, with no colour-layer darkness assumption',()=>{
  const item=path();
  withLaserAppearance(item,{resolve:()=>resolved('Engrave'),zoom:2},()=>{
    assert.equal(item.fillColor,'#000000');assert.equal(item.strokeColor,'#000000');assert.equal(item.strokeWidth,2);assert.deepEqual(item.dashArray,[4,2]);
  });
  assert.equal(item.fillColor,'#00ff00');
});
test('exceptions restore styles, visibility, dash arrays and raster draw function',()=>{
  const item=path(),dash=item.dashArray;
  assert.throws(()=>withLaserAppearance(item,{resolve:()=>resolved('Cut'),zoom:1},()=>{throw Error('draw failed');}),/draw failed/);
  assert.equal(item.fillColor,'#00ff00');assert.equal(item.dashArray,dash);
  const original=function(ctx){assert.equal(ctx.filter,'grayscale(1)');throw Error('raster failed');},raster={className:'Raster',data:{nodeId:'p'},draw:original};
  let restored=false;const ctx={save(){},restore(){restored=true;},filter:'none'};
  assert.throws(()=>withLaserAppearance(raster,{resolve:()=>resolved('Engrave'),zoom:1},()=>raster.draw(ctx)),/raster failed/);
  assert.equal(raster.draw,original);assert.equal(restored,true);
});
test('unresolved has a dotted warning outline; excluded and reference artwork cannot look like output',()=>{
  const item=path();
  withLaserAppearance(item,{resolve:()=>({status:'unresolved'}),zoom:1},()=>{assert.equal(item.strokeColor,'#965300');assert.equal(item.fillColor,null);assert.deepEqual(item.dashArray,[2,3]);});
  withLaserAppearance(item,{resolve:()=>({status:'excluded'}),zoom:1},()=>assert.equal(item.visible,false));
  withLaserAppearance(item,{resolve:()=>({status:'reference'}),zoom:1},()=>assert.equal(item.opacity,.18));
  assert.equal(item.visible,true);assert.equal(item.opacity,.5);
});
test('cut projections hide paint stacks and arrows and preserve clipping masks',()=>{
  const base=path(),arrow=path(),mask={...path(),clipMask:true};
  const root={className:'Group',data:{},children:[base,arrow,mask]},roles=new Map([[arrow,{role:'arrows',id:'p'}]]);
  withLaserAppearance(root,{resolve:()=>resolved('Cut'),zoom:1,roles},()=>{assert.equal(arrow.visible,false);assert.equal(base.strokeColor,'#C5221F');assert.equal(mask.fillColor,'#00ff00');});
  assert.equal(arrow.visible,true);
});
const square=[{closed:true,segments:[[0,0],[10,0],[10,10]].map(p=>({p,in:[0,0],out:[0,0]}))}];
function fixture(props={},layerProps={}){
  const node=createNode('path',{id:'p',subpaths:square,appearance:appearance('#00FF00',null),...props});
  const doc=new DrawDocument(createDocument({layers:[createNode('layer',{children:[node],...layerProps})]}));
  return {doc,snapshot:{mappingMode:'color',layers:[{color:'#00ff00',key:'vector:#00ff00',op:'Cut',output:true,raster:false}]}};
}
test('policy uses actual process settings and keeps advanced output unresolved',()=>{
  const {doc,snapshot}=fixture();assert.equal(laserPreviewIntent(doc,'p',snapshot).operation,'Cut');
  assert.equal(laserPreviewIntent(doc,'p',null).status,'unresolved');
  const fx=fixture({appearance:{...appearance('#00FF00',null),effects:[{type:'zigzag',size:1,ridges:4,points:'corner'}]}});
  assert.equal(laserPreviewIntent(fx.doc,'p',fx.snapshot).reason,'expand-appearance');
  const hidden=fixture({visible:false});assert.equal(laserPreviewIntent(hidden.doc,'p',hidden.snapshot).reason,'hidden');
  const template=fixture({},{template:true});assert.equal(laserPreviewIntent(template.doc,'p',template.snapshot).status,'reference');
});
