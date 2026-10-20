import { panelAvailable, panelName } from './registry.mjs';
import { WINDOW_GROUPS, loadPanelLayout, movePanel, normalizePanelLayout, savePanelLayout, windowGroup } from './layout.mjs';
import { shortcutLabel } from '../keymap.mjs';

/** Chrome and pointer interaction only. Panel content and document edits stay in ui.mjs. */
export function createPanelWindows({ shell, rail, panels, splitter, dock, state, icon, renderContent, refresh, layoutDock }) {
  state.ui.panelLayout = normalizePanelLayout(state.ui.panelLayout ?? loadPanelLayout());
  const windows = new Map(), buttons = new Map(), separators = new Map(), isMac = /Mac/.test(navigator.platform);
  let drag = null, suppressClickUntil = 0, front = 20, destroyed = false;
  const persist = () => savePanelLayout(state.ui.panelLayout);
  const all = () => [flyout, ...windows.values()];
  const groupById = id => WINDOW_GROUPS.find(group => group.id === id);
  const activeTab = group => group.tabs.includes(state.ui.groupTabs[group.id]) && panelAvailable(state.ui.groupTabs[group.id])
    ? state.ui.groupTabs[group.id] : group.tabs.find(panelAvailable);
  const location = id => state.ui.panelLayout.dock.includes(id) ? 'dock' : state.ui.panelLayout.rail.includes(id) ? 'rail'
    : state.ui.panelLayout.floating[id] ? 'floating' : 'closed';

  function hide(id) {
    state.ui.panelLayout = movePanel(state.ui.panelLayout, id, { to: 'closed' });
    if (state.ui.flyout === id) state.ui.flyout = null;
    persist(); refresh(); rail.querySelector('button')?.focus({ preventScroll: true });
  }
  function makeWindow(floating) {
    const element = document.createElement('section'); element.className = floating ? 'draw-panel-window draw-floating-panel' : 'draw-panel-window draw-flyout';
    element.hidden = true; element.setAttribute('role', 'dialog');
    const header = document.createElement('div'); header.className = 'draw-flyout__header';
    const tabs = document.createElement('div'); tabs.className = 'draw-flyout__tabs'; tabs.setAttribute('role', 'tablist');
    const dockButton = document.createElement('button'); dockButton.type = 'button'; dockButton.className = 'draw-layer-action draw-panel-dock';
    dockButton.textContent = 'Dock'; dockButton.setAttribute('aria-label', 'Dock panel'); dockButton.dataset.tooltip = 'Dock panel';
    dockButton.addEventListener('click', () => {
      const id = element.dataset.drawGroup;
      state.ui.panelLayout = movePanel(state.ui.panelLayout, id, { to: 'rail' });
      state.ui.flyout = id; persist(); refresh(); buttons.get(id)?.focus({ preventScroll: true });
    });
    const close = document.createElement('button'); close.type = 'button'; close.className = 'draw-layer-action draw-flyout__close';
    close.setAttribute('aria-label', 'Close panel'); close.dataset.tooltip = 'Close panel'; close.append(icon('x'));
    close.addEventListener('click', () => hide(element.dataset.drawGroup));
    header.append(tabs, dockButton, close);
    const body = document.createElement('div'); body.className = 'draw-panel draw-flyout__body'; body.setAttribute('role', 'tabpanel');
    element.append(header, body); shell.append(element);
    header.addEventListener('pointerdown', event => {
      if (!event.target.closest('.draw-layer-action')) startDrag(event, element.dataset.drawGroup, element);
    });
    element.addEventListener('pointerdown', () => { if (floating) element.style.zIndex = String(++front); });
    return { element, header, tabs, body, dockButton };
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
  for (const [id, entry] of Object.entries(dock)) entry.header.addEventListener('pointerdown', event => startDrag(event, id, entry.section));

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
    entry.dockButton.hidden = state.ui.panelLayout.rail.includes(group.id);
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
      button.classList.toggle('is-dragging', drag?.started && drag.id === id);
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
    for (const [id, entry] of Object.entries(dock)) {
      const inDock = layout.dock.includes(id), inWindow = location(id) === 'floating' || state.ui.flyout === id;
      entry.section.hidden = !inDock && !inWindow;
      entry.section.classList.toggle('is-detached', !inDock);
      if (inDock) {
        if (id === 'properties' && entry.section.nextSibling !== splitter) panels.insertBefore(entry.section, splitter);
        if (id === 'layers' && entry.section.parentElement !== panels) panels.append(entry.section);
      } else if (!inWindow) entry.section.remove();
    }
    shell.classList.toggle('draw-shell--dock-empty', !layout.dock.length);
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
    if (event.button !== 0 || drag) return;
    const bounds = source.getBoundingClientRect(), point = state.ui.panelLayout.floating[id];
    drag = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: false,
      original: structuredClone(state.ui.panelLayout), flyout: state.ui.flyout, collapsed: { ...state.ui.dockCollapsed },
      offsetX: point ? event.clientX - bounds.left : 24, offsetY: point ? event.clientY - bounds.top : 16 };
    document.addEventListener('pointermove', moveDrag); document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', cancelDrag);
  }
  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.started && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    if (!drag.started) shell.setPointerCapture(event.pointerId);
    drag.started = true; event.preventDefault(); shell.classList.add('is-panel-dragging');
    const box = shell.getBoundingClientRect(), railBox = rail.getBoundingClientRect();
    const overRail = event.clientX >= railBox.left - 10 && event.clientX <= railBox.right + 10 && event.clientY >= railBox.top && event.clientY <= railBox.bottom;
    rail.classList.toggle('is-drop-target', overRail);
    if (overRail) {
      if (event.clientY < railBox.top + 28) rail.scrollTop -= 16;
      else if (event.clientY > railBox.bottom - 28) rail.scrollTop += 16;
      const others = [...rail.querySelectorAll('[data-draw-panel]')].filter(button => button.dataset.drawPanel !== drag.id);
      const index = others.findIndex(button => { const rect = button.getBoundingClientRect(); return event.clientY < rect.top + rect.height / 2; });
      state.ui.panelLayout = movePanel(state.ui.panelLayout, drag.id, { to: 'rail', index: index < 0 ? others.length : index });
    } else {
      const point = clampPoint({ x: event.clientX - box.left - drag.offsetX, y: event.clientY - box.top - drag.offsetY }, windows.get(drag.id)?.element);
      state.ui.panelLayout = movePanel(state.ui.panelLayout, drag.id, { to: 'floating', ...point });
      state.ui.dockCollapsed[drag.id] = false;
    }
    if (state.ui.flyout === drag.id) state.ui.flyout = null;
    render(false);
  }
  function finish(cancelled) {
    if (!drag) return;
    const previous = drag; drag = null;
    document.removeEventListener('pointermove', moveDrag); document.removeEventListener('pointerup', endDrag); document.removeEventListener('pointercancel', cancelDrag);
    if (shell.hasPointerCapture(previous.pointerId)) shell.releasePointerCapture(previous.pointerId);
    shell.classList.remove('is-panel-dragging'); rail.classList.remove('is-drop-target');
    if (previous.started) {
      suppressClickUntil = Date.now() + 300;
      setTimeout(() => { suppressClickUntil = 0; }, 0);
      if (cancelled) { state.ui.panelLayout = previous.original; state.ui.flyout = previous.flyout; state.ui.dockCollapsed = previous.collapsed; }
      else persist();
      if (!destroyed) refresh();
    }
  }
  function endDrag(event) { if (event.pointerId === drag?.pointerId) finish(false); }
  function cancelDrag(event) { if (event.pointerId === drag?.pointerId) finish(true); }
  // Capture the compatibility click after dragging so a dock header does not collapse on drop.
  const suppressClick = event => { if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); } };
  shell.addEventListener('click', suppressClick, true);
  const interrupted = () => finish(true);
  shell.addEventListener('lostpointercapture', interrupted); window.addEventListener('blur', interrupted);
  const resize = new ResizeObserver(() => { if (!destroyed && shell.clientWidth && shell.clientHeight) render(false); }); resize.observe(shell);
  return { render, open, close, location, cancel() { if (!drag) return false; finish(true); return true; },
    bodies: () => all().filter(entry => !entry.element.hidden).map(entry => entry.body),
    destroy() { destroyed = true; finish(true); resize.disconnect(); shell.removeEventListener('click', suppressClick, true);
      shell.removeEventListener('lostpointercapture', interrupted); window.removeEventListener('blur', interrupted); } };
}
