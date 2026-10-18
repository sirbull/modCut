/** Process resolution for Cut optimized. Pure: no document, Cut or preference writes.
 * The snapshot must belong to the same tab's Cut. Another Send to Cut target can
 * have different settings; these results must not be presented as that target's job.
 * Missing colours remain unresolved, even though a later import creates default layers.
 */
import { matchingProcessLayer, OPERATIONS, canAssignRasterToOperation } from '../../layer-model.mjs';
import { isOutputNode } from '../doc/layers.mjs';
import { cutPaint } from '../io/cut-paint.mjs';

const LEAVES = new Set(['path', 'shape', 'compoundPath', 'text', 'image']);
const MODES = new Set(['color', 'cut', 'score', 'engrave']);
const unresolved = (reason, identity = {}) => ({ status: 'unresolved', reason, operation: null, ...identity });

export function resolveCutPreviewProcess(doc, id, snapshot = null) {
  const node = doc.getNode(id);
  if (!node) return unresolved('missing-node');
  if (!isOutputNode(doc, id)) return { status: 'excluded', reason: 'not-output', operation: null };
  if (!LEAVES.has(node.type)) return { status: 'container', reason: 'resolve-children', operation: null };
  const raster = node.type === 'image';
  // Cut's raster import always starts on its black raster layer, independent of
  // the image's pixels, its frame colour or an identically coloured vector layer.
  const color = raster ? '#000000' : cutPaint(node).color?.toLowerCase();
  if (!color) return { status: 'excluded', reason: 'no-paint', operation: null };
  const identity = { color, raster, key: `${raster ? 'raster' : 'vector'}:${color}` };
  if (!snapshot || !MODES.has(snapshot.mappingMode) || !Array.isArray(snapshot.layers)) return unresolved('missing-process-settings', identity);
  let layer;
  if (snapshot.mappingMode === 'color') layer = matchingProcessLayer(snapshot.layers, identity);
  else {
    // Global operation mode has one layer with no colour. Never borrow settings
    // from a stale colour layer or invent power, speed, DPI or dithering defaults.
    layer = snapshot.layers.find(candidate => candidate.color === null);
    if (layer && layer.op !== snapshot.mappingMode[0].toUpperCase() + snapshot.mappingMode.slice(1)) return unresolved('inconsistent-global-operation', identity);
  }
  if (!layer) return unresolved('missing-process-layer', identity);
  if (!OPERATIONS.includes(layer.op) || (raster && !canAssignRasterToOperation(layer.op))) return unresolved('invalid-operation', identity);
  if (layer.op === 'Ignore' || layer.output === false) return { status: 'excluded', reason: layer.op === 'Ignore' ? 'ignored' : 'output-disabled', operation: layer.op, ...identity };
  if (layer.output !== true) return unresolved('missing-output-setting', identity);
  return { status: 'resolved', operation: layer.op, ...identity, layer: structuredClone(layer) };
}
