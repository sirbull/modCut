import { app, BrowserWindow, ipcMain, dialog, Menu, nativeImage } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, basename } from "node:path";
import { createSidecar } from "./sidecar-bridge.mjs";

app.name = "modCut"; // makes the macOS app menu read "modCut", not "Electron"

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const appIconPath = join(root, "assets", "modcut_logo.png");
const isMac = process.platform === "darwin";
let win;
let sidecar;

const TEXT_FORMATS = ["svg", "dxf", "gcode", "gc", "nc", "plt", "hpgl"];
const IMAGE_FORMATS = ["png", "jpg", "jpeg", "bmp", "gif"];

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    icon: appIconPath,
    backgroundColor: "#FFFFFF",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });
  win.loadFile(join(root, "renderer", "index.html"));
}

const send = (cmd) => win?.webContents.send("menu", cmd);

function buildMenu() {
  const template = [
    ...(isMac
      ? [{
          label: "modCut",
          submenu: [
            { role: "about", label: "About modCut" },
            { type: "separator" },
            { label: "Preferences…", accelerator: "Cmd+,", click: () => send("preferences") },
            { type: "separator" },
            { role: "services", label: "Services" },
            { type: "separator" },
            { role: "hide", label: "Hide modCut" },
            { role: "hideOthers", label: "Hide Others" },
            { role: "unhide", label: "Show All" },
            { type: "separator" },
            { role: "quit", label: "Quit modCut" },
          ],
        }]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New", accelerator: "CmdOrCtrl+N", click: () => send("new") },
        { label: "Import…", accelerator: "CmdOrCtrl+O", click: () => send("import") },
        { label: "Add…", accelerator: "CmdOrCtrl+Shift+O", click: () => send("add") },
        { type: "separator" },
        { label: "Save document…", accelerator: "CmdOrCtrl+S", click: () => send("save-document") },
        { label: "Save document as…", accelerator: "CmdOrCtrl+Shift+S", click: () => send("save-document-as") },
        { type: "separator" },
        { label: "Save job…", click: () => send("save") },
        { label: "Export G-code / RD…", click: () => send("export") },
        { type: "separator" },
        { label: "Export settings…", click: () => send("export-settings") },
        { label: "Import settings…", click: () => send("import-settings") },
        ...(isMac ? [] : [{ type: "separator" }, { role: "quit", label: "Quit" }]),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", click: () => send("undo") },
        { label: "Redo", accelerator: "CmdOrCtrl+Y", click: () => send("redo") },
        { type: "separator" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", click: () => send("copy") },
        { label: "Paste", accelerator: "CmdOrCtrl+V", click: () => send("paste") },
        { label: "Paste in place", accelerator: "CmdOrCtrl+Alt+Shift+V", click: () => send("paste-in-place") },
        { label: "Duplicate", accelerator: "CmdOrCtrl+D", click: () => send("duplicate") },
        { label: "Delete", accelerator: "Delete", click: () => send("delete") },
        { label: "Select All", accelerator: "CmdOrCtrl+A", click: () => send("select-all") },
        { type: "separator" },
        { label: "Group", accelerator: "CmdOrCtrl+G", click: () => send("group") },
        { label: "Ungroup", accelerator: "CmdOrCtrl+Shift+G", click: () => send("ungroup") },
        {
          label: "Arrange",
          submenu: [
            { label: "Move up", accelerator: "CmdOrCtrl+U", click: () => send("move-up") },
            { label: "Move down", accelerator: "CmdOrCtrl+Alt+N", click: () => send("move-down") },
            { label: "Move to top", accelerator: "CmdOrCtrl+Shift+U", click: () => send("move-to-top") },
            { label: "Move to bottom", accelerator: "CmdOrCtrl+Alt+Shift+N", click: () => send("move-to-bottom") },
          ],
        },
        { type: "separator" },
        { role: "cut", label: "Cut" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Zoom in", accelerator: "CmdOrCtrl+=", click: () => send("zoom-in") },
        { label: "Zoom out", accelerator: "CmdOrCtrl+-", click: () => send("zoom-out") },
        { label: "Fit to bed", accelerator: "CmdOrCtrl+0", click: () => send("zoom-fit") },
        { type: "separator" },
        { label: "Show/hide side panel", accelerator: "CmdOrCtrl+\\", click: () => send("toggle-panel") },
        { type: "separator" },
        { role: "togglefullscreen", label: "Full screen" },
        { role: "toggleDevTools", label: "Developer Tools" },
      ],
    },
    {
      label: "Machine",
      submenu: [
        { label: "Add machine…", click: () => send("add-machine") },
        { label: "Manage machines…", click: () => send("manage-machines") },
        { label: "Connect", click: () => send("connect") },
        { type: "separator" },
        { label: "Frame", click: () => send("frame") },
        { label: "Simulate", click: () => send("simulate") },
      ],
    },
    {
      label: "Materials",
      submenu: [
        { label: "Add material…", click: () => send("add-material") },
        { label: "Material library…", click: () => send("materials") },
      ],
    },
    { role: "windowMenu", label: "Window" },
    {
      label: "Help",
      submenu: [
        { label: "Documentation", click: () => send("docs") },
        ...(isMac ? [] : [{ label: "About modCut", click: () => send("about") }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  const appIcon = nativeImage.createFromPath(appIconPath);
  appIcon.setTemplateImage?.(false);
  if (isMac && !appIcon.isEmpty()) app.dock.setIcon(appIcon);
  app.setAboutPanelOptions({
    applicationName: "modCut",
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: "Horten Folkeverksted",
    credits: "Modern laser control for Horten Folkeverksted.",
    iconPath: appIconPath,
  });

  // Installed builds never depend on system Java: electron-builder places the
  // jlink runtime and shaded sidecar outside app.asar in process.resourcesPath.
  const java = app.isPackaged
    ? join(process.resourcesPath, "runtime", "bin", process.platform === "win32" ? "java.exe" : "java")
    : "java";
  const sidecarJar = app.isPackaged
    ? join(process.resourcesPath, "sidecar", "modcut-sidecar.jar")
    : join(root, "sidecar", "target", "modcut-sidecar.jar");
  sidecar = createSidecar({ command: java, args: ["-jar", sidecarJar] });
  ipcMain.handle("sidecar", (_e, method, params) => sidecar.call(method, params));

  // Native file picker that also returns the file's contents so the renderer
  // (sandboxed, no fs) can parse it. SVG/vector/g-code come back as text;
  // images as a data URL.
  ipcMain.handle("importFile", async (_event, options = {}) => {
    const multiple = !!options.multiple;
    const allowDocuments = options.allowDocuments !== false;
    const supported = [...TEXT_FORMATS, ...IMAGE_FORMATS, ...(allowDocuments ? ["modcut"] : [])];
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: multiple ? "Add files to project" : "Import file",
      properties: ["openFile", ...(multiple ? ["multiSelections"] : [])],
      filters: [
        { name: "All supported files", extensions: supported },
        ...(allowDocuments ? [{ name: "modCut document", extensions: ["modcut"] }] : []),
        { name: "Vector", extensions: ["svg", "dxf", "plt", "hpgl"] },
        { name: "G-code", extensions: ["gcode", "gc", "nc"] },
        { name: "Images", extensions: IMAGE_FORMATS },
      ],
    });
    if (canceled || !filePaths.length) return null;
    const files = await Promise.all(filePaths.map(async (path) => {
      const ext = extname(path).slice(1).toLowerCase();
      const out = { path, name: basename(path), ext };
      if (ext === "modcut") {
        out.kind = "document";
        out.text = await readFile(path, "utf8");
      } else if (TEXT_FORMATS.includes(ext)) {
        out.text = await readFile(path, "utf8");
      } else if (IMAGE_FORMATS.includes(ext)) {
        const mime = ext === "jpg" ? "jpeg" : ext;
        out.dataUrl = `data:image/${mime};base64,` + (await readFile(path)).toString("base64");
      }
      return out;
    }));
    return multiple ? files : files[0];
  });

  ipcMain.handle("saveDocument", async (_e, { json, path, name, saveAs }) => {
    if (!saveAs && path) {
      await writeFile(path, json, "utf8");
      return path;
    }
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save modCut document",
      defaultPath: name || "untitled.modcut",
      filters: [{ name: "modCut document", extensions: ["modcut"] }],
    });
    if (canceled || !filePath) return null;
    await writeFile(filePath, json, "utf8");
    return filePath;
  });

  // Export/import all settings as one shareable JSON file.
  // ponytail: single JSON file, not a .zip — the payload is just JSON, so a zip
  // would only add a dependency (JSZip) for no real gain. Revisit if we ever bundle
  // binary assets (thumbnails) into the export.
  ipcMain.handle("exportSettings", async (_e, { json, name }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Export settings", defaultPath: name,
      filters: [{ name: "modCut settings", extensions: ["json"] }],
    });
    if (canceled || !filePath) return null;
    await writeFile(filePath, json, "utf8");
    return filePath;
  });
  ipcMain.handle("importSettings", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: "Import settings", properties: ["openFile"],
      filters: [{ name: "modCut settings", extensions: ["json"] }],
    });
    if (canceled || !filePaths.length) return null;
    return await readFile(filePaths[0], "utf8");
  });

  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  sidecar?.close();
  if (!isMac) app.quit();
});
