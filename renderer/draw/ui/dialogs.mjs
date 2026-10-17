import { openModal } from '../../ui.js';
import { MAX_ARTBOARDS, newDrawDocument } from '../doc/artboards.mjs';
import { DOCUMENT_PRESETS, PRESET_CATEGORIES, UNIT_LABELS, RESOLUTIONS, RECENT_KEY, TEMPLATES_KEY, toMm, fromMm, formatSize, normalizeSetup,
  rememberRecent, removeTemplate, loadStoredList, storeList } from '../doc/presets.mjs';
import { dialogOperation } from '../geom/transforms.mjs';
import { NAMED_LAYER_COLORS, layerColorName } from '../doc/layers.mjs';
import { enhanceNumberFields } from './number-field.mjs';
import { textProperties } from '../doc/text.mjs';
import { createFontPicker } from './font-picker.mjs';

let dialogId=0;
/** Uniform text editor. Preview is detached; Apply is a single document command. */
export function textDialog(defaults, onPreview = () => {}, {fonts=[],resolve=patch=>patch,...fontOptions}={}) {
  const choices = values => values.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
  const fields = [
    {key:'text',label:'Text',value:defaults.text,required:true},
    {key:'fontSource',label:'Font source',type:'select',value:defaults.fontSource??'system',options:[{value:'system',label:'Installed fonts'},{value:'google',label:'Google Fonts'}]},
    {key:'fontFamily',label:'Font family',value:defaults.fontFamily,required:true,description:'Search the family name. Google fonts download on selection and are kept for offline use.'},
    {key:'fontSize',label:'Size (pt)',type:'number',value:defaults.fontSize,min:.1,max:10000,step:'any',required:true},
    {key:'leading',label:'Leading (pt)',type:'number',value:defaults.leading,min:.1,max:10000,step:'any',required:true},
    {key:'fontWeight',label:'Weight',type:'select',value:String(defaults.fontWeight),options:[...choices(['normal','bold']),...[100,200,300,400,500,600,700,800,900].map(value=>({value:String(value),label:String(value)})),...(typeof defaults.fontWeight==='number'&&defaults.fontWeight%100?[{value:String(defaults.fontWeight),label:String(defaults.fontWeight)}]:[])]},
    {key:'fontStyle',label:'Style',type:'select',value:defaults.fontStyle,options:choices(['normal','italic'])},
    {key:'alignment',label:'Paragraph alignment',type:'select',value:defaults.alignment,options:choices(['left','center','right','justify'])},
  ];
  if(defaults.kind==='area')fields.push(
    {key:'frameWidth',label:'Frame width (mm)',type:'number',value:defaults.frameWidth,min:.1,max:100000,step:'any',required:true},
    {key:'frameHeight',label:'Frame height (mm)',type:'number',value:defaults.frameHeight,min:.1,max:100000,step:'any',required:true});
  if(defaults.kind==='onPath')fields.push(
    {key:'pathOffset',label:'Start offset (mm)',type:'number',value:defaults.pathOffset??0,min:0,max:100000,step:'any',required:true},
    {key:'pathFlip',label:'Flip to the other side',type:'checkbox',value:!!defaults.pathFlip});
  const title={area:'Area Text',onPath:'Type on a Path'}[defaults.kind]??'Point Text';
  const result = openDrawModal({title,submitLabel:'Apply',className:'draw-text-dialog',fields});
  const form = document.querySelector('.draw-text-dialog form'), original = form.elements.text;
  const picker=createFontPicker(form,defaults,{fonts,...fontOptions});
  const input = document.createElement('textarea'); input.name = 'text'; input.className = 'input'; input.required = true; input.rows = 3;
  input.value = defaults.text; original.replaceWith(input);
  // Mixed styles: one override (or null) per character, kept in step with edits; new text takes the style
  // before it. The row below styles the selected characters, as selecting text with the Type tool does.
  const styles = [];
  for (const run of defaults.runs ?? [{ text: defaults.text }]) for (let k = 0; k < run.text.length; k++) styles.push(run.character ?? null);
  while (styles.length < input.value.length) styles.push(null); styles.length = input.value.length;
  let previousText = input.value;
  input.addEventListener('input', () => {
    const next = input.value; let a = 0, b = 0;
    while (a < previousText.length && a < next.length && previousText[a] === next[a]) a++;
    while (b < previousText.length - a && b < next.length - a && previousText[previousText.length - 1 - b] === next[next.length - 1 - b]) b++;
    const inherit = styles[a - 1] ?? styles[a] ?? null;
    styles.splice(a, previousText.length - a - b, ...Array(next.length - a - b).fill(inherit)); previousText = next;
  });
  const buildRuns = () => {
    const runs = [];
    for (let k = 0; k < input.value.length; k++) {
      const style = styles[k] && Object.keys(styles[k]).length ? styles[k] : null, last = runs.at(-1);
      if (last && JSON.stringify(last.character ?? null) === JSON.stringify(style)) last.text += input.value[k];
      else runs.push({ text: input.value[k], ...(style ? { character: style } : {}) });
    }
    return runs;
  };
  const styleRow = document.createElement('div'); styleRow.className = 'draw-text-styles'; styleRow.setAttribute('role','group'); styleRow.setAttribute('aria-label','Style of the selected text');
  const styleNote = document.createElement('span'); styleNote.className = 'draw-text-styles__note';
  const restyle = (change) => {
    const from = input.selectionStart, to = input.selectionEnd;
    if (from === to) { styleNote.textContent = 'Select characters in the text first.'; return; }
    const patch = typeof change === 'function' ? change(styles.slice(from, to)) : change;
    for (let k = from; k < to; k++) {
      const next = { ...(styles[k] ?? {}) };
      for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key]; else next[key] = value;
      styles[k] = Object.keys(next).length ? next : null;
    }
    const count = buildRuns().filter(r => r.character).length;
    styleNote.textContent = count ? `${count} styled part${count === 1 ? '' : 's'}` : '';
    input.focus(); input.setSelectionRange(from, to); form.dispatchEvent(new Event('change'));
  };
  const styleButton = (label, key, action) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn--ghost btn--sm'; b.textContent = label; b.dataset.textStyle = key;
    b.addEventListener('mousedown', event => event.preventDefault()); b.addEventListener('click', () => restyle(action)); styleRow.append(b); return b; };
  styleButton('Bold', 'bold', chosen => ({ fontWeight: chosen.every(c => c?.fontWeight === 'bold') ? undefined : 'bold' }));
  styleButton('Italic', 'italic', chosen => ({ fontStyle: chosen.every(c => c?.fontStyle === 'italic') ? undefined : 'italic' }));
  const sizeInput = document.createElement('input'); sizeInput.type = 'number'; sizeInput.className = 'input'; sizeInput.min = '.1'; sizeInput.max = '10000'; sizeInput.step = 'any';
  sizeInput.value = String(defaults.fontSize); sizeInput.setAttribute('aria-label','Size of the selection (pt)'); sizeInput.dataset.textStyle = 'size-value';
  sizeInput.addEventListener('input', event => event.stopPropagation()); sizeInput.addEventListener('change', event => event.stopPropagation());
  styleRow.append(sizeInput);
  styleButton('Set size', 'size', () => { const n = sizeInput.valueAsNumber; if (!(n >= .1 && n <= 10000)) { styleNote.textContent = 'Enter a size between 0.1 and 10,000 pt.'; return {}; } return { fontSize: n }; });
  styleButton('Clear style', 'clear', () => ({ fontWeight: undefined, fontStyle: undefined, fontSize: undefined, fontFamily: undefined, tracking: undefined, baselineShift: undefined, horizontalScale: undefined, verticalScale: undefined }));
  styleRow.append(styleNote); input.after(styleRow);
  { const count = buildRuns().filter(r => r.character).length; if (count) styleNote.textContent = `${count} styled part${count === 1 ? '' : 's'}`; }
  const error = document.createElement('p'); error.setAttribute('role','alert'); form.insertBefore(error,form.querySelector('.modal-actions'));
  // Character settings edited in the Character panel ride along unchanged.
  const read = () => ({kind:defaults.kind??'point',tracking:defaults.tracking??0,allCaps:!!defaults.allCaps,
    horizontalScale:defaults.horizontalScale??100,verticalScale:defaults.verticalScale??100,baselineShift:defaults.baselineShift??0,kerning:defaults.kerning??'metrics',
    leftIndent:defaults.leftIndent??0,rightIndent:defaults.rightIndent??0,firstLineIndent:defaults.firstLineIndent??0,spaceBefore:defaults.spaceBefore??0,spaceAfter:defaults.spaceAfter??0,...(defaults.kind==='onPath'?{pathSubpath:defaults.pathSubpath}:{}),...Object.fromEntries(fields.map(f => {const el=form.elements[f.key];return [f.key,f.type==='checkbox'?el.checked:f.type==='number'?el.valueAsNumber:f.key==='fontWeight'&&!['normal','bold'].includes(el.value)?Number(el.value):el.value];})),
    axisValues:[...form.querySelectorAll('[data-font-axis]')].map(el=>el.value),runs:buildRuns()});
  const submit=form.querySelector('[type=submit]');let revision=0,alive=true,resolved=null,accepted=null,lastInput=null;
  const preview = async () => {
    if(!alive)return;
    const values=read(),key=JSON.stringify(values);if(key===lastInput)return;lastInput=key;
    const current=++revision;resolved=null;submit.disabled=true;form.dataset.textReady='false';input.setCustomValidity('Updating text preview…');
    try {
      const prepared=await picker.prepare(values);if(!alive||current!==revision)return;
      const patch=await resolve(textProperties(prepared));
      if(!alive||current!==revision)return;
      resolved=patch;onPreview(patch);input.setCustomValidity('');submit.disabled=false;form.dataset.textReady='true';
      lastInput=JSON.stringify(read());
      error.textContent=patch.layout?.overflow&&patch.kind==='onPath'?`Text overflow: ${patch.layout.glyphs.length} glyphs fit on the path. Use a smaller size or start offset, or a longer path. Export includes only the glyphs that fit; Create Outlines and Send to Cut require all text to fit.`:
        patch.layout?.overflow?`Text overflow: ${patch.layout.visibleLines} of ${patch.layout.lineWidths.length} lines fit. Enlarge the frame to show all text. Export includes only visible text; Create Outlines requires all text to fit.`:
        patch.character.fontSource!=='google'&&fonts.length&&!fonts.some(f=>f.family.toLowerCase()===patch.character.fontFamily.toLowerCase())?'Font unavailable: saved outlines are preserved. Choose an installed font to change the text.':'';
    } catch (e) {if(alive&&current===revision){error.textContent=e.message;input.setCustomValidity(e.message);onPreview(null);}}
  };
  form.addEventListener('submit',event=>{if(!resolved||submit.disabled){event.preventDefault();event.stopImmediatePropagation();return;}accepted=resolved;alive=false;revision++;},true);
  form.addEventListener('input',preview); form.addEventListener('change',preview); preview(); input.focus(); input.select();
  return result.then(values=>values?accepted:null).finally(() => {alive=false;revision++;picker.destroy();form.removeEventListener('input',preview);form.removeEventListener('change',preview);});
}
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
    if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();}
    if(event.key==='Tab'){
      const items=[...modal.querySelectorAll('input:not(:disabled):not([type=hidden]),textarea:not(:disabled),select:not(:disabled),button:not(:disabled)')].filter(el=>el.getClientRects().length);
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
export function newDocumentDialog(bed,{machines=[],storage=globalThis.localStorage}={}) {
  const machineEntries=[{id:'bed',name:`${bed.name||'Machine bed'} (current)`,width:bed.width,height:bed.height},
    ...machines.filter(m=>m.name!==bed.name||m.width!==bed.width||m.height!==bed.height).map((m,i)=>({id:`machine-${i}`,name:m.name,width:m.width,height:m.height}))]
    .filter(m=>m.width>0&&m.height>0).map(m=>({...m,category:'laser',units:'mm',ppi:300,machine:true}));
  const presets=[...machineEntries,...DOCUMENT_PRESETS];
  let recent=loadStoredList(storage,RECENT_KEY),templates=loadStoredList(storage,TEMPLATES_KEY);
  const previous=document.activeElement,overlay=document.createElement('div');overlay.className='modal-overlay';
  const modal=document.createElement('div');modal.className='modal panel draw-document-dialog';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  const make=(tag,className,parent,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;parent?.append(el);return el;};
  const title=make('div','panel__header',modal,'New document');title.id=`draw-dialog-${++dialogId}`;modal.setAttribute('aria-labelledby',title.id);
  const form=make('form','draw-new-doc',make('div','panel__body',modal));form.noValidate=false;
  const browse=make('section','draw-new-doc__browse',form),tabs=make('div','draw-new-doc__tabs',browse);tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Document sources');
  const chips=make('div','draw-new-doc__chips',browse),grid=make('div','draw-new-doc__grid',browse);grid.setAttribute('role','tabpanel');grid.id=`${title.id}-panel`;
  const details=make('aside','draw-new-doc__details',form);make('h3','draw-new-doc__heading',details,'Preset details');
  const field=(label,parent,className='')=>{const wrap=make('label',`draw-new-doc__field ${className}`,parent);make('span','',wrap,label);return wrap;};
  const input=(parent,name,attributes={})=>{const el=make('input','input',parent);el.name=name;Object.assign(el,attributes);return el;};
  const nameInput=input(field('Name',details),'name',{value:'Untitled',required:true,maxLength:120});
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
  const ppiSelect=make('select','select',field('Resolution',boardRow));ppiSelect.name='ppi';
  for(const ppi of RESOLUTIONS)ppiSelect.append(new Option(`${ppi} ppi${ppi===72?' (screen)':ppi===300?' (high)':''}`,String(ppi)));
  const arrange=make('div','draw-new-doc__arrange',details);
  const layoutSelect=make('select','select',field('Arrange',arrange));layoutSelect.name='layout';
  for(const [value,label] of [['grid-row','Grid by row'],['grid-column','Grid by column'],['row','Single row'],['column','Single column']])layoutSelect.append(new Option(label,value));
  const arrangeRow=make('div','draw-new-doc__row',arrange);
  const columnsInput=input(field('Columns',arrangeRow),'columns',{type:'number',min:'1',max:String(MAX_ARTBOARDS),step:'1',value:'2',required:true});
  const spacingInput=input(field('Spacing',arrangeRow),'spacing',{type:'number',min:'0',step:'any',value:'20',required:true});
  const error=make('p','draw-new-doc__error',details);error.setAttribute('role','alert');
  const actions=make('div','modal-actions draw-new-doc__actions',form);
  const cancel=make('button','btn btn--ghost btn--sm',actions,'Cancel');cancel.type='button';cancel.dataset.x='cancel';
  const create=make('button','btn btn--primary btn--sm',actions,'Create');create.type='submit';

  // Sizes live in millimetres; the inputs show them in the chosen unit.
  const state={tab:recent.length?'recent':'templates',category:'laser',widthMm:bed.width,heightMm:bed.height,spacingMm:20,label:machineEntries[0]?.name??'Custom'};
  const showUnits=()=>{const unit=unitSelect.value;widthInput.value=fromMm(state.widthMm,unit);heightInput.value=fromMm(state.heightMm,unit);spacingInput.value=fromMm(state.spacingMm,unit);};
  const syncControls=()=>{
    const landscape=state.widthMm>state.heightMm;
    orientationButtons.portrait.setAttribute('aria-pressed',String(!landscape));orientationButtons.landscape.setAttribute('aria-pressed',String(landscape));
    const many=Number(countInput.value)>1;arrange.hidden=!many;for(const el of [layoutSelect,columnsInput,spacingInput])el.disabled=!many;
    columnsInput.closest('label').hidden=!layoutSelect.value.startsWith('grid');columnsInput.disabled=!many||columnsInput.closest('label').hidden;
    for(const card of grid.querySelectorAll('[data-preset]'))card.setAttribute('aria-pressed',String(card.dataset.preset===presetInput.value));
    error.textContent='';
  };
  function apply(entry,id) {
    state.widthMm=entry.width;state.heightMm=entry.height;state.label=entry.label??entry.name??'Custom';presetInput.value=id;
    unitSelect.value=entry.units??'mm';ppiSelect.value=String(RESOLUTIONS.includes(entry.ppi)?entry.ppi:300);
    if(entry.count){countInput.value=entry.count;layoutSelect.value=entry.layout;columnsInput.value=entry.columns;state.spacingMm=entry.spacing;}
    showUnits();syncControls();
  }
  const preview=(parent,width,height)=>{const box=make('span','draw-preset-card__preview',parent),scale=1/Math.max(width,height);
    const page=make('span','',box);page.style.width=`${Math.max(8,width*scale*100)}%`;page.style.height=`${Math.max(8,height*scale*100)}%`;};
  function card(id,entry,name,detail,onRemove) {
    const wrap=make('div','draw-preset-card',grid),button=make('button','draw-preset-card__select',wrap);button.type='button';button.dataset.preset=id;
    preview(button,entry.width,entry.height);make('span','draw-preset-card__name',button,name);make('span','draw-preset-card__size',button,detail);
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
      recent.forEach((entry,i)=>card(`recent-${i}`,entry,entry.label,sizeText(entry)));
    } else if(state.tab==='saved'){
      if(!templates.length)empty('No saved templates yet. In an open document, choose File › Save Document Properties as Template…');
      for(const entry of templates)card(`template-${entry.id}`,entry,entry.name,sizeText(entry),()=>{
        templates=removeTemplate(templates,entry.id);storeList(storage,TEMPLATES_KEY,templates);renderGrid();});
    } else for(const entry of presets.filter(p=>p.category===state.category))card(entry.id,entry,entry.name,formatSize(entry.width,entry.height,entry.units));
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
    if((id==='landscape')!==(state.widthMm>state.heightMm)&&state.widthMm!==state.heightMm){[state.widthMm,state.heightMm]=[state.heightMm,state.widthMm];showUnits();syncControls();}});
  form.addEventListener('input',event=>{
    const target=event.target,unit=unitSelect.value;
    if(target===presetInput){const entry=presets.find(p=>p.id===presetInput.value);if(entry)apply(entry,entry.id);else{state.label='Custom';syncControls();}return;}
    if(target===widthInput||target===heightInput){const mm=toMm(Number(target.value),unit);if(mm>0){state[target===widthInput?'widthMm':'heightMm']=mm;presetInput.value='custom';state.label='Custom';}}
    if(target===spacingInput&&Number(spacingInput.value)>=0)state.spacingMm=toMm(Number(spacingInput.value),unit);
    syncControls();
  });
  unitSelect.addEventListener('change',showUnits);
  apply(machineEntries[0]??presets.find(p=>p.id==='a4'),machineEntries[0]?'bed':'a4');
  renderGrid();
  enhanceNumberFields(modal);overlay.append(modal);document.body.append(overlay);nameInput.focus();nameInput.select();
  return new Promise(resolve=>{
    const close=value=>{modal.removeEventListener('keydown',keyboard);overlay.remove();if(previous?.isConnected)previous.focus();resolve(value);};
    const keyboard=trapDialogKeys(modal,()=>close(null));modal.addEventListener('keydown',keyboard);
    cancel.addEventListener('click',()=>close(null));overlay.addEventListener('click',event=>{if(event.target===overlay)close(null);});
    form.addEventListener('submit',event=>{event.preventDefault();
      try{
        const setup=normalizeSetup({width:state.widthMm,height:state.heightMm,units:unitSelect.value,ppi:Number(ppiSelect.value),count:Number(countInput.value),
          layout:layoutSelect.value,columns:Number(columnsInput.value),spacing:state.spacingMm});
        const doc=newDrawDocument({name:nameInput.value.trim()||'Untitled',preset:'custom',...setup},bed);
        recent=rememberRecent(recent,{label:state.label,...setup});storeList(storage,RECENT_KEY,recent);
        close(doc);
      }catch(problem){error.textContent=problem.message;}
    });
  });
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
export function transformDialog(tool,origin,defaults={},onPreview=()=>{}) {
  const numeric=(key,label,value,extra={})=>({key,label,value,type:'number',step:'any',required:true,...extra});
  const fields=tool==='scale'?[
    {key:'mode',label:'Scaling',type:'select',value:defaults.mode??'uniform',options:[{value:'uniform',label:'Uniform'},{value:'nonuniform',label:'Non-uniform'}]},
    numeric('uniform','Scale (%)',defaults.uniform??100,{min:.01,max:100000,showIf:v=>v.mode==='uniform'}),
    numeric('x','Horizontal (%)',defaults.x??100,{min:.01,max:100000,showIf:v=>v.mode==='nonuniform'}),
    numeric('y','Vertical (%)',defaults.y??100,{min:.01,max:100000,showIf:v=>v.mode==='nonuniform'}),
    {key:'scaleStrokes',label:'Scale strokes & effects',type:'checkbox',value:defaults.scaleStrokes??true,description:'Scales stroke widths and dash lengths. Effect rendering is planned for a later phase.'},
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
