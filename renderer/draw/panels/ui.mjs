import { DOCK_PANELS, PANEL_DEFINITIONS, PANEL_GROUPS, clampDockSplit, groupForPanel, panelAvailable, panelName, panelSpriteHref } from './registry.mjs';
import { insertNode, updateDocument, updateNode } from '../doc/commands.mjs';
import { createId } from '../doc/schema.mjs';
import { textValues } from '../doc/text.mjs';
import { addStop, colorHex, gradientCss, isGradient, removeStop, reverseGradient, setGradientAngle, setGradientType, updateStop } from '../doc/gradient.mjs';
import { addSwatch, documentSwatches, editSwatch, groupSwatches, rememberColor, removeSwatch } from '../doc/swatches.mjs';
import { ROOT_CONTEXT, collectCommands, deleteLayerCommands, deleteRowCommands, duplicateCommands, filterLayerTree, flattenCommands, layerContext, mergeLayersCommands, moveCommand, moveToLayerCommands, newLayer, othersUpdates, releaseCommands, soloUpdates } from '../doc/layers.mjs';
import { shortcutLabel } from '../keymap.mjs';
import { REFERENCE_POINTS } from '../geom/transforms.mjs';
import { attachScrub } from '../ui/number-field.mjs';
import { PATHFINDER_LABELS, PATHFINDERS, SHAPE_MODES } from '../geom/pathfinder.mjs';
import { pathfinderIcon } from './pathfinder-icons.mjs';
import { addEntry, appearanceRows, clearAppearance, duplicateEntry, moveEntry, patchEntry, removeEntry, toggleEntry } from '../doc/appearance.mjs';
import { COLOR_MODES, colorFromValues, colorValues, normalizeHex } from '../doc/color.mjs';
import { ARROW_TYPES, paintHex } from '../doc/paint.mjs';

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
  let liveEdit = false;
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
  // Control bar (Illustrator's Control panel): contextual fields above the canvas. View > Control Bar hides it.
  const controlBar = document.createElement('div'); controlBar.className = 'draw-control-bar'; controlBar.setAttribute('role','toolbar'); controlBar.setAttribute('aria-label','Control bar');
  shell.append(controlBar,rail,panels,flyout);
  for (const group of PANEL_GROUPS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'draw-icon-button';
    const names = group.tabs.map(panelName).join(' · '), shortcut = shortcutLabel(`panel.${group.tabs[0]}`,{isMac});
    button.dataset.drawPanel = group.id; button.dataset.tooltip = names+(shortcut ? ` (${shortcut})` : ''); button.setAttribute('aria-label',names);
    button.setAttribute('aria-haspopup','dialog'); button.append(icon(panelSpriteHref(group.icon)));
    button.addEventListener('click',() => { state.ui.flyout = state.ui.flyout === group.id ? null : group.id; render(); }); rail.append(button);
  }
  function close() { if (state.ui.layerMenu) { state.ui.layerMenu = false; render(); return true; } if (!state.ui.flyout) return false; const id = state.ui.flyout; state.ui.flyout = null; render(); rail.querySelector(`[data-draw-panel="${id}"]`)?.focus({ preventScroll: true }); return true; }
  function open(id) {
    if (DOCK_PANELS.includes(id)) {
      state.ui.dockCollapsed[id] = false; layoutDock();
      if (id === 'layers') dock.layers.body.querySelector('.draw-layer-name')?.focus({ preventScroll: true });
      return true;
    }
    const group = groupForPanel(id); if (!group) return false;
    state.ui.flyout = group.id; if (panelAvailable(id)) state.ui.groupTabs[group.id] = id; render(); return true;
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
  // A scrub previews by applying the field's normal action, undoing the previous preview first, so the
  // drag ends as exactly one undo step. Panels re-render while dragging; `scrub` keeps the live value shown.
  let scrub = null;
  const appliedDepth = () => state.history.entries.filter(entry => entry.applied).length;
  function scrubField(key, action) {
    return (phase, value) => {
      if (phase === 'start') { scrub = { key, depth: appliedDepth(), applied: false, value }; return; }
      if (!scrub || scrub.key !== key) return;
      if (phase === 'end') { scrub = null; render(); return; }
      if (scrub.applied) { api.run(() => { while (appliedDepth() > scrub.depth && state.history.undo()); }); scrub.applied = false; }
      if (phase === 'cancel') { scrub = null; render(); return; }
      scrub.value = value; api.run(() => action(value)); scrub.applied = appliedDepth() > scrub.depth;
      if (scrub) render();
    };
  }
  function field(host, label, value, action, { type = 'number', disabled = false, min, max, key = label, step, scrubbable = true } = {}) {
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
    if (type === 'number' && scrubbable) {
      attachScrub(name,input,{ step, min, max, onScrub: scrubField(key,action) });
      if (scrub?.key === key) { input.value = String(scrub.value); input.classList.add('is-scrubbing'); }
    }
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
    const layerOf = node => node.type === 'layer' ? node : doc.ancestors(node.id).find(n => n.type === 'layer');
    const transaction = (label, commands) => state.history.transaction(label,() => commands.forEach(command => state.history.execute(command)));
    const selected = new Set(state.selection.ids), mod = isMac ? 'Cmd' : 'Ctrl';
    // Search and filter: typing only rebuilds the tree, so the field keeps focus.
    const top = document.createElement('div'); top.className = 'draw-layer-search';
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Search all'; search.className = 'draw-layer-search__input';
    search.setAttribute('aria-label','Search layers'); search.dataset.drawField = 'layer-search'; search.value = state.ui.layerQuery ?? '';
    const filter = document.createElement('select'); filter.className = 'draw-select draw-layer-search__filter'; filter.dataset.drawField = 'layer-filter';
    filter.setAttribute('aria-label','Filter layers'); filter.dataset.tooltip = 'Filter';
    for (const [value,label] of [['all','Show all'],['layers','Only layers'],['visible','Only visible'],['locked','Only locked']]) filter.append(new Option(label,value,false,value === (state.ui.layerFilter ?? 'all')));
    // Layers panel menu (≡), as in Illustrator.
    const menuButton = iconButton('Layers panel menu','menu-2',() => { state.ui.layerMenu = !state.ui.layerMenu; render(); },'draw-layer-action draw-layer-menu-button');
    menuButton.dataset.drawLayerMenu = ''; menuButton.setAttribute('aria-haspopup','menu'); menuButton.setAttribute('aria-expanded',String(!!state.ui.layerMenu));
    top.append(search,filter,menuButton); host.append(top);
    if (state.ui.layerMenu) host.append(layerMenu());
    function layerMenu() {
      const menu = document.createElement('div'); menu.className = 'draw-layer-menu'; menu.setAttribute('role','menu');
      const current = doc.getNode(state.ui.layerId)?.type === 'layer' ? doc.getNode(state.ui.layerId) : activeLayer();
      const target = api.selectedIds()[0] ? doc.getNode(api.selectedIds()[0]) : current, name = target.name || (target.type === 'layer' ? 'Layer' : `<${target.type}>`);
      const picked = [...(state.ui.pickedLayers ?? [])].filter(id => doc.getNode(id)?.type === 'layer');
      const items = [
        ['New Layer…',() => { const node = newTopLayer(); api.layerOptions(node.id); },readOnly,'new'],
        ['New Sublayer',() => { const parent = activeLayer(), node = newLayer(doc); state.ui.layerId = node.id; collapsed.delete(parent.id); state.history.execute(insertNode(parent.id,node)); },readOnly,'new-sublayer'],
        [`Duplicate "${name}"`,() => { const r = duplicateCommands(doc,target.id); transaction('Duplicate',r.commands); if (target.type === 'layer') state.ui.layerId = r.node.id; else api.select([r.node.id]); },readOnly,'duplicate'],
        [`Delete "${name}"`,() => transaction(target.type === 'layer' ? 'Delete Layer' : 'Delete',deleteRowCommands(doc,target.id)),readOnly || (target.type === 'layer' && doc.data.layers.length === 1 && doc.locate(target.id).parentId === null),'delete'],
        [`Options for "${current.name}"…`,() => api.layerOptions(current.id),readOnly,'options'],
        null,
        ['Make Clipping Mask',() => api.command('clip-make'),readOnly || api.selectedIds().length < 2,'clip'],
        ['Locate Object',() => dock.layers.body.querySelector('[data-draw-layer-action=focus-2]')?.click(),!api.selectedIds().length,'locate'],
        null,
        ['Merge Selected',() => { transaction('Merge Selected',mergeLayersCommands(doc,picked,current.id)); state.ui.pickedLayers = new Set(); },readOnly || picked.length < 2 || !picked.includes(current.id),'merge'],
        ['Flatten Artwork',() => transaction('Flatten Artwork',flattenCommands(doc)),readOnly || doc.data.layers.length < 2,'flatten'],
        ['Collect in New Layer',() => { const { layer, commands } = collectCommands(doc,api.selectedIds()); transaction('Collect in New Layer',commands); state.ui.layerId = layer.id; },readOnly || !api.selectedIds().length,'collect'],
        ['Release to Layers (Sequence)',() => transaction('Release to Layers',releaseCommands(doc,current.id).commands),readOnly,'release'],
        null,
        ['Hide Others',() => transaction('Hide Others',othersUpdates(doc,topLevel(current.id).id,'visible')),readOnly || doc.data.layers.length < 2,'hide-others'],
        ['Lock Others',() => transaction('Lock Others',othersUpdates(doc,topLevel(current.id).id,'locked')),readOnly || doc.data.layers.length < 2,'lock-others'],
      ];
      for (const entry of items) {
        if (!entry) { menu.append(Object.assign(document.createElement('hr'),{ className: 'draw-layer-menu__sep' })); continue; }
        const [label,action,disabled,key] = entry, b = document.createElement('button'); b.type = 'button'; b.className = 'draw-layer-menu__item'; b.setAttribute('role','menuitem');
        b.textContent = label; b.dataset.drawLayerMenuItem = key; b.disabled = !!disabled;
        b.addEventListener('click',() => { state.ui.layerMenu = false; api.run(action); render(); }); menu.append(b);
      }
      return menu;
    }
    let list = buildList(); host.append(list);
    const rebuild = () => { const next = buildList(); list.replaceWith(next); list = next; };
    search.addEventListener('input',() => { state.ui.layerQuery = search.value; rebuild(); });
    filter.addEventListener('change',() => { state.ui.layerFilter = filter.value; rebuild(); });
    // Bottom bar: layer count and the Illustrator actions.
    const bar = document.createElement('div'); bar.className = 'draw-layer-bar';
    const count = document.createElement('span'); count.className = 'draw-layer-count'; count.dataset.drawLayerCount = '';
    count.textContent = `${doc.data.layers.length} ${doc.data.layers.length === 1 ? 'Layer' : 'Layers'}`;
    const actions = document.createElement('div'); actions.className = 'draw-layer-actions';
    const newTopLayer = () => { const node = newLayer(doc), index = doc.locate(topLevel(activeLayer().id).id).index+1; state.ui.layerId = node.id; state.history.execute(insertNode(null,node,index)); return node; };
    for (const [label,iconId,action,disabled] of [
      ['Collect in new layer','stack-push',() => {
        const { layer, commands } = collectCommands(doc,api.selectedIds());
        transaction('Collect in New Layer',commands); state.ui.layerId = layer.id; api.select(api.selectedIds());
      },readOnly || !api.selectedIds().length],
      ['Release to layers (sequence)','stack-pop',() => transaction('Release to Layers',releaseCommands(doc,activeLayer().id).commands),readOnly],
      ['Locate object','focus-2',() => {
        const id = api.selectedIds()[0]; if (!id) return;
        state.ui.layerQuery = ''; state.ui.layerFilter = 'all';
        for (const node of doc.ancestors(id)) collapsed.delete(node.id);
        render(); const row = dock.layers.body.querySelector(`[data-draw-node="${id}"]`); row?.scrollIntoView({block:'nearest'}); row?.querySelector('.draw-layer-name')?.focus();
      },!api.selectedIds().length],
      ['Make/Release clipping mask (coming with Pathfinder)','mask',null,true],
      ['Create new sublayer','folder-plus',() => {
        const parent = activeLayer(), node = newLayer(doc);
        state.ui.layerId = node.id; collapsed.delete(parent.id); state.history.execute(insertNode(parent.id,node));
      },readOnly],
      [`Create new layer · Alt: Layer Options`,'plus',event => { const node = newTopLayer(); if (event.altKey) api.layerOptions(node.id); },readOnly],
      ['Delete selection','trash',() => {
        const ids = api.selectedIds();
        if (ids.length) transaction('Delete',ids.flatMap(id => deleteRowCommands(doc,id)));
        else transaction('Delete Layer',deleteLayerCommands(doc,activeLayer().id));
      },readOnly],
    ]) { const b = iconButton(label,iconId,action); b.disabled = !!disabled; b.dataset.drawLayerAction = iconId; actions.append(b); }
    bar.append(count,actions); host.append(bar);

    function buildList() {
      const tree = document.createElement('div'); tree.className = 'draw-layer-list'; tree.setAttribute('role','tree'); tree.setAttribute('aria-label','Layers');
      const shown = filterLayerTree(doc,state.ui.layerQuery,state.ui.layerFilter ?? 'all'), searching = !!shown;
      let thumbs = 0;
      function row(node, depth, context) {
        if (shown && !shown.has(node.id)) return;
        const own = layerContext(context,node), isLayer = node.type === 'layer';
        const item = document.createElement('div'); item.className = 'draw-layer-row'; item.style.setProperty('--depth',depth);
        item.style.setProperty('--layer-color',own.color || '#006B5C');
        item.dataset.drawNode = node.id; item.setAttribute('role','treeitem'); item.setAttribute('aria-level',String(depth+1));
        item.classList.toggle('is-active',node.id === state.ui.layerId); item.classList.toggle('is-layer',isLayer);
        item.classList.toggle('is-template',own.template); item.classList.toggle('is-dimmed',!doc.isEditable(node.id));
        item.classList.toggle('is-selected',selected.has(node.id));
        item.setAttribute('aria-selected',String(selected.has(node.id)));
        const name = node.name || (isLayer ? 'Layer' : `<${node.type}>`);
        const eye = iconButton(`Visibility: ${name}`,node.template ? 'template' : node.visible ? 'eye' : 'eye-off',event => {
          if (event.altKey && isLayer && doc.locate(node.id).parentId === null) transaction('Show Only This Layer',soloUpdates(doc,node.id).map(([id,visible]) => updateNode(id,{visible})));
          else if ((event.ctrlKey || event.metaKey) && isLayer) state.history.execute(updateNode(node.id,{preview:node.preview === false}));
          else state.history.execute(updateNode(node.id,{visible:!node.visible}));
        },'draw-layer-toggle');
        eye.setAttribute('aria-pressed',String(node.visible)); eye.dataset.drawToggle = 'visible'; eye.disabled = readOnly;
        if (isLayer) eye.dataset.tooltip += ` · Alt: show only this layer · ${mod}: Outline/Preview`;
        const lock = iconButton(`Lock: ${name}`,node.locked ? 'lock' : 'lock-open',() => state.history.execute(updateNode(node.id,{locked:!node.locked})),'draw-layer-toggle');
        lock.setAttribute('aria-pressed',String(node.locked)); lock.dataset.drawToggle = 'locked'; lock.disabled = readOnly;
        // The layer's selection color; double-click opens Layer Options at Color.
        const bar = document.createElement('button'); bar.type = 'button'; bar.className = 'draw-layer-colorbar';
        const owner = layerOf(node);
        bar.setAttribute('aria-label',`Layer color: ${owner?.name || 'Layer'}`); bar.dataset.tooltip = 'Layer color · Double-click: Layer Options';
        bar.dataset.drawLayerColor = owner?.id ?? ''; bar.disabled = readOnly || !owner;
        bar.addEventListener('dblclick',() => owner && api.layerOptions(owner.id,{focus:'color'}));
        item.append(eye,lock,bar);
        const indent = document.createElement('span'); indent.className = 'draw-layer-indent'; item.append(indent);
        const hasChildren = node.children?.length && node.type !== 'compoundPath';
        if (hasChildren) {
          const open = searching || !collapsed.has(node.id), twisty = iconButton(`${open ? 'Collapse' : 'Expand'} ${name}`,open ? 'chevron-down' : 'chevron-right',event => {
            const targets = event.altKey ? [node,...doc.descendants(node.id)].filter(n => n.children?.length) : [node];
            for (const target of targets) { if (open) collapsed.add(target.id); else collapsed.delete(target.id); }
            render();
          },'draw-layer-twisty');
          twisty.setAttribute('aria-expanded',String(open)); item.setAttribute('aria-expanded',String(open)); item.append(twisty);
        } else { const spacer = document.createElement('span'); spacer.className = 'draw-layer-twisty'; item.append(spacer); }
        const thumb = document.createElement('img'); thumb.className = 'draw-layer-thumb'; thumb.alt = ''; thumb.draggable = false;
        const url = thumbs++ < 200 ? api.thumbnail?.(node.id) : null;
        if (url) thumb.src = url; else thumb.classList.add('is-empty');
        thumb.dataset.drawThumb = node.id;
        const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'draw-layer-name'; choose.textContent = name;
        choose.dataset.tooltip = 'Double-click: rename';
        const pick = event => api.run(() => {
          const layer = layerOf(node);
          // Shift or Ctrl/Cmd-click on layers picks several (for Merge Selected); a plain click picks one.
          if (isLayer) { const set = state.ui.pickedLayers ??= new Set(); if (event.shiftKey || event.ctrlKey || event.metaKey) { if (set.has(node.id) && node.id !== state.ui.layerId) set.delete(node.id); else set.add(node.id); if (state.ui.layerId) set.add(state.ui.layerId); } else state.ui.pickedLayers = new Set([node.id]); }
          if (layer) state.ui.layerId = layer.id;
          if (isLayer) render();
          else api.select(event.shiftKey ? (selected.has(node.id) ? [...selected].filter(id => id !== node.id) : [...selected,node.id]) : [node.id]);
        });
        // A click rebuilds the list, so the second click of a double-click lands on a new row: rename by click count.
        choose.addEventListener('click',event => { pick(event); if (event.detail === 2 && !readOnly) renameRow(node.id); });
        thumb.addEventListener('click',pick);
        // A double-click that did not rebuild the list (or a keyboard/assistive dblclick) still renames.
        choose.addEventListener('dblclick',() => { if (!readOnly && choose.isConnected) rename(choose,node); });
        if (isLayer) { thumb.addEventListener('dblclick',() => api.layerOptions(node.id)); item.classList.toggle('is-picked',!!state.ui.pickedLayers?.has(node.id) && state.ui.pickedLayers.size > 1); }
        const target = iconButton(`Select ${name}`,null,event => {
          const ids = isLayer ? doc.descendants(node.id).filter(n => n.type !== 'layer' && doc.getNode(doc.locate(n.id).parentId).type === 'layer' && doc.isEditable(n.id)).map(n => n.id) : [node.id];
          api.select(event.shiftKey ? [...new Set([...selected,...ids])] : ids);
        },'draw-layer-target');
        target.classList.toggle('is-selected',selected.has(node.id) || doc.descendants(node.id).some(n => selected.has(n.id)));
        // Drag the selected-art indicator onto another layer to move the selection there.
        if (!readOnly && target.classList.contains('is-selected')) {
          target.draggable = true; target.dataset.tooltip = `Select ${name} · Drag to move the selection to another layer`;
          target.addEventListener('dragstart',event => { event.stopPropagation(); event.dataTransfer.setData('application/x-modcut-selection','1'); event.dataTransfer.effectAllowed = 'move'; });
        }
        const lastLayer = isLayer && doc.locate(node.id).parentId === null && doc.data.layers.length === 1;
        const remove = iconButton(`Delete ${name}`,'trash',() => transaction(isLayer ? 'Delete Layer' : 'Delete',deleteRowCommands(doc,node.id)),'draw-layer-toggle draw-layer-delete');
        remove.dataset.drawRowDelete = node.id; remove.disabled = readOnly || lastLayer;
        if (lastLayer) remove.dataset.tooltip = 'A document needs at least one layer';
        item.append(thumb,choose,target,remove);
        if (!readOnly) {
          item.draggable = true;
          item.addEventListener('dragstart',event => { event.dataTransfer.setData('application/x-modcut-node',node.id); event.dataTransfer.effectAllowed = 'move'; });
          const placement = event => {
            const box = item.getBoundingClientRect(), y = (event.clientY-box.top)/box.height;
            return node.children && node.type !== 'compoundPath' ? (y < .25 ? 'above' : y > .75 ? 'below' : 'inside') : (y < .5 ? 'above' : 'below');
          };
          item.addEventListener('dragover',event => {
            if (isLayer && event.dataTransfer.types.includes('application/x-modcut-selection')) { event.preventDefault(); item.dataset.drop = 'inside'; return; }
            if (!event.dataTransfer.types.includes('application/x-modcut-node')) return;
            event.preventDefault(); item.dataset.drop = placement(event);
          });
          item.addEventListener('dragleave',() => delete item.dataset.drop);
          item.addEventListener('drop',event => {
            event.preventDefault(); delete item.dataset.drop;
            if (event.dataTransfer.types.includes('application/x-modcut-selection')) {
              if (isLayer) api.run(() => { transaction('Move to Layer',moveToLayerCommands(doc,api.selectedIds(),node.id)); state.ui.layerId = node.id; api.select(api.selectedIds()); });
              return;
            }
            const id = event.dataTransfer.getData('application/x-modcut-node'), where = placement(event);
            api.run(() => { const command = id && moveCommand(doc,id,node.id,where); if (command) state.history.execute(command); });
          });
        }
        tree.append(item);
        if (hasChildren && (searching || !collapsed.has(node.id))) [...node.children].reverse().forEach(child => row(child,depth+1,own));
      }
      [...doc.data.layers].reverse().forEach(node => row(node,0,ROOT_CONTEXT));
      if (!tree.children.length) { const empty = document.createElement('p'); empty.className = 'draw-panel__hint'; empty.textContent = 'No matches'; tree.append(empty); }
      return tree;
    }
    function renameRow(id) {
      const button = [...host.querySelectorAll('.draw-layer-row')].find(row => row.dataset.drawNode === id)?.querySelector('.draw-layer-name');
      const node = state.document.getNode(id);
      if (button && node) rename(button,node);
    }
    function rename(button, node) {
      const input = document.createElement('input'); input.className = 'draw-layer-rename'; input.value = node.name; input.setAttribute('aria-label','Name');
      let done = false;
      const finish = commit => { if (done) return; done = true; if (commit && input.value !== node.name) api.run(() => state.history.execute(updateNode(node.id,{name:input.value}))); else render(); };
      // Draw's window keymap captures keydown, so Enter/blur commit through the native change event.
      input.addEventListener('change',() => finish(true));
      input.addEventListener('blur',() => finish(false));
      // Dragging inside the field selects text instead of moving the row.
      const row = button.closest('.draw-layer-row'); if (row) row.draggable = false;
      button.replaceWith(input); input.focus(); input.select();
    }
  }
  function check(host, label, key, value, onChange) {
    const row = document.createElement('label'); row.className = 'draw-check';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = value; input.dataset.drawField = key;
    input.addEventListener('change',() => onChange(input.checked)); row.append(input,document.createTextNode(label)); host.append(row); return input;
  }
  function transform(host, { compact = false } = {}) {
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
    // Properties uses Illustrator's short labels; the Transform panel names the unit.
    const unit = compact ? '' : ' (mm)';
    field(grid,`X${unit}`,point[0],value => api.transformPanel('x',value),{ disabled, key:'x', step:.1 });
    field(grid,`Y${unit}`,point[1],value => api.transformPanel('y',value),{ disabled, key:'y', step:.1 });
    field(grid,`W${unit}`,box?.width ?? 0,value => api.transformPanel('width',value),{ disabled: disabled || box.width < 1e-9, min:.001, key:'width', step:.1 });
    field(grid,`H${unit}`,box?.height ?? 0,value => api.transformPanel('height',value),{ disabled: disabled || box.height < 1e-9, min:.001, key:'height', step:.1 });
    const link = iconButton(state.ui.linkProportions ? 'Proportions linked' : 'Link proportions',state.ui.linkProportions ? 'link' : 'unlink',() => { state.ui.linkProportions = !state.ui.linkProportions; render(); },'draw-layer-action draw-transform-link');
    link.setAttribute('aria-pressed',String(!!state.ui.linkProportions)); link.dataset.drawField = 'link'; grid.append(link);
    const angles = document.createElement('div'); angles.className = 'draw-fields'; host.append(angles);
    field(angles,compact ? 'Rotate (°)' : 'Rotate by (°)',0,value => api.transformPanel('rotate',value),{ disabled, key:'rotate' });
    if (compact) {
      // Properties: rotation plus Flip buttons, as in Illustrator; Shear and the scaling options live in the Transform panel.
      const flips = document.createElement('div'); flips.className = 'draw-flip-row'; flips.setAttribute('role','group'); flips.setAttribute('aria-label','Flip');
      for (const [label,iconId,axis] of [['Flip horizontal','flip-vertical','horizontal'],['Flip vertical','flip-horizontal','vertical']]) {
        const b = iconButton(label,iconId,() => api.flip(axis),'draw-layer-action draw-align-button'); b.dataset.drawFlip = axis; b.disabled = disabled; flips.append(b);
      }
      angles.append(flips); return;
    }
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
      attachScrub(spaceName,spacing,{ step: .1, min: 0 }); spaceRow.append(spaceName,spacing); host.append(spaceRow);
    }
    text(host,!ids.length ? 'Select objects to align or distribute them.' : alignTo === 'key' ? 'The key object stays in place. Enter a spacing to use an exact gap.' : ids.length === 1 && alignTo === 'selection' ? 'A single object aligns to the active artboard.' : 'Distribute Objects needs three objects, or an artboard.');
  }
  function currentPaint(kind) {
    const node = state.document.getNode(api.paintIds()[0]);
    if (!node) return state.ui[kind];
    return paintHex(kind === 'fill' ? node.appearance.fills[0] : node.appearance.strokes[0]);
  }
  function remember(target) { const hex = currentPaint(target); if (hex) state.ui.recentColors = rememberColor(state.ui.recentColors,hex); }
  function paintTargets(host, target) {
    const targets = document.createElement('div'); targets.className = 'draw-segmented'; targets.setAttribute('role','group'); targets.setAttribute('aria-label','Color target');
    for (const kind of ['fill','stroke']) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-segmented__option'; b.textContent = kind === 'fill' ? 'Fill' : 'Stroke';
      b.dataset.drawPaintTarget = kind; b.setAttribute('aria-pressed',String(kind === target));
      b.addEventListener('click',() => api.paintFocus(kind)); targets.append(b);
    }
    host.append(targets);
  }
  function chip(hex, label, onPick, { pressed = false, none = false } = {}) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-swatch'; b.setAttribute('aria-label',label); b.dataset.tooltip = label;
    if (none) b.classList.add('is-none'); else b.style.setProperty('--swatch',hex);
    b.setAttribute('aria-pressed',String(pressed)); b.disabled = state.document.readOnly;
    b.addEventListener('click',event => api.run(() => onPick(event))); return b;
  }
  function recentColors(host, target) {
    const recent = state.ui.recentColors ?? [];
    const title = document.createElement('h3'); title.className = 'draw-panel__section'; title.textContent = 'Recent Colors'; host.append(title);
    const row = document.createElement('div'); row.className = 'draw-swatch-row'; row.dataset.drawRecent = '';
    if (!recent.length) { const p = document.createElement('span'); p.className = 'draw-panel__hint'; p.textContent = 'Colors you apply appear here.'; row.append(p); }
    for (const hex of recent) { const b = chip(hex,hex,() => api.paint(target,hex)); b.dataset.drawRecentColor = hex; row.append(b); }
    host.append(row);
  }
  function swatchesPanel(host) {
    const target = state.ui.paintFocus === 'stroke' ? 'stroke' : 'fill', current = currentPaint(target), doc = state.document;
    const list = documentSwatches(doc.data), view = state.ui.swatchView ?? 'grid', readOnly = doc.readOnly;
    const setSwatches = (label, swatches) => state.history.transaction(label,() => state.history.execute(updateDocument({ swatches })));
    paintTargets(host,target);
    const tools = document.createElement('div'); tools.className = 'draw-swatch-tools';
    const none = chip(null,`None (${target})`,() => api.paint(target,null),{ none: true, pressed: !current }); none.dataset.drawSwatch = 'none';
    const views = document.createElement('div'); views.className = 'draw-swatch-views';
    for (const [id,label,iconId] of [['list','List view','list'],['grid','Grid view','layout-grid']]) {
      const b = iconButton(label,iconId,() => { state.ui.swatchView = id; render(); }); b.setAttribute('aria-pressed',String(view === id)); b.dataset.drawSwatchView = id; views.append(b);
    }
    tools.append(none,views); host.append(tools);
    recentColors(host,target);
    for (const group of groupSwatches(list)) {
      const title = document.createElement('h3'); title.className = 'draw-panel__section'; title.textContent = group.name; host.append(title);
      const box = document.createElement('div'); box.className = view === 'list' ? 'draw-swatch-list' : 'draw-swatch-row'; box.dataset.drawSwatchGroup = group.name;
      for (const s of group.swatches) {
        const b = chip(s.hex,`${s.name} ${s.hex}`,() => { state.ui.swatchId = s.id; api.paint(target,s.hex); render(); },{ pressed: s.hex === current });
        b.classList.toggle('is-chosen',state.ui.swatchId === s.id);
        b.dataset.drawSwatch = s.id;
        if (view === 'list') { const name = document.createElement('span'); name.textContent = s.name; const code = document.createElement('code'); code.textContent = s.hex; b.append(name,code); }
        b.addEventListener('dblclick',() => api.run(() => swatchOptions(s)));
        box.append(b);
      }
      host.append(box);
    }
    const bar = document.createElement('div'); bar.className = 'draw-layer-bar draw-swatch-bar';
    const count = document.createElement('span'); count.className = 'draw-layer-count'; count.textContent = `${list.length} swatches`;
    const actions = document.createElement('div'); actions.className = 'draw-layer-actions';
    const add = iconButton(`New swatch from the current ${target} color`,'square-plus',() => {
      const { swatches, created } = addSwatch(doc.data,currentPaint(target),'',createId);
      setSwatches('New Swatch',swatches); state.ui.swatchId = created.id;
    }); add.dataset.drawSwatchAction = 'new'; add.disabled = readOnly || !current;
    const selectedSwatch = list.find(s => s.id === state.ui.swatchId);
    const remove = iconButton('Delete swatch','trash',() => { setSwatches('Delete Swatch',removeSwatch(doc.data,state.ui.swatchId)); state.ui.swatchId = null; });
    remove.dataset.drawSwatchAction = 'delete'; remove.disabled = readOnly || !selectedSwatch;
    actions.append(add,remove); bar.append(count,actions); host.append(bar);
    text(host,'Click a swatch to apply it to the ' + target + '. Double-click to rename or change it.');
    async function swatchOptions(s) {
      const values = await api.swatchOptions(s); if (!values) return;
      api.run(() => setSwatches('Swatch Options',editSwatch(state.document.data,s.id,values)));
    }
  }
  const BLEND_MODES = [['normal','Normal'],['darken','Darken'],['multiply','Multiply'],['color-burn','Color Burn'],['lighten','Lighten'],['screen','Screen'],['color-dodge','Color Dodge'],
    ['overlay','Overlay'],['soft-light','Soft Light'],['hard-light','Hard Light'],['difference','Difference'],['exclusion','Exclusion'],['hue','Hue'],['saturation','Saturation'],['color','Color'],['luminosity','Luminosity']];
  function transparencyPanel(host) {
    const ids = api.selectedIds(), node = state.document.getNode(ids[0]), disabled = !ids.length || state.document.readOnly;
    const mixed = key => ids.some(id => state.document.getNode(id)?.[key] !== node?.[key]);
    const set = (label, patch) => state.history.transaction(label,() => { for (const id of api.selectedIds()) state.history.execute(updateNode(id,patch)); });
    const row = document.createElement('label'); row.className = 'draw-field';
    const name = document.createElement('span'); name.textContent = 'Blending mode';
    const select = document.createElement('select'); select.className = 'draw-select'; select.dataset.drawField = 'blend-mode'; select.disabled = disabled;
    if (node && mixed('blendMode')) select.append(new Option('Mixed','',true,true));
    for (const [value,label] of BLEND_MODES) select.append(new Option(label,value,false,!mixed('blendMode') && (node?.blendMode ?? 'normal') === value));
    select.addEventListener('change',() => { if (select.value) api.run(() => set('Blending Mode',{ blendMode: select.value })); });
    row.append(name,select); host.append(row);
    const opacity = field(host,'Opacity (%)',(node?.opacity ?? 1)*100,value => set('Opacity',{ opacity: value/100 }),{ min:0, max:100, step:1, disabled, key:'transparency-opacity' });
    if (node && mixed('opacity')) { opacity.value = ''; opacity.placeholder = 'Mixed'; }
    const masks = document.createElement('div'); masks.className = 'draw-transparency-masks';
    const make = button('Make Mask',() => {}); make.disabled = true; make.dataset.tooltip = 'Opacity masks arrive in D4.3'; masks.append(make);
    for (const label of ['Clip','Invert Mask']) { const c = document.createElement('label'); c.className = 'draw-check'; const i = document.createElement('input'); i.type = 'checkbox'; i.disabled = true; c.append(i,document.createTextNode(label)); masks.append(c); }
    host.append(masks);
    text(host,ids.length ? 'Applies to the whole selected object. Fill and stroke opacity are set per entry in Appearance (coming).' : 'Select artwork to change its blending mode and opacity.');
  }
  function pathfinderPanel(host) {
    const count = api.selectedIds().filter(id => state.document.isEditable(id)).length, disabled = count < 2 || state.document.readOnly;
    for (const [title,ops] of [['Shape Modes',SHAPE_MODES],['Pathfinders',PATHFINDERS]]) {
      const h = document.createElement('h3'); h.className = 'draw-panel__section'; h.textContent = title; host.append(h);
      const row = document.createElement('div'); row.className = 'draw-align-row draw-pathfinder-row'; row.setAttribute('role','group'); row.setAttribute('aria-label',title);
      for (const op of ops) {
        const b = iconButton(PATHFINDER_LABELS[op],null,() => api.pathfinder(op),'draw-layer-action draw-align-button');
        b.append(pathfinderIcon(op)); b.dataset.drawPathfinder = op; b.disabled = disabled; row.append(b);
      }
      if (title === 'Shape Modes') { const expand = button('Expand',() => {}); expand.disabled = true; expand.dataset.tooltip = 'Compound shapes (Alt-click) arrive later; results are already expanded paths.'; row.append(expand); }
      host.append(row);
    }
    text(host,disabled ? 'Select two or more paths, shapes or groups.' : 'Results keep their curves. Divide, Trim, Merge, Crop and Outline group the pieces. One undo step each.');
  }
  function appearancePanel(host) {
    const ids = api.paintIds(), node = state.document.getNode(ids[0]), readOnly = state.document.readOnly;
    const head = document.createElement('div'); head.className = 'draw-appearance-head';
    head.textContent = !node ? 'No Selection' : ids.length > 1 ? `${ids.length} objects` : (node.name || (node.type === 'shape' ? `<${node.shape}>` : '<Path>'));
    host.append(head);
    if (!node) { text(host,'Select a path or shape to see and edit its fills and strokes. New shapes use the Fill and Stroke boxes.'); return; }
    if (ids.length > 1) { text(host,'Select a single object to edit its appearance stack.'); return; }
    const look = node.appearance, chosen = state.ui.appearanceEntry?.id === node.id ? state.ui.appearanceEntry : null;
    const commit = (label, next, select) => {
      state.history.execute(updateNode(node.id,{ appearance: next },{ label }));
      state.ui.appearanceEntry = select ? { id: node.id, ...select } : null; render();
    };
    const list = document.createElement('div'); list.className = 'draw-appearance-list'; list.setAttribute('role','list'); list.setAttribute('aria-label','Appearance');
    for (const { kind, index, entry } of appearanceRows(look)) {
      const isStroke = kind === 'strokes', label = isStroke ? 'Stroke' : 'Fill';
      const row = document.createElement('div'); row.className = 'draw-appearance-row'; row.setAttribute('role','listitem');
      row.dataset.drawAppearance = `${kind}-${index}`; row.classList.toggle('is-hidden',!!entry.hidden);
      row.classList.toggle('is-chosen',chosen?.kind === kind && chosen?.index === index);
      const eye = iconButton(`${entry.hidden ? 'Show' : 'Hide'} ${label.toLowerCase()}`,entry.hidden ? 'eye-off' : 'eye',() => commit(entry.hidden ? `Show ${label}` : `Hide ${label}`,toggleEntry(look,kind,index),{ kind, index }),'draw-layer-toggle');
      eye.dataset.drawAppearanceToggle = ''; eye.disabled = readOnly;
      const name = document.createElement('button'); name.type = 'button'; name.className = 'draw-appearance-name'; name.textContent = `${label}:`;
      name.addEventListener('click',() => { state.ui.appearanceEntry = { id: node.id, kind, index }; render(); });
      const swatch = document.createElement('input'); swatch.type = 'color'; swatch.className = 'draw-appearance-color'; swatch.value = (paintHex(entry) ?? '#ffffff').toLowerCase();
      swatch.setAttribute('aria-label',`${label} color`); swatch.dataset.drawField = `appearance-${kind}-${index}-color`; swatch.disabled = readOnly;
      swatch.addEventListener('change',() => api.run(() => commit(`${label} Color`,patchEntry(look,kind,index,{ paint: { type: 'solid', color: { space: 'rgb', values: [1,3,5].map(i => parseInt(swatch.value.slice(i,i+2),16)/255) } } }),{ kind, index })));
      row.append(eye,name,swatch);
      if (isStroke) {
        const width = document.createElement('label'); width.className = 'draw-appearance-width';
        const unit = document.createElement('span'); unit.textContent = 'mm';
        const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = 'any'; input.value = String(Number((entry.width ?? 0).toFixed(3)));
        input.dataset.drawField = `appearance-strokes-${index}-width`; input.setAttribute('aria-label','Stroke weight (mm)'); input.disabled = readOnly;
        const apply = value => commit('Stroke Weight',patchEntry(look,kind,index,{ width: value }),{ kind, index });
        input.addEventListener('change',() => api.run(() => { if (!(input.valueAsNumber >= 0)) throw new Error('Enter a valid stroke weight.'); apply(input.valueAsNumber); }));
        attachScrub(unit,input,{ step: .05, min: 0, onScrub: scrubField(`appearance-strokes-${index}-width`,apply) });
        width.append(input,unit); row.append(width);
      }
      if (entry.opacity !== undefined && entry.opacity < 1) { const o = document.createElement('span'); o.className = 'draw-appearance-opacity'; o.textContent = `${Math.round(entry.opacity*100)}%`; row.append(o); }
      if (!readOnly) {
        row.draggable = true;
        row.addEventListener('dragstart',event => { event.dataTransfer.setData('application/x-modcut-appearance',`${kind}:${index}`); event.dataTransfer.effectAllowed = 'move'; });
        row.addEventListener('dragover',event => { if (event.dataTransfer.types.includes('application/x-modcut-appearance')) { event.preventDefault(); row.dataset.drop = 'true'; } });
        row.addEventListener('dragleave',() => delete row.dataset.drop);
        row.addEventListener('drop',event => {
          event.preventDefault(); delete row.dataset.drop;
          const [fromKind,from] = event.dataTransfer.getData('application/x-modcut-appearance').split(':');
          if (fromKind !== kind) return api.run(() => { throw new Error('Fills and strokes reorder within their own kind.'); });
          api.run(() => { const moved = moveEntry(look,kind,Number(from),index); commit('Reorder Appearance',moved.appearance,{ kind, index: moved.index }); });
        });
      }
      list.append(row);
    }
    if (!list.children.length) { const empty = document.createElement('p'); empty.className = 'draw-panel__hint'; empty.textContent = 'No fill and no stroke.'; list.append(empty); }
    host.append(list);
    const opacity = document.createElement('button'); opacity.type = 'button'; opacity.className = 'draw-appearance-name draw-appearance-opacity-row';
    opacity.textContent = `Opacity: ${node.opacity === 1 ? 'Default' : `${Math.round(node.opacity*100)}%`}${node.blendMode !== 'normal' ? ` ${node.blendMode}` : ''}`;
    opacity.dataset.drawOpen = 'transparency'; opacity.addEventListener('click',() => open('transparency')); host.append(opacity);
    const bar = document.createElement('div'); bar.className = 'draw-layer-bar draw-swatch-bar';
    const actions = document.createElement('div'); actions.className = 'draw-layer-actions';
    const pick = chosen && look[chosen.kind]?.[chosen.index] ? chosen : null;
    for (const [label,iconId,action,disabled,key] of [
      ['Add New Stroke','border-outer',() => { const r = addEntry(look,'strokes',{ color: state.ui.stroke || '#071411', width: state.ui.strokeWidth }); commit('Add New Stroke',r.appearance,{ kind:'strokes', index:r.index }); },readOnly,'add-stroke'],
      ['Add New Fill','square-rounded-plus',() => { const r = addEntry(look,'fills',{ color: state.ui.fill || '#FFFFFF' }); commit('Add New Fill',r.appearance,{ kind:'fills', index:r.index }); },readOnly,'add-fill'],
      ['Add New Effect (coming with live effects)','math-function',null,true,'add-effect'],
      ['Clear Appearance','ban',() => commit('Clear Appearance',clearAppearance(look),null),readOnly || !(look.fills.length || look.strokes.length),'clear'],
      ['Duplicate Selected Item','copy',() => { const r = duplicateEntry(look,pick.kind,pick.index); commit('Duplicate Appearance',r.appearance,{ kind:pick.kind, index:r.index }); },readOnly || !pick,'duplicate'],
      ['Delete Selected Item','trash',() => commit('Delete Appearance',removeEntry(look,pick.kind,pick.index),null),readOnly || !pick,'delete'],
    ]) { const b = iconButton(label,iconId,action); b.disabled = disabled; b.dataset.drawAppearanceAction = key; actions.append(b); }
    bar.append(document.createElement('span'),actions); host.append(bar);
    text(host,'The top row draws on top. Drag rows to reorder fills or strokes. Click a row name to choose it for Duplicate and Delete.');
  }
  function colorPanel(host) {
    const target = state.ui.paintFocus === 'stroke' ? 'stroke' : 'fill', mode = state.ui.colorMode ?? 'rgb', hex = currentPaint(target);
    const disabled = state.document.readOnly, shown = hex || '#FFFFFF', live = `color-${target}`;
    paintTargets(host,target);
    const top = document.createElement('div'); top.className = 'draw-color-top'; host.append(top);
    const swatch = document.createElement('input'); swatch.type = 'color'; swatch.className = 'draw-color-swatch'; swatch.value = shown.toLowerCase();
    swatch.setAttribute('aria-label',`${target === 'fill' ? 'Fill' : 'Stroke'} color picker`); swatch.dataset.drawField = 'color-picker'; swatch.dataset.live = 'true'; swatch.disabled = disabled;
    swatch.classList.toggle('is-none',!hex);
    swatch.addEventListener('input',() => { liveEdit = true; }); swatch.addEventListener('input',() => api.run(() => api.paint(target,swatch.value.toUpperCase(),{ mergeKey: live })));
    swatch.addEventListener('change',() => { liveEdit = false; remember(target); render(); });
    const none = button('None',() => api.paint(target,null)); none.dataset.drawField = 'color-none'; none.disabled = disabled; none.setAttribute('aria-pressed',String(!hex));
    const modeSelect = document.createElement('select'); modeSelect.className = 'draw-select'; modeSelect.dataset.drawField = 'color-mode'; modeSelect.setAttribute('aria-label','Color mode');
    for (const [value,spec] of Object.entries(COLOR_MODES)) modeSelect.append(new Option(spec.name,value,false,value === mode));
    modeSelect.addEventListener('change',() => { state.ui.colorMode = modeSelect.value; render(); });
    top.append(swatch,modeSelect,none);
    recentColors(host,target);
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
      range.addEventListener('change',() => { liveEdit = false; remember(target); render(); });
      number.addEventListener('change',() => { range.value = number.value; apply(null); });
      attachScrub(name,number,{ step: mode === 'rgb' ? 1 : .1, min: 0, max, onScrub: (phase,value) => { if (phase === 'move') { range.value = String(value); apply(live); } else if (phase === 'end') { remember(target); render(); } else if (phase === 'cancel') { number.value = String(values[i]); range.value = String(values[i]); apply(live); render(); } } });
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
    const send=button('Send to Cut…',()=>api.command('send-to-cut'));send.className='btn btn--primary btn--sm draw-send-button';send.dataset.drawSendToCut='';host.append(send);
  }
  const TYPE_NAMES = { path: 'Path', group: 'Group', compoundPath: 'Compound Path', image: 'Image', text: 'Text', layer: 'Layer' };
  function selectionTitle(ids) {
    if (!ids.length) return 'No Selection';
    if (ids.length > 1) return `${ids.length} objects`;
    const node = state.document.getNode(ids[0]);
    return node?.type === 'shape' ? { rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star', line: 'Line' }[node.shape] ?? 'Shape' : TYPE_NAMES[node?.type] ?? 'Object';
  }
  function section(host, title) { const h = document.createElement('h3'); h.className = 'draw-panel__section draw-prop-section'; h.textContent = title; host.append(h); }
  function quickActions(host, actions) {
    const row = document.createElement('div'); row.className = 'draw-quick-actions'; row.setAttribute('aria-label','Quick actions');
    for (const [label,action,key,disabled] of actions) { const b = button(label,action); b.dataset.drawQuick = key; b.disabled = !!disabled; row.append(b); }
    host.append(row);
  }
  function documentProperties(host) {
    const doc = state.document.data, board = api.artboards.active();
    const h = document.createElement('h3'); h.className = 'draw-panel__section'; h.textContent = 'Document'; host.append(h);
    const info = document.createElement('dl'); info.className = 'draw-doc-info';
    for (const [term,value] of [['Artboard',`${board.name} · ${Number(board.width.toFixed(2))} × ${Number(board.height.toFixed(2))} mm`],['Artboards',String(doc.artboards.length)],['Units',doc.units ?? 'mm'],['Raster effects',`${doc.rasterEffectsPpi ?? 300} ppi`]]) {
      const dt = document.createElement('dt'); dt.textContent = term; const dd = document.createElement('dd'); dd.textContent = value; info.append(dt,dd);
    }
    host.append(info);
    check(host,'Smart Guides','smart-guides',doc.settings.smartGuides !== false,() => api.run(() => api.command('smart-guides')));
    quickActions(host,[['Artboards…',() => open('artboards'),'artboards'],['Swatches…',() => open('swatches'),'swatches'],['Layer Options…',() => api.layerOptions(state.ui.layerId ?? doc.layers.at(-1).id),'layer-options',state.document.readOnly],['Send to Cut…',() => api.command('send-to-cut'),'send-to-cut']]);
    text(host,'Fill and Stroke for new shapes are set with the boxes below the drawing tools.');
  }
  function propertiesPanel(host) {
    const ids = api.selectedIds(), title = document.createElement('div'); title.className = 'draw-appearance-head'; title.dataset.drawSelectionTitle = '';
    title.textContent = selectionTitle(ids); host.append(title);
    if (!ids.length) return documentProperties(host);
    const node = state.document.getNode(ids[0]);
    if (ids.length === 1) field(host,'Name',node.name,value => state.history.execute(updateNode(node.id,{name:value})),{type:'text'});
    if (node.type === 'text') { section(host,'Character'); characterPanel(host,{ compact: true, prefix: 'prop-' }); section(host,'Paragraph'); paragraphPanel(host,{ prefix: 'prop-' }); }
    if (ids.length === 1 && node.type === 'text') {
      section(host,'Type'); quickActions(host,[['Edit Text…',() => api.command('edit-text'),'edit-text',state.document.readOnly || !state.document.isEditable(node.id)],['Create Outlines',()=>api.command('create-outlines'),'create-outlines',state.document.readOnly || !state.document.isEditable(node.id)]]);
    }
    section(host,'Transform'); transform(host,{ compact: true });
    // Appearance: the same fill, stroke, weight and opacity Illustrator shows; the buttons open the full panels.
    section(host,'Appearance');
    const painted = state.document.getNode(api.paintIds()[0]), ro = state.document.readOnly;
    if (painted) {
      const summary = document.createElement('div'); summary.className = 'draw-appearance'; summary.setAttribute('aria-label','Appearance');
      // A gradient shows as its bar and opens the Gradient panel.
      const paintOf = kind => (kind === 'fill' ? painted.appearance.fills : painted.appearance.strokes)[0]?.paint;
      const grads = { fill: isGradient(paintOf('fill')) ? paintOf('fill') : null, stroke: isGradient(paintOf('stroke')) ? paintOf('stroke') : null };
      const fill = paintHex(painted.appearance.fills[0]), stroke = paintHex(painted.appearance.strokes[0]) ?? (grads.stroke ? colorHex(grads.stroke.stops[0].color) : null), weight = painted.appearance.strokes[0]?.width;
      for (const [kind,label,value,panel] of [['fill','Fill',fill,grads.fill ? 'gradient' : 'color'],['stroke','Stroke',stroke,grads.stroke ? 'gradient' : 'color'],['weight','Weight',stroke ? `${Number(weight.toFixed(3))} mm` : '—','stroke']]) {
        const line = document.createElement('div'); line.className = 'draw-appearance__line';
        if (kind !== 'weight') {
          const picker = document.createElement('input'); picker.type = 'color'; picker.className = 'draw-appearance-color'; picker.value = (value ?? '#ffffff').toLowerCase();
          picker.setAttribute('aria-label',`${label} color`); picker.dataset.drawField = `prop-${kind}`; picker.disabled = ro;
          picker.addEventListener('change',() => api.run(() => api.paint(kind,picker.value.toUpperCase())));
          line.append(picker);
        } else {
          const w = document.createElement('label'); w.className = 'draw-appearance-width';
          const unit = document.createElement('span'); unit.textContent = 'mm';
          const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = 'any'; input.value = String(Number((weight ?? 0).toFixed(3)));
          input.dataset.drawField = 'prop-stroke-weight'; input.setAttribute('aria-label','Stroke weight (mm)'); input.disabled = ro || !stroke;
          const apply = v => api.paint('width',v);
          input.addEventListener('change',() => api.run(() => { if (!(input.valueAsNumber >= 0)) throw new Error('Enter a valid stroke weight.'); apply(input.valueAsNumber); }));
          attachScrub(unit,input,{ step: .05, min: 0, onScrub: scrubField('prop-stroke-weight',apply) });
          w.append(input,unit); line.append(w);
        }
        const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-appearance__item'; b.dataset.drawOpen = kind;
        const chip = document.createElement('span'); chip.className = 'draw-appearance__chip'; chip.setAttribute('aria-hidden','true');
        const grad = kind === 'weight' ? null : grads[kind];
        if (grad) chip.style.background = gradientCss(grad);
        else if (kind !== 'weight') { chip.style.setProperty('--paint-color',value || 'transparent'); chip.classList.toggle('is-none',!value); } else chip.classList.add('is-weight');
        const name = document.createElement('span'); name.textContent = kind === 'weight' ? `${label} ${value}` : grad ? `${label} ${grad.type === 'radial' ? 'radial' : 'linear'} gradient` : `${label} ${value ?? 'none'}`;
        b.setAttribute('aria-label',`${name.textContent}: open ${{ color: 'Color', stroke: 'Stroke', gradient: 'Gradient' }[panel]} panel`);
        b.addEventListener('click',() => { if (kind !== 'weight') state.ui.paintFocus = kind; open(panel); if (kind !== 'weight') api.paintFocus(kind); });
        b.append(chip,name); line.append(b); summary.append(line);
      }
      host.append(summary);
    }
    const opacity = state.document.getNode(api.selectedIds()[0])?.opacity ?? 1;
    field(host,'Opacity (%)',opacity*100,value => state.history.transaction('Opacity',() => {
      for (const id of api.selectedIds()) state.history.execute(updateNode(id,{opacity:value/100}));
    }),{min:0,max:100,disabled:!api.selectedIds().length,key:'opacity'});
    const corners=api.cornerInfo?.();
    if (corners || node?.type === 'shape') section(host,node?.type === 'shape' ? selectionTitle([node.id]) : 'Corners');
    if(corners){
      const input=field(host,'Corner radius (mm)',corners.radius??0,value=>api.setCornerRadius(value),{min:0,key:'corner-radius'});
      if(corners.radius===null){input.value='';input.placeholder='Mixed';}
      text(host,`${corners.count} editable corner${corners.count===1?'':'s'}. Drag the dotted circles, or enter a radius. Alt-drag edits one corner.`);
    }else if(node?.type==='shape') {
      const editable=node.shape==='rect' ? [['cornerRadius','Corner radius (mm)',0]] : node.shape==='polygon' ? [['sides','Sides',3]] : node.shape==='star' ? [['points','Points',2],['innerRadius','Inner radius (mm)',0],['outerRadius','Outer radius (mm)',0]] : node.shape==='ellipse' ? [['startAngle','Pie start (°)',-360],['endAngle','Pie end (°)',-360]] : [];
      for(const [key,label,min] of editable)field(host,label,node.params[key]??({sides:6,points:5,endAngle:360}[key] || 0),value=>state.history.execute(updateNode(node.id,{params:{...node.params,[key]:value}})),{min,max:['sides','points'].includes(key)?100:undefined,key:`shape-${key}`});
    }
    section(host,'Align');
    const alignRow = document.createElement('div'); alignRow.className = 'draw-align-row'; alignRow.setAttribute('role','group'); alignRow.setAttribute('aria-label','Align objects');
    for (const [label,iconId,mode] of [['Horizontal align left','layout-align-left','left'],['Horizontal align center','layout-align-center','centerX'],['Horizontal align right','layout-align-right','right'],
      ['Vertical align top','layout-align-top','top'],['Vertical align center','layout-align-middle','centerY'],['Vertical align bottom','layout-align-bottom','bottom']]) {
      const b = iconButton(label,iconId,() => api.alignPanel('align',mode),'draw-layer-action draw-align-button'); b.dataset.drawPropAlign = mode; b.disabled = state.document.readOnly; alignRow.append(b);
    }
    host.append(alignRow);
    if (ids.length === 1 && (state.ui.alignTo ?? 'selection') === 'selection') text(host,'A single object aligns to the artboard.');
    const shapes = ids.filter(id => state.document.getNode(id)?.type === 'shape' && state.document.isEditable(id));
    const groups = ids.filter(id => state.document.getNode(id)?.type === 'group');
    const images = ids.filter(id => state.document.getNode(id)?.type === 'image');
    if (images.length) quickActions(host,[['Use as Template',() => api.command('use-as-template'),'use-as-template',ro]]);
    quickActions(host,[
      ['Group',() => api.command('group'),'group',ro],
      ['Ungroup',() => api.command('ungroup'),'ungroup',ro || !groups.length],
      ['Bring to Front',() => api.command('bring-front'),'bring-front',ro],['Send to Back',() => api.command('send-back'),'send-back',ro],
      ['Expand Shape',() => api.expandShapes(shapes),'expand-shape',!shapes.length || ro],
      ['Transform…',() => open('transform'),'transform'],['Align…',() => open('align'),'align'],
      ['Pathfinder…',() => open('pathfinder'),'pathfinder',ids.length < 2],['Appearance…',() => open('appearance'),'appearance'],
    ]);
  }
  const WEIGHTS = ['normal','bold',100,200,300,400,500,600,700,800,900];
  const selectedText = () => api.selectedIds().map(id => state.document.getNode(id)).filter(n => n?.type === 'text');
  /** Character: font, weight, style, size, leading, tracking and All Caps for the selected text. Each change is one undo step. */
  function characterPanel(host, { compact = false, prefix = '' } = {}) {
    const nodes = selectedText(), node = nodes[0];
    if (!node) { text(host,'Select text to change its character settings. New text uses the last settings you applied.'); return; }
    const v = textValues(node), ro = state.document.readOnly || nodes.some(n => !state.document.isEditable(n.id)), set = (changes,label) => api.textStyle(changes,label);
    const families = api.fontFamilies(), listId = 'draw-font-families';
    let list = document.getElementById(listId);
    if (!list) { list = document.createElement('datalist'); list.id = listId; document.body.append(list); }
    if (list.childElementCount !== families.length) list.replaceChildren(...families.map(f => new Option(f)));
    const family = field(host,'Font',v.fontFamily,value => {
      if (!value.trim()) throw new Error('Enter a font family.');
      if (families.length && !families.includes(value)) throw new Error(`“${value}” is not installed. Choose an installed font, or use Edit Text for Google Fonts.`);
      set({ fontFamily: value, fontSource: 'system' },'Font');
    },{ type:'text', key:`${prefix}font-family`, disabled: ro });
    family.setAttribute('list',listId); family.title = v.fontSource === 'google' ? 'Google font. Choose an installed font here, or another Google font in Edit Text.' : '';
    const styles = document.createElement('div'); styles.className = 'draw-fields'; host.append(styles);
    const select = (parent, label, key, value, options, onChange) => {
      const row = document.createElement('label'); row.className = 'draw-field'; const name = document.createElement('span'); name.textContent = label;
      const input = document.createElement('select'); input.className = 'select'; input.dataset.drawField = key; input.disabled = ro;
      for (const [optionValue,optionLabel] of options) input.append(new Option(optionLabel,String(optionValue)));
      input.value = String(value); input.addEventListener('change',() => api.run(() => onChange(input.value))); row.append(name,input); parent.append(row); return input;
    };
    select(styles,'Weight',`${prefix}font-weight`,v.fontWeight,WEIGHTS.map(w => [w,typeof w === 'number' ? String(w) : w[0].toUpperCase()+w.slice(1)]),
      value => set({ fontWeight: ['normal','bold'].includes(value) ? value : Number(value) },'Font Weight'));
    select(styles,'Style',`${prefix}font-style`,v.fontStyle,[['normal','Normal'],['italic','Italic']],value => set({ fontStyle: value },'Font Style'));
    const sizes = document.createElement('div'); sizes.className = 'draw-fields'; host.append(sizes);
    field(sizes,compact ? 'Size' : 'Size (pt)',v.fontSize,value => set({ fontSize: value },'Font Size'),{ min:.1, max:10000, key:`${prefix}font-size`, disabled: ro, scrubbable: false });
    field(sizes,compact ? 'Leading' : 'Leading (pt)',v.leading,value => set({ leading: value },'Leading'),{ min:.1, max:10000, key:`${prefix}leading`, disabled: ro, scrubbable: false });
    field(sizes,'Tracking',v.tracking ?? 0,value => set({ tracking: value },'Tracking'),{ min:-1000, max:10000, key:`${prefix}tracking`, disabled: ro, scrubbable: false });
    const caps = check(host,'All Caps',`${prefix}all-caps`,!!v.allCaps,value => set({ allCaps: value },'All Caps')); caps.disabled = ro;
    if (!compact) text(host,'Sizes and leading are in points. Tracking is in thousandths of an em. Changes are shaped again with the font, so export, outlines and Send to Cut follow.');
  }
  /** Paragraph: alignment of the selected text (lines in point and area text, the run along a path). */
  function paragraphPanel(host, { prefix = '' } = {}) {
    const nodes = selectedText(), node = nodes[0];
    if (!node) { text(host,'Select text to change its paragraph settings.'); return; }
    const ro = state.document.readOnly || nodes.some(n => !state.document.isEditable(n.id)), current = node.paragraph.alignment ?? 'left';
    const row = document.createElement('div'); row.className = 'draw-align-row'; row.setAttribute('role','group'); row.setAttribute('aria-label','Paragraph alignment');
    for (const [label,iconId,value] of [['Align left','align-left','left'],['Align center','align-center','center'],['Align right','align-right','right']]) {
      const b = iconButton(label,iconId,() => api.textStyle({ alignment: value },'Paragraph Alignment'),'draw-layer-action draw-align-button');
      b.dataset.drawParagraph = `${prefix}${value}`; b.setAttribute('aria-pressed',String(current === value)); b.disabled = ro; row.append(b);
    }
    host.append(row);
    if (node.kind === 'onPath') text(host,'On a path, alignment places the text between the start offset and the end of the path.');
  }
  /** Gradient: type, angle, stops (colour, location, opacity), add, delete and reverse, on the focused fill or stroke. */
  function gradientPanel(host) {
    const target = state.ui.paintFocus === 'stroke' ? 'stroke' : 'fill', ro = state.document.readOnly;
    paintTargets(host,target);
    const node = state.document.getNode(api.paintIds()[0]);
    if (!node) { text(host,'Select artwork to give its fill or stroke a gradient.'); return; }
    const entry = (target === 'fill' ? node.appearance.fills : node.appearance.strokes)[0], g = isGradient(entry?.paint) ? entry.paint : null;
    if (!g) {
      const apply = button(`Apply Gradient to ${target === 'fill' ? 'Fill' : 'Stroke'}`,() => api.command('paint-gradient')); apply.dataset.drawGradientApply = ''; apply.disabled = ro; host.append(apply);
      text(host,'Applies the last gradient you used, or white to black, across each selected object.'); return;
    }
    const edit = (fn, label, mergeKey = null) => api.gradient(target,fn,{ label, mergeKey });
    const row = document.createElement('div'); row.className = 'draw-fields'; host.append(row);
    const typeRow = document.createElement('label'); typeRow.className = 'draw-field'; const typeName = document.createElement('span'); typeName.textContent = 'Type';
    const type = document.createElement('select'); type.className = 'select'; type.dataset.drawField = 'gradient-type'; type.disabled = ro;
    for (const [value,label] of [['linear','Linear'],['radial','Radial']]) type.append(new Option(label,value));
    type.value = g.type; type.addEventListener('change',() => api.run(() => edit((current,box) => setGradientType(current,type.value,box),'Gradient Type')));
    typeRow.append(typeName,type); row.append(typeRow);
    if (g.type === 'linear') field(row,'Angle (°)',g.angle,value => edit((current,box) => setGradientAngle(current,value,box),'Gradient Angle'),{ min:-360, max:360, key:'gradient-angle', disabled: ro });
    // The gradient bar with one marker per stop; the selected stop is edited below.
    const stops = g.stops, selected = Math.min(state.ui.gradientStop ?? 0, stops.length - 1);
    const bar = document.createElement('div'); bar.className = 'draw-gradient-bar'; bar.style.background = gradientCss(g); bar.setAttribute('role','group'); bar.setAttribute('aria-label','Gradient stops');
    stops.forEach((stop,i) => {
      const marker = document.createElement('button'); marker.type = 'button'; marker.className = 'draw-gradient-stop'; marker.style.left = `${stop.offset * 100}%`;
      marker.style.setProperty('--stop-color',colorHex(stop.color) ?? '#000000'); marker.dataset.drawGradientStop = String(i);
      marker.setAttribute('aria-label',`Stop ${i + 1} at ${Math.round(stop.offset * 100)} %`); marker.setAttribute('aria-pressed',String(i === selected));
      marker.addEventListener('click',() => { state.ui.gradientStop = i; render(); }); bar.append(marker);
    });
    host.append(bar);
    const stop = stops[selected], fields = document.createElement('div'); fields.className = 'draw-fields'; host.append(fields);
    field(fields,'Color',colorHex(stop.color)?.toLowerCase() ?? '#000000',value => edit(current => updateStop(current,selected,{ color: value.toUpperCase() }),'Gradient Stop'),{ type:'color', key:'gradient-stop-color', disabled: ro });
    field(fields,'Location (%)',stop.offset * 100,value => { edit(current => updateStop(current,selected,{ offset: value / 100 }),'Gradient Stop',`gradient-location-${selected}`);
      state.ui.gradientStop = [...state.document.getNode(api.paintIds()[0]).appearance[target === 'fill' ? 'fills' : 'strokes'][0].paint.stops].findIndex(s => Math.abs(s.offset - Math.min(1,Math.max(0,value / 100))) < 1e-9); },{ min:0, max:100, key:'gradient-stop-location', disabled: ro });
    field(fields,'Opacity (%)',(stop.opacity ?? 1) * 100,value => edit(current => updateStop(current,selected,{ opacity: value / 100 }),'Gradient Stop',`gradient-opacity-${selected}`),{ min:0, max:100, key:'gradient-stop-opacity', disabled: ro });
    const actions = document.createElement('div'); actions.className = 'draw-gradient-actions'; host.append(actions);
    const add = iconButton('Add stop','plus',() => { edit(current => addStop(current),'Add Gradient Stop'); }); add.dataset.drawGradientAction = 'add';
    const remove = iconButton('Delete stop','trash',() => { edit(current => removeStop(current,selected),'Delete Gradient Stop'); state.ui.gradientStop = Math.max(0,selected - 1); }); remove.dataset.drawGradientAction = 'delete'; remove.disabled = ro || stops.length <= 2;
    const reverse = button('Reverse',() => edit(current => reverseGradient(current),'Reverse Gradient')); reverse.dataset.drawGradientAction = 'reverse';
    add.disabled = reverse.disabled = ro; actions.append(add,remove,reverse);
    text(host,g.type === 'linear' ? 'Angle turns the gradient around the object\'s centre. Drag with the Gradient tool to set it exactly.' : 'Radial gradients run from the centre outward.');
  }
  const PANEL_CONTENT = { gradient: gradientPanel, character: host => characterPanel(host), paragraph: host => paragraphPanel(host), swatches: swatchesPanel, color: colorPanel, stroke: strokePanel, transparency: transparencyPanel, pathfinder: pathfinderPanel, appearance: appearancePanel, transform: host => transform(host), align: alignPanel, artboards: artboardPanel };
  function renderFlyout() {
    const group = PANEL_GROUPS.find(g => g.id === state.ui.flyout);
    flyout.hidden = !group; if (!group) { flyoutTabs.replaceChildren(); flyoutBody.replaceChildren(); return; }
    const remembered = state.ui.groupTabs[group.id];
    const active = group.tabs.includes(remembered) && panelAvailable(remembered) ? remembered : group.tabs.find(panelAvailable);
    flyout.dataset.drawGroup = group.id; flyout.setAttribute('aria-label',group.tabs.map(panelName).join(', '));
    flyoutTabs.replaceChildren(...group.tabs.map(id => {
      const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'draw-flyout__tab'; tab.setAttribute('role','tab');
      tab.dataset.drawPanelTab = id; tab.textContent = panelName(id); tab.setAttribute('aria-selected',String(id === active));
      const shortcut = shortcutLabel(`panel.${id}`,{isMac}); if (shortcut) tab.dataset.tooltip = `${panelName(id)} (${shortcut})`;
      const unavailable = PANEL_DEFINITIONS.find(p => p.id === id)?.unavailable;
      if (unavailable) { tab.disabled = true; tab.dataset.tooltip = `${panelName(id)}: ${unavailable}`; }
      tab.addEventListener('click',() => { state.ui.groupTabs[group.id] = id; render(); }); return tab;
    }));
    flyoutBody.replaceChildren(); flyoutBody.dataset.drawPanelBody = active;
    if (state.document.readOnly) text(flyoutBody,state.warning || 'Read-only document');
    PANEL_CONTENT[active](flyoutBody);
    placeFlyout();
  }
  function render() {
    // A slider drag or color-picker session updates the canvas live; rebuilding would interrupt it.
    if (liveEdit && [flyoutBody,primary,controlBar].some(host => host.contains(document.activeElement))) return;
    liveEdit = false;
    for (const button of rail.children) button.setAttribute('aria-pressed',String(button.dataset.drawPanel === state.ui.flyout));
    primary.replaceChildren(); dock.layers.body.replaceChildren();
    if (state.document.readOnly) text(primary,state.warning || 'Read-only document');
    propertiesPanel(primary); layerPanel(dock.layers.body);
    controlBar.replaceChildren(); controlBar.hidden = state.ui.controlBar === false; if (!controlBar.hidden) controlBarContent(controlBar);
    renderFlyout(); layoutDock();
  }
  /** Control bar: compact fields for the selection, the artboard tool, or the paint for new objects. */
  function controlBarContent(host) {
    const ro = state.document.readOnly, ids = api.selectedIds();
    const group = (label) => { const g = document.createElement('div'); g.className = 'draw-cb-group'; if (label) g.setAttribute('aria-label',label); host.append(g); return g; };
    const title = (text) => { const t = document.createElement('span'); t.className = 'draw-cb-title'; t.dataset.drawCbTitle = ''; t.textContent = text; host.append(t); };
    const num = (parent, label, value, action, options = {}) => { const input = field(parent,label,value,action,{ step:.1, ...options }); input.closest('label').classList.add('draw-cb-field'); return input; };
    if (state.ui.tool === 'artboard') {
      const board = api.artboards.active(); title('Artboard');
      const name = field(group('Artboard name'),'Name',board.name,v => api.artboards.edit(board.id,{name:v},{artwork:false}),{ type:'text', key:'cb-artboard-name' });
      name.closest('label').classList.add('draw-cb-field','draw-cb-field--text');
      const g = group('Artboard position and size');
      for (const [key,label] of [['x','X'],['y','Y'],['width','W'],['height','H']])
        num(g,label,board[key],v => api.artboards.edit(board.id,{[key]:v}),{ key:`cb-artboard-${key}`, min:['width','height'].includes(key) ? .001 : undefined, max:['width','height'].includes(key) ? 5779 : undefined });
      const actions = group('Artboard actions');
      for (const [label,iconId,action,key] of [['New artboard','plus',() => api.artboards.add(),'new'],['Delete artboard','trash',() => api.artboards.remove(),'delete']]) {
        const b = iconButton(label,iconId,action,'draw-layer-action'); b.dataset.drawCb = `artboard-${key}`;
        b.disabled = ro || (key === 'delete' && state.document.data.artboards.length === 1); actions.append(b);
      }
      return;
    }
    title(selectionTitle(ids));
    // Fill, stroke and weight: the selection's first fill and stroke, or the paint for new objects.
    const painted = state.document.getNode(api.paintIds()[0]);
    const fill = painted ? paintHex(painted.appearance.fills[0]) : state.ui.fill, stroke = painted ? paintHex(painted.appearance.strokes[0]) : state.ui.stroke;
    const weight = painted ? painted.appearance.strokes[0]?.width ?? 0 : state.ui.strokeWidth ?? 0;
    const paint = group('Fill and stroke');
    for (const [kind,label,value] of [['fill','Fill',fill],['stroke','Stroke',stroke]]) {
      const wrap = document.createElement('label'); wrap.className = 'draw-cb-color'; wrap.dataset.tooltip = `${label}: ${value ?? 'none'}`;
      const name = document.createElement('span'); name.textContent = label;
      const picker = document.createElement('input'); picker.type = 'color'; picker.value = (value ?? '#ffffff').toLowerCase(); picker.classList.toggle('is-none',!value);
      picker.dataset.drawField = `cb-${kind}`; picker.setAttribute('aria-label',`${label} color`); picker.disabled = ro;
      picker.addEventListener('change',() => api.run(() => { api.paint(kind,picker.value.toUpperCase()); render(); }));
      wrap.append(name,picker); paint.append(wrap);
    }
    num(paint,'Weight',weight,v => { api.paint('width',v); render(); },{ key:'cb-stroke-weight', min:0, step:.05, disabled: painted ? !stroke : false });
    if (!ids.length) {
      const doc = group('Document');
      for (const [label,panel] of [['Artboards…','artboards'],['Swatches…','swatches']]) { const b = button(label,() => open(panel)); b.dataset.drawCb = panel; doc.append(b); }
      return;
    }
    const opacity = state.document.getNode(ids[0])?.opacity ?? 1;
    num(group('Opacity'),'Opacity',opacity*100,value => state.history.transaction('Opacity',() => { for (const id of api.selectedIds()) state.history.execute(updateNode(id,{opacity:value/100})); }),
      { key:'cb-opacity', min:0, max:100, step:1, disabled: ro });
    const box = api.bounds(), ref = state.ui.referencePoint ?? [.5,.5], disabled = !box || ro, point = box ? [box.x+box.width*ref[0],box.y+box.height*ref[1]] : [0,0];
    const size = group('Position and size');
    num(size,'X',point[0],v => api.transformPanel('x',v),{ key:'cb-x', disabled });
    num(size,'Y',point[1],v => api.transformPanel('y',v),{ key:'cb-y', disabled });
    num(size,'W',box?.width ?? 0,v => api.transformPanel('width',v),{ key:'cb-width', min:.001, disabled: disabled || box.width < 1e-9 });
    num(size,'H',box?.height ?? 0,v => api.transformPanel('height',v),{ key:'cb-height', min:.001, disabled: disabled || box.height < 1e-9 });
    const align = group('Align');
    for (const [label,iconId,mode] of [['Horizontal align left','layout-align-left','left'],['Horizontal align center','layout-align-center','centerX'],['Horizontal align right','layout-align-right','right'],
      ['Vertical align top','layout-align-top','top'],['Vertical align center','layout-align-middle','centerY'],['Vertical align bottom','layout-align-bottom','bottom']]) {
      const b = iconButton(label,iconId,() => api.alignPanel('align',mode),'draw-layer-action'); b.dataset.drawCbAlign = mode; b.disabled = ro; align.append(b);
    }
    const texts = selectedText();
    if (texts.length) {
      // Character and Paragraph, as Illustrator's Control panel shows them for type.
      const v = textValues(texts[0]), typeGroup = group('Character'), tro = ro || texts.some(n => !state.document.isEditable(n.id));
      const font = field(typeGroup,'Font',v.fontFamily,value => api.textStyle({ fontFamily: value, fontSource: 'system' },'Font'),{ type:'text', key:'cb-font-family', disabled: tro });
      font.setAttribute('list','draw-font-families'); font.closest('label').classList.add('draw-cb-field','draw-cb-field--text');
      num(typeGroup,'Size',v.fontSize,value => api.textStyle({ fontSize: value },'Font Size'),{ key:'cb-font-size', min:.1, max:10000, step:1, disabled: tro, scrubbable: false });
      const para = group('Paragraph');
      for (const [label,iconId,value] of [['Align left','align-left','left'],['Align center','align-center','center'],['Align right','align-right','right']]) {
        const b = iconButton(label,iconId,() => api.textStyle({ alignment: value },'Paragraph Alignment'),'draw-layer-action'); b.dataset.drawCbParagraph = value;
        b.setAttribute('aria-pressed',String((texts[0].paragraph.alignment ?? 'left') === value)); b.disabled = tro; para.append(b);
      }
    }
    const shapes = ids.filter(id => state.document.getNode(id)?.type === 'shape' && state.document.isEditable(id));
    const images = ids.filter(id => state.document.getNode(id)?.type === 'image');
    const actions = group('Quick actions');
    for (const [label,action,key,show] of [['Expand Shape',() => api.expandShapes(shapes),'expand-shape',shapes.length],['Use as Template',() => api.command('use-as-template'),'use-as-template',images.length],
      ['Transform…',() => open('transform'),'transform',true]]) {
      if (!show) continue; const b = button(label,action); b.dataset.drawCb = key; b.disabled = ro && key !== 'transform'; actions.append(b);
    }
  }
  render(); return { render, open, close };
}
