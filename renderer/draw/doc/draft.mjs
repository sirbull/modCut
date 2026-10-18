/**
 * Copy-on-write drafts for document edits (D4.6). `createDraft(base)` returns a proxy that reads like the
 * frozen `base` and can be changed like a plain object; only the objects written to, and their parents,
 * are copied. `finish()` returns the new tree, sharing every untouched object with `base`, so an edit to
 * one node costs its path to the root instead of the whole document.
 */
const STATE = Symbol('draft state');
const isObject = (value) => value !== null && typeof value === 'object';
export const isDraft = (value) => isObject(value) && !!value[STATE];

export function createDraft(base) {
  const states = new Map();
  function stateFor(value, parent) {
    let state = states.get(value);
    if (!state) {
      state = { base: value, copy: null, parent, proxy: null };
      state.proxy = new Proxy(Array.isArray(value) ? [] : {}, handler(state));
      states.set(value, state);
    }
    return state;
  }
  const source = (state) => state.copy ?? state.base;
  function own(state) {
    if (state.copy) return state.copy;
    state.copy = Array.isArray(state.base) ? state.base.slice() : { ...state.base };
    if (state.parent) own(state.parent);
    return state.copy;
  }
  const wrap = (value, parent) => isObject(value) && !value[STATE] && Object.isFrozen(value) ? stateFor(value, parent).proxy : value;
  function handler(state) {
    return {
      get(_, prop) {
        if (prop === STATE) return state;
        const src = source(state), value = src[prop];
        if (typeof prop === 'symbol' || !Object.hasOwn(src, prop)) return value;
        return wrap(value, state);
      },
      set(_, prop, value) { own(state)[prop] = value; return true; },
      deleteProperty(_, prop) { delete own(state)[prop]; return true; },
      defineProperty(_, prop, descriptor) { own(state)[prop] = descriptor.value; return true; },
      has(_, prop) { return prop in source(state); },
      ownKeys() { return Reflect.ownKeys(source(state)); },
      getOwnPropertyDescriptor(_, prop) {
        const src = source(state), d = Reflect.getOwnPropertyDescriptor(src, prop);
        if (!d) return undefined;
        // The proxy target is a fresh array, whose length is not configurable.
        if (prop === 'length' && Array.isArray(src)) return { value: src.length, writable: true, enumerable: false, configurable: false };
        return { value: wrap(src[prop], state), writable: true, enumerable: d.enumerable, configurable: true };
      },
      getPrototypeOf() { return Object.getPrototypeOf(state.base); },
    };
  }
  /** The finished tree: drafts replaced by their copies (or bases), new objects walked for drafts inside. */
  function finish(value = root.proxy, seen = new Map()) {
    if (!isObject(value)) return value;
    const state = value[STATE] ?? states.get(value);
    if (state) {
      if (!state.copy) return state.base;
      if (seen.has(state)) return seen.get(state);
      const out = Array.isArray(state.copy) ? [] : {}; seen.set(state, out);
      for (const key of Object.keys(state.copy)) out[key] = finish(state.copy[key], seen);
      return out;
    }
    if (Object.isFrozen(value)) return value;
    for (const key of Object.keys(value)) { const next = finish(value[key], seen); if (next !== value[key]) value[key] = next; }
    return value;
  }
  const root = stateFor(base, null);
  return { draft: root.proxy, finish: () => finish() };
}
