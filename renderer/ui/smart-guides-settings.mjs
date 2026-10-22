/** A compact visual page. Changes use the same immediate-save behavior as Appearance. */
export function smartGuidesSettings(host, preferences, update) {
  host.classList.add('smart-guide-settings');
  const top = document.createElement('div'); top.className = 'smart-guide-settings__controls'; host.append(top);
  const control = (key, title, type) => {
    const label = document.createElement('label'); label.className = 'field';
    const name = document.createElement('span'); name.textContent = title;
    const input = document.createElement('input'); input.type = type; input.name = key; input.value = preferences[key];
    label.append(name, input); top.append(label); return input;
  };
  const color = control('smartGuideColor', 'Guide colour', 'color');
  host.style.setProperty('--smart-guide-color', color.value);
  color.addEventListener('input', () => { host.style.setProperty('--smart-guide-color', color.value); update({ smartGuideColor: color.value }); });
  const tolerance = control('smartGuideTolerance', 'Snapping Tolerance', 'range');
  tolerance.min = 1; tolerance.max = 20; tolerance.step = 1;
  const value = document.createElement('output'); tolerance.after(value);
  const showTolerance = () => { value.textContent = `${tolerance.value} px`; };
  tolerance.addEventListener('input', () => { showTolerance(); update({ smartGuideTolerance: Number(tolerance.value) }); }); showTolerance();
  const cards = document.createElement('div'); cards.className = 'smart-guide-settings__cards'; host.append(cards);
  const rects = '<g class="smart-guide-example__objects"><rect x="10" y="12" width="24" height="24"/><rect x="66" y="12" width="24" height="24"/></g>';
  const examples = [
    ['smartGuideAlignment', 'Alignment Guides', 'Snap edges and centres into line while moving objects.', '<path d="M4 12H96M22 4V44"/>'],
    ['smartGuideHighlight', 'Object Highlighting', 'Outline the object under the pointer before selecting it.', '<rect x="66" y="12" width="24" height="24"/><path d="m80 26 2 13 3-5 5-1Z"/>'],
    ['smartGuideMeasurements', 'Measurement Labels', 'Show movement and equal-gap distances while dragging.', '<path d="M34 24H66m-32-4v8m32-8v8"/><text x="50" y="19">32 mm</text>'],
    ['smartGuideSpacing', 'Spacing Guides', 'Snap to equal gaps between nearby objects.', '<rect x="43" y="12" width="14" height="24"/><path d="M34 41h9m14 0h9m-32-3v6m9-6v6m14-6v6m9-6v6"/>'],
  ];
  for (const [key, title, description, drawing] of examples) {
    const label = document.createElement('label'); label.className = 'smart-guide-settings__card field--switch';
    const picture = document.createElement('div'); picture.className = 'smart-guide-example';
    picture.innerHTML = `<svg viewBox="0 0 100 48" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">${rects}${drawing}</svg>`;
    const heading = document.createElement('span'); heading.textContent = title;
    const input = document.createElement('input'); input.type = 'checkbox'; input.name = key; input.checked = preferences[key]; input.setAttribute('role', 'switch');
    const hint = document.createElement('small'); hint.textContent = description;
    input.addEventListener('change', () => update({ [key]: input.checked }));
    label.append(picture, heading, input, hint); cards.append(label);
  }
}
