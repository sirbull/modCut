/**
 * Edit > Keyboard Shortcuts (D5): every tool and command with its shortcut. Click a shortcut and press the
 * new keys (Backspace or Delete removes it, Escape stops recording); Reset All goes back to the defaults.
 * Resolves with the override map (checked for conflicts) or null.
 */
import { KEYMAP, applyOverrides, formatShortcut, keyFromEvent, keyOverrides, validateOverrides } from '../keymap.mjs';
import { TOOL_DEFINITIONS } from '../tools/registry.mjs';
import { frame } from './export-dialogs.mjs';

const make = (tag, className, parent, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; parent?.append(el); return el; };
const commandName = (id) => id.replace(/^panel\./, 'Window: ').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
export function shortcutsDialog({ isMac = false } = {}) {
  const ui = frame({ title: 'Keyboard Shortcuts', className: 'draw-shortcuts-dialog', submitLabel: 'OK' });
  let map = keyOverrides(), recording = null;
  const entries = KEYMAP.filter((e) => !e.temporary && e.when !== 'draw.text-editing');
  const name = (e) => e.id.startsWith('tool.') ? `${TOOL_DEFINITIONS.find((t) => t.bindingId === e.id)?.name ?? e.id} Tool` : commandName(e.id);
  const search = make('input', 'input draw-shortcuts__search', ui.body); search.type = 'search'; search.placeholder = 'Search'; search.setAttribute('aria-label', 'Search shortcuts');
  const list = make('div', 'draw-shortcuts__list', ui.body); list.setAttribute('role', 'list');
  const rows = entries.map((entry) => {
    const row = make('div', 'draw-shortcuts__row', list); row.setAttribute('role', 'listitem'); row.dataset.drawShortcut = entry.id;
    make('span', 'draw-shortcuts__name', row, name(entry));
    const keys = make('button', 'btn btn--ghost btn--sm draw-shortcuts__keys', row); keys.type = 'button'; keys.dataset.drawShortcutKeys = entry.id;
    keys.addEventListener('click', () => { recording = entry.id; paint(); keys.focus(); });
    keys.addEventListener('keydown', (event) => {
      if (recording !== entry.id) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { recording = null; paint(); return; }
      if (event.key === 'Backspace' || event.key === 'Delete') { map[entry.id] = []; recording = null; paint(); return; }
      const key = keyFromEvent(event, { isMac }); if (!key) return;
      map[entry.id] = [key]; recording = null; paint();
    });
    return { row, keys, entry, label: name(entry).toLowerCase() };
  });
  const reset = make('button', 'btn btn--ghost btn--sm', ui.actions, 'Reset All'); reset.type = 'button'; reset.dataset.drawShortcutsReset = '';
  ui.actions.prepend(reset); reset.addEventListener('click', () => { map = {}; recording = null; paint(); });
  function paint() {
    const current = applyOverrides(map), query = search.value.trim().toLowerCase();
    for (const { row, keys, entry, label } of rows) {
      const keysNow = current.find((e) => e.id === entry.id).keys;
      keys.textContent = recording === entry.id ? 'Press keys…' : keysNow.length ? keysNow.map((k) => formatShortcut(k, { isMac })).join(' / ') : 'None';
      keys.classList.toggle('is-changed', Object.hasOwn(map, entry.id));
      // The shown name may be translated, so both it and the English name match.
      row.hidden = !!query && !label.includes(query) && !row.firstChild.textContent.toLowerCase().includes(query) && !keys.textContent.toLowerCase().includes(query);
    }
    ui.error.textContent = '';
  }
  search.addEventListener('input', paint);
  paint();
  return ui.open(() => validateOverrides(map));
}
