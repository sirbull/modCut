import { DOCK_PANELS, PANEL_DEFINITIONS, PANEL_GROUPS, groupForPanel } from './registry.mjs';

/** Each panel moves independently. Groups only define separators in the icon rail. */
export const WINDOW_GROUPS = Object.freeze(PANEL_DEFINITIONS.filter(panel => panel.id !== 'artboards').map(panel => Object.freeze({
  id: panel.id, icon: panel.icon, tabs: Object.freeze([panel.id]), groupId: groupForPanel(panel.id)?.id ?? panel.id,
})));
const ids = new Set(WINDOW_GROUPS.map(group => group.id));
export const windowGroup = id => WINDOW_GROUPS.find(group => group.tabs.includes(id)) ?? null;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const shares = values => { const total=values.reduce((a,b)=>a+b,0); return values.map(value=>value/total); };
const columnWidth = width => Number.isFinite(width) ? clamp(width,180,480) : 286;
export const DEFAULT_PANEL_RAIL = Object.freeze(['color','swatches','stroke','gradient','appearance','transform','align','pathfinder','image-trace']);
export const defaultPanelLayout = () => ({ version: 4, rail: [...DEFAULT_PANEL_RAIL], dock: [...DOCK_PANELS],
  columns: [{ id:'main', panels:[...DOCK_PANELS], sizes:[.5,.5], width:286 }], floating: {} });

/** Migrate old docks into columns, validate saved dimensions, and keep each panel in one place. */
export function normalizePanelLayout(value, { migrateDefault = true } = {}) {
  if (!value || !Array.isArray(value.rail) || !Array.isArray(value.dock)) return defaultPanelLayout();
  const layout = { version: 4, rail: [], dock: [], columns: [], floating: {} }, used = new Set(), columnIds = new Set();
  // Earlier layouts stored a whole tab group under one ID. Expand it once, preserving order and closed panels.
  const expand = id => value.version >= 2 ? [id] : PANEL_GROUPS.find(group => group.id === id)?.tabs ?? [id];
  const accept = id => ids.has(id) && !used.has(id) && (used.add(id), true);
  const columns = value.version >= 3 && Array.isArray(value.columns) ? value.columns : [{id:'main',panels:value.dock}];
  for (const [i,column] of columns.entries()) {
    if (!column || !Array.isArray(column.panels)) continue;
    const panels=[], sizes=[];
    column.panels.forEach((id,index)=>{ if(accept(id)){ panels.push(id); sizes.push(Number.isFinite(column.sizes?.[index])&&column.sizes[index]>0 ? column.sizes[index] : 1); } });
    if (!panels.length) continue;
    let id = typeof column.id==='string' && column.id ? column.id : `column-${i}`;
    while(columnIds.has(id)) id+='-copy'; columnIds.add(id);
    layout.columns.push({id,panels,sizes:shares(sizes),width:columnWidth(column.width),...(column.side==='before-rail'?{side:'before-rail'}:{})});
  }
  layout.columns.sort((a,b)=>Number(b.side==='before-rail')-Number(a.side==='before-rail'));
  layout.dock=layout.columns.flatMap(c=>c.panels);
  for (const key of value.rail) for (const id of expand(key)) if (accept(id)) layout.rail.push(id);
  for (const [key, point] of Object.entries(value.floating ?? {})) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    expand(key).forEach((id, index) => { if (accept(id)) layout.floating[id] = { x: point.x + index * 20, y: point.y + index * 24 }; });
  }
  // Update the former, untouched all-panels default. Explicitly customized layouts keep their choices.
  if (migrateDefault && !(value.version >= 4) && !Object.keys(layout.floating).length &&
      JSON.stringify(layout.rail) === JSON.stringify(PANEL_GROUPS.flatMap(group => group.tabs)) &&
      JSON.stringify(layout.columns) === JSON.stringify(defaultPanelLayout().columns)) layout.rail = [...DEFAULT_PANEL_RAIL];
  return layout;
}

export function movePanel(layout, id, { to, index, column, columnIndex, side, x = 32, y = 32 }) {
  const next = normalizePanelLayout(layout);
  if (!ids.has(id)) return next;
  const sourceIndex=next.columns.findIndex(c=>c.panels.includes(id)), source=next.columns[sourceIndex];
  const target=next.columns.find(c=>c.id===column) ?? (to==='dock'&&!column ? next.columns.at(-1) : null);
  const sourcePosition=source?.panels.indexOf(id);
  const originalSizes=target && new Map(target.panels.map((id,i)=>[id,target.sizes[i]]));
  next.rail = next.rail.filter(key => key !== id);
  for(const c of next.columns){ const at=c.panels.indexOf(id);if(at>=0){c.panels.splice(at,1);c.sizes.splice(at,1);} }
  next.columns=next.columns.filter(c=>c.panels.length);
  delete next.floating[id];
  if (to === 'rail') next.rail.splice(Math.max(0, Math.min(next.rail.length, index ?? next.rail.length)), 0, id);
  else if (to === 'floating') next.floating[id] = { x: Number.isFinite(x) ? x : 32, y: Number.isFinite(y) ? y : 32 };
  else if (to === 'dock' || to === 'column') {
    let destination=to==='dock'&&target ? next.columns.find(c=>c.id===target.id) : null;
    if(!destination){
      const existingIds=new Set(next.columns.map(c=>c.id));let key=to==='dock'&&target ? target.id : 'column-1';
      while(existingIds.has(key))key+='-next';
      destination={id:key,panels:[],sizes:[],width:target?.width??286,...((side??target?.side)==='before-rail'?{side:'before-rail'}:{})};
      let at=columnIndex ?? (target ? sourceIndex : next.columns.length);
      if(to==='column'&&source&&!source.panels.length&&sourceIndex<at)at--;
      next.columns.splice(clamp(at,0,next.columns.length),0,destination);
    }
    let at=index??destination.panels.length;
    if(source===target&&sourcePosition<at)at--;
    at=clamp(at,0,destination.panels.length);
    const sameColumn=source===target&&to==='dock';
    const size=1/(destination.panels.length+1);
    destination.sizes=sameColumn ? destination.panels.map(key=>originalSizes.get(key)) : shares(destination.sizes).map(value=>value*(1-size));
    destination.panels.splice(at,0,id);destination.sizes.splice(at,0,sameColumn ? originalSizes.get(id) : size);
  }
  next.dock=next.columns.flatMap(c=>c.panels);
  return normalizePanelLayout(next);
}

export const PANEL_LAYOUT_KEY = 'modcut.draw.panel-layout';
export function loadPanelLayout(storage = globalThis.localStorage) {
  try { return normalizePanelLayout(JSON.parse(storage?.getItem(PANEL_LAYOUT_KEY) ?? 'null')); } catch { return defaultPanelLayout(); }
}
export function savePanelLayout(layout, storage = globalThis.localStorage) {
  try { storage?.setItem(PANEL_LAYOUT_KEY, JSON.stringify(normalizePanelLayout(layout))); } catch { /* Layout remains usable without storage. */ }
}
