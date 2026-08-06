export function isUsableWindow(window) {
  return !!window
    && !window.isDestroyed?.()
    && !!window.webContents
    && !window.webContents.isDestroyed?.();
}

export function createWindowCommandRouter({ getWindow, createWindow, channel = "menu" }) {
  const deliver = (target, command) => {
    if (!isUsableWindow(target)) return false;
    target.webContents.send(channel, command);
    return true;
  };

  return function routeWindowCommand(command) {
    let target = getWindow();
    let created = false;
    if (!isUsableWindow(target)) {
      target = createWindow();
      created = true;
    }
    if (!isUsableWindow(target)) return null;

    target.show?.();
    target.focus?.();

    // A newly created window is already a blank New document. Other menu
    // commands must wait until the renderer has installed its menu listener.
    if (created && command === "new") return target;
    if (target.webContents.isLoadingMainFrame?.()) {
      target.webContents.once("did-finish-load", () => deliver(target, command));
    } else {
      deliver(target, command);
    }
    return target;
  };
}
