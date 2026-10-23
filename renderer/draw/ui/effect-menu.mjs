import { CONVERT_SHAPES, LIVE_LABELS } from '../doc/effects.mjs';
import { WARP_STYLES } from '../geom/warp.mjs';

const item = (label, command) => ({ label, command });
/**
 * Effect menu, ordered as in Illustrator: the menubar's Effect menu and the fx button in Properties
 * both build from this. Items run a draw command; `items` makes a submenu.
 */
export const EFFECT_MENU = Object.freeze([
  { heading: 'Illustrator Effects', items: [
    { label: 'Convert to Shape', items: Object.entries(CONVERT_SHAPES).map(([id, label]) => item(`${label}…`, `convert-${id}`)) },
    { label: 'Distort & Transform', items: [item('Free Distort…', 'effect-free-distort'), item('Pucker & Bloat…', 'effect-pucker-bloat'), item('Roughen…', 'effect-roughen'),
      item('Transform…', 'effect-transform'), item('Twist…', 'effect-twist'), item('Zig Zag…', 'effect-zig-zag')] },
    { label: 'Path', items: [item('Offset Path…', 'effect-offset-path')] },
    { label: 'Pathfinder', items: Object.entries(LIVE_LABELS).map(([id, label]) => item(label, `live-${id}`)) },
    item('Rasterize…', 'effect-rasterize'),
    { label: 'Stylize', items: [item('Drop Shadow…', 'effect-drop-shadow'), item('Feather…', 'effect-feather'), item('Inner Glow…', 'effect-inner-glow'),
      item('Outer Glow…', 'effect-outer-glow'), item('Round Corners…', 'effect-round-corners'), item('Scribble…', 'effect-scribble')] },
    { label: 'Warp', items: Object.entries(WARP_STYLES).map(([id, label]) => item(`${label}…`, `warp-${id}`)) },
  ] },
  { heading: 'Photoshop Effects', items: [
    { label: 'Blur', items: [item('Gaussian Blur…', 'effect-gaussian-blur')] },
    { label: 'Pixelate', items: [item('Mosaic…', 'effect-mosaic')] },
  ] },
]);

/**
 * The Effect menu as a popup under `anchor` (the fx button): submenus open on hover or Arrow Right,
 * Escape closes one level, a click outside closes it. `command(id)` runs the chosen effect.
 */
export function openEffectMenu(anchor, { command, disabled = false }) {
  const session = new AbortController(), events = { signal: session.signal }, menus = [];
  const close = ({ focus = false } = {}) => { session.abort(); for (const m of menus.splice(0)) m.remove(); anchor.setAttribute('aria-expanded', 'false'); if (focus && anchor.isConnected) anchor.focus({ preventScroll: true }); };
  const place = (el, left, top) => { const box = el.getBoundingClientRect();
    el.style.left = `${Math.max(4, Math.min(left, innerWidth - box.width - 4))}px`; el.style.top = `${Math.max(4, Math.min(top, innerHeight - box.height - 4))}px`; };
  const buttons = el => [...el.querySelectorAll(':scope > button:not(:disabled)')];
  function build(entries, depth, label) {
    const menu = document.createElement('div'); menu.className = 'draw-context-menu draw-effect-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', label);
    menu.dataset.drawEffectMenu = String(depth); document.body.append(menu); menus.push(menu);
    const closeFrom = level => { for (const m of menus.splice(level)) m.remove(); menu.querySelectorAll('[aria-expanded=true]').forEach(b => b.setAttribute('aria-expanded', 'false')); };
    function row(entry) {
      const b = document.createElement('button'); b.type = 'button'; b.tabIndex = -1; b.setAttribute('role', 'menuitem'); b.disabled = disabled;
      const name = document.createElement('span'); name.textContent = entry.label;
      const key = document.createElement('span'); key.className = 'draw-context-menu__key'; key.textContent = entry.items ? '›' : '';
      b.append(document.createElement('span'), name, key); menu.append(b);
      if (entry.items) {
        b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); b.dataset.drawEffectSubmenu = entry.label;
        const show = focus => { if (b.getAttribute('aria-expanded') === 'true') { if (focus) buttons(menus[depth + 1])[0]?.focus(); return; }
          closeFrom(depth + 1); b.setAttribute('aria-expanded', 'true');
          const sub = build(entry.items, depth + 1, entry.label), at = b.getBoundingClientRect(), own = menu.getBoundingClientRect(), width = sub.getBoundingClientRect().width;
          place(sub, own.right + width + 4 <= innerWidth ? own.right - 1 : own.left - width + 1, at.top - 5); if (focus) buttons(sub)[0]?.focus({ preventScroll: true }); };
        b.addEventListener('pointerenter', () => show(false)); b.addEventListener('click', () => show(true)); b.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); show(true); } });
      } else {
        b.dataset.drawEffectCommand = entry.command;
        b.addEventListener('pointerenter', () => closeFrom(depth + 1));
        b.addEventListener('click', () => { close({ focus: true }); command(entry.command); });
      }
    }
    for (const entry of entries) {
      if (!entry.heading) { row(entry); continue; }
      if (menu.children.length) { const sep = document.createElement('div'); sep.className = 'draw-context-menu__separator'; sep.setAttribute('role', 'separator'); menu.append(sep); }
      const head = document.createElement('div'); head.className = 'draw-effect-menu__heading'; head.setAttribute('role', 'presentation'); head.textContent = entry.heading; menu.append(head);
      entry.items.forEach(row);
    }
    menu.addEventListener('keydown', event => {
      const choices = buttons(menu), index = choices.indexOf(event.target.closest('button'));
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') choices[(index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length]?.focus();
      else if (event.key === 'Home' || event.key === 'End') choices.at(event.key === 'Home' ? 0 : -1)?.focus();
      else if ((event.key === 'ArrowLeft' || event.key === 'Escape') && depth) { const opener = menus[depth - 1].querySelector('[aria-expanded=true]'); closeFrom(depth); opener?.setAttribute('aria-expanded', 'false'); opener?.focus(); }
      else if (event.key === 'Escape' || event.key === 'Tab') close({ focus: true });
      else return;
      event.preventDefault(); event.stopPropagation();
    });
    menu.addEventListener('contextmenu', event => event.preventDefault());
    return menu;
  }
  const root = build(EFFECT_MENU, 0, 'Effects'), at = anchor.getBoundingClientRect();
  anchor.setAttribute('aria-expanded', 'true');
  place(root, at.left, at.bottom + 2 + root.getBoundingClientRect().height <= innerHeight ? at.bottom + 2 : at.top - root.getBoundingClientRect().height - 2);
  buttons(root)[0]?.focus({ preventScroll: true });
  document.addEventListener('pointerdown', event => { if (!menus.some(m => m.contains(event.target)) && !anchor.contains(event.target)) close(); }, { ...events, capture: true });
  window.addEventListener('blur', () => close(), events); window.addEventListener('resize', () => close(), events);
  window.addEventListener('scroll', event => { if (!menus.some(m => m.contains(event.target))) close(); }, { ...events, capture: true });
  return { close };
}
