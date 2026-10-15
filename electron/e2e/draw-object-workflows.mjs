import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog } from './draw-test-helpers.mjs';

const root = '.draw-project[style*=block]';
export async function runDrawObjectWorkflows(client) {
  const { evaluate } = client, { drag, click } = inputHelpers(client), command = id => evaluate(`(async()=>{${active}.handle('${id}')})()`);
  const mod = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };
  const shortcut = (key, code, extra = {}) => evaluate(`(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},bubbles:true,cancelable:true,...${JSON.stringify({ ...mod, ...extra })}}));window.dispatchEvent(new KeyboardEvent('keyup',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},bubbles:true,cancelable:true}))})()`);
  await evaluate("document.querySelector('#workspaceToggle').click();document.querySelector('#newDoc').click()");
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

  // Arrange with Mod+] family and the Object menu.
  await select([a]); await shortcut(']', 'BracketRight', { shiftKey: true });
  assert.deepEqual(await order(), [b, c, a], 'Bring to Front');
  await shortcut('[', 'BracketLeft'); assert.deepEqual(await order(), [b, a, c], 'Send Backward');
  await shortcut('{', 'BracketLeft', { shiftKey: true });
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
  process.stdout.write('PASS Draw objects: Group/Ungroup, Arrange keys, Lock/Unlock All, Hide/Show All, quick actions\n');
}
