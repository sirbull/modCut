import assert from 'node:assert/strict';
import { wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, rememberTabs, enterDraw } from './draw-test-helpers.mjs';

/** D1.9: the control bar follows the selection and the artboard tool, and View > Control Bar hides it. */
export async function runDrawControlWorkflows(client) {
  const { evaluate } = client;
  const root = '.draw-project[style*=block]';
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(50); } assert.fail(`Timed out: ${label}`); };
  // Later suites expect the tabs and workspace this one started with.
  const restoreTabs = await rememberTabs(evaluate);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Control proof' });
  const bar = `${root} .draw-control-bar`;
  const title = () => evaluate(`document.querySelector('${bar} [data-draw-cb-title]').textContent`);
  const set = (key, value) => evaluate(`(()=>{const i=document.querySelector('${bar} [data-draw-field=${key}]');i.value=${JSON.stringify(String(value))};i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
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
  await set('cb-width', 50);
  near(await bounds(id), [board[0] + 20, board[1] + 20, 50, 10], 'W resizes from the reference point');
  await set('cb-x', board[0] + 5);
  near(await bounds(id), [board[0] + 5, board[1] + 20, 50, 10], 'X moves the selection');
  await set('cb-opacity', 40);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${id}').opacity))()`), .4);
  await set('cb-stroke-weight', 2);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${id}').appearance.strokes[0].width))()`), 2);
  await evaluate(`document.querySelector('${bar} [data-draw-cb-align=right]').click()`);
  const right = await bounds(id);
  assert.ok(Math.abs(right[0] + right[2] - (board[0] + 120)) < .01, `Align right moves a single object to the artboard edge: ${right}`);
  assert.ok(await evaluate(`!!document.querySelector('${bar} [data-draw-cb=expand-shape]')`), 'Expand Shape is offered for live shapes');

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
  console.log('PASS Draw control bar: paint for new objects, selection title, X/W/opacity/weight, align to artboard, artboard size, View > Control Bar remembered, File > Send Artboard to Cut');
}
