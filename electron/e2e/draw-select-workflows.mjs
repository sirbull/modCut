import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D3.5: Select menu (Inverse, Same, Object, Next Object, Reselect, saved selections), Magic Wand and Lasso. */
export async function runDrawSelectWorkflows(client) {
  const { evaluate } = client, { click, mouse, key } = inputHelpers(client), restore = await rememberTabs(evaluate);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 140, height: 90, name: 'Select proof' });
  const at = (x, y) => evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const selection = () => evaluate(`(async()=>(${active}.state.selection.ids))()`);
  const handle = id => evaluate(`(async()=>{${active}.handle('${id}')})()`);
  const ids = await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,sq=(x,y,fill,stroke=null)=>createNode('path',{subpaths:[{closed:true,segments:[[x,y],[x+15,y],[x+15,y+15],[x,y+15]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(fill,stroke,1)});
    const red=sq(10,10,'#FF0000','#000000'),pink=sq(30,10,'#F50A0A'),blue=sq(50,10,'#0000FF','#000000'),red2=sq(70,10,'#FF0000');
    const open=createNode('path',{subpaths:[{closed:false,segments:[[10,60],[60,60]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(null,'#000000',1)});
    for(const n of [red,pink,blue,red2,open])w.state.history.execute(insertNode(L,n));w.select([]);
    return {red:red.id,pink:pink.id,blue:blue.id,red2:red2.id,open:open.id};})()`);

  // Same Fill Color from the menu, Inverse, Reselect and Next Object Above/Below.
  await evaluate(`(async()=>(${active}.select(['${ids.red}'])))()`);
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Select','Inverse')"), true);
  assert.deepEqual((await selection()).sort(), [ids.pink, ids.blue, ids.red2, ids.open].sort(), 'Inverse');
  await evaluate(`(async()=>(${active}.select(['${ids.red}'])))()`); await handle('select-same-fill-color');
  assert.deepEqual((await selection()).sort(), [ids.red, ids.red2].sort(), 'Same Fill Color is exact');
  await evaluate(`(async()=>(${active}.select(['${ids.blue}'])))()`); await handle('reselect');
  assert.deepEqual(await selection(), [ids.blue], 'Reselect repeats Same Fill Color for the new selection');
  await handle('select-same-stroke-color');
  assert.deepEqual((await selection()).sort(), [ids.red, ids.blue, ids.open].sort());
  await evaluate(`(async()=>(${active}.select(['${ids.pink}'])))()`); await handle('select-next-above');
  assert.deepEqual(await selection(), [ids.blue]); await handle('select-next-below'); assert.deepEqual(await selection(), [ids.pink]);
  await handle('select-object-open-paths'); assert.deepEqual(await selection(), [ids.open], 'Select > Object > Open Paths');

  // Save Selection and Edit Selection, stored in the document as one undo step.
  await evaluate(`(async()=>(${active}.select(['${ids.red}','${ids.blue}'])))()`); await handle('save-selection');
  for (let i = 0; i < 100 && !await evaluate("!!document.querySelector('.draw-save-selection-dialog form')"); i++) await wait(30);
  assert.ok(await evaluate("!!document.querySelector('.draw-save-selection-dialog form')"), await evaluate("JSON.stringify({toasts:document.querySelector('#toasts')?.textContent,modals:[...document.querySelectorAll('.modal-overlay')].map(e=>e.innerHTML)})"));
  await evaluate("(()=>{const f=document.querySelector('.draw-save-selection-dialog form');f.elements.name.value='Pair';f.requestSubmit();})()"); await wait(80);
  assert.deepEqual(await evaluate(`(async()=>(${active}.state.document.data.settings.savedSelections))()`), [{ name: 'Pair', ids: [ids.red, ids.blue] }]);
  await evaluate(`(async()=>(${active}.select([])))()`); await handle('edit-selection');
  for (let i = 0; i < 100 && !await evaluate("!!document.querySelector('.draw-edit-selection-dialog form')"); i++) await wait(30);
  await evaluate("document.querySelector('.draw-edit-selection-dialog form').requestSubmit()"); await wait(80);
  assert.deepEqual((await selection()).sort(), [ids.red, ids.blue].sort(), 'Edit Selection selects the saved objects');

  // Magic Wand (Y): a click selects similar fills within the tolerance; Alt-click removes.
  await evaluate(`(async()=>(${active}.select([])))()`);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'y',code:'KeyY',bubbles:true,cancelable:true}))");
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`), 'magic-wand');
  await click(await at(17, 17));
  assert.deepEqual((await selection()).sort(), [ids.red, ids.pink, ids.red2].sort(), 'Close reds are selected, blue is not');
  // With the fill tolerance at 5, Alt-clicking the pink square removes only the pink one.
  await evaluate(`(async()=>{${active}.state.ui.magicWand={fill:true,fillTolerance:5}})()`);
  await click(await at(37, 17), 1); // Alt
  assert.deepEqual((await selection()).sort(), [ids.red, ids.red2].sort(), 'Alt-click removes what is similar within the tolerance');

  // Lasso (Q): drag around two anchors of the blue square; they become the selected anchors.
  await evaluate(`(async()=>(${active}.select([])))()`);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'q',code:'KeyQ',bubbles:true,cancelable:true}))");
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`), 'lasso');
  const path = [[47, 7], [68, 7], [68, 13], [47, 13]];
  await mouse('mouseMoved', await at(...path[0])); await mouse('mousePressed', await at(...path[0]), { buttons: 1 });
  for (const p of path.slice(1)) await mouse('mouseMoved', await at(...p), { buttons: 1 });
  await mouse('mouseMoved', await at(47, 8), { buttons: 1 }); await mouse('mouseReleased', await at(47, 8));
  const anchors = await evaluate(`(async()=>(${active}.state.selection.anchors.map(a=>[a.nodeId,a.segment])))()`);
  assert.deepEqual(anchors.map(a => a[0]), [ids.blue, ids.blue], `The two top anchors of the blue square: ${JSON.stringify(anchors)}`);
  // Alt+Ctrl: the same loop selects the whole blue square as an object.
  const mods = 1 | 2; // Alt and Ctrl
  await mouse('mouseMoved', await at(...path[0]), { modifiers: mods }); await mouse('mousePressed', await at(...path[0]), { buttons: 1, modifiers: mods });
  for (const p of path.slice(1)) await mouse('mouseMoved', await at(...p), { buttons: 1, modifiers: mods });
  await mouse('mouseMoved', await at(47, 8), { buttons: 1, modifiers: mods }); await mouse('mouseReleased', await at(47, 8), { modifiers: mods });
  assert.deepEqual(await evaluate(`(async()=>(${active}.state.selection.ids))()`), [ids.blue], 'The whole object is selected');
  // Polygonal Lasso is available beside Lasso in the existing selection flyout.
  await evaluate("document.querySelector('[data-draw-tool=lasso]').parentElement.querySelector('.draw-tool-more').click()");
  assert.equal(await evaluate("!document.querySelector('[data-draw-tool=polygonal-lasso]').disabled"), true);
  if(process.argv.includes('--screenshot'))await writeFile(join(tmpdir(),'modcut-polygonal-lasso-tools.png'),Buffer.from((await client.command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate("document.querySelector('[data-draw-tool=polygonal-lasso]').click()");
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`), 'polygonal-lasso');
  const selectedAnchors = () => evaluate(`(async()=>(${active}.state.selection.anchors.map(a=>[a.nodeId,a.segment])))()`);
  const polygonClicks = async (points, modifiers = 0) => { for(const p of points)await click(await at(...p), modifiers); };
  await evaluate(`(async()=>(${active}.select([])))()`);
  await polygonClicks(path);
  assert.deepEqual(await selection(), [], 'Releasing each click keeps the polygon open without changing selection');
  if(process.argv.includes('--screenshot'))await writeFile(join(tmpdir(),'modcut-polygonal-lasso-preview.png'),Buffer.from((await client.command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  // Hovering elsewhere previews a segment but must not add that position to the final polygon.
  await mouse('mouseMoved', await at(60, 30)); await key('Enter');
  assert.deepEqual(await selectedAnchors(), [[ids.blue, 0], [ids.blue, 1]], 'Enter selects only anchors inside the committed vertices');
  const lower = [[47, 22], [68, 22], [68, 28], [47, 28]];
  await polygonClicks([...lower, lower[0]], 8); // Shift, close at start
  assert.deepEqual((await selectedAnchors()).map(a=>a[1]).sort(), [0, 1, 2, 3], 'Shift and closing at the first vertex add anchors');
  await polygonClicks(path, 1); // Alt, finish with a double-click at the last vertex
  const last = await at(...path.at(-1));
  for(const [type,buttons] of [['mousePressed',1],['mouseReleased',0]])await client.command('Input.dispatchMouseEvent',{type,...last,button:'left',buttons,modifiers:1,clickCount:2});
  assert.deepEqual((await selectedAnchors()).map(a=>a[1]), [2, 3], 'Alt and double-click subtract the top anchors');
  await polygonClicks([...path, [70, 35]]); await key('Backspace'); await key('Enter');
  assert.deepEqual(await selectedAnchors(), [[ids.blue, 0], [ids.blue, 1]], 'Backspace removes the mistaken last vertex without deleting artwork');
  assert.ok(await evaluate(`(async()=>!!${active}.state.document.getNode('${ids.blue}'))()`));
  await polygonClicks(lower); await key('Escape'); await key('Enter');
  assert.deepEqual(await selectedAnchors(), [[ids.blue, 0], [ids.blue, 1]], 'Escape discards an unfinished polygon');
  await polygonClicks(path.slice(0, 2)); await key('Enter');
  assert.deepEqual(await selectedAnchors(), [[ids.blue, 0], [ids.blue, 1]], 'Two vertices cannot complete a polygon');
  await handle('tool.select'); await handle('tool.polygonal-lasso'); await key('Enter');
  assert.deepEqual(await selectedAnchors(), [[ids.blue, 0], [ids.blue, 1]], 'Switching tools discards the unfinished polygon');
  await polygonClicks(lower); await evaluate("window.dispatchEvent(new Event('blur'))"); await key('Enter');
  assert.deepEqual(await selectedAnchors(), [[ids.blue, 0], [ids.blue, 1]], 'Losing focus cancels the polygon without changing selection');
  await polygonClicks([path[0]]); await key('Backspace'); await key('Enter');
  assert.deepEqual(await selectedAnchors(), [[ids.blue, 0], [ids.blue, 1]], 'Removing the only vertex cancels the polygon');
  // The shortcut keeps the original Q binding and adds Shift+Q for the polygonal variant.
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'q',code:'KeyQ',bubbles:true,cancelable:true}))");
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`), 'lasso');
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Q',code:'KeyQ',shiftKey:true,bubbles:true,cancelable:true}))");
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`), 'polygonal-lasso');
  await polygonClicks([...path, path[0]], mods);
  assert.deepEqual(await selection(), [ids.blue], 'Alt+Ctrl polygon selects the whole object');
  assert.deepEqual(await selectedAnchors(), [], 'Whole-object mode clears anchor selection');
  // Select > Object > Direction Handles: all four anchors of a selected ellipse, so its handles show.
  const ellipseAnchors = await evaluate(`(async()=>{const w=${active},{insertNode}=await import('./draw/doc/commands.mjs'),{shapeFromDrag}=await import('./draw/tools/shapes.mjs');
    const b=w.state.document.data.artboards[0],n=shapeFromDrag('ellipse',[b.x+80,b.y+40],[b.x+100,b.y+55],{fill:'#00AA00'});w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));
    w.setTool('direct-selection');w.select([n.id]);w.handle('select-object-direction-handles');return w.state.selection.anchors.length;})()`);
  assert.equal(ellipseAnchors, 4);
  await evaluate(`(async()=>(${active}.setTool('select')))()`); await restore();
  console.log('PASS Draw select: Select menu, Magic Wand, Lasso, Polygonal Lasso flyout and shortcut, click vertices, Enter/start/double-click completion, Shift/Alt, Backspace, Escape, tool switching, whole objects with Alt+Ctrl, Direction Handles');
}
