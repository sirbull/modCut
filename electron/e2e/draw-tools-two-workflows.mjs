import assert from 'node:assert/strict';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D2.8 part A: Eyedropper, Measure, Group Selection and Scissors. */
export async function runDrawToolsTwoWorkflows(client) {
  const {evaluate}=client,{click,drag,key}=inputHelpers(client),restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:140,height:90,name:'Tools proof'});
  const at=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const node=id=>evaluate(`(async()=>(${active}.state.document.getNode('${id}')))()`);
  const applied=()=>evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const select=ids=>evaluate(`(async()=>(${active}.select(${JSON.stringify(ids)})))()`);
  const selection=()=>evaluate(`(async()=>(${active}.state.selection.ids))()`);
  const tool=id=>evaluate(`(async()=>(${active}.setTool('${id}')))()`);
  const ids=await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs'),{shapeFromDrag}=await import('./draw/tools/shapes.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id,sq=(x,y,s)=>[{closed:true,segments:[[x,y],[x+s,y],[x+s,y+s],[x,y+s]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}];
    const red=createNode('path',{subpaths:sq(10,10,20),appearance:appearance('#FF0000','#0000FF',2),opacity:.8});
    const plain=createNode('path',{subpaths:sq(40,10,20),appearance:appearance('#CCCCCC','#000000',.5)});
    const inner=createNode('path',{subpaths:sq(10,50,15),appearance:appearance('#00AA00',null)}),other=createNode('path',{subpaths:sq(30,50,15),appearance:appearance('#AA00AA',null)});
    const innerGroup=createNode('group',{children:[inner,other]}),outerGroup=createNode('group',{children:[innerGroup]});
    const ring=shapeFromDrag('ellipse',[b.x+80,b.y+10],[b.x+120,b.y+50],{fill:null,stroke:'#000000',strokeWidth:.5});
    const line=createNode('path',{subpaths:[{closed:false,segments:[[70,70],[130,70]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance(null,'#000000',.5)});
    for(const n of [red,plain,outerGroup,ring,line])w.state.history.execute(insertNode(L,n));w.select([]);
    return {red:red.id,plain:plain.id,inner:inner.id,innerGroup:innerGroup.id,outerGroup:outerGroup.id,ring:ring.id,line:line.id};})()`);

  // Eyedropper (I): with the plain square selected, clicking the red one copies its look in one step.
  await select([ids.plain]);let steps=await applied();await key('i');
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`),'eyedropper');
  await click(await at(20,20));
  let plain=await node(ids.plain),red=await node(ids.red);
  assert.deepEqual(plain.appearance,red.appearance);assert.equal(plain.opacity,.8);assert.equal(await applied(),steps+1);
  // With nothing selected the sample becomes the paint for new objects.
  await select([]);await click(await at(20,20));
  assert.deepEqual(await evaluate(`(async()=>{const u=${active}.state.ui;return [u.fill,u.stroke,u.strokeWidth]})()`),['#FF0000','#0000FF',2]);
  // Shift-click takes only the colour under the pointer for the focused fill.
  await select([ids.ring]);await evaluate(`(async()=>{${active}.state.ui.paintFocus='fill'})()`);
  await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+20,b.y+20)),r=w.scope.view.element.getBoundingClientRect();
    w.scope.view.element.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.x+p.x,clientY:r.y+p.y,button:0,buttons:1,shiftKey:true,pointerId:1,bubbles:true}));
    w.scope.view.element.dispatchEvent(new PointerEvent('pointerup',{clientX:r.x+p.x,clientY:r.y+p.y,button:0,pointerId:1,bubbles:true}));})()`);
  await wait(50);
  const ringFill=(await node(ids.ring)).appearance.fills[0]?.paint?.color?.values?.map(v=>Math.round(v*255));
  assert.ok(ringFill&&ringFill[0]>200&&ringFill[1]<90,`Shift samples the red pixel: ${ringFill}`);

  // Measure: drag shows distance and angle in the status bar and keeps the line until the tool changes.
  await tool('measure');await drag(await at(10,80),await at(40,40));
  const text=await evaluate(`document.querySelector('.draw-project[style*=block] .draw-tool-hint')?.textContent||''`);
  assert.match(text,/D 50\.00 mm · W 30\.00 · H 40\.00 · ∠ 53\.1°/);
  assert.deepEqual(await evaluate(`(async()=>{const m=${active}.state.ui.measurement;return [Math.round(m.distance*100)/100,Math.round(m.angle*10)/10]})()`),[50,53.1]);
  await tool('select');assert.equal(await evaluate(`(async()=>(${active}.state.ui.measurement))()`),null,'Changing tool clears the measurement');

  // Group Selection: first click the object, then one group level up per click.
  await select([]);await tool('group-selection');
  await click(await at(17,57));assert.deepEqual(await selection(),[ids.inner]);
  await click(await at(17,57));assert.deepEqual(await selection(),[ids.innerGroup]);
  await click(await at(17,57));assert.deepEqual(await selection(),[ids.outerGroup]);

  // Scissors (C): a closed ellipse opens where it is clicked; an open line splits in two.
  await select([]);await key('c');assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`),'scissors');
  steps=await applied();await click(await at(120,30));
  const ring=await node(ids.ring);assert.equal(ring.type,'path');assert.equal(ring.subpaths[0].closed,false);
  const ends=[ring.subpaths[0].segments[0].p,ring.subpaths[0].segments.at(-1).p];assert.ok(Math.hypot(ends[0][0]-ends[1][0],ends[0][1]-ends[1][1])<1e-6,'Both ends sit on the cut');
  assert.equal(await applied(),steps+1);
  const before=(await evaluate(`(async()=>(${active}.state.document.data.layers[0].children.length))()`));
  await click(await at(100,70));
  assert.equal(await evaluate(`(async()=>(${active}.state.document.data.layers[0].children.length))()`),before+1,'The line is now two paths');
  const pieces=await evaluate(`(async()=>{const w=${active},a=w.state.document.data.artboards[0];return w.state.selection.ids.map(id=>w.state.document.getNode(id).subpaths[0].segments.map(s=>Math.round(s.p[0]-a.x)))})()`);
  assert.deepEqual(pieces,[[70,100],[100,130]]);
  await tool('select');await restore();
  console.log('PASS Draw tools: Eyedropper (copy to selection, default paint, Shift pixel colour), Measure distance and angle, Group Selection levels, Scissors on a closed shape and an open path');
}
