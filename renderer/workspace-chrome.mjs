/** Keep the complete tab strip beside the app actions whenever it fits. Measure
 * its contents independently of its current row so resizing cannot oscillate. */
export function initWorkspaceChrome() {
  const header = document.querySelector('.toolbar');
  const actions = header.querySelector('.toolbar__actions');
  const options = header.querySelector('.toolbar__options');
  const tabs = document.getElementById('docTabs');
  const items = document.getElementById('tabItems');
  const add = document.getElementById('addTab');
  let frame = 0;
  const update = () => {
    frame = 0;
    const style = getComputedStyle(header);
    const gap = parseFloat(style.columnGap) || 0;
    const itemGap = parseFloat(getComputedStyle(items).columnGap) || 0;
    const tabGap = parseFloat(getComputedStyle(tabs).columnGap) || 0;
    const widths = [...items.children].reduce((sum, tab) => sum + tab.getBoundingClientRect().width, 0);
    const stripWidth = widths + Math.max(0, items.children.length - 1) * itemGap + add.offsetWidth + tabGap;
    const available = header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const required = actions.getBoundingClientRect().width + options.getBoundingClientRect().width + 2 * gap + stripWidth;
    header.classList.toggle('toolbar--tabs-below', required > available);
    items.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const resize = new ResizeObserver(schedule);
  for (const element of [header, actions, options, items]) resize.observe(element);
  const mutations = new MutationObserver(schedule);
  mutations.observe(items, { childList: true });
  update();
  return () => { resize.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame); };
}
