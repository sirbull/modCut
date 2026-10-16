import assert from 'node:assert/strict';
import { wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, rememberTabs } from './draw-test-helpers.mjs';

/** Send to Cut v1: an artboard reaches Cut's bed through the SVG import path, in millimetres, as one undo step. */
export async function runDrawCutWorkflows(client) {
  const { evaluate } = client;
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(50); } assert.fail(`Timed out: ${label}`); };
  // Later suites expect the tabs and workspace this one started with.
  const restoreTabs = await rememberTabs(evaluate);
  await evaluate("document.body.dataset.workspace==='draw'||document.querySelector('#workspaceToggle').click();document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Send proof' });
  const drawTab = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  // A red 20 mm square at (10, 10) on the artboard, a blue circle inside a scaled group, and a template reference.
  const board = await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,sq=(x,y,s)=>[{closed:true,segments:[[x,y],[x+s,y],[x+s,y+s],[x,y+s]].map(p=>({p,in:[0,0],out:[0,0]}))}];
    w.state.history.execute(insertNode(L,createNode('path',{id:'cut-red',subpaths:sq(b.x+10,b.y+10,20),appearance:appearance(null,'#FF0000',.1)})));
    w.state.history.execute(insertNode(L,createNode('group',{id:'cut-group',transform:[2,0,0,2,b.x+60,b.y+10],children:[createNode('shape',{id:'cut-ellipse',shape:'ellipse',params:{x:0,y:0,width:10,height:10},appearance:appearance(null,'#0000FF',.2)})]})));
    w.select([]);return {x:b.x,y:b.y};})()`);
  const tabs = await evaluate("document.querySelectorAll('.doc-tab').length");

  // The dialog summarises what will be sent before anything happens.
  await evaluate("document.querySelector('#sendToCut').click()");
  await until("!!document.querySelector('.draw-send-dialog form')", 'Send to Cut dialog');
  const summary = await evaluate("document.querySelector('[data-draw-send-summary]').textContent");
  assert.match(summary, /^2 paths will be sent/, summary);
  assert.equal(await evaluate("document.querySelector('.draw-send-dialog form').elements.target.value"), 'new-tab', 'A new Cut tab is the default target');
  await evaluate("document.querySelector('.draw-send-dialog form').requestSubmit()");
  await until("document.body.dataset.workspace==='cut'", 'switch to Cut');
  assert.equal(await evaluate("document.querySelectorAll('.doc-tab').length"), tabs + 1, 'Send to Cut opened a new tab');
  const placed = await evaluate(`(()=>{const items=paper.project.layers[1].children,find=c=>items.find(i=>i.strokeColor?.toCSS(true)===c);
    const r=find('#ff0000'),e=find('#0000ff');return {count:items.length,red:[r.bounds.x,r.bounds.y,r.bounds.width,r.bounds.height],redStroke:r.strokeWidth,blue:[e.bounds.x,e.bounds.y,e.bounds.width,e.bounds.height],blueStroke:e.strokeWidth,
      layers:[...document.querySelectorAll('#layers [data-color], #layers .layer')].length};})()`);
  assert.equal(placed.count, 2, JSON.stringify(placed));
  const near = (actual, expected, label) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < .01, `${label}: ${actual} vs ${expected}`));
  near(placed.red, [10, 10, 20, 20], 'The square keeps its artboard position at the bed origin');
  near(placed.blue, [60, 10, 20, 20], 'The scaled group is applied');
  assert.ok(Math.abs(placed.redStroke - .1) < 1e-6 && Math.abs(placed.blueStroke - .4) < 1e-6, 'Stroke widths are millimetres, scaled with the group');

  // Undo in Cut removes the whole send in one step.
  const mod = process.platform === 'darwin' ? 'metaKey' : 'ctrlKey';
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',bubbles:true,cancelable:true,${mod}:true}))`);
  assert.equal(await evaluate("paper.project.layers[1].children.length"), 0, 'One undo step removes the send');

  // Back in the Draw tab: Replace keeps the tab, centres on the bed when asked, and replaces what was there.
  await evaluate(`document.querySelector('.doc-tab[data-tab-id="${drawTab}"]').click()`);
  await until(`document.querySelector('.doc-tab.is-active').dataset.tabId==='${drawTab}'`, 'back to the Draw tab');
  const send = async (target, placement) => {
    if (await evaluate("document.body.dataset.workspace!=='draw'")) await evaluate("document.querySelector('#workspaceToggle').click()");
    await evaluate(`(async()=>{${active}.handle('send-to-cut')})()`);
    await until("!!document.querySelector('.draw-send-dialog form')", 'Send to Cut dialog from the command');
    await evaluate(`(()=>{const f=document.querySelector('.draw-send-dialog form');f.elements.target.value='${target}';f.elements.placement.value='${placement}';f.requestSubmit();})()`);
    await until("document.body.dataset.workspace==='cut'", `switch to Cut after ${target}`);
  };
  await send('add', 'origin');
  assert.equal(await evaluate("paper.project.layers[1].children.length"), 2, 'Add places the artboard in this tab');
  await evaluate("document.querySelector('#workspaceToggle').click()");
  await until("document.body.dataset.workspace==='draw'", 'back to Draw');
  await send('replace', 'center');
  assert.equal(await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId"), drawTab, 'Replace sends into this tab');
  const centred = await evaluate("(()=>{const items=paper.project.layers[1].children;const b=items.reduce((a,i)=>a?a.unite(i.bounds):i.bounds.clone(),null);return {count:items.length,center:[b.center.x,b.center.y]};})()");
  assert.equal(centred.count, 2);
  // The artboard (120 x 80) is centred, so the square sits 10 mm in from the artboard's corner on the bed.
  const bed = await evaluate("(()=>{const d=paper.project.layers[1].children.find(i=>i.strokeColor?.toCSS(true)==='#ff0000').bounds;return [d.x,d.y];})()");
  assert.ok(bed[0] > 10 && bed[1] > 10, `Centered placement moves the artboard off the origin: ${bed}`);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',bubbles:true,cancelable:true,${mod}:true}))`);
  const restored = await evaluate("(()=>{const items=paper.project.layers[1].children;return {count:items.length,x:items.find(i=>i.strokeColor?.toCSS(true)==='#ff0000')?.bounds.x};})()");
  assert.ok(restored.count === 2 && Math.abs(restored.x - 10) < .01, `One undo step restores the design that Replace removed: ${JSON.stringify(restored)}`);

  // An empty artboard cannot be sent.
  await evaluate("document.querySelector('#workspaceToggle').click()");
  await until("document.body.dataset.workspace==='draw'", 'Draw for the empty artboard');
  await evaluate(`(async()=>{const w=${active};w.state.history.execute((await import('./draw/doc/commands.mjs')).removeNode('cut-red'));w.state.history.execute((await import('./draw/doc/commands.mjs')).removeNode('cut-group'));})()`);
  await evaluate("document.querySelector('#sendToCut').click()");
  await until("!!document.querySelector('.draw-send-dialog form')", 'dialog for empty artboard');
  assert.equal(await evaluate("document.querySelector('.draw-send-dialog [type=submit]').disabled"), true, 'Send is disabled when nothing can be sent');
  await evaluate("document.querySelector('.draw-send-dialog [data-x=cancel]').click()");
  await restoreTabs();
  console.log('PASS Draw Send to Cut: dialog summary, new tab at the bed origin in millimetres, scaled strokes, one undo step, add and replace in this tab, centred placement, replace undone in one step, empty artboard disabled');
}
