import test from 'node:test';
import assert from 'node:assert/strict';
import { commandEntries, searchCommands } from '../ui/command-search.mjs';

const entries = commandEntries({ commands: ['send-to-cut', 'export-as', 'group', 'ungroup', 'offset-path', 'not-labelled'], tools: [{ id: 'pen', name: 'Pen' }, { id: 'type-on-path', name: 'Type on a Path' }], panels: [{ id: 'layers', name: 'Layers' }] });

test('entries cover labelled commands, tools and panels', () => {
  assert.deepEqual(entries.map((e) => e.id), ['send-to-cut', 'export-as', 'group', 'ungroup', 'offset-path', 'tool.pen', 'tool.type-on-path', 'panel.layers']);
});

test('search matches word starts in labels and keywords, best first', () => {
  assert.deepEqual(searchCommands(entries, 'gro').map((e) => e.id), ['group', 'offset-path'], 'Group first; Offset Path matches its keyword "grow"');
  assert.deepEqual(searchCommands(entries, 'laser').map((e) => e.id), ['send-to-cut']);
  assert.deepEqual(searchCommands(entries, 'type path').map((e) => e.id), ['tool.type-on-path']);
  assert.deepEqual(searchCommands(entries, 'pdf').map((e) => e.id), ['export-as']);
  assert.deepEqual(searchCommands(entries, 'xyz'), []);
  assert.equal(searchCommands(entries, '').length, entries.length);
});
