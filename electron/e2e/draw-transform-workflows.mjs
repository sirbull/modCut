import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inputHelpers,wait} from './cdp.mjs';
import {activeDraw as active,submitNewDrawDialog} from './draw-test-helpers.mjs';
export async function runDrawTransformWorkflows(client){
  const {evaluate}=client,{click,drag,key}=inputHelpers(client);
  const original=await evaluate("({id:document.querySelector('.doc-tab.is-active').dataset.tabId,cut:paper.project.layers[1].exportJSON({asString:true})})");
  await evaluate("document.querySelector('#workspaceToggle').click();document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Transform proof'});
  const scratch=await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const menu=await evaluate('window.modcut.getE2EWorkspaceMenu()');assert.ok(menu.transform.some(item=>item.label==='Rotate…'));assert.equal(menu.transform.find(item=>item.label==='Transform Again').accelerator,process.platform==='darwin'?'Cmd+D':'Ctrl+D');
  const command=id=>evaluate(`(async()=>(${active}.handle('${id}')))()`);
  const tool=id=>evaluate(`(async()=>(${active}.setTool('${id}')))()`);
  const shortcut=(key,code,extra={})=>evaluate(`(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',code:'${code}',bubbles:true,cancelable:true,...${JSON.stringify(extra)}}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'${key}',code:'${code}',bubbles:true,cancelable:true}));})()`);
  const screen=p=>evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${p})),b=w.scope.view.element.getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y}})()`);
  const nodes=()=>evaluate(`(async()=>(${active}.state.snapshot().layers[0].children))()`);
  const bounds=()=>evaluate(`(async()=>{const b=${active}.renderer.selectionBounds();return{x:b.x,y:b.y,width:b.width,height:b.height}})()`);
  const fields=values=>evaluate(`(()=>{const f=document.querySelector('.draw-transform-dialog form');for(const [name,value] of Object.entries(${JSON.stringify(values)})){const i=f.elements[name];if(i.type==='checkbox')i.checked=value;else i.value=value;i.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  const submit=copy=>evaluate(`document.querySelector('.draw-transform-dialog ${copy?'[data-x=copy]':'[type=submit]'}').click()`);
  await tool('rectangle');await drag(await screen([10,10]),await screen([30,20]));const initial=await nodes(),id=initial[0].id;
  await evaluate(`(async()=>(${active}.state.history.markSaved()))()`);
  await shortcut('r','KeyR');await key('Enter');assert.equal(await evaluate("document.querySelector('.draw-transform-dialog .panel__header').textContent"),'Rotate');
  await fields({angle:90});assert.deepEqual(await nodes(),initial,'Dialog preview is view-only');assert.equal(await evaluate(`(async()=>(${active}.state.dirty))()`),false);
  await key('Escape');assert.equal(await evaluate(`(async()=>(${active}.renderer.items.get('${id}').visible))()`),true);assert.deepEqual(await nodes(),initial);
  await key('Enter');await fields({angle:90});await submit(false);let b=await bounds();assert.ok(Math.abs(b.width-10)<.02&&Math.abs(b.height-20)<.02);await command('undo');assert.deepEqual(await nodes(),initial);
  await shortcut('o','KeyO');await key('Enter');await fields({axis:'vertical',originX:0,originY:0});await submit(false);b=await bounds();assert.ok(Math.abs(b.x+30)<.02);await command('undo');
  await shortcut('s','KeyS');await key('Enter');await fields({mode:'uniform',uniform:200,scaleStrokes:false,originX:20,originY:15});
  assert.deepEqual(await nodes(),initial);await submit(true);assert.equal((await nodes()).length,2);assert.equal((await nodes())[1].strokeScaling,false);assert.equal((await nodes())[1].appearance.strokes[0].width,initial[0].appearance.strokes[0].width);
  b=await bounds();assert.ok(Math.abs(b.width-40)<.02&&Math.abs(b.height-20)<.02);
  const pixelWidths=await evaluate(`(async()=>{const w=${active},view=w.scope.view,old={zoom:view.zoom,center:view.center.clone()},results=[];w.scope.activate();try{
    for(const multiplier of [1,2]){view.zoom=old.zoom*multiplier;view.center=w.renderer.selectionBounds().center;w.renderer.updateView();const b=w.renderer.selectionBounds(),p=view.projectToView(new w.scope.Point(b.center.x,b.top)),canvas=view.element,ratio=canvas.width/view.viewSize.width,data=canvas.getContext('2d').getImageData(Math.round(p.x*ratio),Math.round(p.y*ratio)-16,1,32).data;let dark=0;
      for(let i=0;i<data.length;i+=4)if(data[i]+data[i+1]+data[i+2]<300&&data[i+3]>100)dark++;results.push({dark,expected:.5*view.zoom*ratio});}
    return results;
  }finally{view.zoom=old.zoom;view.center=old.center;w.renderer.updateView();paper.activate();}})()`);
  for(const value of pixelWidths)assert.ok(Math.abs(value.dark-value.expected)<=2,JSON.stringify(pixelWidths));assert.ok(pixelWidths[1].dark>pixelWidths[0].dark,'Fixed-mm strokes still grow on screen when zooming in');
  await shortcut('d','KeyD',{ctrlKey:process.platform!=='darwin',metaKey:process.platform==='darwin'});assert.equal((await nodes()).length,3,await evaluate(`(async()=>{const w=${active};return JSON.stringify({reason:'Mod+D repeats Copy',last:w.transforms.last,selected:w.state.selection.ids,toast:document.querySelector('#toasts').textContent,modal:!!document.querySelector('.modal-overlay')})})()`));
  assert.ok(Math.abs((await bounds()).width-80)<.02);await command('undo');await command('undo');assert.deepEqual(await nodes(),initial);
  await tool('select');await click(await screen([20,15]));await tool('scale');await click(await screen([10,10]));
  assert.deepEqual(await nodes(),initial,'Moving the reference point does not edit the document');
  const a=await screen([30,20]),p=await screen([40,25]);
  await client.command('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',buttons:1,clickCount:1});await client.command('Input.dispatchMouseEvent',{type:'mouseMoved',...p,button:'left',buttons:1});
  assert.deepEqual(await nodes(),initial);await key('Escape');await client.command('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});assert.deepEqual(await nodes(),initial);
  await drag(await screen([30,20]),await screen([50,30]),1);assert.equal((await nodes()).length,2);b=await bounds();assert.ok(Math.abs(b.width-40)<.02);await command('undo');
  await tool('select');await click(await screen([20,15]));await tool('rotate');await click(await screen([60,40]));await drag(await screen([80,40]),await screen([60,20]),8);
  assert.ok(Math.abs((await nodes())[0].transform[1]+1)<.001,'Rotate drag snaps counterclockwise to 90 degrees');await command('undo');
  await tool('reflect');await drag(await screen([80,40]),await screen([60,60]));assert.equal((await nodes())[0].transform[0]<.001,true);await command('undo');assert.deepEqual(await nodes(),initial);
  // Nonuniform dialog and stroke scaling are retained after IO and undo/redo.
  await tool('scale');await key('Enter');await fields({mode:'nonuniform',x:200,y:50,scaleStrokes:true});await submit(false);b=await bounds();assert.ok(Math.abs(b.width-40)<.02&&Math.abs(b.height-5)<.02);
  const snapshot=await evaluate(`(async()=>JSON.stringify(${active}.state.snapshot()))()`);assert.equal(await evaluate(`(async()=>{const{createProjectDraw}=await import('./draw/io/project.mjs'),s=createProjectDraw(JSON.parse(${JSON.stringify(snapshot)}));return !s.document.readOnly&&JSON.stringify(s.snapshot())===${JSON.stringify(snapshot)}})()`),true);
  await command('undo');await command('redo');await command('undo');assert.deepEqual(await nodes(),initial);
  // Double-click the existing toolbar entry; no duplicate tool or panel is mounted.
  await tool('rotate');await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-tool=rotate]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");assert.equal(await evaluate("!!document.querySelector('.draw-transform-dialog')"),true);
  await fields({angle:30});const shot=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'modcut-draw-transform-dialog.png'),Buffer.from(shot.data,'base64'));await key('Escape');
  await evaluate(`document.querySelector('[data-close-tab="${scratch}"]').click()`);await wait(80);
  if(await evaluate("!!document.querySelector('[data-x=discard]')"))await evaluate("document.querySelector('[data-x=discard]').click()");await wait(80);
  assert.equal(await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId"),original.id);assert.equal(await evaluate("paper.project.layers[1].exportJSON({asString:true})"),original.cut);
  await evaluate("document.querySelector('#workspaceToggle').click()");
  process.stdout.write('PASS Draw transforms: Rotate/Reflect/Scale, dialog preview/cancel, reference points, Copy/Again, stroke option, modifiers and atomic undo\n');
}
