import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D3.5: Select menu (Inverse, Same, Object, Next Object, Reselect, saved selections), Magic Wand and Lasso. */
export async function runDrawSelectWorkflows(client) {
  const { evaluate } = client, { click, mouse } = inputHelpers(client), restore = await rememberTabs(evaluate);
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
  await evaluate(`(async()=>(${active}.setTool('select')))()`); await restore();
  console.log('PASS Draw select: Inverse from the Select menu, Same Fill and Stroke Color, Reselect, Next Object Above/Below, Open Paths, Save and Edit Selection, Magic Wand with tolerance and Alt, Lasso anchor selection');
}
