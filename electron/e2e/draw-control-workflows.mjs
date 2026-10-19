import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, rememberTabs, enterDraw } from './draw-test-helpers.mjs';

/** D1.9: the control bar follows the selection and the artboard tool, and View > Control Bar hides it. */
export async function runDrawControlWorkflows(client) {
  const { evaluate } = client;
  const root = '.draw-project[style*=block]';
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(50); } assert.fail(`Timed out: ${label}`); };
  // This workflow asserts English labels, regardless of the host's system language.
  await evaluate("document.querySelector('#settings').click()");
  await until("!!document.querySelector('.preferences-modal [name=language]')", 'language preference');
  const originalLanguage = await evaluate("document.querySelector('.preferences-modal [name=language]').value");
  await evaluate("(()=>{const s=document.querySelector('.preferences-modal [name=language]');s.value='en';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.documentElement.lang==='en'", 'English interface');
  await evaluate("document.querySelector('.preferences-modal [data-x=cancel]').click()");
  // Later suites expect the tabs and workspace this one started with.
  const restoreTabs = await rememberTabs(evaluate);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Control proof' });
  const bar = `${root} .draw-control-bar`;
  const title = () => evaluate(`document.querySelector('${bar} [data-draw-cb-title]').textContent`);
  const set = (key, value) => evaluate(`(()=>{const i=document.querySelector('${bar} [data-draw-field=${key}]');i.value=${JSON.stringify(String(value))};i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const setTransform = (key, value) => evaluate(`(()=>{const i=document.querySelector('${root} .draw-flyout [data-draw-field=${key}]');i.value=${JSON.stringify(String(value))};i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const bounds = id => evaluate(`(async()=>{const b=${active}.renderer.bounds('${id}');return [b.x,b.y,b.width,b.height];})()`);
  const near = (actual, expected, label) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < .01, `${label}: ${actual} vs ${expected}`));

  // No selection: the paint for new objects.
  assert.equal(await title(), 'No Selection');
  await set('cb-stroke-weight', 1.5);
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.strokeWidth))()`), 1.5, 'Weight sets the stroke for new objects');
  assert.ok(await evaluate(`!!document.querySelector('${bar} [data-draw-cb=artboards]')`));

  // A selected rectangle: title, size, weight, opacity, align to the artboard and Expand Shape.
  const id = await evaluate(`(async()=>{const w=${active},{shapeFromDrag}=await import('./draw/tools/shapes.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),b=w.state.document.data.artboards[0];
    const node=shapeFromDrag('rectangle',[b.x+20,b.y+20],[b.x+40,b.y+30],{fill:'#FFFFFF',stroke:'#000000',strokeWidth:.5});w.state.history.execute(insertNode(w.state.document.data.layers[0].id,node));w.select([node.id]);return node.id;})()`);
  await until(`document.querySelector('${bar} [data-draw-cb-title]')?.textContent==='Rectangle'`, 'control bar follows the selection');
  const board = await evaluate(`(async()=>{const b=${active}.state.document.data.artboards[0];return [b.x,b.y];})()`);
  await evaluate(`(async()=>{${active}.state.ui.referencePoint=[0,0];})()`);
  assert.equal(await evaluate(`document.querySelectorAll('${bar} [data-draw-field=cb-x],${bar} [data-draw-field=cb-y],${bar} [data-draw-field=cb-width],${bar} [data-draw-field=cb-height]').length`), 0, 'Position and size no longer occupy the toolbar');
  assert.equal(await evaluate(`document.querySelector('${bar} [data-draw-cb-distribute=x]').disabled`), true, 'Distribution needs at least three editable objects');
  await evaluate(`document.querySelector('${bar} [data-draw-cb=transform]').click()`);
  assert.equal(await evaluate(`document.querySelector('${root} .draw-flyout').hidden`), false);
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-panel-body]').dataset.drawPanelBody`), 'transform');
  await setTransform('width', 50);
  near(await bounds(id), [board[0] + 20, board[1] + 20, 50, 10], 'W resizes from the reference point');
  await setTransform('x', board[0] + 5);
  near(await bounds(id), [board[0] + 5, board[1] + 20, 50, 10], 'X moves the selection');
  await setTransform('y', board[1] + 15);
  await setTransform('height', 12);
  near(await bounds(id), [board[0] + 5, board[1] + 15, 50, 12], 'Y and H remain editable in the window');
  await evaluate(`document.querySelector('${root} .draw-flyout__close').click()`);
  await set('cb-opacity', 40);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${id}').opacity))()`), .4);
  await set('cb-stroke-weight', 2);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${id}').appearance.strokes[0].width))()`), 2);
  await evaluate(`document.querySelector('${bar} [data-draw-cb-align=right]').click()`);
  const right = await bounds(id);
  assert.ok(Math.abs(right[0] + right[2] - (board[0] + 120)) < .01, `Align right moves a single object to the artboard edge: ${right}`);
  assert.ok(await evaluate(`!!document.querySelector('${bar} [data-draw-cb=expand-shape]')`), 'Expand Shape is offered for live shapes');

  // Equal gaps use spatial order and fixed endpoints, even if the Align panel targets the artboard or a key object.
  const distributed = await evaluate(`(async()=>{const w=${active},{shapeFromDrag}=await import('./draw/tools/shapes.mjs'),{insertNode}=await import('./draw/doc/commands.mjs');
    const nodes=[[0,0,10,10],[23,16,20,12],[90,60,15,8]].map(([x,y,width,height])=>shapeFromDrag('rectangle',[x,y],[x+width,y+height],{fill:'#FFFFFF',stroke:null}));
    w.state.history.transaction('Distribution fixture',()=>nodes.forEach(n=>w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n))));
    w.state.ui.alignTo='artboard';w.select([nodes[2].id,nodes[0].id,nodes[1].id]);return nodes.map(n=>n.id);})()`);
  const before = await Promise.all(distributed.map(bounds));
  for (const [axis,alignTo] of [['x','artboard'],['y','key']]) {
    await evaluate(`(async()=>{const w=${active};w.state.ui.alignTo='${alignTo}';w.state.ui.keyObject='${distributed[1]}';w.state.ui.alignSpacing=7;})()`);
    await evaluate(`document.querySelector('${bar} [data-draw-cb-distribute=${axis}]').click()`);
    const after = await Promise.all(distributed.map(bounds)), pos = axis === 'x' ? 0 : 1, size = pos + 2;
    near(after[0], before[0], 'First object stays fixed'); near(after[2], before[2], 'Last object stays fixed');
    assert.ok(Math.abs((after[1][pos]-after[0][pos]-after[0][size])-(after[2][pos]-after[1][pos]-after[1][size])) < .01, 'Equal gaps between differently sized objects');
    assert.equal(after[1][1-pos], before[1][1-pos], 'Distribution changes only the chosen axis');
    assert.equal(await evaluate(`(async()=>(${active}.state.ui.alignTo))()`), alignTo, 'Toolbar distribution preserves panel preferences');
    await evaluate(`(async()=>${active}.handle('undo'))()`);
    for (let i=0;i<distributed.length;i++) near(await bounds(distributed[i]), before[i], 'One undo restores the whole distribution');
    await evaluate(`(async()=>${active}.handle('redo'))()`);
    near(await bounds(distributed[1]), after[1], 'Redo restores distribution');
    await evaluate(`(async()=>${active}.handle('undo'))()`);
  }
  const shot = await client.command('Page.captureScreenshot', { format:'png' });
  await writeFile(join(tmpdir(),'modcut-draw-control-spacing.png'),Buffer.from(shot.data,'base64'));
  await evaluate(`(async()=>{const w=${active};w.state.ui.alignTo='selection';w.select(['${id}']);})()`);

  // Artboard tool: the active artboard's name and size.
  await evaluate(`(async()=>(${active}.setTool('artboard')))()`);
  await until(`document.querySelector('${bar} [data-draw-cb-title]')?.textContent==='Artboard'`, 'artboard mode');
  await set('cb-artboard-width', 150);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.data.artboards[0].width))()`), 150);
  await evaluate(`(async()=>(${active}.setTool('select')))()`);

  // View > Control Bar hides and shows it, and the choice is remembered.
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('View','Control Bar')"), true);
  await until(`document.querySelector('${bar}').hidden`, 'hidden from the View menu');
  assert.equal(await evaluate("localStorage.getItem('modcut.draw.controlBar')"), 'hidden');
  await evaluate(`(async()=>{${active}.handle('toggle-control-bar')})()`);
  assert.equal(await evaluate(`document.querySelector('${bar}').hidden`), false);
  assert.equal(await evaluate("localStorage.getItem('modcut.draw.controlBar')"), 'shown');

  // File > Send Artboard to Cut… sends this tab's only artboard straight into its empty Cut.
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('File','Send Artboard to Cut…')"), true);
  await until("document.body.dataset.workspace==='cut' && paper.project.layers[1].children.length>0", 'Send to Cut from the File menu');
  await restoreTabs();
  await evaluate("document.querySelector('#settings').click()");
  await until("!!document.querySelector('.preferences-modal [name=language]')", 'restore language preference');
  await evaluate(`(()=>{const s=document.querySelector('.preferences-modal [name=language]');s.value=${JSON.stringify(originalLanguage)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await evaluate("document.querySelector('.preferences-modal [data-x=cancel]').click()");
  console.log('PASS Draw control bar: position/size window, equal horizontal/vertical gaps with fixed endpoints and undo/redo, paint/opacity/weight, align to artboard, artboard size, View > Control Bar remembered, File > Send Artboard to Cut');
}
