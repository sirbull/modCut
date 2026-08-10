import assert from "node:assert/strict";
import { capabilitiesForMachine, DRIVER_CATALOG, MACHINE_PRESETS, normalizeMachineProfile } from "./driver-catalog.mjs";
assert.deepEqual(capabilitiesForMachine({ driver: "Epilog Zing" }).rasterDpis, [100, 200, 250, 400, 500, 1000]);
assert.deepEqual(capabilitiesForMachine({ driverId: "epilog-helix" }).rasterDpis, [75, 150, 200, 300, 400, 600, 1200]);
assert.equal(capabilitiesForMachine({ driverId: "epilog-helix" }).vectorDpi, 600);
assert.equal(normalizeMachineProfile({ driver: "Grbl", conn: { type: "network", port: 23 } }).driverId, "grbl");
assert.equal(normalizeMachineProfile({ driver: "Epilog Zing", conn: { type: "network", port: 23 } }).conn.port, 515);
assert.equal(MACHINE_PRESETS.find((preset) => preset.model === "Helix").bedW, null);
assert.ok(DRIVER_CATALOG.every((driver) => driver.id && driver.protocol && driver.fileExtension && driver.connectionTypes.length));
