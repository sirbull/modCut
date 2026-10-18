import assert from "node:assert/strict";
import test from "node:test";

import { createMcpHandler, startMcpHttpServer, toContent } from "./mcp-server.mjs";
import { MCP_TOOLS } from "./mcp-tools.mjs";

const calls = [];
const handle = createMcpHandler({ tools: MCP_TOOLS, version: "1.2.3", call: async (name, args) => {
  calls.push([name, args]);
  if (name === "document_info") return { name: "Proof", artboards: [] };
  if (name === "export_artboard") return { image: { data: "iVBO", mimeType: "image/png" } };
  throw new Error("No Draw document is open.");
} });

test("tool definitions are unique, named for MCP and have object schemas", () => {
  const names = MCP_TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const tool of MCP_TOOLS) { assert.match(tool.name, /^[a-z_]+$/); assert.equal(tool.inputSchema.type, "object"); assert.ok(tool.description.length > 20); }
});

test("JSON-RPC: initialize, tools/list, tools/call, errors and notifications", async () => {
  const init = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  assert.equal(init.result.protocolVersion, "2025-03-26"); assert.equal(init.result.serverInfo.version, "1.2.3"); assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  assert.equal((await handle({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })).result.protocolVersion, "2025-06-18");
  assert.equal(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.equal((await handle({ jsonrpc: "2.0", id: 3, method: "tools/list" })).result.tools.length, MCP_TOOLS.length);
  const info = await handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "document_info", arguments: {} } });
  assert.deepEqual(info.result.structuredContent, { name: "Proof", artboards: [] }); assert.match(info.result.content[0].text, /"Proof"/);
  const image = await handle({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "export_artboard", arguments: { format: "png" } } });
  assert.deepEqual(image.result.content[0], { type: "image", data: "iVBO", mimeType: "image/png" });
  const failed = await handle({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "add_shape", arguments: { shape: "ellipse", x: 1, y: 2 } } });
  assert.equal(failed.result.isError, true); assert.match(failed.result.content[0].text, /No Draw document/);
  assert.equal((await handle({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "format_disk" } })).error.code, -32602);
  assert.equal((await handle({ jsonrpc: "2.0", id: 8, method: "resources/list" })).error.code, -32601);
  assert.equal((await handle({ id: 9, method: "ping" })).error.code, -32600);
  assert.deepEqual(calls.at(-1), ["add_shape", { shape: "ellipse", x: 1, y: 2 }]);
  assert.equal(toContent("plain").content[0].text, "plain");
});

test("HTTP: local POST with the token only; browsers from other origins are refused", async () => {
  const server = await startMcpHttpServer({ handle, token: "secret-token", port: 0 });
  try {
    const post = (body, headers = {}) => fetch(server.url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer secret-token", ...headers }, body: JSON.stringify(body) });
    const ok = await post({ jsonrpc: "2.0", id: 1, method: "ping" });
    assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), { jsonrpc: "2.0", id: 1, result: {} });
    assert.equal((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
    assert.equal((await post({ jsonrpc: "2.0", id: 2, method: "ping" }, { Authorization: "Bearer wrong" })).status, 401);
    assert.equal((await post({ jsonrpc: "2.0", id: 3, method: "ping" }, { Authorization: "" })).status, 401);
    assert.equal((await post({ jsonrpc: "2.0", id: 4, method: "ping" }, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await post({ jsonrpc: "2.0", id: 5, method: "ping" }, { Origin: "http://localhost:3000" })).status, 200);
    assert.equal((await fetch(server.url, { headers: { Authorization: "Bearer secret-token" } })).status, 405);
    assert.equal((await fetch(server.url.replace("/mcp", "/other"), { method: "POST" })).status, 404);
    const bad = await fetch(server.url, { method: "POST", headers: { Authorization: "Bearer secret-token" }, body: "{" });
    assert.equal(bad.status, 400); assert.equal((await bad.json()).error.code, -32700);
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  } finally { await server.close(); }
});
