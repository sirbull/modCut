/** Import the font engine from the actual archive, not the developer's node_modules. */
import asar from '@electron/asar';
import { existsSync,mkdtempSync,readdirSync,rmSync } from 'node:fs';
import { basename,join,resolve,sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

function find(directory) {
  if(!existsSync(directory))return null;
  for(const entry of readdirSync(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name);
    if(entry.isFile()&&entry.name==='app.asar')return path;
    if(entry.isDirectory()){const found=find(path);if(found)return found;}
  }
  return null;
}
const archive=find(resolve('dist'));if(!archive)throw new Error('Packaged app.asar was not found.');
const target=mkdtempSync(join(tmpdir(),'modcut-font-package-'));
try {
  asar.extractAll(archive,target);
  const {createFontService}=await import(pathToFileURL(join(target,'electron','font-service.mjs')));
  const fonts=createFontService(),catalog=await fonts.list();
  const face=catalog.find(f=>['Arial','Helvetica','DejaVu Sans','Liberation Sans'].includes(f.family)&&f.fontWeight==='normal'&&f.fontStyle==='normal');
  if(face) {
    const layout=await fonts.shape({text:'AV fi ÆØÅ',fontFamily:face.family,fontPostscriptName:face.postscriptName,fontWeight:'normal',fontStyle:'normal',fontSize:24,leading:28.8,alignment:'left'});
    if(!layout.glyphs.some(g=>g.subpaths.length))throw new Error('Packaged font engine returned no glyphs.');
  }
  console.log(`Packaged font engine passed (${catalog.length} installed faces${face?', glyph layout verified':''}).`);
} finally {
  const absolute=resolve(target),temporary=resolve(tmpdir())+sep;
  if(!absolute.startsWith(temporary)||!basename(absolute).startsWith('modcut-font-package-'))throw new Error('Refusing to remove an unexpected extraction path.');
  rmSync(absolute,{recursive:true,force:true});
}
