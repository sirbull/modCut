/**
 * Scrubby labels: drag a number field's title horizontally to change its value.
 * Shift is ten times faster, Alt/Option ten times finer, Escape cancels. Arrow keys in the field step
 * by one, or ten with Shift. Value logic lives in scrub.mjs.
 */
import { createScrubber, inferStep, stepValue } from './scrub.mjs';

const DRAG_THRESHOLD = 3;
let active = null;
// A lock granted after a short drag already ended must not linger.
if (typeof document !== 'undefined') document.addEventListener('pointerlockchange', () => {
  if (!active && document.pointerLockElement === document.body) document.exitPointerLock?.();
});
/** Cancel a drag in progress. Draw's Escape command calls this before anything else. */
export function cancelActiveScrub() { if (!active) return false; active.cancel(); return true; }
export function isScrubbing() { return !!active; }

const finite = value => { const n = Number.parseFloat(value); return Number.isFinite(n) ? n : undefined; };
function fieldLimits(input, options) {
  return { min: options.min ?? finite(input.min), max: options.max ?? finite(input.max) };
}
function defaultEmit(input, phase, value) {
  // Behaves like typing: listeners see input events while dragging and one change at the end.
  if (phase === 'move' || phase === 'cancel') { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }
  if (phase === 'end' || phase === 'cancel') input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Make `handle` (normally the field's title) scrub `input`.
 * `onScrub(phase, value)` receives 'start', 'move' (throttled to one per frame), 'end' and 'cancel'
 * (with the original value). Without it the field behaves as if the user typed.
 */
export function attachScrub(handle, input, options = {}) {
  if (!handle || !input || handle.dataset.drawScrub !== undefined) return;
  handle.dataset.drawScrub = input.dataset.drawField || input.name || '';
  handle.classList.add('draw-scrub');
  input.dataset.drawScrubInput = '';
  const emit = (phase, value) => options.onScrub ? options.onScrub(phase, value) : defaultEmit(input, phase, value);
  const step = () => options.step ?? inferStep(input.step, handle.textContent);
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || input.disabled || input.readOnly || active) return;
    event.preventDefault();
    const { min, max } = fieldLimits(input, options), originalText = input.value;
    const start = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : finite(input.placeholder) ?? 0;
    const scrubber = createScrubber({ start, step: step(), min, max });
    let moved = false, lastX = event.clientX, travelled = 0, frame = 0, pending = false, locked = false;
    const flush = () => { cancelAnimationFrame(frame); frame = 0; if (pending) { pending = false; emit('move', scrubber.value); } };
    const begin = () => {
      moved = true; emit('start', start); document.body.classList.add('draw-scrubbing');
      // Pointer lock lets the drag continue past the screen edge. Without it, normal movement is used.
      try { const request = document.body.requestPointerLock?.(); request?.catch?.(() => {}); } catch {}
    };
    const move = e => {
      // Under pointer lock the pointer stays put and movementX carries the motion; otherwise use the position.
      const dx = document.pointerLockElement && e.movementX ? e.movementX : e.clientX - lastX; lastX = e.clientX;
      if (!moved) { travelled += dx; if (Math.abs(travelled) < DRAG_THRESHOLD) return; begin(); }
      const before = scrubber.value, value = scrubber.move(dx, { fast: e.shiftKey, fine: e.altKey });
      if (value === before) return;
      input.value = String(value); options.onDisplay?.(value);
      pending = true; frame ||= requestAnimationFrame(() => { frame = 0; flush(); });
    };
    const finish = phase => {
      window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancelled, true); window.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerlockchange', lockChange);
      document.body.classList.remove('draw-scrubbing'); active = null;
      if (document.pointerLockElement === document.body) { locked = false; document.exitPointerLock?.(); }
      if (!moved) return;
      if (phase === 'cancel') { cancelAnimationFrame(frame); pending = false; input.value = originalText; emit('cancel', start); }
      else { flush(); emit('end', scrubber.value); }
    };
    const up = () => { const click = !moved; finish('end'); if (click) { input.focus(); input.select?.(); } };
    const cancelled = () => finish('cancel');
    // Modal dialogs let key events through to us; Draw's own Escape command calls cancelActiveScrub().
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish('cancel'); } };
    // Chromium releases pointer lock on Escape without delivering the key; treat that as cancel.
    const lockChange = () => { if (document.pointerLockElement === document.body) locked = true; else if (locked) { locked = false; finish('cancel'); } };
    window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancelled, true); window.addEventListener('keydown', key, true);
    document.addEventListener('pointerlockchange', lockChange);
    active = { cancel: () => finish('cancel') };
  });
  input.addEventListener('keydown', event => {
    if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || input.disabled || input.readOnly) return;
    event.preventDefault();
    const { min, max } = fieldLimits(input, options), current = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
    input.value = String(stepValue(current, event.key === 'ArrowUp' ? 1 : -1, { step: step(), min, max, fast: event.shiftKey }));
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    // Panels re-render after a change; keep typing focus in the field's replacement.
    if (!input.isConnected && input.dataset.drawField) {
      const next = [...document.querySelectorAll('[data-draw-scrub-input]')].find(el => el.dataset.drawField === input.dataset.drawField && el.offsetParent);
      next?.focus(); next?.select?.();
    }
  });
}

/** Give every titled number field inside `root` a scrubby title (dialogs and forms). */
export function enhanceNumberFields(root) {
  for (const input of root.querySelectorAll('input[type=number]')) {
    const handle = input.closest('label')?.querySelector(':scope > span') ?? input.labels?.[0];
    if (handle && !handle.contains(input)) attachScrub(handle, input);
  }
}
