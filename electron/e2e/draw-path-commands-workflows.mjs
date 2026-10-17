import assert from 'node:assert/strict';
import { wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D2.4 part A: Join, Average, Reverse Path Direction, Add/Remove Anchor Points and Clean Up. */
export async function runDrawPathCommandWorkflows(client) {
  const {evaluate}=client,restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Path commands proof'});
  const until=async(expression,label)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(50);}assert.fail(`Timed out: ${label}`);};
  const mod=process.platform==='darwin'?'metaKey':'ctrlKey';
  const keys=(key,code,extra={})=>evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},bubbles:true,cancelable:true,${mod}:true,...${JSON.stringify(extra)}}))`);
  const node=id=>evaluate(`(async()=>(${active}.state.document.getNode('${id}')))()`);
  const applied=()=>evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const points=n=>n.subpaths.flatMap(s=>s.segments.map(g=>g.p.map(v=>Math.round(v*1000)/1000)));
  const menu=item=>evaluate(`window.modcut.clickE2EMenuItem('Object',${JSON.stringify(item)})`);
  const ids=await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs'),{shapeFromDrag}=await import('./draw/tools/shapes.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,line=(...pts)=>createNode('path',{subpaths:[{closed:false,segments:pts.map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(null,'#000000',.5)});
    const a=line([0,10],[20,10]),bb=line([30,10],[22,10]);bb.appearance=appearance(null,'#FF0000',1);
    const open=line([0,30],[20,30],[10,45]),d=line([40,30],[50,30]),e=line([60,30],[70,30]),f=line([80,30],[100,40],[110,20]);
    const rect=shapeFromDrag('rectangle',[b.x+10,b.y+55],[b.x+30,b.y+75],{fill:'#CCCCCC',stroke:'#000000',strokeWidth:.5});
    const stray=createNode('path',{subpaths:[{closed:false,segments:[{p:[b.x+90,b.y+60],in:[0,0],out:[0,0]}]}],appearance:appearance(null,'#000000',.5)});
    const bare=createNode('path',{subpaths:[{closed:false,segments:[[95,60],[100,70]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(null,null)});
    for(const n of [a,bb,open,d,e,f,rect,stray,bare])w.state.history.execute(insertNode(L,n));w.select([]);
    return {a:a.id,b:bb.id,open:open.id,d:d.id,e:e.id,f:f.id,rect:rect.id,stray:stray.id,bare:bare.id,board:[b.x,b.y]};})()`);
  const local=n=>points(n).map(([x,y])=>[Math.round((x-ids.board[0])*1000)/1000,Math.round((y-ids.board[1])*1000)/1000]);
  const select=list=>evaluate(`(async()=>(${active}.select(${JSON.stringify(list)})))()`);
  // Join two open paths with Mod+J: nearest ends meet, one path runs one way, the top path's paint stays.
  await select([ids.a,ids.b]);let steps=await applied();await keys('j','KeyJ');
  assert.equal(await node(ids.a),null,'The lower path is absorbed');
  const joined=await node(ids.b);assert.deepEqual(local(joined),[[30,10],[22,10],[20,10],[0,10]]);
  assert.equal(joined.appearance.strokes[0].width,1,'The topmost path keeps its paint');assert.equal(await applied(),steps+1);
  // Join one open path from the menu closes it.
  await select([ids.open]);await menu('Join');assert.equal((await node(ids.open)).subpaths[0].closed,true);
  // Join two chosen endpoints (Direct Selection), even when other ends are nearer.
  await evaluate(`(async()=>{const w=${active};w.setTool('direct-selection');w.state.selection.setAnchors([{nodeId:'${ids.d}',subpath:0,segment:0},{nodeId:'${ids.e}',subpath:0,segment:1}]);w.handle('join');})()`);
  const de=(await node(ids.d))??(await node(ids.e));assert.deepEqual(local(de).length,4);
  assert.equal(!!(await node(ids.d))+!!(await node(ids.e)),1);
  // Average: two anchors line up horizontally.
  await evaluate(`(async()=>{const w=${active};w.state.selection.setAnchors([{nodeId:'${ids.f}',subpath:0,segment:1},{nodeId:'${ids.f}',subpath:0,segment:2}]);w.handle('average');})()`);
  await until("!!document.querySelector('.draw-average-dialog form')",'Average dialog');
  await evaluate("(()=>{const f=document.querySelector('.draw-average-dialog form');f.elements.axis.value='horizontal';f.requestSubmit();})()");
  await until(`(async()=>{const n=${active}.state.document.getNode('${ids.f}');return Math.abs(n.subpaths[0].segments[1].p[1]-n.subpaths[0].segments[2].p[1])<1e-9})()`,'Average applied');
  assert.deepEqual(local(await node(ids.f)),[[80,30],[100,30],[110,30]]);
  // Reverse Path Direction.
  await evaluate(`(async()=>{${active}.setTool('select')})()`);await select([ids.f]);await menu('Reverse Path Direction');
  assert.deepEqual(local(await node(ids.f)),[[110,30],[100,30],[80,30]]);
  // Add Anchor Points turns the live rectangle into a path with twice the anchors, same id, one step.
  await select([ids.rect]);steps=await applied();await menu('Add Anchor Points');
  let rect=await node(ids.rect);assert.equal(rect.type,'path');assert.equal(rect.subpaths[0].segments.length,8);assert.equal(await applied(),steps+1);
  // Remove Anchor Points keeps the path closed.
  await evaluate(`(async()=>{const w=${active};w.setTool('direct-selection');w.state.selection.setAnchors([{nodeId:'${ids.rect}',subpath:0,segment:1}]);w.handle('remove-anchors');w.setTool('select')})()`);
  rect=await node(ids.rect);assert.equal(rect.subpaths[0].segments.length,7);assert.equal(rect.subpaths[0].closed,true);
  // Clean Up removes the stray point and the unpainted path.
  await menu('Clean Up');
  assert.equal(await node(ids.stray),null);assert.equal(await node(ids.bare),null);
  await until("[...document.querySelectorAll('.toast')].some(t=>/Clean Up removed 2 objects/.test(t.textContent))",'Clean Up notice');
  // Offset Path: live preview leaves the document alone; OK adds a grown copy above the source.
  const more=await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id;
    const sq=createNode('path',{subpaths:[{closed:true,segments:[[45,50],[60,50],[60,65],[45,65]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(null,'#0000FF',.3)});
    const ring=createNode('path',{subpaths:[{closed:true,segments:Array.from({length:60},(_,i)=>{const a=i/60*2*Math.PI;return {p:[b.x+85+8*Math.cos(a),b.y+60+8*Math.sin(a)],in:[0,0],out:[0,0]}})}],appearance:appearance('#00AA00',null)});
    w.state.history.execute(insertNode(L,sq));w.state.history.execute(insertNode(L,ring));w.select([sq.id]);return {square:sq.id,ring:ring.id};})()`);
  const before=await evaluate(`(async()=>(${active}.state.document.serialize()))()`);steps=await applied();
  await menu('Offset Path…');await until("!!document.querySelector('.draw-offset-dialog form')",'Offset Path dialog');
  await evaluate("(()=>{const f=document.querySelector('.draw-offset-dialog form');f.elements.distance.value='2';f.dispatchEvent(new Event('input',{bubbles:true}));})()");await wait(300);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.serialize()))()`),before,'The preview does not change the document');
  await evaluate("document.querySelector('.draw-offset-dialog form').requestSubmit()");
  await until(`(async()=>(${active}.state.selection.ids[0]!=='${more.square}'))()`,'offset path made');
  const grown=await evaluate(`(async()=>{const w=${active},id=w.state.selection.ids[0],b=w.renderer.bounds(id),a=w.state.document.data.artboards[0],list=w.state.document.data.layers[0].children.map(n=>n.id);return {box:[b.x-a.x,b.y-a.y,b.width,b.height],above:list.indexOf(id)===list.indexOf('${more.square}')+1}})()`);
  grown.box.forEach((v,i)=>assert.ok(Math.abs(v-[43,48,19,19][i])<.02,`Offset by 2 mm: ${grown.box}`));assert.ok(grown.above,'The offset path sits above its source');
  assert.ok(await node(more.square),'The source path stays');assert.equal(await applied(),steps+1);
  // Simplify: fewer anchors, still closed, one undo step, counts shown in the dialog.
  await select([more.ring]);steps=await applied();await menu('Simplify…');await until("!!document.querySelector('.draw-simplify-dialog form')",'Simplify dialog');
  assert.match(await evaluate("document.querySelector('[data-draw-simplify-count]').textContent"),/^Original: 60 points\. Current: \d+ points\.$/);
  await evaluate("(()=>{const f=document.querySelector('.draw-simplify-dialog form');f.elements.precision.value='30';f.dispatchEvent(new Event('input',{bubbles:true}));f.requestSubmit();})()");
  await until(`(async()=>(${active}.state.document.getNode('${more.ring}').subpaths[0].segments.length<60))()`,'Simplify applied');
  const ring=await node(more.ring);assert.equal(ring.subpaths[0].closed,true);assert.ok(ring.subpaths[0].segments.length<=12,`Simplified to ${ring.subpaths[0].segments.length} points`);
  assert.equal(await applied(),steps+1);
  await restore();
  console.log('PASS Draw path commands: Join two paths (direction, top paint, one step), close one path from the menu, join chosen endpoints, Average horizontal, Reverse, Add/Remove Anchor Points on a live shape, Clean Up, Offset Path with preview, Simplify with point counts');
}
