import { readFile, writeFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseWorkspace, serializeWorkspace, WORKSPACE_FILE_MAX_BYTES } from '../renderer/draw/ui/workspaces.mjs';

/** Native dialogs choose all paths. The renderer sends/receives only workspace data. */
export function registerWorkspaceFiles({ ipcMain, dialog, getWindow, isE2E=false, e2eExports=[] }) {
  const authorized = event => event.sender === getWindow()?.webContents;
  let fixture = null;
  if (isE2E) ipcMain.handle('setE2EWorkspaceFile',(event,text)=>{ if(!authorized(event))return false;fixture=text;return true; });
  ipcMain.handle('saveWorkspaceFile',async(event,workspace)=>{
    if(!authorized(event))return null;
    let ws=parseWorkspace(serializeWorkspace(workspace));
    const suggested=ws.name.replace(/[\\/:*?"<>|]/g,'-')+'.modcut-workspace';
    const result=isE2E ? {filePath:suggested} : await dialog.showSaveDialog(getWindow(),{
      title:'Save Current Workspace',defaultPath:suggested,filters:[{name:'modCut workspace',extensions:['modcut-workspace']}],
    });
    if(result.canceled||!result.filePath)return null;
    let path=result.filePath;if(!path.toLowerCase().endsWith('.modcut-workspace'))path+='.modcut-workspace';
    ws=parseWorkspace(serializeWorkspace({...ws,name:basename(path).slice(0,-'.modcut-workspace'.length)}));
    const text=serializeWorkspace(ws);
    if(Buffer.byteLength(text)>WORKSPACE_FILE_MAX_BYTES)throw new Error('Workspace file is too large.');
    if(isE2E)e2eExports.push({name:basename(path),format:'modcut-workspace',size:Buffer.byteLength(text),text});
    else await writeFile(path,text,'utf8');
    return ws;
  });
  ipcMain.handle('loadWorkspaceFile',async event=>{
    if(!authorized(event))return null;
    if(isE2E){const text=fixture;fixture=null;return text===null ? null : parseWorkspace(text);}
    const result=await dialog.showOpenDialog(getWindow(),{title:'Load Workspace',properties:['openFile'],
      filters:[{name:'modCut workspace',extensions:['modcut-workspace','json']}],
    });
    const path=result.filePaths?.[0];if(result.canceled||!path)return null;
    if((await stat(path)).size>WORKSPACE_FILE_MAX_BYTES)throw new Error('Workspace file is too large.');
    return parseWorkspace(await readFile(path,'utf8'));
  });
}
