import { app, BrowserWindow, ipcMain, dialog, Menu, nativeImage, nativeTheme, shell } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, basename } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { PANEL_DEFINITIONS } from '../renderer/draw/panels/registry.mjs';
import { acceleratorFor, keyOverrides, setKeyOverrides } from "../renderer/draw/keymap.mjs";
import { createSidecar } from "./sidecar-bridge.mjs";
import { createWindowCommandRouter } from "./window-lifecycle.mjs";
import { createRecoveryStore } from "./recovery-store.mjs";
import { writeProject } from "./project-store.mjs";
import { IMAGE_FORMATS, PDF_FORMATS, POSTSCRIPT_FORMATS, TEXT_FORMATS, TIFF_FORMATS, importIssueFor } from "./import-formats.mjs";
import { createFontService } from './font-service.mjs';
import { registerExportFiles } from './export-files.mjs';
import { registerWorkspaceFiles } from './workspace-files.mjs';
import { BUILTIN_WORKSPACES } from '../renderer/draw/ui/workspaces.mjs';
import { createGoogleFonts } from './google-fonts.mjs';
import { createMcpHost } from './mcp-host.mjs';
import { localizeMenuTemplate, translator } from '../renderer/i18n.mjs';

app.name = "modCut"; // makes the macOS app menu read "modCut", not "Electron"

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const appIconPath = join(root, "assets", "modcut_logo.png");
const isMac = process.platform === "darwin";
let win;
let mcpHost = null;
let sidecar;
let recoveryStore;
let imageEditorAvailable = false;
let quitRequested = false;
let quitAllowed = false;
const imageEditorSessions = new Map();
const closeAllowed = new WeakSet();
const closePending = new WeakSet();
const rendererGone = new WeakSet();
const isE2E = process.env.MODCUT_E2E === "1";
const e2eImportResults = [];
const e2eExports = [];
const gunzipAsync = promisify(gunzip);
let fonts,googleFonts;

// Keep local development and an installed build from sharing Chromium state,
// recovery files, and machine settings. E2E supplies its own user-data-dir.
if (!app.isPackaged && !isE2E) {
  app.setPath("userData", join(app.getPath("appData"), "modcut-development"));
}

function createWindow() {
  const nextWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    show: false,
    icon: appIconPath,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#071411" : "#FFFFFF",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });
  win = nextWindow;
  nextWindow.webContents.on("render-process-gone", () => rendererGone.add(nextWindow));
  nextWindow.on("close", (event) => {
    if (closeAllowed.has(nextWindow) || rendererGone.has(nextWindow)) return;
    event.preventDefault();
    if (closePending.has(nextWindow)) return;
    closePending.add(nextWindow);
    nextWindow.webContents.send("app-close-request", { reason: quitRequested ? "quit" : "window" });
  });
  nextWindow.on("closed", () => { if (win === nextWindow) win = null; });
  const showAndFocus = () => {
    nextWindow.show();
    if (isMac) app.focus({ steal: true });
    nextWindow.focus();
  };
  if (isE2E) nextWindow.webContents.once("did-finish-load", showAndFocus);
  else nextWindow.once("ready-to-show", showAndFocus);
  void nextWindow.loadFile(join(root, "renderer", "index.html"));
  return nextWindow;
}

function requestQuit() {
  quitRequested = true;
  for (const session of imageEditorSessions.values()) {
    if (!session.window.isDestroyed()) session.window.close();
  }
  if (win && !win.isDestroyed()) win.close();
  else {
    quitAllowed = true;
    app.quit();
  }
}

const send = createWindowCommandRouter({ getWindow: () => win, createWindow });

let menuMode = "cut", menuLaserPreview = false;
// Start in English; the renderer then reports the saved Preferences > Language choice.
let language = "en";
// Edit > Cut is "Klipp ut" in a menu; elsewhere "Cut" is the laser operation.
const MENU_WORDS = { nb: { Cut: "Klipp ut" } };
const menuText = () => { const t = translator(language), words = MENU_WORDS[language] ?? {}; return (text) => words[text] ?? t(text); };
const shortcutsPath = () => join(app.getPath("userData"), "draw-shortcuts.json");
function buildMenu(mode = "cut") {
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
            { label: "Quit modCut", accelerator: "Cmd+Q", click: requestQuit },
          ],
        }]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New", accelerator: "CmdOrCtrl+N", click: () => send("new") },
        { label: "Import…", accelerator: "CmdOrCtrl+O", click: () => send("import") },
        { label: "Add…", accelerator: "CmdOrCtrl+Shift+O", click: () => send("add") },
        { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: () => send("close-tab") },
        { type: "separator" },
        { label: "Save document…", accelerator: "CmdOrCtrl+S", click: () => send("save-document") },
        { label: "Save document as…", accelerator: "CmdOrCtrl+Shift+S", click: () => send("save-document-as") },
        { type: "separator" },
        { label: "Save job…", click: () => send("save") },
        { label: "Export G-code / RD…", click: () => send("export") },
        { type: "separator" },
        { label: "Export settings…", click: () => send("export-settings") },
        { label: "Import settings…", click: () => send("import-settings") },
        ...(isMac ? [] : [{ type: "separator" }, { label: "Quit", accelerator: "Ctrl+Q", click: requestQuit }]),
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
        { id: "advanced-image-editor", label: "Advanced Editing for Engraving…", accelerator: "Alt+I", enabled: imageEditorAvailable, click: () => send("advanced-image-editor") },
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
        { label: "Zoom in", accelerator: "CmdOrCtrl+Plus", click: () => send("zoom-in") },
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
        { type: "separator" },
        { label: "Add process profile…", click: () => send("add-process-profile") },
        { label: "Process profile library…", click: () => send("process-profiles") },
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
  const viewMenu = template.find((item) => item.label === "View");
  viewMenu.submenu.unshift({
    id: "workspace-toggle", label: mode === "draw" ? "Cut workspace" : "Draw workspace",
    click: () => send(mode === "draw" ? "workspace-cut" : "workspace-draw"),
  }, { type: "separator" });
  if (mode === "draw") {
    // Draw file actions use a new document for Open and the current document for Import.
    const fileMenu = template.find((item) => item.label === "File");
    fileMenu.submenu = fileMenu.submenu.filter((item) =>
      ["New", "Import…", "Add…", "Close Tab", "Save document…", "Save document as…", "Quit"].includes(item.label));
    const saveAsIndex = fileMenu.submenu.findIndex((item) => item.label === "Save document as…");
    fileMenu.submenu.splice(saveAsIndex + 1, 0, { type: "separator" },
      { label: "Save Document Properties as Template…", click: () => send("save-document-template") },
      { type: "separator" }, { label: "Export", submenu: [
        { label: "Export for Screens…", accelerator: acceleratorFor("export-screens", { isMac }), click: () => send("export-screens") },
        { label: "Export As…", accelerator: acceleratorFor("export-as", { isMac }), click: () => send("export-as") },
      ] },
      { label: "Asset Export…", click: () => send("panel.asset-export") },
      { label: "Package…", click: () => send("package") },
      { label: "Send Artboard to Cut…", click: () => send("send-to-cut") });
    const sharedCommands = { "New": "new", "Import…": "import", "Add…": "add", "Close Tab": "close-tab",
      "Save document…": "save-document", "Save document as…": "save-document-as" };
    for (const item of fileMenu.submenu) {
      const command = sharedCommands[item.label];
      if (command) item.accelerator = acceleratorFor(command === "add" ? "place" : command, { workspace: "draw", isMac });
      if (item.label === "Import…") item.label = "Open…";
      else if (item.label === "Add…") item.label = "Import…";
    }
    const appMenu = template.find((item) => item.label === "modCut");
    const preferences = appMenu?.submenu.find((item) => item.label === "Preferences…");
    if (preferences) preferences.accelerator = acceleratorFor("preferences", { isMac });
    // Clipboard keys are handled by Draw's keymap so text fields keep their native shortcuts; the menu only shows them.
    const editItem=(label,command)=>({label,accelerator:acceleratorFor(command,{isMac}),registerAccelerator:false,click:()=>send(command)});
    template.find((item) => item.label === "Edit").submenu = [
      { label:"Undo", accelerator:acceleratorFor("undo",{isMac}), click:() => send("undo") },
      { label:"Redo", accelerator:acceleratorFor("redo",{isMac}), click:() => send("redo") },
      { type:"separator" }, editItem("Cut","cut"), editItem("Copy","copy"), editItem("Paste","paste"),
      editItem("Paste in Front","paste-front"), editItem("Paste in Back","paste-back"), editItem("Paste in Place","paste-place"),
      editItem("Paste on All Artboards","paste-all-artboards"),
      { type: "separator" }, { label: "Keyboard Shortcuts…", click: () => send("keyboard-shortcuts") },
      ...(isMac ? [] : [{ type: "separator" }, { label: "Preferences…", accelerator: acceleratorFor("preferences", { isMac }), click: () => send("preferences") }]),
    ];
    viewMenu.submenu = [viewMenu.submenu[0], { type: "separator" },
      { id:"laser-preview",label:"Laser Preview",type:"checkbox",checked:menuLaserPreview,click:item=>{item.checked=menuLaserPreview;send("laser-preview");} },
      { label:"Laser processes…",click:()=>send("laser-processes") },
      { label: "Outline / Preview", accelerator: acceleratorFor("outline", { isMac }), click: () => send("outline") },
      { label: "Reset Rotate View", click: () => send("reset-rotate-view") },
      editItem("Show Rulers","rulers"), editItem("Show Grid","grid"),
      editItem("Show Transparency Grid","transparency-grid"),
      { label: "Guides", submenu: [editItem("Show / Hide Guides","guides"), editItem("Lock Guides","guides-lock")] },
      editItem("Smart Guides","smart-guides"), editItem("Snap to Point","snap-point"), editItem("Snap to Grid","snap-grid"),
      { label: "Control Bar", click: () => send("toggle-control-bar") },
      { role: "togglefullscreen", label: "Full screen" },
      { role: "toggleDevTools", label: "Developer Tools" }];
    for (const label of ["Machine", "Materials"]) {
      template.splice(template.findIndex((item) => item.label === label), 1);
    }
    const editIndex = template.findIndex((item) => item.label === "Edit");
    template.splice(editIndex + 1, 0, ...["Object", "Type", "Select", "Effect"].map((label) => ({
      label, submenu: [{ label: "No commands available", enabled: false }],
    })));
    template.find(item=>item.label==='Help').submenu.unshift({label:"Laser Preview explained…",click:()=>send("laser-preview-help")});
    const objectItem=(label,command)=>({label,accelerator:acceleratorFor(command,{isMac}),click:()=>send(command)});
    // Effect menu (D3.2): live vector effects, kept in the object's Appearance.
    template.find(item=>item.label==='Effect').submenu=[objectItem('Apply Last Effect','effect-last'),objectItem('Last Effect…','effect-options'),{type:'separator'},
      {label:'Distort & Transform',submenu:[objectItem('Free Distort…','effect-free-distort'),objectItem('Pucker & Bloat…','effect-pucker-bloat'),objectItem('Roughen…','effect-roughen'),objectItem('Transform…','effect-transform'),
        objectItem('Twist…','effect-twist'),objectItem('Zig Zag…','effect-zig-zag')]},{label:'Path',submenu:[objectItem('Offset Path…','effect-offset-path')]},
      objectItem('Rasterize…','effect-rasterize'),{label:'Blur',submenu:[objectItem('Gaussian Blur…','effect-gaussian-blur')]},
      {label:'Stylize',submenu:[objectItem('Drop Shadow…','effect-drop-shadow'),objectItem('Feather…','effect-feather'),objectItem('Inner Glow…','effect-inner-glow'),objectItem('Outer Glow…','effect-outer-glow'),objectItem('Round Corners…','effect-round-corners'),objectItem('Scribble…','effect-scribble')]},
      {label:'Pathfinder',submenu:[['unite','Add'],['intersect','Intersect'],['exclude','Exclude'],['minusFront','Subtract'],['minusBack','Minus Back'],['divide','Divide'],['trim','Trim'],['merge','Merge'],['crop','Crop'],['outline','Outline']]
        .map(([id,label])=>objectItem(label,`live-${id}`))},
      {label:'Warp',submenu:[['arc','Arc'],['arc-lower','Arc Lower'],['arc-upper','Arc Upper'],['arch','Arch'],['bulge','Bulge'],['shell-lower','Shell Lower'],['shell-upper','Shell Upper'],
        ['flag','Flag'],['wave','Wave'],['fish','Fish'],['rise','Rise'],['fisheye','Fisheye'],['inflate','Inflate'],['squeeze','Squeeze'],['twist','Twist']].map(([id,label])=>objectItem(`${label}…`,`warp-${id}`))}];
    // Window menu (D4.5): workspaces and the panels, as in Illustrator; the window roles stay.
    const windowMenu=template.find(item=>item.label==='Window');
    if(windowMenu){delete windowMenu.role;windowMenu.submenu=[{label:'Workspaces',submenu:[
      ...BUILTIN_WORKSPACES.map(ws=>objectItem(ws.name,ws.id==='essentials'?'workspace-reset':`workspace-preset.${ws.id}`)),
      {type:'separator'},objectItem('Save Current Workspace…','workspace-save'),objectItem('Load Workspace…','workspace-load'),
      {type:'separator'},objectItem('New Workspace…','workspace-new'),objectItem('Manage Workspaces…','workspace-manage')]},{type:'separator'},
      // Artboards uses the drawing tool and Properties; Asset Export belongs to File.
      ...PANEL_DEFINITIONS.filter(panel=>!['artboards','asset-export'].includes(panel.id)).sort((a,b)=>a.name.localeCompare(b.name)).map(panel=>objectItem(panel.name,`panel.${panel.id}`)),
      {type:'separator'},{role:'minimize'},...(isMac?[{role:'zoom'}]:[])];}
    template.find(item=>item.label==='Type').submenu=[objectItem('Edit Text…','edit-text'),objectItem('Create Outlines','create-outlines')];
    // Select menu (D3.5): Same compares every painted object; Object picks kinds of objects.
    template.find(item=>item.label==='Select').submenu=[objectItem('All','select-all'),objectItem('All on Active Artboard','select-artboard'),objectItem('Deselect','deselect'),
      objectItem('Reselect','reselect'),objectItem('Inverse','select-inverse'),{type:'separator'},objectItem('Next Object Above','select-next-above'),objectItem('Next Object Below','select-next-below'),
      {type:'separator'},{label:'Same',submenu:[['Appearance','appearance'],['Fill & Stroke','fill-stroke'],['Fill Color','fill-color'],['Opacity','opacity'],['Stroke Color','stroke-color'],
        ['Stroke Weight','stroke-weight'],['Graphic Style','graphic-style'],['Shape','shape'],['Text','text']].map(([label,mode])=>objectItem(label,`select-same-${mode}`))},
      {label:'Object',submenu:[['All on Same Layers','same-layers'],['Stray Points','stray-points'],['Open Paths','open-paths'],['Clipping Masks','clipping-masks'],['Text Objects','text'],['Direction Handles','direction-handles'],
        ['Raster Images','images']].map(([label,kind])=>objectItem(label,`select-object-${kind}`))},
      {type:'separator'},objectItem('Save Selection…','save-selection'),objectItem('Edit Selection…','edit-selection')];
    template.find(item=>item.label==='Object').submenu=[{label:'Transform',submenu:[
      ...['Rotate','Reflect','Scale','Shear'].map(label=>({label:`${label}…`,click:()=>send(`${label.toLowerCase()}-dialog`)})),
      {type:'separator'},{label:'Transform Again',accelerator:acceleratorFor('transform-again',{isMac}),click:()=>send('transform-again')},
      {label:'Transform Each…',accelerator:acceleratorFor('transform-each',{isMac}),click:()=>send('transform-each')},
    ]},{label:'Arrange',submenu:[objectItem('Bring to Front','bring-front'),objectItem('Bring Forward','bring-forward'),objectItem('Send Backward','send-backward'),objectItem('Send to Back','send-back')]},
    {type:'separator'},objectItem('Group','group'),objectItem('Ungroup','ungroup'),
    {type:'separator'},objectItem('Expand…','expand'),objectItem('Expand Appearance','expand-appearance'),objectItem('Crop Image…','crop-image'),{type:'separator'},{label:'Blend',submenu:[objectItem('Make','blend-make'),objectItem('Release','blend-release'),objectItem('Expand','blend-expand'),{type:'separator'},objectItem('Blend Options…','blend-options'),{type:'separator'},objectItem('Replace Spine','blend-replace-spine'),objectItem('Reverse Spine','blend-reverse-spine'),objectItem('Reverse Front to Back','blend-reverse')]},{label:'Envelope Distort',submenu:[objectItem('Make with Warp…','envelope-warp'),objectItem('Make with Top Object','envelope-make'),objectItem('Release','envelope-release'),objectItem('Expand','envelope-expand')]},{label:'Clipping Mask',submenu:[objectItem('Make','clip-make'),objectItem('Release','clip-release')]},
    {label:'Compound Path',submenu:[objectItem('Make','compound-make'),objectItem('Release','compound-release')]},
    {label:'Path',submenu:[objectItem('Join','join'),objectItem('Average…','average'),{type:'separator'},objectItem('Offset Path…','offset-path'),objectItem('Outline Stroke','outline-stroke'),objectItem('Split Into Grid…','split-into-grid'),objectItem('Simplify…','simplify'),{type:'separator'},objectItem('Reverse Path Direction','reverse-path'),
      objectItem('Add Anchor Points','add-anchors'),objectItem('Remove Anchor Points','remove-anchors'),{type:'separator'},objectItem('Clean Up','clean-up')]},
    {type:'separator'},objectItem('Lock Selection','lock'),objectItem('Unlock All','unlock-all'),objectItem('Hide Selection','hide'),objectItem('Show All','show-all')];
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(localizeMenuTemplate(template, menuText())));
}

app.whenReady().then(async () => {
  googleFonts=createGoogleFonts({directory:join(app.getPath('userData'),'google-fonts')});
  fonts=createFontService({google:googleFonts});
  recoveryStore = createRecoveryStore(app.getPath("userData"));
  if (!isE2E) try { setKeyOverrides(JSON.parse(await readFile(shortcutsPath(), "utf8"))); } catch { /* none saved yet, or unreadable: the defaults stay */ }
  // MCP server (off until the person turns it on in Preferences): tool calls run in the main window's renderer.
  mcpHost = createMcpHost({ configPath: join(app.getPath("userData"), "mcp.json"), getWindow: () => win, version: app.getVersion(), ephemeral: isE2E });
  ipcMain.handle("setLanguage", (event, value) => {
    if (event.sender !== win?.webContents || !["en", "nb"].includes(value) || value === language) return language;
    language = value; buildMenu(menuMode); return language;
  });
  ipcMain.handle("getMcpServer", (event) => { if (event.sender !== win?.webContents) throw new Error("Unavailable."); return mcpHost.status(); });
  ipcMain.handle("setMcpServer", (event, enabled) => { if (event.sender !== win?.webContents) throw new Error("Unavailable."); return mcpHost.setEnabled(enabled === true); });
  ipcMain.handle("mcpResult", (event, id, payload) => { if (event.sender !== win?.webContents) return false; return mcpHost.settle(id, payload); });
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
  ipcMain.handle('listSystemFonts', event => {if(event.sender!==win?.webContents)throw new Error('Unavailable font session.');return fonts.list();});
  ipcMain.handle('listGoogleFonts', (event,options) => {if(event.sender!==win?.webContents)throw new Error('Unavailable font session.');return googleFonts.list({refresh:options?.refresh===true});});
  ipcMain.handle('googleFontFamily', (event,name) => {if(event.sender!==win?.webContents)throw new Error('Unavailable font session.');return googleFonts.details(name);});
  ipcMain.handle('shapeText', (event, values) => {if(event.sender!==win?.webContents)throw new Error('Unavailable font session.');return fonts.shape(values);});
  ipcMain.handle('fontData', (event, values) => {if(event.sender!==win?.webContents)throw new Error('Unavailable font session.');return fonts.data(values);});
  ipcMain.handle('fontCharacters', (event, values) => {if(event.sender!==win?.webContents)throw new Error('Unavailable font session.');return fonts.characters(values);});
  ipcMain.handle("setTheme", (event, preference) => {
    if (!BrowserWindow.fromWebContents(event.sender) || !["system", "light", "dark"].includes(preference)) return false;
    nativeTheme.themeSource = preference;
    for (const window of BrowserWindow.getAllWindows()) {
      window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#071411" : "#FFFFFF");
    }
    return true;
  });
  ipcMain.handle("setLaserPreviewState",(event,value)=>{
    if(event.sender!==win?.webContents||typeof value!=="boolean")return false;
    menuLaserPreview=value;const item=Menu.getApplicationMenu()?.getMenuItemById("laser-preview");if(item)item.checked=value;return true;
  });
  ipcMain.handle("setWorkspace", (event, mode) => {
    if (event.sender !== win?.webContents || !["cut", "draw"].includes(mode)) return false;
    menuMode = mode; buildMenu(mode);
    return true;
  });
  // Custom Draw shortcuts (D5): kept in the user data folder; the menus are rebuilt with them.
  ipcMain.handle("getDrawShortcuts", () => keyOverrides());
  ipcMain.handle("setDrawShortcuts", async (event, map) => {
    if (event.sender !== win?.webContents) return null;
    const saved = setKeyOverrides(map);
    if (!isE2E) await writeFile(shortcutsPath(), JSON.stringify(saved, null, 2));
    buildMenu(menuMode);
    return saved;
  });
  ipcMain.handle("readRecovery", () => recoveryStore.read());
  ipcMain.handle("writeRecovery", (_event, json) => recoveryStore.write(json));
  ipcMain.handle("clearRecovery", () => recoveryStore.clear());
  ipcMain.handle("windowCloseResponse", (_event, allowed) => {
    const target = BrowserWindow.fromWebContents(_event.sender);
    if (!target || target.isDestroyed()) return false;
    closePending.delete(target);
    if (!allowed) {
      quitRequested = false;
      return false;
    }
    closeAllowed.add(target);
    if (quitRequested) {
      quitAllowed = true;
      app.quit();
    } else target.close();
    return true;
  });
  ipcMain.handle("setImageEditorAvailable", (_event, available) => {
    imageEditorAvailable = !!available;
    const item = Menu.getApplicationMenu()?.getMenuItemById("advanced-image-editor");
    if (item) item.enabled = !!available;
    return !!item;
  });
  ipcMain.handle("openImageEditor", (event, payload) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (!parent || parent.isDestroyed() || !payload?.dataUrl) return null;
    const existing = [...imageEditorSessions.values()].find((session) => session.parent === parent);
    if (existing && !existing.window.isDestroyed()) {
      existing.window.show();
      existing.window.focus();
      return existing.promise;
    }
    let resolveResult;
    const promise = new Promise((resolve) => { resolveResult = resolve; });
    const editorWindow = new BrowserWindow({
      width: 1420,
      height: 900,
      minWidth: 900,
      minHeight: 650,
      show: false,
      parent,
      modal: true,
      icon: appIconPath,
      backgroundColor: "#17201e",
      title: "Advanced Editing for Engraving · modCut",
      webPreferences: {
        preload: join(__dirname, "preload.cjs"),
        contextIsolation: true,
        sandbox: false,
      },
    });
    const session = { window: editorWindow, parent, promise, resolve: resolveResult, settled: false };
    const editorContentsId = editorWindow.webContents.id;
    imageEditorSessions.set(editorContentsId, session);
    const finish = (result) => {
      if (session.settled) return;
      session.settled = true;
      session.resolve(result ?? null);
    };
    editorWindow.once("ready-to-show", () => { editorWindow.show(); editorWindow.focus(); });
    editorWindow.webContents.once("did-finish-load", () => editorWindow.webContents.send("image-editor-init", payload));
    editorWindow.on("closed", () => {
      imageEditorSessions.delete(editorContentsId);
      finish(null);
      if (parent && !parent.isDestroyed()) parent.focus();
    });
    void editorWindow.loadFile(join(root, "renderer", "image-editor.html"));
    return promise;
  });
  ipcMain.handle("finishImageEditor", (event, result) => {
    const session = imageEditorSessions.get(event.sender.id);
    if (!session) return false;
    if (!session.settled) {
      session.settled = true;
      session.resolve(result ?? null);
    }
    if (!session.window.isDestroyed()) session.window.close();
    return true;
  });
  if (isE2E) {
    ipcMain.handle("e2eSetImportResult", (_event, result) => { e2eImportResults.push(result); return true; });
    ipcMain.handle("e2eExports", () => e2eExports.splice(0));
    ipcMain.handle("e2eWorkspaceMenu", () => ({
      label: Menu.getApplicationMenu()?.getMenuItemById("workspace-toggle")?.label,
      laserPreviewChecked: Menu.getApplicationMenu()?.getMenuItemById("laser-preview")?.checked,
      top: Menu.getApplicationMenu()?.items.map((item) => item.label),
      edit: Menu.getApplicationMenu()?.items.find((item) => item.label === "Edit")?.submenu.items.map((item) => item.accelerator || null),
      file: Menu.getApplicationMenu()?.items.find((item) => item.label === "File")?.submenu.items.map((item) => ({ label: item.label, accelerator: item.accelerator || null })),
      view: Menu.getApplicationMenu()?.items.find((item) => item.label === "View")?.submenu.items.map((item) => ({ label: item.label, accelerator: item.accelerator || null })),
      transform: Menu.getApplicationMenu()?.items.find(item=>item.label==='Object')?.submenu.items.find(item=>item.label==='Transform')?.submenu.items.map(item=>({label:item.label,accelerator:item.accelerator||null})),
    }));
    ipcMain.handle("e2eRequestQuit", () => { requestQuit(); return true; });
    ipcMain.handle("e2eClickMenuItem", (_event, menuLabel, itemLabel) => {
      // Items may sit in a submenu, such as File > Export > Export As….
      const find = (items) => { for (const entry of items ?? []) { if (entry.label === itemLabel) return entry; const nested = find(entry.submenu?.items); if (nested) return nested; } return null; };
      const item = find(Menu.getApplicationMenu()?.items.find((entry) => entry.label === menuLabel)?.submenu.items);
      item?.click();
      return !!item;
    });
  }

  // Native file picker that also returns the file's contents so the renderer
  // (sandboxed, no fs) can parse it. SVG/DXF come back as text;
  // images/PDF-compatible Illustrator files as a data URL.
  ipcMain.handle("importFile", async (_event, options = {}) => {
    if (isE2E && e2eImportResults.length) return e2eImportResults.shift();
    const multiple = !!options.multiple;
    const allowDocuments = options.allowDocuments !== false;
    const supported = [
      ...TEXT_FORMATS,
      ...IMAGE_FORMATS,
      ...TIFF_FORMATS,
      ...PDF_FORMATS,
      ...(allowDocuments ? ["modcut"] : []),
    ];
    const t = translator(language);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: t(options.intent === "draw-open" ? "Open Draw document" : options.intent === "draw-import" ? "Import artwork into Draw" : multiple ? "Add files to project" : "Import file"),
      properties: ["openFile", ...(multiple ? ["multiSelections"] : [])],
      filters: [
        { name: "All supported files", extensions: supported },
        ...(allowDocuments ? [{ name: "modCut document", extensions: ["modcut"] }] : []),
        { name: "Vector", extensions: TEXT_FORMATS },
        { name: "EPS / PostScript", extensions: POSTSCRIPT_FORMATS },
        { name: "PDF / Illustrator", extensions: PDF_FORMATS },
        { name: "Images", extensions: [...IMAGE_FORMATS, ...TIFF_FORMATS] },
        { name: "All files", extensions: ["*"] },
      ].map((filter) => ({ ...filter, name: t(filter.name) })),
    });
    if (canceled || !filePaths.length) return null;
    const files = await Promise.all(filePaths.map(async (path) => {
      const ext = extname(path).slice(1).toLowerCase();
      const out = { path, name: basename(path), ext };
      const issue = importIssueFor(ext);
      if (issue) {
        out.kind = "unsupported";
        out.reason = issue;
      } else if (ext === "modcut" && !allowDocuments) {
        out.kind = "unsupported";
        out.reason = "document-not-addable";
      } else if (ext === "modcut") {
        out.kind = "document";
        out.text = await readFile(path, "utf8");
      } else if (TEXT_FORMATS.includes(ext)) {
        out.text = ext === "svgz"
          ? (await gunzipAsync(await readFile(path))).toString("utf8")
          : await readFile(path, POSTSCRIPT_FORMATS.includes(ext) ? "latin1" : "utf8");
      } else if (IMAGE_FORMATS.includes(ext) || TIFF_FORMATS.includes(ext)) {
        const mime = ext === "jpg" ? "jpeg" : ext === "tif" ? "tiff" : ext;
        out.dataUrl = `data:image/${mime};base64,` + (await readFile(path)).toString("base64");
      } else if (PDF_FORMATS.includes(ext)) {
        const bytes = await readFile(path);
        const pdfIssue = importIssueFor(ext, bytes);
        if (pdfIssue) {
          out.kind = "unsupported";
          out.reason = pdfIssue;
        } else {
          out.dataUrl = `data:application/pdf;base64,${bytes.toString("base64")}`;
        }
      }
      return out;
    }));
    return multiple ? files : files[0];
  });

  ipcMain.handle("saveDocument", async (_e, { json, path, name, saveAs }) => {
    if (!saveAs && path) {
      return writeProject(path, json);
    }
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save modCut document",
      defaultPath: name || "untitled.modcut",
      filters: [{ name: "modCut document", extensions: ["modcut"] }],
    });
    if (canceled || !filePath) return null;
    return writeProject(filePath, json);
  });

  // Draw Export As / Export for Screens. E2E runs keep the files in memory instead of showing dialogs.
  registerExportFiles({ ipcMain, dialog, shell, getWindow: () => win, isE2E, e2eExports });
  registerWorkspaceFiles({ ipcMain, dialog, getWindow: () => win, isE2E, e2eExports });

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
  if (!isMac) app.quit();
});

app.on("before-quit", (event) => {
  if (quitAllowed) return;
  event.preventDefault();
  requestQuit();
});

app.on("will-quit", () => {
  mcpHost?.close();
  sidecar?.close();
  sidecar = null;
});
