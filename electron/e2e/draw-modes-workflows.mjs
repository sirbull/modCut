import assert from 'node:assert/strict';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D2.2 rest: Draw Normal, Draw Behind and Draw Inside. */
export async function runDrawModeWorkflows(client) {
  const {evaluate}=client,{drag}=inputHelpers(client),restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Draw modes proof'});
  const at=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const pixel=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0];w.scope.view.update();
    const c=w.scope.view.element,p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),k=c.width/c.getBoundingClientRect().width;
    const [r,g,bl]=c.getContext('2d').getImageData(Math.floor(p.x*k),Math.floor(p.y*k),1,1).data;return '#'+[r,g,bl].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();})()`);
  const children=()=>evaluate(`(async()=>(${active}.state.document.data.layers[0].children.map(n=>n.id)))()`);
  const mode=()=>evaluate(`(async()=>(${active}.state.ui.drawMode??'normal'))()`);
  const pressed=()=>evaluate(`[...document.querySelectorAll('.draw-project[style*=block] [data-draw-mode]')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.drawMode)`);
  const ids=await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs'),{shapeFromDrag}=await import('./draw/tools/shapes.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id;
    const back=shapeFromDrag('rectangle',[b.x+5,b.y+5],[b.x+35,b.y+35],{fill:'#00AA00',stroke:null});
    const circle=shapeFromDrag('ellipse',[b.x+60,b.y+20],[b.x+100,b.y+60],{fill:'#FF0000',stroke:'#000000',strokeWidth:1});
    for(const n of [back,circle])w.state.history.execute(insertNode(L,n));w.select([]);return {back:back.id,circle:circle.id};})()`);
  await evaluate(`(async()=>{${active}.state.ui.fill='#0000FF';${active}.state.ui.stroke=null;${active}.setTool('rectangle')})()`);

  // Shift+D with nothing selected cycles Normal, Behind, then back to Normal (Inside needs a selection).
  assert.equal(await mode(),'normal');assert.deepEqual(await pressed(),['normal']);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'D',code:'KeyD',shiftKey:true,bubbles:true,cancelable:true}))");
  assert.equal(await mode(),'behind');assert.deepEqual(await pressed(),['behind']);
  assert.equal(await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-mode=inside]').disabled"),true,'Draw Inside is off without a single path or shape');
  assert.match(await evaluate(`document.querySelector('.draw-project[style*=block] .draw-tool-hint')?.textContent||''`),/Draw Behind/);
  // Draw Behind with nothing selected: the new rectangle goes to the bottom of the layer and under the green one.
  await drag(await at(20,20),await at(45,45));
  let list=await children();assert.equal(list.length,3);assert.equal(list[0]!==ids.back&&list[0]!==ids.circle,true,'Behind puts it at the bottom');
  assert.equal(await pixel(25,25),'#00AA00','The green square stays on top of the new rectangle');
  // With the new rectangle selected, Inside is available, so Shift+D goes there before Normal.
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'D',code:'KeyD',shiftKey:true,bubbles:true,cancelable:true}))");
  assert.equal(await mode(),'inside');
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'D',code:'KeyD',shiftKey:true,bubbles:true,cancelable:true}))");
  assert.equal(await mode(),'normal');

  // Draw Inside: select the circle, choose Draw Inside, draw across its edge.
  await evaluate(`(async()=>(${active}.select(['${ids.circle}'])))()`);
  assert.equal(await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-mode=inside]').disabled"),false);
  await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-mode=inside]').click()");
  assert.equal(await mode(),'inside');
  // Selecting the circle made its paint current, as in Illustrator; draw in blue.
  await evaluate(`(async()=>{${active}.state.ui.fill='#0000FF';${active}.state.ui.stroke=null})()`);
  const steps=await evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  await drag(await at(50,25),await at(80,55));
  assert.equal(await evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`),steps+1,'Wrapping and drawing is one undo step');
  const group=await evaluate(`(async()=>{const w=${active},d=w.state.document,{parentId}=d.locate('${ids.circle}'),g=d.getNode(parentId);return g.type==='group'?{id:g.id,clip:g.clip,kids:g.children.map(n=>n.id)}:null})()`);
  assert.ok(group?.clip,'The circle became a clipping path');assert.equal(group.kids.at(-1),ids.circle);assert.equal(group.kids.length,2);
  await wait(60);
  assert.equal(await pixel(70,45),'#0000FF','Inside the circle the new rectangle shows');
  assert.equal(await pixel(52,27),'#FFFFFF','Outside the circle the rectangle is clipped away');
  assert.equal(await pixel(90,40),'#FF0000','The circle keeps its fill under the drawn object');
  assert.equal(await pixel(100,40),'#000000','The circle keeps its stroke on top');
  // A second object goes into the same group, above the first and under the clipping path.
  await drag(await at(85,30),await at(95,50));
  const kids=await evaluate(`(async()=>(${active}.state.document.getNode('${group.id}').children.map(n=>n.id)))()`);
  assert.equal(kids.length,3);assert.equal(kids.at(-1),ids.circle);
  // Send to Cut keeps the circle's red fill and black stroke, and the rectangles cut at its edge.
  const cut=await evaluate(`(async()=>(${active}.cutSvg(${active}.state.document.data.artboards[0].id)))()`);
  const svg=typeof cut==='string'?cut:cut.svg;
  assert.match(svg,/fill="#ff0000"/i);assert.match(svg,/stroke="#000000"/);
  // Draw Normal returns to drawing on top.
  await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-mode=normal]').click()");assert.equal(await mode(),'normal');
  await evaluate(`(async()=>{${active}.handle('undo');${active}.handle('undo')})()`);
  assert.equal(await evaluate(`(async()=>(${active}.state.document.locate('${ids.circle}').parentId===${active}.state.document.data.layers[0].id))()`),true,'Undo releases the circle again');
  await evaluate(`(async()=>(${active}.setTool('select')))()`);await restore();
  console.log('PASS Draw modes: Shift+D cycles, Draw Behind under the layer, Draw Inside wraps in one step, keeps the clipping path fill and stroke on canvas and in Send to Cut, and reuses the group');
}
