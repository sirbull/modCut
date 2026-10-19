import { colorFromValues, colorValues } from '../doc/color.mjs';

/** Shared HSB surface. Keep hue when picking black/gray so the next drag keeps the chosen hue. */
export function createColorSurface(hex, { hsb, verticalHue = false, disabled = false, onStart = () => {}, onInput = () => {}, onCommit = () => {} } = {}) {
  let values = hsb && colorFromValues('hsb',hsb) === hex.toUpperCase() ? [...hsb] : colorValues('hsb',hex);
  const element = document.createElement('div'); element.className = 'draw-color-surface';
  element.classList.toggle('draw-color-surface--vertical',verticalHue);
  const plane = document.createElement('div'); plane.className = 'draw-color-plane'; plane.tabIndex = disabled ? -1 : 0;
  plane.setAttribute('role','slider'); plane.setAttribute('aria-label','Saturation and brightness');
  plane.setAttribute('aria-valuemin','0'); plane.setAttribute('aria-valuemax','100'); plane.setAttribute('aria-disabled',String(disabled));
  const marker = document.createElement('span'); marker.className = 'draw-color-plane__marker'; plane.append(marker);
  const hueLabel = document.createElement('label'); hueLabel.className = 'draw-color-hue';
  const hue = document.createElement('input'); hue.type = 'range'; hue.min = '0'; hue.max = '360'; hue.step = '.1'; hue.disabled = disabled;
  hue.setAttribute('aria-label','Hue'); hue.dataset.colorHue = ''; hueLabel.append(hue);
  element.append(plane,hueLabel);
  function draw() {
    plane.style.setProperty('--hue-color',colorFromValues('hsb',[values[0],100,100]));
    marker.style.left = `${values[1]}%`; marker.style.top = `${100-values[2]}%`;
    plane.setAttribute('aria-valuenow',String(values[1])); plane.setAttribute('aria-valuetext',`${values[1]}% saturation, ${values[2]}% brightness`);
    hue.value = String(values[0]);
  }
  const emit = () => { draw(); onInput(colorFromValues('hsb',values),[...values]); };
  function point(event) {
    const box = plane.getBoundingClientRect(), clamp = v => Math.round(Math.max(0,Math.min(100,v))*10)/10;
    values[1] = clamp((event.clientX-box.left)/box.width*100); values[2] = clamp(100-(event.clientY-box.top)/box.height*100); emit();
  }
  let pointer = null;
  plane.addEventListener('pointerdown',event => {
    if (disabled || event.button !== 0) return;
    event.preventDefault(); plane.focus(); pointer = event.pointerId; plane.setPointerCapture(pointer); onStart(); point(event);
  });
  plane.addEventListener('pointermove',event => { if (pointer === event.pointerId) point(event); });
  const end = event => { if (pointer !== event.pointerId) return; pointer = null; onCommit(); };
  plane.addEventListener('pointerup',end); plane.addEventListener('pointercancel',end); plane.addEventListener('lostpointercapture',end);
  plane.addEventListener('keydown',event => {
    if (disabled || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); onStart();
    const i = ['ArrowLeft','ArrowRight'].includes(event.key) ? 1 : 2, delta = ['ArrowRight','ArrowUp'].includes(event.key) ? 1 : -1;
    values[i] = Math.max(0,Math.min(100,values[i]+delta*(event.shiftKey?10:1))); emit(); onCommit();
  });
  let hueActive = false;
  hue.addEventListener('input',() => { if (!hueActive) { hueActive = true; onStart(); } values[0] = Number(hue.value); emit(); });
  hue.addEventListener('change',() => { hueActive = false; onCommit(); });
  draw();
  return { element, setHsb(next) { values = [...next]; draw(); }, setHex(next) {
    const updated = colorValues('hsb',next);
    if (!updated[1] || !updated[2]) updated[0] = values[0];
    values = updated; draw();
  } };
}
