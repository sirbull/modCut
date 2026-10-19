/** Display-only Laser Preview policy. Process colours identify settings, never operations. */
import { resolveCutPreviewProcess } from './cut-process.mjs';
import { nodeContext } from '../doc/layers.mjs';
import { hasTextLayout } from '../doc/text-layout.mjs';
import { cutPaint } from '../io/cut-paint.mjs';
import { scribbleOf } from '../doc/effects.mjs';

export const LASER_COLORS = Object.freeze({Cut:'#C5221F',Score:'#C5221F',Engrave:'#000000',unresolved:'#965300'});
const PREVIEW_VECTOR_EFFECTS=new Set(['round-corners','zig-zag','offset-path','transform','pucker-bloat','roughen','twist','free-distort','warp','scribble']);

export function laserPreviewIntent(doc, id, snapshot) {
  const node=doc.getNode(id), process=resolveCutPreviewProcess(doc,id,snapshot);
  if(!node)return process;
  const ancestors=doc.ancestors(id);
  if([node,...ancestors].some(n=>!n.visible))return {status:'excluded',reason:'hidden'};
  if(nodeContext(doc,id).template)return {status:'reference'};
  if(process.status==='excluded')return process;
  if(node.children&&(node.blend||node.envelope||node.mask||node.appearance?.effects?.some(e=>!e.hidden)))return {status:'unresolved',reason:'expand-appearance'};
  if(process.status!=='resolved')return process;
  // These display composites do not have a one-to-one correspondence with a
  // leaf's emitted Cut paths. Keep them explicitly unresolved until expanded.
  if(ancestors.some(n=>n.blend||n.envelope||n.mask||n.appearance?.effects?.some(e=>!e.hidden)) ||
    node.appearance?.effects?.some(e=>!e.hidden&&(!['path','shape'].includes(node.type)||!PREVIEW_VECTOR_EFFECTS.has(e.type))))return {...process,status:'unresolved',reason:'expand-appearance'};
  if(node.type==='text'&&(!hasTextLayout(node)||node.layout.overflow))return {...process,status:'unresolved',reason:'text-layout'};
  const fills=(node.appearance?.fills??[]).filter(e=>!e.hidden),strokes=(node.appearance?.strokes??[]).filter(e=>!e.hidden);
  const scribbled=scribbleOf(node);
  if(scribbled&&!cutPaint(node).fill)return {...process,status:'unresolved',reason:'expand-appearance'};
  if(ancestors.some(a=>a.clip)){
    if(node.type==='image')return {...process,status:'unresolved',reason:'clipped-image-transfer'};
    if(process.operation!=='Engrave'||node.type==='text'||scribbled)return {...process,status:'unresolved',reason:'clipped-vector-transfer'};
    if(strokes.length)return {...process,status:'unresolved',reason:'clipped-stroke-transfer'};
  }
  if(process.operation==='Engrave'&&node.type!=='image'){
    if(strokes.length&&doc.data.cutLinks?.some(link=>link.options?.strokes==='outline'))return {...process,status:'unresolved',reason:'outline-transfer'};
    if(scribbled)return {...process,vectorPaint:{fill:false,stroke:true,width:scribbled.strokeWidth,strokeScaling:node.strokeScaling!==false}};
    const stackedPaint=fills.length>1||strokes.length>1||strokes.some(s=>s.widthProfile?.length);
    if(strokes.some(s=>s.align&&s.align!=='center')||
      (stackedPaint&&(!['path','shape'].includes(node.type)||ancestors.some(a=>a.clip))))return {...process,status:'unresolved',reason:'expand-stroke'};
    if(stackedPaint){
      // Match canonical Send to Cut: only the first visible fill/stroke is sent,
      // without the view-only width-profile outline or extra paint-stack items.
      const paint=cutPaint(node);
      return {...process,vectorPaint:{fill:!!paint.fill,stroke:!!paint.stroke,width:strokes[0]?.width??0,strokeScaling:node.strokeScaling!==false}};
    }
  }
  if(node.type==='image' && process.layer.dither && process.layer.dither!=='Grayscale')return {...process,status:'unresolved',reason:'raster-dither'};
  return process;
}

/** Temporarily project Paper view items during one draw; restore even if drawing throws.
 * Export, hit testing, thumbnails and document data keep the original appearance.
 * `resolve` is evaluated once per node per draw by the caller.
 */
export function withLaserAppearance(root, {resolve,roles=new Map(),zoom=1}, draw) {
  const restore=[];
  const patch=(item,props)=>{const old={};for(const key of Object.keys(props))old[key]=item[key];restore.push(()=>Object.assign(item,old));Object.assign(item,props);};
  function walk(item,inherited=null) {
    if(item.clipMask)return;
    const tagged=roles.get(item),id=tagged?.id??item.data?.nodeId??inherited, intent=id?resolve(id):null, role=tagged?.role;
    if(intent?.status==='excluded'){patch(item,{visible:false});return;}
    if(intent?.status==='reference'){patch(item,{opacity:.18});return;}
    const op=intent?.status==='resolved'?intent.operation:null;
    if((op==='Cut'||op==='Score')&&['stack','arrows','shadow','raster'].includes(role)){patch(item,{visible:false});return;}
    if(op==='Engrave'&&(role==='arrows'||(role==='stack'&&intent.vectorPaint))){patch(item,{visible:false});return;}
    if(intent?.status==='unresolved'&&role==='shadow'){patch(item,{visible:false});return;}
    if(item.className==='Raster') {
      if(intent?.status==='unresolved'){patch(item,{opacity:.25});return;}
      if(op==='Engrave') {
        const original=item.draw;
        patch(item,{opacity:1,blendMode:'normal',draw:function(ctx,...args){ctx.save();try{ctx.filter='grayscale(1)';return original.call(this,ctx,...args);}finally{ctx.restore();}}});
      }
      return;
    }
    if(item.children && item.className!=='CompoundPath') {
      // Cut ignores appearance opacity/blending on the canonical SVG path.
      if(op||intent?.status==='container')patch(item,{opacity:1,blendMode:'normal'});
      for(const child of item.children)walk(child,id);
      return;
    }
    if(!intent||intent.status==='container')return;
    if(op==='Cut'||op==='Score'||intent.status==='unresolved') {
      patch(item,{fillColor:null,strokeColor:op?LASER_COLORS[op]:LASER_COLORS.unresolved,
        strokeWidth:1.5,strokeScaling:false,strokeCap:'butt',strokeJoin:'miter',
        dashArray:op==='Cut'?[]:op==='Score'?[6,3]:[2,3],dashOffset:0,opacity:1,blendMode:'normal'});
    } else if(op==='Engrave') {
      // Vector engraving uses the painted silhouette (alpha), not RGB darkness.
      // Canonical Send to Cut emits a plain SVG stroke: no dashes or arrowheads.
      // Cut bakes the path transform and scales width by sqrt(abs(det(world))).
      // Use a screen-space width so anisotropic parents cannot deform the stroke.
      const m=item.globalMatrix,scale=m?Math.sqrt(Math.abs(m.a*m.d-m.b*m.c)):1;
      const paint=intent.vectorPaint;
      const width=paint?paint.width*(paint.strokeScaling?scale:1)*zoom:item.strokeScaling===false?item.strokeWidth:item.strokeWidth*scale*zoom;
      // Paper's actual Cut SVG import defaults to miterLimit 10, not Draw's 4.
      patch(item,{fillColor:(paint?paint.fill:item.fillColor)?LASER_COLORS.Engrave:null,strokeColor:(paint?paint.stroke:item.strokeColor)?LASER_COLORS.Engrave:null,strokeWidth:width,strokeScaling:false,strokeCap:'butt',strokeJoin:'miter',miterLimit:10,dashArray:[],dashOffset:0,opacity:1,blendMode:'normal'});
    }
  }
  try{walk(root);return draw();}finally{for(let i=restore.length-1;i>=0;i--)restore[i]();}
}
