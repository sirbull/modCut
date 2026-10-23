import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {wait} from './cdp.mjs';
import {activeDraw as active,enterDraw,submitNewDrawDialog,rememberTabs} from './draw-test-helpers.mjs';

export async function runDrawLaserClippingWorkflows(client){
  const {evaluate}=client,restore=await rememberTabs(evaluate);
  const until=async(expr,label)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await wait(50);}assert.fail(label);};
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:80,height:75,name:'Laser clipping proof'});
  await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNodes,updateDocument}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs'),b=w.state.document.data.artboards[0];
    const rect=(id,x,y,width,height,look)=>createNode('shape',{id,shape:'rect',params:{x:b.x+x,y:b.y+y,width,height},appearance:look});
    const mask=(id,x,y,width,height)=>rect(id,x,y,width,height,appearance(null,null));
    const image=document.createElement('canvas');image.width=16;image.height=16;image.getContext('2d').fillStyle='#ff0000';image.getContext('2d').fillRect(0,0,16,16);
    w.state.history.execute(updateDocument({assets:{clipImage:{mimeType:'image/png',data:image.toDataURL().split(',')[1],width:16,height:16}}}));
    w.state.history.execute(insertNodes([
      [w.layerId(),createNode('group',{clip:true,children:[createNode('path',{id:'clipped-stroke',subpaths:[{closed:false,segments:[[b.x+10,b.y+15],[b.x+45,b.y+15]].map(p=>({p,in:[0,0],out:[0,0]}))}],appearance:appearance(null,'#3366CC',2)}),mask('stroke-mask',20,14.5,15,1)]})],
      [w.layerId(),createNode('group',{clip:true,children:[rect('clipped-fill',10,30,30,15,appearance('#33AA66',null)),mask('fill-mask',20,32,12,8)]})],
      [w.layerId(),createNode('group',{clip:true,children:[createNode('image',{id:'clipped-image',assetId:'clipImage',width:30,height:15,transform:[1,0,0,1,b.x+15,b.y+50]}),mask('image-mask',25,52,10,8)]})],
    ]));for(let i=0;i<100&&!w.renderer.items.get('clipped-image')?.loaded;i++)await new Promise(r=>setTimeout(r,10));w.select([]);w.fit();
  })()`);
  await evaluate(`(async()=>${active}.handle('laser-processes'))()`);
  await until("!!document.querySelector('.draw-laser-processes-dialog')",'clipping process setup');
  await evaluate("(()=>{const f=document.querySelector('.draw-laser-processes-dialog form');for(const s of f.querySelectorAll('select'))s.value='Engrave';f.requestSubmit();})()");
  await evaluate(`(async()=>{const w=${active};window.__clipBefore={doc:w.state.document.serialize(),history:JSON.stringify(w.state.history.entries)};})()`);
  if(!await evaluate(`(async()=>${active}.renderer.laserPreview)()`)){
    await evaluate(`(async()=>${active}.handle('laser-preview'))()`);
    if(await evaluate("!!document.querySelector('.draw-cut-preview-dialog')"))await evaluate("document.querySelector('.draw-cut-preview-dialog form').requestSubmit()");
  }
  const view=await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0];w.withScope(()=>{w.scope.view._needsUpdate=true;w.scope.view.update();});
    const sample=(x,y)=>{const p=w.scope.view.projectToView(new w.scope.Point(b.x+x,b.y+y)),r=w.scope.view.pixelRatio;return [...w.scope.view.element.getContext('2d').getImageData(Math.round(p.x*r),Math.round(p.y*r),1,1).data].slice(0,3);};
    return {intents:['clipped-stroke','clipped-fill','clipped-image'].map(id=>({status:w.renderer.laserIntent(id).status,reason:w.renderer.laserIntent(id).reason})),inside:sample(25,36),outside:sample(18,36),neutral:w.state.document.serialize()===window.__clipBefore.doc&&JSON.stringify(w.state.history.entries)===window.__clipBefore.history};})()`);
  assert.equal(view.intents[0].reason,'clipped-stroke-transfer');assert.equal(view.intents[1].status,'resolved');assert.equal(view.intents[2].reason,'clipped-image-transfer');
  assert.ok(view.inside.every(v=>v<20),JSON.stringify(view));assert.ok(view.outside.every(v=>v>245),JSON.stringify(view));assert.equal(view.neutral,true);
  await evaluate("document.querySelector('.draw-laser-legend button').click()");
  const advice=await evaluate("document.querySelector('.draw-laser-issues-list').textContent");
  assert.match(advice,/whole image outside its clipping mask/);assert.match(advice,/Engraving can extend outside the mask/);
  const screenshot=await client.command('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/modcut-laser-clipping.png',Buffer.from(screenshot.data,'base64'));
  await evaluate("document.querySelector('.draw-laser-issues-dialog form').requestSubmit()");
  await evaluate("document.querySelector('#sendToCut').click()");
  await until("!!document.querySelector('.draw-send-dialog form')",'clipped image transfer warning');
  assert.match(await evaluate("document.querySelector('[data-draw-send-summary]').textContent"),/sent whole/);
  await evaluate("document.querySelector('.draw-send-dialog form').requestSubmit()");
  await until("document.body.dataset.workspace==='cut' && paper.project.layers[1].children.length===3",'actual clipping import');
  const output=await evaluate("(()=>{const items=paper.project.layers[1].children,s=items.find(i=>i.strokeColor?.toCSS(true)==='#3366cc'),f=items.find(i=>i.fillColor?.toCSS(true)==='#33aa66'),r=items.find(i=>i.className==='Raster'),box=i=>[i.bounds.x,i.bounds.y,i.bounds.width,i.bounds.height];return {stroke:box(s),strokeHeight:s.strokeBounds.height,fill:box(f),image:box(r)};})()");
  const near=(actual,expected)=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<.01,JSON.stringify(output)));
  near(output.stroke,[20,15,15,0]);assert.ok(Math.abs(output.strokeHeight-2)<.01,'2 mm engraving extends past the 1 mm clipping mask');
  near(output.fill,[20,32,12,8]);near(output.image,[15,50,30,15]);
  await evaluate('delete window.__clipBefore');await restore();
  process.stdout.write('PASS Laser Preview clipping: filled vector pixels and actual clipped Cut geometry, explicit stroke-width and whole-image limitations, actionable object advice and document/history neutrality\n');
}
