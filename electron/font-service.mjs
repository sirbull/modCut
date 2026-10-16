import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { create } from 'fontkit';
import { textProperties, textValues, PT_TO_MM } from '../renderer/draw/doc/text.mjs';
import { glyphSubpaths, textSignature } from '../renderer/draw/doc/text-layout.mjs';
import { wrapText } from '../renderer/draw/doc/text-wrap.mjs';

export function systemFontDirectories(platform=process.platform, env=process.env, home=homedir()) {
  if(platform==='win32')return [join(env.WINDIR||'C:/Windows','Fonts'),...(env.LOCALAPPDATA?[join(env.LOCALAPPDATA,'Microsoft','Windows','Fonts')]:[])];
  if(platform==='darwin')return ['/System/Library/Fonts','/Library/Fonts',join(home,'Library','Fonts')];
  return ['/usr/share/fonts','/usr/local/share/fonts',join(home,'.local','share','fonts'),join(home,'.fonts')];
}
/** Paths stay private to main. The renderer can only request an enumerated face, never an arbitrary file. */
export function createFontService({directories=systemFontDirectories()}={}) {
  let catalogPromise; const entries=new Map(), cache=new Map();
  async function *files(directory,depth=0) {
    if(depth>12)return;
    let children;try{children=await readdir(directory,{withFileTypes:true});}catch{return;}
    for(const child of children) {
      const path=join(directory,child.name);
      if(child.isDirectory())yield* files(path,depth+1);
      else if(child.isFile()&&['.ttf','.otf','.ttc','.otc'].includes(extname(child.name).toLowerCase()))yield path;
    }
  }
  async function list() {
    catalogPromise??=(async()=>{
      const faces=new Map();
      for(const directory of directories)for await(const path of files(directory)) {
        try {
          const source=create(await readFile(path));
          for(const font of source.fonts??[source]) {
            if(!font.familyName||!font.postscriptName)continue;
            const id=createHash('sha256').update(path+'\0'+font.postscriptName).digest('hex').slice(0,24);
            const style=font.subfamilyName||'Regular',weight=font['OS/2']?.usWeightClass??(/bold/i.test(style)?700:400);
            const entry={id,family:font.familyName,style,postscriptName:font.postscriptName,format:extname(path).slice(1).toLowerCase(),
              fontWeight:weight>=600?'bold':'normal',fontStyle:font.italicAngle||/italic|oblique/i.test(style)?'italic':'normal',weight};
            // User fonts, scanned last, override an older system copy of the same face.
            faces.set(font.postscriptName,{...entry,path});
          }
        }catch{/* Broken or unsupported font files do not hide the remaining installed fonts. */}
        await yieldEventLoop();
      }
      entries.clear();for(const entry of faces.values())entries.set(entry.id,entry);
      return [...entries.values()].map(({path,...face})=>face).sort((a,b)=>a.family.localeCompare(b.family)||a.weight-b.weight||a.style.localeCompare(b.style));
    })();
    return catalogPromise;
  }
  async function shape(values) {
    const patch=textProperties(values),v=textValues(patch);
    if(v.text.length>10000)throw new Error('Text is limited to 10,000 characters per object.');
    const catalog=await list();
    const candidates=catalog.filter(f=>f.family.toLowerCase()===v.fontFamily.toLowerCase()&&f.fontWeight===v.fontWeight&&f.fontStyle===v.fontStyle);
    const face=v.fontPostscriptName?candidates.find(f=>f.postscriptName===v.fontPostscriptName):candidates.sort((a,b)=>Math.abs(a.weight-(v.fontWeight==='bold'?700:400))-Math.abs(b.weight-(v.fontWeight==='bold'?700:400)))[0];
    if(!face)throw new Error(`The font “${v.fontFamily}” (${v.fontWeight}, ${v.fontStyle}) is not installed. Choose an available font or style.`);
    patch.character.fontPostscriptName=face.postscriptName;
    let font=cache.get(face.id);
    if(!font) {
      const source=create(await readFile(entries.get(face.id).path));font=source.fonts?source.getFont(face.postscriptName):source;
      if(cache.size>=12)cache.delete(cache.keys().next().value);cache.set(face.id,font);
    }
    const scale=v.fontSize*PT_TO_MM/font.unitsPerEm,glyphs=[],lineWidths=[],area=v.kind==='area';
    const width=run=>run.positions.reduce((sum,p)=>sum+p.xAdvance,0);
    const lines=area?wrapText(v.text,v.frameWidth/scale,text=>width(font.layout(text.replace(/\t/g,'    ')))):v.text.split('\n');
    const ascent=area?font.ascent*scale:0,lineHeight=area?(font.ascent-font.descent)*scale:0;
    let visibleLines=area?Math.max(0,Math.min(lines.length,Math.floor((v.frameHeight-lineHeight+1e-9)/(v.leading*PT_TO_MM))+1)):lines.length;
    for(const [line,text] of lines.entries()) {
      const run=font.layout(text.replace(/\t/g,'    '));
      const advance=width(run);lineWidths.push(advance*scale);
      if(area&&advance*scale>v.frameWidth+1e-9)visibleLines=Math.min(visibleLines,line);
      const offset=(v.alignment==='center'?-advance/2:v.alignment==='right'?-advance:0)+(area?(v.alignment==='center'?v.frameWidth/scale/2:v.alignment==='right'?v.frameWidth/scale:0):0);
      let x=0,y=0;
      for(let i=0;i<run.glyphs.length;i++) {
        const glyph=run.glyphs[i],pos=run.positions[i];
        if(glyph.id===0)throw new Error(`The font “${face.family}” does not contain every character in the text.`);
        const commands=glyph.path.commands;
        if(!commands.length&&glyph.codePoints.some(cp=>!/[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F]/u.test(String.fromCodePoint(cp))))throw new Error('This font uses a glyph without vector outlines. Choose a vector font.');
        if(line<visibleLines) {
          const subpaths=glyphSubpaths(commands,(gx,gy)=>[(offset+x+pos.xOffset+gx)*scale,ascent+line*v.leading*PT_TO_MM-(y+pos.yOffset+gy)*scale]);
          glyphs.push({line,glyphId:glyph.id,subpaths});
        }
        x+=pos.xAdvance;y+=pos.yAdvance;
      }
      await yieldEventLoop();
    }
    return {version:1,signature:textSignature(patch),font:{family:face.family,style:face.style,postscriptName:face.postscriptName},glyphs,lineWidths,
      ...(area?{visibleLines,overflow:visibleLines<lines.length}:{})};
  }
  return {list,shape};
}
