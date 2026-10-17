/**
 * Draw export file IO in the main process. The renderer only writes where the user chose: one save
 * path (plus its "-Artboard" siblings) for Export As, or anything inside one chosen folder for Export
 * for Screens. E2E runs keep files in memory (`e2eExports`) instead of showing dialogs.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve, sep } from 'node:path';

export const EXPORT_FILE_TYPES = Object.freeze({
  pdf: 'PDF', svg: 'SVG', svgz: 'SVG Compressed', eps: 'EPS', dxf: 'DXF (AutoCAD R12)', png: 'PNG', jpg: 'JPEG', webp: 'WebP',
});
const TEXT_TYPES = new Set(['svg', 'eps', 'dxf']);

export function registerExportFiles({ ipcMain, dialog, shell, getWindow, isE2E = false, e2eExports = [] }) {
  const files = new Map(), folders = new Set(); // chosen file stem → directory; chosen folders
  const fromWindow = (event) => event.sender === getWindow()?.webContents;
  // E2E stands in for the save dialog: the next chosen file name, e.g. "Logo.pdf".
  let e2eChoice = null;
  if (isE2E) ipcMain.handle('setE2EExportPath', (event, name) => { e2eChoice = typeof name === 'string' ? name : null; });
  const allowed = (path) => {
    const full = resolve(path), dir = dirname(full), name = basename(full, extname(full));
    for (const [stem, folder] of files) if (folder === dir && (name === stem || name.startsWith(`${stem}-`))) return true;
    for (const folder of folders) if (full.startsWith(folder + sep)) return true;
    return false;
  };
  ipcMain.handle('chooseExportPath', async (event, { name, format }) => {
    if (!fromWindow(event) || !EXPORT_FILE_TYPES[format]) return null;
    const ordered = [format, ...Object.keys(EXPORT_FILE_TYPES).filter((id) => id !== format)];
    let filePath;
    if (isE2E) { filePath = resolve('/e2e', e2eChoice ?? String(name)); e2eChoice = null; }
    else {
      const result = await dialog.showSaveDialog(getWindow(), { title: 'Export As', defaultPath: name,
        filters: ordered.map((id) => ({ name: EXPORT_FILE_TYPES[id], extensions: id === 'jpg' ? ['jpg', 'jpeg'] : [id] })) });
      if (result.canceled || !result.filePath) return null;
      filePath = result.filePath;
    }
    let ext = extname(filePath).slice(1).toLowerCase(); if (ext === 'jpeg') ext = 'jpg';
    if (!EXPORT_FILE_TYPES[ext]) { filePath += `.${format}`; ext = format; }
    files.set(basename(filePath, extname(filePath)), dirname(resolve(filePath)));
    return { path: filePath, format: ext };
  });
  ipcMain.handle('chooseExportFolder', async (event, { defaultPath } = {}) => {
    if (!fromWindow(event)) return null;
    let folder;
    if (isE2E) folder = resolve('/e2e/screens');
    else {
      const result = await dialog.showOpenDialog(getWindow(), { title: 'Export to', defaultPath, properties: ['openDirectory', 'createDirectory'] });
      if (result.canceled || !result.filePaths[0]) return null;
      folder = resolve(result.filePaths[0]);
    }
    folders.add(folder); return folder;
  });
  // `open`: a written file or the chosen folder to show afterwards.
  ipcMain.handle('writeExportFiles', async (event, { files: list, open = null }) => {
    if (!fromWindow(event) || !Array.isArray(list) || !list.length) return null;
    const written = [];
    for (const file of list) {
      if (typeof file?.path !== 'string' || !['utf8', 'base64'].includes(file.encoding) || typeof file.data !== 'string') throw new Error('Invalid export file.');
      if (!allowed(file.path)) throw new Error(`Export may only write where you chose to save: ${file.path}`);
      const bytes = Buffer.from(file.data, file.encoding), ext = extname(file.path).slice(1).toLowerCase();
      if (isE2E) e2eExports.push({ name: basename(file.path), path: file.path.replace(/\\/g, '/'), format: ext === 'jpeg' ? 'jpg' : ext, size: bytes.length,
        head: bytes.subarray(0, 64).toString('base64'), text: TEXT_TYPES.has(ext) ? file.data : null, data: file.encoding === 'base64' ? file.data : null });
      else { await mkdir(dirname(file.path), { recursive: true }); await writeFile(file.path, bytes); }
      written.push(file.path);
    }
    // "View after saving" opens a written file; "Open location" opens the chosen folder.
    if (!isE2E && typeof open === 'string' && (written.includes(open) || folders.has(resolve(open)))) await shell.openPath(open);
    return written;
  });
}
