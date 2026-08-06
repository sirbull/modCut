// JSON-RPC-over-stdio bridge to the Java sidecar.
// Used by Electron's main process; also exercised standalone by test-bridge.mjs.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export function createSidecar({ command = "java", args = [], cwd, timeoutMs = 35000 } = {}) {
  const proc = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "inherit"] });
  const pending = new Map();
  let nextId = 1;
  let stopped = false;

  createInterface({ input: proc.stdout }).on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; } // ignore non-JSON noise
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  });

  const rejectAll = (message) => {
    stopped = true;
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); }
    pending.clear();
  };
  proc.on("error", (error) => rejectAll(`sidecar failed to start: ${error.message}`));
  proc.on("exit", (code) => rejectAll(`sidecar exited (${code})`));

  function call(method, params) {
    if (stopped) return Promise.reject(new Error("sidecar is not running"));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`sidecar request timed out: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n", (error) => {
        if (!error) return;
        clearTimeout(timer); pending.delete(id); reject(error);
      });
    });
  }

  return { call, close: () => proc.kill() };
}
