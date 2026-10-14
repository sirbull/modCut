import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { KEYMAP, findConflicts, matchShortcut, formatShortcut, shortcutLabel, acceleratorFor, toolTooltip, createKeymap } from '../keymap.mjs';
import { TOOL_DEFINITIONS, toolRegistry, createToolRegistry, iconHref } from '../tools/registry.mjs';
const event = (key, extra = {}) => ({ key, code: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
  prevented: false, preventDefault() { this.prevented = true; }, ...extra });
const command = (e, options) => matchShortcut(e, options)?.command || null;

test('Draw keymap has no same-context or global/context collisions', () => {
  assert.deepEqual(findConflicts(), []);
  assert.equal(new Set(KEYMAP.map((entry) => `${entry.when}:${entry.id}`)).size, KEYMAP.length);
  const entry = (id, when) => ({ id, when, keys: ['Mod+S'] });
  assert.equal(findConflicts([entry('a', 'draw'), entry('b', 'global')]).length, 1);
  assert.equal(findConflicts([entry('a', 'draw'), entry('b', 'draw.text-editing')]).length, 1);
  assert.equal(findConflicts([entry('a', 'cut'), entry('b', 'draw')]).length, 0);
  assert.equal(findConflicts([entry('a', 'draw'), entry('b', 'draw')]).length, 1);
  assert.throws(() => findConflicts([{ id: 'bad', when: 'draw', keys: ['Mod+Mod+X'] }]), /Invalid shortcut/);
  assert.throws(() => formatShortcut('Control+X'), /Invalid shortcut/);
});

test('key matching respects macOS/Windows modifiers, mode and exact combinations', () => {
  assert.equal(command(event('v')), 'tool.select');
  assert.equal(command(event('L', { shiftKey: false })), 'tool.ellipse');
  assert.equal(command(event('c')), 'tool.scissors');
  assert.equal(command(event('v'), { workspace: 'cut' }), null);
  assert.equal(command(event('n', { metaKey: true }), { isMac: true }), 'new');
  assert.equal(command(event('n', { ctrlKey: true })), 'new');
  assert.equal(command(event('n', { ctrlKey: true }), { isMac: true }), null);
  assert.equal(command(event('n', { metaKey: true })), null);
  assert.equal(command(event('o', { ctrlKey: true, shiftKey: true })), 'create-outlines');
  assert.equal(command(event('o', { ctrlKey: true, shiftKey: true }), { workspace: 'cut' }), 'add');
  assert.equal(command(event('o', { ctrlKey: true, shiftKey: true, altKey: true })), null);
  assert.equal(command(event('z', { ctrlKey: true })), 'undo');
  assert.equal(command(event('z', { ctrlKey: true, shiftKey: true })), 'redo');
  assert.equal(command(event('y', { ctrlKey: true })), 'outline');
  assert.equal(command(event('y', { ctrlKey: true, altKey: true })), 'pixel-preview');
  assert.equal(command(event('k', { ctrlKey: true, shiftKey: true })), 'command-search');
});

test('physical punctuation, Norwegian ISO alternative and legacy synthetic events resolve', () => {
  for (const key of ['=', '+', '¨']) {
    assert.equal(command(event(key, { code: 'Equal' })), 'tool.add-anchor');
    assert.equal(command(event(key, { code: 'Equal', shiftKey: true })), 'tool.add-anchor');
  }
  assert.equal(command(event('+')), 'tool.add-anchor');
  assert.equal(command(event('-', { code: 'Minus' })), 'tool.delete-anchor');
  assert.equal(command(event('§', { code: 'Backslash' })), 'tool.line');
  assert.equal(command(event('<', { code: 'IntlBackslash' })), 'tool.line');
  assert.equal(command(event('ø', { code: 'Semicolon', ctrlKey: true })), 'guides');
  assert.equal(command(event('æ', { code: 'Quote', ctrlKey: true, shiftKey: true })), 'snap-grid');
  assert.equal(command(event('å', { code: 'BracketLeft', ctrlKey: true })), 'send-backward');
  assert.equal(command(event('0', { ctrlKey: true })), 'fit-artboard');
  assert.equal(command(event('F7')), 'panel.layers');
  assert.equal(command(event('+', { ctrlKey: true, shiftKey: true, code: 'Equal' })), 'zoom-in');
  assert.equal(command(event('/', { code: 'Slash' })), 'paint-none');
  assert.equal(command(event('<', { code: 'Comma', shiftKey: true })), 'paint-solid');
  assert.equal(command(event('>', { code: 'Period', shiftKey: true })), 'paint-gradient');
  assert.equal(command(event('F10', { code: 'F10', ctrlKey: true, shiftKey: true })), 'panel.transparency');
  assert.equal(command(event('x', { ctrlKey: true, altKey: true, getModifierState: (key) => key === 'AltGraph' })), null);
});

test('editable controls, IME composition and repeats cannot select tools or fire actions', () => {
  assert.equal(command(event('p'), { editable: true }), null);
  assert.equal(command(event('p'), { textEditing: true }), null);
  assert.equal(command(event('n', { ctrlKey: true }), { editable: true }), null);
  assert.equal(command(event('p', { isComposing: true })), null);
  assert.equal(command(event('Process')), null);
  assert.equal(command(event('p', { repeat: true })), null);
  assert.equal(command(event('ArrowLeft', { repeat: true })), 'nudge-left');
  assert.equal(command(event('Backspace', { repeat: true })), 'delete');
  const keymap = [{ id: 'text-only', command: 'text-only', keys: ['Mod+B'], when: 'draw.text-editing' }];
  assert.equal(command(event('b', { ctrlKey: true }), { textEditing: true, keymap }), 'text-only');
  assert.equal(command(event('b', { ctrlKey: true }), { keymap }), null);
});

test('native menu accelerators and tooltips use the central data', () => {
  assert.equal(acceleratorFor('new', { isMac: true }), 'Cmd+N');
  assert.equal(acceleratorFor('new'), 'Ctrl+N');
  assert.equal(acceleratorFor('add'), undefined);
  assert.equal(acceleratorFor('add', { workspace: 'cut' }), 'Ctrl+Shift+O');
  assert.equal(acceleratorFor('redo'), 'Ctrl+Shift+Z');
  assert.equal(acceleratorFor('zoom-in'), 'Ctrl+Plus');
  assert.equal(acceleratorFor('bring-forward'), 'Ctrl+]');
  assert.equal(acceleratorFor('not-a-command'), undefined);
  assert.equal(acceleratorFor('temporary.hand'), undefined);
  assert.equal(formatShortcut('Mod+Shift+Alt+Digit8', { isMac: true }), 'Cmd+Shift+Option+8');
  assert.equal(formatShortcut('Mod'), 'Ctrl');
  assert.equal(shortcutLabel('missing'), '');
  assert.equal(shortcutLabel('add', { workspace: 'cut' }), 'Ctrl+Shift+O');
  assert.equal(toolTooltip('pen'), 'Pen Tool (P)');
  assert.equal(toolTooltip('line'), 'Line Segment Tool (\\)');
  assert.equal(toolTooltip('polygon'), 'Polygon Tool');
  assert.throws(() => toolTooltip('unknown'), /Unknown Draw tool/);
});

test('engine dispatches only enabled actions and prevents only handled shortcuts', () => {
  const commands = [], engine = createKeymap({ dispatch: (command) => commands.push(command), isEnabled: (entry) => entry.command === 'new' });
  const newEvent = event('n', { ctrlKey: true }); assert.equal(engine.keydown(newEvent).command, 'new');
  assert.equal(newEvent.prevented, true); assert.deepEqual(commands, ['new']);
  const pen = event('p'); assert.equal(engine.keydown(pen), null); assert.equal(pen.prevented, false);
  assert.equal(engine.keydown(event('n', { ctrlKey: true }), { editable: true }), null);
});

test('Space/Mod/Alt temporary tools restore in any release order without permanent dispatch', () => {
  const changes = [], commands = [], engine = createKeymap({ isMac: true, selectionTool: () => 'direct-selection',
    onTemporaryToolChange: (tool) => changes.push(tool), dispatch: (id) => commands.push(id) });
  const space = event(' ', { code: 'Space' }); engine.keydown(space);
  assert.equal(engine.temporaryTool.id, 'hand'); assert.equal(space.prevented, true);
  engine.keydown(event('Meta', { code: 'MetaLeft', metaKey: true })); assert.equal(engine.temporaryTool.id, 'zoom');
  engine.keydown(event('Alt', { code: 'AltLeft', metaKey: true, altKey: true })); assert.equal(engine.temporaryTool.zoomOut, true);
  engine.keyup(event('Alt', { metaKey: true })); assert.equal(engine.temporaryTool.zoomOut, false);
  engine.keyup(event(' ', { code: 'Space', metaKey: true })); assert.equal(engine.temporaryTool.id, 'direct-selection');
  engine.keyup(event('Meta')); assert.equal(engine.temporaryTool, null);
  engine.keydown(event(' ', { code: 'Space', metaKey: true }));
  engine.keyup(event('Meta')); assert.equal(engine.temporaryTool.id, 'hand');
  engine.keyup(event(' ', { code: 'Space' })); assert.equal(engine.temporaryTool, null);
  engine.keydown(event(' ', { code: 'Space' })); engine.reset(); assert.equal(engine.temporaryTool, null);
  assert.deepEqual(commands, []); assert.ok(changes.length >= 8);
});

test('temporary modes ignore typing, foreign modifiers, repeats, composition and disabled tools', () => {
  const changes = [], engine = createKeymap({ isMac: true, onTemporaryToolChange: (tool) => changes.push(tool) });
  engine.keydown(event(' ', { code: 'Space' })); engine.keydown(event(' ', { code: 'Space', repeat: true }));
  assert.equal(changes.length, 1);
  engine.keydown(event('p'), { editable: true }); assert.equal(engine.temporaryTool, null);
  for (const extra of [{ ctrlKey: true }, { isComposing: true }, { getModifierState: () => true }]) {
    engine.keydown(event(' ', { code: 'Space', ...extra })); assert.equal(engine.temporaryTool, null);
  }
  engine.keydown(event(' ', { code: 'Space' }), { workspace: 'cut' }); assert.equal(engine.temporaryTool, null);
  const disabled = createKeymap({ isEnabled: () => false });
  const key = event(' ', { code: 'Space' }); disabled.keydown(key); assert.equal(disabled.temporaryTool, null); assert.equal(key.prevented, false);
  engine.reset(); engine.reset();
});

test('49 registered tools are immutable metadata, with no unavailable placeholder implementations', () => {
  assert.equal(TOOL_DEFINITIONS.length, 49);
  assert.equal(new Set(TOOL_DEFINITIONS.map((tool) => tool.id)).size, 49);
  assert.equal(toolRegistry.tools.every((tool) => tool.Tool === null), true);
  assert.equal(toolRegistry.get('unknown'), null); assert.equal(toolRegistry.available('pen'), false);
  assert.ok(toolRegistry.group('shapes').some((tool) => tool.id === 'star'));
  assert.equal(toolRegistry.get('live-paint').phase, null);
  assert.equal(toolRegistry.get('direct-selection').icon, 'direct-select');
  class Pen {}
  const implemented = createToolRegistry({ pen: Pen }); assert.equal(implemented.get('pen').Tool, Pen); assert.equal(implemented.available('pen'), true);
  assert.throws(() => createToolRegistry({ unknown: Pen }), /Unknown/);
  assert.throws(() => createToolRegistry({ pen: {} }), /class/);
  assert.throws(() => { toolRegistry.get('pen').name = 'changed'; }, TypeError);
  assert.match(iconHref('pen'), /icons\/sprite.svg#icon-pen$/); assert.throws(() => iconHref('unknown'), /Unknown/);
});

test('every tool in specification chapter 6 has its SVG and a sprite symbol', () => {
  const spec = readFileSync(new URL('../../../docs/DRAW_WORKSPACE.md', import.meta.url), 'utf8');
  const section = spec.slice(spec.indexOf('## 6. Verktøy'), spec.indexOf('## 7. Hurtigtaster'));
  const iconNames = [...section.matchAll(/\|[^\n]*?\|[^\n]*?\| (`[^\n]+?`) \|/g)].flatMap((match) => [...match[1].matchAll(/`([^`]+)`/g)].map((value) => value[1]));
  assert.equal(iconNames.length, 49);
  assert.deepEqual([...TOOL_DEFINITIONS.map((tool) => tool.icon)].sort(), [...iconNames].sort());
  const dir = new URL('../icons/', import.meta.url), sprite = readFileSync(new URL('sprite.svg', dir), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('sources.json', dir), 'utf8'));
  assert.equal(manifest.package, '@tabler/icons'); assert.equal(manifest.version, '3.49.0');
  assert.equal(manifest.license, 'MIT');
  assert.deepEqual(Object.keys(manifest.icons).sort(), [...iconNames].sort());
  assert.match(readFileSync(new URL('LICENSE.tabler.txt', dir), 'utf8'), /Copyright.*Paweł Kuna/);
  const sources = readdirSync(dir).filter((name) => name.endsWith('.svg') && name !== 'sprite.svg');
  assert.equal(sources.length, 49);
  for (const tool of TOOL_DEFINITIONS) {
    const source = readFileSync(new URL(`${tool.icon}.svg`, dir), 'utf8');
    assert.match(source, /viewBox="0 0 24 24"/); assert.match(source, /stroke="currentColor"/); assert.match(source, /stroke-width="2"/);
    const provenance = manifest.icons[tool.icon];
    assert.ok(source.includes(`icon-tabler-${provenance.name}"`));
    assert.equal(createHash('sha256').update(source).digest('hex'), provenance.sha256);
    assert.ok(sprite.includes(`id="icon-${tool.icon}"`));
  }
});
