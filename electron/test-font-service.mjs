import test from 'node:test';
import assert from 'node:assert/strict';
import { createFontService,systemFontDirectories } from './font-service.mjs';
import { DEFAULT_CHARACTER,pointText,pathText,textToOutlines } from '../renderer/draw/doc/text.mjs';
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
test('horizontal and vertical scale, baseline shift and kerning shape the glyphs and are validated',{skip:!latin},async()=>{
  const v=values(latin,'AV'),plain=await service.shape(v),wide=await service.shape({...v,horizontalScale:200}),tall=await service.shape({...v,verticalScale:200});
  assert.ok(Math.abs(wide.lineWidths[0]-plain.lineWidths[0]*2)<1e-9,'Horizontal scale doubles the advances');
  const ys=l=>l.glyphs.flatMap(g=>g.subpaths.flatMap(s=>s.segments.map(x=>x.p[1]))),top=l=>Math.min(...ys(l));
  assert.ok(Math.abs(top(tall)-2*top(plain))<1e-9,'Vertical scale doubles the height above the baseline');
  assert.equal(tall.lineWidths[0],plain.lineWidths[0],'Vertical scale keeps the advances');
  const shifted=await service.shape({...v,baselineShift:10});
  assert.ok(Math.abs(top(plain)-top(shifted)-10*25.4/72)<1e-9,'Baseline shift raises the glyphs by the points given');
  const unkerned=await service.shape({...v,kerning:'none'});
  assert.ok(unkerned.lineWidths[0]>plain.lineWidths[0],'Without kerning AV is wider');
  const node=pointText([0,0],{...v,horizontalScale:150,verticalScale:100,baselineShift:2,kerning:'none'});
  assert.deepEqual([node.character.horizontalScale,node.character.verticalScale,node.character.baselineShift,node.character.kerning],[150,undefined,2,'none']);
  node.layout=await service.shape({...v,horizontalScale:150,baselineShift:2,kerning:'none'});const data=createDocument();data.layers[0].children=[node];assert.deepEqual(validateDocument(data),[]);
  node.character.kerning='optical';assert.ok(validateDocument(data).some(e=>e.path.endsWith('.kerning')));
  assert.throws(()=>pointText([0,0],{...v,horizontalScale:0}),/Horizontal scale/);
});
test('paragraphs: justified area text, indents and space between paragraphs',{skip:!latin},async()=>{
  const v=values(latin,'Horten'),one=await service.shape(v),mm=25.4/72,frame=one.lineWidths[0]*2.6;
  const area={...v,text:'Horten Horten Horten',kind:'area',frameWidth:frame,frameHeight:100};
  const right=l=>Math.max(...l.glyphs.filter(g=>g.line===0).flatMap(g=>g.subpaths.flatMap(s=>s.segments.map(x=>x.p[0]))));
  const plain=await service.shape(area),justified=await service.shape({...area,alignment:'justify'});
  assert.equal(justified.lineWidths.length,2);
  assert.ok(right(justified)>right(plain)+1,'Justify spreads the first line towards the right edge');
  assert.ok(right(justified)<=frame+1e-6,'and keeps it inside the frame');
  const firstX=l=>Math.min(...l.glyphs.filter(g=>g.line===1).flatMap(g=>g.subpaths.flatMap(s=>s.segments.map(x=>x.p[0]))));
  assert.ok(Math.abs(firstX(justified)-firstX(plain))<1e-9,'The last line stays left aligned');
  const indented=await service.shape({...area,leftIndent:10,firstLineIndent:5});
  const x0=(l,line)=>Math.min(...l.glyphs.filter(g=>g.line===line).flatMap(g=>g.subpaths.flatMap(s=>s.segments.map(x=>x.p[0]))));
  assert.ok(Math.abs(x0(indented,0)-x0(plain,0)-15*mm)<1e-9,'Left plus first-line indent');
  const point={...v,text:'A\nA'},tight=await service.shape(point),spaced=await service.shape({...point,spaceBefore:6,spaceAfter:4});
  const y0=(l,line)=>Math.max(...l.glyphs.filter(g=>g.line===line).flatMap(g=>g.subpaths.flatMap(s=>s.segments.map(x=>x.p[1]))));
  assert.ok(Math.abs((y0(spaced,1)-y0(spaced,0))-(y0(tight,1)-y0(tight,0))-10*mm)<1e-9,'Space before and after separate paragraphs');
  const node=pointText([0,0],{...v,alignment:'justify',leftIndent:3});assert.deepEqual(node.paragraph,{alignment:'justify',leftIndent:3});
});
test('mixed styles: runs keep their own size, weight and shift, wrap together and are validated',{skip:!latin},async()=>{
  const v=values(latin,'Big small'),plain=await service.shape(v);
  const runs=[{text:'Big',character:{fontSize:v.fontSize*2}},{text:' small'}];
  const mixed=await service.shape({...v,runs}),node=pointText([0,0],{...v,runs});
  assert.deepEqual(node.content.runs,[{text:'Big',character:{fontSize:v.fontSize*2}},{text:' small'}]);
  assert.ok(mixed.lineWidths[0]>plain.lineWidths[0]*1.2,'The larger run widens the line');
  const height=g=>{const ys=g.subpaths.flatMap(s=>s.segments.map(x=>x.p[1]));return Math.max(...ys)-Math.min(...ys);};
  assert.ok(height(mixed.glyphs[0])>height(plain.glyphs[0])*1.8,'B is twice as tall');
  assert.ok(Math.abs(height(mixed.glyphs.at(-1))-height(plain.glyphs.at(-1)))<1e-9,'the last glyph keeps the base size');
  const same=pointText([0,0],{...v,runs:[{text:'Big',character:{fontSize:v.fontSize}},{text:' small',character:{fontSize:v.fontSize}}]});
  assert.equal(same.content.runs.length,1,'Neighbours with the same style merge');
  assert.deepEqual(pointText([0,0],{...v,text:'Other',runs}).content.runs,[{text:'Other'}],'Runs that do not match the text are dropped');
  assert.throws(()=>pointText([0,0],{...v,runs:[{text:'Big',character:{allCaps:true}},{text:' small'}]}),/cannot change allCaps/);
  node.layout=mixed;const data=createDocument();data.layers[0].children=[node];assert.deepEqual(validateDocument(data),[]);
  node.content.runs[0].character.fontSize=-1;assert.ok(validateDocument(data).some(e=>e.path.endsWith('.fontSize')));
  // Two lines: the second gets auto leading from its larger run.
  const two=await service.shape({...v,text:'A\nB',runs:[{text:'A\n'},{text:'B',character:{fontSize:v.fontSize*3}}]});
  const base=g=>Math.max(...g.subpaths.flatMap(s=>s.segments.map(x=>x.p[1])));
  assert.ok(base(two.glyphs[1])-base(two.glyphs[0])>=v.fontSize*3*1.2*25.4/72-1e-6,'Auto leading for the larger run');
});
const otf=faces.find(f=>f.format==='otf');
test('area text wraps shaped words, fits lines vertically and preserves overset text',{skip:!latin},async()=>{
  const v={...values(latin,'AV fi Horten ÆØÅ Horten ÆØÅ'),kind:'area',frameWidth:28,frameHeight:100};
  const layout=await service.shape(v),node=pointText([3,4],v);node.layout=layout;
  assert.ok(layout.lineWidths.length>1);assert.ok(layout.lineWidths.every(w=>w<=v.frameWidth+1e-9));assert.equal(layout.overflow,false);
  const data=createDocument();data.layers[0].children=[node];assert.deepEqual(validateDocument(data),[]);
  for(const patch of [{visibleLines:-1},{overflow:true},{glyphs:[{...layout.glyphs[0],line:layout.visibleLines}]}]) {
    const malformed=structuredClone(data);malformed.layers[0].children[0].layout={...layout,...patch};assert.ok(validateDocument(malformed).length);
  }
  assert.ok(layout.glyphs.flatMap(g=>g.subpaths.flatMap(p=>p.segments)).every(s=>s.p[1]>=-1e-9));
  const wider=await service.shape({...v,frameWidth:100});assert.ok(wider.lineWidths.length<layout.lineWidths.length);
  const center=await service.shape({...v,alignment:'center'}),x=l=>l.glyphs[0].subpaths[0].segments[0].p[0];
  assert.ok(Math.abs(x(center)-x(layout)-(v.frameWidth-layout.lineWidths[0])/2)<1e-9);
  const short=await service.shape({...v,frameHeight:.1});assert.equal(short.overflow,true);assert.equal(short.visibleLines,0);assert.deepEqual(short.glyphs,[]);
  const overset={...node,frame:{width:28,height:.1},layout:short};assert.equal(hasTextLayout(overset),true);assert.throws(()=>textToOutlines(overset),/overflows/);
  assert.equal(overset.content.runs[0].text,v.text);
  node.frame.width++;assert.equal(hasTextLayout(node),false,'Changing frame dimensions invalidates old wrapping');
  assert.ok(validateDocument(data).some(e=>e.path.endsWith('.signature')));
});
test('type on a path follows the curve, flips, aligns and reports glyphs that do not fit',{skip:!latin},async()=>{
  const seg=(p,i=[0,0],o=[0,0])=>({p,in:i,out:o}),line={closed:false,segments:[seg([0,0]),seg([200,0])]};
  const v={...values(latin,'AV fi'),kind:'onPath',pathSubpath:line,pathOffset:10,pathFlip:false};
  const layout=await service.shape(v),node=pathText(line,v);node.layout=layout;
  const data=createDocument();data.layers[0].children=[node];assert.deepEqual(validateDocument(data),[]);assert.equal(hasTextLayout(node),true);
  const point=await service.shape({...values(latin,'AV fi')}),xs=l=>l.glyphs.filter(g=>g.subpaths.length).map(g=>g.subpaths[0].segments[0].p);
  // On a straight line the glyphs match point text moved to the offset and baseline.
  const ascent=xs(point)[0][1]-xs(layout)[0][1];
  xs(layout).forEach((p,i)=>{assert.ok(Math.abs(p[0]-10-xs(point)[i][0])<1e-6);assert.ok(Math.abs(p[1]+ascent-xs(point)[i][1])<1e-6);});
  assert.ok(layout.glyphs.flatMap(g=>g.subpaths.flatMap(p=>p.segments)).every(s=>s.p[1]<=1e-9),'glyphs stand above a left-to-right path');
  const flipped=await service.shape({...v,pathFlip:true});
  assert.ok(flipped.glyphs.flatMap(g=>g.subpaths.flatMap(p=>p.segments)).every(s=>s.p[1]>=-1e-9),'Flip puts the text on the other side');
  const right=await service.shape({...v,alignment:'right'});assert.ok(Math.abs(xs(right)[0][0]-xs(layout)[0][0]-(190-layout.lineWidths[0]))<1e-6);
  const short=await service.shape({...v,pathSubpath:{closed:false,segments:[seg([0,0]),seg([12,0])]}});
  assert.equal(short.overflow,true);assert.ok(short.glyphs.length<layout.glyphs.length);assert.throws(()=>textToOutlines({...node,onPath:{...node.onPath,subpath:{closed:false,segments:[seg([0,0]),seg([12,0])]}},layout:short}),/does not fit on its path/);
  const k=10*0.5522847498,circle={closed:true,segments:[seg([0,-10],[-k,0],[k,0]),seg([10,0],[0,-k],[0,k]),seg([0,10],[k,0],[-k,0]),seg([-10,0],[0,k],[0,-k])]};
  const ring=await service.shape({...v,pathSubpath:circle,pathOffset:0});
  for(const g of ring.glyphs)for(const s of g.subpaths.flatMap(p=>p.segments)){const r=Math.hypot(...s.p);assert.ok(r>=10-1e-6&&r<=10+v.fontSize*25.4/72,`outside the circle: ${r}`);}
  node.onPath.offset=11;assert.equal(hasTextLayout(node),false,'Moving the start invalidates the layout');
  await assert.rejects(service.shape({...v,pathSubpath:{closed:false,segments:[seg([0,0])]}}),/two points/);
});
test('tracking widens every advance and All Caps shapes capitals without changing the content',{skip:!latin},async()=>{
  const v=values(latin,'Horten'),plain=await service.shape(v),tracked=await service.shape({...v,tracking:100});
  const em=v.fontSize*25.4/72;
  assert.ok(Math.abs(tracked.lineWidths[0]-plain.lineWidths[0]-6*em*.1)<1e-6,'100/1000 em per glyph');
  const x=l=>l.glyphs.filter(g=>g.subpaths.length).map(g=>g.subpaths[0].segments[0].p[0]);
  x(tracked).forEach((p,i)=>assert.ok(Math.abs(p-x(plain)[i]-i*em*.1)<1e-6));
  const caps=await service.shape({...v,allCaps:true}),upper=await service.shape({...v,text:'HORTEN'});
  assert.deepEqual(caps.glyphs.map(g=>g.glyphId),upper.glyphs.map(g=>g.glyphId));
  const node=pointText([0,0],{...v,allCaps:true,tracking:100});assert.equal(node.content.runs[0].text,'Horten');
  assert.deepEqual([node.character.allCaps,node.character.tracking],[true,100]);
  assert.equal(pointText([0,0],v).character.tracking,undefined,'Defaults are not stored');
  node.layout=await service.shape({...v,allCaps:true,tracking:100});const data=createDocument();data.layers[0].children=[node];assert.deepEqual(validateDocument(data),[]);
  node.character.tracking=20000;assert.ok(validateDocument(data).some(e=>e.path.endsWith('.tracking')));
  const wrapped=await service.shape({...v,text:'Horten Horten',kind:'area',frameWidth:plain.lineWidths[0]*2.4,frameHeight:100});assert.equal(wrapped.lineWidths.length,1);
  const wrappedTracked=await service.shape({...v,text:'Horten Horten',kind:'area',frameWidth:plain.lineWidths[0]*2.4,frameHeight:100,tracking:200});assert.equal(wrappedTracked.lineWidths.length,2,'Tracking is part of line breaking');
});
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
