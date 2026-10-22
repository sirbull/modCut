import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

export async function runDrawPanelLayoutWorkflows(client) {
  const { evaluate, command } = client, { mouse, click, drag } = inputHelpers(client), restore = await rememberTabs(evaluate);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { name: 'Modular panels' });
  const root = '.draw-project[style*=block]';
  const rail = `${root} .draw-panel-rail`, floating = id => `${root} .draw-floating-panel[data-draw-group="${id}"]`;
  const icon = id => `${rail} [data-draw-panel="${id}"]`;
  const state = () => evaluate(`(async()=>structuredClone(${active}.state.ui.panelLayout))()`);
  const handle = id => evaluate(`(async()=>(${active}.handle('${id}')))()`);
  const box = selector => evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()`);
  const point = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`); const b = await box(selector); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const header = id => `${floating(id)} .draw-flyout__tab`;
  // A rail flyout has no ×; Delete on the icon removes the panel from the rail.
  const removeIcon = id => evaluate(`document.querySelector('${icon(id)}').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))`);
  const railOrder = () =>evaluate(`[...document.querySelectorAll('${rail} [data-draw-panel]')].map(b=>b.dataset.drawPanel)`);
  await handle('workspace-reset'); await wait(100);

  // Ordinary clicks still open and collapse a docked flyout, without starting a drag.
  await click(await point(icon('appearance')));
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.flyout))()`), 'appearance');
  await click(await point(icon('appearance')));
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.flyout))()`), null);

  // Reorder with the pointer still held: the DOM and state must change before pointerup.
  const start = await point(icon('appearance')), first = await point(icon('color'));
  await mouse('mouseMoved', start); await mouse('mousePressed', start, { buttons: 1 });
  await mouse('mouseMoved', { x: first.x, y: first.y - 12 }, { buttons: 1 });
  assert.equal((await railOrder())[0], 'appearance', 'Icons reorder live while the pointer is held');
  await mouse('mouseReleased', { x: first.x, y: first.y - 12 }); await wait(350);
  await evaluate(`document.querySelector('${icon('appearance')}').focus()`);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', modifiers: 1 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown' });
  assert.equal((await railOrder())[1], 'appearance', 'Alt+Down reorders the focused icon');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', modifiers: 1 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp' });
  assert.equal((await railOrder())[0], 'appearance');

  const canvas = await box(`${root} .draw-stage`), loose = { x: canvas.x + 80, y: canvas.y + 80 };
  await drag(await point(icon('appearance')), loose); await wait(350);
  assert.ok((await state()).floating.appearance); assert.ok(!(await state()).rail.includes('appearance'));
  assert.ok((await box(floating('appearance'))).width > 250);
  const before = await box(floating('appearance')), grip = await point(header('appearance'));
  await drag(grip, { x: grip.x + 100, y: grip.y + 45 }); await wait(350);
  const after = await box(floating('appearance'));
  assert.ok(Math.abs(after.x - before.x - 100) < 3 && Math.abs(after.y - before.y - 45) < 3, 'The entire box follows its title bar');

  // Floating panels keep their size and pointer offset when parked partly outside the workspace.
  await handle('panel.stroke');
  const shell = await box(`${root} .draw-shell`), stroke = await box(floating('stroke'));
  const strokeGrip = `${floating('stroke')} .draw-flyout__header`;
  const park = async destination => {
    const before = await box(floating('stroke')), grip = await box(strokeGrip);
    const start = { x: grip.x + grip.width / 2, y: Math.max(shell.y + 2, grip.y + grip.height / 2) };
    const end = { x: start.x + destination.x - before.x, y: start.y + destination.y - before.y };
    await mouse('mouseMoved', start); await mouse('mousePressed', start, { buttons: 1 });
    await mouse('mouseMoved', end, { buttons: 1 });
    const moved = await box(floating('stroke'));
    assert.ok(Math.abs(moved.x - destination.x) < 2 && Math.abs(moved.y - destination.y) < 2, 'The panel follows the pointer past the old bounds before release');
    assert.ok(Math.abs(moved.height - stroke.height) < 2, 'Moving a panel does not shrink its contents');
    await mouse('mouseReleased', end); await wait(100);
    assert.deepEqual(await box(floating('stroke')), moved, 'Dropping a floating panel does not snap it back inside');
    return moved;
  };
  const parked = await park({ x: canvas.x + 80, y: shell.y + shell.height - 48 });
  assert.ok(parked.y + parked.height > shell.y + shell.height, 'Only the top of Stroke needs to remain visible');
  const panelShot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(tmpdir(), 'modcut-floating-panel-unrestricted.png'), Buffer.from(panelShot.data, 'base64'));
  await handle('deselect');
  assert.deepEqual(await box(floating('stroke')), parked, 'Refreshing the panels preserves partial visibility');
  assert.deepEqual(JSON.parse(await evaluate("localStorage.getItem('modcut.draw.panel-layout')")).floating.stroke,
    (await state()).floating.stroke, 'The position beyond the bottom edge is persisted');
  const parkedTab = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  await evaluate("document.querySelector('#newDoc').click()"); await submitNewDrawDialog(evaluate, { name: 'Partly visible panel' });
  assert.deepEqual(await box(floating('stroke')), parked, 'New documents restore the partly visible panel without clamping');
  await evaluate(`document.querySelector('.doc-tab[data-tab-id="${parkedTab}"]').click()`);
  await park({ x: -80, y: shell.y + 80 });
  await park({ x: canvas.x + 80, y: shell.y - 8 });
  await park({ x: canvas.x + 80, y: shell.y + 80 });
  await click(await point(`${floating('stroke')} [aria-label="Close panel"]`));

  await click(await point(`${floating('appearance')} [aria-label="Close panel"]`));
  assert.equal((await state()).floating.appearance, undefined); assert.ok(!(await state()).rail.includes('appearance'));
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Window','Appearance')"), true);
  assert.ok((await state()).floating.appearance, 'Window restores a closed panel as a floating window');
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Window','Color')"), true);
  assert.ok((await state()).floating.color); assert.ok((await state()).floating.appearance, 'Opening another panel keeps the first window');

  // Dock one panel back into the rail; its former sibling keeps its own icon.
  await evaluate("window.modcut.clickE2EMenuItem('Window','Appearance')");
  const railBox = await box(rail), target = { x: railBox.x + railBox.width / 2, y: railBox.y + 12 };
  await drag(await point(header('appearance')), target); await wait(350);
  assert.equal((await railOrder())[0], 'appearance'); assert.equal((await state()).floating.appearance, undefined);
  await click(await point(icon('appearance')));
  await handle('panel.graphic-styles');
  await click(await point(`${floating('graphic-styles')} [aria-label="Collapse to icons"]`));
  await click(await point(icon('graphic-styles')));
  assert.equal(await evaluate(`document.querySelector('${root} .draw-flyout [role=tabpanel]').dataset.drawPanelBody`), 'graphic-styles');

  // Escape restores both the original place and order during a drag.
  const original = await state(), origin = await point(icon('appearance'));
  await mouse('mouseMoved', origin); await mouse('mousePressed', origin, { buttons: 1 });
  await mouse('mouseMoved', loose, { buttons: 1 });
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await mouse('mouseReleased', loose); await wait(350);
  assert.deepEqual(await state(), original, 'Escape cancels the whole panel move');

  // Pointer cancellation also leaves the original layout intact.
  const cancelStart = await point(icon('appearance'));
  await mouse('mouseMoved', cancelStart); await mouse('mousePressed', cancelStart, { buttons: 1 });
  await mouse('mouseMoved', loose, { buttons: 1 });
  await evaluate(`document.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1}))`);
  await mouse('mouseReleased', loose); await wait(350);
  assert.deepEqual(await state(), original);

  // Related panels have separate icons, with separators around their contiguous rail group.
  await handle('workspace-reset');
  assert.deepEqual((await railOrder()).filter(id => ['transform', 'align', 'pathfinder'].includes(id)), ['transform', 'align', 'pathfinder']);
  assert.ok(await evaluate(`(()=>{const r=document.querySelector('${rail}');return r.scrollWidth<=r.clientWidth})()`), 'The scrollable rail does not overflow horizontally');
  assert.ok(await evaluate(`(()=>{const a=document.querySelector('${icon('transform')}'),b=document.querySelector('${icon('align')}'),c=document.querySelector('${icon('pathfinder')}');
    return a.previousElementSibling.getAttribute('role')==='separator'&&a.nextElementSibling===b&&b.nextElementSibling===c&&c.nextElementSibling.getAttribute('role')==='separator'})()`));
  await click(await point(icon('transform')));
  const reference = await evaluate(`(()=>{const r=document.querySelector('${root} .draw-flyout .draw-reference'),b=r.getBoundingClientRect(),fields=r.nextElementSibling.getBoundingClientRect(),p=[...r.children].map(p=>p.getBoundingClientRect());
    return {width:b.width,height:b.height,count:p.length,contained:p.every(p=>p.left>=b.left&&p.top>=b.top&&p.right<=b.right+.5&&p.bottom<=b.bottom+.5),clear:b.right<fields.left,border:getComputedStyle(r).borderWidth}})()`);
  assert.deepEqual(reference, { width: 28, height: 28, count: 9, contained: true, clear: true, border: '0px' }, 'The compact nine-point selector fits beside the fields');
  await click(await point(`${root} .draw-flyout [data-draw-reference="1,1"]`));
  assert.deepEqual(await evaluate(`(async()=>(${active}.state.ui.referencePoint))()`), [1,1]);
  const transformShot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(tmpdir(), 'modcut-compact-transform.png'), Buffer.from(transformShot.data, 'base64'));
  await removeIcon('transform');
  assert.ok(!(await state()).rail.includes('transform') && (await state()).rail.includes('align') && (await state()).rail.includes('pathfinder'));
  await click(await point(icon('align')));
  await removeIcon('align');
  assert.deepEqual((await railOrder()).filter(id => ['transform', 'align', 'pathfinder'].includes(id)), ['pathfinder'], 'Only Pathfinder is retained');
  await click(await point(icon('pathfinder')));
  assert.equal(await evaluate(`document.querySelector('${root} .draw-flyout [role=tabpanel]').dataset.drawPanelBody`), 'pathfinder');
  assert.equal(await evaluate(`document.querySelectorAll('${root} .draw-flyout [role=tab]').length`), 1, 'Closed siblings are not tabs in the remaining panel');
  const individualShot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(tmpdir(), 'modcut-independent-pathfinder.png'), Buffer.from(individualShot.data, 'base64'));
  await handle('panel.transform');
  assert.ok((await state()).floating.transform && (await state()).rail.includes('pathfinder'));
  assert.ok(!(await state()).rail.includes('align'), 'Reopening Transform leaves Align closed');

  // Native accelerators and the Window list expose the complete panel set.
  const definitions = await evaluate("import('./draw/panels/registry.mjs').then(m=>m.PANEL_DEFINITIONS.filter(p=>!['artboards','asset-export'].includes(p.id)).map(p=>({id:p.id,name:p.name})))");
  for (const panel of definitions) {
    assert.equal(await evaluate(`window.modcut.clickE2EMenuItem('Window',${JSON.stringify(panel.name)})`), true, `${panel.name} appears in Window`);
    assert.ok(Object.keys((await state()).floating).length > 0);
  }
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('File','Asset Export…')"), true);
  assert.ok((await state()).floating['asset-export']);
  assert.equal(await evaluate(`document.querySelectorAll('${root} [data-draw-dock=layers]').length`), 1, 'Floating Layers reuses the existing tree');
  await handle('workspace-reset');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F6', code: 'F6', windowsVirtualKeyCode: 117 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F6', code: 'F6', windowsVirtualKeyCode: 117 });
  await wait(100); assert.ok((await state()).floating.color, 'F6 opens Color as a movable window');
  await handle('toggle-panels'); await handle('panel.color');
  assert.equal(await evaluate(`document.querySelector('${root} .draw-shell').classList.contains('draw-shell--panels-hidden')`), false, 'Choosing a panel reveals panels hidden with Tab');
  await click(await point(`${floating('color')} [aria-label="Collapse to icons"]`));
  assert.ok((await state()).rail.includes('color')); assert.equal((await state()).floating.color, undefined);
  await evaluate(`document.querySelector('${icon('image-trace')}').focus()`);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete' });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete' });
  assert.ok(!(await state()).rail.includes('image-trace'), 'Delete removes the focused panel icon');

  // Workspace snapshots include positions/order, and Essentials resets the modular layout.
  await handle('panel.appearance');
  await evaluate(`(async()=>{const w=${active},m=await import('./draw/ui/workspaces.mjs');w.testPanelWorkspace=m.captureWorkspace(w.state.ui,'Modular');})()`);
  const saved = await state(); await handle('workspace-reset');
  await evaluate(`(async()=>{const w=${active},m=await import('./draw/ui/workspaces.mjs');m.applyWorkspace(w.state.ui,w.testPanelWorkspace);w.handle('deselect');})()`);
  assert.deepEqual(await state(), saved);
  assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('modcut.draw.panel-layout'))"), saved);
  const proofTab = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  await evaluate("document.querySelector('#newDoc').click()"); await submitNewDrawDialog(evaluate, { name: 'Restored panel layout' });
  assert.deepEqual(await state(), saved, 'A newly opened document loads the saved panel positions and order');
  await evaluate(`document.querySelector('.doc-tab[data-tab-id="${proofTab}"]').click()`);
  const wide = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(tmpdir(), 'modcut-modular-panels-wide.png'), Buffer.from(wide.data, 'base64'));

  // Resize preserves chosen floating positions, including portions beyond the viewport.
  await command('Emulation.setDeviceMetricsOverride', { width: 790, height: 600, deviceScaleFactor: 1, mobile: false }); await wait(200);
  const resizedShell = await box(`${root} .draw-shell`);
  for (const [id, position] of Object.entries((await state()).floating)) {
    const b = await box(floating(id));
    assert.ok(Math.abs(b.x - resizedShell.x - position.x) < 2 && Math.abs(b.y - resizedShell.y - position.y) < 2, 'Resize keeps the saved position');
  }
  const { data } = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(tmpdir(), 'modcut-modular-panels.png'), Buffer.from(data, 'base64'));
  await command('Emulation.clearDeviceMetricsOverride');
  await handle('workspace-reset'); await restore();
  console.log('PASS modular panels: live reorder, detach, move, dock, close/reopen, independent grouped icons, compact reference points, cancel, Window list, shortcuts, workspace persistence and resize');
}
