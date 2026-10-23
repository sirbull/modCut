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
  const {createGoogleFonts}=await import(pathToFileURL(join(target,'electron','google-fonts.mjs')));
  const google=createGoogleFonts({directory:join(target,'font-cache'),fetcher:async()=>{throw new Error('Packaged catalog must work offline.');}});
  const googleCatalog=await google.list();if(googleCatalog.families.length<1900)throw new Error('The packaged Google Fonts catalog is missing.');
  const fonts=createFontService(),catalog=await fonts.list();
  const face=catalog.find(f=>['Arial','Helvetica','DejaVu Sans','Liberation Sans'].includes(f.family)&&f.fontWeight==='normal'&&f.fontStyle==='normal');
  if(face) {
    const layout=await fonts.shape({text:'AV fi ÆØÅ',fontFamily:face.family,fontPostscriptName:face.postscriptName,fontWeight:'normal',fontStyle:'normal',fontSize:24,leading:28.8,alignment:'left'});
    if(!layout.glyphs.some(g=>g.subpaths.length))throw new Error('Packaged font engine returned no glyphs.');
    const area=await fonts.shape({text:'AV fi Horten Horten',kind:'area',frameWidth:25,frameHeight:100,fontFamily:face.family,fontPostscriptName:face.postscriptName,fontWeight:'normal',fontStyle:'normal',fontSize:24,leading:28.8,alignment:'left'});
    if(area.overflow||area.lineWidths.length<2||!area.glyphs.length)throw new Error('Packaged area text wrapping failed.');
  }
  console.log(`Packaged font engine passed (${catalog.length} installed faces, ${googleCatalog.families.length} Google families${face?', glyph layout verified':''}).`);
} finally {
  const absolute=resolve(target),temporary=resolve(tmpdir())+sep;
  if(!absolute.startsWith(temporary)||!basename(absolute).startsWith('modcut-font-package-'))throw new Error('Refusing to remove an unexpected extraction path.');
  rmSync(absolute,{recursive:true,force:true});
}
