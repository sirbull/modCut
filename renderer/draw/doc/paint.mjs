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
export const STROKE_CAPS = Object.freeze(['butt', 'round', 'square']);
export const STROKE_JOINS = Object.freeze(['miter', 'round', 'bevel']);
export const ARROW_TYPES = Object.freeze(['arrow', 'triangle', 'circle', 'square', 'bar']);
/** Validated Stroke panel edits on the first stroke. A missing stroke is created from the default stroke color. */
export function changeStroke(original, props, defaults) {
  const result = structuredClone(original);
  if (!result.strokes.length) {
    if (!defaults.stroke) throw new Error('Choose a stroke color first.');
    result.strokes = appearance(null, defaults.stroke, defaults.strokeWidth).strokes;
  }
  const stroke = { ...result.strokes[0] };
  for (const [key, value] of Object.entries(props)) {
    if (key === 'width') { if (!(Number.isFinite(value) && value >= 0 && value <= 352.8)) throw new Error('Weight must be between 0 and 352.8 mm.'); stroke.width = value; }
    else if (key === 'cap') { if (!STROKE_CAPS.includes(value)) throw new Error('Unknown cap.'); stroke.cap = value; }
    else if (key === 'join') { if (!STROKE_JOINS.includes(value)) throw new Error('Unknown corner.'); stroke.join = value; }
    else if (key === 'miterLimit') { if (!(Number.isFinite(value) && value >= 1 && value <= 500)) throw new Error('Limit must be between 1 and 500.'); stroke.miterLimit = value; }
    else if (key === 'dash') {
      if (value === null) { delete stroke.dash; continue; }
      const array = value.filter((v) => v !== null && v !== undefined && v !== '');
      if (array.length > 6 || array.some((v) => !(Number.isFinite(v) && v >= 0))) throw new Error('Dash and gap must be zero or more.');
      if (!array.some((v) => v > 0)) throw new Error('Enter a dash length greater than zero.');
      stroke.dash = { ...(stroke.dash ?? {}), array, offset: stroke.dash?.offset ?? 0 };
    } else if (key === 'startArrow' || key === 'endArrow') {
      if (value === null) { delete stroke[key]; continue; }
      if (!ARROW_TYPES.includes(value.type) || !(Number.isFinite(value.scale) && value.scale > 0 && value.scale <= 10)) throw new Error('Arrowhead scale must be between 1% and 1000%.');
      stroke[key] = { type: value.type, scale: value.scale };
    } else throw new Error(`Unsupported stroke setting: ${key}`);
  }
  result.strokes = [stroke, ...result.strokes.slice(1)];
  return result;
}
