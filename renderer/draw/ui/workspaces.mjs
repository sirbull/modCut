/**
 * Workspaces (D4.5): the panel layout (open panel group, chosen tabs, dock split and collapsed panels,
 * Control Bar) saved under a name in local storage, as Illustrator's Window > Workspace. Pure apart from
 * the storage passed in.
 */
const KEY = 'modcut.draw.workspaces';
export const ESSENTIALS = Object.freeze({ name: 'Essentials', flyout: null, groupTabs: {}, dockSplit: null, dockCollapsed: {}, controlBar: true });
export function captureWorkspace(ui, name) {
  const n = String(name ?? '').trim();
  if (!n) throw new Error('Name the workspace.');
  if (n.toLowerCase() === ESSENTIALS.name.toLowerCase()) throw new Error('Essentials is built in; choose another name.');
  return { name: n, flyout: ui.flyout ?? null, groupTabs: { ...(ui.groupTabs ?? {}) }, dockSplit: ui.dockSplit ?? null, dockCollapsed: { ...(ui.dockCollapsed ?? {}) }, controlBar: ui.controlBar !== false };
}
export function applyWorkspace(ui, ws) {
  Object.assign(ui, { flyout: ws.flyout ?? null, groupTabs: { ...(ws.groupTabs ?? {}) }, dockSplit: ws.dockSplit ?? null, dockCollapsed: { ...(ws.dockCollapsed ?? {}) }, controlBar: ws.controlBar !== false, workspace: ws.name });
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
