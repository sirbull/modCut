import test from 'node:test';
import assert from 'node:assert/strict';
import { DOCK_PANELS, PANEL_DEFINITIONS, PANEL_GROUPS, clampDockSplit, groupForPanel, panelAvailable } from '../panels/registry.mjs';

test('every non-dock panel belongs to exactly one rail group', () => {
  const grouped = PANEL_GROUPS.flatMap(group => group.tabs);
  assert.equal(new Set(grouped).size, grouped.length, 'no panel appears twice');
  for (const panel of PANEL_DEFINITIONS) {
    if (DOCK_PANELS.includes(panel.id)) assert.equal(groupForPanel(panel.id), null, `${panel.id} is docked, not in the rail`);
    else assert.ok(groupForPanel(panel.id), `${panel.id} has a rail group`);
  }
  assert.equal(groupForPanel('align').id, 'transform');
  assert.equal(groupForPanel('missing'), null);
});

test('dock split keeps both halves usable', () => {
  assert.equal(clampDockSplit(.5, 800), .5);
  assert.equal(clampDockSplit(.01, 600), .2, 'Properties keeps 120 px');
  assert.equal(clampDockSplit(.99, 600), .8, 'Layers keeps 120 px');
  assert.equal(clampDockSplit(NaN, 600), .5, 'invalid stored value falls back to half');
  assert.equal(clampDockSplit(.9, 200), .5, 'too short to split: even halves');
});

test('every listed tab is built now, and every group has an available tab', () => {
  assert.equal(panelAvailable('gradient'), true, 'Gradient arrived in D2.3');
  assert.equal(panelAvailable('transparency'), true);
  assert.deepEqual(groupForPanel('transparency').tabs, ['stroke', 'gradient', 'transparency']);
  for (const group of PANEL_GROUPS) assert.ok(group.tabs.some(panelAvailable), `${group.id} has a usable tab`);
});
