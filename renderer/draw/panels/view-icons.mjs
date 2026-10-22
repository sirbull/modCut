/**
 * Icons for the view toggles in Properties (Ruler & Grids, Guides, Snap Options), drawn for modCut in the
 * Tabler style (24 x 24, round joins) after Illustrator's. Static markup only, no external references.
 */
const RULER = '<path d="M3 3h18v5H8v13H3z"/><path d="M8 3v2.5M12 3v3M16 3v2.5M3 12h2.5M3 16h3"/>';
const GRID = '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/>';
const CHECKER = '<rect x="4" y="4" width="16" height="16" rx="1"/>'
  + '<path d="M4 4h4v4H4zM12 4h4v4h-4zM8 8h4v4H8zM16 8h4v4h-4zM4 12h4v4H4zM12 12h4v4h-4zM8 16h4v4H8zM16 16h4v4h-4z" fill="currentColor" stroke="none"/>';
const GUIDES = '<path d="M8 3v18M16 3v18M3 8h18M3 16h18" stroke-width="1.3"/>';
const LOCK = '<rect x="13" y="15" width="8" height="6" rx="1" fill="var(--surface, #fff)"/><path d="M15 15v-2a2 2 0 0 1 4 0v2"/>';
const SMART = '<path d="M3 8h18M8 3v18" stroke-dasharray="2.5 2"/><path d="M13 12l7.5 3-3.2 1.3-1.3 3.2z" fill="currentColor"/>';
// A magnet opening to the left, pulling towards what it snaps to.
const MAGNET = '<path d="M21 7h-7a5 5 0 0 0 0 10h7M21 10.5h-7a1.5 1.5 0 0 0 0 3h7M18 7v3.5M18 13.5V17"/>';
const ICONS = {
  rulers: RULER,
  grid: GRID,
  'transparency-grid': CHECKER,
  guides: GUIDES,
  'guides-lock': GUIDES + LOCK,
  'smart-guides': SMART,
  'snap-point': MAGNET + '<path d="M4 4v16" stroke-width="1.2"/><circle cx="4" cy="12" r="2" fill="currentColor"/>',
  'snap-grid': MAGNET + '<path d="M3 4v16M7 4v16M2 8h6M2 12h6M2 16h6" stroke-width="1.2"/>',
};
export function viewIcon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('stroke-linecap', 'round');
  svg.innerHTML = ICONS[id]; // constant markup defined above
  return svg;
}
export const VIEW_ICON_IDS = Object.freeze(Object.keys(ICONS));
