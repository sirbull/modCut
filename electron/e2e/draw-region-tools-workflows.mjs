import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D3.4: Shape Builder merges and deletes regions, Knife splits shapes, Eraser removes a brush stroke. */
export async function runDrawRegionToolWorkflows(client) {
  const { evaluate } = client, { mouse } = inputHelpers(client), restore = await rememberTabs(evaluate);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 140, height: 90, name: 'Region tools proof' });
  const at = (x, y) => evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const stroke = async (points, modifiers = 0) => {
    await mouse('mouseMoved', await at(...points[0]), { modifiers }); await mouse('mousePressed', await at(...points[0]), { buttons: 1, modifiers });
    for (const p of points.slice(1)) await mouse('mouseMoved', await at(...p), { buttons: 1, modifiers });
    await mouse('mouseReleased', await at(...points.at(-1)), { modifiers });
  };
  const applied = () => evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const layer = () => evaluate(`(async()=>{const w=${active},d=w.state.document;return d.data.layers[0].children.map(n=>({id:n.id,b:(r=>[Math.round(r.x-d.data.artboards[0].x),Math.round(r.y-d.data.artboards[0].y),Math.round(r.width),Math.round(r.height)])(w.renderer.bounds(n.id))}))})()`);
  const add = (squares) => evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,ids=[];
    for(const [x,y,s,fill] of ${JSON.stringify(squares)}){const n=createNode('path',{subpaths:[{closed:true,segments:[[x,y],[x+s,y],[x+s,y+s],[x,y+s]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(fill,null)});w.state.history.execute(insertNode(L,n));ids.push(n.id);}
    w.select(ids);return ids;})()`);

  // Shape Builder (Shift+M): drag from the left part into the overlap; they merge, the right part stays.
  await add([[10, 10, 20, '#FF0000'], [20, 10, 20, '#0000FF']]);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'M',code:'KeyM',shiftKey:true,bubbles:true,cancelable:true}))");
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`), 'shape-builder');
  let steps = await applied();
  await stroke([[14, 20], [20, 20], [25, 20]]);
  let parts = await layer();
  assert.equal(parts.length, 2, `Merged region and the rest: ${JSON.stringify(parts)}`);
  assert.deepEqual(parts.map(p => p.b).sort(), [[10, 10, 20, 20], [30, 10, 10, 20]].sort(), 'Left plus overlap, and the right part');
  assert.equal(await applied(), steps + 1, 'One undo step');
  // Alt-drag deletes the region it crosses.
  await evaluate(`(async()=>(${active}.select(${JSON.stringify(parts.map(p => p.id))})))()`);
  await stroke([[34, 20], [36, 20]], 1);
  parts = await layer(); assert.deepEqual(parts.map(p => p.b), [[10, 10, 20, 20]], 'Alt removes the right part');
  await evaluate(`(async()=>{const w=${active};w.handle('undo');w.handle('undo');w.handle('undo');w.select([])})()`);

  // Knife: a line through a square makes two pieces.
  const [square] = await add([[60, 10, 20, '#00AA00']]);
  await evaluate(`(async()=>{${active}.select(['${square}']);${active}.setTool('knife')})()`);
  steps = await applied();
  await stroke([[70, 5], [70, 15], [70, 35]]);
  parts = (await layer()).filter(p => p.b[0] >= 59);
  assert.equal(parts.length, 2, `Two halves: ${JSON.stringify(parts)}`); assert.equal(await applied(), steps + 1);
  await evaluate(`(async()=>{${active}.handle('undo')})()`);

  // Eraser (Shift+E): a 4 mm brush across the square leaves two pieces with a gap between them.
  await evaluate(`(async()=>{const w=${active};w.select(['${square}']);w.state.ui.eraserSize=4;w.setTool('eraser')})()`);
  steps = await applied();
  await stroke([[55, 20], [70, 20], [85, 20]]);
  parts = (await layer()).filter(p => p.b[0] >= 59);
  assert.equal(parts.length, 2, `Erased across: ${JSON.stringify(parts)}`); assert.equal(await applied(), steps + 1);
  assert.ok(parts.every(p => p.b[3] <= 9), 'Each piece is shorter than half the square');
  await evaluate(`(async()=>{const w=${active};w.handle('undo');w.setTool('select')})()`);

  // Transform Each: two squares rotate 90° and move 5 mm, each around its own centre, in one step.
  const pair = await add([[10, 50, 10, '#333333'], [30, 50, 10, '#333333']]);
  await evaluate(`(async()=>(${active}.select(${JSON.stringify(pair)})))()`);
  steps = await applied();
  await evaluate(`(async()=>{${active}.handle('transform-each')})()`);
  for (let i = 0; i < 100 && !await evaluate("!!document.querySelector('.draw-transform-each-dialog form')"); i++) await wait(30);
  // Preview: each object is shown transformed while the dialog is open, before OK changes anything.
  const undoBefore = await evaluate(`(async()=>${active}.state.history.entries.filter(e=>e.applied).length)()`);
  await evaluate("(()=>{const f=document.querySelector('.draw-transform-each-dialog form');f.elements.scaleX.value='50';f.elements.moveX.value='5';f.dispatchEvent(new Event('input',{bubbles:true}));})()"); await wait(50);
  const previewed = await evaluate(`(async()=>{const w=${active};return {hidden:w.state.selection.ids.every(id=>!w.renderer.items.get(id).visible),steps:w.state.history.entries.filter(e=>e.applied).length}})()`);
  assert.deepEqual(previewed, { hidden: true, steps: undoBefore }, 'The originals give way to the preview; nothing is changed yet');
  await evaluate("document.querySelector('.draw-transform-each-dialog form').requestSubmit()"); await wait(80);
  let boxes = (await layer()).filter(p => pair.includes(p.id)).map(p => p.b);
  assert.deepEqual(boxes, [[18, 50, 5, 10], [38, 50, 5, 10]].map(b => b), `Each scaled around its centre and moved: ${JSON.stringify(boxes)}`);
  assert.equal(await applied(), steps + 1, 'Transform Each is one undo step');
  // Split Into Grid: one square becomes 2 x 2 cells with 2 mm gutters.
  await evaluate(`(async()=>(${active}.select(['${pair[0]}'])))()`);
  await evaluate(`(async()=>{${active}.handle('split-into-grid')})()`);
  for (let i = 0; i < 100 && !await evaluate("!!document.querySelector('.draw-split-grid-dialog form')"); i++) await wait(30);
  await evaluate("document.querySelector('.draw-split-grid-dialog form').requestSubmit()"); await wait(80);
  const cells = (await evaluate(`(async()=>(${active}.state.selection.ids))()`));
  assert.equal(cells.length, 4, 'Four cells');
  // Free Transform (E): drag the bottom-right corner of the other square out by 10 mm; that corner moves alone.
  await evaluate(`(async()=>{const w=${active};w.select(['${pair[1]}']);w.setTool('free-transform')})()`);
  const before = await evaluate(`(async()=>{const w=${active},b=w.renderer.bounds('${pair[1]}'),a=w.state.document.data.artboards[0];return [b.x-a.x,b.y-a.y,b.width,b.height]})()`);
  steps = await applied();
  await stroke([[before[0] + before[2], before[1] + before[3]], [before[0] + before[2] + 5, before[1] + before[3] + 5], [before[0] + before[2] + 10, before[1] + before[3] + 10]]);
  const after = await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('${pair[1]}'),a=w.state.document.data.artboards[0];return n.subpaths[0].segments.map(s=>[Math.round(s.p[0]-a.x),Math.round(s.p[1]-a.y)])})()`);
  assert.deepEqual(after, [[38, 50], [43, 50], [53, 70], [38, 60]], `Only the dragged corner moved: ${JSON.stringify(after)}`);
  assert.equal(await applied(), steps + 1, 'Free Distort is one undo step');
  await evaluate(`(async()=>(${active}.setTool('select')))()`); await restore();
  console.log('PASS Draw region tools: Shape Builder merges crossed regions and Alt deletes them, Knife splits a shape, Eraser removes a brush stroke, Transform Each, Split Into Grid and Free Distort, one undo step each');
}
