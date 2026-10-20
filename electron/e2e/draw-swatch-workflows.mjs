import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, enterDraw } from './draw-test-helpers.mjs';

const root = '.draw-project[style*=block]';
export async function runDrawSwatchWorkflows(client) {
  const { evaluate } = client, { drag } = inputHelpers(client), command = id => evaluate(`(async()=>{${active}.handle('${id}')})()`);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Swatch proof' });
  const scratch = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const screen = p => evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${p})),b=w.scope.view.element.getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y}})()`);
  const model = () => evaluate(`(async()=>(${active}.state.snapshot()))()`);
  const click = selector => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(`${root} ${selector}`)});if(!el)throw new Error("Missing "+${JSON.stringify(selector)});el.click();})()`);
  const hex = paint => paint?.color ? '#' + paint.color.values.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
  await evaluate(`(async()=>(${active}.setTool('rectangle')))()`);
  await drag(await screen([10, 10]), await screen([30, 20]));
  const rect = (await model()).layers[0].children[0];
  await click('[data-draw-panel=swatches]');
  const ids = await evaluate(`[...document.querySelectorAll('${root} [data-draw-swatch-group="Laser layers"] [data-draw-swatch]')].map(b=>b.dataset.drawSwatch)`);
  assert.equal(ids.length, 4, 'Laser layer colors are in the library');
  await click(`[data-draw-swatch="${ids[0]}"]`);
  let node = (await model()).layers[0].children[0];
  assert.equal(hex(node.appearance.fills[0].paint), '#FF0000', 'Clicking a swatch fills the selection');
  await click('[data-draw-paint-target=stroke]');
  await click(`[data-draw-swatch="${ids[2]}"]`);
  node = (await model()).layers[0].children[0];
  assert.equal(hex(node.appearance.strokes[0].paint), '#0000FF', 'With Stroke chosen a swatch sets the stroke');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('${root} [data-draw-recent-color]')].map(b=>b.dataset.drawRecentColor)`), ['#0000FF', '#FF0000'], 'Recent Colors, newest first');
  await click('[data-draw-swatch=none]');
  assert.equal((await model()).layers[0].children[0].appearance.strokes[0]?.paint?.type ?? 'none', 'none', 'None removes the stroke');
  await command('undo');
  // New swatch from the current color, rename it, then delete it.
  const before = await evaluate(`document.querySelectorAll('${root} [data-draw-swatch]:not([data-draw-swatch=none])').length`);
  await click('[data-draw-swatch-action=new]');
  const custom = await evaluate(`[...document.querySelectorAll('${root} [data-draw-swatch-group="Custom"] [data-draw-swatch]')].map(b=>b.dataset.drawSwatch)`);
  assert.equal(custom.length, 1, 'New swatch lands in Custom');
  assert.equal((await model()).swatches.length, before + 1, 'The library is stored in the document');
  await evaluate(`document.querySelector('${root} [data-draw-swatch="${custom[0]}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`); await wait(50);
  await evaluate("(()=>{const f=document.querySelector('.draw-swatch-dialog form');f.elements.name.value='Logo blue';f.requestSubmit();})()"); await wait(50);
  assert.equal((await model()).swatches.find(s => s.id === custom[0]).name, 'Logo blue');
  await click(`[data-draw-swatch="${custom[0]}"]`);
  await click('[data-draw-swatch-action=delete]');
  assert.ok(!(await model()).swatches.some(s => s.id === custom[0]), 'Delete removes the chosen swatch');
  await command('undo'); assert.ok((await model()).swatches.some(s => s.id === custom[0]), 'Undo restores it');
  // A new swatch is global: what it paints stays linked, and editing the swatch recolors it in one step.
  assert.equal((await model()).swatches.find(s => s.id === custom[0]).global, true, 'New swatches are global');
  assert.ok(await evaluate(`document.querySelector('${root} [data-draw-swatch="${custom[0]}"]').classList.contains('is-global')`), 'Global swatches are marked');
  await click('[data-draw-paint-target=fill]');
  await click(`[data-draw-swatch="${custom[0]}"]`);
  assert.equal((await model()).layers[0].children[0].appearance.fills[0].paint.swatch, custom[0], 'The fill remembers the global swatch');
  const steps = () => evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`), atStart = await steps();
  await evaluate(`document.querySelector('${root} [data-draw-swatch="${custom[0]}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`); await wait(50);
  await evaluate("(()=>{const f=document.querySelector('.draw-swatch-dialog form');f.elements.hex.value='#00ff00';f.requestSubmit();})()"); await wait(50);
  assert.equal(hex((await model()).layers[0].children[0].appearance.fills[0].paint), '#00FF00', 'Editing the global swatch recolors the object');
  assert.equal(await steps(), atStart + 1, 'Swatch and recolor are one undo step');
  await command('undo');
  // A gradient fill makes a gradient swatch; clicking it applies the gradient across the object.
  await command('paint-gradient'); await command('panel.swatches');
  await click('[data-draw-swatch-action=new]');
  const gradients = await evaluate(`[...document.querySelectorAll('${root} [data-draw-swatch-group="Custom"] .draw-swatch.is-gradient')].map(b=>b.dataset.drawSwatch)`);
  assert.equal(gradients.length, 1, 'The gradient swatch is listed');
  assert.ok((await model()).swatches.find(s => s.id === gradients[0]).gradient.stops.length >= 2);
  await click(`[data-draw-swatch="${custom[0]}"]`);
  assert.equal((await model()).layers[0].children[0].appearance.fills[0].paint.type, 'solid');
  await click(`[data-draw-swatch="${gradients[0]}"]`);
  assert.equal((await model()).layers[0].children[0].appearance.fills[0].paint.type, 'linear', 'Clicking the gradient swatch applies it');
  // List view and the Color panel's Recent Colors.
  await click('[data-draw-swatch-view=list]');
  assert.ok(await evaluate(`!!document.querySelector('${root} .draw-swatch-list [data-draw-swatch] code')`), 'List view shows names and hex values');
  await click('[data-draw-panel=color]');
  assert.ok(await evaluate(`document.querySelectorAll('${root} [data-draw-recent-color]').length >= 2`), 'Color shares Recent Colors');
  // Transparency and Gradient open independently from the visual Stroke rail group.
  await command('panel.transparency');
  assert.equal(await evaluate(`document.querySelector('${root} .draw-floating-panel[data-draw-group=transparency] [aria-selected=true]').dataset.drawPanelTab`), 'transparency');
  await command('panel.gradient');
  assert.equal(await evaluate(`document.querySelector('${root} .draw-floating-panel[data-draw-group=gradient] [aria-selected=true]').dataset.drawPanelTab`), 'gradient', 'Mod+F9 opens Gradient independently');
  await command('panel.transparency');
  await evaluate(`(()=>{const s=document.querySelector('${root} [data-draw-field=blend-mode]');s.value='multiply';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  assert.equal((await model()).layers[0].children[0].blendMode, 'multiply');
  assert.equal(await evaluate(`(async()=>(${active}.renderer.items.get('${rect.id}').blendMode))()`), 'multiply', 'The canvas renders the blending mode');
  await evaluate(`(()=>{const i=document.querySelector('${root} [data-draw-field=transparency-opacity]');i.value='40';i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  assert.equal((await model()).layers[0].children[0].opacity, .4);
  await command('undo'); await command('undo');
  node = (await model()).layers[0].children[0];
  assert.deepEqual([node.blendMode, node.opacity], ['normal', 1], 'Undo restores both');
  assert.ok(rect.id);

  await evaluate(`document.querySelector('[data-close-tab="${scratch}"]').click()`);
  for (let i = 0; i < 40; i++) {
    if (await evaluate("!!document.querySelector('[data-x=discard]')")) await evaluate("document.querySelector('[data-x=discard]').click()");
    if (!await evaluate(`!!document.querySelector('[data-tab-id="${scratch}"]') || !!document.querySelector('.modal-overlay')`)) break;
    await wait(50);
  }
  if (await evaluate("document.body.dataset.workspace") === 'draw') await evaluate("document.querySelector('#workspaceToggle').click()");
  process.stdout.write('PASS Draw swatches: library with laser colors, fill/stroke/None, Recent Colors, new/rename/delete swatch, global swatches recolor what they paint in one step, gradient swatches, list view, Transparency blending mode and opacity\n');
}
