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
  /** The face and Fontkit font for character settings `v` (a variable font set to its weight and axes). */
  async function resolveFont(v) {
    const targetWeight=v.fontWeight==='bold'?700:v.fontWeight==='normal'?400:v.fontWeight;
    let face,font;
    if(v.fontSource==='google') {
      if(!google)throw new Error('Google Fonts is unavailable.');
      ({face,font}=await google.resolve(v));
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
    const {axes,instances}=variableMetadata(font),settings={...v.fontAxes};
    if(axes.wght&&settings.wght===undefined)settings.wght=targetWeight;
    for(const [tag,value] of Object.entries(settings))if(!axes[tag]||value<axes[tag].min||value>axes[tag].max)throw new Error(`The ${tag} axis is outside this font’s range.`);
    if(Object.keys(settings).length)font=font.getVariation(settings);
    return {face,font,axes,instances};
  }
  async function shape(values) {
    const patch=textProperties(values),v=textValues(patch);
    if(v.text.length>10000)throw new Error('Text is limited to 10,000 characters per object.');
    const base=await resolveFont(v),{face}=base;
    if(v.fontSource==='google')patch.character.googleFont=face.reference;
    patch.character.fontPostscriptName=face.postscriptName;
    // One style per run: its own face when it changes family, weight or style, and its own size and spacing.
    // Tracking adds the same advance after every glyph; All Caps changes only the shaped text, never the content.
    // Horizontal scale stretches glyphs and advances, vertical scale only glyphs; baseline shift raises the
    // glyphs (pt); kerning 'none' turns the font's kern feature off. Positions below are in mm.
    const makeStyle=(c,{font,face})=>{
      const scale=c.fontSize*PT_TO_MM/font.unitsPerEm,hs=(c.horizontalScale??100)/100,vs=(c.verticalScale??100)/100,track=(c.tracking??0)/1000*font.unitsPerEm;
      // Touch Type: a turn (degrees) round the glyph's middle and a sideways move (pt) that leaves the next glyphs.
      return {font,face,scale,hs,vs,rise:(c.baselineShift??0)*PT_TO_MM,turn:(c.rotation??0)*Math.PI/180,shift:(c.xShift??0)*PT_TO_MM,fontSize:c.fontSize,advance:p=>(p.xAdvance*hs+track)*scale,
        shapeText:text=>font.layout(v.allCaps?text.toLocaleUpperCase():text,v.kerning==='none'?{kern:false}:undefined)};
    };
    const baseStyle=makeStyle(v,base),styles=[];let at=0;
    for(const run of v.runs) {
      const c=run.character,fontChange=c&&['fontFamily','fontWeight','fontStyle'].some(key=>c[key]!==undefined&&c[key]!==v[key]);
      const resolved=fontChange?await resolveFont({...v,...c,fontSource:c.fontFamily&&c.fontFamily!==v.fontFamily?'system':v.fontSource,fontPostscriptName:undefined,fontAxes:undefined}):base;
      styles.push({start:at,end:at+run.text.length,style:c?makeStyle({...v,...c},resolved):baseStyle});at+=run.text.length;
    }
    // The text between `start` and `end`, split where the style changes; tabs are four spaces.
    const pieces=(start,end)=>styles.filter(r=>r.end>start&&r.start<end).map(r=>({style:r.style,start:Math.max(start,r.start),text:v.text.slice(Math.max(start,r.start),Math.min(end,r.end))}))
      .filter(p=>p.text).map(p=>({...p,run:p.style.shapeText(p.text.replace(/\t/g,'    '))}));
    const widthOf=list=>list.reduce((sum,p)=>sum+p.run.positions.reduce((w,pos)=>w+p.style.advance(pos),0),0);
    const glyphs=[],lineWidths=[],area=v.kind==='area';
    const fontInfo={family:face.family,style:face.style,postscriptName:face.postscriptName,...(face.source==='google'?{source:'google',reference:face.reference}:{}),axes:base.axes,instances:base.instances};
    const outlines=(glyph,style)=>{
      if(glyph.id===0)throw new Error(`The font “${style.face.family}” does not contain every character in the text.`);
      let commands;try{commands=glyph.path.commands;}catch{throw new Error('This font cannot provide vector outlines for the text. Choose a monochrome vector font.');}
      if(!commands.length&&glyph.codePoints.some(cp=>!/[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F]/u.test(String.fromCodePoint(cp))))throw new Error('This font uses a glyph without vector outlines. Choose a vector font.');
      return commands;
    };
    if(v.kind==='onPath') {
      // One line along the path: each glyph is centred on its arc length and turned to the tangent.
      // Line breaks become spaces; each run keeps its own style along the path.
      const parts=pieces(0,v.text.length).map(p=>({...p,run:p.style.shapeText(p.text.replace(/\n/g,' ').replace(/\t/g,'    '))}));
      const total=widthOf(parts),measure=measurePath(v.pathFlip?reverseSubpath(v.pathSubpath):v.pathSubpath);
      let pen=pathRunStart(measure.length,total,{offset:v.pathOffset,alignment:v.alignment==='justify'?'left':v.alignment}),overflow=false;
      for(const {style,run} of parts)for(let i=0;i<run.glyphs.length;i++) {
        const glyph=run.glyphs[i],pos=run.positions[i],commands=outlines(glyph,style),step=style.advance(pos),half=pos.xAdvance*style.hs*style.scale/2,centre=pen+half;
        if(centre>measure.length+1e-9)overflow=true;
        else {const map=glyphFrame(measure,centre);glyphs.push({line:0,glyphId:glyph.id,subpaths:glyphSubpaths(commands,(gx,gy)=>map((pos.xOffset+gx)*style.hs*style.scale-half,(pos.yOffset+gy*style.vs)*style.scale+style.rise))});}
        pen+=step;
      }
      return {version:1,signature:textSignature(patch),font:fontInfo,glyphs,lineWidths:[total],overflow};
    }
    if(v.kind==='point'&&v.orientation==='vertical') {
      // Vertical Type: each line is a column of upright characters, one em (plus tracking) apart, centred on
      // the column; columns go from right to left, `leading` apart. Alignment: left is top, right is bottom.
      const columns=v.text.split('\n');let start=0;
      for(const [column,text] of columns.entries()) {
        const parts=pieces(start,start+text.length);
        let length=0;for(const p of parts)length+=p.run.glyphs.length*p.style.fontSize*PT_TO_MM*p.style.vs+p.run.glyphs.length*(v.tracking??0)/1000*p.style.fontSize*PT_TO_MM;
        lineWidths.push(length);
        let y=v.alignment==='center'?-length/2:v.alignment==='right'?-length:0;const cx=-column*v.leading*PT_TO_MM;
        for(const {style,run,start:at} of parts){let index=at;for(let i=0;i<run.glyphs.length;i++){
          const glyph=run.glyphs[i],pos=run.positions[i],commands=outlines(glyph,style),em=style.fontSize*PT_TO_MM*style.vs;
          const left=cx-pos.xAdvance*style.hs*style.scale/2+style.shift,baseline=y+style.font.ascent*style.vs*style.scale-style.rise,mid=[cx+style.shift,y+em/2];
          const c=Math.cos(style.turn),n=Math.sin(style.turn);
          glyphs.push({line:column,glyphId:glyph.id,index,subpaths:glyphSubpaths(commands,(gx,gy)=>{const px=left+(pos.xOffset+gx)*style.hs*style.scale,py=baseline-(pos.yOffset+gy*style.vs)*style.scale;
            return style.turn?[mid[0]+(px-mid[0])*c+(py-mid[1])*n,mid[1]-(px-mid[0])*n+(py-mid[1])*c]:[px,py];})});
          y+=em+(v.tracking??0)/1000*style.fontSize*PT_TO_MM;
          index+=String.fromCodePoint(...(glyph.codePoints.length?glyph.codePoints:[0])).length;
        }}
        start+=text.length+1;
      }
      return {version:1,signature:textSignature(patch),font:fontInfo,glyphs,lineWidths};
    }
    // Paragraph indents (pt) narrow the lines; space before and after (pt) separates paragraphs.
    const pt=n=>(n??0)*PT_TO_MM,left=pt(v.leftIndent),right=pt(v.rightIndent),firstIndent=pt(v.firstLineIndent),gap=pt(v.spaceBefore)+pt(v.spaceAfter);
    const lines=area?wrapLines(v.text,first=>v.frameWidth-left-right-(first?firstIndent:0),(text,start)=>widthOf(pieces(start,start+text.length)))
      :(()=>{let start=0;return v.text.split('\n').map((text,paragraph)=>{const line={text,start,paragraph,first:true,last:true};start+=text.length+1;return line;});})();
    const shaped=lines.map(line=>pieces(line.start,line.start+line.text.length));
    // A line is as far below the previous one as the leading, or more when a run on it is larger (auto leading).
    const leadingOf=parts=>Math.max(v.leading,...parts.filter(p=>p.style!==baseStyle).map(p=>p.style.fontSize*1.2))*PT_TO_MM;
    const tops=[];for(let line=0;line<lines.length;line++)tops.push(line?tops[line-1]+leadingOf(shaped[line])+(lines[line].paragraph!==lines[line-1].paragraph?gap:0):0);
    const ascent=area?Math.max(base.font.ascent*baseStyle.scale,...(shaped[0]??[]).map(p=>p.style.font.ascent*p.style.scale)):0;
    const lineHeight=area?(base.font.ascent-base.font.descent)*baseStyle.scale:0;
    let visibleLines=lines.length;
    if(area){visibleLines=0;while(visibleLines<lines.length&&tops[visibleLines]+lineHeight<=v.frameHeight+1e-9)visibleLines++;}
    for(const [line,{first,last}] of lines.entries()) {
      const parts=shaped[line],lineAdvance=widthOf(parts);lineWidths.push(lineAdvance);
      const indent=left+(first?firstIndent:0),room=area?v.frameWidth-indent-right:0;
      if(area&&lineAdvance>room+1e-9)visibleLines=Math.min(visibleLines,line);
      // Justified lines spread the free room over their spaces; a paragraph's last line stays left aligned.
      const justify=area&&v.alignment==='justify'&&!last,spaces=justify?parts.reduce((n,p)=>n+p.run.glyphs.filter(g=>g.codePoints.includes(32)).length,0):0;
      const spread=spaces?Math.max(0,room-lineAdvance)/spaces:0,align=v.alignment==='justify'?'left':v.alignment;
      const offset=indent+(align==='center'?-lineAdvance/2:align==='right'?-lineAdvance:0)+(area?(align==='center'?room/2:align==='right'?room:0):0);
      let x=0;
      for(const {style,run,start} of parts){let index=start;for(let i=0;i<run.glyphs.length;i++) {
        const glyph=run.glyphs[i],pos=run.positions[i],commands=outlines(glyph,style);
        if(line<visibleLines) {
          const baseline=ascent+tops[line]-style.rise,left=offset+x+style.shift,cx=left+pos.xAdvance*style.hs*style.scale/2,cy=baseline-(style.font.ascent+style.font.descent)/2*style.vs*style.scale;
          const c=Math.cos(style.turn),n=Math.sin(style.turn);
          const subpaths=glyphSubpaths(commands,(gx,gy)=>{const px=left+(pos.xOffset+gx)*style.hs*style.scale,py=baseline-(pos.yOffset+gy*style.vs)*style.scale;
            return style.turn?[cx+(px-cx)*c+(py-cy)*n,cy-(px-cx)*n+(py-cy)*c]:[px,py];});
          // `index`: where the glyph's characters start in the text (UTF-16), for Touch Type.
          glyphs.push({line,glyphId:glyph.id,index,subpaths});
        }
        x+=style.advance(pos)+(spaces&&glyph.codePoints.includes(32)?spread:0);
        index+=String.fromCodePoint(...(glyph.codePoints.length?glyph.codePoints:[0])).length;
      }}
      await yieldEventLoop();
    }
    return {version:1,signature:textSignature(patch),font:fontInfo,glyphs,lineWidths,
      ...(area?{visibleLines,overflow:visibleLines<lines.length}:{})};
  }
  /** Glyphs panel (D5): the printable characters a font has, in code point order (up to `limit`). */
  async function characters(values,{limit=6000}={}) {
    const {font,face}=await resolveFont(values??{});
    const printable=c=>c>=0x20&&!(c>=0x7F&&c<=0x9F)&&!(c>=0xD800&&c<=0xDFFF)&&c!==0xFFFE&&c!==0xFFFF&&c!==0xAD;
    const set=[...new Set(font.characterSet??[])].filter(printable).sort((a,b)=>a-b);
    return {family:face?.family??font.familyName,style:face?.style??font.subfamilyName,count:set.length,characters:set.slice(0,limit)};
  }
  return {list,shape,characters};
}
