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
  await restoreTabs();
  console.log('PASS Draw Send to Cut v2 (A): Outline Stroke command, outline strokes and cut at the artboard in Send to Cut, duplicates left out, tiny segments and node count reported');
}
