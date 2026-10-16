import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, rememberTabs, enterDraw } from './draw-test-helpers.mjs';

/** D2.5 and D2.7: Export As writes one artboard as SVG (mm), PNG with transparency or JPEG. */
export async function runDrawExportWorkflows(client) {
  const { evaluate } = client;
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(50); } assert.fail(`Timed out: ${label}`); };
  // Later suites expect the tabs and workspace this one started with.
  const restoreTabs = await rememberTabs(evaluate);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
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

  // Export lives in File > Export; the panels no longer offer it.
  assert.equal(await evaluate("[...document.querySelectorAll('.draw-shell button')].some(b=>/^Export/.test(b.textContent.trim()))"), false, 'Export is not in the panels');
  // The save dialog chooses the file and its type; then that type's options; then the file is written.
  const exportAs = async (file, options) => {
    await evaluate(`window.modcut.setE2EExportPath(${JSON.stringify(file)})`);
    assert.equal(await evaluate("window.modcut.clickE2EMenuItem('File','Export As…')"), true);
    await options();
    let list = [];
    for (let i = 0; i < 200 && !list.length; i++) { list = await evaluate('window.modcut.getE2EExports()'); if (!list.length) await wait(50); }
    return list;
  };
  const presetLabel = () => evaluate("document.querySelector('.draw-pdf-dialog [name=preset]').selectedOptions[0].textContent");
  const [pdf, ...extraPdf] = await exportAs('Export proof.pdf', async () => {
    await until("!!document.querySelector('.draw-pdf-dialog form')", 'Save PDF dialog');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.draw-pdf-tab')].map(t=>t.textContent)"), ['General', 'Compression', 'Marks and Bleeds', 'Summary']);
    assert.equal(await presetLabel(), '[modCut Default]');
    await evaluate("document.querySelector('.draw-pdf-tab[data-section=marks]').click();document.querySelector('.draw-pdf-dialog [name=trim]').click()");
    assert.equal(await presetLabel(), '[modCut Default] (Modified)', 'Changing a setting marks the preset as modified');
    await evaluate("document.querySelector('.draw-pdf-dialog [name=trim]').click()");
    assert.equal(await presetLabel(), '[modCut Default]', 'Undoing the change matches the preset again');
    await evaluate("(()=>{const s=document.querySelector('.draw-pdf-dialog [name=preset]');s.value='press';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
    assert.deepEqual(await evaluate("['trim','bleed-top','preserveEditing'].map(n=>{const e=document.querySelector('.draw-pdf-dialog [name='+n+']');return e.type==='checkbox'?e.checked:e.value;})"), [true, '3', false]);
    await evaluate("(()=>{const s=document.querySelector('.draw-pdf-dialog [name=preset]');s.value='default';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.draw-pdf-tab[data-section=summary]').click();})()");
    assert.match(await evaluate("document.querySelector('.draw-pdf-summary').textContent"), /Editing data: kept/);
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.draw-pdf-page')].map(p=>p.getClientRects().length>0)"), [false, false, false, true], 'Only the chosen section shows');
    await writeFile(join(tmpdir(), 'modcut-draw-pdf-dialog.png'), Buffer.from((await client.command('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate("document.querySelector('.draw-pdf-tab[data-section=general]').click();document.querySelector('.draw-pdf-dialog form').requestSubmit()");
  });
  assert.equal(extraPdf.length, 0, 'A PDF holds every artboard in one file');
  await writeFile(join(tmpdir(), 'modcut-draw-export.pdf'), Buffer.from(pdf.data, 'base64'));
  assert.equal(pdf.name, 'Export proof.pdf'); assert.match(Buffer.from(pdf.head, 'base64').toString('latin1'), /^%PDF-1.6/);
  // The PDF keeps modCut editing data, so Open brings the Draw document back with its objects.
  const before = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify({ name: 'Export proof.pdf', ext: 'pdf', dataUrl: `data:application/pdf;base64,${pdf.data}` })})`);
  await evaluate("document.querySelector('#import').click()");
  await until(`document.querySelector('.doc-tab.is-active').dataset.tabId!=='${before}'`, 'PDF opened in a new tab');
  await until(`(async()=>{const w=${active};return !!w&&!!w.state.document.getNode('ex-red')&&!!w.state.document.getNode('ex-blue');})()`, 'Editable objects from the PDF');
  await evaluate(`document.querySelector('[data-tab-id="${before}"]').click()`);

  // DXF and PNG through the same flow, with their own options.
  const [dxf] = await exportAs('Export proof.dxf', async () => {
    await until("!!document.querySelector('.draw-export-options form')", 'DXF options');
    assert.equal(await evaluate("document.querySelector('.draw-export-options .panel__header').textContent"), 'DXF (AutoCAD R12) Options');
    await evaluate("document.querySelector('.draw-export-options form').requestSubmit()");
  });
  assert.equal(dxf.name, 'Export proof.dxf'); assert.match(dxf.text, /AC1009/); assert.match(dxf.text, /POLYLINE/);
  const [image] = await exportAs('Export proof.png', async () => {
    await until("!!document.querySelector('.draw-export-options form')", 'PNG options');
    await evaluate("(()=>{const f=document.querySelector('.draw-export-options form');f.elements.ppi.value='72';f.requestSubmit();})()");
  });
  assert.equal(image.name, 'Export proof.png');
  const size = await evaluate(`(async()=>{const img=new Image();img.src='data:image/png;base64,${image.data}';await img.decode();return [img.width,img.height];})()`);
  assert.deepEqual(size, [340, 227]);

  // Export for Screens: thumbnails, rows of scale + suffix + format, sub-folders and a prefix, into one folder.
  await evaluate(`(async()=>{${active}.artboards.add();})()`);
  assert.equal(await evaluate(`(async()=>${active}.state.document.data.artboards.length)()`), 2);
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('File','Export for Screens…')"), true);
  await until("!!document.querySelector('.draw-screens-dialog form')", 'Export for Screens dialog');
  const dlg = (js) => evaluate(`(()=>{const d=document.querySelector('.draw-screens-dialog');${js}})()`);
  assert.equal(await dlg("return d.querySelectorAll('.draw-screens__card').length"), 2);
  assert.equal(await dlg("return d.querySelector('.draw-screens__count').textContent"), 'Selected: 2, Total export: 2');
  await until("[...document.querySelectorAll('.draw-screens__thumb img')].every(i=>i.complete&&i.naturalWidth>0)", 'Artboard thumbnails');
  await dlg("[...d.querySelectorAll('button')].find(b=>b.textContent==='Choose…').click()");
  await until("!!document.querySelector('.draw-screens-dialog [name=folder]').value", 'Chosen folder');
  await dlg("d.querySelector('.draw-screens__add').click()");
  assert.deepEqual(await dlg("return [...d.querySelectorAll('.draw-screens__row:not(.draw-screens__row--head)')].map(r=>[...r.querySelectorAll('[data-k]')].map(e=>e.value))"), [['1x', '', 'png'], ['2x', '@2x', 'png']]);
  assert.equal(await dlg("return d.querySelector('.draw-screens__count').textContent"), 'Selected: 2, Total export: 4');
  // Two rows writing the same names are refused.
  await dlg("const r=d.querySelectorAll('.draw-screens__row')[2];r.querySelector('[data-k=scale]').value='1x';r.querySelector('[data-k=suffix]').value='';d.querySelector('form').requestSubmit()");
  assert.match(await dlg("return d.querySelector('.draw-export-error').textContent"), /same files/);
  await dlg("const r=d.querySelectorAll('.draw-screens__row')[2];r.querySelector('[data-k=scale]').value='2x';r.querySelector('[data-k=suffix]').value='@2x'");
  await dlg("d.querySelector('.draw-screens__add').click();const r=d.querySelectorAll('.draw-screens__row')[3],f=r.querySelector('[data-k=format]');f.value='svg';f.dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await dlg("return d.querySelectorAll('.draw-screens__row')[3].querySelector('[data-k=scale]').disabled"), true, 'Vector rows have no scale');
  // Unticking an artboard switches to a range.
  await dlg("const c=d.querySelectorAll('.draw-screens__check')[1];c.click()");
  assert.deepEqual(await dlg("return [d.querySelector('[name=range]').value,d.querySelector('.draw-screens__count').textContent]"), ['1', 'Selected: 1, Total export: 3']);
  await dlg("d.querySelector('[name=prefix]').value='app-'");
  await writeFile(join(tmpdir(), 'modcut-draw-export-screens.png'), Buffer.from((await client.command('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await dlg("d.querySelector('form').requestSubmit()");
  let screens = [];
  for (let i = 0; i < 200 && screens.length < 3; i++) { screens = [...screens, ...await evaluate('window.modcut.getE2EExports()')]; if (screens.length < 3) await wait(50); }
  assert.deepEqual(screens.map((f) => f.path.split('/screens/').pop()).sort(), ['1x/app-Artboard 1.png', '2x/app-Artboard 1@2x.png', 'app-Artboard 1@3x.svg']);
  const sizes = await evaluate(`(async()=>Promise.all(${JSON.stringify(screens.filter((f) => f.format === 'png').map((f) => [f.name, f.data]))}.map(async([n,d])=>{const i=new Image();i.src='data:image/png;base64,'+d;await i.decode();return [n,i.width];})))()`);
  assert.deepEqual(Object.fromEntries(sizes), { 'app-Artboard 1.png': 340, 'app-Artboard 1@2x.png': 680 });
  await evaluate(`(async()=>{${active}.handle('outline')})()`);
  await restoreTabs();
  console.log('PASS Draw export: SVG in millimetres without templates, preview from Outline view, PNG transparency and size, JPEG on white, Export As via File > Export with PDF (Save PDF presets, editable reopen), DXF and PNG; Export for Screens with thumbnails, scale rows, sub-folders and prefix');
}
