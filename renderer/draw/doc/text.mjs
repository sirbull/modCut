/** Type sizes/leading are stored in points; frames and glyph geometry stay in mm. */
import { createNode } from './schema.mjs';
import { appearance } from '../geometry.mjs';
import { hasTextLayout, validPathSubpath } from './text-layout.mjs';
import { validGoogleReference,validFontAxes } from './font-reference.mjs';

export const PT_TO_MM = 25.4 / 72;
export const DEFAULT_CHARACTER = Object.freeze({ fontFamily: 'Arial', fontSize: 24, leading: 28.8, fontWeight: 'normal', fontStyle: 'normal' });
export function textContent(node) { return node.content.runs.map(run => run.text).join(''); }
/** Character settings a styled run may override (mixed styles in one text object). */
export const RUN_KEYS = Object.freeze(['fontFamily', 'fontWeight', 'fontStyle', 'fontSize', 'tracking', 'baselineShift', 'horizontalScale', 'verticalScale']);
/** One run's overrides, validated; the same rules as the object's own character settings. */
export function runCharacter(c) {
  if (c === undefined || c === null) return null;
  if (typeof c !== 'object' || Array.isArray(c)) throw new Error('Invalid text style.');
  const out = {};
  for (const [key, value] of Object.entries(c)) {
    if (!RUN_KEYS.includes(key)) throw new Error(`Text runs cannot change ${key}.`);
    const ok = key === 'fontFamily' ? typeof value === 'string' && !!value.trim()
      : key === 'fontWeight' ? ['normal', 'bold'].includes(value) || Number.isFinite(value) && value >= 1 && value <= 1000
      : key === 'fontStyle' ? ['normal', 'italic'].includes(value)
      : key === 'fontSize' ? Number.isFinite(value) && value >= .1 && value <= 10000
      : key === 'tracking' ? Number.isFinite(value) && value >= -1000 && value <= 10000
      : key === 'baselineShift' ? Number.isFinite(value) && Math.abs(value) <= 10000
      : Number.isFinite(value) && value >= 1 && value <= 10000;
    if (!ok) throw new Error(`Invalid ${key} in a text run.`);
    out[key] = key === 'fontFamily' ? value.trim() : value;
  }
  return Object.keys(out).length ? out : null;
}
/** Runs for `text`: empty runs dropped, neighbours with the same style merged, one plain run when nothing is styled. */
export function normalizeRuns(text, runs) {
  if (!Array.isArray(runs) || runs.map(r => String(r?.text ?? '').replace(/\r\n?/g, '\n')).join('') !== text) return [{ text }];
  const out = [];
  for (const run of runs) {
    const piece = String(run.text).replace(/\r\n?/g, '\n'), character = runCharacter(run.character);
    if (!piece) continue;
    const previous = out.at(-1);
    if (previous && JSON.stringify(previous.character ?? null) === JSON.stringify(character)) previous.text += piece;
    else out.push({ text: piece, ...(character ? { character } : {}) });
  }
  return out.some(r => r.character) ? out : [{ text }];
}
export function textValues(node) {
  return { text: textContent(node), runs: node.content.runs.map(r => ({ text: r.text, ...(r.character ? { character: structuredClone(r.character) } : {}) })), ...DEFAULT_CHARACTER, ...node.character, ...node.paragraph, alignment: node.paragraph.alignment ?? 'left',
    kind:node.kind??'point', ...(node.kind==='area'?{frameWidth:node.frame.width,frameHeight:node.frame.height}:{}),
    ...(node.kind==='onPath'?{pathSubpath:node.onPath.subpath,pathOffset:node.onPath.offset??0,pathFlip:!!node.onPath.flip}:{}) };
}
export function textProperties(values) {
  const { text, fontFamily, fontSize, leading, fontWeight, fontStyle, alignment, fontPostscriptName, kind='point', frameWidth, frameHeight,fontSource='system',googleFont,fontAxes,pathSubpath,pathOffset=0,pathFlip=false,runs,tracking=0,allCaps=false,horizontalScale=100,verticalScale=100,baselineShift=0,kerning='metrics',leftIndent=0,rightIndent=0,firstLineIndent=0,spaceBefore=0,spaceAfter=0 } = values;
  if(!['system','google'].includes(fontSource))throw new Error('Choose a font source.');
  if(googleFont!==undefined&&(!validGoogleReference(googleFont)||fontSource!=='google'||googleFont.family!==fontFamily))throw new Error('Invalid saved Google font reference.');
  if(fontAxes!==undefined&&!validFontAxes(fontAxes))throw new Error('Invalid variable font axes.');
  if(!['point','area','onPath'].includes(kind))throw new Error('Unsupported text kind.');
  if(kind==='onPath'){if(!validPathSubpath(pathSubpath))throw new Error('Type on a Path needs a path with at least two points.');if(!Number.isFinite(pathOffset)||pathOffset<0||pathOffset>100000)throw new Error('Start offset must be between 0 and 100,000 mm.');}
  if(kind==='area')for(const n of [frameWidth,frameHeight])if(!Number.isFinite(n)||n<.1||n>100000)throw new Error('Frame dimensions must be between 0.1 and 100,000 mm.');
  if(!Number.isFinite(tracking)||tracking<-1000||tracking>10000)throw new Error('Tracking must be between -1,000 and 10,000.');
  for(const [label,n] of [['Horizontal scale',horizontalScale],['Vertical scale',verticalScale]])if(!Number.isFinite(n)||n<1||n>10000)throw new Error(`${label} must be between 1 and 10,000 %.`);
  if(!Number.isFinite(baselineShift)||Math.abs(baselineShift)>10000)throw new Error('Baseline shift must be between -10,000 and 10,000 pt.');
  if(!['metrics','none'].includes(kerning))throw new Error('Choose Metrics or None for kerning.');
  if (typeof text !== 'string' || !text.trim()) throw new Error('Enter some text.');
  if (typeof fontFamily !== 'string' || !fontFamily.trim()) throw new Error('Enter a font family.');
  for (const [label, n] of [['Font size', fontSize], ['Leading', leading]]) {
    if (!Number.isFinite(n) || n < .1 || n > 10000) throw new Error(`${label} must be between 0.1 and 10,000 pt.`);
  }
  if ((!['normal', 'bold'].includes(fontWeight)&&!(Number.isFinite(fontWeight)&&fontWeight>=1&&fontWeight<=1000)) || !['normal', 'italic'].includes(fontStyle) || !['left', 'center', 'right', 'justify'].includes(alignment)) throw new Error('Invalid text style.');
  for(const [label,n] of [['Left indent',leftIndent],['Right indent',rightIndent],['First-line indent',firstLineIndent],['Space before',spaceBefore],['Space after',spaceAfter]])
    if(!Number.isFinite(n)||Math.abs(n)>10000)throw new Error(`${label} must be between -10,000 and 10,000 pt.`);
  return { kind, ...(kind==='area'?{frame:{width:frameWidth,height:frameHeight}}:{}),
    ...(kind==='onPath'?{onPath:{subpath:structuredClone(pathSubpath),offset:pathOffset,flip:!!pathFlip}}:{}), content: { runs: normalizeRuns(text.replace(/\r\n?/g, '\n'), runs) },
    character: { fontFamily: fontFamily.trim(), fontSize, leading, fontWeight, fontStyle,
      ...(typeof fontPostscriptName==='string'&&fontPostscriptName?{fontPostscriptName}:{}),
      ...(fontSource==='google'?{fontSource,...(googleFont?{googleFont}:{})}:{}),
      ...(fontAxes&&Object.keys(fontAxes).length?{fontAxes}:{}),
      // Tracking is in thousandths of an em, as in Illustrator; both are left out at their defaults.
      ...(tracking?{tracking}:{}),...(allCaps?{allCaps:true}:{}),
      // Scale (percent), baseline shift (pt, up) and kerning are also left out at their defaults.
      ...(horizontalScale!==100?{horizontalScale}:{}),...(verticalScale!==100?{verticalScale}:{}),...(baselineShift?{baselineShift}:{}),...(kerning!=='metrics'?{kerning}:{}) },
    // Indents and paragraph spacing are in points; zero values are left out.
    paragraph: { alignment, ...Object.fromEntries(Object.entries({leftIndent,rightIndent,firstLineIndent,spaceBefore,spaceAfter}).filter(([,n])=>n)) } };
}
/** Type on a Path from a path's first subpath, in the same coordinate space as the path. */
export function pathText(subpath, values, paint = {}) {
  return createNode('text', { ...textProperties({ ...values, kind: 'onPath', pathSubpath: subpath }),
    appearance: appearance(paint.fill ?? '#071411', paint.stroke ?? null, paint.strokeWidth ?? .5) });
}
/** One compound path per visible glyph, grouped per line. Group identity keeps selection stable. */
export function textToOutlines(node) {
  if(node.type!=='text'||!hasTextLayout(node))throw new Error('Resolve the text font before creating outlines.');
  if(node.layout.overflow)throw new Error(node.kind==='onPath'?'The text does not fit on its path. Use a longer path, a smaller size or a smaller start offset before creating outlines.':'The text overflows its frame. Enlarge the frame before creating outlines.');
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
