import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

export async function runDrawWorkspaceFileWorkflows(client) {
  const { evaluate, command }=client,{click,mouse}=inputHelpers(client),restore=await rememberTabs(evaluate);
  const stored=await evaluate("({layout:localStorage.getItem('modcut.draw.panel-layout'),workspaces:localStorage.getItem('modcut.draw.workspaces')})");
  const root='.draw-project[style*=block]',rail=`${root} .draw-panel-rail`;
  const ui=()=>evaluate(`(async()=>structuredClone(${active}.state.ui))()`);
  const handle=id=>evaluate(`(async()=>(${active}.handle(${JSON.stringify(id)})))()`);
  const until=async(expression,label)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(40);}assert.fail(label);};
  const menu=async label=>assert.equal(await evaluate(`window.modcut.clickE2EMenuItem('Window',${JSON.stringify(label)})`),true,label);
  const point=selector=>evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  const geometry=()=>evaluate(`(()=>{const r=document.querySelector('${rail}'),rect=e=>{const b=e.getBoundingClientRect();return [b.x,b.y,b.width,b.height]};return{rail:rect(r),scroll:[r.scrollTop,r.scrollLeft],icons:[...r.querySelectorAll('[data-draw-panel]')].map(b=>[b.dataset.drawPanel,...rect(b)]),canvas:rect(document.querySelector('${root} .draw-stage'))}})()`);
  try {
    await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");await submitNewDrawDialog(evaluate,{name:'Workspace files'});
    await menu('Essentials');await until(`(async()=>(${active}.state.ui.workspace==='Essentials'))()`,'Essentials applies');
    await wait(100);
    const expected=['color','swatches','stroke','gradient','appearance','transform','align','pathfinder','image-trace'];
    assert.deepEqual((await ui()).panelLayout.rail,expected,'Exactly the requested nine default panels');
    const before=await geometry();
    await evaluate(`window.workspaceRailNodes=[...document.querySelector('${rail}').children]`);
    for(const id of expected){
      const selector=`${rail} [data-draw-panel="${id}"]`,p=await point(selector);
      await mouse('mouseMoved',p);
      const hover=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('${selector}'));return{outline:s.outlineStyle,border:s.borderColor,radius:s.borderRadius,shadow:s.boxShadow,background:s.backgroundColor}})()`);
      assert.deepEqual([hover.outline,hover.border,hover.radius,hover.shadow],['none','rgba(0, 0, 0, 0)','0px','none'],`${id} hover is square, without a border or outline`);
      await click(p);await wait(30);
      assert.deepEqual(await geometry(),before,`${id} selection does not move or resize the rail, icons or canvas`);
      assert.ok(await evaluate(`window.workspaceRailNodes.every((node,i)=>node===document.querySelector('${rail}').children[i])`),'Clicking keeps the same rail nodes');
      assert.deepEqual(await evaluate(`[...document.querySelectorAll('${rail} [aria-pressed=true]')].map(b=>b.dataset.drawPanel)`),[id]);
      assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('${selector}')).backgroundColor`),hover.background,'The pressed state is darker than hover');
    }
    const documentBefore=await evaluate(`(async()=>JSON.stringify(${active}.state.snapshot()))()`);
    const builtins=await evaluate("import('./draw/ui/workspaces.mjs').then(m=>m.BUILTIN_WORKSPACES.map(w=>({name:w.name,rail:w.panelLayout?.rail})))");
    for(const preset of builtins){
      await menu(preset.name);await until(`(async()=>(${active}.state.ui.workspace===${JSON.stringify(preset.name)}))()`,'Preset applies');
      assert.deepEqual((await ui()).panelLayout.rail,preset.rail??expected);
    }
    await handle('workspace-reset');
    await evaluate(`(async()=>{const w=${active},{movePanel}=await import('./draw/panels/layout.mjs');w.state.ui.panelLayout=movePanel(w.state.ui.panelLayout,'appearance',{to:'floating',x:120,y:80});w.state.ui.panelLayout=movePanel(w.state.ui.panelLayout,'stroke',{to:'column',side:'before-rail',columnIndex:0});w.state.ui.panelLayout.columns[0].width=325;w.state.ui.controlBar=false;w.state.ui.workspace='Portable Proof';w.handle('deselect');})()`);
    const portable=await ui();
    await evaluate('window.modcut.getE2EExports()');await menu('Save Current Workspace…');
    let file;
    for(let i=0;i<100&&!file;i++){file=(await evaluate('window.modcut.getE2EExports()')).find(f=>f.format==='modcut-workspace');if(!file)await wait(40);}
    assert.ok(file);assert.equal(file.name,'Portable Proof.modcut-workspace');assert.equal(JSON.parse(file.text).format,'modcut-workspace');
    await handle('workspace-reset');
    await evaluate(`window.modcut.setE2EWorkspaceFile(${JSON.stringify(file.text)})`);await menu('Load Workspace…');
    await until(`(async()=>(${active}.state.ui.workspace==='Portable Proof'))()`,'Portable file loads');
    assert.deepEqual((await ui()).panelLayout,portable.panelLayout);assert.equal((await ui()).controlBar,false);
    assert.ok(await evaluate("import('./draw/ui/workspaces.mjs').then(m=>m.loadWorkspaces().some(w=>w.name==='Portable Proof'))"),'Loaded workspace is also available locally');
    const loaded=await ui();
    await evaluate('window.modcut.setE2EWorkspaceFile(null)');await menu('Load Workspace…');await wait(100);
    assert.deepEqual((await ui()).panelLayout,loaded.panelLayout,'Cancel keeps the layout');
    await evaluate("window.modcut.setE2EWorkspaceFile('{broken')");await menu('Load Workspace…');
    await until("[...document.querySelectorAll('.toast')].some(t=>t.textContent.includes('Invalid workspace file'))",'Invalid-file error is visible');
    assert.ok(await evaluate("[...document.querySelectorAll('.toast')].filter(t=>t.textContent.includes('Invalid workspace file')).every(t=>!t.textContent.includes('loadWorkspaceFile'))"));
    assert.deepEqual((await ui()).panelLayout,loaded.panelLayout,'Invalid files do not replace the layout');
    assert.equal(await evaluate(`(async()=>JSON.stringify(${active}.state.snapshot()))()`),documentBefore,'Workspaces never change artwork');
    await handle('workspace-reset');
    // Clear transient notifications from this deliberately rapid menu exercise before visual QA.
    await evaluate("document.querySelectorAll('.toast').forEach(t=>t.remove())");
    await click(await point(`${rail} [data-draw-panel=stroke]`));
    const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'modcut-workspace-default.png'),Buffer.from(shot.data,'base64'));
    console.log('PASS workspace files: stable square hover/pressed buttons, nine defaults, task presets, native save/load round trip, docking dimensions, cancellation and invalid files');
  } finally {
    await restore();
    await evaluate(`(()=>{for(const [key,value]of Object.entries(${JSON.stringify(stored)})){const k=key==='layout'?'modcut.draw.panel-layout':'modcut.draw.workspaces';if(value===null)localStorage.removeItem(k);else localStorage.setItem(k,value)}})()`);
  }
}
