import assert from 'node:assert/strict';
import {wait} from './cdp.mjs';
export async function inlineReady(evaluate){for(let i=0;i<200;i++){if(await evaluate("document.querySelector('.draw-inline-text')?.dataset.textReady==='true'"))return;await wait(50);}assert.fail(await evaluate("JSON.stringify({editor:document.querySelector('.draw-inline-text')?.outerHTML,errors:[...document.querySelectorAll('.toast')].map(t=>t.textContent)})"));}
export async function inlineSet(evaluate,values){
  const fields={fontSize:'font-size',fontFamily:'font-family',fontWeight:'font-weight',fontStyle:'font-style',frameWidth:'frame-width',frameHeight:'frame-height',pathOffset:'path-offset',pathFlip:'path-flip',alignment:'alignment',leading:'leading'};
  for(const [key,value] of Object.entries(values)){
    if(key==='text')await evaluate(`(()=>{const el=document.querySelector('.draw-inline-text');el.focus();const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);el.textContent=${JSON.stringify(value)};r.selectNodeContents(el);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    else if(key==='fontFamily'){
      await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-field=prop-font-family]').click()");
      await evaluate(`(()=>{const el=document.querySelector('.draw-font-browser input');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input'));})()`);
      for(let i=0;i<100&&!await evaluate(`!!document.querySelector('[data-font-family=${JSON.stringify(value)}]')`);i++)await wait(30);
      await evaluate(`document.querySelector('[data-font-family=${JSON.stringify(value)}]').click()`);
    }else if(key==='alignment')await evaluate(`document.querySelector('.draw-project[style*=block] [data-draw-paragraph=prop-${value}]').click()`);
    else await evaluate(`(()=>{const el=document.querySelector('.draw-project[style*=block] [data-draw-field=prop-${fields[key]??key}]');if(el.type==='checkbox')el.checked=${JSON.stringify(value)};else el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await inlineReady(evaluate);
  }
}
export async function finishInline(evaluate){await evaluate("document.querySelector('.draw-inline-text').focus();document.querySelector('.draw-inline-text').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");for(let i=0;i<100&&await evaluate("!!document.querySelector('.draw-inline-text')");i++)await wait(20);}
