import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const wanted = process.platform === "win32" ? "java.exe" : "java";

function find(start, predicate) {
  if (!existsSync(start)) return null;
  for (const name of readdirSync(start)) {
    const path = join(start, name);
    const info = statSync(path);
    if (info.isDirectory()) {
      const nested = find(path, predicate);
      if (nested) return nested;
    } else if (predicate(path)) return path;
  }
  return null;
}

const jar = find(dist, (path) => path.endsWith(join("sidecar", "modcut-sidecar.jar")));
const java = find(dist, (path) => path.endsWith(join("runtime", "bin", wanted)));
if (!jar || !java) throw new Error("Packaged app is missing its sidecar or bundled Java runtime.");

const result = spawnSync(java, ["-jar", jar], {
  input: '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}\n',
  encoding: "utf8",
  timeout: 20_000,
});
if (result.status !== 0 || !result.stdout.includes('"pong":true')) {
  process.stderr.write(result.stderr || "");
  throw new Error("Packaged sidecar failed its smoke test.");
}
console.log(`Package smoke test passed with ${java}`);
