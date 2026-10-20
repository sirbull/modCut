import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir,mkdtemp,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { create } from 'fontkit';
import { createGoogleFonts,parseGoogleManifest } from './google-fonts.mjs';
import { fontDigest,fetchFontResource } from './google-fonts-catalog.mjs';
import { createFontService,systemFontDirectories } from './font-service.mjs';
import { pointText,DEFAULT_CHARACTER } from '../renderer/draw/doc/text.mjs';
import { createDocument,validateDocument } from '../renderer/draw/doc/schema.mjs';
import { hasTextLayout } from '../renderer/draw/doc/text-layout.mjs';
import { variableMetadata } from './font-metadata.mjs';

const license='Test fixture license text. '.repeat(20),url='https://fonts.gstatic.com/s/modcut-test/v1/font.ttf';
const manifest={manifest:{files:[{filename:'OFL.txt',contents:license}],fileRefs:[{filename:'Font-Regular.ttf',url}]}};
test('unnamed variable-font instances keep their coordinates instead of crashing font enumeration',()=>{
  const data=variableMetadata({fvar:{axis:[{axisTag:'wght',minValue:100,defaultValue:400,maxValue:900}],instance:[{coord:[650]}]}});
  assert.equal(data.axes.wght.name,'wght');assert.deepEqual(Object.values(data.instances),[{wght:650}]);
});
let bytes;
for(const directory of systemFontDirectories()) {
  let files;try{files=await readdir(directory,{recursive:true});}catch{continue;}
  for(const file of files.filter(f=>/arial\.ttf$|DejaVuSans\.ttf$|LiberationSans-Regular\.ttf$/i.test(f)))try{const value=await readFile(join(directory,file)),font=create(value);if(font.hasGlyphForCodePoint(65)){bytes=value;break;}}catch{}
  if(bytes)break;
}

test('Google download manifests retain licenses, prefer complete variable fonts and reject foreign files',()=>{
  const withVariable=structuredClone(manifest);withVariable.manifest.fileRefs[0].filename='Font-VariableFont_wght.ttf';withVariable.manifest.fileRefs.push({filename:'static/Font-Bold.ttf',url});
  assert.equal(parseGoogleManifest(withVariable).files.length,1);assert.equal(parseGoogleManifest(manifest).license,license);
  assert.throws(()=>parseGoogleManifest({manifest:{files:[],fileRefs:[]}}),/license/);
  const foreign=structuredClone(manifest);foreign.manifest.fileRefs[0].url='https://example.com/font.ttf';assert.throws(()=>parseGoogleManifest(foreign),/invalid font files/);
});
test('font downloads refuse untrusted hosts and excessive response bodies',async()=>{
  let called=false;
  await assert.rejects(fetchFontResource('file:///private.ttf',{fetcher:()=>{called=true;}}),/Unexpected/);assert.equal(called,false);
  await assert.rejects(fetchFontResource(url,{maxBytes:3,fetcher:async()=>new Response('1234')}),/too large/);
});
test('Google family download is shared, licensed, reusable offline and portable by content hash',{skip:!bytes},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'modcut-google-test-'));let requests=0;
  const fetcher=async u=>{requests++;return new Response(u.includes('/download/list?')?")]}'\n"+JSON.stringify(manifest):bytes);};
  const google=createGoogleFonts({directory,fetcher}),catalog=await google.list();assert.ok(catalog.families.length>=1900);assert.equal(requests,0);
  const [a,b]=await Promise.all([google.details('Roboto'),google.details('Roboto')]);assert.deepEqual(a,b);assert.equal(requests,2);
  const ref=a.faces[0].reference;assert.equal(ref.sha256,fontDigest(bytes));assert.equal(await readFile(join(directory,ref.sha256+'.license.txt'),'utf8'),license);
  const offline=createGoogleFonts({directory,fetcher:async()=>{throw new Error('Offline');}}),service=createFontService({directories:[],google:offline});
  const values={...DEFAULT_CHARACTER,text:'AV fi ÆØÅ',fontSource:'google',fontFamily:'Roboto',alignment:'left'};
  const layout=await service.shape(values),node=pointText([10,20],{...values,googleFont:layout.font.reference,fontPostscriptName:layout.font.postscriptName});node.layout=layout;
  assert.equal(hasTextLayout(node),true);const data=createDocument();data.layers[0].children=[node];assert.deepEqual(validateDocument(data),[]);
  const mixedValues={...values,googleFont:ref,fontPostscriptName:layout.font.postscriptName,text:'AV',runs:[{text:'A',character:{fontFamily:'Lora',fontSource:'google',googleFont:{...ref,family:'Lora'}}},{text:'V'}]};
  const mixed=pointText([0,0],mixedValues);mixed.layout=await service.shape(mixedValues);
  data.layers[0].children=[mixed];assert.deepEqual(validateDocument(data),[]);assert.equal(hasTextLayout(mixed),true);
  assert.equal(mixed.content.runs[0].character.googleFont.family,'Lora','A selected range keeps its own portable Google reference');
  const newDirectory=await mkdtemp(join(tmpdir(),'modcut-google-portable-')),remote=createGoogleFonts({directory:newDirectory,fetcher});
  const portable=await createFontService({directories:[],google:remote}).shape({...values,googleFont:ref});assert.deepEqual(portable.glyphs,layout.glyphs);
  const bad=createGoogleFonts({directory:await mkdtemp(join(tmpdir(),'modcut-google-corrupt-')),fetcher:async()=>new Response('changed')});
  await assert.rejects(bad.resolve({...values,googleFont:ref}),/version changed/);
  await writeFile(join(directory,'catalog.json'),'{}');assert.ok((await createGoogleFonts({directory}).list()).families.length>=1900);
});
