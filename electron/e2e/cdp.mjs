import assert from "node:assert/strict";

export const wait = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

export async function connectToPage(port, title, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let target;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = targets.find((entry) => entry.type === "page" && entry.title === title);
      if (target) break;
    } catch {}
    await wait(100);
  }
  assert.ok(target, `${title} DevTools target was not found on port ${port}`);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const promise = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(promise.timer);
    message.error ? promise.reject(new Error(message.error.message)) : promise.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const [id, promise] of pending) {
      clearTimeout(promise.timer);
      promise.reject(new Error(`DevTools connection closed while command ${id} was pending`));
    }
    pending.clear();
  });
  const command = (method, params = {}) => {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        const detail = method === "Runtime.evaluate"
          ? ` (${String(params.expression || "").replace(/\s+/g, " ").slice(0, 180)})`
          : "";
        reject(new Error(`DevTools command timed out after 30 seconds: ${method}${detail}`));
      }, 30_000);
      pending.set(id, { resolve, reject, timer });
    });
  };
  const evaluate = async (expression) => {
    const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await command("Runtime.enable");
  return { socket, command, evaluate };
}

export const connectToApp = (port, timeoutMs = 20_000) => connectToPage(port, "modCut", timeoutMs);

export function inputHelpers(client) {
  const mouse = async (type, point, { buttons = 0, modifiers = 0 } = {}) => {
    await client.command("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", buttons, modifiers, clickCount: 1 });
    await wait(35);
  };
  const click = async (point, modifiers = 0) => {
    await mouse("mouseMoved", point, { modifiers });
    await mouse("mousePressed", point, { buttons: 1, modifiers });
    await mouse("mouseReleased", point, { modifiers });
  };
  const drag = async (start, end, modifiers = 0) => {
    await mouse("mouseMoved", start, { modifiers });
    await mouse("mousePressed", start, { buttons: 1, modifiers });
    await mouse("mouseMoved", end, { buttons: 1, modifiers });
    await mouse("mouseReleased", end, { modifiers });
  };
  const key = async (keyName, modifiers = 0) => {
    await client.command("Input.dispatchKeyEvent", { type: "keyDown", key: keyName, modifiers });
    await client.command("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, modifiers });
    await wait();
  };
  return { click, drag, key, mouse };
}
