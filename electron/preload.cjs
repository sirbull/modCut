const { contextBridge, ipcRenderer } = require("electron");

// Only surface a narrow, safe bridge to the renderer.
contextBridge.exposeInMainWorld("modcut", {
  call: (method, params) => ipcRenderer.invoke("sidecar", method, params),
  openImport: () => ipcRenderer.invoke("importFile"),
  saveDocument: (json, path, saveAs, name) => ipcRenderer.invoke("saveDocument", { json, path, saveAs, name }),
  exportSettings: (json, name) => ipcRenderer.invoke("exportSettings", { json, name }),
  importSettings: () => ipcRenderer.invoke("importSettings"),
  onMenu: (cb) => ipcRenderer.on("menu", (_e, cmd) => cb(cmd)),
});
