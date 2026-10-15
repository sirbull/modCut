import { toolRegistry, iconHref } from './registry.mjs';
import { toolTooltip, shortcutLabel } from '../keymap.mjs';
import { icon } from '../panels/ui.mjs';

/** One rail entry per group. Its flyout contains only the other variants. */
export const TOOL_GROUPS = Object.freeze([...new Set(toolRegistry.tools.map(t => t.group))]
  .map(id => Object.freeze({ id, tools: Object.freeze(toolRegistry.group(id).map(t => t.id)) })));

export function createToolbar(host, state, { available, setTool, command, openPanel, run }) {
  const grid = document.createElement('div'); grid.className = 'draw-tool-grid'; host.append(grid);
  const buttons = new Map(), variants = new Map();
  const isMac = /Mac/.test(navigator.platform);
  let flyout = null, trigger = null, pressTimer = null;
  function close(restoreFocus = false) {
    const previous=trigger;
    clearTimeout(pressTimer); flyout?.remove(); flyout = null;
    trigger?.setAttribute('aria-expanded','false'); trigger = null;
    if(restoreFocus===true && previous?.isConnected && !previous.disabled)previous.focus();
  }
  function paintButton(button, id) {
    const tool = toolRegistry.get(id);
    button.replaceChildren(icon(iconHref(id))); button.dataset.drawTool = id;
    button.setAttribute('aria-label',tool.name);
    button.dataset.tooltip = toolTooltip(id,{isMac})+(available(id) ? '' : ` — phase ${tool.phase ?? 'later'}`);
    button.disabled = !available(id) || state.document.readOnly && !['select','hand','zoom'].includes(id);
    button.setAttribute('aria-pressed',String(id === state.ui.tool));
  }
  function open(group, button) {
    close(); trigger = button; button.setAttribute('aria-expanded','true');
    flyout = document.createElement('div'); flyout.className = 'draw-tool-flyout'; flyout.setAttribute('role','menu');
    flyout.setAttribute('aria-label',`${toolRegistry.get(group.tools[0]).name} tools`);
    for (const id of group.tools.filter(id => id !== button.dataset.drawTool)) {
      const option = document.createElement('button'); option.type = 'button'; option.className = 'draw-icon-button';
      paintButton(option,id); option.setAttribute('role','menuitem');
      const label = document.createElement('span'); label.textContent = toolRegistry.get(id).name; option.append(label);
      option.addEventListener('click',() => { close(); setTool(id); }); flyout.append(option);
    }
    document.body.append(flyout);
    const b = button.getBoundingClientRect(), box = flyout.getBoundingClientRect();
    flyout.style.left = `${b.right+8}px`; flyout.style.top = `${Math.max(8,Math.min(b.top,innerHeight-box.height-8))}px`;
    flyout.querySelector('button:not(:disabled)')?.focus();
  }
  for (const group of TOOL_GROUPS) {
    const wrap = document.createElement('div'); wrap.className = 'draw-tool-group'; grid.append(wrap);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'draw-icon-button';
    buttons.set(group.id,button); variants.set(group.id,group.tools[0]); paintButton(button,group.tools[0]); wrap.append(button);
    if (group.tools.length > 1) {
      button.setAttribute('aria-haspopup','menu'); button.setAttribute('aria-expanded','false');
      const more = document.createElement('button'); more.type = 'button'; more.className = 'draw-tool-more'; more.textContent = '▾';
      more.setAttribute('aria-label',`${group.id === 'shapes' ? 'Shape' : toolRegistry.get(group.tools[0]).name} tools`);
      more.addEventListener('click',() => flyout && trigger === button ? close() : open(group,button)); wrap.append(more);
      button.addEventListener('contextmenu',event => { event.preventDefault(); open(group,button); });
      button.addEventListener('pointerdown',event => { if (event.button === 0) pressTimer = setTimeout(() => open(group,button),450); });
      button.addEventListener('pointerup',() => clearTimeout(pressTimer));
      button.addEventListener('pointercancel',() => clearTimeout(pressTimer));
    }
    button.addEventListener('click',event => {
      if (flyout) return;
      if (event.altKey) {
        const choices = group.tools.filter(available), current = choices.indexOf(button.dataset.drawTool);
        if (choices.length) setTool(choices[(current+1)%choices.length]);
      } else setTool(button.dataset.drawTool);
    });
    button.addEventListener('dblclick',()=>{if(['rotate','reflect','scale'].includes(button.dataset.drawTool))command('tool-dialog');});
  }
  const paint = document.createElement('div'); paint.className = 'draw-paint-box'; paint.setAttribute('aria-label','Fill and stroke'); host.append(paint);
  for (const kind of ['fill','stroke']) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `draw-paint-swatch draw-paint-swatch--${kind}`;
    button.setAttribute('aria-label',kind === 'fill' ? 'Edit fill color' : 'Edit stroke color'); button.dataset.paint = kind;
    button.dataset.tooltip = `${kind === 'fill' ? 'Fill' : 'Stroke'} (${shortcutLabel('paint-focus',{isMac})} toggles)`;
    // Fill and stroke colors are both edited in the Color panel, as in Illustrator.
    button.addEventListener('click',() => { state.ui.paintFocus = kind; openPanel('color'); update(); }); paint.append(button);
  }
  const actions = document.createElement('div'); actions.className = 'draw-paint-actions'; paint.append(actions);
  const modes = document.createElement('div'); modes.className = 'draw-paint-actions draw-paint-modes'; paint.append(modes);
  for (const [id,label,glyph,host,later] of [['paint-swap','Swap fill and stroke','⇄',actions],['default-paint','Default fill and stroke','◩',actions],
    ['paint-solid','Color','■',modes],['paint-gradient','Gradient','▤',modes,'Gradients arrive in phase 2.'],['paint-none','None','∅',modes]]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = glyph; button.setAttribute('aria-label',label); button.dataset.paintAction = id;
    button.dataset.tooltip = later ? `${label} · ${later}` : `${label} (${shortcutLabel(id,{isMac})})`; button.disabled = state.document.readOnly || !!later;
    button.addEventListener('click',() => run(() => command(id))); host.append(button);
  }
  function update() {
    const active = toolRegistry.get(state.ui.tool);
    if (active) variants.set(active.group,active.id);
    for (const [group,button] of buttons) paintButton(button,variants.get(group));
    for (const button of paint.querySelectorAll('[data-paint]')) {
      const value = state.ui[button.dataset.paint]; button.style.setProperty('--paint-color',value || 'transparent');
      button.classList.toggle('is-none',!value); button.setAttribute('aria-pressed',String((state.ui.paintFocus || 'fill') === button.dataset.paint));
    }
  }
  const outside = event => { if (flyout && !flyout.contains(event.target) && !trigger?.parentElement.contains(event.target)) close(); };
  document.addEventListener('pointerdown',outside); window.addEventListener('blur',close); window.addEventListener('resize',close);
  update();
  return { update, close, destroy() { close(); document.removeEventListener('pointerdown',outside); window.removeEventListener('blur',close); window.removeEventListener('resize',close); } };
}
