import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog } from './draw-test-helpers.mjs';

const root = '.draw-project[style*=block]';
export async function runDrawSwatchWorkflows(client) {
  const { evaluate } = client, { drag } = inputHelpers(client), command = id => evaluate(`(async()=>{${active}.handle('${id}')})()`);
  await evaluate("document.querySelector('#workspaceToggle').click();document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Swatch proof' });
  const scratch = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const screen = p => evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${p})),b=w.scope.view.element.getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y}})()`);
  const model = () => evaluate(`(async()=>(${active}.state.snapshot()))()`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(`${root} ${selector}`)}).click()`);
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
  // List view and the Color panel's Recent Colors.
  await click('[data-draw-swatch-view=list]');
  assert.ok(await evaluate(`!!document.querySelector('${root} .draw-swatch-list [data-draw-swatch] code')`), 'List view shows names and hex values');
  await click('[data-draw-panel=color]');
  assert.ok(await evaluate(`document.querySelectorAll('${root} [data-draw-recent-color]').length >= 2`), 'Color shares Recent Colors');
  assert.ok(rect.id);

  await evaluate(`document.querySelector('[data-close-tab="${scratch}"]').click()`);
  for (let i = 0; i < 40; i++) {
    if (await evaluate("!!document.querySelector('[data-x=discard]')")) await evaluate("document.querySelector('[data-x=discard]').click()");
    if (!await evaluate(`!!document.querySelector('[data-tab-id="${scratch}"]') || !!document.querySelector('.modal-overlay')`)) break;
    await wait(50);
  }
  if (await evaluate("document.body.dataset.workspace") === 'draw') await evaluate("document.querySelector('#workspaceToggle').click()");
  process.stdout.write('PASS Draw swatches: library with laser colors, fill/stroke/None, Recent Colors, new/rename/delete swatch, list view\n');
}
