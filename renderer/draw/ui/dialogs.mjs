import { openModal } from '../../ui.js';
import { MAX_ARTBOARDS, newDrawDocument } from '../doc/artboards.mjs';
import { DOCUMENT_PRESETS, PRESET_CATEGORIES, UNIT_LABELS, RESOLUTIONS, RECENT_KEY, TEMPLATES_KEY, toMm, fromMm, formatSize, normalizeSetup,
  rememberRecent, saveTemplate, removeTemplate, loadStoredList, storeList } from '../doc/presets.mjs';
import { dialogOperation } from '../geom/transforms.mjs';
import { NAMED_LAYER_COLORS, layerColorName } from '../doc/layers.mjs';
import { enhanceNumberFields } from './number-field.mjs';
import { WARP_STYLES } from '../geom/warp.mjs';
import { LIVE_LABELS } from '../doc/effects.mjs';
import { COLOR_MODES, colorValues, colorFromValues, normalizeHex } from '../doc/color.mjs';
import { createColorSurface } from './color-surface.mjs';

let dialogId=0;

/** Detached color choice: Cancel leaves the document untouched; OK commits one paint change. */
export function colorPickerDialog(initial, recent = []) {
  const result = openDrawModal({title:'Color Picker',submitLabel:'OK',className:'draw-color-dialog',fields:[]});
  const modal = document.querySelector('.draw-color-dialog'), form = modal.querySelector('form');
  let chosen = initial, shown = initial || '#FFFFFF';
  const layout = document.createElement('div'); layout.className = 'draw-color-dialog__layout';
  const controls = document.createElement('div'); controls.className = 'draw-color-dialog__controls';
  const previews = document.createElement('div'); previews.className = 'draw-color-dialog__previews';
  const preview = (label,value) => {
    const wrap = document.createElement('div'), name = document.createElement('span'), chip = document.createElement('div');
    name.textContent = label; chip.className = 'draw-color-preview'; chip.style.backgroundColor = value || '#FFFFFF'; chip.classList.toggle('is-none',!value);
    wrap.append(name,chip); previews.append(wrap); return chip;
  };
  const next = preview('New color',initial); preview('Current color',initial); controls.append(previews);
  const fields = new Map();
  function sync(hsb = null) {
    next.style.backgroundColor = chosen || '#FFFFFF'; next.classList.toggle('is-none',chosen === null);
    for (const [mode,inputs] of fields) (mode === 'hsb' && Array.isArray(hsb) ? hsb : colorValues(mode,shown)).forEach((v,i) => { inputs[i].value = v; });
    hex.value = chosen === null ? '' : shown.slice(1); hex.setCustomValidity(''); none.setAttribute('aria-pressed',String(chosen === null));
  }
  const surface = createColorSurface(shown,{verticalHue:true,onInput(value,hsb) { chosen = shown = value; sync(hsb); }});
  for (const mode of ['hsb','rgb','cmyk']) {
    const group = document.createElement('fieldset'); group.className = 'draw-color-dialog__channels';
    const legend = document.createElement('legend'); legend.textContent = COLOR_MODES[mode].name; group.append(legend);
    const inputs = COLOR_MODES[mode].channels.map(([label,max],i) => {
      const row = document.createElement('label'), name = document.createElement('span'), input = document.createElement('input');
      name.textContent = label; input.type = 'number'; input.min = '0'; input.max = max; input.step = 'any'; input.dataset.colorChannel = `${mode}-${i}`; input.setAttribute('aria-label',`${COLOR_MODES[mode].name} ${label}`);
      input.addEventListener('input',() => { if (!inputs.every(i => i.validity.valid && Number.isFinite(i.valueAsNumber))) return;
        chosen = shown = colorFromValues(mode,inputs.map(i => i.valueAsNumber));
        if (mode === 'hsb') surface.setHsb(inputs.map(i => i.valueAsNumber)); else surface.setHex(shown);
        // Keep the field being typed into intact until the value is committed.
        next.style.backgroundColor = shown; next.classList.remove('is-none'); hex.value = shown.slice(1); hex.setCustomValidity('');
        for (const [other,channels] of fields) if (other !== mode) colorValues(other,shown).forEach((v,i) => { channels[i].value = v; });
      });
      input.addEventListener('change',() => sync(mode === 'hsb' ? inputs.map(i => i.valueAsNumber) : null)); row.append(name,input); group.append(row); return input;
    }); fields.set(mode,inputs); controls.append(group);
  }
  const hexLabel = document.createElement('label'); hexLabel.className = 'draw-field'; hexLabel.textContent = 'Hex';
  const hex = document.createElement('input'); hex.type = 'text'; hex.maxLength = 7; hex.spellcheck = false; hex.dataset.colorHex = ''; hex.setAttribute('aria-label','Hex'); hexLabel.append(hex);
  hex.addEventListener('input',() => { try { const color = normalizeHex(hex.value); chosen = shown = color; hex.setCustomValidity(''); surface.setHex(color); next.style.backgroundColor = color; next.classList.remove('is-none');
    for (const [mode,channels] of fields) colorValues(mode,color).forEach((v,i) => { channels[i].value = v; }); }
    catch { hex.setCustomValidity('Enter a hex color such as #1A2B3C.'); } });
  hex.addEventListener('change',() => { if (hex.validity.valid) sync(); });
  const hexRow = document.createElement('div'); hexRow.className = 'draw-color-dialog__hex'; hexRow.append(hexLabel); controls.append(hexRow);
  const sampler = document.createElement('button'); sampler.type = 'button'; sampler.className = 'btn btn--ghost btn--sm draw-color-dialog__eyedropper';
  sampler.dataset.colorEyedropper = ''; sampler.setAttribute('aria-label','Pick a color from the screen'); sampler.title = 'Pick a color from the screen';
  sampler.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 5 5 5M4 20l4-1L20 7a2.1 2.1 0 0 0-3-3L5 16z"/></svg>';
  sampler.disabled = typeof window.EyeDropper !== 'function'; hexRow.append(sampler);
  const samplingNote = document.createElement('small'); samplingNote.className = 'draw-color-dialog__sampling-note'; samplingNote.setAttribute('role','status');
  if (sampler.disabled) samplingNote.textContent = 'Screen color picking is unavailable on this platform.';
  controls.append(samplingNote);
  const overlay = modal.parentElement;
  let sampling = null, alive = true;
  sampler.addEventListener('click',async () => {
    if (sampling || !alive) return;
    sampling = new AbortController(); const signal = sampling.signal;
    samplingNote.textContent = ''; overlay.classList.add('draw-color-sampling'); modal.dataset.sampling = 'true';
    try {
      // Let the dialog and its dimming layer disappear before the screen is sampled.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!alive || signal.aborted) return;
      const { sRGBHex } = await new window.EyeDropper().open({signal});
      if (!alive) return;
      chosen = shown = normalizeHex(sRGBHex); surface.setHex(shown); sync();
    } catch (error) {
      if (alive && error.name !== 'AbortError') samplingNote.textContent = 'Could not pick a screen color. Try again.';
    } finally {
      sampling = null; overlay.classList.remove('draw-color-sampling'); delete modal.dataset.sampling;
      if (alive) sampler.focus();
    }
  });
  const palette = document.createElement('div'); palette.className = 'draw-swatch-row draw-color-dialog__swatches';
  palette.setAttribute('role','group'); palette.setAttribute('aria-label','Recent Colors');
  const none = document.createElement('button'); none.type = 'button'; none.className = 'draw-swatch is-none'; none.setAttribute('aria-label','None'); none.dataset.colorNone = '';
  none.addEventListener('click',() => { chosen = null; sync(); }); palette.append(none);
  for (const value of [...new Set(recent)].filter(Boolean).slice(0,10)) {
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'draw-swatch'; chip.style.setProperty('--swatch',value); chip.setAttribute('aria-label',value);
    chip.dataset.colorRecent = value;
    chip.addEventListener('click',() => { chosen = shown = normalizeHex(value); surface.setHex(shown); sync(); }); palette.append(chip);
  }
  const recentLabel = document.createElement('div'); recentLabel.className = 'draw-color-dialog__recent-label'; recentLabel.textContent = 'Recent Colors';
  if (!recent.length) { const empty = document.createElement('span'); empty.className = 'draw-panel__hint'; empty.textContent = 'Colors you apply appear here.'; palette.append(empty); }
  layout.append(surface.element,controls); form.prepend(layout); layout.after(recentLabel,palette); sync(); surface.element.querySelector('[role=slider]').focus();
  return result.then(values => values ? { value: chosen } : null).finally(() => { alive = false; sampling?.abort(); });
}
/** Uniform text editor. Preview is detached; Apply is a single document command. */
function openDrawModal(options) {
  const previous=document.activeElement, result=openModal(options), overlay=document.querySelector('.modal-overlay:last-of-type'),modal=overlay.querySelector('.modal');
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');enhanceNumberFields(modal);
  const title=modal.querySelector('.panel__header');title.id=`draw-dialog-${++dialogId}`;modal.setAttribute('aria-labelledby',title.id);
  const keyboard=trapDialogKeys(modal,()=>modal.querySelector('[data-x=cancel]').click());
  modal.addEventListener('keydown',keyboard);
  return result.finally(()=>{modal.removeEventListener('keydown',keyboard);if(previous?.isConnected)previous.focus();});
}

function trapDialogKeys(modal,cancel) {
  return event=>{
    if(modal.dataset.sampling === 'true'){event.stopPropagation();return;}
    if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();}
    if(event.key==='Tab'){
      const items=[...modal.querySelectorAll('input:not(:disabled):not([type=hidden]),textarea:not(:disabled),select:not(:disabled),button:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
      if(event.shiftKey && document.activeElement===items[0]){event.preventDefault();items.at(-1).focus();}
      else if(!event.shiftKey && document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}
    }
  };
}
const ORIENTATION_ICONS={portrait:'<rect x="7" y="3" width="10" height="18" rx="1.5"/>',landscape:'<rect x="3" y="7" width="18" height="10" rx="1.5"/>'};
/**
 * New document dialog with Recent, Templates and Saved tabs beside editable preset details.
 * `machines` are the configured laser profiles; `storage` holds recent setups and saved templates.
 */
export function newDocumentDialog(bed,{machines=[],storage=globalThis.localStorage,editDocument=null,activeArtboardId=null}={}) {
  const machineEntries=[{id:'bed',name:`${bed.name||'Machine bed'} (current)`,width:bed.width,height:bed.height},
    ...machines.filter(m=>m.name!==bed.name||m.width!==bed.width||m.height!==bed.height).map((m,i)=>({id:`machine-${i}`,name:m.name,width:m.width,height:m.height}))]
    .filter(m=>m.width>0&&m.height>0).map(m=>({...m,category:'laser',units:'mm',ppi:300,machine:true}));
  const presets=[...machineEntries,...DOCUMENT_PRESETS];
  let recent=loadStoredList(storage,RECENT_KEY),templates=loadStoredList(storage,TEMPLATES_KEY);
  const previous=document.activeElement,overlay=document.createElement('div');overlay.className='modal-overlay';
  const modal=document.createElement('div');modal.className='modal panel draw-document-dialog';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  const make=(tag,className,parent,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;parent?.append(el);return el;};
  if(editDocument)modal.classList.add('draw-document-settings-dialog');
  const title=make('div','panel__header',modal,editDocument?'Document settings':'New document');title.id=`draw-dialog-${++dialogId}`;modal.setAttribute('aria-labelledby',title.id);
  const form=make('form','draw-new-doc',make('div','panel__body',modal));form.noValidate=false;
  const browse=make('section','draw-new-doc__browse',form),tabs=make('div','draw-new-doc__tabs',browse);tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Document sources');
  const chips=make('div','draw-new-doc__chips',browse),grid=make('div','draw-new-doc__grid',browse);grid.setAttribute('role','tabpanel');grid.id=`${title.id}-panel`;
  const details=make('aside','draw-new-doc__details',form);make('h3','draw-new-doc__heading',details,'Preset details');
  const field=(label,parent,className='')=>{const wrap=make('label',`draw-new-doc__field ${className}`,parent);make('span','',wrap,label);return wrap;};
  const input=(parent,name,attributes={})=>{const el=make('input','input',parent);el.name=name;Object.assign(el,attributes);return el;};
  const nameInput=input(field('Name',details),'name',{value:editDocument?.name??'Untitled',required:true,maxLength:120});
  const boardSelect=editDocument?make('select','select',field('Artboard',details)):null;
  const boardSizes=new Map(editDocument?.artboards.map(b=>[b.id,{width:b.width,height:b.height}])??[]);
  let editingBoard=editDocument?.artboards.find(b=>b.id===activeArtboardId)??editDocument?.artboards[0];
  if(boardSelect){boardSelect.name='artboard';for(const board of editDocument.artboards)boardSelect.append(new Option(board.name,board.id,false,board.id===editingBoard.id));}
  const presetInput=input(form,'preset',{type:'hidden',value:'bed'});
  const sizeRow=make('div','draw-new-doc__row',details);
  const number={type:'number',step:'any',min:'0.001',required:true};
  const widthInput=input(field('Width',sizeRow),'width',number);
  const unitSelect=make('select','select',field('Units',sizeRow));unitSelect.name='units';
  for(const [value,label] of Object.entries(UNIT_LABELS))unitSelect.append(new Option(label,value));
  const heightRow=make('div','draw-new-doc__row',details);
  const heightInput=input(field('Height',heightRow),'height',number);
  const orientationField=make('div','draw-new-doc__field',heightRow);make('span','',orientationField,'Orientation');
  const orientation=make('div','draw-new-doc__orientation',orientationField);orientation.setAttribute('role','group');orientation.setAttribute('aria-label','Orientation');
  const orientationButtons=Object.fromEntries(['portrait','landscape'].map(id=>{const b=make('button','draw-new-doc__orient',orientation);b.type='button';b.dataset.orientation=id;
    b.setAttribute('aria-label',id[0].toUpperCase()+id.slice(1));b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${ORIENTATION_ICONS[id]}</svg>`;return [id,b];}));
  const boardRow=make('div','draw-new-doc__row',details);
  const countInput=input(field('Artboards',boardRow),'count',{type:'number',min:'1',max:String(MAX_ARTBOARDS),step:'1',value:'1',required:true});
  if(editDocument){countInput.disabled=true;countInput.closest('label').hidden=true;}
  const ppiSelect=make('select','select',field('Resolution',boardRow));ppiSelect.name='ppi';
  for(const ppi of RESOLUTIONS)ppiSelect.append(new Option(`${ppi} ppi${ppi===72?' (screen)':ppi===300?' (high)':''}`,String(ppi)));
  if(editDocument&&!RESOLUTIONS.includes(editDocument.rasterEffectsPpi))ppiSelect.append(new Option(`${editDocument.rasterEffectsPpi} ppi`,String(editDocument.rasterEffectsPpi)));
  const arrange=make('div','draw-new-doc__arrange',details);
  const layoutSelect=make('select','select',field('Arrange',arrange));layoutSelect.name='layout';
  for(const [value,label] of [['grid-row','Grid by row'],['grid-column','Grid by column'],['row','Single row'],['column','Single column']])layoutSelect.append(new Option(label,value));
  const arrangeRow=make('div','draw-new-doc__row',arrange);
  const columnsInput=input(field('Columns',arrangeRow),'columns',{type:'number',min:'1',max:String(MAX_ARTBOARDS),step:'1',value:'2',required:true});
  const spacingInput=input(field('Spacing',arrangeRow),'spacing',{type:'number',min:'0',step:'any',value:'20',required:true});
  const error=make('p','draw-new-doc__error',details);error.setAttribute('role','alert');
  const actions=make('div','modal-actions draw-new-doc__actions',form);
  const save=make('button','btn btn--secondary btn--sm draw-new-doc__save-template',actions,'Save as template');save.type='button';save.dataset.x='save-template';
  const cancel=make('button','btn btn--ghost btn--sm',actions,'Cancel');cancel.type='button';cancel.dataset.x='cancel';
  const create=make('button','btn btn--primary btn--sm',actions,editDocument?'Apply':'Create');create.type='submit';

  // Sizes live in millimetres; the inputs show them in the chosen unit.
  const state={tab:recent.length?'recent':'templates',category:'laser',widthMm:bed.width,heightMm:bed.height,spacingMm:20,label:machineEntries[0]?.name??'Custom',orientation:null};
  const oriented=entry=>{
    if(!state.orientation)return entry;
    const short=Math.min(entry.width,entry.height),long=Math.max(entry.width,entry.height);
    return {...entry,width:state.orientation==='landscape'?long:short,height:state.orientation==='landscape'?short:long};
  };
  const currentSetup=()=>normalizeSetup({width:state.widthMm,height:state.heightMm,units:unitSelect.value,ppi:Number(ppiSelect.value),count:Number(countInput.value),
    layout:layoutSelect.value,columns:Number(columnsInput.value),spacing:state.spacingMm});
  const showUnits=()=>{const unit=unitSelect.value;widthInput.value=fromMm(state.widthMm,unit);heightInput.value=fromMm(state.heightMm,unit);spacingInput.value=fromMm(state.spacingMm,unit);};
  const syncControls=()=>{
    const landscape=state.widthMm>state.heightMm;
    orientationButtons.portrait.setAttribute('aria-pressed',String(!landscape));orientationButtons.landscape.setAttribute('aria-pressed',String(landscape));
    const many=!editDocument&&Number(countInput.value)>1;arrange.hidden=!many;for(const el of [layoutSelect,columnsInput,spacingInput])el.disabled=!many;
    columnsInput.closest('label').hidden=!layoutSelect.value.startsWith('grid');columnsInput.disabled=!many||columnsInput.closest('label').hidden;
    for(const card of grid.querySelectorAll('[data-preset]'))card.setAttribute('aria-pressed',String(card.dataset.preset===presetInput.value));
    error.textContent='';
  };
  function apply(entry,id) {
    entry=oriented(entry);
    state.widthMm=entry.width;state.heightMm=entry.height;state.label=entry.label??entry.name??'Custom';presetInput.value=id;
    unitSelect.value=entry.units??'mm';
    const ppi=entry.ppi??300;if(![...ppiSelect.options].some(o=>o.value===String(ppi)))ppiSelect.append(new Option(`${ppi} ppi`,String(ppi)));ppiSelect.value=String(ppi);
    if(entry.count&&!editDocument){countInput.value=entry.count;layoutSelect.value=entry.layout;columnsInput.value=entry.columns;state.spacingMm=entry.spacing;}
    showUnits();syncControls();
  }
  const preview=(parent,width,height)=>{const box=make('span','draw-preset-card__preview',parent),scale=1/Math.max(width,height);
    const page=make('span','',box);page.style.width=`${width*scale*100}%`;page.style.height=`${height*scale*100}%`;};
  function card(id,entry,name,onRemove) {
    const wrap=make('div','draw-preset-card',grid),button=make('button','draw-preset-card__select',wrap);button.type='button';button.dataset.preset=id;
    const shown=oriented(entry);
    preview(button,shown.width,shown.height);make('span','draw-preset-card__name',button,name);make('span','draw-preset-card__size',button,sizeText(shown));
    button.addEventListener('click',()=>apply(entry,id));button.addEventListener('dblclick',()=>{apply(entry,id);form.requestSubmit();});
    if(onRemove){const remove=make('button','draw-preset-card__remove',wrap,'×');remove.type='button';remove.setAttribute('aria-label',`Delete template ${name}`);remove.addEventListener('click',onRemove);}
  }
  const sizeText=entry=>formatSize(entry.width,entry.height,entry.units)+(entry.count>1?` · ${entry.count} artboards`:'');
  const empty=text=>make('p','draw-new-doc__empty',grid,text);
  function renderGrid() {
    for(const button of tabs.children){const on=button.dataset.tab===state.tab;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;}
    chips.hidden=state.tab!=='templates';
    for(const chip of chips.children)chip.setAttribute('aria-pressed',String(chip.dataset.category===state.category));
    grid.replaceChildren();
    if(state.tab==='recent'){
      if(!recent.length)empty('Documents you create appear here, so you can reuse their size and settings.');
      recent.forEach((entry,i)=>card(`recent-${i}`,entry,entry.label));
    } else if(state.tab==='saved'){
      if(!templates.length)empty('No saved templates yet. Choose your settings, then click Save as template.');
      for(const entry of templates)card(`template-${entry.id}`,entry,entry.name,()=>{
        templates=removeTemplate(templates,entry.id);storeList(storage,TEMPLATES_KEY,templates);renderGrid();});
    } else for(const entry of presets.filter(p=>p.category===state.category))card(entry.id,entry,entry.name);
    syncControls();
  }
  for(const [id,label] of [['recent','Recent'],['templates','Templates'],['saved','Saved']]){
    const button=make('button','draw-new-doc__tab',tabs,label);button.type='button';button.dataset.tab=id;button.setAttribute('role','tab');button.setAttribute('aria-controls',grid.id);
    button.addEventListener('click',()=>{state.tab=id;renderGrid();});
  }
  tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();
    const list=[...tabs.children],next=list[(list.findIndex(b=>b.dataset.tab===state.tab)+(event.key==='ArrowRight'?1:list.length-1))%list.length];next.click();next.focus();});
  for(const category of PRESET_CATEGORIES){const chip=make('button','draw-new-doc__chip',chips,category.name);chip.type='button';chip.dataset.category=category.id;
    chip.addEventListener('click',()=>{state.category=category.id;renderGrid();});}
  for(const [id,button] of Object.entries(orientationButtons))button.addEventListener('click',()=>{
    state.orientation=id;
    const size=oriented({width:state.widthMm,height:state.heightMm});state.widthMm=size.width;state.heightMm=size.height;
    showUnits();renderGrid();});
  form.addEventListener('input',event=>{
    const target=event.target,unit=unitSelect.value;
    if(target===presetInput){const entry=presets.find(p=>p.id===presetInput.value);if(entry)apply(entry,entry.id);else{state.label='Custom';syncControls();}return;}
    if(target===widthInput||target===heightInput){const mm=toMm(Number(target.value),unit);if(mm>0){state[target===widthInput?'widthMm':'heightMm']=mm;state.orientation=null;presetInput.value='custom';state.label='Custom';renderGrid();}}
    if(target===spacingInput&&Number(spacingInput.value)>=0)state.spacingMm=toMm(Number(spacingInput.value),unit);
    syncControls();
  });
  unitSelect.addEventListener('change',showUnits);
  save.addEventListener('click',()=>{
    if(!form.reportValidity())return;
    try{
      const setup=currentSetup(),next=saveTemplate(templates,nameInput.value,setup);
      if(!storeList(storage,TEMPLATES_KEY,next))throw new Error('Could not save the template.');
      templates=next;state.tab='saved';presetInput.value=`template-${templates[0].id}`;state.label=templates[0].name;renderGrid();
    }catch(problem){error.textContent=problem.message;}
  });
  boardSelect?.addEventListener('change',()=>{
    boardSizes.set(editingBoard.id,{width:state.widthMm,height:state.heightMm});
    editingBoard=editDocument.artboards.find(b=>b.id===boardSelect.value);
    const size=boardSizes.get(editingBoard.id);state.widthMm=size.width;state.heightMm=size.height;presetInput.value='custom';showUnits();syncControls();
  });
  if(editDocument)apply({...boardSizes.get(editingBoard.id),units:editDocument.units,ppi:editDocument.rasterEffectsPpi},'custom');
  else apply(machineEntries[0]??presets.find(p=>p.id==='a4'),machineEntries[0]?'bed':'a4');
  renderGrid();
  enhanceNumberFields(modal);overlay.append(modal);document.body.append(overlay);nameInput.focus();nameInput.select();
  return new Promise(resolve=>{
    const close=value=>{modal.removeEventListener('keydown',keyboard);overlay.remove();if(previous?.isConnected)previous.focus();resolve(value);};
    const keyboard=trapDialogKeys(modal,()=>close(null));modal.addEventListener('keydown',keyboard);
    cancel.addEventListener('click',()=>close(null));overlay.addEventListener('click',event=>{if(event.target===overlay)close(null);});
    form.addEventListener('submit',event=>{event.preventDefault();
      try{
        const setup=currentSetup();
        if(editDocument){
          boardSizes.set(editingBoard.id,{width:setup.width,height:setup.height});
          const artboards=editDocument.artboards.map(board=>{
            const size=boardSizes.get(board.id);normalizeSetup({...size});return {...board,...size};
          });
          close({properties:{name:nameInput.value.trim()||'Untitled',units:setup.units,rasterEffectsPpi:setup.ppi,artboards},artboardId:editingBoard.id});return;
        }
        const doc=newDrawDocument({name:nameInput.value.trim()||'Untitled',preset:'custom',...setup},bed);
        recent=rememberRecent(recent,{label:state.label,...setup});storeList(storage,RECENT_KEY,recent);
        close(doc);
      }catch(problem){error.textContent=problem.message;}
    });
  });
}
export function documentSettingsDialog(doc,activeArtboardId,options={}) {
  const board=doc.artboards.find(b=>b.id===activeArtboardId)??doc.artboards[0];
  return newDocumentDialog(board,{...options,editDocument:doc,activeArtboardId});
}
export function saveTemplateDialog(name) {
  return openDrawModal({title:'Save Document Properties as Template',submitLabel:'Save template',className:'draw-template-dialog',fields:[
    {key:'name',label:'Template name',value:name,required:true,description:'Saves the artboard size, count and arrangement, units and resolution. Artwork is not included.'},
  ]});
}
/** Pencil Options: fidelity from accurate to smooth, and closing near ends. */
export function pencilDialog(defaults={}) {
  return openDrawModal({title:'Pencil Tool Options',submitLabel:'OK',className:'draw-pencil-dialog',fields:[
    {key:'fidelity',label:'Fidelity',type:'select',value:String(defaults.fidelity??3),options:[{value:'1',label:'Accurate'},{value:'2',label:'More accurate'},{value:'3',label:'Balanced'},{value:'4',label:'Smoother'},{value:'5',label:'Smooth'}]},
    {key:'close',label:'Close paths when ends are near',type:'checkbox',value:defaults.close!==false},
    {key:'closeDistance',label:'Within (pixels)',type:'number',value:defaults.closeDistance??15,min:1,max:100,step:1,required:true},
    {key:'keepSelected',label:'Keep selected',type:'checkbox',value:defaults.keepSelected!==false},
  ]}).then(values=>values&&{...values,fidelity:Number(values.fidelity)});
}
export function shapeSizeDialog(tool, defaults = {}) {
  const radial=['polygon','star'].includes(tool), line=tool==='line';
  const units = defaults.units ?? 'mm';
  const fields=radial ? [
    {key:'radius',label:tool==='star'?'Outer radius (mm)':'Radius (mm)',type:'number',value:20,min:.001,step:'any',required:true},
    {key:'points',label:tool==='star'?'Points':'Sides',type:'number',value:defaults.points ?? (tool==='star'?5:6),min:tool==='star'?2:3,max:100,step:1,required:true},
    ...(tool==='star'?[{key:'ratio',label:'Inner / outer radius',type:'number',value:.5,min:.001,max:.999,step:'any',required:true}]:[]),
  ] : line ? [
    {key:'lineLength',label:`Length (${units})`,type:'number',value:defaults.lineLength ?? 40,min:.001,step:'any',required:true},
    {key:'angle',label:'Angle (°)',type:'number',value:0,step:.1,required:true},
  ] : [
    {key:'width',label:`Width (${units})`,type:'number',value:defaults.width ?? 40,min:.001,step:'any',required:true},
    {key:'height',label:`Height (${units})`,type:'number',value:defaults.height ?? 30,min:.001,step:'any',required:true},
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
export function transformDialog(tool,origin,defaults={},onPreview=()=>{}) {
  const numeric=(key,label,value,extra={})=>({key,label,value,type:'number',step:'any',required:true,...extra});
  const fields=tool==='scale'?[
    {key:'mode',label:'Scaling',type:'select',value:defaults.mode??'uniform',options:[{value:'uniform',label:'Uniform'},{value:'nonuniform',label:'Non-uniform'}]},
    numeric('uniform','Scale (%)',defaults.uniform??100,{min:.01,max:100000,showIf:v=>v.mode==='uniform'}),
    numeric('x','Horizontal (%)',defaults.x??100,{min:.01,max:100000,showIf:v=>v.mode==='nonuniform'}),
    numeric('y','Vertical (%)',defaults.y??100,{min:.01,max:100000,showIf:v=>v.mode==='nonuniform'}),
    {key:'scaleStrokes',label:'Scale strokes & effects',type:'checkbox',value:defaults.scaleStrokes??true,description:'Scale stroke widths, dash lengths and effect sizes with objects.'},
  ]:tool==='reflect'?[
    {key:'axis',label:'Reflection axis',type:'select',value:defaults.axis??'vertical',options:[{value:'horizontal',label:'Horizontal'},{value:'vertical',label:'Vertical'},{value:'angle',label:'Custom angle'}]},
    numeric('angle','Axis angle (°, counterclockwise)',defaults.angle??0,{min:-36000,max:36000,showIf:v=>v.axis==='angle'}),
  ]:tool==='shear'?[
    numeric('angle','Shear angle (°)',defaults.angle??0,{min:-89.99,max:89.99}),
    {key:'axis',label:'Axis',type:'select',value:defaults.axis??'horizontal',options:[{value:'horizontal',label:'Horizontal'},{value:'vertical',label:'Vertical'}]},
  ]:[numeric('angle','Angle (°, counterclockwise)',defaults.angle??0,{min:-36000,max:36000})];
  fields.push(numeric('originX','Reference X (mm)',origin[0]),numeric('originY','Reference Y (mm)',origin[1]),
    {key:'preview',label:'Preview',type:'checkbox',value:true},{key:'copy',label:'Copy',type:'checkbox',value:false});
  const result=openDrawModal({title:tool[0].toUpperCase()+tool.slice(1),submitLabel:'Apply',className:'draw-transform-dialog',fields});
  const modal=document.querySelector('.draw-transform-dialog'),form=modal.querySelector('form'),copyInput=form.elements.copy;
  copyInput.closest('label').style.display='none';
  const copy=document.createElement('button');copy.type='button';copy.className='btn btn--ghost btn--sm';copy.textContent='Copy';copy.dataset.x='copy';
  copy.addEventListener('click',()=>{if(form.reportValidity()){copyInput.checked=true;form.requestSubmit();}});form.querySelector('.modal-actions').insertBefore(copy,form.querySelector('[type=submit]'));
  const read=()=>Object.fromEntries(fields.map(f=>[f.key,f.type==='checkbox'?form.elements[f.key].checked:f.type==='number'?Number(form.elements[f.key].value):form.elements[f.key].value]));
  const preview=()=>{const values=read();onPreview(form.checkValidity()&&values.preview?{operation:dialogOperation(tool,values),origin:[values.originX,values.originY],scaleStrokes:tool==='scale'?values.scaleStrokes:null}:null);};
  form.addEventListener('input',preview);form.addEventListener('change',preview);preview();
  return result.finally(()=>{form.removeEventListener('input',preview);form.removeEventListener('change',preview);});
}
/** Layer Options laid out like Illustrator: name, named color with a swatch, then two columns of options. */
/**
 * A named-color list that shows each color's swatch to the right of its name, which a native select cannot.
 * The button is the form control `colorName`; setting its value and dispatching change picks a color too.
 */
function colorNameMenu(colors,onPick) {
  const make=(tag,className,parent,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;parent?.append(el);return el;};
  const button=make('button','select draw-color-menu');button.type='button';button.name='colorName';
  button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Layer color');
  const label=make('span','draw-color-menu__name',button),chip=make('span','draw-color-menu__swatch',button);chip.setAttribute('aria-hidden','true');
  const list=make('ul','draw-color-menu__list');list.setAttribute('role','listbox');list.setAttribute('aria-label','Layer colors');list.tabIndex=-1;list.id=`draw-color-menu-${++dialogId}`;
  const entries=[...colors.map(({name,hex})=>({name,value:hex})),{name:'Other…',value:'other'}];
  const items=entries.map((entry,i)=>{const li=make('li','draw-color-menu__option',list);li.id=`${list.id}-${i}`;li.setAttribute('role','option');li.dataset.value=entry.value;
    make('span','draw-color-menu__name',li,entry.name);const sw=make('span','draw-color-menu__swatch',li);sw.setAttribute('aria-hidden','true');
    if(entry.value==='other')sw.classList.add('is-other');else sw.style.background=entry.value;
    li.addEventListener('pointerdown',event=>event.preventDefault());li.addEventListener('click',()=>{close();pick(entry.value);});
    li.addEventListener('pointermove',()=>activate(i,false));return li;});
  let active=0;
  function activate(i,scroll=true){active=Math.max(0,Math.min(items.length-1,i));items.forEach((li,n)=>li.classList.toggle('is-active',n===active));
    list.setAttribute('aria-activedescendant',items[active].id);if(scroll)items[active].scrollIntoView({block:'nearest'});}
  function pick(value){button.value=value;onPick(value);button.focus();}
  // The list is fixed to the viewport so the dialog's scrolling body never clips it; it opens where there is room.
  function open(){
    if(list.isConnected)return;
    button.closest('.modal')?.append(list);button.setAttribute('aria-expanded','true');
    const r=button.getBoundingClientRect(),below=innerHeight-r.bottom-8,above=r.top-8,height=Math.min(320,Math.max(below,above));
    Object.assign(list.style,{left:`${r.left}px`,width:`${r.width}px`,maxHeight:`${height}px`,top:below>=Math.min(320,above)?`${r.bottom+4}px`:`${r.top-4-Math.min(height,list.scrollHeight)}px`});
    activate(Math.max(0,entries.findIndex(e=>e.value===button.value)));list.focus();
    document.addEventListener('pointerdown',outside,true);
  }
  function close(){if(!list.isConnected)return;list.remove();button.setAttribute('aria-expanded','false');document.removeEventListener('pointerdown',outside,true);}
  const outside=event=>{if(!list.contains(event.target)&&!button.contains(event.target))close();};
  button.addEventListener('click',()=>list.isConnected?close():open());
  button.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open();}});
  button.addEventListener('change',()=>onPick(button.value));
  list.addEventListener('keydown',event=>{
    const step={ArrowDown:1,ArrowUp:-1,PageDown:8,PageUp:-8}[event.key];
    if(step){event.preventDefault();activate(active+step);}
    else if(event.key==='Home'||event.key==='End'){event.preventDefault();activate(event.key==='Home'?0:items.length-1);}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();close();pick(entries[active].value);}
    // Escape closes only the list, not the dialog.
    else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();button.focus();}
    else if(event.key==='Tab'){close();}
    else if(event.key.length===1){const k=event.key.toLowerCase(),from=active+1;
      const hit=[...entries.slice(from),...entries.slice(0,from)].find(e=>e.name.toLowerCase().startsWith(k));if(hit)activate(entries.indexOf(hit));}
  });
  list.addEventListener('blur',()=>setTimeout(()=>{if(!list.contains(document.activeElement))close();}));
  return {button,show(value,hex){button.value=value;label.textContent=entries.find(e=>e.value===value)?.name??'Other…';chip.style.background=hex;}};
}
export function layerOptionsDialog(layer,{focus='name'}={}) {
  const result=openDrawModal({title:'Layer Options',submitLabel:'OK',className:'draw-layer-dialog',fields:[
    {key:'name',label:'Name',value:layer.name,required:true},
    {key:'color',label:'Color',type:'color',value:layer.color.toLowerCase()},
    {key:'template',label:'Template',type:'checkbox',value:layer.template},
    {key:'locked',label:'Lock',type:'checkbox',value:layer.template||layer.locked},
    {key:'visible',label:'Show',type:'checkbox',value:layer.visible},
    {key:'printable',label:'Print',type:'checkbox',value:!layer.template&&layer.printable},
    {key:'preview',label:'Preview',type:'checkbox',value:layer.template||layer.preview!==false},
    {key:'dimImages',label:'Dim Images to:',type:'checkbox',value:layer.template||!!layer.dimImages},
    {key:'dimImagesTo',label:'Dim images to (%)',type:'number',value:layer.dimImagesTo??50,min:0,max:100,step:1,required:true},
  ]});
  const modal=document.querySelector('.draw-layer-dialog'),form=modal.querySelector('form'),el=form.elements;
  // Color: a named-color menu beside the swatch; the swatch (and "Other...") picks any color.
  const colorLabel=el.color.closest('label'),row=document.createElement('div');row.className='draw-layer-dialog__color';
  const menu=colorNameMenu(NAMED_LAYER_COLORS,value=>{if(value==='other'){el.color.click();sync();return;}el.color.value=value.toLowerCase();sync();});
  const sync=()=>menu.show(layerColorName(el.color.value)?el.color.value.toUpperCase():'other',el.color.value);
  el.color.addEventListener('input',sync);el.color.title='Choose any color';
  el.color.parentNode.insertBefore(row,el.color);row.append(menu.button,el.color);sync();
  // Options in two columns: Template | Lock, Show | Print, Preview | Dim Images to [50] %.
  // The grid joins the form first, so the moved checkboxes stay form controls for submit.
  const grid=document.createElement('div');grid.className='draw-layer-dialog__options';colorLabel.after(grid);
  for(const key of ['template','locked','visible','printable','preview','dimImages'])grid.append(el[key].closest('label'));
  const dim=el.dimImages.closest('label'),amount=el.dimImagesTo.closest('label');
  amount.classList.add('draw-layer-dialog__dim');dim.append(amount);amount.querySelector('span').textContent='%';amount.append(amount.querySelector('span'));
  el.dimImagesTo.setAttribute('aria-label','Dim images to percent');
  // Template locks, never prints and always previews; dimming the amount follows its checkbox.
  const update=()=>{const t=el.template.checked;for(const key of ['locked','printable','preview'])el[key].disabled=t;
    if(t){el.locked.checked=true;el.printable.checked=false;el.preview.checked=true;}el.dimImagesTo.disabled=!el.dimImages.checked;};
  const onTemplate=()=>{if(el.template.checked)el.dimImages.checked=true;update();};
  for(const type of ['change','input']){el.template.addEventListener(type,onTemplate);el.dimImages.addEventListener(type,update);}update();
  const target=focus==='color'?menu.button:el.name;setTimeout(()=>{target.focus();if(target===el.name)el.name.select();});
  return result.then(values=>values&&({...values,locked:el.template.checked||values.locked,printable:!el.template.checked&&values.printable,preview:el.template.checked||values.preview}));
}
/** Swatch Options: rename a swatch or change its color. */
/** Swatch Options: name, and for a colour swatch its colour and Global (edits recolor what it paints). */
export function swatchOptionsDialog(swatch) {
  return openDrawModal({title:'Swatch Options',submitLabel:'OK',className:'draw-swatch-dialog',fields:[
    {key:'name',label:'Swatch name',value:swatch.name,required:true},
    ...(swatch.gradient?[]:[{key:'hex',label:'Color',type:'color',value:swatch.hex.toLowerCase()},
      {key:'global',label:'Global (changes update every object using it)',type:'checkbox',value:!!swatch.global}]),
  ]}).then(values=>values&&{name:values.name,...(swatch.gradient?{}:{hex:values.hex.toUpperCase(),global:!!values.global})});
}
const escapeHtml=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
/**
 * Send to Cut: artboard, target and placement, with a live summary of what will be sent.
 * `summary(boardId)` returns { count, warnings } for the chosen artboard.
 */
export function sendToCutDialog({boards,boardId,summary,cutEmpty=false,linked=new Set()}) {
  // An empty Cut has nothing to replace or keep apart, so the artboard always goes into this tab's Cut.
  // Update replaces only what an earlier send of the artboard put in Cut, keeping the rest and the layer settings.
  const target=cutEmpty?[]:[{key:'target',label:'Target',type:'select',value:linked.has(boardId)?'update':'new-tab',options:[
    ...(linked.size?[{value:'update',label:'Update the earlier send in Cut'}]:[]),
    {value:'new-tab',label:'New Cut tab'},{value:'replace',label:'Replace the design in this tab’s Cut'},{value:'add',label:'Add to this tab’s Cut'}]}];
  const result=openDrawModal({title:'Send to Cut',submitLabel:'Send',className:'draw-send-dialog',fields:[
    {key:'boardId',label:'Artboard',type:'select',value:boardId,options:[...boards.map((b,i)=>({value:b.id,label:escapeHtml(`${i+1}. ${b.name}`)})),...(boards.length>1?[{value:'all',label:'All artboards, as laid out'}]:[])]},
    ...target,
    {key:'placement',label:'Placement',type:'select',value:'origin',options:[{value:'origin',label:'Artboard top left at the bed origin'},{value:'center',label:'Centered on the bed'}]},
    {key:'strokes',label:'Strokes',type:'select',value:'centerline',options:[{value:'centerline',label:'Centerline (cut and score)'},{value:'outline',label:'Outline Stroke (engrave the stroke area)'}]},
    {key:'outside',label:'Past the artboard',type:'select',value:'whole',options:[{value:'whole',label:'Send objects whole'},{value:'clip',label:'Cut at the artboard edge'}]},
    {key:'dedupe',label:'Leave out duplicate paths',type:'checkbox',value:true},
  ]});
  const modal=document.querySelector('.draw-send-dialog'),form=modal.querySelector('form'),submit=form.querySelector('[type=submit]');
  const info=document.createElement('div');info.className='draw-send-dialog__summary';info.setAttribute('role','status');info.dataset.drawSendSummary='';
  form.querySelector('.modal-actions').before(info);
  const update=()=>{
      const options={outside:form.elements.outside.value,dedupe:form.elements.dedupe.checked};
      let s;try{s=summary(form.elements.boardId.value,options);}catch(error){s={count:0,warnings:[],errors:[error.message]};}
    info.replaceChildren();const p=document.createElement('p');info.append(p);
      const outline=form.elements.strokes.value==='outline';
      const images=s.images?.length??0,paths=s.count?`${s.count} path${s.count===1?'':'s'}${s.nodes?` (${s.nodes} node${s.nodes===1?'':'s'})`:''}`:'';
      p.textContent=s.count||images?`${[paths,images?`${images} image${images===1?'':'s'} as engraving`:''].filter(Boolean).join(' and ')} will be sent${s.count?outline?'; strokes as filled outlines':' as centerline geometry':''}.${s.count?' Colors become Cut layers.':''}`:'Nothing on this artboard can be sent.';
      if(s.textCount){const note=document.createElement('p');note.textContent=`${s.textCount} text object${s.textCount===1?'':'s'} will be sent as outlines automatically. Text stays editable in Draw.`;info.append(note);}
      if(s.errors?.length){const p=document.createElement('p');p.setAttribute('role','alert');p.textContent=s.errors.join(' ');info.append(p);}
    if(s.warnings.length){const list=document.createElement('ul');for(const w of s.warnings){const li=document.createElement('li');li.textContent=w;list.append(li);}info.append(list);}
      submit.disabled=!(s.count||s.images?.length)||!!s.errors?.length;
  };
  for(const key of ['boardId','strokes','outside','dedupe'])form.elements[key].addEventListener('change',update);update();
  return result.then(values=>values&&{target:'add',...values});
}
/** Place options shown after choosing images, like the Template checkbox in Illustrator's Place dialog. */
export function placeOptionsDialog({template=false,count=1}={}) {
  const result=openDrawModal({title:'Place',submitLabel:'Place',className:'draw-place-dialog',fields:[
    {key:'template',label:'Template',type:'checkbox',value:template},
  ]});
  const form=document.querySelector('.draw-place-dialog form'),note=document.createElement('p');note.className='draw-place-dialog__note';
  note.textContent=`${count} file${count===1?'':'s'}. Template puts each file on its own locked layer below the active layer, dimmed to 50 %. Template layers are never exported or sent to Cut. Tip: hold Alt while dropping an image.`;
  form.querySelector('.modal-actions').before(note);
  return result;
}
/** Magic Wand options: which properties must be close, and how close (colours 0 to 255 per channel). */
export function magicWandDialog(defaults={}) {
  return openDrawModal({title:'Magic Wand',submitLabel:'OK',className:'draw-magic-wand-dialog',fields:[
    {key:'fill',label:'Fill Color',type:'checkbox',value:defaults.fill!==false},
    {key:'fillTolerance',label:'Fill tolerance (0–255)',type:'number',value:defaults.fillTolerance??32,min:0,max:255,step:1},
    {key:'stroke',label:'Stroke Color',type:'checkbox',value:!!defaults.stroke},
    {key:'strokeTolerance',label:'Stroke tolerance (0–255)',type:'number',value:defaults.strokeTolerance??32,min:0,max:255,step:1},
    {key:'weight',label:'Stroke Weight',type:'checkbox',value:!!defaults.weight},
    {key:'weightTolerance',label:'Weight tolerance (mm)',type:'number',value:defaults.weightTolerance??.5,min:0,max:1000,step:'any'},
    {key:'opacity',label:'Opacity',type:'checkbox',value:!!defaults.opacity},
    {key:'opacityTolerance',label:'Opacity tolerance (%)',type:'number',value:defaults.opacityTolerance??5,min:0,max:100,step:1},
  ]}).then(v=>v&&{fill:!!v.fill,stroke:!!v.stroke,weight:!!v.weight,opacity:!!v.opacity,fillTolerance:Number(v.fillTolerance),strokeTolerance:Number(v.strokeTolerance),weightTolerance:Number(v.weightTolerance),opacityTolerance:Number(v.opacityTolerance)});
}
/** A live effect's settings (Offset Path, Round Corners, Transform). */
export function effectDialog(type, values = {}) {
  const n = (key,label,min,max,step='any') => ({key,label,type:'number',value:values[key],min,max,step,required:true});
  const fields = type === 'offset-path' ? [n('distance','Offset (mm)',-1000,1000),
      {key:'join',label:'Joins',type:'select',value:values.join,options:[{value:'miter',label:'Miter'},{value:'round',label:'Round'},{value:'bevel',label:'Bevel'}]},n('miterLimit','Miter limit',1,500)]
    : type === 'round-corners' ? [n('radius','Radius (mm)',0,10000)]
    : type === 'zig-zag' ? [n('size','Size (mm)',-1000,1000),n('ridges','Ridges per segment',0,100,1),{key:'smooth',label:'Smooth',type:'checkbox',value:!!values.smooth}]
    : type === 'pucker-bloat' ? [n('amount','Pucker (−) or Bloat (+) (%)',-200,200)]
    : type === 'roughen' ? [n('size','Size (mm)',0,1000),n('detail','Detail (per mm)',0,100),n('seed','Variation',0,1000000,1)]
    : type === 'twist' ? [n('angle','Angle (°)',-3600,3600)]
    : type === 'free-distort' ? [['tl','Top left'],['tr','Top right'],['br','Bottom right'],['bl','Bottom left']].flatMap(([k,label])=>[n(`${k}x`,`${label} X (%)`,-1000,1000),n(`${k}y`,`${label} Y (%)`,-1000,1000)])
    : type === 'scribble' ? [n('angle','Angle (°)',-360,360),n('spacing','Spacing (mm)',.05,1000),n('strokeWidth','Stroke width (mm)',.01,1000),n('overlap','Path overlap (mm)',-1000,1000),
      n('variation','Variation (mm)',0,1000),n('curviness','Curviness (%)',0,100),n('seed','Variation seed',0,1000000,1)]
    : type === 'pathfinder' ? [{key:'op',label:'Operation',type:'select',value:values.op,options:Object.entries(LIVE_LABELS).map(([value,label])=>({value,label}))}]
    : type === 'warp' ? [{key:'style',label:'Style',type:'select',value:values.style,options:Object.entries(WARP_STYLES).map(([value,label])=>({value,label}))},
      {key:'orientation',label:'Orientation',type:'select',value:values.orientation,options:[{value:'horizontal',label:'Horizontal'},{value:'vertical',label:'Vertical'}]},
      n('bend','Bend (%)',-100,100),n('horizontal','Distortion horizontal (%)',-100,100),n('vertical','Distortion vertical (%)',-100,100)]
    : type === 'gaussian-blur' || type === 'feather' ? [n('radius','Radius (mm)',0,250)]
    : type === 'outer-glow' || type === 'inner-glow' ? [{key:'color',label:'Color',type:'color',value:String(values.color??'#ffffff').toLowerCase()},{...n('opacity','Opacity (%)',0,100),value:Math.round((values.opacity??.75)*100)},n('blur','Blur (mm)',0,250)]
    : type === 'rasterize' ? [{key:'ppi',label:'Resolution',type:'select',value:String(values.ppi??0),options:[{value:'0',label:'Use Document Raster Effects Resolution'},{value:'72',label:'Screen (72 ppi)'},{value:'150',label:'Medium (150 ppi)'},{value:'300',label:'High (300 ppi)'},{value:'600',label:'600 ppi'}]},
      {key:'background',label:'Background',type:'select',value:values.background,options:[{value:'white',label:'White'},{value:'transparent',label:'Transparent'}]},
      {key:'antialias',label:'Anti-aliasing',type:'checkbox',value:values.antialias!==false},n('padding','Add around object (mm)',0,1000)]
    : type === 'drop-shadow' ? [n('x','X offset (mm)',-1000,1000),n('y','Y offset (mm)',-1000,1000),n('blur','Blur (mm)',0,1000),
      {key:'color',label:'Color',type:'color',value:String(values.color??'#000000').toLowerCase()},{...n('opacity','Opacity (%)',0,100),value:Math.round((values.opacity??.75)*100)}]
    : [n('scaleX','Scale horizontal (%)',-100000,100000),n('scaleY','Scale vertical (%)',-100000,100000),n('moveX','Move horizontal (mm)',-100000,100000),
      n('moveY','Move vertical (mm)',-100000,100000),n('angle','Rotate (°)',-360,360),n('copies','Copies',0,1000,1)];
  const title = {'offset-path':'Offset Path','round-corners':'Round Corners',transform:'Transform Effect','zig-zag':'Zig Zag','pucker-bloat':'Pucker & Bloat',roughen:'Roughen',twist:'Twist','free-distort':'Free Distort','drop-shadow':'Drop Shadow',rasterize:'Rasterize','gaussian-blur':'Gaussian Blur',feather:'Feather','outer-glow':'Outer Glow','inner-glow':'Inner Glow',warp:'Warp Options',pathfinder:'Pathfinder',scribble:'Scribble Options'}[type];
  const whole = new Set(['copies','ridges','seed']);
  return openDrawModal({title,submitLabel:'OK',className:'draw-effect-dialog',fields}).then(v=>v&&Object.fromEntries(Object.entries(v).map(([k,x])=>[k,
    k==='join'||k==='style'||k==='orientation'||k==='op'||k==='background'?x:k==='color'?String(x).toUpperCase():k==='smooth'||k==='antialias'?!!x:k==='opacity'&&['drop-shadow','outer-glow','inner-glow'].includes(type)?Number(x)/100:whole.has(k)?Math.round(Number(x)):Number(x)])));
}
/** Transform Each: scale, move, rotate and reflect each object around its own reference point. */
export function transformEachDialog(defaults={},onPreview=()=>{}) {
  const d={scaleX:100,scaleY:100,moveX:0,moveY:0,angle:0,reflectX:false,reflectY:false,random:false,copy:false,anchor:'center',...defaults};
  const anchors=[['top-left','Top left'],['top','Top'],['top-right','Top right'],['left','Left'],['center','Center'],['right','Right'],['bottom-left','Bottom left'],['bottom','Bottom'],['bottom-right','Bottom right']];
  const result=openDrawModal({title:'Transform Each',submitLabel:'OK',className:'draw-transform-each-dialog',fields:[
    {key:'scaleX',label:'Scale horizontal (%)',type:'number',value:d.scaleX,min:-100000,max:100000,step:'any',required:true},
    {key:'scaleY',label:'Scale vertical (%)',type:'number',value:d.scaleY,min:-100000,max:100000,step:'any',required:true},
    {key:'moveX',label:'Move horizontal (mm)',type:'number',value:d.moveX,min:-100000,max:100000,step:'any',required:true},
    {key:'moveY',label:'Move vertical (mm)',type:'number',value:d.moveY,min:-100000,max:100000,step:'any',required:true},
    {key:'angle',label:'Rotate (°)',type:'number',value:d.angle,min:-360,max:360,step:'any',required:true},
    {key:'reflectX',label:'Reflect X',type:'checkbox',value:d.reflectX},{key:'reflectY',label:'Reflect Y',type:'checkbox',value:d.reflectY},
    {key:'anchor',label:'Reference point',type:'select',value:d.anchor,options:anchors.map(([value,label])=>({value,label}))},
    {key:'random',label:'Random',type:'checkbox',value:d.random},{key:'copy',label:'Copy',type:'checkbox',value:d.copy},
    {key:'preview',label:'Preview',type:'checkbox',value:true},
  ]});
  const values=v=>{
    const [ax,ay]={'top-left':[0,0],top:[.5,0],'top-right':[1,0],left:[0,.5],center:[.5,.5],right:[1,.5],'bottom-left':[0,1],bottom:[.5,1],'bottom-right':[1,1]}[v.anchor]??[.5,.5];
    return {scaleX:Number(v.scaleX),scaleY:Number(v.scaleY),moveX:Number(v.moveX),moveY:Number(v.moveY),angle:Number(v.angle),reflectX:!!v.reflectX,reflectY:!!v.reflectY,
      random:!!v.random,copy:!!v.copy,anchor:v.anchor,reference:[ax,ay]};
  };
  // Preview shows each object transformed as OK would, while the dialog is open.
  const form=document.querySelector('.draw-transform-each-dialog form');
  const preview=()=>{if(!form)return;const v=Object.fromEntries([...form.elements].filter(e=>e.name).map(e=>[e.name,e.type==='checkbox'?e.checked:e.value]));onPreview(form.checkValidity()&&v.preview?values(v):null);};
  form?.addEventListener('input',preview);form?.addEventListener('change',preview);preview();
  return result.then(v=>{
    onPreview(null);
    if(!v)return null;
    return values(v);
  });
}
/** Split Into Grid: rows, columns and gutters (mm). */
export function splitGridDialog(defaults={}) {
  return openDrawModal({title:'Split Into Grid',submitLabel:'OK',className:'draw-split-grid-dialog',fields:[
    {key:'rows',label:'Rows',type:'number',value:defaults.rows??2,min:1,max:1000,step:1,required:true},
    {key:'rowGutter',label:'Row gutter (mm)',type:'number',value:defaults.rowGutter??2,min:0,max:10000,step:'any',required:true},
    {key:'columns',label:'Columns',type:'number',value:defaults.columns??2,min:1,max:1000,step:1,required:true},
    {key:'columnGutter',label:'Column gutter (mm)',type:'number',value:defaults.columnGutter??2,min:0,max:10000,step:'any',required:true},
  ]}).then(v=>v&&{rows:Math.round(Number(v.rows)),columns:Math.round(Number(v.columns)),rowGutter:Number(v.rowGutter),columnGutter:Number(v.columnGutter)});
}
/** Crop Image: how much to cut from each visible edge (mm); negative values bring back cropped parts. */
export function cropImageDialog() {
  const n=(key,label)=>({key,label,type:'number',value:0,min:-100000,max:100000,step:'any',required:true});
  return openDrawModal({title:'Crop Image',submitLabel:'Crop',className:'draw-crop-dialog',fields:[n('left','Left (mm)'),n('top','Top (mm)'),n('right','Right (mm)'),n('bottom','Bottom (mm)'),
    {key:'reset',label:'Show the whole image again',type:'checkbox',value:false}]}).then(v=>v&&{left:Number(v.left),top:Number(v.top),right:Number(v.right),bottom:Number(v.bottom),reset:!!v.reset});
}
/** Eraser Tool Options: brush diameter in mm. */
export function eraserDialog(size=3) {
  return openDrawModal({title:'Eraser Tool Options',submitLabel:'OK',className:'draw-eraser-dialog',fields:[
    {key:'size',label:'Diameter (mm)',type:'number',value:size,min:.05,max:1000,step:'any',required:true}]}).then(v=>v&&Number(v.size)>0?Number(v.size):null);
}
/** Select > Save Selection: a name for the current selection. */
export function saveSelectionDialog(name) {
  return openDrawModal({title:'Save Selection',submitLabel:'OK',className:'draw-save-selection-dialog',fields:[{key:'name',label:'Name',value:name,required:true}]}).then(values=>values?.name??null);
}
/** Select > Edit Selection: select or delete a saved selection. */
export function editSelectionDialog(names) {
  return openDrawModal({title:'Edit Selection',submitLabel:'OK',className:'draw-edit-selection-dialog',fields:[
    {key:'name',label:'Saved selection',type:'select',value:names[0],options:names.map(n=>({value:n,label:escapeHtml(n)}))},
    {key:'action',label:'Action',type:'select',value:'select',options:[{value:'select',label:'Select it'},{value:'delete',label:'Delete it'}]},
  ]}).then(values=>values&&{name:values.name,action:values.action});
}
/** Object > Expand: which parts become plain filled paths. */
export function expandDialog(defaults={}) {
  return openDrawModal({title:'Expand',submitLabel:'OK',className:'draw-expand-dialog',fields:[
    {key:'fill',label:'Fill',type:'checkbox',value:defaults.fill!==false},
    {key:'stroke',label:'Stroke',type:'checkbox',value:defaults.stroke!==false},
  ]}).then(values=>values&&{fill:!!values.fill,stroke:!!values.stroke});
}
/** Average: line the selected anchors up horizontally, vertically or on one point. */
export function averageDialog(axis='both') {
  return openDrawModal({title:'Average',submitLabel:'OK',className:'draw-average-dialog',fields:[
    {key:'axis',label:'Axis',type:'select',value:axis,options:[{value:'horizontal',label:'Horizontal'},{value:'vertical',label:'Vertical'},{value:'both',label:'Both'}]},
  ]}).then(values=>values?.axis??null);
}
/** Offset Path: distance (negative shrinks), joins and miter limit, with live preview. */
export function offsetDialog(defaults,onPreview=()=>{}) {
  const result=openDrawModal({title:'Offset Path',submitLabel:'OK',className:'draw-offset-dialog',fields:[
    {key:'distance',label:'Offset (mm)',type:'number',value:defaults.distance??1,min:-10000,max:10000,step:'any',required:true},
    {key:'join',label:'Joins',type:'select',value:defaults.join??'miter',options:[{value:'miter',label:'Miter'},{value:'round',label:'Round'},{value:'bevel',label:'Bevel'}]},
    {key:'miterLimit',label:'Miter limit',type:'number',value:defaults.miterLimit??4,min:1,max:500,step:'any',required:true},
    {key:'preview',label:'Preview',type:'checkbox',value:defaults.preview!==false},
  ]});
  const form=document.querySelector('.draw-offset-dialog form'),el=form.elements;
  const read=()=>({distance:el.distance.valueAsNumber,join:el.join.value,miterLimit:el.miterLimit.valueAsNumber,preview:el.preview.checked});
  const update=()=>{el.miterLimit.disabled=el.join.value!=='miter';const values=read();onPreview(form.checkValidity()&&values.preview&&Number.isFinite(values.distance)?values:null);};
  form.addEventListener('input',update);form.addEventListener('change',update);update();
  return result.then(values=>values&&read());
}
/** Simplify: curve precision with live preview and the anchor count before and after. */
export function simplifyDialog(defaults,{before,count},onPreview=()=>{}) {
  const result=openDrawModal({title:'Simplify',submitLabel:'OK',className:'draw-simplify-dialog',fields:[
    {key:'precision',label:'Curve precision (%)',type:'number',value:defaults.precision??50,min:0,max:100,step:1,required:true},
    {key:'straight',label:'Straight lines',type:'checkbox',value:!!defaults.straight},
    {key:'preview',label:'Preview',type:'checkbox',value:defaults.preview!==false},
  ]});
  const form=document.querySelector('.draw-simplify-dialog form'),el=form.elements;
  const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='100';slider.step='1';slider.value=el.precision.value;slider.className='draw-simplify-dialog__slider';
  slider.setAttribute('aria-label','Curve precision');el.precision.closest('label').append(slider);
  slider.addEventListener('input',()=>{el.precision.value=slider.value;el.precision.dispatchEvent(new Event('input',{bubbles:true}));});
  const info=document.createElement('p');info.className='draw-simplify-dialog__count';info.dataset.drawSimplifyCount='';form.querySelector('.modal-actions').before(info);
  const read=()=>({precision:el.precision.valueAsNumber,straight:el.straight.checked,preview:el.preview.checked});
  const update=()=>{const values=read();if(!form.checkValidity()||!Number.isFinite(values.precision))return;slider.value=String(values.precision);
    try{info.textContent=`Original: ${before} points. Current: ${count(values)} points.`;}catch(error){info.textContent=error.message;}
    onPreview(values.preview?values:null);};
  form.addEventListener('input',update);form.addEventListener('change',update);update();
  return result.then(values=>values&&read());
}
/** Width Point Edit (double-click with the Width tool): each side's width in mm, or delete the point. */
export function widthPointDialog({ left, right }) {
  return openDrawModal({title:'Width Point Edit',submitLabel:'OK',className:'draw-width-dialog',fields:[
    {key:'left',label:'Side 1 (mm)',type:'number',value:Number(left.toFixed(3)),min:0,max:1000,step:'any',required:true},
    {key:'right',label:'Side 2 (mm)',type:'number',value:Number(right.toFixed(3)),min:0,max:1000,step:'any',required:true},
    {key:'remove',label:'Delete this width point',type:'checkbox',value:false}]})
    .then(v=>v&&{left:Number(v.left),right:Number(v.right),remove:!!v.remove});
}
/** Object > Blend > Blend Options (and double-click on the Blend tool). */
export function blendOptionsDialog(defaults) {
  return openDrawModal({title:'Blend Options',submitLabel:'OK',className:'draw-blend-dialog',fields:[
    {key:'spacing',label:'Spacing',type:'select',value:defaults.spacing,options:[{value:'smooth',label:'Smooth Color'},{value:'steps',label:'Specified Steps'},{value:'distance',label:'Specified Distance'}]},
    {key:'steps',label:'Steps',type:'number',value:defaults.steps,min:1,max:1000,step:1,required:true},
    {key:'distance',label:'Distance (mm)',type:'number',value:defaults.distance,min:.01,max:10000,step:'any',required:true},
    {key:'orientation',label:'Orientation',type:'select',value:defaults.orientation,options:[{value:'page',label:'Align to Page'},{value:'path',label:'Align to Path'}]}]})
    .then(v=>v&&{spacing:v.spacing,steps:Number(v.steps),distance:Number(v.distance),orientation:v.orientation});
}
/** Paintbrush Tool Options with its calligraphic brush. */
export function paintbrushDialog(d) {
  return openDrawModal({title:'Paintbrush Tool Options',submitLabel:'OK',className:'draw-paintbrush-dialog',fields:[
    {key:'size',label:'Brush size (mm)',type:'number',value:d.size,min:.01,max:1000,step:'any',required:true},
    {key:'angle',label:'Angle (°)',type:'number',value:d.angle,min:-180,max:180,step:'any',required:true},
    {key:'roundness',label:'Roundness (%)',type:'number',value:d.roundness,min:0,max:100,step:'any',required:true},
    {key:'fidelity',label:'Fidelity',type:'select',value:String(d.fidelity),options:[{value:'1',label:'Accurate'},{value:'2',label:'More accurate'},{value:'3',label:'Balanced'},{value:'4',label:'Smoother'},{value:'5',label:'Smooth'}]},
    {key:'fillNew',label:'Fill new brush strokes',type:'checkbox',value:d.fillNew},
    {key:'keepSelected',label:'Keep selected',type:'checkbox',value:d.keepSelected}]})
    .then(v=>v&&{size:Number(v.size),angle:Number(v.angle),roundness:Number(v.roundness),fidelity:Number(v.fidelity),fillNew:!!v.fillNew,keepSelected:!!v.keepSelected});
}
/** Blob Brush Tool Options. */
export function blobBrushDialog(d) {
  return openDrawModal({title:'Blob Brush Tool Options',submitLabel:'OK',className:'draw-blob-dialog',fields:[
    {key:'size',label:'Size (mm)',type:'number',value:d.size,min:.01,max:1000,step:'any',required:true},
    {key:'fidelity',label:'Fidelity',type:'select',value:String(d.fidelity),options:[{value:'1',label:'Accurate'},{value:'2',label:'More accurate'},{value:'3',label:'Balanced'},{value:'4',label:'Smoother'},{value:'5',label:'Smooth'}]},
    {key:'keepSelected',label:'Keep selected',type:'checkbox',value:d.keepSelected},
    {key:'mergeWithSelection',label:'Merge only with selection',type:'checkbox',value:d.mergeWithSelection}]})
    .then(v=>v&&{size:Number(v.size),fidelity:Number(v.fidelity),keepSelected:!!v.keepSelected,mergeWithSelection:!!v.mergeWithSelection});
}
/** Window > Workspace > New Workspace. */
export function workspaceNameDialog(name='') {
  return openDrawModal({title:'New Workspace',submitLabel:'OK',className:'draw-workspace-dialog',fields:[{key:'name',label:'Name',type:'text',value:name,required:true}]}).then(v=>v&&String(v.name));
}
/** Window > Workspace > Manage Workspaces: switch to one, or delete it. */
export function workspacesDialog(names,current) {
  return openDrawModal({title:'Manage Workspaces',submitLabel:'OK',className:'draw-workspaces-dialog',fields:[
    {key:'name',label:'Workspace',type:'select',value:current&&names.includes(current)?current:names[0],options:names.map(n=>({value:n,label:n}))},
    {key:'action',label:'Action',type:'select',value:'apply',options:[{value:'apply',label:'Switch to it'},{value:'delete',label:'Delete it'}]}]}).then(v=>v&&{name:v.name,action:v.action});
}
/** Laser Preview explanation. Reused by Help; Cancel never saves suppression. */
export function cutPreviewIntroDialog() {
  const result=openDrawModal({title:'Laser Preview',submitLabel:'Continue',className:'draw-cut-preview-dialog',fields:[
    {key:'hide',label:'Don’t show this again',type:'checkbox',value:false},
  ]});
  const form=document.querySelector('.draw-cut-preview-dialog form'),list=document.createElement('ul');list.className='draw-cut-preview-dialog__list';
  for(const text of ['Solid red lines show Cut. Dashed red lines show Score. Black areas show vector engraving; images show in grayscale.',
    'Score dashes are a display key, not gaps in the machine path.',
    'Vector dashes and arrowheads are not sent to Cut. Preview shows solid strokes without arrowheads.',
    'For paths and shapes, the standard Send to Cut transfer uses the first visible fill and stroke with constant width. Extra paint layers and width profiles remain in Draw.',
    'Dotted amber outlines or faded images mean the process or appearance is unresolved. Choose Laser processes to configure this tab’s Cut settings.',
    'Effects, advanced composites and image dithering may need checking in Cut. This view does not simulate travel order, burn depth or the exact material result.',
    'Only the view changes. Original artwork, exports and undo history stay unchanged. You can keep drawing.',
    'Transparency and blending are not an Engrave as seen output option yet. Always review the final job in Cut.',
    'Turn the view off with View > Laser Preview or the Laser Preview button.']){const li=document.createElement('li');li.textContent=text;list.append(li);}
  form.prepend(list);return result;
}

export function laserProcessesDialog(entries) {
  return openDrawModal({title:'Laser processes',submitLabel:'Apply',className:'draw-laser-processes-dialog',fields:entries.map((entry,i)=>({
    key:`process${i}`,label:`${entry.raster?'Image':'Vector'} ${entry.color.toUpperCase()}`,type:'select',value:entry.operation??'Unresolved',
    description:i===0?'Updates this tab’s Cut process settings. Review power and speed in Cut before running.':undefined,
    options:['Unresolved','Cut','Score','Engrave','Ignore'].filter(op=>!entry.raster||!['Cut','Score'].includes(op)).map(value=>({value,label:value}))
  }))}).then(values=>values&&entries.flatMap((entry,i)=>values[`process${i}`]==='Unresolved'?[]:[{key:entry.key,color:entry.color,raster:entry.raster,op:values[`process${i}`]}]));
}

/** Read-only diagnostics. Artwork names are text, never markup or translated UI. */
export function laserIssuesDialog(issues) {
  const result=openDrawModal({title:'Unresolved Laser Preview objects',submitLabel:'Close',className:'draw-laser-issues-dialog',fields:[]});
  const form=document.querySelector('.draw-laser-issues-dialog form');
  const list=document.createElement('ol');list.className='draw-laser-issues-list';
  for(const issue of issues){
    const row=document.createElement('li'),name=document.createElement('strong'),advice=document.createElement('p');
    name.textContent=issue.name;name.setAttribute('translate','no');row.dataset.nodeId=issue.id;
    advice.textContent=issue.advice;row.append(name,advice);list.append(row);
  }
  form.prepend(list);form.querySelector('[type=submit]').focus();return result;
}
