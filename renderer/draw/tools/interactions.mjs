import { shapeFromDrag, SHAPE_TOOLS } from './shapes.mjs';
import { resizeMatrix, rotationMatrix, transformedBox, snapTranslation } from './selection.mjs';
import { activeArtboard } from '../doc/artboards.mjs';

export function createInteractions(canvas, state, api) {
  const {scope,renderer,withScope,run}=api, controller=new AbortController(), events={signal:controller.signal};
  let gesture=null,preview=null;
  const point=event=>{const b=canvas.getBoundingClientRect();return scope.view.viewToProject(new scope.Point(event.clientX-b.left,event.clientY-b.top));};
  function clearPreview() {preview?.remove();preview=null;}
  function cancel() {gesture=null;clearPreview();withScope(()=>scope.view.update());api.status();}
  function targetId(id) {
    const groups=state.document.ancestors(id).filter(n=>n.type==='group'); return groups.at(-1)?.id || id;
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
  function update(event) {
    const p=point(event);api.status(p);
    if (!gesture) {
      const handle=['select','artboard'].includes(api.tool()) ? renderer.selectionHandle(p) : null;
      canvas.style.cursor=handle==='rotate' ? 'crosshair' : handle ? `${handle}-resize` : '';
      return;
    }
    if(SHAPE_TOOLS.includes(gesture.tool) && api.tool()==='hand')gesture.start=gesture.start.add(p.subtract(gesture.end));
    gesture.end=p;gesture.modifiers={shift:event.shiftKey,alt:event.altKey};
    gesture.event=event;
    if (gesture.tool==='hand') {
      scope.view.center=gesture.center.subtract(new scope.Point(event.clientX-gesture.screen[0],event.clientY-gesture.screen[1]).divide(scope.view.zoom));
      withScope(()=>renderer.updateView());api.status(p);return;
    }
    if (gesture.tool==='zoom') {
      const zoom=gesture.zoom*Math.exp((event.clientX-gesture.screen[0])*.01);
      api.zoomAt(gesture.start,zoom/scope.view.zoom);gesture.scrubbed=Math.abs(event.clientX-gesture.screen[0])>3;return;
    }
    withScope(()=>{
      clearPreview();
      if (SHAPE_TOOLS.includes(gesture.tool)) {
        gesture.node=shapeFromDrag(gesture.tool,[gesture.start.x,gesture.start.y],[p.x,p.y],{...api.shapeOptions(),...gesture.modifiers});
        if(gesture.tool==='star' && gesture.node.params.outerRadius>0 && (event.ctrlKey || event.metaKey)) {
          gesture.innerControl ||= {x:event.clientX,radius:gesture.node.params.outerRadius,ratio:gesture.node.params.innerRadius/gesture.node.params.outerRadius};
          const ratio=Math.max(.02,Math.min(.98,gesture.innerControl.ratio+(event.clientX-gesture.innerControl.x)/150));
          Object.assign(gesture.node.params,{outerRadius:gesture.innerControl.radius,innerRadius:gesture.innerControl.radius*ratio});
        } else gesture.innerControl=null;
        preview=renderer.shapePreview(gesture.node);
      } else if (gesture.mode==='marquee' || gesture.mode==='new-artboard') {
        gesture.rectangle=new scope.Rectangle(gesture.start,p);preview=boxPreview(gesture.rectangle);
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
      }
      scope.view.update();
    });
  }
  canvas.addEventListener('pointerdown',event=>{
    if (event.button!==0) return;
    api.closeMenus();canvas.focus();canvas.setPointerCapture(event.pointerId);const p=point(event),tool=api.tool();
    const base={tool,start:p,end:p,center:scope.view.center.clone(),zoom:scope.view.zoom,screen:[event.clientX,event.clientY],modifiers:{shift:event.shiftKey,alt:event.altKey}};
    if (tool==='hand' || tool==='zoom') {gesture=base;return;}
    if (state.document.readOnly) {
      if (tool==='select') {const id=renderer.hit(p);api.select(id ? [targetId(id)] : []);} return;
    }
    if (tool==='artboard') {
      const handle=renderer.selectionHandle(p);
      const board=handle ? activeArtboard(state) : [...state.document.data.artboards].reverse().find(a=>p.x>=a.x && p.x<=a.x+a.width && p.y>=a.y && p.y<=a.y+a.height);
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
    const end=point(event);if (end.getDistance(gesture.end)>.000001)update(event);
    const drag=gesture,moved=Math.hypot(event.clientX-drag.screen[0],event.clientY-drag.screen[1])>3;cancel();
    if (drag.tool==='hand')return;
    if (drag.tool==='zoom') {if(!drag.scrubbed)api.zoomAt(drag.start,event.altKey || api.zoomOut() ? .8 : 1.25);return;}
    run(()=>{
      if (state.document.readOnly)return;
      if (SHAPE_TOOLS.includes(drag.tool)) {
        if (moved && drag.node) api.insertShape(drag.node); else void api.shapeDialog(drag.tool,drag.start);
      } else if (drag.mode==='new-artboard' && moved && drag.rectangle.width>0 && drag.rectangle.height>0) {
        api.artboards.add({x:drag.rectangle.x,y:drag.rectangle.y,width:drag.rectangle.width,height:drag.rectangle.height});
      } else if (drag.mode==='marquee' && moved) {
        const ids=state.document.data.layers.flatMap(layer=>layer.children).filter(n=>state.document.isEditable(n.id) && renderer.bounds(n.id)?.intersects(drag.rectangle)).map(n=>n.id);
        api.select([...drag.initial,...ids]);
      } else if (moved && drag.matrix) {
        if(drag.tool==='artboard')api.artboards.edit(drag.boardId,transformedBox(drag.box,drag.matrix),{copy:drag.modifiers.alt && !drag.handle});
        else api.transform(drag.matrix,drag.handle==='rotate' ? 'Rotate' : drag.handle ? 'Resize' : 'Move',{copy:drag.modifiers.alt && !drag.handle});
      }
    });
  },events);
  canvas.addEventListener('pointercancel',cancel,events);canvas.addEventListener('lostpointercapture',cancel,events);
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    if(event.ctrlKey || event.metaKey) api.zoomAt(point(event),Math.exp(-event.deltaY*.001*(api.preferences().invertZoom ? -1 : 1)));
    else {scope.view.center=scope.view.center.add(new scope.Point(event.deltaX,event.deltaY).divide(scope.view.zoom));withScope(()=>renderer.updateView());api.status();}
  },{...events,passive:false});
  window.addEventListener('blur',cancel,events);
  return {cancel,
    adjust(direction) {
      if(!direction || !gesture)return false;
      if(['polygon','star'].includes(gesture.tool))state.ui.points=Math.max(gesture.tool==='polygon'?3:2,Math.min(100,(state.ui.points || (gesture.tool==='polygon'?6:5))+direction));
      else if(gesture.tool==='rounded-rectangle')state.ui.cornerRadius=Math.max(0,(state.ui.cornerRadius ?? 5)+direction);
      else return false;
      if(gesture.event)update(gesture.event);return true;
    },
    destroy(){cancel();controller.abort();},
  };
}
