/**
 * Pathfinder operation icons, drawn for modCut in the Tabler style (24 x 24, 2 px strokes, round joins).
 * Two overlapping squares: back (4,4 to 15,15) and front (9,9 to 20,20). Filled areas show what each
 * operation keeps; dashed outlines show what it removes. Static markup only, no external references.
 */
const BACK = 'M4 4h11v11H4z', FRONT = 'M9 9h11v11H9z', OVERLAP = 'M9 9h6v6H9z';
const UNION = 'M4 4h11v5h5v11H9v-5H4z', BACK_ONLY = 'M4 4h11v5H9v6H4z', FRONT_ONLY = 'M15 9h5v11H9v-5h6z';
const fill = d => `<path d="${d}" fill="currentColor" fill-opacity=".85" stroke="none"/>`;
const soft = d => `<path d="${d}" fill="currentColor" fill-opacity=".35" stroke="none"/>`;
const line = d => `<path d="${d}"/>`;
const dash = d => `<path d="${d}" stroke-dasharray="2 2" stroke-opacity=".6"/>`;
const ICONS = {
  unite: fill(UNION) + line(UNION),
  minusFront: fill(BACK_ONLY) + line(BACK_ONLY) + dash(FRONT_ONLY),
  intersect: fill(OVERLAP) + line(OVERLAP) + dash(BACK_ONLY) + dash(FRONT_ONLY),
  exclude: fill(BACK_ONLY) + fill(FRONT_ONLY) + line(UNION) + line(OVERLAP),
  divide: soft(BACK_ONLY) + fill(OVERLAP) + soft(FRONT_ONLY) + line(BACK) + line(FRONT),
  trim: soft(BACK_ONLY) + fill(FRONT) + line(BACK_ONLY) + line(FRONT),
  merge: fill(UNION) + line(UNION),
  crop: fill(OVERLAP) + line(OVERLAP) + dash(FRONT),
  outline: line(BACK) + line(FRONT),
  minusBack: fill(FRONT_ONLY) + line(FRONT_ONLY) + dash(BACK_ONLY),
};
export function pathfinderIcon(op) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.5'); svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = ICONS[op]; // constant markup defined above
  return svg;
}
export const PATHFINDER_ICON_IDS = Object.freeze(Object.keys(ICONS));
