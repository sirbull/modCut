import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D4.5: TIFF export, Graphic Styles, Navigator, Rotate View, Asset Export and workspaces. */
export async function runDrawWindowWorkflows(client) {
  const { evaluate } = client, { mouse } = inputHelpers(client), restore = await rememberTabs(evaluate);
  const root = '.draw-project[style*=block]';
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(40); } assert.fail(`Timed out: ${label}`); };
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Window proof' });
  const [red, blue] = await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,ids=[];
    for(const [x,y,s,fill,stroke] of [[10,10,20,'#FF0000','#000000'],[60,30,30,'#0000FF',null]]){const n=createNode('path',{name:fill==='#FF0000'?'Red':'',subpaths:[{closed:true,segments:[[x,y],[x+s,y],[x+s,y+s],[x,y+s]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(fill,stroke,1)});w.state.history.execute(insertNode(L,n));ids.push(n.id);}
    w.select([]);return ids;})()`);
  const exports = async () => { let list = []; for (let i = 0; i < 200 && !list.length; i++) { list = await evaluate('window.modcut.getE2EExports()'); if (!list.length) await wait(50); } return list; };

  // TIFF through File > Export As: options, then a little-endian TIFF.
  await evaluate("window.modcut.setE2EExportPath('Window proof.tif')");
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('File','Export As…')"), true);
  await until("!!document.querySelector('.draw-export-options form')", 'TIFF options');
  assert.equal(await evaluate("document.querySelector('.draw-export-options .panel__header').textContent"), 'TIFF Options');
  await evaluate("(()=>{const f=document.querySelector('.draw-export-options form');f.elements.ppi.value='72';f.elements.background.value='white';f.requestSubmit();})()");
  const [tif] = await exports();
  assert.equal(tif.name, 'Window proof.tif'); assert.deepEqual([...Buffer.from(tif.data, 'base64').subarray(0, 4)], [0x49, 0x49, 42, 0]);

  // GIF the same way; Chromium decodes it at the artboard size (120 x 80 mm at 72 ppi).
  await evaluate("window.modcut.setE2EExportPath('Window proof.gif')");
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('File','Export As…')"), true);
  await until("!!document.querySelector('.draw-export-options form')", 'GIF options');
  await evaluate("(()=>{const f=document.querySelector('.draw-export-options form');f.elements.ppi.value='72';f.elements.background.value='white';f.requestSubmit();})()");
  const [gif] = await exports();
  const decoded = await evaluate(`(async()=>{const img=new Image();img.src='data:image/gif;base64,${gif.data}';await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
    return {size:[img.width,img.height],red:[...g.getImageData(Math.round(20/25.4*72),Math.round(20/25.4*72),1,1).data].slice(0,3)}})()`);
  assert.deepEqual(decoded.size, [340, 227]); assert.ok(decoded.red[0] > 200 && decoded.red[1] < 50, `The red square in the GIF: ${decoded.red}`);

  // PLT (HP-GL): pen per colour, 40 units per mm.
  await evaluate("window.modcut.setE2EExportPath('Window proof.plt')");
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('File','Export As…')"), true);
  await until("!!document.querySelector('.draw-export-options form')", 'PLT options');
  await evaluate("document.querySelector('.draw-export-options form').requestSubmit()");
  const [plt] = await exports();
  assert.equal(plt.name, 'Window proof.plt'); assert.match(plt.text, /^IN;\nPA;\nSP1;\nPU400,2800;/); assert.match(plt.text, /SP2;/);
  // File > Package: the document, its links and the reports in "<name> Folder".
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('File','Package…')"), true);
  const packaged = await exports();
  assert.deepEqual(packaged.map(f => f.path.split('/').slice(-2).join('/')).sort(), ['Window proof Folder/Fonts.txt', 'Window proof Folder/Report.txt', 'Window proof Folder/Window proof.modcut']);
  const project = JSON.parse(packaged.find(f => f.name.endsWith('.modcut')).text);
  assert.equal(project.app, 'modCut'); assert.equal(project.draw.layers[0].children.length, 2);
  assert.match(packaged.find(f => f.name === 'Report.txt').text, /Paths: 2/);

  // Graphic Styles: a style from the red square, given to the blue one in one undo step.
  await evaluate(`(async()=>{const w=${active};w.select(['${red}']);w.handle('panel.graphic-styles')})()`); await wait(50);
  await evaluate(`document.querySelector('${root} [data-draw-style-new]').click()`); await wait(50);
  const style = await evaluate(`(async()=>(${active}.state.document.data.graphicStyles.at(-1)))()`);
  assert.equal(style.appearance.fills.length, 1);
  await evaluate(`(async()=>{const w=${active};w.select(['${blue}'])})()`); await wait(50);
  const steps = await evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  await evaluate(`document.querySelector('${root} [data-draw-style="${style.id}"]').click()`); await wait(50);
  const styled = await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('${blue}'),{paintHex}=await import('./draw/doc/paint.mjs');return {fill:paintHex(n.appearance.fills[0]),stroke:paintHex(n.appearance.strokes[0]),steps:w.state.history.entries.filter(e=>e.applied).length}})()`);
  assert.deepEqual(styled, { fill: '#ff0000', stroke: '#000000', steps: steps + 1 });

  // Navigator: clicking the overview's lower right moves the view there; zoom from the panel.
  await evaluate(`(async()=>{${active}.handle('panel.navigator')})()`); await wait(80);
  assert.equal(await evaluate(`!!document.querySelector('${root} [data-draw-navigator] img')`), true);
  const target = await evaluate(`(()=>{const r=document.querySelector('${root} [data-draw-navigator] img').getBoundingClientRect();return {x:r.left+r.width*.8,y:r.top+r.height*.8}})()`);
  await mouse('mousePressed', target, { buttons: 1 }); await mouse('mouseReleased', target);
  const centre = await evaluate(`(async()=>{const w=${active},c=w.scope.view.center,b=w.state.document.data.artboards[0];return [c.x-b.x,c.y-b.y].map(v=>Math.round(v))})()`);
  assert.ok(centre[0] > 90 && centre[1] > 55, `The view moved to the lower right: ${centre}`);
  await evaluate(`(()=>{const z=document.querySelector('${root} [data-draw-field=navigator-zoom]');z.value='200';z.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(50);
  assert.equal(await evaluate(`(async()=>Math.round(${active}.scope.view.zoom/(96/25.4)*100))()`), 200);

  // Rotate View (Shift+H): dragging turns the view, Shift snaps to 15°; View > Reset Rotate View undoes it.
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'H',code:'KeyH',shiftKey:true,bubbles:true,cancelable:true}))");
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`), 'rotate-view');
  const box = await evaluate(`(()=>{const r=document.querySelector('${root} canvas.draw-canvas').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width}})()`);
  await mouse('mouseMoved', { x: box.x + 100, y: box.y }); await mouse('mousePressed', { x: box.x + 100, y: box.y }, { buttons: 1, modifiers: 8 });
  await mouse('mouseMoved', { x: box.x + 71, y: box.y + 71 }, { buttons: 1, modifiers: 8 }); await mouse('mouseReleased', { x: box.x + 71, y: box.y + 71 }, { modifiers: 8 });
  assert.equal(await evaluate(`(async()=>Math.round(${active}.scope.view.rotation))()`), 45, 'A quarter turn of the pointer by 45°, snapped');
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('View','Reset Rotate View')"), true); await wait(50);
  assert.equal(await evaluate(`(async()=>${active}.scope.view.rotation||0)()`), 0, "Back to an unturned view");

  // Asset Export: the two squares as their own PNG files at 2x.
  await evaluate(`(async()=>{const w=${active};w.handle('select-all');w.handle('panel.asset-export')})()`); await wait(50);
  await evaluate(`document.querySelector('${root} [data-draw-asset-add]').click()`); await wait(50);
  assert.equal(await evaluate(`document.querySelectorAll('${root} [data-draw-asset]').length`), 2);
  await evaluate(`(()=>{const s=document.querySelector('${root} [data-draw-field=asset-scale]');s.value='2x';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await evaluate(`document.querySelector('${root} [data-draw-asset-export]').click()`);
  const assets = await exports();
  assert.deepEqual(assets.map(a => a.name).sort(), ['Asset 2@2x.png', 'Red@2x.png']);
  const size = await evaluate(`(async()=>{const img=new Image();img.src='data:image/png;base64,${assets.find(a => a.name === 'Red@2x.png').data}';await img.decode();return [img.width,img.height]})()`);
  assert.deepEqual(size, [119, 119], 'The red square (21 mm with its stroke) at 2x (144 ppi)');

  // Workspaces: save the layout with the Navigator open, reset to Essentials, switch back.
  await evaluate(`(async()=>{${active}.handle('panel.navigator')})()`); await wait(50);
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Window','New Workspace…')"), true);
  await until("!!document.querySelector('.draw-workspace-dialog form')", 'New Workspace');
  await evaluate("(()=>{const f=document.querySelector('.draw-workspace-dialog form');f.elements.name.value='Overview';f.requestSubmit();})()"); await wait(50);
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Window','Essentials')"), true); await wait(50);
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.flyout))()`), null);
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Window','Manage Workspaces…')"), true);
  await until("!!document.querySelector('.draw-workspaces-dialog form')", 'Manage Workspaces');
  await evaluate("(()=>{const f=document.querySelector('.draw-workspaces-dialog form');f.elements.name.value='Overview';f.requestSubmit();})()"); await wait(80);
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.flyout))()`), 'navigator');
  await evaluate("localStorage.removeItem('modcut.draw.workspaces')");
  await restore();
  console.log('PASS Draw window: TIFF, GIF and PLT export, Package, Graphic Styles (new from selection, apply in one step), Navigator (click to move, zoom), Rotate View with 15° snapping and reset, Asset Export at 2x, workspaces saved, reset and switched');
}
