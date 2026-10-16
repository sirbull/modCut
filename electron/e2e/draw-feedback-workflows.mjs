import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, enterDraw } from './draw-test-helpers.mjs';

/** Live drawing feedback: Illustrator-style cursors and previews that stay visible mid-gesture. */
export async function runDrawFeedbackWorkflows(client) {
  const { evaluate } = client, { mouse, click, drag } = inputHelpers(client);
  const original = await evaluate("({id:document.querySelector('.doc-tab.is-active').dataset.tabId,cut:paper.project.layers[1].exportJSON({asString:true})})");
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Feedback proof' });
  const scratch = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const tool = id => evaluate(`(async()=>(${active}.setTool('${id}')))()`);
  const screen = p => evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${p})),b=w.scope.view.element.getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y}})()`);
  const cursor = () => evaluate(`(async()=>{const c=(await import('./draw/tools/cursors.mjs')).CURSORS,v=${active}.scope.view.element.style.cursor;return Object.keys(c).find(k=>c[k].replace(/\\s+/g,'')===v.replace(/\\s+/g,''))||v})()`);
  const shot = async name => { const s = await client.command('Page.captureScreenshot', { format: 'png' }); await writeFile(join(tmpdir(), name), Buffer.from(s.data, 'base64')); };
  // Count non-white canvas pixels in a small square around a world point (the artboard is white).
  const ink = p => evaluate(`(async()=>{const w=${active},v=w.scope.view,c=v.element,r=c.width/v.viewSize.width,q=v.projectToView(new w.scope.Point(${p}));
    const d=c.getContext('2d').getImageData(Math.round(q.x*r)-3,Math.round(q.y*r)-3,7,7).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]<600)n++;return n;})()`);

  // Draw with no fill and no stroke: the path must still be visible while drawing.
  await evaluate(`(async()=>{const w=${active};w.state.ui.fill=null;w.state.ui.stroke=null;})()`);
  await tool('pen');
  const a = await screen([20, 40]), b = await screen([60, 40]), c = await screen([60, 20]);
  await mouse('mouseMoved', a);
  assert.equal(await cursor(), 'pen-new', 'Pen shows the new-path cursor');
  await click(a);
  await mouse('mouseMoved', b); await wait(30);
  assert.equal(await cursor(), 'pen-active');
  assert.ok(await ink([40, 40]) > 0, 'The rubber-band segment is visible before the second click');
  await shot('modcut-draw-pen-rubberband.png');
  await mouse('mousePressed', b, { buttons: 1 });
  await mouse('mouseMoved', c, { buttons: 1 }); await wait(30);
  await shot('modcut-draw-pen-handles.png');
  assert.ok(await ink([60, 20]) > 0, 'The outgoing handle is visible while dragging');
  assert.ok(await ink([60, 60]) > 0, 'The mirrored incoming handle is visible while dragging');
  const curveMid = await evaluate(`(async()=>{const w=${active},items=w.scope.project.getItems({match:i=>i.className==='Path'&&i.segments?.length===2&&!i.data.nodeId});return items.length})()`);
  assert.ok(curveMid > 0, 'A live curve preview exists while dragging');
  await mouse('mouseReleased', c);
  await mouse('mouseMoved', a); await wait(30);
  assert.equal(await cursor(), 'pen-close', 'Hovering the first anchor shows the close cursor');
  await evaluate(`(async()=>(${active}.handle('cancel')))()`);
  const id = await evaluate(`(async()=>(${active}.state.snapshot().layers[0].children[0].id))()`);
  assert.ok(id);

  // Selection, Direct Selection, Hand and Zoom cursors.
  await tool('select'); await mouse('mouseMoved', await screen([100, 70]));
  assert.equal(await cursor(), 'select');
  await tool('direct-selection'); await mouse('mouseMoved', await screen([100, 70]));
  assert.equal(await cursor(), 'direct');
  await mouse('mouseMoved', a); assert.equal(await cursor(), 'direct-anchor', 'Direct Selection over an anchor');
  await tool('hand'); await mouse('mouseMoved', await screen([100, 70])); assert.equal(await cursor(), 'hand');
  await tool('zoom'); assert.equal(await cursor(), 'zoom-in');
  await tool('rectangle'); assert.equal(await cursor(), 'shape');
  await evaluate(`(async()=>{const w=${active};w.state.ui.fill='#FFCC00';w.state.ui.stroke='#071411';})()`);
  await drag(await screen([80, 50]), await screen([100, 70]));
  await tool('select'); await mouse('mouseMoved', await screen([90, 60]));
  assert.equal(await cursor(), 'select-anchor', 'Selection over an object');

  // Gallery of every cursor on light and dark backgrounds for visual review.
  await evaluate(`(async()=>{const c=(await import('./draw/tools/cursors.mjs')).CURSORS,g=document.createElement('div');g.id='cursor-gallery';g.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;flex-wrap:wrap;gap:6px;padding:12px;background:#fff';
    for(const [k,v] of Object.entries(c)){if(!v.startsWith('url('))continue;const src=v.slice(5,v.indexOf('")'));for(const bg of ['#fff','#163A31']){const d=document.createElement('div'),img=new Image(32,32),label=document.createElement('span');d.style.cssText='width:90px;height:60px;display:grid;place-items:center;font:10px sans-serif;background:'+bg+';color:'+(bg==='#fff'?'#000':'#fff');img.src=src;label.textContent=k;d.append(img,label);g.append(d);}}document.body.append(g);})()`);
  await wait(100); await shot('modcut-draw-cursors.png'); await evaluate("document.getElementById('cursor-gallery').remove()");
  await evaluate(`document.querySelector('[data-close-tab="${scratch}"]').click()`); await wait(100);
  if (await evaluate("!!document.querySelector('[data-x=discard]')")) { await evaluate("document.querySelector('[data-x=discard]').click()"); await wait(100); }
  await evaluate(`document.querySelector('[data-tab-id="${original.id}"]').click()`);
  if (await evaluate("document.body.dataset.workspace") === 'draw') await evaluate("document.querySelector('#workspaceToggle').click()");
  assert.equal(await evaluate("paper.project.layers[1].exportJSON({asString:true})"), original.cut);
  process.stdout.write('PASS Draw feedback: Illustrator-style cursors, visible Pen rubber band, live curve and handles without stroke/fill\n');
}
