import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { create } from 'fontkit';
import { textProperties, textValues, PT_TO_MM } from '../renderer/draw/doc/text.mjs';
import { glyphSubpaths, textSignature } from '../renderer/draw/doc/text-layout.mjs';
import { wrapLines } from '../renderer/draw/doc/text-wrap.mjs';
import { measurePath, reverseSubpath, pathRunStart, glyphFrame } from '../renderer/draw/geom/path-measure.mjs';
import { variableMetadata } from './font-metadata.mjs';

export function systemFontDirectories(platform=process.platform, env=process.env, home=homedir()) {
  if(platform==='win32')return [join(env.WINDIR||'C:/Windows','Fonts'),...(env.LOCALAPPDATA?[join(env.LOCALAPPDATA,'Microsoft','Windows','Fonts')]:[])];
  if(platform==='darwin')return ['/System/Library/Fonts','/Library/Fonts',join(home,'Library','Fonts')];
  return ['/usr/share/fonts','/usr/local/share/fonts',join(home,'.local','share','fonts'),join(home,'.fonts')];
}
/** Paths stay private to main. The renderer can only request an enumerated face, never an arbitrary file. */
export function createFontService({directories=systemFontDirectories(),google}={}) {
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
              fontWeight:weight>=600?'bold':'normal',fontStyle:font.italicAngle||/italic|oblique/i.test(style)?'italic':'normal',weight,...variableMetadata(font)};
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
    const targetWeight=v.fontWeight==='bold'?700:v.fontWeight==='normal'?400:v.fontWeight;
    let face,font;
    if(v.fontSource==='google') {
      if(!google)throw new Error('Google Fonts is unavailable.');
      ({face,font}=await google.resolve(v));patch.character.googleFont=face.reference;
    } else {
      const catalog=await list();
      const candidates=catalog.filter(f=>f.family.toLowerCase()===v.fontFamily.toLowerCase()&&f.fontStyle===v.fontStyle&&
        (f.axes.wght&&targetWeight>=f.axes.wght.min&&targetWeight<=f.axes.wght.max || (typeof v.fontWeight==='number'?f.weight===targetWeight:f.fontWeight===v.fontWeight)));
      face=v.fontPostscriptName?candidates.find(f=>f.postscriptName===v.fontPostscriptName):candidates.sort((a,b)=>Math.abs(a.weight-targetWeight)-Math.abs(b.weight-targetWeight))[0];
      if(!face)throw new Error(`The font “${v.fontFamily}” (${v.fontWeight}, ${v.fontStyle}) is not installed. Choose an available font or style.`);
      font=cache.get(face.id);
      if(!font) {
        const source=create(await readFile(entries.get(face.id).path));font=source.fonts?source.getFont(face.postscriptName):source;
        if(cache.size>=12)cache.delete(cache.keys().next().value);cache.set(face.id,font);
      }
    }
    patch.character.fontPostscriptName=face.postscriptName;
    const {axes,instances}=variableMetadata(font),settings={...v.fontAxes};
    if(axes.wght&&settings.wght===undefined)settings.wght=targetWeight;
    for(const [tag,value] of Object.entries(settings))if(!axes[tag]||value<axes[tag].min||value>axes[tag].max)throw new Error(`The ${tag} axis is outside this font’s range.`);
    if(Object.keys(settings).length)font=font.getVariation(settings);
    const scale=v.fontSize*PT_TO_MM/font.unitsPerEm,glyphs=[],lineWidths=[],area=v.kind==='area';
    // Tracking adds the same advance after every glyph; All Caps changes only the shaped text, never the content.
    // Horizontal scale stretches glyphs and advances, vertical scale only glyphs; baseline shift raises the
    // glyphs (pt); kerning 'none' turns the font's kern feature off.
    const hs=(v.horizontalScale??100)/100,vs=(v.verticalScale??100)/100,rise=(v.baselineShift??0)*PT_TO_MM;
    const track=(v.tracking??0)/1000*font.unitsPerEm,advance=p=>p.xAdvance*hs+track,shapeText=text=>font.layout(v.allCaps?text.toLocaleUpperCase():text,v.kerning==='none'?{kern:false}:undefined);
    const width=run=>run.positions.reduce((sum,p)=>sum+advance(p),0);
    const fontInfo={family:face.family,style:face.style,postscriptName:face.postscriptName,...(face.source==='google'?{source:'google',reference:face.reference}:{}),axes,instances};
    const outlines=glyph=>{
      if(glyph.id===0)throw new Error(`The font “${face.family}” does not contain every character in the text.`);
      let commands;try{commands=glyph.path.commands;}catch{throw new Error('This font cannot provide vector outlines for the text. Choose a monochrome vector font.');}
      if(!commands.length&&glyph.codePoints.some(cp=>!/[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F]/u.test(String.fromCodePoint(cp))))throw new Error('This font uses a glyph without vector outlines. Choose a vector font.');
      return commands;
    };
    if(v.kind==='onPath') {
      // One line along the path: each glyph is centred on its arc length and turned to the tangent.
      const run=shapeText(v.text.replace(/[ \t]*\n[ \t]*/g,' ').replace(/\t/g,'    ')),total=width(run)*scale;
      const measure=measurePath(v.pathFlip?reverseSubpath(v.pathSubpath):v.pathSubpath);
      let pen=pathRunStart(measure.length,total,{offset:v.pathOffset,alignment:v.alignment}),overflow=false;
      for(let i=0;i<run.glyphs.length;i++) {
        const glyph=run.glyphs[i],pos=run.positions[i],commands=outlines(glyph),step=advance(pos)*scale,centre=pen+pos.xAdvance*hs*scale/2;
        if(centre>measure.length+1e-9)overflow=true;
        else {const map=glyphFrame(measure,centre);glyphs.push({line:0,glyphId:glyph.id,subpaths:glyphSubpaths(commands,(gx,gy)=>map((pos.xOffset+gx)*hs*scale-pos.xAdvance*hs*scale/2,(pos.yOffset+gy*vs)*scale+rise))});}
        pen+=step;
      }
      return {version:1,signature:textSignature(patch),font:fontInfo,glyphs,lineWidths:[total],overflow};
    }
    // Paragraph indents (pt) narrow the lines; space before and after (pt) separates paragraphs.
    const pt=n=>(n??0)*PT_TO_MM,left=pt(v.leftIndent),right=pt(v.rightIndent),firstIndent=pt(v.firstLineIndent),gap=pt(v.spaceBefore)+pt(v.spaceAfter);
    const lines=area?wrapLines(v.text,first=>(v.frameWidth-left-right-(first?firstIndent:0))/scale,text=>width(shapeText(text.replace(/\t/g,'    '))))
      :v.text.split('\n').map((text,paragraph)=>({text,paragraph,first:true,last:true}));
    const ascent=area?font.ascent*scale:0,lineHeight=area?(font.ascent-font.descent)*scale:0;
    const lineTop=line=>line*v.leading*PT_TO_MM+lines[line].paragraph*gap;
    let visibleLines=lines.length;
    if(area){visibleLines=0;while(visibleLines<lines.length&&lineTop(visibleLines)+lineHeight<=v.frameHeight+1e-9)visibleLines++;}
    for(const [line,{text,first,last}] of lines.entries()) {
      const run=shapeText(text.replace(/\t/g,'    '));
      const lineAdvance=width(run);lineWidths.push(lineAdvance*scale);
      const indent=left+(first?firstIndent:0),room=area?v.frameWidth-indent-right:0;
      if(area&&lineAdvance*scale>room+1e-9)visibleLines=Math.min(visibleLines,line);
      // Justified lines spread the free room over their spaces; a paragraph's last line stays left aligned.
      const justify=area&&v.alignment==='justify'&&!last,spaces=justify?run.glyphs.filter(g=>g.codePoints.includes(32)).length:0;
      const spread=spaces?Math.max(0,room/scale-lineAdvance)/spaces:0,align=v.alignment==='justify'?'left':v.alignment;
      const offset=indent/scale+(align==='center'?-lineAdvance/2:align==='right'?-lineAdvance:0)+(area?(align==='center'?room/scale/2:align==='right'?room/scale:0):0);
      let x=0,y=0;
      for(let i=0;i<run.glyphs.length;i++) {
        const glyph=run.glyphs[i],pos=run.positions[i];
        const commands=outlines(glyph);
        if(line<visibleLines) {
          const subpaths=glyphSubpaths(commands,(gx,gy)=>[(offset+x+(pos.xOffset+gx)*hs)*scale,ascent+lineTop(line)-(y+pos.yOffset+gy*vs)*scale-rise]);
          glyphs.push({line,glyphId:glyph.id,subpaths});
        }
        x+=advance(pos)+(spaces&&glyph.codePoints.includes(32)?spread:0);y+=pos.yAdvance;
      }
      await yieldEventLoop();
    }
    return {version:1,signature:textSignature(patch),font:fontInfo,glyphs,lineWidths,
      ...(area?{visibleLines,overflow:visibleLines<lines.length}:{})};
  }
  return {list,shape};
}
