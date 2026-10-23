/**
 * What Export As and Export for Screens write: formats, artboard ranges and file names. Pure.
 */
export const EXPORT_TARGETS = Object.freeze([
  { id: 'pdf', label: 'PDF', ext: 'pdf', vector: true, multipage: true },
  { id: 'ai', label: 'Adobe Illustrator (PDF compatible)', ext: 'ai', vector: true, multipage: true },
  { id: 'svg', label: 'SVG', ext: 'svg', vector: true },
  { id: 'svgz', label: 'SVG Compressed', ext: 'svgz', vector: true },
  { id: 'eps', label: 'EPS', ext: 'eps', vector: true },
  { id: 'dxf', label: 'DXF (AutoCAD R12)', ext: 'dxf', vector: true },
  { id: 'plt', label: 'PLT (HP-GL plotter and cutter)', ext: 'plt', vector: true },
  { id: 'png', label: 'PNG', ext: 'png', vector: false },
  { id: 'jpg', label: 'JPEG', ext: 'jpg', vector: false },
  { id: 'webp', label: 'WebP', ext: 'webp', vector: false },
  { id: 'tif', label: 'TIFF', ext: 'tif', vector: false },
  { id: 'gif', label: 'GIF', ext: 'gif', vector: false },
]);
export const exportTarget = (id) => EXPORT_TARGETS.find((t) => t.id === id) ?? null;
export const targetForPath = (path) => {
  const ext = String(path).split('.').pop().toLowerCase();
  return EXPORT_TARGETS.find((t) => t.ext === ext || (t.id === 'jpg' && ext === 'jpeg') || (t.id === 'tif' && ext === 'tiff')) ?? null;
};

/**
 * Artboard indices (0-based, in document order) for "1-3, 5". Empty or invalid parts are refused with
 * a message naming them; numbers outside the document are refused too.
 */
export function parseRange(text, count) {
  const parts = String(text ?? '').split(/[,;]/).map((p) => p.trim()).filter(Boolean), out = new Set();
  if (!parts.length) throw new Error('Enter artboard numbers, for example 1-3, 5.');
  for (const part of parts) {
    const match = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) throw new Error(`“${part}” is not an artboard number or range.`);
    let [a, b] = [Number(match[1]), Number(match[2] ?? match[1])];
    if (a > b) [a, b] = [b, a];
    if (a < 1 || b > count) throw new Error(`The document has artboards 1–${count}.`);
    for (let i = a; i <= b; i++) out.add(i - 1);
  }
  return [...out].sort((x, y) => x - y);
}

const safe = (text) => String(text ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Sibling file for one of several artboards: "Logo.png" → "Logo-Front.png". */
export function artboardFilePath(path, board, index) {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')), dot = path.lastIndexOf('.');
  const stem = dot > slash ? path.slice(0, dot) : path, ext = dot > slash ? path.slice(dot) : '';
  return `${stem}-${safe(board?.name) || `Artboard ${index + 1}`}${ext}`;
}

/** Scales offered by Export for Screens; 1x is 72 ppi as in Illustrator. */
export const SCREEN_SCALES = Object.freeze(['0.5x', '0.75x', '1x', '1.5x', '2x', '3x', '4x', '72 ppi', '150 ppi', '300 ppi', '600 ppi']);
/** Raster resolution for a scale label such as "2x" or "300 ppi". */
export function scalePpi(scale) {
  const text = String(scale).trim().toLowerCase();
  const x = text.match(/^(\d+(?:\.\d+)?)\s*x$/), ppi = text.match(/^(\d+(?:\.\d+)?)\s*ppi$/);
  const value = x ? Number(x[1]) * 72 : ppi ? Number(ppi[1]) : NaN;
  if (!(value > 0)) throw new Error(`Use a scale like 2x or 300 ppi instead of “${scale}”.`);
  return value;
}
/**
 * Relative path for one Export for Screens file: optional sub-folder per scale or format, then
 * prefix + artboard name + suffix + extension.
 */
export function screensFilePath({ board, index, prefix = '', suffix = '', scale = '1x', format, subfolders = null }) {
  const target = exportTarget(format), name = `${safe(prefix)}${safe(board?.name) || `Artboard ${index + 1}`}${safe(suffix)}.${target.ext}`;
  if (subfolders === 'scale' && !target.vector) return `${safe(scale)}/${name}`;
  if (subfolders === 'format') return `${target.ext.toUpperCase()}/${name}`;
  return name;
}
