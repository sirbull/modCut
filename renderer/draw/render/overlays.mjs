/** Screen-sized UI geometry, kept outside the document artwork. */
import { BOX_HANDLES } from '../tools/selection.mjs';
import { activeArtboard } from '../doc/artboards.mjs';
export function createSelectionOverlay(scope, layer, state, bounds, layerColor = () => null) {
  let outline = null;
  const handles = new scope.Group({insert:false}); layer.addChild(handles);
  let hitPoints = [];
  return {
    update() {
      let rectangle = null;
      for (const id of state.selection.ids) {
        const b = bounds(id);
        if (b) rectangle = rectangle ? rectangle.unite(b) : b.clone();
      }
      if (state.ui?.tool === 'artboard') { const a=activeArtboard(state); rectangle=new scope.Rectangle(a.x,a.y,a.width,a.height); }
      if(state.ui?.transformPreviewBox){const b=state.ui.transformPreviewBox;rectangle=new scope.Rectangle(b.x,b.y,b.width,b.height);}
      // Selection follows the layer color of the first selected object, as in Illustrator.
      const accent=state.selection.ids.map(layerColor).find(Boolean) || '#006B5C';
      handles.removeChildren(); hitPoints=[];
      if(['direct-selection','pen','add-anchor','delete-anchor','anchor-point'].includes(state.ui?.tool))rectangle=null;
      if(['lasso','polygonal-lasso'].includes(state.ui?.tool)&&state.selection.anchors.length)rectangle=null;
      if (!rectangle) { outline?.remove(); outline = null; return; }
      if (!outline || !outline.bounds.equals(rectangle) || outline.data.accent!==accent) {
        outline?.remove();
        outline = new scope.Path.Rectangle({ rectangle, insert: false });
        outline.strokeColor = accent; outline.strokeScaling = false; outline.data.accent=accent;
        layer.addChild(outline);
      }
      outline.strokeWidth = 1.5 / scope.view.zoom;
      outline.visible = !state.ui?.tool || ['select','artboard'].includes(state.ui.tool);
      if(['rotate','reflect','scale'].includes(state.ui?.tool)&&!state.document.readOnly){
        const p=state.ui.transformOrigin?new scope.Point(...state.ui.transformOrigin):rectangle.center,r=5/scope.view.zoom;
        const mark=new scope.Path.Circle({center:p,radius:r,strokeColor:accent,fillColor:'#FFFFFF',strokeWidth:1/scope.view.zoom,insert:false});handles.addChild(mark);
        for(const [a,b] of [[[p.x-r*1.6,p.y],[p.x+r*1.6,p.y]],[[p.x,p.y-r*1.6],[p.x,p.y+r*1.6]]])handles.addChild(new scope.Path.Line({from:a,to:b,strokeColor:accent,strokeWidth:1/scope.view.zoom,insert:false}));
      }
      if (!state.document.readOnly && (!state.ui?.tool || ['select','artboard'].includes(state.ui.tool))) {
        for (const [id,u,v] of BOX_HANDLES) {
          const point=new scope.Point(rectangle.x+rectangle.width*u,rectangle.y+rectangle.height*v), size=7/scope.view.zoom;
          const box=new scope.Path.Rectangle({rectangle:new scope.Rectangle(point.subtract(size/2),new scope.Size(size,size)),insert:false});
          box.strokeColor=accent;box.strokeWidth=1/scope.view.zoom;box.fillColor='#FFFFFF';handles.addChild(box);hitPoints.push({id,point});
        }
        if (state.ui?.tool !== 'artboard') {
          const point=rectangle.topRight.add([12/scope.view.zoom,-12/scope.view.zoom]);
          const knob=new scope.Path.Circle({center:point,radius:3/scope.view.zoom,insert:false});
          knob.strokeColor=accent;knob.strokeWidth=1/scope.view.zoom;knob.fillColor='#FFFFFF';handles.addChild(knob);hitPoints.push({id:'rotate',point});
        }
      }
    },
    hit(point) { return hitPoints.find(p=>p.point.getDistance(point)<=6/scope.view.zoom)?.id || null; },
    destroy() { outline?.remove(); outline = null; handles.remove(); },
  };
}
