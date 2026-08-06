import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jar = join(root, "sidecar", "target", "modcut-sidecar.jar");
const output = join(root, "build", "runtime");
const executable = (name) => process.platform === "win32" ? `${name}.exe` : name;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${command} exited with ${result.status}`);
  }
  return result;
}

function javaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  const result = run("java", ["-XshowSettings:properties", "-version"]);
  const settings = `${result.stdout}\n${result.stderr}`;
  const match = settings.match(/^\s*java\.home\s*=\s*(.+)$/m);
  if (!match) throw new Error("Could not determine JAVA_HOME. Install JDK 17+ or set JAVA_HOME.");
  return match[1].trim();
}

if (!existsSync(jar)) throw new Error("Sidecar JAR is missing. Run npm run build:sidecar first.");
const home = javaHome();
const jlink = join(home, "bin", executable("jlink"));
if (!existsSync(jlink)) throw new Error(`jlink is missing from ${home}; a full JDK 17+ is required for packaging.`);

rmSync(output, { recursive: true, force: true });
mkdirSync(dirname(output), { recursive: true });

// jdeps reports the first six modules for the shaded sidecar. The remaining
// runtime/provider modules cover native serial loading, TLS and non-ASCII data.
const modules = [
  "java.base", "java.desktop", "java.naming", "java.scripting", "java.security.jgss", "java.sql",
  "jdk.charsets", "jdk.crypto.ec", "jdk.unsupported",
].join(",");
run(jlink, [
  "--add-modules", modules,
  "--strip-debug",
  "--no-header-files",
  "--no-man-pages",
  "--compress=2",
  "--output", output,
]);

const java = join(output, "bin", executable("java"));
if (process.platform !== "win32") chmodSync(java, 0o755);
const ping = run(java, ["-jar", jar], {
  input: '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}\n',
});
const response = ping.stdout.trim().split(/\r?\n/).find((line) => line.includes('"pong":true'));
if (!response) throw new Error("Bundled Java runtime could not start the modCut sidecar.");

console.log(`Bundled Java runtime ready: ${output}`);
