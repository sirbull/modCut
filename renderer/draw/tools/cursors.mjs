/** Illustrator-style SVG cursors per tool and state. Each has a CSS fallback so a cursor is always visible. */
const svg = (body, size = 32) => `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${body}</svg>`;
const url = (body, x, y, fallback) => `url("data:image/svg+xml,${encodeURIComponent(svg(body))}") ${x} ${y}, ${fallback}`;
// White halo under a dark stroke keeps every cursor visible on light artboards and dark pasteboards.
const halo = (d, width = 1.6, extra = '') => `<path d='${d}' fill='none' stroke='white' stroke-width='${width + 2.6}' stroke-linecap='round' stroke-linejoin='round'${extra}/><path d='${d}' fill='none' stroke='#111' stroke-width='${width}' stroke-linecap='round' stroke-linejoin='round'${extra}/>`;
const ARROW = 'M4 2 L4 21 L8.6 16.5 L11.6 23.5 L14.6 22.2 L11.7 15.4 L17.6 15.4 Z';
const arrow = (fill, badge = '') => url(`<path d='${ARROW}' fill='${fill}' stroke='${fill === '#111' ? 'white' : '#111'}' stroke-width='1.6' stroke-linejoin='round'/>${badge}`, 4, 2, 'default');
const NIB = `<path d='M4 3 L17 16 L12 17.5 L9 23 L5.5 19.5 L11 16.5 Z' fill='white' stroke='#111' stroke-width='1.6' stroke-linejoin='round'/><circle cx='10.5' cy='12.5' r='1.3' fill='#111'/>`;
const pen = (badge = '') => url(`${NIB}${badge}`, 4, 3, 'crosshair');
const box = (x, y, fill) => `<rect x='${x}' y='${y}' width='6' height='6' fill='${fill}' stroke='#111' stroke-width='1.4'/>`;
const cross = (cx = 16, cy = 16, r = 9) => halo(`M${cx - r} ${cy}H${cx - 2}M${cx + 2} ${cy}H${cx + r}M${cx} ${cy - r}V${cy - 2}M${cx} ${cy + 2}V${cy + r}`, 1.4);
const magnifier = (sign) => url(`<circle cx='13' cy='13' r='8' fill='white' stroke='#111' stroke-width='2'/>${halo('M19 19L27 27', 2.4)}${halo(sign === '+' ? 'M9.5 13h7M13 9.5v7' : 'M9.5 13h7', 1.6)}`, 13, 13, sign === '+' ? 'zoom-in' : 'zoom-out');
const hand = (closed) => url(halo(closed
  ? 'M10 14v-2a2 2 0 0 1 4 0M14 12v-1a2 2 0 0 1 4 0v1M18 12a2 2 0 0 1 4 0v5a8 8 0 0 1-8 8h-1a7 7 0 0 1-6-3l-2-4a2 2 0 0 1 3.4-2L10 18v-4'
  : 'M10 15V7a2 2 0 0 1 4 0v6M14 13V5a2 2 0 0 1 4 0v8M18 13V7a2 2 0 0 1 4 0v10a8 8 0 0 1-8 8h-1a7 7 0 0 1-6-3l-3-5a2 2 0 0 1 3.4-2L10 18', 1.5), 16, 16, closed ? 'grabbing' : 'grab');

export const CURSORS = Object.freeze({
  select: arrow('#111'),
  type: url(halo('M12 5h8M16 5v22M12 27h8',1.4),16,16,'text'),
  'area-type': url(halo('M12 8h8M16 8v16M12 24h8M6 12V4h8M22 4h6v8M28 22v6h-8M14 28H6v-6',1.4),16,16,'text'),
  eyedropper: url(halo('M5 27l3-1 12-12-2-2-12 12zM18 12l2 2M17 9l6 6M19 7a2.8 2.8 0 0 1 4 0l2 2a2.8 2.8 0 0 1 0 4l-2 2',1.5),5,27,'crosshair'),
  measure: url(`${cross(10,10,7)}${halo('M15 26L28 13M18 23l-2-2M21 20l-2-2M24 17l-2-2',1.4)}`,10,10,'crosshair'),
  scissors: url(halo('M9 9a3 3 0 1 0 0 .1M9 23a3 3 0 1 0 0 .1M11.5 11L27 24M11.5 21L27 8',1.5),16,16,'crosshair'),
  'group-select': arrow('white', halo('M22 18v8M18 22h8', 1.4)),
  gradient: url(`${cross(10,10,7)}<rect x='14' y='20' width='14' height='7' rx='1' fill='white' stroke='#111' stroke-width='1.4'/><rect x='14' y='20' width='7' height='7' fill='#111'/>`,10,10,'crosshair'),
  'type-on-path': url(halo('M12 4h8M16 4v15M12 19h8M4 28c6-6 18-6 24 0',1.4),16,16,'text'),
  'select-anchor': arrow('#111', box(18, 18, '#111')),
  'select-move': arrow('#111', halo('M22 18v8M18 22h8', 1.4)),
  'select-copy': arrow('#111', `${halo('M22 15v5M22 24v5', 1.4)}${halo('M17 22h10', 1.4)}`),
  direct: arrow('white'),
  'direct-anchor': arrow('white', box(18, 18, '#111')),
  'direct-segment': arrow('white', halo('M17 24l9-6', 1.4)),
  'pen-new': pen(halo('M24 3v8M20.5 5l7 4M20.5 9l7-4', 1.5)),
  'pen-active': pen(),
  'pen-continue': pen(halo('M20 13l8-8', 1.5)),
  'pen-close': pen(`<circle cx='24' cy='8' r='4' fill='white' stroke='#111' stroke-width='1.6'/>`),
  'pen-add': pen(halo('M24 3v8M20 7h8', 1.5)),
  'pen-remove': pen(halo('M20 7h8', 1.5)),
  'pen-convert': pen(halo('M20 11l4-6 4 6', 1.5)),
  'pen-join': pen(halo('M20 8h8', 1.5) + `<rect x='22.5' y='4.5' width='3' height='7' fill='white' stroke='#111' stroke-width='1.3'/>`),
  'anchor-add': pen(halo('M24 3v8M20 7h8', 1.5)),
  'anchor-remove': pen(halo('M20 7h8', 1.5)),
  'anchor-convert': url(`${halo('M7 25L16 6L25 25', 1.6)}`, 16, 6, 'crosshair'),
  shape: url(cross(), 16, 16, 'crosshair'),
  artboard: url(`${cross(10, 10, 7)}${halo('M18 18h10v10H18z', 1.4)}`, 10, 10, 'crosshair'),
  hand: hand(false),
  'hand-active': hand(true),
  'zoom-in': magnifier('+'),
  'zoom-out': magnifier('-'),
  transform: url(`${cross()}<circle cx='16' cy='16' r='5' fill='none' stroke='white' stroke-width='3.6'/><circle cx='16' cy='16' r='5' fill='none' stroke='#111' stroke-width='1.2'/>`, 16, 16, 'crosshair'),
  rotate: url(halo('M7 15a9 9 0 0 1 15-6l3 3M25 5v7h-7M25 19a9 9 0 0 1-15 6l-3-3M7 29v-7h7', 1.6), 16, 16, 'crosshair'),
  'resize-ns': 'ns-resize', 'resize-ew': 'ew-resize', 'resize-nwse': 'nwse-resize', 'resize-nesw': 'nesw-resize',
  corner: arrow('white', `<circle cx='22' cy='22' r='4' fill='white' stroke='#111' stroke-width='1.4' stroke-dasharray='2 1.5'/>`),
});
const TOOL_CURSORS = {
  type: 'type',
  'area-type': 'area-type',
  'type-on-path': 'type-on-path',
  eyedropper: 'eyedropper', measure: 'measure', scissors: 'scissors', 'group-selection': 'group-select',
  gradient: 'gradient',
  select: 'select', 'direct-selection': 'direct', 'group-selection': 'direct', pen: 'pen-new', 'add-anchor': 'anchor-add', 'delete-anchor': 'anchor-remove',
  'anchor-point': 'anchor-convert', hand: 'hand', zoom: 'zoom-in', artboard: 'artboard', rotate: 'transform', reflect: 'transform', scale: 'transform',
  rectangle: 'shape', 'rounded-rectangle': 'shape', ellipse: 'shape', polygon: 'shape', star: 'shape', line: 'shape',
};
/** Base cursor for a tool; unknown tools still get a visible crosshair. */
export function toolCursor(tool, { zoomOut = false } = {}) {
  if (tool === 'zoom' && zoomOut) return CURSORS['zoom-out'];
  return CURSORS[TOOL_CURSORS[tool] ?? 'shape'];
}
export const RESIZE_CURSORS = Object.freeze({ tl: 'resize-nwse', br: 'resize-nwse', tr: 'resize-nesw', bl: 'resize-nesw', tc: 'resize-ns', bc: 'resize-ns', lc: 'resize-ew', rc: 'resize-ew' });
