import { readFile,writeFile,mkdir,rename,unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { create } from 'fontkit';
import { downloadGoogleCatalog,fetchFontResource,fontDigest,googleJSON } from './google-fonts-catalog.mjs';
import { validGoogleReference } from '../renderer/draw/doc/font-reference.mjs';
import { variableMetadata } from './font-metadata.mjs';

const safeName=name=>typeof name==='string'&&/^[\w .,[\]()-]+\.(ttf|otf)$/i.test(name)&&!name.includes('..');
/** Family download manifests include full fonts and original licenses; no text is sent to Google. */
export function parseGoogleManifest(value) {
  const m=value?.manifest;
  if(!Array.isArray(m?.fileRefs)||!Array.isArray(m?.files))throw new Error('Google Fonts returned an unsupported download manifest.');
  const licenses=m.files.filter(f=>/^(OFL|LICENSE|LICENCE|UFL)\.txt$/i.test(f.filename));
  if(!licenses.length||licenses.some(f=>typeof f.contents!=='string'||f.contents.length<100||f.contents.length>100000))throw new Error('The font license is missing.');
  const all=m.fileRefs.filter(f=>/\.(ttf|otf)$/i.test(f.filename)),variable=all.filter(f=>/VariableFont|\[[^\]]+\]/i.test(f.filename));
  const italic=f=>/italic|oblique/i.test(f.filename);
  const selected=variable.length?[...variable,...all.filter(f=>!variable.includes(f)&&!variable.some(v=>italic(v)===italic(f)))]:all;
  const files=selected.map(f=>({filename:f.filename.split('/').at(-1),url:f.url}));
  if(!files.length||files.length>100||files.some(f=>!safeName(f.filename)||!/^https:\/\/fonts\.gstatic\.com\/s\/[\w/.,%-]+\.(ttf|otf)$/.test(f.url)))throw new Error('Google Fonts returned invalid font files.');
  return {files,license:licenses.map(f=>f.contents).join('\n\n')};
}
export function createGoogleFonts({directory,fetcher=fetch,catalogPath=new URL('../assets/google-fonts-catalog.json',import.meta.url)}={}) {
  let catalogPromise;const families=new Map(),inflight=new Map(),parsed=new Map();
  async function atomic(path,data){await mkdir(directory,{recursive:true});const temp=path+'.'+randomUUID()+'.tmp';try{await writeFile(temp,data);await rename(temp,path);}finally{await unlink(temp).catch(()=>{});}}
  async function list({refresh=false}={}) {
    if(refresh){const next=await downloadGoogleCatalog({fetcher});await atomic(join(directory,'catalog.json'),JSON.stringify(next));catalogPromise=Promise.resolve(next);}
    catalogPromise??=(async()=>{const valid=data=>data?.version===1&&Array.isArray(data.families)&&data.families.length>=1000;let data;
      try{data=JSON.parse(await readFile(join(directory,'catalog.json'),'utf8'));if(!valid(data))data=null;}catch{}
      if(!data)data=JSON.parse(await readFile(catalogPath,'utf8'));
      if(!valid(data))throw new Error('Invalid Google Fonts catalog.');return data;})();
    return catalogPromise;
  }
  async function font(reference) {
    if(!validGoogleReference(reference))throw new Error('Invalid Google font reference.');
    if(parsed.has(reference.sha256))return parsed.get(reference.sha256);
    const path=join(directory,reference.sha256+'.font');let bytes;
    try{bytes=await readFile(path);if(fontDigest(bytes)!==reference.sha256)bytes=null;}catch{}
    if(!bytes){bytes=await fetchFontResource(reference.url,{fetcher,maxBytes:64*1024*1024});if(fontDigest(bytes)!==reference.sha256)throw new Error('The downloaded font version changed. Choose the font again.');await atomic(path,bytes);}
    if(!parsed.has(reference.sha256)){if(parsed.size>=12)parsed.delete(parsed.keys().next().value);parsed.set(reference.sha256,create(bytes));}
    await atomic(join(directory,reference.sha256+'.license.txt'),reference.license);
    return parsed.get(reference.sha256);
  }
  async function details(name) {
    const catalog=await list(),entry=catalog.families.find(f=>f.family===name);if(!entry)throw new Error('Choose a family from the Google Fonts catalog.');
    if(families.get(name)?.catalogRevision===catalog.revision)return families.get(name);
    if(inflight.has(name))return inflight.get(name);
    const pending=(async()=>{
      const key=fontDigest(name);let saved;
      try{saved=JSON.parse(await readFile(join(directory,key+'.family.json'),'utf8'));if(saved.family!==name||saved.catalogRevision!==catalog.revision||!saved.faces?.length||saved.faces.some(f=>!validGoogleReference(f.reference)))saved=null;}catch{}
      if(saved){families.set(name,saved);return saved;}
      const manifest=parseGoogleManifest(googleJSON(await fetchFontResource('https://fonts.google.com/download/list?family='+encodeURIComponent(name),{fetcher})));
      const faces=[];let totalBytes=0;
      for(const file of manifest.files) {
        const bytes=await fetchFontResource(file.url,{fetcher,maxBytes:64*1024*1024}),sha256=fontDigest(bytes);
        totalBytes+=bytes.length;if(totalBytes>256*1024*1024)throw new Error('This font family is too large to download.');
        const reference={family:name,url:file.url,sha256,license:manifest.license};
        await atomic(join(directory,sha256+'.font'),bytes);const source=await font(reference);
        const weight=source['OS/2']?.usWeightClass??400,style=source.italicAngle||/italic|oblique/i.test(source.subfamilyName??'')?'italic':'normal';
        faces.push({family:name,postscriptName:source.postscriptName,style:source.subfamilyName??'Regular',weight,fontStyle:style,...variableMetadata(source),reference});
      }
      const result={family:name,catalogRevision:catalog.revision,faces};await atomic(join(directory,key+'.family.json'),JSON.stringify(result));families.set(name,result);return result;
    })();inflight.set(name,pending);
    try{return await pending;}finally{inflight.delete(name);}
  }
  async function resolve(values) {
    let reference=values.googleFont;
    if(reference) {if(reference.family!==values.fontFamily)throw new Error('The saved font reference does not match its family.');}
    else {
      const family=await details(values.fontFamily),weight=values.fontWeight==='bold'?700:values.fontWeight==='normal'?400:values.fontWeight;
      const choices=family.faces.filter(f=>f.fontStyle===values.fontStyle&&(!values.fontPostscriptName||f.postscriptName===values.fontPostscriptName));
      const face=choices.sort((a,b)=>{
        const distance=f=>f.axes.wght&&weight>=f.axes.wght.min&&weight<=f.axes.wght.max?0:Math.abs(f.weight-weight);
        return distance(a)-distance(b);
      })[0];
      if(!face)throw new Error('This Google font has no matching style. Choose an available style.');reference=face.reference;
    }
    const source=await font(reference);
    return {font:source,face:{family:reference.family,style:source.subfamilyName??'Regular',postscriptName:source.postscriptName,source:'google',reference}};
  }
  return {list,details,resolve};
}
