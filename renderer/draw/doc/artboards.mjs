import { createDocument, createArtboard, assertDocument } from './schema.mjs';

export const MAX_ARTBOARDS = 1000;
export const MAX_ARTBOARD_SIZE = 5779;
export const ARTBOARD_PRESETS = Object.freeze([
  {id:'bed',name:'Machine bed'}, {id:'a4',name:'A4',width:210,height:297},
  {id:'a3',name:'A3',width:297,height:420}, {id:'a5',name:'A5',width:148,height:210},
  {id:'letter',name:'Letter',width:215.9,height:279.4}, {id:'tabloid',name:'Tabloid',width:279.4,height:431.8},
  {id:'square',name:'1080 × 1080 px',width:285.75,height:285.75},
  {id:'screen',name:'1920 × 1080 px',width:508,height:285.75}, {id:'custom',name:'Custom'},
].map(Object.freeze));

export function presetSize(id, bed = {width:600,height:400}) {
  const preset = ARTBOARD_PRESETS.find(p => p.id === id);
  if (!preset) throw new Error('Choose a document preset.');
  return id === 'bed' ? {width:bed.width,height:bed.height} : {width:preset.width ?? bed.width,height:preset.height ?? bed.height};
}
export function artboardLayout(boards, { layout = 'grid-row', columns = 2, spacing = 20 } = {}) {
  if (!['grid-row','grid-column','row','column'].includes(layout)) throw new Error('Choose an artboard layout.');
  if (!Number.isInteger(columns) || columns < 1 || columns > MAX_ARTBOARDS || !Number.isFinite(spacing) || spacing < 0) throw new Error('Invalid artboard spacing or column count.');
  const width = Math.max(...boards.map(b => b.width)), height = Math.max(...boards.map(b => b.height));
  const rows = Math.ceil(boards.length / columns);
  return boards.map((board,i) => ({id:board.id,
    x:(layout === 'column' ? 0 : layout === 'row' ? i : layout === 'grid-column' ? Math.floor(i/rows) : i%columns)*(width+spacing),
    y:(layout === 'row' ? 0 : layout === 'column' ? i : layout === 'grid-column' ? i%rows : Math.floor(i/columns))*(height+spacing),
  }));
}
export function newDrawDocument({name = 'Untitled', preset = 'bed', width, height, count = 1, units = 'mm', ppi = 300, ...layout} = {}, bed) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_ARTBOARDS) throw new Error('Use between 1 and 1,000 artboards.');
  const size = presetSize(preset,bed);
  if (preset === 'custom') { size.width = width; size.height = height; }
  const artboards = Array.from({length:count},(_,i) => createArtboard({...size,name:`Artboard ${i+1}`}));
  const positions = artboardLayout(artboards,layout);
  const document = createDocument({name,units,rasterEffectsPpi:ppi,artboards:artboards.map((board,i) => ({...board,...positions[i]}))});
  assertDocument(document); return document;
}
export function activeArtboard(state) {
  return state.document.getArtboard(state.ui?.artboardId) || state.document.data.artboards[0];
}
