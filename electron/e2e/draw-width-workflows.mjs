import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D4.1: the Width tool and width profiles (Stroke panel presets and flips, Outline Stroke, PNG). */
export async function runDrawWidthWorkflows(client) {
  const { evaluate } = client, { mouse, key } = inputHelpers(client), restore = await rememberTabs(evaluate);
  const root = '.draw-project[style*=block]';
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(40); } assert.fail(`Timed out: ${label}`); };
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 140, height: 90, name: 'Width proof' });
  const at = (x, y) => evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const drag = async (points, modifiers = 0) => {
    await mouse('mouseMoved', await at(...points[0]), { modifiers }); await mouse('mousePressed', await at(...points[0]), { buttons: 1, modifiers });
    for (const p of points.slice(1)) await mouse('mouseMoved', await at(...p), { buttons: 1, modifiers });
    await mouse('mouseReleased', await at(...points.at(-1)), { modifiers });
  };
  const applied = () => evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  // A 2 mm black line from (20,40) to (100,40).
  const line = await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],n=createNode('path',{subpaths:[{closed:false,segments:[[20,40],[100,40]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(null,'#000000',2)});
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);return n.id;})()`);
  const profile = () => evaluate(`(async()=>(${active}.state.document.getNode('${line}').appearance.strokes[0].widthProfile??null))()`);
  // Height of the drawn (profiled) stroke outline.
  const height = () => evaluate(`(async()=>{const w=${active},s=w.state.document.getNode('${line}').appearance.strokes[0],ys=w.renderer.profiledStroke('${line}',s).flatMap(p=>p.segments.map(g=>g.p[1]));return Math.round((Math.max(...ys)-Math.min(...ys))*10)/10})()`);

  // Shift+W picks the Width tool; dragging from the middle of the line 3 mm up makes it 6 mm wide there, in one undo step.
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'W',code:'KeyW',shiftKey:true,bubbles:true,cancelable:true}))");
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`), 'width');
  await wait(100); // Properties/toolbar changes can resize the canvas on the next frame.
  let steps = await applied();
  await mouse('mouseMoved',await at(60,40));
  const hover=await evaluate(`(async()=>{const w=${active},p=w.scope.project.getItem({name:'Width hover point'});return p&&{radius:p.bounds.width*w.scope.view.zoom/2,y:p.position.y-w.state.document.data.artboards[0].y};})()`);
  assert.ok(hover&&Math.abs(hover.y-40)<.1&&Math.abs(hover.radius-3.5)<.1,'An unprofiled stroke has a small, screen-sized circular hover point on its centreline');
  await mouse('mouseMoved',await at(60,70));
  assert.equal(await evaluate(`(async()=>!!${active}.scope.project.getItem({name:'Width controls'}))()`),false,'Hover controls disappear away from the path');
  await mouse('mouseMoved',await at(60,40));await mouse('mousePressed',await at(60,40),{buttons:1});
  await mouse('mouseMoved',await at(60,38.5),{buttons:1});
  const liveState=()=>evaluate(`(async()=>{const w=${active},p=w.scope.project.getItem({name:'Width stroke preview'}),b=w.state.document.data.artboards[0];
    const bars=w.scope.project.getItems({name:'Width crossbar'}).map(p=>p.segments.map(s=>[s.point.x-b.x,s.point.y-b.y]));
    return {height:p?.bounds.height,hidden:!w.renderer.items.get('${line}').visible,bars};})()`);
  let live=await liveState();assert.ok(Math.abs(live.height-3)<.1,'The painted stroke changes before mouse release');
  assert.equal(live.hidden,true,'The old stroke is hidden during the preview');
  await mouse('mouseMoved',await at(60,37),{buttons:1});
  live=await liveState();assert.ok(Math.abs(live.height-6)<.1,'The preview follows each drag movement');
  assert.ok(live.bars.some(bar=>bar.every(p=>Math.abs(p[0]-60)<.1)&&Math.abs(Math.abs(bar[1][1]-bar[0][1])-6)<.1),'Live guide lines reach both stroke edges');
  assert.equal(await profile(),null,'Dragging does not change the saved document');assert.equal(await applied(),steps,'Dragging does not add undo entries');
  const pixel=await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],v=w.scope.view,p=v.projectToView(new w.scope.Point(b.x+50,b.y+38.2)),c=v.element,r=c.width/v.viewSize.width;return [...c.getContext('2d').getImageData(Math.round(p.x*r),Math.round(p.y*r),1,1).data];})()`);
  assert.ok(pixel.slice(0,3).every(v=>v<40),`The live preview uses the actual black stroke paint: ${pixel}`);
  const shot=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'modcut-width-live.png'),Buffer.from(shot.data,'base64'));
  await mouse('mouseReleased',await at(60,37));
  let points = await profile();
  assert.deepEqual(points.map(p => Math.round(p.t * 1000) / 1000), [0, .5, 1], `A width point in the middle: ${JSON.stringify(points)}`);
  assert.ok(Math.abs(points[1].left - 1.5) < .05 && Math.abs(points[1].right - 1.5) < .05, `Both sides 3 mm: ${JSON.stringify(points[1])}`);
  assert.equal(await applied(), steps + 1, 'The drag is one undo step');
  assert.equal(await height(), 6, 'The drawn stroke is 6 mm wide in the middle');
  await drag([[60,40],[60,36]]);
  assert.equal(await height(),8,'Dragging the existing centre dot across the stroke resizes it');
  await evaluate(`(async()=>(${active}.handle('undo')))()`);
  steps=await applied();
  await mouse('mouseMoved',await at(60,40));await mouse('mousePressed',await at(60,40),{buttons:1});
  await mouse('mouseMoved',await at(60,35),{buttons:1});await key('Escape');await mouse('mouseReleased',await at(60,35));
  assert.equal(await height(),6,'Escape restores the committed width');assert.equal(await applied(),steps,'Cancelled drags add no undo step');
  assert.equal(await evaluate(`(async()=>{const w=${active};return w.renderer.items.get('${line}').visible&&!w.scope.project.getItem({name:'Width stroke preview'});})()`),true,'Cancel restores the original artwork and removes the preview');
  // Alt-drag on the lower side end widens only that side.
  await drag([[60, 43], [60, 45]], 1);
  points = await profile();
  assert.ok(Math.abs(points[1].left - 1.5) < .05 && Math.abs(points[1].right - 2.5) < .05, `Only one side grows: ${JSON.stringify(points[1])}`);
  // Double-click the width point: Width Point Edit sets each side in mm.
  const middle = await at(60, 40);
  await mouse('mouseMoved', middle); await evaluate(`document.querySelector('${root} canvas.draw-canvas').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:${middle.x},clientY:${middle.y}}))`);
  await until("!!document.querySelector('.draw-width-dialog form')", 'Width Point Edit');
  await evaluate("(()=>{const f=document.querySelector('.draw-width-dialog form');f.elements.left.value='1';f.elements.right.value='2';f.requestSubmit();})()"); await wait(80);
  points = await profile();
  assert.deepEqual([points[1].left, points[1].right], [.5, 1], 'Side 1 is 1 mm and side 2 is 2 mm (shares of the 2 mm weight)');

  // Stroke panel: Profile lists the presets; Width Profile 3 tapers to the end, Flip Along reverses it, Uniform removes it.
  await evaluate(`(async()=>{const w=${active};w.select(['${line}']);w.handle('panel.stroke')})()`); await wait(50);
  const pick = value => evaluate(`(()=>{const s=document.querySelector('${root} [data-draw-field=stroke-profile]');s.value='${value}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-field=stroke-profile]').value`), 'custom', 'A Width tool profile shows as Custom');
  await pick('profile-3'); await wait(50);
  assert.deepEqual((await profile()).map(p => [p.t, p.left]), [[0, .5], [1, 0]]);
  await evaluate(`document.querySelector('${root} [data-draw-stroke-flip=along]').click()`); await wait(50);
  assert.deepEqual((await profile()).map(p => [p.t, p.left]), [[0, 0], [1, .5]], 'Flip Along tapers the other way');
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-field=stroke-profile]').value`), 'profile-4');
  // PNG: thick at the end, nothing at the start.
  const pixels = await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],url=w.exportBoard(b.id,'png',{ppi:150,background:'white'}),img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const at=(x,y)=>g.getImageData(Math.round(x/25.4*150),Math.round(y/25.4*150),1,1).data[0];
    return {end:at(99,40.7),start:at(21,40.7)}})()`);
  assert.ok(pixels.end < 60 && pixels.start > 200, `Wide at the end, nothing at the start: ${JSON.stringify(pixels)}`);
  // Outline Stroke turns the profile into a filled shape of the same outline.
  await evaluate(`(async()=>{${active}.handle('outline-stroke')})()`);
  await until(`(async()=>!${active}.state.document.getNode('${line}'))()`, 'outlined');
  const outlined = await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode(w.state.selection.ids[0]),r=w.renderer.bounds(n.id),b=w.state.document.data.artboards[0];
    return {fill:(await import('./draw/doc/paint.mjs')).paintHex(n.appearance.fills[0]),strokes:n.appearance.strokes.length,box:[r.x-b.x,r.y-b.y,r.width,r.height].map(v=>Math.round(v))}})()`);
  assert.equal(outlined.fill, '#000000'); assert.equal(outlined.strokes, 0); assert.deepEqual(outlined.box, [20, 39, 81, 2], `The tapered outline with its round end cap: ${JSON.stringify(outlined)}`);
  await evaluate(`(async()=>{const w=${active};w.handle('undo');w.select(['${line}']);w.handle('panel.stroke')})()`); await wait(50);
  await pick('uniform'); await wait(50);
  assert.equal(await profile(), null, 'Uniform is a plain stroke again');

  // The reference case: widen only the bottom-left corner of a closed rectangle.
  await evaluate(`document.querySelector('${root} .draw-panel-window:not([hidden]) [aria-label="Close panel"]')?.click()`);
  const rectangle=await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode,updateNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    w.state.history.execute(updateNode('${line}',{visible:false}));
    const b=w.state.document.data.artboards[0],look=appearance(null,'#000000',.15);look.strokes[0].join='miter';
    const n=createNode('shape',{shape:'rect',params:{x:b.x+25,y:b.y+18,width:80,height:52},appearance:look});
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);w.setTool('width');return n.id;})()`);
  await wait(80);steps=await applied();
  await mouse('mouseMoved',await at(25,70));await mouse('mousePressed',await at(25,70),{buttons:1});
  await mouse('mouseMoved',await at(22,73),{buttons:1});
  const cornerLive=await evaluate(`(async()=>{const w=${active};return {preview:!!w.scope.project.getItem({name:'Width stroke preview'}),profile:w.state.document.getNode('${rectangle}').appearance.strokes[0].widthProfile??null};})()`);
  assert.equal(cornerLive.preview,true);assert.equal(cornerLive.profile,null,'The closed-corner preview is live without committing');
  const cornerClip=await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],v=w.scope.view,c=v.element.getBoundingClientRect(),p=v.projectToView(new w.scope.Point(b.x+19,b.y+12)),q=v.projectToView(new w.scope.Point(b.x+111,b.y+77));return {x:c.x+p.x,y:c.y+p.y,width:q.x-p.x,height:q.y-p.y,scale:1};})()`);
  const cornerShot=await client.command('Page.captureScreenshot',{format:'png',clip:cornerClip});await writeFile(join(tmpdir(),'modcut-width-corner-live.png'),Buffer.from(cornerShot.data,'base64'));
  await mouse('mouseReleased',await at(22,73));
  assert.equal(await applied(),steps+1,'A closed-corner drag is one undo step');
  const result=await evaluate(`(async()=>{const w=${active},node=w.state.document.getNode('${rectangle}'),b=w.state.document.data.artboards[0],s=node.appearance.strokes[0];
    const handles=w.renderer.widthHandles(node.id,s),p=s.widthProfile;
    const url=w.exportBoard(b.id,'png',{ppi:200,background:'white'}),img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
    const ink=(x,y)=>g.getImageData(Math.round(x/25.4*200),Math.round(y/25.4*200),1,1).data[0];
    return {widths:p.map(p=>p.left*s.width),seam:[p[0].left,p.at(-1).left],handles:handles.length,
      top:ink(65,17),right:ink(106,44),left:ink(24,60),bottom:ink(35,71.5),inside:ink(65,30)};})()`);
  assert.equal(result.handles,4,'The closing seam has one width handle, not two overlapping points');
  assert.ok(result.widths[0]>2.5&&result.widths[0]<3.5,JSON.stringify(result));
  assert.deepEqual(result.seam,[result.seam[0],result.seam[0]],'Both representations of the closing corner stay synchronized');
  assert.ok(result.widths.slice(1,-1).every(w=>Math.abs(w-.075)<.001),'Other corners retain their original width');
  assert.ok(result.top>240&&result.right>240&&result.inside>240,`Opposite edges remain thin and the interior stays open: ${JSON.stringify(result)}`);
  assert.ok(result.left<30&&result.bottom<30,`Only the two adjacent edges widen: ${JSON.stringify(result)}`);
  // Then widen the middle of the opposite side, as in the second reference.
  // It forms a rounded lens between the two thin corners without changing the first edit.
  const cornerProfile=await evaluate(`(async()=>${active}.state.document.getNode('${rectangle}').appearance.strokes[0].widthProfile)()`);
  steps=await applied();
  await mouse('mouseMoved',await at(105,44));await mouse('mousePressed',await at(105,44),{buttons:1});
  await mouse('mouseMoved',await at(108.5,44),{buttons:1});
  assert.deepEqual(await evaluate(`(async()=>${active}.state.document.getNode('${rectangle}').appearance.strokes[0].widthProfile)()`),cornerProfile,'The midpoint preview preserves the committed profile until release');
  assert.equal(await applied(),steps);
  const midpointShot=await client.command('Page.captureScreenshot',{format:'png',clip:cornerClip});await writeFile(join(tmpdir(),'modcut-width-midpoint-live.png'),Buffer.from(midpointShot.data,'base64'));
  await mouse('mouseReleased',await at(108.5,44));
  assert.equal(await applied(),steps+1,'The midpoint drag adds one undo step');
  const midpointResult=await evaluate(`(async()=>{const w=${active},s=w.state.document.getNode('${rectangle}').appearance.strokes[0];
    const url=w.exportBoard(w.state.document.data.artboards[0].id,'png',{ppi:200,background:'white'}),img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
    const ink=(x,y)=>g.getImageData(Math.round(x/25.4*200),Math.round(y/25.4*200),1,1).data[0];
    return {points:s.widthProfile,centre:ink(108,44),shoulder:ink(107,31),tip:ink(107,20),
      inner:ink(102,44),top:ink(65,17),left:ink(24,60),bottom:ink(35,71.5)};})()`);
  for(const point of cornerProfile)assert.deepEqual(midpointResult.points.find(p=>p.t===point.t),point,'A new mid-edge width point preserves all corner widths');
  assert.equal(midpointResult.points.length,cornerProfile.length+1);
  assert.ok(midpointResult.centre<30&&midpointResult.inner<30&&midpointResult.shoulder<30,`The midpoint makes a rounded bulge on both sides: ${JSON.stringify(midpointResult)}`);
  assert.ok(midpointResult.tip>240&&midpointResult.top>240,`The bulge tapers back to the thin corners: ${JSON.stringify(midpointResult)}`);
  assert.ok(midpointResult.left<30&&midpointResult.bottom<30,'The earlier bottom-left taper is preserved');
  await evaluate(`(async()=>(${active}.handle('undo')))()`);
  assert.deepEqual(await evaluate(`(async()=>${active}.state.document.getNode('${rectangle}').appearance.strokes[0].widthProfile)()`),cornerProfile,'Undoing the midpoint drag keeps the earlier corner edit');
  const closing=await at(25,70);
  await evaluate(`document.querySelector('${root} canvas.draw-canvas').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:${closing.x},clientY:${closing.y}}))`);
  await until("!!document.querySelector('.draw-width-dialog form')",'Closing-corner Width Point Edit');
  await evaluate("(()=>{const f=document.querySelector('.draw-width-dialog form');f.elements.left.value='2';f.elements.right.value='2';f.requestSubmit();})()");await wait(80);
  const seamEdit=await evaluate(`(async()=>{const p=${active}.state.document.getNode('${rectangle}').appearance.strokes[0].widthProfile;return [p[0].left,p.at(-1).left];})()`);
  assert.deepEqual(seamEdit,[2/.15,2/.15],'Width Point Edit changes both representations of the closing corner');
  await evaluate(`(async()=>(${active}.handle('undo')))()`);
  await evaluate(`(async()=>(${active}.handle('undo')))()`);
  assert.equal(await evaluate(`(async()=>${active}.state.document.getNode('${rectangle}').appearance.strokes[0].widthProfile??null)()`),null,'Undo restores the original closed rectangle');
  await restore();
  console.log('PASS Draw width: live stroke and handles, cancel/undo, Alt, point edits, profile export, localized corners, mid-edge bulges and a continuous closed seam');
}
