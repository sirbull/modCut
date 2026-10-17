/** Versioned JSON data in millimetres. No renderer or Paper.js dependencies. */
import { EFFECTS, effect } from './effects.mjs';
import { resolveCorners } from '../geom/corners.mjs';
import { textSignature, validPathSubpath } from './text-layout.mjs';
import { validGoogleReference,validFontAxes } from './font-reference.mjs';
export const DOCUMENT_VERSION = 1;
export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
export const NODE_TYPES = Object.freeze(['layer', 'group', 'path', 'shape', 'text', 'image', 'trace', 'blend', 'compoundPath']);
export const CONTAINERS = Object.freeze(['layer', 'group', 'compoundPath']);

export function createId() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';
  return Array.from(bytes, (value) => alphabet[value & 63]).join('');
}

export function createAppearance() { return { fills: [], strokes: [], effects: [] }; }
export function createNode(type, properties = {}) {
  if (!NODE_TYPES.includes(type)) throw new TypeError(`Unknown node type: ${type}`);
  const details = {
    layer: { color: '#006B5C', template: false, printable: true, dimImagesTo: 50, children: [] },
    group: { children: [] }, compoundPath: { children: [] },
    path: { subpaths: [], fillRule: 'nonzero' }, shape: { shape: 'rect', params: { width: 10, height: 10 } },
    text: { kind: 'point', content: { runs: [] }, paragraph: {} },
    image: { assetId: '', ppiEffective: 300, reference: false },
    trace: { sourceImageId: '', options: {} }, blend: { a: '', b: '', steps: 10, orientation: 'page' },
  }[type];
  return structuredClone({ id: createId(), type, name: '', visible: true, locked: false,
    opacity: 1, blendMode: 'normal', transform: [...IDENTITY], appearance: createAppearance(),
    ...details, ...properties, type });
}
export function createArtboard(properties = {}) {
  return structuredClone({ id: createId(), name: 'Artboard 1', x: 0, y: 0,
    width: 600, height: 400, background: '#FFFFFF', ...properties });
}
export function createDocument(properties = {}) {
  return structuredClone({ version: DOCUMENT_VERSION, id: createId(), name: 'Untitled', units: 'mm',
    rasterEffectsPpi: 300, colorMode: 'rgb', artboards: [createArtboard()],
    layers: [createNode('layer', { name: 'Layer 1' })], swatches: [], swatchGroups: [],
    graphicStyles: [], assets: {}, guides: [], cutLinks: [],
    settings: { grid: { x: 10, y: 10 }, snapping: { point: true, grid: false, pixel: false },
      smartGuides: true, keyboardIncrement: 1, cornerRadius: 0 }, ...properties });
}

export function validateDocument(doc) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  // JSON compatibility is checked before geometry so NaN, cycles and exotic objects cannot be saved.
  function json(value, path, ancestors = new Set()) {
    if (typeof value === 'number' && !Number.isFinite(value)) fail(path, 'Expected a finite number');
    else if (value && typeof value === 'object') {
      if (ancestors.has(value)) { fail(path, 'Cyclic data'); return; }
      if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail(path, 'Expected plain JSON');
      ancestors.add(value);
      for (const [key, child] of Object.entries(value)) json(child, `${path}.${key}`, ancestors);
      ancestors.delete(value);
    } else if (!['string', 'boolean', 'number'].includes(typeof value) && value !== null) fail(path, 'Expected JSON data');
  }
  json(doc, '$');
  if (errors.length) return errors;
  if (!object(doc)) return [{ path: '$', message: 'Expected a document object' }];
  const number = (value, path, min = -Infinity, max = Infinity) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(path, `Expected a number in [${min}, ${max}]`);
  };
  const string = (value, path) => { if (typeof value !== 'string') fail(path, 'Expected a string'); };
  const enumeration = (value, options, path) => { if (!options.includes(value)) fail(path, `Expected ${options.join(', ')}`); };
  const array = (value, path) => { if (!Array.isArray(value)) { fail(path, 'Expected an array'); return []; } return value; };
  const bool = (value, path) => { if (typeof value !== 'boolean') fail(path, 'Expected a boolean'); };
  const ids = new Set();
  const nodesById = new Map();
  const id = (value, path) => {
    if (typeof value !== 'string' || !value || ids.has(value)) fail(path, 'Expected a unique nonempty id');
    ids.add(value);
  };
  const vector = (value, size, path) => {
    if (!Array.isArray(value) || value.length !== size) fail(path, `Expected ${size} numbers`);
    else value.forEach((v, i) => number(v, `${path}.${i}`));
  };
  function paint(value, path) {
    if (!object(value)) { fail(path, 'Expected paint'); return; }
    enumeration(value.type, ['none', 'solid', 'linear', 'radial'], `${path}.type`);
    function color(c, p) {
      const sizes = { rgb: 3, cmyk: 4, gray: 1, hsb: 3 };
      if (!object(c) || !sizes[c.space]) { fail(p, 'Expected a color'); return; }
      vector(c.values, sizes[c.space], `${p}.values`);
    }
    if (value.type === 'solid') color(value.color, `${path}.color`);
    if (['linear', 'radial'].includes(value.type)) {
      const stops = array(value.stops, `${path}.stops`);
      if (stops.length < 2) fail(`${path}.stops`, 'Expected at least two gradient stops');
      stops.forEach((stop, i) => {
        if (!object(stop)) { fail(`${path}.stops.${i}`, 'Expected a stop'); return; }
        number(stop.offset, `${path}.stops.${i}.offset`, 0, 1);
        color(stop.color, `${path}.stops.${i}.color`);
        if (stop.opacity !== undefined) number(stop.opacity, `${path}.stops.${i}.opacity`, 0, 1);
        if (stop.midpoint !== undefined) number(stop.midpoint, `${path}.stops.${i}.midpoint`, 0, 1);
      });
      vector(value.origin, 2, `${path}.origin`);
      number(value.angle, `${path}.angle`); number(value.length, `${path}.length`, Number.MIN_VALUE);
      number(value.aspect, `${path}.aspect`, Number.MIN_VALUE);
    }
  }
  function appearance(value, path) {
    if (!object(value)) { fail(path, 'Expected appearance'); return; }
    array(value.effects, `${path}.effects`).forEach((entry, i) => {
      // Known live effects must have valid settings; unknown types are kept for newer versions.
      if (!object(entry) || typeof entry.type !== 'string') { fail(`${path}.effects.${i}`, 'Expected an effect'); return; }
      if (EFFECTS[entry.type]) try { effect(entry.type, entry); } catch (error) { fail(`${path}.effects.${i}`, error.message); }
    });
    for (const kind of ['fills', 'strokes']) array(value[kind], `${path}.${kind}`).forEach((entry, i) => {
      const p = `${path}.${kind}.${i}`;
      if (!object(entry)) { fail(p, 'Expected an appearance entry'); return; }
      paint(entry.paint, `${p}.paint`); number(entry.opacity, `${p}.opacity`, 0, 1);
      string(entry.blendMode, `${p}.blendMode`); array(entry.effects, `${p}.effects`);
      if (entry.hidden !== undefined) bool(entry.hidden, `${p}.hidden`);
      if (kind === 'strokes') {
        number(entry.width, `${p}.width`, 0); number(entry.miterLimit, `${p}.miterLimit`, 1);
        enumeration(entry.cap, ['butt', 'round', 'square'], `${p}.cap`);
        enumeration(entry.join, ['miter', 'round', 'bevel'], `${p}.join`);
        enumeration(entry.align, ['center', 'inside', 'outside'], `${p}.align`);
        if (entry.dash !== undefined) {
          if (!object(entry.dash)) fail(`${p}.dash`, 'Expected dash settings');
          else {
            array(entry.dash.array, `${p}.dash.array`).forEach((v, j) => number(v, `${p}.dash.array.${j}`, 0));
            if (entry.dash.offset !== undefined) number(entry.dash.offset, `${p}.dash.offset`);
          }
        }
        for (const end of ['startArrow', 'endArrow']) if (entry[end] !== undefined && entry[end] !== null) {
          if (!object(entry[end])) { fail(`${p}.${end}`, 'Expected an arrowhead'); continue; }
          enumeration(entry[end].type, ['arrow', 'triangle', 'circle', 'square', 'bar'], `${p}.${end}.type`);
          number(entry[end].scale, `${p}.${end}.scale`, Number.MIN_VALUE, 10);
        }
      }
    });
  }
  function node(value, path, parentType) {
    if (!object(value)) { fail(path, 'Expected a node'); return; }
    id(value.id, `${path}.id`); enumeration(value.type, NODE_TYPES, `${path}.type`);
    nodesById.set(value.id, value);
    if (parentType === 'document' && value.type !== 'layer') fail(path, 'Top-level nodes must be layers');
    if (parentType === 'compoundPath' && value.type !== 'path') fail(path, 'Compound paths can only contain paths');
    bool(value.visible, `${path}.visible`); bool(value.locked, `${path}.locked`);
    number(value.opacity, `${path}.opacity`, 0, 1); string(value.blendMode, `${path}.blendMode`);
    vector(value.transform, 6, `${path}.transform`); appearance(value.appearance, `${path}.appearance`);
    if(value.strokeScaling!==undefined)bool(value.strokeScaling,`${path}.strokeScaling`);
    if (CONTAINERS.includes(value.type)) array(value.children, `${path}.children`).forEach((child, i) => node(child, `${path}.children.${i}`, value.type));
    else if ('children' in value) fail(`${path}.children`, 'Only containers have children');
    if (value.type === 'layer') {
      string(value.color, `${path}.color`); bool(value.template, `${path}.template`); bool(value.printable, `${path}.printable`);
      if (value.dimImagesTo !== undefined) number(value.dimImagesTo, `${path}.dimImagesTo`, 0, 100);
      for (const key of ['preview', 'dimImages']) if (value[key] !== undefined) bool(value[key], `${path}.${key}`);
    }
    if (value.type === 'path') {
      enumeration(value.fillRule, ['nonzero', 'evenodd'], `${path}.fillRule`);
      if (JSON.stringify(value.transform) !== JSON.stringify(IDENTITY)) fail(`${path}.transform`, 'Path transforms must be baked into anchors');
      array(value.subpaths, `${path}.subpaths`).forEach((subpath, i) => {
        const p = `${path}.subpaths.${i}`;
        if (!object(subpath)) { fail(p, 'Expected a subpath'); return; }
        const pathErrors=errors.length;
        bool(subpath.closed, `${p}.closed`);
        array(subpath.segments, `${p}.segments`).forEach((segment, j) => {
          if (!object(segment)) { fail(`${p}.segments.${j}`, 'Expected a segment'); return; }
          for (const key of ['p', 'in', 'out']) vector(segment[key], 2, `${p}.segments.${j}.${key}`);
        });
        if(subpath.cornerData!==undefined){
          const c=subpath.cornerData,cp=`${p}.cornerData`,beforeErrors=pathErrors;
          if(!object(c)){fail(cp,'Expected live corner data');return;}
          array(c.segments,`${cp}.segments`).forEach((s,j)=>{
            if(!object(s)){fail(`${cp}.segments.${j}`,'Expected a segment');return;}
            for(const key of ['p','in','out'])vector(s[key],2,`${cp}.segments.${j}.${key}`);
          });
          array(c.radii,`${cp}.radii`).forEach((r,j)=>number(r,`${cp}.radii.${j}`,0));
          if(c.segments?.length!==c.radii?.length)fail(cp,'Corner radii must match source anchors');
          if(errors.length===beforeErrors){
            const resolved=resolveCorners(subpath).segments;
            if(resolved.length!==subpath.segments.length||resolved.some((s,j)=>['p','in','out'].some(key=>s[key].some((v,k)=>!Number.isFinite(v)||Math.abs(v-subpath.segments[j][key][k])>1e-8*Math.max(1,Math.abs(v))))))fail(cp,'Resolved live corners must match path geometry');
          }
        }
      });
    }
    if (value.type === 'shape') {
      enumeration(value.shape, ['rect', 'ellipse', 'polygon', 'star', 'line', 'arc', 'spiral'], `${path}.shape`);
      if (!object(value.params)) fail(`${path}.params`, 'Expected shape parameters');
      else for (const [key, v] of Object.entries(value.params)) {
        const dimension = /^(width|height|radius|rx|ry|cornerRadius|innerRadius|outerRadius)$/.test(key);
        if (dimension || /^(x|y|x1|y1|x2|y2|angle|rotation|sides|points|turns|length|startAngle|endAngle)$/.test(key) || typeof v === 'number') number(v, `${path}.params.${key}`, dimension ? 0 : -Infinity);
        if ((key==='sides' || key==='points') && (!Number.isInteger(v) || v<(key==='sides'?3:2))) fail(`${path}.params.${key}`,'Expected a whole number of vertices');
      }
    }
    if (value.type === 'group' && value.clip !== undefined) {
      bool(value.clip, `${path}.clip`);
      if (value.clip === true && !['path', 'shape'].includes(value.children?.at(-1)?.type)) fail(`${path}.clip`, 'A clipping mask needs a path or shape on top');
    }
    if (value.type === 'text') {
      enumeration(value.kind, ['point', 'area', 'onPath'], `${path}.kind`);
      if(value.kind==='area') {
        if(!object(value.frame))fail(`${path}.frame`,'Expected a rectangular text frame');
        else for(const key of ['width','height'])number(value.frame[key],`${path}.frame.${key}`,.1,100000);
        if(value.layout===undefined)fail(`${path}.layout`,'Area text requires a resolved layout');
      }
      if(value.kind==='onPath') {
        const o=value.onPath;
        if(!object(o))fail(`${path}.onPath`,'Expected a text path');
        else {
          if(!validPathSubpath(o.subpath))fail(`${path}.onPath.subpath`,'Expected a path with at least two points');
          number(o.offset,`${path}.onPath.offset`,0,100000);bool(o.flip,`${path}.onPath.flip`);
        }
        if(value.layout===undefined)fail(`${path}.layout`,'Type on a Path requires a resolved layout');
      }
      if (!object(value.content)) fail(`${path}.content`, 'Expected rich text');
      else array(value.content.runs, `${path}.content.runs`).forEach((run, i) => {
        if (!object(run)) fail(`${path}.content.runs.${i}`, 'Expected a text run');
        else {
          string(run.text, `${path}.content.runs.${i}.text`);
          // A styled run may override these character settings only (see RUN_KEYS in text.mjs).
          if (run.character !== undefined) {
            const q = `${path}.content.runs.${i}.character`;
            if (!object(run.character)) fail(q, 'Expected character settings');
            else for (const [key, value] of Object.entries(run.character)) {
              if (key === 'fontFamily') string(value, `${q}.fontFamily`);
              else if (key === 'fontStyle') enumeration(value, ['normal', 'italic'], `${q}.fontStyle`);
              else if (key === 'fontWeight') { if (!['normal', 'bold'].includes(value)) number(value, `${q}.fontWeight`, 1, 1000); }
              else if (key === 'fontSize') number(value, `${q}.fontSize`, .1, 10000);
              else if (key === 'tracking') number(value, `${q}.tracking`, -1000, 10000);
              else if (key === 'baselineShift') number(value, `${q}.baselineShift`, -10000, 10000);
              else if (['horizontalScale', 'verticalScale'].includes(key)) number(value, `${q}.${key}`, 1, 10000);
              else fail(`${q}.${key}`, 'Not a run setting');
            }
          }
        }
      });
      if (!object(value.paragraph)) fail(`${path}.paragraph`, 'Expected paragraph settings');
      else if (value.paragraph.alignment !== undefined) enumeration(value.paragraph.alignment, ['left', 'center', 'right', 'justify'], `${path}.paragraph.alignment`);
      for (const key of ['leftIndent', 'rightIndent', 'firstLineIndent', 'spaceBefore', 'spaceAfter']) if (value.paragraph?.[key] !== undefined) number(value.paragraph[key], `${path}.paragraph.${key}`, -10000, 10000);
      if (value.character !== undefined) {
        const c = value.character, p = `${path}.character`;
        if (!object(c)) fail(p, 'Expected character settings');
        else {
          string(c.fontFamily, `${p}.fontFamily`);
          if (typeof c.fontFamily === 'string' && !c.fontFamily.trim()) fail(`${p}.fontFamily`, 'Expected a font family');
          number(c.fontSize, `${p}.fontSize`, .1, 10000); number(c.leading, `${p}.leading`, .1, 10000);
          if(typeof c.fontWeight==='number')number(c.fontWeight,`${p}.fontWeight`,1,1000);else enumeration(c.fontWeight, ['normal', 'bold'], `${p}.fontWeight`);
          enumeration(c.fontStyle, ['normal', 'italic'], `${p}.fontStyle`);
          if(c.fontPostscriptName!==undefined)string(c.fontPostscriptName,`${p}.fontPostscriptName`);
          if(c.fontSource!==undefined)enumeration(c.fontSource,['system','google'],`${p}.fontSource`);
          if(c.googleFont!==undefined&&(!validGoogleReference(c.googleFont)||c.fontSource!=='google'||c.googleFont.family!==c.fontFamily))fail(`${p}.googleFont`,'Invalid Google font reference');
          if(c.fontAxes!==undefined&&!validFontAxes(c.fontAxes))fail(`${p}.fontAxes`,'Invalid variable font axes');
          if(c.tracking!==undefined)number(c.tracking,`${p}.tracking`,-1000,10000);
          if(c.allCaps!==undefined)bool(c.allCaps,`${p}.allCaps`);
          for(const key of ['horizontalScale','verticalScale'])if(c[key]!==undefined)number(c[key],`${p}.${key}`,1,10000);
          if(c.baselineShift!==undefined)number(c.baselineShift,`${p}.baselineShift`,-10000,10000);
          if(c.kerning!==undefined)enumeration(c.kerning,['metrics','none'],`${p}.kerning`);
        }
      }
      if(value.layout!==undefined) {
        const l=value.layout,p=`${path}.layout`;
        if(!object(l))fail(p,'Expected text layout');
        else {
          if(l.version!==1)fail(`${p}.version`,'Unsupported text layout');
          if(l.signature!==textSignature(value))fail(`${p}.signature`,'Text layout does not match the text');
          if(!object(l.font))fail(`${p}.font`,'Expected font metadata');
          else for(const key of ['family','style','postscriptName'])string(l.font[key],`${p}.font.${key}`);
          array(l.lineWidths,`${p}.lineWidths`).forEach((w,i)=>number(w,`${p}.lineWidths.${i}`));
          if(value.kind==='onPath')bool(l.overflow,`${p}.overflow`);
          if(value.kind==='area') {
            number(l.visibleLines,`${p}.visibleLines`,0,l.lineWidths?.length??0);
            if(!Number.isInteger(l.visibleLines))fail(`${p}.visibleLines`,'Expected a whole number of visible lines');
            bool(l.overflow,`${p}.overflow`);
            if(l.overflow!==(l.visibleLines<l.lineWidths?.length))fail(`${p}.overflow`,'Overflow must match visible lines');
          }
          array(l.glyphs,`${p}.glyphs`).forEach((g,i)=>{
            const q=`${p}.glyphs.${i}`;
            if(!object(g)){fail(q,'Expected a glyph');return;}
            number(g.line,`${q}.line`,0);if(!Number.isInteger(g.line)||g.line>=l.lineWidths?.length)fail(`${q}.line`,'Expected a valid line index');
            if(value.kind==='area'&&g.line>=l.visibleLines)fail(`${q}.line`,'Overset glyphs must not be painted');
            number(g.glyphId,`${q}.glyphId`,0);
            array(g.subpaths,`${q}.subpaths`).forEach((s,j)=>{
              const r=`${q}.subpaths.${j}`;
              if(!object(s)){fail(r,'Expected a glyph contour');return;}
              if(s.closed!==true)fail(`${r}.closed`,'Glyph contours must be closed');
              array(s.segments,`${r}.segments`).forEach((a,k)=>{
                if(!object(a)){fail(`${r}.segments.${k}`,'Expected a segment');return;}
                for(const key of ['p','in','out'])vector(a[key],2,`${r}.segments.${k}.${key}`);
              });
            });
          });
        }
      }
    }
    if (value.type === 'image') {
      if (!Object.hasOwn(doc.assets, value.assetId)) fail(`${path}.assetId`, 'Missing embedded asset');
      number(value.ppiEffective, `${path}.ppiEffective`, Number.MIN_VALUE); bool(value.reference, `${path}.reference`);
      if (value.crop) {
        for (const key of ['x', 'y', 'width', 'height']) number(value.crop[key], `${path}.crop.${key}`, ['width', 'height'].includes(key) ? Number.MIN_VALUE : 0, 1);
        if (value.crop.x + value.crop.width > 1 || value.crop.y + value.crop.height > 1) fail(`${path}.crop`, 'Crop exceeds image bounds');
      }
    }
  }
  if (doc.version !== DOCUMENT_VERSION) fail('$.version', `Expected version ${DOCUMENT_VERSION}`);
  id(doc.id, '$.id'); string(doc.name, '$.name');
  enumeration(doc.units, ['mm', 'cm', 'in', 'pt', 'px', 'pc'], '$.units');
  enumeration(doc.colorMode, ['rgb', 'cmyk'], '$.colorMode'); number(doc.rasterEffectsPpi, '$.rasterEffectsPpi', Number.MIN_VALUE);
  if (!object(doc.assets)) { fail('$.assets', 'Expected an asset map'); return errors; }
  const artboards = array(doc.artboards, '$.artboards');
  if (!artboards.length) fail('$.artboards', 'At least one artboard is required');
  if (artboards.length > 1000) fail('$.artboards', 'At most 1,000 artboards are supported');
  artboards.forEach((board, i) => {
    const p = `$.artboards.${i}`;
    if (!object(board)) { fail(p, 'Expected an artboard'); return; }
    id(board.id, `${p}.id`); string(board.name, `${p}.name`); string(board.background, `${p}.background`);
    for (const key of ['x', 'y', 'width', 'height']) number(board[key], `${p}.${key}`, ['width', 'height'].includes(key) ? Number.MIN_VALUE : -Infinity, ['width', 'height'].includes(key) ? 5779 : Infinity);
  });
  array(doc.layers, '$.layers').forEach((layer, i) => node(layer, `$.layers.${i}`, 'document'));
  for (const key of ['swatches', 'swatchGroups', 'graphicStyles', 'guides', 'cutLinks']) array(doc[key], `$.${key}`);
  if (!object(doc.settings)) fail('$.settings', 'Expected settings');
  else {
    number(doc.settings.keyboardIncrement, '$.settings.keyboardIncrement', Number.MIN_VALUE);
    number(doc.settings.cornerRadius, '$.settings.cornerRadius', 0);
    bool(doc.settings.smartGuides, '$.settings.smartGuides');
    for (const key of ['x', 'y']) number(doc.settings.grid?.[key], `$.settings.grid.${key}`, Number.MIN_VALUE);
    for (const key of ['point', 'grid', 'pixel']) bool(doc.settings.snapping?.[key], `$.settings.snapping.${key}`);
  }
  // References are resolved after walking the complete tree, including forward references.
  function references(nodes, path) {
    for (const [i, n] of nodes.entries()) {
      const p = `${path}.${i}`;
      if (n.type === 'trace' && nodesById.get(n.sourceImageId)?.type !== 'image') fail(`${p}.sourceImageId`, 'Missing source image');
      if (n.type === 'blend') for (const key of ['a', 'b']) if (!nodesById.has(n[key]) || n[key] === n.id) fail(`${p}.${key}`, 'Missing blend endpoint');
      if (Array.isArray(n.children)) references(n.children, `${p}.children`);
    }
  }
  if (!errors.length) references(doc.layers, '$.layers');
  return errors;
}

export function assertDocument(doc) {
  const errors = validateDocument(doc);
  if (errors.length) throw new TypeError(errors.map(({ path, message }) => `${path}: ${message}`).join('\n'));
  return doc;
}
