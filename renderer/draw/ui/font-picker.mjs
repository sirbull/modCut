/** Font-source/family picker shared by the text editor; font bytes remain in main. */
export function createFontPicker(form,defaults,{fonts,googleCatalog,googleFamily,refreshGoogle,fontMetadata={}}) {
  let catalog=googleCatalog,alive=true,axisKey='',lastWeight,request=0;
  const cache=new Map(),el=form.elements;
  const datalist=document.createElement('datalist');datalist.id=`draw-font-list-${crypto.randomUUID()}`;form.append(datalist);el.fontFamily.setAttribute('list',datalist.id);el.fontFamily.autocomplete='off';
  const controls=document.createElement('div');controls.className='draw-font-options';
  const note=document.createElement('p');note.className='draw-panel__hint';
  const refresh=document.createElement('button');refresh.type='button';refresh.className='btn btn--ghost btn--sm';refresh.textContent='Refresh Google Fonts catalog';
  const axes=document.createElement('div');axes.className='draw-font-axes';
  const license=document.createElement('details'),summary=document.createElement('summary'),licenseText=document.createElement('pre');summary.textContent='Font license';license.append(summary,licenseText);
  controls.append(note,refresh,axes,license);form.querySelector('.modal-actions').before(controls);
  function families(){return el.fontSource.value==='google'?catalog.families.map(f=>f.family):[...new Set(fonts.map(f=>f.family))];}
  function populate(){datalist.replaceChildren(...families().map(f=>{const o=document.createElement('option');o.value=f;return o;}));refresh.hidden=el.fontSource.value!=='google';}
  populate();
  el.fontSource.addEventListener('change',()=>{populate();if(!families().includes(el.fontFamily.value))el.fontFamily.value=el.fontSource.value==='google'?'Roboto':defaults.fontSource!=='google'?defaults.fontFamily:fonts[0]?.family??'';});
  refresh.addEventListener('click',async()=>{refresh.disabled=true;note.textContent='Updating the Google Fonts catalog…';try{const next=await refreshGoogle();if(!alive)return;catalog=next;populate();note.textContent=`${catalog.families.length} Google Fonts families. Select a family to download it for offline use.`;}catch(e){if(alive)note.textContent=e.message;}finally{if(alive)refresh.disabled=false;}});
  async function prepare(values) {
    const token=++request;
    const source=values.fontSource,family=values.fontFamily;
    if(!families().includes(family)&&!(family===defaults.fontFamily&&source===(defaults.fontSource??'system')))throw new Error('Choose a font family from the list.');
    let faces;
    if(source==='google') {
      if(!googleFamily)throw new Error('Google Fonts is unavailable.');
      const original=defaults.googleFont&&family===defaults.fontFamily&&values.fontStyle===defaults.fontStyle&&values.fontWeight===defaults.fontWeight;
      if(original&&!cache.has(family))faces=[{postscriptName:defaults.fontPostscriptName,fontStyle:defaults.fontStyle,weight:defaults.fontWeight==='bold'?700:defaults.fontWeight==='normal'?400:defaults.fontWeight,
        axes:fontMetadata.axes??{},instances:fontMetadata.instances??{},reference:defaults.googleFont}];
      else {note.textContent='Downloading Google font and license…';let pending=cache.get(family);if(!pending){pending=googleFamily(family);cache.set(family,pending);}try{faces=(await pending).faces;}catch(error){cache.delete(family);throw error;}}
    } else faces=fonts.filter(f=>f.family===family);
    if(!alive||token!==request)return values;
    if(source==='system'&&!faces.length&&family===defaults.fontFamily){note.textContent='Font unavailable. Saved outlines preserve unchanged text.';return values;}
    const catalogEntry=source==='google'?catalog.families.find(f=>f.family===family):null;
    const availableStyle=style=>catalogEntry?catalogEntry.variants.some(v=>(v.endsWith('i')?'italic':'normal')===style):faces.some(f=>f.fontStyle===style);
    for(const option of el.fontStyle.options)option.disabled=!availableStyle(option.value);
    if(!availableStyle(values.fontStyle)){values.fontStyle=availableStyle('normal')?'normal':'italic';el.fontStyle.value=values.fontStyle;}
    const weightValue=v=>v==='bold'?700:v==='normal'?400:Number(v);
    const availableWeight=w=>catalogEntry?catalogEntry.variants.some(v=>(v.endsWith('i')?'italic':'normal')===values.fontStyle&&parseInt(v)===w)||faces.some(f=>f.fontStyle===values.fontStyle&&f.axes?.wght&&w>=f.axes.wght.min&&w<=f.axes.wght.max):faces.some(f=>f.fontStyle===values.fontStyle&&(f.weight===w||f.axes?.wght&&w>=f.axes.wght.min&&w<=f.axes.wght.max));
    for(const option of el.fontWeight.options)option.disabled=!availableWeight(weightValue(option.value));
    if(!availableWeight(weightValue(values.fontWeight))) {
      const option=[...el.fontWeight.options].filter(o=>!o.disabled).sort((a,b)=>Math.abs(weightValue(a.value)-weightValue(values.fontWeight))-Math.abs(weightValue(b.value)-weightValue(values.fontWeight)))[0];
      if(option){el.fontWeight.value=option.value;values.fontWeight=['normal','bold'].includes(option.value)?option.value:Number(option.value);}
    }
    const weight=weightValue(values.fontWeight);
    const face=faces.filter(f=>f.fontStyle===values.fontStyle).sort((a,b)=>{
      const distance=f=>f.axes?.wght&&weight>=f.axes.wght.min&&weight<=f.axes.wght.max?0:Math.abs(f.weight-weight);return distance(a)-distance(b);
    })[0];
    if(!face)throw new Error('This family has no matching style. Choose Normal or Italic as available.');
    const key=source+'\0'+family+'\0'+face.postscriptName;
    if(key!==axisKey) {
      axisKey=key;axes.replaceChildren();lastWeight=undefined;
      const instances=Object.entries(face.instances??{});
      if(instances.length) {
        const label=document.createElement('label');label.textContent='Named instance';const select=document.createElement('select');select.className='select';select.name='fontInstance';select.append(new Option('Custom / axis values',''));
        for(const [name] of instances)select.append(new Option(name,name));label.append(select);axes.append(label);
        select.addEventListener('change',()=>{const settings=face.instances[select.value];if(settings)for(const input of axes.querySelectorAll('[data-font-axis]'))input.value=settings[input.dataset.fontAxis]??face.axes[input.dataset.fontAxis].default;});
      }
      for(const [tag,axis] of Object.entries(face.axes??{})) {
        const label=document.createElement('label');label.textContent=`${axis.name??tag} (${tag})`;
        const input=document.createElement('input');input.className='input';input.type='number';input.step='any';input.min=axis.min;input.max=axis.max;input.required=true;input.dataset.fontAxis=tag;input.setAttribute('aria-label',`${axis.name??tag} (${tag})`);
        input.value=family===defaults.fontFamily&&(defaults.fontSource??'system')===source?defaults.fontAxes?.[tag]??axis.default:axis.default;
        label.append(input);axes.append(label);
      }
    }
    const wght=axes.querySelector('[data-font-axis=wght]');
    if(wght&&lastWeight!==undefined&&lastWeight!==values.fontWeight)wght.value=weight;
    if(wght&&lastWeight===undefined&&!(family===defaults.fontFamily&&defaults.fontAxes?.wght!==undefined))wght.value=Math.max(face.axes.wght.min,Math.min(face.axes.wght.max,weight));
    if(wght&&Number.isFinite(wght.valueAsNumber)&&wght.valueAsNumber!==weight) {
      values.fontWeight=wght.valueAsNumber;
      if(![...el.fontWeight.options].some(o=>o.value===wght.value))el.fontWeight.append(new Option(wght.value,wght.value));
      el.fontWeight.value=wght.value;
    }
    lastWeight=values.fontWeight;
    const fontAxes=Object.fromEntries([...axes.querySelectorAll('[data-font-axis]')].map(input=>[input.dataset.fontAxis,input.valueAsNumber]));
    note.textContent=source==='google'?`${catalog.families.length} Google Fonts families. Downloaded fonts work offline; text is shaped locally.${catalogEntry?.color.length?' Color fonts require supported monochrome vector contours.':''}`:'Installed font. Variable axes and named instances appear when available.';
    license.hidden=!face.reference;licenseText.textContent=face.reference?.license??'';
    return {...values,...(Object.keys(fontAxes).length?{fontAxes}:{}),...(face.reference?{googleFont:face.reference,fontPostscriptName:face.postscriptName}:{})};
  }
  return {prepare,destroy(){alive=false;}};
}
