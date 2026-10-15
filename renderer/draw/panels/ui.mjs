import { DOCK_PANELS, PANEL_GROUPS, clampDockSplit, groupForPanel, panelName, panelSpriteHref } from './registry.mjs';
import { insertNode, updateNode } from '../doc/commands.mjs';
import { ROOT_CONTEXT, collectCommands, deleteLayerCommands, layerContext, moveCommand, newLayer, releaseCommands, soloUpdates } from '../doc/layers.mjs';
import { shortcutLabel } from '../keymap.mjs';
import { REFERENCE_POINTS } from '../geom/transforms.mjs';

export function icon(href) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
  const use = document.createElementNS(svg.namespaceURI,'use'); use.setAttribute('href',href); svg.append(use);
  return svg;
}
const SPLIT_KEY = 'modcut_draw_dock_split';
function storedSplit() { try { return Number.parseFloat(localStorage.getItem(SPLIT_KEY)); } catch { return NaN; } }
function storeSplit(value) { try { localStorage.setItem(SPLIT_KEY, String(value)); } catch {} }

export function createPanels(shell, state, api) {
  const isMac = /Mac/.test(navigator.platform);
  state.ui.groupTabs ??= {}; state.ui.dockCollapsed ??= {};
  if (state.ui.flyout && !PANEL_GROUPS.some(group => group.id === state.ui.flyout)) state.ui.flyout = null;
  const rail = document.createElement('nav'); rail.className = 'draw-panel-rail'; rail.setAttribute('aria-label','Draw panels');
  // Right dock: Properties on top, Layers below, separated by a draggable splitter.
  const panels = document.createElement('aside'); panels.className = 'draw-panels'; panels.setAttribute('aria-label','Draw options');
  const dock = {};
  for (const id of DOCK_PANELS) {
    const section = document.createElement('section'); section.className = 'draw-dock-section'; section.dataset.drawDock = id;
    const header = document.createElement('button'); header.type = 'button'; header.className = 'draw-dock-header';
    header.dataset.drawDockToggle = id; header.append(icon(panelSpriteHref('chevron-down')),document.createTextNode(panelName(id)));
    header.addEventListener('click',() => { state.ui.dockCollapsed[id] = !state.ui.dockCollapsed[id]; layoutDock(); });
    const body = document.createElement('div'); body.className = 'draw-panel draw-dock-body';
    section.append(header,body); dock[id] = { section, header, body };
  }
  const splitter = document.createElement('div'); splitter.className = 'draw-dock-splitter';
  splitter.setAttribute('role','separator'); splitter.setAttribute('aria-orientation','horizontal'); splitter.setAttribute('aria-label','Resize Properties and Layers');
  splitter.dataset.tooltip = 'Drag to resize · Double-click: reset';
  panels.append(dock.properties.section,splitter,dock.layers.section);
  const primary = dock.properties.body;
  // Panel groups open as a flyout beside the rail, one tab per panel.
  const flyout = document.createElement('section'); flyout.className = 'draw-flyout'; flyout.hidden = true; flyout.setAttribute('role','dialog');
  const flyoutTabs = document.createElement('div'); flyoutTabs.className = 'draw-flyout__tabs'; flyoutTabs.setAttribute('role','tablist');
  const flyoutBody = document.createElement('div'); flyoutBody.className = 'draw-panel draw-flyout__body'; flyoutBody.setAttribute('role','tabpanel');
  const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.className = 'draw-layer-action draw-flyout__close';
  closeButton.setAttribute('aria-label','Close panel'); closeButton.dataset.tooltip = 'Close (Esc)'; closeButton.append(icon(panelSpriteHref('x')));
  closeButton.addEventListener('click',() => close());
  const flyoutHeader = document.createElement('div'); flyoutHeader.className = 'draw-flyout__header'; flyoutHeader.append(flyoutTabs,closeButton);
  flyout.append(flyoutHeader,flyoutBody);
  shell.append(rail,panels,flyout);
  for (const group of PANEL_GROUPS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'draw-icon-button';
    const names = group.tabs.map(panelName).join(' · '), shortcut = shortcutLabel(`panel.${group.tabs[0]}`,{isMac});
    button.dataset.drawPanel = group.id; button.dataset.tooltip = names+(shortcut ? ` (${shortcut})` : ''); button.setAttribute('aria-label',names);
    button.setAttribute('aria-haspopup','dialog'); button.append(icon(panelSpriteHref(group.icon)));
    button.addEventListener('click',() => { state.ui.flyout = state.ui.flyout === group.id ? null : group.id; render(); }); rail.append(button);
  }
  function close() { if (!state.ui.flyout) return false; const id = state.ui.flyout; state.ui.flyout = null; render(); rail.querySelector(`[data-draw-panel="${id}"]`)?.focus({ preventScroll: true }); return true; }
  function open(id) {
    if (DOCK_PANELS.includes(id)) {
      state.ui.dockCollapsed[id] = false; layoutDock();
      if (id === 'layers') dock.layers.body.querySelector('.draw-layer-name')?.focus({ preventScroll: true });
      return true;
    }
    const group = groupForPanel(id); if (!group) return false;
    state.ui.flyout = group.id; state.ui.groupTabs[group.id] = id; render(); return true;
  }
  function layoutDock() {
    const height = panels.clientHeight, split = clampDockSplit(state.ui.dockSplit ?? storedSplit(),height);
    const collapsed = id => !!state.ui.dockCollapsed[id];
    for (const id of DOCK_PANELS) {
      dock[id].section.classList.toggle('is-collapsed',collapsed(id)); dock[id].header.setAttribute('aria-expanded',String(!collapsed(id)));
    }
    splitter.hidden = collapsed('properties') || collapsed('layers');
    dock.properties.section.style.flex = collapsed('properties') ? '0 0 auto' : collapsed('layers') ? '1 1 0' : `0 0 ${(split*100).toFixed(3)}%`;
    dock.layers.section.style.flex = collapsed('layers') ? '0 0 auto' : '1 1 0';
    splitter.setAttribute('aria-valuenow',String(Math.round(split*100)));
  }
  function setSplit(fraction) { state.ui.dockSplit = clampDockSplit(fraction,panels.clientHeight); storeSplit(state.ui.dockSplit); layoutDock(); }
  splitter.addEventListener('pointerdown',event => {
    if (event.button !== 0) return; event.preventDefault(); splitter.setPointerCapture(event.pointerId);
    const box = panels.getBoundingClientRect(), offset = event.clientY - splitter.getBoundingClientRect().top;
    const move = e => setSplit((e.clientY - offset - box.top) / box.height);
    const end = () => { splitter.removeEventListener('pointermove',move); splitter.removeEventListener('pointerup',end); splitter.removeEventListener('pointercancel',end); };
    splitter.addEventListener('pointermove',move); splitter.addEventListener('pointerup',end); splitter.addEventListener('pointercancel',end);
  });
  splitter.addEventListener('dblclick',() => setSplit(.5));
  new ResizeObserver(layoutDock).observe(panels);
  function placeFlyout() {
    const button = rail.querySelector(`[data-draw-panel="${state.ui.flyout}"]`); if (!button) return;
    const box = shell.getBoundingClientRect(), anchor = button.getBoundingClientRect();
    flyout.style.right = `${Math.round(box.right - rail.getBoundingClientRect().left + 6)}px`;
    flyout.style.maxHeight = `${Math.max(160,Math.round(box.height - 16))}px`;
    const top = Math.max(8,Math.min(anchor.top - box.top,box.height - flyout.offsetHeight - 8));
    flyout.style.top = `${Math.round(top)}px`;
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
    host.append(actions);
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
  function paint(host, strokeOnly = false) {
    const ids = api.paintIds(), first = state.document.getNode(ids[0]);
    function hex(entry, fallback) {
      const color = entry?.paint?.color;
      return color?.space === 'rgb' ? '#'+color.values.map(v => Math.round(v*255).toString(16).padStart(2,'0')).join('') : fallback;
    }
    const fill = first ? hex(first.appearance.fills[0],state.ui.fill) : state.ui.fill;
    const stroke = first ? hex(first.appearance.strokes[0],state.ui.stroke) : state.ui.stroke;
    const width = first?.appearance.strokes[0]?.width ?? state.ui.strokeWidth;
    if (!strokeOnly) {
      field(host,'Fill',fill,v => api.paint('fill',v),{type:'color'});
      host.append(button('No fill',() => api.paint('fill',null)));
    } else {
      field(host,'Stroke',stroke,v => api.paint('stroke',v),{type:'color'});
      field(host,'Width (mm)',width,v => api.paint('width',v),{min:0,key:'stroke-width'});
      host.append(button('No stroke',() => api.paint('stroke',null)));
    }
    if (!ids.length) text(host,'These colors apply to new shapes. Select artwork to change its appearance.');
  }
  function artboardPanel(host) {
    const list=document.createElement('div');list.className='draw-artboard-list';list.setAttribute('aria-label','Artboards');
    for (const [i,board] of state.document.data.artboards.entries()) {
      const b=button(`${i+1}. ${board.name}`,()=>api.artboards.choose(board.id));b.dataset.drawArtboard=board.id;
      b.setAttribute('aria-pressed',String(board.id===api.artboards.active().id));
      b.addEventListener('dblclick',()=>api.artboards.choose(board.id,true));list.append(b);
    } host.append(list);
    const board=api.artboards.active();
    field(host,'Name',board.name,v=>api.artboards.edit(board.id,{name:v},{artwork:false}),{type:'text',key:'artboard-name'});
    const grid=document.createElement('div');grid.className='draw-fields';host.append(grid);
    for(const [key,label] of [['x','X'],['y','Y'],['width','Width'],['height','Height']])field(grid,`${label} (mm)`,board[key],v=>api.artboards.edit(board.id,{[key]:v}),{min:['width','height'].includes(key) ? .001 : undefined,max:['width','height'].includes(key) ? 5779 : undefined,key:`artboard-${key}`});
    const move=document.createElement('label');move.className='draw-check';const check=document.createElement('input');check.type='checkbox';check.checked=state.ui.moveArtwork!==false;
    check.addEventListener('change',()=>{state.ui.moveArtwork=check.checked;});move.append(check,document.createTextNode('Move/copy artwork with artboard'));host.append(move);
    for(const [label,action,disabled] of [['New artboard',()=>api.artboards.add(),false],['Duplicate',()=>api.artboards.duplicate(),false],['Delete',()=>api.artboards.remove(),state.document.data.artboards.length===1],['Move up',()=>api.artboards.order(-1),state.document.data.artboards[0].id===board.id],['Move down',()=>api.artboards.order(1),state.document.data.artboards.at(-1).id===board.id],['Rearrange…',api.rearrange,false]]) {
      const b=button(label,action);b.disabled=disabled || state.document.readOnly;host.append(b);
    }
  }
  function propertiesPanel(host) {
    text(host,state.selection.ids.length ? `${state.selection.ids.length} selected` : 'Select artwork or choose a drawing tool.');
    const node = state.document.getNode(api.selectedIds()[0]);
    if (node) field(host,'Name',node.name,value => state.history.execute(updateNode(node.id,{name:value})),{type:'text'});
    else text(host,'Fill and Stroke are set with the swatches below the drawing tools.');
    const opacity = state.document.getNode(api.selectedIds()[0])?.opacity ?? 1;
    field(host,'Opacity (%)',opacity*100,value => state.history.transaction('Opacity',() => {
      for (const id of api.selectedIds()) state.history.execute(updateNode(id,{opacity:value/100}));
    }),{min:0,max:100,disabled:!api.selectedIds().length,key:'opacity'});
    const corners=api.cornerInfo?.();
    if(corners){
      const input=field(host,'Corner radius (mm)',corners.radius??0,value=>api.setCornerRadius(value),{min:0,key:'corner-radius'});
      if(corners.radius===null){input.value='';input.placeholder='Mixed';}
      text(host,`${corners.count} editable corner${corners.count===1?'':'s'}. Drag the dotted circles, or enter a radius. Alt-drag edits one corner.`);
    }else if(node?.type==='shape') {
      const editable=node.shape==='rect' ? [['cornerRadius','Corner radius (mm)',0]] : node.shape==='polygon' ? [['sides','Sides',3]] : node.shape==='star' ? [['points','Points',2],['innerRadius','Inner radius (mm)',0],['outerRadius','Outer radius (mm)',0]] : node.shape==='ellipse' ? [['startAngle','Pie start (°)',-360],['endAngle','Pie end (°)',-360]] : [];
      for(const [key,label,min] of editable)field(host,label,node.params[key]??({sides:6,points:5,endAngle:360}[key] || 0),value=>state.history.execute(updateNode(node.id,{params:{...node.params,[key]:value}})),{min,max:['sides','points'].includes(key)?100:undefined,key:`shape-${key}`});
    }
  }
  const PANEL_CONTENT = { color: host => paint(host), stroke: host => paint(host,true), transform: host => transform(host), align: alignPanel, artboards: artboardPanel };
  function renderFlyout() {
    const group = PANEL_GROUPS.find(g => g.id === state.ui.flyout);
    flyout.hidden = !group; if (!group) { flyoutTabs.replaceChildren(); flyoutBody.replaceChildren(); return; }
    const active = group.tabs.includes(state.ui.groupTabs[group.id]) ? state.ui.groupTabs[group.id] : group.tabs[0];
    flyout.dataset.drawGroup = group.id; flyout.setAttribute('aria-label',group.tabs.map(panelName).join(', '));
    flyoutTabs.replaceChildren(...group.tabs.map(id => {
      const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'draw-flyout__tab'; tab.setAttribute('role','tab');
      tab.dataset.drawPanelTab = id; tab.textContent = panelName(id); tab.setAttribute('aria-selected',String(id === active));
      const shortcut = shortcutLabel(`panel.${id}`,{isMac}); if (shortcut) tab.dataset.tooltip = `${panelName(id)} (${shortcut})`;
      tab.addEventListener('click',() => { state.ui.groupTabs[group.id] = id; render(); }); return tab;
    }));
    flyoutBody.replaceChildren(); flyoutBody.dataset.drawPanelBody = active;
    if (state.document.readOnly) text(flyoutBody,state.warning || 'Read-only document');
    PANEL_CONTENT[active](flyoutBody);
    placeFlyout();
  }
  function render() {
    for (const button of rail.children) button.setAttribute('aria-pressed',String(button.dataset.drawPanel === state.ui.flyout));
    primary.replaceChildren(); dock.layers.body.replaceChildren();
    if (state.document.readOnly) text(primary,state.warning || 'Read-only document');
    propertiesPanel(primary); layerPanel(dock.layers.body);
    renderFlyout(); layoutDock();
  }
  render(); return { render, open, close };
}
