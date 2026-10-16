/** Portable glyph geometry. No font files, DOM or Paper dependencies. */
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const textSignature = node => JSON.stringify(canonical([node.kind, node.content, node.character ?? null, node.paragraph,
  ...(node.kind==='area'?[node.frame]:[])]));
export const hasTextLayout = node => node?.layout?.version === 1 && node.layout.signature === textSignature(node);
export const textSubpaths = node => hasTextLayout(node) ? node.layout.glyphs.flatMap(g => g.subpaths) : null;

/** Fontkit contours use an upward Y axis. Convert quadratic and cubic handles without flattening. */
export function glyphSubpaths(commands, mapPoint) {
  const result = []; let path;
  const point = (args, offset = 0) => {const p=mapPoint(args[offset],args[offset+1]);if(p.some(v=>!Number.isFinite(v)))throw new Error('The font contains invalid glyph coordinates.');return p;};
  const segment = p => ({p, in:[0,0], out:[0,0]});
  const delta = (a,b,scale=1) => a.map((v,i)=>(v-b[i])*scale);
  for (const {command,args} of commands) {
    if (command === 'moveTo') { path = {closed:false,segments:[segment(point(args))]}; result.push(path); }
    else if (command === 'closePath') {
      if (!path) throw new Error('Invalid glyph contour.');
      path.closed = true;
      const first=path.segments[0],last=path.segments.at(-1);
      if(path.segments.length>1&&first.p.every((v,i)=>Math.abs(v-last.p[i])<1e-10)) {first.in=last.in;path.segments.pop();}
    } else {
      if (!path) throw new Error('Invalid glyph contour.');
      const previous = path.segments.at(-1);
      if(command === 'lineTo') path.segments.push(segment(point(args)));
      else if(command === 'quadraticCurveTo') {
        const control=point(args),next=segment(point(args,2));previous.out=delta(control,previous.p,2/3);next.in=delta(control,next.p,2/3);path.segments.push(next);
      } else if(command === 'bezierCurveTo') {
        const next=segment(point(args,4));previous.out=delta(point(args),previous.p);next.in=delta(point(args,2),next.p);path.segments.push(next);
      } else throw new Error(`Unsupported glyph command: ${command}`);
    }
  }
  if(result.some(p=>!p.closed))throw new Error('The font contains an open glyph contour.');
  return result.filter(p=>p.segments.length>1);
}
