import assert from 'node:assert/strict';
import { wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, rememberTabs, enterDraw } from './draw-test-helpers.mjs';

/** Send to Cut v2, part A: Outline Stroke (command and send option), cutting at the artboard, duplicates and tiny segments. */
export async function runDrawCutTwoWorkflows(client) {
  const { evaluate } = client;
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(50); } assert.fail(`Timed out: ${label}`); };
  const restoreTabs = await rememberTabs(evaluate);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Cut v2 proof' });

  // Object > Path > Outline Stroke: a filled, stroked square becomes a group of its fill and its stroke area.
  const outlined = await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,look=appearance('#FFFF00','#FF0000',2);look.strokes[0].join='miter';
    const n=createNode('path',{subpaths:[{closed:true,segments:[[10,10],[30,10],[30,30],[10,30]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:look});
    w.state.history.execute(insertNode(L,n));w.select([n.id]);const steps=w.state.history.entries.filter(e=>e.applied).length;await w.handle('outline-stroke');
    for(let i=0;i<50&&w.state.document.getNode(n.id)?.appearance?.strokes?.length;i++)await new Promise(r=>setTimeout(r,20));
    const g=w.state.document.getNode(w.state.selection.ids[0]),{paintHex}=await import('./draw/doc/paint.mjs'),ring=g.children?.[1];
    const area=s=>Math.abs(s.segments.reduce((sum,x,i)=>{const y=s.segments[(i+1)%s.segments.length].p;return sum+x.p[0]*y[1]-y[0]*x.p[1];},0))/2;
    return {type:g.type,kids:g.children?.length,fill:paintHex(g.children?.[0]?.appearance.fills[0]),fillStrokes:g.children?.[0]?.appearance.strokes.length,
      outlineFill:paintHex(ring?.appearance.fills[0]),outlineStrokes:ring?.appearance.strokes.length,rings:ring?.subpaths.map(area).sort((a,b)=>b-a),steps:w.state.history.entries.filter(e=>e.applied).length-steps};})()`);
  assert.equal(outlined.type, 'group'); assert.equal(outlined.kids, 2);
  assert.equal(outlined.fill, '#ffff00'); assert.equal(outlined.fillStrokes, 0);
  assert.equal(outlined.outlineFill, '#ff0000', 'The outline is filled with the stroke color'); assert.equal(outlined.outlineStrokes, 0);
  assert.ok(Math.abs(outlined.rings[0] - 484) < .1 && Math.abs(outlined.rings[1] - 324) < .1, `A 2 mm band: ${outlined.rings}`);
  assert.equal(outlined.steps, 1, 'Outline Stroke is one undo step');
  await evaluate(`(async()=>{${active}.handle('undo')})()`);

  // Dashes are real filled contours after outlining, with the same rendered silhouette and one undo.
  // Compare at 600 ppi so antialiasing on small dots does not dominate the pixel difference.
  const dashed = await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode,removeNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,seg=p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]});
    const pixels=async()=>{const img=new Image();img.src=w.exportBoard(b.id,'png',{ppi:600,background:'white'});await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    const cases=[
      {name:'butt offset',array:[4,2],offset:1,cap:'butt'},
      {name:'round negative offset',array:[3,4],offset:-2,cap:'round'},
      {name:'odd pattern',array:[3,2,1],offset:0,cap:'butt'},
      {name:'round dots',array:[0,4],offset:0,cap:'round'},
      {name:'closed seam',array:[12,8],offset:4,cap:'square',closed:true},
      {name:'cubic curve',array:[4,3],offset:1,cap:'round',curve:true}
    ],results=[];
    for(const spec of cases){
      const look=appearance(null,'#000000',1);Object.assign(look.strokes[0],{dash:{array:spec.array,offset:spec.offset},cap:spec.cap,join:'miter'});
      const segments=(spec.closed?[[50,40],[70,40],[70,60],[50,60]]:[[45,50],[100,50]]).map(seg);
      if(spec.curve){segments[0].out=[0,-25];segments[1].in=[0,-25];}
      const n=createNode('path',{name:spec.name,subpaths:[{closed:!!spec.closed,segments}],appearance:look});
      w.state.history.execute(insertNode(L,n));w.select([n.id]);const before=await pixels(),saved=w.state.document.serialize(),steps=w.state.history.entries.filter(e=>e.applied).length;
      await w.handle('outline-stroke');
      for(let i=0;i<100&&w.state.document.getNode(n.id);i++)await new Promise(r=>setTimeout(r,20));
      const outlined=w.state.document.getNode(w.state.selection.ids[0]),after=await pixels();let difference=0,ink=0;
      for(let i=0;i<before.length;i+=4){difference+=Math.abs(before[i]-after[i]);ink+=255-before[i];}
      const result={name:spec.name,difference:difference/ink,contours:outlined.subpaths?.length,strokes:outlined.appearance?.strokes.length,steps:w.state.history.entries.filter(e=>e.applied).length-steps};
      w.handle('undo');result.restored=w.state.document.serialize()===saved;w.handle('redo');result.redone=!!w.state.document.getNode(outlined.id);w.handle('undo');
      w.state.history.execute(removeNode(n.id));results.push(result);
    }return results;})()`);
  for(const proof of dashed){
    assert.ok(proof.contours>1,`${proof.name}: each dash becomes a filled contour`);
    assert.equal(proof.strokes,0,`${proof.name}: no dashed stroke remains`);
    assert.ok(proof.difference<.025,`${proof.name}: before/after pixel difference ${proof.difference}`);
    assert.equal(proof.steps,1);assert.equal(proof.restored,true);assert.equal(proof.redone,true);
  }

  // Expand Appearance: two fills and a stroke become three paths in paint order; Expand with only Stroke
  // outlines the stroke and keeps the fills on one path.
  const expandedInfo=await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,look=appearance('#00FF00','#0000FF',1),extra=appearance('#FF00FF',null).fills[0];look.fills=[look.fills[0],{...extra,opacity:.5}];
    const n=createNode('path',{subpaths:[{closed:true,segments:[[60,40],[80,40],[80,60],[60,60]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:look});
    w.state.history.execute(insertNode(L,n));w.select([n.id]);await w.handle('expand-appearance');
    for(let i=0;i<50&&w.state.document.getNode(n.id);i++)await new Promise(r=>setTimeout(r,20));
    const g=w.state.document.getNode(w.state.selection.ids[0]),{paintHex}=await import('./draw/doc/paint.mjs');
    const kids=g.children?.map(k=>[paintHex(k.appearance.fills[0]),k.appearance.fills[0]?.opacity,k.appearance.strokes.length]);
    w.handle('undo');w.select([n.id]);await w.handle('expand');
    for(let i=0;i<100&&!document.querySelector('.draw-expand-dialog form');i++)await new Promise(r=>setTimeout(r,20));
    const f=document.querySelector('.draw-expand-dialog form');f.elements.fill.checked=false;f.requestSubmit();
    for(let i=0;i<50&&w.state.document.getNode(n.id);i++)await new Promise(r=>setTimeout(r,20));
    const h=w.state.document.getNode(w.state.selection.ids[0]),strokeOnly=h.children?.map(k=>[k.appearance.fills.map(e=>paintHex(e)),k.appearance.strokes.length]);
    w.handle('undo');w.handle('undo');return {kids,strokeOnly};})()`);
  assert.deepEqual(expandedInfo.kids,[['#00ff00',1,0],['#ff00ff',.5,0],['#0000ff',1,0]],'Each fill and the outlined stroke, in paint order');
  assert.deepEqual(expandedInfo.strokeOnly,[[['#00ff00','#ff00ff'],0],[['#0000ff'],0]],'Stroke only: fills stay together, the stroke is outlined');

  // Art for the send: the square (stroke 2 mm), a line past the right edge, a line drawn twice and a path with a 0.01 mm segment.
  await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,line=(pts,color='#0000FF')=>createNode('path',{subpaths:[{closed:false,segments:pts.map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(null,color,.1)});
    for(const n of [line([[100,60],[140,60]]),line([[40,50],[60,50]],'#00AA00'),line([[40,50],[60,50]],'#00AA00'),line([[40,70],[50,70],[50.01,70],[60,70]],'#000000')])w.state.history.execute(insertNode(L,n));w.select([]);})()`);
  await evaluate("document.querySelector('#sendToCut').click()");
  await until("!!document.querySelector('.draw-send-dialog form')", 'Send to Cut dialog opens when something needs a choice');
  const summary = () => evaluate("document.querySelector('[data-draw-send-summary]').textContent");
  let text = await summary();
  assert.match(text, /extends past the artboard and is sent whole/);
  assert.match(text, /1 duplicate path is left out/);
  assert.match(text, /1 segment is shorter than 0\.05 mm/);
  assert.match(text, /\(\d+ nodes\)/);
  await evaluate("(()=>{const f=document.querySelector('.draw-send-dialog form');f.elements.outside.value='clip';f.elements.outside.dispatchEvent(new Event('change'));f.elements.strokes.value='outline';f.elements.strokes.dispatchEvent(new Event('change'));})()");
  text = await summary();
  assert.match(text, /1 object is cut at the artboard edge/); assert.match(text, /strokes as filled outlines/);
  await evaluate("document.querySelector('.draw-send-dialog form').requestSubmit()");
  await until("document.body.dataset.workspace==='cut'", 'switch to Cut');
  await until("paper.project.layers[1]?.children.length>0", 'items in Cut');
  const placed = await evaluate(`(()=>{const items=paper.project.layers[1].getItems({match:i=>i.className==='Path'||i.className==='CompoundPath',recursive:true}).filter(i=>!(i.parent?.className==='CompoundPath'));
    const b=items.reduce((a,i)=>a?a.unite(i.bounds):i.bounds.clone(),null);
    return {count:items.length,right:b.right,stroked:items.filter(i=>i.strokeColor&&i.strokeWidth>0&&i.strokeColor.alpha!==0).length,red:items.filter(i=>i.fillColor?.toCSS(true)==='#ff0000').length,yellow:items.filter(i=>i.fillColor?.toCSS(true)==='#ffff00').length};})()`);
  assert.ok(placed.right <= 120.01, `Cut at the artboard edge: right ${placed.right}`);
  assert.equal(placed.stroked, 0, 'Every stroke arrives as a filled outline');
  assert.ok(placed.red >= 1 && placed.yellow === 1, `The square's fill and red outline: ${JSON.stringify(placed)}`);
  assert.equal(placed.count, 5, `fill + outline + clipped line + one green line + tiny-segment line: ${JSON.stringify(placed)}`);
  await evaluate("document.querySelector('#workspaceToggle').click()"); await until("document.body.dataset.workspace==='draw'", 'back to Draw');

  // Part B: the artboard remembers the send. Artboards shows its status and Update in Cut after a change.
  await evaluate(`(async()=>(${active}.handle('panel.artboards')))()`); await wait(50);
  const status = () => evaluate("document.querySelector('.draw-project[style*=block] [data-draw-cut-status]')?.dataset.drawCutStatus ?? null");
  assert.equal(await status(), 'sent');
  assert.equal(await evaluate(`(async()=>{const l=${active}.state.document.data.cutLinks;return l.length===1&&l[0].options.strokes==='outline'&&l[0].options.outside==='clip'})()`), true, 'The link keeps the choices');
  await evaluate(`(async()=>{const w=${active},{updateNode}=await import('./draw/doc/commands.mjs'),L=w.state.document.data.layers[0],n=L.children.find(c=>c.subpaths?.[0]?.segments.length===4&&!c.subpaths[0].closed);
    w.state.history.execute(updateNode(n.id,{subpaths:n.subpaths.map(s=>({...s,segments:s.segments.map(g=>({...g,p:[g.p[0],g.p[1]-10]}))}))}));})()`);
  await wait(50);
  assert.equal(await status(), 'changed', 'Editing the artwork marks the artboard as changed since sending');
  // The user moved the sent items 10 mm right in Cut; the update keeps that move.
  await evaluate("document.querySelector('#workspaceToggle').click()"); await until("document.body.dataset.workspace==='cut'", 'to Cut');
  const sentBefore = await evaluate("(()=>{const items=paper.project.layers[1].children;items.forEach(i=>i.translate([10,0]));return items.length;})()");
  const extra = await evaluate("(()=>{const p=new paper.Path.Rectangle({rectangle:[300,300,5,5],strokeColor:'#ff00ff',parent:paper.project.layers[1]});return paper.project.layers[1].children.length;})()");
  await evaluate("document.querySelector('#workspaceToggle').click()"); await until("document.body.dataset.workspace==='draw'", 'back to Draw');
  await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-update-cut]').click()");
  await until("document.body.dataset.workspace==='cut'", 'Update in Cut switches to Cut');
  assert.equal(await evaluate("!!document.querySelector('.draw-send-dialog')"), false, 'Update repeats the earlier choices without a dialog');
  const updated = await evaluate(`(()=>{const items=paper.project.layers[1].children,linked=items.filter(i=>i.data.drawLink);
    const b=linked.reduce((a,i)=>a?a.unite(i.bounds):i.bounds.clone(),null);return {count:items.length,linked:linked.length,left:b.left,stroked:linked.filter(i=>i.strokeColor&&i.strokeWidth>0&&i.strokeColor.alpha!==0).length,
      tinyLine:linked.some(i=>Math.abs(i.bounds.center.y-60)<.5&&i.bounds.center.x<100)};})()`);
  assert.equal(updated.count, extra, 'The earlier send is replaced; the user\'s own item stays');
  assert.equal(updated.linked, sentBefore); assert.equal(updated.stroked, 0, 'Outline Stroke is used again');
  assert.ok(Math.abs(updated.left - 19) < .05, `The 10 mm move in Cut is kept (outline starts at 9 mm): left ${updated.left}`);
  assert.equal(updated.tinyLine, true, 'The moved line arrives at its new place');
  const undoKey = process.platform === 'darwin' ? 'metaKey' : 'ctrlKey';
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',bubbles:true,cancelable:true,${undoKey}:true}))`);
  assert.equal(await evaluate("paper.project.layers[1].children.filter(i=>i.data.drawLink).some(i=>Math.abs(i.bounds.center.y-60)<.5&&i.bounds.center.x<100)"), false, 'One undo in Cut restores the earlier send');
  await evaluate("document.querySelector('#workspaceToggle').click()"); await until("document.body.dataset.workspace==='draw'", 'back to Draw');
  assert.equal(await status(), 'sent', 'After the update the artboard is in sync again');

  // Part C: an image goes as an engraving raster, and all artboards go as one send laid out as in Draw.
  await evaluate(`(async()=>{const w=${active},{createNode,createArtboard}=await import('./draw/doc/schema.mjs'),{insertNode,insertArtboard,updateDocument}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const c=document.createElement('canvas');c.width=40;c.height=20;const g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,40,20);const data=c.toDataURL('image/png').split(',')[1];
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id;
    w.state.history.execute(updateDocument({assets:{...w.state.document.data.assets,e2eImage:{mimeType:'image/png',data,width:40,height:20}}}));
    w.state.history.execute(insertNode(L,createNode('image',{assetId:'e2eImage',width:20,height:10,transform:[0,1,-1,0,b.x+40,b.y+10]})));
    w.state.history.execute(insertArtboard(createArtboard({name:'Second',x:b.x+b.width+30,y:b.y,width:60,height:40})));
    w.state.history.execute(insertNode(L,createNode('path',{subpaths:[{closed:false,segments:[[b.x+b.width+40,b.y+20],[b.x+b.width+70,b.y+20]].map(p=>({p,in:[0,0],out:[0,0]}))}],appearance:appearance(null,'#00AAFF',.1)})));})()`);
  await evaluate("document.querySelector('#sendToCut').click()");
  await until("!!document.querySelector('.draw-send-dialog form')", 'Send to Cut dialog for all artboards');
  await evaluate("(()=>{const f=document.querySelector('.draw-send-dialog form');f.elements.boardId.value='all';f.elements.boardId.dispatchEvent(new Event('change'));})()");
  assert.match(await summary(), /and 1 image as engraving will be sent/);
  const tabsBefore = await evaluate("document.querySelectorAll('.doc-tab').length");
  await evaluate("(()=>{const f=document.querySelector('.draw-send-dialog form');f.elements.target.value='new-tab';f.elements.strokes.value='centerline';f.elements.outside.value='whole';f.requestSubmit();})()");
  await until("document.body.dataset.workspace==='cut'", 'switch to Cut for all artboards');
  assert.equal(await evaluate("document.querySelectorAll('.doc-tab').length"), tabsBefore + 1);
  await until("paper.project.layers[1].children.some(i=>i.className==='Raster'&&i.bounds.width>1)", 'the raster loads');
  const all = await evaluate(`(()=>{const items=paper.project.layers[1].children,r=items.find(i=>i.className==='Raster'),line=items.find(i=>i.strokeColor?.toCSS(true)==='#00aaff');
    return {raster:[r.bounds.x,r.bounds.y,r.bounds.width,r.bounds.height],linked:!!r.data.drawLink,engraving:!!r.data.modcutRaster,line:[line.bounds.x,line.bounds.y]};})()`);
  [30, 10, 10, 20].forEach((v, i) => assert.ok(Math.abs(all.raster[i] - v) < .05, `The image is rotated and placed as in Draw: ${all.raster}`));
  assert.equal(all.linked, true); assert.equal(all.engraving, true);
  assert.ok(Math.abs(all.line[0] - 160) < .05 && Math.abs(all.line[1] - 20) < .05, `The second artboard keeps its place: ${all.line}`);
  // The new Cut tab has no Draw document; closing it returns to the Draw tab.
  await restoreTabs();
  console.log('PASS Draw Send to Cut v2: Outline Stroke including dashed paths, dots and curves with matching PNGs and undo/redo, Expand and Expand Appearance, outline strokes and cut at the artboard in Send to Cut, duplicates left out, tiny segments and node count reported, artboard send status, Update in Cut keeps the choices, the move in Cut and other items, one undo, images as rotated engraving rasters, all artboards in one send');
}
