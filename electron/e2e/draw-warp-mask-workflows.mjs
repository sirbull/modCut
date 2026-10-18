import assert from 'node:assert/strict';
import { wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D4.3: Effect > Warp styles, and opacity masks (Make, Clip, Invert, Release) on canvas, PNG, SVG and Cut. */
export async function runDrawWarpMaskWorkflows(client) {
  const { evaluate } = client, restore = await rememberTabs(evaluate);
  const root = '.draw-project[style*=block]';
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(40); } assert.fail(`Timed out: ${label}`); };
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 140, height: 90, name: 'Warp and mask proof' });
  const add = (items) => evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,ids=[];
    for(const [x,y,width,height,fill] of ${JSON.stringify(items)}){const n=createNode('path',{subpaths:[{closed:true,segments:[[x,y],[x+width,y],[x+width,y+height],[x,y+height]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(fill,null)});w.state.history.execute(insertNode(L,n));ids.push(n.id);}
    w.select(ids);return ids;})()`);
  const png = (points) => evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],url=w.exportBoard(b.id,'png',{ppi:72,background:'white'}),img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return ${JSON.stringify(points)}.map(([x,y])=>[...g.getImageData(Math.round(x/25.4*72),Math.round(y/25.4*72),1,1).data].slice(0,3))})()`);

  // Effect > Warp > Arch… opens Warp Options with Arch chosen; 50 % lifts the middle of the 10 mm bar by 2.5 mm.
  const [bar] = await add([[10, 20, 60, 10, '#3366CC']]);
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Effect','Arch…')"), true);
  await until("!!document.querySelector('.draw-effect-dialog form')", 'Warp Options');
  assert.equal(await evaluate("document.querySelector('.draw-effect-dialog form').elements.style.value"), 'arch');
  await evaluate("document.querySelector('.draw-effect-dialog form').requestSubmit()"); await wait(80);
  const warped = await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('${bar}'),r=w.renderer.bounds('${bar}'),b=w.state.document.data.artboards[0];
    return {effect:n.appearance.effects[0],anchors:n.subpaths[0].segments.length,top:Math.round((r.y-b.y)*10)/10,height:Math.round(r.height*10)/10}})()`);
  assert.equal(warped.effect.type, 'warp'); assert.equal(warped.effect.style, 'arch'); assert.equal(warped.anchors, 4, 'The bar keeps its four anchors');
  assert.deepEqual([warped.top, warped.height], [17.5, 12.5], `The middle rises 2.5 mm: ${JSON.stringify(warped)}`);
  assert.match(await evaluate(`(async()=>{const w=${active};w.handle('panel.appearance');await new Promise(r=>setTimeout(r,50));return document.querySelector('${root} [data-draw-effect]')?.textContent??''})()`), /Warp: Arch/);
  await evaluate(`(async()=>{const w=${active},{removeNode}=await import('./draw/doc/commands.mjs');w.state.history.execute(removeNode('${bar}'))})()`);

  // Opacity mask: a red square masked by a white-to-black pair of bars (white left, black right).
  const [art, white, black] = await add([[10, 40, 40, 20, '#FF0000'], [10, 40, 20, 20, '#FFFFFF'], [30, 40, 20, 20, '#000000']]);
  const maskArt = await evaluate(`(async()=>{const w=${active};w.select(['${white}','${black}']);w.handle('group');return w.state.selection.ids[0]})()`);
  await evaluate(`(async()=>{const w=${active};w.select(['${art}','${maskArt}']);w.handle('panel.transparency')})()`); await wait(50);
  let steps = await evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  await evaluate(`document.querySelector('${root} [data-draw-mask=make]').click()`); await wait(80);
  const group = await evaluate(`(async()=>(${active}.state.selection.ids[0]))()`);
  const made = await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('${group}');return {mask:n.mask,kids:n.children.map(c=>c.id),steps:w.state.history.entries.filter(e=>e.applied).length}})()`);
  assert.deepEqual(made.mask, { clip: true, invert: false }); assert.deepEqual(made.kids, [art, maskArt]); assert.equal(made.steps, steps + 1, 'Make Mask is one undo step');
  // Under white the red shows, under black it is gone; outside the mask (Clip) nothing shows.
  let px = await png([[20, 50], [40, 50]]);
  assert.ok(px[0][0] > 220 && px[0][1] < 40, `Red under the white half: ${px[0]}`); assert.ok(px[1].every(v => v > 240), `Hidden under the black half: ${px[1]}`);
  // Invert swaps them.
  await evaluate(`(()=>{const i=document.querySelector('${root} [data-draw-mask-option=invert]');i.checked=true;i.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(80);
  px = await png([[20, 50], [40, 50]]);
  assert.ok(px[0].every(v => v > 240) && px[1][0] > 220 && px[1][1] < 40, `Inverted: ${JSON.stringify(px)}`);
  // SVG carries the masked group as an image; Cut leaves the mask art out and says so.
  const svg = await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.document.data.artboards[0].id,'svg')})()`);
  assert.match(svg, /<image /); assert.doesNotMatch(svg, /destination-in/);
  const cut = await evaluate(`(async()=>{const w=${active},r=w.cutSvg(w.state.document.data.artboards[0].id);return {count:r.count,warning:r.warnings.find(x=>/opacity mask/.test(x))??''}})()`);
  assert.equal(cut.count, 1, 'Only the red square is cut'); assert.match(cut.warning, /not applied in Cut/);
  // Release keeps both, unmasked.
  await evaluate(`document.querySelector('${root} [data-draw-mask=release]').click()`); await wait(80);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${group}').mask??null))()`), null);
  px = await png([[40, 50]]);
  assert.ok(px[0].every(v => v < 20), `The black bar shows again: ${px[0]}`);

  // Effect > Pathfinder > Subtract on a group: the front square cuts the back one, both stay editable.
  await evaluate(`(async()=>{const w=${active},{removeNode}=await import('./draw/doc/commands.mjs');w.state.history.execute(removeNode('${group}'))})()`);
  const [back, front] = await add([[80, 10, 30, 30, '#00AA00'], [95, 25, 30, 30, '#0000FF']]);
  const live = await evaluate(`(async()=>{const w=${active};w.select(['${back}','${front}']);w.handle('group');return w.state.selection.ids[0]})()`);
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Effect','Subtract')"), true); await wait(80);
  const liveNode = await evaluate(`(async()=>{const n=${active}.state.document.getNode('${live}');return {effects:n.appearance.effects,kids:n.children.length}})()`);
  assert.deepEqual(liveNode.effects, [{ type: 'pathfinder', op: 'minusFront' }]); assert.equal(liveNode.kids, 2);
  px = await png([[85, 15], [105, 35], [115, 45]]);
  assert.ok(px[0][1] > 140 && px[0][0] < 40, `Green outside the overlap: ${px[0]}`);
  assert.ok(px[1].every(v => v > 240) && px[2].every(v => v > 240), `The overlap and the front square are gone: ${JSON.stringify(px)}`);
  const liveCut = await evaluate(`(async()=>{const w=${active},r=w.cutSvg(w.state.document.data.artboards[0].id);return r.count})()`);
  assert.equal(liveCut, 1, 'Cut gets the one result path, not the two squares');
  await evaluate(`(async()=>{const w=${active};w.select(['${live}']);w.handle('expand-appearance')})()`); await wait(80);
  const expandedLive = await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode(w.state.selection.ids[0]),{paintHex}=await import('./draw/doc/paint.mjs');return {type:n.type,fill:paintHex(n.appearance.fills[0]),anchors:n.subpaths?.[0]?.segments.length}})()`);
  assert.deepEqual(expandedLive, { type: 'path', fill: '#00aa00', anchors: 6 }, 'Expand Appearance leaves the L-shaped result');
  await restore();
  console.log('PASS Draw warp and masks: Effect > Pathfinder Subtract on a group (canvas, Cut, Expand Appearance), Effect > Warp with the style chosen, the bar bent with its anchors kept; opacity mask Make (one undo step), luminance and Clip, Invert, SVG as an image, Cut without the mask art, Release');
}
