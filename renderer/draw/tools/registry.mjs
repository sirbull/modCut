/** Tool metadata only. Implementations arrive in their specified phases; no placeholder tools run. */
const definitions = [
  ['select', 'Selection', 'select', 'selection', 1],
  ['direct-selection', 'Direct Selection', 'direct-select', 'direct-selection', 1],
  ['group-selection', 'Group Selection', 'group-select', 'direct-selection', 2],
  ['magic-wand', 'Magic Wand', 'magic-wand', 'selection', 3],
  ['lasso', 'Lasso', 'lasso', 'selection', 3],
  ['artboard', 'Artboard', 'artboard', 'artboard', 1],
  ['pen', 'Pen', 'pen', 'pen', 1],
  ['add-anchor', 'Add Anchor Point', 'anchor-add', 'pen', 1],
  ['delete-anchor', 'Delete Anchor Point', 'anchor-remove', 'pen', 1],
  ['anchor-point', 'Anchor Point', 'anchor-convert', 'pen', 1],
  ['curvature', 'Curvature', 'curvature', 'pen', 3],
  ['pencil', 'Pencil', 'pencil', 'pencil', 2],
  ['smooth', 'Smooth', 'smooth', 'pencil', 3],
  ['path-eraser', 'Path Eraser', 'path-eraser', 'pencil', 3],
  ['paintbrush', 'Paintbrush', 'brush', 'brush', 4],
  ['blob-brush', 'Blob Brush', 'blob-brush', 'brush', 4],
  ['eraser', 'Eraser', 'eraser', 'eraser', 3],
  ['scissors', 'Scissors', 'scissors', 'scissors', 2],
  ['knife', 'Knife', 'knife', 'eraser', 3],
  ['shape-builder', 'Shape Builder', 'shape-builder', 'shape-builder', 3],
  ['width', 'Width', 'width', 'width', 4],
  ['rectangle', 'Rectangle', 'rect', 'shapes', 1],
  ['rounded-rectangle', 'Rounded Rectangle', 'rect-rounded', 'shapes', 1],
  ['ellipse', 'Ellipse', 'ellipse', 'shapes', 1],
  ['polygon', 'Polygon', 'polygon', 'shapes', 1],
  ['star', 'Star', 'star', 'shapes', 1],
  ['line', 'Line Segment', 'line', 'lines', 1],
  ['arc', 'Arc', 'arc', 'lines', 2],
  ['spiral', 'Spiral', 'spiral', 'lines', 3],
  ['rectangular-grid', 'Rectangular Grid', 'grid-rect', 'lines', 4],
  ['polar-grid', 'Polar Grid', 'grid-polar', 'lines', 4],
  ['type', 'Type', 'type', 'type', 2],
  ['area-type', 'Area Type', 'type-area', 'type', 2],
  ['type-on-path', 'Type on a Path', 'type-path', 'type', 2],
  ['vertical-type', 'Vertical Type', 'type-vertical', 'type', 5],
  ['touch-type', 'Touch Type', 'type-touch', 'type', 5],
  ['rotate', 'Rotate', 'rotate', 'rotate', 1],
  ['reflect', 'Reflect', 'reflect', 'rotate', 1],
  ['scale', 'Scale', 'scale', 'scale', 1],
  ['shear', 'Shear', 'shear', 'scale', 2],
  ['free-transform', 'Free Transform', 'free-transform', 'transform', 3],
  ['gradient', 'Gradient', 'gradient', 'gradient', 2],
  ['eyedropper', 'Eyedropper', 'eyedropper', 'eyedropper', 2],
  ['measure', 'Measure', 'measure', 'eyedropper', 2],
  ['blend', 'Blend', 'blend', 'blend', 4],
  ['live-paint', 'Live Paint Bucket', 'paint-bucket', 'live-paint', null],
  ['hand', 'Hand', 'hand', 'hand', 1],
  ['zoom', 'Zoom', 'zoom', 'zoom', 1],
  ['rotate-view', 'Rotate View', 'rotate-view', 'hand', 4],
];
export const TOOL_DEFINITIONS = Object.freeze(definitions.map(([id, name, icon, group, phase]) =>
  Object.freeze({ id, name, icon, group, phase, bindingId: `tool.${id}` })));
export function createToolRegistry(implementations = {}) {
  for (const [id, Tool] of Object.entries(implementations)) {
    if (!TOOL_DEFINITIONS.some((tool) => tool.id === id)) throw new Error(`Unknown Draw tool: ${id}`);
    if (typeof Tool !== 'function') throw new TypeError(`Expected a tool class: ${id}`);
  }
  const tools = Object.freeze(TOOL_DEFINITIONS.map((definition) => Object.freeze({ ...definition, Tool: implementations[definition.id] || null })));
  const byId = new Map(tools.map((tool) => [tool.id, tool]));
  return Object.freeze({ tools, get: (id) => byId.get(id) || null,
    available: (id) => !!byId.get(id)?.Tool,
    group: (name) => tools.filter((tool) => tool.group === name) });
}
export const toolRegistry = createToolRegistry();
export function iconHref(id) {
  const tool = toolRegistry.get(id);
  if (!tool) throw new Error(`Unknown Draw tool: ${id}`);
  return new URL(`../icons/sprite.svg#icon-${tool.icon}`, import.meta.url).href;
}
