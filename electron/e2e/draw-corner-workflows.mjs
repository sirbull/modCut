import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inputHelpers,wait} from './cdp.mjs';
import { activeDraw as active,submitNewDrawDialog, enterDraw } from './draw-test-helpers.mjs';
export async function runDrawCornerWorkflows(client){
  const {evaluate}=client,{click,drag,key}=inputHelpers(client);
  const original=await evaluate("({id:document.querySelector('.doc-tab.is-active').dataset.tabId,cut:paper.project.layers[1].exportJSON({asString:true})})");
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Live corners proof'});
  const scratch=await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const tool=id=>evaluate(`(async()=>(${active}.setTool('${id}')))()`);
  const command=id=>evaluate(`(async()=>(${active}.handle('${id}')))()`);
  const screen=p=>evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${p})),b=w.scope.view.element.getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y}})()`);
  const nodes=()=>evaluate(`(async()=>(${active}.state.snapshot().layers[0].children))()`);
  const dirty=()=>evaluate(`(async()=>(${active}.state.dirty))()`);
  const radius=async value=>{await evaluate(`(()=>{const i=document.querySelector('.draw-project[style*=block] [data-draw-field=corner-radius]');i.value=${value};i.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
  await tool('rectangle');await drag(await screen([10,10]),await screen([40,30]));const shape=(await nodes())[0];
  await evaluate(`(async()=>(${active}.state.history.markSaved()))()`);
  await tool('direct-selection');await click(await screen([10,10]));
  assert.equal((await nodes())[0].type,'shape');assert.equal(await dirty(),false,'Selecting a shape anchor does not expand it or dirty the model');
  const a=await screen([10,10]),b=await screen([13,12]);
  await client.command('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',buttons:1,clickCount:1});
  await client.command('Input.dispatchMouseEvent',{type:'mouseMoved',...b,button:'left',buttons:1});
  assert.deepEqual((await nodes())[0],shape,'Drag preview has no model side effects');await key('Escape');
  await client.command('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',buttons:0,clickCount:1});assert.equal(await dirty(),false);
  await drag(a,b);let node=(await nodes())[0];assert.equal(node.type,'path');assert.equal(node.id,shape.id);assert.equal(node.subpaths[0].segments.length,4);
  assert.ok(node.subpaths[0].segments.some(s=>Math.abs(s.p[0]-13)<.02&&Math.abs(s.p[1]-12)<.02));
  await command('undo');assert.deepEqual((await nodes())[0],shape);assert.equal(await dirty(),false,'One undo restores the exact live shape');await command('redo');await command('undo');
  // Select the whole shape, then round all four logical corners in one gesture.
  await click(await screen([25,20]));
  const widget=await evaluate(`(async()=>{const w=${active},c=w.renderer.cornerWidgets()[0];return{x:c.point.x,y:c.point.y,dx:c.corner.bisector[0],dy:c.corner.bisector[1]}})()`);
  assert.ok(widget);const start=await screen([widget.x,widget.y]),end=await screen([widget.x+widget.dx*5,widget.y+widget.dy*5]);
  await drag(start,end);node=(await nodes())[0];assert.equal(node.type,'path');assert.equal(node.subpaths[0].segments.length,8);assert.equal(node.subpaths[0].cornerData.segments.length,4);
  assert.ok(node.subpaths[0].cornerData.radii.every(r=>r>3&&r<4));
  await command('undo');assert.deepEqual((await nodes())[0],shape);assert.equal(await dirty(),false);await command('redo');
  // Radius fields remain editable after saving/reloading model data.
  await click(await screen([25,20]));await radius(2);assert.ok((await nodes())[0].subpaths[0].cornerData.radii.every(r=>Math.abs(r-2)<.001));
  await radius(0);assert.equal((await nodes())[0].subpaths[0].cornerData,undefined);assert.equal((await nodes())[0].subpaths[0].segments.length,4);await command('undo');
  await click(await screen([10,10]));await radius(5);
  const radii=(await nodes())[0].subpaths[0].cornerData.radii;assert.equal(radii.filter(r=>Math.abs(r-5)<.001).length,1,'A selected corner changes independently');
  // Live corners follow anchor edits and retain ordinary resolved geometry for IO.
  await key('ArrowRight');node=(await nodes())[0];assert.ok(node.subpaths[0].cornerData.segments.some(s=>Math.abs(s.p[0]-11)<.02&&Math.abs(s.p[1]-10)<.02));await command('undo');
  const serialized=await evaluate(`(async()=>JSON.stringify(${active}.state.snapshot()))()`);
  assert.equal(await evaluate(`(async()=>{const {createProjectDraw}=await import('./draw/io/project.mjs'),s=createProjectDraw(JSON.parse(${JSON.stringify(serialized)}));return !s.document.readOnly&&JSON.stringify(s.snapshot())===${JSON.stringify(serialized)}})()`),true);
  // Transformed shapes use their parent's coordinate space for direct edits.
  await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs');
    const n=createNode('shape',{id:'affine-shape',shape:'polygon',params:{x:0,y:0,sides:5,radius:10},transform:[1.2,.2,.1,.8,0,0]});w.state.history.execute(insertNode(w.state.document.data.layers[0].id,createNode('group',{id:'affine-parent',transform:[0,1,-1,0,85,35],children:[n]})));})()`);
  const anchor=await evaluate(`(async()=>{const w=${active},n=w.renderer.editingNode('affine-shape'),p=w.renderer.editPointToWorld(n.id,n.subpaths[0].segments[0].p);return[p.x,p.y]})()`);
  await click(await screen(anchor));const transformed=(await nodes()).at(-1).children[0];assert.equal(transformed.type,'shape');
  await drag(await screen(anchor),await screen([anchor[0]+3,anchor[1]+2]));
  const changed=await evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('affine-shape'),p=w.renderer.pointToWorld(n.id,n.subpaths[0].segments[0].p);return{type:n.type,p:[p.x,p.y]}})()`);
  assert.equal(changed.type,'path');assert.ok(Math.abs(changed.p[0]-anchor[0]-3)<.02&&Math.abs(changed.p[1]-anchor[1]-2)<.02);
  await command('undo');assert.deepEqual((await nodes()).at(-1).children[0],transformed);
  // No duplicated tools, panel content or corner radius editor.
  await click(await screen([10,10]));assert.equal(await evaluate("document.querySelectorAll('.draw-project[style*=block] [data-draw-field=corner-radius]').length"),1);
  const preference=await evaluate('window.modcutTheme.preference');for(const theme of ['light','dark']){
    await evaluate(`window.modcutTheme.setPreference('${theme}')`);await wait(100);
    const visible=await evaluate(`(async()=>{const w=${active},n=w.state.document.data.layers[0].children[0],item=w.renderer.items.get(n.id),p=w.scope.view.projectToView(w.renderer.pointToWorld(n.id,[25,10])),c=w.scope.view.element,scale=c.width/w.scope.view.viewSize.width,pixels=c.getContext('2d').getImageData(Math.round(p.x*scale)-1,Math.round(p.y*scale)-1,3,3).data;
      return {visible:item.visible,layers:w.scope.project.layers.map(l=>({name:l.name,count:l.children.length})),dark:[...pixels].some((v,i)=>i%4===0&&pixels[i]+pixels[i+1]+pixels[i+2]<300&&pixels[i+3]>100)};})()`);
    assert.equal(visible.dark,true,JSON.stringify({theme,...visible}));
    const shot=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),`modcut-draw-corners-${theme}.png`),Buffer.from(shot.data,'base64'));
  }
  await evaluate(`window.modcutTheme.setPreference(${JSON.stringify(preference)})`);
  await evaluate(`document.querySelector('[data-close-tab="${scratch}"]').click()`);await wait(80);await evaluate("document.querySelector('[data-x=discard]').click()");await wait(80);
  assert.equal(await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId"),original.id);assert.equal(await evaluate("paper.project.layers[1].exportJSON({asString:true})"),original.cut);
  await evaluate("document.querySelector('#workspaceToggle').click()");
  process.stdout.write('PASS Draw live corners: deferred shape expansion, atomic undo, Escape preview, corner widgets/radius, reversible rounding, transformed parents and Cut isolation\n');
}
