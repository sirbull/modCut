import { shapeFromDrag, SHAPE_TOOLS } from './shapes.mjs';
import { groupSelectionTarget } from '../doc/tool-rules.mjs';
import { CURSORS, RESIZE_CURSORS } from './cursors.mjs';
import { resizeMatrix, rotationMatrix, transformedBox, snapTranslation } from './selection.mjs';
import { activeArtboard } from '../doc/artboards.mjs';
import { TRANSFORM_TOOLS,dragTransform,operationMatrix } from '../geom/transforms.mjs';

export function createInteractions(canvas, state, api) {
  const {scope,renderer,withScope,run}=api, controller=new AbortController(), events={signal:controller.signal};
  let gesture=null,preview=null;
  const point=event=>{const b=canvas.getBoundingClientRect();return scope.view.viewToProject(new scope.Point(event.clientX-b.left,event.clientY-b.top));};
  /** The colour under the pointer on the canvas, for Shift+Eyedropper. */
  function pixelHex(event) {
    const box=canvas.getBoundingClientRect(),ratio=canvas.width/box.width,x=Math.floor((event.clientX-box.left)*ratio),y=Math.floor((event.clientY-box.top)*ratio);
    const [r,g,b,a]=canvas.getContext('2d').getImageData(x,y,1,1).data;
    return a?'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase():null;
  }
  function clearPreview() {preview?.remove();preview=null;renderer.clearTransformPreview();state.ui.transformPreviewBox=null;}
  function cancel() {const previous=gesture;gesture=null;if(previous?.mode==='free-transform')api.freeDistortPreview(null);withScope(()=>{clearPreview();if(TRANSFORM_TOOLS.includes(previous?.tool))api.transforms.setOrigin(previous.originBefore);renderer.updateView();});api.status();}
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
  function update(event) {
    const p=point(event);api.status(p);
    if (!gesture) {
      const tool=api.tool(),handle=['select','artboard'].includes(tool) ? renderer.selectionHandle(p) : null;
      // Illustrator-style feedback: handles, object under Selection, Alt copy and Alt zoom-out.
      canvas.style.cursor=handle==='rotate' ? CURSORS.rotate : handle ? CURSORS[RESIZE_CURSORS[handle]]
        : tool==='select' && renderer.hit(p) ? CURSORS[event.altKey ? 'select-copy' : 'select-anchor']
        : tool==='zoom' && event.altKey ? CURSORS['zoom-out'] : api.cursor();
      return;
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
      if(TRANSFORM_TOOLS.includes(gesture.tool)){
        if(gesture.originDrag){api.transforms.setOrigin([p.x,p.y]);return;}
        gesture.operation=dragTransform(gesture.tool,gesture.origin,[gesture.start.x,gesture.start.y],[p.x,p.y],event.shiftKey);
        gesture.matrix=operationMatrix(gesture.operation,gesture.origin);state.ui.transformOrigin=gesture.origin;
        state.ui.transformPreviewBox=transformedBox(gesture.box,gesture.matrix);
        renderer.previewTransform(gesture.ids,gesture.matrix,{scaleStrokes:gesture.tool==='scale'?(state.ui.transformDefaults?.scale?.scaleStrokes??true):null});
      }else if (SHAPE_TOOLS.includes(gesture.tool)) {
        gesture.node=shapeFromDrag(gesture.tool,[gesture.start.x,gesture.start.y],[p.x,p.y],{...api.shapeOptions(),...gesture.modifiers});
        if(gesture.tool==='star' && gesture.node.params.outerRadius>0 && (event.ctrlKey || event.metaKey)) {
          gesture.innerControl ||= {x:event.clientX,radius:gesture.node.params.outerRadius,ratio:gesture.node.params.innerRadius/gesture.node.params.outerRadius};
          const ratio=Math.max(.02,Math.min(.98,gesture.innerControl.ratio+(event.clientX-gesture.innerControl.x)/150));
          Object.assign(gesture.node.params,{outerRadius:gesture.innerControl.radius,innerRadius:gesture.innerControl.radius*ratio});
        } else gesture.innerControl=null;
        preview=renderer.shapePreview(gesture.node);
      } else if (gesture.mode==='pencil') {
        // Live freehand line; points closer than half a screen pixel are skipped.
        const last=gesture.points.at(-1);if(Math.hypot(p.x-last[0],p.y-last[1])>=.5/scope.view.zoom)gesture.points.push([p.x,p.y]);
        preview=new scope.Path({segments:gesture.points,strokeColor:'#071411',strokeWidth:1/scope.view.zoom});
      } else if (gesture.mode==='free-transform') {
        gesture.corners[gesture.corner]=[p.x,p.y];gesture.moved=true;api.freeDistortPreview(gesture.session,gesture.corners);
      } else if (['shape-builder','knife','eraser'].includes(gesture.mode)) {
        const last=gesture.points.at(-1);if(Math.hypot(p.x-last[0],p.y-last[1])>=1/scope.view.zoom)gesture.points.push([p.x,p.y]);
        // Shape Builder shades the regions it will merge; Knife shows its line; Eraser its brush stroke.
        if(gesture.mode==='shape-builder'){preview=new scope.Group({children:api.shapeBuilderPreview(gesture.session,gesture.points).map(subpaths=>new scope.CompoundPath({
          children:subpaths.map(s=>new scope.Path({closed:true,segments:s.segments.map(g=>new scope.Segment(new scope.Point(...g.p),new scope.Point(...g.in),new scope.Point(...g.out)))})),
          fillColor:event.altKey?'rgba(220,40,40,.35)':'rgba(20,115,230,.25)',strokeColor:'#1473E6',strokeWidth:1/scope.view.zoom}))});}
        else preview=new scope.Path({segments:gesture.points,strokeColor:gesture.mode==='knife'?'#D32F2F':'rgba(120,120,120,.5)',strokeCap:'round',strokeJoin:'round',
          strokeWidth:gesture.mode==='knife'?1/scope.view.zoom:api.eraserSize()});
      } else if (gesture.mode==='lasso') {
        const last=gesture.points.at(-1);if(Math.hypot(p.x-last[0],p.y-last[1])>=1/scope.view.zoom)gesture.points.push([p.x,p.y]);
        preview=new scope.Path({segments:gesture.points,closed:true,strokeColor:'#1473E6',dashArray:[4/scope.view.zoom,3/scope.view.zoom],strokeWidth:1/scope.view.zoom});
      } else if (gesture.mode==='measure') {
        let end=p;
        if(event.shiftKey){const d=p.subtract(gesture.start),a=Math.round(Math.atan2(d.y,d.x)/(Math.PI/4))*Math.PI/4;end=gesture.start.add(new scope.Point(Math.cos(a),Math.sin(a)).multiply(d.length));}
        gesture.end=end;api.setMeasure([gesture.start.x,gesture.start.y],[end.x,end.y]);
      } else if (gesture.mode==='gradient') {
        let end=p;
        if(event.shiftKey){const d=p.subtract(gesture.start),a=Math.round(Math.atan2(d.y,d.x)/(Math.PI/4))*Math.PI/4;end=gesture.start.add(new scope.Point(Math.cos(a),Math.sin(a)).multiply(d.length));}
        preview=new scope.Group([new scope.Path.Line({from:gesture.start,to:end,strokeColor:'#071411',strokeWidth:3/scope.view.zoom}),new scope.Path.Line({from:gesture.start,to:end,strokeColor:'#FFFFFF',strokeWidth:1/scope.view.zoom}),
          new scope.Path.Circle({center:gesture.start,radius:4/scope.view.zoom,fillColor:'#FFFFFF',strokeColor:'#071411',strokeWidth:1/scope.view.zoom}),new scope.Path.Rectangle({point:end.subtract(3.5/scope.view.zoom),size:7/scope.view.zoom,fillColor:'#071411'})]);
        if(gesture.start.getDistance(end)>1e-6){gesture.end=end;api.run(()=>api.gradientVector([gesture.start.x,gesture.start.y],[end.x,end.y],gesture.mergeKey));}
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
      }
      scope.view.update();
    });
  }
  canvas.addEventListener('pointerdown',event=>{
    if (event.button!==0) return;
    api.closeMenus();canvas.focus();canvas.setPointerCapture(event.pointerId);const p=point(event),tool=api.tool();
    const base={tool,start:p,end:p,center:scope.view.center.clone(),zoom:scope.view.zoom,screen:[event.clientX,event.clientY],modifiers:{shift:event.shiftKey,alt:event.altKey}};
    if (tool==='hand' || tool==='zoom') {gesture=base;if(tool==='hand')canvas.style.cursor=CURSORS['hand-active'];return;}
    if (state.document.readOnly) {
      if (tool==='select') {const id=renderer.hit(p),t=id&&targetId(id);api.select(t ? [t] : []);} return;
    }
    if(tool==='eyedropper') {
      // Click: copy the clicked object's look to the selection (or to new objects). Alt: apply the selection's look to it. Shift: only the colour under the pointer.
      if(event.shiftKey){api.run(()=>api.eyedropper({mode:'pixel',hex:pixelHex(event)}));return;}
      const hit=renderer.hit(p);if(!hit){api.notify?.('Click a path, shape or text to sample its appearance.');return;}
      api.run(()=>api.eyedropper({mode:event.altKey?'apply':'sample',hitId:hit}));return;
    }
    if(tool==='magic-wand') {
      // Click: every object with a similar fill (Magic Wand options); Shift adds, Alt removes.
      const hit=renderer.hit(p);api.run(()=>api.magicWand(hit,{add:event.shiftKey,subtract:event.altKey}));return;
    }
    if(tool==='lasso'){gesture={...base,mode:'lasso',points:[[p.x,p.y]]};return;}
    if(tool==='shape-builder'){
      const session=api.shapeBuilderSession();if(!session){api.notify?.('Select at least two overlapping shapes for Shape Builder.');return;}
      gesture={...base,mode:'shape-builder',session,points:[[p.x,p.y]]};return;
    }
    if(tool==='knife'||tool==='eraser'){gesture={...base,mode:tool,points:[[p.x,p.y]]};return;}
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
    if(tool==='measure'){api.setMeasure(null);gesture={...base,mode:'measure'};return;}
    if(tool==='group-selection') {
      const hit=renderer.hit(p);
      if(hit){const id=groupSelectionTarget(state.document,hit,state.selection.ids,state.ui.isolation);api.select(event.shiftKey?[...new Set([...state.selection.ids,id])]:[id]);gesture={...base,box:renderer.selectionBounds()};gesture.targets=targets();}
      else{if(!event.shiftKey)api.select([]);gesture={...base,mode:'marquee',initial:state.selection.ids};}
      return;
    }
    if(tool==='gradient') {
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
    if (drag.tool==='hand'){canvas.style.cursor=api.cursor();return;}
    if (drag.tool==='zoom') {if(!drag.scrubbed)api.zoomAt(drag.start,event.altKey || api.zoomOut() ? .8 : 1.25);return;}
    run(()=>{
      if (state.document.readOnly)return;
      if(drag.mode==='pencil') {
        if(moved||drag.points.length>2)api.pencil(drag.points);
      }else if(drag.mode==='free-transform') {
        if(drag.moved)api.freeDistort(drag.session,drag.corners);else api.freeDistortPreview(null);
      }else if(drag.mode==='shape-builder') {
        api.shapeBuilder(drag.session,drag.points,{alt:event.altKey||drag.modifiers.alt});
      }else if(drag.mode==='knife'||drag.mode==='eraser') {
        if(drag.points.length>1&&!api[drag.mode](drag.points))api.notify?.(drag.mode==='knife'?'The knife did not cross a filled shape.':'Nothing to erase there.');
      }else if(drag.mode==='lasso') {
        if(drag.points.length>2)api.lasso(drag.points,{add:drag.modifiers.shift,subtract:drag.modifiers.alt});else if(!drag.modifiers.shift)api.select([]);
      }else if(drag.mode==='measure') {
        if(drag.end)api.setMeasure([drag.start.x,drag.start.y],[drag.end.x,drag.end.y]);
      }else if(drag.mode==='gradient') {
        if(!moved)api.command('paint-gradient');
      }else if(drag.mode==='text-frame') {
        const rectangle=drag.rectangle,frame=moved&&rectangle?.width>=.1&&rectangle?.height>=.1?rectangle:null;
        void api.editText(frame?frame.topLeft:drag.start,null,frame?{width:frame.width,height:frame.height}:drag.tool==='area-type'?{width:60,height:30}:null);
      }else if(TRANSFORM_TOOLS.includes(drag.tool)){
        if(drag.originDrag){if(moved)api.transforms.setOrigin([end.x,end.y]);else api.transforms.setOrigin([drag.start.x,drag.start.y]);}
        else if(moved&&drag.matrix)api.transform(drag.matrix,drag.tool[0].toUpperCase()+drag.tool.slice(1),{ids:drag.ids,copy:drag.modifiers.alt,scaleStrokes:drag.tool==='scale'?(state.ui.transformDefaults?.scale?.scaleStrokes??true):null});
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
        if(drag.tool==='artboard')api.artboards.edit(drag.boardId,transformedBox(drag.box,drag.matrix),{copy:drag.modifiers.alt && !drag.handle});
        else api.transform(drag.matrix,drag.handle==='rotate' ? 'Rotate' : drag.handle ? 'Resize' : 'Move',{copy:drag.modifiers.alt && !drag.handle});
      }
    });
  },events);
  canvas.addEventListener('pointercancel',cancel,events);canvas.addEventListener('lostpointercapture',cancel,events);
  canvas.addEventListener('dblclick',event=>{
    if(TRANSFORM_TOOLS.includes(api.tool())){event.preventDefault();cancel();void api.transformDialog(api.tool());return;}
    // Selection tool: double-click a group to isolate it; double-click empty canvas to leave isolation.
    if(api.tool()!=='select')return;
    const hit=renderer.hit(point(event)),id=hit&&targetId(hit);
    if(id&&state.document.getNode(id)?.type==='text'){void api.editText(point(event),id);return;}
    if(id&&state.document.getNode(id)?.type==='group')api.isolate(id);else if(!hit)api.exitIsolation();
  },events);
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    if(event.ctrlKey || event.metaKey) api.zoomAt(point(event),Math.exp(-event.deltaY*.001*(api.preferences().invertZoom ? -1 : 1)));
    else {scope.view.center=scope.view.center.add(new scope.Point(event.deltaX,event.deltaY).divide(scope.view.zoom));withScope(()=>renderer.updateView());api.status();}
  },{...events,passive:false});
  window.addEventListener('blur',cancel,events);
  return {cancel,busy:()=>!!gesture,
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
