/** Custom SVG cursors per tool and state, with CSS fallbacks. */
import { CURSOR_ARTWORK } from './cursor-artwork.mjs';

// Hotspots are measured in displayed (32 × 32) pixels, not the 64 × 64 SVG viewBox.
// The redrawn nib points at (6, 2) in the source artwork. Use the same tip for every pen state.
const artworkCursor = (name, x, y, fallback = 'crosshair', badge = '') => {
  const source = CURSOR_ARTWORK[name];
  if (!source) throw new Error(`Missing custom cursor: ${name}`);
  const image = badge ? source.replace('</svg>', `<g transform="scale(2)">${badge}</g></svg>`) : source;
  return `url("data:image/svg+xml,${encodeURIComponent(image)}") ${x} ${y}, ${fallback}`;
};
const custom = (name, x, y, fallback, badge) => artworkCursor(`Cur_${name}@2x.svg`, x, y, fallback, badge);
const pen = (state = 'Pen') => custom(`${state}_1_1`, 3, 1);
const arrow = (white, badge = '') => custom(`${white ? 'DirectSelect' : 'Select'}_1_1`, 1, 1, 'default', badge);
const svg = (body, size = 32) => `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${body}</svg>`;
const url = (body, x, y, fallback) => `url("data:image/svg+xml,${encodeURIComponent(svg(body))}") ${x} ${y}, ${fallback}`;
// White halo under a dark stroke keeps every cursor visible on light artboards and dark pasteboards.
const halo = (d, width = 1.6, extra = '') => `<path d='${d}' fill='none' stroke='white' stroke-width='${width + 2.6}' stroke-linecap='round' stroke-linejoin='round'${extra}/><path d='${d}' fill='none' stroke='#111' stroke-width='${width}' stroke-linecap='round' stroke-linejoin='round'${extra}/>`;
const box = (x, y, fill) => `<rect x='${x}' y='${y}' width='6' height='6' fill='${fill}' stroke='#111' stroke-width='1.4'/>`;
const cross = (cx = 16, cy = 16, r = 9) => halo(`M${cx - r} ${cy}H${cx - 2}M${cx + 2} ${cy}H${cx + r}M${cx} ${cy - r}V${cy - 2}M${cx} ${cy + 2}V${cy + r}`, 1.4);
export const CURSORS = Object.freeze({
  select: arrow(false),
  type: custom('HorizontalText_1_1', 1, 1, 'text'),
  'area-type': custom('HorizontalText_1_1', 1, 1, 'text'),
  pencil: url(halo('M6 26l2-6L22 6l4 4L12 24zM19 9l4 4',1.5),6,26,'crosshair'),
  eyedropper: custom('Eyedropper_2_17', 2, 17),
  measure: url(`${cross(10,10,7)}${halo('M15 26L28 13M18 23l-2-2M21 20l-2-2M24 17l-2-2',1.4)}`,10,10,'crosshair'),
  scissors: custom('Scissors_1_1', 1, 1),
  'group-select': custom('DirectSelectAdd_1_1', 1, 1, 'default'),
  // Width: crosshair with a tapering stroke and its width arrows.
  width: url(`${cross(10,10,7)}<path d='M14 24c4-5 9-7 14-7v4c-5 0-9 2-14 7z' fill='white' stroke='#111' stroke-width='1.3' stroke-linejoin='round'/>`,10,10,'crosshair'),
  paintbrush: custom('Brush_2_16', 2, 16),
  'blob-brush': url(`<circle cx='16' cy='16' r='9' fill='none' stroke='white' stroke-width='3'/><circle cx='16' cy='16' r='9' fill='none' stroke='#111' stroke-width='1.4'/>${cross(16,16,3)}`,16,16,'crosshair'),
  blend: url(`${cross(10,10,7)}<rect x='15' y='15' width='6' height='6' fill='white' stroke='#111' stroke-width='1.3'/><rect x='22' y='22' width='6' height='6' fill='#111' stroke='white' stroke-width='1'/>`,10,10,'crosshair'),
  gradient: url(`${cross(10,10,7)}<rect x='14' y='20' width='14' height='7' rx='1' fill='white' stroke='#111' stroke-width='1.4'/><rect x='14' y='20' width='7' height='7' fill='#111'/>`,10,10,'crosshair'),
  'type-on-path': custom('HorizTextOnPath_11_12', 11, 12, 'text'),
  'select-anchor': arrow(false, box(18, 18, '#111')),
  'select-move': custom('Move_1_1', 1, 1, 'default'),
  'select-copy': custom('MoveCopy_1_1', 1, 1, 'default'),
  direct: arrow(true),
  'direct-move': custom('DirectMove_1_1', 1, 1, 'default'),
  'direct-copy': custom('DirectMoveCopy_1_1', 1, 1, 'default'),
  'direct-anchor': arrow(true, box(18, 18, '#111')),
  'direct-segment': arrow(true, halo('M17 24l9-6', 1.4)),
  'pen-new': pen('PenNew'),
  'pen-active': pen(),
  'pen-continue': pen('PenContinue'),
  'pen-close': pen('PenClose'),
  'pen-add': pen('PenAdd'),
  'pen-remove': pen('PenSubstract'),
  'pen-convert': pen('PenCorner'),
  'pen-join': pen('PenWeld'),
  'anchor-add': pen('PenAdd'),
  'anchor-remove': pen('PenSubstract'),
  'anchor-convert': custom('EditAnchor_1_1', 1, 1),
  shape: custom('Precise_9_9', 10, 10),
  artboard: url(`${cross(10, 10, 7)}${halo('M18 18h10v10H18z', 1.4)}`, 10, 10, 'crosshair'),
  hand: custom('Hand_11_11', 11, 11, 'grab'),
  'hand-active': custom('Fist_11_11', 11, 11, 'grabbing'),
  'zoom-in': custom('ZoomIn_8_8', 8, 8, 'zoom-in'),
  'zoom-out': custom('ZoomOut_8_8', 8, 8, 'zoom-out'),
  transform: url(`${cross()}<circle cx='16' cy='16' r='5' fill='none' stroke='white' stroke-width='3.6'/><circle cx='16' cy='16' r='5' fill='none' stroke='#111' stroke-width='1.2'/>`, 16, 16, 'crosshair'),
  rotate: custom('RotateTopLeftCorner_7_7', 7, 7),
  'resize-ns': custom('ScaleVertical_9_9', 10, 10, 'ns-resize'),
  'resize-ew': custom('ScaleHorizontal_9_9', 10, 10, 'ew-resize'),
  'resize-nwse': custom('ScaleTLBR_9_9', 10, 10, 'nwse-resize'),
  'resize-nesw': custom('ScaleTRBL_9_9', 10, 10, 'nesw-resize'),
  corner: arrow(true, `<circle cx='22' cy='22' r='4' fill='white' stroke='#111' stroke-width='1.4' stroke-dasharray='2 1.5'/>`),
});
const TOOL_CURSORS = {
  type: 'type',
  'area-type': 'area-type',
  'type-on-path': 'type-on-path',
  eyedropper: 'eyedropper', measure: 'measure', pencil: 'pencil', shear: 'transform', scissors: 'scissors',
  gradient: 'gradient', width: 'width', blend: 'blend', paintbrush: 'paintbrush', 'blob-brush': 'blob-brush',
  select: 'select', 'direct-selection': 'direct', 'group-selection': 'group-select', pen: 'pen-new', 'add-anchor': 'anchor-add', 'delete-anchor': 'anchor-remove',
  'anchor-point': 'anchor-convert', hand: 'hand', 'rotate-view': 'rotate', 'touch-type': 'type', 'vertical-type': 'type', zoom: 'zoom-in', artboard: 'artboard', rotate: 'rotate', reflect: 'transform', scale: 'transform',
  rectangle: 'shape', 'rounded-rectangle': 'shape', ellipse: 'shape', polygon: 'shape', star: 'shape', line: 'shape',
};
/** Base cursor for a tool; unknown tools still get a visible crosshair. */
export function toolCursor(tool, { zoomOut = false } = {}) {
  if (tool === 'zoom' && zoomOut) return CURSORS['zoom-out'];
  return CURSORS[TOOL_CURSORS[tool] ?? 'shape'];
}
export const RESIZE_CURSORS = Object.freeze({ tl: 'resize-nwse', br: 'resize-nwse', tr: 'resize-nesw', bl: 'resize-nesw', tc: 'resize-ns', bc: 'resize-ns', lc: 'resize-ew', rc: 'resize-ew' });
