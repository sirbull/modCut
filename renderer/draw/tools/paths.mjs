import { createNode } from '../doc/schema.mjs';
import { updateNode,removeNode,replaceLeaf } from '../doc/commands.mjs';
import { insidePolygon } from '../doc/select-rules.mjs';
import { appearance } from '../geometry.mjs';
import { anchor,reversePath,splitCurve,bendCurve,moveAnchors,deleteAnchors,convertAnchor,constrain } from '../geom/path-editing.mjs';
import { editablePath,editCornerSource,bakeCorners,roundCorners } from '../geom/corners.mjs';
import { shapeSelectionKey } from '../doc/selection.mjs';
import { CURSORS,toolCursor } from './cursors.mjs';

export const PATH_TOOLS=['direct-selection','pen','add-anchor','delete-anchor','anchor-point'];
const same=(a,b)=>a.nodeId===b.nodeId&&a.subpath===b.subpath&&a.segment===b.segment;
const xy=p=>[p.x,p.y];
export function createPathInteractions(canvas,state,api) {
  const {scope,renderer,run,withScope}=api,controller=new AbortController(),events={signal:controller.signal};
  let gesture=null,session=null,previews=[],pointer=null;
  const point=e=>{const b=canvas.getBoundingClientRect();return scope.view.viewToProject(new scope.Point(e.clientX-b.left,e.clientY-b.top));};
  function clear(){for(const item of previews)item.remove();previews=[];renderer.setEditPreview();}
  function cancelDrag(){const previous=gesture;gesture=null;if(previous?.mode==='direct'||previous?.mode==='pen-anchor'||previous?.mode==='pen-bend')canvas.style.cursor=toolCursor(api.tool());withScope(()=>{clear();renderer.requestDraw();});}
  function finish(){cancelDrag();session=null;}
  function selectAnchors(anchors){state.selection.setAnchors(anchors);api.selectionChanged();}
  const spaceId=node=>state.document.getNode(node.id)?renderer.editSpaceId(node.id):api.layerId();
  const localPoint=(node,p)=>renderer.pointToLocal(spaceId(node),p);
  const editNode=id=>structuredClone(renderer.editingNode(id,{logical:false}));
  const descriptor=(id,subpath,segment)=>({nodeId:id,subpath,segment,logical:true,...(state.document.getNode(id).type==='shape'?{shapeKey:shapeSelectionKey(state.document.getNode(id))}:{})});
  function commit(node,label='Edit Path',mergeKey=null) {
    if(state.document.getNode(node.id).type==='shape')state.history.execute(replaceLeaf(node.id,node));
    else state.history.execute(updateNode(node.id,{subpaths:node.subpaths},{label,mergeKey}));
  }
  function addAt(curve){
    if(!curve||curve.t<=1e-6||curve.t>=1-1e-6)return;
    const node=structuredClone(state.document.getNode(curve.nodeId));node.subpaths[curve.subpath]=splitCurve(node.subpaths[curve.subpath],curve.segment,curve.t);commit(node,'Add Anchor');
    selectAnchors([{...curve,segment:curve.segment+1}]);
  }
  function validSession(){if(session){const node=state.document.getNode(session.id);if(!state.document.isEditable(session.id)||!node?.subpaths[session.subpath]||node.subpaths[session.subpath].closed)session=null;}return session;}
  // Direction handles of the anchor being drawn, in the layer color at constant screen size.
  function handleItems(node,subpath,index){
    const s=node.subpaths[subpath]?.segments[index];if(!s)return [];
    const id=state.document.getNode(node.id)?node.id:spaceId(node),color=renderer.layerColor(id),z=scope.view.zoom,world=v=>renderer.pointToWorld(id,v),p=world(s.p),items=[];
    for(const key of ['in','out'])if(Math.hypot(...s[key])>1e-9){const end=world(s.p.map((n,i)=>n+s[key][i]));
      items.push(new scope.Path.Line({from:p,to:end,strokeColor:color,strokeWidth:1/z,insert:false}),new scope.Path.Circle({center:end,radius:3/z,fillColor:'#FFFFFF',strokeColor:color,strokeWidth:1/z,insert:false}));}
    items.push(new scope.Path.Rectangle({rectangle:new scope.Rectangle(p.subtract(3/z),new scope.Size(6/z,6/z)),fillColor:color,insert:false}));
    return items;
  }
  function preview(nodes,handles=null){withScope(()=>{clear();for(const node of nodes){const item=renderer.shapePreview(node,spaceId(node));item.opacity=node.opacity;previews.push(item);
    const outline=item.clone();outline.opacity=1;outline.fillColor=null;outline.dashArray=[];outline.strokeColor=renderer.layerColor(state.document.getNode(node.id)?node.id:spaceId(node));outline.strokeScaling=false;outline.strokeWidth=1;previews.push(outline);}
    for(const h of Array.isArray(handles)?handles:handles?[handles]:[])for(const item of handleItems(h.node,h.subpath,h.index)){scope.project.layers.at(-1).addChild(item);previews.push(item);}
    renderer.setEditPreview(nodes);scope.view.update();});}
  function cornerSelection(){return renderer.cornerWidgets().map(({nodeId,subpath,segment})=>descriptor(nodeId,subpath,segment));}
  function roundedNodes(anchors,radius){
    return [...new Set(anchors.map(a=>a.nodeId))].map(id=>{const node=editNode(id);
      for(const subpath of new Set(anchors.filter(a=>a.nodeId===id).map(a=>a.subpath)))node.subpaths[subpath]=roundCorners(node.subpaths[subpath],anchors.filter(a=>a.nodeId===id&&a.subpath===subpath).map(a=>a.segment),radius);
      return node;
    });
  }
  function deleteSelected(anchors=state.selection.anchors,{bridge=true}={}){
    if(!anchors.length)return false;
    finish();state.history.transaction('Delete Anchors',()=>{
      for(const id of new Set(anchors.map(a=>a.nodeId))){const node=editNode(id),subpaths=deleteAnchors(node.subpaths,anchors.filter(a=>a.nodeId===id),{bridge});
        if(subpaths.length)commit({...node,subpaths},'Delete Anchors');else state.history.execute(removeNode(id));}
    });api.select(state.selection.ids);return true;
  }
  function down(e){
    if(e.button!==0||!PATH_TOOLS.includes(api.tool())||state.document.readOnly)return;
    e.stopImmediatePropagation();canvas.focus();api.closeMenus();canvas.setPointerCapture(e.pointerId);
    const p=point(e),tool=api.tool();
    clear();
    if(tool==='direct-selection'){
      const corner=renderer.cornerHandle(p);if(corner){const anchors=e.altKey?[descriptor(corner.nodeId,corner.subpath,corner.segment)]:cornerSelection();
        selectAnchors(anchors);gesture={mode:'corner',hit:corner,anchors,start:p,last:p,radius:corner.corner.radius,before:[...new Set(anchors.map(a=>a.nodeId))].map(editNode)};return;}
    }
    const hit=withScope(()=>renderer.pathHit(p,{handles:tool==='direct-selection'||tool==='pen',shapes:tool==='direct-selection',logical:tool!=='pen'}));
    if(tool==='pen'&&e.altKey){
      // Check anchors before handles: a short handle must not hide the point.
      const at=withScope(()=>renderer.pathHit(p,{handles:false}));
      const curve=!at&&!hit&&withScope(()=>renderer.curveHit(p));
      if(at||curve&&curve.t>0&&curve.t<1){
        const target=at??curve,node=editNode(target.nodeId),subpath=target.subpath;
        node.subpaths[subpath]=bakeCorners(node.subpaths[subpath]);
        gesture={mode:at?'pen-anchor':'pen-bend',node,before:structuredClone(node),subpath,index:target.segment,t:curve?.t,start:p,last:p};
        const next=(target.segment+1)%node.subpaths[subpath].segments.length;
        selectAnchors([target,...(at?[]:[{nodeId:node.id,subpath,segment:next}])].map(({nodeId,subpath,segment})=>({nodeId,subpath,segment})));
        canvas.style.cursor=CURSORS[at?'anchor-convert':'bend-curve'];
        return;
      }
    }
    if(tool==='add-anchor') {
      addAt(renderer.curveHit(p));return;
    }
    if(tool==='delete-anchor'){if(hit)run(()=>deleteSelected([hit]));return;}
    if(tool==='anchor-point') {
      if(hit){const node=editNode(hit.nodeId),path=node.subpaths[hit.subpath],s=editablePath(path).segments[hit.segment];
        node.subpaths[hit.subpath]=convertAnchor(path,hit.segment,!Math.hypot(...s.in,...s.out));
        gesture={mode:'convert',hit,node,subpath:hit.subpath,index:hit.segment,start:p,last:p};selectAnchors([hit]);
      }else {const id=withScope(()=>renderer.hit(p));if(state.document.getNode(id)?.type==='shape')run(()=>{state.history.execute(replaceLeaf(id,renderer.expandedShape(id)));api.select([id]);});}
      return;
    }
    if(tool==='direct-selection') {
      if(hit){const existing=state.selection.anchors,has=existing.some(a=>same(a,hit));
        if(hit.kind==='point')selectAnchors(e.shiftKey?(has?existing.filter(a=>!same(a,hit)):[...existing,hit]):has?existing:[hit]);
        if(!state.selection.anchors.some(a=>same(a,hit)))return;
        gesture={mode:'direct',hit,start:p,last:p,singleOnClick:hit.kind==='point'&&!e.shiftKey,nodes:[...new Set(state.selection.anchors.map(a=>a.nodeId))].map(editNode),anchors:state.selection.anchors};
      } else {
        const curve=withScope(()=>renderer.curveHit(p,{shapes:true})),filledId=curve?null:renderer.hit(p),id=curve?.nodeId??filledId,subpath=curve?.subpath??0,node=id&&renderer.editingNode(id);
        if(node?.type==='path'){const path=node.subpaths[subpath];
          const anchors=path.segments.map((_,segment)=>descriptor(id,subpath,segment));selectAnchors(e.shiftKey?[...state.selection.anchors.filter(a=>a.nodeId!==id||a.subpath!==subpath),...anchors]:anchors);
          gesture={mode:'direct',hit:{nodeId:id,subpath,kind:'point',logical:true},start:p,last:p,nodes:[...new Set(state.selection.anchors.map(a=>a.nodeId))].map(editNode),anchors:state.selection.anchors};
        }else {if(!e.shiftKey)api.select([]);gesture={mode:'marquee',start:p,last:p,initial:state.selection.anchors,shift:e.shiftKey};}
      }return;
    }
    // Pen resumes either endpoint; reversing happens only in the committed edit.
    if(hit&&hit.kind!=='point'){
      gesture={mode:'direct',hit,start:p,last:p,nodes:[structuredClone(state.document.getNode(hit.nodeId))],anchors:state.selection.anchors};return;
    }
    validSession();let node,subpath,closing=false;
    if(session){node=structuredClone(state.document.getNode(session.id));subpath=session.subpath;
      node.subpaths[subpath]=bakeCorners(node.subpaths[subpath]);
      if(session.reverse)node.subpaths[subpath]=reversePath(node.subpaths[subpath]);
      const index=session.reverse&&hit?.nodeId===node.id&&hit.subpath===subpath?node.subpaths[subpath].segments.length-1-hit.segment:hit?.segment;
      closing=hit?.nodeId===node.id&&hit.subpath===subpath&&index===0&&node.subpaths[subpath].segments.length>=2;
      if(hit?.nodeId===node.id&&hit.subpath===subpath&&index===node.subpaths[subpath].segments.length-1){
        gesture={mode:'pen-handle',node,subpath,index,start:p,last:p};return;
      }
    }else {
      const endpoint=withScope(()=>renderer.pathHit(p,{handles:false,endpoints:true}));
      if(endpoint){node=structuredClone(state.document.getNode(endpoint.nodeId));subpath=endpoint.subpath;
        node.subpaths[subpath]=bakeCorners(node.subpaths[subpath]);
        if(endpoint.segment===0)node.subpaths[subpath]=reversePath(node.subpaths[subpath]);
        session={id:node.id,subpath,reverse:endpoint.segment===0};gesture={mode:'pen-handle',node,subpath,index:node.subpaths[subpath].segments.length-1,start:p,last:p,resume:true};api.select([node.id]);return;
      }
      if(hit){selectAnchors([hit]);return;}
      const curve=renderer.curveHit(p);if(curve){addAt(curve);return;}
      node=createNode('path',{name:'Path',appearance:appearance(state.ui.fill,state.ui.stroke,state.ui.strokeWidth),subpaths:[{closed:false,segments:[]}]});subpath=0;
    }
    const path=node.subpaths[subpath],previous=path.segments.at(-1);
    let position=xy(p);if(e.shiftKey&&previous)position=xy(renderer.pointToWorld(node.id,previous.p));
    // Store parent-local coordinates even when the destination layer is transformed.
    if(e.shiftKey&&previous)position=constrain(xy(p),position);else position=xy(p);
    const local=xy(localPoint(node,new scope.Point(...position)));
    if(closing)path.closed=true;else path.segments.push(anchor(local));
    gesture={mode:'pen',node,subpath,index:closing?0:path.segments.length-1,start:new scope.Point(...position),last:p,closing};
    preview([node]);
  }
  function update(e){
    if(!gesture){
      if(!PATH_TOOLS.includes(api.tool())||state.document.readOnly)return;
      e.stopImmediatePropagation();const p=point(e);api.status(p);clear();
      const tool=api.tool(),corner=tool==='direct-selection'&&renderer.cornerHandle(p),hit=renderer.pathHit(p,{handles:['direct-selection','pen'].includes(tool),shapes:tool==='direct-selection',logical:tool!=='pen'});
      const tool0=api.tool(),base={'add-anchor':'anchor-add','delete-anchor':'anchor-remove','anchor-point':'anchor-convert'}[tool0]??'direct';
      canvas.style.cursor=CURSORS[corner?'corner':hit&&tool0==='direct-selection'?(hit.kind==='point'?'direct-anchor':'direct-segment'):base];
      if(api.tool()==='pen') {
        const at=e.altKey&&renderer.pathHit(p,{handles:false}),altCurve=e.altKey&&!at&&!hit&&renderer.curveHit(p);
        if(at||altCurve&&altCurve.t>0&&altCurve.t<1){
          canvas.dataset.pathAction=at?'convert-anchor':'bend-curve';
          canvas.style.cursor=CURSORS[at?'anchor-convert':'bend-curve'];
          scope.view.update();return;
        }
        const current=validSession(),node=current&&state.document.getNode(current.id),first=current?.reverse?node.subpaths[current.subpath].segments.length-1:0;
        const closing=current&&hit?.nodeId===current.id&&hit.subpath===current.subpath&&hit.segment===first&&node.subpaths[current.subpath].segments.length>1;
        const endpoint=!current&&renderer.pathHit(p,{handles:false,endpoints:true}),curve=!current&&!hit&&!endpoint&&renderer.curveHit(p);
        canvas.dataset.pathAction=closing?'close':endpoint?'continue':curve?'add-anchor':'draw';
        const last=current&&hit?.nodeId===current.id&&hit.subpath===current.subpath&&hit.segment===(current.reverse?0:node.subpaths[current.subpath].segments.length-1);
        canvas.style.cursor=CURSORS[closing?'pen-close':endpoint?'pen-continue':curve?'pen-add':last?'pen-convert':hit?'direct-anchor':current?'pen-active':'pen-new'];
      }
      if(api.tool()==='pen'&&validSession()){
        const node=structuredClone(state.document.getNode(session.id)),path=node.subpaths[session.subpath];if(session.reverse)node.subpaths[session.subpath]=reversePath(path);
        const current=node.subpaths[session.subpath],origin=renderer.pointToWorld(node.id,current.segments.at(-1).p);
        const end=e.shiftKey?new scope.Point(...constrain(xy(p),xy(origin))):p;
        current.segments.push(anchor(xy(renderer.pointToLocal(node.id,end))));preview([node],{node,subpath:session.subpath,index:current.segments.length-2});
      }else scope.view.update();return;
    }
    e.stopImmediatePropagation();const p=point(e),g=gesture;api.status(p);
    withScope(()=>{
      if(g.mode==='marquee') {
        clear();const item=new scope.Path.Rectangle({rectangle:new scope.Rectangle(g.start,p),insert:false,strokeColor:'#006B5C',strokeWidth:1/scope.view.zoom});
        scope.project.layers.at(-1).addChild(item);previews=[item];scope.view.update();
      }else if(g.mode==='corner') {
        const delta=renderer.editPointToLocal(g.hit.nodeId,p).subtract(renderer.editPointToLocal(g.hit.nodeId,g.start)),c=g.hit.corner;
        g.radius=Math.max(0,c.radius+(delta.x*c.bisector[0]+delta.y*c.bisector[1])*c.sin);
        g.result=roundedNodes(g.anchors,g.radius);preview(g.result);
      }else if(g.mode==='pen-anchor') {
        const s=g.node.subpaths[g.subpath].segments[g.index],origin=renderer.editPointToWorld(g.node.id,s.p);
        const end=e.shiftKey?new scope.Point(...constrain(xy(p),xy(origin))):p;
        const local=renderer.editPointToLocal(g.node.id,end),v=xy(local).map((n,i)=>n-s.p[i]);
        if(p.getDistance(g.start)>2/scope.view.zoom||g.dragged){s.out=v;s.in=v.map(n=>-n);g.dragged=true;}
        preview([g.node],{node:g.node,subpath:g.subpath,index:g.index});
      }else if(g.mode==='pen-bend') {
        const delta=renderer.editPointToLocal(g.node.id,p).subtract(renderer.editPointToLocal(g.node.id,g.start));
        g.node.subpaths[g.subpath]=bendCurve(g.before.subpaths[g.subpath],g.index,g.t,xy(delta));
        g.dragged=p.getDistance(g.start)>2/scope.view.zoom;
        const next=(g.index+1)%g.node.subpaths[g.subpath].segments.length;
        preview([g.node],[g.index,next].map(index=>({node:g.node,subpath:g.subpath,index})));
      }else if(g.mode==='direct') {
        canvas.style.cursor=CURSORS['direct-move'];
        let delta=p.subtract(g.start);if(e.shiftKey&&g.hit.kind==='point'){if(Math.abs(delta.x)>Math.abs(delta.y))delta.y=0;else delta.x=0;}
        g.result=g.nodes.map(original=>{const node=structuredClone(original),local=renderer.editPointToLocal(node.id,g.start.add(delta)).subtract(renderer.editPointToLocal(node.id,g.start));
          if(g.hit.kind==='point')node.subpaths=moveAnchors(node.subpaths,g.anchors.filter(a=>a.nodeId===node.id),xy(local));
          else if(node.id===g.hit.nodeId){const data=node.subpaths[g.hit.subpath],path=g.hit.logical?editablePath(data):bakeCorners(data),s=path.segments[g.hit.segment],kind=g.hit.kind;
            const origin=renderer.editPointToWorld(node.id,s.p);let end=renderer.editPointToWorld(node.id,s.p.map((n,i)=>n+s[kind][i])).add(delta);
            if(e.shiftKey)end=new scope.Point(...constrain(xy(end),xy(origin)));
            const v=xy(renderer.editPointToLocal(node.id,end)).map((n,i)=>n-s.p[i]);
            const edit=logical=>{const s=logical.segments[g.hit.segment];s[kind]=v;
              if(!e.altKey){const other=kind==='in'?'out':'in',length=Math.hypot(...s[other]),r=Math.hypot(...v);if(r&&length)s[other]=v.map(n=>-n/r*length);}};
            if(g.hit.logical)node.subpaths[g.hit.subpath]=editCornerSource(data,edit);else {edit(path);node.subpaths[g.hit.subpath]=path;}
          }return node;
        });preview(g.result);
      }else {
        const data=g.node.subpaths[g.subpath],s=(g.mode==='convert'?editablePath(data):data).segments[g.index];
        if(api.tool()==='hand'){const delta=p.subtract(g.last),a=localPoint(g.node,g.last),b=localPoint(g.node,p);s.p=s.p.map((v,i)=>v+xy(b.subtract(a))[i]);g.start=g.start.add(delta);}
        else {let end=xy(p);if(e.shiftKey)end=constrain(end,xy(g.start));
          const at=localPoint(g.node,new scope.Point(...end)),v=xy(at).map((n,i)=>n-s.p[i]);
          if(p.getDistance(g.start)>2/scope.view.zoom||g.dragged){s.out=v;if(!e.altKey)s.in=v.map(n=>-n);g.dragged=true;}
        }
        if(g.mode==='convert')g.node.subpaths[g.subpath]=editCornerSource(data,path=>{path.segments[g.index]=structuredClone(s);});
        preview([g.node],{node:g.node,subpath:g.subpath,index:g.index});
      }
    });g.last=p;
  }
  function up(e){
    if(!gesture)return;e.stopImmediatePropagation();if(point(e).getDistance(gesture.last)>1e-8)update(e);
    const g=gesture;cancelDrag();run(()=>{
      if(g.mode==='pen-anchor'||g.mode==='pen-bend'){
        if(g.dragged&&JSON.stringify(g.node.subpaths)!==JSON.stringify(g.before.subpaths))commit(g.node,g.mode==='pen-anchor'?'Convert Anchor':'Bend Curve');
        api.selectionChanged();update(e);return;
      }
      if(g.mode==='marquee') {
        const rectangle=new scope.Rectangle(g.start,point(e)),anchors=[];
        for(const original of state.document.descendants(null)){if(!['path','shape'].includes(original.type)||!state.document.isEditable(original.id))continue;
          const node=renderer.editingNode(original.id);node.subpaths.forEach((path,subpath)=>path.segments.forEach((s,segment)=>{if(rectangle.contains(renderer.editPointToWorld(node.id,s.p)))anchors.push(descriptor(node.id,subpath,segment));}));}
        selectAnchors([...g.initial,...anchors.filter(a=>!g.initial.some(b=>same(a,b)))]);return;
      }
      if(g.mode==='direct'||g.mode==='corner'){
        if(g.singleOnClick&&g.last.getDistance(g.start)<=2/scope.view.zoom)selectAnchors([g.hit]);
        const before=g.before??g.nodes,changed=g.result?.filter(node=>JSON.stringify(node.subpaths)!==JSON.stringify(before.find(n=>n.id===node.id).subpaths));
        if(changed?.length&&g.last.getDistance(g.start)>2/scope.view.zoom){const label=g.mode==='corner'?'Round Corners':'Move Anchors';state.history.transaction(label,()=>changed.forEach(node=>commit(node,label)));}api.selectionChanged();return;
      }
      if(g.mode==='pen-handle'&&!g.dragged){selectAnchors([{nodeId:g.node.id,subpath:g.subpath,segment:g.index}]);return;}
      if(state.document.getNode(g.node.id))commit(g.node,g.mode==='convert'?'Convert Anchor':'Pen');
      else api.insertNew(g.node,{space:false});
      if(g.mode.startsWith('pen'))session=g.closing?null:{id:g.node.id,subpath:g.subpath};
      selectAnchors([{nodeId:g.node.id,subpath:g.subpath,segment:g.index??g.hit.segment}]);
    });
  }
  canvas.addEventListener('pointerdown',e=>run(()=>down(e)),events);canvas.addEventListener('pointermove',e=>{pointer={clientX:e.clientX,clientY:e.clientY};run(()=>update(e));},events);canvas.addEventListener('pointerup',e=>run(()=>up(e)),events);
  canvas.addEventListener('pointerleave',()=>{pointer=null;},events);
  // Option can be pressed or released while the mouse is stationary.
  const modifiers=e=>{if(e.key!=='Alt'||gesture||!pointer||api.tool()!=='pen'||!canvas.matches(':hover'))return;
    run(()=>update({...pointer,altKey:e.altKey,shiftKey:e.shiftKey,stopImmediatePropagation(){}}));};
  canvas.addEventListener('pointercancel',cancelDrag,events);canvas.addEventListener('lostpointercapture',cancelDrag,events);window.addEventListener('blur',cancelDrag,events);
  /** Lasso: anchors of editable paths and shapes inside the freehand polygon; Shift adds, Alt removes. */
  function lasso(polygon,{add=false,subtract=false}={}){
    const inside=[];
    for(const original of state.document.descendants(null)){if(!['path','shape'].includes(original.type)||!state.document.isEditable(original.id))continue;
      const node=renderer.editingNode(original.id);node.subpaths.forEach((path,subpath)=>path.segments.forEach((s,segment)=>{const w=renderer.editPointToWorld(node.id,s.p);if(insidePolygon([w.x,w.y],polygon))inside.push(descriptor(node.id,subpath,segment));}));}
    const existing=state.selection.anchors??[];
    selectAnchors(subtract?existing.filter(a=>!inside.some(b=>same(a,b))):add?[...existing,...inside.filter(a=>!existing.some(b=>same(a,b)))]:inside);
    return inside.length;
  }
  /** Select > Object > Direction Handles: every anchor with a handle in the selected paths and shapes, so all handles show. */
  function directionHandles(ids){
    const anchors=[];
    for(const id of ids){const original=state.document.getNode(id);if(!['path','shape'].includes(original?.type)||!state.document.isEditable(id))continue;
      renderer.editingNode(id).subpaths.forEach((path,subpath)=>path.segments.forEach((s,segment)=>{if(Math.hypot(...s.in)+Math.hypot(...s.out)>0)anchors.push(descriptor(id,subpath,segment));}));}
    selectAnchors(anchors);return anchors.length;
  }
  return {
    modifiers,
    lasso,
    directionHandles,
    finish,
    cornerInfo(){const anchors=cornerSelection();if(!anchors.length)return null;const values=renderer.cornerWidgets().map(c=>c.corner.radius);return {count:anchors.length,radius:values.every(r=>Math.abs(r-values[0])<1e-9)?values[0]:null};},
    setCornerRadius(radius){if(state.document.readOnly)return;const anchors=cornerSelection();if(!anchors.length)return;
      const nodes=roundedNodes(anchors,radius);if(nodes.every(n=>JSON.stringify(n.subpaths)===JSON.stringify(editNode(n.id).subpaths)))return;
      state.history.transaction('Round Corners',()=>nodes.forEach(node=>commit(node,'Round Corners')));selectAnchors(anchors);
    },
    documentChanged(){cancelDrag();validSession();},
    handle(command){
      if(command==='cancel'){if(gesture)cancelDrag();else finish();return PATH_TOOLS.includes(state.ui.tool);}
      if(command==='tool-dialog'&&state.ui.tool==='pen'){finish();return true;}
      // Delete opens the path at the anchor; Shift+Delete joins its neighbours and keeps the shape closed.
      if((command==='delete'||command==='delete-keep-closed')&&state.ui.tool==='direct-selection'&&!state.document.readOnly)return deleteSelected(undefined,{bridge:command==='delete-keep-closed'});
      return false;
    },
    nudge(x,y){const anchors=state.selection.anchors;if(state.ui.tool!=='direct-selection'||!anchors.length)return false;
      state.history.transaction('Nudge Anchors',()=>{for(const id of new Set(anchors.map(a=>a.nodeId))){const node=editNode(id),a=renderer.editPointToLocal(id,new scope.Point(0,0)),b=renderer.editPointToLocal(id,new scope.Point(x,y));commit({...node,subpaths:moveAnchors(node.subpaths,anchors.filter(a=>a.nodeId===id),xy(b.subtract(a)))},'Nudge Anchors','anchor-nudge');}});api.selectionChanged();return true;
    },
    destroy(){finish();controller.abort();},
  };
}
