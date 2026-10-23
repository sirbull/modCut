/** Greedy wrapping in shaped advance units. Never split a Unicode grapheme cluster.
 * Break at ordinary whitespace/hyphens; long words use an emergency grapheme break.
 * Exponential probing bounds shaping work for long text in narrow frames.
 */
const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});
export function wrapText(text,width,measure) { return wrapLines(text,width,measure).map(line=>line.text); }
/**
 * Lines with their paragraph: `{ text, start, paragraph, first, last }` (`start`: offset in `text`). `width`
 * is a number or a function of whether the line is the first of its paragraph (a first-line indent makes
 * that line narrower). `measure(slice, start)` also gets the slice's offset, for text with styled runs.
 */
export function wrapLines(text,width,measure) {
  const lines=[],widthFor=first=>typeof width==='function'?width(first):width;let base=0;
  for(const [index,paragraph] of text.split('\n').entries()) {
    const at=base;base+=paragraph.length+1;
    const clusters=[...graphemes.segment(paragraph)],ends=clusters.map(g=>g.index+g.segment.length),start0=lines.length;
    if(!ends.length){lines.push({text:'',start:at,paragraph:index,first:true,last:true});continue;}
    let start=0;
    while(start<ends.length) {
      const offset=clusters[start].index,slice=end=>paragraph.slice(offset,ends[end-1]),limit=widthFor(lines.length===start0),fits=end=>measure(slice(end),at+offset)<=limit+1e-9;
      let low=0,high=1,remaining=ends.length-start;
      while(high<=remaining&&fits(start+high)){low=high;if(high===remaining)break;high=Math.min(remaining,high*2);}
      while(low+1<high){const mid=Math.floor((low+high)/2);if(fits(start+mid))low=mid;else high=mid;}
      let count=Math.max(1,low),end=start+count;
      if(end<ends.length) {
        // Whitespace at the next boundary belongs to the wrap, not a new empty line.
        if(!/^[ \t]/u.test(clusters[end].segment))for(let i=end-1;i>start;i--) {
          if(/[ \t\-\u2010]$/u.test(clusters[i].segment)){end=i+1;break;}
        }
      }
      lines.push({text:slice(end).replace(/[ \t]+$/u,''),start:at+offset,paragraph:index,first:lines.length===start0,last:false});start=end;
      while(start<ends.length&&/^[ \t]+$/u.test(clusters[start].segment))start++;
    }
    lines[lines.length-1].last=true;
  }
  return lines;
}
