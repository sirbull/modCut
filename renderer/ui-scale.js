// Apply the saved interface size before first paint, in every app window.
(() => {
  const key = "modcut_ui_scale";
  const levels = Object.freeze([0.8, 0.9, 1, 1.1, 1.2]);
  const read = () => {
    try {
      const value = Number(localStorage.getItem(key));
      return levels.includes(value) ? value : 1;
    } catch { return 1; }
  };
  let preference = read();
  const apply = () => window.modcut?.setUiScale?.(preference);
  window.modcutUiScale = Object.freeze({
    levels,
    get preference() { return preference; },
    setPreference(value) {
      const scale = Number(value);
      if (!levels.includes(scale)) return;
      preference = scale;
      try { localStorage.setItem(key, String(scale)); } catch { /* Keep working without persistence. */ }
      apply();
    },
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = read();
    apply();
  });
  apply();
})();
