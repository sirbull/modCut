import assert from 'node:assert/strict';
import { wait, inputHelpers } from './cdp.mjs';
import { runDrawRenderWorkflows } from './draw-render-workflows.mjs';
import { submitNewDrawDialog } from './draw-test-helpers.mjs';

const active = `(await import('./draw/index.mjs')).getDrawWorkspace(document.querySelector('.draw-project[data-tab-id="'+document.querySelector('.doc-tab.is-active').dataset.tabId+'"]'))`;
const model = evaluate => evaluate(`(async()=>(${active}.state.snapshot()))()`);
async function until(check,message) { for (let i=0;i<100;i++) { if (await check()) return; await wait(50); } throw new Error(message); }
const svg = (name,width = 40) => ({name,ext:'svg',text:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="20mm" viewBox="0 0 40 20"><style>.art{fill:#00ac69;stroke:#006b5c;stroke-width:.5}</style><g transform="translate(3 2)"><path class="art" d="M0 0h10v5h-10z"/></g></svg>`});
export async function runDrawUIWorkflows(client) {
  const {evaluate} = client, {drag} = inputHelpers(client);
  const original = await evaluate("({id:document.querySelector('.doc-tab.is-active').dataset.tabId,design:paper.project.layers[1].exportJSON({asString:true})})");
  await evaluate("document.querySelector('#workspaceToggle').click()");
  assert.deepEqual(await evaluate("['newDoc','import','add'].map(id=>document.getElementById(id).textContent)"),['New','Open','Import']);
  await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate);
  const blankId = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  assert.equal(await evaluate('document.body.dataset.workspace'),'draw');
  assert.equal((await model(evaluate)).layers[0].children.length,0);
  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify(svg('opened-vector.svg'))})`);
  await evaluate("document.querySelector('#import').click()");
  await until(() => evaluate(`document.querySelector('.doc-tab.is-active').dataset.tabId !== ${JSON.stringify(blankId)} && document.querySelector('.doc-tab.is-active .doc-tab__title').textContent === 'opened-vector.svg'`),'Open did not create a new Draw document');
  const openedId = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  let data = await model(evaluate);
  assert.equal(data.artboards[0].width,40); assert.equal(data.artboards[0].height,20);
  const paths = nodes => nodes.flatMap(node => node.children ? paths(node.children) : node.type === 'path' ? [node] : []);
  const path = paths(data.layers)[0];
  assert.deepEqual(path.subpaths[0].segments[0].p,[3,2],'SVG transforms and mm dimensions are preserved');
  assert.ok(Math.abs(path.appearance.strokes[0].width-.5)<.001);
  assert.deepEqual(path.appearance.fills[0].paint.color.values,[0,172/255,105/255],'SVG CSS color survives');
  assert.equal(await evaluate(`(async()=>(${active}.renderer.bounds(${JSON.stringify(path.id)}).width))()`),10);

  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify([svg('added-vector.svg',80)])})`);
  await evaluate("document.querySelector('#add').click()");
  await until(async () => (await model(evaluate)).layers[0].children.length === 2,'Import did not add to the current Draw model');
  assert.equal(await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId"),openedId);
  assert.equal((await model(evaluate)).layers[0].children[0].id,data.layers[0].children[0].id);

  const png = await evaluate("(()=>{const c=document.createElement('canvas');c.width=24;c.height=12;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,24,12);return c.toDataURL('image/png')})()");
  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify([{name:'colored-image.png',ext:'png',dataUrl:png}])})`);
  await evaluate("document.querySelector('#add').click()");
  await until(async () => (await model(evaluate)).layers[0].children.length === 3,'Raster was not imported into Draw');
  data = await model(evaluate); const image = data.layers[0].children[2];
  assert.equal(image.type,'image'); assert.ok(data.assets[image.assetId].data);
  await until(() => evaluate(`(async()=>(${active}.renderer.items.get(${JSON.stringify(image.id)})?.loaded))()`),'Raster did not render');
  assert.ok(await evaluate(`(async()=>(${active}.renderer.items.get(${JSON.stringify(image.id)}).getPixel(0,0).red>.99))()`),'Draw preserves original raster colors');

  const layout = await evaluate("(()=>{const root=document.querySelector('.draw-project[style*=block]'),tool=root.querySelector('.draw-tool-rail').getBoundingClientRect(),canvas=root.querySelector('.draw-canvas').getBoundingClientRect(),rail=root.querySelector('.draw-panel-rail').getBoundingClientRect(),panel=root.querySelector('.draw-panels').getBoundingClientRect();return{left:tool.right<=canvas.left,right:canvas.right<=rail.left,options:rail.right<=panel.left,icons:root.querySelectorAll('[data-draw-panel]').length}})()");
  assert.deepEqual(layout,{left:true,right:true,options:true,icons:7});
  await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-panel=artboards]').click()");
  assert.ok(await evaluate("!!document.querySelector('.draw-project[style*=block] [data-draw-field=artboard-width]')"));
  await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-panel=layers]').click()");
  await evaluate(`document.querySelector('.draw-project[style*=block] [data-draw-node="${path.id}"] .draw-layer-name').click()`);
  await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-panel=transform]').click()");
  await evaluate("(()=>{const i=document.querySelector('.draw-project[style*=block] [data-draw-field=width]');i.value='20';i.dispatchEvent(new Event('change',{bubbles:true}))})()");
  assert.ok(Math.abs(await evaluate(`(async()=>(${active}.renderer.bounds(${JSON.stringify(path.id)}).width))()`)-20)<.001,'Properties resizes selected vector geometry');
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',metaKey:/Mac/.test(navigator.platform),ctrlKey:!/Mac/.test(navigator.platform),bubbles:true,cancelable:true}))");
  assert.equal(await evaluate(`(async()=>(${active}.renderer.bounds(${JSON.stringify(path.id)}).width))()`),10,'Draw undo uses Draw history');

  await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-tool=rectangle]').click()");
  const c = await evaluate("(()=>{const b=document.querySelector('.draw-project[style*=block] .draw-canvas').getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height}})()");
  await drag({x:c.x+c.w*.65,y:c.y+c.h*.6},{x:c.x+c.w*.8,y:c.y+c.h*.75});
  assert.equal((await model(evaluate)).layers[0].children.at(-1).type,'shape','Left toolbar draws into the model');
  await evaluate("document.querySelector('.draw-project[style*=block] [aria-label=\"Shape tools\"]').click()");
  assert.equal(await evaluate("document.querySelector('.draw-tool-flyout').querySelectorAll('button').length"),4);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  await runDrawRenderWorkflows(client,image.id);
  await evaluate(`document.querySelector('[data-tab-id="${original.id}"]').click()`);
  assert.equal(await evaluate("paper.project.layers[1].exportJSON({asString:true})"),original.design,'Draw IO and tools preserve the original Cut document');
  await evaluate("document.querySelector('#workspaceToggle').click()");
  assert.deepEqual(await evaluate("['newDoc','import','add'].map(id=>document.getElementById(id).textContent)"),['New','Import','Add']);
  // Remove our scratch documents so subsequent native Close/Quit tests have their own dirty tabs.
  for (const id of [openedId,blankId]) {
    await evaluate(`document.querySelector('[data-close-tab="${id}"]').click()`);
    await wait(100);
    if (await evaluate("!!document.querySelector('[data-x=discard]')")) { await evaluate("document.querySelector('[data-x=discard]').click()"); await wait(100); }
  }
  await evaluate(`document.querySelector('[data-tab-id="${original.id}"]').click()`);
  process.stdout.write('PASS Draw: New/Open/Import, editable SVG, color raster, rails/panels, properties, shapes and Cut isolation\n');
}
