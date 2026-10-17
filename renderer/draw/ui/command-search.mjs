/**
 * Command search (Mod+Shift+K): every Draw command, tool and panel by name, with its shortcut.
 * `searchCommands` is pure; `openCommandSearch` shows the list in a modal.
 */
const LABELS = {
  undo: 'Undo', redo: 'Redo', delete: 'Delete', 'select-all': 'Select All', 'select-artboard': 'Select All on Active Artboard', deselect: 'Deselect',
  'fit-artboard': 'Fit Artboard in Window', 'fit-all': 'Fit All in Window', 'actual-size': 'Actual Size', 'zoom-in': 'Zoom In', 'zoom-out': 'Zoom Out', outline: 'Outline / Preview',
  cut: 'Cut', copy: 'Copy', paste: 'Paste', 'paste-front': 'Paste in Front', 'paste-back': 'Paste in Back', 'paste-place': 'Paste in Place', 'paste-all-artboards': 'Paste on All Artboards',
  group: 'Group', ungroup: 'Ungroup', 'bring-forward': 'Bring Forward', 'send-backward': 'Send Backward', 'bring-front': 'Bring to Front', 'send-back': 'Send to Back',
  lock: 'Lock Selection', 'unlock-all': 'Unlock All', hide: 'Hide Selection', 'show-all': 'Show All',
  'edit-text': 'Edit Text', 'create-outlines': 'Create Outlines', 'send-to-cut': 'Send Artboard to Cut', 'export-as': 'Export As', 'export-screens': 'Export for Screens',
  'use-as-template': 'Use as Template', 'toggle-control-bar': 'Control Bar', 'smart-guides': 'Smart Guides',
  join: 'Join', average: 'Average', 'offset-path': 'Offset Path', 'outline-stroke': 'Outline Stroke', expand: 'Expand', 'expand-appearance': 'Expand Appearance', simplify: 'Simplify', 'reverse-path': 'Reverse Path Direction', 'add-anchors': 'Add Anchor Points',
  'remove-anchors': 'Remove Anchor Points', 'clean-up': 'Clean Up', 'compound-make': 'Make Compound Path', 'compound-release': 'Release Compound Path',
  'clip-make': 'Make Clipping Mask', 'clip-release': 'Release Clipping Mask', 'transform-again': 'Transform Again', 'rotate-dialog': 'Rotate', 'reflect-dialog': 'Reflect',
  'scale-dialog': 'Scale', 'shear-dialog': 'Shear', 'paint-swap': 'Swap Fill and Stroke', 'default-paint': 'Default Fill and Stroke', 'paint-none': 'None',
  'paint-solid': 'Color', 'paint-gradient': 'Gradient', 'paint-focus': 'Toggle Fill and Stroke', 'toggle-panels': 'Hide All Panels', 'toggle-panels-except-tools': 'Hide Panels except Tools',
  reselect: 'Reselect', 'select-inverse': 'Select Inverse', 'select-next-above': 'Next Object Above', 'select-next-below': 'Next Object Below',
  'save-selection': 'Save Selection', 'edit-selection': 'Edit Selection',
  ...Object.fromEntries(Object.entries({ appearance: 'Appearance', 'fill-stroke': 'Fill & Stroke', 'fill-color': 'Fill Color', opacity: 'Opacity', 'stroke-color': 'Stroke Color', 'stroke-weight': 'Stroke Weight', shape: 'Shape', text: 'Text' }).map(([k, v]) => [`select-same-${k}`, `Select Same ${v}`])),
  ...Object.fromEntries(Object.entries({ 'same-layers': 'All on Same Layers', 'stray-points': 'Stray Points', 'open-paths': 'Open Paths', 'clipping-masks': 'Clipping Masks', text: 'Text Objects', images: 'Raster Images' }).map(([k, v]) => [`select-object-${k}`, `Select ${v}`])),
  'draw-mode': 'Cycle Drawing Mode', 'draw-normal': 'Draw Normal', 'draw-behind': 'Draw Behind', 'draw-inside': 'Draw Inside', 'command-search': 'Search Commands',
};
const KEYWORDS = { 'send-to-cut': 'laser cut bed', 'export-as': 'svg png jpg pdf eps dxf save', 'create-outlines': 'text type convert', 'clip-make': 'mask',
  'offset-path': 'grow shrink outline', 'outline-stroke': 'expand stroke area engrave', simplify: 'smooth reduce points', join: 'connect close', 'clean-up': 'stray empty', outline: 'wireframe', 'draw-inside': 'clip mask', 'draw-behind': 'back bottom' };

/** Entries for the commands this workspace can run: `{ id, label, kind, keywords }`. */
export function commandEntries({ commands = [], tools = [], panels = [] } = {}) {
  return [
    ...commands.filter((id) => LABELS[id]).map((id) => ({ id, label: LABELS[id], kind: 'Command', keywords: KEYWORDS[id] ?? '' })),
    ...tools.map((t) => ({ id: `tool.${t.id}`, label: `${t.name} Tool`, kind: 'Tool', keywords: t.id.replace(/-/g, ' ') })),
    ...panels.map((p) => ({ id: `panel.${p.id}`, label: `${p.name} Panel`, kind: 'Panel', keywords: 'window show' })),
  ];
}
/** Every query word must start a word of the label or keywords; label-prefix matches rank first. */
export function searchCommands(entries, query, limit = 12) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return entries.slice(0, limit);
  const scored = [];
  for (const entry of entries) {
    const label = entry.label.toLowerCase(), terms = `${label} ${entry.keywords}`.split(/[^a-z0-9]+/).filter(Boolean);
    if (!words.every((w) => terms.some((t) => t.startsWith(w)))) continue;
    const score = (label.startsWith(words.join(' ')) ? 0 : 2) + (label.split(/[^a-z0-9]+/).some((t) => t.startsWith(words[0])) ? 0 : 1) + label.length / 1000;
    scored.push([score, entry]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, entry]) => entry);
}
/** The search modal. `shortcut(id)` gives a label; `run(id)` runs the chosen entry. Escape closes it. */
export function openCommandSearch(entries, { run, shortcut = () => '' }) {
  document.querySelector('.draw-command-search')?.closest('.modal-overlay')?.remove();
  const previous = document.activeElement, overlay = document.createElement('div'); overlay.className = 'modal-overlay';
  const modal = document.createElement('div'); modal.className = 'modal panel draw-command-search'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Search commands');
  const input = document.createElement('input'); input.type = 'search'; input.className = 'input draw-command-search__input'; input.placeholder = 'Search commands, tools and panels'; input.setAttribute('aria-label', 'Search commands');
  const list = document.createElement('ul'); list.className = 'draw-command-search__list'; list.setAttribute('role', 'listbox'); list.id = 'draw-command-search-list';
  input.setAttribute('aria-controls', list.id); modal.append(input, list); overlay.append(modal); document.body.append(overlay);
  let results = [], active = 0;
  const close = () => { overlay.remove(); if (previous?.isConnected) previous.focus(); };
  const choose = (entry) => { close(); if (entry) run(entry.id); };
  const draw = () => {
    results = searchCommands(entries, input.value); active = Math.min(active, Math.max(0, results.length - 1)); list.replaceChildren();
    if (!results.length) { const empty = document.createElement('li'); empty.className = 'draw-command-search__empty'; empty.textContent = 'No matching commands'; list.append(empty); return; }
    results.forEach((entry, i) => {
      const item = document.createElement('li'); item.setAttribute('role', 'option'); item.dataset.drawCommand = entry.id; item.setAttribute('aria-selected', String(i === active));
      const name = document.createElement('span'); name.textContent = entry.label;
      const meta = document.createElement('span'); meta.className = 'draw-command-search__meta'; meta.textContent = [shortcut(entry.id), entry.kind].filter(Boolean).join(' · ');
      item.append(name, meta); item.addEventListener('mousedown', (event) => { event.preventDefault(); choose(entry); }); list.append(item);
    });
  };
  input.addEventListener('input', () => { active = 0; draw(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); active = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(1, results.length); draw(); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(results[active]); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  });
  overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
  draw(); input.focus();
  return { close };
}
