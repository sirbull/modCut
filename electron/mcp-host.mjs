// Runs modCut's MCP server for the main process: the on/off setting and token in `mcp.json`, the HTTP
// endpoint, and the round trip of each tool call to the renderer ("mcp-call" out, mcpResult back).
import { readFile, writeFile } from "node:fs/promises";
import { createMcpHandler, createToken, startMcpHttpServer } from "./mcp-server.mjs";
import { MCP_TOOLS } from "./mcp-tools.mjs";

export const MCP_DEFAULT_PORT = 47823;
const CALL_TIMEOUT = 60_000;
const INSTRUCTIONS = "modCut Draw is a vector editor for laser cutting. Start with document_info. Lengths are millimetres; x and y count from the artboard's top-left corner with y down. Each change is one undo step in modCut.";

/** `ephemeral` (tests): a free port and nothing saved. */
export function createMcpHost({ configPath, getWindow, version, ephemeral = false }) {
  let config = { enabled: false, port: MCP_DEFAULT_PORT, token: "" }, server = null, error = null, nextId = 1;
  const pending = new Map();
  const loaded = (async () => {
    if (!ephemeral) try { config = { ...config, ...JSON.parse(await readFile(configPath, "utf8")) }; } catch { /* first run */ }
    if (typeof config.token !== "string" || config.token.length < 20) { config.token = createToken(); await save(); }
    if (config.enabled) await start();
  })();
  async function save() { if (!ephemeral) await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 }).catch(() => {}); }

  function call(name, args) {
    const target = getWindow();
    if (!target || target.isDestroyed()) return Promise.reject(new Error("modCut has no open window."));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${name} did not finish within ${CALL_TIMEOUT / 1000} seconds.`)); }, CALL_TIMEOUT);
      pending.set(id, { resolve, reject, timer });
      target.webContents.send("mcp-call", { id, name, args });
    });
  }
  const handle = createMcpHandler({ tools: MCP_TOOLS, call, version, instructions: INSTRUCTIONS });

  async function start() {
    error = null;
    try { server = await startMcpHttpServer({ handle, token: config.token, port: ephemeral ? 0 : config.port }); }
    catch (problem) { server = null; error = problem.code === "EADDRINUSE" ? `Port ${config.port} is in use by another program.` : problem.message; }
  }
  async function stop() { const s = server; server = null; await s?.close(); }
  const status = () => ({ enabled: config.enabled, running: !!server, url: server?.url ?? `http://127.0.0.1:${config.port}/mcp`, token: config.token, error });

  return {
    async status() { await loaded; return status(); },
    async setEnabled(enabled) {
      await loaded;
      config.enabled = !!enabled; await save();
      if (config.enabled && !server) await start();
      if (!config.enabled) { await stop(); error = null; }
      return status();
    },
    /** The renderer's answer to one call: { result } or { error }. */
    settle(id, payload = {}) {
      const entry = pending.get(id); if (!entry) return false;
      pending.delete(id); clearTimeout(entry.timer);
      if (payload.error) entry.reject(new Error(String(payload.error))); else entry.resolve(payload.result);
      return true;
    },
    async close() { for (const [, entry] of pending) { clearTimeout(entry.timer); entry.reject(new Error("modCut is closing.")); } pending.clear(); await stop(); },
  };
}
