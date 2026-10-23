import { shortcutLabel } from '../keymap.mjs';
import { RULER_UNITS } from '../view/rulers.mjs';

/** Owned by the workspace so a closed tab never leaves menus or event listeners behind. */
export function createContextMenu(host, { canvas, command, enabled, checked, isMac = false }) {
  let menu = null, session = null;
  function close({ focus = false } = {}) {
    if (!menu) return false;
    session.abort(); session = null; menu.remove(); menu = null;
    if (focus && canvas.isConnected) canvas.focus({ preventScroll: true });
    return true;
  }
  function open(x, y, { rulerUnit = null, onUnit = () => {} } = {}) {
    close(); session = new AbortController();
    const events = { signal: session.signal };
    menu = document.createElement('div'); menu.className = 'draw-context-menu';
    menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', rulerUnit ? 'Ruler units' : 'Canvas actions');
    host.append(menu);
    function position(el, left, top) {
      const box = el.getBoundingClientRect();
      el.style.left = `${Math.max(4, Math.min(left, innerWidth - box.width - 4))}px`;
      el.style.top = `${Math.max(4, Math.min(top, innerHeight - box.height - 4))}px`;
    }
    const items = list => [...list.children].filter(el => el.matches('button:not(:disabled)'));
    function row(list, id, label, toggle = false, radio = false) {
      const button = document.createElement('button'); button.type = 'button'; button.tabIndex = -1;
      const selected = radio ? id === `ruler-unit-${rulerUnit}` : toggle && checked(id);
      button.dataset.drawContext = id; button.disabled = radio ? false : !enabled(id);
      button.setAttribute('role', radio ? 'menuitemradio' : toggle ? 'menuitemcheckbox' : 'menuitem');
      if (toggle || radio) button.setAttribute('aria-checked', String(selected));
      const mark = document.createElement('span'); mark.className = 'draw-context-menu__mark'; mark.textContent = toggle && checked(id) ? '✓' : '';
      const name = document.createElement('span'); name.textContent = label;
      const key = document.createElement('span'); key.className = 'draw-context-menu__key'; key.translate = false; key.textContent = radio ? '' : shortcutLabel(id, { isMac });
      button.append(mark, name, key); list.append(button);
      if (radio) mark.textContent = selected ? '\u2713' : '';
      button.addEventListener('click', () => { close({ focus: true }); if (radio) onUnit(id.slice('ruler-unit-'.length)); else command(id); });
      return button;
    }
    function separator() { const el = document.createElement('div'); el.className = 'draw-context-menu__separator'; el.setAttribute('role', 'separator'); menu.append(el); }
    if (rulerUnit) for (const unit of RULER_UNITS) row(menu, `ruler-unit-${unit.id}`, unit.label, false, true);
    else {
      for (const [id, label] of [['cut', 'Cut'], ['copy', 'Copy'], ['paste', 'Paste'], ['paste-place', 'Paste in Place']]) row(menu, id, label);
      separator(); row(menu, 'undo', 'Undo'); row(menu, 'redo', 'Redo');
      separator(); row(menu, 'group', 'Group'); row(menu, 'ungroup', 'Ungroup');
    }
    const arrange = document.createElement('button'); arrange.type = 'button'; arrange.tabIndex = -1;
    arrange.dataset.drawContext = 'arrange'; arrange.setAttribute('role', 'menuitem'); arrange.setAttribute('aria-haspopup', 'menu'); arrange.setAttribute('aria-expanded', 'false');
    arrange.disabled = !['bring-front', 'bring-forward', 'send-backward', 'send-back'].some(enabled);
    const name = document.createElement('span'); name.textContent = 'Arrange';
    const arrow = document.createElement('span'); arrow.textContent = '›'; arrow.className = 'draw-context-menu__key';
    arrange.append(document.createElement('span'), name, arrow); if (!rulerUnit) menu.append(arrange);
    const sub = document.createElement('div'); sub.className = 'draw-context-menu draw-context-menu--submenu'; sub.setAttribute('role', 'menu'); sub.setAttribute('aria-label', 'Arrange'); sub.hidden = true; if (!rulerUnit) menu.append(sub);
    for (const [id, label] of [['bring-front', 'Bring to Front'], ['bring-forward', 'Bring Forward'], ['send-backward', 'Send Backward'], ['send-back', 'Send to Back']]) row(sub, id, label);
    const hideSub = () => { sub.hidden = true; arrange.setAttribute('aria-expanded', 'false'); };
    function showSub(focus = false) {
      if (arrange.disabled) return;
      sub.hidden = false; arrange.setAttribute('aria-expanded', 'true');
      const box = arrange.getBoundingClientRect(), bounds = sub.getBoundingClientRect(), main = menu.getBoundingClientRect();
      position(sub, main.right + bounds.width + 4 <= innerWidth ? main.right - 1 : main.left - bounds.width + 1, box.top - 5);
      if (focus) items(sub)[0]?.focus({preventScroll:true});
    }
    arrange.addEventListener('pointerenter', () => showSub()); arrange.addEventListener('click', () => showSub(true));
    menu.addEventListener('focusin', event => { if(event.target.parentElement===menu&&event.target!==arrange)hideSub(); });
    menu.addEventListener('pointerover', event => { const button = event.target.closest('button'); if (button?.parentElement === menu && button !== arrange) hideSub(); });
    if (!rulerUnit) { separator(); row(menu, 'rulers', 'Show Rulers', true); row(menu, 'grid', 'Show Grid', true); }
    menu.addEventListener('contextmenu', event => event.preventDefault());
    menu.addEventListener('keydown', event => {
      const target = event.target.closest('button'), list = target?.parentElement === sub ? sub : menu, choices = items(list), index = choices.indexOf(target);
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); event.stopPropagation(); target?.click();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowRight', 'ArrowLeft', 'Escape', 'Tab'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Escape' && !sub.hidden) { hideSub(); arrange.focus(); }
        else if (event.key === 'Escape' || event.key === 'Tab') close({ focus: true });
        else if (event.key === 'ArrowRight' && target === arrange) showSub(true);
        else if (event.key === 'ArrowLeft' && list === sub) { hideSub(); arrange.focus(); }
        else if (event.key === 'Home') choices[0]?.focus();
        else if (event.key === 'End') choices.at(-1)?.focus();
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') choices[(index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length]?.focus();
      } else if (event.key !== 'Enter' && event.key !== ' ') { close({ focus: true }); }
    });
    document.addEventListener('pointerdown', event => { if (!menu?.contains(event.target)) close(); }, { ...events, capture: true });
    window.addEventListener('blur', () => close(), events);
    window.addEventListener('resize', () => close(), events);
    window.addEventListener('scroll', event => { if(!menu?.contains(event.target))close(); }, { ...events, capture: true });
    position(menu, x, y); items(menu)[0]?.focus({preventScroll:true});
  }
  return { open, close, destroy: () => close() };
}
