import assert from 'node:assert/strict';
import { wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, rememberTabs } from './draw-test-helpers.mjs';

/** D2.5 and D2.7: Export As writes one artboard as SVG (mm), PNG with transparency or JPEG. */
export async function runDrawExportWorkflows(client) {
  const { evaluate } = client;
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(50); } assert.fail(`Timed out: ${label}`); };
  // Later suites expect the tabs and workspace this one started with.
  const restoreTabs = await rememberTabs(evaluate);
  await evaluate("document.body.dataset.workspace==='draw'||document.querySelector('#workspaceToggle').click();document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Export proof' });
  // A red outline, a half-transparent blue square and a template reference that must not be exported.
  await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,sq=(x,y,s)=>[{closed:true,segments:[[x,y],[x+s,y],[x+s,y+s],[x,y+s]].map(p=>({p,in:[0,0],out:[0,0]}))}];
    w.state.history.execute(insertNode(L,createNode('path',{id:'ex-red',subpaths:sq(b.x+10,b.y+10,20),appearance:appearance(null,'#FF0000',1)})));
    w.state.history.execute(insertNode(L,createNode('path',{id:'ex-blue',opacity:.5,subpaths:sq(b.x+60,b.y+20,40),appearance:appearance('#0000FF',null)})));
    w.state.history.execute(insertNode(null,createNode('layer',{id:'ex-template',name:'Template',template:true,locked:true,printable:false,children:[createNode('path',{id:'ex-ref',subpaths:sq(b.x+5,b.y+50,20),appearance:appearance('#00FF00',null)})]}),0));
    w.select([]);if(!w.renderer.outline)w.handle('outline');})()`);

  // SVG: millimetre document in artboard coordinates, preview appearance even from Outline view, no template art.
  const svg = await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.document.data.artboards[0].id,'svg');})()`);
  assert.match(svg, /<svg [^>]*width="120mm" height="80mm" viewBox="0 0 120 80"/);
  assert.match(svg, /stroke="#ff0000"/i); assert.match(svg, /fill="#0000ff"/i); assert.match(svg, /opacity="0.5"/);
  assert.doesNotMatch(svg, /#00ff00/i, 'Template layers are not exported');
  const parsed = await evaluate(`(()=>{const d=new DOMParser().parseFromString(${JSON.stringify(svg)},'image/svg+xml');return !d.querySelector('parsererror')&&d.documentElement.localName;})()`);
  assert.equal(parsed, 'svg', 'The SVG is well formed');

  // PNG with transparency and JPEG on white, sized from the artboard and resolution.
  const pixels = format => evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],url=w.exportBoard(b.id,'${format}',{ppi:72});
    const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
    const at=(x,y)=>[...g.getImageData(Math.round(x/25.4*72),Math.round(y/25.4*72),1,1).data];
    return {mime:url.slice(5,url.indexOf(';')),width:img.width,height:img.height,empty:at(40,60),blue:at(80,40),red:at(10,20)};})()`);
  const png = await pixels('png');
  assert.equal(png.mime, 'image/png'); assert.deepEqual([png.width, png.height], [340, 227]);
  assert.equal(png.empty[3], 0, 'PNG keeps empty areas transparent');
  assert.ok(png.blue[2] > 200 && png.blue[0] < 40 && png.blue[3] > 100 && png.blue[3] < 160, `Half-transparent blue: ${png.blue}`);
  assert.ok(png.red[0] > 150 && png.red[3] > 100, `The red outline is drawn at full preview width: ${png.red}`);
  const jpg = await pixels('jpg');
  assert.equal(jpg.mime, 'image/jpeg'); assert.ok(jpg.empty.slice(0, 3).every(v => v > 245), `JPEG has a white background: ${jpg.empty}`);
  assert.equal(await evaluate(`(async()=>(${active}.renderer.outline))()`), true, 'Export leaves Outline view as it was');

  // Export As from the File menu: format choice, the saved file and its name.
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('File','Export As…')"), true);
  await until("!!document.querySelector('.draw-export-dialog form')", 'Export As dialog');
  assert.equal(await evaluate("document.querySelector('.draw-export-dialog form').elements.ppi.closest('label').hidden"), false);
  await evaluate("(()=>{const f=document.querySelector('.draw-export-dialog form');f.elements.format.value='jpg';f.elements.format.dispatchEvent(new Event('change',{bubbles:true}));})()");
  assert.equal(await evaluate("document.querySelector('.draw-export-dialog form').elements.background.value"), 'white', 'JPEG cannot be transparent');
  await evaluate("(()=>{const f=document.querySelector('.draw-export-dialog form');f.elements.format.value='svg';f.elements.format.dispatchEvent(new Event('change',{bubbles:true}));f.requestSubmit();})()");
  let exports = [];
  for (let i = 0; i < 100 && !exports.length; i++) { exports = await evaluate('window.modcut.getE2EExports()'); if (!exports.length) await wait(50); }
  assert.equal(exports.length, 1); assert.equal(exports[0].name, 'Export proof.svg'); assert.match(exports[0].text, /width="120mm"/);
  await evaluate(`(async()=>{${active}.handle('outline')})()`);
  await restoreTabs();
  console.log('PASS Draw export: SVG in millimetres without templates, preview from Outline view, PNG transparency and size, JPEG on white, Export As dialog and file');
}
