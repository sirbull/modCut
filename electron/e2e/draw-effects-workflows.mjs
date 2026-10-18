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
  // Zig Zag on the other square; Drop Shadow draws a blurred raster under it, also in PNG export.
  await evaluate(`(async()=>{const w=${active},{updateNode}=await import('./draw/doc/commands.mjs'),n=w.state.document.getNode('${b}');w.state.history.execute(updateNode('${b}',{appearance:{...n.appearance,effects:[]}}));w.select(['${b}']);w.handle('effect-zig-zag')})()`); await dialog({ size: 1, ridges: 2 });
  assert.equal(await evaluate(`(async()=>(${active}.renderer.items.get('${b}').segments.length))()`), 12, 'Zig Zag: two ridges on each of the four sides');
  await evaluate(`(async()=>{${active}.handle('effect-drop-shadow')})()`); await dialog({ x: 3, y: 3, blur: 1, opacity: 100, color: '#ff0000' });
  assert.equal(await evaluate(`(async()=>!!${active}.renderer.items.get('${b}').previousSibling?.data?.shadow)()`), true, 'The shadow sits right under the object');
  const shadowPixel = await evaluate(`(async()=>{const w=${active},bd=w.state.document.data.artboards[0],url=w.exportBoard(bd.id,'png',{ppi:72,background:'white'});
    const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
    return [...g.getImageData(Math.round(102/25.4*72),Math.round(20/25.4*72),1,1).data]})()`);
  assert.ok(shadowPixel[0] > 200 && shadowPixel[1] < 120, `The red shadow shows below and right of the square in PNG: ${shadowPixel}`);
  // Effect > Rasterize… at 72 ppi: the square is drawn as pixels (its anchors stay), and SVG gets an image for it.
  const rasterized = await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const bd=w.state.document.data.artboards[0],n=createNode('path',{subpaths:[{closed:true,segments:[[40,50],[70,50],[70,80],[40,80]].map(p=>({p:[bd.x+p[0],bd.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance('#00AA00',null)});
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);return n.id;})()`);
  before = await steps();
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Effect','Rasterize…')"), true);
  await dialog({ ppi: 72, background: 'white' });
  assert.equal(await steps(), before + 1, 'Rasterize is one undo step');
  const raster = await evaluate(`(async()=>{const w=${active},item=w.renderer.items.get('${rasterized}'),r=item.parent.children.find(c=>c.data.rasterEffect&&c.data.nodeId==='${rasterized}');
    return {raster:!!r,className:r?.className,itemVisible:item.visible,width:r?.width,anchors:w.state.document.getNode('${rasterized}').subpaths[0].segments.length}})()`);
  assert.deepEqual([raster.raster, raster.className, raster.itemVisible, raster.anchors], [true, 'Raster', false, 4]);
  assert.ok(Math.abs(raster.width - 30 / 25.4 * 72) < 3, `About 85 pixels across at 72 ppi: ${raster.width}`);
  const rasterSvg = await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.document.data.artboards[0].id,'svg')})()`);
  assert.match(rasterSvg, /<image /, 'SVG export has the pixels as an image');
  const rasterPixel = await evaluate(`(async()=>{const w=${active},bd=w.state.document.data.artboards[0],url=w.exportBoard(bd.id,'png',{ppi:72,background:'white'});
    const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
    return [...g.getImageData(Math.round(55/25.4*72),Math.round(65/25.4*72),1,1).data]})()`);
  assert.ok(rasterPixel[1] > 140 && rasterPixel[0] < 60, `Green in PNG: ${rasterPixel}`);
  // Effect > Stylize > Outer Glow… on a black square: red light spreads outside it; Gaussian Blur softens the inside edge.
  const glowing = await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const bd=w.state.document.data.artboards[0],n=createNode('path',{subpaths:[{closed:true,segments:[[90,50],[120,50],[120,80],[90,80]].map(p=>({p:[bd.x+p[0],bd.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance('#000000',null)});
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);return n.id;})()`);
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Effect','Outer Glow…')"), true);
  await dialog({ color: '#ff0000', opacity: 100, blur: 2 });
  const glowPixels = () => evaluate(`(async()=>{const w=${active},bd=w.state.document.data.artboards[0],url=w.exportBoard(bd.id,'png',{ppi:144,background:'white'});
    const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
    return [[121,65],[105,65],[90.3,65]].map(([x,y])=>[...g.getImageData(Math.round(x/25.4*144),Math.round(y/25.4*144),1,1).data])})()`);
  let glow = await glowPixels();
  assert.ok(glow[0][0] > 200 && glow[0][1] < 200, `Red glow just outside the square: ${glow[0]}`);
  assert.ok(glow[1][0] < 40, `Black inside: ${glow[1]}`);
  await evaluate(`(async()=>{${active}.handle('effect-gaussian-blur')})()`); await dialog({ radius: 2 });
  glow = await glowPixels();
  assert.ok(glow[2][0] > 40 || glow[2][1] > 40, `The inside edge is soft after Gaussian Blur: ${glow[2]}`);
  assert.equal(await evaluate(`(async()=>${active}.state.document.getNode('${glowing}').appearance.effects.map(e=>e.type).join())()`), 'outer-glow,gaussian-blur');
  await restore();
  console.log('PASS Draw effects: Rasterize (pixels at the chosen ppi, anchors kept, image in SVG), Outer Glow and Gaussian Blur, Round Corners, Offset Path and Transform as live effects (menu and commands, one undo step each), hide and delete in Appearance, Send to Cut and Apply Last Effect use them, Expand Appearance bakes them; Zig Zag, and Drop Shadow on canvas and in PNG');
}
