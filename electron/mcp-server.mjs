// modCut as an MCP server (Streamable HTTP, JSON responses only): a local, opt-in endpoint that lets an AI
// agent draw in the active Draw document. Requests must come from this computer with the bearer token, and
// a browser page cannot reach it (Origin is refused unless it is local). Tool calls go to the renderer.
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";

export const MCP_PROTOCOL_VERSIONS = Object.freeze(["2025-06-18", "2025-03-26", "2024-11-05"]);
const MAX_BODY = 20 * 1024 * 1024;

export const createToken = () => randomBytes(24).toString("base64url");

/** JSON-RPC handling: resolves with the response, or null for a notification. */
export function createMcpHandler({ tools, call, name = "modcut", version = "0.0.0", instructions = "" }) {
  const result = (id, value) => ({ jsonrpc: "2.0", id, result: value });
  const failure = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  return async function handle(message) {
    if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return failure(message?.id, -32600, "Invalid request");
    }
    const { id, method, params = {} } = message;
    if (id === undefined) return null; // notifications/initialized and friends need no answer
    switch (method) {
      case "initialize": {
        const asked = params.protocolVersion;
        return result(id, { protocolVersion: MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } }, serverInfo: { name, title: "modCut", version }, ...(instructions ? { instructions } : {}) });
      }
      case "ping": return result(id, {});
      case "tools/list": return result(id, { tools });
      case "tools/call": {
        const tool = tools.find((t) => t.name === params.name);
        if (!tool) return failure(id, -32602, `Unknown tool: ${params.name}`);
        try { return result(id, toContent(await call(tool.name, params.arguments ?? {}))); }
        catch (error) { return result(id, { content: [{ type: "text", text: error?.message || String(error) }], isError: true }); }
      }
      default: return failure(id, -32601, `Method not found: ${method}`);
    }
  };
}

/** A tool's return value as MCP content: images as image content, everything else as JSON text. */
export function toContent(value) {
  if (value && value.image) return { content: [{ type: "image", data: value.image.data, mimeType: value.image.mimeType }, ...(value.text ? [{ type: "text", text: value.text }] : [])] };
  if (typeof value === "string") return { content: [{ type: "text", text: value }] };
  return { content: [{ type: "text", text: JSON.stringify(value ?? null, null, 2) }], structuredContent: value && typeof value === "object" && !Array.isArray(value) ? value : undefined };
}

const sameToken = (given, token) => { const a = Buffer.from(String(given)), b = Buffer.from(String(token)); return a.length === b.length && timingSafeEqual(a, b); };
const localOrigin = (origin) => { try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname); } catch { return false; } };

/** Serves `handle` at http://127.0.0.1:port/mcp. Port 0 picks a free port. */
export function startMcpHttpServer({ handle, token, port = 0, host = "127.0.0.1" }) {
  const server = createServer((req, res) => {
    const send = (status, body, headers = {}) => { res.writeHead(status, { "Content-Type": "application/json", ...headers }); res.end(body === undefined ? "" : JSON.stringify(body)); };
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/mcp") return send(404, { error: "Not found" });
    if (req.headers.origin && !localOrigin(req.headers.origin)) return send(403, { error: "Forbidden origin" });
    const auth = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1];
    if (!auth || !sameToken(auth, token)) return send(401, { error: "Missing or wrong token" }, { "WWW-Authenticate": "Bearer" });
    if (req.method === "DELETE") return send(200, {});
    if (req.method !== "POST") return send(405, { error: "Use POST" }, { Allow: "POST, DELETE" });
    const chunks = []; let size = 0;
    req.on("data", (chunk) => { size += chunk.length; if (size > MAX_BODY) { req.destroy(); return; } chunks.push(chunk); });
    req.on("end", async () => {
      let message;
      try { message = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { return send(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
      try {
        const reply = await handle(message);
        if (reply === null) return send(202);
        send(200, reply);
      } catch (error) { send(500, { jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32603, message: error?.message || "Internal error" } }); }
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve({ port: server.address().port, url: `http://${host}:${server.address().port}/mcp`, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}
