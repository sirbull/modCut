import assert from 'node:assert/strict';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D2.3 gradients: Period applies one, the Gradient panel edits it, the Gradient tool drags it, export and Cut follow. */
export async function runDrawGradientWorkflows(client) {
  const {evaluate}=client,{drag,click,mouse}=inputHelpers(client),restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Gradient proof'});
  await evaluate("localStorage.removeItem('modcut_recent_gradients')");
  const root='.draw-project[style*=block]',fly=`${root} .draw-panel-window:not([hidden])`;
  const until=async(expression,label)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(50);}assert.fail(`Timed out: ${label} ${await evaluate(`(()=>{const f=document.querySelector('${fly}');return (f?.hidden)+' '+(f?.innerText??'').slice(0,400)+' ERR '+(document.querySelector('.toast,[role=alert]')?.textContent??'')})()`)}`);};
  const applied=()=>evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const at=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const centre=selector=>evaluate(`(()=>{const r=document.querySelector('${fly} ${selector}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,left:r.left,width:r.width,bottom:r.bottom}})()`);
  const id=await evaluate(`(async()=>{const w=${active},{shapeFromDrag}=await import('./draw/tools/shapes.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),b=w.state.document.data.artboards[0];
    const n=shapeFromDrag('rectangle',[b.x+10,b.y+10],[b.x+90,b.y+50],{fill:'#FF0000',stroke:null,strokeWidth:.5});w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);return n.id;})()`);
  const paint=()=>evaluate(`(async()=>(${active}.state.document.getNode('${id}').appearance.fills[0].paint))()`);
  const pixel=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],url=w.exportBoard(b.id,'png',{ppi:72});const img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return [...g.getImageData(Math.round(${x}/25.4*72),Math.round(${y}/25.4*72),1,1).data];})()`);
  // Period applies white to black across the object and opens the Gradient panel; one undo step.
  let steps=await applied();
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'.',code:'Period',bubbles:true,cancelable:true}))");
  await until(`!!document.querySelector('${fly} [data-draw-gradient-type=linear][aria-pressed=true]')`,'Gradient panel');
  let g=await paint();assert.equal(g.type,'linear');assert.equal(g.stops.length,2);assert.equal(await applied(),steps+1);
  const left=await pixel(12,30),right=await pixel(88,30);assert.ok(left[0]>230&&right[0]<25,`White to black: ${left} ${right}`);
  assert.match(await evaluate(`document.querySelector('${root} [data-draw-open=fill]').getAttribute('aria-label')`),/linear gradient/,'Properties names the gradient');
  // Recent shows the gradient just applied; Presets list the built-in gradients.
  assert.equal(await evaluate(`document.querySelectorAll('${fly} [data-draw-gradient-preset^=recent-]').length`),1,'One recent gradient');
  assert.ok(await evaluate(`document.querySelectorAll('${fly} [data-draw-gradient-preset^=preset-]').length`)>=8,'Preset tiles');
  // Panel: add a stop, colour it, reverse, then radial.
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-action=add]').click()`);
  g=await paint();assert.equal(g.stops.length,3);assert.equal(g.stops[1].offset,.5);
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-stop="1"]').click()`);
  await evaluate(`(()=>{const c=document.querySelector('${fly} [data-draw-field=gradient-stop-color]');c.value='#ff0000';c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  g=await paint();assert.deepEqual(g.stops[1].color.values,[1,0,0]);
  const middle=await pixel(50,30);assert.ok(middle[0]>200&&middle[1]<40,`The red stop shows in the middle: ${middle}`);
  // Slider with the mouse: drag the red stop to 25 % (one undo step, live), click the bar at 75 % to add, drag a stop off to delete.
  let bar=await centre('.draw-gradient-bar'),marker=await centre('[data-draw-gradient-stop="1"]');
  steps=await applied();
  await mouse('mouseMoved',marker);await mouse('mousePressed',marker,{buttons:1});
  await mouse('mouseMoved',{x:bar.left+bar.width*.35,y:marker.y},{buttons:1});
  g=await paint();assert.ok(Math.abs(g.stops[1].offset-.35)<.03,`Live while dragging: ${g.stops.map(s=>s.offset)}`);
  await mouse('mouseMoved',{x:bar.left+bar.width*.25,y:marker.y},{buttons:1});await mouse('mouseReleased',{x:bar.left+bar.width*.25,y:marker.y});
  g=await paint();assert.ok(Math.abs(g.stops[1].offset-.25)<.03,`Dragged stop: ${g.stops[1].offset}`);assert.deepEqual(g.stops[1].color.values,[1,0,0]);
  assert.equal(await applied(),steps+1,'A stop drag is one undo step');
  await click({x:bar.left+bar.width*.75,y:bar.y});
  g=await paint();assert.equal(g.stops.length,4,'Clicking the bar adds a stop');assert.ok(g.stops.some(s=>Math.abs(s.offset-.75)<.03));
  marker=await centre('[data-draw-gradient-stop="2"]');steps=await applied();
  await mouse('mouseMoved',marker);await mouse('mousePressed',marker,{buttons:1});
  await mouse('mouseMoved',{x:marker.x,y:marker.y+60},{buttons:1});
  assert.ok(await evaluate(`!!document.querySelector('${fly} .draw-gradient-stop.is-removing')`),'Marked for removal while away from the bar');
  await mouse('mouseReleased',{x:marker.x,y:marker.y+60});
  g=await paint();assert.equal(g.stops.length,3,'Dragging a stop off deletes it');assert.equal(await applied(),steps+1);
  assert.ok(await evaluate(`document.querySelectorAll('${fly} [data-draw-gradient-preset^=recent-]').length`)>=2,'Drags reach Recent when they end');
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-action=reverse]').click()`);
  g=await paint();assert.deepEqual(g.stops[0].color.values,[0,0,0],'Reverse puts black first');
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-type=radial]').click()`);
  g=await paint();assert.equal(g.type,'radial');assert.equal(g.stops.length,3,'Type keeps the stops');
  // A preset of the same type keeps the vector; Sunset gives three stops.
  const before=g.origin;await evaluate(`document.querySelector('${fly} [data-draw-gradient-preset][aria-label="Sunset"]').click()`);
  g=await paint();assert.equal(g.type,'linear');assert.equal(g.stops.length,3);assert.deepEqual(g.stops[0].color.values.map(v=>Math.round(v*255)),[255,230,0]);
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-preset][aria-label="Ember"]').click()`);
  g=await paint();assert.equal(g.type,'radial');assert.deepEqual(g.origin,before,'Ember is fitted around the centre');
  // The Gradient tool: one drag sets a vertical gradient as one undo step.
  await evaluate(`(async()=>{${active}.setTool('gradient')})()`);
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-type=linear]').click()`);
  // Several moves: the gradient follows each one live (a document change must not end the drag).
  steps=await applied();await mouse('mouseMoved',await at(50,12));await mouse('mousePressed',await at(50,12),{buttons:1});
  await mouse('mouseMoved',await at(50,30),{buttons:1});g=await paint();assert.ok(Math.abs(g.length-18)<.5,`Live after the first move: ${g.length}`);
  await mouse('mouseMoved',await at(50,48),{buttons:1});g=await paint();assert.ok(Math.abs(g.length-36)<.5,`Live after the second move: ${g.length}`);
  await mouse('mouseReleased',await at(50,48));
  g=await paint();assert.equal(g.type,'linear');assert.ok(Math.abs(g.angle+90)<1,`Downwards drag: ${g.angle}`);assert.ok(Math.abs(g.length-36)<.5,`Length ${g.length}`);
  assert.equal(await applied(),steps+1,'The whole drag is one undo step');
  const top=await pixel(50,14),bottom=await pixel(50,46);assert.ok([0,1,2].reduce((sum,i)=>sum+Math.abs(top[i]-bottom[i]),0)>250,`The gradient now runs vertically: ${top} ${bottom}`);
  // The annotator on the artwork: the vector from (50,12) to (50,48) with its stops, live while dragging.
  const annotator=()=>evaluate(`(async()=>{const w=${active},g=w.scope.project.getItems({name:'Gradient annotator'})[0];return g?g.children.length:0})()`);
  await until(`(async()=>{const w=${active},g=w.scope.project.getItems({name:'Gradient annotator'})[0];return !!g&&g.children.length>0})()`,'Annotator shown');
  // Stop markers sit 12 px beside the line; for this downward vector that is to the left on screen.
  const stopMarker=async(x,y)=>{const q=await at(x,y);return {x:q.x-12,y:q.y};};
  const cursor=()=>evaluate(`(async()=>${active}.scope.view.element.style.cursor)()`);
  await mouse('mouseMoved',await at(50,30));assert.match(await cursor(),/copy\s*$/,'Over the line: the add-stop cursor');
  await mouse('mouseMoved',await at(50,48));assert.match(await cursor(),/default\s*$/,'Over a handle: the move cursor');
  const count=(await paint()).stops.length;
  // Click the line: a stop at 25 %, then drag it to 75 % in the same gesture (one undo step).
  steps=await applied();
  await mouse('mouseMoved',await at(50,21));await mouse('mousePressed',await at(50,21),{buttons:1});
  g=await paint();assert.equal(g.stops.length,count+1,'Clicking the line adds a stop');
  await mouse('mouseMoved',await at(51,30),{buttons:1});
  g=await paint();assert.ok(g.stops.some(s=>Math.abs(s.offset-.5)<.03),`Live while dragging on the artwork: ${g.stops.map(s=>s.offset)} ${await evaluate("[...document.querySelectorAll('.toast,[role=alert],[role=status]')].map(e=>e.textContent).join('|')")}`);
  await mouse('mouseMoved',await at(51,39),{buttons:1});await mouse('mouseReleased',await at(51,39));
  g=await paint();assert.equal(g.stops.length,count+1);assert.ok(g.stops.some(s=>Math.abs(s.offset-.75)<.03),`Stop dragged to 75 %: ${g.stops.map(s=>s.offset)}`);
  assert.equal(await applied(),steps+1,'Add and drag is one undo step');
  assert.equal(await evaluate(`(async()=>${active}.state.ui.gradientStop)()`),g.stops.findIndex(s=>Math.abs(s.offset-.75)<.03),'The new stop is selected, as in the panel');
  // Drag it off the line: marked while away, deleted on release.
  steps=await applied();
  await mouse('mouseMoved',await stopMarker(50,39));await mouse('mousePressed',await stopMarker(50,39),{buttons:1});
  await mouse('mouseMoved',await at(75,39),{buttons:1});
  assert.match(await cursor(),/not-allowed\s*$/,'The delete cursor while off the line');
  await mouse('mouseReleased',await at(75,39));
  g=await paint();assert.equal(g.stops.length,count,'Dragging a stop off the line deletes it');assert.equal(await applied(),steps+1);
  // The end square: direction and length; the origin circle moves the whole gradient.
  await drag(await at(50,48),await at(80,12));
  g=await paint();assert.ok(Math.abs(g.angle)<1,`End drag sets the angle: ${g.angle}`);assert.ok(Math.abs(g.length-30)<.6,`and the length: ${g.length}`);
  const end=[g.origin[0]+Math.cos(g.angle*Math.PI/180)*g.length,g.origin[1]-Math.sin(g.angle*Math.PI/180)*g.length];
  await drag(await at(50,12),await at(40,22));
  g=await paint();const moved=[g.origin[0]+Math.cos(g.angle*Math.PI/180)*g.length,g.origin[1]-Math.sin(g.angle*Math.PI/180)*g.length];
  assert.ok(Math.abs(moved[0]-end[0]+10)<.5&&Math.abs(moved[1]-end[1]-10)<.5,`The origin drag moves the whole vector: ${end} → ${moved}`);
  assert.ok(await annotator()>0,'The annotator follows the edits');
  // Stroke gradients: within (across the box, the default), along and across the stroke, with the panel's Stroke buttons.
  await evaluate(`(async()=>{${active}.setTool('select')})()`);
  const line=await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs'),b=w.state.document.data.artboards[0];
    const look=appearance(null,'#00FF00',4);look.strokes[0].cap='butt';look.strokes[0].join='miter';
    const n=createNode('path',{subpaths:[{closed:false,segments:[[10,62],[110,62],[110,74],[10,74]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:look});
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);return n.id;})()`);
  const strokePaint=()=>evaluate(`(async()=>(${active}.state.document.getNode('${line}').appearance.strokes[0].paint))()`);
  await evaluate(`document.querySelector('${fly} [data-draw-paint-target=stroke]').click()`);
  await until(`document.querySelector('${fly} [data-draw-paint-target=stroke]')?.getAttribute('aria-pressed')==='true'`,'Stroke target');
  assert.ok(await evaluate(`document.querySelector('${fly} [data-draw-gradient-preset][aria-label="White, Black"]')&&!document.querySelector('${fly} [data-draw-gradient-stroke]')`),'No Stroke buttons before the stroke has a gradient');
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-preset][aria-label="White, Black"]').click()`);
  await until(`document.querySelector('${fly} [data-draw-gradient-stroke=within]')?.getAttribute('aria-pressed')==='true'`,'Within by default');
  const lum=p=>p[0]+p[1]+p[2];
  let topStart=await pixel(14,62),bottomEnd=await pixel(14,74);
  assert.ok(lum(topStart)>600&&lum(bottomEnd)>600,`Within: both left ends are white: ${topStart} ${bottomEnd}`);
  steps=await applied();await evaluate(`document.querySelector('${fly} [data-draw-gradient-stroke=along]').click()`);
  assert.equal((await strokePaint()).strokeMode,'along');assert.equal(await applied(),steps+1);
  topStart=await pixel(14,62);bottomEnd=await pixel(14,74);const corner=await pixel(108,68);
  assert.ok(lum(topStart)>600&&lum(bottomEnd)<120,`Along: white at the start, black at the end: ${topStart} ${bottomEnd}`);
  assert.ok(lum(corner)>200&&lum(corner)<560,`Along: grey halfway: ${corner}`);
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-stroke=across]').click()`);
  assert.equal((await strokePaint()).strokeMode,'across');
  const upper=await pixel(50,60.7),lower=await pixel(50,63.3),far=await pixel(100,60.7);
  assert.ok(lum(upper)>500&&lum(lower)<250,`Across: the left edge is white, the right edge black: ${upper} ${lower}`);
  assert.ok(Math.abs(lum(upper)-lum(far))<60,`Across: the same along the stroke: ${upper} ${far}`);
  await evaluate(`document.querySelector('${fly} [data-draw-paint-target=fill]').click()`);
  await until(`document.querySelector('${fly} [data-draw-paint-target=fill]')?.getAttribute('aria-pressed')==='true'`,'Fill target');
  await evaluate(`(async()=>{const w=${active};w.select(['${line}'])})()`);
  assert.ok(await evaluate(`!document.querySelector('${fly} [data-draw-gradient-stroke]')`),'A fill without a gradient shows no Stroke buttons');
  await evaluate(`(async()=>{const w=${active};w.select(['${id}'])})()`);
  assert.ok(await evaluate(`[...document.querySelectorAll('${fly} [data-draw-gradient-stroke]')].every(b=>b.disabled)`),'Stroke buttons are for strokes only');
  // SVG keeps the gradient; Send to Cut uses the first stop as the layer colour.
  assert.match(await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.ui.artboardId,'svg')})()`),/linearGradient/);
  assert.match(await evaluate(`(async()=>{const w=${active};return w.cutSvg(w.state.ui.artboardId).svg})()`),/fill="#FFF3B0"/);
  // Freeform: four points from the gradient's colours; colour two of them in the panel.
  // The floating Gradient panel covers the right of the canvas; move the view so the artwork is clear of it.
  await evaluate(`(async()=>{const w=${active};w.withScope(()=>{w.scope.view.center=w.scope.view.center.add([30,0]);w.renderer.updateView();})})()`);
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-type=freeform]').click()`);
  g=await paint();assert.equal(g.type,'freeform');assert.equal(g.points.length,4);assert.deepEqual(g.points[0].position,[22,16]);
  await until(`!!document.querySelector('${fly} [data-draw-freeform-mode=points][aria-pressed=true]')`,'Freeform controls');
  const pointColor=async(i,hex)=>{await evaluate(`(async()=>{const w=${active};w.state.ui.gradientStop=${i};w.select(['${id}'])})()`);
    await evaluate(`(()=>{const c=document.querySelector('${fly} [data-draw-field=freeform-color]');c.value='${hex}';c.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
  await pointColor(0,'#ff0000');await pointColor(2,'#0000ff');
  const nearRed=await pixel(23,17),nearBlue=await pixel(77,43);
  assert.ok(nearRed[0]>180&&nearRed[2]<120&&nearBlue[2]>180&&nearBlue[0]<120,`Each point shows its colour: ${nearRed} ${nearBlue} ${await evaluate(`(async()=>{const w=${active};const r=w.scope.project.getItems({class:w.scope.Raster});return JSON.stringify(r.map(x=>({w:x.width,h:x.height,b:x.bounds.toString(),vis:x.visible,p:x.parent?.className,pp:x.parent?.parent?.className,clipped:x.parent?.clipped,loaded:x.loaded})))})()`)}`);
  // The Gradient tool: click in the artwork adds a point there (selected), then drag it; each is one undo step.
  await evaluate(`(async()=>{${active}.setTool('gradient')})()`);
  await until(`(async()=>{const w=${active},g=w.scope.project.getItems({name:'Gradient annotator'})[0];return !!g&&g.children.length>8})()`,'Freeform annotator');
  await mouse('mouseMoved',await at(50,30));assert.match(await cursor(),/copy\s*$/,'Inside: the add-point cursor');
  steps=await applied();await click(await at(50,30));
  g=await paint();assert.equal(g.points.length,5);assert.deepEqual(g.points[4].position.map(Math.round),[50,30]);assert.equal(await applied(),steps+1);
  assert.match(await evaluate(`document.querySelector('${fly} [data-draw-freeform-point]').textContent`),/Point 5 of 5/);
  steps=await applied();
  await mouse('mouseMoved',await at(50,30));await mouse('mousePressed',await at(50,30),{buttons:1});
  await mouse('mouseMoved',await at(55,33),{buttons:1});g=await paint();assert.deepEqual(g.points[4].position.map(Math.round),[55,33],'Live while dragging the point');
  await mouse('mouseMoved',await at(60,35),{buttons:1});await mouse('mouseReleased',await at(60,35));
  g=await paint();assert.deepEqual(g.points[4].position.map(Math.round),[60,35]);assert.equal(await applied(),steps+1,'A point drag is one undo step');
  // Colour it green, then drag its ring's handle (18 px below it while the spread is 0) to spread it.
  await pointColor(4,'#00ff00');const unspread=await pixel(72,35);
  const centre4=await at(60,35),handle={x:centre4.x,y:centre4.y+18};
  steps=await applied();
  await mouse('mouseMoved',{x:handle.x+3,y:handle.y+3});await mouse('mouseMoved',handle);
  assert.match(await cursor(),/default\s*$/,`The spread handle takes the move cursor: ${(await cursor()).slice(-24)} ${await evaluate('document.elementFromPoint('+handle.x+','+handle.y+')?.className')}`);
  await mouse('mousePressed',handle,{buttons:1});await mouse('mouseMoved',{x:handle.x,y:centre4.y+60},{buttons:1});await mouse('mouseReleased',{x:handle.x,y:centre4.y+60});
  g=await paint();assert.ok(g.points[4].spread>5,`Spread from the ring: ${g.points[4].spread}`);assert.equal(await applied(),steps+1);
  const spread=await pixel(72,35);assert.ok(spread[1]>unspread[1]+15,`More green further out: ${unspread} → ${spread}`);
  // Opacity of the one selected point.
  await evaluate(`(()=>{const c=document.querySelector('${fly} [data-draw-field=freeform-opacity]');c.value='40';c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  g=await paint();assert.equal(g.points[4].opacity,.4);assert.equal(g.points[3].opacity,undefined,'Only that point');
  // Drag it off the artwork: marked, then removed; Delete removes the selected point, not the object.
  steps=await applied();
  await mouse('mouseMoved',centre4);await mouse('mousePressed',centre4,{buttons:1});await mouse('mouseMoved',await at(60,70),{buttons:1});
  assert.match(await cursor(),/not-allowed\s*$/,'The delete cursor off the artwork');
  await mouse('mouseReleased',await at(60,70));g=await paint();assert.equal(g.points.length,4,'Dragged off: removed');assert.equal(await applied(),steps+1);
  await click(await at(78,16));assert.equal(await evaluate(`(async()=>${active}.state.ui.gradientStop)()`),1,'Clicking a point selects it');
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',code:'Delete',bubbles:true,cancelable:true}))");
  g=await paint();assert.equal(g.points.length,3,'Delete removes the selected point');
  // Lines: each click continues the line from the selected point; the colour runs along it.
  await evaluate(`document.querySelector('${fly} [data-draw-freeform-mode=lines]').click()`);
  g=await paint();assert.equal(g.mode,'lines');
  await click(await at(22,16));await click(await at(40,40));await click(await at(70,20));
  g=await paint();assert.equal(g.points.length,5);assert.deepEqual(g.lines,[[0,3,4]],`One line through the clicks: ${JSON.stringify(g.lines)}`);
  // A place on the curved line between the first two of its points (the artboard starts at 0,0).
  const onLine=await evaluate(`(async()=>{const {lineSegments}=await import('./draw/doc/freeform.mjs');return lineSegments(${active}.state.document.getNode('${id}').appearance.fills[0].paint)[6].a})()`);
  await click(await at(onLine[0],onLine[1]));g=await paint();assert.equal(g.points.length,6,'Clicking the line adds a point on it');assert.deepEqual(g.lines,[[0,5,3,4]]);
  // Export: SVG carries the pixels; Send to Cut uses the first point's colour.
  assert.match(await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.ui.artboardId,'svg')})()`),/<image/);
  assert.match(await evaluate(`(async()=>{const w=${active};return w.cutSvg(w.state.ui.artboardId).svg})()`),/fill="#FF0000"/);
  await evaluate(`(async()=>{const w=${active};w.setTool('select');w.handle('cancel')})()`);
  await restore();
  console.log('PASS Draw gradients: Period applies white to black with one undo step, Properties names it, Recent and Presets, panel stops (add, colour, mouse drag, click to add, drag off to delete, reverse), type buttons, stroke within/along/across with pixels, presets keep the vector, Gradient tool drag as one step, annotator, freeform points (colour, add, drag, spread ring, opacity, remove, Delete) and lines, PNG pixels, SVG, first stop or point for Cut');
}
