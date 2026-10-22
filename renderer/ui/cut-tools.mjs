import { createToolbar, TOOL_GROUPS } from '../draw/tools/toolbar.mjs';

// Keep Cut's bed identifiers at the boundary; presentation and keys use Draw's metadata.
export const CUT_TOOLS = Object.freeze({
  select: 'select', 'direct-selection': 'node', pen: 'pen',
  rectangle: 'rect', ellipse: 'ellipse', line: 'line',
});
export const drawToolForCut = id => Object.keys(CUT_TOOLS).find(key => CUT_TOOLS[key] === id);

export function createCutToolbar(host, getTool, selectTool) {
  host.replaceChildren();
  const toolbar = createToolbar(host, {
    document: { readOnly: false }, ui: { get tool() { return drawToolForCut(getTool()); } },
  }, {
    available: id => Object.hasOwn(CUT_TOOLS, id),
    setTool: id => { toolbar.close(); selectTool(CUT_TOOLS[id]); },
    groups: TOOL_GROUPS.map(group => ({ ...group, tools: group.tools.filter(id => Object.hasOwn(CUT_TOOLS, id)) }))
      .filter(group => group.tools.length),
    paintControls: false,
  });
  // Retain selectors used by Cut integrations while the shared rail uses Draw identifiers.
  const update = () => {
    toolbar.update();
    for (const button of host.querySelectorAll('[data-draw-tool]')) button.dataset.tool = CUT_TOOLS[button.dataset.drawTool];
  };
  update();
  return { ...toolbar, update };
}
