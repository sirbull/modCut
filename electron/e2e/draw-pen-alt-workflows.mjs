import assert from 'node:assert/strict';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,submitNewDrawDialog,rememberTabs } from './draw-test-helpers.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const close=(actual,expected,label)=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<.04,`${label}: ${actual} != ${expected}`));

/** Real pointer/Option events, including active Pen sessions and transformed layers. */
export async function runDrawPenAltWorkflows(client){
  const {evaluate}=client,{click,drag,mouse,key}=inputHelpers(client),restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Pen Option editing'});
  const command=id=>evaluate(`(async()=>(${active}.handle('${id}')))()`);
  const screen=p=>evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${p})),b=w.scope.view.element.getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y}})()`);
  const nodes=()=>evaluate(`(async()=>(${active}.state.snapshot().layers[0].children))()`);
  const state=()=>evaluate(`(async()=>{const w=${active};return{history:w.state.history.entries,tool:w.state.ui.tool,cursor:w.scope.view.element.style.cursor,action:w.scope.view.element.dataset.pathAction}})()`);
  const expectCursor=async name=>assert.equal(await evaluate(`(async()=>{const w=${active},{CURSORS}=await import('./draw/tools/cursors.mjs');return w.scope.view.element.style.cursor.replace(/\\s+/g,'')===CURSORS['${name}'].replace(/\\s+/g,'')})()`),true,`${name} cursor`);
  const option=async down=>{await client.command('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key:'Alt',code:'AltLeft',modifiers:down?1:0});await wait(50);};
  const shot=async name=>{const s=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),name),Buffer.from(s.data,'base64'));};
  const visibleBoxSides=p=>evaluate(`(async()=>{const w=${active},v=w.scope.view,c=v.element,r=c.width/v.viewSize.width,q=v.projectToView(new w.scope.Point(${p})),ctx=c.getContext('2d');return [[-3.5,0],[3.5,0],[0,-3.5],[0,3.5]].map(([dx,dy])=>{const radius=Math.ceil(r),d=ctx.getImageData(Math.round((q.x+dx)*r)-radius,Math.round((q.y+dy)*r)-radius,2*radius+1,2*radius+1).data;for(let i=0;i<d.length;i+=4)if(d[i+1]>d[i]+20&&d[i+2]>d[i]+15&&d[i+1]<230)return true;return false;});})()`);
  const worldSegments=()=>evaluate(`(async()=>{const w=${active},n=w.state.document.data.layers[0].children[0];return n.subpaths[0].segments.map(s=>{const p=w.renderer.editPointToWorld(n.id,s.p),handle=k=>{const h=w.renderer.editPointToWorld(n.id,s.p.map((v,i)=>v+s[k][i]));return[h.x-p.x,h.y-p.y]};return{p:[p.x,p.y],in:handle('in'),out:handle('out')}})})()`);
  const curvePoint=(index,t)=>evaluate(`(async()=>{const w=${active},n=w.state.document.data.layers[0].children[0],segments=n.subpaths[0].segments,a=segments[${index}],b=segments[(${index}+1)%segments.length],t=${t},u=1-t,q=a.p.map((v,i)=>v*u*u*u+3*(v+a.out[i])*u*u*t+3*(b.p[i]+b.in[i])*u*t*t+b.p[i]*t*t*t),p=w.renderer.editPointToWorld(n.id,q);return[p.x,p.y]})()`);
  try{
    // Nonuniform scale and shear exercise conversion of pointer motion into path space.
    await evaluate(`(async()=>{const w=${active},{updateNode}=await import('./draw/doc/commands.mjs');w.state.history.execute(updateNode(w.state.document.data.layers[0].id,{transform:[1.1,.2,-.15,.8,3,4]}));w.state.ui.fill='#FFFFFF';w.state.ui.stroke='#071411';w.setTool('pen')})()`);
    await wait(150);
    for(const p of [[20,30],[50,30],[80,40]])await click(await screen(p));
    const original=JSON.stringify(await nodes()),history=(await state()).history.length;
    assert.equal((await nodes())[0].subpaths[0].segments.length,3);

    // A straight segment can be bent without adding an anchor, even mid-drawing.
    const straightStart=await curvePoint(0,.5),straightEnd=[straightStart[0],straightStart[1]-7];
    await mouse('mouseMoved',await screen(straightStart),{modifiers:1});await expectCursor('bend-curve');
    await drag(await screen(straightStart),await screen(straightEnd),1);
    close(await curvePoint(0,.5),straightEnd,'Straight line bends through the drag target');
    assert.equal((await nodes())[0].subpaths[0].segments.length,3);
    await command('undo');assert.equal(JSON.stringify(await nodes()),original);
    await click(await screen([80,40])); // Undo ends Pen sessions; resume at the last endpoint.

    // Hover first anchor in a live path: Option must override the close-path action.
    await mouse('mouseMoved',await screen([20,30]));assert.equal((await state()).action,'close');
    await option(true);await expectCursor('anchor-convert');
    assert.equal((await state()).action,'convert-anchor');
    assert.equal(JSON.stringify(await nodes()),original,'Hover never changes geometry');
    await option(false);await expectCursor('pen-close');
    await option(true);
    await mouse('mousePressed',await screen([20,30]),{buttons:1,modifiers:1});
    await mouse('mouseMoved',await screen([25,40]),{buttons:1,modifiers:1});
    assert.deepEqual(await visibleBoxSides([50,30]),[true,true,true,true],'All four sides of an unselected anchor box stay above the opaque filled preview');
    await shot('modcut-pen-anchor-foreground.png');
    await mouse('mouseReleased',await screen([25,40]),{modifiers:1});
    let segments=await worldSegments();
    close(segments[0].p,[20,30],'Anchor stays fixed');close(segments[0].out,[5,10],'Outgoing handle follows drag');close(segments[0].in,[-5,-10],'Incoming handle mirrors drag');
    assert.equal((await nodes())[0].subpaths[0].closed,false,'Option does not close the path');
    assert.equal((await state()).history.length,history+1,'One drag is one undo step');
    await option(false);
    // The live Pen session still continues at the original last anchor.
    await click(await screen([100,60]));assert.equal((await nodes())[0].subpaths[0].segments.length,4);
    close((await worldSegments())[3].p,[100,60],'Drawing continues after the edit');
    await command('undo');await command('undo');assert.equal(JSON.stringify(await nodes()),original);
    await command('redo');

    // Interior anchor: pressing Alt before hover also works. Release mid-drag
    // without losing the chosen symmetric-handle operation.
    await mouse('mouseMoved',await screen([50,30]),{modifiers:1});await expectCursor('anchor-convert');
    await mouse('mousePressed',await screen([50,30]),{buttons:1,modifiers:1});
    await mouse('mouseMoved',await screen([52,40]),{buttons:1,modifiers:1});
    await mouse('mouseMoved',await screen([53,42]),{buttons:1});
    await mouse('mouseReleased',await screen([53,42]));
    segments=await worldSegments();close(segments[1].p,[50,30],'Interior anchor stays fixed');close(segments[1].out,[3,12],'Interior outgoing handle');close(segments[1].in,[-3,-12],'Interior incoming handle');
    await key('Escape'); // End the live path; editing must also work afterwards.
    const beforeClick=JSON.stringify(await nodes()),beforeClickHistory=JSON.stringify((await state()).history);
    await click(await screen([50,30]),1);
    assert.equal(JSON.stringify(await nodes()),beforeClick,'Option click alone is a no-op');
    assert.equal(JSON.stringify((await state()).history),beforeClickHistory,'Option click adds no undo step');

    // Grab an asymmetric location on an already curved segment.
    const t=.37,start=await curvePoint(1,t),end=[start[0]+1,start[1]+8],beforeBend=await nodes(),beforeSegments=await worldSegments();
    await mouse('mouseMoved',await screen(start));
    await option(true);await expectCursor('bend-curve');assert.equal((await state()).action,'bend-curve');
    await option(false);await expectCursor('pen-add');await option(true);
    await mouse('mousePressed',await screen(start),{buttons:1,modifiers:1});
    await mouse('mouseMoved',await screen(end),{buttons:1,modifiers:1});
    await shot('modcut-pen-rubberband-bend.png');
    await mouse('mouseReleased',await screen(end),{modifiers:1});
    close(await curvePoint(1,t),end,'Grabbed curve point follows the pointer');
    segments=await worldSegments();
    for(let i=0;i<segments.length;i++)close(segments[i].p,beforeSegments[i].p,'Curve anchors stay fixed');
    close(segments[1].in,beforeSegments[1].in,'Previous segment handle stays unchanged');
    close(segments[2].out,beforeSegments[2].out,'Next segment handle stays unchanged');
    assert.equal((await nodes())[0].subpaths[0].segments.length,3,'Bending adds no anchors');
    await option(false);await command('undo');assert.deepEqual(await nodes(),beforeBend);
    await command('redo');const afterBend=await nodes();close(await curvePoint(1,t),end,'Redo restores the bend');

    // Escape and pointer cancellation discard previews instead of committing them.
    const cancelAt=await curvePoint(1,.55),cancelEnd=[cancelAt[0],cancelAt[1]+6];
    await mouse('mouseMoved',await screen(cancelAt),{modifiers:1});
    await mouse('mousePressed',await screen(cancelAt),{buttons:1,modifiers:1});
    await mouse('mouseMoved',await screen(cancelEnd),{buttons:1,modifiers:1});
    await key('Escape');await mouse('mouseReleased',await screen(cancelEnd));
    assert.deepEqual(await nodes(),afterBend,'Escape discards the bend');
    await mouse('mouseMoved',await screen([50,30]),{modifiers:1});
    await mouse('mousePressed',await screen([50,30]),{buttons:1,modifiers:1});
    await mouse('mouseMoved',await screen([56,39]),{buttons:1,modifiers:1});
    await evaluate(`(async()=>${active}.scope.view.element.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true})))()`);
    await mouse('mouseReleased',await screen([56,39]));
    assert.deepEqual(await nodes(),afterBend,'Pointer cancellation discards the anchor edit');
    assert.equal((await state()).tool,'pen');
    process.stdout.write('PASS Draw Pen Option: stationary modifier cursors, symmetric anchor handles, curve bending at picked point, transformed layer, continued drawing, undo/redo and cancellation\n');
  }finally{await option(false);await restore();}
}
