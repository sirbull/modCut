import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, submitNewDrawDialog, rememberTabs } from './draw-test-helpers.mjs';
import { runDrawDocumentPresetWorkflows } from './draw-document-preset-workflows.mjs';

export async function runDrawDocumentSettingsWorkflows(client) {
  await runDrawDocumentPresetWorkflows(client);
  const {evaluate} = client, restore = await rememberTabs(evaluate);
  const until = async expression => {for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(40);}assert.fail(expression);};
  const snapshot = () => evaluate(`(async()=>${active}.state.snapshot())()`);
  const depth = () => evaluate(`(async()=>${active}.state.history.entries.filter(e=>e.applied).length)()`);
  const title = () => evaluate("document.querySelector('.doc-tab.is-active .doc-tab__title').textContent");
  const command = id => evaluate(`(async()=>${active}.handle('${id}'))()`);
  const set = (name,value) => evaluate(`(()=>{const i=document.querySelector('.draw-document-settings-dialog form').elements[${JSON.stringify(name)}];i.value=${JSON.stringify(String(value))};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const open = async tabId => {
    const box=await evaluate(`(()=>{const b=document.querySelector('[data-tab-id="${tabId}"] .doc-tab__title').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);
    for(const clickCount of [1,2])for(const type of ['mousePressed','mouseReleased'])await client.command('Input.dispatchMouseEvent',{type,...box,button:'left',buttons:type==='mousePressed'?1:0,clickCount});
    await until("!!document.querySelector('.draw-document-settings-dialog')");
  };
  const submit = async () => {await evaluate("document.querySelector('.draw-document-settings-dialog form').requestSubmit()");await until("!document.querySelector('.draw-document-settings-dialog')");};
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,count:2,layout:'row',name:'Settings proof'});
  const tabId = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  await evaluate(`(async()=>{const w=${active},{shapeFromDrag}=await import('./draw/tools/shapes.mjs'),{insertNode}=await import('./draw/doc/commands.mjs');w.state.history.execute(insertNode(w.state.document.data.layers[0].id,shapeFromDrag('rectangle',[10,15],[40,30],{fill:'#14DBAD',stroke:'#000000',strokeWidth:1})));w.artboards.choose(w.state.document.data.artboards[1].id);})()`);
  const before=await snapshot(),startDepth=await depth();
  await open(tabId);
  assert.equal(await evaluate("document.activeElement.name"),'name','Double-click opens the selected name field');
  assert.equal(await evaluate("document.querySelector('.draw-document-settings-dialog form').elements.artboard.value"),before.artboards[1].id,'Settings start with the active artboard');
  assert.equal(await evaluate("document.querySelector('.draw-document-settings-dialog form').elements.width.value"),'120');
  await set('name','Canceled name');await set('width',230);
  await evaluate("document.querySelector('.draw-document-settings-dialog [data-x=cancel]').click()");
  assert.deepEqual(await snapshot(),before,'Cancel leaves document and artwork unchanged');
  await open(tabId);await submit();assert.equal(await depth(),startDepth,'Applying unchanged settings creates no undo entry');

  await open(tabId);await set('name','New laser drawing');await set('width',180);await set('height',90);await set('units','cm');
  assert.equal(await evaluate("document.querySelector('.draw-document-settings-dialog form').elements.width.value"),'18','Changing units converts values');
  await set('artboard',before.artboards[0].id);await set('width',15);await set('height',10);await set('ppi',150);
  // Switching back retains draft dimensions for the second artboard.
  await set('artboard',before.artboards[1].id);
  assert.equal(await evaluate("document.querySelector('.draw-document-settings-dialog form').elements.width.value"),'18');
  const screenshot=await client.command('Page.captureScreenshot',{format:'png'});
  await writeFile(join(tmpdir(),'modcut-document-settings.png'),Buffer.from(screenshot.data,'base64'));
  await submit();
  const after=await snapshot();
  assert.equal(after.name,'New laser drawing');assert.equal(after.units,'cm');assert.equal(after.rasterEffectsPpi,150);
  assert.deepEqual(after.artboards.map(b=>[b.width,b.height]),[[150,100],[180,90]]);
  assert.deepEqual(after.artboards.map(b=>[b.id,b.x,b.y,b.name]),before.artboards.map(b=>[b.id,b.x,b.y,b.name]),'Board identity, positions and names are retained');
  assert.deepEqual(after.layers,before.layers,'Resizing artboards does not transform or recreate artwork');
  assert.equal(await title(),'New laser drawing');
  assert.equal(await evaluate("document.querySelector('#filename').value"),'New laser drawing','Save filename follows the name');
  assert.equal(await depth(),startDepth+1,'Settings form one undo step');
  await command('undo');assert.deepEqual(await snapshot(),before);assert.equal(await title(),'Settings proof');
  assert.equal(await evaluate("document.querySelector('#filename').value"),'Settings proof');
  await command('redo');assert.deepEqual(await snapshot(),after);assert.equal(await title(),'New laser drawing');

  // Switching tabs on the first click rebuilds the tab strip; the second click must still open settings.
  await evaluate("document.querySelector('#newDoc').click()");await submitNewDrawDialog(evaluate,{preset:'custom',width:70,height:50,name:'Other drawing'});
  await open(tabId);assert.equal(await title(),'New laser drawing','Double-click activates an inactive tab');
  await set('preset','a4');
  assert.equal(await evaluate("document.querySelector('.draw-document-settings-dialog form').elements.width.value"),'210');
  await evaluate("document.querySelector('.draw-document-settings-dialog [data-orientation=landscape]').click()");
  assert.equal(await evaluate("document.querySelector('.draw-document-settings-dialog form').elements.width.value"),'297');
  await submit();assert.deepEqual((await snapshot()).artboards[1].width,297);
  assert.deepEqual((await snapshot()).layers,before.layers);
  await restore();
  console.log('PASS Draw document settings: real double-click on active/inactive tabs, name and save filename, artboard sizes, units, resolution, presets/orientation, cancel, no-op, one-step undo/redo, artwork retained');
}
