import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYMAP, acceleratorFor, keyFromEvent, matchShortcut, setKeyOverrides, shortcutLabel, toolTooltip, validateOverrides } from '../keymap.mjs';

const press = (key, extra = {}) => ({ key, code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...extra });
test('custom shortcuts replace defaults everywhere and are reset', () => {
  try {
    assert.equal(matchShortcut(press('p'))?.id, 'tool.pen');
    setKeyOverrides({ 'tool.pen': ['Shift+P'], 'tool.pencil': [] });
    assert.equal(matchShortcut(press('p')), null, 'P no longer picks the Pen');
    assert.equal(matchShortcut(press('P', { shiftKey: true }))?.id, 'tool.pen');
    assert.equal(toolTooltip('pen'), 'Pen Tool (Shift+P)'); assert.equal(toolTooltip('pencil'), 'Pencil Tool', 'A removed shortcut is not shown');
    setKeyOverrides({ 'export-as': ['Mod+Alt+Shift+X'] });
    assert.equal(acceleratorFor('export-as'), 'Ctrl+Shift+Alt+X'); assert.equal(shortcutLabel('export-as'), 'Ctrl+Shift+Alt+X');
  } finally { setKeyOverrides({}); }
  assert.equal(matchShortcut(press('p'))?.id, 'tool.pen');
});
test('validation refuses unknown ids, bad keys and conflicts, and drops defaults', () => {
  assert.throws(() => validateOverrides({ nope: ['K'] }), /Unknown command/);
  assert.throws(() => validateOverrides({ 'tool.pen': ['Hyper+K'] }), /Invalid shortcut/);
  assert.throws(() => validateOverrides({ 'tool.pen': ['V'] }), /used twice/);
  const pen = KEYMAP.find((e) => e.id === 'tool.pen');
  assert.deepEqual(validateOverrides({ 'tool.pen': [...pen.keys] }), {});
});
test('a key press becomes a shortcut string', () => {
  assert.equal(keyFromEvent(press('k', { ctrlKey: true, shiftKey: true })), 'Mod+Shift+K');
  assert.equal(keyFromEvent(press('Shift', { shiftKey: true })), null);
  assert.equal(keyFromEvent(press('k', { metaKey: true }), { isMac: true }), 'Mod+K');
});
