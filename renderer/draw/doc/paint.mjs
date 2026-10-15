import { appearance, solidPaint } from '../geometry.mjs';

export function changePaint(original, kind, value, defaults) {
  const result=structuredClone(original), key=kind==='fill' ? 'fills' : 'strokes';
  if (kind==='width') {
    if (result.strokes.length) result.strokes=result.strokes.map(s=>({...s,width:value}));
    else if (defaults.stroke) result.strokes=appearance(null,defaults.stroke,value).strokes;
  } else if (value===null) result[key]=[];
  else {
    const entries=result[key], first=entries[0] || appearance(kind==='fill' ? value : null,kind==='stroke' ? value : null,defaults.strokeWidth)[key][0];
    result[key]=[{...first,paint:solidPaint(value)},...entries.slice(1)];
  }
  return result;
}
export function paintHex(entry, fallback = null) {
  const c=entry?.paint?.color;
  return c?.space==='rgb' ? '#'+c.values.map(v=>Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,'0')).join('') : fallback;
}
