import { MAX_ARTBOARDS, MAX_ARTBOARD_SIZE } from './artboards.mjs';

// Document sizes are stored in millimetres; units only change how sizes are entered and shown.
export const DOCUMENT_UNITS = Object.freeze({mm:1, cm:10, in:25.4, pt:25.4/72, px:25.4/96});
export const UNIT_LABELS = Object.freeze({mm:'Millimeters', cm:'Centimeters', in:'Inches', pt:'Points', px:'Pixels'});
export const RESOLUTIONS = Object.freeze([72,150,300,600]);
export const LAYOUTS = Object.freeze(['grid-row','grid-column','row','column']);
export const RECENT_KEY = 'modcut_draw_recent_setups';
export const TEMPLATES_KEY = 'modcut_draw_document_templates';
export const MAX_RECENT = 8;
export const MAX_TEMPLATES = 100;

export const PRESET_CATEGORIES = Object.freeze([
  {id:'laser',name:'Laser beds'}, {id:'print',name:'Print'}, {id:'screen',name:'Screen'},
].map(Object.freeze));
const px = value => value*DOCUMENT_UNITS.px;
// Laser sizes are typical working areas; machine profiles in modCut are listed separately and take precedence.
export const DOCUMENT_PRESETS = Object.freeze([
  {id:'a6',category:'print',name:'A6',width:105,height:148},
  {id:'a5',category:'print',name:'A5',width:148,height:210},
  {id:'a4',category:'print',name:'A4',width:210,height:297},
  {id:'a3',category:'print',name:'A3',width:297,height:420},
  {id:'letter',category:'print',name:'Letter',width:215.9,height:279.4,units:'in'},
  {id:'legal',category:'print',name:'Legal',width:215.9,height:355.6,units:'in'},
  {id:'tabloid',category:'print',name:'Tabloid',width:279.4,height:431.8,units:'in'},
  {id:'hd',category:'screen',name:'HD 720p',width:px(1280),height:px(720),units:'px',ppi:72},
  {id:'screen',category:'screen',name:'Full HD 1080p',width:px(1920),height:px(1080),units:'px',ppi:72},
  {id:'uhd',category:'screen',name:'4K UHD',width:px(3840),height:px(2160),units:'px',ppi:72},
  {id:'square',category:'screen',name:'Square 1080',width:px(1080),height:px(1080),units:'px',ppi:72},
  {id:'portrait',category:'screen',name:'Portrait 1080 × 1350',width:px(1080),height:px(1350),units:'px',ppi:72},
  {id:'story',category:'screen',name:'Story 1080 × 1920',width:px(1080),height:px(1920),units:'px',ppi:72},
  {id:'k40',category:'laser',name:'K40 (300 × 200)',width:300,height:200},
  {id:'xtool-m1',category:'laser',name:'xTool M1',width:385,height:300},
  {id:'glowforge',category:'laser',name:'Glowforge Pro / Plus',width:495,height:279},
  {id:'xtool-s1',category:'laser',name:'xTool S1',width:498,height:319},
  {id:'xtool-p2',category:'laser',name:'xTool P2',width:600,height:308},
  {id:'co2-6040',category:'laser',name:'CO₂ 6040',width:600,height:400},
  {id:'epilog-zing-16',category:'laser',name:'Epilog Zing 16',width:406.4,height:304.8},
  {id:'epilog-edge-24',category:'laser',name:'Epilog Fusion Edge 24',width:609.6,height:304.8},
  {id:'epilog-pro-32',category:'laser',name:'Epilog Fusion Pro 32',width:812.8,height:508},
  {id:'trotec-speedy-100',category:'laser',name:'Trotec Speedy 100',width:610,height:305},
  {id:'trotec-speedy-300',category:'laser',name:'Trotec Speedy 300',width:726,height:432},
  {id:'trotec-speedy-400',category:'laser',name:'Trotec Speedy 400',width:1000,height:610},
  {id:'uls-vls-460',category:'laser',name:'ULS VLS 4.60',width:609.6,height:457.2},
  {id:'co2-1390',category:'laser',name:'CO₂ 1390',width:1300,height:900},
].map(p=>Object.freeze({units:'mm',ppi:300,...p})));

const round = (value, digits=3) => Math.round(value*10**digits)/10**digits;
export const toMm = (value, unit='mm') => value*(DOCUMENT_UNITS[unit] ?? NaN);
export const fromMm = (mm, unit='mm') => round(mm/(DOCUMENT_UNITS[unit] ?? NaN), unit==='px'||unit==='pt' ? 2 : 3);
export function formatSize(width, height, unit='mm') {
  return `${fromMm(width,unit)} × ${fromMm(height,unit)} ${unit}`;
}

/** Validates a document setup (sizes in millimetres) and returns a clean copy. */
export function normalizeSetup(input = {}) {
  const setup = {
    width:Number(input.width), height:Number(input.height),
    units:Object.hasOwn(DOCUMENT_UNITS,input.units) ? input.units : 'mm',
    ppi:Number(input.ppi ?? 300), count:Number(input.count ?? 1),
    layout:LAYOUTS.includes(input.layout) ? input.layout : 'grid-row',
    columns:Number(input.columns ?? 2), spacing:Number(input.spacing ?? 20),
  };
  for (const key of ['width','height']) if (!Number.isFinite(setup[key]) || setup[key] <= 0 || setup[key] > MAX_ARTBOARD_SIZE) throw new Error(`Use a ${key} between 0 and ${MAX_ARTBOARD_SIZE} mm.`);
  if (!Number.isInteger(setup.count) || setup.count < 1 || setup.count > MAX_ARTBOARDS) throw new Error('Use between 1 and 1,000 artboards.');
  if (!Number.isInteger(setup.columns) || setup.columns < 1 || setup.columns > MAX_ARTBOARDS) throw new Error('Use between 1 and 1,000 columns.');
  if (!Number.isFinite(setup.spacing) || setup.spacing < 0) throw new Error('Spacing cannot be negative.');
  if (!Number.isFinite(setup.ppi) || setup.ppi <= 0 || setup.ppi > 10000) throw new Error('Choose a valid resolution.');
  return setup;
}

/** Reads the reusable properties of an existing document: first artboard size, units, resolution and board arrangement. */
export function setupFromDocument(doc) {
  const boards = doc.artboards, first = boards[0], second = boards[1];
  let layout = 'grid-row', columns = 2, spacing = 20;
  if (second) {
    const sameRow = boards.every(b => Math.abs(b.y-first.y) < 1e-6), sameColumn = boards.every(b => Math.abs(b.x-first.x) < 1e-6);
    layout = sameRow ? 'row' : sameColumn ? 'column' : 'grid-row';
    if (layout === 'grid-row') columns = Math.max(1, boards.findIndex(b => Math.abs(b.y-first.y) >= 1e-6));
    spacing = layout === 'column' ? second.y-first.y-first.height : second.x-first.x-first.width;
    if (!(spacing >= 0)) spacing = 20;
  }
  return normalizeSetup({width:first.width, height:first.height, units:doc.units, ppi:doc.rasterEffectsPpi,
    count:boards.length, layout, columns, spacing:round(spacing)});
}

const sameSetup = (a,b) => ['width','height','units','ppi','count','layout','columns','spacing'].every(key =>
  typeof a[key] === 'number' ? Math.abs(a[key]-b[key]) < 1e-6 : a[key] === b[key]);

export function rememberRecent(list, entry, now = Date.now()) {
  const next = {label:String(entry.label || 'Custom').slice(0,80), ...normalizeSetup(entry), usedAt:now};
  return [next, ...list.filter(item => !sameSetup(item,next))].slice(0, MAX_RECENT);
}
export function saveTemplate(list, name, setup, id = `template-${Date.now().toString(36)}`) {
  const label = String(name ?? '').trim().slice(0,80);
  if (!label) throw new Error('Give the template a name.');
  const existing = list.find(item => item.name.toLowerCase() === label.toLowerCase());
  const next = {id:existing?.id ?? id, name:label, ...normalizeSetup(setup)};
  return [next, ...list.filter(item => item !== existing)].slice(0, MAX_TEMPLATES);
}
export const removeTemplate = (list, id) => list.filter(item => item.id !== id);

/** Reads a stored list and drops anything that no longer validates. */
export function loadStoredList(storage, key) {
  let values;
  try { values = JSON.parse(storage?.getItem(key) ?? '[]'); } catch { return []; }
  if (!Array.isArray(values)) return [];
  return values.flatMap(item => {
    try {
      const setup = normalizeSetup(item);
      return key === TEMPLATES_KEY
        ? (typeof item.id === 'string' && typeof item.name === 'string' && item.name.trim() ? [{id:item.id, name:item.name, ...setup}] : [])
        : [{label:String(item.label || 'Custom'), ...setup, usedAt:Number(item.usedAt) || 0}];
    } catch { return []; }
  });
}
export function storeList(storage, key, list) {
  try { storage?.setItem(key, JSON.stringify(list)); return true; } catch { return false; }
}
