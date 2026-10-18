import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import { wait,inputHelpers } from './cdp.mjs';
import { activeDraw as active,enterDraw,submitNewDrawDialog,rememberTabs } from './draw-test-helpers.mjs';
export async function runDrawLaserPreviewWorkflows(client){
  const {evaluate}=client,restoreTabs=await rememberTabs(evaluate);
  const until=async(expr,label)=>{for(let i=0;i<120;i++){if(await evaluate(expr))return;await wait(50);}assert.fail(label);};
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:140,height:90,name:'Laser Preview proof'});
  await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNodes,updateNode,updateDocument}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],square=(x,y)=>[{closed:true,segments:[[x,y],[x+15,y],[x+15,y+15],[x,y+15]].map(p=>({p,in:[0,0],out:[0,0]}))}];
    w.state.history.execute(insertNodes(['#FF0000','#00FF00','#0000FF'].map((c,i)=>[w.layerId(),createNode('path',{id:'laser-'+i,subpaths:square(b.x+12+i*35,b.y+25),appearance:appearance(c,c,1)})])));
    const image=document.createElement('canvas');image.width=16;image.height=16;image.getContext('2d').fillStyle='#ff0000';image.getContext('2d').fillRect(0,0,16,16);
    w.state.history.execute(updateDocument({assets:{...w.state.document.data.assets,laserImage:{mimeType:'image/png',data:image.toDataURL('image/png').split(',')[1],width:16,height:16}}}));
    w.state.history.execute(insertNodes([[w.layerId(),createNode('image',{id:'laser-image',assetId:'laserImage',width:20,height:15,opacity:.4,transform:[1,0,0,1,b.x+12,b.y+55]})]]));
    for(let i=0;i<100&&!w.renderer.items.get('laser-image')?.loaded;i++)await new Promise(r=>setTimeout(r,10));
    w.state.history.execute(updateNode(w.layerId(),{preview:false}));
    w.select([]);w.fit();window.__laserBefore={document:w.state.document.serialize(),entries:w.state.history.entries.length,dirty:w.state.dirty,svg:w.cutSvg(b.id).svg};
    localStorage.setItem('modcut_preferences',JSON.stringify({...JSON.parse(localStorage.getItem('modcut_preferences')||'{}'),hideLaserPreviewIntro:false}));
  })()`);
  // Preferences are live in the app, so use the actual Preferences control to reset suppression.
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',code:'KeyK',ctrlKey:!/Mac/.test(navigator.platform),metaKey:/Mac/.test(navigator.platform),bubbles:true,cancelable:true}))");
  await until("!!document.querySelector('.preferences-modal')",'preferences');
  await evaluate("(()=>{const f=document.querySelector('.preferences-modal form'),i=f.elements.hideLaserPreviewIntro;if(i.checked)i.click();f.querySelector('[type=submit]').click();})()");
  await evaluate("window.modcut.clickE2EMenuItem('View','Laser Preview')");
  await until("!!document.querySelector('.draw-cut-preview-dialog')",'first activation explanation');
  await evaluate("document.querySelector('.draw-cut-preview-dialog [data-x=cancel]').click()");
  assert.equal(await evaluate(`(async()=>${active}.renderer.laserPreview)()`),false,'Cancel keeps normal view');
  assert.equal(await evaluate('(async()=>(await window.modcut.getE2EWorkspaceMenu()).laserPreviewChecked)()'),false,'native checkbox follows Cancel');
  await evaluate(`(async()=>(${active}.handle('laser-preview')))()`);
  await until("!!document.querySelector('.draw-cut-preview-dialog')",'explanation repeats');
  await evaluate("document.querySelector('.draw-cut-preview-dialog form').requestSubmit()");
  await until(`(async()=>${active}.renderer.laserPreview)()`,'preview enabled');
  assert.equal(await evaluate(`(async()=>${active}.renderer.laserIntent('laser-0').status)()`),'unresolved');
  await evaluate(`(async()=>(${active}.handle('laser-preview')))()`);
  await evaluate(`(async()=>(${active}.handle('laser-preview')))()`);
  await until("!!document.querySelector('.draw-cut-preview-dialog')",'unchecked explanation repeats again');
  await evaluate("(()=>{const f=document.querySelector('.draw-cut-preview-dialog form');f.elements.hide.click();f.requestSubmit();})()");
  await until(`(async()=>${active}.renderer.laserPreview)()`,'enabled with remember');
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('modcut_preferences')).hideLaserPreviewIntro"),true);
  await evaluate(`(async()=>(${active}.handle('laser-processes')))()`);
  await until("!!document.querySelector('.draw-laser-processes-dialog')",'process dialog');
  await evaluate("(()=>{const f=document.querySelector('.draw-laser-processes-dialog form');f.elements.process0.value='Cut';f.elements.process1.value='Score';f.elements.process2.value='Engrave';f.elements.process3.value='Engrave';f.requestSubmit();})()");
  await until(`(async()=>${active}.renderer.laserIntent('laser-0').status==='resolved')()`,'configured process');
  assert.deepEqual(await evaluate(`(async()=>{const w=${active};return [0,1,2].map(i=>w.renderer.laserIntent('laser-'+i).operation);})()`),['Cut','Score','Engrave']);
  // Verify actual rendered pixels rather than only flags. Original Paper paint must survive each draw.
  const pixels=await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0];
    w.withScope(()=>{w.scope.view._needsUpdate=true;w.scope.view.update();});
    const c=w.scope.view.element,g=c.getContext('2d'),ratio=w.scope.view.pixelRatio;
    const sample=(x,y)=>{const p=w.scope.view.projectToView(new w.scope.Point(x,y));return [...g.getImageData(Math.round(p.x*ratio),Math.round(p.y*ratio),1,1).data].slice(0,3);};
    const redNear=(x,y)=>{const p=w.scope.view.projectToView(new w.scope.Point(x,y));const d=g.getImageData(Math.round(p.x*ratio)-3,Math.round(p.y*ratio)-3,7,7).data;for(let i=0;i<d.length;i+=4)if(d[i]>120&&d[i+1]<90&&d[i+2]<90)return true;return false;};
    return {imageGray:sample(b.x+20,b.y+62),originalImage:w.renderer.items.get('laser-image').getPixel(0,0).toCSS(true),imageOpacity:w.renderer.items.get('laser-image').opacity,cutInterior:sample(b.x+18,b.y+32),cutRed:redNear(b.x+12,b.y+30),engrave:sample(b.x+88,b.y+32),source:w.renderer.items.get('laser-0').fillColor.toCSS(true),
      document:w.state.document.serialize()===window.__laserBefore.document,history:w.state.history.entries.length===window.__laserBefore.entries,dirty:w.state.dirty===window.__laserBefore.dirty,
      svg:w.cutSvg(b.id).svg===window.__laserBefore.svg};})()`);
  assert.ok(pixels.cutInterior.every(v=>v>245),JSON.stringify(pixels));assert.equal(pixels.cutRed,true,JSON.stringify(pixels));assert.ok(pixels.engrave.every(v=>v<20),JSON.stringify(pixels));
  assert.ok(await evaluate(`(async()=>${active}.scope.project.layers[2].children.length<10)()`),'preference changes cannot insert Cut grids into Draw');
  const shot=await client.command('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/modcut-laser-preview.png',Buffer.from(shot.data,'base64'));
  assert.ok(pixels.imageGray[0]>10&&pixels.imageGray[0]<245&&Math.max(...pixels.imageGray)-Math.min(...pixels.imageGray)<3,JSON.stringify(pixels));assert.equal(pixels.originalImage,'#ff0000');assert.equal(pixels.imageOpacity,.4);
  assert.equal(pixels.source,'#ff0000');assert.equal(pixels.document,true);assert.equal(pixels.history,true);assert.equal(pixels.dirty,true);assert.equal(pixels.svg,true);
  // A real drawing gesture remains live and commits exactly once while preview is on.
  const gesture=await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],r=w.scope.view.element.getBoundingClientRect(),point=(x,y)=>{const p=w.scope.view.projectToView(new w.scope.Point(x,y));return {x:r.x+p.x,y:r.y+p.y};};w.setTool('rectangle');return {start:point(b.x+112,b.y+55),end:point(b.x+127,b.y+70),entries:w.state.history.entries.length};})()`);
  const input=inputHelpers(client);await input.mouse('mousePressed',gesture.start,{buttons:1});await input.mouse('mouseMoved',gesture.end,{buttons:1});
  assert.equal(await evaluate(`(async()=>${active}.state.history.entries.length)()`),gesture.entries,'gesture preview does not write history');
  await input.mouse('mouseReleased',gesture.end);
  assert.equal(await evaluate(`(async()=>${active}.state.history.entries.length)()`),gesture.entries+1,'one gesture, one undo step');
  await evaluate(`(async()=>{const w=${active};w.handle('undo');w.select([]);w.setTool('select');})()`);
  await evaluate(`(async()=>(${active}.handle('outline')))()`);
  assert.deepEqual(await evaluate(`(async()=>{const w=${active};return [w.renderer.outline,w.renderer.laserPreview];})()`),[true,false]);
  await evaluate(`(async()=>(${active}.handle('laser-preview')))()`);
  await until(`(async()=>${active}.renderer.laserPreview)()`,'suppression skips dialog');
  assert.equal(await evaluate("!!document.querySelector('.draw-cut-preview-dialog')"),false);
  await evaluate(`(async()=>(${active}.handle('laser-preview')))()`);
  assert.equal(await evaluate(`(async()=>${active}.renderer.outline)()`),true,'previous Outline restored');
  await evaluate(`(async()=>(${active}.handle('outline')))()`);
  // Native menu routes to the same action.
  await evaluate("window.modcut.clickE2EMenuItem('View','Laser Preview')");
  await until(`(async()=>${active}.renderer.laserPreview)()`,'native menu');
  await evaluate(`(async()=>(${active}.handle('laser-preview-help')))()`);
  await until("!!document.querySelector('.draw-cut-preview-dialog')",'Help reopens explanation');
  await evaluate("document.querySelector('.draw-cut-preview-dialog [data-x=cancel]').click()");
  // File reopening and switching tabs must not discard configured processes while Cut is empty.
  const originalTab=await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const project=await evaluate(`(async()=>{const w=${active};return {app:'modCut',version:4,workspace:'draw',mappingMode:'color',filename:'laser-roundtrip',design:paper.project.layers[1].exportJSON({asString:true}),draw:w.state.snapshot(),layers:[...([0,1,2].map(i=>w.renderer.laserIntent('laser-'+i).layer)),w.renderer.laserIntent('laser-image').layer]};})()`);
  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify({kind:'document',name:'laser-roundtrip.modcut',path:'/tmp/laser-roundtrip.modcut',text:JSON.stringify(project)})})`);
  await evaluate("document.querySelector('#import').click()");
  await until(`document.querySelector('.doc-tab.is-active').dataset.tabId!==${JSON.stringify(originalTab)}`,'roundtrip opens');
  await until(`(async()=>!!${active})()`,'roundtrip Draw mounts');
  assert.deepEqual(await evaluate(`(async()=>{const w=${active};return [0,1,2].map(i=>w.renderer.laserIntent('laser-'+i).operation);})()`),['Cut','Score','Engrave'],'process choices survive file loading before Send to Cut');
  const importedTab=await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  await evaluate(`document.querySelector('.doc-tab[data-tab-id="${originalTab}"]').click()`);
  await until(`document.querySelector('.doc-tab.is-active').dataset.tabId===${JSON.stringify(originalTab)}`,'original tab');
  assert.equal(await evaluate(`(async()=>${active}.renderer.laserIntent('laser-1').operation)()`),'Score');
  await evaluate(`(async()=>(${active}.handle('laser-preview')))()`);
  assert.equal(await evaluate(`(async()=>${active}.renderer.laserPreview)()`),false);
  await evaluate(`document.querySelector('.doc-tab[data-tab-id="${importedTab}"]').click()`);
  await until(`document.querySelector('.doc-tab.is-active').dataset.tabId===${JSON.stringify(importedTab)}`,'imported tab');
  assert.equal(await evaluate(`(async()=>${active}.renderer.laserPreview)()`),true,'each tab retains its own view');
  await evaluate(`(async()=>{const w=${active};w.handle('laser-preview');w.handle('laser-preview');})()`);
  // Process setup is an explicit Cut change; toggling alone was already proved document-neutral.
  await restoreTabs();
  process.stdout.write('PASS Laser Preview: intro/cancel/suppression, actual Cut/Score/Engrave processes, red and black pixels, original styles/document/history/output, Outline restore and native menu\n');
}

export async function verifyLaserPreviewPreferences(client){
  const {evaluate}=client;
  for(let i=0;i<100&&!(await evaluate("!!document.querySelector('.doc-tab.is-active')"));i++)await wait(50);
  const prefs=await evaluate("JSON.parse(localStorage.getItem('modcut_preferences'))");
  assert.equal(prefs.hideLaserPreviewIntro,true);assert.equal(prefs.laserPreviewEnabled,true);
  await enterDraw(evaluate);
  assert.equal(await evaluate(`(async()=>${active}.renderer.laserPreview)()`),true,'remembered view after actual app restart');
  assert.equal(await evaluate("!!document.querySelector('.draw-cut-preview-dialog')"),false);
  process.stdout.write('PASS Laser Preview: view preference and suppressed explanation survive an actual app restart\n');
}
