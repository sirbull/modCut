import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D2.1d Type on a Path: click a path or shape, type along it, flip, overflow, outlines and Cut. */
export async function runDrawPathTextWorkflows(client) {
  const {evaluate,command}=client,{click,key}=inputHelpers(client),restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:160,height:100,name:'Path text proof'});
  const at=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const snapshot=()=>evaluate(`(async()=>(${active}.state.document.serialize()))()`);
  const ready=async()=>{for(let i=0;i<200;i++){if(await evaluate("document.querySelector('.draw-text-dialog form')?.dataset.textReady==='true'"))return;await wait(50);}assert.fail(await evaluate("document.querySelector('.draw-text-dialog [role=alert]')?.textContent||'Type on a Path dialog did not become ready'"));};
  const set=async values=>{await evaluate(`(()=>{const f=document.querySelector('.draw-text-dialog form');for(const [key,value] of Object.entries(${JSON.stringify(values)})){const el=f.elements[key];if(el.type==='checkbox')el.checked=value;else el.value=value;}f.dispatchEvent(new Event('input',{bubbles:true}));})()`);await ready();};
  const apply=async()=>{await evaluate("document.querySelector('.draw-text-dialog form').requestSubmit()");await wait(80);};
  const applied=()=>evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  // A circle (live ellipse shape) centred at (60, 50) with radius 30, and a short open line.
  const ids=await evaluate(`(async()=>{const w=${active},{shapeFromDrag}=await import('./draw/tools/shapes.mjs'),{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs'),b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id;
    const ring=shapeFromDrag('ellipse',[b.x+30,b.y+20],[b.x+90,b.y+80],{fill:null,stroke:'#000000',strokeWidth:.5});w.state.history.execute(insertNode(L,ring));
    const line=createNode('path',{subpaths:[{closed:false,segments:[[b.x+110,b.y+90],[b.x+125,b.y+90]].map(p=>({p,in:[0,0],out:[0,0]}))}],appearance:appearance(null,'#000000',.5)});w.state.history.execute(insertNode(L,line));
    w.select([]);w.setTool('type-on-path');return {ring:ring.id,line:line.id,board:[b.x,b.y]};})()`);
  const centre=[ids.board[0]+60,ids.board[1]+50];
  assert.match(await evaluate(`(async()=>(${active}.scope.view.element.style.cursor))()`),/svg/,'Type on a Path has its own cursor');
  const before=await snapshot(),steps=await applied();
  await click(await at(60,20));await ready();
  assert.match(await evaluate("document.querySelector('.draw-text-dialog').textContent"),/Type on a Path/);
  await set({text:'MODCUT LASER',fontSize:18});
  assert.equal(await snapshot(),before,'The preview does not change the document');
  const proof=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'modcut-draw-path-text-preview.png'),Buffer.from(proof.data,'base64'));
  await apply();
  const node=await evaluate(`(async()=>{const w=${active};return w.state.document.getNode(w.state.selection.ids[0])})()`);
  assert.equal(node.type,'text');assert.equal(node.kind,'onPath');assert.equal(node.layout.overflow,false);
  assert.equal(await evaluate(`(async()=>(!!${active}.state.document.getNode('${ids.ring}')))()`),false,'The clicked shape becomes the text path');
  assert.equal(await applied(),steps+1,'Type on a Path is one undo step');
  const radii=(n)=>n.layout.glyphs.flatMap(g=>g.subpaths.flatMap(p=>p.segments.map(s=>Math.hypot(s.p[0]-centre[0],s.p[1]-centre[1]))));
  // Round letters overshoot the baseline slightly, and a straight baseline on a curve leaves it at the ends.
  assert.ok(radii(node).every(r=>r>=30-.2&&r<=30+18*25.4/72),'Glyphs stand on the outside of the circle');
  assert.ok(await evaluate(`(async()=>(${active}.scope.project.getItems({match:i=>i.data.textFrame&&i.data.textId==='${node.id}'}).length>0))()`),'The text path is shown while selected');
  await evaluate(`(async()=>{${active}.handle('undo')})()`);assert.equal(await snapshot(),before,'Undo restores the circle');
  await evaluate(`(async()=>{const w=${active};w.handle('redo');w.select(['${node.id}'])})()`);
  // Flip moves the text to the inside; a start offset moves it along the path.
  await evaluate(`(async()=>{${active}.handle('edit-text')})()`);await ready();
  assert.equal(await evaluate("document.querySelector('.draw-text-dialog form').elements.pathFlip.checked"),false);
  await set({pathFlip:true,pathOffset:20});await apply();
  const flipped=await evaluate(`(async()=>(${active}.state.document.getNode('${node.id}')))()`);
  assert.equal(flipped.onPath.flip,true);assert.equal(flipped.onPath.offset,20);
  assert.ok(radii(flipped).every(r=>r<=30+.2),'Flip puts the glyphs inside the circle');
  // A short path: overflow is reported, and outlines and Send to Cut refuse to drop text.
  await click(await at(117.5,90));await ready();
  await set({text:'This sentence is far too long for the line',fontSize:12});
  assert.match(await evaluate("document.querySelector('.draw-text-dialog [role=alert]').textContent"),/glyphs fit on the path/);
  await apply();
  const short=await evaluate(`(async()=>{const w=${active};return w.state.document.getNode(w.state.selection.ids[0])})()`);
  assert.equal(short.layout.overflow,true);
  assert.ok(await evaluate(`(async()=>{const w=${active};return w.scope.project.getItems({match:i=>i.data.textFrame&&i.data.textId==='${short.id}'}).some(i=>i.children.length===4)})()`),'Overflow is marked with a red plus');
  assert.equal(await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0];return w.renderer.hit(new w.scope.Point(b.x+124.5,b.y+90))})()`),short.id,'The path itself can be clicked');
  await evaluate(`(async()=>{${active}.handle('create-outlines')})()`);await wait(100);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${short.id}').type))()`),'text');
  assert.match(await evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' ')"),/does not fit on its path/);
  await evaluate(`(async()=>{${active}.handle('send-to-cut')})()`);
  for(let i=0;i<100&&!await evaluate("!!document.querySelector('.draw-send-dialog')");i++)await wait(30);
  assert.equal(await evaluate("document.querySelector('.draw-send-dialog [type=submit]').disabled"),true,'Overflowing path text blocks Send to Cut');
  await key('Escape');await wait(50);
  await evaluate(`(async()=>{const w=${active},{removeNode}=await import('./draw/doc/commands.mjs');w.state.history.execute(removeNode('${short.id}'));w.select(['${node.id}'])})()`);
  // Save and reload keep the layout; SVG export and Create Outlines use the same glyphs.
  assert.equal(await evaluate(`(async()=>{const w=${active},{createProjectDraw}=await import('./draw/io/project.mjs');return createProjectDraw(JSON.parse(w.state.document.serialize())).document.serialize()===w.state.document.serialize()})()`),true);
  const svg=await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.ui.artboardId,'svg')})()`);assert.match(svg,/<path[\s>]/);assert.doesNotMatch(svg,/<text[\s>]/);
  await evaluate(`(async()=>{${active}.handle('create-outlines')})()`);
  for(let i=0;i<100&&await evaluate(`(async()=>(${active}.state.document.getNode('${node.id}').type))()`)!=='group';i++)await wait(30);
  const group=await evaluate(`(async()=>(${active}.state.document.getNode('${node.id}')))()`);
  assert.equal(group.type,'group');assert.equal(group.children.flatMap(l=>l.children).length,flipped.layout.glyphs.filter(g=>g.subpaths.length).length);
  await restore();
  console.log('PASS Draw Type on a Path: click shape to type along it, one undo step, live preview, outside/inside (Flip), start offset, overflow plus and blocked outlines/Send, path hit target, save/reload, SVG and Create Outlines');
}
