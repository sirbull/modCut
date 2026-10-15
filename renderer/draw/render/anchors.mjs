const pathTools=new Set(['direct-selection','pen','add-anchor','delete-anchor','anchor-point']);
export function createAnchorOverlay(scope,layer,state,toWorld,getNode=id=>state.document.getNode(id),corners=()=>[]) {
  const group=new scope.Group({insert:false});layer.addChild(group);
  return {
    update(){
      group.removeChildren();if(!pathTools.has(state.ui?.tool))return;
      const zoom=scope.view.zoom,selected=state.selection.anchors;
      for(const id of state.selection.ids){const node=getNode(id);if(node?.type!=='path')continue;
        node.subpaths.forEach((path,subpath)=>path.segments.forEach((segment,index)=>{
          const p=toWorld(id,segment.p),active=selected.some(a=>a.nodeId===id&&a.subpath===subpath&&a.segment===index);
          if(active)for(const kind of ['in','out']) {
            const v=segment[kind];if(!Math.hypot(...v))continue;
            const end=toWorld(id,segment.p.map((n,i)=>n+v[i]));
            group.addChild(new scope.Path.Line({from:p,to:end,strokeColor:'#006B5C',strokeWidth:1/zoom,insert:false}));
            group.addChild(new scope.Path.Circle({center:end,radius:3/zoom,fillColor:'#FFFFFF',strokeColor:'#006B5C',strokeWidth:1/zoom,insert:false}));
          }
          group.addChild(new scope.Path.Rectangle({rectangle:new scope.Rectangle(p.subtract(3.5/zoom),new scope.Size(7/zoom,7/zoom)),fillColor:active?'#006B5C':'#FFFFFF',strokeColor:'#006B5C',strokeWidth:1/zoom,insert:false}));
        }));
      }
      for(const {point} of corners()){
        group.addChild(new scope.Path.Circle({center:point,radius:4/zoom,fillColor:'#FFFFFF',strokeColor:'#006B5C',strokeWidth:1/zoom,insert:false}));
        group.addChild(new scope.Path.Circle({center:point,radius:1.4/zoom,fillColor:'#006B5C',insert:false}));
      }
    },
    destroy(){group.remove();},
  };
}
