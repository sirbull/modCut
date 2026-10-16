/** Type sizes/leading are stored in points; frames and glyph geometry stay in mm. */
import { createNode } from './schema.mjs';
import { appearance } from '../geometry.mjs';
import { hasTextLayout } from './text-layout.mjs';
import { validGoogleReference,validFontAxes } from './font-reference.mjs';

export const PT_TO_MM = 25.4 / 72;
export const DEFAULT_CHARACTER = Object.freeze({ fontFamily: 'Arial', fontSize: 24, leading: 28.8, fontWeight: 'normal', fontStyle: 'normal' });
export function textContent(node) { return node.content.runs.map(run => run.text).join(''); }
export function textValues(node) {
  return { text: textContent(node), ...DEFAULT_CHARACTER, ...node.character, alignment: node.paragraph.alignment ?? 'left',
    kind:node.kind??'point', ...(node.kind==='area'?{frameWidth:node.frame.width,frameHeight:node.frame.height}:{}) };
}
export function textProperties(values) {
  const { text, fontFamily, fontSize, leading, fontWeight, fontStyle, alignment, fontPostscriptName, kind='point', frameWidth, frameHeight,fontSource='system',googleFont,fontAxes } = values;
  if(!['system','google'].includes(fontSource))throw new Error('Choose a font source.');
  if(googleFont!==undefined&&(!validGoogleReference(googleFont)||fontSource!=='google'||googleFont.family!==fontFamily))throw new Error('Invalid saved Google font reference.');
  if(fontAxes!==undefined&&!validFontAxes(fontAxes))throw new Error('Invalid variable font axes.');
  if(!['point','area'].includes(kind))throw new Error('Unsupported text kind.');
  if(kind==='area')for(const n of [frameWidth,frameHeight])if(!Number.isFinite(n)||n<.1||n>100000)throw new Error('Frame dimensions must be between 0.1 and 100,000 mm.');
  if (typeof text !== 'string' || !text.trim()) throw new Error('Enter some text.');
  if (typeof fontFamily !== 'string' || !fontFamily.trim()) throw new Error('Enter a font family.');
  for (const [label, n] of [['Font size', fontSize], ['Leading', leading]]) {
    if (!Number.isFinite(n) || n < .1 || n > 10000) throw new Error(`${label} must be between 0.1 and 10,000 pt.`);
  }
  if ((!['normal', 'bold'].includes(fontWeight)&&!(Number.isFinite(fontWeight)&&fontWeight>=1&&fontWeight<=1000)) || !['normal', 'italic'].includes(fontStyle) || !['left', 'center', 'right'].includes(alignment)) throw new Error('Invalid text style.');
  return { kind, ...(kind==='area'?{frame:{width:frameWidth,height:frameHeight}}:{}), content: { runs: [{ text: text.replace(/\r\n?/g, '\n') }] },
    character: { fontFamily: fontFamily.trim(), fontSize, leading, fontWeight, fontStyle,
      ...(typeof fontPostscriptName==='string'&&fontPostscriptName?{fontPostscriptName}:{}),
      ...(fontSource==='google'?{fontSource,...(googleFont?{googleFont}:{})}:{}),
      ...(fontAxes&&Object.keys(fontAxes).length?{fontAxes}:{}) }, paragraph: { alignment } };
}
/** One compound path per visible glyph, grouped per line. Group identity keeps selection stable. */
export function textToOutlines(node) {
  if(node.type!=='text'||!hasTextLayout(node))throw new Error('Resolve the text font before creating outlines.');
  if(node.layout.overflow)throw new Error('The text overflows its frame. Enlarge the frame before creating outlines.');
  const lines=new Map();
  for(const glyph of node.layout.glyphs) {
    if(!glyph.subpaths.length)continue;
    if(!lines.has(glyph.line))lines.set(glyph.line,[]);
    lines.get(glyph.line).push(createNode('path',{subpaths:glyph.subpaths,fillRule:'nonzero',appearance:node.appearance,
      ...(node.strokeScaling!==undefined?{strokeScaling:node.strokeScaling}:{})}));
  }
  return createNode('group',{id:node.id,name:node.name||'Text outlines',visible:node.visible,locked:node.locked,
    transform:node.transform,opacity:node.opacity,blendMode:node.blendMode,
    children:[...lines].map(([line,children])=>createNode('group',{name:`Line ${line+1}`,children}))});
}
export function pointText(point, values, paint = {}) {
  return createNode('text', { ...textProperties(values), transform: [1, 0, 0, 1, ...point],
    appearance: appearance(paint.fill ?? '#071411', paint.stroke ?? null, paint.strokeWidth ?? .5) });
}
