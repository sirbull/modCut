import test from 'node:test';
import assert from 'node:assert/strict';
import { ESSENTIALS, applyWorkspace, captureWorkspace, deleteWorkspace, loadWorkspaces, saveWorkspace } from '../ui/workspaces.mjs';

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
