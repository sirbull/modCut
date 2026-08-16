import { createBed } from "./bed.js";
import { prepareSVG } from "./svgimport.js";
import { dxfToSvg } from "./dxfimport.js";
import { hpglToSvg } from "./hpglimport.js";
import { pdfToArtwork } from "./pdfimport.js";
import { tiffToPng } from "./tiffimport.js";
import { OPERATIONS, canAssignRasterToOperation, distinctVectorColor, isOutputLayer, operationsForLayer } from "./layer-model.mjs";
import { RASTER_MODES, applyProcessProfile, combinedFocusOffset, normalizeProcessProfile, profilesForOperation } from "./process-profiles.mjs";
import { groupJobOperations, jobFilename } from "./job-split.mjs";
import { defaultMotionTiming, motionTimingForMachine } from "./motion-timing.mjs";
import { openModal, showMessageModal } from "./ui.js";
import { DOCUMENT_FORMATS, IMAGE_FORMATS, PDF_FORMATS, TEXT_FORMATS, TIFF_FORMATS } from "../electron/import-formats.mjs";

const $ = (id) => document.getElementById(id);
const OPS = OPERATIONS;
const DITHERS = RASTER_MODES;
const clampSpeedPct = (v) => Math.max(1, Math.min(100, Number(v) || 1));
const safeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const isEpilogDriver = (driver) => /^epilog\s+zing$/i.test(String(driver || ""));
const defaultNetworkPort = (driver) => isEpilogDriver(driver) ? 515 : 23;
const VECTOR_FILE_EXTENSIONS = new Set(TEXT_FORMATS);
const RASTER_FILE_EXTENSIONS = new Set([...IMAGE_FORMATS, ...TIFF_FORMATS, ...PDF_FORMATS]);
const PROJECT_FILE_EXTENSION = DOCUMENT_FORMATS[0];

// --- persisted stores (seeded from presets on first run, then fully editable) --
const F = 20000; // default beam frequency (Hz)
const OPERATION_DEFAULTS = Object.freeze({
  Cut: Object.freeze({ power: 100, speed: 50, freq: 500, zOffset: -1.5 }),
  Score: Object.freeze({ power: 15, speed: 100, freq: 500, zOffset: 3 }),
});
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
function loadProcessProfiles() {
  try {
    const saved = JSON.parse(localStorage.getItem("modcut_process_profiles"));
    return Array.isArray(saved) ? saved.map(normalizeProcessProfile).filter((profile) => profile.id) : [];
  } catch { return []; }
}
let processProfiles = loadProcessProfiles();
function normalizeMaterialSpeeds() {
  for (const m of materials) for (const op of OPS) if (m.ops?.[op]) {
    m.ops[op].speed = clampSpeedPct(m.ops[op].speed);
    m.ops[op].zOffset = Number.isFinite(Number(m.ops[op].zOffset)) ? Number(m.ops[op].zOffset) : 0;
  }
}
normalizeMaterialSpeeds();
function normalizeMachines() {
  for (const m of machines) {
    if (m.conn?.type === "network") {
      const hostWithPort = String(m.conn.host || "").trim().match(/^([^:]+):(\d+)$/);
      if (hostWithPort) {
        m.conn.host = hostWithPort[1];
        if (!m.conn.port || Number(m.conn.port) === 23) m.conn.port = Number(hostWithPort[2]);
      }
      if (/epilog.*zing|zing/i.test(m.name || "") && String(m.driver).toLowerCase() === "grbl" && Number(m.conn.port) === 515) {
        m.driver = "Epilog Zing";
      }
    }
    if (!m.maxFeed) m.maxFeed = 12000;
    m.zAxis = {
      enabled: !!m.zAxis?.enabled,
      min: Number.isFinite(Number(m.zAxis?.min)) ? Number(m.zAxis.min) : -10,
      max: Number.isFinite(Number(m.zAxis?.max)) ? Number(m.zAxis.max) : 10,
      feed: Math.max(1, Number(m.zAxis?.feed) || 300),
      globalOffset: m.zAxis?.enabled && Number.isFinite(Number(m.zAxis?.globalOffset)) ? Number(m.zAxis.globalOffset) : 0,
    };
  }
}
normalizeMachines();
const saveMaterials = () => localStorage.setItem("modcut_materials", JSON.stringify(materials));
const saveMachines = () => localStorage.setItem("modcut_machines", JSON.stringify(machines));
const saveProcessProfiles = () => localStorage.setItem("modcut_process_profiles", JSON.stringify(processProfiles));

const state = {
  machineId: machines[0].id, materialId: materials[0].id,
  mappingMode: "color", units: localStorage.getItem("modcut_units") || "cm",
  splitByOperation: localStorage.getItem("modcut_split_by_operation") === "true",
  refKey: "tl", colors: [], layers: [],
  gridXmm: +(localStorage.getItem("modcut_gridX") || 10),
  gridYmm: +(localStorage.getItem("modcut_gridY") || 10),
  gridUnit: localStorage.getItem("modcut_gridUnit") || "cm",
};
let drivers = ["Dummy"];
let machineStatus = { connected: false, running: false, dryRun: true, lastResult: "idle", progress: 0 };
let statusPollBusy = false;
let reportedResult = "idle";
let activeJobSequence = null;

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
function showAbout() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal panel about-modal" role="dialog" aria-modal="true" aria-labelledby="aboutTitle">
    <div class="panel__body">
      <img class="about-logo" src="../modCut_logo.svg" alt="modCut logo">
      <h2 class="about-title" id="aboutTitle">modCut</h2>
      <p class="about-copy">Modern laser control for Horten Folkeverksted.</p>
      <p class="about-meta">Horten Folkeverksted</p>
      <div class="modal-actions">
        <button class="btn btn--primary btn--sm" data-close>Close</button>
      </div>
    </div>
  </div>`;
  const close = () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
  function onKey(e) { if (e.key === "Escape") close(); }
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
  overlay.querySelector("[data-close]")?.focus();
}

// Consistent delayed tooltips. Native title bubbles are removed on first hover
// so every button uses the same one-second delay and visual treatment.
function initTooltips() {
  let timer = null, tooltip = null, target = null;
  const textFor = (element) => {
    if (!element.dataset.tooltip && element.hasAttribute("title")) {
      element.dataset.tooltip = element.getAttribute("title");
      element.removeAttribute("title");
    }
    return (element.dataset.tooltip || element.getAttribute("aria-label") || element.textContent || "").trim();
  };
  const hide = () => {
    clearTimeout(timer); timer = null;
    if (target) target.removeAttribute("aria-describedby");
    tooltip?.remove(); tooltip = null; target = null;
  };
  const show = (element) => {
    const label = textFor(element);
    if (!label || target !== element) return;
    tooltip = document.createElement("div");
    tooltip.className = "app-tooltip"; tooltip.id = "appTooltip"; tooltip.role = "tooltip";
    tooltip.textContent = label;
    document.body.append(tooltip);
    element.setAttribute("aria-describedby", tooltip.id);
    const anchor = element.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(innerWidth - box.width - 8, anchor.left + (anchor.width - box.width) / 2));
    const below = anchor.bottom + 9;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${below + box.height <= innerHeight - 8 ? below : anchor.top - box.height - 9}px`;
  };
  const schedule = (element, delay = 1000) => {
    hide(); target = element;
    if (!textFor(element)) { target = null; return; }
    timer = setTimeout(() => show(element), delay);
  };
  document.addEventListener("pointerover", (event) => {
    const element = event.target.closest("button,[data-tooltip]");
    if (!element || element.contains(event.relatedTarget)) return;
    schedule(element);
  });
  document.addEventListener("pointerout", (event) => {
    if (!target || target !== event.target.closest("button,[data-tooltip]") || target.contains(event.relatedTarget)) return;
    hide();
  });
  document.addEventListener("focusin", (event) => {
    const element = event.target.closest("button,[data-tooltip]");
    if (element) schedule(element, 350);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide, true);
  document.addEventListener("keydown", hide, true);
  window.addEventListener("scroll", hide, true);
}

const material = () => materials.find((m) => m.id === state.materialId) || materials[0];
const machine = () => machines.find((m) => m.id === state.machineId) || machines[0];
const materialDefaultsFor = (op) => {
  const d = { power: 50, speed: 50, freq: F, zOffset: 0, ...material().ops[op] };
  d.speed = clampSpeedPct(d.speed);
  return d;
};
const defaultsFor = (op) => ({ ...(OPERATION_DEFAULTS[op] || materialDefaultsFor(op)) });
const defaultUsesMaterial = (op) => !OPERATION_DEFAULTS[op];
const driverExt = (d) => (isEpilogDriver(d) ? ".prn" : /ruida/i.test(d) ? ".rd" : ".gcode");

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
bed.onSelection((n) => {
  selectedCount = n;
  $("sel").textContent = `${n} selected`;
  refreshProps();
  refreshPropsVisibility();
  void window.modcut.setImageEditorAvailable?.(!!bed.getSelectionInfo().singleRaster);
});
bed.onChange(() => { refreshPos(); scheduleQualityRefresh(); if (!restoringTab) markDirty(); });

let docPath = null;
let dirty = false;
let documentTabs = [];
let activeTabId = null;
let nextTabId = 1;
let restoringTab = false;
let recoveryTimer = null;
let closeGuardRunning = false;
const RECOVERY_VERSION = 1;
const RECOVERY_DELAY_MS = 350;
function pathBase(path) { return String(path || "").split(/[\\/]/).pop(); }
function activeTab() { return documentTabs.find((tab) => tab.id === activeTabId) || null; }
function setFileLabel(name) {
  const title = name || "Untitled";
  $("file").textContent = `${title}${dirty ? " *" : ""}`;
  const tab = activeTab();
  if (tab) { tab.title = title; tab.dirty = dirty; renderTabs(); }
}
function markDirty() { dirty = true; setFileLabel(docPath ? pathBase(docPath) : ($("file").textContent.replace(/\s\*$/, "") || "Untitled")); scheduleRecovery(); }
function markClean() { dirty = false; setFileLabel(docPath ? pathBase(docPath) : ($("file").textContent.replace(/\s\*$/, "") || "Untitled")); scheduleRecovery(); }

function renderTabs() {
  const host = $("tabItems");
  if (!host) return;
  host.replaceChildren();
  for (const tab of documentTabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `doc-tab${tab.id === activeTabId ? " is-active" : ""}`;
    button.dataset.tabId = tab.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab.id === activeTabId));
    button.title = tab.title || "Untitled";
    if (tab.dirty) {
      const dot = document.createElement("span");
      dot.className = "doc-tab__dirty";
      dot.title = "Unsaved changes";
      button.append(dot);
    }
    const title = document.createElement("span");
    title.className = "doc-tab__title";
    title.textContent = tab.title || "Untitled";
    const close = document.createElement("span");
    close.className = "doc-tab__close";
    close.dataset.closeTab = tab.id;
    close.setAttribute("role", "button");
    close.setAttribute("aria-label", `Close ${tab.title || "Untitled"}`);
    close.textContent = "×";
    button.append(title, close);
    button.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-tab]")) closeDocumentTab(tab.id);
      else switchDocumentTab(tab.id);
    });
    host.append(button);
  }
  host.querySelector(".doc-tab.is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function captureWorkspace() {
  return {
    bed: bed.exportSession(),
    docPath,
    dirty,
    title: $("file").textContent.replace(/\s\*$/, "") || "Untitled",
    filename: $("filename").value,
    mappingMode: state.mappingMode,
    layers: structuredClone(state.layers),
    units: state.units,
    machineId: state.machineId,
    materialId: state.materialId,
    gridXmm: state.gridXmm,
    gridYmm: state.gridYmm,
    gridUnit: state.gridUnit,
    refKey: state.refKey,
    selectWhole: selWhole,
    pathOrder: $("pathOrder").value,
  };
}

function captureActiveTab() {
  const tab = activeTab();
  if (!tab || restoringTab) return;
  bed.finishDrawing();
  tab.session = captureWorkspace();
  tab.title = tab.session.title;
  tab.dirty = tab.session.dirty;
}

function recoverySession(session) {
  if (!session) return null;
  return {
    ...session,
    bed: session.bed ? { ...session.bed, undo: [], redo: [] } : {},
  };
}

function recoveryPayload() {
  captureActiveTab();
  return {
    app: "modCut",
    recoveryVersion: RECOVERY_VERSION,
    savedAt: new Date().toISOString(),
    activeTabId,
    nextTabId,
    tabs: documentTabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      dirty: tab.dirty,
      session: recoverySession(tab.session),
    })),
  };
}

async function flushRecovery() {
  if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null; }
  if (!documentTabs.length) return;
  try {
    await window.modcut.writeRecovery(JSON.stringify(recoveryPayload()));
  } catch (error) {
    console.warn("Could not write recovery session", error);
  }
}

function scheduleRecovery() {
  if (!documentTabs.length || restoringTab || closeGuardRunning) return;
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => { recoveryTimer = null; void flushRecovery(); }, RECOVERY_DELAY_MS);
}

async function restoreRecoverySession() {
  try {
    const json = await window.modcut.readRecovery();
    if (!json) return false;
    const recovery = JSON.parse(json);
    if (recovery?.app !== "modCut" || recovery.recoveryVersion !== RECOVERY_VERSION || !Array.isArray(recovery.tabs) || !recovery.tabs.length) return false;
    const tabs = recovery.tabs.filter((tab) => tab?.id && tab.session).map((tab) => ({
      id: String(tab.id),
      title: tab.title || "Untitled",
      dirty: !!tab.dirty,
      session: tab.session,
    }));
    if (!tabs.length) return false;
    documentTabs = tabs;
    const requested = tabs.find((tab) => tab.id === String(recovery.activeTabId));
    activeTabId = (requested || tabs[0]).id;
    nextTabId = Math.max(Number(recovery.nextTabId) || 1, ...tabs.map((tab) => (Number(tab.id) || 0) + 1));
    restoreWorkspace(activeTab().session);
    toast(`Recovered ${tabs.length} project tab${tabs.length === 1 ? "" : "s"} from the previous session.`, "info");
    return true;
  } catch (error) {
    console.warn("Could not restore recovery session", error);
    return false;
  }
}

function restoreWorkspace(session) {
  if (!session) return;
  restoringTab = true;
  stopSimulate();
  closeContextMenu();
  docPath = session.docPath || null;
  dirty = !!session.dirty;
  state.mappingMode = session.mappingMode || "color";
  state.layers = structuredClone(session.layers || []);
  state.units = session.units || state.units;
  state.machineId = machines.some((item) => item.id === session.machineId) ? session.machineId : machines[0].id;
  state.materialId = materials.some((item) => item.id === session.materialId) ? session.materialId : materials[0].id;
  state.gridXmm = +session.gridXmm || 10;
  state.gridYmm = +session.gridYmm || 10;
  state.gridUnit = session.gridUnit || "cm";
  state.refKey = session.refKey || "tl";
  selWhole = !!session.selectWhole;
  $("filename").value = session.filename || "job";
  $("units").value = state.units;
  $("pathOrder").value = session.pathOrder || "optimize";
  bed.setPathOrder($("pathOrder").value);
  refreshMachines(state.machineId);
  refreshMaterialSelect();
  renderMachineStatus();
  bed.setGrid(state.gridXmm, state.gridYmm);
  bed.importSession(session.bed || {});
  bed.setSelectionMode(selWhole ? "design" : "element");
  $("selMode").textContent = selWhole ? "Mark whole" : "Mark elements";
  [...$("mapmode").children].forEach((item) => item.classList.toggle("on", item.dataset.mode === state.mappingMode));
  [...$("refdot").children].forEach((item) => item.classList.toggle("on", item.dataset.r === state.refKey));
  syncColorsAndLayers();
  setFileLabel(session.title || pathBase(docPath) || "Untitled");
  refreshPos();
  refreshProps();
  restoringTab = false;
  renderTabs();
}

function switchDocumentTab(id) {
  if (id === activeTabId) return;
  const target = documentTabs.find((tab) => tab.id === id);
  if (!target) return;
  captureActiveTab();
  activeTabId = id;
  restoreWorkspace(target.session);
  scheduleRecovery();
}

function switchRelativeTab(offset) {
  if (documentTabs.length < 2) return;
  const index = documentTabs.findIndex((tab) => tab.id === activeTabId);
  const next = (index + offset + documentTabs.length) % documentTabs.length;
  switchDocumentTab(documentTabs[next].id);
}

function documentPayload() {
  return {
    app: "modCut",
    version: 3,
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
  bed.finishDrawing();
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

function saveWorkDialog(tabName = null) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal panel" role="dialog" aria-modal="true" aria-labelledby="saveWorkTitle"><div class="panel__header" id="saveWorkTitle">Save work?</div>
      <div class="panel__body">
        <p class="hint" data-save-work-hint></p>
        <div class="modal-actions modal-actions--save-prompt">
          <button class="btn btn--neutral-outline btn--sm" data-x="discard">Don't Save</button>
          <button class="btn btn--neutral-outline btn--sm" data-x="cancel">Cancel</button>
          <button class="btn btn--primary btn--sm" data-x="save">Save</button>
        </div>
      </div></div>`;
    overlay.querySelector("[data-save-work-hint]").textContent = tabName
      ? `Save “${tabName}” before continuing.`
      : "Save the current document before continuing.";
    const close = (v) => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(v);
    };
    function onKey(e) { if (e.key === "Escape") close("cancel"); }
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) return close("cancel");
      const b = e.target.closest("button[data-x]");
      if (b) close(b.dataset.x);
    });
    document.addEventListener("keydown", onKey);
    document.body.append(overlay);
    overlay.querySelector('[data-x="save"]')?.focus();
  });
}

async function guardWorkBeforeContinue() {
  bed.finishDrawing();
  if (!dirty) return true;
  const choice = await saveWorkDialog(activeTab()?.title);
  if (choice === "save") return saveDocument(false);
  if (choice === "discard") return true;
  return false;
}

async function guardAllWorkBeforeWindowClose() {
  if (closeGuardRunning) return false;
  closeGuardRunning = true;
  if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null; }
  const originalTabId = activeTabId;
  try {
    captureActiveTab();
    for (const tab of documentTabs.filter((item) => item.dirty)) {
      if (tab.id !== activeTabId) switchDocumentTab(tab.id);
      const choice = await saveWorkDialog(tab.title);
      if (choice === "cancel") {
        if (originalTabId && originalTabId !== activeTabId) switchDocumentTab(originalTabId);
        return false;
      }
      if (choice === "save" && !(await saveDocument(false))) {
        if (originalTabId && originalTabId !== activeTabId) switchDocumentTab(originalTabId);
        return false;
      }
      captureActiveTab();
    }
    await window.modcut.clearRecovery();
    return true;
  } catch (error) {
    toast("Could not finish the close operation safely: " + error.message, "err");
    return false;
  } finally {
    closeGuardRunning = false;
  }
}

function applyDocument(p, path, name) {
  if (!p || p.app !== "modCut") throw new Error("Not a modCut document.");
  bed.importDesign(p.design || "");
  docPath = path || null;
  if (p.filename) $("filename").value = p.filename;
  if (p.units) setUnits(p.units);
  if (p.mappingMode) state.mappingMode = p.mappingMode;
  if (Array.isArray(p.layers)) state.layers = p.layers;
  if (p.machineId && machines.some((item) => item.id === p.machineId)) state.machineId = p.machineId;
  if (p.materialId && materials.some((item) => item.id === p.materialId)) state.materialId = p.materialId;
  refreshMachines(state.machineId);
  refreshMaterialSelect();
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

// --- new / import / add -----------------------------------------------------
function resetWorkspace({ filename = "job", label = "Untitled" } = {}) {
  bed.clear();
  bed.resetHistory();
  docPath = null;
  state.colors = [];
  state.layers = [];
  $("filename").value = filename;
  setFileLabel(label);
  markClean();
  syncLayers();
  refreshPos();
}

async function prepareArtwork(f) {
  if (VECTOR_FILE_EXTENSIONS.has(f.ext)) {
    const svgText = f.ext === "dxf" ? dxfToSvg(f.text)
      : ["plt", "hpgl"].includes(f.ext) ? hpglToSvg(f.text)
        : f.text;
    return { kind: "vector", ...prepareSVG(svgText) };
  }
  if (["pdf", "ai"].includes(f.ext)) {
    const imported = await pdfToArtwork(f.dataUrl);
    if (!imported.vectorPathCount && !imported.rasterDataUrl) throw new Error("The first PDF page contains no supported visible artwork.");
    const source = f.ext === "ai" ? "Illustrator" : "PDF";
    const pageSuffix = imported.pageCount > 1 ? ` Only page 1 of ${imported.pageCount} was imported.` : "";
    let warning;
    if (imported.vectorPathCount && imported.rasterDataUrl) {
      warning = `${source}: imported ${imported.vectorPathCount} editable vector path${imported.vectorPathCount === 1 ? "" : "s"}; text, images and unsupported effects remain a ${imported.effectiveDpi} DPI raster engraving.${pageSuffix}`;
    } else if (imported.vectorPathCount) {
      warning = `${source}: imported ${imported.vectorPathCount} editable vector path${imported.vectorPathCount === 1 ? "" : "s"}.${pageSuffix}`;
    } else {
      warning = `${source} imported as a ${imported.effectiveDpi} DPI raster engraving.${pageSuffix} Convert Illustrator artwork or text to outlines for editable paths.`;
    }
    return {
      kind: "pdf",
      vector: imported.svgText ? prepareSVG(imported.svgText) : null,
      rasterDataUrl: imported.rasterDataUrl,
      widthMm: imported.widthMm,
      warning,
    };
  }
  if (["tif", "tiff"].includes(f.ext)) {
    const rendered = tiffToPng(f.dataUrl);
    return { kind: "image", ...rendered, warning: rendered.frameCount > 1 ? `Imported the first of ${rendered.frameCount} TIFF pages.` : null };
  }
  if (f.dataUrl) return { kind: "image", dataUrl: f.dataUrl };
  return null;
}

function formatLabel(formats) {
  return formats.map((format) => format.toUpperCase()).join(", ");
}

async function showImportIssue(f) {
  if (f.reason === "ai-not-pdf-compatible") {
    await showMessageModal({
      title: "Illustrator file is not PDF-compatible",
      paragraphs: [
        `modCut cannot open “${f.name}” because the AI file does not contain PDF-compatible data.`,
        "For editable laser paths, SVG is the recommended format.",
      ],
      sections: [
        {
          title: "Save a compatible AI file in Illustrator",
          ordered: true,
          items: [
            "Open the file in Adobe Illustrator and choose File → Save As.",
            "Choose Adobe Illustrator (AI), then enable Create PDF Compatible File in Illustrator Options.",
            "Save the file and import the new copy in modCut.",
          ],
        },
        {
          title: "Better for cutting",
          items: ["Choose File → Export → Export As → SVG. Convert text to outlines before exporting when fonts must travel with the design."],
        },
      ],
    });
    return;
  }
  if (f.reason === "document-not-addable") {
    await showMessageModal({
      title: "Open project files with Import",
      paragraphs: ["A .modcut file is a complete project and cannot be added as artwork. Choose Import to open it in the active project tab."],
    });
    return;
  }
  const invalidPdf = f.reason === "invalid-pdf";
  await showMessageModal({
    title: invalidPdf ? "Invalid PDF file" : "Unsupported file format",
    paragraphs: [invalidPdf
      ? `“${f.name}” does not contain valid PDF data.`
      : `modCut cannot import ${f.ext ? `.${f.ext}` : "this file type"} from “${f.name}”.`],
    sections: [
      {
        title: "Supported vector files",
        items: [formatLabel(TEXT_FORMATS)],
      },
      {
        title: "Supported image files",
        items: [formatLabel([...IMAGE_FORMATS, ...TIFF_FORMATS])],
      },
      {
        title: "Documents",
        items: [`PDF (editable solid vectors plus raster fallback), AI (PDF-compatible), ${formatLabel(DOCUMENT_FORMATS)} projects`],
      },
    ],
  });
}

async function placeArtwork(prepared) {
  if (prepared.kind === "vector") {
    bed.loadSVG(prepared.node, prepared.widthMm, prepared.heightMm, prepared.viewBox);
    return;
  }
  if (prepared.kind === "pdf") {
    if (prepared.vector) {
      bed.loadSVG(prepared.vector.node, prepared.vector.widthMm, prepared.vector.heightMm, prepared.vector.viewBox);
    }
    if (prepared.rasterDataUrl) await bed.loadImage(prepared.rasterDataUrl, prepared.widthMm || null);
    state.mappingMode = "color";
    [...$("mapmode").children].forEach((c) => c.classList.toggle("on", c.dataset.mode === "color"));
    return;
  }
  await bed.loadImage(prepared.dataUrl, prepared.widthMm || null);
  state.mappingMode = "color";
  [...$("mapmode").children].forEach((c) => c.classList.toggle("on", c.dataset.mode === "color"));
}

async function addArtworkFiles(files) {
  bed.finishDrawing();
  const wasEmpty = !bed.getDesign();
  let added = 0;
  for (const f of files) {
    if (f.kind === "unsupported") {
      await showImportIssue(f);
      continue;
    }
    try {
      const prepared = await prepareArtwork(f);
      if (!prepared) throw new Error(`.${f.ext} files cannot be added yet.`);
      await placeArtwork(prepared);
      if (prepared.warning) toast(`${f.name}: ${prepared.warning}`, "info");
      added++;
    } catch (e) {
      toast(`Could not add ${f.name}: ${e.message}`, "err");
    }
  }
  if (!added) return 0;
  if (wasEmpty) {
    $("filename").value = files[0].name.replace(/\.[^.]+$/, "");
    setFileLabel(files.length === 1 ? files[0].name : "Untitled");
  }
  syncColorsAndLayers();
  markDirty();
  return added;
}

async function doImport() {
  if (!(await guardWorkBeforeContinue())) return;
  let f;
  try {
    f = await window.modcut.openImport({ multiple: false, allowDocuments: true });
  } catch (e) {
    toast("Import failed: " + e.message, "err");
    return;
  }
  if (!f) return;
  if (f.kind === "unsupported") {
    await showImportIssue(f);
    return;
  }
  let documentData = null;
  let prepared = null;
  try {
    if (f.kind === "document") documentData = JSON.parse(f.text);
    else prepared = await prepareArtwork(f);
  } catch (e) {
    toast("Import failed: " + e.message, "err");
    return;
  }
  if (!documentData && !prepared) {
    toast(`.${f.ext} import is coming in a later version (M3).`, "info");
    return;
  }
  try {
    if (documentData) {
      applyDocument(documentData, f.path, f.name);
      toast("Document opened.", "ok");
      return;
    }
    const baseName = f.name.replace(/\.[^.]+$/, "");
    resetWorkspace({ filename: baseName, label: f.name });
    await placeArtwork(prepared);
    syncColorsAndLayers();
    markDirty();
    toast(prepared.warning || (prepared.kind === "image"
      ? "Image imported as grayscale raster engraving."
      : `Imported ${f.name} into a new workspace.`), prepared.warning ? "info" : "ok");
  } catch (e) {
    toast("Import failed: " + e.message, "err");
  }
}

async function addFiles() {
  let files;
  try {
    files = await window.modcut.openImport({ multiple: true, allowDocuments: false });
  } catch (e) {
    toast("Add failed: " + e.message, "err");
    return;
  }
  if (!files?.length) return;
  const added = await addArtworkFiles(files);
  if (!added) return;
  toast(`Added ${added} file${added === 1 ? "" : "s"} to the project.`, "ok");
}

function openDocumentInNewTab(documentData, path, name) {
  captureActiveTab();
  const previousTabId = activeTabId;
  const tab = { id: String(nextTabId++), title: name || "Untitled", dirty: false, session: null };
  documentTabs.push(tab);
  activeTabId = tab.id;
  try {
    resetWorkspace();
    applyDocument(documentData, path, name);
    captureActiveTab();
    renderTabs();
    scheduleRecovery();
    return true;
  } catch (error) {
    documentTabs = documentTabs.filter((item) => item.id !== tab.id);
    activeTabId = previousTabId;
    restoreWorkspace(activeTab()?.session);
    throw error;
  }
}

function droppedFileExtension(file) {
  const match = String(file?.name || "").toLowerCase().match(/\.([^.]+)$/);
  return match ? match[1] : "";
}

async function droppedFilePayload(file) {
  const ext = droppedFileExtension(file);
  let path = null;
  try { path = window.modcut.getPathForFile?.(file) || null; } catch {}
  const payload = { name: file.name, path, ext };
  if (ext === PROJECT_FILE_EXTENSION) return { ...payload, kind: "document", text: await file.text() };
  if (VECTOR_FILE_EXTENSIONS.has(ext)) {
    const text = ext === "svgz"
      ? await new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text()
      : await file.text();
    return { ...payload, text };
  }
  if (RASTER_FILE_EXTENSIONS.has(ext)) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result), { once: true });
      reader.addEventListener("error", () => reject(reader.error || new Error("The image could not be read.")), { once: true });
      reader.readAsDataURL(file);
    });
    return { ...payload, dataUrl };
  }
  return null;
}

async function handleDroppedFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  const targetTabId = activeTabId;
  const documents = [];
  const artwork = [];
  let unsupported = 0;
  for (const file of files) {
    try {
      const payload = await droppedFilePayload(file);
      if (!payload) { unsupported++; continue; }
      if (payload.kind === "document") {
        const data = JSON.parse(payload.text);
        if (data?.app !== "modCut") throw new Error("Not a modCut document.");
        documents.push({ payload, data });
      } else artwork.push(payload);
    } catch (error) {
      toast(`Could not read ${file.name}: ${error.message}`, "err");
    }
  }

  let opened = 0;
  for (const { payload, data } of documents) {
    try {
      if (openDocumentInNewTab(data, payload.path, payload.name)) opened++;
    } catch (error) {
      toast(`Could not open ${payload.name}: ${error.message}`, "err");
    }
  }

  let added = 0;
  if (artwork.length) {
    if (targetTabId && activeTabId !== targetTabId) switchDocumentTab(targetTabId);
    added = await addArtworkFiles(artwork);
  }
  if (opened) toast(`Opened ${opened} project${opened === 1 ? "" : "s"} in new tab${opened === 1 ? "" : "s"}.`, "ok");
  if (added) toast(`Added ${added} file${added === 1 ? "" : "s"} to the active project.`, "ok");
  if (unsupported) toast(`${unsupported} unsupported file${unsupported === 1 ? " was" : "s were"} skipped.`, "info");
}

function initFileDrop() {
  const overlay = $("dropOverlay");
  let dragDepth = 0;
  const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes("Files");
  const hide = () => { dragDepth = 0; overlay.classList.add("hidden"); overlay.setAttribute("aria-hidden", "true"); };
  window.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth++;
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
  });
  window.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (event) => {
    if (!dragDepth) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) hide();
  });
  window.addEventListener("dragend", hide);
  window.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    const files = event.dataTransfer.files;
    hide();
    void handleDroppedFiles(files);
  });
}

function newDocument() {
  captureActiveTab();
  const tab = { id: String(nextTabId++), title: "Untitled", dirty: false, session: null };
  documentTabs.push(tab);
  activeTabId = tab.id;
  resetWorkspace();
  captureActiveTab();
  renderTabs();
  scheduleRecovery();
  toast("New project tab.", "ok");
}

async function closeDocumentTab(id = activeTabId) {
  if (!id) return;
  if (id !== activeTabId) switchDocumentTab(id);
  if (!(await guardWorkBeforeContinue())) return;
  const index = documentTabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  documentTabs.splice(index, 1);
  if (!documentTabs.length) {
    activeTabId = null;
    window.close();
    return;
  }
  const target = documentTabs[Math.min(index, documentTabs.length - 1)];
  activeTabId = target.id;
  restoreWorkspace(target.session);
  renderTabs();
  scheduleRecovery();
}

function initializeDocumentTabs() {
  setFileLabel("Untitled");
  const tab = { id: String(nextTabId++), title: "Untitled", dirty: false, session: null };
  documentTabs = [tab];
  activeTabId = tab.id;
  captureActiveTab();
  renderTabs();
}

// --- layers -----------------------------------------------------------------
const newLayer = (color, op, raster = false, key = null) => ({
  key, color, raster, op: raster ? "Engrave" : op, output: true,
  dpi: isEpilogDriver(machine().driver) ? 500 : 300,
  dither: raster ? "Grayscale" : "Jarvis", bottomUp: true, engraveMode: "auto",
  ...defaultsFor(raster ? "Engrave" : op),
  profileId: defaultUsesMaterial(raster ? "Engrave" : op) ? "material" : null,
});
// Re-read colors from the bed (import + drawn shapes) and reconcile the layer list,
// preserving settings for colors that still exist.
function syncColorsAndLayers() {
  state.colors = bed.getColors();
  if (state.colors.some((color) => color.raster) && ["cut", "score"].includes(state.mappingMode)) {
    state.mappingMode = "color";
    [...$("mapmode").children].forEach((c) => c.classList.toggle("on", c.dataset.mode === "color"));
  }
  syncLayers();
}
function syncRasterModes() {
  bed.setRasterModes(state.layers.filter((layer) => layer.raster).map((layer) => ({
    key: layer.key, color: layer.color,
    mode: layer.dither || "Grayscale",
  })));
}
function syncLayers() {
  if (state.mappingMode === "color") {
    const prev = new Map(state.layers.filter((l) => l.key).map((l) => [l.key, l]));
    const colorsByKey = new Map(state.colors.map((color) => [color.key, color]));
    const orderedColors = [
      ...state.layers.map((layer) => colorsByKey.get(layer.key)).filter(Boolean),
      ...state.colors.filter((color) => !prev.has(color.key)),
    ];
    state.layers = orderedColors.map((c) => {
      const candidates = state.layers.filter((layer) => layer.color?.toLowerCase() === c.color.toLowerCase());
      const existing = prev.get(c.key) || candidates.find((layer) => Boolean(layer.raster) === Boolean(c.raster));
      if (!existing) return newLayer(c.color, c.raster ? "Engrave" : "Cut", c.raster, c.key);
      const layer = { ...existing, key: c.key, color: c.color, raster: c.raster };
      if (c.raster && !canAssignRasterToOperation(layer.op)) layer.op = "Engrave";
      if (c.raster && !layer.dither) layer.dither = "Grayscale";
      return layer;
    });
  } else {
    const op = state.mappingMode[0].toUpperCase() + state.mappingMode.slice(1);
    const hasRaster = state.colors.some((color) => color.raster);
    state.layers = state.colors.length ? [state.layers[0] && state.layers[0].color === null ? state.layers[0] : newLayer(null, op, hasRaster && op === "Engrave")] : [];
  }
  syncRasterModes();
  renderLayers();
}
function applyMaterialToLayers() {
  for (const layer of state.layers) {
    Object.assign(layer, materialDefaultsFor(layer.op));
    layer.profileId = "material";
  }
  renderLayers();
}
function renderLayers() {
  const host = $("layers");
  host.innerHTML = "";
  $("layersHint").style.display = state.layers.length ? "none" : "";
  state.layers.forEach((layer, index) => host.append(layerRow(layer, index)));
  bed.setLayerVisibility(state.layers.map((layer) => ({
    key: state.mappingMode === "color" ? layer.key : null,
    color: state.mappingMode === "color" ? layer.color : null,
    visible: isOutputLayer(layer),
  })));
}
function moveLayer(index, offset) {
  const target = index + offset;
  if (index < 0 || index >= state.layers.length || target < 0 || target >= state.layers.length) return;
  const [layer] = state.layers.splice(index, 1);
  state.layers.splice(target, 0, layer);
  renderLayers();
  markDirty();
}
let qualityRefreshTimer = null;
function qualityForLayer(layer) {
  return bed.outputQuality([{
    key: state.mappingMode === "color" ? layer.key : null,
    color: state.mappingMode === "color" ? layer.color : null,
    op: layer.op, dpi: layer.dpi, dither: layer.dither, bottomUp: layer.bottomUp,
  }]);
}
function qualitySummary(report) {
  if (report.blocked) return `Output blocked: ${report.problems.join(" ")}`;
  const parts = [];
  if (report.rasters.length) {
    const largest = report.rasters.reduce((best, item) => item.samples > best.samples ? item : best, report.rasters[0]);
    parts.push(`Raster output ${largest.columns.toLocaleString("en-US")} × ${largest.rows.toLocaleString("en-US")} samples at ${largest.effectiveDpi} DPI${report.rasters.length > 1 ? ` (${report.rasters.length} images)` : ""}`);
  }
  if (report.filledScans.length) {
    const lines = report.filledScans.reduce((sum, item) => sum + item.rows, 0);
    parts.push(`${lines.toLocaleString("en-US")} filled-vector scan lines at requested DPI`);
  }
  if (report.vectorPoints) parts.push(`vector tolerance ${report.vectorStepMm} mm · about ${Math.ceil(report.vectorPoints).toLocaleString("en-US")} points`);
  return parts.length ? parts.join(" · ") : "No output geometry on this layer.";
}
function updateLayerQuality(row, layer) {
  const note = row.querySelector("[data-quality]");
  if (!note) return;
  const report = qualityForLayer(layer);
  note.textContent = qualitySummary(report);
  note.classList.toggle("is-warning", report.blocked);
}
function refreshLayerQuality() {
  [...$("layers").children].forEach((row, index) => { if (state.layers[index]) updateLayerQuality(row, state.layers[index]); });
}
function scheduleQualityRefresh() {
  if (qualityRefreshTimer) clearTimeout(qualityRefreshTimer);
  qualityRefreshTimer = setTimeout(() => { qualityRefreshTimer = null; refreshLayerQuality(); }, 120);
}
function layerFocusSummary(layer) {
  if (isEpilogDriver(machine().driver)) {
    const layerOffset = Number(layer.zOffset) || 0;
    return `Epilog software focus ${layerOffset} mm · allowed -12.6…12.6`;
  }
  if (!machine().zAxis?.enabled) return "Enable Z axis in the machine profile to adjust focus.";
  const machineOffset = Number(machine().zAxis.globalOffset) || 0;
  const layerOffset = Number(layer.zOffset) || 0;
  return `Machine ${machineOffset} mm + layer ${layerOffset} mm = Z ${combinedFocusOffset(machineOffset, layerOffset)} mm · allowed ${machine().zAxis.min}…${machine().zAxis.max}`;
}
function layerRow(l, layerIndex) {
  l.speed = clampSpeedPct(l.speed);
  if (l.freq == null) l.freq = isEpilogDriver(machine().driver) ? 5000 : F;
  l.zOffset = Number.isFinite(Number(l.zOffset)) ? Number(l.zOffset) : 0;
  const row = document.createElement("div");
  row.className = `clayer${l.raster ? " clayer--raster" : ""}${isOutputLayer(l) ? "" : " clayer--hidden"}`;
  row.dataset.layerKey = l.key || "all";
  const byColor = state.mappingMode === "color";
  if (l.raster && !canAssignRasterToOperation(l.op)) l.op = "Engrave";
  const engrave = l.op === "Engrave";
  if (!l.engraveMode || !["auto", "native", "vector"].includes(l.engraveMode)) l.engraveMode = "auto";
  const epilogRasterDpis = [100, 200, 250, 400, 500, 1000];
  if (engrave && isEpilogDriver(machine().driver) && !epilogRasterDpis.includes(Number(l.dpi))) {
    l.dpi = epilogRasterDpis.reduce((best, dpi) => Math.abs(dpi - Number(l.dpi || 500)) < Math.abs(best - Number(l.dpi || 500)) ? dpi : best, 500);
  }
  const ignored = l.op === "Ignore";
  const layerOps = operationsForLayer(l.raster);
  const profiles = profilesForOperation(processProfiles, l.op);
  const selectedProfile = profiles.some((profile) => profile.id === l.profileId)
    ? l.profileId : l.profileId === "material" ? "material" : "custom";
  const profileOptions = [
    `<option value="material" ${selectedProfile === "material" ? "selected" : ""}>${safeHtml(material().name)}</option>`,
    ...profiles.map((profile) => `<option value="${safeHtml(profile.id)}" ${selectedProfile === profile.id ? "selected" : ""}>${safeHtml(profile.name)}</option>`),
    `<option value="custom" ${selectedProfile === "custom" ? "selected" : ""}>Custom settings</option>`,
  ].join("");
  const zEnabled = !!machine().zAxis?.enabled || isEpilogDriver(machine().driver);
  row.innerHTML = `
    <div class="clayer__top">
      <span class="clayer__number" title="Job order">${layerIndex + 1}</span>
      <span class="clayer__sw" style="background:${l.color || "linear-gradient(135deg,#888,#ccc)"}"></span>
      <span class="clayer__kind">${l.raster ? "Raster" : "Vector"}</span>
      ${byColor
        ? `<select class="select clayer__op">${layerOps.map((o) => `<option ${o === l.op ? "selected" : ""}>${o}</option>`).join("")}</select>`
        : `<strong class="clayer__op">All shapes → ${l.op}</strong>`}
      <span class="clayer__order" aria-label="Change layer order">
        <button type="button" data-move-layer="up" title="Move layer up — run earlier" ${layerIndex === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-move-layer="down" title="Move layer down — run later" ${layerIndex === state.layers.length - 1 ? "disabled" : ""}>↓</button>
      </span>
      ${ignored ? `<span class="clayer__ignored">Ignored</span>` : `<button class="toggle" aria-checked="${l.output}" title="Show and include this layer"></button>`}
    </div>
    ${ignored ? `<p class="clayer__note">This layer is kept in the design but is not sent to the laser.</p>` : `
    <div class="clayer__profile">
      <label><span>Process profile</span><select class="select" data-profile>${profileOptions}</select></label>
      <button class="btn btn--ghost btn--sm" data-save-profile title="Save these settings as a reusable ${safeHtml(l.op)} profile">Save profile…</button>
    </div>
    <div class="clayer__grid">
      <div><label>Power %</label><input class="input" type="number" min="0" max="100" value="${l.power}" data-k="power"></div>
      <div><label>Speed %</label><input class="input" type="number" min="1" max="100" value="${l.speed}" data-k="speed"></div>
      <div><label>${isEpilogDriver(machine().driver) ? "Frequency (100–5000)" : "Freq Hz"}</label><input class="input" type="number" step="1" min="${isEpilogDriver(machine().driver) ? 100 : 0}" ${isEpilogDriver(machine().driver) ? "max=\"5000\"" : ""} value="${l.freq}" data-k="freq"></div>
    </div>
    <div class="clayer__grid two">
      <div><label title="Layer-specific focus adjustment, added to the machine's global Z offset.">Focus offset (mm)</label><input class="input" type="number" step="0.1" value="${l.zOffset}" data-k="zOffset" ${zEnabled ? "" : "disabled"}></div>
      <p class="clayer__z-hint">${safeHtml(layerFocusSummary(l))}</p>
    </div>
    ${engrave ? `
    <div class="clayer__grid two">
      <div><label>Engraving motion</label><select class="select" data-k="engraveMode">
        <option value="auto" ${l.engraveMode === "auto" ? "selected" : ""}>Auto (recommended)</option>
        <option value="native" ${l.engraveMode === "native" ? "selected" : ""} ${isEpilogDriver(machine().driver) ? "" : "disabled"}>Native raster — whole layer</option>
        <option value="vector" ${l.engraveMode === "vector" ? "selected" : ""}>Vector scan — separate paths</option>
      </select></div>
      <p class="clayer__z-hint">${isEpilogDriver(machine().driver)
        ? "Native raster lets Epilog accelerate outside the artwork and scan the complete layer efficiently. Auto uses it where possible."
        : "Auto uses vector scanning on this machine. Native raster is available for Epilog output."}</p>
    </div>
    <div class="clayer__grid two">
      <div><label>DPI${isEpilogDriver(machine().driver) ? " (Epilog-supported)" : " (1–1000)"}</label>${isEpilogDriver(machine().driver)
        ? `<select class="select" data-k="dpi">${epilogRasterDpis.map((dpi) => `<option value="${dpi}" ${dpi === Number(l.dpi) ? "selected" : ""}>${dpi}</option>`).join("")}</select>`
        : `<input class="input" type="number" min="1" max="1000" value="${l.dpi}" data-k="dpi">`}</div>
      <div><label>Raster mode</label><select class="select" data-k="dither">${DITHERS.map((d) => `<option ${d === l.dither ? "selected" : ""}>${d}</option>`).join("")}</select></div>
    </div>
    <label class="clayer__chk"><input type="checkbox" ${l.bottomUp ? "checked" : ""} data-k="bottomUp"> Engrave bottom → top (less soot)</label>` : ""}
    <p class="clayer__note" data-quality></p>`}`;

  updateLayerQuality(row, l);

  row.querySelector('[data-move-layer="up"]')?.addEventListener("click", () => moveLayer(layerIndex, -1));
  row.querySelector('[data-move-layer="down"]')?.addEventListener("click", () => moveLayer(layerIndex, 1));

  const op = row.querySelector("select.clayer__op");
  if (op) op.addEventListener("change", () => {
    l.op = op.value;
    if (l.op !== "Ignore") {
      Object.assign(l, defaultsFor(l.op));
      l.profileId = defaultUsesMaterial(l.op) ? "material" : null;
    }
    renderLayers(); markDirty();
  });
  row.querySelector("[data-profile]")?.addEventListener("change", (event) => {
    if (event.target.value === "material") {
      Object.assign(l, materialDefaultsFor(l.op));
      l.profileId = "material";
    } else if (event.target.value === "custom") l.profileId = null;
    else {
      const profile = processProfiles.find((item) => item.id === event.target.value);
      if (profile) applyProcessProfile(l, profile);
    }
    renderLayers(); markDirty();
  });
  row.querySelector("[data-save-profile]")?.addEventListener("click", () => saveLayerAsProcessProfile(l));
  row.querySelector(".toggle")?.addEventListener("click", () => {
    l.output = !l.output;
    renderLayers();
    markDirty();
  });
  row.querySelectorAll("[data-k]").forEach((el) => {
    const k = el.dataset.k;
    if (el.type === "checkbox") el.addEventListener("change", () => { l[k] = el.checked; markDirty(); });
    else if (el.tagName === "SELECT") el.addEventListener("change", () => {
      l[k] = k === "dpi" ? Number(el.value) : el.value;
      if (k === "dither") { syncRasterModes(); refreshBitmapControls(); }
      markDirty();
    });
    else el.addEventListener("input", () => {
      l[k] = k === "speed"
        ? clampSpeedPct(el.value)
        : k === "freq" && el.value === "" ? "" : Number(el.value);
      l.profileId = null;
      const profileSelect = row.querySelector("[data-profile]");
      if (profileSelect) profileSelect.value = "custom";
      if (k === "zOffset") row.querySelector(".clayer__z-hint").textContent = layerFocusSummary(l);
      updateLayerQuality(row, l); markDirty();
    });
  });
  return row;
}

// --- run + estimate ---------------------------------------------------------
const activeLayers = () => state.layers.filter(isOutputLayer);
const effectiveEngraveMode = (layer) => isEpilogDriver(machine().driver) ? (layer.engraveMode || "auto") : "vector";
const jobOps = () => activeLayers().map((l) => ({ key: state.mappingMode === "color" ? l.key : null, op: l.op, color: l.color, power: l.power, speed: clampSpeedPct(l.speed), freq: l.freq, zOffset: Number(l.zOffset) || 0, ...(l.op === "Engrave" ? { dpi: l.dpi, dither: l.dither, bottomUp: l.bottomUp, engraveMode: effectiveEngraveMode(l) } : {}) }));
const machineLimits = () => ({ bedWidth: machine().bedW || 600, bedHeight: machine().bedH || 400, maxFeed: machine().maxFeed || 12000 });
const connectionMatchesMachine = () => !machineStatus.connected || machineStatus.connectedMachineId === state.machineId;
function invalidFrequencyMessage(ops) {
  for (const op of ops) {
    const value = op.freq;
    const frequency = Number(value);
    const layerName = op.color ? `${op.color.toUpperCase()} ${op.op}` : op.op;
    if (value === "" || value == null || !Number.isFinite(frequency)) return `Frequency is required for ${layerName}.`;
    if (!Number.isInteger(frequency)) return `Frequency must be a whole number for ${layerName}.`;
    if (isEpilogDriver(machine().driver) && (frequency < 100 || frequency > 5000)) return `Frequency for ${layerName} must be between 100 and 5000.`;
    if (!isEpilogDriver(machine().driver) && frequency < 0) return `Frequency for ${layerName} cannot be negative.`;
  }
  return null;
}
const jobWait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function waitForCurrentJob() {
  while (true) {
    await jobWait(150);
    machineStatus = await window.modcut.call("status");
    reportedResult = machineStatus.lastResult;
    renderMachineStatus();
    if (machineStatus.running) continue;
    if (machineStatus.lastResult === "completed") return machineStatus;
    if (machineStatus.lastResult === "cancelled" || machineStatus.lastResult === "cancelling") {
      throw new Error("The job sequence was cancelled.");
    }
    throw new Error(machineStatus.lastError || "The laser did not complete the job.");
  }
}
async function runJob(label) {
  if (!bed.getDesign()) return toast("Nothing imported yet.", "info");
  if (!machineStatus.connected) return toast("Connect to the machine or dry-run first.", "info");
  if (!connectionMatchesMachine()) return toast(`This project targets ${machine().name}, but the app is connected to ${machineStatus.connectedMachineName || "another machine"}. Disconnect and reconnect before running.`, "err");
  const ops = jobOps();
  if (!ops.length) return toast("No active layers to run.", "info");
  const frequencyError = invalidFrequencyMessage(ops);
  if (frequencyError) return toast(`Job blocked: ${frequencyError}`, "err");
  const base = ($("filename").value.trim() || "job").replace(/\.[^.]+$/, "");
  const extension = driverExt(machine().driver);
  try {
    const epilog = isEpilogDriver(machine().driver);
    const groups = groupJobOperations(ops, state.splitByOperation);
    const jobs = [];
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      const quality = bed.outputQuality(group.ops);
      if (quality.blocked) return toast("Job blocked: " + quality.problems.join(" "), "err");
      const built = await bed.buildGcodeJob(group.ops, {
        maxFeed: machine().maxFeed || 12000,
        zAxis: machine().zAxis,
        softwareFocus: epilog,
      });
      jobs.push({
        ...group,
        built,
        filename: jobFilename(base, extension, group.operation, index, groups.length),
      });
    }
    const layerOffsets = [...new Set(ops.map((op) => Number(op.zOffset) || 0))];
    const focusPositions = [...new Set(layerOffsets.map((offset) => combinedFocusOffset(machine().zAxis?.globalOffset, offset)))];
    const fileSummary = jobs.length > 1 ? `Separate files, in queue order:\n${jobs.map((job) => `• ${job.filename}`).join("\n")}\n\n` : "";
    const confirmed = machineStatus.dryRun || window.confirm(
      `Start ${jobs.length > 1 ? `${jobs.length} REAL laser jobs` : "REAL laser job"} on ${machine().name}?\n\n` +
      fileSummary +
      (epilog ? `Epilog software focus offsets: ${layerOffsets.join(", ")} mm.\n\n` :
        machine().zAxis?.enabled ? `Machine global Z offset: ${machine().zAxis.globalOffset || 0} mm. Layer focus offsets: ${layerOffsets.join(", ")} mm. Resulting Z positions: ${focusPositions.join(", ")} mm.\n\n` : "") +
      "Confirm material, focus, ventilation, clear work area and that the lid/interlocks are ready."
    );
    if (!confirmed) return;
    activeJobSequence = { index: 0, total: jobs.length };
    renderMachineStatus();
    let totalMoves = 0;
    for (let index = 0; index < jobs.length; index++) {
      const job = jobs[index];
      activeJobSequence.index = index + 1;
      const r = await window.modcut.call("startJob", {
        machineId: state.machineId, machine: machine().name, driver: machine().driver, material: state.materialId,
        mappingMode: state.mappingMode, filename: job.filename, ops: job.ops,
        gcodeLines: job.built.lines, laserSegments: job.built.laserSegments,
        confirmed, ...machineLimits(),
      });
      totalMoves += r.motionCount;
      reportedResult = "running";
      machineStatus = { ...machineStatus, running: true, progress: 0, lastResult: "running", jobName: job.filename };
      renderMachineStatus();
      toast(`${label} started ${jobs.length > 1 ? `${index + 1}/${jobs.length}: ` : ""}${job.filename}${r.dryRun ? " (dry run)" : ""}.`, "ok");
      await waitForCurrentJob();
    }
    const delivery = machineStatus.delivery;
    reportedResult = "completed";
    activeJobSequence = null;
    renderMachineStatus();
    toast(jobs.length > 1
      ? `${jobs.length} separate files ${delivery === "epilog-lpd" ? "uploaded to the Epilog queue" : "completed"} in order (${totalMoves} moves).`
      : delivery === "epilog-lpd" ? `${jobs[0].filename} uploaded to the Epilog queue.` : `${jobs[0].filename} completed successfully.`, "ok");
  } catch (e) {
    activeJobSequence = null;
    renderMachineStatus();
    toast(`${label} failed: ${e.message}`, "err");
  }
}
async function frame() {
  const d = bed.getDesign();
  if (!d) return toast("Nothing to frame.", "info");
  if (!machineStatus.connected) return toast("Connect to the machine or dry-run first.", "info");
  if (!connectionMatchesMachine()) return toast(`Reconnect to ${machine().name} before framing this project.`, "err");
  try {
    const r = await window.modcut.call("frameJob", {
      machineId: state.machineId, minX: d.xMm, minY: d.yMm, maxX: d.xMm + d.wMm, maxY: d.yMm + d.hMm,
      ...machineLimits(),
    });
    reportedResult = "running";
    toast(`Framing ${dispNum(d.wMm)} × ${dispNum(d.hMm)} ${state.units}; beam is forced OFF${r.dryRun ? " (dry run)" : ""}.`, "info");
    await pollMachineStatus();
  } catch (e) { toast("Frame failed: " + e.message, "err"); }
}
function estimate() {
  if (!bed.getDesign()) return ($("estimateOut").textContent = "");
  const sec = bed.estimateTime(simSpecs(), motionTimingForMachine(machine()));
  const h = Math.floor(sec / 3600);
  const m = Math.floor(sec / 60);
  $("estimateOut").textContent = "~ " + (h ? `${h}h ${m % 60}m` : m ? `${m}m ${Math.round(sec % 60)}s` : `${Math.round(sec)}s`);
}

// --- simulate ---------------------------------------------------------------
let simCtl = null;
let simBuildPending = false;
let simBuildVersion = 0;
const simSpecs = () => activeLayers().map((l) => ({ key: state.mappingMode === "color" ? l.key : null, color: state.mappingMode === "color" ? l.color : null, op: l.op, speed: l.speed, power: l.power, zOffset: Number(l.zOffset) || 0, dpi: l.dpi, dither: l.dither, bottomUp: l.bottomUp, engraveMode: effectiveEngraveMode(l) }));
async function startSimulate() {
  if (simBuildPending) return;
  if (!bed.getDesign()) return toast("Import a design first.", "info");
  const specs = simSpecs();
  if (!specs.length) return toast("No active layers to simulate.", "info");
  simBuildPending = true;
  const buildVersion = ++simBuildVersion;
  try {
    const epilog = isEpilogDriver(machine().driver);
    const groups = groupJobOperations(specs, state.splitByOperation);
    const programs = [];
    for (const group of groups) {
      const built = await bed.buildGcodeJob(group.ops, {
        maxFeed: machine().maxFeed || 12000,
        zAxis: machine().zAxis,
        softwareFocus: epilog,
      });
      if (buildVersion !== simBuildVersion) return;
      // `lines` is precisely the GRBL program passed to startJob. Native
      // drivers have no G-code; their serialized laserSegments are precisely
      // the payload passed to the native machine-job builder.
      programs.push(built);
    }
    if (buildVersion !== simBuildVersion) return;
    simCtl = bed.startSimProgram(programs, motionTimingForMachine(machine()));
    if (!simCtl) return toast("No cuttable machine movements found.", "err");
    simCtl.onProgress((p) => { $("simProg").textContent = Math.round(p * 100) + "%"; if (p >= 1) $("simPlay").textContent = "▶"; });
    $("simbar").classList.remove("hidden");
    $("simPlay").textContent = "⏸";
    $("simProg").textContent = "0%";
    setSimSpeed(1);
    toast("Simulating the generated machine program — red dot follows the beam.", "info");
  } catch (error) {
    toast("Simulation could not build the machine program: " + error.message, "err");
  } finally {
    simBuildPending = false;
  }
}
function stopSimulate() { simBuildVersion++; if (simCtl) { simCtl.stop(); simCtl = null; } $("simbar").classList.add("hidden"); }
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
  renderLayers();
}
const motionFieldSync = (key, displayScale = 1) => (values, previous, current) => {
  if (!previous || (previous.driver === values.driver && previous.maxFeed === values.maxFeed)) return undefined;
  const oldValue = defaultMotionTiming(previous.driver, previous.maxFeed)[key] * displayScale;
  if (current && Math.abs(Number(current) - oldValue) > 0.0001) return undefined;
  return +(defaultMotionTiming(values.driver, values.maxFeed)[key] * displayScale).toFixed(3);
};
const machineFields = (m) => {
  const timing = motionTimingForMachine(m || { driver: drivers[0], maxFeed: 12000 });
  return [
  { key: "name", label: "Name", value: m?.name, placeholder: "e.g. Workshop laser", required: true },
  { key: "driver", label: "Driver", type: "select", options: drivers, value: m?.driver },
  { key: "type", label: "Connection", type: "select", options: [{ value: "network", label: "Network (Ethernet / Wi-Fi)" }, { value: "usb", label: "USB / Serial" }], value: m?.conn.type },
  { key: "host", label: "Host / IP", placeholder: "192.168.1.50 or laser.local", value: m?.conn.host, required: true, showIf: (v) => v.type === "network" },
  {
    key: "netport", label: "Port (Epilog: 515 · GRBL: usually 23)", type: "number",
    min: 1, max: 65535, step: 1, required: true,
    value: m?.conn.type === "network" ? (m.conn.port || defaultNetworkPort(m.driver)) : defaultNetworkPort(m?.driver),
    showIf: (v) => v.type === "network",
    sync: (values, previous, current) => {
      if (!previous || previous.driver === values.driver) return undefined;
      const oldDefault = defaultNetworkPort(previous.driver);
      return !current || Number(current) === oldDefault ? defaultNetworkPort(values.driver) : undefined;
    },
  },
  { key: "serial", label: "Serial port", placeholder: "/dev/tty… or COM3", value: m?.conn.type === "usb" ? m.conn.serial : "", showIf: (v) => v.type === "usb" },
  { key: "baud", label: "Baud rate", type: "number", min: 1, step: 1, value: m?.conn.baud || 115200, showIf: (v) => v.type === "usb" },
  { key: "bedW", label: `Bed width (${state.units})`, type: "number", min: 1, step: 0.01, required: true, value: toDisp(m?.bedW || 600) },
  { key: "bedH", label: `Bed height (${state.units})`, type: "number", min: 1, step: 0.01, required: true, value: toDisp(m?.bedH || 400) },
  { key: "advanced", label: "Show advanced settings", type: "checkbox", value: false },
  { key: "maxFeed", label: "Max feed (mm/min)", type: "number", value: m?.maxFeed || 12000, showIf: (v) => v.advanced },
  { key: "vectorSpeedMmS", label: "Timing: vector speed at 100% (mm/s)", type: "number", min: 0.1, step: 0.1, value: timing.vectorSpeedMmS, showIf: (v) => v.advanced, sync: motionFieldSync("vectorSpeedMmS") },
  { key: "travelSpeedMmS", label: "Timing: laser-off travel speed (mm/s)", type: "number", min: 0.1, step: 0.1, value: timing.travelSpeedMmS, showIf: (v) => v.advanced, sync: motionFieldSync("travelSpeedMmS") },
  { key: "vectorAccelerationMmS2", label: "Timing: vector acceleration (mm/s²)", type: "number", min: 0.1, step: 1, value: timing.vectorAccelerationMmS2, showIf: (v) => v.advanced, sync: motionFieldSync("vectorAccelerationMmS2") },
  { key: "rasterSpeedMmS", label: "Timing: raster speed at 100% (mm/s)", type: "number", min: 0.1, step: 1, value: timing.rasterSpeedMmS, showIf: (v) => v.advanced, sync: motionFieldSync("rasterSpeedMmS") },
  { key: "rasterLineDelayMs", label: "Timing: raster turnaround per line (ms)", type: "number", min: 0, step: 1, value: +(timing.rasterLineDelayS * 1000).toFixed(1), showIf: (v) => v.advanced, sync: motionFieldSync("rasterLineDelayS", 1000) },
  { key: "zEnabled", label: "Enable controlled Z-axis offsets", type: "checkbox", value: !!m?.zAxis?.enabled, showIf: (v) => v.advanced && !isEpilogDriver(v.driver) },
  { key: "zMin", label: "Minimum Z offset (mm, must include 0)", type: "number", step: 0.1, value: m?.zAxis?.min ?? -10, showIf: (v) => v.advanced && v.zEnabled && !isEpilogDriver(v.driver) },
  { key: "zMax", label: "Maximum Z offset (mm, must include 0)", type: "number", step: 0.1, value: m?.zAxis?.max ?? 10, showIf: (v) => v.advanced && v.zEnabled && !isEpilogDriver(v.driver) },
  { key: "zFeed", label: "Maximum Z feed (mm/min)", type: "number", min: 1, step: 1, value: m?.zAxis?.feed || 300, showIf: (v) => v.advanced && v.zEnabled && !isEpilogDriver(v.driver) },
  { key: "zGlobal", label: "Global Z offset / focus calibration (mm)", type: "number", step: 0.1, value: m?.zAxis?.globalOffset ?? 0, showIf: (v) => v.advanced && v.zEnabled && !isEpilogDriver(v.driver) },
  { key: "connectTimeoutMs", label: "Network connect / handshake timeout (ms)", type: "number", min: 250, max: 30000, step: 250, value: m?.conn.connectTimeoutMs || 3000, showIf: (v) => v.advanced && v.type === "network" },
  { key: "responseTimeoutMs", label: "GRBL command response timeout (ms)", type: "number", min: 1000, max: 120000, step: 1000, value: m?.conn.responseTimeoutMs || 30000, showIf: (v) => v.advanced && v.type === "network" },
  { key: "flipX", label: "Flip X axis", type: "checkbox", value: m?.adv?.flipX || false, showIf: (v) => v.advanced },
  { key: "flipY", label: "Flip Y axis", type: "checkbox", value: m?.adv?.flipY ?? true, showIf: (v) => v.advanced },
  { key: "home", label: "Home / origin", type: "select", value: m?.adv?.home || "front-left", options: [{ value: "front-left", label: "Front-left" }, { value: "rear-left", label: "Rear-left" }, { value: "front-right", label: "Front-right" }], showIf: (v) => v.advanced },
  ];
};
const machineFrom = (v, id) => {
  const defaults = defaultMotionTiming(v.driver, v.maxFeed);
  return {
    id, name: v.name.trim(), driver: v.driver,
    conn: v.type === "network"
      ? { type: "network", host: v.host.trim(), port: Math.round(v.netport), connectTimeoutMs: v.connectTimeoutMs || 3000, responseTimeoutMs: v.responseTimeoutMs || 30000 }
      : { type: "usb", serial: v.serial?.trim() || "", baud: v.baud },
    bedW: toMm(v.bedW), bedH: toMm(v.bedH), maxFeed: Math.max(1, v.maxFeed || 12000),
    motionTiming: {
      ...defaults,
      vectorSpeedMmS: Math.max(0.1, Number(v.vectorSpeedMmS) || defaults.vectorSpeedMmS),
      travelSpeedMmS: Math.max(0.1, Number(v.travelSpeedMmS) || defaults.travelSpeedMmS),
      vectorAccelerationMmS2: Math.max(0.1, Number(v.vectorAccelerationMmS2) || defaults.vectorAccelerationMmS2),
      rasterSpeedMmS: Math.max(0.1, Number(v.rasterSpeedMmS) || defaults.rasterSpeedMmS),
      rasterLineDelayS: Math.max(0, Number(v.rasterLineDelayMs) / 1000 || 0),
    },
    zAxis: { enabled: !isEpilogDriver(v.driver) && !!v.zEnabled, min: Number(v.zMin), max: Number(v.zMax), feed: Math.max(1, Number(v.zFeed) || 300), globalOffset: !isEpilogDriver(v.driver) && v.zEnabled ? Number(v.zGlobal) || 0 : 0 },
    adv: { flipX: v.flipX, flipY: v.flipY, home: v.home },
  };
};
function validZAxisForm(values) {
  if (!values.zEnabled) return true;
  if (!Number.isFinite(values.zMin) || !Number.isFinite(values.zMax) || values.zMin >= values.zMax || values.zMin > 0 || values.zMax < 0) {
    toast("Z range must have a minimum below the maximum and include Z=0.", "err");
    return false;
  }
  if (!Number.isFinite(values.zGlobal) || values.zGlobal < values.zMin || values.zGlobal > values.zMax) {
    toast("The machine's global Z offset must be inside the configured Z range.", "err");
    return false;
  }
  return true;
}
async function addMachine() {
  const v = await openModal({ title: "Add machine", submitLabel: "Add", fields: machineFields(null) });
  if (!v || !v.name || !validZAxisForm(v)) return;
  machines.push(machineFrom(v, "u" + Date.now())); saveMachines(); refreshMachines(machines[machines.length - 1].id);
  toast("Machine added: " + v.name, "ok");
}
async function editMachine(m) {
  const v = await openModal({ title: "Edit machine", submitLabel: "Save", fields: machineFields(m) });
  if (!v || !v.name || !validZAxisForm(v)) return;
  const reconnectRequired = machineStatus.connected && machineStatus.connectedMachineId === m.id;
  if (reconnectRequired) {
    if (machineStatus.running) return toast("Stop the active job before changing the connected machine profile.", "err");
    try {
      machineStatus = await window.modcut.call("disconnect");
      renderMachineStatus();
    } catch (error) {
      return toast("Could not disconnect before changing the machine profile: " + error.message, "err");
    }
  }
  Object.assign(m, machineFrom(v, m.id)); saveMachines(); refreshMachines(m.id);
  toast("Machine saved: " + m.name + (reconnectRequired ? ". Reconnect to use the updated Z/focus calibration." : ""), "ok");
}
async function connect() {
  const selected = machine();
  if (selected.driver !== "Dummy" && selected.conn.type === "network") {
    if (!selected.conn.host?.trim()) return toast("Enter the laser hostname or IP address in Machine settings.", "err");
    const port = Number(selected.conn.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return toast("Network port must be between 1 and 65535.", "err");
  }
  try {
    if (machineStatus.connected) {
      machineStatus = await window.modcut.call("disconnect");
      renderMachineStatus();
      toast("Machine disconnected.", "info");
      return;
    }
    const dryRun = $("dryRun").checked;
    machineStatus = { ...machineStatus, connecting: true, lastError: "" };
    renderMachineStatus();
    machineStatus = await window.modcut.call("connect", { machine: machine(), dryRun });
    reportedResult = machineStatus.lastResult;
    renderMachineStatus();
    const identity = machineStatus.deviceIdentity ? ` (${machineStatus.deviceIdentity})` : "";
    toast(machineStatus.dryRun ? "Dry-run connection ready — no hardware commands will be sent." :
      isEpilogDriver(selected.driver) ? `Verified Epilog LPD service at ${machineStatus.target}.` : `Verified GRBL at ${machineStatus.target}${identity}.`, "ok");
  } catch (e) {
    machineStatus = { ...machineStatus, connected: false, connecting: false, running: false, lastError: e.message };
    renderMachineStatus();
    toast("Connection failed: " + e.message, "err");
  }
}
function renderMachineStatus() {
  const conn = $("conn");
  conn.classList.toggle("ok", machineStatus.connected);
  conn.classList.toggle("err", !!machineStatus.lastError && !machineStatus.connected);
  if (machineStatus.connecting) {
    $("connText").textContent = "Connecting and verifying GRBL …";
  } else if (machineStatus.connected) {
    const identity = machineStatus.deviceIdentity?.match(/^<([^|>]+)/)?.[1] || machineStatus.deviceIdentity;
    $("connText").textContent = !connectionMatchesMachine()
      ? `Connected to ${machineStatus.connectedMachineName || "another machine"} · reconnect for ${machine().name}`
      : machineStatus.dryRun ? "Ready · dry run" : `Connected · ${machineStatus.target}${identity ? ` · ${identity}` : ""}`;
  } else {
    $("connText").textContent = machineStatus.lastError ? "Connection error" : "Not connected";
  }
  $("connect").textContent = machineStatus.connecting ? "Connecting…" : machineStatus.connected ? "Disconnect" : "Connect";
  $("connect").disabled = !!machineStatus.connecting;
  $("dryRun").disabled = machineStatus.connected;
  $("device").disabled = machineStatus.connected;
  $("sendBtn").disabled = !machineStatus.connected || machineStatus.running || !!activeJobSequence || !connectionMatchesMachine();
  $("sendBtn").textContent = (machineStatus.connected ? machineStatus.dryRun : $("dryRun").checked) ? "Run dry-run" : "Send job";
  $("frame").disabled = !machineStatus.connected || machineStatus.running || !!activeJobSequence || !connectionMatchesMachine();
  $("stopBtn").classList.toggle("hidden", !machineStatus.running || machineStatus.canEmergencyStop === false);
  $("jobState").textContent = machineStatus.running
    ? `${activeJobSequence ? `${activeJobSequence.index}/${activeJobSequence.total} · ` : ""}${Math.round((machineStatus.progress || 0) * 100)}%`
    : activeJobSequence ? `${activeJobSequence.index}/${activeJobSequence.total}` : "";
}
async function pollMachineStatus() {
  if (statusPollBusy) return;
  statusPollBusy = true;
  try {
    machineStatus = await window.modcut.call("status");
    renderMachineStatus();
    if (!machineStatus.running && machineStatus.lastResult !== reportedResult) {
      reportedResult = machineStatus.lastResult;
      if (!activeJobSequence) {
        if (machineStatus.lastResult === "completed") toast(machineStatus.delivery === "epilog-lpd" ? "Job uploaded to the Epilog queue. Start it from the laser control panel." : "Job completed successfully.", "ok");
        else if (machineStatus.lastResult === "cancelled") toast("Job cancelled.", "info");
        else if (machineStatus.lastResult === "failed") toast("Job failed: " + machineStatus.lastError, "err");
      }
    }
  } catch (e) {
    machineStatus = { ...machineStatus, connected: false, running: false, lastError: e.message };
    renderMachineStatus();
  } finally { statusPollBusy = false; }
}
async function stopJob() {
  try {
    machineStatus = await window.modcut.call("cancelJob");
    renderMachineStatus();
    toast("Emergency stop sent; waiting for the job to stop.", "info");
  } catch (e) { toast("Could not stop job: " + e.message, "err"); }
}

// --- materials --------------------------------------------------------------
const matFields = (m) => [
  { key: "name", label: "Name", value: m?.name, placeholder: "e.g. Plywood 3 mm" },
  { key: "cutP", label: "Cut power %", type: "number", value: m ? m.ops.Cut.power : 80 }, { key: "cutS", label: "Cut speed %", type: "number", min: 1, max: 100, value: m ? clampSpeedPct(m.ops.Cut.speed) : 20 },
  { key: "cutZ", label: "Cut focus offset (mm)", type: "number", step: 0.1, value: m?.ops.Cut.zOffset || 0 },
  { key: "engP", label: "Engrave power %", type: "number", value: m ? m.ops.Engrave.power : 40 }, { key: "engS", label: "Engrave speed %", type: "number", min: 1, max: 100, value: m ? clampSpeedPct(m.ops.Engrave.speed) : 65 },
  { key: "engZ", label: "Engrave focus offset (mm)", type: "number", step: 0.1, value: m?.ops.Engrave.zOffset || 0 },
  { key: "scoP", label: "Score power %", type: "number", value: m ? m.ops.Score.power : 25 }, { key: "scoS", label: "Score speed %", type: "number", min: 1, max: 100, value: m ? clampSpeedPct(m.ops.Score.speed) : 35 },
  { key: "scoZ", label: "Score focus offset (mm)", type: "number", step: 0.1, value: m?.ops.Score.zOffset || 0 },
  { key: "freq", label: "Frequency Hz", type: "number", value: m ? m.ops.Cut.freq : F },
];
const opsFrom = (v) => ({
  Cut: { power: v.cutP, speed: clampSpeedPct(v.cutS), freq: v.freq, zOffset: v.cutZ || 0 },
  Engrave: { power: v.engP, speed: clampSpeedPct(v.engS), freq: v.freq, zOffset: v.engZ || 0 },
  Score: { power: v.scoP, speed: clampSpeedPct(v.scoS), freq: v.freq, zOffset: v.scoZ || 0 },
});
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

const processProfileFields = (profile = {}) => [
  { key: "name", label: "Profile name", value: profile.name, placeholder: "e.g. Photo engraving — birch", required: true },
  { key: "op", label: "Operation", type: "select", options: ["Cut", "Engrave", "Score"], value: profile.op || "Cut" },
  { key: "power", label: "Power %", type: "number", min: 0, max: 100, value: profile.power ?? 50 },
  { key: "speed", label: "Speed %", type: "number", min: 1, max: 100, value: profile.speed ?? 50 },
  { key: "freq", label: "Frequency Hz", type: "number", min: 0, value: profile.freq ?? F },
  { key: "zOffset", label: "Layer focus offset (mm)", type: "number", step: 0.1, value: profile.zOffset ?? 0 },
  { key: "dpi", label: "Engrave DPI", type: "number", min: 1, max: 1000, value: profile.dpi ?? 300, showIf: (v) => v.op === "Engrave" },
  { key: "dither", label: "Raster mode", type: "select", options: DITHERS, value: profile.dither || "Grayscale", showIf: (v) => v.op === "Engrave" },
  { key: "bottomUp", label: "Engrave bottom → top", type: "checkbox", value: profile.bottomUp !== false, showIf: (v) => v.op === "Engrave" },
  { key: "engraveMode", label: "Engraving motion", type: "select", options: [
    { value: "auto", label: "Auto (recommended)" },
    { value: "native", label: "Native raster — whole layer" },
    { value: "vector", label: "Vector scan — separate paths" },
  ], value: profile.engraveMode || "auto", showIf: (v) => v.op === "Engrave" },
];
const processProfileFrom = (values, id) => normalizeProcessProfile({ id, ...values });
async function addProcessProfile(seed = {}) {
  const values = await openModal({ title: "New process profile", submitLabel: "Add profile", fields: processProfileFields(seed) });
  if (!values?.name) return null;
  const profile = processProfileFrom(values, "p" + Date.now());
  processProfiles.push(profile);
  saveProcessProfiles();
  toast("Process profile added: " + profile.name, "ok");
  return profile;
}
async function saveLayerAsProcessProfile(layer) {
  const profile = await addProcessProfile({ ...layer, name: `${material().name} — ${layer.op}` });
  if (!profile) return;
  applyProcessProfile(layer, profile);
  renderLayers();
  markDirty();
}
async function editProcessProfile(profile) {
  if (!profile) return;
  const values = await openModal({ title: "Edit process profile", submitLabel: "Save", fields: processProfileFields(profile) });
  if (!values?.name) return;
  Object.assign(profile, processProfileFrom(values, profile.id));
  for (const layer of state.layers.filter((item) => item.profileId === profile.id)) {
    if (layer.raster && profile.op !== "Engrave") layer.profileId = null;
    else applyProcessProfile(layer, profile);
  }
  saveProcessProfiles();
  renderLayers();
  markDirty();
  toast("Process profile saved: " + profile.name, "ok");
}

// --- generic library modal (materials / machines) --------------------------
function openLibrary({ title, addLabel, list, subtitle, onAdd, onEdit, onDelete }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const panel = document.createElement("div");
  panel.className = "modal panel";
  const render = () => {
    panel.innerHTML = `<div class="panel__header">${safeHtml(title)}</div><div class="panel__body">
      <div class="mat-list">${list().map((m) => `
        <div class="mat-row"><div><div class="mat-name">${safeHtml(m.name)}</div><div class="mat-sub">${safeHtml(subtitle(m))}</div></div>
          <span class="grow"></span>
          <button class="btn btn--ghost btn--sm" data-edit="${safeHtml(m.id)}">Edit</button>
          <button class="btn btn--ghost btn--sm" data-del="${safeHtml(m.id)}">Delete</button></div>`).join("")}</div>
      <div class="modal-actions"><button class="btn btn--secondary btn--sm" data-add>+ ${safeHtml(addLabel)}</button>
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
const openProcessProfileLibrary = () => openLibrary({
  title: "Process profiles", addLabel: "Add process profile", list: () => processProfiles,
  subtitle: (profile) => `${profile.op} · ${profile.power}% power · ${profile.speed}% speed · focus ${profile.zOffset || 0} mm${profile.op === "Engrave" ? ` · ${profile.dpi} DPI` : ""}`,
  onAdd: addProcessProfile, onEdit: editProcessProfile,
  onDelete: (id) => {
    processProfiles = processProfiles.filter((profile) => profile.id !== id);
    for (const layer of state.layers.filter((item) => item.profileId === id)) layer.profileId = null;
    saveProcessProfiles(); renderLayers(); markDirty();
  },
});
const openMachineLibrary = () => openLibrary({
  title: "Machines", addLabel: "Add machine", list: () => machines,
  subtitle: (m) => `${m.driver} · ${m.conn.type === "network" ? (m.conn.host || "net") + ":" + (m.conn.port || "") : "USB " + (m.conn.serial || "")} · ${Math.round(m.bedW)}×${Math.round(m.bedH)}mm · F${m.maxFeed || 12000}${m.zAxis?.enabled ? ` · Z ${m.zAxis.min}…${m.zAxis.max} @ ${m.zAxis.feed} · focus ${m.zAxis.globalOffset || 0}` : ""}`,
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
      { key: "profiles", label: "Process profiles", type: "checkbox", value: true },
      { key: "prefs", label: "Preferences (units)", type: "checkbox", value: true },
    ],
  });
  if (!v) return;
  if (!v.machines && !v.materials && !v.profiles && !v.prefs) return toast("Nothing selected to export.", "info");
  const payload = { app: "modCut", version: 1, exported: new Date().toISOString() };
  if (v.machines) payload.machines = machines;
  if (v.materials) payload.materials = materials;
  if (v.profiles) payload.processProfiles = processProfiles;
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
    if (Array.isArray(p.machines) && p.machines.length) { machines = p.machines; normalizeMachines(); state.machineId = machines[0].id; saveMachines(); refreshMachines(state.machineId); n++; }
    if (Array.isArray(p.materials) && p.materials.length) { materials = p.materials; normalizeMaterialSpeeds(); state.materialId = materials[0].id; saveMaterials(); refreshMaterialSelect(); applyMaterialToLayers(); n++; }
    if (Array.isArray(p.processProfiles)) { processProfiles = p.processProfiles.map(normalizeProcessProfile).filter((profile) => profile.id); saveProcessProfiles(); renderLayers(); n++; }
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
$("addTab").addEventListener("click", newDocument);
$("import").addEventListener("click", doImport);
$("add").addEventListener("click", addFiles);
$("zoomIn").addEventListener("click", bed.zoomIn);
$("zoomOut").addEventListener("click", bed.zoomOut);
$("zoomFit").addEventListener("click", bed.fit);
$("frame").addEventListener("click", frame);
$("connect").addEventListener("click", connect);
$("togglePanel").addEventListener("click", togglePanel);
let selWhole = false;
$("selMode").addEventListener("click", () => {
  selWhole = !selWhole;
  bed.setSelectionMode(selWhole ? "design" : "element");
  $("selMode").textContent = selWhole ? "Mark whole" : "Mark elements";
});

// draw tools (select / rectangle / ellipse / line)
const updateToolButtons = (tool) => [...$("tools").children].forEach((b) => b.classList.toggle("tool-on", b.dataset.tool === tool));
const selectTool = (tool) => {
  activeTool = tool;
  bed.setTool(tool);
  if (DRAW_TOOLS.has(tool)) {
    const style = bed.getStyle();
    bed.setDrawStyle(distinctVectorColor(style.color, state.colors), style.width);
  }
  updateToolButtons(tool); refreshProps(); refreshPropsVisibility();
};
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
    { key: "w", label: `Width (${state.units})`, type: "number", min: 0.01, step: 0.01, required: true, value: toDisp(50) },
    { key: "h", label: `Height (${state.units})`, type: "number", min: 0.01, step: 0.01, required: true, value: toDisp(50) },
  ] });
  if (!v) return;
  bed.addShape(type, toMm(v.w), toMm(v.h));
  syncColorsAndLayers();
});
$("pathOrder").addEventListener("change", (e) => { bed.setPathOrder(e.target.value); markDirty(); });
$("filename").addEventListener("input", (e) => {
  if (!docPath) setFileLabel(e.target.value.trim() || "Untitled");
  markDirty();
});

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
    if (key === "+" || key === "=") {
      e.preventDefault();
      bed.zoomIn();
      return;
    }
    if (key === "-" || key === "_") {
      e.preventDefault();
      bed.zoomOut();
      return;
    }
    if (key === "0") {
      e.preventDefault();
      bed.fit();
      return;
    }
    if (key === "tab") {
      e.preventDefault();
      switchRelativeTab(e.shiftKey ? -1 : 1);
      return;
    }
    const command =
      key === "o" && e.shiftKey ? "add" :
      key === "o" ? "import" :
      key === "w" ? "close-tab" :
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
      else if (command === "add") addFiles();
      else if (command === "new") newDocument();
      else if (command === "close-tab") closeDocumentTab();
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
  const targetLayer = state.layers.find((layer) => layer.color?.toLowerCase() === c.toLowerCase());
  if (bed.getSelectionInfo().hasRaster && targetLayer && !canAssignRasterToOperation(targetLayer.op)) {
    toast("A raster image can only be moved to an Engrave or Ignore layer.", "info");
    refreshProps();
    return;
  }
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
  blackPoint: ["bmpBlackPoint", "bmpBlackPointNum"],
  whitePoint: ["bmpWhitePoint", "bmpWhitePointNum"],
  threshold: ["bmpThreshold", "bmpThresholdNum"],
  gamma: ["bmpGamma", "bmpGammaNum"],
  grayLevels: ["bmpGrayLevels", "bmpGrayLevelsNum"],
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
  const mode = bed.getRasterMode();
  const grayscaleMode = String(mode).toLowerCase() === "grayscale";
  $("bmpThresholdRow").classList.toggle("is-inactive", grayscaleMode);
  $("bmpGrayLevelsRow").classList.toggle("is-inactive", !grayscaleMode);
  for (const id of bitmapFields.threshold) $(id).disabled = grayscaleMode;
  for (const id of bitmapFields.grayLevels) $(id).disabled = !grayscaleMode;
  $("bmpModeHint").textContent = grayscaleMode
    ? "Gray levels posterize neighboring tones in both the preview and laser output. Midtones change tones between black and white."
    : `${mode} uses black/white dots. Dither threshold now updates the preview and laser output.`;
}
function applyBitmapValue(key, value) {
  const next = bed.updateRasterSettings({ [key]: Number(value) });
  if (next) for (const field of Object.keys(bitmapFields)) setBitmapPair(field, next[field]);
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

async function openAdvancedImageEditor() {
  const editorPayload = bed.getRasterEditorPayload();
  if (!editorPayload) {
    toast("Select exactly one raster image to open the engraving editor.", "info");
    return;
  }
  const layer = state.layers.find((entry) => entry.key === editorPayload.layerKey)
    || state.layers.find((entry) => entry.color?.toLowerCase() === editorPayload.color?.toLowerCase() && entry.op === "Engrave");
  try {
    const result = await window.modcut.openImageEditor({
      ...editorPayload,
      name: $("file").textContent.replace(/\s\*$/, "") || "Raster image",
      dpi: layer?.dpi || 300,
    });
    if (!result) return;
    if (!(await bed.applyEngravingRecipe(result))) {
      toast("The image selection changed before the edit could be applied.", "err");
      return;
    }
    refreshBitmapControls();
    refreshPos();
    scheduleQualityRefresh();
    markDirty();
    toast("Advanced engraving edit applied. The original image is still preserved.", "ok");
  } catch (error) {
    toast(`Could not open the image editor: ${error.message}`, "err");
  }
}
$("advancedImageEditor").addEventListener("click", openAdvancedImageEditor);

let ctxMenu = null;
function closeContextMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
function openContextMenu(info) {
  closeContextMenu();
  if (!info.hasSelection) return;
  const layerChoices = [...new Map(state.layers.filter((layer) => layer.color).map((layer) => [layer.color.toLowerCase(), layer])).values()];
  const layerColors = new Set(layerChoices.map((layer) => layer.color.toLowerCase()));
  const paletteChoices = ["#ff0000", "#00aa00", "#0000ff", "#000000"].filter((color) => !layerColors.has(color));
  const deleteLabel = info.selectionKind === "group"
    ? "Delete group"
    : info.selectionCount === 1 ? "Delete object" : "Delete objects";
  const colorButton = (color, label, op = "New layer") => {
    const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#000000";
    const blocked = info.hasRaster && op !== "New layer" && !canAssignRasterToOperation(op);
    return `<button class="ctx-menu__color" data-color="${safeColor}" ${blocked ? "disabled" : ""} title="${blocked ? "Raster images can only use Engrave or Ignore layers" : `Move selection to ${label}`}">
      <span class="ctx-menu__sw" style="background:${safeColor}"></span><span>${label}</span><small>${op}</small>
    </button>`;
  };
  ctxMenu = document.createElement("div");
  ctxMenu.className = "ctx-menu";
  ctxMenu.innerHTML = `
    ${info.singleRaster ? `<button data-act="advanced-image-editor"><span>Advanced editing…</span><kbd>⌥I</kbd></button><div class="ctx-menu__sep"></div>` : ""}
    <div class="ctx-menu__label">Move selection to layer</div>
    <div class="ctx-menu__colors">
      ${layerChoices.map((layer) => colorButton(layer.color, layer.color.toUpperCase(), layer.op)).join("")}
      ${paletteChoices.map((color) => colorButton(color, color.toUpperCase())).join("")}
    </div>
    <div class="ctx-menu__sep"></div>
    <button data-act="group" ${info.canGroup ? "" : "disabled"}>Group <kbd>⌘G</kbd></button>
    <button data-act="ungroup" ${info.canUngroup ? "" : "disabled"}>Ungroup <kbd>⇧⌘G</kbd></button>
    <div class="ctx-menu__label">Arrange</div>
    <button data-act="move-up">Move up <kbd>⌘U</kbd></button>
    <button data-act="move-down">Move down <kbd>⌥⌘N</kbd></button>
    <button data-act="move-to-top">Move to top <kbd>⇧⌘U</kbd></button>
    <button data-act="move-to-bottom">Move to bottom <kbd>⌥⇧⌘N</kbd></button>
    <div class="ctx-menu__sep"></div>
    <button data-act="delete" class="ctx-menu__danger">${deleteLabel} <kbd>⌫</kbd></button>`;
  ctxMenu.style.left = Math.min(info.x, window.innerWidth - 252) + "px";
  ctxMenu.style.top = Math.max(8, Math.min(info.y, window.innerHeight - 420)) + "px";
  ctxMenu.addEventListener("click", (e) => {
    const colorChoice = e.target.closest("button[data-color]");
    if (colorChoice && !colorChoice.disabled) {
      const color = colorChoice.dataset.color;
      bed.setDrawStyle(color, +$("propWidth").value || 0.5);
      bed.applyStyle(color, null);
      syncColorsAndLayers();
      refreshProps();
      markDirty();
      closeContextMenu();
      return;
    }
    const b = e.target.closest("button[data-act]");
    if (!b || b.disabled) return;
    if (b.dataset.act === "advanced-image-editor") void openAdvancedImageEditor();
    else editAction(b.dataset.act);
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
$("stopBtn").addEventListener("click", stopJob);
$("addMaterial").addEventListener("click", addMaterial);
$("processProfiles").addEventListener("click", openProcessProfileLibrary);
$("device").addEventListener("change", (e) => selectMachine(e.target.value));
$("dryRun").addEventListener("change", renderMachineStatus);
$("splitJobs").checked = state.splitByOperation;
$("splitJobs").addEventListener("change", (event) => {
  state.splitByOperation = event.target.checked;
  localStorage.setItem("modcut_split_by_operation", String(state.splitByOperation));
  toast(state.splitByOperation
    ? "Jobs will be sent as one file per operation type."
    : "Cut, Score and Engrave will be sent together in one file.", "info");
});

// simulate controls
$("simPlay").addEventListener("click", () => {
  if (!simCtl) return startSimulate();
  $("simPlay").textContent = simCtl.toggle() ? "⏸" : "▶";
});
$("simRestart").addEventListener("click", () => {
  if (!simCtl) return startSimulate();
  simCtl.restart();
  $("simPlay").textContent = "⏸";
  $("simProg").textContent = "0%";
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
  if (state.colors.some((color) => color.raster) && ["cut", "score"].includes(b.dataset.mode)) {
    toast("Raster images can only be engraved. Use Map by color to keep vector cutting separate.", "info");
    return;
  }
  state.mappingMode = b.dataset.mode;
  [...e.currentTarget.children].forEach((c) => c.classList.toggle("on", c === b));
  syncLayers();
  markDirty();
});

window.modcut.onMenu((cmd) => ({
  new: newDocument, import: doImport, add: addFiles, "close-tab": closeDocumentTab,
  "zoom-in": bed.zoomIn, "zoom-out": bed.zoomOut, "zoom-fit": bed.fit,
  "toggle-panel": togglePanel, frame, simulate: startSimulate, connect,
  undo: () => editAction("undo"), redo: () => editAction("redo"),
  copy: () => editAction("copy"), paste: () => editAction("paste"), "paste-in-place": () => editAction("paste-in-place"),
  duplicate: () => editAction("duplicate"), delete: () => editAction("delete"), "select-all": () => editAction("select-all"),
  group: () => editAction("group"), ungroup: () => editAction("ungroup"),
  "advanced-image-editor": openAdvancedImageEditor,
  "move-up": () => editAction("move-up"), "move-down": () => editAction("move-down"),
  "move-to-top": () => editAction("move-to-top"), "move-to-bottom": () => editAction("move-to-bottom"),
  "add-machine": addMachine, "manage-machines": openMachineLibrary,
  "add-material": addMaterial, materials: openMaterialLibrary,
  "add-process-profile": addProcessProfile, "process-profiles": openProcessProfileLibrary,
  "save-document": () => saveDocument(false), "save-document-as": () => saveDocument(true),
  save: () => runJob("Save"), export: () => runJob("Export"), preferences: openSettings,
  "export-settings": exportSettings, "import-settings": importSettings,
  docs: () => window.open("../docs/index.html"),
  about: showAbout,
}[cmd]?.()));
window.modcut.onCloseRequest(async () => {
  const allowed = await guardAllWorkBeforeWindowClose();
  await window.modcut.respondToCloseRequest(allowed);
});

// --- boot -------------------------------------------------------------------
initCollapsibleSections();
initTooltips();
initFileDrop();
refreshMachines(state.machineId);
bed.setGrid(state.gridXmm, state.gridYmm);
initializeDocumentTabs();
void restoreRecoverySession().then((restored) => { if (!restored) scheduleRecovery(); });
refreshProps();
refreshPropsVisibility();
(async () => {
  try {
    const pong = await window.modcut.call("ping");
    machineStatus = pong;
    renderMachineStatus();
    drivers = (await window.modcut.call("listDrivers")).drivers;
  } catch {
    machineStatus = { connected: false, running: false, dryRun: true, lastError: "Sidecar unavailable" };
    renderMachineStatus();
  }
})();
setInterval(pollMachineStatus, 500);
