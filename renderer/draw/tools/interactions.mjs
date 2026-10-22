import { shapeFromDrag, SHAPE_TOOLS } from './shapes.mjs';
import { groupSelectionTarget } from '../doc/tool-rules.mjs';
import { CURSORS, RESIZE_CURSORS } from './cursors.mjs';
import { resizeMatrix, rotationMatrix, transformedBox, snapTranslation } from './selection.mjs';
import { activeArtboard } from '../doc/artboards.mjs';
import { TRANSFORM_TOOLS,dragTransform,operationMatrix } from '../geom/transforms.mjs';
import { createEyedropperPreview } from './eyedropper-preview.mjs';
import { addStop, moveStop, removeStop, vectorGradient } from '../doc/gradient.mjs';

// Gradient tool over the annotator: move a handle or stop, or add a stop on the line.
const gradientCursor=hit=>!hit ? CURSORS.gradient : CURSORS[hit.part==='line'?'gradient-add':'gradient-move'];

export function createInteractions(canvas, state, api) {
  const {scope,renderer,withScope,run}=api, controller=new AbortController(), events={signal:controller.signal};
  let gesture=null,preview=null;
  // Edits a gesture makes while it runs (live gradient drags) must not cancel the gesture itself.
  let ownEdits=0;
  const live=fn=>{ownEdits++;try{return run(fn);}finally{ownEdits--;}};
  let nameEditor=null;
  const point=event=>{const b=canvas.getBoundingClientRect();return scope.view.viewToProject(new scope.Point(event.clientX-b.left,event.clientY-b.top));};
  const eyedropperPreview=createEyedropperPreview(canvas,{active:()=>api.tool()==='eyedropper',current:()=>state.ui[state.ui.paintFocus==='stroke'?'stroke':'fill']});
  // A screen movement in project units, turned back through Rotate View.
  const screenDelta=(dx,dy)=>new scope.Point(dx,dy).rotate(-scope.view.rotation).divide(scope.view.zoom);
  function clearPreview() {preview?.remove();preview=null;renderer.clearTransformPreview();state.ui.transformPreviewBox=null;}
  function cancel() {const editor=nameEditor;nameEditor=null;editor?.remove();const previous=gesture;gesture=null;if(previous)canvas.style.cursor=api.cursor();if(previous?.mode==='free-transform')api.freeDistortPreview(null);if(previous?.mode==='gradient-edit')api.gradientAnnotation(null);withScope(()=>{clearPreview();if(TRANSFORM_TOOLS.includes(previous?.tool))api.transforms.setOrigin(previous.originBefore);renderer.updateView();});api.status();}
  function applyLasso({points,modifiers}) {
    api.lasso(points,modifiers.alt&&modifiers.mod?{objects:true,add:modifiers.shift}:{add:modifiers.shift,subtract:modifiers.alt});
  }
  function finishPolygonalLasso() {
    if(gesture?.mode!=='polygonal-lasso'||gesture.points.length<3)return;
    const polygon=gesture;cancel();run(()=>{if(!state.document.readOnly)applyLasso(polygon);});
  }
  function polygonalPreview() {
    withScope(()=>{
      clearPreview();const {points,end}=gesture,z=scope.view.zoom,first=points[0];
      const closing=points.length>=3&&Math.hypot(end.x-first[0],end.y-first[1])<=6/z;
      preview=new scope.Group({children:[
        new scope.Path({segments:[...points,closing?first:[end.x,end.y]],closed:true,strokeColor:'#1473E6',dashArray:[4/z,3/z],strokeWidth:1/z}),
        new scope.Path.Circle({center:first,radius:(closing?5:3)/z,fillColor:'#FFFFFF',strokeColor:'#1473E6',strokeWidth:1/z}),
      ]});scope.view.update();
    });
  }
  function artboardEdge(p) {
    const tolerance=6/scope.view.zoom;
    const active=activeArtboard(state), boards=[active,...state.document.data.artboards.filter(a=>a.id!==active.id).toReversed()];
    for(const board of boards) {
      const {x,y,width:w,height:h}=board;
      if(p.x<x-tolerance||p.x>x+w+tolerance||p.y<y-tolerance||p.y>y+h+tolerance)continue;
      const edge=(Math.abs(p.y-y)<=tolerance?'n':Math.abs(p.y-y-h)<=tolerance?'s':'')+(Math.abs(p.x-x)<=tolerance?'w':Math.abs(p.x-x-w)<=tolerance?'e':'');
      if(edge)return {board,handle:edge};
    }
    return null;
  }
  function renameArtboard(id) {
    if(state.document.readOnly)return;
    cancel(); api.artboards.choose(id);
    const board=state.document.getArtboard(id), bounds=renderer.artboardLabelBounds(id); if(!board||!bounds)return;
    const position=scope.view.projectToView(bounds.topLeft),rect=canvas.getBoundingClientRect();
    const input=document.createElement('input'); input.className='draw-artboard-rename'; input.value=board.name; input.setAttribute('aria-label','Artboard name');
    input.style.left=`${Math.max(rect.left,Math.min(rect.right-140,rect.left+position.x))}px`;input.style.top=`${Math.max(rect.top,rect.top+position.y-3)}px`;
    nameEditor=input; canvas.parentElement.append(input);
    const finish=commit=>{if(nameEditor!==input)return;nameEditor=null;input.remove();if(commit&&input.value.trim()&&input.value.trim()!==board.name)run(()=>api.artboards.edit(id,{name:input.value.trim()},{artwork:false}));canvas.focus();};
    input.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Enter'||event.key==='Escape'){event.preventDefault();finish(event.key==='Enter');}});
    input.addEventListener('blur',()=>finish(true));input.focus();input.select();
  }
  // Clicks select the outermost group around a hit, or, in isolation mode, the outermost group inside the isolated one.
  function targetId(id) {
    let chain=state.document.ancestors(id);const iso=state.ui.isolation;
    if(iso){const k=chain.findIndex(n=>n.id===iso);if(k<0)return null;chain=chain.slice(0,k);}
    const groups=chain.filter(n=>n.type==='group'); return groups.at(-1)?.id || id;
  }
  function targets() {
    const selected=new Set(api.selectedIds());
    const targets=state.document.data.artboards.flatMap(a=>[
      {x:a.x,y:a.y,label:'edge'},{x:a.x+a.width,y:a.y+a.height,label:'edge'},{x:a.x+a.width/2,y:a.y+a.height/2,label:'center'},
    ]);
    for (const node of state.document.descendants(null)) {
      if (node.children || !state.document.isEditable(node.id) || selected.has(node.id) || state.document.ancestors(node.id).some(n=>selected.has(n.id))) continue;
      const b=renderer.bounds(node.id); if (!b) continue;
      targets.push({x:b.left,y:b.top,label:'edge'},{x:b.right,y:b.bottom,label:'edge'},{x:b.center.x,y:b.center.y,label:'center'});
      if (node.type==='path') for (const path of node.subpaths) for (const segment of path.segments) {
        const p=renderer.pointToWorld(node.id,segment.p);targets.push({x:p.x,y:p.y,label:'anchor'});
      }
    }
    return targets;
  }
  function boxPreview(box, matrix=[1,0,0,1,0,0], guides=[]) {
    const group=new scope.Group();
    const points=[[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]];
    const path=new scope.Path({segments:points.map(p=>new scope.Point(...p).transform(new scope.Matrix(...matrix))),closed:true});
    path.strokeColor='#006B5C';path.strokeWidth=1/scope.view.zoom;group.addChild(path);
    for (const guide of guides) {
      const b=scope.view.bounds, vertical=guide.axis==='x';
      const line=new scope.Path.Line(vertical ? [guide.value,b.top] : [b.left,guide.value],vertical ? [guide.value,b.bottom] : [b.right,guide.value]);
      line.strokeColor='#006B5C';line.strokeWidth=1/scope.view.zoom;line.dashArray=[4/scope.view.zoom,3/scope.view.zoom];group.addChild(line);
      const label=new scope.PointText({point:vertical ? [guide.value+5/scope.view.zoom,gesture.end.y] : [gesture.end.x,guide.value-5/scope.view.zoom],content:guide.label,fontSize:11/scope.view.zoom,fillColor:'#006B5C'});group.addChild(label);
    }
    return group;
  }
  // Touch Type: the glyph's box with a scale square (top right) and a rotate circle above it.
  function touchHandles(corners){const [tl,tr,br,bl]=corners,up=[tl[0]-bl[0],tl[1]-bl[1]],len=Math.hypot(...up)||1,top=[(tl[0]+tr[0])/2,(tl[1]+tr[1])/2];
    return {rotate:[top[0]+up[0]/len*14/scope.view.zoom,top[1]+up[1]/len*14/scope.view.zoom],scale:tr,centre:[(tl[0]+br[0])/2,(tl[1]+br[1])/2]};}
  function touchMarkers(corners){
    if(!corners)return null;const w=1/scope.view.zoom,h=touchHandles(corners),group=new scope.Group();
    group.addChild(new scope.Path({segments:corners,closed:true,strokeColor:'#1473E6',strokeWidth:w}));
    group.addChild(new scope.Path.Line({from:[(corners[0][0]+corners[1][0])/2,(corners[0][1]+corners[1][1])/2],to:h.rotate,strokeColor:'#1473E6',strokeWidth:w}));
    group.addChild(new scope.Path.Circle({center:h.rotate,radius:4*w,fillColor:'#FFFFFF',strokeColor:'#1473E6',strokeWidth:w}));
    group.addChild(new scope.Path.Rectangle({point:[h.scale[0]-3.5*w,h.scale[1]-3.5*w],size:[7*w,7*w],fillColor:'#FFFFFF',strokeColor:'#1473E6',strokeWidth:w}));
    return group;
  }
  /** The glyph box after a Touch Type drag so far, and the change it makes. */
  function touchChange(touch,start,end){
    const c=touchHandles(touch.corners).centre;
    if(touch.kind==='scale'){const f=Math.max(.01,Math.hypot(end.x-c[0],end.y-c[1])/(Math.hypot(start.x-c[0],start.y-c[1])||1));
      return {corners:touch.corners.map(p=>[c[0]+(p[0]-c[0])*f,c[1]+(p[1]-c[1])*f]),change:{scale:f}};}
    if(touch.kind==='rotate'){const a=Math.atan2(end.y-c[1],end.x-c[0])-Math.atan2(start.y-c[1],start.x-c[0]),cs=Math.cos(a),sn=Math.sin(a);
      return {corners:touch.corners.map(p=>[c[0]+(p[0]-c[0])*cs-(p[1]-c[1])*sn,c[1]+(p[0]-c[0])*sn+(p[1]-c[1])*cs]),change:{turn:-a*180/Math.PI}};}
    const a=renderer.pointToLocal(touch.id,[start.x,start.y]),b=renderer.pointToLocal(touch.id,[end.x,end.y]);
    return {corners:touch.corners.map(p=>[p[0]+end.x-start.x,p[1]+end.y-start.y]),change:{dx:b.x-a.x,dy:b.y-a.y}};
  }
  // Width points: a hollow diamond on the path and a dot at each side end.
  function widthMarkers(handles) {
    if(!handles.length)return null;
    const w=1/scope.view.zoom,group=new scope.Group();
    for(const h of handles){
      group.addChild(new scope.Path.Line({from:h.left,to:h.right,strokeColor:'#1473E6',strokeWidth:w}));
      for(const end of [h.left,h.right])group.addChild(new scope.Path.Circle({center:end,radius:3*w,fillColor:'#1473E6'}));
      const d=new scope.Path.RegularPolygon({center:h.point,sides:4,radius:4*w,fillColor:'#FFFFFF',strokeColor:'#1473E6',strokeWidth:w});group.addChild(d);
    }
    return group;
  }
  function update(event) {
    const p=point(event);api.status(p);
    if (!gesture) {
      const tool=api.tool(),handle=tool==='artboard' ? artboardEdge(p)?.handle : tool==='select' ? renderer.selectionHandle(p) : null;
      // Illustrator-style feedback: handles, object under Selection, Alt copy and Alt zoom-out.
      canvas.style.cursor=tool==='artboard' && renderer.artboardAddHit(p) ? 'pointer'
        : tool==='artboard' && renderer.artboardLabelHit(p) ? 'text'
        : handle==='rotate' ? CURSORS.rotate : handle ? CURSORS[RESIZE_CURSORS[handle]]
        : tool==='select' && renderer.hit(p) ? CURSORS[event.altKey ? 'select-copy' : 'select-anchor']
        : tool==='zoom' && event.altKey ? CURSORS['zoom-out']
        : tool==='gradient' ? gradientCursor(api.gradientHit([p.x,p.y])) : api.cursor();
      if(tool==='width')withScope(()=>{clearPreview();preview=widthMarkers(api.widthHandles([p.x,p.y]));scope.view.update();});
      if(tool==='touch-type')withScope(()=>{clearPreview();const t=state.ui.touchType;preview=touchMarkers(t&&api.touchGlyph(t.id,t.index)?.corners);scope.view.update();});
      return;
      return;
    }
    if(SHAPE_TOOLS.includes(gesture.tool) && api.tool()==='hand')gesture.start=gesture.start.add(p.subtract(gesture.end));
    gesture.end=p;gesture.modifiers={shift:event.shiftKey,alt:event.altKey,mod:event.ctrlKey||event.metaKey};
    gesture.event=event;
    if(gesture.mode==='polygonal-lasso'){polygonalPreview();return;}
    if(gesture.tool==='select' && gesture.box && !gesture.handle && gesture.mode!=='marquee')
      canvas.style.cursor=CURSORS[event.altKey?'select-copy':'select-move'];
    if (gesture.tool==='hand') {
      scope.view.center=gesture.center.subtract(screenDelta(event.clientX-gesture.screen[0],event.clientY-gesture.screen[1]));
      withScope(()=>renderer.updateView({viewOnly:true}));api.status(p);return;
    }
    if (gesture.tool==='rotate-view') {
      // The angle the pointer turned around the canvas centre; Shift snaps to 15°.
      const box=canvas.getBoundingClientRect(),cx=box.left+box.width/2,cy=box.top+box.height/2;
      let angle=gesture.rotation+(Math.atan2(event.clientY-cy,event.clientX-cx)-Math.atan2(gesture.screen[1]-cy,gesture.screen[0]-cx))*180/Math.PI;
      if(event.shiftKey)angle=Math.round(angle/15)*15;
      api.rotateView(angle);return;
    }
    if (gesture.tool==='zoom') {
      const zoom=gesture.zoom*Math.exp((event.clientX-gesture.screen[0])*.01);
      api.zoomAt(gesture.start,zoom/scope.view.zoom);gesture.scrubbed=Math.abs(event.clientX-gesture.screen[0])>3;return;
    }
    withScope(()=>{
      clearPreview();
      if(TRANSFORM_TOOLS.includes(gesture.tool)){
        if(gesture.originDrag){api.transforms.setOrigin([p.x,p.y]);return;}
        gesture.operation=dragTransform(gesture.tool,gesture.origin,[gesture.start.x,gesture.start.y],[p.x,p.y],event.shiftKey);
        gesture.matrix=operationMatrix(gesture.operation,gesture.origin);state.ui.transformOrigin=gesture.origin;
        state.ui.transformPreviewBox=transformedBox(gesture.box,gesture.matrix);
        renderer.previewTransform(gesture.ids,gesture.matrix,{scaleStrokes:gesture.tool==='scale'?state.ui.scaleStrokes!==false:null});
      }else if (SHAPE_TOOLS.includes(gesture.tool)) {
        gesture.node=shapeFromDrag(gesture.tool,[gesture.start.x,gesture.start.y],[p.x,p.y],{...api.shapeOptions(),...gesture.modifiers});
        if(gesture.tool==='star' && gesture.node.params.outerRadius>0 && (event.ctrlKey || event.metaKey)) {
          gesture.innerControl ||= {x:event.clientX,radius:gesture.node.params.outerRadius,ratio:gesture.node.params.innerRadius/gesture.node.params.outerRadius};
          const ratio=Math.max(.02,Math.min(.98,gesture.innerControl.ratio+(event.clientX-gesture.innerControl.x)/150));
          Object.assign(gesture.node.params,{outerRadius:gesture.innerControl.radius,innerRadius:gesture.innerControl.radius*ratio});
        } else gesture.innerControl=null;
        preview=renderer.shapePreview(gesture.node);
      } else if (gesture.mode==='paintbrush'||gesture.mode==='blob-brush') {
        // Paintbrush previews a thin line; Blob Brush the round brush at its size.
        const last=gesture.points.at(-1);if(Math.hypot(p.x-last[0],p.y-last[1])>=.5/scope.view.zoom)gesture.points.push([p.x,p.y]);
        preview=new scope.Path({segments:gesture.points,strokeColor:gesture.mode==='blob-brush'?'rgba(20,115,230,.45)':'#071411',strokeCap:'round',strokeJoin:'round',
          strokeWidth:gesture.mode==='blob-brush'?api.brushSize():1/scope.view.zoom});
      } else if (gesture.mode==='pencil') {
        // Live freehand line; points closer than half a screen pixel are skipped.
        const last=gesture.points.at(-1);if(Math.hypot(p.x-last[0],p.y-last[1])>=.5/scope.view.zoom)gesture.points.push([p.x,p.y]);
        preview=new scope.Path({segments:gesture.points,strokeColor:'#071411',strokeWidth:1/scope.view.zoom});
      } else if (gesture.mode==='free-transform') {
        // Shift: perspective, as in Illustrator. The neighbouring corner along the edge the drag runs along moves the
        // mirror way, so that edge widens or narrows about its middle (corners are top left, top right, bottom right, bottom left).
        const start=gesture.session.corners,k=gesture.corner,dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;
        gesture.corners=start.map(c=>[...c]);gesture.corners[k]=[p.x,p.y];
        if(event.shiftKey){
          // The pointer's movement, not its distance from the corner, so a press beside the corner does not jump.
          const horizontal=Math.abs(dx)>=Math.abs(dy),partner=horizontal?[1,0,3,2][k]:[3,2,1,0][k];
          gesture.corners[k]=horizontal?[start[k][0]+dx,start[k][1]]:[start[k][0],start[k][1]+dy];
          gesture.corners[partner]=horizontal?[start[partner][0]-dx,start[partner][1]]:[start[partner][0],start[partner][1]-dy];
        }
        gesture.moved=true;api.freeDistortPreview(gesture.session,gesture.corners);
      } else if (['shape-builder','knife','eraser','path-eraser','smooth'].includes(gesture.mode)) {
        const last=gesture.points.at(-1);if(Math.hypot(p.x-last[0],p.y-last[1])>=1/scope.view.zoom)gesture.points.push([p.x,p.y]);
        // Shape Builder shades the regions it will merge; Knife shows its line; Eraser its brush stroke.
        if(gesture.mode==='shape-builder'){preview=new scope.Group({children:api.shapeBuilderPreview(gesture.session,gesture.points).map(subpaths=>new scope.CompoundPath({
          children:subpaths.map(s=>new scope.Path({closed:true,segments:s.segments.map(g=>new scope.Segment(new scope.Point(...g.p),new scope.Point(...g.in),new scope.Point(...g.out)))})),
          fillColor:event.altKey?'rgba(220,40,40,.35)':'rgba(20,115,230,.25)',strokeColor:'#1473E6',strokeWidth:1/scope.view.zoom}))});}
        else preview=new scope.Path({segments:gesture.points,strokeColor:gesture.mode==='knife'?'#D32F2F':'rgba(120,120,120,.5)',strokeCap:'round',strokeJoin:'round',
          strokeWidth:gesture.mode==='knife'?1/scope.view.zoom:gesture.mode==='path-eraser'?8/scope.view.zoom:gesture.mode==='smooth'?16/scope.view.zoom:api.eraserSize()});
      } else if (gesture.mode==='touch-type') {
        gesture.touched=touchChange(gesture.touch,gesture.start,p);preview=touchMarkers(gesture.touched.corners);
      } else if (gesture.mode==='width') {
        gesture.moved=true;gesture.alt=event.altKey;
        preview=new scope.CompoundPath({children:api.widthPreview(gesture.session,[p.x,p.y],{alt:event.altKey}).map(ring=>new scope.Path({segments:ring,closed:true})),
          fillColor:'rgba(20,115,230,.25)',strokeColor:'#1473E6',strokeWidth:1/scope.view.zoom,fillRule:'nonzero'});
      } else if (gesture.mode==='lasso') {
        const last=gesture.points.at(-1);if(Math.hypot(p.x-last[0],p.y-last[1])>=1/scope.view.zoom)gesture.points.push([p.x,p.y]);
        preview=new scope.Path({segments:gesture.points,closed:true,strokeColor:'#1473E6',dashArray:[4/scope.view.zoom,3/scope.view.zoom],strokeWidth:1/scope.view.zoom});
      } else if (gesture.mode==='measure') {
        let end=p;
        if(event.shiftKey){const d=p.subtract(gesture.start),a=Math.round(Math.atan2(d.y,d.x)/(Math.PI/4))*Math.PI/4;end=gesture.start.add(new scope.Point(Math.cos(a),Math.sin(a)).multiply(d.length));}
        gesture.end=end;api.setMeasure([gesture.start.x,gesture.start.y],[end.x,end.y]);
      } else if (gesture.mode==='gradient-edit') {
        const {hit}=gesture,local=renderer.pointToLocal(hit.id,[p.x,p.y]);
        if(hit.part==='origin'){
          const origin=[gesture.startOrigin[0]+local.x-gesture.startLocal.x,gesture.startOrigin[1]+local.y-gesture.startLocal.y];
          live(()=>api.gradientEditOne(hit,current=>({...structuredClone(current),origin}),'Move Gradient',gesture.mergeKey));
        }else if(hit.part==='end'){
          // Shift: 45° steps on screen, from the origin.
          let end=p;const from=new scope.Point(gesture.startOrigin).transform(new scope.Matrix(...renderer.worldMatrix(hit.id)));
          if(event.shiftKey){const d=p.subtract(from),a=Math.round(Math.atan2(d.y,d.x)/(Math.PI/4))*Math.PI/4;end=from.add(new scope.Point(Math.cos(a),Math.sin(a)).multiply(d.length));}
          const to=renderer.pointToLocal(hit.id,[end.x,end.y]);
          live(()=>api.gradientEditOne(hit,current=>vectorGradient(current,current.origin,[to.x,to.y]),'Gradient',gesture.mergeKey));
        }else if(hit.part==='stop'){
          const projected=api.gradientProject([p.x,p.y]),removing=gesture.stopCount>2&&projected.distance>30;
          if(!removing)live(()=>{let index=hit.index;api.gradientEditOne(hit,current=>{const moved=moveStop(current,hit.index,projected.offset);index=moved.index;return moved.gradient;},'Move Gradient Stop',gesture.mergeKey);hit.index=index;state.ui.gradientStop=index;});
          gesture.removing=removing;api.gradientAnnotation(removing?{removing:hit.index}:null);
          canvas.style.cursor=CURSORS[removing?'gradient-remove':'gradient-move'];
        }
      } else if (gesture.mode==='gradient') {
        let end=p;
        if(event.shiftKey){const d=p.subtract(gesture.start),a=Math.round(Math.atan2(d.y,d.x)/(Math.PI/4))*Math.PI/4;end=gesture.start.add(new scope.Point(Math.cos(a),Math.sin(a)).multiply(d.length));}
        preview=new scope.Group([new scope.Path.Line({from:gesture.start,to:end,strokeColor:'#071411',strokeWidth:3/scope.view.zoom}),new scope.Path.Line({from:gesture.start,to:end,strokeColor:'#FFFFFF',strokeWidth:1/scope.view.zoom}),
          new scope.Path.Circle({center:gesture.start,radius:4/scope.view.zoom,fillColor:'#FFFFFF',strokeColor:'#071411',strokeWidth:1/scope.view.zoom}),new scope.Path.Rectangle({point:end.subtract(3.5/scope.view.zoom),size:7/scope.view.zoom,fillColor:'#071411'})]);
        if(gesture.start.getDistance(end)>1e-6){gesture.end=end;live(()=>api.gradientVector([gesture.start.x,gesture.start.y],[end.x,end.y],gesture.mergeKey));}
      } else if (gesture.mode==='text-frame' || gesture.mode==='marquee' || gesture.mode==='new-artboard') {
        gesture.rectangle=new scope.Rectangle(gesture.start,p);preview=boxPreview(gesture.rectangle);
        if(gesture.mode==='text-frame')preview.data.textFrame=true;
      } else if (gesture.box) {
        let guides=[];
        if (gesture.handle==='rotate') gesture.matrix=rotationMatrix(gesture.box,[gesture.start.x,gesture.start.y],[p.x,p.y],event.shiftKey);
        else if (gesture.handle) gesture.matrix=resizeMatrix(gesture.box,gesture.handle,[p.x,p.y],gesture.modifiers);
        else {
          const delta=p.subtract(gesture.start);if(event.shiftKey) {if(Math.abs(delta.x)>Math.abs(delta.y))delta.y=0;else delta.x=0;}
          let snapped={x:delta.x,y:delta.y,guides:[]};
          if (state.document.data.settings.smartGuides && gesture.tool==='select') snapped=snapTranslation(gesture.box,[delta.x,delta.y],gesture.targets,4/scope.view.zoom);
          if(event.shiftKey){const axis=Math.abs(delta.x)>Math.abs(delta.y)?'y':'x';snapped[axis]=0;snapped.guides=snapped.guides.filter(g=>g.axis!==axis);}
          guides=snapped.guides;gesture.matrix=[1,0,0,1,snapped.x,snapped.y];
        }
        preview=boxPreview(gesture.box,gesture.matrix,guides);
        if(gesture.tool==='select'&&gesture.handle&&gesture.handle!=='rotate')renderer.previewTransform(api.selectedIds(),gesture.matrix);
      }
      scope.view.update();
    });
  }
  canvas.addEventListener('contextmenu',event=>{
    event.preventDefault();
    if(gesture)return;
    api.closeMenus();canvas.focus();
    run(()=>{
      const hit=renderer.hit(point(event));
      // Preserve multi-selection, including direct-selected members of a group.
      const selected=api.selectedIds(),inside=hit&&[hit,...state.document.ancestors(hit).map(n=>n.id)].some(id=>selected.includes(id));
      const target=hit&&targetId(hit);
      if(target&&!inside)api.select([target]);
      api.contextMenu(event.clientX,event.clientY);
    });
  },events);
  canvas.addEventListener('pointerdown',event=>{
    if (event.button!==0) return;
    api.closeMenus();canvas.focus();const p=point(event),tool=api.tool();
    // Polygonal selection spans clicks, so it must survive each pointer release.
    if(tool==='polygonal-lasso'&&!state.document.readOnly) {
      const modifiers={shift:event.shiftKey,alt:event.altKey,mod:event.ctrlKey||event.metaKey};
      if(gesture?.mode!=='polygonal-lasso')gesture={tool,mode:tool,points:[[p.x,p.y]],end:p,modifiers};
      else {
        gesture.end=p;gesture.modifiers=modifiers;
        const first=gesture.points[0],last=gesture.points.at(-1);
        if(gesture.points.length>=3&&Math.hypot(p.x-first[0],p.y-first[1])<=6/scope.view.zoom){finishPolygonalLasso();return;}
        // The second press of a double-click must not add the same vertex twice.
        if(Math.hypot(p.x-last[0],p.y-last[1])>1/scope.view.zoom)gesture.points.push([p.x,p.y]);
      }
      polygonalPreview();return;
    }
    canvas.setPointerCapture(event.pointerId);
    const base={tool,start:p,end:p,center:scope.view.center.clone(),zoom:scope.view.zoom,screen:[event.clientX,event.clientY],modifiers:{shift:event.shiftKey,alt:event.altKey,mod:event.ctrlKey||event.metaKey}};
    if (tool==='rotate-view') {gesture={...base,rotation:scope.view.rotation};return;}
    if (tool==='hand' || tool==='zoom') {gesture=base;if(tool==='hand')canvas.style.cursor=CURSORS['hand-active'];return;}
    if (state.document.readOnly) {
      if (tool==='select') {const id=renderer.hit(p),t=id&&targetId(id);api.select(t ? [t] : []);} return;
    }
    if(tool==='eyedropper') {
      // Click: copy the clicked object's look to the selection (or to new objects). Alt: apply the selection's look to it. Shift: only the colour under the pointer.
      if(event.shiftKey){api.run(()=>api.eyedropper({mode:'pixel',hex:eyedropperPreview.sample(event)}));return;}
      const hit=renderer.hit(p);if(!hit){api.notify?.('Click a path, shape or text to sample its appearance.');return;}
      api.run(()=>api.eyedropper({mode:event.altKey?'apply':'sample',hitId:hit}));return;
    }
    if(tool==='magic-wand') {
      // Click: every object with a similar fill (Magic Wand options); Shift adds, Alt removes.
      const hit=renderer.hit(p);api.run(()=>api.magicWand(hit,{add:event.shiftKey,subtract:event.altKey}));return;
    }
    if(tool==='lasso'){gesture={...base,mode:'lasso',points:[[p.x,p.y]]};return;}
    if(tool==='blend'){const hit=renderer.hit(p);api.run(()=>api.blendClick(hit&&targetId(hit)));return;}
    if(tool==='shape-builder'){
      const session=api.shapeBuilderSession();if(!session){api.notify?.('Select at least two overlapping shapes for Shape Builder.');return;}
      gesture={...base,mode:'shape-builder',session,points:[[p.x,p.y]]};return;
    }
    if(['knife','eraser','path-eraser','smooth'].includes(tool)){gesture={...base,mode:tool,points:[[p.x,p.y]]};return;}
    if(tool==='touch-type'){
      // On the chosen glyph's handles: scale or rotate it; anywhere else: pick the glyph there and move it.
      const t=state.ui.touchType,current=t&&api.touchGlyph(t.id,t.index),near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=7/scope.view.zoom;
      let glyph=null,kind='move';
      if(current){const h=touchHandles(current.corners);if(near([p.x,p.y],h.rotate)){glyph=current;kind='rotate';}else if(near([p.x,p.y],h.scale)){glyph=current;kind='scale';}}
      if(!glyph){glyph=api.touchGlyphAt([p.x,p.y]);if(!glyph){state.ui.touchType=null;api.notify?.('Click a character of a text object.');return;}state.ui.touchType={id:glyph.id,index:glyph.index};}
      gesture={...base,mode:'touch-type',touch:{...glyph,kind}};return;
    }
    if(tool==='width'){
      const session=api.widthSession([p.x,p.y]);if(!session){api.notify?.('Drag on a stroked path to change its width there.');return;}
      gesture={...base,mode:'width',session};return;
    }
    if(tool==='free-transform'){
      // Free Distort: grab the nearest corner of the selection box (within 10 screen pixels).
      const session=api.freeDistortSession(),corner=session?session.corners.findIndex(c=>Math.hypot(c[0]-p.x,c[1]-p.y)<=10/scope.view.zoom):-1;
      if(corner<0){api.notify?.(session?'Drag a corner of the selection box to distort it.':'Select paths or shapes to distort.');return;}
      gesture={...base,mode:'free-transform',session,corner,corners:session.corners.map(c=>[...c])};return;
    }
    if(tool==='scissors') {
      const hit=renderer.curveHit(p,{shapes:true});
      if(!hit){api.notify?.('Click on a path or shape outline to cut it.');return;}
      api.run(()=>api.scissors(hit));return;
    }
    if(tool==='pencil'){gesture={...base,mode:'pencil',points:[[p.x,p.y]]};return;}
    if(tool==='paintbrush'||tool==='blob-brush'){gesture={...base,mode:tool,points:[[p.x,p.y]]};return;}
    if(tool==='measure'){api.setMeasure(null);gesture={...base,mode:'measure'};return;}
    if(tool==='group-selection') {
      const hit=renderer.hit(p);
      if(hit){const id=groupSelectionTarget(state.document,hit,state.selection.ids,state.ui.isolation);api.select(event.shiftKey?[...new Set([...state.selection.ids,id])]:[id]);gesture={...base,box:renderer.selectionBounds()};gesture.targets=targets();}
      else{if(!event.shiftKey)api.select([]);gesture={...base,mode:'marquee',initial:state.selection.ids};}
      return;
    }
    if(tool==='gradient') {
      // On the annotator: drag the origin (moves the gradient), the end (direction and length) or a stop
      // (along the line; far off it deletes the stop). Clicking the line adds a stop there and drags it.
      const hit=api.gradientHit([p.x,p.y]);
      if(hit){
        const mergeKey=`gradient-edit-${Date.now()}`,node=state.document.getNode(hit.id),entry=(hit.kind==='stroke'?node.appearance.strokes:node.appearance.fills)[0];
        gesture={...base,mode:'gradient-edit',hit:{...hit},mergeKey,startOrigin:[...entry.paint.origin],startLocal:renderer.pointToLocal(hit.id,[p.x,p.y]),stopCount:entry.paint.stops.length};
        if(hit.part==='line')live(()=>{
          let index=0;api.gradientEditOne(hit,current=>{const next=addStop(current,hit.offset);index=next.stops.findIndex(s=>s.offset===Math.min(1,Math.max(0,hit.offset)));return next;},'Add Gradient Stop',mergeKey);
          gesture.hit={...hit,part:'stop',index};gesture.stopCount++;gesture.added=true;api.gradientStop(index);
        });
        else if(hit.part==='stop')api.gradientStop(hit.index);
        return;
      }
      // Drag sets the gradient vector on the selection; clicking an object selects it first.
      if(!api.paintIds().length){const hit=renderer.hit(p),t=hit&&targetId(hit);if(t)api.select([t]);}
      if(!api.paintIds().length){api.notify?.('Select artwork, then drag across it with the Gradient tool.');return;}
      gesture={...base,mode:'gradient',mergeKey:`gradient-tool-${Date.now()}`};return;
    }
    if(tool==='type-on-path') {
      const hit=renderer.hit(p),type=state.document.getNode(hit)?.type;
      if(type==='text')void api.editText(p,hit);
      else if(type==='path'||type==='shape')void api.typeOnPath(hit);
      else api.notify?.('Click a path or shape to type along it.');
      return;
    }
    if(tool==='vertical-type'){const hit=renderer.hit(p);if(state.document.getNode(hit)?.type==='text')void api.editText(p,hit);else void api.editText(p,null,null,{orientation:'vertical'});return;}
    if(['type','area-type'].includes(tool)) {
      const hit=renderer.hit(p);
      if(state.document.getNode(hit)?.type==='text')void api.editText(p,hit);
      else gesture={...base,mode:'text-frame'};
      return;
    }
    if(TRANSFORM_TOOLS.includes(tool)){
      if(!api.selectedIds().length){const hit=renderer.hit(p),t=hit&&targetId(hit);if(t)api.select([t]);}
      const origin=api.transforms.origin(),box=renderer.selectionBounds();if(!origin||!box)return;
      const originBefore=state.ui.transformOrigin&&[...state.ui.transformOrigin];
      gesture={...base,origin,originBefore,originDrag:p.getDistance(new scope.Point(...origin))<=8/scope.view.zoom,ids:api.selectedIds(),box};
    }else if (tool==='artboard') {
      const plus=renderer.artboardAddHit(p);
      if(plus){run(()=>api.artboards.duplicateAdjacent(plus.boardId,plus.direction));return;}
      const label=renderer.artboardLabelHit(p);if(label){api.artboards.choose(label);return;}
      const edge=artboardEdge(p),handle=edge?.handle;
      const board=edge?.board ?? [...state.document.data.artboards].reverse().find(a=>p.x>=a.x && p.x<=a.x+a.width && p.y>=a.y && p.y<=a.y+a.height);
      if (board) {api.artboards.choose(board.id);gesture={...base,handle,boardId:board.id,box:{x:board.x,y:board.y,width:board.width,height:board.height}};}
      else gesture={...base,mode:'new-artboard'};
    } else if (tool==='select') {
      const handle=renderer.selectionHandle(p);
      if (handle) gesture={...base,handle,box:renderer.selectionBounds()};
      else {
        const hit=renderer.hit(p),id=hit && targetId(hit);
        if (id) {
          const selected=state.selection.ids;
          api.select(event.shiftKey ? selected.includes(id) ? selected.filter(n=>n!==id) : [...selected,id] : selected.includes(id) ? selected : [id]);
          gesture={...base,box:renderer.selectionBounds()};
        } else {if(!event.shiftKey)api.select([]);gesture={...base,mode:'marquee',initial:state.selection.ids};}
      }
      gesture.targets=targets();
      const board=[...state.document.data.artboards].reverse().find(a=>p.x>=a.x && p.x<=a.x+a.width && p.y>=a.y && p.y<=a.y+a.height);
      if (board) {state.ui.artboardId=board.id;api.status(p);}
    } else if (SHAPE_TOOLS.includes(tool)) gesture=base;
  },events);
  canvas.addEventListener('pointermove',update,events);
  canvas.addEventListener('pointerup',event=>{
    if (!gesture) return;
    if(gesture.mode==='polygonal-lasso')return;
    const end=point(event);if (end.getDistance(gesture.end)>.000001)update(event);
    const drag=gesture,moved=Math.hypot(event.clientX-drag.screen[0],event.clientY-drag.screen[1])>3;cancel();
    if (drag.tool==='hand'||drag.tool==='rotate-view'){canvas.style.cursor=api.cursor();return;}
    if (drag.tool==='zoom') {if(!drag.scrubbed)api.zoomAt(drag.start,event.altKey || api.zoomOut() ? .8 : 1.25);return;}
    run(()=>{
      if (state.document.readOnly)return;
      if(drag.mode==='paintbrush') {
        if(drag.points.length>2)api.paintbrush(drag.points);
      }else if(drag.mode==='blob-brush') {
        api.blobBrush(drag.points);
      }else if(drag.mode==='pencil') {
        if(moved||drag.points.length>2)api.pencil(drag.points);
      }else if(drag.mode==='free-transform') {
        if(drag.moved)api.freeDistort(drag.session,drag.corners);else api.freeDistortPreview(null);
      }else if(drag.mode==='shape-builder') {
        api.shapeBuilder(drag.session,drag.points,{alt:event.altKey||drag.modifiers.alt});
      }else if(drag.mode==='path-eraser'||drag.mode==='smooth') {
        if(!api[drag.mode==='smooth'?'smoothPath':'pathEraser'](drag.points))api.notify?.(drag.mode==='smooth'?'Drag along a selected path to smooth it.':'Drag along a selected path to erase part of it.');
      }else if(drag.mode==='knife'||drag.mode==='eraser') {
        if(drag.points.length>1&&!api[drag.mode](drag.points))api.notify?.(drag.mode==='knife'?'The knife did not cross a filled shape.':'Nothing to erase there.');
      }else if(drag.mode==='touch-type') {
        if(moved&&drag.touched)api.touchType(drag.touch.id,drag.touch.index,drag.touched.change);
      }else if(drag.mode==='width') {
        if(drag.moved)api.widthDrag(drag.session,[drag.end.x,drag.end.y],{alt:drag.alt??drag.modifiers.alt});
      }else if(drag.mode==='lasso') {
        // Alt+Mod: whole objects (any anchor inside), as Illustrator's Lasso with those keys.
        if(drag.points.length>2)applyLasso(drag);else if(!drag.modifiers.shift)api.select([]);
      }else if(drag.mode==='measure') {
        if(drag.end)api.setMeasure([drag.start.x,drag.start.y],[drag.end.x,drag.end.y]);
      }else if(drag.mode==='gradient-edit') {
        api.gradientAnnotation(null);
        if(drag.removing)run(()=>{api.gradientEditOne(drag.hit,current=>removeStop(current,drag.hit.index),'Delete Gradient Stop',drag.mergeKey);api.gradientStop(Math.max(0,drag.hit.index-1));});
        if(moved||drag.added)api.rememberGradient(drag.hit.kind);
      }else if(drag.mode==='gradient') {
        if(!moved)api.command('paint-gradient');else api.rememberGradient();
      }else if(drag.mode==='text-frame') {
        const rectangle=drag.rectangle,frame=moved&&rectangle?.width>=.1&&rectangle?.height>=.1?rectangle:null;
        void api.editText(frame?frame.topLeft:drag.start,null,frame?{width:frame.width,height:frame.height}:drag.tool==='area-type'?{width:60,height:30}:null);
      }else if(TRANSFORM_TOOLS.includes(drag.tool)){
        if(drag.originDrag){if(moved)api.transforms.setOrigin([end.x,end.y]);else api.transforms.setOrigin([drag.start.x,drag.start.y]);}
        else if(moved&&drag.matrix)api.transform(drag.matrix,drag.tool[0].toUpperCase()+drag.tool.slice(1),{ids:drag.ids,copy:drag.modifiers.alt,scaleStrokes:drag.tool==='scale'?state.ui.scaleStrokes!==false:null});
        else api.transforms.setOrigin([end.x,end.y]);
        if(!moved&&event.altKey)void api.transformDialog(drag.tool);
      }else if (SHAPE_TOOLS.includes(drag.tool)) {
        if (moved && drag.node) api.insertShape(drag.node); else void api.shapeDialog(drag.tool,drag.start);
      } else if (drag.mode==='new-artboard' && moved && drag.rectangle.width>0 && drag.rectangle.height>0) {
        api.artboards.add({x:drag.rectangle.x,y:drag.rectangle.y,width:drag.rectangle.width,height:drag.rectangle.height});
      } else if (drag.mode==='marquee' && moved) {
        const iso=state.ui.isolation&&state.document.getNode(state.ui.isolation),pool=iso?iso.children:state.document.data.layers.flatMap(layer=>layer.children);
        const ids=pool.filter(n=>state.document.isEditable(n.id) && renderer.bounds(n.id)?.intersects(drag.rectangle)).map(n=>n.id);
        api.select([...drag.initial,...ids]);
      } else if (moved && drag.matrix) {
        if(drag.tool==='artboard')api.artboards.edit(drag.boardId,transformedBox(drag.box,drag.matrix),{copy:drag.modifiers.alt && !drag.handle,artwork:!drag.handle&&state.ui.moveArtwork!==false});
        else api.transform(drag.matrix,drag.handle==='rotate' ? 'Rotate' : drag.handle ? 'Resize' : 'Move',{copy:drag.modifiers.alt && !drag.handle});
      }
    });
  },events);
  canvas.addEventListener('pointercancel',cancel,events);canvas.addEventListener('lostpointercapture',()=>{if(gesture&&gesture.mode!=='polygonal-lasso')cancel();},events);
  canvas.addEventListener('dblclick',event=>{
    if(api.tool()==='polygonal-lasso'){event.preventDefault();finishPolygonalLasso();return;}
    const label=renderer.artboardLabelHit(point(event));
    if(label){event.preventDefault();renameArtboard(label);return;}
    if(TRANSFORM_TOOLS.includes(api.tool())){event.preventDefault();cancel();void api.transformDialog(api.tool());return;}
    if(api.tool()==='width'){event.preventDefault();cancel();const p=point(event);void api.widthPointEdit([p.x,p.y]);return;}
    // Selection tool: double-click a group to isolate it; double-click empty canvas to leave isolation.
    if(api.tool()!=='select')return;
    const hit=renderer.hit(point(event)),id=hit&&targetId(hit);
    if(id&&state.document.getNode(id)?.type==='text'){void api.editText(point(event),id);return;}
    if(id&&state.document.getNode(id)?.type==='group')api.isolate(id);else if(!hit)api.exitIsolation();
  },events);
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    if(event.ctrlKey || event.metaKey) api.zoomAt(point(event),Math.exp(-event.deltaY*.001*(api.preferences().invertZoom ? -1 : 1)));
    else {scope.view.center=scope.view.center.add(screenDelta(event.deltaX,event.deltaY));withScope(()=>renderer.updateView({viewOnly:true}));api.status();}
  },{...events,passive:false});
  window.addEventListener('blur',cancel,events);
  return {cancel,busy:()=>!!gesture,editing:()=>ownEdits>0,refreshEyedropper:eyedropperPreview.refresh,eyedropperModifiers:eyedropperPreview.modifiers,
    handle(command) {
      if(gesture?.mode!=='polygonal-lasso')return false;
      if(command==='tool-dialog'){finishPolygonalLasso();return true;}
      if(command==='delete'){
        if(gesture.points.length<=1)cancel();else{gesture.points.pop();polygonalPreview();}return true;
      }
      return false;
    },
    adjust(direction) {
      if(!direction || !gesture)return false;
      if(['polygon','star'].includes(gesture.tool))state.ui.points=Math.max(gesture.tool==='polygon'?3:2,Math.min(100,(state.ui.points || (gesture.tool==='polygon'?6:5))+direction));
      else if(gesture.tool==='rounded-rectangle')state.ui.cornerRadius=Math.max(0,(state.ui.cornerRadius ?? 5)+direction);
      else return false;
      if(gesture.event)update(gesture.event);return true;
    },
    destroy(){cancel();controller.abort();eyedropperPreview.destroy();},
  };
}
