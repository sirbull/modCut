import { normalizeHex } from './color.mjs';
import { RECENT_LIMIT, rememberColor } from './swatches.mjs';

const KEY = 'modcut_recent_colors';

/** Shared across documents and restarts; previews and cancelled choices are never recorded. */
export function recentColors(fallback = [], storage) {
  let saved = [];
  try { const value = JSON.parse((storage ?? globalThis.localStorage)?.getItem(KEY) ?? '[]'); if (Array.isArray(value)) saved = value; } catch { /* Use session history if storage is unavailable. */ }
  const colors = [];
  for (const value of [...saved, ...fallback]) {
    try { const hex = normalizeHex(value); if (!colors.includes(hex)) colors.push(hex); } catch { /* Ignore malformed saved entries. */ }
  }
  return colors.slice(0, RECENT_LIMIT);
}

export function rememberRecentColor(hex, fallback = [], storage) {
  const colors = rememberColor(recentColors(fallback, storage), hex);
  try { (storage ?? globalThis.localStorage)?.setItem(KEY, JSON.stringify(colors)); } catch { /* Keep session history without persistence. */ }
  return colors;
}
