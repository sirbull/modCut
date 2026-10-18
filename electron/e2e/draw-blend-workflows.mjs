import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D4.2: Blend Make, Options, Reverse, Expand and Release, the Blend tool, PNG and Send to Cut. */
export async function runDrawBlendWorkflows(client) {
  const { evaluate } = client, { mouse } = inputHelpers(client), restore = await rememberTabs(evaluate);
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(40); } assert.fail(`Timed out: ${label}`); };
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 140, height: 90, name: 'Blend proof' });
  const at = (x, y) => evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const click = async (x, y) => { const p = await at(x, y); await mouse('mouseMoved', p); await mouse('mousePressed', p, { buttons: 1 }); await mouse('mouseReleased', p); };
  const applied = () => evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const add = (squares) => evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,ids=[];
    for(const [x,y,s,fill] of ${JSON.stringify(squares)}){const n=createNode('path',{subpaths:[{closed:true,segments:[[x,y],[x+s,y],[x+s,y+s],[x,y+s]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(fill,null)});w.state.history.execute(insertNode(L,n));ids.push(n.id);}
    w.select(ids);return ids;})()`);
  const [red, blue] = await add([[10, 10, 10, '#FF0000'], [70, 10, 10, '#0000FF']]);

  // Make (Alt+Mod+B): one undo step, a group of the two keys; Smooth Color gives 64 steps from red to blue.
  let steps = await applied();
  await evaluate(`(async()=>{${active}.handle('blend-make')})()`);
  const blend = await evaluate(`(async()=>(${active}.state.selection.ids[0]))()`);
  const made = await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('${blend}');return {name:n.name,blend:n.blend,kids:n.children.map(c=>c.id),steps:w.renderer.blendSteps('${blend}').map(p=>p.steps.length)}})()`);
  assert.equal(made.name, 'Blend'); assert.deepEqual(made.kids, [red, blue]); assert.equal(made.blend.spacing, 'smooth'); assert.deepEqual(made.steps, [64]);
  assert.equal(await applied(), steps + 1, 'Make Blend is one undo step');
  // Blend Options from the Object menu: 3 specified steps, evenly spaced; the middle one is purple, in PNG too.
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Object','Blend Options…')"), true);
  await until("!!document.querySelector('.draw-blend-dialog form')", 'Blend Options');
  await evaluate("(()=>{const f=document.querySelector('.draw-blend-dialog form');f.elements.spacing.value='steps';f.elements.steps.value='3';f.requestSubmit();})()"); await wait(80);
  const options = await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],pairs=w.renderer.blendSteps('${blend}');
    return {blend:w.state.document.getNode('${blend}').blend,xs:pairs[0].steps.map(s=>Math.round(s.subpaths[0].segments[0].p[0]-b.x)),mid:pairs[0].steps[1].look.fill.map(v=>Math.round(v*100)/100)}})()`);
  assert.equal(options.blend.spacing, 'steps'); assert.equal(options.blend.steps, 3);
  assert.deepEqual(options.xs, [25, 40, 55], 'Steps are evenly spaced between the keys'); assert.deepEqual(options.mid, [.5, 0, .5]);
  const pixel = await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],url=w.exportBoard(b.id,'png',{ppi:72,background:'white'}),img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return [...g.getImageData(Math.round(45/25.4*72),Math.round(15/25.4*72),1,1).data]})()`);
  assert.ok(Math.abs(pixel[0] - 128) < 12 && pixel[1] < 20 && Math.abs(pixel[2] - 128) < 12, `The middle step is purple in PNG: ${pixel}`);
  // Send to Cut gets the keys and the steps: five paths.
  const cut = await evaluate(`(async()=>{const w=${active},r=w.cutSvg(w.state.document.data.artboards[0].id);return {count:r.count,purple:/fill="#80008[01]"|fill="#7f007f"/i.test(r.svg)}})()`);
  assert.equal(cut.count, 5, 'Two keys and three steps go to Cut'); assert.equal(cut.purple, true);
  // Reverse Front to Back swaps the keys' stacking order.
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Object','Reverse Front to Back')"), true); await wait(50);
  assert.deepEqual(await evaluate(`(async()=>(${active}.state.document.getNode('${blend}').children.map(c=>c.id)))()`), [blue, red]);
  await evaluate(`(async()=>{${active}.handle('undo')})()`);
  // Expand: the steps become paths between the keys, in a plain group.
  await evaluate(`(async()=>{const w=${active};w.select(['${blend}']);w.handle('blend-expand')})()`); await wait(50);
  const expanded = await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('${blend}'),{paintHex}=await import('./draw/doc/paint.mjs');return {blend:n.blend??null,kids:n.children.length,fills:n.children.map(c=>paintHex(c.appearance.fills[0])),steps:w.renderer.blendSteps('${blend}').length}})()`);
  assert.equal(expanded.blend, null); assert.equal(expanded.kids, 5); assert.equal(expanded.steps, 0);
  assert.equal(expanded.fills[0], '#ff0000'); assert.equal(expanded.fills[4], '#0000ff'); assert.match(expanded.fills[2], /^#(80|7f)00(80|7f)$/);
  await evaluate(`(async()=>{${active}.handle('undo')})()`);
  // Release: the keys stay, the steps go.
  await evaluate(`(async()=>{const w=${active};w.select(['${blend}']);w.handle('blend-release')})()`);
  assert.deepEqual(await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('${blend}');return [n.blend??null,n.children.length,w.renderer.blendSteps('${blend}').length]})()`), [null, 2, 0]);

  // Blend tool (W): click one object, then another.
  const [a, b] = await add([[10, 50, 10, '#00AA00'], [60, 60, 20, '#FFAA00']]);
  await evaluate(`(async()=>{${active}.select([])})()`);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'w',code:'KeyW',bubbles:true,cancelable:true}))");
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`), 'blend');
  await click(15, 55); assert.equal(await evaluate(`(async()=>(${active}.state.ui.blendFirst))()`), a);
  await click(70, 70);
  const tool = await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode(w.state.selection.ids[0]);return {blend:!!n.blend,kids:n.children.map(c=>c.id)}})()`);
  assert.deepEqual(tool, { blend: true, kids: [a, b] });
  await restore();
  console.log('PASS Draw blend: Make (one undo step, Smooth Color), Blend Options with specified steps, PNG and Send to Cut include the steps, Reverse Front to Back, Expand and Release; the Blend tool blends two clicked objects');
}
