// End-to-end proof of the Electron <-> Java sidecar architecture.
// Compile first:  javac -d sidecar/out sidecar/Sidecar.java
// Run:            node electron/test-bridge.mjs
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSidecar } from "./sidecar-bridge.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sidecar = createSidecar({ args: ["-cp", join(root, "sidecar", "out"), "Sidecar"] });

try {
  const pong = await sidecar.call("ping");
  assert.equal(pong.pong, true, "ping should return pong");
  assert.equal(pong.driver, "Dummy");
  console.log("PASS ping ->", JSON.stringify(pong));

  const drivers = await sidecar.call("listDrivers");
  assert.ok(drivers.drivers.includes("EpilogZing"), "driver list should include Epilog");
  assert.ok(drivers.drivers.includes("Ruida"), "driver list should include Ruida");
  console.log("PASS listDrivers ->", drivers.drivers.join(", "));

  const job = await sidecar.call("buildJob", { ops: [{ op: "cut" }, { op: "engrave" }, { op: "score" }] });
  assert.equal(job.opCount, 3, "buildJob should see 3 operations");
  assert.equal(job.format, "gcode");
  assert.ok(Array.isArray(job.preview) && job.preview.length > 0);
  console.log("PASS buildJob -> opCount=%d, %d preview lines", job.opCount, job.preview.length);

  const gcode = await sidecar.call("buildJob", { ops: [{ op: "Cut" }], gcodeLines: ["G21", "G90", "M4 S500", "G1 X1 Y1 F1200", "M5"] });
  assert.equal(gcode.lineCount, 5, "buildJob should report renderer-built G-code lines");
  assert.deepEqual(gcode.preview, ["G21", "G90", "M4 S500", "G1 X1 Y1 F1200", "M5"]);
  console.log("PASS buildJob gcodeLines -> %d bytes", gcode.bytes);

  console.log("\nAll sidecar bridge checks passed.");
  sidecar.close();
} catch (e) {
  console.error("FAIL", e);
  sidecar.close();
  process.exit(1);
}
