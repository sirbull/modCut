import assert from "node:assert/strict";
import test from "node:test";

import { createWindowCommandRouter, isUsableWindow } from "./window-lifecycle.mjs";

function fakeWindow({ destroyed = false, loading = false } = {}) {
  const sent = [];
  const listeners = new Map();
  return {
    sent,
    shown: 0,
    focused: 0,
    isDestroyed: () => destroyed,
    show() { this.shown++; },
    focus() { this.focused++; },
    webContents: {
      isDestroyed: () => false,
      isLoadingMainFrame: () => loading,
      send: (...args) => sent.push(args),
      once: (event, callback) => listeners.set(event, callback),
    },
    finishLoad() { loading = false; listeners.get("did-finish-load")?.(); },
  };
}

test("a destroyed window is never considered usable", () => {
  assert.equal(isUsableWindow(fakeWindow({ destroyed: true })), false);
  assert.equal(isUsableWindow(fakeWindow()), true);
});

test("Cmd/Ctrl+N creates a blank window instead of sending to the destroyed one", () => {
  const oldWindow = fakeWindow({ destroyed: true });
  const newWindow = fakeWindow({ loading: true });
  let current = oldWindow;
  const route = createWindowCommandRouter({
    getWindow: () => current,
    createWindow: () => (current = newWindow),
  });

  assert.equal(route("new"), newWindow);
  assert.deepEqual(oldWindow.sent, []);
  assert.deepEqual(newWindow.sent, []);
  assert.equal(newWindow.shown, 1);
  assert.equal(newWindow.focused, 1);
});

test("other commands wait for a replacement window to finish loading", () => {
  const newWindow = fakeWindow({ loading: true });
  let current = null;
  const route = createWindowCommandRouter({
    getWindow: () => current,
    createWindow: () => (current = newWindow),
  });

  route("import");
  assert.deepEqual(newWindow.sent, []);
  newWindow.finishLoad();
  assert.deepEqual(newWindow.sent, [["menu", "import"]]);
});

test("commands are delivered immediately to an existing live window", () => {
  const current = fakeWindow();
  const route = createWindowCommandRouter({ getWindow: () => current, createWindow: () => assert.fail("must not create") });
  route("new");
  assert.deepEqual(current.sent, [["menu", "new"]]);
});
