// Classic script loaded in <head>: resolve the theme before the first paint.
(() => {
  const key = "modcut_theme";
  const valid = (value) => ["system", "light", "dark"].includes(value);
  const system = matchMedia("(prefers-color-scheme: dark)");
  const read = () => {
    try { const value = localStorage.getItem(key); return valid(value) ? value : "system"; }
    catch { return "system"; }
  };
  let preference = read();
  const apply = () => {
    const theme = preference === "system" ? (system.matches ? "dark" : "light") : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.dispatchEvent(new CustomEvent("modcut-theme-change", { detail: { preference, theme } }));
  };
  const syncNative = () => { window.modcut?.setTheme?.(preference).catch(() => {}); };
  window.modcutTheme = Object.freeze({
    get preference() { return preference; },
    setPreference(value) {
      if (!valid(value)) return;
      preference = value;
      try { localStorage.setItem(key, value); } catch { /* Keep working without persistence. */ }
      apply();
      syncNative();
    },
  });
  system.addEventListener("change", () => { if (preference === "system") apply(); });
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = read();
    apply();
    syncNative();
  });
  apply();
  syncNative();
})();
