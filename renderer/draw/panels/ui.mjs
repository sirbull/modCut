import { PANEL_DEFINITIONS, panelIconHref } from './registry.mjs';
import { createNode } from '../doc/schema.mjs';
import { insertNode, updateNode, updateArtboard } from '../doc/commands.mjs';
import { appearance } from '../geometry.mjs';

export function icon(href) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
  const use = document.createElementNS(svg.namespaceURI,'use'); use.setAttribute('href',href); svg.append(use);
  return svg;
}
export function createPanels(shell, state, api) {
  const rail = document.createElement('nav'); rail.className = 'draw-panel-rail'; rail.setAttribute('aria-label','Draw panels');
  const panels = document.createElement('aside'); panels.className = 'draw-panels'; panels.setAttribute('aria-label','Draw options');
  const primary = document.createElement('section'), layers = document.createElement('section');
  primary.className = 'draw-panel draw-panel--primary'; layers.className = 'draw-panel draw-panel--layers';
  panels.append(primary,layers); shell.append(rail,panels);
  for (const panel of PANEL_DEFINITIONS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'draw-icon-button';
    button.dataset.drawPanel = panel.id; button.dataset.tooltip = panel.name; button.setAttribute('aria-label',panel.name);
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
    const input = document.createElement('input'); input.type = type; input.value = value; input.dataset.drawField = key;
    input.disabled = disabled || state.document.readOnly; if (min !== undefined) input.min = min; if (max !== undefined) input.max = max;
    if (type === 'number') input.step = '.01';
    input.addEventListener('change',() => api.run(() => {
      const next = type === 'number' ? input.valueAsNumber : input.value;
      if (type === 'number' && (!Number.isFinite(next) || (min !== undefined && next < min) || (max !== undefined && next > max))) throw new Error(`Enter a valid ${label.toLowerCase()}.`);
      action(next);
    }));
    row.append(name,input); host.append(row); return input;
  }
  function layerPanel(host) {
    const add = button('+',() => {
      const node = createNode('layer',{ name: `Layer ${state.document.data.layers.length+1}` });
      state.ui.layerId = node.id; state.history.execute(insertNode(null,node));
    }); add.setAttribute('aria-label','New layer'); add.disabled = state.document.readOnly;
    heading(host,'Layers',add);
    const list = document.createElement('div'); list.className = 'draw-layer-list'; list.setAttribute('role','tree');
    function row(node, depth) {
      const item = document.createElement('div'); item.className = 'draw-layer-row'; item.style.setProperty('--depth',depth);
      item.dataset.drawNode = node.id; item.setAttribute('role','treeitem'); item.setAttribute('aria-level',String(depth+1));
      item.classList.toggle('is-selected',state.selection.ids.includes(node.id) || node.id === state.ui.layerId);
      for (const [key,label] of [['visible','Visible'],['locked','Locked']]) {
        const check = document.createElement('input'); check.type = 'checkbox'; check.checked = node[key];
        check.setAttribute('aria-label',`${label}: ${node.name || node.type}`); check.disabled = state.document.readOnly;
        check.addEventListener('change',() => api.run(() => state.history.execute(updateNode(node.id,{[key]:check.checked})))); item.append(check);
      }
      const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'draw-layer-name'; choose.textContent = node.name || node.type;
      choose.addEventListener('click',event => {
        const layer = node.type === 'layer' ? node : state.document.ancestors(node.id).find(n => n.type === 'layer');
        if (layer) state.ui.layerId = layer.id;
        api.select(event.shiftKey ? [...state.selection.ids,node.id] : [node.id]);
      }); item.append(choose); list.append(item);
      if (node.children) node.children.forEach(child => row(child,depth+1));
    }
    state.document.data.layers.forEach(node => row(node,0)); host.append(list);
  }
  function transform(host) {
    const ids = api.selectedIds(), box = api.bounds(), node = ids.length === 1 ? state.document.getNode(ids[0]) : null;
    if (node) field(host,'Name',node.name,value => state.history.execute(updateNode(node.id,{name:value})),{type:'text'});
    const grid = document.createElement('div'); grid.className = 'draw-fields'; host.append(grid);
    for (const [label,key] of [['X (mm)','x'],['Y (mm)','y'],['W (mm)','width'],['H (mm)','height']]) {
      field(grid,label,box ? Number(box[key].toFixed(2)) : 0,value => api.resize(key,value),
        { disabled: !box, min: ['width','height'].includes(key) ? .001 : undefined, key });
    }
    if (!box) text(host,'Select an object to edit its position and size.');
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
    function apply(kind,value) {
      if (kind === 'fill') state.ui.fill = value;
      if (kind === 'stroke') state.ui.stroke = value;
      if (kind === 'width') state.ui.strokeWidth = value;
      state.history.transaction('Appearance',() => {
        for (const id of ids) {
          const original = state.document.getNode(id).appearance;
          const next = appearance(kind === 'fill' ? value : fill, kind === 'stroke' ? value : stroke,kind === 'width' ? value : width);
          state.history.execute(updateNode(id,{ appearance: { ...original,
            fills: kind === 'fill' ? next.fills : original.fills,
            strokes: ['stroke','width'].includes(kind) ? next.strokes : original.strokes } }));
        }
      });
    }
    if (!strokeOnly) {
      field(host,'Fill',fill,v => apply('fill',v),{type:'color'});
      host.append(button('No fill',() => apply('fill',null)));
    }
    field(host,'Stroke',stroke,v => apply('stroke',v),{type:'color'});
    field(host,'Width (mm)',width,v => apply('width',v),{min:0,key:'stroke-width'});
    host.append(button('No stroke',() => apply('stroke',null)));
    if (!ids.length) text(host,'These colors apply to new shapes. Select artwork to change its appearance.');
  }
  function render() {
    for (const button of rail.children) button.setAttribute('aria-pressed',String(button.dataset.drawPanel === state.ui.panel));
    primary.replaceChildren(); layers.replaceChildren(); layers.hidden = state.ui.panel === 'layers';
    heading(primary,PANEL_DEFINITIONS.find(p => p.id === state.ui.panel)?.name || 'Properties');
    if (state.document.readOnly) text(primary,state.warning || 'Read-only document');
    if (state.ui.panel === 'layers') layerPanel(primary);
    else if (state.ui.panel === 'artboards') {
      for (const board of state.document.data.artboards) {
        field(primary,'Name',board.name,v => state.history.execute(updateArtboard(board.id,{name:v})),{type:'text',key:'artboard-name'});
        for (const key of ['width','height']) field(primary,`${key === 'width' ? 'Width' : 'Height'} (mm)`,board[key],v => state.history.execute(updateArtboard(board.id,{[key]:v})),{min:.001,key:`artboard-${key}`});
        primary.append(button('Fit artboards',api.fit));
      }
    } else if (state.ui.panel === 'color') paint(primary);
    else if (state.ui.panel === 'stroke') paint(primary,true);
    else if (state.ui.panel === 'align') {
      text(primary,'Align selected objects to the active artboard.');
      for (const [label,key] of [['Left','left'],['Center horizontally','centerX'],['Right','right'],['Top','top'],['Center vertically','centerY'],['Bottom','bottom']]) {
        const b = button(label,() => api.align(key)); b.disabled = !api.bounds() || state.document.readOnly; primary.append(b);
      }
    } else {
      text(primary,state.selection.ids.length ? `${state.selection.ids.length} selected` : 'No selection'); transform(primary);
      if (state.ui.panel === 'properties') {
        const h = document.createElement('h3'); h.textContent = 'Appearance'; primary.append(h); paint(primary);
        const opacity = state.document.getNode(api.selectedIds()[0])?.opacity ?? 1;
        field(primary,'Opacity (%)',opacity*100,value => state.history.transaction('Opacity',() => {
          for (const id of api.selectedIds()) state.history.execute(updateNode(id,{opacity:value/100}));
        }),{min:0,max:100,disabled:!api.selectedIds().length,key:'opacity'});
      }
    }
    if (!layers.hidden) layerPanel(layers);
  }
  render(); return { render };
}
