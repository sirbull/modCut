export const PANEL_DEFINITIONS = Object.freeze([
  ['properties', 'Properties', 'adjustments'], ['layers', 'Layers', 'layers-intersect'],
  ['artboards', 'Artboards', 'artboard'], ['color', 'Color', 'palette'],
  ['stroke', 'Stroke', 'line-dashed'], ['align', 'Align', 'align-center'], ['transform', 'Transform', 'arrows-move'],
].map(([id, name, icon]) => Object.freeze({ id, name, icon })));
export function panelIconHref(id) {
  const panel = PANEL_DEFINITIONS.find(panel => panel.id === id);
  if (!panel) throw new Error(`Unknown panel: ${id}`);
  return panelSpriteHref(panel.icon);
}
export function panelSpriteHref(icon) { return new URL(`icons/sprite.svg#icon-${icon}`, import.meta.url).href; }
