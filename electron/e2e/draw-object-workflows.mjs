import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, enterDraw } from './draw-test-helpers.mjs';

const root = '.draw-project[style*=block]';
export async function runDrawObjectWorkflows(client) {
  const { evaluate } = client, { drag, click } = inputHelpers(client), command = id => evaluate(`(async()=>{${active}.handle('${id}')})()`);
  const mod = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };
  const shortcut = (key, code, extra = {}) => evaluate(`(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},bubbles:true,cancelable:true,...${JSON.stringify({ ...mod, ...extra })}}));window.dispatchEvent(new KeyboardEvent('keyup',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},bubbles:true,cancelable:true}))})()`);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Object proof' });
  const scratch = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const screen = p => evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${p})),b=w.scope.view.element.getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y}})()`);
  const model = () => evaluate(`(async()=>(${active}.state.snapshot()))()`);
  const order = async () => (await model()).layers[0].children.map(n => n.id);
  const selection = () => evaluate(`(async()=>(${active}.state.selection.ids))()`);
  const select = ids => evaluate(`(async()=>(${active}.select(${JSON.stringify(ids)})))()`);
  await evaluate(`(async()=>(${active}.setTool('rectangle')))()`);
  for (const x of [10, 40, 70]) await drag(await screen([x, 10]), await screen([x + 20, 30]));
  await evaluate(`(async()=>(${active}.setTool('select')))()`);
  const [a, b, c] = await order();

  // Group with Mod+G: the group sits where the topmost member was; clicking a member selects the group.
  await select([a, b]); await shortcut('g', 'KeyG');
  let data = await model(); const group = data.layers[0].children.find(n => n.type === 'group');
  assert.ok(group, 'Mod+G groups'); assert.deepEqual(group.children.map(n => n.id), [a, b]); assert.deepEqual(await order(), [group.id, c]);
  assert.deepEqual(await selection(), [group.id], 'The new group is selected');
  await command('deselect'); await click(await screen([20, 20]));
  assert.deepEqual(await selection(), [group.id], 'Clicking a member selects its group');
  await shortcut('G', 'KeyG', { shiftKey: true });
  assert.deepEqual(await order(), [a, b, c], 'Mod+Shift+G ungroups in place'); assert.deepEqual((await selection()).sort(), [a, b].sort());
  await command('undo'); await command('undo'); assert.deepEqual(await order(), [a, b, c]);

  // Arrange with Mod+PageUp/PageDown family and the Object menu.
  await select([a]); await shortcut('PageUp', 'PageUp', { shiftKey: true });
  assert.deepEqual(await order(), [b, c, a], 'Bring to Front');
  await shortcut('PageDown', 'PageDown'); assert.deepEqual(await order(), [b, a, c], 'Send Backward');
  await shortcut('PageDown', 'PageDown', { shiftKey: true });
  assert.deepEqual(await order(), [a, b, c], 'Send to Back');

  // Lock and Hide: locked objects cannot be clicked; Unlock All and Show All bring them back selected.
  await select([b]); await shortcut('2', 'Digit2');
  assert.equal((await model()).layers[0].children[1].locked, true); assert.deepEqual(await selection(), []);
  await click(await screen([50, 20])); assert.deepEqual(await selection(), [], 'A locked object is not selectable and does not select its layer');
  await shortcut('2', 'Digit2', { altKey: true });
  assert.equal((await model()).layers[0].children[1].locked, false); assert.deepEqual(await selection(), [b], 'Unlock All selects what it unlocked');
  await evaluate("window.modcut.clickE2EMenuItem('Object','Hide Selection')"); await wait(100);
  assert.equal((await model()).layers[0].children[1].visible, false, 'Object > Hide Selection');
  await shortcut('3', 'Digit3', { altKey: true }); assert.equal((await model()).layers[0].children[1].visible, true, 'Mod+Alt+3 shows all');

  // Clipboard: Copy/Paste centres in the view, Paste in Front/Back/Place keep the position, Cut removes.
  const bounds = id => evaluate(`(async()=>{const b=${active}.renderer.bounds('${id}');return[+b.x.toFixed(3),+b.y.toFixed(3),+b.width.toFixed(3),+b.height.toFixed(3)]})()`);
  const aBox = await bounds(a);
  await select([a]); await shortcut('c', 'KeyC'); await shortcut('v', 'KeyV');
  let ids = await order(); const pasted = ids.at(-1);
  assert.equal(ids.length, 4); assert.notEqual(pasted, a); assert.deepEqual(await selection(), [pasted], 'Paste selects the copy');
  const center = await evaluate(`(async()=>{const w=${active},c=w.scope.view.center,b=w.renderer.bounds('${pasted}');return[+(b.x+b.width/2-c.x).toFixed(3),+(b.y+b.height/2-c.y).toFixed(3)]})()`);
  assert.deepEqual(center, [0, 0], 'Paste centres the copy in the view');
  await command('undo');
  await select([b]); await shortcut('f', 'KeyF');
  ids = await order(); assert.deepEqual([ids.indexOf(b) + 1, (await bounds(ids[ids.indexOf(b) + 1]))], [ids.indexOf(b) + 1, aBox], 'Paste in Front: directly above the selection, same place as the original');
  await command('undo'); await select([b]); await shortcut('b', 'KeyB');
  ids = await order(); assert.deepEqual(await bounds(ids[ids.indexOf(b) - 1]), aBox, 'Paste in Back: directly below the selection');
  await command('undo'); await shortcut('V', 'KeyV', { shiftKey: true });
  assert.deepEqual(await bounds((await order()).at(-1)), aBox, 'Paste in Place'); await command('undo');
  await evaluate(`(async()=>{${active}.artboards.add()})()`);
  const boards = (await model()).artboards; assert.equal(boards.length, 2);
  await shortcut('V', 'KeyV', { shiftKey: true, altKey: true });
  const copies = (await order()).slice(3); assert.equal(copies.length, 2, 'Paste on All Artboards: one copy per artboard');
  const second = await bounds(copies[1]);
  assert.deepEqual([+(second[0] - aBox[0]).toFixed(3), +(second[1] - aBox[1]).toFixed(3)], [+(boards[1].x - boards[0].x).toFixed(3), +(boards[1].y - boards[0].y).toFixed(3)], 'Same spot on the second artboard');
  await command('undo'); await command('undo');
  await select([c]); await shortcut('x', 'KeyX');
  assert.deepEqual(await order(), [a, b], 'Cut removes'); await shortcut('v', 'KeyV', { shiftKey: true });
  assert.equal((await order()).length, 3, 'and pastes back');
  await command('undo'); await command('undo'); assert.deepEqual(await order(), [a, b, c]);
  // Text fields keep their own clipboard keys.
  await evaluate(`(()=>{const i=document.querySelector('${root} [data-draw-field=layer-search]');i.focus();i.dispatchEvent(new KeyboardEvent('keydown',{key:'v',code:'KeyV',bubbles:true,cancelable:true,...${JSON.stringify(mod)}}))})()`);
  assert.equal((await order()).length, 3, 'Mod+V in a text field does not paste objects');
  await evaluate('document.activeElement.blur()');

  // Isolation mode: double-click a group to edit inside it; the rest is dimmed and out of reach.
  const dbl = async point => { await click(point); await client.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 2 }); await client.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 2 }); await wait(80); };
  await select([a, b]); await shortcut('g', 'KeyG');
  const iso = (await model()).layers[0].children.find(n => n.type === 'group').id;
  await dbl(await screen([20, 20]));
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.isolation))()`), iso, 'Double-click isolates the group');
  assert.equal(await evaluate(`document.querySelector('${root} .draw-isolation-bar').hidden`), false);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('${root} [data-draw-crumb]')].map(c=>c.dataset.drawCrumb)`), [(await model()).layers[0].id, iso], 'Breadcrumbs: layer › group');
  assert.ok(Math.abs(await evaluate(`(async()=>(${active}.renderer.items.get('${c}').opacity))()`) - .35) < 1e-6, 'Objects outside the group are dimmed');
  await command('deselect'); await click(await screen([20, 20]));
  assert.deepEqual(await selection(), [a], 'Inside isolation a click selects the member, not the group');
  await click(await screen([80, 20])); assert.deepEqual(await selection(), [], 'Objects outside cannot be selected');
  await command('select-all'); assert.deepEqual((await selection()).sort(), [a, b].sort(), 'Select All stays inside the group');
  await evaluate(`(async()=>(${active}.setTool('rectangle')))()`);
  await drag(await screen([10, 50]), await screen([20, 60]));
  await evaluate(`(async()=>(${active}.setTool('select')))()`);
  let groupNode = (await model()).layers[0].children.find(n => n.id === iso);
  assert.equal(groupNode.children.length, 3, 'New shapes are drawn into the isolated group');
  await select([a]); await shortcut('c', 'KeyC'); await shortcut('V', 'KeyV', { shiftKey: true });
  groupNode = (await model()).layers[0].children.find(n => n.id === iso);
  assert.equal(groupNode.children.length, 4, 'Paste goes into the isolated group');
  await command('deselect');
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}))");
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.isolation))()`), null, 'Escape leaves isolation mode');
  assert.deepEqual(await selection(), [iso], 'and selects the group');
  assert.ok(Math.abs(await evaluate(`(async()=>(${active}.renderer.items.get('${c}').opacity))()`) - 1) < 1e-6, 'Dimming ends');
  await dbl(await screen([20, 20])); await dbl(await screen([100, 70]));
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.isolation))()`), null, 'Double-clicking empty canvas leaves isolation');
  for (let i = 0; i < 3; i++) await command('undo');
  assert.deepEqual(await order(), [a, b, c], 'Undo paste, rectangle and group');

  // Properties like Illustrator: Flip, Fill colour and Align right in the panel.
  await select([a]);
  const before = await evaluate(`(async()=>{const b=${active}.renderer.bounds('${a}');return[b.x,b.y,b.width,b.height].map(v=>+v.toFixed(3))})()`);
  await evaluate(`document.querySelector('${root} [data-draw-dock=properties] [data-draw-flip=horizontal]').click()`);
  assert.equal(await evaluate(`(async()=>(${active}.state.history.undoLabel))()`), 'Flip Horizontal');
  assert.deepEqual(await evaluate(`(async()=>{const b=${active}.renderer.bounds('${a}');return[b.x,b.y,b.width,b.height].map(v=>+v.toFixed(3))})()`), before, 'Flip around the centre keeps the bounds');
  await command('undo');
  await evaluate(`(()=>{const i=document.querySelector('${root} [data-draw-dock=properties] [data-draw-field=prop-fill]');i.value='#ff0000';i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const fill = (await model()).layers[0].children.find(n => n.id === a).appearance.fills[0].paint.color.values.map(v => Math.round(v * 255));
  assert.deepEqual(fill, [255, 0, 0], 'Fill colour from Properties'); await command('undo');
  await evaluate(`document.querySelector('${root} [data-draw-dock=properties] [data-draw-prop-align=right]').click()`);
  const right = await evaluate(`(async()=>{const b=${active}.renderer.bounds('${a}');return +(b.x+b.width).toFixed(3)})()`);
  assert.equal(right, (await model()).artboards[0].width, 'A single object aligns to the artboard from Properties'); await command('undo');

  // Layers panel menu (≡): New Layer, Duplicate, Hide Others, Merge Selected, and dragging the selection to a layer.
  const menu = key => evaluate(`(()=>{if(!document.querySelector('${root} .draw-layer-menu'))document.querySelector('${root} [data-draw-layer-menu]').click();document.querySelector('${root} [data-draw-layer-menu-item=${key}]').click()})()`);
  await select([c]); await menu('duplicate');
  assert.equal((await model()).layers[0].children.length, 4, 'Duplicate "<object>"'); await command('undo');
  await menu('new-sublayer'); await command('undo');
  const firstLayer = (await model()).layers[0].id;
  await evaluate(`(async()=>{const w=${active},{insertNode}=await import('./draw/doc/commands.mjs'),{newLayer}=await import('./draw/doc/layers.mjs');w.state.history.execute(insertNode(null,newLayer(w.state.document)))})()`);
  let layers = (await model()).layers; const secondLayer = layers[1].id;
  await evaluate(`document.querySelector('${root} [data-draw-node="${secondLayer}"] .draw-layer-name').click()`);
  await menu('hide-others'); assert.equal((await model()).layers[0].visible, false, 'Hide Others'); await command('undo');
  await select([b]);
  await evaluate(`(()=>{const dt=new DataTransfer(),src=document.querySelector('${root} [data-draw-node="${b}"] .draw-layer-target'),dst=document.querySelector('${root} [data-draw-node="${secondLayer}"]');
    src.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));dst.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));dst.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));})()`);
  layers = (await model()).layers;
  assert.deepEqual(layers[1].children.map(n => n.id), [b], 'Dragging the selected-art square moves the selection to that layer');
  await evaluate(`document.querySelector('${root} [data-draw-node="${firstLayer}"] .draw-layer-name').click()`);
  await evaluate(`document.querySelector('${root} [data-draw-node="${secondLayer}"] .draw-layer-name').dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}))`);
  await evaluate(`document.querySelector('${root} [data-draw-node="${firstLayer}"] .draw-layer-name').click()`);
  await evaluate(`document.querySelector('${root} [data-draw-node="${secondLayer}"] .draw-layer-name').dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}))`);
  await menu('merge');
  layers = (await model()).layers;
  assert.equal(layers.length, 1, 'Merge Selected'); assert.deepEqual(layers[0].children.map(n => n.id).sort(), [a, b, c].sort());
  await command('undo'); await command('undo'); await command('undo');
  assert.deepEqual(await order(), [a, b, c], 'Undo merge, move and new layer');

  // Properties quick actions.
  await select([a, c]);
  await evaluate(`document.querySelector('${root} [data-draw-quick=group]').click()`);
  assert.equal((await model()).layers[0].children.at(-1).type, 'group', 'Quick action Group');
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-quick=ungroup]').disabled`), false);
  await evaluate(`document.querySelector('${root} [data-draw-quick=ungroup]').click()`);
  assert.ok((await model()).layers[0].children.every(n => n.type === 'shape'), 'Quick action Ungroup');

  await evaluate(`document.querySelector('[data-close-tab="${scratch}"]').click()`);
  for (let i = 0; i < 40; i++) {
    if (await evaluate("!!document.querySelector('[data-x=discard]')")) await evaluate("document.querySelector('[data-x=discard]').click()");
    if (!await evaluate(`!!document.querySelector('[data-tab-id="${scratch}"]') || !!document.querySelector('.modal-overlay')`)) break;
    await wait(50);
  }
  if (await evaluate("document.body.dataset.workspace") === 'draw') await evaluate("document.querySelector('#workspaceToggle').click()");
  process.stdout.write('PASS Draw objects: Group/Ungroup, Arrange keys, Lock/Unlock All, Hide/Show All, quick actions, Cut/Copy/Paste, Paste in Front/Back/Place/All Artboards, isolation mode, Properties Flip/Fill/Align, Layers menu and drag to layer\n');
}
