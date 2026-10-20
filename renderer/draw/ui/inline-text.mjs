import { PT_TO_MM, RUN_KEYS, styleRange, textStyleValues } from '../doc/text.mjs';
import { browserFont, prepareFont } from './font-browser.mjs';

/** Native caret, selection, clipboard and IME over the document's live vector text. */
export function inlineText(stage, initial, { update, position, finish, onError, selectionChanged = () => {} }) {
  const editor = document.createElement('div'); editor.className = 'draw-inline-text'; editor.contentEditable = 'true'; editor.spellcheck = false;
  editor.setAttribute('role','textbox'); editor.setAttribute('aria-label','Text on artboard'); editor.setAttribute('aria-multiline','true'); stage.append(editor);
  let values = structuredClone(initial), selection = [0,values.text.length], alive = true, revision = 0, composing = false;
  let pending = Promise.resolve(), fontRevision = 0, frame;
  const mergeKey = `inline-text-${crypto.randomUUID()}`;
  const runs = () => values.runs ?? [{text:values.text}];
  function runValues(run){
    const c={...values,...run.character};
    if(run.character?.fontFamily&&run.character.fontFamily!==values.fontFamily&&!run.character.fontSource){c.fontSource='system';delete c.googleFont;delete c.fontAxes;}
    if(run.character&&['fontFamily','fontWeight','fontStyle'].some(k=>run.character[k]!==undefined&&run.character[k]!==values[k])&&!run.character.fontPostscriptName)delete c.fontPostscriptName;
    return c;
  }
  function capture() {
    const s = window.getSelection();
    if (!s?.rangeCount || !editor.contains(s.anchorNode) || !editor.contains(s.focusNode)) return;
    const range = s.getRangeAt(0), prefix = range.cloneRange(); prefix.selectNodeContents(editor); prefix.setEnd(range.startContainer,range.startOffset);
    const next = [prefix.toString().length,prefix.toString().length+range.toString().length];
    if(next[0]!==selection[0]||next[1]!==selection[1]){selection=next;selectionChanged();}
  }
  function restore() {
    const walker = document.createTreeWalker(editor,NodeFilter.SHOW_TEXT), nodes = []; let node;
    while ((node = walker.nextNode())) nodes.push(node);
    if (!nodes.length) { editor.append(document.createTextNode('')); nodes.push(editor.firstChild); }
    const locate = offset => { for (const n of nodes) { if (offset <= n.length) return [n,offset]; offset -= n.length; } return [nodes.at(-1),nodes.at(-1).length]; };
    const range = document.createRange(); range.setStart(...locate(selection[0])); range.setEnd(...locate(selection[1])); const s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
  }
  function paint() {
    const focused = document.activeElement === editor;
    editor.replaceChildren(...runs().map(run => {
      const span = document.createElement('span'), c = runValues(run); span.textContent = run.text;
      span.style.fontFamily = JSON.stringify(c.fontFamily); span.style.fontSize = `${c.fontSize*PT_TO_MM}px`; span.style.fontWeight = c.fontWeight;
      span.style.fontStyle = c.fontStyle; span.style.letterSpacing = `${(c.tracking??0)/1000*c.fontSize*PT_TO_MM}px`;
      span.style.fontVariationSettings=Object.entries(c.fontAxes??{}).map(([tag,value])=>`"${tag}" ${value}`).join(',')||'normal';
      const token = fontRevision;
      void browserFont(c).then(alias => { if (alive && token === fontRevision) span.style.fontFamily = JSON.stringify(alias); }).catch(()=>{});
      return span;
    }));
    editor.style.fontSize=`${values.fontSize*PT_TO_MM}px`;editor.style.textTransform=values.allCaps?'uppercase':'none';editor.style.fontKerning=values.kerning==='none'?'none':'normal';
    editor.style.lineHeight = `${values.leading*PT_TO_MM}px`; editor.style.textAlign = values.alignment === 'justify' ? 'left' : values.alignment;
    editor.style.width = values.kind === 'area' ? `${values.frameWidth}px` : 'max-content';
    editor.style.height = values.kind === 'area' ? `${values.frameHeight}px` : 'auto'; editor.style.whiteSpace = values.kind === 'area' ? 'pre-wrap' : 'pre';
    editor.style.writingMode = values.orientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb';
    if (focused) restore(); reposition();
  }
  function reposition() { if (alive) position(editor,values); }
  function apply() {
    const snapshot = structuredClone(values), token = ++revision; editor.dataset.textReady = 'false';
    pending = pending.catch(()=>{}).then(async () => {
      if (!alive || token !== revision) return;
      try { await update(snapshot,mergeKey,() => alive && token === revision); if (alive && token === revision) { editor.dataset.textReady = 'true'; reposition(); } }
      catch (error) { if (alive && token === revision) { editor.dataset.textReady = 'error'; editor.setAttribute('aria-invalid','true'); onError(error.message); } }
    });
    return pending;
  }
  function input() {
    capture(); const next = editor.textContent.replace(/\r\n?/g,'\n');
    if (next.length > 10000) { paint(); onError('Text is limited to 10,000 characters per object.'); return; }
    const old = values.text; let from = 0, tail = 0;
    while (from < old.length && from < next.length && old[from] === next[from]) from++;
    while (tail < old.length-from && tail < next.length-from && old[old.length-1-tail] === next[next.length-1-tail]) tail++;
    const styles = runs().flatMap(r => Array(r.text.length).fill(r.character ?? null));
    const inherit = styles[Math.max(0,from-1)] ?? styles[from] ?? null;
    styles.splice(from,old.length-from-tail,...Array(next.length-from-tail).fill(inherit));
    const result = [];
    for (let i=0;i<next.length;i++) { const c = styles[i], last = result.at(-1); if (last && JSON.stringify(last.character??null) === JSON.stringify(c)) last.text += next[i]; else result.push({text:next[i],...(c?{character:c}:{})}); }
    values = {...values,text:next,runs:result}; if (!composing) void apply();
  }
  function insertPlain(text) {
    const s=window.getSelection();if(!s?.rangeCount)return;
    const range=s.getRangeAt(0);range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);s.removeAllRanges();s.addRange(range);input();
  }
  editor.addEventListener('beforeinput',event=>{if(event.data?.includes('\n')||['insertParagraph','insertLineBreak'].includes(event.inputType)){event.preventDefault();insertPlain(event.data??'\n');}});
  editor.addEventListener('input',input);
  editor.addEventListener('compositionstart',()=>{composing=true;}); editor.addEventListener('compositionend',()=>{composing=false; input();});
  editor.addEventListener('keydown',event => {
    event.stopPropagation(); if (event.isComposing) return;
    if (event.key === 'Escape' || event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void done(); }
    else if (event.key === 'Enter') { event.preventDefault(); insertPlain('\n'); }
  });
  editor.addEventListener('paste',event => { event.preventDefault(); insertPlain(event.clipboardData.getData('text/plain')); });
  document.addEventListener('selectionchange',capture);
  async function style(changes) {
    capture(); const [from,to] = selection;
    editor.dataset.textReady='false';
    const partial=from<to&&(from>0||to<values.text.length);
    let next = textStyleValues(values,changes);
    if (['fontFamily','fontSource','fontWeight','fontStyle'].some(k => k in changes)) {
      const prepared=await prepareFont(partial?textStyleValues(selectedValues(),changes):next);if(!alive)return;
      if(!partial)next=prepared;
      changes = {...changes,...Object.fromEntries(['fontFamily','fontSource','fontWeight','fontStyle','fontPostscriptName','googleFont','fontAxes'].map(k => [k,prepared[k]??null]))};
    }
    if (partial && Object.keys(changes).every(k => RUN_KEYS.includes(k))) {
      values = {...values,runs:styleRange(runs(),from,to,changes)};
    } else values = next;
    fontRevision++; paint(); await apply();
  }
  async function done() {
    if (!alive) return;
    await pending; if (!alive) return; destroy(); finish(values);
  }
  function destroy() { alive = false; revision++; cancelAnimationFrame(frame); editor.remove(); document.removeEventListener('selectionchange',capture); }
  paint(); editor.dataset.textReady='true'; editor.focus(); restore();
  const trackView = () => { if (!alive) return; reposition(); frame = requestAnimationFrame(trackView); }; frame = requestAnimationFrame(trackView);
  const selectedValues=()=>{let at=0;for(const run of runs()){at+=run.text.length;if(selection[0]<at)return runValues(run);}return values;};
  return {editor,style,done,destroy,reposition,flush:()=>pending,values:selectedValues,sample:()=>values.text.slice(...selection)||'Lorem Ipsum',selection:()=>selection,focus(){editor.focus();restore();},insert(ch){editor.focus();restore();insertPlain(ch);}};
}
