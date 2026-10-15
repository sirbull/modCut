import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { wait, inputHelpers } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog } from './draw-test-helpers.mjs';

export async function runDrawPhaseOneWorkflows(client) {
  const {evaluate}=client,{drag,click,key}=inputHelpers(client);
  const original=await evaluate("({id:document.querySelector('.doc-tab.is-active').dataset.tabId,design:paper.project.layers[1].exportJSON({asString:true})})");
  const shortcut=async (key,code,extras={})=>evaluate(`(()=>{
    window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},bubbles:true,cancelable:true,...${JSON.stringify(extras)}}));
    window.dispatchEvent(new KeyboardEvent('keyup',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},bubbles:true,cancelable:true}));
  })()`);
  const screen=([x,y])=>evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${x},${y})),b=w.scope.view.element.getBoundingClientRect();return{x:b.x+p.x,y:b.y+p.y}})()`);
  const data=()=>evaluate(`(async()=>(${active}.state.snapshot()))()`);
  const bounds=id=>evaluate(`(async()=>{const b=${active}.renderer.bounds(${JSON.stringify(id)});return{x:b.x,y:b.y,width:b.width,height:b.height}})()`);
  // Properties and Layers are always docked; other panels open as rail flyouts.
  const panel=id=>['properties','layers'].includes(id)?null:evaluate(`(()=>{const b=document.querySelector('.draw-project[style*=block] [data-draw-panel=${id}]');if(b.getAttribute('aria-pressed')!=='true')b.click()})()`);
  const undo=()=>shortcut('z','KeyZ',{ctrlKey:process.platform!=='darwin',metaKey:process.platform==='darwin'});
  await evaluate("document.querySelector('#workspaceToggle').click();document.querySelector('#newDoc').click()");
  assert.equal(await evaluate("document.querySelector('.draw-document-dialog [name=preset]').value"),'bed','New starts from the current machine bed');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.draw-document-dialog [role=tab]')].map(t=>t.textContent)"),['Recent','Templates','Saved']);
  await evaluate("(()=>{const t=document.querySelector('.draw-document-dialog [data-tab=templates]');t.click();document.querySelector('.draw-document-dialog [data-category=print]').click();document.querySelector('.draw-document-dialog [data-preset=a4]').click()})()");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.draw-document-dialog input[name=width],.draw-document-dialog input[name=height]')].map(i=>+i.value)"),[210,297]);
  await evaluate("document.querySelector('.draw-document-dialog [data-orientation=landscape]').click()");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.draw-document-dialog input[name=width],.draw-document-dialog input[name=height]')].map(i=>+i.value)"),[297,210],'Orientation swaps width and height');
  await evaluate("(()=>{const u=document.querySelector('.draw-document-dialog [name=units]');u.value='cm';u.dispatchEvent(new Event('change',{bubbles:true}))})()");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.draw-document-dialog input[name=width],.draw-document-dialog input[name=height]')].map(i=>+i.value)"),[29.7,21],'Units convert the shown size');
  await key('Escape');
  assert.equal(await evaluate("!!document.querySelector('.draw-document-dialog')"),false,'Escape cancels New without creating a tab');
  assert.equal(await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId"),original.id);
  await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',name:'Drawing tools proof',width:120,height:80,count:3,spacing:20});
  const scratch=await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId"),initial=await data();
  assert.equal(initial.artboards.length,3);assert.equal(initial.artboards[0].width,120);assert.equal(initial.name,'Drawing tools proof');
  assert.equal(await evaluate("!!document.querySelector('.doc-tab.is-active .doc-tab__dirty')"),false,'Creating a configured blank document starts clean');
  assert.deepEqual(await evaluate(`(()=>{const shown=[...document.querySelectorAll('#drawStatus .draw-view-controls')].filter(c=>!c.hidden);
    return{shown:shown.length,besideFile:document.querySelector('#file').nextElementSibling.id,stage:document.querySelectorAll('.draw-stage .draw-view-controls').length,board:shown[0]?.querySelector('.draw-board-select').options.length}})()`),
    {shown:1,besideFile:'drawStatus',stage:0,board:3},'View controls live in the bottom status bar beside the file name');
  assert.equal(await evaluate("(async()=>(await window.modcut.getE2EWorkspaceMenu()).file.some(item=>item.label==='Save Document Properties as Template…'))()"),true);
  await evaluate("localStorage.removeItem('modcut_draw_document_templates')");
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('File','Save Document Properties as Template…')"),true);
  await wait(50);
  await evaluate("(()=>{const f=document.querySelector('.draw-template-dialog form');f.elements.name.value='E2E three boards';f.requestSubmit()})()");
  await wait(50);
  assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('modcut_draw_document_templates')).map(t=>[t.name,t.width,t.height,t.count,t.spacing])"),[['E2E three boards',120,80,3,20]]);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('modcut_draw_recent_setups'))[0].width"),120,'Created setups are remembered as Recent');
  await evaluate("document.querySelector('#newDoc').click()");
  assert.equal(await evaluate("document.querySelector('.draw-document-dialog [data-tab=recent]').getAttribute('aria-selected')"),'true','New opens on Recent once there is history');
  await evaluate("(()=>{document.querySelector('.draw-document-dialog [data-tab=saved]').click();document.querySelector('.draw-document-dialog [data-preset^=template-]').click()})()");
  assert.deepEqual(await evaluate("(()=>{const f=document.querySelector('.draw-document-dialog form');return[+f.elements.width.value,+f.elements.height.value,+f.elements.count.value]})()"),[120,80,3],'A saved template restores its properties');
  await evaluate("document.querySelector('.draw-document-dialog .draw-preset-card__remove').click()");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('modcut_draw_document_templates')).length"),0);
  await key('Escape');

  const unique=await evaluate("(()=>{const root=document.querySelector('.draw-project[style*=block]'),ids=[...root.querySelectorAll('[data-draw-tool]')].map(b=>b.dataset.drawTool);return ids.length===new Set(ids).size && root.querySelectorAll('[data-draw-dock=properties]').length===1 && root.querySelectorAll('[data-draw-dock=layers]').length===1 && root.querySelectorAll('.draw-flyout').length===1})()");
  assert.equal(unique,true,'Tools and panel content have one mounted location');
  await shortcut('F7','F7');
  assert.deepEqual(await evaluate("(()=>{const r=document.querySelector('.draw-project[style*=block]');return{expanded:r.querySelector('[data-draw-dock-toggle=layers]').getAttribute('aria-expanded'),trees:r.querySelectorAll('[role=tree]').length}})()"),{expanded:'true',trees:1});
  await panel('properties');
  assert.equal(await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-dock=properties]').querySelectorAll('[role=tree],[data-draw-field=width],[data-draw-field=stroke-weight],[data-draw-field=color-hex],[data-draw-align]').length"),0,'Properties does not repeat Layers/Transform/Stroke');

  await shortcut('m','KeyM');await click(await screen([10,10]));
  assert.equal(await evaluate("!!document.querySelector('.draw-shape-dialog')"),true,'Click opens exact dimensions');
  await evaluate("(()=>{const f=document.querySelector('.draw-shape-dialog form');f.elements.width.value=20;f.elements.height.value=10;f.requestSubmit()})()");await wait(50);
  const node=(await data()).layers[0].children[0];assert.ok(node,await evaluate("JSON.stringify({toast:document.querySelector('#toasts').textContent,form:[...document.querySelectorAll('.modal input')].map(i=>({name:i.name,value:i.value,valid:i.checkValidity(),message:i.validationMessage})),html:document.querySelector('.modal')?.outerHTML})"));assert.ok(Math.abs(node.params.width-20)<1e-8);assert.ok(Math.abs(node.params.height-10)<1e-8);
  await drag(await screen([60,20]),await screen([70,30]),9);
  let second=(await data()).layers[0].children[1];assert.ok(Math.abs(second.params.width-20)<.02);assert.ok(Math.abs(second.params.x-50)<.02);
  await evaluate("document.querySelector('.draw-project[style*=block] [aria-label=\"Shape tools\"]').click();document.querySelector('.draw-tool-flyout [data-draw-tool=rounded-rectangle]').click()");
  await click(await screen([90,10]));
  await evaluate("(()=>{const f=document.querySelector('.draw-shape-dialog form');f.elements.width.value=20;f.elements.height.value=10;f.elements.cornerRadius.value=3;f.requestSubmit()})()");await wait(30);
  assert.equal((await data()).layers[0].children.at(-1).params.cornerRadius,3);
  await shortcut('m','KeyM');
  const begin=await screen([30,60]),middle=await screen([40,70]),finish=await screen([45,75]);
  await client.command('Input.dispatchMouseEvent',{type:'mousePressed',...begin,button:'left',buttons:1,clickCount:1});
  await client.command('Input.dispatchMouseEvent',{type:'mouseMoved',...middle,button:'left',buttons:1});
  await client.command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space'});
  await client.command('Input.dispatchMouseEvent',{type:'mouseMoved',...finish,button:'left',buttons:1});
  await client.command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space'});
  await client.command('Input.dispatchMouseEvent',{type:'mouseReleased',...finish,button:'left',buttons:0,clickCount:1});
  const relocated=(await data()).layers[0].children.at(-1).params;
  assert.ok(Math.abs(relocated.x-35)<.05 && Math.abs(relocated.y-65)<.05 && Math.abs(relocated.width-10)<.05,'Space moves a shape during its drag without changing size');
  await shortcut('v','KeyV');await click(await screen([20,15]));
  const before=await bounds(node.id);
  await drag(await screen([30,20]),await screen([50,30]),9);
  let resized=await bounds(node.id);
  assert.ok(Math.abs(resized.width-60)<.1);assert.ok(Math.abs(resized.height-30)<.1);
  assert.ok(Math.abs(resized.x+resized.width/2-(before.x+before.width/2))<.1,'Shift+Alt resizing keeps the centre fixed');
  await undo();await key('ArrowRight');await key('ArrowDown',8);
  let nudged=await bounds(node.id);assert.ok(Math.abs(nudged.x-before.x-1)<.01);assert.ok(Math.abs(nudged.y-before.y-10)<.01);
  await undo();await undo();

  // Live guide labels are overlays; one drag commits one model change.
  const start=await screen([20,15]),end=await screen([59.5,20]);
  await client.command('Input.dispatchMouseEvent',{type:'mousePressed',x:start.x,y:start.y,button:'left',buttons:1,clickCount:1});
  await client.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:end.x,y:end.y,button:'left',buttons:1});
  assert.equal(await evaluate(`(async()=>(${active}.scope.project.getItems({class:'PointText'}).some(t=>['edge','center','anchor'].includes(t.content))))()`),true,'Smart guides show a snap label during the drag');
  await client.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:end.x,y:end.y,button:'left',buttons:0,clickCount:1});
  assert.ok(Math.abs((await bounds(node.id)).x-50)<.1,'Move snaps within four screen pixels');await undo();

  // Exercise every shape family through its available shortcut or grouped menu.
  for(const entry of [
    {tool:'ellipse',point:[10,50],values:{width:20,height:10}},
    {tool:'polygon',point:[80,60],values:{radius:12,points:7}},
    {tool:'star',point:[20,40],values:{radius:10,points:8,ratio:.3}},
    {tool:'line',point:[50,50],values:{lineLength:25,angle:45}},
  ]) {
    if(entry.tool==='ellipse')await shortcut('l','KeyL');
    else if(entry.tool==='line')await shortcut('\\','IntlBackslash');
    else await evaluate(`document.querySelector('.draw-project[style*=block] [aria-label="Shape tools"]').click();document.querySelector('.draw-tool-flyout [data-draw-tool=${entry.tool}]').click()`);
    await click(await screen(entry.point));
    await evaluate(`(()=>{const f=document.querySelector('.draw-shape-dialog form');for(const [key,value] of Object.entries(${JSON.stringify(entry.values)}))f.elements[key].value=value;f.requestSubmit()})()`);await wait(30);
    const created=(await data()).layers[0].children.at(-1);assert.equal(created.shape,entry.tool);
    if(entry.tool==='polygon')assert.equal(created.params.sides,7);
    if(entry.tool==='star')assert.equal(created.params.innerRadius,3);
    if(entry.tool==='line')assert.ok(Math.abs(created.params.x2-created.params.x1-(created.params.y2-created.params.y1))<.001);
  }

  await panel('artboards');
  assert.equal(await evaluate("document.querySelector('.draw-project[style*=block]').querySelectorAll('[data-draw-field=artboard-width]').length"),1,'One editor for the active artboard');
  await shortcut('O','KeyO',{shiftKey:true});
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`),'artboard');
  await drag(await screen([90,50]),await screen([110,70]));
  let moved=await data();assert.ok(Math.abs(moved.artboards[0].x-20)<.05);assert.ok(Math.abs((await bounds(node.id)).x-before.x-20)<.05);
  const count=moved.layers[0].children.length;
  await drag(await screen([110,70]),await screen([130,90]),1);
  moved=await data();assert.equal(moved.artboards.length,4);assert.equal(moved.layers[0].children.length,count*2,'Alt-drag copies board artwork with new IDs');
  const all=moved.layers[0].children.flatMap(n=>[n.id,...(n.children||[]).map(c=>c.id)]);assert.equal(new Set(all).size,all.length);
  await evaluate("(()=>{const i=document.querySelector('.draw-project[style*=block] [data-draw-field=artboard-name]');i.value='Copied board';i.dispatchEvent(new Event('change',{bubbles:true}))})()");
  assert.equal((await data()).artboards.at(-1).name,'Copied board');await undo();
  await evaluate("[...document.querySelectorAll('.draw-project[style*=block] .draw-flyout button')].find(b=>b.textContent==='Rearrange…').click()");
  await evaluate("(()=>{const f=document.querySelector('.modal form');f.elements.layout.value='column';f.elements.spacing.value=15;f.requestSubmit()})()");await wait(50);
  assert.equal((await data()).artboards[1].y,95);await undo();
  // The Artboards flyout overlays the canvas edge; close it before drawing there.
  await evaluate("document.querySelector('.draw-project[style*=block] .draw-flyout__close').click()");

  await evaluate(`(async()=>{const w=${active};w.scope.view.zoom=.8;w.scope.view.center=[250,150];w.renderer.updateView()})()`);
  const newStart=await screen([450,280]),newEnd=await screen([490,320]);
  await drag(newStart,newEnd);assert.equal((await data()).artboards.length,5,JSON.stringify({newStart,newEnd,details:await evaluate(`(async()=>{const w=${active},b=w.scope.view.element.getBoundingClientRect();return{tool:w.state.ui.tool,hit:document.elementFromPoint(${newStart.x},${newStart.y})?.outerHTML,canvas:[b.x,b.y,b.width,b.height],toast:document.querySelector('#toasts').textContent}})()`)}));
  await key('Delete');assert.equal((await data()).artboards.length,4);
  await evaluate(`(async()=>(${active}.handle('fit-all')))()`);

  // The grouped button changes variant, and the flyout excludes that variant.
  await evaluate("document.querySelector('.draw-project[style*=block] [aria-label=\"Shape tools\"]').click();document.querySelector('.draw-tool-flyout [data-draw-tool=ellipse]').click()");
  assert.equal(await evaluate("document.querySelector('.draw-project[style*=block] .draw-tool-grid').querySelectorAll('[data-draw-tool=ellipse]').length"),1);
  await evaluate("document.querySelector('.draw-project[style*=block] [aria-label=\"Shape tools\"]').click()");
  assert.equal(await evaluate("document.querySelector('.draw-tool-flyout').querySelectorAll('[data-draw-tool=ellipse]').length"),0);
  await key('Escape');

  await shortcut('m','KeyM');
  const unchanged=JSON.stringify(await data()),centre=await evaluate(`(async()=>({x:${active}.scope.view.center.x,y:${active}.scope.view.center.y}))()`);
  const c=await evaluate("(()=>{const b=document.querySelector('.draw-project[style*=block] .draw-canvas').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()");
  await client.command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space'});
  assert.equal(await evaluate("document.querySelector('.draw-project[style*=block] .draw-canvas').dataset.tool"),'hand');
  await drag(c,{x:c.x+40,y:c.y});await client.command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space'});
  assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`),'rectangle');
  assert.equal(await evaluate("document.querySelector('.draw-project[style*=block] .draw-canvas').dataset.tool"),'rectangle');
  assert.equal(JSON.stringify(await data()),unchanged);assert.ok(await evaluate(`(async()=>(${active}.scope.view.center.x<${centre.x}))()`));
  const isMac=process.platform==='darwin',mod=isMac?4:2;
  const zoomBefore=await evaluate(`(async()=>(${active}.scope.view.zoom))()`);
  await client.command('Input.dispatchKeyEvent',{type:'keyDown',key:isMac?'Meta':'Control',code:isMac?'MetaLeft':'ControlLeft',modifiers:mod});
  await client.command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',modifiers:mod});
  assert.equal(await evaluate("document.querySelector('.draw-project[style*=block] .draw-canvas').dataset.tool"),'zoom');
  await click(c,mod);
  await client.command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',modifiers:mod});
  await client.command('Input.dispatchKeyEvent',{type:'keyUp',key:isMac?'Meta':'Control',code:isMac?'MetaLeft':'ControlLeft',modifiers:0});
  assert.ok(await evaluate(`(async()=>(${active}.scope.view.zoom>${zoomBefore}))()`));
  assert.equal(await evaluate("document.querySelector('.draw-project[style*=block] .draw-canvas').dataset.tool"),'rectangle');

  await panel('artboards');await evaluate(`(async()=>(${active}.handle('fit-all')))()`);
  const preference=await evaluate('window.modcutTheme.preference');
  const themeModel=JSON.stringify(await data());
  for(const theme of ['light','dark']) {
    await evaluate(`window.modcutTheme.setPreference('${theme}')`);await wait(80);
    assert.equal(JSON.stringify(await data()),themeModel,'Theme changes leave Draw geometry intact');
    assert.ok(await evaluate(`(async()=>{
      const w=${active},id=w.state.document.data.layers[0].children.at(-1).id,item=w.renderer.items.get(id),mid=item.getPointAt(item.length/2),p=w.scope.view.projectToView(w.renderer.pointToWorld(id,[mid.x,mid.y])),c=w.scope.view.element,scale=c.width/w.scope.view.viewSize.width;
      const pixels=c.getContext('2d').getImageData(Math.round(p.x*scale)-1,Math.round(p.y*scale)-1,3,3).data;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>100 && pixels[i]+pixels[i+1]+pixels[i+2]<300)return true;return false;
    })()`),'Artwork stays visible after a theme change');
    const {data:png}=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),`modcut-draw-phase1-${theme}.png`),Buffer.from(png,'base64'));
  }
  await evaluate(`window.modcutTheme.setPreference(${JSON.stringify(preference)})`);
  await evaluate(`document.querySelector('[data-close-tab="${scratch}"]').click()`);await wait(80);
  await evaluate("document.querySelector('[data-x=discard]').click()");await wait(80);
  assert.equal(await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId"),original.id);
  assert.equal(await evaluate("paper.project.layers[1].exportJSON({asString:true})"),original.design);
  await evaluate("document.querySelector('#workspaceToggle').click()");
  process.stdout.write('PASS Draw phase 1: unique toolbar/panels, New presets, exact shapes, modifier resize, guides/nudge, artboard move/copy/rearrange and temporary Hand\n');
}
