import test from 'node:test';
import assert from 'node:assert/strict';
import { createFontService,systemFontDirectories } from './font-service.mjs';
import { DEFAULT_CHARACTER,pointText,textToOutlines } from '../renderer/draw/doc/text.mjs';
import { createDocument,validateDocument } from '../renderer/draw/doc/schema.mjs';
import { hasTextLayout } from '../renderer/draw/doc/text-layout.mjs';
import { createProjectDraw } from '../renderer/draw/io/project.mjs';

const service=createFontService(),faces=await service.list();
const latin=faces.find(f=>['Arial','DejaVu Sans','Liberation Sans','Helvetica'].includes(f.family)&&f.fontWeight==='normal'&&f.fontStyle==='normal');
const values=(face,text='AV fi ÆØÅ æøå')=>({text,...DEFAULT_CHARACTER,fontFamily:face.family,fontWeight:face.fontWeight,fontStyle:face.fontStyle,fontPostscriptName:face.postscriptName,alignment:'left'});
test('font roots cover system and per-user locations on all three platforms',()=>{
  assert.equal(systemFontDirectories('darwin',{},'/user').length,3);
  assert.equal(systemFontDirectories('linux',{},'/user').length,4);
  assert.equal(systemFontDirectories('win32',{WINDIR:'C:/Windows',LOCALAPPDATA:'C:/User/AppData'}).length,2);
});
test('font catalog exposes metadata without filesystem paths; unknown names never become file reads',async()=>{
  assert.ok(faces.every(f=>!('path'in f)&&f.family&&f.postscriptName));
  await assert.rejects(service.shape({...DEFAULT_CHARACTER,text:'Hello',fontFamily:'../../private/file',alignment:'left'}),/not installed/);
  assert.deepEqual(await createFontService({directories:[]}).list(),[]);
});
test('TrueType text has finite closed outlines, kerning, exact alignment and stable round trips',{skip:!latin},async()=>{
  const v=values(latin),layout=await service.shape(v),node=pointText([10,20],v);node.layout=layout;
  const d=createDocument();d.layers[0].children.push(node);assert.deepEqual(validateDocument(d),[]);assert.equal(hasTextLayout(node),true);
  assert.ok(layout.glyphs.flatMap(g=>g.subpaths).every(p=>p.closed&&p.segments.every(s=>[...s.p,...s.in,...s.out].every(Number.isFinite))));
  const roundtrip=JSON.parse(JSON.stringify(node)),group=textToOutlines(roundtrip);assert.deepEqual(roundtrip,node);
  assert.equal(group.id,node.id);assert.deepEqual(group.transform,node.transform);
  assert.deepEqual(group.children.flatMap(line=>line.children.map(g=>g.subpaths)),layout.glyphs.filter(g=>g.subpaths.length).map(g=>g.subpaths));
  const restored=createProjectDraw(JSON.parse(JSON.stringify(d)));assert.equal(restored.document.readOnly,false);
  await assert.rejects(createFontService({directories:[]}).shape(v),/not installed/);
  assert.equal(textToOutlines(restored.document.getNode(node.id)).children.length,1,'Saved outlines still work when the original font is unavailable');
});
test('layout uses kerning and the same glyph coordinates for left/center/right and multiline',{skip:!latin},async()=>{
  const v=values(latin,'AV'),left=await service.shape(v),center=await service.shape({...v,alignment:'center'}),right=await service.shape({...v,alignment:'right'});
  const x=l=>l.glyphs[0].subpaths[0].segments[0].p[0];
  assert.ok(Math.abs(x(left)-x(center)-left.lineWidths[0]/2)<1e-10);
  assert.ok(Math.abs(x(left)-x(right)-left.lineWidths[0])<1e-10);
  const a=await service.shape({...v,text:'A'}),b=await service.shape({...v,text:'V'});
  assert.ok(left.lineWidths[0]<a.lineWidths[0]+b.lineWidths[0],'AV is kerned');
  const multi=await service.shape({...v,text:'A\nA'});
  assert.ok(Math.abs(multi.glyphs[1].subpaths[0].segments[0].p[1]-multi.glyphs[0].subpaths[0].segments[0].p[1]-v.leading*25.4/72)<1e-10);
  await assert.rejects(service.shape({...v,text:String.fromCodePoint(0x10ffff)}),/every character/);
  await assert.rejects(service.shape({...v,fontPostscriptName:'MissingFace'}),/not installed/);
});
const otf=faces.find(f=>f.format==='otf');
test('installed OpenType/CFF fonts can produce editable glyph outlines',{skip:!otf},async()=>{
  const layout=await service.shape(values(otf,'AV fi'));assert.ok(layout.glyphs.some(g=>g.subpaths.length));
});
const collection=faces.find(f=>['ttc','otc'].includes(f.format));
test('font collections resolve the selected face by PostScript name',{skip:!collection},async()=>{
  const layout=await service.shape(values(collection,'AV'));assert.equal(layout.font.postscriptName,collection.postscriptName);assert.ok(layout.glyphs.some(g=>g.subpaths.length));
});
const ligature=faces.find(f=>['Calibri','DejaVu Serif'].includes(f.family)&&f.fontWeight==='normal'&&f.fontStyle==='normal');
test('default OpenType shaping retains the fi ligature as one editable glyph',{skip:!ligature},async()=>{
  const layout=await service.shape(values(ligature,'fi'));assert.equal(layout.glyphs.length,1);assert.ok(layout.glyphs[0].subpaths.length);
});
