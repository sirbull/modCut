import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PANEL_RAIL, WINDOW_GROUPS, defaultPanelLayout, loadPanelLayout, movePanel, normalizePanelLayout, savePanelLayout, windowGroup } from '../panels/layout.mjs';
import { PANEL_GROUPS } from '../panels/registry.mjs';
import { ESSENTIALS, applyWorkspace, captureWorkspace } from '../ui/workspaces.mjs';

test('panels move between rail, floating windows and closed without duplicating a group', () => {
  const original = defaultPanelLayout();
  let layout = movePanel(original, 'appearance', { to: 'floating', x: 120, y: 80 });
  assert.ok(!layout.rail.includes('appearance'));
  assert.deepEqual(layout.floating.appearance, { x: 120, y: 80 });
  assert.ok(original.rail.includes('appearance'), 'Changing a layout does not mutate saved snapshots');
  layout = movePanel(layout, 'color', { to: 'floating', x: 220, y: 90 });
  assert.deepEqual(Object.keys(layout.floating), ['appearance', 'color'], 'Two independent windows stay open');
  layout = movePanel(layout, 'appearance', { to: 'rail', index: 0 });
  assert.equal(layout.rail[0], 'appearance'); assert.equal(layout.floating.appearance, undefined);
  layout = movePanel(layout, 'appearance', { to: 'rail', index: 3 });
  assert.equal(layout.rail[3], 'appearance'); assert.equal(layout.rail.filter(id => id === 'appearance').length, 1);
  layout = movePanel(layout, 'appearance', { to: 'closed' });
  assert.ok(!layout.rail.includes('appearance')); assert.equal(layout.floating.appearance, undefined);
  assert.equal(windowGroup('graphic-styles').id, 'graphic-styles', 'Each panel travels independently');
  assert.equal(windowGroup('graphic-styles').groupId, 'appearance', 'Related panels share a visual rail group');
});

test('every Window panel can float, including the default dock and menu-only panels', () => {
  for (const { id } of WINDOW_GROUPS) {
    const layout = movePanel(defaultPanelLayout(), id, { to: 'floating' });
    assert.ok(layout.floating[id]); assert.ok(!layout.rail.includes(id)); assert.ok(!layout.dock.includes(id));
  }
  assert.equal(windowGroup('missing'), null);
});

test('stored layout validates IDs, positions and exclusive membership', () => {
  assert.deepEqual(loadPanelLayout({ getItem: () => '{broken' }), defaultPanelLayout());
  assert.deepEqual(normalizePanelLayout({}), defaultPanelLayout());
  const layout = normalizePanelLayout({ version: 2, dock: ['layers', 'layers', 'color'], rail: ['layers', 'color', 'color', 'old-panel'],
    floating: { color: { x: 10, y: 20 }, appearance: { x: 50, y: 80 }, transform: { x: 'bad', y: 20 } } });
  assert.deepEqual(layout, { version: 4, dock: ['layers','color'], columns:[{id:'main',panels:['layers','color'],sizes:[.5,.5],width:286}], rail: [], floating: { appearance: { x: 50, y: 80 } } });
  let stored;
  const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  savePanelLayout(layout, storage); assert.deepEqual(loadPanelLayout(storage), layout);
  assert.doesNotThrow(() => savePanelLayout(layout, { setItem: () => { throw Error('full'); } }));
});

test('the curated default replaces only the untouched former all-panel layout', () => {
  assert.deepEqual(defaultPanelLayout().rail,['color','swatches','stroke','gradient','appearance','transform','align','pathfinder','image-trace']);
  const old={...defaultPanelLayout(),version:3,rail:PANEL_GROUPS.flatMap(g=>g.tabs)};
  assert.deepEqual(normalizePanelLayout(old).rail,[...DEFAULT_PANEL_RAIL]);
  assert.deepEqual(normalizePanelLayout({...old,rail:[...old.rail].reverse()}).rail,[...old.rail].reverse(),'A reordered custom layout stays intact');
  assert.deepEqual(normalizePanelLayout({...old,version:4}).rail,old.rail,'Users may explicitly choose all panels');
  assert.deepEqual(normalizePanelLayout({...old,columns:[{...old.columns[0],width:330}]}).rail,old.rail,'Customized docking dimensions are retained');
});

test('any panel docks between existing panels, or in its own column, without duplicate content', () => {
  let layout=movePanel(defaultPanelLayout(),'stroke',{to:'dock',column:'main',index:1});
  assert.deepEqual(layout.dock,['properties','stroke','layers']);
  assert.ok(!layout.rail.includes('stroke'));
  layout=movePanel(layout,'stroke',{to:'column',columnIndex:0});
  assert.deepEqual(layout.columns.map(c=>c.panels),[['stroke'],['properties','layers']]);
  const second=layout.columns[0].id;
  layout=movePanel(layout,'color',{to:'dock',column:second,index:1});
  assert.deepEqual(layout.columns[0].panels,['stroke','color']);
  layout=movePanel(layout,'properties',{to:'dock',column:second,index:0});
  assert.deepEqual(layout.columns.map(c=>c.panels),[['properties','stroke','color'],['layers']]);
  layout=movePanel(layout,'layers',{to:'floating',x:25,y:50});
  assert.equal(layout.columns.length,1,'An emptied column disappears');
  const all=[...layout.rail,...layout.dock,...Object.keys(layout.floating)];assert.equal(new Set(all).size,all.length);
  for(const c of layout.columns)assert.ok(Math.abs(c.sizes.reduce((a,b)=>a+b,0)-1)<1e-12);
});

test('dock reordering preserves panel proportions and width; invalid stored dimensions recover', () => {
  const original=defaultPanelLayout();original.columns[0].sizes=[.7,.3];original.columns[0].width=340;
  const moved=movePanel(original,'layers',{to:'dock',column:'main',index:0});
  assert.deepEqual(moved.columns[0],{id:'main',panels:['layers','properties'],sizes:[.3,.7],width:340});
  assert.deepEqual(original.columns[0].panels,['properties','layers']);
  const invalid=normalizePanelLayout({...moved,columns:[{id:'x',panels:['stroke','stroke','layers'],sizes:[NaN,-1,0],width:Infinity},{id:'x',panels:['color'],width:9999}]});
  assert.deepEqual(invalid.columns.map(c=>c.panels),[['stroke','layers'],['color']]);
  assert.deepEqual(invalid.columns[0].sizes,[.5,.5]);assert.equal(invalid.columns[0].width,286);assert.equal(invalid.columns[1].width,480);
  assert.notEqual(invalid.columns[0].id,invalid.columns[1].id);
  assert.deepEqual(normalizePanelLayout(invalid),invalid);
});

test('columns on both sides of the icon rail retain their visual order and saved side', () => {
  let layout=movePanel(defaultPanelLayout(),'stroke',{to:'column',side:'before-rail',columnIndex:0});
  layout=movePanel(layout,'color',{to:'column',columnIndex:1});
  assert.deepEqual(layout.columns.map(c=>c.panels),[['stroke'],['color'],['properties','layers']]);
  assert.equal(layout.columns[0].side,'before-rail');
  assert.equal(layout.columns[1].side,undefined);
  assert.deepEqual(normalizePanelLayout(layout),layout);
  layout=movePanel(layout,'stroke',{to:'dock',column:'main',index:1});
  assert.deepEqual(layout.columns.map(c=>c.panels),[['color'],['properties','stroke','layers']]);
});

test('Pathfinder can remain in the rail while Transform and Align are independently closed', () => {
  let layout = defaultPanelLayout();
  assert.deepEqual(layout.rail.slice(layout.rail.indexOf('transform'), layout.rail.indexOf('pathfinder') + 1), ['transform', 'align', 'pathfinder']);
  layout = movePanel(layout, 'transform', { to: 'floating', x: 40, y: 50 });
  assert.ok(layout.rail.includes('align') && layout.rail.includes('pathfinder'));
  layout = movePanel(layout, 'transform', { to: 'closed' });
  layout = movePanel(layout, 'align', { to: 'closed' });
  assert.ok(layout.rail.includes('pathfinder'));
  assert.ok(!layout.rail.includes('transform') && !layout.rail.includes('align'));
  const reopened = movePanel(layout, 'align', { to: 'floating' });
  assert.ok(reopened.floating.align); assert.equal(reopened.floating.transform, undefined);
  assert.ok(reopened.rail.includes('pathfinder'));
});

test('old group layouts migrate once into independent icons, including saved floating groups', () => {
  const migrated = normalizePanelLayout({ rail: ['transform', 'type', 'color'], dock: ['properties', 'layers'], floating: { appearance: { x: 40, y: 60 } } });
  assert.deepEqual(migrated.rail, ['transform', 'align', 'pathfinder', 'character', 'paragraph', 'glyphs', 'color']);
  assert.deepEqual(migrated.floating, { appearance: { x: 40, y: 60 }, 'graphic-styles': { x: 60, y: 84 } });
  assert.ok(!migrated.rail.includes('stroke'), 'Closed groups stay closed');
  assert.deepEqual(normalizePanelLayout(migrated), migrated, 'Migration is idempotent');
  const closedTransform = movePanel(migrated, 'transform', { to: 'closed' });
  assert.deepEqual(normalizePanelLayout(closedTransform), closedTransform, 'A removed panel is not restored by expanding its former group');
});

test('named workspaces restore order, floating positions and closed groups without sharing objects', () => {
  const ui = { panelLayout: movePanel(defaultPanelLayout(), 'color', { to: 'floating', x: 30, y: 70 }) };
  const saved = captureWorkspace(ui, 'Panels');
  ui.panelLayout.floating.color.x = 999;
  const restored = applyWorkspace({}, saved);
  assert.deepEqual(restored.panelLayout.floating.color, { x: 30, y: 70 });
  restored.panelLayout.rail.reverse();
  assert.notDeepEqual(restored.panelLayout.rail, saved.panelLayout.rail);
  applyWorkspace(restored, ESSENTIALS);
  assert.deepEqual(restored.panelLayout, defaultPanelLayout());
});
