import { wait } from './cdp.mjs';
export const activeDraw = `(await import('./draw/index.mjs')).getDrawWorkspace(document.querySelector('.draw-project[data-tab-id="'+document.querySelector('.doc-tab.is-active').dataset.tabId+'"]'))`;
export async function submitNewDrawDialog(evaluate, values={}) {
  // New may open after async machine/template lookups; wait for the form before filling it.
  for (let i=0;i<100&&!(await evaluate("!!document.querySelector('.draw-document-dialog form')"));i++) await wait(50);
  await evaluate(`(() => {
    const form=document.querySelector('.draw-document-dialog form');if(!form)return;
    for(const [key,value] of Object.entries(${JSON.stringify(values)})) {
      const input=form.elements[key];input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    form.requestSubmit();
  })()`);
  await wait(50);
}
/** Import in Draw asks for Place options when an image is chosen; submit them (Template off unless asked). */
export async function submitPlaceDialog(evaluate, { template = false } = {}) {
  for (let i=0;i<100&&!(await evaluate("!!document.querySelector('.draw-place-dialog form')"));i++) await wait(50);
  await evaluate(`(()=>{const f=document.querySelector('.draw-place-dialog form');if(!f)return;if(f.elements.template.checked!==${template})f.elements.template.click();f.requestSubmit();})()`);
}
