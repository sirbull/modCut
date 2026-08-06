// End-to-end proof of the Electron <-> Java sidecar architecture.
// Build first:  npm run build:sidecar
// Run:          node electron/test-bridge.mjs
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSidecar } from "./sidecar-bridge.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sidecar = createSidecar({ args: ["-jar", join(root, "sidecar", "target", "modcut-sidecar.jar")] });

try {
  const pong = await sidecar.call("ping");
  assert.equal(pong.pong, true, "ping should return pong");
  assert.equal(pong.driver, "M1 sidecar");
  console.log("PASS ping ->", JSON.stringify(pong));

  const drivers = await sidecar.call("listDrivers");
  assert.deepEqual(drivers.drivers, ["Dummy", "Grbl"]);
  assert.equal(drivers.library, "LibLaserCut");
  console.log("PASS listDrivers ->", drivers.drivers.join(", "));

  const lines = ["G21", "G90", "M5", "G0 X1 Y1", "M4 S500", "G1 X2 Y2 F1200", "M5"];
  const gcode = await sidecar.call("buildJob", { ops: [{ op: "Cut" }], gcodeLines: lines, bedWidth: 600, bedHeight: 400, maxFeed: 12000 });
  assert.equal(gcode.valid, true);
  assert.equal(gcode.lineCount, lines.length, "buildJob should report renderer-built G-code lines");
  assert.deepEqual(gcode.preview, lines);
  console.log("PASS buildJob gcodeLines -> %d bytes", gcode.bytes);

  const connected = await sidecar.call("connect", { dryRun: true, machine: { name: "CI", driver: "Grbl", conn: { type: "usb", serial: "none", baud: 115200 } } });
  assert.equal(connected.connected, true);
  assert.equal(connected.dryRun, true);
  const started = await sidecar.call("startJob", { filename: "ci.gcode", gcodeLines: lines, bedWidth: 600, bedHeight: 400, maxFeed: 12000 });
  assert.equal(started.started, true);
  await new Promise((resolve) => setTimeout(resolve, 25));
  const status = await sidecar.call("status");
  assert.equal(status.lastResult, "completed");
  console.log("PASS dry-run startJob ->", status.lastResult);

  console.log("\nAll sidecar bridge checks passed.");
  sidecar.close();
} catch (e) {
  console.error("FAIL", e);
  sidecar.close();
  process.exit(1);
}
