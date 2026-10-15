import { createNode } from '../doc/schema.mjs';
import { appearance } from '../geometry.mjs';

export const SHAPE_TOOLS = Object.freeze(['rectangle','rounded-rectangle','ellipse','line','polygon','star']);
export function shapeFromDrag(tool, start, end, options = {}) {
  let dx=end[0]-start[0], dy=end[1]-start[1];
  if (options.shift) {
    if (tool==='line') {
      const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4, length=Math.hypot(dx,dy);
      dx=Math.cos(angle)*length; dy=Math.sin(angle)*length;
    } else { const side=Math.max(Math.abs(dx),Math.abs(dy)); dx=(Math.sign(dx)||1)*side; dy=(Math.sign(dy)||1)*side; }
  }
  const x=options.alt ? start[0]-dx : start[0], y=options.alt ? start[1]-dy : start[1];
  const x2=start[0]+dx, y2=start[1]+dy;
  let params={x:Math.min(x,x2),y:Math.min(y,y2),width:Math.abs(x2-x),height:Math.abs(y2-y)};
  if (tool==='line') params={x1:x,y1:y,x2,y2};
  else if (tool==='polygon' || tool==='star') {
    const radius=Math.hypot(dx,dy), points=options.points ?? (tool==='polygon' ? 6 : 5);
    params={x:start[0],y:start[1],radius,outerRadius:radius,innerRadius:radius*(options.ratio ?? .5),sides:points,points};
  } else if (tool==='rounded-rectangle') params.cornerRadius=Math.min(options.cornerRadius ?? 5,params.width/2,params.height/2);
  return createNode('shape',{name:tool,shape:['rectangle','rounded-rectangle'].includes(tool) ? 'rect' : tool,params,
    appearance:appearance(tool==='line' ? null : options.fill ?? null,options.stroke ?? null,options.strokeWidth ?? .5)});
}
