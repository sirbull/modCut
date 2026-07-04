import { createBed } from "./bed.js";
import { prepareSVG } from "./svgimport.js";
import { dxfToSvg } from "./dxfimport.js";
import { openModal } from "./ui.js";

const $ = (id) => document.getElementById(id);
const OPS = ["Cut", "Engrave", "Score"];
const DITHERS = ["Jarvis", "Floyd-Steinberg", "Stucki", "Bayer"]; // Jarvis default
const clampSpeedPct = (v) => Math.max(1, Math.min(100, Number(v) || 1));

// --- persisted stores (seeded from presets on first run, then fully editable) --
const F = 20000; // default beam frequency (Hz)
const MATERIAL_PRESETS = [
  { id: "ply3", name: "Plywood 3 mm", ops: { Cut: { power: 80, speed: 20, freq: F }, Engrave: { power: 40, speed: 65, freq: F }, Score: { power: 25, speed: 35, freq: F } } },
  { id: "acr3", name: "Acrylic 3 mm", ops: { Cut: { power: 90, speed: 15, freq: 5000 }, Engrave: { power: 35, speed: 60, freq: 5000 }, Score: { power: 20, speed: 35, freq: 5000 } } },
  { id: "mdf4", name: "MDF 4 mm",     ops: { Cut: { power: 85, speed: 15, freq: F }, Engrave: { power: 45, speed: 60, freq: F }, Score: { power: 30, speed: 35, freq: F } } },
  { id: "card", name: "Cardboard",    ops: { Cut: { power: 45, speed: 45, freq: F }, Engrave: { power: 18, speed: 80, freq: F }, Score: { power: 12, speed: 50, freq: F } } },
];
const MACHINE_PRESETS = [{ id: "dummy", name: "Dummy (offline)", driver: "Dummy", conn: { type: "usb", serial: "", baud: 115200 }, bedW: 600, bedH: 400, maxFeed: 12000, adv: { flipX: false, flipY: true, home: "front-left" } }];
function loadStore(key, presets) {
  try { const s = JSON.parse(localStorage.getItem(key)); return Array.isArray(s) && s.length ? s : structuredClone(presets); }
  catch { return structuredClone(presets); }
}
let materials = loadStore("modcut_materials", MATERIAL_PRESETS);
let machines = loadStore("modcut_machines", MACHINE_PRESETS);
function normalizeMaterialSpeeds() {
  for (const m of materials) for (const op of OPS) if (m.ops?.[op]) m.ops[op].speed = clampSpeedPct(m.ops[op].speed);
}
normalizeMaterialSpeeds();
for (const m of machines) if (!m.maxFeed) m.maxFeed = 12000;
const saveMaterials = () => localStorage.setItem("modcut_materials", JSON.stringify(materials));
const saveMachines = () => localStorage.setItem("modcut_machines", JSON.stringify(machines));

const state = {
  machineId: machines[0].id, materialId: materials[0].id,
  mappingMode: "color", units: localStorage.getItem("modcut_units") || "cm",
  refKey: "tl", colors: [], layers: [],
  gridXmm: +(localStorage.getItem("modcut_gridX") || 10),
  gridYmm: +(localStorage.getItem("modcut_gridY") || 10),
  gridUnit: localStorage.getItem("modcut_gridUnit") || "cm",
};
let drivers = ["Dummy"];

// --- units + toast ----------------------------------------------------------
const UNIT = { mm: 1, cm: 10, in: 25.4 };
const dispNum = (mm) => (mm / UNIT[state.units]).toFixed(state.units === "mm" ? 1 : 2);
const dispRaw = (mm) => +(mm / UNIT[state.units]).toFixed(2);
const toMm = (v) => v * UNIT[state.units];
const toDisp = (mm) => +(mm / UNIT[state.units]).toFixed(2);
function toast(msg, kind = "info") {
  const t = document.createElement("div");
  t.className = "toast toast--" + kind;
  t.textContent = msg;
  $("toasts").append(t);
  setTimeout(() => t.remove(), kind === "err" ? 7000 : 4000);
}

const material = () => materials.find((m) => m.id === state.materialId) || materials[0];
const machine = () => machines.find((m) => m.id === state.machineId) || machines[0];
const defaultsFor = (op) => {
  const d = { power: 50, speed: 50, freq: F, ...material().ops[op] };
  d.speed = clampSpeedPct(d.speed);
  return d;
};
const driverExt = (d) => (/ruida/i.test(d) ? ".rd" : ".gcode");

// --- collapsible side panel sections ---------------------------------------
const COLLAPSED_SECTIONS_KEY = "modcut_collapsed_sections";
function loadCollapsedSections() {
  try { const v = JSON.parse(localStorage.getItem(COLLAPSED_SECTIONS_KEY)); return new Set(Array.isArray(v) ? v : []); }
  catch { return new Set(); }
}
const collapsedSections = loadCollapsedSections();
const sectionKey = (title) => title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function saveCollapsedSections() {
  localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...collapsedSections]));
}
function setSectionCollapsed(sec, collapsed, persist = true) {
  const title = sec.querySelector(":scope > h3");
  if (!title) return;
  const key = title.dataset.sectionKey || sectionKey(title.textContent);
  sec.classList.toggle("collapsed", collapsed);
  title.setAttribute("aria-expanded", String(!collapsed));
  if (!persist) return;
  if (collapsed) collapsedSections.add(key);
  else collapsedSections.delete(key);
  saveCollapsedSections();
}
function initCollapsibleSections() {
  document.querySelectorAll("#side .sec > h3").forEach((title) => {
    const sec = title.parentElement;
    const key = sectionKey(title.textContent);
    title.dataset.sectionKey = key;
    title.tabIndex = 0;
    title.setAttribute("role", "button");
    title.setAttribute("aria-expanded", "true");
    title.addEventListener("click", () => setSectionCollapsed(sec, !sec.classList.contains("collapsed")));
    title.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      setSectionCollapsed(sec, !sec.classList.contains("collapsed"));
    });
    setSectionCollapsed(sec, collapsedSections.has(key), false);
  });
}

// --- bed --------------------------------------------------------------------
const bed = createBed($("stage"), { bedWmm: 600, bedHmm: 400 });
bed.onCoords((x, y) => ($("coords").textContent = `X ${dispNum(x)}  Y ${dispNum(y)} ${state.units}`));
let selectedCount = 0;
let activeTool = "select";
const DRAW_TOOLS = new Set(["pen", "rect", "ellipse", "line"]);
function refreshPropsVisibility() {
  $("propSec").classList.toggle("hidden", selectedCount === 0 && !DRAW_TOOLS.has(activeTool));
}
bed.onSelection((n) => { selectedCount = n; $("sel").textContent = `${n} selected`; refreshProps(); refreshPropsVisibility(); });
bed.onChange(() => { refreshPos(); markDirty(); });

let docPath = null;
let dirty = false;
function pathBase(path) { return String(path || "").split(/[\\/]/).pop(); }
function setFileLabel(name) { $("file").textContent = `${name || "Untitled"}${dirty ? " *" : ""}`; }
function markDirty() { dirty = true; setFileLabel(docPath ? pathBase(docPath) : ($("file").textContent.replace(/\s\*$/, "") || "Untitled")); }
function markClean() { dirty = false; setFileLabel(docPath ? pathBase(docPath) : ($("file").textContent.replace(/\s\*$/, "") || "Untitled")); }

function documentPayload() {
  return {
    app: "modCut",
    version: 2,
    saved: new Date().toISOString(),
    design: bed.exportDesign(),
    filename: $("filename").value,
    mappingMode: state.mappingMode,
    layers: state.layers,
    units: state.units,
    machineId: state.machineId,
    materialId: state.materialId,
    gridXmm: state.gridXmm,
    gridYmm: state.gridYmm,
    gridUnit: state.gridUnit,
    pathOrder: $("pathOrder").value,
  };
}

async function saveDocument(saveAs = false) {
  const base = ($("filename").value.trim() || "untitled").replace(/\.[^.]+$/, "") + ".modcut";
  const json = JSON.stringify(documentPayload(), null, 2);
  try {
    const path = await window.modcut.saveDocument(json, docPath, saveAs, base);
    if (!path) return false;
    docPath = path;
    markClean();
    toast("Document saved.", "ok");
    return true;
  } catch (e) {
    toast("Save failed: " + e.message, "err");
    return false;
  }
}

function saveWorkDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal panel"><div class="panel__header">Save work?</div>
      <div class="panel__body">
        <p class="hint">Save the current document before continuing.</p>
        <div class="modal-actions">
          <button class="btn btn--ghost btn--sm" data-x="cancel">Cancel</button>
          ${docPath ? `<button class="btn btn--secondary btn--sm" data-x="saveAs">Save as..</button>` : ""}
          <button class="btn btn--primary btn--sm" data-x="save">Save</button>
        </div>
      </div></div>`;
    const close = (v) => { overlay.remove(); resolve(v); };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) return close(null);
      const b = e.target.closest("button[data-x]");
      if (b) close(b.dataset.x);
    });
    document.body.append(overlay);
    overlay.querySelector('[data-x="save"]')?.focus();
  });
}

async function guardWorkBeforeContinue() {
  if (!bed.getDesign() && !dirty) return true;
  const choice = await saveWorkDialog();
  if (choice === "save") return saveDocument(false);
  if (choice === "saveAs") return saveDocument(true);
  return false;
}

function applyDocument(p, path, name) {
  if (!p || p.app !== "modCut") throw new Error("Not a modCut document.");
  bed.importDesign(p.design || "");
  docPath = path || null;
  if (p.filename) $("filename").value = p.filename;
  if (p.units) setUnits(p.units);
  if (p.mappingMode) state.mappingMode = p.mappingMode;
  if (Array.isArray(p.layers)) state.layers = p.layers;
  if (p.gridXmm) state.gridXmm = +p.gridXmm;
  if (p.gridYmm) state.gridYmm = +p.gridYmm;
  if (p.gridUnit) state.gridUnit = p.gridUnit;
  bed.setGrid(state.gridXmm, state.gridYmm);
  if (p.pathOrder) { $("pathOrder").value = p.pathOrder; bed.setPathOrder(p.pathOrder); }
  [...$("mapmode").children].forEach((c) => c.classList.toggle("on", c.dataset.mode === state.mappingMode));
  syncColorsAndLayers();
  setFileLabel(name || pathBase(path) || "Untitled");
  markClean();
  refreshPos();
}

// --- import -----------------------------------------------------------------
async function doImport() {
  let f;
  try {
    f = await window.modcut.openImport();
  } catch (e) {
    toast("Import failed: " + e.message, "err");
    return;
  }
  if (!f) return;
  if (!(await guardWorkBeforeContinue())) return;
  const hadDesign = !!bed.getDesign();
  setFileLabel(f.name);
  try {
    if (f.kind === "document") {
      applyDocument(JSON.parse(f.text), f.path, f.name);
      toast("Document opened.", "ok");
      return;
    } else if (f.ext === "svg" || f.ext === "dxf") {
      const svgText = f.ext === "dxf" ? dxfToSvg(f.text) : f.text;
      const { node, widthMm, heightMm, colors } = prepareSVG(svgText);
      bed.loadSVG(node, widthMm, heightMm);
      const d = bed.getDesign();
      const from = f.sourceExt ? ` (converted from .${f.sourceExt})` : "";
      toast(`Imported ${f.name}${from}: ${colors.length} color(s), ${dispNum(d.wMm)} × ${dispNum(d.hMm)} ${state.units}`, "ok");
    } else if (f.dataUrl) {
      bed.loadImage(f.dataUrl, null);
      toast("Image imported (raster engrave).", "ok");
    } else {
      toast(`.${f.ext} import is coming in a later version (M3).`, "info");
      return;
    }
  } catch (e) {
    toast("Import failed: " + e.message, "err");
    return;
  }
  if (!hadDesign) $("filename").value = f.name.replace(/\.[^.]+$/, ""); // base name only; extension is appended on Send
  syncColorsAndLayers();
}

async function newDocument() {
  if (!(await guardWorkBeforeContinue())) return;
  bed.clear();
  bed.resetHistory();
  docPath = null;
  state.colors = [];
  state.layers = [];
  $("filename").value = "job";
  setFileLabel("Untitled");
  markClean();
  syncLayers();
  refreshPos();
  toast("New document.", "ok");
}

// --- layers -----------------------------------------------------------------
const newLayer = (color, op) => ({ color, op, output: true, dpi: 300, dither: "Jarvis", bottomUp: true, ...defaultsFor(op) });
// Re-read colors from the bed (import + drawn shapes) and reconcile the layer list,
// preserving settings for colors that still exist.
function syncColorsAndLayers() { state.colors = bed.getColors(); syncLayers(); }
function syncLayers() {
  if (state.mappingMode === "color") {
    const prev = new Map(state.layers.map((l) => [l.color, l]));
    state.layers = state.colors.map((c) => prev.get(c.color) || newLayer(c.color, "Cut"));
  } else {
    const op = state.mappingMode[0].toUpperCase() + state.mappingMode.slice(1);
    state.layers = state.colors.length ? [state.layers[0] && state.layers[0].color === null ? state.layers[0] : newLayer(null, op)] : [];
  }
  renderLayers();
}
function applyMaterialToLayers() { for (const l of state.layers) Object.assign(l, defaultsFor(l.op)); renderLayers(); }
function renderLayers() {
  const host = $("layers");
  host.innerHTML = "";
  $("layersHint").style.display = state.layers.length ? "none" : "";
  state.layers.forEach((l) => host.append(layerRow(l)));
}
function layerRow(l) {
  l.speed = clampSpeedPct(l.speed);
  const row = document.createElement("div");
  row.className = "clayer";
  const byColor = state.mappingMode === "color";
  const engrave = l.op === "Engrave";
  row.innerHTML = `
    <div class="clayer__top">
      <span class="clayer__sw" style="background:${l.color || "linear-gradient(135deg,#888,#ccc)"}"></span>
      ${byColor
        ? `<select class="select clayer__op">${OPS.map((o) => `<option ${o === l.op ? "selected" : ""}>${o}</option>`).join("")}</select>`
        : `<strong class="clayer__op">All shapes → ${l.op}</strong>`}
      <button class="toggle" aria-checked="${l.output}" title="Output"></button>
    </div>
    <div class="clayer__grid">
      <div><label>Power %</label><input class="input" type="number" min="0" max="100" value="${l.power}" data-k="power"></div>
      <div><label>Speed %</label><input class="input" type="number" min="1" max="100" value="${l.speed}" data-k="speed"></div>
      <div><label>Freq Hz</label><input class="input" type="number" min="0" value="${l.freq}" data-k="freq"></div>
    </div>
    ${engrave ? `
    <div class="clayer__grid two">
      <div><label>DPI (1–1000)</label><input class="input" type="number" min="1" max="1000" value="${l.dpi}" data-k="dpi"></div>
      <div><label>Dithering</label><select class="select" data-k="dither">${DITHERS.map((d) => `<option ${d === l.dither ? "selected" : ""}>${d}</option>`).join("")}</select></div>
    </div>
    <label class="clayer__chk"><input type="checkbox" ${l.bottomUp ? "checked" : ""} data-k="bottomUp"> Engrave bottom → top (less soot)</label>` : ""}`;

  const op = row.querySelector("select.clayer__op");
  if (op) op.addEventListener("change", () => { l.op = op.value; Object.assign(l, defaultsFor(l.op)); renderLayers(); markDirty(); });
  row.querySelector(".toggle").addEventListener("click", (e) => { l.output = !l.output; e.currentTarget.setAttribute("aria-checked", l.output); markDirty(); });
  row.querySelectorAll("[data-k]").forEach((el) => {
    const k = el.dataset.k;
    if (el.type === "checkbox") el.addEventListener("change", () => { l[k] = el.checked; markDirty(); });
    else if (el.tagName === "SELECT") el.addEventListener("change", () => { l[k] = el.value; markDirty(); });
    else el.addEventListener("input", () => { l[k] = k === "speed" ? clampSpeedPct(el.value) : Number(el.value); markDirty(); });
  });
  return row;
}

// --- run + estimate ---------------------------------------------------------
const activeLayers = () => state.layers.filter((l) => l.output);
const jobOps = () => activeLayers().map((l) => ({ op: l.op, color: l.color, power: l.power, speed: clampSpeedPct(l.speed), freq: l.freq, ...(l.op === "Engrave" ? { dpi: l.dpi, dither: l.dither, bottomUp: l.bottomUp } : {}) }));
async function runJob(label) {
  if (!bed.getDesign()) return toast("Nothing imported yet.", "info");
  const ops = jobOps();
  if (!ops.length) return toast("No active layers to run.", "info");
  const base = ($("filename").value.trim() || "job").replace(/\.[^.]+$/, "");
  const filename = base + driverExt(machine().driver);
  try {
    const job = await bed.buildGcodeJob(ops, { maxFeed: machine().maxFeed || 12000 });
    const r = await window.modcut.call("buildJob", { machine: machine().name, driver: machine().driver, material: state.materialId, mappingMode: state.mappingMode, filename, ops, gcodeLines: job.lines });
    toast(`${label} OK: ${r.opCount} layer(s), ${r.preview.length}/${r.lineCount} G-code lines → ${filename} (${machine().driver}).`, "ok");
  } catch (e) { toast(`${label} failed: ${e.message}`, "err"); }
}
function frame() {
  const d = bed.getDesign();
  if (!d) return toast("Nothing to frame.", "info");
  toast(`Framing ${dispNum(d.wMm)} × ${dispNum(d.hMm)} ${state.units} at (${dispNum(d.xMm)}, ${dispNum(d.yMm)}). Head traces the outline, beam off.`, "info");
}
function estimate() {
  if (!bed.getDesign()) return ($("estimateOut").textContent = "");
  const stats = bed.geometryStats();
  const byColor = state.mappingMode === "color";
  const total = { length: 0, area: 0 };
  for (const v of stats.values()) { total.length += v.length; total.area += v.area; }
  let sec = 3;
  for (const l of activeLayers()) {
    const s = byColor ? (stats.get(l.color) || { length: 0, area: 0 }) : total;
    const speed = Math.max(1, l.speed);
    sec += l.op === "Engrave" ? (s.area / (25.4 / Math.max(1, l.dpi))) / speed : s.length / speed;
  }
  const m = Math.floor(sec / 60);
  $("estimateOut").textContent = "~ " + (m ? `${m}m ${Math.round(sec % 60)}s` : `${Math.round(sec)}s`);
}

// --- simulate ---------------------------------------------------------------
let simCtl = null;
const simSpecs = () => activeLayers().map((l) => ({ color: state.mappingMode === "color" ? l.color : null, op: l.op, speed: l.speed, dpi: l.dpi, bottomUp: l.bottomUp }));
function startSimulate() {
  if (!bed.getDesign()) return toast("Import a design first.", "info");
  const specs = simSpecs();
  if (!specs.length) return toast("No active layers to simulate.", "info");
  simCtl = bed.startSim(specs);
  if (!simCtl) return toast("No cuttable geometry found.", "err");
  simCtl.onProgress((p) => { $("simProg").textContent = Math.round(p * 100) + "%"; if (p >= 1) $("simPlay").textContent = "↺"; });
  $("simbar").classList.remove("hidden");
  $("simPlay").textContent = "⏸";
  setSimSpeed(1);
  toast("Simulating toolpath — red dot follows the beam.", "info");
}
function stopSimulate() { if (simCtl) { simCtl.stop(); simCtl = null; } $("simbar").classList.add("hidden"); }
function setSimSpeed(x) { if (simCtl) simCtl.setMult(x); [...$("simSpeeds").children].forEach((b) => b.classList.toggle("on", +b.dataset.x === x)); }

// --- position ---------------------------------------------------------------
let posRatio = 1, suppressPos = false;
function refreshPos() {
  if (suppressPos) return;
  const r = bed.getRect();
  const els = ["posX", "posY", "posW", "posH", "posA"].map($);
  if (!r) { els.forEach((e) => (e.value = "")); return; }
  posRatio = r.h ? r.w / r.h : 1;
  const ref = bed.getRef(state.refKey);
  $("posX").value = dispRaw(ref.x); $("posY").value = dispRaw(ref.y);
  $("posW").value = dispRaw(r.w); $("posH").value = dispRaw(r.h); $("posA").value = Math.round(r.angle);
}
function applyPos() {
  if (!bed.getRect()) return;
  suppressPos = true;
  bed.applyRect(state.refKey, toMm(+$("posX").value), toMm(+$("posY").value), toMm(+$("posW").value), toMm(+$("posH").value));
  suppressPos = false;
  refreshPos();
}

// --- machines ---------------------------------------------------------------
function refreshMachines(selId) {
  $("device").innerHTML = machines.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
  $("device").value = selId || state.machineId;
  selectMachine($("device").value);
}
function selectMachine(id) {
  state.machineId = id;
  const m = machine();
  bed.setBedSize(m.bedW || 600, m.bedH || 400);
  $("fnExt").textContent = driverExt(m.driver); // shown next to the name field
}
const machineFields = (m) => [
  { key: "name", label: "Name", value: m?.name, placeholder: "e.g. Epilog Fusion" },
  { key: "driver", label: "Driver", type: "select", options: drivers, value: m?.driver },
  { key: "type", label: "Connection", type: "select", options: [{ value: "network", label: "Network (Ethernet / Wi-Fi)" }, { value: "usb", label: "USB / Serial" }], value: m?.conn.type },
  { key: "host", label: "Host / IP", placeholder: "10.0.0.100", value: m?.conn.host, showIf: (v) => v.type === "network" },
  { key: "netport", label: "Port", type: "number", value: m?.conn.type === "network" ? m.conn.port : 23, showIf: (v) => v.type === "network" },
  { key: "serial", label: "Serial port", placeholder: "/dev/tty… or COM3", value: m?.conn.type === "usb" ? m.conn.serial : "", showIf: (v) => v.type === "usb" },
  { key: "baud", label: "Baud rate", type: "number", value: m?.conn.baud || 115200, showIf: (v) => v.type === "usb" },
  { key: "bedW", label: `Bed width (${state.units})`, type: "number", value: toDisp(m?.bedW || 600) },
  { key: "bedH", label: `Bed height (${state.units})`, type: "number", value: toDisp(m?.bedH || 400) },
  { key: "advanced", label: "Show advanced settings", type: "checkbox", value: false },
  { key: "maxFeed", label: "Max feed (mm/min)", type: "number", value: m?.maxFeed || 12000, showIf: (v) => v.advanced },
  { key: "flipX", label: "Flip X axis", type: "checkbox", value: m?.adv?.flipX || false, showIf: (v) => v.advanced },
  { key: "flipY", label: "Flip Y axis", type: "checkbox", value: m?.adv?.flipY ?? true, showIf: (v) => v.advanced },
  { key: "home", label: "Home / origin", type: "select", value: m?.adv?.home || "front-left", options: [{ value: "front-left", label: "Front-left" }, { value: "rear-left", label: "Rear-left" }, { value: "front-right", label: "Front-right" }], showIf: (v) => v.advanced },
];
const machineFrom = (v, id) => ({
  id, name: v.name, driver: v.driver,
  conn: v.type === "network" ? { type: "network", host: v.host, port: v.netport } : { type: "usb", serial: v.serial, baud: v.baud },
  bedW: toMm(v.bedW), bedH: toMm(v.bedH), maxFeed: Math.max(1, v.maxFeed || 12000), adv: { flipX: v.flipX, flipY: v.flipY, home: v.home },
});
async function addMachine() {
  const v = await openModal({ title: "Add machine", submitLabel: "Add", fields: machineFields(null) });
  if (!v || !v.name) return;
  machines.push(machineFrom(v, "u" + Date.now())); saveMachines(); refreshMachines(machines[machines.length - 1].id);
  toast("Machine added: " + v.name, "ok");
}
async function editMachine(m) {
  const v = await openModal({ title: "Edit machine", submitLabel: "Save", fields: machineFields(m) });
  if (!v || !v.name) return;
  Object.assign(m, machineFrom(v, m.id)); saveMachines(); refreshMachines(m.id);
  toast("Machine saved: " + m.name, "ok");
}
function connect() {
  const m = machine();
  const target = m.conn.type === "network" ? `${m.conn.host || "?"}:${m.conn.port || "?"}` : (m.conn.serial || "USB");
  toast(`(M2) Would connect to ${m.name} via ${m.conn.type} at ${target}.`, "info");
}

// --- materials --------------------------------------------------------------
const matFields = (m) => [
  { key: "name", label: "Name", value: m?.name, placeholder: "e.g. Plywood 3 mm" },
  { key: "cutP", label: "Cut power %", type: "number", value: m ? m.ops.Cut.power : 80 }, { key: "cutS", label: "Cut speed %", type: "number", min: 1, max: 100, value: m ? clampSpeedPct(m.ops.Cut.speed) : 20 },
  { key: "engP", label: "Engrave power %", type: "number", value: m ? m.ops.Engrave.power : 40 }, { key: "engS", label: "Engrave speed %", type: "number", min: 1, max: 100, value: m ? clampSpeedPct(m.ops.Engrave.speed) : 65 },
  { key: "scoP", label: "Score power %", type: "number", value: m ? m.ops.Score.power : 25 }, { key: "scoS", label: "Score speed %", type: "number", min: 1, max: 100, value: m ? clampSpeedPct(m.ops.Score.speed) : 35 },
  { key: "freq", label: "Frequency Hz", type: "number", value: m ? m.ops.Cut.freq : F },
];
const opsFrom = (v) => ({ Cut: { power: v.cutP, speed: clampSpeedPct(v.cutS), freq: v.freq }, Engrave: { power: v.engP, speed: clampSpeedPct(v.engS), freq: v.freq }, Score: { power: v.scoP, speed: clampSpeedPct(v.scoS), freq: v.freq } });
function refreshMaterialSelect() {
  $("material").innerHTML = materials.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
  $("material").value = state.materialId;
}
async function addMaterial() {
  const v = await openModal({ title: "New material", submitLabel: "Add", fields: matFields(null) });
  if (!v || !v.name) return;
  const m = { id: "u" + Date.now(), name: v.name, ops: opsFrom(v) };
  materials.push(m); saveMaterials(); state.materialId = m.id; refreshMaterialSelect(); applyMaterialToLayers();
  toast("Material added: " + v.name, "ok");
}
async function editMaterial(m) {
  const v = await openModal({ title: "Edit material", submitLabel: "Save", fields: matFields(m) });
  if (!v || !v.name) return;
  m.name = v.name; m.ops = opsFrom(v); saveMaterials(); refreshMaterialSelect();
  if (state.materialId === m.id) applyMaterialToLayers();
  toast("Material saved: " + m.name, "ok");
}

// --- generic library modal (materials / machines) --------------------------
function openLibrary({ title, addLabel, list, subtitle, onAdd, onEdit, onDelete }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const panel = document.createElement("div");
  panel.className = "modal panel";
  const render = () => {
    panel.innerHTML = `<div class="panel__header">${title}</div><div class="panel__body">
      <div class="mat-list">${list().map((m) => `
        <div class="mat-row"><div><div class="mat-name">${m.name}</div><div class="mat-sub">${subtitle(m)}</div></div>
          <span class="grow"></span>
          <button class="btn btn--ghost btn--sm" data-edit="${m.id}">Edit</button>
          <button class="btn btn--ghost btn--sm" data-del="${m.id}">Delete</button></div>`).join("")}</div>
      <div class="modal-actions"><button class="btn btn--secondary btn--sm" data-add>+ ${addLabel}</button>
        <button class="btn btn--primary btn--sm" data-close>Done</button></div></div>`;
  };
  panel.addEventListener("click", async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.close != null) return overlay.remove();
    if (t.dataset.add != null) { await onAdd(); render(); return; }
    if (t.dataset.edit) { await onEdit(list().find((x) => x.id === t.dataset.edit)); render(); return; }
    if (t.dataset.del) { onDelete(t.dataset.del); render(); }
  });
  render(); overlay.append(panel);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
}
const openMaterialLibrary = () => openLibrary({
  title: "Material library", addLabel: "Add material", list: () => materials,
  subtitle: (m) => `Cut ${m.ops.Cut.power}%/${m.ops.Cut.speed} · Eng ${m.ops.Engrave.power}%/${m.ops.Engrave.speed} · Score ${m.ops.Score.power}%/${m.ops.Score.speed}`,
  onAdd: addMaterial, onEdit: editMaterial,
  onDelete: (id) => { if (materials.length > 1) { materials = materials.filter((m) => m.id !== id); if (state.materialId === id) state.materialId = materials[0].id; saveMaterials(); refreshMaterialSelect(); } },
});
const openMachineLibrary = () => openLibrary({
  title: "Machines", addLabel: "Add machine", list: () => machines,
  subtitle: (m) => `${m.driver} · ${m.conn.type === "network" ? (m.conn.host || "net") + ":" + (m.conn.port || "") : "USB " + (m.conn.serial || "")} · ${Math.round(m.bedW)}×${Math.round(m.bedH)}mm · F${m.maxFeed || 12000}`,
  onAdd: addMachine, onEdit: editMachine,
  onDelete: (id) => { if (machines.length > 1) { machines = machines.filter((m) => m.id !== id); if (state.machineId === id) state.machineId = machines[0].id; saveMachines(); refreshMachines(state.machineId); } },
});

// --- export / import all settings (one shareable file) ---------------------
async function exportSettings() {
  const v = await openModal({
    title: "Export settings", submitLabel: "Export",
    fields: [
      { key: "machines", label: "Machines", type: "checkbox", value: true },
      { key: "materials", label: "Materials", type: "checkbox", value: true },
      { key: "prefs", label: "Preferences (units)", type: "checkbox", value: true },
    ],
  });
  if (!v) return;
  if (!v.machines && !v.materials && !v.prefs) return toast("Nothing selected to export.", "info");
  const payload = { app: "modCut", version: 1, exported: new Date().toISOString() };
  if (v.machines) payload.machines = machines;
  if (v.materials) payload.materials = materials;
  if (v.prefs) payload.prefs = { units: state.units };
  try {
    const path = await window.modcut.exportSettings(JSON.stringify(payload, null, 2), "modcut-settings.json");
    if (path) toast("Settings exported → " + path, "ok");
  } catch (e) { toast("Export failed: " + e.message, "err"); }
}
async function importSettings() {
  try {
    const text = await window.modcut.importSettings();
    if (!text) return;
    const p = JSON.parse(text);
    let n = 0;
    if (Array.isArray(p.machines) && p.machines.length) { machines = p.machines; state.machineId = machines[0].id; saveMachines(); refreshMachines(state.machineId); n++; }
    if (Array.isArray(p.materials) && p.materials.length) { materials = p.materials; state.materialId = materials[0].id; saveMaterials(); refreshMaterialSelect(); applyMaterialToLayers(); n++; }
    if (p.prefs && p.prefs.units) { setUnits(p.prefs.units); n++; }
    toast(n ? "Settings imported." : "No recognizable settings in that file.", n ? "ok" : "info");
  } catch (e) { toast("Import failed: " + e.message, "err"); }
}

async function openSettings() {
  const gu = state.gridUnit;
  const v = await openModal({
    title: "Preferences", submitLabel: "Save",
    fields: [
      { key: "units", label: "Display units", type: "select", value: state.units, options: [{ value: "mm", label: "Millimetres (mm)" }, { value: "cm", label: "Centimetres (cm)" }, { value: "in", label: "Inches (in)" }] },
      { key: "gridUnit", label: "Grid unit", type: "select", value: gu, options: [{ value: "mm", label: "mm" }, { value: "cm", label: "cm" }, { value: "in", label: "in" }] },
      { key: "gridX", label: "Grid spacing X", type: "number", value: +(state.gridXmm / UNIT[gu]).toFixed(3) },
      { key: "gridY", label: "Grid spacing Y", type: "number", value: +(state.gridYmm / UNIT[gu]).toFixed(3) },
    ],
  });
  if (!v) return;
  setUnits(v.units);
  state.gridUnit = v.gridUnit;
  state.gridXmm = Math.max(0.5, v.gridX * UNIT[v.gridUnit]);
  state.gridYmm = Math.max(0.5, v.gridY * UNIT[v.gridUnit]);
  localStorage.setItem("modcut_gridX", state.gridXmm);
  localStorage.setItem("modcut_gridY", state.gridYmm);
  localStorage.setItem("modcut_gridUnit", state.gridUnit);
  bed.setGrid(state.gridXmm, state.gridYmm);
}
function setUnits(u) { state.units = u; localStorage.setItem("modcut_units", u); $("units").value = u; refreshPos(); }

// --- panel toggle -----------------------------------------------------------
function togglePanel() {
  const w = $("workspace");
  w.classList.toggle("collapsed");
  $("togglePanel").textContent = w.classList.contains("collapsed") ? "⟨" : "⟩";
  setTimeout(bed.fit, 220);
}

// --- wire UI ----------------------------------------------------------------
$("newDoc").addEventListener("click", newDocument);
$("import").addEventListener("click", doImport);
$("zoomIn").addEventListener("click", bed.zoomIn);
$("zoomOut").addEventListener("click", bed.zoomOut);
$("zoomFit").addEventListener("click", bed.fit);
$("frame").addEventListener("click", frame);
$("connect").addEventListener("click", connect);
$("togglePanel").addEventListener("click", togglePanel);
let selWhole = true;
$("selMode").addEventListener("click", () => {
  selWhole = !selWhole;
  bed.setSelectionMode(selWhole ? "design" : "element");
  $("selMode").textContent = selWhole ? "Mark whole" : "Mark elements";
});

// draw tools (select / rectangle / ellipse / line)
const updateToolButtons = (tool) => [...$("tools").children].forEach((b) => b.classList.toggle("tool-on", b.dataset.tool === tool));
const selectTool = (tool) => { activeTool = tool; bed.setTool(tool); updateToolButtons(tool); refreshProps(); refreshPropsVisibility(); };
$("tools").addEventListener("click", (e) => { const b = e.target.closest("button[data-tool]"); if (b) selectTool(b.dataset.tool); });
bed.onToolReset(() => syncColorsAndLayers()); // after a draw: sync colours, keep the tool active
bed.onDrawSize((wMm, hMm, x, y) => {
  const el = $("drawsize");
  if (wMm == null) return el.classList.add("hidden");
  $("dsW").textContent = dispRaw(wMm); $("dsH").textContent = dispRaw(hMm);
  el.style.left = x + 16 + "px"; el.style.top = y + 16 + "px";
  el.classList.remove("hidden");
});
bed.onDrawClick(async (type) => {
  const v = await openModal({ title: `New ${type}`, submitLabel: "Add", fields: [
    { key: "w", label: `Width (${state.units})`, type: "number", value: toDisp(50) },
    { key: "h", label: `Height (${state.units})`, type: "number", value: toDisp(50) },
  ] });
  if (!v) return;
  bed.addShape(type, toMm(v.w), toMm(v.h));
  syncColorsAndLayers();
});
$("pathOrder").addEventListener("change", (e) => { bed.setPathOrder(e.target.value); markDirty(); });

function editAction(action) {
  const ok = ({
    copy: () => bed.copySelection(),
    paste: () => bed.pasteSelection(),
    "paste-in-place": () => bed.pasteSelection({ inPlace: true }),
    duplicate: () => bed.duplicateSelection(),
    "select-all": () => bed.selectAll(),
    delete: () => bed.deleteSelection(),
    group: () => bed.groupSelected(),
    ungroup: () => bed.ungroupSelected(),
    "move-up": () => bed.arrangeSelected("up"),
    "move-down": () => bed.arrangeSelected("down"),
    "move-to-top": () => bed.arrangeSelected("top"),
    "move-to-bottom": () => bed.arrangeSelected("bottom"),
    undo: () => { bed.undo(); syncColorsAndLayers(); return true; },
    redo: () => { bed.redo(); syncColorsAndLayers(); return true; },
  }[action] || (() => false))();
  if (ok && ["paste", "paste-in-place", "duplicate", "group", "ungroup", "delete"].includes(action)) syncColorsAndLayers();
  return ok;
}

// keyboard shortcuts (ignore while typing in a field)
window.addEventListener("keydown", (e) => {
  const t = document.activeElement && document.activeElement.tagName;
  if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
  const key = e.key.toLowerCase();
  const mod = e.metaKey || e.ctrlKey;
  if (mod) {
    const command =
      key === "o" ? "import" :
      key === "n" && !e.altKey ? "new" :
      key === "s" && e.shiftKey ? "save-document-as" :
      key === "s" ? "save-document" :
      key === "a" ? "select-all" :
      key === "c" ? "copy" :
      key === "v" && e.altKey && e.shiftKey ? "paste-in-place" :
      key === "v" ? "paste" :
      key === "d" ? "duplicate" :
      key === "g" && e.shiftKey ? "ungroup" :
      key === "g" ? "group" :
      key === "u" && e.shiftKey ? "move-to-top" :
      key === "u" ? "move-up" :
      key === "n" && e.altKey && e.shiftKey ? "move-to-bottom" :
      key === "n" && e.altKey ? "move-down" :
      key === "z" ? "undo" :
      key === "y" ? "redo" :
      null;
    if (command) {
      e.preventDefault();
      if (command === "import") doImport();
      else if (command === "new") newDocument();
      else if (command === "save-document") saveDocument(false);
      else if (command === "save-document-as") saveDocument(true);
      else editAction(command);
      return;
    }
  }
  if (key === "backspace" || key === "delete") {
    e.preventDefault();
    editAction("delete");
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const tool = { v: "select", a: "node", p: "pen", m: "rect", c: "ellipse", l: "line" }[key];
  if (tool) selectTool(tool);
});

// properties (color + stroke width) — for the selection, or defaults for new shapes
function updateSwatchSel(c) { [...$("swatches").children].forEach((b) => b.classList.toggle("on", b.dataset.c.toLowerCase() === String(c).toLowerCase())); }
function refreshProps() {
  const s = bed.getStyle();
  $("propColor").value = s.color; $("propHex").value = s.color;
  $("propWidth").value = (+s.width).toFixed(2);
  updateSwatchSel(s.color);
  refreshBitmapControls();
}
function applyProps() {
  const c = $("propColor").value, w = +$("propWidth").value || 0.5;
  bed.setDrawStyle(c, w);
  bed.applyStyle(c, w);
  updateSwatchSel(c);
  syncColorsAndLayers();
}
$("swatches").addEventListener("click", (e) => { const b = e.target.closest("button[data-c]"); if (!b) return; $("propColor").value = b.dataset.c; $("propHex").value = b.dataset.c; applyProps(); });
$("propColor").addEventListener("input", () => { $("propHex").value = $("propColor").value; applyProps(); });
$("propHex").addEventListener("change", () => {
  let v = $("propHex").value.trim();
  if (!/^#?[0-9a-fA-F]{6}$/.test(v)) return toast("Invalid hex color (use #rrggbb).", "err");
  if (v[0] !== "#") v = "#" + v;
  v = v.toLowerCase(); $("propHex").value = v; $("propColor").value = v; applyProps();
});
$("propWidth").addEventListener("change", applyProps);

const bitmapFields = {
  brightness: ["bmpBrightness", "bmpBrightnessNum"],
  contrast: ["bmpContrast", "bmpContrastNum"],
  threshold: ["bmpThreshold", "bmpThresholdNum"],
  gamma: ["bmpGamma", "bmpGammaNum"],
};
function setBitmapPair(key, value) {
  const [rangeId, numId] = bitmapFields[key];
  $(rangeId).value = value;
  $(numId).value = value;
}
function refreshBitmapControls() {
  const settings = bed.getRasterSettings();
  $("bitmapSec").classList.toggle("hidden", !settings);
  if (!settings) return;
  for (const key of Object.keys(bitmapFields)) setBitmapPair(key, settings[key]);
  $("bmpInvert").checked = settings.invert;
}
function applyBitmapValue(key, value) {
  const next = bed.updateRasterSettings({ [key]: Number(value) });
  if (next) setBitmapPair(key, next[key]);
}
for (const [key, ids] of Object.entries(bitmapFields)) {
  for (const id of ids) {
    const el = $(id);
    el.addEventListener("pointerdown", () => bed.beginRasterEdit());
    el.addEventListener("focus", () => bed.beginRasterEdit());
    el.addEventListener("input", () => applyBitmapValue(key, el.value));
    el.addEventListener("change", () => bed.endRasterEdit());
  }
}
$("bmpInvert").addEventListener("change", (e) => {
  bed.beginRasterEdit();
  bed.updateRasterSettings({ invert: e.target.checked });
  bed.endRasterEdit();
});
$("bmpReset").addEventListener("click", () => { bed.resetRasterSettings(); refreshBitmapControls(); });

let ctxMenu = null;
function closeContextMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
function openContextMenu(info) {
  closeContextMenu();
  if (!info.hasSelection) return;
  ctxMenu = document.createElement("div");
  ctxMenu.className = "ctx-menu";
  ctxMenu.innerHTML = `
    <button data-act="group">Group <kbd>⌘G</kbd></button>
    <button data-act="ungroup" ${info.canUngroup ? "" : "disabled"}>Ungroup <kbd>⇧⌘G</kbd></button>
    <div class="ctx-menu__label">Arrange</div>
    <button data-act="move-up">Move up <kbd>⌘U</kbd></button>
    <button data-act="move-down">Move down <kbd>⌥⌘N</kbd></button>
    <button data-act="move-to-top">Move to top <kbd>⇧⌘U</kbd></button>
    <button data-act="move-to-bottom">Move to bottom <kbd>⌥⇧⌘N</kbd></button>`;
  ctxMenu.style.left = Math.min(info.x, window.innerWidth - 196) + "px";
  ctxMenu.style.top = Math.min(info.y, window.innerHeight - 218) + "px";
  ctxMenu.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b || b.disabled) return;
    editAction(b.dataset.act);
    closeContextMenu();
  });
  document.body.append(ctxMenu);
}
bed.onContextMenu(openContextMenu);
document.addEventListener("pointerdown", (e) => { if (ctxMenu && !ctxMenu.contains(e.target)) closeContextMenu(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeContextMenu(); });
$("estimate").addEventListener("click", estimate);
$("simulate").addEventListener("click", startSimulate);
$("sendBtn").addEventListener("click", () => runJob("Send"));
$("addMaterial").addEventListener("click", addMaterial);
$("device").addEventListener("change", (e) => selectMachine(e.target.value));

// simulate controls
$("simPlay").addEventListener("click", () => {
  if (!simCtl) return startSimulate();
  if ($("simPlay").textContent === "↺") return startSimulate();
  $("simPlay").textContent = simCtl.toggle() ? "⏸" : "▶";
});
$("simSpeeds").addEventListener("click", (e) => { const b = e.target.closest("button[data-x]"); if (b) setSimSpeed(+b.dataset.x); });
$("simClose").addEventListener("click", stopSimulate);

// position controls
$("refdot").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-r]"); if (!b) return;
  state.refKey = b.dataset.r;
  [...e.currentTarget.children].forEach((c) => c.classList.toggle("on", c === b));
  refreshPos();
});
["posX", "posY"].forEach((id) => $(id).addEventListener("change", applyPos));
$("posW").addEventListener("change", () => { if ($("posProp").checked && posRatio) $("posH").value = +(+$("posW").value / posRatio).toFixed(2); applyPos(); });
$("posH").addEventListener("change", () => { if ($("posProp").checked && posRatio) $("posW").value = +(+$("posH").value * posRatio).toFixed(2); applyPos(); });
$("posA").addEventListener("change", () => bed.applyAngle(+$("posA").value || 0));

refreshMaterialSelect();
$("material").addEventListener("change", (e) => { state.materialId = e.target.value; applyMaterialToLayers(); markDirty(); });
$("units").value = state.units;
$("units").addEventListener("change", (e) => { setUnits(e.target.value); markDirty(); });

$("mapmode").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-mode]"); if (!b) return;
  state.mappingMode = b.dataset.mode;
  [...e.currentTarget.children].forEach((c) => c.classList.toggle("on", c === b));
  syncLayers();
  markDirty();
});

window.modcut.onMenu((cmd) => ({
  new: newDocument, import: doImport, "zoom-in": bed.zoomIn, "zoom-out": bed.zoomOut, "zoom-fit": bed.fit,
  "toggle-panel": togglePanel, frame, simulate: startSimulate, connect,
  undo: () => editAction("undo"), redo: () => editAction("redo"),
  copy: () => editAction("copy"), paste: () => editAction("paste"), "paste-in-place": () => editAction("paste-in-place"),
  duplicate: () => editAction("duplicate"), delete: () => editAction("delete"), "select-all": () => editAction("select-all"),
  group: () => editAction("group"), ungroup: () => editAction("ungroup"),
  "move-up": () => editAction("move-up"), "move-down": () => editAction("move-down"),
  "move-to-top": () => editAction("move-to-top"), "move-to-bottom": () => editAction("move-to-bottom"),
  "add-machine": addMachine, "manage-machines": openMachineLibrary,
  "add-material": addMaterial, materials: openMaterialLibrary,
  "save-document": () => saveDocument(false), "save-document-as": () => saveDocument(true),
  save: () => runJob("Save"), export: () => runJob("Export"), preferences: openSettings,
  "export-settings": exportSettings, "import-settings": importSettings,
  docs: () => window.open("../docs/index.html"),
  about: () => toast("modCut — modern laser control for Horten Folkeverksted.", "info"),
}[cmd]?.()));

// --- boot -------------------------------------------------------------------
initCollapsibleSections();
refreshMachines(state.machineId);
bed.setGrid(state.gridXmm, state.gridYmm);
refreshProps();
refreshPropsVisibility();
(async () => {
  try {
    const pong = await window.modcut.call("ping");
    $("conn").classList.add("ok");
    $("connText").textContent = "Connected · " + pong.driver;
    drivers = (await window.modcut.call("listDrivers")).drivers;
  } catch {
    $("conn").classList.add("err");
    $("connText").textContent = "Sidecar unavailable";
  }
})();
