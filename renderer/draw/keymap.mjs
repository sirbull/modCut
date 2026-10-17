/** Single source for Draw keys, tooltips and native accelerators. No DOM dependency. */
import { TOOL_DEFINITIONS, toolRegistry } from './tools/registry.mjs';
const binding = (id, keys, when = 'draw', extra = {}) => ({ id, keys, when, command: id, ...extra });
const toolKeys = {
  select: ['V'], 'direct-selection': ['A'], 'magic-wand': ['Y'], lasso: ['Q'], artboard: ['Shift+O'],
  pen: ['P'], 'add-anchor': ['Equal', 'Shift+Equal'], 'delete-anchor': ['Minus'], 'anchor-point': ['Shift+C'], curvature: ['Shift+Backquote'],
  pencil: ['N'], paintbrush: ['B'], 'blob-brush': ['Shift+B'], eraser: ['Shift+E'], scissors: ['C'], 'shape-builder': ['Shift+M'], width: ['Shift+W'],
  rectangle: ['M'], ellipse: ['L'], line: ['Backslash', 'IntlBackslash'], type: ['T'], 'touch-type': ['Shift+T'],
  rotate: ['R'], reflect: ['O'], scale: ['S'], 'free-transform': ['E'], gradient: ['G'], eyedropper: ['I'], blend: ['W'], 'live-paint': ['K'],
  hand: ['H'], zoom: ['Z'], 'rotate-view': ['Shift+H'],
};
const entries = [
  binding('new', ['Mod+N'], 'global'), binding('import', ['Mod+O'], 'global'),
  binding('save-document', ['Mod+S'], 'global'), binding('save-document-as', ['Mod+Shift+S'], 'global'),
  binding('close-tab', ['Mod+W'], 'global'), binding('next-tab', ['Mod+Tab'], 'global'), binding('previous-tab', ['Mod+Shift+Tab'], 'global'),
  binding('preferences', ['Mod+K', 'Mod+Comma']),
  binding('add', ['Mod+Shift+O'], 'cut'),
  ...TOOL_DEFINITIONS.filter((tool) => toolKeys[tool.id]).map((tool) => binding(tool.bindingId, toolKeys[tool.id])),
  ...[
    ['save-copy', 'Mod+Alt+S'], ['place', 'Mod+Shift+P'], ['document-setup', 'Mod+Alt+P'], ['export-screens', 'Mod+Alt+E'], ['export-as', 'Mod+Shift+Alt+S'],
    ['undo', 'Mod+Z'], ['redo', 'Mod+Shift+Z'], ['cut', 'Mod+X'], ['copy', 'Mod+C'], ['paste', 'Mod+V'],
    ['paste-front', 'Mod+F'], ['paste-back', 'Mod+B'], ['paste-place', 'Mod+Shift+V'], ['paste-all-artboards', 'Mod+Shift+Alt+V'],
    ['transform-again', 'Mod+D'], ['transform-each', 'Mod+Shift+Alt+D'], ['move-dialog', 'Mod+Shift+M'],
    ['bring-forward', 'Mod+BracketRight'], ['send-backward', 'Mod+BracketLeft'], ['bring-front', 'Mod+Shift+BracketRight'], ['send-back', 'Mod+Shift+BracketLeft'],
    ['group', 'Mod+G'], ['ungroup', 'Mod+Shift+G'], ['lock', 'Mod+Digit2'], ['unlock-all', 'Mod+Alt+Digit2'], ['hide', 'Mod+Digit3'], ['show-all', 'Mod+Alt+Digit3'],
    ['join', 'Mod+J'], ['average', 'Mod+Alt+J'], ['compound-make', 'Mod+Digit8'], ['compound-release', 'Mod+Shift+Alt+Digit8'],
    ['clip-make', 'Mod+Digit7'], ['clip-release', 'Mod+Alt+Digit7'], ['blend-make', 'Mod+Alt+B'], ['blend-release', 'Mod+Shift+Alt+B'],
    ['create-outlines', 'Mod+Shift+O'], ['panel.character', 'Mod+T'], ['panel.paragraph', 'Mod+Alt+T'],
    ['select-all', 'Mod+A'], ['deselect', 'Mod+Shift+A'], ['select-artboard', 'Mod+Alt+A'], ['reselect', 'Mod+Digit6'], ['select-next-above', 'Mod+Alt+BracketRight'], ['select-next-below', 'Mod+Alt+BracketLeft'],
    ['outline', 'Mod+Y'], ['pixel-preview', 'Mod+Alt+Y'], ['fit-artboard', 'Mod+Digit0'], ['fit-all', 'Mod+Alt+Digit0'], ['actual-size', 'Mod+Digit1'],
    ['rulers', 'Mod+R'], ['guides', 'Mod+Semicolon'], ['guides-lock', 'Mod+Alt+Semicolon'], ['guides-make', 'Mod+Digit5'], ['guides-release', 'Mod+Alt+Digit5'],
    ['smart-guides', 'Mod+U'], ['grid', 'Mod+Quote'], ['snap-grid', 'Mod+Shift+Quote'], ['snap-point', 'Mod+Alt+Quote'],
    ['hide-edges', 'Mod+H'], ['hide-artboards', 'Mod+Shift+H'], ['bounding-box', 'Mod+Shift+B'], ['transparency-grid', 'Mod+Shift+D'],
    ['panel.layers', 'F7'], ['panel.color', 'F6'], ['panel.transparency', 'Mod+Shift+F10'], ['panel.stroke', 'Mod+F10'], ['panel.gradient', 'Mod+F9'], ['panel.pathfinder', 'Mod+Shift+F9'],
    ['panel.appearance', 'Shift+F6'], ['panel.align', 'Shift+F7'], ['panel.transform', 'Shift+F8'], ['panel.info', 'F8'],
    ['default-paint', 'D'], ['paint-focus', 'X'], ['paint-swap', 'Shift+X'], ['paint-solid', 'Comma'], ['paint-gradient', 'Period'], ['paint-none', 'Slash'],
    ['draw-mode', 'Shift+D'], ['screen-mode', 'F'], ['toggle-panels', 'Tab'], ['toggle-panels-except-tools', 'Shift+Tab'],
    ['tool-dialog', 'Enter'], ['cancel', 'Escape'], ['command-search', 'Mod+Shift+K'],
    ['effect-last', 'Mod+Shift+E'], ['effect-options', 'Mod+Shift+Alt+E'],
  ].map(([id, key]) => binding(id, [key])),
  binding('paint-solid-shifted', ['Shift+Comma'], 'draw', { command: 'paint-solid' }),
  binding('paint-gradient-shifted', ['Shift+Period'], 'draw', { command: 'paint-gradient' }),
  binding('zoom-in', ['Mod+Equal', 'Mod+Shift+Equal']), binding('zoom-out', ['Mod+Minus']),
  binding('delete', ['Backspace', 'Delete'], 'draw', { repeat: true }),
  ...['Left', 'Right', 'Up', 'Down'].flatMap((direction) => [
    binding(`nudge-${direction.toLowerCase()}`, [`Arrow${direction}`], 'draw', { repeat: true }),
    binding(`nudge-large-${direction.toLowerCase()}`, [`Shift+Arrow${direction}`], 'draw', { repeat: true }),
    binding(`duplicate-${direction.toLowerCase()}`, [`Alt+Arrow${direction}`], 'draw', { repeat: true }),
  ]),
  binding('temporary.hand', ['Space'], 'draw', { temporary: true }),
  binding('temporary.selection', ['Mod'], 'draw', { temporary: true }),
  binding('temporary.zoom', ['Mod+Space'], 'draw', { temporary: true }),
  binding('temporary.zoom-out', ['Mod+Alt+Space'], 'draw', { temporary: true }),
];
export const KEYMAP = Object.freeze(entries.map((entry) => Object.freeze({ ...entry, keys: Object.freeze(entry.keys) })));
const physical = new Set(['Space', 'Equal', 'Minus', 'Backslash', 'IntlBackslash', 'Backquote', 'Comma', 'Period', 'Slash', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote']);
const symbols = { ' ': 'Space', '+': 'Equal', '=': 'Equal', '-': 'Minus', '_': 'Minus', '\\': 'Backslash', '`': 'Backquote', '~': 'Backquote', ',': 'Comma', '.': 'Period', '/': 'Slash', '[': 'BracketLeft', ']': 'BracketRight', ';': 'Semicolon', "'": 'Quote' };
function parse(key) {
  const parts = key.split('+'), token = parts.pop();
  const modifiers = new Set(parts);
  if (!token || parts.some((part) => !['Mod', 'Shift', 'Alt'].includes(part)) || modifiers.size !== parts.length) throw new Error(`Invalid shortcut: ${key}`);
  return { token, mod: modifiers.has('Mod') || token === 'Mod', shift: modifiers.has('Shift'), alt: modifiers.has('Alt') };
}
function tokenFor(event) {
  if (physical.has(event.code) || /^(Digit\d|Arrow(Left|Right|Up|Down)|F\d+)$/.test(event.code || '')) return event.code;
  const key = event.key || '';
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (/^\d$/.test(key)) return `Digit${key}`;
  return symbols[key] || key;
}
function applies(entry, workspace, textEditing = false) {
  return entry.when === 'global' || entry.when === workspace || (entry.when === 'draw.text-editing' && workspace === 'draw' && textEditing);
}
export function findConflicts(keymap = KEYMAP) {
  const conflicts = [], seen = new Map();
  for (const entry of keymap) for (const key of entry.keys) {
    const p = parse(key), normalized = `${p.mod}:${p.shift}:${p.alt}:${p.token}`;
    const previous = seen.get(normalized) || [];
    for (const other of previous) if (other.when === entry.when || other.when === 'global' || entry.when === 'global'
      || ([other.when, entry.when].includes('draw') && [other.when, entry.when].includes('draw.text-editing'))) conflicts.push({ key, ids: [other.id, entry.id], when: entry.when });
    previous.push(entry); seen.set(normalized, previous);
  }
  return conflicts;
}
export function matchShortcut(event, { workspace = 'draw', isMac = false, textEditing = false, editable = false, keymap = KEYMAP } = {}) {
  if (event.isComposing || event.key === 'Process' || event.getModifierState?.('AltGraph')) return null;
  const token = tokenFor(event), mod = isMac ? !!event.metaKey : !!event.ctrlKey;
  if (isMac ? event.ctrlKey : event.metaKey) return null;
  for (const entry of keymap) {
    if (entry.temporary || !applies(entry, workspace, textEditing) || ((editable || textEditing) && entry.when !== 'draw.text-editing')) continue;
    if (event.repeat && !entry.repeat) continue;
    for (const key of entry.keys) {
      const p = parse(key);
      if (p.token === token && p.mod === mod && p.shift === !!event.shiftKey && p.alt === !!event.altKey) return entry;
    }
  }
  return null;
}
const labels = { Equal: '+', Minus: '−', Backslash: '\\', IntlBackslash: '< (IntlBackslash)', Backquote: '~', Comma: ',', Period: '.', Slash: '/', Space: 'Space', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'" };
export function formatShortcut(key, { isMac = false } = {}) {
  const p = parse(key), parts = [];
  if (p.mod) parts.push(isMac ? 'Cmd' : 'Ctrl');
  if (p.shift) parts.push('Shift'); if (p.alt) parts.push(isMac ? 'Option' : 'Alt');
  if (p.token !== 'Mod') parts.push(labels[p.token] || p.token.replace(/^Digit/, ''));
  return parts.join('+');
}
export function acceleratorFor(id, { workspace = 'draw', isMac = false } = {}) {
  const entry = KEYMAP.find((entry) => entry.id === id && !entry.temporary && applies(entry, workspace));
  if (!entry) return undefined;
  const p = parse(entry.keys[0]);
  const native = { Equal: 'Plus', Minus: '-', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down' };
  return [p.mod ? (isMac ? 'Cmd' : 'Ctrl') : null, p.shift ? 'Shift' : null, p.alt ? 'Alt' : null, native[p.token] || p.token.replace(/^Digit/, '')].filter(Boolean).join('+');
}
export function shortcutLabel(id, { workspace = 'draw', isMac = false } = {}) {
  const entry = KEYMAP.find((entry) => entry.id === id && applies(entry, workspace));
  return entry ? entry.keys.map((key) => formatShortcut(key, { isMac })).join(' / ') : '';
}
export function toolTooltip(id, options) {
  const tool = toolRegistry.get(id);
  if (!tool) throw new Error(`Unknown Draw tool: ${id}`);
  const entry = KEYMAP.find((entry) => entry.id === tool.bindingId);
  return `${tool.name} Tool${entry ? ` (${formatShortcut(entry.keys[0], options)})` : ''}`;
}

/** Temporary overrides are transient callbacks, never permanent tool selections or Commands. */
export function createKeymap({ dispatch = () => {}, isEnabled = () => true, isMac = false,
  onTemporaryToolChange = () => {}, selectionTool = () => 'select' } = {}) {
  let heldSpace = false, override = null;
  function setOverride(next) {
    if (override?.id === next?.id && override?.zoomOut === next?.zoomOut) return;
    override = next; onTemporaryToolChange(next);
  }
  function temporary(event, context, releasing = false) {
    const space = tokenFor(event) === 'Space';
    if (space) heldSpace = !releasing;
    if ((context.workspace || 'draw') !== 'draw' || context.editable || context.textEditing || event.isComposing || event.getModifierState?.('AltGraph') || (isMac ? event.ctrlKey : event.metaKey)) { heldSpace = false; setOverride(null); return; }
    const mod = isMac ? !!event.metaKey : !!event.ctrlKey;
    const tool = heldSpace ? (mod ? 'zoom' : 'hand') : mod ? selectionTool() : null;
    const id = heldSpace ? (mod ? (event.altKey ? 'temporary.zoom-out' : 'temporary.zoom') : 'temporary.hand') : mod ? 'temporary.selection' : null;
    const entry = KEYMAP.find((entry) => entry.id === id);
    setOverride(tool && isEnabled(entry) ? { id: tool, zoomOut: tool === 'zoom' && !!event.altKey } : null);
  }
  return Object.freeze({
    keydown(event, context = {}) {
      temporary(event, context);
      const entry = matchShortcut(event, { ...context, isMac });
      if (entry && isEnabled(entry)) { event.preventDefault?.(); dispatch(entry.command, entry); return entry; }
      if (heldSpace && override) event.preventDefault?.();
      return null;
    },
    keyup(event, context = {}) { temporary(event, context, true); },
    reset() { heldSpace = false; setOverride(null); },
    get temporaryTool() { return override; },
  });
}
