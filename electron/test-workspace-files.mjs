import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { registerWorkspaceFiles } from './workspace-files.mjs';
import { WORKSPACE_FILE_MAX_BYTES, workspaceForExport } from '../renderer/draw/ui/workspaces.mjs';

async function harness(t) {
  const directory=await mkdtemp(join(tmpdir(),'modcut-workspaces-'));
  assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const handlers=new Map(),sender={},win={webContents:sender},saved=[],opened=[];
  const dialog={saveResult:{filePath:join(directory,'Portable')},loadResult:{filePaths:[join(directory,'Portable.modcut-workspace')]},
    async showSaveDialog(_,options){saved.push(options);return this.saveResult;},
    async showOpenDialog(_,options){opened.push(options);return this.loadResult;}};
  registerWorkspaceFiles({ipcMain:{handle:(id,fn)=>handlers.set(id,fn)},dialog,getWindow:()=>win});
  return {directory,dialog,saved,opened,handlers,call:(id,...args)=>handlers.get(id)({sender},...args)};
}
test('native workspace dialogs round trip a chosen portable file',async t=>{
  const h=await harness(t),ws=workspaceForExport({});
  const saved=await h.call('saveWorkspaceFile',ws);
  assert.equal(saved.name,'Portable');
  const text=await readFile(join(h.directory,'Portable.modcut-workspace'),'utf8');
  assert.equal(JSON.parse(text).format,'modcut-workspace');
  assert.deepEqual(await h.call('loadWorkspaceFile'),saved);
  assert.deepEqual(h.saved[0].filters[0].extensions,['modcut-workspace']);
  assert.deepEqual(h.opened[0].properties,['openFile']);
});
test('cancelled dialogs and unauthorized callers leave files alone',async t=>{
  const h=await harness(t);h.dialog.saveResult={canceled:true};h.dialog.loadResult={canceled:true};
  assert.equal(await h.call('saveWorkspaceFile',workspaceForExport({})),null);
  assert.equal(await h.call('loadWorkspaceFile'),null);
  assert.equal(await h.handlers.get('saveWorkspaceFile')({sender:{}},{}),null);
  assert.equal(await h.handlers.get('loadWorkspaceFile')({sender:{}}),null);
  assert.deepEqual(await readdir(h.directory),[]);
});
test('invalid and oversized files do not load',async t=>{
  const h=await harness(t),path=join(h.directory,'Portable.modcut-workspace');
  await writeFile(path,'{"some":"other file"}');await assert.rejects(h.call('loadWorkspaceFile'),/Invalid workspace/);
  await writeFile(path,Buffer.alloc(WORKSPACE_FILE_MAX_BYTES+1));await assert.rejects(h.call('loadWorkspaceFile'),/too large/);
});
