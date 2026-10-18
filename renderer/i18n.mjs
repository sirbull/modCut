// Localization (English and Norwegian bokmål). The interface is written in English; a catalog maps each
// English string to its translation, with {name} placeholders for numbers and names in messages. Menus are
// translated as they are built (main process), and the window's own interface by a DOM pass that also
// follows later changes. Anything inside translate="no" (names people typed, file and font names) is left
// alone, as are input values.
import { NB } from "./i18n-nb.mjs";

export const LANGUAGES = Object.freeze([
  { id: "system", label: "System" }, { id: "en", label: "English" }, { id: "nb", label: "Norsk bokmål" },
]);
const CATALOGS = { nb: NB };

/** The language to show: the preference, or for "system" the first system language modCut has. */
export function resolveLanguage(preference = "system", systemLanguages = []) {
  if (preference === "en" || CATALOGS[preference]) return preference;
  for (const tag of systemLanguages) {
    const base = String(tag).toLowerCase().split(/[-_]/)[0];
    if (base === "en") return "en";
    if (["nb", "no", "nn"].includes(base)) return "nb";
  }
  return "en";
}

const compiled = new Map();
function compile(language) {
  if (compiled.has(language)) return compiled.get(language);
  const exact = new Map(), patterns = [];
  for (const [source, target] of Object.entries(CATALOGS[language] ?? {})) {
    if (!/\{[a-z]+\}/i.test(source)) { exact.set(source, target); continue; }
    const names = [];
    const pattern = source.split(/(\{[a-z]+\})/i).map((part) => {
      const name = /^\{([a-z]+)\}$/i.exec(part)?.[1];
      if (name) { names.push(name); return "(.+?)"; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    patterns.push({ regex: new RegExp(`^${pattern}$`, "s"), names, target });
  }
  const entry = { exact, patterns };
  compiled.set(language, entry);
  return entry;
}

/** A translate function: English text in, the language's text out (unknown text stays English). */
export function translator(language) {
  if (!CATALOGS[language]) { const same = (text) => text; same.identity = true; return same; }
  const { exact, patterns } = compile(language);
  return function t(text, values = null) {
    if (typeof text !== "string" || !text) return text;
    let out = exact.get(text);
    if (out === undefined) {
      // Surrounding spaces and a trailing ellipsis or colon are kept as written.
      const m = /^(\s*)(.*?)(\s*)$/s.exec(text);
      if (m[1] || m[3]) { const inner = t(m[2]); if (inner !== m[2]) return m[1] + inner + m[3]; }
      for (const { regex, names, target } of patterns) {
        const hit = regex.exec(text);
        if (hit) { out = names.reduce((s, name, i) => s.replaceAll(`{${name}}`, t(hit[i + 1])), target); break; }
      }
    }
    if (out === undefined) return text;
    return values ? out.replace(/\{([a-z]+)\}/gi, (all, name) => (name in values ? String(values[name]) : all)) : out;
  };
}

/** Translates the labels of an Electron menu template in place (and returns it). */
export function localizeMenuTemplate(template, t) {
  for (const item of template) {
    if (item.label) item.label = t(item.label);
    if (Array.isArray(item.submenu)) localizeMenuTemplate(item.submenu, t);
  }
  return template;
}

const ATTRIBUTES = ["title", "aria-label", "placeholder", "data-tooltip", "aria-description"];
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
const original = new WeakMap(); // text node -> { english, translated }, so switching language can go back
const originalAttributes = new WeakMap();
const skipped = (element) => !!element?.closest?.('[translate="no"], [contenteditable="true"]');

function localizeText(node, t) {
  const parent = node.parentElement;
  if (!parent || SKIP.has(parent.tagName) || skipped(parent)) return;
  // Text the code changed since the last pass is the new English; otherwise go back to the saved English.
  const saved = original.get(node), english = saved && saved.translated === node.nodeValue ? saved.english : node.nodeValue;
  if (!english.trim()) return;
  const translated = t(english);
  if (translated === english) { original.delete(node); if (node.nodeValue !== english) node.nodeValue = english; return; }
  original.set(node, { english, translated });
  if (node.nodeValue !== translated) node.nodeValue = translated;
}
function localizeAttributes(element, t) {
  if (skipped(element)) return;
  let saved = originalAttributes.get(element);
  for (const name of ATTRIBUTES) {
    if (!element.hasAttribute(name)) continue;
    const current = element.getAttribute(name), english = saved?.[name]?.translated === current ? saved[name].english : current;
    const translated = t(english);
    if (translated === english) { if (saved?.[name]) delete saved[name]; continue; }
    if (!saved) originalAttributes.set(element, saved = {});
    saved[name] = { english, translated };
    if (current !== translated) element.setAttribute(name, translated);
  }
  // Buttons whose value is their label.
  if (element.tagName === "INPUT" && ["button", "submit", "reset"].includes(element.type) && element.value) {
    const key = "value", current = element.value, english = saved?.[key]?.translated === current ? saved[key].english : current, translated = t(english);
    if (translated !== english) { if (!saved) originalAttributes.set(element, saved = {}); saved[key] = { english, translated }; element.value = translated; }
  }
}
/** Translates a subtree once. */
export function localizeTree(root, t) {
  if (!root) return;
  if (root.nodeType === 3) { localizeText(root, t); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) { if (SKIP.has(root.tagName) || skipped(root)) return; localizeAttributes(root, t); }
  const walker = root.ownerDocument?.createTreeWalker?.(root, 5 /* elements and text */) ?? root.createTreeWalker?.(root, 5);
  if (!walker) return;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 3) localizeText(node, t);
    else if (!SKIP.has(node.tagName)) localizeAttributes(node, t);
  }
}
/** Keeps `root` translated as the interface changes. Returns a function that stops it. */
export function watchLocalization(root, getT) {
  let busy = false;
  const observer = new MutationObserver((records) => {
    const t = getT();
    // English is the source text: nothing to do until another language is chosen (localizeTree switches back).
    if (busy || t.identity) return;
    busy = true;
    try {
      for (const record of records) {
        if (record.type === "characterData") localizeText(record.target, t);
        else if (record.type === "attributes") localizeAttributes(record.target, t);
        else for (const node of record.addedNodes) localizeTree(node, t);
      }
    } finally { observer.takeRecords(); busy = false; }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  localizeTree(root, getT());
  return () => observer.disconnect();
}
