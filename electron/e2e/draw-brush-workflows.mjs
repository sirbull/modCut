import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D4.4: Paintbrush with a calligraphic brush, and Blob Brush shapes that merge. */
export async function runDrawBrushWorkflows(client) {
  const { evaluate } = client, { mouse } = inputHelpers(client), restore = await rememberTabs(evaluate);
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(40); } assert.fail(`Timed out: ${label}`); };
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 140, height: 100, name: 'Brush proof' });
  const at = (x, y) => evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const drag = async (points) => {
    await mouse('mouseMoved', await at(...points[0])); await mouse('mousePressed', await at(...points[0]), { buttons: 1 });
    for (const p of points.slice(1)) await mouse('mouseMoved', await at(...p), { buttons: 1 });
    await mouse('mouseReleased', await at(...points.at(-1)));
  };
  const line = (from, to, n = 12) => Array.from({ length: n + 1 }, (_, i) => [from[0] + (to[0] - from[0]) * i / n, from[1] + (to[1] - from[1]) * i / n]);
  const key = (k, code, shift = false) => evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',code:'${code}',shiftKey:${shift},bubbles:true,cancelable:true}))`);
  const shapes = () => evaluate(`(async()=>{const w=${active},d=w.state.document,b=d.data.artboards[0];return d.data.layers[0].children.map(n=>{const r=w.renderer.bounds(n.id);return {id:n.id,box:[r.x-b.x,r.y-b.y,r.width,r.height].map(v=>Math.round(v))}})})()`);
  const applied = () => evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);

  // Paintbrush (B): right, then down. The default nib (30°, 30 % round) is thinner going right than going down.
  await key('b', 'KeyB');
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`), 'paintbrush');
  await drag([...line([10, 20], [60, 20]), ...line([60, 20], [60, 70]).slice(1)]);
  const brushed = await evaluate(`(async()=>{const w=${active},n=w.state.document.data.layers[0].children.at(-1),s=n.appearance.strokes[0];
    return {width:s.width,cap:s.cap,points:s.widthProfile.length,start:s.widthProfile[2].left+s.widthProfile[2].right,end:s.widthProfile.at(-3).left+s.widthProfile.at(-3).right,fills:n.appearance.fills.length}})()`);
  assert.equal(brushed.width, 2); assert.equal(brushed.cap, 'round'); assert.equal(brushed.points, 25); assert.equal(brushed.fills, 0);
  assert.ok(Math.abs(brushed.start - .65) < .05 && Math.abs(brushed.end - .906) < .05, `Thin going right, wider going down: ${JSON.stringify(brushed)}`);

  // Blob Brush (Shift+B), 4 mm from its options: a filled shape in the stroke colour; a crossing stroke merges into it.
  await key('B', 'KeyB', true);
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`), 'blob-brush');
  await evaluate(`(async()=>{${active}.handle('tool-dialog')})()`);
  await until("!!document.querySelector('.draw-blob-dialog form')", 'Blob Brush options');
  await evaluate("(()=>{const f=document.querySelector('.draw-blob-dialog form');f.elements.size.value='4';f.requestSubmit();})()"); await wait(50);
  const before = (await shapes()).length;
  let steps = await applied();
  await drag(line([20, 85], [50, 85]));
  await until(`(async()=>(${active}.state.document.data.layers[0].children.length===${before + 1}))()`, 'blob shape');
  let list = await shapes();
  assert.deepEqual(list.at(-1).box, [18, 83, 34, 4], `A 4 mm round-ended bar: ${JSON.stringify(list.at(-1))}`);
  const look = await evaluate(`(async()=>{const w=${active},n=w.state.document.data.layers[0].children.at(-1),{paintHex}=await import('./draw/doc/paint.mjs');return {fill:paintHex(n.appearance.fills[0]),strokes:n.appearance.strokes.length}})()`);
  assert.deepEqual(look, { fill: '#071411', strokes: 0 }, 'Filled with the stroke colour, no stroke');
  assert.equal(await applied(), steps + 1);
  steps = await applied();
  await drag(line([45, 75], [45, 95]));
  await until(`(async()=>{const w=${active},n=w.state.document.data.layers[0].children.at(-1),r=w.renderer.bounds(n.id),b=w.state.document.data.artboards[0];return Math.round(r.y-b.y)===73})()`, 'merged');
  list = await shapes();
  assert.equal(list.length, before + 1, 'The crossing stroke merged into the first shape');
  assert.deepEqual(list.at(-1).box, [18, 73, 34, 24]);
  assert.equal(await applied(), steps + 1, 'Merging is one undo step');
  // Path Eraser: dragging across a selected line erases that part, leaving two lines (one undo step).
  await evaluate(`(async()=>{const w=${active};w.handle('select-all');w.handle('delete')})()`);
  const zig = await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,mk=pts=>createNode('path',{subpaths:[{closed:false,segments:pts.map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(null,'#000000',.5)});
    const line=mk([[10,20],[130,20]]),wave=mk(Array.from({length:13},(_,i)=>[10+i*10,60+(i%2?3:-3)]));w.state.history.execute(insertNode(L,line));w.state.history.execute(insertNode(L,wave));w.select([line.id]);return [line.id,wave.id];})()`);
  await evaluate(`(async()=>{${active}.setTool('path-eraser')})()`);
  let undoSteps = await applied();
  await drag(line([70, 10], [70, 30], 6));
  assert.equal(await applied(), undoSteps + 1, 'One undo step');
  const erased = await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('${zig[0]}'),b=w.state.document.data.artboards[0];return n.subpaths.map(s=>[Math.round(s.segments[0].p[0]-b.x),Math.round(s.segments.at(-1).p[0]-b.x)])})()`);
  assert.equal(erased.length, 2); assert.equal(erased[0][0], 10); assert.equal(erased[1][1], 130);
  assert.ok(erased[0][1] < 70 && erased[1][0] > 70, `A gap round x 70: ${JSON.stringify(erased)}`);
  // Smooth: dragging along the selected zigzag fits it again with fewer anchors.
  await evaluate(`(async()=>{${active}.select(['${zig[1]}']);${active}.setTool('smooth')})()`);
  undoSteps = await applied();
  await drag(line([25, 60], [105, 60], 24));
  const smoothed = await evaluate(`(async()=>${active}.state.document.getNode('${zig[1]}').subpaths[0].segments.length)()`);
  assert.equal(await applied(), undoSteps + 1); assert.ok(smoothed < 13, `Fewer anchors after Smooth: ${smoothed}`);
  await restore();
  console.log('PASS Draw brushes: Path Eraser (a gap in the selected line, one undo step), Smooth (fewer anchors), Paintbrush (B) with a calligraphic width profile, Blob Brush (Shift+B) with options, fills in the stroke colour and merges touching shapes in one undo step');
}
