import assert from 'node:assert/strict';
import { wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, submitPlaceDialog, rememberTabs } from './draw-test-helpers.mjs';

/** D1.11: Place with Template, Alt-drop as template, and Use as Template for placed images. */
export async function runDrawPlaceWorkflows(client) {
  const { evaluate } = client;
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(50); } assert.fail(`Timed out: ${label}`); };
  // Later suites expect the tabs and workspace this one started with.
  const restoreTabs = await rememberTabs(evaluate);
  await evaluate("document.body.dataset.workspace==='draw'||document.querySelector('#workspaceToggle').click();document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Place proof' });
  const png = "(()=>{const c=document.createElement('canvas');c.width=8;c.height=4;const g=c.getContext('2d');g.fillStyle='#c00';g.fillRect(0,0,8,4);return c.toDataURL('image/png');})()";
  const model = () => evaluate(`(async()=>(${active}.state.snapshot()))()`);
  const layers = async () => (await model()).layers.map(l => ({ id: l.id, name: l.name, template: l.template, locked: l.locked, printable: l.printable, dimImages: l.dimImages, dimImagesTo: l.dimImagesTo, children: l.children.map(n => n.type) }));
  const [first] = await layers();

  // Import of an image asks for Place options; Template places it on a template layer below the active layer.
  const place = async () => { await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify([{ name: 'photo.png', ext: 'png', dataUrl: await evaluate(png) }])})`); await evaluate("document.querySelector('#add').click()");
    await until("!!document.querySelector('.draw-place-dialog form')", 'Place dialog'); };
  await place();
  assert.match(await evaluate("document.querySelector('.draw-place-dialog__note').textContent"), /^1 file\. Template puts each file/);
  assert.equal(await evaluate("document.querySelector('.draw-place-dialog form').elements.template.checked"), false, 'Template is off by default');
  await submitPlaceDialog(evaluate, { template: true });
  await until(`(async()=>(${active}.state.snapshot().layers.length===2))()`, 'template layer');
  let list = await layers();
  assert.equal(list.length, 2); assert.equal(list[1].id, first.id, 'The template layer sits below the active layer');
  assert.deepEqual({ ...list[0], id: undefined }, { id: undefined, name: 'Template photo.png', template: true, locked: true, printable: false, dimImages: true, dimImagesTo: 50, children: ['image'] });
  assert.deepEqual(await evaluate(`(async()=>(${active}.state.selection.ids))()`), []);
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.layerId))()`), first.id, 'Drawing continues on the active layer');
  assert.equal(await evaluate(`(async()=>{const w=${active};return w.cutSvg(w.state.document.data.artboards[0].id).skipped.images;})()`), 0, 'Template images are not counted for Send to Cut');
  await evaluate(`(async()=>{${active}.handle('undo')})()`);
  assert.equal((await layers()).length, 1, 'Place with Template is one undo step');
  // The Template choice is remembered for the next Place; Cancel places nothing.
  await place();
  assert.equal(await evaluate("document.querySelector('.draw-place-dialog form').elements.template.checked"), true, 'Place remembers Template');
  await evaluate("document.querySelector('.draw-place-dialog [data-x=cancel]').click()"); await wait(200);
  assert.equal((await layers()).length, 1); assert.deepEqual((await layers())[0].children, [], 'Cancel places nothing');

  // Alt-drop of an image places it as a template; a plain drop places it on the active layer.
  const drop = altKey => evaluate(`(async()=>{const blob=await (await fetch(${png})).blob(),dt=new DataTransfer();dt.items.add(new File([blob],'drop.png',{type:'image/png'}));
    window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,altKey:${altKey},bubbles:true,cancelable:true}));})()`);
  await drop(true);
  await until(`(async()=>(${active}.state.snapshot().layers.length===2))()`, 'Alt-drop template layer');
  const dropped = await layers();
  assert.equal(dropped[0].name, 'Template drop.png'); assert.equal(dropped[0].template, true);
  await drop(false);
  await until(`(async()=>(${active}.state.snapshot().layers.at(-1).children.length===1))()`, 'plain drop on the active layer');
  assert.equal((await layers()).length, 2, 'A plain drop adds no template layer');

  // Use as Template from Properties moves the selected image to a new template layer, in one undo step.
  const imageId = (await model()).layers.at(-1).children[0].id;
  await evaluate(`(async()=>(${active}.select(['${imageId}'])))()`);
  await until("!!document.querySelector('[data-draw-quick=use-as-template]')", 'Use as Template quick action');
  await evaluate("document.querySelector('[data-draw-quick=use-as-template]').click()");
  list = await layers();
  assert.equal(list.length, 3); assert.deepEqual(list.at(-1).children, [], 'The image left the active layer');
  assert.equal(list[1].name, 'Template drop.png'); assert.equal(list[1].locked, true); assert.deepEqual(list[1].children, ['image']);
  await evaluate(`(async()=>{${active}.handle('undo')})()`);
  assert.deepEqual((await layers()).at(-1).children, ['image'], 'Undo puts the image back');
  await restoreTabs();
  console.log('PASS Draw Place: Import shows Place with Template (remembered, Cancel), template layer below the active layer (locked, 50 %, not printed, one undo step), Alt-drop as template, plain drop, Use as Template');
}
