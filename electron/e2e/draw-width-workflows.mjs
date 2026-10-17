import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D4.1: the Width tool and width profiles (Stroke panel presets and flips, Outline Stroke, PNG). */
export async function runDrawWidthWorkflows(client) {
  const { evaluate } = client, { mouse } = inputHelpers(client), restore = await rememberTabs(evaluate);
  const root = '.draw-project[style*=block]';
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(40); } assert.fail(`Timed out: ${label}`); };
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 140, height: 90, name: 'Width proof' });
  const at = (x, y) => evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const drag = async (points, modifiers = 0) => {
    await mouse('mouseMoved', await at(...points[0]), { modifiers }); await mouse('mousePressed', await at(...points[0]), { buttons: 1, modifiers });
    for (const p of points.slice(1)) await mouse('mouseMoved', await at(...p), { buttons: 1, modifiers });
    await mouse('mouseReleased', await at(...points.at(-1)), { modifiers });
  };
  const applied = () => evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  // A 2 mm black line from (20,40) to (100,40).
  const line = await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],n=createNode('path',{subpaths:[{closed:false,segments:[[20,40],[100,40]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(null,'#000000',2)});
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);return n.id;})()`);
  const profile = () => evaluate(`(async()=>(${active}.state.document.getNode('${line}').appearance.strokes[0].widthProfile??null))()`);
  const height = () => evaluate(`(async()=>{const w=${active};return Math.round(w.renderer.bounds('${line}').height*10)/10})()`);

  // Shift+W picks the Width tool; dragging from the middle of the line 3 mm up makes it 6 mm wide there, in one undo step.
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'W',code:'KeyW',shiftKey:true,bubbles:true,cancelable:true}))");
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`), 'width');
  let steps = await applied();
  await drag([[60, 40], [60, 38.5], [60, 37]]);
  let points = await profile();
  assert.deepEqual(points.map(p => p.t), [0, .5, 1], `A width point in the middle: ${JSON.stringify(points)}`);
  assert.ok(Math.abs(points[1].left - 1.5) < .05 && Math.abs(points[1].right - 1.5) < .05, `Both sides 3 mm: ${JSON.stringify(points[1])}`);
  assert.equal(await applied(), steps + 1, 'The drag is one undo step');
  assert.equal(await height(), 6, 'The drawn stroke is 6 mm wide in the middle');
  // Alt-drag on the lower side end widens only that side.
  await drag([[60, 43], [60, 45]], 1);
  points = await profile();
  assert.ok(Math.abs(points[1].left - 1.5) < .05 && Math.abs(points[1].right - 2.5) < .05, `Only one side grows: ${JSON.stringify(points[1])}`);
  // Double-click the width point: Width Point Edit sets each side in mm.
  const middle = await at(60, 40);
  await mouse('mouseMoved', middle); await evaluate(`document.querySelector('${root} canvas.draw-canvas').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:${middle.x},clientY:${middle.y}}))`);
  await until("!!document.querySelector('.draw-width-dialog form')", 'Width Point Edit');
  await evaluate("(()=>{const f=document.querySelector('.draw-width-dialog form');f.elements.left.value='1';f.elements.right.value='1';f.requestSubmit();})()"); await wait(80);
  points = await profile();
  assert.deepEqual([points[1].left, points[1].right], [.5, .5], 'Side 1 and 2 are 1 mm each (half of the 2 mm weight)');

  // Stroke panel: Profile lists the presets; Width Profile 3 tapers to the end, Flip Along reverses it, Uniform removes it.
  await evaluate(`(async()=>{const w=${active};w.select(['${line}']);w.handle('panel.stroke')})()`); await wait(50);
  const pick = value => evaluate(`(()=>{const s=document.querySelector('${root} [data-draw-field=stroke-profile]');s.value='${value}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-field=stroke-profile]').value`), 'custom', 'A Width tool profile shows as Custom');
  await pick('profile-3'); await wait(50);
  assert.deepEqual((await profile()).map(p => [p.t, p.left]), [[0, .5], [1, 0]]);
  await evaluate(`document.querySelector('${root} [data-draw-stroke-flip=along]').click()`); await wait(50);
  assert.deepEqual((await profile()).map(p => [p.t, p.left]), [[0, 0], [1, .5]], 'Flip Along tapers the other way');
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-field=stroke-profile]').value`), 'profile-4');
  // PNG: thick at the end, nothing at the start.
  const pixels = await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],url=w.exportBoard(b.id,'png',{ppi:150,background:'white'}),img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const at=(x,y)=>g.getImageData(Math.round(x/25.4*150),Math.round(y/25.4*150),1,1).data[0];
    return {end:at(99,40.7),start:at(21,40.7)}})()`);
  assert.ok(pixels.end < 60 && pixels.start > 200, `Wide at the end, nothing at the start: ${JSON.stringify(pixels)}`);
  // Outline Stroke turns the profile into a filled shape of the same outline.
  await evaluate(`(async()=>{${active}.handle('outline-stroke')})()`);
  await until(`(async()=>!${active}.state.document.getNode('${line}'))()`, 'outlined');
  const outlined = await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode(w.state.selection.ids[0]),r=w.renderer.bounds(n.id),b=w.state.document.data.artboards[0];
    return {fill:(await import('./draw/doc/paint.mjs')).paintHex(n.appearance.fills[0]),strokes:n.appearance.strokes.length,box:[r.x-b.x,r.y-b.y,r.width,r.height].map(v=>Math.round(v))}})()`);
  assert.equal(outlined.fill, '#000000'); assert.equal(outlined.strokes, 0); assert.deepEqual(outlined.box, [20, 39, 80, 2], `The tapered outline: ${JSON.stringify(outlined)}`);
  await evaluate(`(async()=>{${active}.handle('undo')})()`);
  await pick('uniform'); await wait(50);
  assert.equal(await profile(), null, 'Uniform is a plain stroke again');
  await restore();
  console.log('PASS Draw width: Width tool (Shift+W) adds and drags width points in one undo step, Alt for one side, Width Point Edit; Stroke panel profiles and Flip Along; PNG and Outline Stroke follow the profile');
}
