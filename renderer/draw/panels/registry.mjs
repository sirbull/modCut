// Tabs shown for structure but not built yet; they stay disabled with this explanation.
const UNAVAILABLE = { gradient: 'Gradients arrive in D2.3' };
export const PANEL_DEFINITIONS = Object.freeze([
  ['properties', 'Properties', 'adjustments'], ['layers', 'Layers', 'layers-intersect'],
  ['artboards', 'Artboards', 'artboard'], ['swatches', 'Swatches', 'color-swatch'], ['color', 'Color', 'palette'],
  ['character', 'Character', 'typography'], ['paragraph', 'Paragraph', 'align-left'],
  ['stroke', 'Stroke', 'line-dashed'], ['gradient', 'Gradient', 'contrast-2'], ['transparency', 'Transparency', 'blend-mode'], ['appearance', 'Appearance', 'stack-2'], ['align', 'Align', 'align-center'], ['transform', 'Transform', 'arrows-move'], ['pathfinder', 'Pathfinder', 'layers-subtract'],
].map(([id, name, icon]) => Object.freeze({ id, name, icon, ...(UNAVAILABLE[id] ? { unavailable: UNAVAILABLE[id] } : {}) })));
export function panelIconHref(id) {
  const panel = PANEL_DEFINITIONS.find(panel => panel.id === id);
  if (!panel) throw new Error(`Unknown panel: ${id}`);
  return panelSpriteHref(panel.icon);
}
export function panelSpriteHref(icon) { return new URL(`icons/sprite.svg#icon-${icon}`, import.meta.url).href; }

// Properties and Layers live permanently in the right dock. Every other panel belongs to one
// group in the panel rail; a group opens as a flyout with one tab per panel, as in Illustrator.
export const DOCK_PANELS = Object.freeze(['properties', 'layers']);
export const PANEL_GROUPS = Object.freeze([
  ['swatches', 'color-swatch', ['swatches']],
  ['color', 'palette', ['color']],
  ['stroke', 'line-dashed', ['stroke', 'gradient', 'transparency']],
  ['appearance', 'stack-2', ['appearance']],
  ['transform', 'arrows-move', ['transform', 'align', 'pathfinder']],
  ['type', 'typography', ['character', 'paragraph']],
  ['artboards', 'artboard', ['artboards']],
].map(([id, icon, tabs]) => Object.freeze({ id, icon, tabs: Object.freeze(tabs) })));
export function groupForPanel(id) { return PANEL_GROUPS.find(group => group.tabs.includes(id)) ?? null; }
export function panelAvailable(id) { return !PANEL_DEFINITIONS.find(panel => panel.id === id)?.unavailable; }
export function panelName(id) { return PANEL_DEFINITIONS.find(panel => panel.id === id)?.name ?? id; }
export const DOCK_MIN_PX = 120;
/** Properties' share of the dock height, clamped so both halves keep at least `min` pixels. */
export function clampDockSplit(fraction, total, min = DOCK_MIN_PX) {
  const value = Number.isFinite(fraction) ? fraction : .5;
  if (!(total > min * 2)) return .5;
  return Math.min(1 - min / total, Math.max(min / total, value));
}
