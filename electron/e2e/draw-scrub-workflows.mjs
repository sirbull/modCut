import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog } from './draw-test-helpers.mjs';

const root = '.draw-project[style*=block]';
const SHIFT = 8;
export async function runDrawScrubWorkflows(client) {
  const { evaluate } = client, command = id => evaluate(`(async()=>{${active}.handle('${id}')})()`), { drag, mouse } = inputHelpers(client);
  await evaluate("document.querySelector('#workspaceToggle').click();document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Scrub proof' });
  const scratch = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const screen = p => evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${p})),b=w.scope.view.element.getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y}})()`);
  const center = selector => evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  const width = () => evaluate(`(async()=>(${active}.renderer.selectionBounds().width))()`);
  const depth = () => evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} vs ${b}`);
  await evaluate(`(async()=>(${active}.setTool('rectangle')))()`);
  await drag(await screen([10, 10]), await screen([30, 20]));
  await evaluate(`(async()=>(${active}.handle('panel.transform')))()`);
  const label = `${root} [data-draw-scrub=width]`;
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${label}')).cursor`), 'ew-resize', 'Titles show a resize cursor');

  // Drag right: 2 px per 0.1 mm step, one undo step for the whole drag.
  let start = await width(), before = await depth(), from = await center(label);
  await mouse('mouseMoved', from); await mouse('mousePressed', from, { buttons: 1 });
  for (let x = 10; x <= 40; x += 10) { await mouse('mouseMoved', { x: from.x + x, y: from.y }, { buttons: 1 }); await wait(30); }
  near(await width(), start + 2, 'Live preview while dragging');
  await mouse('mouseReleased', { x: from.x + 40, y: from.y });
  near(await width(), start + 2, 'Dragging 40 px right adds 2 mm');
  assert.equal(await depth(), before + 1, 'One drag is one undo step');
  await command('undo'); near(await width(), start, 'Undo restores the value');

  // Shift is ten times faster.
  from = await center(label);
  await drag(from, { x: from.x + 20, y: from.y }, SHIFT); await wait(50);
  near(await width(), start + 10, 'Shift-drag: 10 steps of 1 mm'); await command('undo');

  // Escape cancels the drag and leaves no history.
  before = await depth(); from = await center(label);
  await mouse('mouseMoved', from); await mouse('mousePressed', from, { buttons: 1 });
  await mouse('mouseMoved', { x: from.x + 60, y: from.y }, { buttons: 1 }); await wait(50);
  assert.ok(await width() > start + 1, 'Preview applied before Escape: '+JSON.stringify(await evaluate(`(async()=>({w:${active}.renderer.selectionBounds().width,lock:String(document.pointerLockElement?.tagName),cls:document.body.className,field:document.querySelector('${root} [data-draw-field=width]').value}))()`)));
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}))");
  await mouse('mouseReleased', { x: from.x + 60, y: from.y });
  near(await width(), start, 'Escape restores the original value'); assert.equal(await depth(), before, 'Cancelled drag leaves no history');
  assert.equal(await evaluate(`!document.querySelector('${root} .draw-flyout').hidden`), true, 'Escape during a drag keeps the panel open');

  // A click without movement focuses the field; arrows step by 0.1 mm, Shift by 1 mm.
  await mouse('mouseMoved', from); await mouse('mousePressed', from, { buttons: 1 }); await mouse('mouseReleased', from);
  assert.equal(await evaluate("document.activeElement.dataset.drawField"), 'width');
  await client.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  await client.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 }); await wait(50);
  near(await width(), start + .1, 'Arrow Up steps one increment');
  await client.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, modifiers: SHIFT });
  await client.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, modifiers: SHIFT }); await wait(50);
  near(await width(), start - .9, 'Shift+Arrow Down steps ten increments');
  await command('undo'); await command('undo'); near(await width(), start, 'Each arrow press is one undo step');
  await evaluate('document.activeElement.blur()');

  // Dialog titles scrub too and drive the live preview; Escape stops the drag, not the dialog.
  await evaluate(`(async()=>{${active}.handle('rotate-dialog')})()`); await wait(100);
  const angle = '.draw-transform-dialog [data-draw-scrub=angle]';
  from = await center(angle);
  await drag(from, { x: from.x + 30, y: from.y }); await wait(50);
  assert.equal(await evaluate("document.querySelector('.draw-transform-dialog [name=angle]').value"), '15', 'Dragging a dialog title changes its value');
  await mouse('mouseMoved', from); await mouse('mousePressed', from, { buttons: 1 });
  await mouse('mouseMoved', { x: from.x + 40, y: from.y }, { buttons: 1 }); await wait(30);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}))");
  await mouse('mouseReleased', { x: from.x + 40, y: from.y });
  assert.equal(await evaluate("document.querySelector('.draw-transform-dialog [name=angle]').value"), '15', 'Escape restores the value from before that drag');
  assert.ok(await evaluate("!!document.querySelector('.draw-transform-dialog')"), 'The dialog stays open');
  await evaluate("document.querySelector('.draw-transform-dialog [data-x=cancel]').click()"); await wait(50);
  near(await width(), start, 'Cancelling the dialog leaves the artwork unchanged');

  await evaluate(`document.querySelector('[data-close-tab="${scratch}"]').click()`);
  // Closing a dirty tab asks to save; wait for the prompt or the tab to disappear before going on.
  for (let i = 0; i < 40; i++) {
    if (await evaluate("!!document.querySelector('[data-x=discard]')")) { await evaluate("document.querySelector('[data-x=discard]').click()"); }
    if (!await evaluate(`!!document.querySelector('[data-tab-id="${scratch}"]') || !!document.querySelector('.modal-overlay')`)) break;
    await wait(50);
  }
  assert.equal(await evaluate(`!!document.querySelector('[data-tab-id="${scratch}"]')`), false, 'Scratch tab closed');
  if (await evaluate("document.body.dataset.workspace") === 'draw') await evaluate("document.querySelector('#workspaceToggle').click()");
  process.stdout.write('PASS Draw scrubby labels: drag/Shift/Escape, one undo step, click-to-focus, arrow stepping and dialogs\n');
}
