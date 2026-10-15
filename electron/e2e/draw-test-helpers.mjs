import { wait } from './cdp.mjs';
export const activeDraw = `(await import('./draw/index.mjs')).getDrawWorkspace(document.querySelector('.draw-project[data-tab-id="'+document.querySelector('.doc-tab.is-active').dataset.tabId+'"]'))`;
export async function submitNewDrawDialog(evaluate, values={}) {
  await evaluate(`(() => {
    const form=document.querySelector('.draw-document-dialog form');if(!form)return;
    for(const [key,value] of Object.entries(${JSON.stringify(values)})) {
      const input=form.elements[key];input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    form.requestSubmit();
  })()`);
  await wait(50);
}
