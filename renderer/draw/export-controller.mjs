/**
 * Export As (and the file building shared with Export for Screens): choose where, set the format's
 * options, build the files from the printable artwork and hand them to the main process.
 *
 * `bridge` comes from the app: choosePath({name,format}) → {path,format}, chooseFolder(), write({files,open}),
 * notify(message,kind). `exportBoard` is the workspace's SVG/PNG/JPEG renderer for one artboard.
 */
import { artworkModel } from './io/vector-model.mjs';
import { pdfDocument, JPEG_QUALITY, PDF_PRESETS } from './io/pdf.mjs';
import { epsDocument } from './io/eps.mjs';
import { AI_OPTIONS, aiMetadata, hasTransparency } from './io/ai.mjs';
import { dxfDocument } from './io/dxf.mjs';
import { tiffDocument } from './io/tiff.mjs';
import { pltDocument } from './io/plt.mjs';
import { gifDocument } from './io/gif.mjs';
import { exportTarget, artboardFilePath, scalePpi, screensFilePath } from './io/export-plan.mjs';
import { exportFileName } from './io/export.mjs';
import { exportOptionsDialog, pdfOptionsDialog } from './ui/export-dialogs.mjs';
import { documentInfo } from './doc/document-info.mjs';
import { exportScreensDialog } from './ui/screens-dialog.mjs';

export const DRAW_ATTACHMENT = 'modcut-draw.json';
const THUMBNAIL_PIXELS = 106, SCREENS_THUMBNAIL_PIXELS = 160;

export function base64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
const dataUrlBytes = (url) => Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0));
const loadImage = (url) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Could not draw the page thumbnail.')); img.src = url; });
const fileName = (path) => path.split(/[\\/]/).pop();

export function createExportController({ state, scope, renderer, withScope, exportBoard, bridge }) {
  const remembered = { format: 'pdf', pdf: null, options: {} };
  const compress = globalThis.pako ? (bytes) => globalThis.pako.deflate(bytes) : null;
  const available = () => !!bridge && typeof bridge.choosePath === 'function';

  /** Pixels of a placed image, downsampled above `above` ppi to `ppi`, plus JPEG bytes when asked for. */
  function imageReader({ downsample = 'none', ppi = 300, above = 450, jpeg = null } = {}) {
    return (raster, matrix) => {
      const source = raster.image ?? raster.canvas; if (!source || !raster.width || !raster.height) return null;
      const mmWide = Math.hypot(matrix[0], matrix[1]) || 1, current = raster.width / (mmWide / 25.4);
      const scale = downsample !== 'none' && current > above ? ppi / current : 1;
      const width = Math.max(1, Math.round(raster.width * scale)), height = Math.max(1, Math.round(raster.height * scale));
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = downsample === 'average' ? 'low' : 'high';
      ctx.drawImage(source, 0, 0, width, height);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      let bytes = null;
      if (jpeg) { // JPEG has no alpha: the colour is flattened onto white and the alpha goes to the soft mask.
        const flat = document.createElement('canvas'); flat.width = width; flat.height = height;
        const f = flat.getContext('2d'); f.fillStyle = '#FFFFFF'; f.fillRect(0, 0, width, height); f.drawImage(canvas, 0, 0);
        bytes = dataUrlBytes(flat.toDataURL('image/jpeg', jpeg));
      }
      return { width, height, rgba, jpeg: bytes };
    };
  }
  function model(board, images = null) {
    return withScope(() => {
      // PDF, EPS and DXF get clipping masks as real geometry, and opacity-masked groups as images.
      const art = renderer.exportArtwork({ resolveClips: true, rasterMasks: 300 });
      try { const result = artworkModel(art, board, { layerName: (id) => state.document.getNode(id)?.name, image: images, viewZoom: scope.view.zoom });
        return { ...result, warnings: [...result.warnings, ...(art.data.warnings ?? [])] }; }
      finally { art.remove(); }
    });
  }
  async function thumbnail(board) {
    const ppi = THUMBNAIL_PIXELS / (Math.max(board.width, board.height) / 25.4), img = await loadImage(exportBoard(board.id, 'png', { ppi, background: 'white' }));
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
    const rgba = ctx.getImageData(0, 0, img.width, img.height).data, rgb = new Uint8Array(img.width * img.height * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4) { rgb[j++] = rgba[i]; rgb[j++] = rgba[i + 1]; rgb[j++] = rgba[i + 2]; }
    return { width: img.width, height: img.height, rgb };
  }

  /**
   * Files for `format` and the artboards at `indices`. A PDF holds every artboard as a page; other
   * formats write one file per artboard (named "-Artboard" beside `path` when there are several).
   */
  async function build(format, path, indices, options = {}) {
    const boards = indices.map((i) => state.document.data.artboards[i]).filter(Boolean), warnings = new Set();
    if (!boards.length) throw new Error('Choose at least one artboard.');
    const target = exportTarget(format); if (!target) throw new Error('Choose a file format.');
    if (format === 'ai') options = { ...options, ...AI_OPTIONS };
    if (format === 'pdf' || format === 'ai') {
      const images = imageReader({ ...options, jpeg: options.imageCompression === 'jpeg' ? JPEG_QUALITY[options.jpegQuality] ?? .85 : null });
      const pages = [];
      for (const board of boards) {
        const m = model(board, images); m.warnings.forEach((w) => warnings.add(w));
        pages.push({ model: m, thumbnail: options.thumbnails ? await thumbnail(board) : null });
      }
      const name = state.document.data.name || 'Untitled';
      const attachment = options.preserveEditing ? { name: DRAW_ATTACHMENT, mime: 'application/json', bytes: new TextEncoder().encode(JSON.stringify(state.document.data)) } : null;
      const metadata = format === 'ai' ? aiMetadata({ title: name, pages: boards, transparency: hasTransparency(pages.map((p) => p.model)) }) : null;
      const bytes = pdfDocument(pages, { ...options, compress, title: name, documentName: name, attachment, metadata, artBox: format === 'ai' });
      return { files: [{ path, data: base64(bytes), encoding: 'base64' }], warnings: [...warnings] };
    }
    const files = [];
    // TIFF and GIF: the PNG rendering's pixels, written by our own encoders.
    if (format === 'tif' || format === 'gif') {
      for (const board of boards) {
        const index = state.document.data.artboards.indexOf(board), file = boards.length > 1 ? artboardFilePath(path, board, index) : path, ppi = options.ppi ?? 150;
        const img = await loadImage(exportBoard(board.id, 'png', { ppi, background: options.background ?? 'white' })), canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, img.width, img.height), image = { width: img.width, height: img.height, data: pixels.data };
        const bytes = format === 'gif' ? gifDocument(image) : tiffDocument(image, { ppi, alpha: (options.background ?? 'white') === 'transparent', compression: options.compression ?? 'packbits' });
        files.push({ path: file, data: base64(bytes), encoding: 'base64' });
      }
      return { files, warnings: [...warnings] };
    }
    boards.forEach((board) => {
      const index = state.document.data.artboards.indexOf(board), file = boards.length > 1 ? artboardFilePath(path, board, index) : path;
      if (format === 'svg' || format === 'svgz') {
        const svg = exportBoard(board.id, 'svg', options);
        if (format === 'svg') files.push({ path: file, data: svg, encoding: 'utf8' });
        else if (globalThis.pako) files.push({ path: file, data: base64(globalThis.pako.gzip(new TextEncoder().encode(svg))), encoding: 'base64' });
        else throw new Error('SVG compression is not available.');
      } else if (format === 'eps' || format === 'dxf' || format === 'plt') {
        const m = model(board), result = format === 'eps' ? epsDocument(m) : format === 'plt' ? pltDocument(m, { tolerance: options.tolerance ?? 0.025 }) : dxfDocument(m, { tolerance: options.tolerance ?? 0.01 });
        result.warnings.forEach((w) => warnings.add(w));
        files.push({ path: file, data: result.text, encoding: 'utf8' });
      } else {
        const url = exportBoard(board.id, format, { ppi: options.ppi ?? 150, background: options.background ?? 'transparent', quality: (options.quality ?? 8) / 10 });
        files.push({ path: file, data: url.slice(url.indexOf(',') + 1), encoding: 'base64' });
      }
    });
    return { files, warnings: [...warnings] };
  }

  /** File > Export > Export As…: the save dialog picks the place and format, then that format's options. */
  async function exportAs() {
    if (!available()) throw new Error('Export is not available here.');
    const last = exportTarget(remembered.format);
    const choice = await bridge.choosePath({ name: exportFileName(state.document.data.name, null, last.ext, { single: true }), format: last.id });
    if (!choice) return null;
    const format = choice.format, boards = state.document.data.artboards;
    const options = format === 'pdf' ? await pdfOptionsDialog({ boards, defaults: remembered.pdf }) : await exportOptionsDialog({ format, boards, defaults: remembered.options[format] });
    if (!options) return null;
    remembered.format = format;
    if (format === 'pdf') remembered.pdf = options; else remembered.options[format] = options;
    const { files, warnings } = await build(format, choice.path, options.indices, options);
    const written = await bridge.write({ files, open: format === 'pdf' && options.viewAfter ? files[0].path : null });
    bridge.notify?.(`Exported ${written.length === 1 ? fileName(written[0]) : `${written.length} files`}.`, 'ok');
    for (const warning of warnings) bridge.notify?.(warning, 'info');
    return written;
  }
  /** File > Export > Export for Screens…: every chosen artboard in every format row, into one folder. */
  async function exportScreens() {
    if (!available()) throw new Error('Export is not available here.');
    const boards = state.document.data.artboards;
    const choice = await exportScreensDialog({ boards,
      thumbnail: (board) => exportBoard(board.id, 'png', { ppi: SCREENS_THUMBNAIL_PIXELS / (Math.max(board.width, board.height) / 25.4), background: 'white' }),
      chooseFolder: (current) => bridge.chooseFolder({ defaultPath: current }) });
    if (!choice) return null;
    // Screens PDFs are plain pages: no editing data, layers or marks.
    const pdf = { ...PDF_PRESETS.find((p) => p.id === 'print').options }, files = [], warnings = new Set();
    for (const index of choice.indices) for (const row of choice.rows) {
      const board = boards[index], path = `${choice.folder}/${screensFilePath({ board, index, prefix: choice.prefix, suffix: row.suffix, scale: row.scale, format: row.target, subfolders: choice.subfolders })}`;
      const options = row.target === 'pdf' ? pdf : row.target === 'dxf' ? { tolerance: 0.01 }
        : { ppi: scalePpi(row.scale), background: ['png', 'webp'].includes(row.target) ? 'transparent' : 'white', quality: row.quality ?? 8 };
      const result = await build(row.target, path, [index], options);
      files.push(...result.files); result.warnings.forEach((w) => warnings.add(w));
    }
    const written = await bridge.write({ files, open: choice.openAfter ? choice.folder : null });
    bridge.notify?.(`Exported ${written.length} file${written.length === 1 ? '' : 's'} to ${fileName(choice.folder)}.`, 'ok');
    for (const warning of warnings) bridge.notify?.(warning, 'info');
    return written;
  }
  /**
   * Asset Export: each object in the Asset Export panel as its own file (its painted bounds are the page),
   * at one scale and format, into a chosen folder. Retina scales get an "@2x" style suffix.
   */
  async function exportAssets({ format = 'png', scale = '1x' } = {}) {
    if (!available()) throw new Error('Export is not available here.');
    const assets = (state.document.data.exportAssets ?? []).filter((a) => state.document.getNode(a.nodeId));
    if (!assets.length) throw new Error('Add objects to the Asset Export panel first.');
    const target = exportTarget(format); if (!target || !['png', 'jpg', 'webp', 'svg'].includes(format)) throw new Error('Choose PNG, JPEG, WebP or SVG.');
    const folder = await bridge.chooseFolder({}); if (!folder) return null;
    const ppi = scalePpi(scale), files = [], used = new Set();
    for (const asset of assets) {
      const area = withScope(() => renderer.painted(asset.nodeId)); if (!(area?.width > 0 && area?.height > 0)) continue;
      const base = String(asset.name || 'Asset').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim() || 'Asset', suffix = target.vector || scale === '1x' ? '' : `@${scale}`;
      let name = `${base}${suffix}.${target.ext}`; for (let n = 2; used.has(name); n++) name = `${base}-${n}${suffix}.${target.ext}`; used.add(name);
      const out = exportBoard(null, format, { area: { x: area.x, y: area.y, width: area.width, height: area.height, name: asset.name }, only: new Set([asset.nodeId]), ppi,
        background: format === 'jpg' ? 'white' : 'transparent', quality: .9 });
      files.push(format === 'svg' ? { path: `${folder}/${name}`, data: out, encoding: 'utf8' } : { path: `${folder}/${name}`, data: out.slice(out.indexOf(',') + 1), encoding: 'base64' });
    }
    const written = await bridge.write({ files, open: null });
    bridge.notify?.(`Exported ${written.length} asset${written.length === 1 ? '' : 's'} to ${fileName(folder)}.`, 'ok');
    return written;
  }
  /**
   * File > Package: a "<name> Folder" in a chosen folder with the document (as File > Save writes it), every
   * placed image as its own file in Links, and Fonts.txt and Report.txt listing what the document uses.
   */
  async function packageDocument() {
    if (!available() || typeof bridge.documentPayload !== 'function') throw new Error('Package is not available here.');
    const payload = bridge.documentPayload(), folder = await bridge.chooseFolder({}); if (!folder) return null;
    const doc = state.document, safe = (t) => String(t ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim();
    const name = safe(doc.data.name) || 'Untitled', base = `${folder}/${name} Folder`, files = [{ path: `${base}/${name}.modcut`, data: JSON.stringify(payload), encoding: 'utf8' }];
    const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/tiff': 'tif' }, used = new Set(), links = [];
    for (const node of doc.descendants(null).filter((n) => n.type === 'image')) {
      const asset = doc.data.assets?.[node.assetId]; if (!asset?.data || links.some((l) => l.assetId === node.assetId)) continue;
      let file = `${safe(node.name) || 'Image'}.${EXT[asset.mimeType] ?? 'png'}`; for (let n = 2; used.has(file); n++) file = `${safe(node.name) || 'Image'} ${n}.${EXT[asset.mimeType] ?? 'png'}`; used.add(file);
      files.push({ path: `${base}/Links/${file}`, data: asset.data, encoding: 'base64' }); links.push({ assetId: node.assetId, file, pixels: `${asset.width} × ${asset.height}` });
    }
    const info = documentInfo(doc);
    const fonts = info.fonts.map((f) => `${f.family} ${f.weight === 'normal' ? 'Regular' : f.weight === 'bold' ? 'Bold' : f.weight}${f.style === 'italic' ? ' Italic' : ''} (${f.source === 'google' ? 'Google Fonts, fonts.google.com' : 'installed on this computer'}), used by ${f.count} text${f.count === 1 ? '' : 's'}`);
    files.push({ path: `${base}/Fonts.txt`, data: `Fonts used in ${name}\n\n${fonts.length ? fonts.join('\n') : 'No text objects.'}\n\nInstalled fonts must be installed on the computer that opens the document; text already turned into outlines needs no font.\n`, encoding: 'utf8' });
    const report = [`${name}: package report`, '', `Artboards: ${info.artboards}`, `Layers: ${info.layers}`, ...info.objects.map((o) => `${o.label}: ${o.count}`), `Anchor points: ${info.anchors}`,
      `Open paths: ${info.openPaths}`, '', 'Links (embedded in the document; copies in Links):', ...(links.length ? links.map((l) => `  ${l.file} (${l.pixels} px)`) : ['  none']), '', `Fonts: ${info.fonts.length} (see Fonts.txt)`];
    files.push({ path: `${base}/Report.txt`, data: report.join('\n') + '\n', encoding: 'utf8' });
    const written = await bridge.write({ files, open: base });
    bridge.notify?.(`Packaged ${name} with ${links.length} link${links.length === 1 ? '' : 's'}.`, 'ok');
    return written;
  }
  return { exportAs, exportScreens, exportAssets, packageDocument, build, model, available };
}
