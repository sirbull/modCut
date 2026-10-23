import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,submitNewDrawDialog,rememberTabs } from './draw-test-helpers.mjs';

export async function runDrawOutlineWorkflows(client){
  const {evaluate}=client,{click}=inputHelpers(client),restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:140,height:100,name:'Curved stroke outline proof'});
  const press=async(key,code,extra={})=>evaluate(`(()=>{for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{key:'${key}',code:'${code}',bubbles:true,cancelable:true,...${JSON.stringify(extra)}}));})()`);
  const proof=await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],look=appearance(null,'#071411',16);
    look.strokes[0].widthProfile=[{t:0,left:0,right:0},{t:.45,left:.2,right:.3},{t:1,left:.8,right:.8}];
    const n=createNode('path',{name:'Width swoosh',subpaths:[{closed:false,segments:[
      {p:[b.x+35,b.y+15],in:[0,0],out:[-40,40]},
      {p:[b.x+45,b.y+75],in:[-55,-5],out:[65,15]},
      {p:[b.x+105,b.y+45],in:[20,45],out:[0,0]}]}],appearance:look});
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);w.setTool('select');
    window.__outlineProof={id:n.id,saved:w.state.document.serialize(),raw:w.renderer.profiledStroke(n.id,look.strokes[0]).reduce((n,r)=>n+r.segments.length,0)};
    const pixels=async()=>{const img=new Image();img.src=w.exportBoard(b.id,'png',{ppi:200,background:'white'});await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return [...g.getImageData(0,0,c.width,c.height).data];};window.__outlineProof.pixels=pixels;window.__outlineProof.before=await pixels();return {id:n.id,raw:window.__outlineProof.raw};})()`);
  const capture=async name=>{const shot=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),name),Buffer.from(shot.data,'base64'));};
  await capture('modcut-outline-before.png');
  await press('o','KeyO',{ctrlKey:true,altKey:true});
  for(let i=0;i<100&&await evaluate(`(async()=>!!${active}.state.document.getNode('${proof.id}'))()`);i++)await wait(50);
  const result=await evaluate(`(async()=>{const w=${active},p=window.__outlineProof,n=w.state.document.getNode(w.state.selection.ids[0]),after=await p.pixels();let difference=0,ink=0;
    for(let i=0;i<after.length;i+=4){difference+=Math.abs(p.before[i]-after[i]);ink+=255-p.before[i];}
    p.outlined=n.id;return {type:n.type,anchors:n.subpaths.reduce((n,r)=>n+r.segments.length,0),curves:n.subpaths.flatMap(r=>r.segments).filter(s=>Math.hypot(...s.in,...s.out)>0).length,
      fills:n.appearance.fills.length,strokes:n.appearance.strokes.length,difference:difference/ink};})()`);
  assert.equal(result.type,'path','A stroke without fill becomes only the stroke contour');
  assert.equal(result.fills,1);assert.equal(result.strokes,0);assert.ok(result.curves>0);
  assert.ok(result.anchors<proof.raw/5,`${proof.raw} samples become ${result.anchors} anchors`);
  assert.ok(result.difference<.02,`Before/after ink difference: ${result.difference}`);
  await press('a','KeyA');
  const selection=await evaluate(`(async()=>{const w=${active},id=w.state.selection.ids[0],n=w.state.document.getNode(id);return {tool:w.state.ui.tool,anchors:w.state.selection.anchors.length,total:n.subpaths.reduce((n,s)=>n+s.segments.length,0),outlines:w.scope.project.getItems({name:'Selected path outline'}).length};})()`);
  assert.equal(selection.tool,'direct-selection');assert.equal(selection.anchors,selection.total);assert.ok(selection.outlines>0);
  await capture('modcut-outline-after.png');
  await press('a','KeyA');
  assert.equal(await evaluate(`(async()=>${active}.state.selection.anchors.length)()`),0,'A again clears only anchor selection');
  assert.equal(await evaluate(`(async()=>${active}.state.selection.ids.length)()`),1,'The object stays selected');
  const screen=async index=>evaluate(`(async()=>{const w=${active},n=w.state.document.getNode(w.state.selection.ids[0]),p=w.renderer.editPointToWorld(n.id,n.subpaths[0].segments[${index}].p),v=w.scope.view.projectToView(p),c=w.scope.view.element.getBoundingClientRect();return {x:c.x+v.x,y:c.y+v.y};})()`);
  await click(await screen(0));assert.equal(await evaluate(`(async()=>${active}.state.selection.anchors.length)()`),1);
  // Switching from object selection selects all anchors; a click can then isolate one.
  await press('v','KeyV');await press('a','KeyA');await click(await screen(0));
  assert.equal(await evaluate(`(async()=>${active}.state.selection.anchors.length)()`),1,'A click isolates one of the initially selected anchors');
  await evaluate(`(async()=>{const w=${active};w.handle('undo');if(w.state.document.serialize()!==window.__outlineProof.saved)throw Error('Outline undo must restore the original stroke exactly');w.handle('redo');if(!w.state.document.getNode(window.__outlineProof.outlined))throw Error('Outline redo failed');delete window.__outlineProof;})()`);
  const band=await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs'),{paintHex}=await import('./draw/doc/paint.mjs');
    const b=w.state.document.data.artboards[0],look=appearance('#ffffff','#c00000',3);look.strokes[0].widthProfile=[{t:0,left:.2,right:.3},{t:.5,left:1,right:.6},{t:1,left:.2,right:.3}];
    const n=createNode('shape',{shape:'ellipse',params:{x:0,y:0,width:28,height:20},transform:[1.1,.2,.25,.8,b.x+60,b.y+30],appearance:look});
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);w.setTool('select');
    const pixels=async()=>{const img=new Image();img.src=w.exportBoard(b.id,'png',{ppi:200,background:'white'});await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return g.getImageData(0,0,c.width,c.height).data;};
    const before=await pixels();await w.handle('outline-stroke');for(let i=0;i<100&&w.state.document.getNode(n.id);i++)await new Promise(r=>setTimeout(r,20));
    const made=w.state.document.getNode(w.state.selection.ids[0]),after=await pixels();let diff=0,ink=0;for(let i=0;i<before.length;i+=4){diff+=Math.abs(before[i+1]-after[i+1]);ink+=255-before[i+1];}
    const stroke=made.children[1],item=new w.scope.CompoundPath({insert:false,fillRule:'nonzero',children:stroke.subpaths.map(s=>new w.scope.Path({insert:false,closed:s.closed,segments:s.segments.map(g=>new w.scope.Segment(g.p,g.in,g.out))}))});
    const centre=new w.scope.Point(14,10).transform(new w.scope.Matrix(...n.transform)),empty=!item.contains(centre);item.remove();
    return {kids:made.children.length,fill:paintHex(made.children[0].appearance.fills[0]),stroke:paintHex(stroke.appearance.fills[0]),rings:stroke.subpaths.length,empty,difference:diff/ink};})()`);
  assert.equal(band.kids,2,'Existing fill stays separate from the outlined stroke');assert.equal(band.fill,'#ffffff');assert.equal(band.stroke,'#c00000');
  assert.equal(band.rings,2);assert.equal(band.empty,true,'The stroke outline does not include the white background');
  assert.ok(band.difference<.02,`Transformed Width shape keeps its appearance: ${JSON.stringify(band)}`);
  await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:140,height:100,name:'Rounded outline anchor proof'});
  const corners=await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],results=[];
    for(const spec of [{radius:10,width:2,join:'miter'},{radius:0,width:5,join:'round'}]){
      const look=appearance(null,'#071411',spec.width);look.strokes[0].join=spec.join;
      const n=createNode('shape',{shape:'rect',params:{x:b.x+15+results.length*65,y:b.y+20,width:40,height:50,cornerRadius:spec.radius},appearance:look});
      w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);
      const pixels=async()=>{const img=new Image();img.src=w.exportBoard(b.id,'png',{ppi:200,background:'white'});await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return g.getImageData(0,0,c.width,c.height).data;};
      const saved=w.state.document.serialize(),before=await pixels();await w.handle('outline-stroke');
      for(let i=0;i<100&&w.state.document.getNode(n.id);i++)await new Promise(r=>setTimeout(r,20));
      const made=w.state.document.getNode(w.state.selection.ids[0]),after=await pixels();let diff=0,ink=0;
      for(let i=0;i<before.length;i+=4){diff+=Math.abs(before[i]-after[i]);ink+=255-before[i];}
      results.push({radius:spec.radius,type:made.type,counts:made.subpaths.map(s=>s.segments.length),difference:diff/ink});
      w.handle('undo');if(w.state.document.serialize()!==saved)throw Error('Rounded outline undo changed the source');
      w.handle('redo');if(!w.state.document.getNode(made.id))throw Error('Rounded outline redo failed');w.select([made.id]);
    }
    w.setTool('direct-selection');return results;})()`);
  for(const result of corners){
    assert.equal(result.type,'path');assert.equal(result.counts.length,2);
    assert.ok(result.counts.every(n=>n<=12),`At most three anchors per rounded corner: ${JSON.stringify(result)}`);
    assert.ok(result.difference<.02,`Rounded outline keeps its appearance: ${JSON.stringify(result)}`);
  }
  await capture('modcut-outline-rounded-corners.png');
  await restore();
  console.log('PASS Draw rounded Outline Stroke: '+JSON.stringify(corners));
  console.log('PASS Draw curved Outline Stroke: shortcut, '+proof.raw+' samples → '+result.anchors+' anchors, pixel difference '+result.difference.toFixed(4)+', undo/redo, Direct Selection and repeated A');
}
