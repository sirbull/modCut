/**
 * Workspaces (D4.5): rail order, floating windows, chosen tabs, dock split/collapse and Control Bar
 * saved under a name in local storage, as Illustrator's Window > Workspace. Pure apart from
 * the storage passed in.
 */
import { defaultPanelLayout, normalizePanelLayout, savePanelLayout } from '../panels/layout.mjs';
const KEY = 'modcut.draw.workspaces';
export const ESSENTIALS = Object.freeze({ name: 'Essentials', flyout: null, groupTabs: {}, dockSplit: null, dockCollapsed: {}, controlBar: true });
const preset = (id, name, rail) => Object.freeze({ ...ESSENTIALS, id, name, panelLayout: { ...defaultPanelLayout(), rail } });
export const BUILTIN_WORKSPACES = Object.freeze([
  Object.freeze({ ...ESSENTIALS, id:'essentials' }),
  preset('laser-cutting','Laser Cutting',['transform','align','pathfinder','stroke','color']),
  preset('drawing','Drawing',['color','swatches','stroke','gradient','appearance','graphic-styles','transform','pathfinder']),
  preset('typography','Typography',['character','paragraph','glyphs','color','swatches','appearance','transform','align']),
  preset('image-tracing','Image Tracing',['image-trace','color','swatches','appearance','pathfinder','transform','align']),
]);
export const WORKSPACE_FILE_FORMAT = 'modcut-workspace';
export const WORKSPACE_FILE_MAX_BYTES = 1024 * 1024;
export const workspaceFileError = error => String(error?.message ?? error).replace(/^Error invoking remote method '(?:saveWorkspaceFile|loadWorkspaceFile)': (?:Error: )?/,'');
const builtInName = name => BUILTIN_WORKSPACES.some(ws => ws.name.toLowerCase() === name.toLowerCase());

function snapshot(ui, name) {
  const n = String(name ?? '').trim();
  if (!n) throw new Error('Name the workspace.');
  if (n.length > 120 || /[\u0000-\u001f]/.test(n)) throw new Error('Invalid workspace name.');
  return { name:n, flyout:ui.flyout ?? null, groupTabs:{ ...(ui.groupTabs ?? {}) }, dockSplit:ui.dockSplit ?? null,
    dockCollapsed:{ ...(ui.dockCollapsed ?? {}) }, controlBar:ui.controlBar !== false, panelLayout:normalizePanelLayout(ui.panelLayout,{migrateDefault:false}) };
}
export function captureWorkspace(ui, name) {
  const ws = snapshot(ui,name);
  if (builtInName(ws.name)) throw new Error('This workspace is built in; choose another name.');
  return ws;
}
export function workspaceForExport(ui) {
  const name = ui.workspace || 'My Workspace';
  return snapshot(ui,builtInName(name) ? `${name} (custom)` : name);
}
/** Portable view configuration only: never artwork, assets, scripts or filesystem paths. */
export function serializeWorkspace(ws) {
  return JSON.stringify({ format:WORKSPACE_FILE_FORMAT, version:1, workspace:snapshot(ws,ws.name) },null,2)+'\n';
}
export function parseWorkspace(text) {
  if (typeof text !== 'string' || text.length > WORKSPACE_FILE_MAX_BYTES) throw new Error('Invalid workspace file.');
  let file;
  try { file=JSON.parse(text.replace(/^\uFEFF/,'')); } catch { throw new Error('Invalid workspace file.'); }
  if (file?.format !== WORKSPACE_FILE_FORMAT || file.version !== 1 || typeof file.workspace?.name !== 'string' ||
      !Array.isArray(file.workspace.panelLayout?.rail) || !Array.isArray(file.workspace.panelLayout?.dock) ||
      file.workspace.panelLayout.rail.length > 100 || file.workspace.panelLayout.dock.length > 100) throw new Error('Invalid workspace file.');
  const raw=file.workspace, layout=normalizePanelLayout(raw.panelLayout,{migrateDefault:false});
  const known = new Set([...layout.rail,...layout.dock,...Object.keys(layout.floating)]);
  const pairs = (value, accept) => value && typeof value==='object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(accept)) : {};
  const ws = snapshot({ panelLayout:layout, flyout:known.has(raw.flyout)&&layout.rail.includes(raw.flyout)?raw.flyout:null,
    dockCollapsed:pairs(raw.dockCollapsed,([id,value])=>known.has(id)&&typeof value==='boolean'),
    groupTabs:pairs(raw.groupTabs,([id,value])=>known.has(id)&&known.has(value)),
    dockSplit:Number.isFinite(raw.dockSplit)?Math.min(1,Math.max(0,raw.dockSplit)):null,
    controlBar:raw.controlBar !== false },raw.name);
  if (builtInName(ws.name)) ws.name+=' (custom)';
  return ws;
}
export function applyWorkspace(ui, ws, storage = globalThis.localStorage) {
  Object.assign(ui, { flyout: ws.flyout ?? null, groupTabs: { ...(ws.groupTabs ?? {}) }, dockSplit: ws.dockSplit ?? null, dockCollapsed: { ...(ws.dockCollapsed ?? {}) }, controlBar: ws.controlBar !== false, workspace: ws.name });
  ui.panelLayout = ws.panelLayout ? normalizePanelLayout(ws.panelLayout,{migrateDefault:false}) : defaultPanelLayout();
  savePanelLayout(ui.panelLayout, storage);
  return ui;
}
export function loadWorkspaces(storage = globalThis.localStorage) {
  try { const list = JSON.parse(storage?.getItem(KEY) ?? '[]'); return Array.isArray(list) ? list.filter((w) => w && typeof w.name === 'string') : []; } catch { return []; }
}
/** Saves `ws`, replacing one with the same name. Returns the list. */
export function saveWorkspace(ws, storage = globalThis.localStorage) {
  const list = [...loadWorkspaces(storage).filter((w) => w.name.toLowerCase() !== ws.name.toLowerCase()), ws].sort((a, b) => a.name.localeCompare(b.name));
  try { storage?.setItem(KEY, JSON.stringify(list)); } catch { throw new Error('The workspace could not be saved.'); }
  return list;
}
export function deleteWorkspace(name, storage = globalThis.localStorage) {
  const list = loadWorkspaces(storage).filter((w) => w.name !== name);
  try { storage?.setItem(KEY, JSON.stringify(list)); } catch {}
  return list;
}
