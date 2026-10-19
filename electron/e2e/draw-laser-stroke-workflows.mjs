import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {wait} from './cdp.mjs';
import {activeDraw as active,enterDraw,submitNewDrawDialog,rememberTabs} from './draw-test-helpers.mjs';

/** Compare preview pixels with the alpha silhouette Cut actually rasterizes after Send to Cut. */
export async function runDrawLaserStrokeWorkflows(client,{paintStacks=false,liveEffects=false}={}){
  const {evaluate}=client,restore=await rememberTabs(evaluate);
  const until=async(expr,label)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await wait(50);}assert.fail(label);};
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:80,height:75,name:'Laser stroke output proof'});
  const tab=await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNodes}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs'),{effect}=await import('./draw/doc/effects.mjs'),paintStacks=${paintStacks},liveEffects=${liveEffects};
    const b=w.state.document.data.artboards[0],line=(id,end,strokeScaling=true)=>{
      const look=appearance(null,'#3366CC',2);Object.assign(look.strokes[0],{cap:'round',join:'round',dash:{array:[4,4],offset:2},startArrow:{type:'triangle',scale:1},endArrow:{type:'circle',scale:1}});
      if(liveEffects){
        look.effects=[id==='stroke-plain'?effect('round-corners',{radius:2}):id==='stroke-scaled'?effect('zig-zag',{size:.6,ridges:4}):id==='stroke-world'?effect('offset-path',{distance:1}):effect('transform',{moveX:3,moveY:1,copies:1})];
        if(id==='stroke-world'||id==='stroke-affine'){
          look.fills=appearance('#33AA66',null).fills;
          return createNode('shape',{id,shape:id==='stroke-world'?'rect':'ellipse',params:{x:0,y:-3,width:end,height:6},strokeScaling,appearance:look});
        }
        return createNode('path',{id,strokeScaling,subpaths:[{closed:false,segments:[[0,0],[end/2,-4],[end,0]].map(p=>({p,in:[0,0],out:[0,0]}))}],appearance:look});
      }
      if(paintStacks){
        look.strokes[0].widthProfile=[{t:0,left:0,right:0},{t:.5,left:2,right:1},{t:1,left:0,right:0}];
        if(id!=='stroke-plain')look.strokes=[{...look.strokes[0],hidden:true,width:9},look.strokes[0],{...look.strokes[0],width:8}];
        if(id==='stroke-world'||id==='stroke-affine'){
          const fill=appearance('#33AA66',null).fills[0];look.fills=[{...fill,hidden:true},fill,{...appearance('#FFCC00',null).fills[0]}];
          return createNode('shape',{id,shape:id==='stroke-world'?'rect':'ellipse',params:{x:0,y:-3,width:end,height:6},strokeScaling,appearance:look});
        }
      }
      return createNode('path',{id,strokeScaling,subpaths:[{closed:false,segments:[[0,0],[end,0]].map(p=>({p,in:[0,0],out:[0,0]}))}],appearance:look});
    };
    w.state.history.execute(insertNodes([
      [w.layerId(),createNode('group',{transform:[1,0,0,1,b.x+15,b.y+15],children:[line('stroke-plain',45)]})],
      [w.layerId(),createNode('group',{transform:[1.5,0,0,1.5,b.x+15,b.y+30],children:[line('stroke-scaled',30)]})],
      [w.layerId(),createNode('group',{transform:[1.5,0,0,1.5,b.x+15,b.y+45],children:[line('stroke-world',30,false)]})],
      [w.layerId(),createNode('group',{transform:[1.5,.2,.4,.8,b.x+15,b.y+60],children:[line('stroke-affine',30)]})],
    ]));w.select([]);w.fit();window.__strokeSource={document:w.state.document.serialize(),history:JSON.stringify(w.state.history.entries)};
  })()`);
  await evaluate(`(async()=>${active}.handle('laser-processes'))()`);
  await until("!!document.querySelector('.draw-laser-processes-dialog')",'stroke process setup');
  await evaluate("(()=>{const f=document.querySelector('.draw-laser-processes-dialog form');f.elements.process0.value='Engrave';f.requestSubmit();})()");
  if(!await evaluate(`(async()=>${active}.renderer.laserPreview)()`)){
    await evaluate(`(async()=>${active}.handle('laser-preview'))()`);
    if(await evaluate("!!document.querySelector('.draw-cut-preview-dialog')"))await evaluate("document.querySelector('.draw-cut-preview-dialog form').requestSubmit()");
  }
  await until(`(async()=>${active}.renderer.laserPreview)()`,'stroke preview');
  if(liveEffects){
    for(const op of ['Cut','Score','Engrave']){
      await evaluate(`(async()=>${active}.handle('laser-processes'))()`);
      await until("!!document.querySelector('.draw-laser-processes-dialog')",'effect operation setup');
      await evaluate(`(()=>{const f=document.querySelector('.draw-laser-processes-dialog form');for(const s of f.querySelectorAll('select'))s.value=${JSON.stringify(op)};f.requestSubmit();})()`);
      assert.equal(await evaluate(`(async()=>${active}.renderer.laserIntent('stroke-plain').operation)()`),op);
      if(op!=='Engrave'){
        const red=await evaluate(`(async()=>{const w=${active};w.withScope(()=>{w.scope.view._needsUpdate=true;w.scope.view.update();});const c=w.scope.view.element,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>120&&d[i+1]<90&&d[i+2]<90)n++;return n;})()`);
        assert.ok(red>100,op+' displays real red effect geometry');
      }
    }
  }
  const captured=await evaluate(`(async()=>{const w=${active},ids=['stroke-plain','stroke-scaled','stroke-world','stroke-affine'],b=w.state.document.data.artboards[0];
    w.withScope(()=>{w.scope.view._needsUpdate=true;w.scope.view.update();});
    const c=w.scope.view.element,ctx=c.getContext('2d'),ratio=w.scope.view.pixelRatio,points=[];
    for(let y=6.125;y<70;y+=.25)for(let x=5.125;x<73;x+=.25){
      const p=w.scope.view.projectToView(new w.scope.Point(b.x+x,b.y+y)),rgb=ctx.getImageData(Math.round(p.x*ratio),Math.round(p.y*ratio),1,1).data;
      points.push([x,y,rgb[0],rgb[1],rgb[2]]);
    }
    window.__strokeProof={points,density:w.scope.view.zoom*ratio,document:w.state.document.serialize(),history:JSON.stringify(w.state.history.entries),svg:w.cutSvg(b.id).svg};
    const liveEffects=${liveEffects},effective=id=>w.renderer.effectiveSubpaths(id),offset=liveEffects?effective('stroke-world').flatMap(p=>p.segments.map(s=>s.p[0])):[];
    const effectGeometry=liveEffects?{round:effective('stroke-plain').some(p=>p.segments.some(s=>[...s.in,...s.out].some(v=>Math.abs(v)>1e-5))),zig:effective('stroke-scaled').reduce((n,p)=>n+p.segments.length,0),offsetWidth:Math.max(...offset)-Math.min(...offset),copies:effective('stroke-affine').length}:null;
    return {effectGeometry,neutral:w.state.document.serialize()===window.__strokeSource.document&&JSON.stringify(w.state.history.entries)===window.__strokeSource.history,statuses:ids.map(id=>w.renderer.laserIntent(id).status),source:ids.map(id=>{const i=w.renderer.items.get(id);return {dash:i.dashArray,color:i.strokeColor?.toCSS(true)??null,fill:i.fillColor?.toCSS(true)??null,cap:i.strokeCap,width:i.strokeWidth};}),svg:window.__strokeProof.svg};
  })()`);
  assert.deepEqual(captured.statuses,['resolved','resolved','resolved','resolved']);
  assert.equal(captured.neutral,true,'preview and process setup preserve Draw document/history');
  if(liveEffects){assert.equal(captured.effectGeometry.round,true);assert.ok(captured.effectGeometry.zig>3);assert.ok(captured.effectGeometry.offsetWidth>31.9);assert.equal(captured.effectGeometry.copies,2);}
  if(paintStacks)assert.ok(captured.source.every(s=>s.color===null&&s.fill===null&&s.width===0),'stack-owned base paths have no normal paint');
  else for(const source of captured.source){assert.ok(source.dash.length);assert.equal(source.color,'#3366cc');assert.equal(source.cap,'round');}
  assert.doesNotMatch(captured.svg,/stroke-dash|marker-|stroke-linecap/,'canonical output uses solid butt strokes');
  const screenshot=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(liveEffects?'/tmp/modcut-laser-effects.png':paintStacks?'/tmp/modcut-laser-paints.png':'/tmp/modcut-laser-strokes.png',Buffer.from(screenshot.data,'base64'));
  await evaluate("document.querySelector('#sendToCut').click()");
  await until("document.body.dataset.workspace==='cut' || !!document.querySelector('.draw-send-dialog form')",'Cut or transfer options');
  if(await evaluate("!!document.querySelector('.draw-send-dialog form')")){
    assert.equal(await evaluate("document.querySelector('.draw-send-dialog form').elements.strokes.value"),'centerline');
    await evaluate("document.querySelector('.draw-send-dialog form').requestSubmit()");
  }
  await until("document.body.dataset.workspace==='cut' && paper.project.layers[1].children.length===4",'actual stroke import into Cut');
  const comparison=await evaluate(`(()=>{
    const items=paper.project.layers[1].children,styles=items.map(i=>({width:i.strokeWidth,dash:i.dashArray,cap:i.strokeCap,op:i.data?.op}));
    const group=new paper.Group({insert:false,children:items.map(i=>i.clone({insert:false}))});
    const raster=group.rasterize({resolution:window.__strokeProof.density*72,insert:false});
    try{
      const image=raster.canvas.getContext('2d').getImageData(0,0,raster.width,raster.height),box=raster.bounds;
      const alpha=(px,py)=>px<0||py<0||px>=image.width||py>=image.height?0:image.data[(py*image.width+px)*4+3];
      let compared=0,mismatches=0,black=0;const examples=[];
      for(const [x,y,r,g,b] of window.__strokeProof.points){
        const px=Math.floor((x-box.x)/box.width*image.width),py=Math.floor((y-box.y)/box.height*image.height);
        const a=alpha(px,py);
        if(a>10&&a<245)continue;const dark=a>=245;
        // Raster bounds and the canvas grid can differ by a subpixel. Compare
        // points whose 3x3 raster neighbourhood is uniformly inside or outside.
        if([-1,0,1].some(dy=>[-1,0,1].some(dx=>dark?alpha(px+dx,py+dy)<245:alpha(px+dx,py+dy)>10)))continue;
        if(dark)black++;
        // Ignore antialiased preview boundary pixels, compare clear interior/exterior pixels.
        if(Math.max(r,g,b)>20&&Math.min(r,g,b)<245)continue;
        compared++;if(dark?Math.max(r,g,b)>20:Math.min(r,g,b)<245){mismatches++;if(examples.length<5)examples.push([x,y,a,r,g,b]);}
      }
      return {styles,compared,mismatches,black,examples};
    }finally{raster.remove();group.remove();}
  })()`);
  assert.deepEqual(comparison.styles.map(s=>s.width),[2,3,2,2.1166]);
  assert.ok(comparison.styles.every(s=>s.dash.length===0&&s.cap==='butt'),JSON.stringify(comparison));
  assert.ok(comparison.compared>60000&&comparison.black>4000,JSON.stringify(comparison));
  assert.equal(comparison.mismatches,0,JSON.stringify(comparison));
  await evaluate("document.querySelector('#workspaceToggle').click()");
  await until("document.body.dataset.workspace==='draw'",'back to Draw');
  const sent=await evaluate(`(async()=>{const w=${active},before=JSON.parse(window.__strokeProof.document),after=JSON.parse(w.state.document.serialize()),history=JSON.parse(window.__strokeProof.history);delete before.cutLinks;delete after.cutLinks;
    return {artwork:JSON.stringify(before)===JSON.stringify(after),link:w.state.document.data.cutLinks.length,added:w.state.history.entries.length-history.length,label:w.state.history.entries.at(-1).label,ops:['stroke-plain','stroke-scaled','stroke-world','stroke-affine'].map(id=>w.renderer.laserIntent(id).operation)};})()`);
  assert.equal(sent.artwork,true);assert.equal(sent.link,1);assert.equal(sent.added,1);assert.equal(sent.label,'Send to Cut');
  assert.deepEqual(sent.ops,['Engrave','Engrave','Engrave','Engrave']);
  assert.equal(await evaluate(`(async()=>${active}.cutSvg(${active}.state.document.data.artboards[0].id).svg===window.__strokeProof.svg)()`),true);
  if(paintStacks){
    await evaluate(`(async()=>{const w=${active},{updateDocument}=await import('./draw/doc/commands.mjs');w.state.history.execute(updateDocument({cutLinks:w.state.document.data.cutLinks.map(l=>({...l,options:{...l.options,strokes:'outline'}}))}));})()`);
    assert.deepEqual(await evaluate(`(async()=>{const w=${active};return ['stroke-plain','stroke-scaled','stroke-world','stroke-affine'].map(id=>w.renderer.laserIntent(id).reason);})()`),Array(4).fill('outline-transfer'));
    await evaluate("document.querySelector('.draw-laser-legend button').click()");
    assert.match(await evaluate("document.querySelector('.draw-laser-issues-list').textContent"),/An earlier transfer used Outline Stroke/);
    await evaluate("document.querySelector('.draw-laser-issues-dialog form').requestSubmit()");
    await evaluate(`(async()=>${active}.handle('undo'))()`);
  }
  await evaluate(`(async()=>${active}.handle('laser-preview'))()`);
  assert.deepEqual(await evaluate(`(async()=>{const w=${active};return ['stroke-plain','stroke-scaled','stroke-world','stroke-affine'].map(id=>w.renderer.items.get(id).dashArray);})()`),captured.source.map(s=>s.dash));
  assert.deepEqual(await evaluate(`(async()=>{const w=${active};return ['stroke-plain','stroke-scaled','stroke-world','stroke-affine'].map(id=>{const i=w.renderer.items.get(id);return {dash:i.dashArray,color:i.strokeColor?.toCSS(true)??null,fill:i.fillColor?.toCSS(true)??null,cap:i.strokeCap,width:i.strokeWidth};});})()`),captured.source);
  // The source styles (including screen-space world-mm dashes) are checked above;
  // here normal mode must visibly return rather than changing the document.
  assert.equal(await evaluate(`(async()=>${active}.renderer.laserPreview)()`),false);
  if(paintStacks){
    const normal=await evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0];w.withScope(()=>{w.scope.view._needsUpdate=true;w.scope.view.update();});const p=w.scope.view.projectToView(new w.scope.Point(b.x+37.5,b.y+15.5)),r=w.scope.view.pixelRatio;return [...w.scope.view.element.getContext('2d').getImageData(Math.round(p.x*r),Math.round(p.y*r),1,1).data].slice(0,3);})()`);
    assert.ok(normal[2]>150&&normal[0]<100&&normal[1]>50,JSON.stringify(normal));
  }
  assert.equal(await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId"),tab);
  delete comparison.styles;
  await evaluate('delete window.__strokeProof;delete window.__strokeSource');await restore();
  process.stdout.write('PASS Laser Preview '+(liveEffects?'vector effects: Round Corners, Zig Zag, Offset Path and Transform':paintStacks?'paint stacks: profiles, hidden entries, multiple fills/strokes on paths and shapes':'strokes: dashed/arrow strokes')+', affine parents and world-mm widths match actual Cut raster silhouettes; preview is document/history neutral, Send adds one link, artwork/SVG preserved '+JSON.stringify(comparison)+'\n');
}
