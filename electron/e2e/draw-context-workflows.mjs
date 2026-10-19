import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, enterDraw } from './draw-test-helpers.mjs';

export async function runDrawContextWorkflows(client) {
  const {evaluate}=client,{drag,click}=inputHelpers(client);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Context menu proof'});
  const action=id=>evaluate(`(async()=>${active}.handle(${JSON.stringify(id)}))()`);
  const select=ids=>evaluate(`(async()=>${active}.select(${JSON.stringify(ids)}))()`);
  const order=()=>evaluate(`(async()=>${active}.state.snapshot().layers[0].children.map(n=>n.id))()`);
  const selected=()=>evaluate(`(async()=>${active}.state.selection.ids)()`);
  const screen=p=>evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${p})),b=w.scope.view.element.getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y}})()`);
  const menu='.draw-project[style*=block] .draw-context-menu:not(.draw-context-menu--submenu)';
  const row=id=>`${menu} [data-draw-context=${id}]`;
  const open=async p=>{const at=await screen(p);await evaluate(`(async()=>${active}.scope.view.element.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:${at.x},clientY:${at.y}})))()`);};
  const choose=id=>evaluate(`document.querySelector('${row(id)}').click()`);
  const key=async(key,extra={})=>{
    await client.command('Input.dispatchKeyEvent',{type:'keyDown',key,...extra});
    await client.command('Input.dispatchKeyEvent',{type:'keyUp',key,...extra});await wait(25);
  };
  const shortcut=(key,code,shift=false)=>evaluate(`(()=>{const canvas=document.querySelector('.draw-project[style*=block] canvas');canvas.focus();canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',code:'${code}',bubbles:true,cancelable:true,ctrlKey:${process.platform!=='darwin'},metaKey:${process.platform==='darwin'},shiftKey:${shift}}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'${key}',code:'${code}',bubbles:true,cancelable:true}));})()`);
  await evaluate(`(async()=>${active}.setTool('rectangle'))()`);
  for(const x of [10,40,70])await drag(await screen([x,10]),await screen([x+20,30]));
  await evaluate(`(async()=>${active}.setTool('select'))()`);
  const [a,b,c]=await order();
  await select([a,b]);
  const at=await screen([20,20]);
  await client.command('Input.dispatchMouseEvent',{type:'mousePressed',x:at.x,y:at.y,button:'right',buttons:2,clickCount:1});
  await client.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:at.x,y:at.y,button:'right',buttons:0,clickCount:1});
  assert.equal(await evaluate(`!!document.querySelector('${menu}')`),true,'Native right click opens the menu');assert.deepEqual(await selected(),[a,b]);
  assert.equal(await evaluate(`document.querySelector('${row('group')}').disabled`),false);
  await choose('group');let group=(await selected())[0];
  await open([20,20]);assert.deepEqual(await selected(),[group],'Right click a group member selects the group');await choose('ungroup');
  assert.deepEqual(await order(),[a,b,c]);
  await select([a]);await open([80,20]);assert.deepEqual(await selected(),[c],'Right click selects an unselected object');
  await open([110,65]);assert.deepEqual(await selected(),[c],'Blank canvas preserves the selection');
  await choose('copy');await open([110,65]);await choose('paste-place');
  const copy=(await selected())[0];
  assert.deepEqual(await evaluate(`(async()=>{const w=${active},a=w.renderer.bounds('${c}'),b=w.renderer.bounds('${copy}');return[a.x,a.y,a.width,a.height,b.x,b.y,b.width,b.height].map(n=>+n.toFixed(3))})()`),[70,10,20,20,70,10,20,20]);
  await open([110,65]);await choose('undo');assert.deepEqual(await order(),[a,b,c]);
  await open([110,65]);await choose('redo');assert.equal((await order()).length,4);await select([copy]);
  await open([110,65]);await choose('cut');assert.deepEqual(await order(),[a,b,c]);
  await open([110,65]);await choose('paste');assert.equal((await order()).length,4);await action('undo');await action('undo');await action('undo');
  assert.deepEqual(await order(),[a,b,c]);
  await select([a]);await open([20,20]);await choose('arrange');
  assert.equal(await evaluate(`document.querySelector('${row('bring-front')} .draw-context-menu__key').textContent`),process.platform==='darwin'?'Cmd+Shift+PageUp':'Ctrl+Shift+PageUp');
  await choose('bring-front');assert.deepEqual(await order(),[b,c,a]);
  await shortcut('PageDown','PageDown');assert.deepEqual(await order(),[b,a,c]);
  await shortcut('PageDown','PageDown',true);assert.deepEqual(await order(),[a,b,c]);
  await shortcut('PageUp','PageUp');assert.deepEqual(await order(),[b,a,c]);await action('undo');
  await open([20,20]);await choose('arrange');await choose('send-back');assert.deepEqual(await order(),[a,b,c]);
  await action('deselect');await open([110,65]);
  for(const id of ['cut','copy','group','ungroup','arrange'])assert.equal(await evaluate(`document.querySelector('${row(id)}').disabled`),true,id);
  await key('Escape');assert.equal(await evaluate(`!!document.querySelector('${menu}')`),false);
  // Navigation is tested with real browser key dispatch, through the app's capture listener.
  await select([b]);await open([50,20]);await evaluate(`document.querySelector('${row('arrange')}').focus()`);
  await key('ArrowRight');assert.equal(await evaluate('document.activeElement.dataset.drawContext'),'bring-front');
  await key('Escape');assert.equal(await evaluate('document.activeElement.dataset.drawContext'),'arrange');
  await key('Escape');assert.deepEqual(await selected(),[b]);
  const history=await evaluate(`(async()=>${active}.state.history.entries.length)()`);
  await open([50,20]);await choose('rulers');await shortcut('R','KeyR',true);
  assert.deepEqual(await evaluate(`(async()=>[${active}.state.ui.rulers,${active}.state.ui.grid])()`),[true,true]);
  await open([50,20]);assert.equal(await evaluate(`document.querySelector('${row('grid')}').getAttribute('aria-checked')`),'true');
  await evaluate(`(()=>{const m=document.querySelector('${menu}');m.querySelector('[data-draw-context=arrange]').click();})()`);
  if(process.argv.includes('--screenshot')){
    const box=await evaluate(`(()=>{const r=document.querySelector('${row('arrange')}').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await click(box);await wait(100);
    const {writeFile}=await import('node:fs/promises');const {data}=await client.command('Page.captureScreenshot',{format:'png'});await writeFile('context-menu-proof.png',Buffer.from(data,'base64'));
  }
  await key('Escape');await key('Escape');
  await shortcut('r','KeyR');await shortcut('R','KeyR',true);
  assert.equal(await evaluate(`(async()=>${active}.state.history.entries.length)()`),history);
  // Both menus must fit at the lower right edge.
  await select([b]);await evaluate(`(async()=>${active}.scope.view.element.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:innerWidth-2,clientY:innerHeight-2})))()`);
  await choose('arrange');
  assert.equal(await evaluate(`[...document.querySelectorAll('${menu},${menu} .draw-context-menu:not([hidden])')].every(m=>{const r=m.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`),true);
  await click(await screen([110,65]));assert.equal(await evaluate(`!!document.querySelector('${menu}')`),false);
  await open([110,65]);await evaluate("document.querySelector('#workspaceToggle').click()");assert.equal(await evaluate(`!!document.querySelector('.draw-context-menu')`),false);
  console.log('PASS Draw context menu: selection/grouping, clipboard and paste in place, history, Arrange and Norwegian-friendly keys, disabled actions, keyboard navigation, rulers/grid, edge placement and workspace cleanup');
}
