import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

export async function runDrawGoogleFontWorkflows(client) {
  const {evaluate,command}=client,{click,key}=inputHelpers(client),restore=await rememberTabs(evaluate);
  const until=async expression=>{for(let i=0;i<1000;i++){if(await evaluate(expression))return;await wait(50);}assert.fail(await evaluate("document.querySelector('.draw-text-dialog [role=alert]')?.textContent||'Google Fonts did not become ready'"));};
  const ready=()=>until("document.querySelector('.draw-text-dialog form')?.dataset.textReady==='true'");
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");await submitNewDrawDialog(evaluate,{preset:'custom',width:140,height:100,name:'Google Fonts proof'});
  const tabId=await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const before=await evaluate(`(async()=>(${active}.state.document.serialize()))()`);
  await key('t');await click(await evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(15,30)),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`));await ready();
  await evaluate("(()=>{const f=document.querySelector('.draw-text-dialog form');f.elements.fontSource.value='google';f.elements.fontSource.dispatchEvent(new Event('change',{bubbles:true}));})()");await ready();
  assert.equal(await evaluate("document.querySelectorAll('.draw-text-dialog datalist option').length")>=1900,true);
  assert.ok(await evaluate("!!document.querySelector('[data-font-axis=wdth]')&&!!document.querySelector('[data-font-axis=wght]')"));
  await evaluate(`(()=>{const f=document.querySelector('.draw-text-dialog form');f.elements.text.value=${JSON.stringify('AV fi ÆØÅ æøå')};f.elements.fontWeight.value='600';f.querySelector('[data-font-axis=wdth]').value='80';f.dispatchEvent(new Event('input',{bubbles:true}));})()`);await ready();
  await evaluate("(()=>{const f=document.querySelector('.draw-text-dialog form');f.querySelector('[data-font-axis=wght]').value='650';f.dispatchEvent(new Event('input',{bubbles:true}));})()");await ready();
  assert.equal(await evaluate(`(async()=>(${active}.state.document.serialize()))()`),before);
  assert.match(await evaluate("document.querySelector('.draw-font-options pre').textContent"),/OPEN FONT LICENSE/);
  const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'modcut-google-fonts-preview.png'),Buffer.from(shot.data,'base64'));
  await evaluate("document.querySelector('.draw-text-dialog form').requestSubmit()");await wait(100);
  const node=await evaluate(`(async()=>{const w=${active};return w.state.document.getNode(w.state.selection.ids[0])})()`);
  assert.equal(node.character.fontSource,'google');assert.equal(node.character.fontFamily,'Roboto');assert.equal(node.character.fontAxes.wght,650);assert.equal(node.character.fontAxes.wdth,80);assert.match(node.character.googleFont.sha256,/^[a-f0-9]{64}$/);
  const model=await evaluate(`(async()=>(${active}.state.document.serialize()))()`);
  assert.equal(await evaluate(`(async()=>{const w=${active},{createProjectDraw}=await import('./draw/io/project.mjs');return createProjectDraw(JSON.parse(w.state.document.serialize())).document.serialize()===w.state.document.serialize()})()`),true);
  const comparison=await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('${node.id}'),{textValues}=await import('./draw/doc/text.mjs'),v=textValues(n);const thin=await window.modcut.shapeText({...v,fontAxes:{...v.fontAxes,wght:100}});return JSON.stringify(thin.glyphs)!==JSON.stringify(n.layout.glyphs)})()`);assert.equal(comparison,true,'Variable weight changes actual contours');
  const automatic=await evaluate(`(async()=>{const w=${active};return w.cutSvg(w.state.ui.artboardId)})()`);assert.equal(automatic.textCount,1);assert.ok(automatic.count>0);assert.deepEqual(automatic.errors,[]);
  // Explicit outlines remain available and produce exactly the same laser geometry.
  await evaluate(`(async()=>{${active}.handle('create-outlines')})()`);await until(`(async()=>(${active}.state.document.getNode('${node.id}').type==='group'))()`);
  assert.equal(await evaluate(`(async()=>{const w=${active};return w.cutSvg(w.state.ui.artboardId).svg})()`),automatic.svg);
  await evaluate(`(async()=>{${active}.handle('undo')})()`);assert.equal(await evaluate(`(async()=>(${active}.state.document.serialize()))()`),model);
  // An empty Cut with one artboard receives the artwork directly; the text goes as outlines without changing Draw.
  await evaluate(`(async()=>{${active}.handle('send-to-cut')})()`);await until("document.body.dataset.workspace==='cut'");
  assert.ok(await evaluate("paper.project.layers[1].children.length>0&&paper.project.layers[1].children.every(i=>i.className==='Path'||i.className==='CompoundPath')"),'Cut receives actual editable vector paths');
  await evaluate(`document.querySelector('.doc-tab[data-tab-id="${tabId}"]').click()`);await enterDraw(evaluate);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.serialize()))()`),model,'Sending leaves editable Google text and Draw history unchanged');
  // Static four-style family, including a family whose repository folder lacks a license file.
  const staticFont=await evaluate("window.modcut.googleFontFamily('Tinos')");assert.equal(staticFont.faces.length,4);
  const italic=await evaluate(`window.modcut.shapeText({text:'AV fi ÆØÅ',fontSource:'google',fontFamily:'Tinos',fontSize:24,leading:28.8,fontWeight:700,fontStyle:'italic',alignment:'left'})`);assert.match(italic.font.postscriptName,/BoldItalic/i);assert.ok(italic.glyphs.length);
  const legacyModel=await evaluate(`(async()=>{const w=${active},{pointText,DEFAULT_CHARACTER}=await import('./draw/doc/text.mjs'),{insertNode}=await import('./draw/doc/commands.mjs');
    const n=pointText([15,60],{...DEFAULT_CHARACTER,text:'Legacy',fontSource:'google',fontFamily:'Tinos',alignment:'left'});w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.handle('send-to-cut');return w.state.document.serialize()})()`);
  await until("!!document.querySelector('.draw-send-dialog')");assert.equal(await evaluate("document.querySelector('.draw-send-dialog [type=submit]').disabled"),false);
  assert.match(await evaluate("document.querySelector('[data-draw-send-summary]').textContent"),/2 text objects/);await key('Escape');
  assert.equal(await evaluate(`(async()=>(${active}.state.document.serialize()))()`),legacyModel,'Legacy layout is resolved temporarily without changing the model');
  await evaluate(`(async()=>{const w=${active},{pointText,DEFAULT_CHARACTER}=await import('./draw/doc/text.mjs'),{insertNode}=await import('./draw/doc/commands.mjs');w.state.history.execute(insertNode(w.state.document.data.layers[0].id,pointText([15,75],{...DEFAULT_CHARACTER,text:'Missing',fontFamily:'modCut Nonexistent Test Font',alignment:'left'})));w.handle('send-to-cut')})()`);
  await until("!!document.querySelector('.draw-send-dialog')");assert.equal(await evaluate("document.querySelector('.draw-send-dialog [type=submit]').disabled"),true,'A missing text font blocks sending even when other paths are valid');await key('Escape');
  await restore();console.log('PASS Google Fonts: full catalog, real download/license, variable axes, static variants, live preview, portable save, explicit outlines and automatic Send to Cut without changing Draw');
}
