import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wrapper = join(root, "sidecar", process.platform === "win32" ? "mvnw.cmd" : "mvnw");
const args = ["-q", "-f", join(root, "sidecar", "pom.xml"), ...process.argv.slice(2)];
const result = spawnSync(wrapper, args, {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(`Could not start Maven wrapper: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
