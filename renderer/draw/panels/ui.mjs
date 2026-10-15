import { PANEL_DEFINITIONS, panelIconHref } from './registry.mjs';
import { createNode } from '../doc/schema.mjs';
import { insertNode, updateNode } from '../doc/commands.mjs';
import { shortcutLabel } from '../keymap.mjs';

export function icon(href) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
  const use = document.createElementNS(svg.namespaceURI,'use'); use.setAttribute('href',href); svg.append(use);
  return svg;
}
export function createPanels(shell, state, api) {
  const rail = document.createElement('nav'); rail.className = 'draw-panel-rail'; rail.setAttribute('aria-label','Draw panels');
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
    const box = api.bounds();
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
  function render() {
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
    } else if (state.ui.panel === 'color') paint(primary);
    else if (state.ui.panel === 'stroke') paint(primary,true);
    else if (state.ui.panel === 'align') {
      text(primary,'Align selected objects to the active artboard.');
      for (const [label,key] of [['Left','left'],['Center horizontally','centerX'],['Right','right'],['Top','top'],['Center vertically','centerY'],['Bottom','bottom']]) {
        const b = button(label,() => api.align(key)); b.disabled = !api.bounds() || state.document.readOnly; primary.append(b);
      }
    } else if (state.ui.panel === 'transform') transform(primary);
    else {
        text(primary,state.selection.ids.length ? `${state.selection.ids.length} selected` : 'Select artwork or choose a drawing tool.');
        const node = state.document.getNode(api.selectedIds()[0]);
        if (node) field(primary,'Name',node.name,value => state.history.execute(updateNode(node.id,{name:value})),{type:'text'});
        else text(primary,'Fill and Stroke are set with the swatches below the drawing tools.');
        const opacity = state.document.getNode(api.selectedIds()[0])?.opacity ?? 1;
        field(primary,'Opacity (%)',opacity*100,value => state.history.transaction('Opacity',() => {
          for (const id of api.selectedIds()) state.history.execute(updateNode(id,{opacity:value/100}));
        }),{min:0,max:100,disabled:!api.selectedIds().length,key:'opacity'});
        if(node?.type==='shape') {
          const editable=node.shape==='rect' ? [['cornerRadius','Corner radius (mm)',0]] : node.shape==='polygon' ? [['sides','Sides',3]] : node.shape==='star' ? [['points','Points',2],['innerRadius','Inner radius (mm)',0],['outerRadius','Outer radius (mm)',0]] : node.shape==='ellipse' ? [['startAngle','Pie start (°)',-360],['endAngle','Pie end (°)',-360]] : [];
          for(const [key,label,min] of editable)field(primary,label,node.params[key]??({sides:6,points:5,endAngle:360}[key] || 0),value=>state.history.execute(updateNode(node.id,{params:{...node.params,[key]:value}})),{min,max:['sides','points'].includes(key)?100:undefined,key:`shape-${key}`});
        }
    }
  }
  render(); return { render };
}
