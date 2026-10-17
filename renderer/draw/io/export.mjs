/**
 * Export helpers (D2.5 SVG, D2.7 PNG/JPG/WebP). Pure: the renderer builds the artwork, these functions
 * name files, size raster output and turn Paper's SVG into a millimetre document for one artboard.
 */
export const EXPORT_FORMATS = Object.freeze({
  svg: { label: 'SVG', mime: 'image/svg+xml' },
  png: { label: 'PNG', mime: 'image/png' },
  jpg: { label: 'JPEG', mime: 'image/jpeg' },
  webp: { label: 'WebP', mime: 'image/webp' },
});
export const EXPORT_RESOLUTIONS = Object.freeze([72, 150, 300, 600]);
const MAX_PIXELS = 16384;

const safe = (text) => String(text ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
/** "Logo-Artboard 1.svg"; one artboard documents use the document name alone. */
export function exportFileName(documentName, board, format, { single = false } = {}) {
  const base = safe(documentName) || 'Untitled', name = safe(board?.name);
  return `${single || !name ? base : `${base}-${name}`}.${format}`;
}
/** Pixel size of an artboard at `ppi`, refused when a side would exceed what a canvas can hold. */
export function rasterSize(board, ppi) {
  if (!(ppi > 0)) throw new Error('Choose a resolution.');
  const width = Math.max(1, Math.round(board.width / 25.4 * ppi)), height = Math.max(1, Math.round(board.height / 25.4 * ppi));
  if (width > MAX_PIXELS || height > MAX_PIXELS) throw new Error(`At ${ppi} ppi the image would be ${width} × ${height} pixels. Choose a lower resolution.`);
  return { width, height };
}
/**
 * Wraps the inner markup of Paper's exportSVG (already in artboard coordinates, millimetres) as a
 * standalone SVG whose size is the artboard in mm. `background` adds a filled rectangle behind it.
 */
export function svgDocument(board, inner, { background = null, title = '' } = {}) {
  const n = (v) => String(Number(v.toFixed(4)));
  const W = n(board.width), H = n(board.height), esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const parts = [`<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`];
  if (title) parts.push(`<title>${esc(title)}</title>`);
  if (background) parts.push(`<rect width="${W}" height="${H}" fill="${esc(background)}"/>`);
  parts.push(inner, '</svg>', '');
  return parts.join('\n');
}
/** The inner markup of an <svg> string produced by Paper, without its root element. */
export function svgInner(svg) {
  const open = svg.indexOf('>', svg.indexOf('<svg')), close = svg.lastIndexOf('</svg>');
  if (open < 0 || close < 0) return '';
  return svg.slice(open + 1, close).trim();
}
