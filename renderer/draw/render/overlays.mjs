/** Screen-sized UI geometry, kept outside the document artwork. */
import { BOX_HANDLES } from '../tools/selection.mjs';
import { activeArtboard } from '../doc/artboards.mjs';
export function createSelectionOverlay(scope, layer, state, bounds) {
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
      handles.removeChildren(); hitPoints=[];
      if(['direct-selection','pen','add-anchor','delete-anchor','anchor-point'].includes(state.ui?.tool))rectangle=null;
      if (!rectangle) { outline?.remove(); outline = null; return; }
      if (!outline || !outline.bounds.equals(rectangle)) {
        outline?.remove();
        outline = new scope.Path.Rectangle({ rectangle, insert: false });
        outline.strokeColor = '#006B5C'; outline.strokeScaling = false;
        layer.addChild(outline);
      }
      outline.strokeWidth = 1.5 / scope.view.zoom;
      if (!state.document.readOnly && (!state.ui?.tool || ['select','artboard'].includes(state.ui.tool))) {
        for (const [id,u,v] of BOX_HANDLES) {
          const point=new scope.Point(rectangle.x+rectangle.width*u,rectangle.y+rectangle.height*v), size=7/scope.view.zoom;
          const box=new scope.Path.Rectangle({rectangle:new scope.Rectangle(point.subtract(size/2),new scope.Size(size,size)),insert:false});
          box.strokeColor='#006B5C';box.strokeWidth=1/scope.view.zoom;box.fillColor='#FFFFFF';handles.addChild(box);hitPoints.push({id,point});
        }
        if (state.ui?.tool !== 'artboard') {
          const point=rectangle.topRight.add([12/scope.view.zoom,-12/scope.view.zoom]);
          const knob=new scope.Path.Circle({center:point,radius:3/scope.view.zoom,insert:false});
          knob.strokeColor='#006B5C';knob.strokeWidth=1/scope.view.zoom;knob.fillColor='#FFFFFF';handles.addChild(knob);hitPoints.push({id:'rotate',point});
        }
      }
    },
    hit(point) { return hitPoints.find(p=>p.point.getDistance(point)<=6/scope.view.zoom)?.id || null; },
    destroy() { outline?.remove(); outline = null; handles.remove(); },
  };
}
