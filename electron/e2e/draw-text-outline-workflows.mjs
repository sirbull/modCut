import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, rememberTabs } from './draw-test-helpers.mjs';

export async function runDrawTextOutlineWorkflows(client) {
  const {evaluate,command}=client,restore=await rememberTabs(evaluate);
  const until=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await wait(50);}assert.fail(`Timed out: ${expression}`);};
  if(await evaluate("document.body.dataset.workspace")!=='draw')await evaluate("document.querySelector('#workspaceToggle').click()");
  if(await evaluate("!!document.querySelector('.draw-document-dialog')"))await submitNewDrawDialog(evaluate);
  await evaluate("document.querySelector('#newDoc').click()");await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Outlines proof'});
  const faces=await evaluate('window.modcut.listSystemFonts()');assert.ok(faces.length);assert.ok(faces.every(f=>!f.path));
  const face=faces.find(f=>['Arial','DejaVu Sans','Liberation Sans','Helvetica'].includes(f.family)&&f.fontWeight==='normal'&&f.fontStyle==='normal');assert.ok(face,'A Latin text font is installed');
  const node=await evaluate(`(async()=>{const w=${active},{pointText,DEFAULT_CHARACTER}=await import('./draw/doc/text.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),b=w.state.document.data.artboards[0],f=${JSON.stringify(face)};
    const values={text:${JSON.stringify('AV fi ÆØÅ\næøå')},...DEFAULT_CHARACTER,fontFamily:f.family,fontPostscriptName:f.postscriptName,alignment:'center'};
    const n=pointText([b.x+60,b.y+35],values);n.opacity=.65;n.transform=[1.1,.1,-.1,1.1,b.x+60,b.y+35];n.layout=await window.modcut.shapeText(values);
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);w.setTool('select');return n;})()`);
  const before=await evaluate(`(async()=>{const w=${active},b=w.renderer.bounds('${node.id}'),board=w.state.document.getArtboard(w.state.ui.artboardId);return {model:w.state.document.serialize(),board:[board.x,board.y],bounds:[b.x,b.y,b.width,b.height],png:w.exportBoard(w.state.ui.artboardId,'png',{ppi:150}),depth:w.state.history.entries.filter(e=>e.applied).length};})()`);
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Type','Create Outlines')"),true);
  await until(`(async()=>(${active}.state.document.getNode('${node.id}').type==='group'))()`);
  const result=await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('${node.id}'),b=w.renderer.bounds(n.id),cut=w.cutSvg(w.state.ui.artboardId);return {type:n.type,paths:n.children.flatMap(line=>line.children).map(g=>g.subpaths),bounds:[b.x,b.y,b.width,b.height],depth:w.state.history.entries.filter(e=>e.applied).length,cut,svg:w.exportBoard(w.state.ui.artboardId,'svg'),png:w.exportBoard(w.state.ui.artboardId,'png',{ppi:150})};})()`);
  assert.equal(result.depth,before.depth+1);assert.deepEqual(result.paths,node.layout.glyphs.filter(g=>g.subpaths.length).map(g=>g.subpaths));
  result.bounds.forEach((v,i)=>assert.ok(Math.abs(v-before.bounds[i])<.01,'Outlining preserves visible dimensions within 0.01 mm'));
  assert.equal(result.cut.count,result.paths.length);assert.doesNotMatch(result.cut.warnings.join(' '),/text object/);assert.doesNotMatch(result.svg,/<text[\s>]/);
  const difference=await evaluate(`(async()=>{const urls=${JSON.stringify([before.png,result.png])},pixels=[];for(const url of urls){const i=new Image();i.src=url;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const g=c.getContext('2d');g.drawImage(i,0,0);pixels.push(g.getImageData(0,0,i.width,i.height).data);}let sum=0;for(let i=0;i<pixels[0].length;i++)sum+=Math.abs(pixels[0][i]-pixels[1][i]);return sum/pixels[0].length;})()`);
  assert.ok(difference<.1,`Raster preview and outlines agree (mean channel difference ${difference})`);
  await evaluate(`(async()=>{${active}.handle('undo')})()`);assert.equal(await evaluate(`(async()=>(${active}.state.document.serialize()))()`),before.model);
  await evaluate(`(async()=>{${active}.handle('redo')})()`);
  // Legacy point text has no cached glyphs and may use default paragraph settings / CRLF.
  const legacy=await evaluate(`(async()=>{const w=${active},{pointText,DEFAULT_CHARACTER}=await import('./draw/doc/text.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),f=${JSON.stringify(face)};
    const n=pointText([10,65],{...DEFAULT_CHARACTER,text:'Legacy',fontFamily:f.family,alignment:'left'});n.paragraph={};n.content={runs:[{text:${JSON.stringify('Legacy\r\nA')}}]};
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);w.handle('create-outlines');return n.id;})()`);
  await until(`(async()=>(${active}.state.document.getNode('${legacy}').type==='group'))()`);
  await evaluate(`(async()=>{const w=${active};w.handle('undo');w.handle('undo')})()`);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${legacy}')) )()`),null);
  const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'modcut-draw-text-outlines.png'),Buffer.from(shot.data,'base64'));
  // An empty Cut with one artboard receives the artwork directly, without the Send to Cut dialog.
  // Started without awaiting a promise: late in a full run Chromium could collect the awaited import() promise
  // ("Promise was collected"); the workspace switch below is what the test waits for.
  await evaluate(`(()=>{import('./draw/index.mjs').then(m=>m.getDrawWorkspace(document.querySelector('.draw-project[data-tab-id="'+document.querySelector('.doc-tab.is-active').dataset.tabId+'"]')).handle('send-to-cut'));return true;})()`);
  await until("document.body.dataset.workspace==='cut'");
  const placed=await evaluate("(()=>{const items=paper.project.layers[1].children,b=items.reduce((box,item)=>box?box.unite(item.bounds):item.bounds.clone(),null);return {count:items.length,paths:items.every(i=>i.className==='Path'||i.className==='CompoundPath'),bounds:b?[b.x,b.y,b.width,b.height]:null};})()");
  assert.ok(placed.count>0&&placed.paths,'Send to Cut produces editable vector paths');
  const expected=[before.bounds[0]-before.board[0],before.bounds[1]-before.board[1],...before.bounds.slice(2)];
  placed.bounds.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<.01,'Cut receives the same glyph dimensions and placement'));
  await restore();
  console.log('PASS Draw outlines: installed fonts, shaped glyphs, exact geometry, transformed/transparent text, native Type menu, atomic undo/redo, portable SVG and Cut paths');
}
