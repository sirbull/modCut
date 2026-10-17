import assert from 'node:assert/strict';
import { wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D3.2 part A: live vector effects (Round Corners, Offset Path, Transform) in Appearance, Send to Cut and Expand Appearance. */
export async function runDrawEffectWorkflows(client) {
  const { evaluate } = client, restore = await rememberTabs(evaluate);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 140, height: 90, name: 'Effects proof' });
  const root = '.draw-project[style*=block]';
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(40); } assert.fail(`Timed out: ${label}`); };
  const [a, b] = await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const bd=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,ids=[];
    for(const x of [10,80]){const n=createNode('path',{subpaths:[{closed:true,segments:[[x,10],[x+20,10],[x+20,30],[x,30]].map(p=>({p:[bd.x+p[0],bd.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance('#3366CC',null)});w.state.history.execute(insertNode(L,n));ids.push(n.id);}
    w.select([ids[0]]);return ids;})()`);
  const box = id => evaluate(`(async()=>{const w=${active},r=w.renderer.bounds('${id}'),bd=w.state.document.data.artboards[0];return [r.x-bd.x,r.y-bd.y,r.width,r.height].map(v=>Math.round(v*100)/100)})()`);
  const dialog = async (values) => {
    await until("!!document.querySelector('.draw-effect-dialog form')", 'effect dialog');
    await evaluate(`(()=>{const f=document.querySelector('.draw-effect-dialog form');for(const [k,v] of Object.entries(${JSON.stringify(values)}))f.elements[k].value=String(v);f.requestSubmit();})()`); await wait(80);
  };
  const steps = () => evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);

  // Effect > Stylize > Round Corners from the menu, then Offset Path and Transform from the commands.
  let before = await steps();
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Effect','Round Corners…')"), true);
  await dialog({ radius: 4 });
  assert.equal(await steps(), before + 1, 'Adding an effect is one undo step');
  assert.equal(await evaluate(`(async()=>(${active}.renderer.items.get('${a}').segments.length))()`), 8, 'Drawn with rounded corners');
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${a}').subpaths[0].segments.length))()`), 4, 'The anchors stay editable');
  await evaluate(`(async()=>{${active}.handle('effect-offset-path')})()`); await dialog({ distance: 2 });
  await until(`(async()=>{const w=${active},r=w.renderer.bounds('${a}');return Math.abs(r.width-24)<.01})()`, 'offset drawn');
  assert.deepEqual(await box(a), [8, 8, 24, 24], 'Offset Path grows the drawn shape by 2 mm');
  await evaluate(`(async()=>{${active}.handle('effect-transform')})()`); await dialog({ moveX: 30, copies: 1 });
  assert.deepEqual(await box(a), [8, 8, 54, 24], 'Transform adds a moved copy');

  // Appearance lists the effects; the eye hides one, the bin deletes one.
  await evaluate(`(async()=>{${active}.handle('panel.appearance')})()`); await wait(50);
  assert.equal(await evaluate(`document.querySelectorAll('${root} [data-draw-effect]').length`), 3);
  await evaluate(`(()=>{const e=document.querySelector('${root} [data-draw-effect-toggle="2"]');e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(50);
  assert.deepEqual(await box(a), [8, 8, 24, 24], 'Hiding Transform removes the copy');
  await evaluate(`document.querySelector('${root} [data-draw-effect-delete="2"]').click()`); await wait(50);
  assert.equal((await evaluate(`(async()=>(${active}.state.document.getNode('${a}').appearance.effects.length))()`)), 2);

  // Send to Cut gets the drawn geometry; Apply Last Effect repeats the last effect on another object.
  const minX = await evaluate(`(async()=>{const w=${active},svg=w.cutSvg(w.state.document.data.artboards[0].id).svg,d=svg.match(/ d="([^"]+)"/)[1],n=d.match(/-?[\\d.]+/g).map(Number);return Math.min(...n.filter((_,i)=>i%2===0))})()`);
  assert.ok(Math.abs(minX - 8) < .01, `The cut path follows the offset edge: ${minX}`);
  await evaluate(`(async()=>{const w=${active};w.select(['${b}']);w.handle('effect-last')})()`); await wait(80);
  assert.deepEqual((await evaluate(`(async()=>(${active}.state.document.getNode('${b}').appearance.effects.map(e=>e.type)))()`)), ['transform'], 'Apply Last Effect uses the last settings without a dialog');
  // Expand Appearance bakes the effects into a plain path.
  await evaluate(`(async()=>{const w=${active};w.select(['${a}']);w.handle('expand-appearance')})()`);
  await until(`(async()=>!${active}.state.document.getNode('${a}'))()`, 'expanded');
  const baked = await evaluate(`(async()=>{const w=${active},id=w.state.selection.ids[0],n=w.state.document.getNode(id);return {effects:n.appearance.effects.length,count:n.subpaths[0].segments.length}})()`);
  assert.equal(baked.effects, 0); assert.ok(baked.count > 4, 'The rounded, offset outline is now real anchors');
  await restore();
  console.log('PASS Draw effects: Round Corners, Offset Path and Transform as live effects (menu and commands, one undo step each), hide and delete in Appearance, Send to Cut and Apply Last Effect use them, Expand Appearance bakes them');
}
