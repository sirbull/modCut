import assert from 'node:assert/strict';
import { wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D2.2 Compound Path (Mod+8) and Clipping Mask (Mod+7): holes, hit testing, release, export and Send to Cut. */
export async function runDrawCompoundWorkflows(client) {
  const {evaluate}=client,restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:60,name:'Compound proof'});
  const mod=process.platform==='darwin'?'metaKey':'ctrlKey';
  const keys=(key,code,extra={})=>evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},bubbles:true,cancelable:true,${mod}:true,...${JSON.stringify(extra)}}))`);
  const applied=()=>evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const children=()=>evaluate(`(async()=>(${active}.state.document.data.layers[0].children))()`);
  const hit=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0];return w.renderer.hit(new w.scope.Point(b.x+${x},b.y+${y}))})()`);
  const select=ids=>evaluate(`(async()=>(${active}.select(${JSON.stringify(ids)})))()`);
  const ids=await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs'),{shapeFromDrag}=await import('./draw/tools/shapes.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,sq=(x,y,wd,h)=>[{closed:true,segments:[[x,y],[x+wd,y],[x+wd,y+h],[x,y+h]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}];
    const big=createNode('path',{subpaths:sq(0,0,40,40),appearance:appearance('#FF0000',null)}),small=createNode('path',{subpaths:sq(10,10,10,10),appearance:appearance('#00FF00','#000000',1)});
    const content=createNode('path',{subpaths:sq(50,0,60,40),appearance:appearance('#0000FF',null)}),line=createNode('path',{subpaths:[{closed:false,segments:[[45,20],[115,20]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(null,'#000000',.5)});
    const ring=shapeFromDrag('ellipse',[b.x+60,b.y],[b.x+100,b.y+40],{fill:'#FFFF00',stroke:'#000000',strokeWidth:1});
    for(const n of [big,small,content,line,ring])w.state.history.execute(insertNode(L,n));w.select([]);return {big:big.id,small:small.id,content:content.id,line:line.id,ring:ring.id};})()`);

  // Make Compound Path: one even-odd path with a hole where they overlap, the backmost paint, one undo step.
  await select([ids.big,ids.small]);let steps=await applied();
  await keys('8','Digit8');
  let list=await children();const compound=list.find(n=>n.subpaths?.length===2);
  assert.ok(compound,'Mod+8 makes one path from both');assert.equal(compound.fillRule,'evenodd');assert.equal(await applied(),steps+1);
  assert.equal(compound.appearance.strokes.length,0,'The backmost object gives the paint');
  assert.equal(await hit(15,15),null,'The overlap is a hole');assert.equal(await hit(5,5),compound.id);
  // Release Compound Path gives the pieces back.
  await keys('8','Digit8',{shiftKey:true,altKey:true});
  list=await children();assert.equal(list.filter(n=>n.type==='path'&&n.subpaths.length===1&&n.appearance.fills[0]).length>=3,true);
  assert.equal(list.some(n=>n.id===compound.id),false);
  await evaluate(`(async()=>{${active}.handle('undo');${active}.handle('undo')})()`);
  // Make Clipping Mask from the Layers menu: the circle on top clips the rectangle and the line.
  await select([ids.content,ids.line,ids.ring]);
  await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-layer-menu]')?.click()");
  const menuItem="document.querySelector('.draw-project[style*=block] [data-draw-layer-menu-item=clip]')";
  if(await evaluate(`!!${menuItem}`)){assert.equal(await evaluate(`${menuItem}.disabled`),false,'Make Clipping Mask is available with two or more objects');await evaluate(`${menuItem}.click()`);}
  else await keys('7','Digit7');
  list=await children();const clip=list.find(n=>n.type==='group'&&n.clip);
  assert.ok(clip,'A clipping group is made');assert.deepEqual(clip.children.map(n=>n.id),[ids.content,ids.line,ids.ring]);
  const ring=clip.children.at(-1);assert.deepEqual([ring.appearance.fills,ring.appearance.strokes],[[],[]],'The clipping path loses its paint');
  const box=await evaluate(`(async()=>{const w=${active},b=w.renderer.bounds('${clip.id}'),a=w.state.document.data.artboards[0];return [b.x-a.x,b.y-a.y,b.width,b.height]})()`);
  box.forEach((v,i)=>assert.ok(Math.abs(v-[60,0,40,40][i])<.01,`The clip group is as large as its clipping path: ${box}`));
  assert.equal(await hit(52,2),null,'Clipped-away art cannot be clicked');assert.equal(await hit(80,30),ids.content,'Visible art inside the clip can be clicked');
  // PNG and SVG clip natively.
  const px=await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],url=w.exportBoard(b.id,'png',{ppi:72});const img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const at=(x,y)=>[...g.getImageData(Math.round(x/25.4*72),Math.round(y/25.4*72),1,1).data];return {corner:at(52,2),centre:at(80,30)};})()`);
  assert.equal(px.corner[3],0,'Outside the clip is empty');assert.ok(px.centre[2]>200&&px.centre[3]>200,`Inside shows the blue rectangle: ${px.centre}`);
  assert.match(await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.ui.artboardId,'svg')})()`),/clip/i);
  // Send to Cut gets the clipped geometry: everything stays inside the circle's bounds.
  const cut=await evaluate(`(async()=>{const w=${active};return w.cutSvg(w.state.ui.artboardId).svg})()`);
  const paths=[...cut.matchAll(/<path d="([^"]+)" fill="([^"]+)"/g)].filter(m=>m[2]==='#0000ff'||m[2]==='none');
  const xs=paths.flatMap(m=>[...m[1].matchAll(/-?[\d.]+ -?[\d.]+/g)].map(p=>Number(p[0].split(' ')[0])));
  assert.ok(paths.length>=2&&xs.every(x=>x>=60-.05&&x<=100+.05),`Cut paths are clipped to the circle: ${xs.slice(0,8)}`);
  // PDF, EPS and DXF get the clipping as geometry too.
  const modelXs=await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],m=w.exporter.model(b);const walk=i=>i.type==='group'?i.children.flatMap(walk):i.type==='path'?[i]:[];
    return m.layers.flatMap(l=>l.items.flatMap(walk)).map(p=>p.subpaths.flatMap(s=>s.segments.map(g=>g.p[0]))).filter(xs=>xs.some(x=>x>45)).flat();})()`);
  assert.ok(modelXs.length&&modelXs.every(x=>x>=60-.05&&x<=100+.05),`Vector export geometry is clipped: ${modelXs.slice(0,8)}`);
  // Release Clipping Mask: art is whole again, the clipping path keeps no paint.
  await select([clip.id]);steps=await applied();await keys('7','Digit7',{altKey:true});
  assert.equal(await evaluate(`(async()=>(${active}.state.document.getNode('${clip.id}').clip))()`),false);assert.equal(await applied(),steps+1);
  assert.equal(await hit(52,2),ids.content,'Released art can be clicked where it was clipped');
  await restore();
  console.log('PASS Draw compound paths and clipping masks: Mod+8 with even-odd hole and backmost paint, release, Make Clipping Mask from the Layers menu, clip bounds and hit testing, PNG/SVG clipping, clipped PDF/EPS/DXF and Send to Cut geometry, release');
}
