/** Shared local/Google font catalog, face matching, and browser font previews. */
const faces = new Map();
const loadedFaces = new Map();
let activeBrowserClose;
export function closeFontBrowser(){activeBrowserClose?.();}
let installed, google;
export const installedFonts = () => installed ??= window.modcut.listSystemFonts().catch(e => { installed = null; throw e; });
export const googleFonts = () => google ??= window.modcut.listGoogleFonts().catch(e => { google = null; throw e; });
export async function prepareFont(values) {
  const source = values.fontSource ?? 'system';
  const entries = source === 'google' ? (await window.modcut.googleFontFamily(values.fontFamily)).faces
    : (await installedFonts()).filter(f => f.family === values.fontFamily);
  if (!entries.length) throw new Error(`The font “${values.fontFamily}” is unavailable.`);
  const weight = values.fontWeight === 'bold' ? 700 : values.fontWeight === 'normal' ? 400 : values.fontWeight;
  const distance = f => (f.fontStyle === values.fontStyle ? 0 : 2000) +
    (f.axes?.wght && weight >= f.axes.wght.min && weight <= f.axes.wght.max ? 0 : Math.abs(f.weight - weight));
  const face = [...entries].sort((a,b) => distance(a) - distance(b))[0];
  const next = { ...values, fontStyle: face.fontStyle, fontPostscriptName: face.postscriptName };
  if (!face.axes?.wght || weight < face.axes.wght.min || weight > face.axes.wght.max)
    next.fontWeight = face.weight === 400 ? 'normal' : face.weight === 700 ? 'bold' : face.weight;
  if (face.reference) next.googleFont = face.reference; else delete next.googleFont;
  if (next.fontAxes && Object.keys(next.fontAxes).some(k => !face.axes?.[k])) delete next.fontAxes;
  return next;
}
export async function browserFont(values) {
  const key = JSON.stringify([values.fontSource ?? 'system', values.fontFamily, values.fontPostscriptName, values.fontWeight, values.fontStyle]);
  if (!faces.has(key)) faces.set(key, (async () => {
    if(values.fontSource!=='google'&&!values.fontPostscriptName)return values.fontFamily;
    const alias = `modcut-font-${faces.size}-${crypto.randomUUID()}`;
    const source = values.fontSource === 'google' ? new Uint8Array(await window.modcut.fontData(values))
      : `local(${JSON.stringify(values.fontPostscriptName ?? values.fontFamily)})`;
    const face = new FontFace(alias, source, { weight: '1 1000', style: values.fontStyle ?? 'normal' });
    await face.load(); document.fonts.add(face); loadedFaces.set(key,face);
    if(loadedFaces.size>128){const oldest=loadedFaces.keys().next().value;document.fonts.delete(loadedFaces.get(oldest));loadedFaces.delete(oldest);faces.delete(oldest);}
    return alias;
  })().catch(error => { faces.delete(key); throw error; }));
  return faces.get(key);
}

/** The advanced controls previously in Edit Text now belong to Character/Properties. */
export function fontOptions(host,values,{change,disabled=false,start=()=>{},end=()=>{}}){
  const details=document.createElement('details');details.className='draw-font-options';
  const summary=document.createElement('summary');summary.textContent='Font options';details.append(summary);host.append(details);
  let loaded=false;
  details.addEventListener('toggle',async()=>{
    if(!details.open||loaded)return;loaded=true;
    try{
      const faces=values.fontSource==='google'?(await window.modcut.googleFontFamily(values.fontFamily)).faces:(await installedFonts()).filter(f=>f.family===values.fontFamily);
      if(!details.isConnected)return;
      const face=faces.find(f=>f.postscriptName===values.fontPostscriptName)??faces.find(f=>f.fontStyle===values.fontStyle)??faces[0];
      if(!face)return;
      if(Object.keys(face.instances??{}).length){
        const label=document.createElement('label');label.textContent='Named instance';const input=document.createElement('select');input.className='select';input.disabled=disabled;input.append(new Option('Custom / axis values',''));
        for(const name of Object.keys(face.instances))input.append(new Option(name,name));
        input.addEventListener('change',()=>{const axes=face.instances[input.value];if(axes)change({fontAxes:axes,...(axes.wght!==undefined?{fontWeight:axes.wght}:{})});});label.append(input);details.append(label);
      }
      for(const [tag,axis] of Object.entries(face.axes??{})){
        const label=document.createElement('label');label.textContent=axis.name??tag;
        const input=document.createElement('input');input.type='number';input.className='input';input.min=axis.min;input.max=axis.max;input.step='any';input.disabled=disabled;input.dataset.fontAxis=tag;input.value=values.fontAxes?.[tag]??(tag==='wght'?(values.fontWeight==='normal'?400:values.fontWeight==='bold'?700:values.fontWeight):axis.default);
        input.addEventListener('input',()=>{if(input.validity.valid&&Number.isFinite(input.valueAsNumber)){start();const axes={...values.fontAxes,[tag]:input.valueAsNumber};change({fontAxes:axes,...(tag==='wght'?{fontWeight:input.valueAsNumber}:{})});}});
        input.addEventListener('blur',end);label.append(input);details.append(label);
      }
      if(!Object.keys(face.axes??{}).length){const note=document.createElement('p');note.className='draw-panel__hint';note.textContent='This font has no variable axes.';details.append(note);}
      if(face.reference){const license=document.createElement('details'),title=document.createElement('summary'),text=document.createElement('pre');title.textContent='Font license';text.textContent=face.reference.license;license.append(title,text);details.append(license);}
    }catch(error){if(details.isConnected){const note=document.createElement('p');note.textContent=error.message;details.append(note);}}
  });
}

/** A searchable popover keeps text selection in the canvas editor while choosing a font. */
export function fontBrowser(host, values, { choose, sample = () => 'Lorem Ipsum', disabled = false, key = 'font-family' }) {
  const row = document.createElement('label'); row.className = 'draw-field';
  const label = document.createElement('span'); label.textContent = 'Font';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'draw-font-trigger';
  button.textContent = values.fontFamily + ' ▾'; button.disabled = disabled; button.dataset.drawField = key;
  button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-expanded','false');
  row.append(label,button); host.append(row);
  button.addEventListener('click', () => {
    closeFontBrowser();
    const popup = document.createElement('div'); popup.className = 'draw-font-browser'; popup.setAttribute('role','dialog'); popup.setAttribute('aria-label','Choose font'); popup.tabIndex = -1;
    const tabs = document.createElement('div'); tabs.className = 'draw-font-tabs';
    const search = document.createElement('input'); search.type = 'search'; search.className = 'input'; search.placeholder = 'Search fonts'; search.setAttribute('aria-label','Search fonts');
    const list = document.createElement('div'); list.className = 'draw-font-results'; list.setAttribute('role','listbox'); list.setAttribute('aria-label','Font families');
    const status = document.createElement('p'); status.className = 'draw-panel__hint'; status.setAttribute('role','status');
    popup.append(tabs,search,list,status); document.body.append(popup); button.setAttribute('aria-expanded','true');
    const rect = button.getBoundingClientRect(); popup.style.left = `${Math.max(8,Math.min(rect.left,innerWidth - 570))}px`; popup.style.top = `${Math.max(8,Math.min(rect.bottom + 4,innerHeight - 440))}px`;
    let source = values.fontSource ?? 'system', families = [], revision = 0, alive = true, observer;
    const preview = (sample() || 'Lorem Ipsum').replace(/\s+/g,' ').slice(0,80);
    const close = () => { alive = false; revision++; observer?.disconnect(); popup.remove(); button.setAttribute('aria-expanded','false'); document.removeEventListener('pointerdown',outside,true);if(activeBrowserClose===close)activeBrowserClose=null; };
    activeBrowserClose=close;
    const outside = event => { if (!popup.contains(event.target) && event.target !== button) close(); };
    document.addEventListener('pointerdown',outside,true);
    popup.addEventListener('keydown',event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); if (button.isConnected) button.focus(); }
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key) && event.target !== search) {
        event.preventDefault(); const rows = [...list.querySelectorAll('button')], at = rows.indexOf(document.activeElement);
        rows[event.key === 'Home' ? 0 : event.key === 'End' ? rows.length-1 : Math.max(0,Math.min(rows.length-1,at+(event.key==='ArrowDown'?1:-1)))]?.focus();
      } else if (event.key === 'ArrowDown' && event.target === search) { event.preventDefault(); list.querySelector('button')?.focus(); }
    });
    const tabButtons = new Map();
    for (const [id,name] of [['system','Installed fonts'],['google','Google Fonts']]) {
      const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'btn btn--ghost btn--sm'; tab.textContent = name; tab.dataset.fontSource = id;
      tab.addEventListener('click',() => { source = id; void load(); }); tabs.append(tab); tabButtons.set(id,tab);
    }
    function render() {
      observer?.disconnect(); list.replaceChildren();
      const matches = families.filter(f => f.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));
      status.textContent = `${matches.length} families${source === 'google' ? ' · Fonts download for offline use' : ''}`;
      let count = 0;
      const more = () => {
        for (const family of matches.slice(count,count+60)) {
          const item = document.createElement('button'); item.type = 'button'; item.className = 'draw-font-result'; item.setAttribute('role','option'); item.setAttribute('aria-selected',String(family === values.fontFamily && source === (values.fontSource ?? 'system'))); item.dataset.fontFamily = family;
          const name = document.createElement('span'); name.textContent = family;
          const specimen = document.createElement('span'); specimen.className = 'draw-font-specimen'; specimen.textContent = preview; specimen.style.fontFamily = JSON.stringify(family); item.append(name,specimen); list.append(item);
          const itemSource = source;
          item.addEventListener('click',async () => {
            item.disabled = true; status.textContent = 'Loading font…';
            try { const next = await prepareFont({ ...values, fontFamily: family, fontSource: itemSource, fontAxes: undefined, fontPostscriptName: undefined, googleFont: undefined }); if (!alive) return; close(); await choose(Object.fromEntries(['fontFamily','fontSource','fontWeight','fontStyle','fontPostscriptName','googleFont','fontAxes'].filter(k=>next[k]!==undefined).map(k=>[k,next[k]]))); }
            catch (error) { if (alive) { status.textContent = error.message; item.disabled = false; } }
          });
          observer.observe(item);
        }
        count += 60;
      };
      // Load only visible rows; a catalog can contain thousands of font families.
      let queue = Promise.resolve();
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          observer.unobserve(entry.target); const item = entry.target, family = item.dataset.fontFamily, itemSource = source;
          queue = queue.then(async () => {
            if (!alive || !item.isConnected) return;
            try { const prepared = await prepareFont({ fontFamily: family, fontSource: itemSource, fontWeight: 'normal', fontStyle: 'normal' }); const alias = await browserFont(prepared); if (item.isConnected) item.lastChild.style.fontFamily = JSON.stringify(alias); }
            catch { /* A broken preview never blocks choosing another family. */ }
          });
        }
      },{root:list});
      more(); list.onscroll = () => { if (list.scrollTop + list.clientHeight >= list.scrollHeight - 100 && count < matches.length) more(); };
    }
    async function load() {
      const token = ++revision; observer?.disconnect();list.replaceChildren();status.textContent = 'Loading fonts…';
      for (const [id,tab] of tabButtons) tab.setAttribute('aria-pressed',String(id === source));
      try { const data = source === 'google' ? (await googleFonts()).families : await installedFonts(); if (!alive || token !== revision) return; families = [...new Set(data.map(f => f.family))].sort((a,b) => a.localeCompare(b)); render(); }
      catch (error) { if (alive) status.textContent = error.message; }
    }
    search.addEventListener('input',render); void load(); search.focus();
  });
  return button;
}
