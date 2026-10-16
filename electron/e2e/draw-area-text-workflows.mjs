import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

export async function runDrawAreaTextWorkflows(client) {
  const {evaluate,command}=client,{mouse,key,click}=inputHelpers(client),restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:100,name:'Area text proof'});
  const at=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const snapshot=()=>evaluate(`(async()=>(${active}.state.document.serialize()))()`);
  const ready=async()=>{for(let i=0;i<200;i++){if(await evaluate("document.querySelector('.draw-text-dialog form')?.dataset.textReady==='true'"))return;await wait(50);}assert.fail(await evaluate("document.querySelector('.draw-text-dialog [role=alert]')?.textContent||'Area text did not resolve'"));};
  const set=async values=>{await evaluate(`(()=>{const f=document.querySelector('.draw-text-dialog form');for(const [key,value] of Object.entries(${JSON.stringify(values)}))f.elements[key].value=value;f.dispatchEvent(new Event('input',{bubbles:true}));})()`);await ready();};
  const apply=async()=>{await evaluate("document.querySelector('.draw-text-dialog form').requestSubmit()");await wait(70);};
  const edit=async()=>{await evaluate(`(async()=>{${active}.handle('edit-text')})()`);await ready();};
  const before=await snapshot(),start=await at(12,12),end=await at(57,75);
  await key('t');await mouse('mouseMoved',start);await mouse('mousePressed',start,{buttons:1});await mouse('mouseMoved',end,{buttons:1});
  assert.equal(await snapshot(),before,'Drawing the frame does not mutate the document');
  assert.ok(await evaluate(`(async()=>{const w=${active};return w.scope.project.getItems({match:i=>i.data.textFrame}).some(i=>i.bounds.width>40&&i.bounds.height>60)})()`),'A live frame is visible before pointer release');
  assert.notEqual(await evaluate(`(async()=>(${active}.scope.view.element.style.cursor))()`),'none');
  await mouse('mouseReleased',end);await ready();
  assert.match(await evaluate("document.querySelector('.draw-text-dialog').textContent"),/Area Text/);
  await set({text:'Horten ÆØÅ og modCut med automatisk linjebryting.\nAndre avsnitt.',fontSize:18,leading:22,frameWidth:45,frameHeight:63});
  assert.equal(await snapshot(),before,'Live text wrapping remains a detached preview');
  let proof=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'modcut-draw-area-text-preview.png'),Buffer.from(proof.data,'base64'));
  await apply();
  const node=await evaluate(`(async()=>{const w=${active};return w.state.document.getNode(w.state.selection.ids[0])})()`);
  assert.equal(node.kind,'area');assert.deepEqual(node.frame,{width:45,height:63});assert.equal(node.layout.overflow,false);assert.ok(node.layout.lineWidths.length>2);
  assert.ok(node.layout.lineWidths.every(w=>w<=45+1e-8));
  assert.equal(await evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`),1);
  const saved=await snapshot();await evaluate(`(async()=>{${active}.handle('undo')})()`);assert.equal(await snapshot(),before);
  await evaluate(`(async()=>{const w=${active};w.handle('redo');w.select(['${node.id}'])})()`);assert.equal(await snapshot(),saved);
  await edit();await set({frameWidth:85,frameHeight:1});
  assert.match(await evaluate("document.querySelector('.draw-text-dialog [role=alert]').textContent"),/Text overflow/);
  assert.equal(await snapshot(),saved);await key('Escape');assert.equal(await snapshot(),saved,'Cancel restores the original frame and all glyphs');
  await edit();await set({frameHeight:1});await apply();
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${node.id}').layout.visibleLines))()`),0);
  assert.ok(await evaluate(`(async()=>{const w=${active};return w.scope.project.getItems({match:i=>i.data.textFrame&&i.data.textId==='${node.id}'}).some(i=>i.children.length===4)})()`),'Overset is marked with a red plus on the canvas');
  await evaluate(`(async()=>{${active}.handle('create-outlines')})()`);await wait(80);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${node.id}').type))()`),'text','Outlines never discard hidden overset text');
  assert.match(await evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' ')"),/overflows its frame/);
  // Empty frames can still be opened with Type. The lower corner contains no painted glyphs.
  await click(await at(52,12.5));await ready();assert.equal(await evaluate("document.querySelector('.draw-text-dialog form').elements.frameHeight.value"),'1');
  await set({frameWidth:85,frameHeight:63});await apply();
  assert.ok((await evaluate(`(async()=>(${active}.state.document.getNode('${node.id}').layout.lineWidths.length))()`))<node.layout.lineWidths.length,'A wider frame reflows the original text');
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${node.id}').content.runs[0].text))()`),node.content.runs[0].text);
  // Frame bounds and hit testing follow an affine parent, while export contains only the glyph artwork.
  await evaluate(`(async()=>{const w=${active},{updateNode}=await import('./draw/doc/commands.mjs'),layer=w.state.document.data.layers[0];w.state.history.execute(updateNode(layer.id,{transform:[1,.12,.08,1,4,3]}));w.select(['${node.id}']);w.setTool('area-type')})()`);
  assert.equal(await evaluate(`(async()=>(${active}.availableTool('area-type')) )()`),true);
  assert.ok(await evaluate(`(async()=>{const w=${active},p=w.renderer.pointToWorld('${node.id}',[80,60]);return w.renderer.hit(p)==='${node.id}'})()`),'Empty frame hit testing works under a transformed parent');
  assert.equal(await evaluate(`(async()=>{const w=${active},{createProjectDraw}=await import('./draw/io/project.mjs');return createProjectDraw(JSON.parse(w.state.document.serialize())).document.serialize()===w.state.document.serialize()})()`),true);
  const png=await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.ui.artboardId,'png',{ppi:72})})()`);
  const svg=await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.ui.artboardId,'svg')})()`);assert.doesNotMatch(svg,/<text[\s>]/);assert.match(svg,/<path[\s>]/);
  assert.doesNotMatch(svg,/visibility="hidden"/,'The invisible frame is omitted from SVG geometry');
  await evaluate(`(async()=>{${active}.handle('create-outlines')})()`);
  for(let i=0;i<100;i++){if(await evaluate(`(async()=>(${active}.state.document.getNode('${node.id}').type==='group'))()`))break;await wait(30);}
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${node.id}').type))()`),'group');
  const afterPng=await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.ui.artboardId,'png',{ppi:72})})()`);
  const difference=await evaluate(`(async()=>{const urls=${JSON.stringify([png,afterPng])},pixels=[];for(const url of urls){const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d');g.drawImage(image,0,0);pixels.push(g.getImageData(0,0,c.width,c.height).data);}let sum=0;for(let i=0;i<pixels[0].length;i++)sum+=Math.abs(pixels[0][i]-pixels[1][i]);return sum/pixels[0].length})()`);
  assert.ok(difference<.1,`Area glyphs and outlines agree in raster export (mean channel difference ${difference})`);
  assert.equal(await evaluate(`(async()=>{const w=${active};return w.cutSvg(w.state.ui.artboardId).warnings.length})()`),0);
  await evaluate(`(async()=>{${active}.handle('undo')})()`);
  proof=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'modcut-draw-area-text-frame.png'),Buffer.from(proof.data,'base64'));
  // Area Type also offers an exact-size dialog on click, and Escape cancels a live frame gesture.
  await click(await at(112,90));await ready();assert.equal(await evaluate("document.querySelector('.draw-text-dialog form').elements.frameWidth.value"),'60');await key('Escape');
  const unchanged=await snapshot();await mouse('mousePressed',await at(110,92),{buttons:1});await mouse('mouseMoved',await at(118,98),{buttons:1});await key('Escape');await mouse('mouseReleased',await at(118,98));
  assert.equal(await snapshot(),unchanged);assert.equal(await evaluate("!!document.querySelector('.draw-text-dialog')"),false);
  await restore();console.log('PASS Draw area text: live drag, shaped wrapping, frame editing/cancel, overset, affine parent, portable export, outlines, save/reload and undo');
}
