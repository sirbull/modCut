// Tabs shown for structure but not built yet; they stay disabled with this explanation.
const UNAVAILABLE = {};
export const PANEL_DEFINITIONS = Object.freeze([
  ['properties', 'Properties', 'adjustments'], ['layers', 'Layers', 'layers-intersect'],
  ['artboards', 'Artboards', 'artboard'], ['swatches', 'Swatches', 'color-swatch'], ['color', 'Color', 'palette'],
  ['character', 'Character', 'typography'], ['paragraph', 'Paragraph', 'align-left'], ['glyphs', 'Glyphs', 'letter-case-upper'],
  ['stroke', 'Stroke', 'stroke-weight'], ['gradient', 'Gradient', 'gradient-preview'], ['recolor', 'Recolor', 'recolor'], ['transparency', 'Transparency', 'blend-mode'], ['appearance', 'Appearance', 'stack-2'], ['align', 'Align', 'align-center'], ['transform', 'Transform', 'arrows-move'], ['pathfinder', 'Pathfinder', 'layers-subtract'],
  ['info', 'Info', 'info-circle'], ['history', 'History', 'history'], ['document-info', 'Document Info', 'file-info'], ['links', 'Links', 'link'],
  ['image-trace', 'Image Trace', 'photo-scan'], ['graphic-styles', 'Graphic Styles', 'brush'], ['navigator', 'Navigator', 'map-2'], ['asset-export', 'Asset Export', 'packages'],
].map(([id, name, icon]) => Object.freeze({ id, name, icon, ...(UNAVAILABLE[id] ? { unavailable: UNAVAILABLE[id] } : {}) })));
export function panelIconHref(id) {
  const panel = PANEL_DEFINITIONS.find(panel => panel.id === id);
  if (!panel) throw new Error(`Unknown panel: ${id}`);
  return panelSpriteHref(panel.icon);
}
export function panelSpriteHref(icon) { return new URL(`icons/sprite.svg#icon-${icon}`, import.meta.url).href; }

// Default layout: Properties and Layers in the right dock, the other groups in the icon rail.
// Groups mark rail separators; each panel moves independently between the rail and floating windows.
export const DOCK_PANELS = Object.freeze(['properties', 'layers']);
export const PANEL_GROUPS = Object.freeze([
  ['swatches', 'color-swatch', ['swatches']],
  ['color', 'palette', ['color']],
  ['recolor', 'recolor', ['recolor']],
  ['stroke', 'stroke-weight', ['stroke', 'gradient', 'transparency']],
  ['appearance', 'stack-2', ['appearance', 'graphic-styles']],
  ['transform', 'arrows-move', ['transform', 'align', 'pathfinder']],
  ['type', 'typography', ['character', 'paragraph', 'glyphs']],
  ['image-trace', 'photo-scan', ['image-trace']],
  ['navigator', 'map-2', ['navigator']],
  ['info', 'info-circle', ['info', 'history', 'document-info', 'links']],
].map(([id, icon, tabs]) => Object.freeze({ id, icon, tabs: Object.freeze(tabs) })));
export function groupForPanel(id) { return PANEL_GROUPS.find(group => group.tabs.includes(id)) ?? null; }
// Asset Export opens from File; Artboards enters the tool and its Properties.
export const MENU_PANELS = Object.freeze([{ id: 'asset-export', tabs: Object.freeze(['asset-export']) }]);
export function panelAvailable(id) { return !PANEL_DEFINITIONS.find(panel => panel.id === id)?.unavailable; }
export function panelName(id) { return PANEL_DEFINITIONS.find(panel => panel.id === id)?.name ?? id; }
export const DOCK_MIN_PX = 120;
/** Properties' share of the dock height, clamped so both halves keep at least `min` pixels. */
export function clampDockSplit(fraction, total, min = DOCK_MIN_PX) {
  const value = Number.isFinite(fraction) ? fraction : .5;
  if (!(total > min * 2)) return .5;
  return Math.min(1 - min / total, Math.max(min / total, value));
}
