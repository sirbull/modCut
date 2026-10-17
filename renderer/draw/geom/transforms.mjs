/** World-space transforms. Positive UI angles are counterclockwise in a y-down canvas. */
export const TRANSFORM_TOOLS=['rotate','reflect','scale','shear'];
export const isIdentity=m=>m.every((v,i)=>Math.abs(v-[1,0,0,1,0,0][i])<1e-10);
export const strokeScale=m=>Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]));
export function dialogOperation(tool,values){
  if(tool==='scale')return {tool,x:Number(values.mode==='nonuniform'?values.x:values.uniform)/100,y:Number(values.mode==='nonuniform'?values.y:values.uniform)/100};
  if(tool==='shear')return {tool,angle:Number(values.angle),axis:values.axis==='vertical'?'vertical':'horizontal'};
  return {tool,angle:tool==='reflect'&&values.axis!=='angle'?(values.axis==='vertical'?90:0):Number(values.angle)};
}
export function operationMatrix(operation,origin) {
  const [x,y]=origin;let a,b,c,d;
  if(operation.tool==='rotate'){
    const radians=-operation.angle*Math.PI/180;a=d=Math.cos(radians);b=Math.sin(radians);c=-b;
  }else if(operation.tool==='reflect'){
    const radians=-operation.angle*Math.PI/180;a=Math.cos(2*radians);b=c=Math.sin(2*radians);d=-a;
  }else if(operation.tool==='scale'){a=operation.x;b=c=0;d=operation.y;}
  else if(operation.tool==='shear'){
    // Positive angles slant the top to the right (horizontal axis) or the right side up (vertical axis).
    if(!(Math.abs(operation.angle)<89.99))throw new RangeError('Shear angle must be between -89.99° and 89.99°.');
    const t=-Math.tan(operation.angle*Math.PI/180);a=d=1;b=operation.axis==='vertical'?t:0;c=operation.axis==='vertical'?0:t;
  }
  else throw new Error('Unknown transform');
  const result=[a,b,c,d,x-a*x-c*y,y-b*x-d*y];
  if(!result.every(Number.isFinite)||Math.abs(a*d-b*c)<1e-12)throw new RangeError('Transform must be finite and nonzero');
  return result;
}
export function dragTransform(tool,origin,start,end,constrain=false) {
  const [x,y]=origin,a=[start[0]-x,start[1]-y],b=[end[0]-x,end[1]-y],snap=v=>constrain?Math.round(v/45)*45:v;
  if(tool==='rotate')return {tool,angle:snap(-(Math.atan2(b[1],b[0])-Math.atan2(a[1],a[0]))*180/Math.PI)};
  if(tool==='reflect')return {tool,angle:snap(-(Math.atan2(b[1],b[0])+Math.atan2(a[1],a[0]))*90/Math.PI)};
  if(tool==='shear'){
    // The dragged point slides along the axis the drag mostly follows; Shift keeps the horizontal axis.
    const dx=end[0]-start[0],dy=end[1]-start[1],axis=constrain||Math.abs(dx)>=Math.abs(dy)?'horizontal':'vertical';
    const lever=axis==='horizontal'?a[1]:a[0],shift=axis==='horizontal'?dx:dy;
    const t=Math.abs(lever)<1e-9?0:shift/lever,angle=Math.max(-89,Math.min(89,Math.atan(-t)*180/Math.PI));
    return {tool,angle:Math.round(angle*1e6)/1e6+0,axis};
  }
  if(tool!=='scale')throw new Error('Unknown transform');
  const limit=v=>Math.abs(v)<.0001?(v<0?-.0001:.0001):Math.max(-1000,Math.min(1000,v));
  const ratio=(n,d)=>Math.abs(d)<1e-8?1:n/d;
  if(constrain){const r=limit(Math.hypot(...b)/(Math.hypot(...a)||1)*(a[0]*b[0]+a[1]*b[1]<0?-1:1));return{tool,x:r,y:r};}
  return {tool,x:limit(ratio(b[0],a[0])),y:limit(ratio(b[1],a[1]))};
}
/** Stroke widths become world-mm values on explicit Scale. Opaque effects survive unchanged. */
export function scaledStrokeProperties(node,worldMatrix,matrix,scaleStrokes) {
  if(!['path','shape'].includes(node.type))return {};
  const factor=(node.strokeScaling===false?1:strokeScale(worldMatrix))*(scaleStrokes?strokeScale(matrix):1),appearance=structuredClone(node.appearance);
  appearance.strokes=appearance.strokes.map(s=>({...s,width:s.width*factor,...(s.dash?{dash:{...s.dash,array:(s.dash.array??[]).map(n=>n*factor),offset:(s.dash.offset??0)*factor}}:{})}));
  return {appearance,strokeScaling:false};
}
export const REFERENCE_POINTS=Object.freeze([0,.5,1].flatMap(v=>[0,.5,1].map(u=>Object.freeze([u,v]))));
/** Transform panel edit around a 9-point reference. Rotate/Shear are relative edits, positive counterclockwise/rightward at the top. */
export function panelMatrix(box,reference,key,value,{linked=false}={}) {
  if(!Number.isFinite(value))throw new RangeError('Enter a finite number.');
  const [u,v]=reference,x=box.x+box.width*u,y=box.y+box.height*v;
  if(key==='x'||key==='y')return [1,0,0,1,key==='x'?value-x:0,key==='y'?value-y:0];
  if(key==='width'||key==='height'){
    const size=box[key];if(!(value>0))throw new RangeError('Size must be greater than zero.');
    if(size<1e-9)throw new RangeError(`The selection has no ${key} to scale.`);
    const factor=value/size,other=linked?factor:1;
    return operationMatrix({tool:'scale',x:key==='width'?factor:other,y:key==='height'?factor:other},[x,y]);
  }
  if(key==='rotate')return operationMatrix({tool:'rotate',angle:value},[x,y]);
  if(key==='shear'){
    if(Math.abs(value)>=89.99)throw new RangeError('Shear angle must be between -89.99° and 89.99°.');
    const c=-Math.tan(value*Math.PI/180);return [1,0,c,1,-c*y,0];
  }
  throw new Error(`Unknown Transform field: ${key}`);
}
