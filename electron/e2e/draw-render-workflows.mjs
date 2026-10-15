import assert from 'node:assert/strict';
import { wait, inputHelpers } from './cdp.mjs';

const active = `(await import('./draw/index.mjs')).getDrawWorkspace(document.querySelector('.draw-project[data-tab-id="'+document.querySelector('.doc-tab.is-active').dataset.tabId+'"]'))`;

/** Run inside the existing scratch Draw tab, using its imported full-colour image. */
export async function runDrawRenderWorkflows(client, imageId) {
  const { evaluate } = client;
  const menu = await evaluate('window.modcut.getE2EWorkspaceMenu()');
  assert.equal(menu.view.find(item => item.label === 'Outline / Preview').accelerator, process.platform === 'darwin' ? 'Cmd+Y' : 'Ctrl+Y');
  const initial = await evaluate(`(async () => {
    const w = ${active}, image = w.renderer.items.get(${JSON.stringify(imageId)});
    window.__drawRenderProof = { image, snapshot:w.state.document.serialize(), entries:w.state.history.entries.length, dirty:w.state.dirty };
    return { width:image.width, height:image.height, pixels:image.getPixel(0,0).toCSS(true), scope:paper.project.view.element.className };
  })()`);
  assert.deepEqual(initial, { width:24, height:12, pixels:'#ff0000', scope:'bed-canvas' }, 'rendering retains original pixels and the Cut scope');

  // The real central keymap must route Ctrl/Cmd+Y to Draw instead of Cut redo.
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'y',code:'KeyY',metaKey:/Mac/.test(navigator.platform),ctrlKey:!/Mac/.test(navigator.platform),bubbles:true,cancelable:true}))`);
  assert.deepEqual(await evaluate(`(async () => {
    const w=${active}, b=document.querySelector('.draw-project[style*=block] [aria-label="Outline view"]');
    return {outline:w.renderer.outline, image:w.renderer.items.get(${JSON.stringify(imageId)}).visible, pressed:b.getAttribute('aria-pressed'), unchanged:w.state.document.serialize()===window.__drawRenderProof.snapshot,
      history:w.state.history.entries.length===window.__drawRenderProof.entries, dirty:w.state.dirty===window.__drawRenderProof.dirty};
  })()`), {outline:true,image:false,pressed:'true',unchanged:true,history:true,dirty:true});
  await evaluate(`document.querySelector('.draw-project[style*=block] [aria-label="Outline view"]').click()`);
  assert.equal(await evaluate(`(async()=>(${active}.renderer.outline))()`), false);

  const transformed = await evaluate(`(async () => {
    const w=${active}, {updateNode}=await import('./draw/doc/commands.mjs');
    w.state.history.execute(updateNode(${JSON.stringify(imageId)},{transform:[2,0,0,3,100,80]}));
    const item=w.renderer.items.get(${JSON.stringify(imageId)}), b=w.renderer.bounds(${JSON.stringify(imageId)});
    return {retained:item===window.__drawRenderProof.image, width:item.width, height:item.height, x:b.x, y:b.y, matrix:item.matrix.values};
  })()`);
  assert.equal(transformed.retained,true); assert.equal(transformed.width,24); assert.equal(transformed.height,12);
  assert.equal(transformed.x,100); assert.equal(transformed.y,80);
  await evaluate(`(async()=>(${active}.handle('undo')))()`);

  // Insert/edit before Raster.onload, then remove a second pending raster. Late callbacks stay harmless.
  await evaluate(`(async () => {
    const w=${active}, {createNode}=await import('./draw/doc/schema.mjs'), {insertNode,updateNode,removeNode}=await import('./draw/doc/commands.mjs');
    const source=w.state.document.getNode(${JSON.stringify(imageId)}), layer=w.state.document.data.layers[0].id;
    const pending=createNode('image',{assetId:source.assetId,width:24,height:12}); window.__drawPendingId=pending.id;
    w.state.history.execute(insertNode(layer,pending));
    w.state.history.execute(updateNode(pending.id,{transform:[1,0,0,1,40,50]}));
    const removed=createNode('image',{assetId:source.assetId,width:24,height:12}); window.__drawRemovedId=removed.id;
    w.state.history.execute(insertNode(layer,removed)); w.state.history.execute(removeNode(removed.id));
  })()`);
  await wait(100);
  assert.deepEqual(await evaluate(`(async () => {
    const w=${active}, item=w.renderer.items.get(window.__drawPendingId), b=w.renderer.bounds(window.__drawPendingId);
    return {loaded:item.loaded, pixels:item.getPixel(0,0).toCSS(true), bounds:[b.x,b.y,b.width,b.height], actual:[item.bounds.x,item.bounds.y,item.bounds.width,item.bounds.height], removed:w.renderer.items.has(window.__drawRemovedId), cut:paper.project.view.element.className};
  })()`), {loaded:true,pixels:'#ff0000',bounds:[40,50,24,12],actual:[40,50,24,12],removed:false,cut:'bed-canvas'});

  const position = await evaluate(`(async () => {
    const w=${active}, {createNode}=await import('./draw/doc/schema.mjs'), {insertNode}=await import('./draw/doc/commands.mjs');
    const node=createNode('shape',{params:{x:5000,y:5000,width:40,height:40},appearance:(await import('./draw/geometry.mjs')).appearance('#FF0000',null)});
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,node)); window.__drawFarId=node.id;
    const invisible=!w.renderer.items.get(node.id).visible;
    w.scope.view.zoom=2; w.scope.view.center=[5020,5020]; w.renderer.updateView();
    const visible=w.renderer.items.get(node.id).visible;
    w.setTool('hand');
    const b=w.scope.view.element.getBoundingClientRect();
    return {invisible,visible,x:b.x+b.width/2,y:b.y+b.height/2};
  })()`);
  assert.equal(position.invisible,true); assert.equal(position.visible,true);
  await inputHelpers(client).drag({x:position.x,y:position.y},{x:position.x+60,y:position.y});
  assert.ok(await evaluate(`(async()=>Math.abs(${active}.scope.view.center.x-4990)<1)()`), 'Hand updates the viewport in project units');
  await evaluate(`(async()=>(${active}.handle('fit-all')))()`);
  assert.equal(await evaluate(`(async()=>(${active}.renderer.items.get(window.__drawFarId).visible))()`),false,'Fit reapplies culling');
  await evaluate('delete window.__drawRenderProof; delete window.__drawPendingId; delete window.__drawRemovedId; delete window.__drawFarId');
  process.stdout.write('PASS Draw renderer: Outline shortcut/menu, original raster pixels, async image edits, culling and Hand/Fit\n');
}
