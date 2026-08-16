const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Only surface a narrow, safe bridge to the renderer.
contextBridge.exposeInMainWorld("modcut", {
  call: (method, params) => ipcRenderer.invoke("sidecar", method, params),
  openImport: (options) => ipcRenderer.invoke("importFile", options),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  saveDocument: (json, path, saveAs, name) => ipcRenderer.invoke("saveDocument", { json, path, saveAs, name }),
  exportSettings: (json, name) => ipcRenderer.invoke("exportSettings", { json, name }),
  importSettings: () => ipcRenderer.invoke("importSettings"),
  readRecovery: () => ipcRenderer.invoke("readRecovery"),
  writeRecovery: (json) => ipcRenderer.invoke("writeRecovery", json),
  clearRecovery: () => ipcRenderer.invoke("clearRecovery"),
  respondToCloseRequest: (allowed) => ipcRenderer.invoke("windowCloseResponse", !!allowed),
  onCloseRequest: (cb) => ipcRenderer.on("app-close-request", (_event, request) => cb(request)),
  setE2EImportResult: (result) => ipcRenderer.invoke("e2eSetImportResult", result),
  requestE2EQuit: () => ipcRenderer.invoke("e2eRequestQuit"),
  onMenu: (cb) => ipcRenderer.on("menu", (_e, cmd) => cb(cmd)),
});
