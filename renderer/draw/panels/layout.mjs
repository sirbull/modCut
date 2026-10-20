import { DOCK_PANELS, PANEL_DEFINITIONS, PANEL_GROUPS, groupForPanel } from './registry.mjs';

/** Each panel moves independently. Groups only define separators in the icon rail. */
export const WINDOW_GROUPS = Object.freeze(PANEL_DEFINITIONS.filter(panel => panel.id !== 'artboards').map(panel => Object.freeze({
  id: panel.id, icon: panel.icon, tabs: Object.freeze([panel.id]), groupId: groupForPanel(panel.id)?.id ?? panel.id,
})));
const ids = new Set(WINDOW_GROUPS.map(group => group.id));
export const windowGroup = id => WINDOW_GROUPS.find(group => group.tabs.includes(id)) ?? null;
export const defaultPanelLayout = () => ({ version: 2, rail: PANEL_GROUPS.flatMap(group => group.tabs), dock: [...DOCK_PANELS], floating: {} });

/** Ignore obsolete IDs and malformed storage, and keep every group in at most one place. */
export function normalizePanelLayout(value) {
  if (!value || !Array.isArray(value.rail) || !Array.isArray(value.dock)) return defaultPanelLayout();
  const layout = { version: 2, rail: [], dock: [], floating: {} }, used = new Set();
  // Earlier layouts stored a whole tab group under one ID. Expand it once, preserving order and closed panels.
  const expand = id => value.version === 2 ? [id] : PANEL_GROUPS.find(group => group.id === id)?.tabs ?? [id];
  const accept = id => ids.has(id) && !used.has(id) && (used.add(id), true);
  for (const id of value.dock) if (DOCK_PANELS.includes(id) && accept(id)) layout.dock.push(id);
  for (const key of value.rail) for (const id of expand(key)) if (accept(id)) layout.rail.push(id);
  for (const [key, point] of Object.entries(value.floating ?? {})) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    expand(key).forEach((id, index) => { if (accept(id)) layout.floating[id] = { x: point.x + index * 20, y: point.y + index * 24 }; });
  }
  return layout;
}

export function movePanel(layout, id, { to, index, x = 32, y = 32 }) {
  const next = normalizePanelLayout(layout);
  if (!ids.has(id)) return next;
  next.rail = next.rail.filter(key => key !== id);
  next.dock = next.dock.filter(key => key !== id);
  delete next.floating[id];
  if (to === 'rail') next.rail.splice(Math.max(0, Math.min(next.rail.length, index ?? next.rail.length)), 0, id);
  else if (to === 'floating') next.floating[id] = { x: Number.isFinite(x) ? x : 32, y: Number.isFinite(y) ? y : 32 };
  else if (to === 'dock' && DOCK_PANELS.includes(id)) next.dock.push(id);
  return next;
}

export const PANEL_LAYOUT_KEY = 'modcut.draw.panel-layout';
export function loadPanelLayout(storage = globalThis.localStorage) {
  try { return normalizePanelLayout(JSON.parse(storage?.getItem(PANEL_LAYOUT_KEY) ?? 'null')); } catch { return defaultPanelLayout(); }
}
export function savePanelLayout(layout, storage = globalThis.localStorage) {
  try { storage?.setItem(PANEL_LAYOUT_KEY, JSON.stringify(normalizePanelLayout(layout))); } catch { /* Layout remains usable without storage. */ }
}
