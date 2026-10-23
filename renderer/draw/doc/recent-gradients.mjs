import { gradientKey, gradientLook, isGradient } from './gradient.mjs';

const KEY = 'modcut_recent_gradients';
export const RECENT_GRADIENT_LIMIT = 10;

/** Shared across documents and restarts, most recent first; drags are recorded once they end. */
export function recentGradients(fallback = [], storage) {
  let saved = [];
  try { const value = JSON.parse((storage ?? globalThis.localStorage)?.getItem(KEY) ?? '[]'); if (Array.isArray(value)) saved = value; } catch { /* Use session history if storage is unavailable. */ }
  const result = [], keys = new Set();
  for (const g of [...saved, ...fallback]) {
    if (!isGradient(g) || !Array.isArray(g.stops) || g.stops.length < 2) continue;
    try { const key = gradientKey(g); if (!keys.has(key)) { keys.add(key); result.push(gradientLook(g)); } } catch { /* Ignore malformed saved entries. */ }
  }
  return result.slice(0, RECENT_GRADIENT_LIMIT);
}

export function rememberRecentGradient(gradient, fallback = [], storage) {
  const list = recentGradients([gradientLook(gradient), ...recentGradients(fallback, storage)]);
  try { (storage ?? globalThis.localStorage)?.setItem(KEY, JSON.stringify(list)); } catch { /* Keep session history without persistence. */ }
  return list;
}
