import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, enterDraw } from './draw-test-helpers.mjs';

const root = '.draw-project[style*=block]';
export async function runDrawPathfinderWorkflows(client) {
  const { evaluate } = client, { drag } = inputHelpers(client), command = id => evaluate(`(async()=>{${active}.handle('${id}')})()`);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Pathfinder proof' });
  const scratch = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const screen = p => evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${p})),b=w.scope.view.element.getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y}})()`);
  const model = () => evaluate(`(async()=>(${active}.state.snapshot()))()`);
  const kids = async () => (await model()).layers[0].children;
  const pathfinder = op => evaluate(`document.querySelector('${root} [data-draw-pathfinder=${op}]').click()`);
  const bounds = id => evaluate(`(async()=>{const b=${active}.renderer.bounds('${id}');return{x:+b.x.toFixed(3),y:+b.y.toFixed(3),width:+b.width.toFixed(3),height:+b.height.toFixed(3)}})()`);
  await evaluate(`(async()=>(${active}.setTool('rectangle')))()`);
  await drag(await screen([10, 10]), await screen([40, 40]));
  await evaluate(`(async()=>(${active}.setTool('ellipse')))()`);
  await drag(await screen([25, 25]), await screen([55, 55]));
  await evaluate(`(async()=>(${active}.setTool('select')))()`);
  const [rect, ellipse] = await kids();
  await command('panel.pathfinder');
  assert.equal(await evaluate(`document.querySelector('${root} .draw-flyout [aria-selected=true]').dataset.drawPanelTab`), 'pathfinder', 'Mod+Shift+F9 opens Pathfinder in the Transform group');
  assert.equal(await evaluate(`document.querySelectorAll('${root} [data-draw-pathfinder]').length`), 10, 'Four shape modes and six pathfinders, each with an icon');
  await evaluate(`(async()=>(${active}.select(['${rect.id}'])))()`);
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-pathfinder=unite]').disabled`), true, 'Needs two objects');
  await command('select-all');
  const depth = await evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  await pathfinder('unite');
  let children = await kids();
  assert.equal(children.length, 1); assert.equal(children[0].type, 'path', 'Unite makes one path');
  assert.deepEqual(await bounds(children[0].id), { x: 10, y: 10, width: 45, height: 45 }, 'Union bounds span both shapes');
  assert.ok(children[0].subpaths[0].segments.some(s => Math.hypot(...s.in, ...s.out) > 1), 'The ellipse curve survives');
  assert.equal(await evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`), depth + 1, 'One undo step');
  assert.deepEqual(await evaluate(`(async()=>(${active}.state.selection.ids))()`), [children[0].id], 'The result is selected');
  const shot = await client.command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(tmpdir(), 'modcut-draw-pathfinder.png'), Buffer.from(shot.data, 'base64'));
  await command('undo');
  assert.deepEqual((await kids()).map(n => n.id), [rect.id, ellipse.id], 'Undo restores both originals');
  await command('select-all'); await pathfinder('minusFront');
  children = await kids();
  assert.deepEqual(await bounds(children[0].id), { x: 10, y: 10, width: 30, height: 30 }, 'Minus Front keeps the back rectangle minus the circle');
  await command('undo'); await command('select-all'); await pathfinder('divide');
  children = await kids();
  assert.equal(children.length, 1); assert.equal(children[0].type, 'group'); assert.equal(children[0].children.length, 3, 'Divide: three regions in a group');
  await command('undo'); await command('select-all'); await pathfinder('intersect');
  assert.deepEqual(await bounds((await kids())[0].id), { x: 25, y: 25, width: 15, height: 15 }, 'Intersect keeps the overlap');
  await command('undo');

  // Appearance: a stack of fills and strokes per object, drawn in order, each entry editable and hideable.
  await evaluate(`(async()=>(${active}.select(['${ellipse.id}'])))()`);
  await command('panel.appearance');
  const rows = () => evaluate(`[...document.querySelectorAll('${root} [data-draw-appearance]')].map(r=>r.dataset.drawAppearance)`);
  const look = async () => (await kids()).find(n => n.id === ellipse.id).appearance;
  const stack = () => evaluate(`(async()=>{const w=${active},g=w.scope.project.getItems({match:i=>i.data.stack&&i.data.nodeId==='${ellipse.id}'});return g.length?g[0].children.length:0})()`);
  const act = key => evaluate(`document.querySelector('${root} [data-draw-appearance-action=${key}]').click()`);
  assert.deepEqual(await rows(), ['strokes-0', 'fills-0'], 'Stroke row above Fill row');
  assert.equal(await stack(), 0, 'A single fill and stroke draws without a stack');
  await act('add-stroke');
  assert.equal((await look()).strokes.length, 2); assert.deepEqual(await rows(), ['strokes-1', 'strokes-0', 'fills-0']);
  assert.equal(await stack(), 3, 'Two strokes and a fill draw as a three-piece stack');
  await evaluate(`(()=>{const i=document.querySelector('${root} [data-draw-field="appearance-strokes-1-width"]');i.value='3';i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  assert.equal((await look()).strokes[1].width, 3);
  const edge = await screen([55, 40]);
  assert.equal(await evaluate(`(async()=>{const w=${active},b=w.scope.view.element.getBoundingClientRect();return w.renderer.hit(w.scope.view.viewToProject(new w.scope.Point(${edge.x}-b.x,${edge.y}-b.y)))})()`), ellipse.id, 'Hit-testing finds the object through its stack');
  await evaluate(`document.querySelector('${root} [data-draw-appearance=strokes-0] [data-draw-appearance-toggle]').click()`);
  assert.equal((await look()).strokes[0].hidden, true); assert.equal(await stack(), 0, 'Hiding a stroke leaves one stroke: back to a plain item');
  await evaluate(`document.querySelector('${root} [data-draw-appearance=strokes-1] .draw-appearance-name').click()`);
  await act('duplicate'); assert.equal((await look()).strokes.length, 3);
  await act('delete'); assert.equal((await look()).strokes.length, 2);
  await act('clear'); assert.deepEqual([(await look()).fills.length, (await look()).strokes.length], [0, 0], 'Clear Appearance');
  for (let i = 0; i < 6; i++) await command('undo');
  assert.deepEqual([(await look()).fills.length, (await look()).strokes.length], [1, 1], 'Each Appearance edit is one undo step');
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-appearance-action=add-effect]').disabled`), true);

  // Properties: a title for the selection, quick actions, and a Document section with nothing selected.
  const title = () => evaluate(`document.querySelector('${root} [data-draw-selection-title]').textContent`);
  await evaluate(`(async()=>(${active}.select(['${ellipse.id}'])))()`);
  assert.equal(await title(), 'Ellipse');
  await evaluate(`document.querySelector('${root} [data-draw-quick=expand-shape]').click()`);
  assert.equal((await kids()).find(n => n.id === ellipse.id).type, 'path', 'Expand Shape keeps the id and becomes a path');
  assert.equal(await title(), 'Path');
  await command('undo'); assert.equal((await kids()).find(n => n.id === ellipse.id).type, 'shape');
  await evaluate(`document.querySelector('${root} [data-draw-quick=appearance]').click()`);
  assert.equal(await evaluate(`document.querySelector('${root} .draw-flyout').dataset.drawGroup`), 'appearance', 'Quick actions open their panel group');
  await command('select-all'); assert.equal(await title(), '2 objects');
  await command('deselect'); assert.equal(await title(), 'No Selection');
  assert.match(await evaluate(`document.querySelector('${root} .draw-doc-info').textContent`), /Artboard 1 · 120 × 80 mm/);
  const guides = () => evaluate(`(async()=>(${active}.state.snapshot().settings.smartGuides))()`), before = await guides();
  await evaluate(`document.querySelector('${root} [data-draw-field=smart-guides]').click()`);
  assert.equal(await guides(), !before, 'Smart Guides toggles from Properties');
  await command('undo');

  await evaluate(`document.querySelector('[data-close-tab="${scratch}"]').click()`);
  for (let i = 0; i < 40; i++) {
    if (await evaluate("!!document.querySelector('[data-x=discard]')")) await evaluate("document.querySelector('[data-x=discard]').click()");
    if (!await evaluate(`!!document.querySelector('[data-tab-id="${scratch}"]') || !!document.querySelector('.modal-overlay')`)) break;
    await wait(50);
  }
  if (await evaluate("document.body.dataset.workspace") === 'draw') await evaluate("document.querySelector('#workspaceToggle').click()");
  process.stdout.write('PASS Draw Pathfinder: panel, Unite with curves, Minus Front, Divide, Intersect, one undo step each; Appearance stack with add/hide/duplicate/delete/clear; Properties title, quick actions and Document section\n');
}
