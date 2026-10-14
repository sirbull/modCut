import { createProjectDraw } from './io/project.mjs';
import { createDrawRenderer } from './render.mjs';
import { createPanels, icon } from './panels/ui.mjs';
import { iconHref, toolRegistry } from './tools/registry.mjs';
import { toolTooltip } from './keymap.mjs';
import { createNode } from './doc/schema.mjs';
import { insertNode, removeNode, updateNode } from './doc/commands.mjs';
import { appearance, transformProperties } from './geometry.mjs';
import { importArtwork } from './import-artwork.mjs';

const workspaces = new WeakMap();
export function getDrawWorkspace(root) { return workspaces.get(root) || null; }
const implementedTools = new Set(['select','hand','zoom','rectangle','ellipse','line','polygon','star']);
export function createDrawWorkspace(root, { paper = window.paper, state = createProjectDraw(), onError = console.warn, onImport = () => {} } = {}) {
  state.ui ??= { tool: 'select', panel: 'properties', layerId: state.document.data.layers[0]?.id, fill: '#FFFFFF', stroke: '#071411', strokeWidth: .5 };
  const shell = document.createElement('div'); shell.className = 'draw-shell';
  const tools = document.createElement('nav'); tools.className = 'draw-tool-rail'; tools.setAttribute('aria-label','Draw tools');
  const stage = document.createElement('div'); stage.className = 'draw-stage';
  const canvas = document.createElement('canvas'); canvas.className = 'draw-canvas'; canvas.setAttribute('aria-label','Draw canvas'); canvas.tabIndex = 0;
  const hint = document.createElement('div'); hint.className = 'draw-workspace__hint';
  const heading = document.createElement('h1'); heading.textContent = 'Start drawing';
  const description = document.createElement('p'); description.textContent = 'Import vector or raster files, or draw a shape.';
  const importButton = document.createElement('button'); importButton.type = 'button'; importButton.className = 'btn btn--secondary btn--sm'; importButton.textContent = 'Import files'; importButton.addEventListener('click',onImport);
  hint.append(heading,description,importButton);
  const controls = document.createElement('div'); controls.className = 'draw-view-controls';
  const sizeLabel = document.createElement('span');
  const fitButton = document.createElement('button'); fitButton.type = 'button'; fitButton.className = 'btn btn--ghost btn--sm'; fitButton.textContent = 'Fit'; fitButton.setAttribute('aria-label','Fit Draw artboards');
  controls.append(sizeLabel,fitButton); stage.append(canvas,hint,controls); shell.append(tools,stage); root.append(shell);
  const scope = new paper.PaperScope();
  try { scope.setup(canvas); } finally { paper.activate(); }
  scope.view.autoUpdate = false;
  function withScope(fn) { try { scope.activate(); return fn(); } finally { paper.activate(); } }
  function run(fn) { try { return withScope(fn); } catch (error) { onError(error.message); } }
  let panels;
  const renderer = withScope(() => createDrawRenderer(scope,state,{ onImageLoad: () => { renderer.select(); panels?.render(); } }));
  const selectedIds = () => state.selection.ids.filter(id => !state.document.ancestors(id).some(n => state.selection.ids.includes(n.id)));
  function select(ids) { state.selection.set(ids); withScope(() => renderer.select()); panels?.render(); }
  function transform(matrix,label = 'Transform') {
    state.history.transaction(label,() => { for (const id of selectedIds()) state.history.execute(updateNode(id,transformProperties(state.document.getNode(id),renderer.localMatrix(id,matrix)),{label})); });
  }
  const fit = () => withScope(() => renderer.fit()); fitButton.addEventListener('click',fit);
  panels = createPanels(shell,state,{ run, select, selectedIds, bounds: () => renderer.selectionBounds(), fit,
    paintIds: () => [...new Set(selectedIds().flatMap(id => {
      const node = state.document.getNode(id); return node.children ? state.document.descendants(id).map(n => n.id) : [id];
    }))].filter(id => ['path','shape'].includes(state.document.getNode(id)?.type) && state.document.isEditable(id)),
    resize(key,value) {
      const b = renderer.selectionBounds(); if (!b) return;
      if (key === 'x' || key === 'y') transform([1,0,0,1,key === 'x' ? value-b.x : 0,key === 'y' ? value-b.y : 0],'Move');
      else { const sx = key === 'width' && b.width > 0 ? value/b.width : 1, sy = key === 'height' && b.height > 0 ? value/b.height : 1; transform([sx,0,0,sy,b.x*(1-sx),b.y*(1-sy)],'Resize'); }
    },
    align(key) {
      const b = renderer.selectionBounds(), a = state.document.data.artboards[0]; if (!b) return;
      const x = {left:a.x,centerX:a.x+(a.width-b.width)/2,right:a.x+a.width-b.width}[key];
      const y = {top:a.y,centerY:a.y+(a.height-b.height)/2,bottom:a.y+a.height-b.height}[key];
      transform([1,0,0,1,x === undefined ? 0 : x-b.x,y === undefined ? 0 : y-b.y],'Align');
    },
  });
  let flyout = null;
  function closeFlyout() { flyout?.remove(); flyout = null; }
  function toolButton(id,host = tools) {
    const tool = toolRegistry.get(id), button = document.createElement('button'); button.type = 'button'; button.className = 'draw-icon-button';
    button.dataset.drawTool = id; button.dataset.tooltip = toolTooltip(id,{isMac:/Mac/.test(navigator.platform)})+(implementedTools.has(id) ? '' : ' — coming later');
    button.setAttribute('aria-label',tool.name); button.disabled = !implementedTools.has(id) || (state.document.readOnly && !['select','hand','zoom'].includes(id));
    button.append(icon(iconHref(id))); button.addEventListener('click',() => setTool(id)); host.append(button); return button;
  }
  for (const id of ['select','direct-selection','pen','pencil']) toolButton(id);
  const shapes = document.createElement('div'); shapes.className = 'draw-tool-group'; tools.append(shapes); toolButton('rectangle',shapes);
  const more = document.createElement('button'); more.type = 'button'; more.className = 'draw-tool-more'; more.textContent = '▾'; more.setAttribute('aria-label','Shape tools'); more.setAttribute('aria-expanded','false');
  more.addEventListener('click',() => {
    if (flyout) { closeFlyout(); more.setAttribute('aria-expanded','false'); return; }
    flyout = document.createElement('div'); flyout.className = 'draw-tool-flyout'; flyout.setAttribute('aria-label','Shape tools');
    for (const id of ['rectangle','ellipse','line','polygon','star']) { const b = toolButton(id,flyout), label = document.createElement('span'); label.textContent = toolRegistry.get(id).name; b.append(label); }
    shapes.append(flyout); more.setAttribute('aria-expanded','true');
    const box = more.getBoundingClientRect(); flyout.style.left = `${box.right+8}px`; flyout.style.top = `${Math.max(8,Math.min(box.top,innerHeight-210))}px`;
  }); shapes.append(more);
  for (const id of ['ellipse','line','type','hand','zoom']) toolButton(id);
  function setTool(id) {
    if (!implementedTools.has(id)) return;
    state.ui.tool = id; closeFlyout(); more.setAttribute('aria-expanded','false');
    for (const b of tools.querySelectorAll('[data-draw-tool]')) b.setAttribute('aria-pressed',String(b.dataset.drawTool === id)); canvas.dataset.tool = id;
  }
  function refresh() {
    withScope(() => renderer.render()); panels.render();
    const board = state.document.data.artboards[0]; sizeLabel.textContent = `${board.width} × ${board.height} mm`;
    hint.hidden = state.document.data.layers.some(layer => layer.children.length) || state.document.readOnly;
  }
  const unsubscribe = state.subscribe(refresh);
  let fitted = false;
  function resize() {
    const {width,height} = stage.getBoundingClientRect(); if (width <= 0 || height <= 0) return;
    withScope(() => { scope.view.viewSize = new scope.Size(width,height); if (!fitted) { renderer.fit(); fitted = true; } scope.view.update(); });
  }
  const observer = new ResizeObserver(resize); observer.observe(stage);
  function point(event) { const b = canvas.getBoundingClientRect(); return scope.view.viewToProject(new scope.Point(event.clientX-b.left,event.clientY-b.top)); }
  let gesture = null, preview = null;
  let destroyed = false;
  function cancel() { gesture = null; preview?.remove(); preview = null; withScope(() => scope.view.update()); }
  canvas.addEventListener('pointerdown',event => {
    if (event.button !== 0) return;
    closeFlyout(); canvas.focus(); canvas.setPointerCapture(event.pointerId);
    const p = point(event), tool = state.ui.tool;
    if (tool === 'zoom') { scope.view.zoom *= event.altKey ? .8 : 1.25; renderer.select(); scope.view.update(); return; }
    if (tool === 'select') {
      const id = renderer.hit(p);
      if (id && state.document.isEditable(id)) {
        if (event.shiftKey) select(state.selection.ids.includes(id) ? state.selection.ids.filter(n => n !== id) : [...state.selection.ids,id]);
        else if (!state.selection.ids.includes(id)) select([id]);
      } else if (!event.shiftKey) select([]);
    }
    gesture = {tool,start:p,end:p,center:scope.view.center.clone(),view:[event.clientX,event.clientY]};
  });
  canvas.addEventListener('pointermove',event => {
    if (!gesture) return;
    const p = point(event); gesture.end = p;
    if (gesture.tool === 'hand') { scope.view.center = gesture.center.subtract(new scope.Point(event.clientX-gesture.view[0],event.clientY-gesture.view[1]).divide(scope.view.zoom)); scope.view.update(); return; }
    preview?.remove(); preview = null;
    withScope(() => {
      if (gesture.tool === 'select') { const b = renderer.selectionBounds(); if (b) preview = new scope.Path.Rectangle(b.translate(p.subtract(gesture.start))); }
      else if (!state.document.readOnly) { const rect = new scope.Rectangle(gesture.start,p); preview = gesture.tool === 'ellipse' ? new scope.Path.Ellipse(rect) : gesture.tool === 'line' ? new scope.Path({segments:[gesture.start,p]}) : new scope.Path.Rectangle(rect); }
      if (preview) { preview.strokeColor = '#006B5C'; preview.strokeWidth = 1/scope.view.zoom; preview.fillColor = null; } scope.view.update();
    });
  });
  canvas.addEventListener('pointerup',() => {
    const drag = gesture; cancel(); if (!drag || state.document.readOnly) return;
    const delta = drag.end.subtract(drag.start); if (delta.length < 1/scope.view.zoom) return;
    run(() => {
      if (drag.tool === 'select') transform([1,0,0,1,delta.x,delta.y],'Move');
      else if (['rectangle','ellipse','line','polygon','star'].includes(drag.tool)) {
        const r = new scope.Rectangle(drag.start,drag.end), kind = drag.tool === 'rectangle' ? 'rect' : drag.tool;
        const params = kind === 'line' ? {x1:drag.start.x,y1:drag.start.y,x2:drag.end.x,y2:drag.end.y} : ['polygon','star'].includes(kind) ? {x:r.center.x,y:r.center.y,radius:Math.min(r.width,r.height)/2,outerRadius:Math.min(r.width,r.height)/2,innerRadius:Math.min(r.width,r.height)/4} : {x:r.x,y:r.y,width:r.width,height:r.height};
        const node = createNode('shape',{name:toolRegistry.get(drag.tool).name,shape:kind,params,appearance:appearance(kind === 'line' ? null : state.ui.fill,state.ui.stroke,state.ui.strokeWidth)});
        state.history.execute(insertNode(state.ui.layerId,node)); select([node.id]);
      }
    });
  });
  canvas.addEventListener('pointercancel',cancel);
  canvas.addEventListener('wheel',event => { event.preventDefault(); scope.view.zoom = Math.max(.01,Math.min(100,scope.view.zoom*Math.exp(-event.deltaY*.001))); renderer.select(); scope.view.update(); },{passive:false});
  const workspace = {state,scope,renderer,resize,select,setTool,availableTool: id => implementedTools.has(id),
    handle(command) { return run(() => {
      if (command.startsWith('tool.')) return setTool(command.slice(5));
      if (command.startsWith('panel.')) { const id = command.slice(6); if (['layers','color','stroke','align','transform'].includes(id)) { state.ui.panel = id; panels.render(); } return; }
      if (command === 'cancel') { cancel(); closeFlyout(); return; }
      if (command === 'undo' || command === 'redo') { cancel(); state.history[command](); select(state.selection.ids); return; }
      if (command === 'fit-artboard' || command === 'fit-all') return fit();
      if (command === 'zoom-in' || command === 'zoom-out') { scope.view.zoom *= command === 'zoom-in' ? 1.25 : .8; renderer.select(); return; }
      if (command === 'deselect') return select([]);
      if (command === 'select-all') return select(state.document.descendants(null).filter(n => !n.children).map(n => n.id));
      if (command === 'delete' && !state.document.readOnly) state.history.transaction('Delete',() => { for (const id of selectedIds()) state.history.execute(removeNode(id)); });
    }); },
    async import(prepared,name,options = {}) { const result = await importArtwork(scope,state,prepared,name,state.ui.layerId,{...options,alive:()=>!destroyed}); select(result.ids); if (options.fitArtboard) fit(); return result; },
    destroy() { destroyed = true; cancel(); unsubscribe(); observer.disconnect(); workspaces.delete(root); withScope(() => { renderer.destroy(); scope.remove(); }); root.replaceChildren(); },
  };
  workspaces.set(root,workspace); refresh(); setTool(state.ui.tool); resize(); return workspace;
}
