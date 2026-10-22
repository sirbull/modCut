import { DOCK_PANELS, panelName, panelSpriteHref } from './registry.mjs';
import { createPanelWindows } from './windows.mjs';
import { isAnyGradient } from '../doc/gradient.mjs';
import { freeformFrom, isFreeform, removeFreeformPoint, setFreeformMode, stopsFromFreeform, updateFreeformPoint } from '../doc/freeform.mjs';
import { strokePreview } from './stroke-icons.mjs';
import { insertNode, updateDocument, updateNode, updateNodes } from '../doc/commands.mjs';
import { createId } from '../doc/schema.mjs';
import { textDefaults, textValues } from '../doc/text.mjs';
import { GRADIENT_PRESETS, addStop, applyGradientPreset, colorHex, defaultGradient, gradientCss, gradientKey, gradientPreviewCss, isGradient, moveStop, removeStop, reverseGradient, setStrokeMode, setGradientAngle, setGradientType, updateStop } from '../doc/gradient.mjs';
import { recentGradients as savedRecentGradients } from '../doc/recent-gradients.mjs';
import { HARMONY_RULES, RECOLOR_SCOPES, adjustedColors, collectColors, colorGroups, paletteFromPixels, transferSettings, dragSettings, harmonyRule, hexLab, hexRgb, nearestIndex, neutralSettings, recolorHexes, recolorMap, remapAppearance, rgbLab, wheelLevel, wheelPixel, wheelPoint } from '../doc/recolor.mjs';
import { RECOLOR_LIBRARIES, recolorLibrary } from '../doc/recolor-libraries.mjs';
import { EFFECTS, effectLabel } from '../doc/effects.mjs';
import { documentInfo } from '../doc/document-info.mjs';
import { TRACE_PRESETS } from '../geom/trace.mjs';
import { WIDTH_PROFILES, flipAcross, flipAlong, profileName } from '../geom/width-profile.mjs';
import { addStyleCommand, applyStyleCommands, graphicStyles, removeStyleCommand, styleFrom } from '../doc/graphic-styles.mjs';
import { addSwatch, documentSwatches, editSwatch, groupSwatches, linkedPaints, removeSwatch } from '../doc/swatches.mjs';
import { recentColors as savedRecentColors, rememberRecentColor } from '../doc/recent-colors.mjs';
import { ROOT_CONTEXT, collectCommands, deleteLayerCommands, deleteRowCommands, duplicateCommands, filterLayerTree, flattenCommands, layerContext, mergeLayersCommands, moveCommand, moveToLayerCommands, newLayer, othersUpdates, releaseCommands, soloUpdates } from '../doc/layers.mjs';
import { shortcutLabel } from '../keymap.mjs';
import { REFERENCE_POINTS } from '../geom/transforms.mjs';
import { attachScrub } from '../ui/number-field.mjs';
import { PATHFINDER_LABELS, PATHFINDERS, SHAPE_MODES } from '../geom/pathfinder.mjs';
import { pathfinderIcon } from './pathfinder-icons.mjs';
import { viewIcon } from './view-icons.mjs';
import { addEntry, appearanceRows, clearAppearance, duplicateEntry, moveEntry, patchEntry, removeEntry, toggleEntry } from '../doc/appearance.mjs';
import { COLOR_MODES, colorFromValues, colorValues, normalizeHex } from '../doc/color.mjs';
import { ARROW_TYPES, paintHex } from '../doc/paint.mjs';
import { createColorSurface } from '../ui/color-surface.mjs';
import { fontBrowser, fontOptions } from '../ui/font-browser.mjs';

export function icon(href) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
  const use = document.createElementNS(svg.namespaceURI,'use'); use.setAttribute('href',href); svg.append(use);
  return svg;
}
const LAYER_ROW_LIMIT = 200;
const CHECKER = 'repeating-conic-gradient(#FFFFFF 0% 25%, #CFCFCF 0% 50%)';

export function createPanels(shell, state, api) {
  const isMac = /Mac/.test(navigator.platform);
  state.ui.groupTabs ??= {}; state.ui.dockCollapsed ??= {};
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
  panels.append(dock.properties.section,dock.layers.section);
  const primary = dock.properties.body;
  const propertiesFooter = document.createElement('div'); propertiesFooter.className = 'draw-properties-footer';
  const scaleStrokes = check(propertiesFooter,'Scale strokes & effects','properties-scale-strokes',state.ui.scaleStrokes !== false,value => api.setScaleStrokes(value));
  propertiesFooter.dataset.tooltip = 'Scale stroke widths, dash lengths and effect sizes with objects.';
  dock.properties.section.append(propertiesFooter);
  // Control bar stays above the canvas; the other panels have movable window chrome.
  const controlBar = document.createElement('div'); controlBar.className = 'draw-control-bar'; controlBar.setAttribute('role','toolbar'); controlBar.setAttribute('aria-label','Control bar');
  shell.append(controlBar,rail,panels);
  const panelWindows = createPanelWindows({ shell, rail, panels, dock, state,
    icon: name => icon(panelSpriteHref(name)), renderContent(id,host) {
      if (state.document.readOnly) text(host,state.warning || 'Read-only document');
      PANEL_CONTENT[id](host);
    }, refresh: () => render() });
  function close() {
    // Esc ends Recolor's theme picking before it closes anything.
    if (recolorPick) { recolorPick(); recolorPick = null; render(); return true; }
    if (panelWindows.cancel()) return true; if (state.ui.layerMenu) { state.ui.layerMenu = false; render(); return true; } return panelWindows.close(); }
  function open(id, { floating = false } = {}) {
    // Contextual actions can still take the user straight to the Artboard tool and its Properties.
    if (id === 'artboards') {
      state.ui.flyout = null; state.ui.dockCollapsed.properties = false;
      api.setTool('artboard'); render(); return true;
    }
    if (DOCK_PANELS.includes(id) && !floating && panelWindows.location(id) === 'dock') {
      state.ui.dockCollapsed[id] = false; layoutDock();
      if (id === 'layers') dock.layers.body.querySelector('.draw-layer-name')?.focus({ preventScroll: true });
      return true;
    }
    return panelWindows.open(id,{floating});
  }
  function layoutDock() { panelWindows.layoutDock(); }

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
    if(type==='number'&&/font-size|leading|tracking|horizontal-scale|vertical-scale|baseline-shift/.test(key)){
      input.addEventListener('input',()=>{if(input.validity.valid&&Number.isFinite(input.valueAsNumber)){liveEdit=true;input.dispatchEvent(new Event('change'));}});
      input.addEventListener('blur',()=>{liveEdit=false;queueMicrotask(render);});
    }
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
      let thumbs = 0, rendered = 0, more = 0;
      // Large documents (D4.6): rows beyond the limit are counted, not built; "Show more" raises the limit.
      const limit = state.ui.layerRowLimit ?? LAYER_ROW_LIMIT;
      function row(node, depth, context) {
        if (shown && !shown.has(node.id)) return;
        const own = layerContext(context,node), isLayer = node.type === 'layer';
        if (rendered >= limit) {
          more++;
          if (node.children?.length && node.type !== 'compoundPath' && (searching || !collapsed.has(node.id))) node.children.forEach(child => row(child,depth+1,own));
          return;
        }
        rendered++;
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
        const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'draw-layer-name'; choose.textContent = name; choose.translate = false;
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
      if (more) {
        const show = button(`Show ${Math.min(more,LAYER_ROW_LIMIT*5)} more of ${more}`,() => { state.ui.layerRowLimit = limit + LAYER_ROW_LIMIT*5; render(); });
        show.className = 'btn btn--sm draw-layer-more'; show.dataset.drawLayerMore = String(more); tree.append(show);
      }
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
    check(host,'Scale strokes & effects','scale-strokes',state.ui.scaleStrokes !== false,value => api.setScaleStrokes(value));
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
  function focusedGradient() {
    const node = state.document.getNode(api.paintIds()[0]), entry = node && (state.ui.paintFocus === 'stroke' ? node.appearance.strokes[0] : node.appearance.fills[0]);
    return isGradient(entry?.paint) ? entry.paint : null;
  }
  function currentPaint(kind) {
    const node = state.document.getNode(api.paintIds()[0]);
    if (!node) return state.ui[kind];
    return paintHex(kind === 'fill' ? node.appearance.fills[0] : node.appearance.strokes[0]);
  }
  function remember(target) { const hex = currentPaint(target); if (hex) state.ui.recentColors = rememberRecentColor(hex,state.ui.recentColors); }
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
    const recent = savedRecentColors(state.ui.recentColors);
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
        // A gradient swatch spans each object's box; a global swatch stays linked to what it paints.
        const pick = () => { state.ui.swatchId = s.id;
          if (s.gradient) api.gradient(target,(previous,box) => defaultGradient(box,{ type: s.gradient.type, stops: s.gradient.stops, angle: s.gradient.angle }),{ label: 'Gradient Swatch' });
          else api.paint(target,s.hex,{ swatch: s.global ? s.id : null });
          render(); };
        const b = chip(s.hex ?? '#FFFFFF',`${s.name}${s.hex ? ` ${s.hex}` : ''}${s.global ? ' (global)' : ''}`,pick,{ pressed: !!s.hex && s.hex === current });
        if (s.gradient) { b.style.setProperty('--swatch','transparent'); b.style.backgroundImage = gradientCss(s.gradient); b.classList.add('is-gradient'); }
        b.classList.toggle('is-global',!!s.global);
        b.classList.toggle('is-chosen',state.ui.swatchId === s.id);
        b.dataset.drawSwatch = s.id;
        if (view === 'list') { const name = document.createElement('span'); name.textContent = s.name; const code = document.createElement('code'); code.textContent = s.hex ?? (s.gradient.type === 'radial' ? 'Radial' : 'Linear'); b.append(name,code); }
        b.addEventListener('dblclick',() => api.run(() => swatchOptions(s)));
        box.append(b);
      }
      host.append(box);
    }
    const bar = document.createElement('div'); bar.className = 'draw-layer-bar draw-swatch-bar';
    const count = document.createElement('span'); count.className = 'draw-layer-count'; count.textContent = `${list.length} swatches`;
    const actions = document.createElement('div'); actions.className = 'draw-layer-actions';
    const add = iconButton(`New swatch from the current ${target} color`,'square-plus',() => {
      // A gradient fill or stroke becomes a gradient swatch; a colour a global swatch, as Illustrator's default.
      const { swatches, created } = addSwatch(doc.data,focusedGradient() ?? currentPaint(target),'',createId,{ global: true });
      setSwatches('New Swatch',swatches); state.ui.swatchId = created.id;
    }); add.dataset.drawSwatchAction = 'new'; add.disabled = readOnly || !(current || focusedGradient());
    const selectedSwatch = list.find(s => s.id === state.ui.swatchId);
    // Deleting a global swatch keeps the colors it painted, unlinked.
    const remove = iconButton('Delete swatch','trash',() => { const id = state.ui.swatchId; state.history.transaction('Delete Swatch',() => {
      for (const [node,appearance] of linkedPaints(doc,id,null)) state.history.execute(updateNode(node,{ appearance }));
      state.history.execute(updateDocument({ swatches: removeSwatch(doc.data,id) })); }); state.ui.swatchId = null; });
    remove.dataset.drawSwatchAction = 'delete'; remove.disabled = readOnly || !selectedSwatch;
    actions.append(add,remove); bar.append(count,actions); host.append(bar);
    text(host,'Click a swatch to apply it to the ' + target + '. Double-click to rename or change it.');
    async function swatchOptions(s) {
      const values = await api.swatchOptions(s); if (!values) return;
      // A global swatch recolors everything it paints in the same undo step; unticking Global unlinks it.
      api.run(() => state.history.transaction('Swatch Options',() => {
        const doc = state.document, relink = s.global ? linkedPaints(doc,s.id,values.global === false ? null : values.hex ?? s.hex) : [];
        for (const [node,appearance] of relink) state.history.execute(updateNode(node,{ appearance }));
        state.history.execute(updateDocument({ swatches: editSwatch(doc.data,s.id,values) }));
      }));
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
    // Opacity mask: the top selected object masks the others by its brightness (white shows, black hides).
    const maskNode = node?.mask ? node : null;
    const make = button(maskNode ? 'Release' : 'Make Mask',() => api.command(maskNode ? 'mask-release' : 'mask-make')); make.className = 'btn btn--sm';
    make.dataset.drawMask = maskNode ? 'release' : 'make'; make.disabled = state.document.readOnly || (maskNode ? false : ids.length < 2); masks.append(make);
    for (const [label,key] of [['Clip','clip'],['Invert Mask','invert']]) {
      const c = document.createElement('label'); c.className = 'draw-check'; const i = document.createElement('input'); i.type = 'checkbox'; i.dataset.drawMaskOption = key;
      i.checked = !!maskNode?.mask[key]; i.disabled = !maskNode || state.document.readOnly; i.addEventListener('change',() => api.command(`mask-${key}`));
      c.append(i,document.createTextNode(label)); masks.append(c);
    }
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
    // Live effects: applied top to bottom; the eye hides one, double-click edits, the arrows reorder.
    const effects = look.effects ?? [], setEffects = (label, next) => state.history.execute(updateNode(node.id,{ appearance: { ...look, effects: next } },{ label }));
    if (effects.length) {
      const fx = document.createElement('div'); fx.className = 'draw-appearance-list draw-effect-list'; fx.setAttribute('role','list'); fx.setAttribute('aria-label','Effects');
      effects.forEach((e,i) => {
        const row = document.createElement('div'); row.className = 'draw-appearance-row draw-effect-row'; row.setAttribute('role','listitem'); row.dataset.drawEffect = String(i);
        const eye = document.createElement('input'); eye.type = 'checkbox'; eye.checked = !e.hidden; eye.disabled = readOnly; eye.setAttribute('aria-label',`Show ${effectLabel(e)}`); eye.dataset.drawEffectToggle = String(i);
        eye.addEventListener('change',() => api.run(() => setEffects(eye.checked ? 'Show Effect' : 'Hide Effect',effects.map((x,k) => k === i ? (eye.checked ? (({ hidden, ...rest }) => rest)(x) : { ...x, hidden: true }) : x))));
        const name = document.createElement('button'); name.type = 'button'; name.className = 'draw-appearance-name'; name.textContent = effectLabel(e); name.disabled = readOnly;
        name.dataset.tooltip = 'Double-click to edit'; name.addEventListener('dblclick',() => api.editEffect(node.id,i));
        const up = iconButton('Move effect up','chevron-up',() => setEffects('Reorder Effects',effects.map((x,k) => k === i - 1 ? effects[i] : k === i ? effects[i - 1] : x)),'draw-layer-action');
        const remove = iconButton('Delete effect','trash',() => setEffects('Delete Effect',effects.filter((_,k) => k !== i)),'draw-layer-action');
        up.disabled = readOnly || i === 0; remove.disabled = readOnly; remove.dataset.drawEffectDelete = String(i);
        row.append(eye,name,up,remove); fx.append(row);
      });
      host.append(fx);
    }
    const opacity = document.createElement('button'); opacity.type = 'button'; opacity.className = 'draw-appearance-name draw-appearance-opacity-row';
    opacity.textContent = `Opacity: ${node.opacity === 1 ? 'Default' : `${Math.round(node.opacity*100)}%`}${node.blendMode !== 'normal' ? ` ${node.blendMode}` : ''}`;
    opacity.dataset.drawOpen = 'transparency'; opacity.addEventListener('click',() => open('transparency')); host.append(opacity);
    const bar = document.createElement('div'); bar.className = 'draw-layer-bar draw-swatch-bar';
    const actions = document.createElement('div'); actions.className = 'draw-layer-actions';
    const pick = chosen && look[chosen.kind]?.[chosen.index] ? chosen : null;
    for (const [label,iconId,action,disabled,key] of [
      ['Add New Stroke','border-outer',() => { const r = addEntry(look,'strokes',{ color: state.ui.stroke || '#071411', width: state.ui.strokeWidth }); commit('Add New Stroke',r.appearance,{ kind:'strokes', index:r.index }); },readOnly,'add-stroke'],
      ['Add New Fill','square-rounded-plus',() => { const r = addEntry(look,'fills',{ color: state.ui.fill || '#FFFFFF' }); commit('Add New Fill',r.appearance,{ kind:'fills', index:r.index }); },readOnly,'add-fill'],
      ['Clear Appearance','ban',() => commit('Clear Appearance',clearAppearance(look),null),readOnly || !(look.fills.length || look.strokes.length),'clear'],
      ['Duplicate Selected Item','copy',() => { const r = duplicateEntry(look,pick.kind,pick.index); commit('Duplicate Appearance',r.appearance,{ kind:pick.kind, index:r.index }); },readOnly || !pick,'duplicate'],
      ['Delete Selected Item','trash',() => commit('Delete Appearance',removeEntry(look,pick.kind,pick.index),null),readOnly || !pick,'delete'],
    ]) { const b = iconButton(label,iconId,action); b.disabled = disabled; b.dataset.drawAppearanceAction = key; actions.append(b); }
    const addEffect = document.createElement('select'); addEffect.className = 'select draw-add-effect'; addEffect.dataset.drawAddEffect = ''; addEffect.disabled = readOnly || !['path','shape','text'].includes(node.type);
    addEffect.setAttribute('aria-label','Add New Effect'); addEffect.append(new Option('Add Effect…',''),...Object.entries(EFFECTS).map(([type,d]) => new Option(`${d.group}: ${d.label}…`,type)));
    addEffect.addEventListener('change',() => { const type = addEffect.value; addEffect.value = ''; if (type) api.addEffect(type); });
    bar.append(addEffect,actions); host.append(bar);
    text(host,'The top row draws on top. Drag rows to reorder fills or strokes. Click a row name to choose it for Duplicate and Delete.');
  }
  let colorGesture = 0;
  function colorPanel(host) {
    const target = state.ui.paintFocus === 'stroke' ? 'stroke' : 'fill', mode = state.ui.colorMode ?? 'hsb', hex = currentPaint(target);
    const disabled = state.document.readOnly, shown = hex || '#FFFFFF', live = `color-${target}`;
    paintTargets(host,target);
    const top = document.createElement('div'); top.className = 'draw-color-top'; host.append(top);
    const swatch = document.createElement('button'); swatch.type = 'button'; swatch.className = 'draw-color-swatch'; swatch.style.backgroundColor = shown;
    swatch.setAttribute('aria-label',`${target === 'fill' ? 'Fill' : 'Stroke'} color picker`); swatch.dataset.drawField = 'color-picker'; swatch.disabled = disabled; swatch.setAttribute('aria-haspopup','dialog');
    swatch.dataset.tooltip = 'Double-click to edit';
    swatch.classList.toggle('is-none',!hex);
    swatch.addEventListener('dblclick',() => { void api.editPaint(target); });
    const none = button('None',() => api.paint(target,null)); none.dataset.drawField = 'color-none'; none.disabled = disabled; none.setAttribute('aria-pressed',String(!hex));
    const modeSelect = document.createElement('select'); modeSelect.className = 'draw-select'; modeSelect.dataset.drawField = 'color-mode'; modeSelect.setAttribute('aria-label','Color mode');
    for (const [value,spec] of Object.entries(COLOR_MODES)) modeSelect.append(new Option(spec.name,value,false,value === mode));
    modeSelect.addEventListener('change',() => { state.ui.colorMode = modeSelect.value; render(); });
    top.append(swatch,modeSelect,none);
    let surfaceKey;
    const surface = createColorSurface(shown,{disabled,hsb:state.ui.colorHsb?.[target],
      onStart() { liveEdit = true; surfaceKey = `color-surface-${++colorGesture}`; },
      onInput(value,hsb) {
        state.ui.colorHsb = {...state.ui.colorHsb,[target]:hsb};
        swatch.style.backgroundColor = value; swatch.classList.remove('is-none'); none.setAttribute('aria-pressed','false'); hexInput.value = value.slice(1);
        (mode === 'hsb' ? hsb : colorValues(mode,value)).forEach((v,i) => { inputs[i].number.value = v; inputs[i].range.value = v; });
        api.run(() => api.paint(target,value,{mergeKey:surfaceKey}));
      },
      onCommit() { liveEdit = false; remember(target); render(); },
    }); host.append(surface.element);
    recentColors(host,target);
    const cached = state.ui.colorHsb?.[target];
    const values = mode === 'hsb' && cached && colorFromValues('hsb',cached) === shown.toUpperCase() ? cached : colorValues(mode,shown), inputs = [];
    const apply = (mergeKey) => api.run(() => { const value = colorFromValues(mode,inputs.map(i => i.number.valueAsNumber));
      if (mode === 'hsb') { const hsb = inputs.map(i => i.number.valueAsNumber); surface.setHsb(hsb); state.ui.colorHsb = {...state.ui.colorHsb,[target]:hsb}; }
      else surface.setHex(value);
      swatch.style.backgroundColor = value; swatch.classList.remove('is-none'); hexInput.value = value.slice(1);
      api.paint(target,value,{ mergeKey }); });
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
    const wrap = document.createElement('div'); wrap.className = `draw-field draw-stroke-setting draw-stroke-setting--${key}`;
    const name = document.createElement('span'); name.textContent = label; wrap.append(name);
    const group = document.createElement('div'); group.className = 'draw-segmented'; group.setAttribute('role','group'); group.setAttribute('aria-label',label);
    for (const [id,text] of options) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-segmented__option draw-stroke-option';
      b.append(icon(panelSpriteHref(`stroke-${key}-${id}`))); b.setAttribute('aria-label',text); b.dataset.tooltip = text;
      b.dataset.drawStroke = `${key}-${id}`; b.setAttribute('aria-pressed',String(id === value)); b.disabled = disabled || !!unavailable[id];
      if (unavailable[id]) b.dataset.tooltip = `${text}: ${unavailable[id]}`;
      b.addEventListener('click',() => api.run(() => onPick(id))); group.append(b);
    }
    wrap.append(group); host.append(wrap);
  }
  function visualSelect(select, preview, label) {
    select.setAttribute('aria-label',label);
    const wrap = document.createElement('div'); wrap.className = 'draw-stroke-picker';
    const sample = document.createElement('span'); sample.className = 'draw-stroke-sample'; sample.append(preview(select.value));
    const choices = document.createElement('details'); choices.className = 'draw-stroke-choices';
    const toggle = document.createElement('summary'); toggle.append(sample); toggle.setAttribute('aria-label',select.closest('label')?.textContent || 'Preview options');
    toggle.dataset.tooltip = 'Preview options';
    toggle.addEventListener('keydown',event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!select.disabled && !event.repeat) choices.open = !choices.open; }
      if (event.key === 'Escape') { event.preventDefault(); choices.open = false; }
    });
    const menu = document.createElement('div'); menu.className = 'draw-stroke-choices__menu';
    for (const option of select.options) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-stroke-choice'; b.disabled = select.disabled;
      b.append(preview(option.value),document.createTextNode(option.textContent)); b.setAttribute('aria-pressed',String(option.selected));
      b.addEventListener('click',() => { choices.open=false; select.value=option.value; select.dispatchEvent(new Event('change',{bubbles:true})); }); menu.append(b);
    }
    if(select.disabled) toggle.addEventListener('click',event=>event.preventDefault());
    choices.append(toggle,menu); wrap.append(choices,select); return wrap;
  }
  function strokePanel(host) {
    const content = document.createElement('div'); content.className = 'draw-stroke-panel'; host.append(content); host = content;
    const node = state.document.getNode(api.paintIds()[0]), stroke = node?.appearance.strokes[0] ?? null, readOnly = state.document.readOnly;
    const s = stroke ?? { width: state.ui.strokeWidth, cap: 'round', join: 'round', miterLimit: 4, align: 'center' }, disabled = readOnly || !node;
    const apply = props => api.strokeProps(props);
    field(host,'Weight (mm)',s.width,value => node ? apply({ width: value }) : api.paint('width',value),{ min:0, max:352.8, key:'stroke-weight', disabled: readOnly });
    segmented(host,'Cap','cap',[['butt','Butt'],['round','Round'],['square','Projecting']],s.cap,cap => apply({ cap }),{ disabled });
    const corners = document.createElement('div'); corners.className = 'draw-stroke-corners'; host.append(corners);
    segmented(corners,'Corner','join',[['miter','Miter'],['round','Round'],['bevel','Bevel']],s.join,join => apply({ join }),{ disabled });
    field(corners,'Limit (×)',s.miterLimit ?? 4,value => apply({ miterLimit: value }),{ min:1, max:500, key:'stroke-limit', disabled: disabled || s.join !== 'miter' });
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
    // Variable width profile (D4.1): a preset, or the custom profile made with the Width tool, and flips.
    const profile = document.createElement('div'); profile.className = 'draw-stroke-profile'; host.append(profile);
    {
      const row = document.createElement('div'); row.className = 'draw-field'; const name = document.createElement('span'); name.textContent = 'Profile';
      const select = document.createElement('select'); select.className = 'draw-select'; select.dataset.drawField = 'stroke-profile'; select.disabled = disabled;
      const current = profileName(s.widthProfile);
      for (const [id,preset] of Object.entries(WIDTH_PROFILES)) select.append(new Option(preset.label,id,false,id === current));
      if (current === 'custom') select.append(new Option('Custom (Width tool)','custom',false,true));
      select.addEventListener('change',() => { if (select.value !== 'custom') api.run(() => apply({ widthProfile: WIDTH_PROFILES[select.value].points })); });
      row.append(name,visualSelect(select,id => strokePreview('profile',id === 'custom' ? s.widthProfile : WIDTH_PROFILES[id]?.points),'Profile')); profile.append(row);
      const flips = document.createElement('div'); flips.className = 'draw-flip-row'; flips.setAttribute('role','group'); flips.setAttribute('aria-label','Flip profile');
      for (const [label,flip,key] of [['Flip Along',flipAlong,'along'],['Flip Across',flipAcross,'across']]) {
        const b = iconButton(label,`stroke-flip-${key}`,() => apply({ widthProfile: flip(s.widthProfile) }),'draw-layer-action'); b.dataset.drawStrokeFlip = key;
        b.disabled = disabled || !s.widthProfile?.length; flips.append(b);
      }
      profile.append(flips);
    }
    const arrows = document.createElement('div'); arrows.className = 'draw-stroke-arrows'; host.append(arrows);
    const arrowLabel = document.createElement('span'); arrowLabel.textContent = 'Arrowheads'; arrows.append(arrowLabel);
    for (const [key,label] of [['startArrow','Start arrowhead'],['endArrow','End arrowhead']]) {
      const row = document.createElement('div'); row.className = 'draw-field';
      const name = document.createElement('span'); name.textContent = label;
      const select = document.createElement('select'); select.className = 'draw-select'; select.dataset.drawField = `stroke-${key}`; select.disabled = disabled;
      select.append(new Option('None','none',false,!s[key]));
      for (const type of ARROW_TYPES) select.append(new Option(type[0].toUpperCase()+type.slice(1),type,false,s[key]?.type === type));
      select.addEventListener('change',() => api.run(() => apply({ [key]: select.value === 'none' ? null : { type: select.value, scale: s[key]?.scale ?? 1 } })));
      row.append(name,visualSelect(select,type => strokePreview('arrow',type,key === 'startArrow'),label)); arrows.append(row);
    }
    const scaleLabel = document.createElement('span'); scaleLabel.textContent = 'Scale (%)'; arrows.append(scaleLabel);
    for (const [key,label] of [['startArrow','Start scale (%)'],['endArrow','End scale (%)']]) {
      const input = field(arrows,label,(s[key]?.scale ?? 1)*100,value => apply({ [key]: { type: s[key].type, scale: value/100 } }),{ min:1, max:1000, key:`stroke-${key}-scale`, disabled: disabled || !s[key] });
      input.setAttribute('aria-label',label);
    }
    host.append(profile);
    text(host,node ? (stroke ? 'Stroke color is set in the Color panel.' : 'This artwork has no stroke; editing an option adds one in the current stroke color.') : 'Select artwork to edit stroke options. Weight applies to new shapes.');
  }
  function artboardPanel(host) {
    const list=document.createElement('div');list.className='draw-artboard-list';list.setAttribute('aria-label','Artboards');
    for (const [i,board] of state.document.data.artboards.entries()) {
      const b=button(`${i+1}. ${board.name}`,()=>api.artboards.choose(board.id));b.dataset.drawArtboard=board.id;
      const sent=api.cutStatus(board.id);
      if(sent){const badge=document.createElement('span');badge.className=`draw-cut-status draw-cut-status--${sent}`;badge.dataset.drawCutStatus=sent;
        badge.textContent=sent==='changed'?'Changed since sending':'Sent to Cut';b.append(badge);}
      b.setAttribute('aria-pressed',String(board.id===api.artboards.active().id));
      b.addEventListener('dblclick',()=>{ const input=host.querySelector('[data-draw-field=artboard-name]'); input?.focus(); input?.select(); });list.append(b);
    } host.append(list);
    const board=api.artboards.active();
    field(host,'Name',board.name,v=>api.artboards.edit(board.id,{name:v},{artwork:false}),{type:'text',key:'artboard-name'});
    const grid=document.createElement('div');grid.className='draw-fields';host.append(grid);
    for(const [key,label] of [['x','X'],['y','Y'],['width','Width'],['height','Height']])field(grid,`${label} (mm)`,board[key],v=>api.artboards.edit(board.id,{[key]:v}),{min:['width','height'].includes(key) ? .001 : undefined,max:['width','height'].includes(key) ? 5779 : undefined,key:`artboard-${key}`});
    const move=document.createElement('label');move.className='draw-check';const check=document.createElement('input');check.type='checkbox';check.checked=state.ui.moveArtwork!==false;
    check.addEventListener('change',()=>{state.ui.moveArtwork=check.checked;});move.append(check,document.createTextNode('Move/copy artwork with artboard'));host.append(move);
    for(const [label,action,disabled] of [['New artboard',()=>api.artboards.add(),false],['Duplicate',()=>api.artboards.duplicate(),false],['Delete',()=>api.artboards.remove(),state.document.data.artboards.length===1],['Move up',()=>api.artboards.order(-1),state.document.data.artboards[0].id===board.id],['Move down',()=>api.artboards.order(1),state.document.data.artboards.at(-1).id===board.id],['Rearrange…',api.rearrange,false]]) {
      const b=button(label,action);b.disabled=disabled || state.document.readOnly;
      if(label==='New artboard'){b.className='btn btn--primary btn--sm draw-new-artboard';b.prepend(icon(panelSpriteHref('plus')));b.dataset.drawNewArtboard='';host.prepend(b);}
      else host.append(b);
    }
    const send=button('Send to Cut…',()=>api.command('send-to-cut'));send.className='btn btn--primary btn--sm draw-send-button';send.dataset.drawSendToCut='';host.append(send);
    if(api.cutStatus(board.id)){const update=button('Update in Cut',()=>api.updateInCut(board.id));update.className='btn btn--ghost btn--sm draw-send-button';update.dataset.drawUpdateCut='';
      update.disabled=state.document.readOnly;update.dataset.tooltip='Replace what this artboard last sent to Cut, with the same choices';host.append(update);}
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
  /** Ruler & Grids, Guides and Snap Options as icon toggles, as in Illustrator's Properties with nothing selected. */
  function viewToggles(host) {
    const settings = state.document.data.settings, ro = state.document.readOnly;
    const rows = [
      ['Ruler & Grids',[['rulers','Rulers',!!state.ui.rulers],['grid','Grid',!!state.ui.grid],['transparency-grid','Transparency Grid',!!state.ui.transparencyGrid]]],
      ['Guides',[['guides','Guides',!state.ui.guidesHidden],['guides-lock','Lock Guides',!!state.ui.guidesLocked],['smart-guides','Smart Guides',settings.smartGuides !== false,ro]]],
      ['Snap Options',[['snap-point','Snap to Point',!!settings.snapping?.point,ro],['snap-grid','Snap to Grid',!!settings.snapping?.grid,ro]]],
    ];
    const box = document.createElement('div'); box.className = 'draw-view-toggles'; host.append(box);
    for (const [title,toggles] of rows) {
      const label = document.createElement('span'); label.className = 'draw-view-toggles__label'; label.textContent = title;
      const group = document.createElement('div'); group.className = 'draw-view-toggles__group'; group.setAttribute('role','group'); group.setAttribute('aria-label',title);
      for (const [id,name,on,disabled] of toggles) {
        const shortcut = shortcutLabel(id,{ isMac }), b = iconButton(shortcut ? `${name} (${shortcut})` : name,null,() => api.command(id),'draw-icon-button draw-view-toggle');
        b.setAttribute('aria-label',name); b.setAttribute('aria-pressed',String(on)); b.dataset.drawView = id; b.disabled = !!disabled;
        b.append(viewIcon(id)); group.append(b);
      }
      box.append(label,group);
    }
    quickActions(host,[['Smart Guides Preferences…',() => api.openPreferences('Smart Guides'),'smart-guides-preferences']]);
  }
  function documentProperties(host) {
    const doc = state.document.data, board = api.artboards.active();
    const h = document.createElement('h3'); h.className = 'draw-panel__section'; h.textContent = 'Document'; host.append(h);
    const info = document.createElement('dl'); info.className = 'draw-doc-info';
    for (const [term,value] of [['Artboard',`${board.name} · ${Number(board.width.toFixed(2))} × ${Number(board.height.toFixed(2))} mm`],['Artboards',String(doc.artboards.length)],['Units',doc.units ?? 'mm'],['Raster effects',`${doc.rasterEffectsPpi ?? 300} ppi`]]) {
      const dt = document.createElement('dt'); dt.textContent = term; const dd = document.createElement('dd'); dd.textContent = value; info.append(dt,dd);
    }
    host.append(info);
    viewToggles(host);
    quickActions(host,[['Artboards…',() => open('artboards'),'artboards'],['Swatches…',() => open('swatches'),'swatches'],['Layer Options…',() => api.layerOptions(state.ui.layerId ?? doc.layers.at(-1).id),'layer-options',state.document.readOnly],['Send to Cut…',() => api.command('send-to-cut'),'send-to-cut']]);
    text(host,'Fill and Stroke for new shapes are set with the boxes below the drawing tools.');
  }
  function propertiesPanel(host) {
    if (state.ui.tool === 'artboard') {
      const settings=document.createElement('div');settings.className='draw-artboard-properties';host.append(settings);
      section(settings,'Artboards');artboardPanel(settings);return;
    }
    const ids = api.selectedIds(), title = document.createElement('div'); title.className = 'draw-appearance-head'; title.dataset.drawSelectionTitle = '';
    title.textContent = selectionTitle(ids); host.append(title);
    if (!ids.length) {
      if (textToolActive()) { section(host,'Character'); characterPanel(host,{ compact:true, prefix:'prop-' }); section(host,'Paragraph'); paragraphPanel(host,{ prefix:'prop-' }); return; }
      return documentProperties(host);
    }
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
      const grads = { fill: isAnyGradient(paintOf('fill')) ? paintOf('fill') : null, stroke: isAnyGradient(paintOf('stroke')) ? paintOf('stroke') : null };
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
        const name = document.createElement('span'); name.textContent = kind === 'weight' ? `${label} ${value}` : grad ? `${label} ${({ radial: 'radial', freeform: 'freeform' })[grad.type] ?? 'linear'} gradient` : `${label} ${value ?? 'none'}`;
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
    if (images.length) quickActions(host,[['Use as Template',() => api.command('use-as-template'),'use-as-template',ro],['Crop Image…',() => api.command('crop-image'),'crop-image',ro]]);
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
  const textToolActive = () => ['type','area-type','vertical-type','type-on-path'].includes(state.ui.tool);
  const selectedText = () => api.selectedIds().map(id => state.document.getNode(id)).filter(n => n?.type === 'text');
  /** Character edits selected text, or the formatting for the next text object when none is selected. */
  function characterPanel(host, { compact = false, prefix = '' } = {}) {
    const nodes = selectedText(), node = nodes[0];
    const v = api.textValues?.() ?? (node ? textValues(node) : textDefaults(state.ui)), ro = state.document.readOnly || nodes.some(n => !state.document.isEditable(n.id)), set = (changes,label) => api.textStyle(changes,label);
    if (!node && !compact) text(host,'These settings apply to new text.');
    fontBrowser(host,v,{choose:next=>set(next,'Font'),sample:api.fontSample,disabled:ro,key:`${prefix}font-family`});
    const styles = document.createElement('div'); styles.className = 'draw-fields'; host.append(styles);
    const select = (parent, label, key, value, options, onChange) => {
      const row = document.createElement('label'); row.className = 'draw-field'; const name = document.createElement('span'); name.textContent = label;
      const input = document.createElement('select'); input.className = 'select'; input.dataset.drawField = key; input.disabled = ro;
      for (const [optionValue,optionLabel] of options) input.append(new Option(optionLabel,String(optionValue)));
      input.value = String(value); input.addEventListener('change',() => api.run(() => onChange(input.value))); row.append(name,input); parent.append(row); return input;
    };
    select(styles,'Weight',`${prefix}font-weight`,v.fontWeight,[...new Set([...WEIGHTS,v.fontWeight])].map(w => [w,typeof w === 'number' ? String(w) : w[0].toUpperCase()+w.slice(1)]),
      value => set({ fontWeight: ['normal','bold'].includes(value) ? value : Number(value) },'Font Weight'));
    select(styles,'Style',`${prefix}font-style`,v.fontStyle,[['normal','Normal'],['italic','Italic']],value => set({ fontStyle: value },'Font Style'));
    const sizes = document.createElement('div'); sizes.className = 'draw-fields'; host.append(sizes);
    field(sizes,compact ? 'Size' : 'Size (pt)',v.fontSize,value => set({ fontSize: value },'Font Size'),{ min:.1, max:10000, key:`${prefix}font-size`, disabled: ro, scrubbable: false });
    field(sizes,compact ? 'Leading' : 'Leading (pt)',v.leading,value => set({ leading: value },'Leading'),{ min:.1, max:10000, key:`${prefix}leading`, disabled: ro, scrubbable: false });
    field(sizes,'Tracking',v.tracking ?? 0,value => set({ tracking: value },'Tracking'),{ min:-1000, max:10000, key:`${prefix}tracking`, disabled: ro, scrubbable: false });
    // Horizontal and vertical scale (%), baseline shift (pt) and kerning, as in Illustrator's Character panel.
    const shape = document.createElement('div'); shape.className = 'draw-fields'; host.append(shape);
    field(shape,compact ? 'H scale' : 'Horizontal scale (%)',v.horizontalScale ?? 100,value => set({ horizontalScale: value },'Horizontal Scale'),{ min:1, max:10000, key:`${prefix}horizontal-scale`, disabled: ro, scrubbable: false });
    field(shape,compact ? 'V scale' : 'Vertical scale (%)',v.verticalScale ?? 100,value => set({ verticalScale: value },'Vertical Scale'),{ min:1, max:10000, key:`${prefix}vertical-scale`, disabled: ro, scrubbable: false });
    field(shape,compact ? 'Shift' : 'Baseline shift (pt)',v.baselineShift ?? 0,value => set({ baselineShift: value },'Baseline Shift'),{ min:-10000, max:10000, key:`${prefix}baseline-shift`, disabled: ro, scrubbable: false });
    select(shape,'Kerning',`${prefix}kerning`,v.kerning ?? 'metrics',[['metrics','Metrics'],['none','None']],value => set({ kerning: value },'Kerning'));
    const caps = check(host,'All Caps',`${prefix}all-caps`,!!v.allCaps,value => set({ allCaps: value },'All Caps')); caps.disabled = ro;
    fontOptions(host,v,{change:changes=>set(changes,'Font Options'),disabled:ro,start:()=>{liveEdit=true;},end:()=>{liveEdit=false;queueMicrotask(render);}});
    if(v.kind==='area'){
      const frame=document.createElement('div');frame.className='draw-fields';host.append(frame);
      field(frame,'Frame width (mm)',v.frameWidth,value=>set({frameWidth:value},'Text Frame'),{min:.1,max:100000,key:`${prefix}frame-width`,disabled:ro,scrubbable:false});
      field(frame,'Frame height (mm)',v.frameHeight,value=>set({frameHeight:value},'Text Frame'),{min:.1,max:100000,key:`${prefix}frame-height`,disabled:ro,scrubbable:false});
    }
    if(v.kind==='onPath'){
      field(host,'Start offset (mm)',v.pathOffset??0,value=>set({pathOffset:value},'Text Offset'),{min:0,max:100000,key:`${prefix}path-offset`,disabled:ro,scrubbable:false});
      check(host,'Flip to the other side',`${prefix}path-flip`,!!v.pathFlip,value=>set({pathFlip:value},'Flip Text'));
    }
    if(node?.layout?.overflow)text(host,'Text overflows its frame. Enlarge the frame or reduce the size to show all text.');
    if (!compact) text(host,'Sizes and leading are in points. Tracking is in thousandths of an em. Changes are shaped again with the font, so export, outlines and Send to Cut follow.');
  }
  /** Paragraph formatting follows the same selection/defaults behavior as Character. */
  function paragraphPanel(host, { prefix = '' } = {}) {
    const nodes = selectedText(), node = nodes[0];
    const p = node ? node.paragraph : textDefaults(state.ui);
    const ro = state.document.readOnly || nodes.some(n => !state.document.isEditable(n.id)), current = p.alignment ?? 'left';
    if (!node && !prefix) text(host,'These settings apply to new text.');
    const row = document.createElement('div'); row.className = 'draw-align-row'; row.setAttribute('role','group'); row.setAttribute('aria-label','Paragraph alignment');
    for (const [label,iconId,value] of [['Align left','align-left','left'],['Align center','align-center','center'],['Align right','align-right','right'],['Justify with last line aligned left','align-justified','justify']]) {
      const b = iconButton(label,iconId,() => api.textStyle({ alignment: value },'Paragraph Alignment'),'draw-layer-action draw-align-button');
      b.dataset.drawParagraph = `${prefix}${value}`; b.setAttribute('aria-pressed',String(current === value)); b.disabled = ro; row.append(b);
    }
    host.append(row);
    // Indents and paragraph spacing in points, as in Illustrator's Paragraph panel.
    const spacing = document.createElement('div'); spacing.className = 'draw-fields'; host.append(spacing);
    for (const [key,label,name] of [['leftIndent','Left indent (pt)','Left Indent'],['rightIndent','Right indent (pt)','Right Indent'],['firstLineIndent','First-line indent (pt)','First-Line Indent'],
      ['spaceBefore','Space before (pt)','Space Before Paragraph'],['spaceAfter','Space after (pt)','Space After Paragraph']])
      field(spacing,label,p[key] ?? 0,value => api.textStyle({ [key]: value },name),{ min:-10000, max:10000, key:`${prefix}${key.replace(/[A-Z]/g,c => `-${c.toLowerCase()}`)}`, disabled: ro, scrubbable: false });
    if (current === 'justify' && node?.kind !== 'area') text(host,'Justified lines need area text; point text and text on a path align left.');
    if (node?.kind === 'onPath') text(host,'On a path, alignment places the text between the start offset and the end of the path.');
  }
  /**
   * Recolor, as Illustrator's Recolor Artwork: every colour of the selection on one wheel. Drag a colour to turn
   * them all; Ctrl/Cmd also moves them in and out; Shift (or unlinked) moves only that colour. Harmony rules,
   * colour libraries and the slider act on the session's original colours, so each gesture is one undo step.
   */
  let recolor = null, recoloring = false, recolorPick = null;
  const wheelImages = new Map();
  function recolorSession() {
    const ids = api.paintIds(), scope = RECOLOR_SCOPES[state.ui.recolorScope] ? state.ui.recolorScope : 'all', key = `${scope}:${ids.join(' ')}`;
    // The panel re-renders inside our own edits, before the session has seen the new document.
    if (recolor && recolor.key === key && (recoloring || recolor.data === state.document.data)) return recolor;
    // Another scope also starts over, so what was done to fills stays when strokes are recoloured.
    const nodes = ids.map(id => state.document.getNode(id)), kinds = RECOLOR_SCOPES[scope], colors = collectColors(nodes,kinds);
    const previous = recolor?.ids.join(' ') === ids.join(' ') ? recolor.settings : null, settings = neutralSettings(colors);
    // Selecting other artwork, undo or another edit starts over from the colours as they are now.
    settings.mode = previous?.mode ?? state.ui.recolorMode ?? 'saturation'; settings.linked = previous?.linked ?? true;
    recolor = { key, ids, scope, kinds, colors, settings, copy: null, sources: new Map(nodes.map(n => [n.id,n.appearance])), data: state.document.data };
    return recolor;
  }
  function recolorLibraryColors(id) {
    if (id === 'theme') return state.ui.recolorTheme?.colors ?? null;
    if (id === 'document') return documentSwatches(state.document.data).filter(s => s.hex).map(s => s.hex.toUpperCase());
    return recolorLibrary(id)?.colors ?? null;
  }
  function applyRecolor(session, { label = 'Recolor', mergeKey = null } = {}) {
    const map = recolorMap(session.colors,session.settings,recolorLibraryColors(session.settings.library));
    const entries = session.ids.filter(id => state.document.isEditable(id)).map(id => [id,{ appearance: remapAppearance(session.sources.get(id),map,session.kinds) }]);
    recoloring = true;
    try { if (entries.length) state.history.transaction(label,() => state.history.execute(updateNodes(entries,{ label })),{ mergeKey }); }
    finally { recoloring = false; }
    session.data = state.document.data;
  }
  /**
   * Copy to Stroke / Fill: the same rule, turn, scale, slider and library on the other paint, one undo step.
   * Within a session the copy keeps working from the other paint's original colours, so copying again replaces it.
   */
  function copyRecolor(session) {
    const to = session.scope === 'fill' ? 'stroke' : 'fill', kinds = RECOLOR_SCOPES[to];
    if (!session.copy) {
      const nodes = session.ids.map(id => state.document.getNode(id)), colors = collectColors(nodes,kinds);
      if (!colors.length) throw new Error(`The selection has no ${to} colors to copy the recolor to.`);
      session.copy = { ids: session.ids, kinds, colors, sources: new Map(nodes.map(n => [n.id,n.appearance])) };
    }
    applyRecolor({ ...session.copy, settings: transferSettings(session.settings,session.colors,session.copy.colors) },{ label: to === 'fill' ? 'Copy Recolor to Fill' : 'Copy Recolor to Stroke' });
    session.data = state.document.data;
  }
  /** The picked artwork's colours (an image's dominant ones) become the Picked Theme library. */
  async function pickTheme(session, id) {
    if (!id) { render(); return; }
    const top = [state.document.getNode(id),...state.document.ancestors(id)].filter(n => n.type !== 'layer').at(-1), image = top.type === 'image' ? top : null;
    let colors;
    if (image) {
      const asset = state.document.data.assets[image.assetId];
      if (!asset) throw new Error('The image is not available to pick colors from.');
      const img = new Image(); img.src = `data:${asset.mimeType};base64,${asset.data}`; await img.decode();
      const k = Math.min(1,96 / Math.max(img.width,img.height)), c = document.createElement('canvas'); c.width = Math.max(1,Math.round(img.width * k)); c.height = Math.max(1,Math.round(img.height * k));
      const g = c.getContext('2d'); g.drawImage(img,0,0,c.width,c.height); colors = paletteFromPixels(g.getImageData(0,0,c.width,c.height).data,6);
    } else colors = collectColors([top,...(top.children ? state.document.descendants(top.id) : [])]).map(c => c.hex);
    if (!colors.length) throw new Error('That artwork has no colors to pick.');
    state.ui.recolorTheme = { colors };
    if (recolor === session && session.data === state.document.data) { session.settings.library = 'theme'; applyRecolor(session,{ label: 'Recolor Theme' }); }
    render();
  }
  /** Wheel background: hue around, the wheel's value outward, the other value from the slider; library regions when one is chosen. */
  function wheelImage(mode, level, libraryId) {
    const colors = libraryId ? recolorLibraryColors(libraryId) : null, key = `${mode}|${level.toFixed(3)}|${libraryId ?? ''}|${colors?.join() ?? ''}`;
    if (wheelImages.has(key)) return wheelImages.get(key);
    const size = colors?.length ? 96 : 180, image = new ImageData(size,size), labs = colors?.map(hexLab), rgbs = colors?.map(hexRgb);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1, at = (y * size + x) * 4;
      if (u * u + v * v > 1) continue;
      let rgb = wheelPixel([u,v],mode,level);
      if (labs?.length) rgb = rgbs[nearestIndex(rgbLab(rgb),labs)];
      image.data.set([...rgb.map(c => Math.round(c * 255)),255],at);
    }
    if (wheelImages.size > 24) wheelImages.clear();
    wheelImages.set(key,image); return image;
  }
  function harmonyIcon(rule) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
    const dot = ([x,y], r = 1.9) => `<circle cx="${(12 + x).toFixed(2)}" cy="${(12 + y).toFixed(2)}" r="${r}" fill="currentColor" stroke="none"/>`;
    const at = (angle, r) => [Math.cos(angle * Math.PI / 180) * r,-Math.sin(angle * Math.PI / 180) * r];
    let body = '<circle cx="12" cy="12" r="9" stroke-opacity=".35"/>';
    if (!rule.offsets) body += [[-4,-3],[4,-4],[2,4]].map(p => dot(p)).join('');
    else if (rule.offsets.length === 1) body += `<path d="M12 12L${12 + at(90,7)[0]} ${12 + at(90,7)[1]}"/>` + [3,5.5,8].map(r => dot(at(90,r),rule.id === 'shades' ? 1.2 + r / 8 : 1.6)).join('');
    else body += rule.offsets.map(o => { const p = at(90 + o,7); return `<path d="M12 12L${(12 + p[0]).toFixed(2)} ${(12 + p[1]).toFixed(2)}"/>${dot(p)}`; }).join('');
    svg.innerHTML = `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">${body}</g>`;
    return svg;
  }
  let recolorDrag = null;
  function recolorPanel(host) {
    const ids = api.paintIds(), ro = state.document.readOnly || !ids.length;
    if (!ids.length) { text(host,'Select artwork to recolor all its colors together.'); return; }
    const session = recolorSession(), { colors, settings } = session;
    // What to recolor: all paint, only fills or only strokes; Copy carries the adjustment to the other.
    const scopeRow = document.createElement('div'); scopeRow.className = 'draw-recolor-scope'; host.append(scopeRow);
    const scopes = document.createElement('div'); scopes.className = 'draw-segmented'; scopes.setAttribute('role','group'); scopes.setAttribute('aria-label','Recolor');
    for (const [id,label,tip] of [['all','All','Recolor fills and strokes together'],['fill','Fill','Recolor only fills'],['stroke','Stroke','Recolor only strokes']]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-segmented__option'; b.textContent = label;
      b.dataset.tooltip = tip; b.dataset.drawRecolorScope = id; b.setAttribute('aria-pressed',String(session.scope === id));
      b.addEventListener('click',() => { state.ui.recolorScope = id; render(); }); scopes.append(b);
    }
    scopeRow.append(scopes);
    if (session.scope !== 'all') {
      const label = session.scope === 'fill' ? 'Copy to Stroke' : 'Copy to Fill';
      const copy = button(label,() => { copyRecolor(session); render(); }); copy.dataset.drawRecolor = 'copy'; copy.disabled = ro;
      copy.dataset.tooltip = session.scope === 'fill' ? 'Give the strokes the same recolor: rule, turn, saturation, brightness and library' : 'Give the fills the same recolor: rule, turn, saturation, brightness and library';
      scopeRow.append(copy);
    }
    if (!colors.length) { text(host,session.scope === 'all' ? 'The selection has no solid or gradient colors to recolor.' : `The selection has no ${session.scope} colors. Choose All or ${session.scope === 'fill' ? 'Stroke' : 'Fill'}.`); return; }
    const change = (fn, label, mergeKey = null) => api.run(() => { fn(session.settings); applyRecolor(session,{ label, mergeKey }); render(); });
    // Color Library and Reset.
    const top = document.createElement('div'); top.className = 'draw-recolor-top'; host.append(top);
    const libRow = document.createElement('label'); libRow.className = 'draw-field draw-recolor-library';
    const libName = document.createElement('span'); libName.textContent = 'Color Library';
    const library = document.createElement('select'); library.className = 'draw-select'; library.dataset.drawField = 'recolor-library'; library.disabled = ro;
    library.append(new Option('None','',false,!settings.library),new Option('Document Swatches','document',false,settings.library === 'document'));
    for (const entry of RECOLOR_LIBRARIES) {
      const parent = entry.items ? Object.assign(document.createElement('optgroup'),{ label: entry.name }) : library;
      for (const item of entry.items ?? [entry]) parent.append(new Option(item.name,item.id,false,settings.library === item.id));
      if (parent !== library) library.append(parent);
    }
    library.addEventListener('change',() => change(s => { s.library = library.value || null; },'Recolor Library'));
    // Picked Theme comes after Document Swatches, before the library groups.
    if (state.ui.recolorTheme) library.options[1].after(new Option('Picked Theme','theme',false,settings.library === 'theme'));
    libRow.append(libName,library); top.append(libRow);
    const reset = button('Reset',() => { const mode = settings.mode, linked = settings.linked; session.settings = { ...neutralSettings(colors), mode, linked }; applyRecolor(session,{ label: 'Reset Recolor' }); render(); });
    reset.dataset.drawRecolor = 'reset'; reset.disabled = ro; top.append(reset);
    // Colors: Auto keeps every colour; a number merges like colours into that many.
    const countRow = document.createElement('label'); countRow.className = 'draw-field draw-recolor-library';
    const countName = document.createElement('span'); countName.textContent = 'Colors';
    const count = document.createElement('select'); count.className = 'draw-select'; count.dataset.drawField = 'recolor-count'; count.disabled = ro;
    count.append(new Option('Auto','',false,!settings.count));
    for (let n = 1; n < colors.length; n++) count.append(new Option(String(n),String(n),false,settings.count === n));
    count.addEventListener('change',() => change(s => { s.count = Number(count.value) || null; },'Recolor Colors'));
    countRow.append(countName,count); top.append(countRow);
    // Color Theme Picker: click artwork on the canvas to use its colours as the library.
    const picker = button(recolorPick ? 'Cancel Picking' : 'Color Theme Picker',() => {
      if (recolorPick) { recolorPick(); recolorPick = null; render(); return; }
      recolorPick = api.pickArtwork(id => { recolorPick = null; pickTheme(session,id).catch(error => { api.run(() => { throw error; }); render(); }); });
      render();
    });
    picker.dataset.drawRecolor = 'theme-picker'; picker.disabled = ro; picker.setAttribute('aria-pressed',String(!!recolorPick));
    picker.dataset.tooltip = recolorPick ? 'Click artwork on the canvas to take its colors. Esc cancels.' : 'Click artwork on the canvas to use its colors as the color library';
    top.append(picker);
    // Harmony rules, as color.adobe.com lists them.
    const rules = document.createElement('div'); rules.className = 'draw-recolor-rules'; rules.setAttribute('role','group'); rules.setAttribute('aria-label','Color harmonies');
    const ruleName = document.createElement('p'); ruleName.className = 'draw-recolor-rule-name';
    ruleName.innerHTML = '<strong>Color harmonies:</strong> '; ruleName.append(harmonyRule(settings.rule).name); host.append(ruleName,rules);
    for (const rule of HARMONY_RULES) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-recolor-rule'; b.append(harmonyIcon(rule));
      b.setAttribute('aria-label',rule.name); b.dataset.tooltip = rule.name; b.dataset.drawRecolorRule = rule.id; b.disabled = ro;
      b.setAttribute('aria-pressed',String(settings.rule === rule.id));
      b.addEventListener('click',() => change(s => { s.rule = rule.id; },'Recolor Harmony')); rules.append(b);
    }
    // The wheel: a canvas background with an SVG of handles on top, in unit coordinates.
    const wrapEl = document.createElement('div'); wrapEl.className = 'draw-recolor-wheel'; host.append(wrapEl);
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden','true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','-1 -1 2 2'); svg.tabIndex = ro ? -1 : 0;
    svg.setAttribute('role','application'); svg.setAttribute('aria-label','Color wheel: drag a color to turn all colors. Ctrl or Cmd: also in and out. Shift: only that color. Arrow keys turn and scale.');
    svg.dataset.drawRecolorWheel = '';
    wrapEl.append(canvas,svg);
    const link = iconButton(settings.linked ? 'Unlink harmony colors' : 'Link harmony colors',settings.linked ? 'link' : 'unlink',() => change(s => { s.linked = !s.linked; },'Recolor Link'),'draw-layer-action draw-recolor-link');
    link.setAttribute('aria-pressed',String(settings.linked)); link.dataset.drawRecolor = 'link'; link.disabled = ro; wrapEl.append(link);
    const prominent = document.createElement('div');
    const paintWheel = () => {
      const s = session.settings, image = wheelImage(s.mode,wheelLevel(s),s.library);
      canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d').putImageData(image,0,0);
      canvas.classList.toggle('is-library',!!s.library);
      const out = recolorHexes(colors,s,recolorLibraryColors(s.library)), places = adjustedColors(colors,s).map(w => wheelPoint(w,s.mode));
      // One handle a group (Colors), base last so it stays on top.
      const group = colorGroups(colors,s.count), baseIndex = group[s.base] ?? s.base;
      const order = [...colors.keys()].filter(i => group[i] === i).sort((a,b) => (a === baseIndex) - (b === baseIndex));
      svg.innerHTML = order.map(i => `<line x1="0" y1="0" x2="${places[i][0]}" y2="${places[i][1]}" class="draw-recolor-spoke"/>`).join('') + '<circle r=".035" class="draw-recolor-centre"/>' + order.map(i => {
        const [x,y] = places[i], base = i === baseIndex;
        return `<g class="draw-recolor-handle${base ? ' is-base' : ''}" data-draw-recolor-handle="${i}" transform="translate(${x} ${y})">${base ? '<circle r=".095" class="draw-recolor-ring"/>' : ''}<circle r="${base ? .07 : .055}" fill="${out[i]}"/></g>`;
      }).join('');
      prominentBar(out,group,baseIndex);
    };
    // Prominent Colors: the new colours by how much they are used; click one to make it the base.
    const prominentTitle = document.createElement('h3'); prominentTitle.className = 'draw-panel__section'; prominentTitle.textContent = 'Prominent Colors';
    prominent.className = 'draw-recolor-prominent'; prominent.setAttribute('role','group'); prominent.setAttribute('aria-label','Prominent colors');
    host.append(prominentTitle,prominent);
    function prominentBar(out, group, baseIndex) {
      prominent.replaceChildren();
      colors.forEach(({ hex },i) => {
        if (group[i] !== i) return;
        const members = colors.filter((_,j) => group[j] === i), weight = members.reduce((sum,c) => sum + c.weight,0), more = members.length > 1 ? ` and ${members.length - 1} more` : '';
        const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-recolor-color'; b.style.flexGrow = String(weight); b.style.background = out[i];
        b.dataset.drawRecolorColor = hex; b.disabled = ro; b.setAttribute('aria-pressed',String(i === baseIndex));
        b.setAttribute('aria-label',`${hex}${more} becomes ${out[i]}${i === baseIndex ? ' (base color)' : ''}`); b.dataset.tooltip = `${hex}${more} → ${out[i]}: click to make it the base color`;
        b.addEventListener('click',() => change(s => { s.base = i; },'Recolor Base Color')); prominent.append(b);
      });
    }
    // Wheel mode and slider: saturation mode adjusts brightness, brightness mode adjusts saturation.
    const foot = document.createElement('div'); foot.className = 'draw-recolor-foot'; host.append(foot);
    const modes = document.createElement('div'); modes.className = 'draw-segmented draw-gradient-types'; modes.setAttribute('role','group'); modes.setAttribute('aria-label','Color wheel display');
    for (const [id,label] of [['saturation','Show saturation and hue on color wheel'],['brightness','Show brightness and hue on color wheel']]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-segmented__option draw-stroke-option'; b.append(icon(panelSpriteHref(`recolor-${id}`)));
      b.setAttribute('aria-label',label); b.dataset.tooltip = label; b.dataset.drawRecolorMode = id; b.setAttribute('aria-pressed',String(settings.mode === id));
      b.addEventListener('click',() => { session.settings.mode = state.ui.recolorMode = id; render(); }); modes.append(b);
    }
    const sliderKey = settings.mode === 'brightness' ? 'saturation' : 'brightness';
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = '-100'; slider.max = '100'; slider.step = '1'; slider.className = 'draw-recolor-slider';
    slider.value = String(Math.round(settings.adjust[sliderKey] * 100)); slider.disabled = ro; slider.dataset.drawField = 'recolor-adjust';
    slider.setAttribute('aria-label',sliderKey === 'brightness' ? 'Adjust brightness' : 'Adjust saturation'); slider.dataset.tooltip = `${slider.getAttribute('aria-label')} of all colors`;
    let sliderKeyMerge = null;
    // Live: the canvas and handles update here, since the panel does not rebuild while the slider has focus.
    slider.addEventListener('input',() => api.run(() => {
      liveEdit = true; sliderKeyMerge ??= `recolor-slider-${Date.now()}`;
      session.settings.adjust[sliderKey] = slider.valueAsNumber / 100; applyRecolor(session,{ label: 'Recolor Adjust', mergeKey: sliderKeyMerge }); paintWheel();
    }));
    slider.addEventListener('change',() => { sliderKeyMerge = null; liveEdit = false; render(); });
    foot.append(modes,slider);
    paintWheel();
    if (ro) return;
    const unit = event => { const r = svg.getBoundingClientRect(); return [(event.clientX - r.left) / (r.width / 2) - 1,(event.clientY - r.top) / (r.height / 2) - 1]; };
    svg.addEventListener('pointerdown',event => {
      const handle = event.target.closest('[data-draw-recolor-handle]'); if (!handle || event.button !== 0) return;
      event.preventDefault(); svg.focus({ preventScroll: true });
      const index = Number(handle.dataset.drawRecolorHandle), places = adjustedColors(colors,session.settings).map(w => wheelPoint(w,session.settings.mode));
      recolorDrag = { index, from: places[index], startPointer: unit(event), start: structuredClone(session.settings), moved: false, mergeKey: `recolor-wheel-${Date.now()}` };
      const move = e => {
        const drag = recolorDrag; if (!drag) return;
        const p = unit(e), offset = [p[0] - drag.startPointer[0],p[1] - drag.startPointer[1]];
        if (!drag.moved && Math.hypot(...offset) < .03) return;
        drag.moved = true;
        // The handle follows the pointer from where it was grabbed.
        session.settings = dragSettings(drag.start,colors,drag.index,drag.from,[drag.from[0] + offset[0],drag.from[1] + offset[1]],{ radial: e.ctrlKey || e.metaKey, single: e.shiftKey });
        api.run(() => { applyRecolor(session,{ label: 'Recolor', mergeKey: drag.mergeKey }); render(); });
      };
      const up = () => {
        window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); window.removeEventListener('pointercancel',up);
        const drag = recolorDrag; recolorDrag = null;
        // A click without moving makes that colour the base.
        if (drag && !drag.moved && drag.index !== session.settings.base) change(s => { s.base = drag.index; },'Recolor Base Color'); else render();
      };
      window.addEventListener('pointermove',move); window.addEventListener('pointerup',up); window.addEventListener('pointercancel',up);
    });
    svg.addEventListener('keydown',event => {
      const step = event.shiftKey ? 15 : 5, radial = session.settings.mode === 'brightness' ? 'brightness' : 'saturation';
      const action = { ArrowLeft: s => { s.rotation += step; }, ArrowRight: s => { s.rotation -= step; },
        ArrowUp: s => { s.scale[radial] = Math.min(4,s.scale[radial] * 1.05); }, ArrowDown: s => { s.scale[radial] = Math.max(0,s.scale[radial] / 1.05); } }[event.key];
      if (!action) return;
      event.preventDefault(); change(action,'Recolor',`recolor-key-${event.key}`);
      queueMicrotask(() => document.querySelector('[data-draw-recolor-wheel]')?.focus());
    });
  }
  /** Gradient, as Illustrator's panel: Recent and Presets, type, the stop slider (drag, click to add, drag off to delete), stop colour, opacity and location. */
  let stopDrag = null;
  /** Freeform: Draw Points or Lines, and the selected point's colour, opacity and spread (points are placed with the Gradient tool). */
  function freeformControls(host, g, edit, ro) {
    const draw = document.createElement('div'); draw.className = 'draw-gradient-head'; host.append(draw);
    const drawLabel = document.createElement('span'); drawLabel.textContent = 'Draw:';
    const modes = document.createElement('div'); modes.className = 'draw-segmented draw-freeform-modes'; modes.setAttribute('role','group'); modes.setAttribute('aria-label','Draw');
    for (const [id,label] of [['points','Point mode'],['lines','Line mode']]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-segmented__option'; b.textContent = label; b.dataset.drawFreeformMode = id;
      b.setAttribute('aria-pressed',String(g.mode === id)); b.disabled = ro;
      b.addEventListener('click',() => api.run(() => edit(current => current.mode === id ? null : setFreeformMode(current,id),'Freeform Mode'))); modes.append(b);
    }
    draw.append(drawLabel,modes);
    const selected = Math.min(state.ui.gradientStop ?? 0, g.points.length - 1), point = g.points[selected];
    const head = document.createElement('div'); head.className = 'draw-gradient-head'; host.append(head);
    const name = document.createElement('span'); name.textContent = `Point ${selected + 1} of ${g.points.length}`; name.dataset.drawFreeformPoint = String(selected);
    const remove = iconButton('Delete point','trash',() => { edit(current => removeFreeformPoint(current,selected),'Delete Gradient Point'); state.ui.gradientStop = Math.max(0,selected - 1); });
    remove.dataset.drawGradientAction = 'delete-point'; remove.disabled = ro || g.points.length <= 1; head.append(name,remove);
    const fields = document.createElement('div'); fields.className = 'draw-fields'; host.append(fields);
    field(fields,'Color',colorHex(point.color)?.toLowerCase() ?? '#000000',value => edit(current => updateFreeformPoint(current,selected,{ color: value.toUpperCase() }),'Gradient Point'),{ type:'color', key:'freeform-color', disabled: ro });
    field(fields,'Opacity (%)',(point.opacity ?? 1) * 100,value => edit(current => updateFreeformPoint(current,selected,{ opacity: value / 100 }),'Gradient Point',`freeform-opacity-${selected}`),{ min:0, max:100, key:'freeform-opacity', disabled: ro });
    field(fields,'Spread (mm)',point.spread ?? 0,value => edit(current => updateFreeformPoint(current,selected,{ spread: value }),'Gradient Point',`freeform-spread-${selected}`),{ min:0, max:10000, key:'freeform-spread', disabled: ro });
    text(host,g.mode === 'lines'
      ? 'With the Gradient tool (G): each click in the artwork continues the line from the selected point; click a line to add a point on it. Drag points to move them; Delete removes the selected one.'
      : 'With the Gradient tool (G): click in the artwork to add a point, drag a point to move it, and drag the handle on its dashed ring to spread its colour. Drag a point out of the artwork or press Delete to remove it.');
  }
  function gradientPanel(host) {
    const target = state.ui.paintFocus === 'stroke' ? 'stroke' : 'fill', ro = state.document.readOnly;
    paintTargets(host,target);
    const node = state.document.getNode(api.paintIds()[0]);
    const entry = node && (target === 'fill' ? node.appearance.fills : node.appearance.strokes)[0], g = isAnyGradient(entry?.paint) ? entry.paint : null;
    const edit = (fn, label, mergeKey = null) => api.gradient(target,fn,{ label, mergeKey });
    const focusedStops = () => state.document.getNode(api.paintIds()[0]).appearance[target === 'fill' ? 'fills' : 'strokes'][0].paint.stops;
    // Recent and Presets (built-in, then the document's gradient swatches): a click applies to the selection.
    const tiles = (title, key, list) => {
      if (!list.length) return;
      const heading = document.createElement('h3'); heading.className = 'draw-panel__section'; heading.textContent = title; host.append(heading);
      const row = document.createElement('div'); row.className = 'draw-gradient-presets'; row.setAttribute('role','group'); row.setAttribute('aria-label',title);
      list.forEach(({ name, gradient },i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-gradient-preset'; b.style.backgroundImage = `${gradientPreviewCss(gradient)}, ${CHECKER}`;
        b.setAttribute('aria-label',name); b.dataset.tooltip = name; b.dataset.drawGradientPreset = `${key}-${i}`; b.disabled = ro || !node;
        b.setAttribute('aria-pressed',String(!!g && isGradient(g) && gradientKey(g) === gradientKey(gradient)));
        b.addEventListener('click',() => api.run(() => { edit((current,box) => applyGradientPreset(current,gradient,box),'Gradient Preset'); state.ui.gradientStop = 0; }));
        row.append(b);
      });
      host.append(row);
    };
    tiles('Recent','recent',savedRecentGradients(state.ui.recentGradients).map((gradient,i) => ({ name: `Recent gradient ${i + 1}`, gradient })));
    tiles('Presets','preset',[...GRADIENT_PRESETS,...(state.document.data.swatches ?? []).filter(s => s.gradient).map(s => ({ name: s.name, gradient: s.gradient }))]);
    if (!node) { text(host,'Select artwork to give its fill or stroke a gradient.'); return; }
    // Thumbnail and type; a type button also gives a solid fill or stroke a gradient.
    const head = document.createElement('div'); head.className = 'draw-gradient-head'; host.append(head);
    const thumb = document.createElement('span'); thumb.className = 'draw-gradient-thumb'; thumb.setAttribute('aria-hidden','true');
    if (g) thumb.style.backgroundImage = `${gradientPreviewCss(g)}, ${CHECKER}`; else thumb.classList.add('is-empty');
    const types = document.createElement('div'); types.className = 'draw-segmented draw-gradient-types'; types.setAttribute('role','group'); types.setAttribute('aria-label','Gradient type');
    for (const [id,label] of [['linear','Linear gradient'],['radial','Radial gradient'],['freeform','Freeform gradient']]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-segmented__option draw-stroke-option'; b.append(icon(panelSpriteHref(`gradient-type-${id}`)));
      b.setAttribute('aria-label',label); b.dataset.tooltip = label; b.dataset.drawGradientType = id; b.setAttribute('aria-pressed',String(g?.type === id));
      // Freeform is for fills, as in Illustrator.
      b.disabled = ro || (id === 'freeform' && target === 'stroke'); if (id === 'freeform' && target === 'stroke') b.dataset.tooltip = 'Freeform gradients are for fills.';
      b.addEventListener('click',() => api.run(() => {
        const last = state.ui.lastGradient;
        edit((current,box) => current?.type === id ? null
          : id === 'freeform' ? freeformFrom(current,box)
          : isFreeform(current) ? defaultGradient(box,{ type: id, stops: stopsFromFreeform(current) })
          : current ? setGradientType(current,id,box) : defaultGradient(box,{ type: id, stops: last?.stops ?? null, angle: id === 'linear' ? last?.angle ?? 0 : 0 }),'Gradient Type');
        state.ui.gradientStop = 0;
      }));
      types.append(b);
    }
    const typeLabel = document.createElement('span'); typeLabel.textContent = 'Type:'; head.append(thumb,typeLabel,types);
    if (!g) {
      const apply = button(`Apply Gradient to ${target === 'fill' ? 'Fill' : 'Stroke'}`,() => api.command('paint-gradient')); apply.dataset.drawGradientApply = ''; apply.disabled = ro; host.append(apply);
      text(host,'Choose a preset or a type, or apply the last gradient you used (white to black the first time).'); return;
    }
    if (isFreeform(g)) { freeformControls(host,g,edit,ro); return; }
    // Stroke: how a stroke takes the gradient, as in Illustrator (only for strokes).
    const strokeRow = document.createElement('div'); strokeRow.className = 'draw-gradient-head draw-gradient-stroke'; host.append(strokeRow);
    const strokeLabel = document.createElement('span'); strokeLabel.textContent = 'Stroke:';
    const modes = document.createElement('div'); modes.className = 'draw-segmented draw-gradient-types'; modes.setAttribute('role','group'); modes.setAttribute('aria-label','Apply gradient to stroke');
    for (const [id,label] of [['within','Apply gradient within stroke'],['along','Apply gradient along stroke'],['across','Apply gradient across stroke']]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-segmented__option draw-stroke-option'; b.append(icon(panelSpriteHref(`gradient-stroke-${id}`)));
      b.setAttribute('aria-label',label); b.dataset.tooltip = target === 'stroke' ? label : 'Choose Stroke to apply a gradient within, along or across it.'; b.dataset.drawGradientStroke = id;
      b.setAttribute('aria-pressed',String(target === 'stroke' && (g.strokeMode ?? 'within') === id)); b.disabled = ro || target !== 'stroke';
      b.addEventListener('click',() => api.run(() => edit(current => (current.strokeMode ?? 'within') === id ? null : setStrokeMode(current,id),label)));
      modes.append(b);
    }
    strokeRow.append(strokeLabel,modes);
    if (g.type === 'linear') { const row = document.createElement('div'); row.className = 'draw-fields'; host.append(row); field(row,'Angle (°)',g.angle,value => edit((current,box) => setGradientAngle(current,value,box),'Gradient Angle'),{ min:-360, max:360, key:'gradient-angle', disabled: ro }); }
    // The slider: one marker per stop. Click the bar to add a stop there; drag a marker to move it,
    // or down off the bar to delete it. A drag is one undo step.
    const stops = g.stops, selected = Math.min(state.ui.gradientStop ?? 0, stops.length - 1);
    const slider = document.createElement('div'); slider.className = 'draw-gradient-slider'; host.append(slider);
    const reverse = iconButton('Reverse gradient','gradient-reverse',() => edit(current => reverseGradient(current),'Reverse Gradient')); reverse.dataset.drawGradientAction = 'reverse'; reverse.disabled = ro;
    const bar = document.createElement('div'); bar.className = 'draw-gradient-bar'; bar.style.backgroundImage = `${gradientCss(g)}, ${CHECKER}`; bar.setAttribute('role','group'); bar.setAttribute('aria-label','Gradient stops');
    bar.dataset.tooltip = 'Click to add a stop';
    const remove = iconButton('Delete stop','trash',() => { edit(current => removeStop(current,selected),'Delete Gradient Stop'); state.ui.gradientStop = Math.max(0,selected - 1); }); remove.dataset.drawGradientAction = 'delete'; remove.disabled = ro || stops.length <= 2;
    slider.append(reverse,bar,remove);
    bar.addEventListener('pointerdown',event => {
      if (ro || event.button !== 0 || event.target !== bar) return;
      const r = bar.getBoundingClientRect(), at = Math.min(1,Math.max(0,(event.clientX - r.left) / (r.width || 1)));
      api.run(() => { edit(current => addStop(current,at),'Add Gradient Stop'); state.ui.gradientStop = Math.max(0,focusedStops().findIndex(s => s.offset === at)); render(); });
    });
    stops.forEach((stop,i) => {
      const marker = document.createElement('button'); marker.type = 'button'; marker.className = 'draw-gradient-stop'; marker.style.left = `${stop.offset * 100}%`;
      marker.style.setProperty('--stop-color',colorHex(stop.color) ?? '#000000'); marker.dataset.drawGradientStop = String(i);
      marker.setAttribute('aria-label',`Stop ${i + 1} at ${Math.round(stop.offset * 100)} %`); marker.setAttribute('aria-pressed',String(i === selected));
      if (stopDrag?.removing && stopDrag.index === i) marker.classList.add('is-removing');
      marker.addEventListener('click',() => { state.ui.gradientStop = i; render(); });
      // Arrow keys move the stop (Shift: 10 %); Delete removes it.
      marker.addEventListener('keydown',event => {
        if (ro || !['ArrowLeft','ArrowRight','Delete','Backspace'].includes(event.key)) return; event.preventDefault();
        if (event.key === 'Delete' || event.key === 'Backspace') { if (stops.length > 2) { state.ui.gradientStop = i; api.run(() => { edit(current => removeStop(current,i),'Delete Gradient Stop'); state.ui.gradientStop = Math.max(0,i - 1); }); } return; }
        const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowLeft' ? -1 : 1) / 100;
        api.run(() => { let index = i; edit(current => { const moved = moveStop(current,i,stop.offset + step); index = moved.index; return moved.gradient; },'Move Gradient Stop',`gradient-key-${i}`); state.ui.gradientStop = index; });
        queueMicrotask(() => host.querySelector(`[data-draw-gradient-stop="${state.ui.gradientStop}"]`)?.focus());
      });
      marker.addEventListener('pointerdown',event => {
        if (ro || event.button !== 0) return; event.preventDefault();
        state.ui.gradientStop = i;
        stopDrag = { index: i, startX: event.clientX, startY: event.clientY, moved: false, removing: false, rect: bar.getBoundingClientRect(), mergeKey: `gradient-stop-${Date.now()}` };
        const move = e => {
          const drag = stopDrag; if (!drag) return;
          if (!drag.moved && Math.hypot(e.clientX - drag.startX,e.clientY - drag.startY) < 3) return;
          drag.moved = true;
          // Far below the bar the stop is marked for removal; it goes when released there.
          const removing = stops.length > 2 && e.clientY > drag.rect.bottom + 28;
          const at = Math.min(1,Math.max(0,(e.clientX - drag.rect.left) / (drag.rect.width || 1)));
          if (!removing) api.run(() => { let index = drag.index; edit(current => { const moved = moveStop(current,drag.index,at); index = moved.index; return moved.gradient; },'Move Gradient Stop',drag.mergeKey); drag.index = index; state.ui.gradientStop = index; });
          if (removing !== drag.removing) { drag.removing = removing; render(); }
        };
        const up = () => {
          window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); window.removeEventListener('pointercancel',up);
          const drag = stopDrag; stopDrag = null; if (!drag) return;
          if (drag.removing) api.run(() => { edit(current => removeStop(current,drag.index),'Delete Gradient Stop',drag.mergeKey); state.ui.gradientStop = Math.max(0,drag.index - 1); });
          if (drag.moved) api.rememberGradient(target);
          render();
        };
        window.addEventListener('pointermove',move); window.addEventListener('pointerup',up); window.addEventListener('pointercancel',up);
      });
      bar.append(marker);
    });
    const stop = stops[selected], fields = document.createElement('div'); fields.className = 'draw-fields'; host.append(fields);
    field(fields,'Color',colorHex(stop.color)?.toLowerCase() ?? '#000000',value => edit(current => updateStop(current,selected,{ color: value.toUpperCase() }),'Gradient Stop'),{ type:'color', key:'gradient-stop-color', disabled: ro });
    field(fields,'Opacity (%)',(stop.opacity ?? 1) * 100,value => edit(current => updateStop(current,selected,{ opacity: value / 100 }),'Gradient Stop',`gradient-opacity-${selected}`),{ min:0, max:100, key:'gradient-stop-opacity', disabled: ro });
    field(fields,'Location (%)',stop.offset * 100,value => { let index = selected; edit(current => { const moved = moveStop(current,selected,value / 100); index = moved.index; return moved.gradient; },'Gradient Stop',`gradient-location-${selected}`); state.ui.gradientStop = index; },{ min:0, max:100, key:'gradient-stop-location', disabled: ro });
    const actions = document.createElement('div'); actions.className = 'draw-gradient-actions'; host.append(actions);
    const add = iconButton('Add stop','plus',() => { edit(current => addStop(current),'Add Gradient Stop'); }); add.dataset.drawGradientAction = 'add'; add.disabled = ro;
    actions.append(add);
    text(host,g.type === 'linear' ? 'Click the slider to add a stop; drag a stop down off it to delete. Drag across the artwork with the Gradient tool (G) to set the direction.' : 'Radial gradients run from the centre outward. Click the slider to add a stop; drag a stop down off it to delete.');
  }
  /** History: every undo step, oldest first; clicking a step undoes or redoes to it. Steps after the current one are greyed out. */
  function historyPanel(host) {
    const entries = state.history.entries, current = entries.filter(entry => entry.applied).length;
    const list = document.createElement('ol'); list.className = 'draw-history'; list.setAttribute('aria-label','History');
    [{ label: 'Open' }, ...entries].forEach((entry,index) => {
      const item = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.className = 'draw-history__step';
      b.dataset.drawHistory = String(index); b.textContent = entry.label; b.disabled = state.document.readOnly;
      b.classList.toggle('is-undone',index > current); b.setAttribute('aria-current',String(index === current));
      b.addEventListener('click',() => api.historyGoTo(index)); item.append(b); list.append(item);
    });
    // Snapshots above the steps: click one to return the document to it (one undo step).
    const snaps = api.historySnapshots?.() ?? [];
    if (snaps.length) {
      const shots = document.createElement('ul'); shots.className = 'draw-history draw-history--snapshots'; shots.setAttribute('aria-label','Snapshots');
      for (const snap of snaps) {
        const item = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.className = 'draw-history__step';
        b.dataset.drawSnapshot = snap.id; b.textContent = snap.name; b.disabled = state.document.readOnly; b.addEventListener('click',() => api.historyRevert(snap.id));
        const remove = iconButton(`Delete ${snap.name}`,'trash',() => api.historyDeleteSnapshot(snap.id)); remove.dataset.drawSnapshotDelete = snap.id;
        item.append(b, remove); shots.append(item);
      }
      host.append(shots);
    }
    host.append(list);
    const actions = document.createElement('div'); actions.className = 'draw-panel__row';
    const shot = button('New Snapshot',() => api.historySnapshot()); shot.dataset.drawHistorySnapshot = ''; shot.disabled = state.document.readOnly;
    const drop = button('Delete State',() => api.historyDeleteState()); drop.dataset.drawHistoryDelete = ''; drop.disabled = state.document.readOnly || !current;
    actions.append(shot, drop); host.append(actions);
    text(host,entries.length ? `${current} of ${entries.length} steps applied. Click a step to go back or forward to it.` : 'Edits appear here as you make them.');
    list.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }
  /** Info: the pointer position, the selection's bounds and paint, and the last Measure tool reading. */
  function infoPanel(host) {
    const grid = document.createElement('dl'); grid.className = 'draw-info'; host.append(grid);
    const row = (key, label, value) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; dd.dataset.drawInfo = key; grid.append(dt,dd); };
    const mm = value => Number.isFinite(value) ? `${value.toFixed(2)} mm` : '';
    const point = api.pointer();
    row('x','X',point ? mm(point.x) : ''); row('y','Y',point ? mm(point.y) : '');
    const box = api.selectedIds().length ? api.bounds() : null;
    row('width','W',box ? mm(box.width) : ''); row('height','H',box ? mm(box.height) : '');
    if (box) { row('left','Left',mm(box.x)); row('top','Top',mm(box.y)); }
    const node = state.document.getNode(api.paintIds()[0]);
    if (node?.appearance) {
      const describe = entry => !entry ? 'None' : isAnyGradient(entry.paint) ? `${({ radial: 'Radial', freeform: 'Freeform' })[entry.paint.type] ?? 'Linear'} gradient` : paintHex(entry)?.toUpperCase() ?? 'None';
      row('fill','Fill',describe(node.appearance.fills[0]));
      const stroke = node.appearance.strokes[0]; row('stroke','Stroke',describe(stroke) + (stroke ? ` · ${Number(stroke.width ?? 0).toFixed(2)} mm` : ''));
    }
    // Text: characters and words of the selected text objects, as Illustrator's Info panel shows them.
    const texts = api.selectedIds().map(id => state.document.getNode(id)).filter(n => n?.type === 'text');
    if (texts.length) {
      const content = texts.map(n => (n.content?.runs ?? []).map(r => r.text).join('')).join('\n');
      row('characters','Characters',String([...content.replace(/\n/g,'')].length)); row('words','Words',String(content.split(/\s+/).filter(Boolean).length));
    }
    const m = state.ui.measurement;
    if (m) { row('distance','D',mm(m.distance)); row('angle','Angle',`${m.angle.toFixed(1)}°`); }
  }
  /** Document Info: the whole document, or the selection, with what matters before Send to Cut. */
  function documentInfoPanel(host) {
    const ids = api.selectedIds(), scope = state.ui.documentInfoScope === 'selection' && ids.length ? 'selection' : 'document';
    const pick = document.createElement('select'); pick.className = 'select'; pick.dataset.drawField = 'document-info-scope';
    pick.append(new Option('Document','document'),new Option('Selection only','selection')); pick.value = scope;
    pick.addEventListener('change',() => { state.ui.documentInfoScope = pick.value; render(); }); host.append(pick);
    const info = documentInfo(state.document, scope === 'selection' ? ids : null);
    const grid = document.createElement('dl'); grid.className = 'draw-info'; host.append(grid);
    const row = (key, label, value) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = String(value); dd.dataset.drawDocInfo = key; grid.append(dt,dd); };
    if (scope === 'document') { row('artboards','Artboards',info.artboards); row('layers','Layers',info.layers); }
    for (const o of info.objects) row(o.label.toLowerCase().replace(/\s+/g,'-'),o.label,o.count);
    row('anchors','Anchor points',info.anchors); row('open-paths','Open paths',info.openPaths); row('clipping','Clipping masks',info.clipping);
    row('effects','Objects with effects',info.effects); row('hidden','Hidden or not printing',info.hidden);
    const section = (title, items, line) => { const h = document.createElement('h3'); h.className = 'draw-panel__section'; h.textContent = title; host.append(h);
      if (!items.length) { text(host,'None'); return; } const ul = document.createElement('ul'); ul.className = 'draw-doc-info-list'; for (const item of items) { const li = document.createElement('li'); li.textContent = line(item); ul.append(li); } host.append(ul); };
    section('Fonts',info.fonts,f => `${f.family} ${f.weight === 'normal' ? 'Regular' : f.weight === 'bold' ? 'Bold' : f.weight}${f.style === 'italic' ? ' Italic' : ''} (${f.source === 'google' ? 'Google' : 'installed'}, ${f.count} text${f.count === 1 ? '' : 's'})`);
    section('Images',info.images,i => `${i.name}: ${i.pixels} px, ${i.ppi} ppi${i.cropped ? ', cropped' : ''}${i.reference ? ', reference' : ''}`);
    if (info.openPaths || info.emptyText) text(host,'Before Send to Cut: open paths are cut as lines, and empty text is left out.');
  }
  /** Live tracing is a view overlay until Expand commits one undoable edit. */
  function imageTracePanel(host) {
    const ids = api.selectedIds(), id = ids.length === 1 && state.document.getNode(ids[0])?.type === 'image' ? ids[0] : null;
    const o = state.ui.traceOptions ??= { preset: 'bw-logo', ...TRACE_PRESETS['bw-logo'] };
    const disabled = state.document.readOnly || !id || !state.document.isEditable(id), fields = document.createElement('fieldset');
    fields.className = 'draw-trace'; fields.disabled = disabled; host.append(fields);
    const select = (label, key, value, options, change) => { const row = document.createElement('label'); row.className = 'draw-trace__select'; const name = document.createElement('span'); name.textContent = label; name.title = label;
      const input = document.createElement('select'); input.className = 'select'; input.dataset.drawField = key; for (const [v,l] of options) input.append(new Option(l,v)); input.value = value;
      input.addEventListener('change',() => change(input.value)); row.append(name,input); fields.append(row); return input; };
    const preset = select('Preset','trace-preset',o.preset,[...Object.entries(TRACE_PRESETS).map(([k,p]) => [k,p.label]),['custom','Custom']],value => {
      if (value === 'custom') { o.preset = value; return; }
      state.ui.traceOptions = { preset:value, corners:80, fills:true, strokes:false, ...TRACE_PRESETS[value] }; render();
    });
    select('View','trace-view',state.ui.traceView ?? 'result',[['result','Tracing Result'],['outlines','Outlines'],['source','Source Image']],value => { state.ui.traceView = value; api.showTracePreview(); });
    select('Mode','trace-mode',o.mode,[['bw','Black and White'],['gray','Grayscale'],['color','Color']],value => { o.mode = value; o.colors ??= 6; o.preset = 'custom'; render(); });
    const changed = () => { o.preset = 'custom'; preset.value = 'custom'; strokeControls.querySelectorAll('input').forEach(input => { input.disabled = !o.strokes; }); request(); };
    const slider = (parent,label,key,min,max,fallback,unit='',step=1) => {
      const row = document.createElement('label'); row.className = 'draw-trace__slider';
      const name = document.createElement('span'); name.textContent = label; name.title = label;
      const range = document.createElement('input'); range.type = 'range'; range.min = min; range.max = max; range.step = step; range.value = o[key] ?? fallback; range.dataset.drawField = `trace-${key}-slider`; range.setAttribute('aria-label',label);
      const value = document.createElement('input'); value.type = 'number'; value.min = min; value.max = max; value.step = step; value.value = range.value; value.dataset.drawField = `trace-${key}`; value.setAttribute('aria-label',label);
      const number = document.createElement('span'); number.className = 'draw-trace__number'; number.append(value);
      if (unit) { const suffix = document.createElement('span'); suffix.textContent = unit; number.append(suffix); }
      for (const input of [range,value]) for (const event of ['input','change']) input.addEventListener(event,() => {
        const next = input.valueAsNumber;
        if (!Number.isFinite(next) || next < min || next > max) { if (event === 'change') value.value = range.value; return; }
        range.value = value.value = String(next); o[key] = next; changed();
      });
      row.append(name,range,number); parent.append(row); return row;
    };
    if (o.mode === 'bw') slider(fields,'Threshold','threshold',0,255,128);
    else slider(fields,o.mode === 'gray' ? 'Grays' : 'Colors','colors',2,256,6);
    const advanced = document.createElement('details'); advanced.className = 'draw-trace__advanced'; advanced.open = !!state.ui.traceAdvanced;
    const summary = document.createElement('summary'); summary.textContent = 'Advanced'; advanced.append(summary);
    advanced.addEventListener('toggle',() => { state.ui.traceAdvanced = advanced.open; placeFlyout(); }); fields.append(advanced);
    slider(advanced,'Paths','fidelity',0,100,70,'%'); slider(advanced,'Corners','corners',0,100,80,'%'); slider(advanced,'Noise','noise',0,100,4,'px²');
    const create = document.createElement('div'); create.className = 'draw-trace__create'; advanced.append(create);
    const fills = check(create,'Fills','trace-fills',o.fills !== false,value => { o.fills = value; if (!value && !o.strokes) { o.strokes = true; strokes.checked = true; } changed(); });
    const strokes = check(create,'Strokes','trace-strokes',!!o.strokes,value => { o.strokes = value; if (!value && o.fills === false) { o.fills = true; fills.checked = true; } strokeControls.querySelectorAll('input').forEach(input => { input.disabled = !value; }); changed(); });
    const strokeControls = slider(advanced,'Stroke width','strokeWidth',.05,5,.2,'mm',.05);
    strokeControls.querySelectorAll('input').forEach(input => { input.disabled = !o.strokes; });
    slider(advanced,'Min detail','minDetailMm',0,5,0,'mm',.05);
    for (const [label,key] of [['Ignore White','ignoreWhite'],['Outer contours only','outerOnly']]) check(advanced,label,`trace-${key}`,!!o[key],value => { o[key] = value; changed(); });
    const stats = document.createElement('p'); stats.className = 'draw-panel__hint draw-trace__stats'; stats.dataset.drawTraceStats = ''; stats.setAttribute('role','status'); host.append(stats);
    const actions = document.createElement('div'); actions.className = 'draw-trace__actions'; host.append(actions);
    check(actions,'Preview','trace-preview',state.ui.traceLive !== false,value => { state.ui.traceLive = value; request(); });
    const go = button('Expand',async () => { go.disabled = true; const result = await api.traceImage(id,{ ...o }); if (result) state.ui.traceStats = result; render(); });
    go.className = 'btn btn--primary btn--sm'; go.dataset.drawTrace = ''; actions.append(go);
    const update = status => {
      stats.textContent = status.pending ? 'Tracing…' : status.error ? status.error : status.stats ? `Paths: ${status.stats.paths} · Anchors: ${status.stats.anchors} · Colors: ${status.stats.colors}` : '';
      stats.dataset.tracePending = String(!!status.pending); go.disabled = disabled || !!status.pending || !!status.error || status.stats?.paths === 0;
      if (status.stats?.paths === 0) stats.textContent = 'Nothing to trace with these settings. Try another threshold or preset.';
    };
    function request() {
      if (!disabled && state.ui.traceLive !== false) api.previewTrace(id,{...o},update);
      else { api.clearTracePreview(); update({stats:!id ? state.ui.traceStats : null}); }
    }
    request();
    text(host,!id ? 'Select a placed image to trace it.' : 'Adjust settings to preview. Expand creates editable paths.');
  }
  /**
   * Glyphs (D5): every character of the selected text's font (or the default font). A click puts it in the
   * text being edited, at the cursor; with a text object selected and no editor open, the editor opens first.
   */
  const glyphCache = new Map();
  function glyphsPanel(host) {
    const node = state.document.getNode(api.selectedIds()[0]), textNode = node?.type === 'text' ? node : null;
    // Without a text object the default font is shown, or the first installed one when it is missing.
    const defaults = textDefaults(state.ui), families = textNode || defaults.fontSource === 'google' ? null : api.fontFamilies?.() ?? [];
    if (families && !families.length) { text(host,'Reading the fonts…'); return; }
    const family = families && !families.includes(defaults.fontFamily) ? families[0] : defaults.fontFamily;
    const values = textNode ? textValues(textNode) : { ...defaults, fontFamily: family, text: '' }, key = JSON.stringify([values.fontFamily, values.fontWeight, values.fontStyle, values.fontPostscriptName ?? null, values.fontSource ?? null]);
    const entry = glyphCache.get(key);
    if (!entry) {
      glyphCache.set(key, { loading: true });
      Promise.resolve(window.modcut?.fontCharacters?.(values)).then(result => { glyphCache.set(key, result ?? { error: 'Glyphs are not available here.' }); render(); },
        error => { glyphCache.set(key, { error: error.message || 'The font could not be read.' }); render(); });
    }
    if (!entry || entry.loading) { text(host,'Reading the font…'); return; }
    if (entry.error) { text(host,entry.error); return; }
    const title = document.createElement('p'); title.className = 'draw-panel__hint'; title.dataset.drawGlyphsFont = '';
    title.textContent = `${entry.family}${entry.style ? ` ${entry.style}` : ''} · ${entry.count} characters${entry.count > entry.characters.length ? ` (first ${entry.characters.length})` : ''}`; host.append(title);
    const grid = document.createElement('div'); grid.className = 'draw-glyphs'; grid.setAttribute('role','grid'); grid.style.fontFamily = `"${entry.family}"`; host.append(grid);
    const recent = state.ui.recentGlyphs ?? [];
    for (const code of [...recent, ...entry.characters.filter(c => !recent.includes(c))]) {
      const ch = String.fromCodePoint(code), b = document.createElement('button'); b.type = 'button'; b.className = 'draw-glyph'; b.textContent = ch; b.dataset.drawGlyph = String(code);
      b.title = `U+${code.toString(16).toUpperCase().padStart(4,'0')}`; b.setAttribute('aria-label',`${ch} ${b.title}`);
      b.addEventListener('click',() => api.run(() => { state.ui.recentGlyphs = [code, ...recent.filter(c => c !== code)].slice(0,16); api.insertGlyph(ch); }));
      grid.append(b);
    }
  }
  /** Asset Export: objects to export as their own files, one scale and format for all, into a folder. */
  function assetExportPanel(host) {
    const assets = (state.document.data.exportAssets ?? []).filter(a => state.document.getNode(a.nodeId)), readOnly = state.document.readOnly, o = state.ui.assetExport ??= { format: 'png', scale: '1x' };
    if (!assets.length) text(host,'Select objects and add them; each one is exported as its own file, cut to its edges.');
    const list = document.createElement('div'); list.className = 'draw-appearance-list draw-assets'; list.setAttribute('role','list');
    for (const asset of assets) {
      const row = document.createElement('div'); row.className = 'draw-appearance-row'; row.setAttribute('role','listitem'); row.dataset.drawAsset = asset.id;
      const name = document.createElement('input'); name.type = 'text'; name.className = 'input draw-asset-name'; name.value = asset.name; name.disabled = readOnly; name.setAttribute('aria-label','Asset name');
      name.addEventListener('change',() => api.run(() => api.renameAsset(asset.id,name.value)));
      const show = iconButton('Select','focus-2',() => api.select([asset.nodeId]),'draw-layer-action');
      const remove = iconButton('Remove from Asset Export','trash',() => api.run(() => api.removeAsset(asset.id)),'draw-layer-action'); remove.disabled = readOnly; remove.dataset.drawAssetRemove = asset.id;
      row.append(name,show,remove); list.append(row);
    }
    host.append(list);
    const add = button('Add Selection',() => api.run(() => api.addAssets())); add.className = 'btn btn--sm'; add.dataset.drawAssetAdd = ''; add.disabled = readOnly || !api.selectedIds().length; host.append(add);
    const fields = document.createElement('div'); fields.className = 'draw-fields'; host.append(fields);
    const select = (label, key, options) => { const row = document.createElement('label'); row.className = 'draw-field'; const n = document.createElement('span'); n.textContent = label;
      const input = document.createElement('select'); input.className = 'select'; input.dataset.drawField = `asset-${key}`; for (const [v,l] of options) input.append(new Option(l,v)); input.value = o[key];
      input.addEventListener('change',() => { o[key] = input.value; }); row.append(n,input); fields.append(row); };
    select('Scale','scale',[['0.5x','0.5x'],['1x','1x'],['2x','2x'],['3x','3x'],['72 ppi','72 ppi'],['150 ppi','150 ppi'],['300 ppi','300 ppi']]);
    select('Format','format',[['png','PNG'],['jpg','JPEG'],['webp','WebP'],['svg','SVG']]);
    const go = button('Export…',() => api.exportAssets({ ...o })); go.className = 'btn btn--primary btn--sm'; go.dataset.drawAssetExport = ''; go.disabled = !assets.length; host.append(go);
  }
  /** Navigator: the whole document small, with the visible area boxed; click or drag to move there; zoom below. */
  function navigatorPanel(host) {
    const { url, area } = api.navigatorImage(220), wrap = document.createElement('div'); wrap.className = 'draw-navigator'; wrap.dataset.drawNavigator = '';
    const img = document.createElement('img'); img.src = url; img.alt = 'Document overview'; img.draggable = false;
    const box = document.createElement('div'); box.className = 'draw-navigator__view'; wrap.append(img,box); host.append(wrap);
    const place = () => { const v = api.navigatorView(), sx = 100 / area.width, sy = 100 / area.height;
      Object.assign(box.style,{ left: `${(v.x - area.x) * sx}%`, top: `${(v.y - area.y) * sy}%`, width: `${v.width * sx}%`, height: `${v.height * sy}%` }); return v; };
    const go = event => { const r = img.getBoundingClientRect(); api.navigateTo([area.x + (event.clientX - r.left) / r.width * area.width, area.y + (event.clientY - r.top) / r.height * area.height]); };
    wrap.addEventListener('pointerdown',event => { wrap.setPointerCapture(event.pointerId); go(event); const move = e => go(e), up = () => { wrap.removeEventListener('pointermove',move); wrap.removeEventListener('pointerup',up); };
      wrap.addEventListener('pointermove',move); wrap.addEventListener('pointerup',up); });
    const v = place();
    field(host,'Zoom (%)',Math.round(v.zoom),value => api.navigateTo(null,value),{ min: .01, max: 10000, key: 'navigator-zoom', scrubbable: false });
    navigatorPlace = place;
  }
  let navigatorPlace = null;
  /** Graphic Styles: click a style to give it to the selection; New makes one from the selected object. */
  function graphicStylesPanel(host) {
    const ids = api.selectedIds(), readOnly = state.document.readOnly, styles = graphicStyles(state.document);
    const grid = document.createElement('div'); grid.className = 'draw-style-grid'; grid.setAttribute('role','list'); host.append(grid);
    for (const style of styles) {
      const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'draw-style-tile'; tile.dataset.drawStyle = style.id;
      tile.title = style.name; tile.setAttribute('aria-label',style.name); tile.setAttribute('role','listitem'); tile.setAttribute('aria-pressed',String(state.ui.graphicStyle === style.id));
      const fill = style.appearance.fills.find(e => !e.hidden), stroke = style.appearance.strokes.find(e => !e.hidden);
      tile.style.background = fill?.paint?.type === 'solid' ? paintHex(fill) : fill?.paint && isAnyGradient(fill.paint) ? gradientCss(fill.paint) : 'transparent';
      if (stroke) tile.style.boxShadow = `inset 0 0 0 ${Math.min(6,Math.max(1,stroke.width*3))}px ${paintHex(stroke) ?? '#000'}`;
      tile.style.opacity = String(Math.max(.2,style.opacity ?? 1));
      tile.addEventListener('click',() => api.run(() => { state.ui.graphicStyle = style.id;
        if (api.selectedIds().length && !readOnly) state.history.transaction('Apply Graphic Style',() => applyStyleCommands(state.document,api.selectedIds(),style).forEach(c => state.history.execute(c)));
        else render(); }));
      grid.append(tile);
    }
    const row = document.createElement('div'); row.className = 'draw-flip-row';
    const add = button('New Graphic Style',() => api.run(() => { const node = state.document.getNode(api.selectedIds()[0]);
      const style = styleFrom(node,`Graphic Style ${graphicStyles(state.document).length}`); state.history.execute(addStyleCommand(state.document,style)); state.ui.graphicStyle = style.id; }));
    add.className = 'btn btn--sm'; add.dataset.drawStyleNew = ''; add.disabled = readOnly || !ids.length;
    const remove = button('Delete',() => api.run(() => { state.history.execute(removeStyleCommand(state.document,state.ui.graphicStyle)); state.ui.graphicStyle = null; }));
    remove.className = 'btn btn--sm'; remove.dataset.drawStyleDelete = ''; remove.disabled = readOnly || !state.ui.graphicStyle || state.ui.graphicStyle === 'default' || !styles.some(s => s.id === state.ui.graphicStyle);
    row.append(add,remove); host.append(row);
    text(host,ids.length ? 'Click a style to give the selected objects its fills, strokes, effects and opacity.' : 'Select objects to apply a style, or to make a new one from their look.');
  }
  /** Links: every placed image, embedded in the document. Click to select; Replace keeps its place. */
  function linksPanel(host) {
    const images = state.document.descendants(null).filter(n => n.type === 'image');
    if (!images.length) { text(host,'Placed images appear here.'); return; }
    const list = document.createElement('div'); list.className = 'draw-appearance-list draw-links'; list.setAttribute('role','list');
    for (const n of images) {
      const asset = state.document.data.assets[n.assetId], row = document.createElement('div'); row.className = 'draw-appearance-row'; row.setAttribute('role','listitem'); row.dataset.drawLink = n.id;
      const name = button(`${n.name || 'Image'} · ${asset ? `${asset.width} × ${asset.height} px` : '?'} · ${Math.round(n.ppiEffective ?? 0)} ppi · Embedded`,() => api.select([n.id]));
      name.className = 'draw-appearance-name'; name.setAttribute('aria-pressed',String(api.selectedIds().includes(n.id)));
      const replace = iconButton('Replace image…','link',() => api.replaceImage(n.id),'draw-layer-action'); replace.disabled = state.document.readOnly || !state.document.isEditable(n.id); replace.dataset.drawLinkReplace = n.id;
      row.append(name,replace); list.append(row);
    }
    host.append(list); text(host,'Images are embedded in the document, so it opens anywhere. Replace keeps the position and width.');
  }
  /** Updates the Info panel in place as the pointer moves, without rebuilding the other panels. */
  function updateInfo() {
    for (const host of panelWindows.bodies()) {
      if (host.dataset.drawPanelBody === 'navigator' && navigatorPlace) {
        const v = navigatorPlace(), zoom = host.querySelector('[data-draw-field=navigator-zoom]');
        if (zoom && document.activeElement !== zoom) zoom.value = String(Math.round(v.zoom));
      } else if (host.dataset.drawPanelBody === 'info') { host.replaceChildren(); infoPanel(host); }
    }
  }
  const PANEL_CONTENT = { gradient: gradientPanel, recolor: recolorPanel, character: host => characterPanel(host), paragraph: host => paragraphPanel(host), swatches: swatchesPanel, color: colorPanel, stroke: strokePanel, transparency: transparencyPanel, pathfinder: pathfinderPanel, appearance: appearancePanel, transform: host => transform(host), align: alignPanel, artboards: artboardPanel, history: historyPanel, info: infoPanel, 'document-info': documentInfoPanel, links: linksPanel, 'image-trace': imageTracePanel, 'graphic-styles': graphicStylesPanel, navigator: navigatorPanel, 'asset-export': assetExportPanel, glyphs: glyphsPanel };
  function render() {
    scaleStrokes.checked = state.ui.scaleStrokes !== false;
    propertiesFooter.hidden = state.ui.tool === 'artboard';
    // A slider drag or color-picker session updates the canvas live; rebuilding would interrupt it.
    if (liveEdit && [...panelWindows.bodies(),primary,controlBar].some(host => host.contains(document.activeElement))) return;
    liveEdit = false;
    primary.replaceChildren(); dock.layers.body.replaceChildren();
    if (state.document.readOnly) text(primary,state.warning || 'Read-only document');
    propertiesPanel(primary); layerPanel(dock.layers.body);
    controlBar.replaceChildren(); controlBar.hidden = state.ui.controlBar === false; if (!controlBar.hidden) controlBarContent(controlBar);
    panelWindows.render();
    if (!panelWindows.bodies().some(host => host.dataset.drawPanelBody === 'image-trace')) api.clearTracePreview();
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
    if (ids.length === 1 && state.document.getNode(ids[0])?.type === 'image') {
      const trace = button('Image Trace',() => open('image-trace')); trace.dataset.drawCb = 'image-trace'; trace.disabled = ro || !state.document.isEditable(ids[0]); trace.setAttribute('aria-haspopup','dialog');
      group('Image Trace').append(trace);
    }
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
    const texts = selectedText();
    if (texts.length || textToolActive()) {
      // Character and Paragraph, as Illustrator's Control panel shows them for type.
      const v = api.textValues?.() ?? (texts.length ? textValues(texts[0]) : textDefaults(state.ui)), typeGroup = group('Character'), tro = ro || texts.some(n => !state.document.isEditable(n.id));
      const font = fontBrowser(typeGroup,v,{choose:next=>api.textStyle(next,'Font'),sample:api.fontSample,disabled:tro,key:'cb-font-family'});
      font.closest('label').classList.add('draw-cb-field','draw-cb-field--text');
      num(typeGroup,'Size',v.fontSize,value => api.textStyle({ fontSize: value },'Font Size'),{ key:'cb-font-size', min:.1, max:10000, step:1, disabled: tro, scrubbable: false });
      const para = group('Paragraph');
      for (const [label,iconId,value] of [['Align left','align-left','left'],['Align center','align-center','center'],['Align right','align-right','right']]) {
        const b = iconButton(label,iconId,() => api.textStyle({ alignment: value },'Paragraph Alignment'),'draw-layer-action'); b.dataset.drawCbParagraph = value;
        b.setAttribute('aria-pressed',String((v.alignment ?? 'left') === value)); b.disabled = tro; para.append(b);
      }
    }
    if (!ids.length) {
      const doc = group('Document');
      for (const [label,panel] of [['Artboards…','artboards'],['Swatches…','swatches']]) { const b = button(label,() => open(panel)); b.dataset.drawCb = panel; doc.append(b); }
      return;
    }
    const opacity = state.document.getNode(ids[0])?.opacity ?? 1;
    num(group('Opacity'),'Opacity',opacity*100,value => state.history.transaction('Opacity',() => { for (const id of api.selectedIds()) state.history.execute(updateNode(id,{opacity:value/100})); }),
      { key:'cb-opacity', min:0, max:100, step:1, disabled: ro });
    const align = group('Align');
    for (const [label,iconId,mode] of [['Horizontal align left','layout-align-left','left'],['Horizontal align center','layout-align-center','centerX'],['Horizontal align right','layout-align-right','right'],
      ['Vertical align top','layout-align-top','top'],['Vertical align center','layout-align-middle','centerY'],['Vertical align bottom','layout-align-bottom','bottom']]) {
      const b = iconButton(label,iconId,() => api.alignPanel('align',mode),'draw-layer-action'); b.dataset.drawCbAlign = mode; b.disabled = ro; align.append(b);
    }
    const distribute = group('Distribute Spacing'), editable = ids.filter(id => state.document.isEditable(id));
    for (const [label,iconId,axis] of [['Horizontal distribute space','spacing-horizontal','x'],['Vertical distribute space','spacing-vertical','y']]) {
      // Toolbar distribution always uses the outer selected objects, regardless of Align To in the panel.
      const b = iconButton(label,iconId,() => api.alignPanel('spacing',axis,{ alignTo:'selection' }),'draw-layer-action');
      b.dataset.drawCbDistribute = axis; b.dataset.tooltip = axis === 'x' ? 'Equal horizontal gaps; first and last objects stay in place.' : 'Equal vertical gaps; first and last objects stay in place.';
      b.disabled = ro || editable.length < 3; distribute.append(b);
    }
    const size = button('Position and size…',() => open('transform'));
    size.dataset.drawCb = 'transform'; size.setAttribute('aria-haspopup','dialog');
    group('Position and size').append(size);
    const shapes = ids.filter(id => state.document.getNode(id)?.type === 'shape' && state.document.isEditable(id));
    const images = ids.filter(id => state.document.getNode(id)?.type === 'image');
    const actions = group('Quick actions');
    for (const [label,action,key,show] of [['Expand Shape',() => api.expandShapes(shapes),'expand-shape',shapes.length],['Use as Template',() => api.command('use-as-template'),'use-as-template',images.length]]) {
      if (!show) continue; const b = button(label,action); b.dataset.drawCb = key; b.disabled = ro; actions.append(b);
    }
  }
  render(); return { render, open, close, updateInfo, destroy() { panelWindows.destroy(); } };
}
