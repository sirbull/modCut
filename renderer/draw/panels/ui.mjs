import { PANEL_DEFINITIONS, panelIconHref, panelSpriteHref } from './registry.mjs';
import { insertNode, updateNode } from '../doc/commands.mjs';
import { ROOT_CONTEXT, collectCommands, deleteLayerCommands, layerContext, moveCommand, newLayer, releaseCommands, soloUpdates } from '../doc/layers.mjs';
import { shortcutLabel } from '../keymap.mjs';
import { REFERENCE_POINTS } from '../geom/transforms.mjs';
import { COLOR_MODES, colorFromValues, colorValues, normalizeHex } from '../doc/color.mjs';
import { ARROW_TYPES, paintHex } from '../doc/paint.mjs';

export function icon(href) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
  const use = document.createElementNS(svg.namespaceURI,'use'); use.setAttribute('href',href); svg.append(use);
  return svg;
}
export function createPanels(shell, state, api) {
  const rail = document.createElement('nav'); rail.className = 'draw-panel-rail'; rail.setAttribute('aria-label','Draw panels');
  let liveEdit = false;
  const panels = document.createElement('aside'); panels.className = 'draw-panels'; panels.setAttribute('aria-label','Draw options');
  const primary = document.createElement('section'); primary.className = 'draw-panel draw-panel--primary';
  panels.append(primary); shell.append(rail,panels);
  for (const panel of PANEL_DEFINITIONS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'draw-icon-button';
    const shortcut = shortcutLabel(`panel.${panel.id}`,{isMac:/Mac/.test(navigator.platform)});
    button.dataset.drawPanel = panel.id; button.dataset.tooltip = panel.name+(shortcut ? ` (${shortcut})` : ''); button.setAttribute('aria-label',panel.name);
    button.append(icon(panelIconHref(panel.id)));
    button.addEventListener('click',() => { state.ui.panel = panel.id; render(); }); rail.append(button);
  }
  function heading(host, title, extra) {
    const header = document.createElement('div'); header.className = 'draw-panel__header';
    const h = document.createElement('h2'); h.textContent = title; header.append(h); if (extra) header.append(extra); host.append(header);
  }
  function text(host, message) { const p = document.createElement('p'); p.className = 'draw-panel__hint'; p.textContent = message; host.append(p); }
  function button(label, action) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn--ghost btn--sm'; b.textContent = label;
    b.addEventListener('click',() => api.run(action)); return b;
  }
  function field(host, label, value, action, { type = 'number', disabled = false, min, max, key = label } = {}) {
    const row = document.createElement('label'); row.className = 'draw-field';
    const name = document.createElement('span'); name.textContent = label;
    const input = document.createElement('input'); input.type = type; input.value = type === 'color' ? value || '#FFFFFF' : type==='number' ? Number(Number(value).toFixed(3)) : value; input.dataset.drawField = key;
    input.disabled = disabled || state.document.readOnly; if (min !== undefined) input.min = min; if (max !== undefined) input.max = max;
    if (type === 'number') input.step = 'any';
    input.addEventListener('change',() => api.run(() => {
      const next = type === 'number' ? input.valueAsNumber : input.value;
      if (type === 'number' && (!Number.isFinite(next) || (min !== undefined && next < min) || (max !== undefined && next > max))) throw new Error(`Enter a valid ${label.toLowerCase()}.`);
      action(next);
    }));
    row.append(name,input); host.append(row); return input;
  }
  function iconButton(label, iconId, action, className = 'draw-layer-action') {
    const b = document.createElement('button'); b.type = 'button'; b.className = className;
    b.setAttribute('aria-label',label); b.dataset.tooltip = label; if (iconId) b.append(icon(panelSpriteHref(iconId)));
    if (action) b.addEventListener('click',event => api.run(() => action(event))); return b;
  }
  function layerPanel(host) {
    const doc = state.document, readOnly = doc.readOnly, collapsed = state.ui.collapsedNodes ??= new Set();
    const activeLayer = () => doc.getNode(state.ui.layerId)?.type === 'layer' ? doc.getNode(state.ui.layerId) : doc.data.layers.at(-1);
    const topLevel = id => [...doc.ancestors(id)].reverse()[0] ?? doc.getNode(id);
    const transaction = (label, commands) => state.history.transaction(label,() => commands.forEach(command => state.history.execute(command)));
    const actions = document.createElement('div'); actions.className = 'draw-layer-actions';
    for (const [label,iconId,action,disabled] of [
      ['New layer','plus',() => {
        const node = newLayer(doc), index = doc.locate(topLevel(activeLayer().id).id).index+1;
        state.ui.layerId = node.id; state.history.execute(insertNode(null,node,index));
      },readOnly],
      ['New sublayer','folder-plus',() => {
        const parent = activeLayer(), node = newLayer(doc);
        state.ui.layerId = node.id; collapsed.delete(parent.id); state.history.execute(insertNode(parent.id,node));
      },readOnly],
      ['Collect in new layer','stack-push',() => {
        const { layer, commands } = collectCommands(doc,api.selectedIds());
        transaction('Collect in New Layer',commands); state.ui.layerId = layer.id; api.select(api.selectedIds());
      },readOnly || !api.selectedIds().length],
      ['Release to layers (sequence)','stack-pop',() => transaction('Release to Layers',releaseCommands(doc,activeLayer().id).commands),readOnly],
      ['Locate object','focus-2',() => {
        const id = api.selectedIds()[0]; if (!id) return;
        for (const node of doc.ancestors(id)) collapsed.delete(node.id);
        render(); const row = primary.querySelector(`[data-draw-node="${id}"]`); row?.scrollIntoView({block:'nearest'}); row?.querySelector('.draw-layer-name')?.focus();
      },!api.selectedIds().length],
      ['Delete layer','trash',() => transaction('Delete Layer',deleteLayerCommands(doc,activeLayer().id)),readOnly],
    ]) { const b = iconButton(label,iconId,action); b.disabled = !!disabled; b.dataset.drawLayerAction = iconId; actions.append(b); }
    heading(host,'Layers',actions);
    const list = document.createElement('div'); list.className = 'draw-layer-list'; list.setAttribute('role','tree'); list.setAttribute('aria-label','Layers');
    const selected = new Set(state.selection.ids);
    function row(node, depth, context) {
      const own = layerContext(context,node), isLayer = node.type === 'layer';
      const item = document.createElement('div'); item.className = 'draw-layer-row'; item.style.setProperty('--depth',depth);
      item.style.setProperty('--layer-color',own.color || '#006B5C');
      item.dataset.drawNode = node.id; item.setAttribute('role','treeitem'); item.setAttribute('aria-level',String(depth+1));
      item.classList.toggle('is-active',node.id === state.ui.layerId); item.classList.toggle('is-layer',isLayer);
      item.classList.toggle('is-template',own.template); item.classList.toggle('is-dimmed',!doc.isEditable(node.id));
      item.setAttribute('aria-selected',String(selected.has(node.id)));
      const name = node.name || (isLayer ? 'Layer' : `<${node.type}>`);
      const eye = iconButton(`Visibility: ${name}`,node.template ? 'template' : node.visible ? 'eye' : 'eye-off',event => {
        if (event.altKey && isLayer && doc.locate(node.id).parentId === null) transaction('Show Only This Layer',soloUpdates(doc,node.id).map(([id,visible]) => updateNode(id,{visible})));
        else if ((event.ctrlKey || event.metaKey) && isLayer) state.history.execute(updateNode(node.id,{preview:node.preview === false}));
        else state.history.execute(updateNode(node.id,{visible:!node.visible}));
      },'draw-layer-toggle');
      eye.setAttribute('aria-pressed',String(node.visible)); eye.dataset.drawToggle = 'visible'; eye.disabled = readOnly;
      if (isLayer) eye.dataset.tooltip += ` · Alt: show only this layer · ${/Mac/.test(navigator.platform) ? 'Cmd' : 'Ctrl'}: Outline/Preview`;
      const lock = iconButton(`Lock: ${name}`,node.locked ? 'lock' : 'lock-open',() => state.history.execute(updateNode(node.id,{locked:!node.locked})),'draw-layer-toggle');
      lock.setAttribute('aria-pressed',String(node.locked)); lock.dataset.drawToggle = 'locked'; lock.disabled = readOnly;
      item.append(eye,lock);
      if (node.children?.length && node.type !== 'compoundPath') {
        const open = !collapsed.has(node.id), twisty = iconButton(`${open ? 'Collapse' : 'Expand'} ${name}`,open ? 'chevron-down' : 'chevron-right',() => {
          if (open) collapsed.add(node.id); else collapsed.delete(node.id); render();
        },'draw-layer-twisty');
        twisty.setAttribute('aria-expanded',String(open)); item.setAttribute('aria-expanded',String(open)); item.append(twisty);
      } else { const spacer = document.createElement('span'); spacer.className = 'draw-layer-twisty'; item.append(spacer); }
      if (isLayer) { const swatch = document.createElement('span'); swatch.className = 'draw-layer-color'; swatch.setAttribute('aria-hidden','true'); item.append(swatch); }
      const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'draw-layer-name'; choose.textContent = name;
      choose.addEventListener('click',event => api.run(() => {
        const layer = isLayer ? node : doc.ancestors(node.id).find(n => n.type === 'layer');
        if (layer) state.ui.layerId = layer.id;
        if (isLayer) render();
        else api.select(event.shiftKey ? (selected.has(node.id) ? [...selected].filter(id => id !== node.id) : [...selected,node.id]) : [node.id]);
      }));
      choose.addEventListener('dblclick',() => api.run(() => isLayer ? api.layerOptions(node.id) : rename(choose,node)));
      const target = iconButton(`Select ${name}`,null,event => {
        const ids = isLayer ? doc.descendants(node.id).filter(n => n.type !== 'layer' && doc.getNode(doc.locate(n.id).parentId).type === 'layer' && doc.isEditable(n.id)).map(n => n.id) : [node.id];
        api.select(event.shiftKey ? [...new Set([...selected,...ids])] : ids);
      },'draw-layer-target');
      target.classList.toggle('is-selected',selected.has(node.id) || doc.descendants(node.id).some(n => selected.has(n.id)));
      item.append(choose,target);
      if (!readOnly) {
        item.draggable = true;
        item.addEventListener('dragstart',event => { event.dataTransfer.setData('application/x-modcut-node',node.id); event.dataTransfer.effectAllowed = 'move'; });
        const placement = event => {
          const box = item.getBoundingClientRect(), y = (event.clientY-box.top)/box.height;
          return node.children && node.type !== 'compoundPath' ? (y < .25 ? 'above' : y > .75 ? 'below' : 'inside') : (y < .5 ? 'above' : 'below');
        };
        item.addEventListener('dragover',event => {
          if (!event.dataTransfer.types.includes('application/x-modcut-node')) return;
          event.preventDefault(); item.dataset.drop = placement(event);
        });
        item.addEventListener('dragleave',() => delete item.dataset.drop);
        item.addEventListener('drop',event => {
          event.preventDefault(); delete item.dataset.drop;
          const id = event.dataTransfer.getData('application/x-modcut-node'), where = placement(event);
          api.run(() => { const command = id && moveCommand(doc,id,node.id,where); if (command) state.history.execute(command); });
        });
      }
      list.append(item);
      if (node.children && node.type !== 'compoundPath' && !collapsed.has(node.id)) [...node.children].reverse().forEach(child => row(child,depth+1,own));
    }
    function rename(button, node) {
      const input = document.createElement('input'); input.className = 'draw-layer-rename'; input.value = node.name; input.setAttribute('aria-label','Name');
      let done = false;
      const finish = commit => { if (done) return; done = true; if (commit && input.value !== node.name) api.run(() => state.history.execute(updateNode(node.id,{name:input.value}))); else render(); };
      // Draw's window keymap captures keydown, so Enter/blur commit through the native change event.
      input.addEventListener('change',() => finish(true));
      input.addEventListener('blur',() => finish(false));
      button.replaceWith(input); input.focus(); input.select();
    }
    [...doc.data.layers].reverse().forEach(node => row(node,0,ROOT_CONTEXT)); host.append(list);
  }
  function check(host, label, key, value, onChange) {
    const row = document.createElement('label'); row.className = 'draw-check';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = value; input.dataset.drawField = key;
    input.addEventListener('change',() => onChange(input.checked)); row.append(input,document.createTextNode(label)); host.append(row); return input;
  }
  function transform(host) {
    const box = api.bounds(), ref = state.ui.referencePoint ?? [.5,.5], disabled = !box || state.document.readOnly;
    const top = document.createElement('div'); top.className = 'draw-transform-top'; host.append(top);
    const locator = document.createElement('div'); locator.className = 'draw-reference'; locator.setAttribute('role','group'); locator.setAttribute('aria-label','Reference point');
    const names = { 0: ['left','top'], .5: ['center','middle'], 1: ['right','bottom'] };
    for (const [u,v] of REFERENCE_POINTS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-reference__point';
      const label = u === .5 && v === .5 ? 'center' : `${names[v][1]} ${names[u][0]}`;
      b.setAttribute('aria-label',`Reference point: ${label}`); b.dataset.drawReference = `${u},${v}`;
      b.setAttribute('aria-pressed',String(ref[0] === u && ref[1] === v));
      b.addEventListener('click',() => { state.ui.referencePoint = [u,v]; render(); }); locator.append(b);
    }
    top.append(locator);
    const grid = document.createElement('div'); grid.className = 'draw-fields'; top.append(grid);
    const point = box ? [box.x+box.width*ref[0],box.y+box.height*ref[1]] : [0,0];
    field(grid,'X (mm)',point[0],value => api.transformPanel('x',value),{ disabled, key:'x' });
    field(grid,'Y (mm)',point[1],value => api.transformPanel('y',value),{ disabled, key:'y' });
    field(grid,'W (mm)',box?.width ?? 0,value => api.transformPanel('width',value),{ disabled: disabled || box.width < 1e-9, min:.001, key:'width' });
    field(grid,'H (mm)',box?.height ?? 0,value => api.transformPanel('height',value),{ disabled: disabled || box.height < 1e-9, min:.001, key:'height' });
    const link = iconButton(state.ui.linkProportions ? 'Proportions linked' : 'Link proportions',state.ui.linkProportions ? 'link' : 'unlink',() => { state.ui.linkProportions = !state.ui.linkProportions; render(); },'draw-layer-action draw-transform-link');
    link.setAttribute('aria-pressed',String(!!state.ui.linkProportions)); link.dataset.drawField = 'link'; grid.append(link);
    const angles = document.createElement('div'); angles.className = 'draw-fields'; host.append(angles);
    field(angles,'Rotate by (°)',0,value => api.transformPanel('rotate',value),{ disabled, key:'rotate' });
    field(angles,'Shear by (°)',0,value => api.transformPanel('shear',value),{ disabled, min:-89.99, max:89.99, key:'shear' });
    check(host,'Scale strokes & effects','scale-strokes',state.ui.scaleStrokes !== false,value => { state.ui.scaleStrokes = value; });
    check(host,'Scale corners','scale-corners',state.ui.scaleCorners !== false,value => { state.ui.scaleCorners = value; });
    text(host,box ? 'X and Y show the reference point. Rotate and Shear apply relative to the reference point; positive angles turn counterclockwise.' : 'Select an object to edit its position and size.');
  }
  function alignPanel(host) {
    const ids = api.selectedIds(), disabled = !ids.length || state.document.readOnly, alignTo = state.ui.alignTo ?? 'selection';
    const section = (title, rows) => {
      const h = document.createElement('h3'); h.className = 'draw-panel__section'; h.textContent = title; host.append(h);
      const group = document.createElement('div'); group.className = 'draw-align-row'; group.setAttribute('role','group'); group.setAttribute('aria-label',title);
      for (const [label,iconId,kind,mode] of rows) {
        const b = iconButton(label,iconId,() => api.alignPanel(kind,mode),'draw-layer-action draw-align-button');
        b.dataset.drawAlign = `${kind}-${mode}`; b.disabled = disabled; group.append(b);
      }
      host.append(group);
    };
    section('Align Objects',[['Horizontal align left','layout-align-left','align','left'],['Horizontal align center','layout-align-center','align','centerX'],['Horizontal align right','layout-align-right','align','right'],
      ['Vertical align top','layout-align-top','align','top'],['Vertical align center','layout-align-middle','align','centerY'],['Vertical align bottom','layout-align-bottom','align','bottom']]);
    section('Distribute Objects',[['Horizontal distribute left','align-box-left-middle','distribute','left'],['Horizontal distribute center','keyframe-align-vertical','distribute','centerX'],['Horizontal distribute right','align-box-right-middle','distribute','right'],
      ['Vertical distribute top','align-box-top-center','distribute','top'],['Vertical distribute center','keyframe-align-horizontal','distribute','centerY'],['Vertical distribute bottom','align-box-bottom-center','distribute','bottom']]);
    section('Distribute Spacing',[['Horizontal distribute space','spacing-horizontal','spacing','x'],['Vertical distribute space','spacing-vertical','spacing','y']]);
    const row = document.createElement('label'); row.className = 'draw-field';
    const name = document.createElement('span'); name.textContent = 'Align to';
    const select = document.createElement('select'); select.className = 'draw-select'; select.dataset.drawField = 'align-to';
    for (const [value,label] of [['selection','Selection'],['key','Key object'],['artboard','Artboard']]) select.append(new Option(label,value,false,value === alignTo));
    select.addEventListener('change',() => { state.ui.alignTo = select.value; render(); }); row.append(name,select); host.append(row);
    if (alignTo === 'key') {
      const keyRow = document.createElement('label'); keyRow.className = 'draw-field';
      const keyName = document.createElement('span'); keyName.textContent = 'Key object';
      const key = document.createElement('select'); key.className = 'draw-select'; key.dataset.drawField = 'key-object'; key.disabled = !ids.length;
      const current = ids.includes(state.ui.keyObject) ? state.ui.keyObject : ids.at(-1);
      for (const id of ids) { const node = state.document.getNode(id); key.append(new Option(node.name || `<${node.type}>`,id,false,id === current)); }
      key.addEventListener('change',() => { state.ui.keyObject = key.value; });
      keyRow.append(keyName,key); host.append(keyRow);
      const spaceRow = document.createElement('label'); spaceRow.className = 'draw-field';
      const spaceName = document.createElement('span'); spaceName.textContent = 'Spacing (mm)';
      const spacing = document.createElement('input'); spacing.type = 'number'; spacing.step = 'any'; spacing.placeholder = 'Auto'; spacing.dataset.drawField = 'align-spacing';
      spacing.value = state.ui.alignSpacing ?? '';
      spacing.addEventListener('change',() => api.run(() => {
        if (spacing.value === '') { state.ui.alignSpacing = null; return; }
        if (!Number.isFinite(spacing.valueAsNumber)) throw new Error('Enter a valid spacing.');
        state.ui.alignSpacing = spacing.valueAsNumber;
      }));
      spaceRow.append(spaceName,spacing); host.append(spaceRow);
    }
    text(host,!ids.length ? 'Select objects to align or distribute them.' : alignTo === 'key' ? 'The key object stays in place. Enter a spacing to use an exact gap.' : ids.length === 1 && alignTo === 'selection' ? 'A single object aligns to the active artboard.' : 'Distribute Objects needs three objects, or an artboard.');
  }
  function currentPaint(kind) {
    const node = state.document.getNode(api.paintIds()[0]);
    if (!node) return state.ui[kind];
    return paintHex(kind === 'fill' ? node.appearance.fills[0] : node.appearance.strokes[0]);
  }
  function colorPanel(host) {
    const target = state.ui.paintFocus === 'stroke' ? 'stroke' : 'fill', mode = state.ui.colorMode ?? 'rgb', hex = currentPaint(target);
    const disabled = state.document.readOnly, shown = hex || '#FFFFFF', live = `color-${target}`;
    const targets = document.createElement('div'); targets.className = 'draw-segmented'; targets.setAttribute('role','group'); targets.setAttribute('aria-label','Color target');
    for (const kind of ['fill','stroke']) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-segmented__option'; b.textContent = kind === 'fill' ? 'Fill' : 'Stroke';
      b.dataset.drawPaintTarget = kind; b.setAttribute('aria-pressed',String(kind === target));
      b.addEventListener('click',() => api.paintFocus(kind)); targets.append(b);
    }
    host.append(targets);
    const top = document.createElement('div'); top.className = 'draw-color-top'; host.append(top);
    const swatch = document.createElement('input'); swatch.type = 'color'; swatch.className = 'draw-color-swatch'; swatch.value = shown.toLowerCase();
    swatch.setAttribute('aria-label',`${target === 'fill' ? 'Fill' : 'Stroke'} color picker`); swatch.dataset.drawField = 'color-picker'; swatch.dataset.live = 'true'; swatch.disabled = disabled;
    swatch.classList.toggle('is-none',!hex);
    swatch.addEventListener('input',() => { liveEdit = true; }); swatch.addEventListener('input',() => api.run(() => api.paint(target,swatch.value.toUpperCase(),{ mergeKey: live })));
    swatch.addEventListener('change',() => { liveEdit = false; render(); });
    const none = button('None',() => api.paint(target,null)); none.dataset.drawField = 'color-none'; none.disabled = disabled; none.setAttribute('aria-pressed',String(!hex));
    const modeSelect = document.createElement('select'); modeSelect.className = 'draw-select'; modeSelect.dataset.drawField = 'color-mode'; modeSelect.setAttribute('aria-label','Color mode');
    for (const [value,spec] of Object.entries(COLOR_MODES)) modeSelect.append(new Option(spec.name,value,false,value === mode));
    modeSelect.addEventListener('change',() => { state.ui.colorMode = modeSelect.value; render(); });
    top.append(swatch,modeSelect,none);
    const values = colorValues(mode,shown), inputs = [];
    const apply = (mergeKey) => api.run(() => api.paint(target,colorFromValues(mode,inputs.map(i => i.number.valueAsNumber)),{ mergeKey }));
    COLOR_MODES[mode].channels.forEach(([label,max],i) => {
      const row = document.createElement('label'); row.className = 'draw-color-channel';
      const name = document.createElement('span'); name.textContent = label;
      const range = document.createElement('input'); range.type = 'range'; range.min = '0'; range.max = String(max); range.step = mode === 'rgb' ? '1' : '0.1'; range.value = String(values[i]);
      range.dataset.drawField = `color-${mode}-${i}-range`; range.dataset.live = 'true'; range.setAttribute('aria-label',`${label} slider`); range.disabled = disabled;
      const number = document.createElement('input'); number.type = 'number'; number.min = '0'; number.max = String(max); number.step = 'any'; number.value = String(values[i]);
      number.dataset.drawField = `color-${mode}-${i}`; number.setAttribute('aria-label',label); number.disabled = disabled;
      range.addEventListener('pointerdown',() => { liveEdit = true; });
      range.addEventListener('input',() => { number.value = range.value; apply(live); });
      range.addEventListener('change',() => { liveEdit = false; render(); });
      number.addEventListener('change',() => { range.value = number.value; apply(null); });
      inputs.push({ range, number }); row.append(name,range,number); host.append(row);
    });
    const hexInput = field(host,'Hex',hex ? hex.slice(1).toUpperCase() : '',value => api.paint(target,normalizeHex(value)),{ type:'text', key:'color-hex', disabled });
    hexInput.maxLength = 7; hexInput.spellcheck = false;
    text(host,api.paintIds().length ? 'Changes apply live to the selected artwork; a slider drag is one undo step.' : 'No artwork selected: these colors apply to new shapes.');
  }
  function segmented(host, label, key, options, value, onPick, { disabled = false, unavailable = {} } = {}) {
    const wrap = document.createElement('div'); wrap.className = 'draw-field';
    const name = document.createElement('span'); name.textContent = label; wrap.append(name);
    const group = document.createElement('div'); group.className = 'draw-segmented'; group.setAttribute('role','group'); group.setAttribute('aria-label',label);
    for (const [id,text] of options) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-segmented__option'; b.textContent = text;
      b.dataset.drawStroke = `${key}-${id}`; b.setAttribute('aria-pressed',String(id === value)); b.disabled = disabled || !!unavailable[id];
      if (unavailable[id]) b.dataset.tooltip = unavailable[id];
      b.addEventListener('click',() => api.run(() => onPick(id))); group.append(b);
    }
    wrap.append(group); host.append(wrap);
  }
  function strokePanel(host) {
    const node = state.document.getNode(api.paintIds()[0]), stroke = node?.appearance.strokes[0] ?? null, readOnly = state.document.readOnly;
    const s = stroke ?? { width: state.ui.strokeWidth, cap: 'round', join: 'round', miterLimit: 4, align: 'center' }, disabled = readOnly || !node;
    const apply = props => api.strokeProps(props);
    field(host,'Weight (mm)',s.width,value => node ? apply({ width: value }) : api.paint('width',value),{ min:0, max:352.8, key:'stroke-weight', disabled: readOnly });
    segmented(host,'Cap','cap',[['butt','Butt'],['round','Round'],['square','Projecting']],s.cap,cap => apply({ cap }),{ disabled });
    segmented(host,'Corner','join',[['miter','Miter'],['round','Round'],['bevel','Bevel']],s.join,join => apply({ join }),{ disabled });
    field(host,'Limit (×)',s.miterLimit ?? 4,value => apply({ miterLimit: value }),{ min:1, max:500, key:'stroke-limit', disabled: disabled || s.join !== 'miter' });
    const later = 'Inside and Outside alignment come with Outline Stroke (phase 3).';
    segmented(host,'Align stroke','align',[['center','Center'],['inside','Inside'],['outside','Outside']],s.align ?? 'center',() => {},{ disabled, unavailable: { inside: later, outside: later } });
    check(host,'Dashed line','stroke-dashed',!!s.dash?.array?.length,on => api.run(() => apply({ dash: on ? [2,1] : null }))).disabled = disabled;
    if (s.dash?.array?.length) {
      const grid = document.createElement('div'); grid.className = 'draw-dash-grid'; host.append(grid);
      const inputs = [];
      for (let i = 0; i < 6; i++) {
        const input = field(grid,`${i % 2 ? 'Gap' : 'Dash'} (mm)`,s.dash.array[i] ?? '',() => apply({ dash: inputs.map(x => x.value === '' ? null : x.valueAsNumber) }),{ min:0, key:`dash-${i}`, disabled });
        if (s.dash.array[i] === undefined) input.value = '';
        inputs.push(input);
      }
    }
    const arrows = document.createElement('div'); arrows.className = 'draw-fields'; host.append(arrows);
    for (const [key,label] of [['startArrow','Start arrowhead'],['endArrow','End arrowhead']]) {
      const row = document.createElement('label'); row.className = 'draw-field';
      const name = document.createElement('span'); name.textContent = label;
      const select = document.createElement('select'); select.className = 'draw-select'; select.dataset.drawField = `stroke-${key}`; select.disabled = disabled;
      select.append(new Option('None','none',false,!s[key]));
      for (const type of ARROW_TYPES) select.append(new Option(type[0].toUpperCase()+type.slice(1),type,false,s[key]?.type === type));
      select.addEventListener('change',() => api.run(() => apply({ [key]: select.value === 'none' ? null : { type: select.value, scale: s[key]?.scale ?? 1 } })));
      row.append(name,select); arrows.append(row);
    }
    for (const [key,label] of [['startArrow','Start scale (%)'],['endArrow','End scale (%)']]) {
      field(arrows,label,(s[key]?.scale ?? 1)*100,value => apply({ [key]: { type: s[key].type, scale: value/100 } }),{ min:1, max:1000, key:`stroke-${key}-scale`, disabled: disabled || !s[key] });
    }
    text(host,node ? (stroke ? 'Stroke color is set in the Color panel.' : 'This artwork has no stroke; editing an option adds one in the current stroke color.') : 'Select artwork to edit stroke options. Weight applies to new shapes.');
  }
  function render() {
    // A slider drag or color-picker session updates the canvas live; rebuilding would interrupt it.
    if (liveEdit && primary.contains(document.activeElement)) return;
    liveEdit = false;
    for (const button of rail.children) button.setAttribute('aria-pressed',String(button.dataset.drawPanel === state.ui.panel));
    primary.replaceChildren();
    if (state.ui.panel !== 'layers') heading(primary,PANEL_DEFINITIONS.find(p => p.id === state.ui.panel)?.name || 'Properties');
    if (state.document.readOnly) text(primary,state.warning || 'Read-only document');
    if (state.ui.panel === 'layers') layerPanel(primary);
    else if (state.ui.panel === 'artboards') {
      const list=document.createElement('div');list.className='draw-artboard-list';list.setAttribute('aria-label','Artboards');
      for (const [i,board] of state.document.data.artboards.entries()) {
        const b=button(`${i+1}. ${board.name}`,()=>api.artboards.choose(board.id));b.dataset.drawArtboard=board.id;
        b.setAttribute('aria-pressed',String(board.id===api.artboards.active().id));
        b.addEventListener('dblclick',()=>api.artboards.choose(board.id,true));list.append(b);
      } primary.append(list);
      const board=api.artboards.active();
      field(primary,'Name',board.name,v=>api.artboards.edit(board.id,{name:v},{artwork:false}),{type:'text',key:'artboard-name'});
      const grid=document.createElement('div');grid.className='draw-fields';primary.append(grid);
      for(const [key,label] of [['x','X'],['y','Y'],['width','Width'],['height','Height']])field(grid,`${label} (mm)`,board[key],v=>api.artboards.edit(board.id,{[key]:v}),{min:['width','height'].includes(key) ? .001 : undefined,max:['width','height'].includes(key) ? 5779 : undefined,key:`artboard-${key}`});
      const move=document.createElement('label');move.className='draw-check';const check=document.createElement('input');check.type='checkbox';check.checked=state.ui.moveArtwork!==false;
      check.addEventListener('change',()=>{state.ui.moveArtwork=check.checked;});move.append(check,document.createTextNode('Move/copy artwork with artboard'));primary.append(move);
      for(const [label,action,disabled] of [['New artboard',()=>api.artboards.add(),false],['Duplicate',()=>api.artboards.duplicate(),false],['Delete',()=>api.artboards.remove(),state.document.data.artboards.length===1],['Move up',()=>api.artboards.order(-1),state.document.data.artboards[0].id===board.id],['Move down',()=>api.artboards.order(1),state.document.data.artboards.at(-1).id===board.id],['Rearrange…',api.rearrange,false]]) {
        const b=button(label,action);b.disabled=disabled || state.document.readOnly;primary.append(b);
      }
    } else if (state.ui.panel === 'color') colorPanel(primary);
    else if (state.ui.panel === 'stroke') strokePanel(primary);
    else if (state.ui.panel === 'align') alignPanel(primary);
    else if (state.ui.panel === 'transform') transform(primary);
    else {
        text(primary,state.selection.ids.length ? `${state.selection.ids.length} selected` : 'Select artwork or choose a drawing tool.');
        const node = state.document.getNode(api.selectedIds()[0]);
        if (node) field(primary,'Name',node.name,value => state.history.execute(updateNode(node.id,{name:value})),{type:'text'});
        else text(primary,'Fill and Stroke are set with the swatches below the drawing tools.');
        const opacity = state.document.getNode(api.selectedIds()[0])?.opacity ?? 1;
        field(primary,'Opacity (%)',opacity*100,value => state.history.transaction('Opacity',() => {
          for (const id of api.selectedIds()) state.history.execute(updateNode(id,{opacity:value/100}));
        }),{min:0,max:100,disabled:!api.selectedIds().length,key:'opacity'});
        const corners=api.cornerInfo?.();
        if(corners){
          const input=field(primary,'Corner radius (mm)',corners.radius??0,value=>api.setCornerRadius(value),{min:0,key:'corner-radius'});
          if(corners.radius===null){input.value='';input.placeholder='Mixed';}
          text(primary,`${corners.count} editable corner${corners.count===1?'':'s'}. Drag the dotted circles, or enter a radius. Alt-drag edits one corner.`);
        }else if(node?.type==='shape') {
          const editable=node.shape==='rect' ? [['cornerRadius','Corner radius (mm)',0]] : node.shape==='polygon' ? [['sides','Sides',3]] : node.shape==='star' ? [['points','Points',2],['innerRadius','Inner radius (mm)',0],['outerRadius','Outer radius (mm)',0]] : node.shape==='ellipse' ? [['startAngle','Pie start (°)',-360],['endAngle','Pie end (°)',-360]] : [];
          for(const [key,label,min] of editable)field(primary,label,node.params[key]??({sides:6,points:5,endAngle:360}[key] || 0),value=>state.history.execute(updateNode(node.id,{params:{...node.params,[key]:value}})),{min,max:['sides','points'].includes(key)?100:undefined,key:`shape-${key}`});
        }
    }
  }
  render(); return { render };
}
