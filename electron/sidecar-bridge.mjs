// JSON-RPC-over-stdio bridge to the Java sidecar.
// Used by Electron's main process; also exercised standalone by test-bridge.mjs.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export function createSidecar({ command = "java", args = [], cwd } = {}) {
  const proc = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "inherit"] });
  const pending = new Map();
  let nextId = 1;

  createInterface({ input: proc.stdout }).on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; } // ignore non-JSON noise
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  });

  proc.on("exit", (code) => {
    for (const p of pending.values()) p.reject(new Error(`sidecar exited (${code})`));
    pending.clear();
  });

  function call(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  return { call, close: () => proc.kill() };
}
