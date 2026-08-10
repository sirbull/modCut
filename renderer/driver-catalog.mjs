export const DRIVER_CATALOG = Object.freeze([
  { id: "dummy", displayName: "Dummy", manufacturer: "Generic", family: "Simulation", protocol: "none", connectionTypes: ["usb"], defaultPort: null, fileExtension: ".gcode", rasterDpis: [], vectorDpi: 300, nativeRaster: false, softwareFocus: false, controlledZ: true, framing: true, softwareCancel: true, available: true, defaults: { maxFeed: 12000 } },
  { id: "grbl", displayName: "GRBL", manufacturer: "Generic", family: "GRBL", protocol: "GRBL serial/TCP", connectionTypes: ["usb", "network"], defaultPort: 23, fileExtension: ".gcode", rasterDpis: [], vectorDpi: 300, nativeRaster: false, softwareFocus: false, controlledZ: true, framing: true, softwareCancel: true, available: true, defaults: { baud: 115200, maxFeed: 12000 } },
  { id: "epilog-zing", displayName: "Epilog Zing", manufacturer: "Epilog", family: "Zing", protocol: "LPD/PJL/PCL/HPGL", connectionTypes: ["network"], defaultPort: 515, fileExtension: ".prn", rasterDpis: [100, 200, 250, 400, 500, 1000], vectorDpi: 500, nativeRaster: true, softwareFocus: true, focusMinMm: -12.6, focusMaxMm: 12.6, controlledZ: false, framing: true, softwareCancel: false, available: true, defaults: { maxFeed: 12000 } },
  { id: "epilog-helix", displayName: "Epilog Helix", manufacturer: "Epilog", family: "Helix", protocol: "LPD/PJL/PCL/HPGL", connectionTypes: ["network"], defaultPort: 515, fileExtension: ".prn", rasterDpis: [75, 150, 200, 300, 400, 600, 1200], vectorDpi: 600, nativeRaster: true, softwareFocus: true, focusMinMm: -12.6, focusMaxMm: 12.6, controlledZ: false, framing: true, softwareCancel: false, available: true, defaults: { maxFeed: 12000 } },
]);
export const MACHINE_PRESETS = Object.freeze([
  { id: "generic-dummy", manufacturer: "Generic", model: "Dummy", driverId: "dummy", name: "Dummy (offline)", bedW: 600, bedH: 400 },
  { id: "generic-grbl", manufacturer: "Generic", model: "GRBL", driverId: "grbl", name: "GRBL laser", bedW: 600, bedH: 400 },
  { id: "epilog-zing", manufacturer: "Epilog", model: "Zing", driverId: "epilog-zing", name: "Epilog Zing", bedW: 600, bedH: 300 },
  { id: "epilog-helix", manufacturer: "Epilog", model: "Helix", driverId: "epilog-helix", name: "Epilog Helix", bedW: null, bedH: null },
]);
const LEGACY_IDS = new Map([["dummy", "dummy"], ["grbl", "grbl"], ["epilog zing", "epilog-zing"], ["epilog helix", "epilog-helix"]]);
export const driverById = (id) => DRIVER_CATALOG.find((driver) => driver.id === id);
export const normalizeDriverId = (value) => LEGACY_IDS.get(String(value || "").trim().toLowerCase()) || String(value || "").trim().toLowerCase();
export function normalizeMachineProfile(machine) {
  const normalized = structuredClone(machine);
  normalized.driverId = normalizeDriverId(normalized.driverId || normalized.driver);
  const driver = driverById(normalized.driverId) || DRIVER_CATALOG[0];
  normalized.driverId = driver.id; normalized.driver = driver.id;
  normalized.manufacturer ||= driver.manufacturer; normalized.model ||= driver.family;
  normalized.conn ||= {};
  if (!driver.connectionTypes.includes(normalized.conn.type)) normalized.conn.type = driver.connectionTypes[0];
  if (normalized.conn.type === "network" && (!normalized.conn.port || (normalized.conn.port === 23 && driver.defaultPort === 515))) normalized.conn.port = driver.defaultPort;
  return normalized;
}
export const capabilitiesForMachine = (machine) => driverById(normalizeDriverId(machine?.driverId || machine?.driver)) || DRIVER_CATALOG[0];
