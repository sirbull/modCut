/** Paint identity shared by Send to Cut and the planned Cut optimized view.
 * Cut imports one vector layer per stroke colour, falling back to the fill.
 * Scribble sends its fill as a stroke. Gradients use the first stop by offset.
 */
import { paintHex } from '../doc/paint.mjs';
import { gradientHex } from '../doc/gradient.mjs';
import { scribbleOf } from '../doc/effects.mjs';

export function cutPaint(node) {
  const first = entries => (entries ?? []).find(entry => !entry.hidden);
  const fill = first(node.appearance?.fills), stroke = first(node.appearance?.strokes);
  const fillColor = paintHex(fill) ?? gradientHex(fill?.paint);
  const strokeColor = paintHex(stroke) ?? gradientHex(stroke?.paint);
  return { fill: fillColor, stroke: strokeColor, color: scribbleOf(node) && fillColor ? fillColor : strokeColor ?? fillColor };
}
