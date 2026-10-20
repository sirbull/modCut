import { widthAt } from '../geom/width-profile.mjs';
import { arrowShapes } from '../geom/arrows.mjs';

/** Preview uses the same geometry as the artwork. SVG assets for the option buttons live in icons/. */
export function strokePreview(kind, value, start = false) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 72 24'); svg.setAttribute('aria-hidden','true');
  const shape = (tag, attrs) => {
    const node = document.createElementNS(svg.namespaceURI,tag);
    for (const [key,v] of Object.entries(attrs)) node.setAttribute(key,String(v));
    svg.append(node);
  };
  if (kind === 'profile') {
    const samples = Array.from({length:49},(_,i) => {const t=i/48,[l,r]=widthAt(value,t);return [6+t*60,12-l*12,12+r*12];});
    const points = [...samples.map(([x,y])=>[x,y]),...samples.toReversed().map(([x,,y])=>[x,y])];
    shape('polygon',{points:points.map(p=>p.join(',')).join(' '),fill:'currentColor'});
  } else {
    shape('path',{d:'M8 12H64',fill:'none',stroke:'currentColor','stroke-width':2});
    if (value && value !== 'none') for (const s of arrowShapes([start?12:60,12],[start?-1:1,0],3,{type:value,scale:1})) {
      if(s.kind === 'circle') shape('circle',{cx:s.center[0],cy:s.center[1],r:s.radius,fill:'currentColor'});
      else shape(s.kind === 'polygon'?'polygon':'polyline',{points:s.points.map(p=>p.join(',')).join(' '),fill:s.kind==='polygon'?'currentColor':'none',stroke:'currentColor','stroke-width':2});
    }
  }
  return svg;
}
