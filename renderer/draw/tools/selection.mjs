/** Transform previews in world millimetres; commit through model Commands on release. */
export const BOX_HANDLES = Object.freeze([
  ['nw',0,0],['n',.5,0],['ne',1,0],['e',1,.5],['se',1,1],['s',.5,1],['sw',0,1],['w',0,.5],
]);
export function resizeMatrix(box, handle, point, {shift = false, alt = false} = {}) {
  const h=BOX_HANDLES.find(h=>h[0]===handle); if (!h) throw new Error('Unknown resize handle');
  const [,,v]=h, u=h[1], ox=box.x+box.width*(alt ? .5 : 1-u), oy=box.y+box.height*(alt ? .5 : 1-v);
  const px=box.x+box.width*u, py=box.y+box.height*v;
  let sx=u===.5 || !box.width ? 1 : (point[0]-ox)/(px-ox), sy=v===.5 || !box.height ? 1 : (point[1]-oy)/(py-oy);
  if (shift) {
    if (u===.5) sx=Math.abs(sy); else if (v===.5) sy=Math.abs(sx);
    else { const scale=Math.max(Math.abs(sx),Math.abs(sy)); sx=(Math.sign(sx)||1)*scale; sy=(Math.sign(sy)||1)*scale; }
  }
  if (Math.abs(sx)<.00001) sx=.00001; if (Math.abs(sy)<.00001) sy=.00001;
  return [sx,0,0,sy,ox*(1-sx),oy*(1-sy)];
}
export function rotationMatrix(box, from, to, constrain = false) {
  const x=box.x+box.width/2,y=box.y+box.height/2;
  let angle=Math.atan2(to[1]-y,to[0]-x)-Math.atan2(from[1]-y,from[0]-x);
  if (constrain) angle=Math.round(angle/(Math.PI/4))*Math.PI/4;
  const c=Math.cos(angle),s=Math.sin(angle);
  return [c,s,-s,c,x-c*x+s*y,y-s*x-c*y];
}
export function transformedBox(box, matrix) {
  const points=[[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]]
    .map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
export function snapTranslation(box, delta, targets, tolerance) {
  const xs=[box.x,box.x+box.width/2,box.x+box.width], ys=[box.y,box.y+box.height/2,box.y+box.height];
  const result={x:delta[0],y:delta[1],guides:[]};
  for (const [axis,values,index] of [['x',xs,0],['y',ys,1]]) {
    let distance=tolerance, best=null;
    for (const target of targets) for (const value of values) {
      const offset=target[axis]-(value+delta[index]);
      if (Number.isFinite(offset) && Math.abs(offset)<distance) {distance=Math.abs(offset);best={offset,target};}
    }
    if (best) {result[axis]+=best.offset; result.guides.push({axis,value:best.target[axis],label:best.target.label || 'anchor'});}
  }
  return result;
}
