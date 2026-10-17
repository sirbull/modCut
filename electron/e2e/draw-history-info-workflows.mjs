import assert from 'node:assert/strict';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D2.9: History panel, Info panel and command search. */
export async function runDrawHistoryInfoWorkflows(client) {
  const {evaluate}=client,{mouse}=inputHelpers(client),restore=await rememberTabs(evaluate);
  const mod=process.platform==='darwin'?'metaKey':'ctrlKey';
  const press=(key,code,extra={})=>evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},bubbles:true,cancelable:true,...${JSON.stringify(extra)}}))`);
  const panel=`document.querySelector('.draw-project[style*=block] .draw-flyout__body')`;
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'History proof'});
  const applied=()=>evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const count=()=>evaluate(`(async()=>(${active}.state.document.data.layers[0].children.length))()`);
  const ids=await evaluate(`(async()=>{const w=${active},{insertNode}=await import('./draw/doc/commands.mjs'),{shapeFromDrag}=await import('./draw/tools/shapes.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,out=[];
    for(const [x,label] of [[10,'Rectangle'],[40,'Rectangle'],[70,'Rectangle']]){const n=shapeFromDrag('rectangle',[b.x+x,b.y+10],[b.x+x+20,b.y+30],{fill:'#3366CC',stroke:'#000000',strokeWidth:.5});
      w.state.history.transaction(label,()=>w.state.history.execute(insertNode(L,n)));out.push(n.id);}
    w.select([]);return out;})()`);

  // History (in the Info group): one row per step after an Open row; clicking a row goes back or forward to it.
  await evaluate(`(async()=>(${active}.handle('panel.history')))()`);await wait(50);
  assert.equal(await evaluate(`${panel}.dataset.drawPanelBody`),'history');
  const rows=()=>evaluate(`[...${panel}.querySelectorAll('[data-draw-history]')].map(b=>[b.textContent,b.classList.contains('is-undone'),b.getAttribute('aria-current')])`);
  const total=await applied();assert.equal(await count(),3);
  let list=await rows();assert.equal(list.length,total+1);assert.equal(list[0][0],'Open');assert.equal(list.at(-1)[2],'true');
  await evaluate(`${panel}.querySelector('[data-draw-history="${total-2}"]').click()`);await wait(50);
  assert.equal(await applied(),total-2);assert.equal(await count(),1,'Going back two steps removes two rectangles');
  list=await rows();assert.deepEqual(list.slice(-2).map(r=>r[1]),[true,true],'Undone steps are greyed out');assert.equal(list[total-2][2],'true');
  await evaluate(`${panel}.querySelector('[data-draw-history="${total}"]').click()`);await wait(50);
  assert.equal(await applied(),total);assert.equal(await count(),3,'Going forward redoes both');
  await evaluate(`${panel}.querySelector('[data-draw-history="0"]').click()`);await wait(50);
  assert.equal(await applied(),0);assert.equal(await count(),0,'Open restores the document as opened');
  await evaluate(`${panel}.querySelector('[data-draw-history="${total}"]').click()`);await wait(50);assert.equal(await count(),3);

  // Info (F8): selection bounds and paint, and the pointer position updating live.
  await evaluate(`(async()=>(${active}.select(['${ids[1]}'])))()`);await press('F8','F8');await wait(50);
  assert.equal(await evaluate(`${panel}.dataset.drawPanelBody`),'info');
  const info=key=>evaluate(`${panel}.querySelector('[data-draw-info="${key}"]')?.textContent??null`);
  assert.equal(await info('width'),'20.00 mm');assert.equal(await info('height'),'20.00 mm');
  assert.equal(await info('fill'),'#3366CC');assert.match(await info('stroke'),/^#000000 · 0\.50 mm$/);
  const point=await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+30,b.y+50)),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  await mouse('mouseMoved',point);await wait(50);
  const x=await info('x'),y=await info('y');
  assert.ok(x&&y,`Pointer position shown: ${x} ${y}`);
  const pointer=await evaluate(`(async()=>{const p=${active}.state.document.data.artboards[0];return [p.x+30,p.y+50]})()`);
  assert.ok(Math.abs(parseFloat(x)-pointer[0])<.6&&Math.abs(parseFloat(y)-pointer[1])<.6,`Info follows the pointer: ${x} ${y}`);

  // Command search (Mod+Shift+K): type, pick with the keyboard, and the command runs.
  await press('K','KeyK',{[mod]:true,shiftKey:true});await wait(50);
  assert.equal(await evaluate("!!document.querySelector('.draw-command-search__input')"),true);
  assert.equal(await evaluate("document.activeElement?.classList.contains('draw-command-search__input')"),true,'The search field takes focus');
  await evaluate("(()=>{const i=document.querySelector('.draw-command-search__input');i.value='bring front';i.dispatchEvent(new Event('input',{bubbles:true}));})()");
  assert.equal(await evaluate("document.querySelector('.draw-command-search [aria-selected=true]')?.dataset.drawCommand"),'bring-front');
  await evaluate("document.querySelector('.draw-command-search__input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");await wait(50);
  assert.equal(await evaluate("!!document.querySelector('.draw-command-search')"),false,'Choosing closes the search');
  assert.equal(await evaluate(`(async()=>(${active}.state.document.data.layers[0].children.at(-1).id))()`),ids[1],'Bring to Front ran on the selection');
  // Tools and panels are found too; Escape closes without running anything.
  await press('K','KeyK',{[mod]:true,shiftKey:true});await wait(50);
  await evaluate("(()=>{const i=document.querySelector('.draw-command-search__input');i.value='ellip';i.dispatchEvent(new Event('input',{bubbles:true}));})()");
  assert.equal(await evaluate("document.querySelector('.draw-command-search [aria-selected=true]')?.dataset.drawCommand"),'tool.ellipse');
  await evaluate("document.querySelector('.draw-command-search__input').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))");
  await evaluate("document.querySelector('.draw-command-search__input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await wait(30);
  assert.equal(await evaluate("!!document.querySelector('.draw-command-search')"),false);
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`),'select','Escape runs nothing');
  await press('K','KeyK',{[mod]:true,shiftKey:true});await wait(50);
  await evaluate("(()=>{const i=document.querySelector('.draw-command-search__input');i.value='history';i.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await evaluate("document.querySelector('.draw-command-search__input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");await wait(50);
  assert.equal(await evaluate(`${panel}.dataset.drawPanelBody`),'history','Panels open from the search');
  await evaluate(`(async()=>(${active}.handle('cancel')))()`);await restore();
  console.log('PASS Draw history and info: History rows go back and forward (Open included), Info shows bounds, paint and the live pointer, command search runs commands, tools and panels');
}
