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

  await evaluate(`document.querySelector('[data-close-tab="${scratch}"]').click()`); await wait(100);
  if (await evaluate("!!document.querySelector('[data-x=discard]')")) { await evaluate("document.querySelector('[data-x=discard]').click()"); await wait(100); }
  await evaluate(`document.querySelector('[data-tab-id="${original.id}"]').click()`);
  if (await evaluate("document.body.dataset.workspace") === 'draw') await evaluate("document.querySelector('#workspaceToggle').click()");
  assert.equal(await evaluate("paper.project.layers[1].exportJSON({asString:true})"), original.cut, 'Draw panels preserve the Cut document');
  process.stdout.write('PASS Draw panels: Layers tree, Layer Options, template layers, solo/outline, drag, collect/release, delete and rename\n');
}
