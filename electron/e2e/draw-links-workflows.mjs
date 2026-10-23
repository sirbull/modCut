import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D3.8: Document Info, Links, Crop Image and Cut's Edit in Draw. */
export async function runDrawLinkWorkflows(client) {
  const { evaluate } = client, restore = await rememberTabs(evaluate);
  const root = '.draw-project[style*=block]';
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(50); } assert.fail(`Timed out: ${label}`); };
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 140, height: 90, name: 'Links proof' });
  // A 40 x 20 px image placed at 40 x 20 mm, and a red square.
  const image = await evaluate(`(async()=>{const w=${active},c=document.createElement('canvas');c.width=40;c.height=20;const g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,20,20);g.fillStyle='#f00';g.fillRect(20,0,20,20);
    const out=await w.import({kind:'image',dataUrl:c.toDataURL('image/png'),widthMm:40,heightMm:20},'Tile');
    const {createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs'),b=w.state.document.data.artboards[0];
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,createNode('path',{subpaths:[{closed:false,segments:[[70,20],[90,20],[90,40]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(null,'#FF0000',.5)})));
    w.select([out.ids[0]]);return out.ids[0];})()`);

  // Document Info lists objects, anchors, open paths and the image.
  await evaluate(`(async()=>{${active}.handle('panel.document-info')})()`); await wait(50);
  const info = key => evaluate(`document.querySelector('${root} [data-draw-doc-info="${key}"]')?.textContent ?? null`);
  assert.equal(await info('anchors'), '3'); assert.equal(await info('open-paths'), '1'); assert.equal(await info('images'), '1');
  assert.match(await evaluate(`document.querySelector('${root} .draw-doc-info-list')?.parentElement.textContent`), /Tile: 40 × 20 px/);
  // Links lists the image; clicking its row selects it.
  await evaluate(`(async()=>{const w=${active};w.select([]);w.handle('panel.links')})()`); await wait(50);
  assert.equal(await evaluate(`document.querySelectorAll('${root} [data-draw-link]').length`), 1);
  await evaluate(`document.querySelector('${root} [data-draw-link] .draw-appearance-name').click()`);
  assert.deepEqual(await evaluate(`(async()=>(${active}.state.selection.ids))()`), [image]);

  // Crop Image: 20 mm off the left keeps the red half in place; the asset stays whole; reset brings it back.
  const steps = await evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  await evaluate(`(async()=>{${active}.handle('crop-image')})()`);
  await until("!!document.querySelector('.draw-crop-dialog form')", 'crop dialog');
  await evaluate("(()=>{const f=document.querySelector('.draw-crop-dialog form');f.elements.left.value='20';f.requestSubmit();})()"); await wait(80);
  const cropped = await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('${image}'),b=w.state.document.data.artboards[0];return {crop:n.crop,width:n.width,x:n.transform[4]-b.x,asset:w.state.document.data.assets[n.assetId].width}})()`);
  assert.deepEqual(cropped.crop, { x: .5, y: 0, width: .5, height: 1 }); assert.equal(cropped.width, 20); assert.equal(cropped.asset, 40, 'The asset is untouched');
  await until(`(async()=>(${active}.renderer.items.get('${image}').width===20))()`, 'cropped raster');
  const pixel = await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],url=w.exportBoard(b.id,'png',{ppi:72,background:'white'}),img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const at=(x,y)=>[...g.getImageData(Math.round(x/25.4*72),Math.round(y/25.4*72),1,1).data];
    const n=w.state.document.getNode('${image}');return {inside:at(n.transform[4]-b.x+10,n.transform[5]-b.y+10),left:at(n.transform[4]-b.x-5,n.transform[5]-b.y+10)}})()`);
  assert.ok(pixel.inside[0] > 200 && pixel.inside[1] < 60, `Only the red half shows: ${pixel.inside}`);
  assert.ok(pixel.left.slice(0, 3).every(v => v > 240), `The cropped black half is gone: ${pixel.left}`);
  assert.equal(await evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`), steps + 1, 'Crop is one undo step');
  await evaluate(`(async()=>{${active}.handle('crop-image')})()`);
  await until("!!document.querySelector('.draw-crop-dialog form')", 'crop dialog again');
  await evaluate("(()=>{const f=document.querySelector('.draw-crop-dialog form');f.elements.reset.checked=true;f.requestSubmit();})()"); await wait(80);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${image}').crop ?? null))()`), null, 'Reset shows the whole image');

  // The contextual action opens a compact live trace; preview leaves the document and history untouched.
  const traceBefore = await evaluate(`(async()=>{const w=${active};w.select(['${image}']);return {model:JSON.stringify(w.state.document.data),steps:w.state.history.entries.filter(e=>e.applied).length}})()`);
  assert.equal(await evaluate(`!!document.querySelector('${root} [data-draw-cb=image-trace]')`), true);
  await evaluate(`document.querySelector('${root} [data-draw-cb=image-trace]').click()`);
  const ready = () => until(`document.querySelector('${root} [data-draw-trace-stats]')?.dataset.tracePending==='false'&&!document.querySelector('${root} [data-draw-trace]').disabled`, 'live trace ready');
  const setTrace = (key,value,event='input') => evaluate(`(()=>{const i=document.querySelector('${root} [data-draw-field=trace-${key}]');i.value=${JSON.stringify(String(value))};i.dispatchEvent(new Event('${event}',{bubbles:true}));})()`);
  const rasterVisible = () => evaluate(`(async()=>${active}.renderer.items.get('${image}').visible)()`);
  await ready();
  assert.equal(await rasterVisible(), false, 'Live vectors replace the raster in the view');
  assert.equal(await evaluate(`document.querySelector('${root} .draw-trace__advanced').open`), false);
  assert.deepEqual(await evaluate(`(()=>{const i=document.querySelector('${root} [data-draw-field=trace-preset]'),p=i.closest('.draw-flyout');return [getComputedStyle(i).fontSize,i.getBoundingClientRect().height,p.scrollWidth<=p.clientWidth]})()`), ['12px',26,true], 'Compact selects fit without horizontal overflow');
  assert.deepEqual(await evaluate(`(async()=>{const w=${active};return {model:JSON.stringify(w.state.document.data),steps:w.state.history.entries.filter(e=>e.applied).length}})()`), traceBefore);
  await setTrace('view','source','change'); assert.equal(await rasterVisible(), true, 'View can show the original');
  await setTrace('view','outlines','change'); assert.equal(await rasterVisible(), false);
  await setTrace('view','result','change');
  await evaluate(`document.querySelector('${root} [data-draw-field=trace-preview]').click()`);
  assert.equal(await rasterVisible(), true, 'Disabling Preview restores the original');
  await evaluate(`document.querySelector('${root} [data-draw-field=trace-preview]').click()`); await ready();
  await evaluate(`document.querySelector('${root} .draw-trace__advanced summary').click()`); await wait(30);
  assert.equal(await evaluate(`document.querySelector('${root} .draw-trace__advanced').open`), true);
  await evaluate(`document.querySelector('${root} [data-draw-field=trace-ignoreWhite]').click()`); await ready();
  await setTrace('threshold',50); await ready();
  assert.match(await evaluate(`document.querySelector('${root} [data-draw-trace-stats]').textContent`), /Colors: 2/, 'Ignore White changes the actual BW result');
  await evaluate(`document.querySelector('${root} [data-draw-field=trace-ignoreWhite]').click()`); await ready();
  // A drag keeps focus and only the latest setting wins, including a temporarily empty result.
  await evaluate(`(()=>{const i=document.querySelector('${root} [data-draw-field=trace-threshold-slider]');i.focus();for(const value of [0,220,0]){i.value=value;i.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  await until(`document.querySelector('${root} [data-draw-trace-stats]')?.textContent.startsWith('Nothing to trace')`, 'empty live result');
  assert.equal(await evaluate(`document.activeElement.dataset.drawField`), 'trace-threshold-slider');
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-trace]').disabled`), true);
  await setTrace('threshold-slider',50); await ready();
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-field=trace-threshold]').value`), '50');
  await setTrace('mode','color','change'); await ready();
  assert.deepEqual(await evaluate(`(async()=>${active}.scope.project.getItem({name:'Image Trace preview'}).children.map(n=>n.fillColor.toCSS(true)).sort())()`), ['#000000','#ff0000'], 'Color mode previews real color paths');
  await setTrace('mode','gray','change'); await ready();
  assert.ok(await evaluate(`(async()=>${active}.scope.project.getItem({name:'Image Trace preview'}).children.every(n=>Math.abs(n.fillColor.red-n.fillColor.green)<1e-8&&Math.abs(n.fillColor.red-n.fillColor.blue)<1e-8))()`), 'Grayscale updates the actual preview paint');
  await setTrace('mode','bw','change'); await ready();
  await evaluate(`document.querySelector('${root} [data-draw-field=trace-fills]').click()`); await ready();
  assert.deepEqual(await evaluate(`(async()=>{const n=${active}.scope.project.getItem({name:'Image Trace preview'}).firstChild;return [n.fillColor===null,n.strokeColor.toCSS(true)]})()`), [true,'#000000'], 'Outline output has a stroke and no fill');
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-field=trace-strokeWidth]').disabled`), false);
  await setTrace('strokeWidth',.5); await ready();
  assert.equal(await evaluate(`(async()=>${active}.scope.project.getItem({name:'Image Trace preview'}).firstChild.strokeWidth)()`), .5);
  await evaluate(`document.querySelector('${root} [data-draw-field=trace-strokes]').click()`); await ready();
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-field=trace-fills]').checked`), true, 'At least one output type stays enabled');
  await writeFile(join(tmpdir(),'modcut-draw-image-trace.png'),Buffer.from((await client.command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  // Closing or changing the selection during a pending preview cannot leave a stale overlay behind.
  await setTrace('threshold-slider',220);
  await evaluate(`document.querySelector('${root} .draw-flyout__close').click()`); await wait(350);
  assert.equal(await rasterVisible(), true);
  await evaluate(`document.querySelector('${root} [data-draw-cb=image-trace]').click()`); await ready();
  await setTrace('threshold-slider',50);
  await evaluate(`(async()=>${active}.select([]))()`); await wait(350);
  assert.equal(await rasterVisible(), true);
  assert.equal(await evaluate(`!!document.querySelector('${root} [data-draw-cb=image-trace]')`), false);
  await evaluate(`(async()=>${active}.select(['${image}']))()`); await ready();
  assert.deepEqual(await evaluate(`(async()=>{const w=${active};return {model:JSON.stringify(w.state.document.data),steps:w.state.history.entries.filter(e=>e.applied).length}})()`), traceBefore);
  // Expand commits exactly the previewed black half as sharp-cornered vectors in one undo step.
  await evaluate(`(()=>{const s=document.querySelector('${root} [data-draw-field=trace-preset]');s.value='bw-logo';s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(30);
  await evaluate(`(()=>{const s=document.querySelector('${root} [data-draw-field=trace-threshold]');s.value='50';s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(30);
  await until(`document.querySelector('${root} [data-draw-trace-stats]')?.dataset.tracePending==='false'&&!document.querySelector('${root} [data-draw-trace]').disabled`, 'trace preview ready');
  await evaluate(`document.querySelector('${root} [data-draw-trace]').click()`);
  await until(`(async()=>{const w=${active};return w.state.document.getNode(w.state.selection.ids[0])?.type==='group'})()`, 'trace done');
  const traced = await evaluate(`(async()=>{const w=${active},d=w.state.document,g=d.getNode(w.state.selection.ids[0]),b=d.data.artboards[0],img=d.getNode('${image}'),r=w.renderer.bounds(g.children[0].id);
    return {anchors:g.children[0].subpaths[0].segments.length,type:g.type,kids:g.children.length,fill:(await import('./draw/doc/paint.mjs')).paintHex(g.children[0].appearance.fills[0]),hidden:!img.visible,box:[r.x-img.transform[4],r.y-img.transform[5],r.width,r.height].map(v=>Math.round(v)),stats:document.querySelector('${root} [data-draw-trace-stats]').textContent}})()`);
  assert.equal(traced.type, 'group'); assert.equal(traced.kids, 1); assert.equal(traced.fill, '#000000'); assert.equal(traced.hidden, true, 'The image is hidden under the trace');
  assert.deepEqual(traced.box, [0, 0, 20, 20], `The black half: ${JSON.stringify(traced)}`); assert.match(traced.stats, /Paths: 1/); assert.equal(traced.anchors, 4, 'A square stays four corner anchors');
  assert.equal(await evaluate(`(async()=>${active}.state.history.entries.filter(e=>e.applied).length)()`), traceBefore.steps+1);
  await evaluate(`(async()=>{${active}.handle('undo')})()`);
  assert.equal(await evaluate(`(async()=>${active}.state.document.getNode('${image}').visible)()`), true, 'Undo brings the image back');

  // Cut > Edit in Draw: send the line to Cut, right-click it there, and it comes back on a bed-sized artboard.
  await evaluate(`(async()=>{const w=${active};w.handle('undo');w.handle('undo');const {removeNode}=await import('./draw/doc/commands.mjs');w.state.history.execute(removeNode('${image}'));})()`);
  await evaluate("document.querySelector('#sendToCut').click()");
  await until("document.body.dataset.workspace==='cut'", 'Cut');
  const at = await evaluate(`(()=>{const item=paper.project.layers[1].children[0],p=paper.view.projectToView(item.bounds.center.add([0,0])),r=document.querySelector('.bed-canvas').getBoundingClientRect();
    const seg=item.segments?item.segments[1].point:item.bounds.topRight,q=paper.view.projectToView(seg);return {x:r.left+q.x,y:r.top+q.y}})()`);
  await evaluate(`(() => { const canvas=document.querySelector('.bed-canvas'),r=canvas.getBoundingClientRect(),event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:${at.x},clientY:${at.y}}); Object.defineProperties(event,{offsetX:{value:${at.x}-r.left},offsetY:{value:${at.y}-r.top}}); canvas.dispatchEvent(event); })()`);
  await until("!!document.querySelector('.ctx-menu [data-act=edit-in-draw]')", 'context menu');
  await evaluate("document.querySelector('.ctx-menu [data-act=edit-in-draw]').click()");
  await until("document.body.dataset.workspace==='draw'", 'back in Draw');
  await until(`(async()=>${active}.state.document.data.artboards.some(b=>b.name==='From Cut'))()`, 'From Cut artboard');
  const back = await evaluate(`(async()=>{const w=${active},d=w.state.document,b=d.data.artboards.find(x=>x.name==='From Cut'),id=w.state.selection.ids[0],n=d.getNode(id),r=w.renderer.bounds(id);
    return {count:w.state.selection.ids.length,stroke:(await import('./draw/doc/paint.mjs')).paintHex(n.appearance.strokes[0]),x:Math.round(r.x-b.x),y:Math.round(r.y-b.y)}})()`);
  assert.equal(back.count, 1); assert.equal(back.stroke, '#ff0000');
  assert.deepEqual([back.x, back.y], [70, 20], `Where it was on the bed (artboard origin at the bed origin): ${JSON.stringify(back)}`);
  await restore();
  console.log('PASS Draw links: Document Info counts, Links selects, Crop Image is non-destructive (canvas and PNG) and resettable, Image Trace makes a path per colour and hides the image, Cut Edit in Draw makes a bed-sized artboard');
}
