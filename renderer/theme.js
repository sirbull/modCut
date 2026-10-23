// Classic script loaded in <head>: resolve the theme before the first paint.
(() => {
  const key = "modcut_theme";
  const backgroundKey = "modcut_background";
  const backgrounds = ["green", "white", "light-gray", "gray", "dark-gray"];
  const valid = (value) => ["system", "light", "dark"].includes(value);
  const system = matchMedia("(prefers-color-scheme: dark)");
  const read = () => {
    try { const value = localStorage.getItem(key); return valid(value) ? value : "system"; }
    catch { return "system"; }
  };
  let preference = read();
  const readBackground = () => {
    try { const value = localStorage.getItem(backgroundKey); return backgrounds.includes(value) ? value : "green"; }
    catch { return "green"; }
  };
  let background = readBackground();
  const resolvedTheme = () => background === "green"
    ? (preference === "system" ? (system.matches ? "dark" : "light") : preference)
    : (["gray", "dark-gray"].includes(background) ? "dark" : "light");
  const apply = () => {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.background = background;
    document.documentElement.style.colorScheme = theme;
    window.dispatchEvent(new CustomEvent("modcut-theme-change", { detail: { preference, theme, background } }));
  };
  const syncNative = () => { window.modcut?.setTheme?.(background === "green" ? preference : resolvedTheme()).catch(() => {}); };
  window.modcutTheme = Object.freeze({
    get preference() { return preference; },
    get background() { return background; },
    get backgrounds() { return [...backgrounds]; },
    setBackground(value) {
      if (!backgrounds.includes(value)) return;
      background = value;
      try { localStorage.setItem(backgroundKey, value); } catch { /* Keep working without persistence. */ }
      apply();
      syncNative();
    },
    setPreference(value) {
      if (!valid(value)) return;
      preference = value;
      try { localStorage.setItem(key, value); } catch { /* Keep working without persistence. */ }
      apply();
      syncNative();
    },
  });
  system.addEventListener("change", () => { if (background === "green" && preference === "system") apply(); });
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== backgroundKey && event.key !== null) return;
    preference = read();
    background = readBackground();
    apply();
    syncNative();
  });
  apply();
  syncNative();
})();
