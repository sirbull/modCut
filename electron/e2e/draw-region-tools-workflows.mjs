import assert from 'node:assert/strict';
import { inputHelpers } from './cdp.mjs';
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
  await evaluate(`(async()=>(${active}.setTool('select')))()`); await restore();
  console.log('PASS Draw region tools: Shape Builder merges crossed regions and Alt deletes them, Knife splits a shape, Eraser removes a brush stroke, one undo step each');
}
