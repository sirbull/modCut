import { createNode } from '../doc/schema.mjs';
import { insertNode,updateNode,removeNode,replaceLeaf } from '../doc/commands.mjs';
import { appearance } from '../geometry.mjs';
import { anchor,reversePath,splitCurve,moveAnchors,deleteAnchors,convertAnchor,constrain } from '../geom/path-editing.mjs';

export const PATH_TOOLS=['direct-selection','pen','add-anchor','delete-anchor','anchor-point'];
const same=(a,b)=>a.nodeId===b.nodeId&&a.subpath===b.subpath&&a.segment===b.segment;
const xy=p=>[p.x,p.y];
export function createPathInteractions(canvas,state,api) {
  const {scope,renderer,run,withScope}=api,controller=new AbortController(),events={signal:controller.signal};
  let gesture=null,session=null,previews=[];
  const point=e=>{const b=canvas.getBoundingClientRect();return scope.view.viewToProject(new scope.Point(e.clientX-b.left,e.clientY-b.top));};
  function clear(){for(const item of previews)item.remove();previews=[];}
  function cancelDrag(){gesture=null;withScope(()=>{clear();scope.view.update();});}
  function finish(){cancelDrag();session=null;}
  function selectAnchors(anchors){state.selection.setAnchors(anchors);api.selectionChanged();}
  const spaceId=node=>state.document.getNode(node.id)?node.id:api.layerId();
  const localPoint=(node,p)=>renderer.pointToLocal(spaceId(node),p);
  function commit(node,label='Edit Path') {state.history.execute(updateNode(node.id,{subpaths:node.subpaths},{label}));}
  function addAt(curve){
    if(!curve||curve.t<=1e-6||curve.t>=1-1e-6)return;
    const node=structuredClone(state.document.getNode(curve.nodeId));node.subpaths[curve.subpath]=splitCurve(node.subpaths[curve.subpath],curve.segment,curve.t);commit(node,'Add Anchor');
    selectAnchors([{...curve,segment:curve.segment+1}]);
  }
  function validSession(){if(session){const node=state.document.getNode(session.id);if(!state.document.isEditable(session.id)||!node?.subpaths[session.subpath]||node.subpaths[session.subpath].closed)session=null;}return session;}
  function preview(nodes){withScope(()=>{clear();for(const node of nodes)previews.push(renderer.shapePreview(node,spaceId(node)));scope.view.update();});}
  function deleteSelected(anchors=state.selection.anchors){
    if(!anchors.length)return false;
    finish();state.history.transaction('Delete Anchors',()=>{
      for(const id of new Set(anchors.map(a=>a.nodeId))){const node=state.document.getNode(id),subpaths=deleteAnchors(node.subpaths,anchors.filter(a=>a.nodeId===id));
        state.history.execute(subpaths.length?updateNode(id,{subpaths},{label:'Delete Anchors'}):removeNode(id));}
    });api.select(state.selection.ids);return true;
  }
  function down(e){
    if(e.button!==0||!PATH_TOOLS.includes(api.tool())||state.document.readOnly)return;
    e.stopImmediatePropagation();canvas.focus();api.closeMenus();canvas.setPointerCapture(e.pointerId);
    const p=point(e),tool=api.tool(),hit=withScope(()=>renderer.pathHit(p,{handles:tool==='direct-selection'||tool==='pen'}));
    if(tool==='add-anchor') {
      addAt(renderer.curveHit(p));return;
    }
    if(tool==='delete-anchor'){if(hit)run(()=>deleteSelected([hit]));return;}
    if(tool==='anchor-point') {
      if(hit){const node=structuredClone(state.document.getNode(hit.nodeId)),path=node.subpaths[hit.subpath],s=path.segments[hit.segment];
        node.subpaths[hit.subpath]=convertAnchor(path,hit.segment,!Math.hypot(...s.in,...s.out));
        gesture={mode:'convert',hit,node,subpath:hit.subpath,index:hit.segment,start:p,last:p};selectAnchors([hit]);
      }else {const id=withScope(()=>renderer.hit(p));if(state.document.getNode(id)?.type==='shape')run(()=>{state.history.execute(replaceLeaf(id,renderer.expandedShape(id)));api.select([id]);});}
      return;
    }
    if(tool==='direct-selection') {
      if(hit){const existing=state.selection.anchors,has=existing.some(a=>same(a,hit));
        if(hit.kind==='point')selectAnchors(e.shiftKey?(has?existing.filter(a=>!same(a,hit)):[...existing,hit]):has?existing:[hit]);
        if(!state.selection.anchors.some(a=>same(a,hit)))return;
        gesture={mode:'direct',hit,start:p,last:p,nodes:[...new Set(state.selection.anchors.map(a=>a.nodeId))].map(id=>structuredClone(state.document.getNode(id))),anchors:state.selection.anchors};
      } else {
        const curve=withScope(()=>renderer.curveHit(p));
        if(curve){const path=state.document.getNode(curve.nodeId).subpaths[curve.subpath];
          const anchors=path.segments.map((_,segment)=>({nodeId:curve.nodeId,subpath:curve.subpath,segment}));selectAnchors(e.shiftKey?[...state.selection.anchors.filter(a=>a.nodeId!==curve.nodeId||a.subpath!==curve.subpath),...anchors]:anchors);
          gesture={mode:'direct',hit:{...curve,kind:'point'},start:p,last:p,nodes:[...new Set(state.selection.anchors.map(a=>a.nodeId))].map(id=>structuredClone(state.document.getNode(id))),anchors:state.selection.anchors};
        }else {if(!e.shiftKey)api.select([]);gesture={mode:'marquee',start:p,last:p,initial:state.selection.anchors,shift:e.shiftKey};}
      }return;
    }
    // Pen resumes either endpoint; reversing happens only in the committed edit.
    if(hit&&hit.kind!=='point'){
      gesture={mode:'direct',hit,start:p,last:p,nodes:[structuredClone(state.document.getNode(hit.nodeId))],anchors:state.selection.anchors};return;
    }
    validSession();let node,subpath,closing=false;
    if(session){node=structuredClone(state.document.getNode(session.id));subpath=session.subpath;
      if(session.reverse)node.subpaths[subpath]=reversePath(node.subpaths[subpath]);
      const index=session.reverse&&hit?.nodeId===node.id&&hit.subpath===subpath?node.subpaths[subpath].segments.length-1-hit.segment:hit?.segment;
      closing=hit?.nodeId===node.id&&hit.subpath===subpath&&index===0&&node.subpaths[subpath].segments.length>=2;
      if(hit?.nodeId===node.id&&hit.subpath===subpath&&index===node.subpaths[subpath].segments.length-1){
        gesture={mode:'pen-handle',node,subpath,index,start:p,last:p};return;
      }
    }else {
      const endpoint=withScope(()=>renderer.pathHit(p,{handles:false,endpoints:true}));
      if(endpoint){node=structuredClone(state.document.getNode(endpoint.nodeId));subpath=endpoint.subpath;
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
      const hit=renderer.pathHit(p,{handles:['direct-selection','pen'].includes(api.tool())});
      canvas.style.cursor=hit?'pointer':'crosshair';
      if(api.tool()==='pen') {
        const current=validSession(),node=current&&state.document.getNode(current.id),first=current?.reverse?node.subpaths[current.subpath].segments.length-1:0;
        const closing=current&&hit?.nodeId===current.id&&hit.subpath===current.subpath&&hit.segment===first&&node.subpaths[current.subpath].segments.length>1;
        const endpoint=!current&&renderer.pathHit(p,{handles:false,endpoints:true}),curve=!current&&!hit&&!endpoint&&renderer.curveHit(p);
        canvas.dataset.pathAction=closing?'close':endpoint?'continue':curve?'add-anchor':'draw';
        canvas.style.cursor=closing?'cell':endpoint?'alias':curve?'copy':hit?'pointer':'crosshair';
      }
      if(api.tool()==='pen'&&validSession()){
        const node=structuredClone(state.document.getNode(session.id)),path=node.subpaths[session.subpath];if(session.reverse)node.subpaths[session.subpath]=reversePath(path);
        const current=node.subpaths[session.subpath],origin=renderer.pointToWorld(node.id,current.segments.at(-1).p);
        const end=e.shiftKey?new scope.Point(...constrain(xy(p),xy(origin))):p;
        current.segments.push(anchor(xy(renderer.pointToLocal(node.id,end))));preview([node]);
      }else scope.view.update();return;
    }
    e.stopImmediatePropagation();const p=point(e),g=gesture;api.status(p);
    withScope(()=>{
      if(g.mode==='marquee') {
        clear();const item=new scope.Path.Rectangle({rectangle:new scope.Rectangle(g.start,p),insert:false,strokeColor:'#006B5C',strokeWidth:1/scope.view.zoom});
        scope.project.layers.at(-1).addChild(item);previews=[item];scope.view.update();
      }else if(g.mode==='direct') {
        let delta=p.subtract(g.start);if(e.shiftKey&&g.hit.kind==='point'){if(Math.abs(delta.x)>Math.abs(delta.y))delta.y=0;else delta.x=0;}
        g.result=g.nodes.map(original=>{const node=structuredClone(original),local=renderer.pointToLocal(node.id,g.start.add(delta)).subtract(renderer.pointToLocal(node.id,g.start));
          if(g.hit.kind==='point')node.subpaths=moveAnchors(node.subpaths,g.anchors.filter(a=>a.nodeId===node.id),xy(local));
          else if(node.id===g.hit.nodeId){const s=node.subpaths[g.hit.subpath].segments[g.hit.segment],kind=g.hit.kind;
            const origin=renderer.pointToWorld(node.id,s.p);let end=renderer.pointToWorld(node.id,s.p.map((n,i)=>n+s[kind][i])).add(delta);
            if(e.shiftKey)end=new scope.Point(...constrain(xy(end),xy(origin)));
            const v=xy(renderer.pointToLocal(node.id,end)).map((n,i)=>n-s.p[i]);s[kind]=v;
            if(!e.altKey){const other=kind==='in'?'out':'in',length=Math.hypot(...s[other]),r=Math.hypot(...v);if(r&&length)s[other]=v.map(n=>-n/r*length);}
          }return node;
        });preview(g.result);
      }else {
        const s=g.node.subpaths[g.subpath].segments[g.index];
        if(api.tool()==='hand'){const delta=p.subtract(g.last),a=localPoint(g.node,g.last),b=localPoint(g.node,p);s.p=s.p.map((v,i)=>v+xy(b.subtract(a))[i]);g.start=g.start.add(delta);}
        else {let end=xy(p);if(e.shiftKey)end=constrain(end,xy(g.start));
          const at=localPoint(g.node,new scope.Point(...end)),v=xy(at).map((n,i)=>n-s.p[i]);
          if(p.getDistance(g.start)>2/scope.view.zoom||g.dragged){s.out=v;if(!e.altKey)s.in=v.map(n=>-n);g.dragged=true;}
        }
        preview([g.node]);
      }
    });g.last=p;
  }
  function up(e){
    if(!gesture)return;e.stopImmediatePropagation();if(point(e).getDistance(gesture.last)>1e-8)update(e);
    const g=gesture;cancelDrag();run(()=>{
      if(g.mode==='marquee') {
        const rectangle=new scope.Rectangle(g.start,point(e)),anchors=[];
        for(const node of state.document.descendants(null)){if(node.type!=='path'||!state.document.isEditable(node.id))continue;
          node.subpaths.forEach((path,subpath)=>path.segments.forEach((s,segment)=>{if(rectangle.contains(renderer.pointToWorld(node.id,s.p)))anchors.push({nodeId:node.id,subpath,segment});}));}
        selectAnchors([...g.initial,...anchors.filter(a=>!g.initial.some(b=>same(a,b)))]);return;
      }
      if(g.mode==='direct'){if(g.result&&g.last.getDistance(g.start)>1e-8)state.history.transaction('Move Anchors',()=>g.result.forEach(node=>commit(node,'Move Anchors')));api.selectionChanged();return;}
      if(g.mode==='pen-handle'&&!g.dragged){selectAnchors([{nodeId:g.node.id,subpath:g.subpath,segment:g.index}]);return;}
      if(state.document.getNode(g.node.id))commit(g.node,g.mode==='convert'?'Convert Anchor':'Pen');
      else state.history.execute(insertNode(api.layerId(),g.node));
      if(g.mode.startsWith('pen'))session=g.closing?null:{id:g.node.id,subpath:g.subpath};
      selectAnchors([{nodeId:g.node.id,subpath:g.subpath,segment:g.index??g.hit.segment}]);
    });
  }
  canvas.addEventListener('pointerdown',e=>run(()=>down(e)),events);canvas.addEventListener('pointermove',e=>run(()=>update(e)),events);canvas.addEventListener('pointerup',e=>run(()=>up(e)),events);
  canvas.addEventListener('pointercancel',cancelDrag,events);canvas.addEventListener('lostpointercapture',cancelDrag,events);window.addEventListener('blur',cancelDrag,events);
  return {
    finish,
    documentChanged(){cancelDrag();validSession();},
    handle(command){
      if(command==='cancel'){if(gesture)cancelDrag();else finish();return PATH_TOOLS.includes(state.ui.tool);}
      if(command==='tool-dialog'&&state.ui.tool==='pen'){finish();return true;}
      if(command==='delete'&&state.ui.tool==='direct-selection'&&!state.document.readOnly)return deleteSelected();
      return false;
    },
    nudge(x,y){const anchors=state.selection.anchors;if(state.ui.tool!=='direct-selection'||!anchors.length)return false;
      state.history.transaction('Nudge Anchors',()=>{for(const id of new Set(anchors.map(a=>a.nodeId))){const node=state.document.getNode(id),a=renderer.pointToLocal(id,new scope.Point(0,0)),b=renderer.pointToLocal(id,new scope.Point(x,y));state.history.execute(updateNode(id,{subpaths:moveAnchors(node.subpaths,anchors.filter(a=>a.nodeId===id),xy(b.subtract(a)))},{label:'Nudge Anchors',mergeKey:'anchor-nudge'}));}});api.selectionChanged();return true;
    },
    destroy(){finish();controller.abort();},
  };
}
