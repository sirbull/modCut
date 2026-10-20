import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_WORKSPACES, ESSENTIALS, WORKSPACE_FILE_MAX_BYTES, applyWorkspace, captureWorkspace, deleteWorkspace, loadWorkspaces, saveWorkspace, parseWorkspace, serializeWorkspace, workspaceForExport } from '../ui/workspaces.mjs';
import { defaultPanelLayout, movePanel } from '../panels/layout.mjs';
import { PANEL_GROUPS } from '../panels/registry.mjs';

const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) }; };
test('workspaces are captured, saved by name, applied and deleted', () => {
  const storage = memory(), ui = { flyout: 'stroke', groupTabs: { stroke: 'gradient' }, dockSplit: .4, dockCollapsed: { layers: true }, controlBar: false, tool: 'pen' };
  const ws = captureWorkspace(ui, ' Laser ');
  assert.equal(ws.name, 'Laser'); assert.throws(() => captureWorkspace(ui, ''), /Name/); assert.throws(() => captureWorkspace(ui, 'essentials'), /built in/);
  saveWorkspace(ws, storage); saveWorkspace({ ...ws, dockSplit: .6 }, storage);
  assert.equal(loadWorkspaces(storage).length, 1, 'Saving again under the same name replaces it');
  const fresh = applyWorkspace({ tool: 'pen' }, loadWorkspaces(storage)[0]);
  assert.deepEqual([fresh.flyout, fresh.groupTabs.stroke, fresh.dockSplit, fresh.controlBar, fresh.tool, fresh.workspace], ['stroke', 'gradient', .6, false, 'pen', 'Laser']);
  assert.equal(applyWorkspace({ flyout: 'x' }, ESSENTIALS).flyout, null);
  assert.deepEqual(deleteWorkspace('Laser', storage), []);
});

test('portable workspace files preserve rail, floating positions, docking columns and view preferences', () => {
  let layout=movePanel(defaultPanelLayout(),'color',{to:'floating',x:230,y:74});
  layout=movePanel(layout,'stroke',{to:'column',side:'before-rail',columnIndex:0});
  layout.columns[0].width=325;
  const ui={workspace:'My setup',panelLayout:layout,controlBar:false,dockCollapsed:{layers:true},tool:'pen',document:{secret:'artwork'}};
  const ws=workspaceForExport(ui),text=serializeWorkspace(ws),loaded=parseWorkspace(text);
  assert.deepEqual(loaded,ws);
  assert.ok(!text.includes('artwork')&&!text.includes('secret')&&!text.includes('"tool"'));
  const restored=applyWorkspace({tool:'pen'},loaded,memory());
  assert.deepEqual(restored.panelLayout,layout);assert.equal(restored.tool,'pen');assert.equal(restored.controlBar,false);
  assert.deepEqual(parseWorkspace('\uFEFF'+text),ws,'UTF-8 BOM files also load');
});

test('invalid and unrelated files are rejected before a workspace is applied', () => {
  const text=serializeWorkspace(workspaceForExport({}));
  for(const bad of ['{broken','{}','null',JSON.stringify({format:'modcut-workspace',version:99}),text.replace('"rail": [','"rail": null,"unused": [')])
    assert.throws(()=>parseWorkspace(bad),/Invalid workspace/);
  assert.throws(()=>parseWorkspace(' '.repeat(WORKSPACE_FILE_MAX_BYTES+1)),/Invalid workspace/);
  const raw=JSON.parse(text);raw.workspace.name='';assert.throws(()=>parseWorkspace(JSON.stringify(raw)),/Name the workspace/);
});

test('task presets are distinct and applying them cannot mutate their defaults', () => {
  const layouts=BUILTIN_WORKSPACES.map(ws=>JSON.stringify(applyWorkspace({},ws,memory()).panelLayout.rail));
  assert.equal(new Set(layouts).size,BUILTIN_WORKSPACES.length);
  for(const ws of BUILTIN_WORKSPACES){
    assert.throws(()=>captureWorkspace({},ws.name),/built in/);
    const ui=applyWorkspace({},ws,memory());ui.panelLayout.rail.reverse();
    assert.equal(JSON.stringify(applyWorkspace({},ws,memory()).panelLayout.rail),layouts[BUILTIN_WORKSPACES.indexOf(ws)]);
  }
  assert.equal(workspaceForExport({workspace:'Essentials'}).name,'Essentials (custom)');
});

test('explicit named and portable workspaces retain their former all-panel selection', () => {
  const rail=PANEL_GROUPS.flatMap(g=>g.tabs),old={name:'All tools',panelLayout:{...defaultPanelLayout(),version:3,rail}};
  assert.deepEqual(applyWorkspace({},old,memory()).panelLayout.rail,rail);
  assert.deepEqual(parseWorkspace(serializeWorkspace(old)).panelLayout.rail,rail);
});
