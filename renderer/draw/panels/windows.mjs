import { panelAvailable, panelName } from './registry.mjs';
import { WINDOW_GROUPS, loadPanelLayout, movePanel, normalizePanelLayout, savePanelLayout, windowGroup } from './layout.mjs';
import { shortcutLabel } from '../keymap.mjs';

/** Chrome and pointer interaction only. Panel content and document edits stay in ui.mjs. */
export function createPanelWindows({ shell, rail, panels, dock, state, icon, renderContent, refresh }) {
  state.ui.panelLayout = normalizePanelLayout(state.ui.panelLayout ?? loadPanelLayout());
  const windows = new Map(), dockWindows = new Map(), columns = new Map(), buttons = new Map(), separators = new Map(), isMac = /Mac/.test(navigator.platform);
  let drag = null, sizing = null, suppressClickUntil = 0, front = 20, destroyed = false;
  const persist = () => savePanelLayout(state.ui.panelLayout);
  const all = () => [flyout, ...windows.values(), ...dockWindows.values()];
  const groupById = id => WINDOW_GROUPS.find(group => group.id === id);
  const activeTab = group => group.tabs.includes(state.ui.groupTabs[group.id]) && panelAvailable(state.ui.groupTabs[group.id])
    ? state.ui.groupTabs[group.id] : group.tabs.find(panelAvailable);
  const location = id => state.ui.panelLayout.dock.includes(id) ? 'dock' : state.ui.panelLayout.rail.includes(id) ? 'rail'
    : state.ui.panelLayout.floating[id] ? 'floating' : 'closed';
  const indicator = document.createElement('div'); indicator.className = 'draw-panel-drop-line'; indicator.hidden = true; indicator.setAttribute('aria-hidden','true'); shell.append(indicator);
  const beforePanels=document.createElement('aside');beforePanels.className='draw-panels draw-panels--before-rail';beforePanels.setAttribute('aria-label','Draw options');shell.append(beforePanels);

  function pin(id) {
    state.ui.panelLayout = movePanel(state.ui.panelLayout,id,{to:'dock'});
    state.ui.dockCollapsed[id]=false; state.ui.flyout=null; persist(); refresh();
  }
  function collapse(id) {
    state.ui.panelLayout = movePanel(state.ui.panelLayout,id,{to:'rail'});
    if(state.ui.flyout===id)state.ui.flyout=null; persist(); refresh(); buttons.get(id)?.focus({preventScroll:true});
  }
  function action(label, glyph, run) {
    const button=document.createElement('button');button.type='button';button.className='draw-layer-action';button.textContent=glyph;
    button.setAttribute('aria-label',label);button.dataset.tooltip=label;button.addEventListener('click',run);return button;
  }

  function hide(id) {
    state.ui.panelLayout = movePanel(state.ui.panelLayout, id, { to: 'closed' });
    if (state.ui.flyout === id) state.ui.flyout = null;
    persist(); refresh(); rail.querySelector('button')?.focus({ preventScroll: true });
  }
  function makeWindow(floating, docked = false) {
    const element = document.createElement('section'); element.className = docked ? 'draw-panel-window draw-docked-panel' : floating ? 'draw-panel-window draw-floating-panel' : 'draw-panel-window draw-flyout';
    element.hidden = true; element.setAttribute('role', docked ? 'region' : 'dialog');
    const header = document.createElement('div'); header.className = 'draw-flyout__header';
    const tabs = document.createElement('div'); tabs.className = 'draw-flyout__tabs'; tabs.setAttribute('role', 'tablist');
    const dockButton = document.createElement('button'); dockButton.type = 'button'; dockButton.className = 'draw-layer-action draw-panel-dock';
    dockButton.textContent = 'Dock'; dockButton.setAttribute('aria-label', 'Dock panel'); dockButton.dataset.tooltip = 'Dock panel';
    dockButton.addEventListener('click', () => {
      const id = element.dataset.drawGroup;
      pin(id);
    });
    const close = document.createElement('button'); close.type = 'button'; close.className = 'draw-layer-action draw-flyout__close';
    close.setAttribute('aria-label', 'Close panel'); close.dataset.tooltip = 'Close panel'; close.append(icon('x'));
    close.addEventListener('click', () => hide(element.dataset.drawGroup));
    const railButton=action('Collapse to icons','»',()=>collapse(element.dataset.drawGroup));
    header.append(tabs, dockButton, railButton, close);
    const body = document.createElement('div'); body.className = 'draw-panel draw-flyout__body'; body.setAttribute('role', 'tabpanel');
    element.append(header, body); if(!docked)shell.append(element);
    header.addEventListener('pointerdown', event => {
      if (!event.target.closest('.draw-layer-action')) startDrag(event, element.dataset.drawGroup, element);
    });
    element.addEventListener('pointerdown', () => { if (floating) element.style.zIndex = String(++front); });
    return { element, header, tabs, body, dockButton, railButton };
  }
  const flyout = makeWindow(false);

  for (const group of WINDOW_GROUPS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'draw-icon-button';
    const names = group.tabs.map(panelName).join(' · '), shortcut = shortcutLabel(`panel.${group.tabs[0]}`, { isMac });
    button.dataset.drawPanel = group.id; button.setAttribute('aria-label', names); button.setAttribute('aria-haspopup', 'dialog');
    button.dataset.tooltip = names + (shortcut ? ` (${shortcut})` : '') + ' · Drag to undock'; button.append(icon(group.icon));
    button.addEventListener('click', () => {
      if (Date.now() < suppressClickUntil) return;
      state.ui.flyout = state.ui.flyout === group.id ? null : group.id; refresh();
    });
    button.addEventListener('pointerdown', event => startDrag(event, group.id, button));
    button.addEventListener('keydown', event => {
      if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const index = state.ui.panelLayout.rail.indexOf(group.id) + (event.key === 'ArrowUp' ? -1 : 1);
        state.ui.panelLayout = movePanel(state.ui.panelLayout, group.id, { to: 'rail', index }); persist(); render(false); button.focus();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); event.stopPropagation(); hide(group.id);
      }
    });
    buttons.set(group.id, button);
  }
  for (const [id, entry] of Object.entries(dock)) {
    const heading=document.createElement('div');heading.className='draw-dock-heading';entry.section.prepend(heading);heading.append(entry.header);
    heading.append(action('Collapse to icons','»',()=>collapse(id)),action('Close panel','×',()=>hide(id)));
    heading.addEventListener('pointerdown',event=>{if(!event.target.closest('.draw-layer-action'))startDrag(event,id,entry.section);});
  }

  function clampPoint(point, element) {
    return { x: Math.round(Math.max(0, Math.min(point.x, Math.max(0, shell.clientWidth - Math.min(288, shell.clientWidth))))),
      y: Math.round(Math.max(0, Math.min(point.y, Math.max(0, shell.clientHeight - Math.min(element?.offsetHeight || 40, shell.clientHeight))))) };
  }
  function place(entry, point) {
    const next = clampPoint(point, entry.element);
    entry.element.style.left = `${next.x}px`; entry.element.style.top = `${next.y}px`;
    entry.element.style.maxHeight = `${Math.max(40, shell.clientHeight - next.y)}px`;
    return next;
  }
  function syncWindow(entry, group, content) {
    const { element, tabs, body } = entry, active = activeTab(group), changed = body.dataset.drawPanelBody !== active;
    element.hidden = false; element.dataset.drawGroup = group.id; element.setAttribute('aria-label', group.tabs.map(panelName).join(', '));
    entry.dockButton.hidden = state.ui.panelLayout.dock.includes(group.id);
    entry.railButton.hidden = state.ui.panelLayout.rail.includes(group.id);
    // Keep tab nodes stable during a drag; replacing the pressed tab would cancel its click.
    if (tabs.dataset.group !== group.id) {
      tabs.dataset.group = group.id; tabs.replaceChildren(...group.tabs.map(id => {
        const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'draw-flyout__tab'; tab.setAttribute('role', 'tab');
        tab.dataset.drawPanelTab = id; tab.textContent = panelName(id); tab.disabled = !panelAvailable(id);
        const shortcut = shortcutLabel(`panel.${id}`, { isMac }); if (shortcut) tab.dataset.tooltip = `${panelName(id)} (${shortcut})`;
        tab.addEventListener('click', () => { if (Date.now() < suppressClickUntil) return; state.ui.groupTabs[group.id] = id; refresh(); });
        return tab;
      }));
    }
    for (const tab of tabs.children) {
      const id = tab.dataset.drawPanelTab, shortcut = shortcutLabel(`panel.${id}`, { isMac });
      tab.setAttribute('aria-selected', String(id === active));
      tab.dataset.tooltip = panelName(id) + (shortcut ? ` (${shortcut})` : '');
    }
    body.dataset.drawPanelBody = active;
    if (dock[group.id]) {
      if (dock[group.id].section.parentElement !== body) body.replaceChildren(dock[group.id].section);
      dock[group.id].section.hidden = false;
    } else if (content || changed || !body.childNodes.length) { body.replaceChildren(); renderContent(active, body); }
  }
  const panelElement = id => dock[id]?.section ?? dockWindows.get(id)?.element;
  function visibleColumns() {
    const result=[...state.ui.panelLayout.columns];
    // Keep the source column's space while dragging its last panel. Drop targets must not move away from the pointer.
    const source=drag?.started&&drag.original.columns.find(c=>c.panels.includes(drag.id));
    if(source&&!result.some(c=>c.id===source.id))result.splice(Math.min(drag.original.columns.indexOf(source),result.length),0,{...source,panels:[],sizes:[]});
    return result;
  }
  function resizeHandle(orientation, label, onDelta, onReset) {
    const handle=document.createElement('div');handle.className=orientation==='horizontal'?'draw-dock-splitter':'draw-dock-column-resizer';
    handle.tabIndex=0;handle.dataset.panelResize=orientation;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation',orientation);handle.setAttribute('aria-label',label);
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||drag||sizing)return;event.preventDefault();event.stopPropagation();
      const original=structuredClone(state.ui.panelLayout),start=orientation==='horizontal'?event.clientY:event.clientX,abort=new AbortController();
      handle.setPointerCapture(event.pointerId);
      const finish=cancel=>{if(!sizing)return;sizing=null;abort.abort();if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);
        if(cancel)state.ui.panelLayout=original;else persist();if(!destroyed)refresh();};
      sizing={cancel:()=>finish(true)};
      document.addEventListener('pointermove',e=>{if(e.pointerId===event.pointerId){onDelta((orientation==='horizontal'?e.clientY:e.clientX)-start,original);layoutDock();}},{signal:abort.signal});
      document.addEventListener('pointerup',e=>{if(e.pointerId===event.pointerId)finish(false);},{signal:abort.signal});
      handle.addEventListener('lostpointercapture',()=>finish(true),{signal:abort.signal});
      document.addEventListener('pointercancel',()=>finish(true),{signal:abort.signal});
    });
    handle.addEventListener('dblclick',()=>{onReset();persist();refresh();});
    handle.addEventListener('keydown',event=>{
      const keys=orientation==='horizontal'?['ArrowUp','ArrowDown']:['ArrowLeft','ArrowRight'];
      if(!keys.includes(event.key))return;event.preventDefault();event.stopPropagation();
      onDelta((event.key===keys[0]?-1:1)*(event.shiftKey?30:10),structuredClone(state.ui.panelLayout));persist();layoutDock();
    });
    return handle;
  }
  function pairResize(columnId,a,b,delta,original) {
    const old=original.columns.find(c=>c.id===columnId),next=state.ui.panelLayout.columns.find(c=>c.id===columnId);
    if(!old||!next)return;
    const i=old.panels.indexOf(a),j=old.panels.indexOf(b),sum=old.sizes[i]+old.sizes[j];
    const height=(columns.get(columnId)?.element.clientHeight||400),pixels=Math.max(1,height*sum);
    const minHeight=Math.min(120,Math.max(48,height/old.panels.length*.5));
    const min=Math.min(.3,minHeight/pixels),ratio=Math.max(min,Math.min(1-min,old.sizes[i]/sum+delta/pixels));
    next.sizes[i]=sum*ratio;next.sizes[j]=sum*(1-ratio);
  }
  function renderColumns(content) {
    const layout=state.ui.panelLayout,visible=visibleColumns();
    for(const [id,entry] of dockWindows)if(!layout.dock.includes(id)){entry.element.remove();dockWindows.delete(id);}
    for(const [id,entry] of columns)if(!visible.some(c=>c.id===id)){entry.element.remove();columns.delete(id);}
    for(const [columnIndex,column] of visible.entries()) {
      let entry=columns.get(column.id);
      if(!entry){
        const element=document.createElement('div');element.className='draw-dock-column';element.dataset.drawDockColumn=column.id;
        const edge=resizeHandle('vertical','Resize panel column',(delta,original)=>{
          const old=original.columns.find(c=>c.id===column.id),next=state.ui.panelLayout.columns.find(c=>c.id===column.id);
          if(next&&old)next.width=Math.max(180,Math.min(480,old.width-delta));
        },()=>{state.ui.panelLayout.columns.find(c=>c.id===column.id).width=286;});
        entry={element,edge,splitters:new Map()};columns.set(column.id,entry);
      }
      const parent=column.side==='before-rail'?beforePanels:panels;
      const index=visible.slice(0,columnIndex).filter(c=>(c.side==='before-rail')===(column.side==='before-rail')).length;
      if(parent.children[index]!==entry.element)parent.insertBefore(entry.element,parent.children[index]??null);
      const nodes=[entry.edge],alive=new Set();
      column.panels.forEach((id,index)=>{
        if(index){
          const before=column.panels[index-1],key=`${before}:${id}`;alive.add(key);
          let separator=entry.splitters.get(key);
          if(!separator){separator=resizeHandle('horizontal',`Resize ${panelName(before)} and ${panelName(id)}`,
            (delta,original)=>pairResize(column.id,before,id,delta,original),()=>{const c=state.ui.panelLayout.columns.find(c=>c.id===column.id);c.sizes=c.panels.map(()=>1/c.panels.length);});
            entry.splitters.set(key,separator);}
          separator.hidden=!!state.ui.dockCollapsed[before]||!!state.ui.dockCollapsed[id];nodes.push(separator);
        }
        let element;
        if(dock[id]) {element=dock[id].section;element.hidden=false;}
        else {
          let window=dockWindows.get(id);if(!window){window=makeWindow(false,true);window.element.dataset.drawDock=id;dockWindows.set(id,window);}
          syncWindow(window,groupById(id),content);element=window.element;
        }
        nodes.push(element);
      });
      for(const [key,separator] of entry.splitters)if(!alive.has(key)){separator.remove();entry.splitters.delete(key);}
      nodes.forEach((node,index)=>{if(entry.element.children[index]!==node)entry.element.insertBefore(node,entry.element.children[index]??null);});
    }
    for(const [id,entry] of Object.entries(dock)) {
      const inDock=layout.dock.includes(id),inWindow=location(id)==='floating'||state.ui.flyout===id;
      entry.section.classList.toggle('is-detached',!inDock);
      if(!inDock&&!inWindow)entry.section.remove();
    }
    layoutDock();
  }
  function layoutDock() {
    const layout=state.ui.panelLayout,visible=visibleColumns(),requested=visible.reduce((sum,c)=>sum+c.width,0);
    const scale=requested?Math.min(1,Math.max(0,shell.clientWidth-138-180)/requested):1;
    const beforeWidth=visible.filter(c=>c.side==='before-rail').reduce((sum,c)=>sum+c.width,0)*scale;
    shell.style.setProperty('--draw-dock-before-width',`${beforeWidth}px`);
    shell.style.setProperty('--draw-dock-width',`${requested*scale-beforeWidth}px`);
    beforePanels.hidden=!beforeWidth;
    shell.classList.toggle('draw-shell--dock-empty',!visible.length);
    for(const column of visible){
      const entry=columns.get(column.id);if(!entry)continue;entry.element.style.flex=`0 0 ${column.width}px`;
      for(const [key,separator] of entry.splitters){const [a,b]=key.split(':');separator.hidden=!!state.ui.dockCollapsed[a]||!!state.ui.dockCollapsed[b];}
      const expanded=column.sizes.reduce((sum,value,i)=>sum+(state.ui.dockCollapsed[column.panels[i]]?0:value),0)||1;
      column.panels.forEach((id,i)=>{
        const element=panelElement(id);if(!element)return;const collapsed=!!state.ui.dockCollapsed[id];
        element.classList.toggle('is-collapsed',collapsed);element.style.flex=collapsed?'0 0 auto':`${column.sizes[i]/expanded} 1 0`;
        dock[id]?.header.setAttribute('aria-expanded',String(!collapsed));
      });
    }
  }
  function render(content = true) {
    state.ui.panelLayout = normalizePanelLayout(state.ui.panelLayout);
    const layout = state.ui.panelLayout;
    if (!layout.rail.includes(state.ui.flyout)) state.ui.flyout = null;
    for (const [id, button] of buttons) {
      const docked = layout.rail.includes(id);
      const group = groupById(id), shortcut = shortcutLabel(`panel.${group.tabs[0]}`, { isMac });
      button.dataset.tooltip = group.tabs.map(panelName).join(' · ') + (shortcut ? ` (${shortcut})` : '') + ' · Drag to undock';
      if (!docked) button.remove();
      button.setAttribute('aria-pressed', String(state.ui.flyout === id)); button.setAttribute('aria-expanded', String(state.ui.flyout === id));
      button.classList.toggle('is-dragging', !!(drag?.started && drag.id === id));
    }
    const nodes = [], boundaries = new Set();
    layout.rail.forEach((id, index) => {
      const group = groupById(id).groupId;
      if (index && groupById(layout.rail[index - 1]).groupId !== group) {
        let separator = separators.get(id);
        if (!separator) { separator = document.createElement('div'); separator.className = 'draw-panel-rail__separator'; separator.setAttribute('role', 'separator'); separator.setAttribute('aria-orientation', 'horizontal'); separators.set(id, separator); }
        boundaries.add(id); nodes.push(separator);
      }
      nodes.push(buttons.get(id));
    });
    for (const [id, separator] of separators) if (!boundaries.has(id)) { separator.remove(); separators.delete(id); }
    nodes.forEach((node, index) => { if (rail.children[index] !== node) rail.insertBefore(node, rail.children[index] ?? null); });
    renderColumns(content);
    for (const [id, entry] of windows) if (!layout.floating[id]) { entry.element.remove(); windows.delete(id); }
    for (const [id, point] of Object.entries(layout.floating)) {
      let entry = windows.get(id);
      if (!entry) { entry = makeWindow(true); entry.element.style.zIndex = String(++front); windows.set(id, entry); }
      syncWindow(entry, groupById(id), content); place(entry, point);
    }
    const group = groupById(state.ui.flyout);
    flyout.element.hidden = !group;
    if (group) {
      syncWindow(flyout, group, content);
      flyout.element.style.maxHeight = `${shell.clientHeight}px`;
      const box = shell.getBoundingClientRect(), anchor = buttons.get(group.id).getBoundingClientRect();
      place(flyout, { x: rail.getBoundingClientRect().left - box.left - 294, y: anchor.top - box.top });
    } else { flyout.tabs.replaceChildren(); delete flyout.tabs.dataset.group; flyout.body.replaceChildren(); delete flyout.body.dataset.drawPanelBody; }
    layoutDock();
  }
  function open(id, { floating = true } = {}) {
    const group = windowGroup(id); if (!group) return false;
    shell.classList.remove('draw-shell--panels-hidden', 'draw-shell--all-hidden');
    if(location(id)==='dock'){state.ui.dockCollapsed[id]=false;refresh();(dock[id]?.header??dockWindows.get(id)?.tabs.querySelector('button'))?.focus({preventScroll:true});return true;}
    state.ui.groupTabs[group.id] = id;
    if (floating && location(group.id) !== 'floating') {
      const count = Object.keys(state.ui.panelLayout.floating).length;
      state.ui.panelLayout = movePanel(state.ui.panelLayout, group.id, { to: 'floating', x: Math.max(100, shell.clientWidth - 660) - count % 6 * 24, y: 32 + count % 6 * 28 });
    } else if (!floating && location(group.id) === 'closed') state.ui.panelLayout = movePanel(state.ui.panelLayout, group.id, { to: 'rail' });
    if (location(group.id) === 'floating') state.ui.flyout = state.ui.flyout === group.id ? null : state.ui.flyout;
    else state.ui.flyout = group.id;
    persist(); refresh();
    const entry = windows.get(group.id); if (entry) { entry.element.style.zIndex = String(++front); entry.tabs.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true }); }
    return true;
  }
  function close() {
    if (!state.ui.flyout) return false;
    const id = state.ui.flyout; state.ui.flyout = null; refresh(); buttons.get(id)?.focus({ preventScroll: true }); return true;
  }
  function startDrag(event, id, source) {
    if (event.button !== 0 || drag || sizing) return;
    const bounds = source.getBoundingClientRect(), point = state.ui.panelLayout.floating[id];
    drag = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: false,
      original: structuredClone(state.ui.panelLayout), flyout: state.ui.flyout, collapsed: { ...state.ui.dockCollapsed },
      offsetX: point ? event.clientX - bounds.left : 24, offsetY: point ? event.clientY - bounds.top : 16 };
    document.addEventListener('pointermove', moveDrag); document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', cancelDrag);
  }
  function dockTarget(event) {
    const shellBox=shell.getBoundingClientRect(),railBox=rail.getBoundingClientRect(),layout=state.ui.panelLayout,visible=visibleColumns();
    if(event.clientY<shellBox.top||event.clientY>shellBox.bottom)return null;
    for(const [i,column] of visible.entries()){
      const box=columns.get(column.id)?.element.getBoundingClientRect();if(!box)continue;
      for(const [x,index] of [[box.left,i],[box.right,i+1]])if(Math.abs(event.clientX-x)<=9)
        return {to:'column',side:column.side,columnIndex:index,beforeColumn:visible[index]?.id,line:{x:Math.min(x,shellBox.right-3),y:shellBox.top,width:3,height:shellBox.height}};
    }
    for(const [columnIndex,column] of visible.entries()){
      const entry=columns.get(column.id),box=entry?.element.getBoundingClientRect();
      if(!box||event.clientX<box.left||event.clientX>box.right)continue;
      if(!column.panels.length)return {to:'column',side:column.side,columnIndex,line:{x:box.left,y:box.top,width:3,height:box.height}};
      for(const [i,id] of column.panels.entries()){
        if(id===drag?.id)continue;
        const panel=panelElement(id)?.getBoundingClientRect();if(!panel)continue;
        if(event.clientY<(panel.top+panel.bottom)/2)return {to:'dock',column:column.id,index:i,before:id,line:{x:box.left,y:panel.top,width:box.width,height:3}};
      }
      return {to:'dock',column:column.id,index:column.panels.length,line:{x:box.left,y:box.bottom-3,width:box.width,height:3}};
    }
    if(Math.abs(event.clientX-railBox.left)<=12)
      return {to:'column',side:'before-rail',columnIndex:layout.columns.filter(c=>c.side==='before-rail').length,line:{x:railBox.left-3,y:shellBox.top,width:3,height:shellBox.height}};
    if((!layout.columns.length||!layout.columns.some(c=>c.side!=='before-rail'))&&(Math.abs(event.clientX-railBox.right)<=18||event.clientX>=shellBox.right-18))
      return {to:'column',columnIndex:0,line:{x:railBox.right-3,y:shellBox.top,width:3,height:shellBox.height}};
    return null;
  }
  function showTarget(target) {
    indicator.hidden=!target?.line;if(indicator.hidden)return;
    const box=shell.getBoundingClientRect(),line=target.line;
    indicator.style.left=`${line.x-box.left}px`;indicator.style.top=`${line.y-box.top}px`;
    indicator.style.width=`${line.width}px`;indicator.style.height=`${line.height}px`;
    indicator.dataset.dropKind=target.to;
  }
  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.started && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    if (!drag.started) shell.setPointerCapture(event.pointerId);
    drag.started = true; event.preventDefault(); shell.classList.add('is-panel-dragging');
    const box = shell.getBoundingClientRect(), railBox = rail.getBoundingClientRect();
    const overRail = event.clientX >= railBox.left+3 && event.clientX < railBox.right-3 && event.clientY >= railBox.top && event.clientY <= railBox.bottom;
    const target=overRail?null:dockTarget(event);
    rail.classList.toggle('is-drop-target', overRail);
    if (overRail) {
      if (event.clientY < railBox.top + 28) rail.scrollTop -= 16;
      else if (event.clientY > railBox.bottom - 28) rail.scrollTop += 16;
      const others = [...rail.querySelectorAll('[data-draw-panel]')].filter(button => button.dataset.drawPanel !== drag.id);
      const index = others.findIndex(button => { const rect = button.getBoundingClientRect(); return event.clientY < rect.top + rect.height / 2; });
      drag.target={to:'rail',index:index<0?others.length:index};
      state.ui.panelLayout = movePanel(state.ui.panelLayout, drag.id, drag.target);
    } else {
      const point = clampPoint({ x: event.clientX - box.left - drag.offsetX, y: event.clientY - box.top - drag.offsetY }, windows.get(drag.id)?.element);
      state.ui.panelLayout = movePanel(state.ui.panelLayout, drag.id, { to: 'floating', ...point });
      state.ui.dockCollapsed[drag.id] = false;
      drag.target=target;
    }
    if (state.ui.flyout === drag.id) state.ui.flyout = null;
    render(false);
    showTarget(target);
  }
  function finish(cancelled) {
    if (!drag) return;
    const previous = drag; drag = null;
    document.removeEventListener('pointermove', moveDrag); document.removeEventListener('pointerup', endDrag); document.removeEventListener('pointercancel', cancelDrag);
    if (shell.hasPointerCapture(previous.pointerId)) shell.releasePointerCapture(previous.pointerId);
    shell.classList.remove('is-panel-dragging'); rail.classList.remove('is-drop-target'); indicator.hidden=true;
    if (previous.started) {
      suppressClickUntil = Date.now() + 300;
      setTimeout(() => { suppressClickUntil = 0; }, 0);
      if (cancelled) { state.ui.panelLayout = previous.original; state.ui.flyout = previous.flyout; state.ui.dockCollapsed = previous.collapsed; }
      else {
        if(previous.target&&previous.target.to!=='rail'){
          const target={...previous.target},layout=state.ui.panelLayout;
          if(target.before){const c=layout.columns.find(c=>c.id===target.column),index=c?.panels.indexOf(target.before);if(index>=0)target.index=index;}
          if(target.beforeColumn){const index=layout.columns.findIndex(c=>c.id===target.beforeColumn);if(index>=0)target.columnIndex=index;}
          state.ui.panelLayout=movePanel(layout,previous.id,target);
        }
        persist();
      }
      if (!destroyed) refresh();
    }
  }
  function endDrag(event) { if (event.pointerId === drag?.pointerId) finish(false); }
  function cancelDrag(event) { if (event.pointerId === drag?.pointerId) finish(true); }
  // Capture the compatibility click after dragging so a dock header does not collapse on drop.
  const suppressClick = event => { if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); } };
  shell.addEventListener('click', suppressClick, true);
  const interrupted = () => {finish(true);sizing?.cancel();};
  shell.addEventListener('lostpointercapture', interrupted); window.addEventListener('blur', interrupted);
  const resize = new ResizeObserver(() => { if (!destroyed && shell.clientWidth && shell.clientHeight) render(false); }); resize.observe(shell);
  return { render, open, close, location, layoutDock, cancel() { if(sizing){sizing.cancel();return true;}if (!drag) return false; finish(true); return true; },
    bodies: () => all().filter(entry => !entry.element.hidden).map(entry => entry.body),
    destroy() { destroyed = true; finish(true); sizing?.cancel(); resize.disconnect(); indicator.remove(); beforePanels.remove(); shell.removeEventListener('click', suppressClick, true);
      shell.removeEventListener('lostpointercapture', interrupted); window.removeEventListener('blur', interrupted); } };
}
