/**
 * Runs modCut MCP tool calls (see electron/mcp-tools.mjs) against a Draw workspace. Every change goes through
 * the document's commands, so each call is one undo step the person at the computer can take back.
 */
import { activeArtboard } from './doc/artboards.mjs';
import { insertNode, removeNode, updateNode } from './doc/commands.mjs';
import { paintHex } from './doc/paint.mjs';
import { appearance } from './geometry.mjs';
import { shapeFromDrag } from './tools/shapes.mjs';

const HEX = /^#[0-9a-f]{6}$/i;
const round = (v) => Math.round(v * 1000) / 1000;
function colour(value, key) {
  if (value === null) return null;
  if (typeof value === 'string' && /^#[0-9a-f]{3}$/i.test(value)) return '#' + [...value.slice(1)].map((c) => c + c).join('').toUpperCase();
  if (typeof value === 'string' && HEX.test(value)) return value.toUpperCase();
  throw new Error(`${key} must be a hex colour such as #FF0000, or null.`);
}
const finite = (value, key) => { if (!Number.isFinite(value)) throw new Error(`${key} must be a number.`); return value; };

/** `hooks.newDocument({name, width, height})` opens a Draw tab and resolves with its workspace. */
export async function runMcpTool(workspace, name, args = {}, hooks = {}) {
  if (name === 'new_document') {
    const width = finite(args.width, 'width'), height = finite(args.height, 'height');
    if (!(width > 0 && height > 0)) throw new Error('width and height must be more than 0.');
    const created = await hooks.newDocument?.({ name: args.name, width, height });
    if (!created) throw new Error('A new Draw document could not be opened.');
    return documentInfo(created);
  }
  if (!workspace) throw new Error('No Draw document is open. Switch a tab to Draw, or call new_document.');
  const { state } = workspace, doc = state.document;
  const editable = () => { if (doc.readOnly) throw new Error('This Draw document is read-only.'); };
  const board = (id) => { const b = id ? doc.getArtboard(id) : activeArtboard(state); if (!b) throw new Error(`There is no artboard ${id}.`); return b; };
  const node = (id) => { const n = doc.getNode(id); if (!n || n.type === 'layer') throw new Error(`There is no object ${id}.`); return n; };
  switch (name) {
    case 'document_info': return documentInfo(workspace);
    case 'list_objects': {
      const limit = Math.max(1, Math.min(2000, args.limit ?? 200)), out = [];
      const layers = args.layerId ? [doc.getNode(args.layerId)].filter((l) => l?.type === 'layer') : doc.data.layers;
      if (args.layerId && !layers.length) throw new Error(`There is no layer ${args.layerId}.`);
      const visit = (nodes, layer, depth) => { for (const n of nodes) { if (out.length >= limit) return; out.push(summary(workspace, n, layer, depth)); if (n.children && n.type !== 'compoundPath') visit(n.children, layer, depth + 1); } };
      for (const layer of layers) visit(layer.children, layer, 0);
      return { objects: out, truncated: out.length >= limit };
    }
    case 'add_artboard': {
      editable();
      const width = finite(args.width, 'width'), height = finite(args.height, 'height');
      const id = workspace.withScope(() => workspace.artboards.add({ ...(args.name ? { name: String(args.name) } : {}), width, height, ...(args.x != null ? { x: finite(args.x, 'x') } : {}), ...(args.y != null ? { y: finite(args.y, 'y') } : {}) }));
      workspace.fit(id);
      return { id, artboard: doc.getArtboard(id) };
    }
    case 'add_shape': {
      editable();
      const b = board(args.artboardId), x = b.x + finite(args.x, 'x'), y = b.y + finite(args.y, 'y'), shape = args.shape;
      const options = { fill: args.fill === undefined ? (shape === 'line' ? null : '#FFFFFF') : colour(args.fill, 'fill'),
        stroke: args.stroke === undefined ? '#071411' : colour(args.stroke, 'stroke'), strokeWidth: args.strokeWidth ?? .5,
        ...(args.points ? { points: args.points } : {}), ...(args.cornerRadius != null ? { cornerRadius: args.cornerRadius } : {}) };
      let end;
      if (shape === 'rectangle' || shape === 'rounded-rectangle' || shape === 'ellipse') end = [x + finite(args.width, 'width'), y + finite(args.height, 'height')];
      else if (shape === 'polygon' || shape === 'star') end = [x + finite(args.radius, 'radius'), y];
      else if (shape === 'line') end = [b.x + finite(args.x2, 'x2'), b.y + finite(args.y2, 'y2')];
      else throw new Error('shape must be rectangle, rounded-rectangle, ellipse, polygon, star or line.');
      const created = shapeFromDrag(shape, [x, y], end, options);
      if (args.name) created.name = String(args.name);
      state.history.transaction(`Add ${shape}`, () => state.history.execute(insertNode(workspace.layerId(), created)));
      workspace.select([created.id]);
      return { id: created.id };
    }
    case 'add_svg': {
      editable();
      if (typeof args.svg !== 'string' || !/<svg[\s>]/i.test(args.svg)) throw new Error('svg must be SVG markup with an <svg> element.');
      const b = board(args.artboardId);
      const result = await workspace.import({ kind: 'vector', svgText: args.svg }, 'MCP', { offset: [b.x + (args.x ?? 0), b.y + (args.y ?? 0)] });
      return { ids: result.ids, ...(result.warning ? { warning: result.warning } : {}) };
    }
    case 'update_object': {
      editable();
      const n = node(args.id), properties = {};
      for (const key of ['name', 'visible', 'locked']) if (args[key] !== undefined) properties[key] = key === 'name' ? String(args[key]) : !!args[key];
      if (args.opacity !== undefined) properties.opacity = Math.max(0, Math.min(1, finite(args.opacity, 'opacity')));
      if (args.fill !== undefined || args.stroke !== undefined || args.strokeWidth !== undefined) {
        const app = structuredClone(n.appearance);
        if (args.fill !== undefined) { const fill = colour(args.fill, 'fill'); app.fills = fill ? appearance(fill, null).fills : []; }
        if (args.stroke !== undefined) { const stroke = colour(args.stroke, 'stroke'); app.strokes = stroke ? appearance(null, stroke, args.strokeWidth ?? app.strokes[0]?.width ?? .5).strokes : []; }
        else if (args.strokeWidth !== undefined) app.strokes = app.strokes.map((s) => ({ ...s, width: Math.max(0, finite(args.strokeWidth, 'strokeWidth')) }));
        properties.appearance = app;
      }
      const dx = args.dx ?? 0, dy = args.dy ?? 0;
      state.history.transaction('Edit', () => {
        if (Object.keys(properties).length) state.history.execute(updateNode(n.id, properties));
        if (dx || dy) workspace.transforms.apply([1, 0, 0, 1, finite(dx, 'dx'), finite(dy, 'dy')], 'Move', { ids: [n.id] });
      });
      return summary(workspace, doc.getNode(n.id), doc.ancestors(n.id).find((a) => a.type === 'layer'), 0);
    }
    case 'delete_objects': {
      editable();
      const ids = [...new Set(args.ids ?? [])]; ids.forEach(node);
      const chosen = new Set(ids), top = ids.filter((id) => !doc.ancestors(id).some((a) => chosen.has(a.id)));
      state.history.transaction('Delete', () => top.forEach((id) => state.history.execute(removeNode(id))));
      workspace.select([]);
      return { deleted: top.length };
    }
    case 'select_objects': {
      const ids = args.ids ?? []; ids.forEach(node);
      workspace.select(ids);
      return { selected: [...state.selection.ids] };
    }
    case 'list_commands': return { commands: workspace.commandNames() };
    case 'run_command': {
      const command = String(args.command ?? '');
      if (!workspace.canHandle(command)) throw new Error(`Unknown command ${command}. list_commands gives the names.`);
      if (args.ids) { args.ids.forEach(node); workspace.select(args.ids); }
      const before = doc.data;
      await workspace.handle(command);
      return { command, changed: doc.data !== before, selected: [...state.selection.ids] };
    }
    case 'export_artboard': {
      const b = board(args.artboardId), format = args.format ?? 'png';
      if (format === 'svg') return workspace.exportBoard(b.id, 'svg');
      if (format !== 'png') throw new Error('format must be svg or png.');
      const ppi = Math.max(9, Math.min(600, args.ppi ?? 96)), url = workspace.exportBoard(b.id, 'png', { ppi, background: 'white' });
      return { image: { data: url.slice(url.indexOf(',') + 1), mimeType: 'image/png' }, text: `${b.name}: ${round(b.width)} x ${round(b.height)} mm at ${ppi} ppi` };
    }
    case 'send_to_cut': {
      const b = board(args.artboardId);
      await workspace.sendToCut(b.id);
      return { sent: b.id };
    }
    default: throw new Error(`Unknown tool ${name}.`);
  }
}

function documentInfo(workspace) {
  const { state } = workspace, doc = state.document, data = doc.data;
  return {
    name: data.name, units: data.units, readOnly: !!doc.readOnly, activeArtboardId: activeArtboard(state)?.id ?? null, activeLayerId: state.ui.layerId ?? null,
    artboards: data.artboards.map((b) => ({ id: b.id, name: b.name, x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height) })),
    layers: data.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, locked: l.locked, objects: l.children.length })),
    objects: doc.descendants(null).filter((n) => n.type !== 'layer').length,
    selection: [...state.selection.ids],
  };
}
function summary(workspace, n, layer, depth) {
  let bounds = null;
  try { const r = workspace.withScope(() => workspace.renderer.bounds(n.id)); if (r) bounds = { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) }; } catch { bounds = null; }
  const fill = n.appearance?.fills?.[0], stroke = n.appearance?.strokes?.[0];
  return { id: n.id, type: n.type === 'shape' ? `shape:${n.shape}` : n.type, name: n.name || undefined, layerId: layer?.id, depth, bounds,
    fill: fill ? paintHex(fill, 'gradient') : null, stroke: stroke ? { color: paintHex(stroke, 'gradient'), width: stroke.width } : null,
    ...(n.opacity !== 1 ? { opacity: n.opacity } : {}), ...(n.visible ? {} : { visible: false }), ...(n.locked ? { locked: true } : {}),
    ...(n.type === 'text' ? { text: (n.content?.runs ?? []).map((r) => r.text).join('').slice(0, 200) } : {}) };
}
