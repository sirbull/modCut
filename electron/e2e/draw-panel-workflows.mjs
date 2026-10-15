import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog } from './draw-test-helpers.mjs';

const root = ".draw-project[style*=block]";
export async function runDrawPanelWorkflows(client) {
  const { evaluate } = client, { click, drag } = inputHelpers(client);
  const original = await evaluate("({id:document.querySelector('.doc-tab.is-active').dataset.tabId,cut:paper.project.layers[1].exportJSON({asString:true})})");
  await evaluate("document.querySelector('#workspaceToggle').click();document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Panel proof' });
  const scratch = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const model = () => evaluate(`(async()=>(${active}.state.snapshot()))()`);
  const command = id => evaluate(`(async()=>(${active}.handle('${id}')))()`);
  const tool = id => evaluate(`(async()=>(${active}.setTool('${id}')))()`);
  const screen = p => evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${p})),b=w.scope.view.element.getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y}})()`);
  const center = selector => evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  const row = id => `${root} [data-draw-node="${id}"]`;
  const rowIds = () => evaluate(`[...document.querySelectorAll('${root} .draw-layer-row')].map(r=>r.dataset.drawNode)`);

  await tool('rectangle'); await drag(await screen([10, 10]), await screen([30, 20]));
  await evaluate(`document.querySelector('${root} [data-draw-panel=layers]').click()`);
  let data = await model(); const first = data.layers[0], rect = first.children[0];
  assert.deepEqual(await rowIds(), [first.id, rect.id], 'Layers lists one tree, top of stack first');
  assert.equal(await evaluate(`document.querySelectorAll('${root} .draw-layer-list').length`), 1);

  await evaluate(`document.querySelector('${root} [data-draw-layer-action=plus]').click()`);
  data = await model(); const second = data.layers[1];
  assert.equal(data.layers.length, 2); assert.notEqual(second.color, first.color, 'New layers cycle identification colors');
  assert.equal((await rowIds())[0], second.id);
  await tool('ellipse'); await drag(await screen([50, 10]), await screen([70, 30]));
  data = await model(); const ellipse = data.layers[1].children[0];
  assert.equal(ellipse.type, 'shape', 'Drawing targets the new active layer');

  // An image placed on Layer 1 is dimmed once Layer 1 becomes a template.
  await evaluate(`document.querySelector('${row(first.id)} .draw-layer-name').click()`);
  const png = await evaluate("(()=>{const c=document.createElement('canvas');c.width=20;c.height=10;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,20,10);return c.toDataURL('image/png')})()");
  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify([{ name: 'reference.png', ext: 'png', dataUrl: png }])})`);
  await evaluate("document.querySelector('#add').click()");
  for (let i = 0; i < 100 && (await model()).layers[0].children.length < 2; i++) await wait(50);
  data = await model(); const image = data.layers[0].children[1];
  assert.equal(image.type, 'image');
  for (let i = 0; i < 100 && !(await evaluate(`(async()=>(${active}.renderer.items.get('${image.id}')?.loaded))()`)); i++) await wait(50);
  assert.equal(await evaluate(`(async()=>(${active}.renderer.items.get('${image.id}').opacity))()`), 1);

  const undoDepth = await evaluate(`(async()=>(${active}.state.history.entries.length))()`);
  await evaluate(`document.querySelector('${row(first.id)} .draw-layer-name').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  assert.equal(await evaluate("document.querySelector('.draw-layer-dialog .panel__header').textContent"), 'Layer Options');
  await evaluate("(()=>{const f=document.querySelector('.draw-layer-dialog form');f.elements.name.value='Reference';f.elements.template.checked=true;f.elements.template.dispatchEvent(new Event('input',{bubbles:true}));f.requestSubmit();})()");
  await wait(50);
  data = await model(); let layer = data.layers[0];
  assert.deepEqual([layer.name, layer.template, layer.locked, layer.printable, layer.dimImages], ['Reference', true, true, false, true]);
  assert.equal(await evaluate(`(async()=>(${active}.state.history.entries.length))()`), undoDepth + 1, 'Layer Options is one undo step');
  assert.ok(Math.abs(await evaluate(`(async()=>(${active}.renderer.items.get('${image.id}').opacity))()`) - .5) < 1e-9, 'Template images are dimmed to 50%');
  assert.equal(await evaluate(`document.querySelector('${row(first.id)} [data-draw-toggle=visible] use').getAttribute('href').split('#')[1]`), 'icon-template');
  await command('outline');
  assert.equal(await evaluate(`(async()=>(${active}.renderer.items.get('${image.id}').visible))()`), true, 'Template layers stay previewed in Outline view');
  assert.equal(await evaluate(`(async()=>(${active}.renderer.items.get('${ellipse.id}').fillColor===null))()`), true);
  await command('outline');
  // Locked template artwork cannot be selected from the canvas.
  await tool('select'); await click(await screen([20, 15]));
  assert.deepEqual(await evaluate(`(async()=>(${active}.state.selection.ids))()`), []);
  await command('undo');
  assert.equal((await model()).layers[0].template, false); assert.equal(await evaluate(`(async()=>(${active}.renderer.items.get('${image.id}').opacity))()`), 1);

  // Alt-click the eye: solo, then show all; Ctrl/Cmd-click toggles Outline for one layer.
  const alt = 1, mod = process.platform === 'darwin' ? 4 : 2;
  await click(await center(`${row(second.id)} [data-draw-toggle=visible]`), alt);
  assert.deepEqual((await model()).layers.map(l => l.visible), [false, true]);
  await click(await center(`${row(second.id)} [data-draw-toggle=visible]`), alt);
  assert.deepEqual((await model()).layers.map(l => l.visible), [true, true]);
  await click(await center(`${row(second.id)} [data-draw-toggle=visible]`), mod);
  assert.equal((await model()).layers[1].preview, false);
  assert.equal(await evaluate(`(async()=>(${active}.renderer.items.get('${ellipse.id}').fillColor===null))()`), true, 'Per-layer Outline');
  assert.notEqual(await evaluate(`(async()=>(${active}.renderer.items.get('${rect.id}').fillColor===null))()`), true);
  await command('undo');
  await evaluate(`document.querySelector('${row(first.id)} [data-draw-toggle=locked]').click()`);
  assert.equal((await model()).layers[0].locked, true); await command('undo');

  // Drag the ellipse into Layer 1 with real HTML drag events, then undo.
  await evaluate(`(()=>{const source=document.querySelector('${row(ellipse.id)}'),target=document.querySelector('${row(first.id)}'),b=target.getBoundingClientRect(),dt=new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));
    const at={bubbles:true,cancelable:true,dataTransfer:dt,clientX:b.x+b.width/2,clientY:b.y+b.height/2};
    target.dispatchEvent(new DragEvent('dragover',at));target.dispatchEvent(new DragEvent('drop',at));})()`);
  data = await model();
  assert.deepEqual(data.layers[0].children.map(n => n.id), [rect.id, image.id, ellipse.id], 'Drop inside moves to the top of the layer');
  assert.equal(data.layers[1].children.length, 0);
  await command('undo'); assert.equal((await model()).layers[1].children[0].id, ellipse.id);

  // Collect in New Layer and Release to Layers are each one undoable step.
  await evaluate(`document.querySelector('${row(rect.id)} .draw-layer-name').click()`);
  await evaluate(`document.querySelector('${row(image.id)} .draw-layer-name').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))`);
  assert.deepEqual(await evaluate(`(async()=>(${active}.state.selection.ids))()`), [rect.id, image.id]);
  assert.equal(await evaluate(`document.querySelector('${row(rect.id)} .draw-layer-target').classList.contains('is-selected')`), true);
  await evaluate(`document.querySelector('${root} [data-draw-layer-action=stack-push]').click()`);
  data = await model(); const collected = data.layers[0].children[0];
  assert.equal(collected.type, 'layer'); assert.deepEqual(collected.children.map(n => n.id), [rect.id, image.id]);
  await command('undo'); assert.equal((await model()).layers[0].children[0].id, rect.id);
  await evaluate(`document.querySelector('${row(first.id)} .draw-layer-name').click()`);
  await evaluate(`document.querySelector('${root} [data-draw-layer-action=stack-pop]').click()`);
  assert.deepEqual((await model()).layers[0].children.map(n => n.type), ['layer', 'layer']);
  await command('undo');

  // Delete layer removes the active layer; undo restores it.
  await evaluate(`document.querySelector('${row(second.id)} .draw-layer-name').click()`);
  await evaluate(`document.querySelector('${root} [data-draw-layer-action=trash]').click()`);
  assert.equal((await model()).layers.length, 1); await command('undo');
  assert.equal((await model()).layers.length, 2);

  // Inline rename of an object row.
  await evaluate(`document.querySelector('${row(ellipse.id)} .draw-layer-name').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await evaluate(`(()=>{const i=document.querySelector('${root} .draw-layer-rename');i.value='Badge';i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal((await model()).layers[1].children[0].name, 'Badge');
  const shot = await client.command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(tmpdir(), 'modcut-draw-layers-panel.png'), Buffer.from(shot.data, 'base64'));

  // Transform panel: 9-point reference, linked proportions, relative Rotate/Shear, one undo step each.
  const bounds = () => evaluate(`(async()=>{const b=${active}.renderer.selectionBounds();return{x:b.x,y:b.y,width:b.width,height:b.height}})()`);
  const setField = (key, value) => evaluate(`(()=>{const i=document.querySelector('${root} [data-draw-field=${key}]');i.value='${value}';i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const near = (a, b, message) => Object.keys(b).forEach(k => assert.ok(Math.abs(a[k]-b[k]) < 1e-3, `${message}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`));
  await evaluate(`document.querySelector('${root} [data-draw-panel=layers]').click()`);
  await evaluate(`document.querySelector('${row(rect.id)} .draw-layer-name').click()`);
  await evaluate(`document.querySelector('${root} [data-draw-panel=transform]').click()`);
  const start = await bounds();
  assert.equal(await evaluate(`document.querySelectorAll('${root} [data-draw-reference]').length`), 9);
  near({ x: Number(await evaluate(`document.querySelector('${root} [data-draw-field=x]').value`)) }, { x: start.x + start.width / 2 }, 'X shows the center reference by default');
  await evaluate(`document.querySelector('${root} [data-draw-reference="1,1"]').click()`);
  near({ y: Number(await evaluate(`document.querySelector('${root} [data-draw-field=y]').value`)) }, { y: start.y + start.height }, 'Y shows the bottom reference');
  const depth = await evaluate(`(async()=>(${active}.state.history.entries.length))()`);
  await setField('width', start.width * 2);
  near(await bounds(), { x: start.x - start.width, y: start.y, width: start.width * 2, height: start.height }, 'Bottom-right reference stays fixed');
  await command('undo');
  await evaluate(`document.querySelector('${root} [data-draw-field=link]').click()`);
  await setField('height', start.height * 2);
  near(await bounds(), { width: start.width * 2, height: start.height * 2 }, 'Linked proportions');
  assert.equal(await evaluate(`(async()=>(${active}.state.history.entries.length))()`), depth + 1, 'Panel edit is one undo step');
  await command('undo'); near(await bounds(), start, 'Undo restores size');
  await evaluate(`document.querySelector('${root} [data-draw-reference="0,0"]').click()`);
  await setField('x', 0); near(await bounds(), { x: 0, y: start.y }, 'X moves the reference point'); await command('undo');
  await setField('rotate', 90); near(await bounds(), { x: start.x, y: start.y - start.width, width: start.height, height: start.width }, 'Rotate about top-left, counterclockwise'); await command('undo');
  await setField('shear', 45); near(await bounds(), { width: start.width + start.height, height: start.height }, 'Shear'); await command('undo');
  assert.equal(Number(await evaluate(`document.querySelector('${root} [data-draw-field=rotate]').value`)), 0, 'Relative fields reset');
  await evaluate(`document.querySelector('${root} [data-draw-reference="0.5,0.5"]').click()`);

  // Align panel: Align To selection/artboard/key object, Distribute Objects and Spacing, one undo step each.
  const boxOf = id => evaluate(`(async()=>{const b=${active}.renderer.bounds('${id}');return{x:b.x,y:b.y,width:b.width,height:b.height}})()`);
  const alignButton = id => evaluate(`document.querySelector('${root} [data-draw-align="${id}"]').click()`);
  const chooseSelect = (key, value) => evaluate(`(()=>{const s=document.querySelector('${root} [data-draw-field=${key}]');s.value='${value}';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await evaluate(`(async()=>(${active}.select(['${rect.id}','${ellipse.id}'])))()`);
  await evaluate(`document.querySelector('${root} [data-draw-panel=align]').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('${root} [data-draw-align]').length`), 14);
  const alignShot = await client.command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(tmpdir(), 'modcut-draw-align-panel.png'), Buffer.from(alignShot.data, 'base64'));
  const r0 = await boxOf(rect.id), e0 = await boxOf(ellipse.id);
  let alignDepth = await evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  await alignButton('align-left');
  near(await boxOf(ellipse.id), { x: Math.min(r0.x, e0.x) }, 'Align left to selection'); near(await boxOf(rect.id), { x: Math.min(r0.x, e0.x) }, 'Align left to selection');
  assert.equal(await evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`), alignDepth + 1, 'Align is one undo step');
  await command('undo'); near(await boxOf(ellipse.id), e0, 'Undo align');
  await chooseSelect('align-to', 'key');
  await chooseSelect('key-object', rect.id);
  await alignButton('align-right');
  near(await boxOf(rect.id), r0, 'The key object stays fixed'); near(await boxOf(ellipse.id), { x: r0.x + r0.width - e0.width }, 'Align right to key object');
  await command('undo');
  await evaluate(`(()=>{const i=document.querySelector('${root} [data-draw-field=align-spacing]');i.value='5';i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await alignButton('spacing-x');
  near(await boxOf(ellipse.id), { x: r0.x + r0.width + 5 }, 'Exact spacing from the key object');
  await command('undo');
  await chooseSelect('align-to', 'artboard');
  const board = await evaluate(`(async()=>(${active}.state.snapshot().artboards[0]))()`);
  await alignButton('align-centerY');
  near(await boxOf(rect.id), { y: board.y + (board.height - r0.height) / 2 }, 'Align to artboard');
  await command('undo');
  await chooseSelect('align-to', 'selection');
  await evaluate(`(async()=>(${active}.select(['${rect.id}','${image.id}','${ellipse.id}'])))()`);
  const before = await Promise.all([rect.id, image.id, ellipse.id].map(boxOf));
  await alignButton('distribute-centerX');
  const centers = (await Promise.all([rect.id, image.id, ellipse.id].map(boxOf))).map(b => b.x + b.width / 2).sort((a, b) => a - b);
  assert.ok(Math.abs((centers[1] - centers[0]) - (centers[2] - centers[1])) < 1e-3, 'Distribute centers evenly');
  await command('undo'); near(await boxOf(image.id), before[1], 'Undo distribute');

  // Color panel: Fill/Stroke target, RGB/HSB/CMYK/Grayscale/Hex, live slider (one undo step) and None.
  const fillHex = id => evaluate(`(async()=>{const n=${active}.state.document.getNode('${id}'),c=n.appearance.fills[0]?.paint.color.values;return c?c.map(v=>Math.round(v*255)):null})()`);
  const strokeHex = id => evaluate(`(async()=>{const n=${active}.state.document.getNode('${id}'),c=n.appearance.strokes[0]?.paint.color.values;return c?c.map(v=>Math.round(v*255)):null})()`);
  const applied = () => evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  await evaluate(`(async()=>(${active}.select(['${rect.id}'])))()`);
  const fill0 = await fillHex(rect.id), stroke0 = await strokeHex(rect.id);
  await evaluate(`document.querySelector('${root} [data-draw-panel=color]').click()`);
  await evaluate(`document.querySelector('${root} [data-draw-paint-target=fill]').click()`);
  await chooseSelect('color-mode', 'rgb');
  for (const [i, v] of [[0, 255], [1, 0], [2, 0]]) await setField(`color-rgb-${i}`, v);
  assert.deepEqual(await fillHex(rect.id), [255, 0, 0], 'RGB fields set the fill');
  const colorDepth = await applied();
  const sliderLive = await evaluate(`(async()=>{const r=document.querySelector('${root} [data-draw-field=color-rgb-1-range]');r.focus();r.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    for(const v of [40,80,120]){r.value=String(v);r.dispatchEvent(new Event('input',{bubbles:true}));}const connected=r.isConnected,g=${active}.state.document.getNode('${rect.id}').appearance.fills[0].paint.color.values[1];
    r.dispatchEvent(new Event('change',{bubbles:true}));return{connected,g:Math.round(g*255)}})()`);
  assert.deepEqual(sliderLive, { connected: true, g: 120 }, 'The slider updates artwork live without rebuilding mid-drag');
  assert.equal(await applied(), colorDepth + 1, 'A slider drag is one undo step');
  await chooseSelect('color-mode', 'hsb');
  await setField('color-hsb-0', 120); await setField('color-hsb-1', 100); await setField('color-hsb-2', 100);
  assert.deepEqual(await fillHex(rect.id), [0, 255, 0], 'HSB sets the fill');
  await chooseSelect('color-mode', 'cmyk');
  assert.deepEqual(await evaluate(`[0,1,2,3].map(i=>+document.querySelector('${root} [data-draw-field=color-cmyk-'+i+']').value)`), [100, 0, 100, 0]);
  const colorShot = await client.command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(tmpdir(), 'modcut-draw-color-panel.png'), Buffer.from(colorShot.data, 'base64'));
  await evaluate(`document.querySelector('${root} [data-draw-paint-target=stroke]').click()`);
  assert.equal(await evaluate(`document.querySelector('${root} [data-paint=stroke]').getAttribute('aria-pressed')`), 'true', 'Toolbar focus follows the panel target');
  await setField('color-hex', '0000ff');
  assert.deepEqual(await strokeHex(rect.id), [0, 0, 255], 'Hex sets the stroke');
  await evaluate(`document.querySelector('${root} [data-draw-field=color-none]').click()`);
  assert.equal(await strokeHex(rect.id), null, 'None removes the stroke');
  for (let i = 0; i < 12 && JSON.stringify([await fillHex(rect.id), await strokeHex(rect.id)]) !== JSON.stringify([fill0, stroke0]); i++) await command('undo');
  assert.deepEqual([await fillHex(rect.id), await strokeHex(rect.id)], [fill0, stroke0], 'Undo restores the original paint');
  await evaluate(`document.querySelector('${root} [data-draw-paint-target=fill]').click()`);

  // Stroke panel: weight, cap, corner/limit, unavailable inside/outside, dashes and rendered arrowheads.
  const strokeOf = id => evaluate(`(async()=>(${active}.state.document.getNode('${id}').appearance.strokes[0]))()`);
  const strokeButton = id => evaluate(`document.querySelector('${root} [data-draw-stroke="${id}"]').click()`);
  const strokeBefore = await strokeOf(rect.id);
  await evaluate(`(async()=>(${active}.select(['${rect.id}'])))()`);
  await evaluate(`document.querySelector('${root} [data-draw-panel=stroke]').click()`);
  await setField('stroke-weight', 2); await strokeButton('cap-square'); await strokeButton('join-bevel');
  let st = await strokeOf(rect.id);
  assert.deepEqual([st.width, st.cap, st.join], [2, 'square', 'bevel']);
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-field=stroke-limit]').disabled`), true, 'Limit only applies to miter corners');
  assert.deepEqual(await evaluate(`['inside','outside'].map(a=>document.querySelector('${root} [data-draw-stroke="align-'+a+'"]').disabled)`), [true, true]);
  await evaluate(`(()=>{const c=document.querySelector('${root} [data-draw-field=stroke-dashed]');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  assert.deepEqual((await strokeOf(rect.id)).dash.array, [2, 1]);
  await setField('dash-2', 3);
  assert.deepEqual((await strokeOf(rect.id)).dash.array, [2, 1, 3]);
  assert.deepEqual(await evaluate(`(async()=>{const it=${active}.renderer.items.get('${rect.id}');return [...it.dashArray].map(v=>Math.round(v*1000)/1000)})()`), [2, 1, 3], 'Dashes render');
  for (let i = 0; i < 12 && JSON.stringify(await strokeOf(rect.id)) !== JSON.stringify(strokeBefore); i++) await command('undo');
  assert.deepEqual(await strokeOf(rect.id), strokeBefore, 'Undo restores the stroke');
  await tool('line'); await drag(await screen([20, 60]), await screen([60, 60]));
  const flat = nodes => nodes.flatMap(n => [n, ...flat(n.children ?? [])]);
  const line = flat((await model()).layers).find(n => n.shape === 'line');
  assert.ok(line, 'The Line tool drew a line');
  await evaluate(`document.querySelector('${root} [data-draw-panel=stroke]').click()`);
  await chooseSelect('stroke-endArrow', 'triangle');
  assert.deepEqual((await strokeOf(line.id)).endArrow, { type: 'triangle', scale: 1 });
  const arrowBox = () => evaluate(`(async()=>{const w=${active},g=w.scope.project.getItems({match:i=>i.data.arrows&&i.data.nodeId==='${line.id}'});return g.length===1&&g[0].visible?Math.round(g[0].bounds.width*1000)/1000:null})()`);
  const small = await arrowBox();
  assert.ok(small > 0, 'The arrowhead renders');
  await setField('stroke-endArrow-scale', 200);
  assert.ok(await arrowBox() > small * 1.9, 'Arrowhead scale renders');
  await chooseSelect('stroke-startArrow', 'bar');
  assert.equal((await strokeOf(line.id)).startArrow.type, 'bar');
  const arrowShot = await client.command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(tmpdir(), 'modcut-draw-stroke-panel.png'), Buffer.from(arrowShot.data, 'base64'));
  await tool('select');

  await evaluate(`document.querySelector('[data-close-tab="${scratch}"]').click()`); await wait(100);
  if (await evaluate("!!document.querySelector('[data-x=discard]')")) { await evaluate("document.querySelector('[data-x=discard]').click()"); await wait(100); }
  await evaluate(`document.querySelector('[data-tab-id="${original.id}"]').click()`);
  if (await evaluate("document.body.dataset.workspace") === 'draw') await evaluate("document.querySelector('#workspaceToggle').click()");
  assert.equal(await evaluate("paper.project.layers[1].exportJSON({asString:true})"), original.cut, 'Draw panels preserve the Cut document');
  process.stdout.write('PASS Draw panels: Layers tree, Layer Options, template layers, solo/outline, drag, collect/release, delete, rename, Transform, Align, Color and Stroke panels\n');
}
