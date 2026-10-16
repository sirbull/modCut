/** Greedy wrapping in shaped advance units. Never split a Unicode grapheme cluster.
 * Break at ordinary whitespace/hyphens; long words use an emergency grapheme break.
 * Exponential probing bounds shaping work for long text in narrow frames.
 */
const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});
export function wrapText(text,width,measure) {
  const lines=[];
  for(const paragraph of text.split('\n')) {
    const clusters=[...graphemes.segment(paragraph)],ends=clusters.map(g=>g.index+g.segment.length);
    if(!ends.length){lines.push('');continue;}
    let start=0;
    while(start<ends.length) {
      const offset=clusters[start].index,slice=end=>paragraph.slice(offset,ends[end-1]);
      let low=0,high=1,remaining=ends.length-start;
      while(high<=remaining&&measure(slice(start+high))<=width+1e-9){low=high;if(high===remaining)break;high=Math.min(remaining,high*2);}
      while(low+1<high){const mid=Math.floor((low+high)/2);if(measure(slice(start+mid))<=width+1e-9)low=mid;else high=mid;}
      let count=Math.max(1,low),end=start+count;
      if(end<ends.length) {
        // Whitespace at the next boundary belongs to the wrap, not a new empty line.
        if(!/^[ \t]/u.test(clusters[end].segment))for(let i=end-1;i>start;i--) {
          if(/[ \t\-\u2010]$/u.test(clusters[i].segment)){end=i+1;break;}
        }
      }
      lines.push(slice(end).replace(/[ \t]+$/u,''));start=end;
      while(start<ends.length&&/^[ \t]+$/u.test(clusters[start].segment))start++;
    }
  }
  return lines;
}
