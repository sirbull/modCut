import assert from 'node:assert/strict';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/**
 * D4.6: timings for 5 000 paths with 200 000 anchors: inserting them in one undo step, a pan frame, a zoom
 * frame, select all, moving everything, one edit and its undo. Each step is measured on its own (a step
 * slower than the DevTools timeout is reported as such). Asserts generous ceilings, so a slow machine
 * passes while an order-of-magnitude regression does not; `report` only prints.
 */
export async function runDrawPerfWorkflows(client, { report = false, count = 5000 } = {}) {
  const { evaluate } = client, restore = await rememberTabs(evaluate);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 1000, height: 1000, name: 'Performance proof' });
  await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],paths=[];
    for(let i=0;i<${count};i++){const cx=b.x+10+(i%70)*14,cy=b.y+10+Math.floor(i/70)*14,segments=[];
      for(let k=0;k<40;k++){const a=k/40*Math.PI*2,r=5+(k%2);segments.push({p:[cx+Math.cos(a)*r,cy+Math.sin(a)*r],in:[0,0],out:[0,0]});}
      paths.push(createNode('path',{subpaths:[{closed:true,segments}],appearance:appearance(i%2?'#3366CC':'#CC6633','#000000',.2)}));}
    window.__perfPaths=paths;})()`);
  const step = async (name, body) => {
    try { return await evaluate(`(async()=>{const w=${active},frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const t=performance.now();${body};await frame();return Math.round(performance.now()-t)})()`); }
    catch (error) { if (/timed out/.test(error.message)) return Infinity; throw error; }
  };
  if (process.argv.includes('--collapse')) await evaluate(`(async()=>{const w=${active};w.state.ui.dockCollapsed={layers:true,properties:true};w.handle('deselect')})()`);
  const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
  const timings = {};
  timings.insert = await step('insert', `const {insertNode}=await import('./draw/doc/commands.mjs'),layer=w.state.document.data.layers[0];w.state.history.transaction('Insert',()=>window.__perfPaths.forEach(n=>w.state.history.execute(insertNode(layer.id,n))))`);
  if (timings.insert === Infinity) { for (let i = 0; i < 120 && !(await evaluate(`(async()=>${active}.state.document.data.layers[0].children.length===${count})()`).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 1000)); }
  await step('fit', `w.handle('fit-artboard')`);
  const pans = []; for (let i = 0; i < 9; i++) pans.push(await step('pan', `w.scope.view.center=w.scope.view.center.add([5,0]);w.renderer.updateView({viewOnly:true})`)); timings.pan = median(pans);
  const zooms = []; for (let i = 0; i < 6; i++) zooms.push(await step('zoom', `w.scope.view.zoom*=${i % 2 ? 1 / 1.1 : 1.1};w.renderer.updateView({viewOnly:true})`)); timings.zoom = median(zooms);
  // A full, sharp redraw of everything (what the view settles to after panning).
  const redraws = []; for (let i = 0; i < 5; i++) redraws.push(await step('redraw', `w.scope.view._needsUpdate=true;w.scope.view.update()`)); timings.redraw = median(redraws);
  timings.selectAll = await step('selectAll', `w.handle('select-all')`);
  timings.move = await step('move', `w.handle('nudge-right')`);
  timings.deselect = await step('deselect', `w.handle('deselect')`);
  // --profile: CPU profile of one edit, self time per function (for D4.6 work).
  const profiling = process.argv.find((a) => a.startsWith('--profile'));
  if (profiling) {
    const what = profiling.split('=')[1] ?? 'edit', body = { edit: `w.select([window.__perfPaths[1].id]);w.handle('nudge-right')`, selectAll: `w.handle('deselect');w.handle('select-all')`, move: `w.handle('select-all');w.handle('nudge-right')` }[what];
    if (what === 'move') await step('prepare', `w.handle('select-all')`);
    await client.command('Profiler.enable'); await client.command('Profiler.setSamplingInterval', { interval: 500 }); await client.command('Profiler.start');
    await step('profiled', what === 'move' ? `w.handle('nudge-right')` : body);
    const { profile } = await client.command('Profiler.stop'), self = new Map(), dt = profile.timeDeltas, byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, i) => { const n = byId.get(id), f = n.callFrame, key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`; self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000); });
    console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(1)} ms ${k}`).join('\n'));
    // Inclusive time of our own functions (a function's samples plus everything it called).
    const parentOf = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parentOf.set(c, n.id);
    const inclusive = new Map();
    profile.samples.forEach((id, i) => { const seen = new Set(); for (let at = id; at !== undefined; at = parentOf.get(at)) { const f = byId.get(at).callFrame; if (!/draw\/|app\.js/.test(f.url)) continue; const key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`; if (seen.has(key)) continue; seen.add(key); inclusive.set(key, (inclusive.get(key) ?? 0) + (dt[i] ?? 0) / 1000); } });
    console.log('INCLUSIVE\n' + [...inclusive].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${v.toFixed(1)} ms ${k}`).join('\n'));
  }
  if (process.argv.includes('--parts')) {
    console.log('parts', JSON.stringify(await evaluate(`(async()=>{const w=${active},doc=w.state.document,out={};
      const wrap=(obj,key,name)=>{const f=obj[key];obj[key]=function(...a){const t=performance.now();try{return f.apply(this,a);}finally{out[name]=(out[name]??0)+performance.now()-t;}};return ()=>{obj[key]=f;};};
      const undo=[wrap(doc,'_edit','edit'),wrap(w.renderer,'render','render'),wrap(w.renderer,'updateView','updateView'),wrap(w.scope.view,'update','viewUpdate'),wrap(w.scope.project.activeLayer?.parent??w.scope.project,'draw','draw')].filter(Boolean);
      const t=performance.now();w.select([window.__perfPaths[3].id]);out.select=performance.now()-t;const t2=performance.now();w.handle('nudge-right');out.handle=performance.now()-t2;
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));out.total=performance.now()-t;undo.forEach(u=>u());return Object.fromEntries(Object.entries(out).map(([k,v])=>[k,Math.round(v)]));})()`)));
  }
  timings.edit = await step('edit', `w.select([window.__perfPaths[${Math.floor(count / 2)}].id]);w.handle('nudge-right')`);
  timings.undo = await step('undo', `w.handle('undo')`);
  timings.anchors = await evaluate(`(async()=>${active}.state.document.descendants(null).reduce((n,x)=>n+(x.subpaths?.reduce((m,s)=>m+s.segments.length,0)??0),0))()`);
  await evaluate('delete window.__perfPaths');
  console.log(`Draw performance (ms): ${JSON.stringify(timings)}`);
  assert.equal(timings.anchors, count * 40);
  if (!report) for (const [key, ceiling] of Object.entries({ insert: 40000, pan: 120, zoom: 120, redraw: 400, selectAll: 2000, move: 8000, edit: 1500, undo: 1500 }))
    assert.ok(timings[key] < ceiling, `${key} took ${timings[key]} ms (ceiling ${ceiling})`);
  await restore();
  console.log(`PASS Draw performance: ${count} paths and ${count * 40} anchors insert, pan, zoom, select all, move, edit and undo within the ceilings`);
  return timings;
}
