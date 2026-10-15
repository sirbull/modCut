import { openModal } from '../../ui.js';
import { ARTBOARD_PRESETS, MAX_ARTBOARD_SIZE, presetSize, newDrawDocument } from '../doc/artboards.mjs';

let dialogId=0;
const safeOption=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function openDrawModal(options) {
  const previous=document.activeElement, result=openModal(options), overlay=document.querySelector('.modal-overlay:last-of-type'),modal=overlay.querySelector('.modal');
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  const title=modal.querySelector('.panel__header');title.id=`draw-dialog-${++dialogId}`;modal.setAttribute('aria-labelledby',title.id);
  const keyboard=event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();modal.querySelector('[data-x=cancel]').click();}
    if(event.key==='Tab'){
      const items=[...modal.querySelectorAll('input:not(:disabled),select:not(:disabled),button:not(:disabled)')].filter(el=>el.getClientRects().length);
      if(event.shiftKey && document.activeElement===items[0]){event.preventDefault();items.at(-1).focus();}
      else if(!event.shiftKey && document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}
    }
  };
  modal.addEventListener('keydown',keyboard);
  return result.finally(()=>{modal.removeEventListener('keydown',keyboard);if(previous?.isConnected)previous.focus();});
}

export async function newDocumentDialog(bed) {
  const values = await openDrawModal({title:'New Draw document',submitLabel:'Create document',className:'draw-document-dialog',fields:[
    {key:'name',label:'Document name',value:'Untitled',required:true},
    {key:'preset',label:'Size',type:'select',value:'bed',options:ARTBOARD_PRESETS.map(p=>({value:p.id,label:p.id==='bed' ? safeOption(`Bed: ${bed.name} (${bed.width} × ${bed.height} mm)`) : p.name})),
      sync:(values,previous)=>previous && previous.preset===values.preset && (previous.width!==values.width || previous.height!==values.height) ? 'custom' : undefined},
    ...['width','height'].map(key=>({key,label:`${key==='width'?'Width':'Height'} (mm)`,type:'number',value:bed[key],min:.001,max:MAX_ARTBOARD_SIZE,step:.001,required:true,
      sync:(values,previous)=>values.preset!=='custom' && (!previous || previous.preset!==values.preset) ? presetSize(values.preset,bed)[key] : undefined})),
    {key:'count',label:'Artboards',type:'number',value:1,min:1,max:1000,step:1,required:true},
    {key:'layout',label:'Arrange',type:'select',value:'grid-row',options:[{value:'grid-row',label:'Grid by row'},{value:'grid-column',label:'Grid by column'},{value:'row',label:'Single row'},{value:'column',label:'Single column'}]},
    {key:'columns',label:'Columns',type:'number',value:2,min:1,max:1000,step:1,showIf:v=>v.layout.startsWith('grid')},
    {key:'spacing',label:'Spacing (mm)',type:'number',value:20,min:0,step:.1,required:true},
  ]});
  return values ? newDrawDocument(values,bed) : null;
}
export function shapeSizeDialog(tool, defaults = {}) {
  const radial=['polygon','star'].includes(tool), line=tool==='line';
  const fields=radial ? [
    {key:'radius',label:tool==='star'?'Outer radius (mm)':'Radius (mm)',type:'number',value:20,min:.001,step:'any',required:true},
    {key:'points',label:tool==='star'?'Points':'Sides',type:'number',value:defaults.points ?? (tool==='star'?5:6),min:tool==='star'?2:3,max:100,step:1,required:true},
    ...(tool==='star'?[{key:'ratio',label:'Inner / outer radius',type:'number',value:.5,min:.001,max:.999,step:'any',required:true}]:[]),
  ] : line ? [
    {key:'lineLength',label:'Length (mm)',type:'number',value:40,min:.001,step:'any',required:true},
    {key:'angle',label:'Angle (°)',type:'number',value:0,step:.1,required:true},
  ] : [
    {key:'width',label:'Width (mm)',type:'number',value:40,min:.001,step:'any',required:true},
    {key:'height',label:'Height (mm)',type:'number',value:30,min:.001,step:'any',required:true},
    ...(tool==='rounded-rectangle'?[{key:'cornerRadius',label:'Corner radius (mm)',type:'number',value:5,min:0,step:.01,required:true}]:[]),
  ];
  return openDrawModal({title:'Draw exact shape',submitLabel:'Draw shape',className:'draw-shape-dialog',fields});
}
export function rearrangeDialog() {
  return openDrawModal({title:'Rearrange artboards',submitLabel:'Rearrange',fields:[
    {key:'layout',label:'Arrange',type:'select',value:'grid-row',options:[{value:'grid-row',label:'Grid by row'},{value:'grid-column',label:'Grid by column'},{value:'row',label:'Single row'},{value:'column',label:'Single column'}]},
    {key:'columns',label:'Columns',type:'number',value:2,min:1,max:1000,step:1,required:true},
    {key:'spacing',label:'Spacing (mm)',type:'number',value:20,min:0,step:.1,required:true},
  ]});
}
