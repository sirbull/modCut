/** Isolated rendering shell. Document editing arrives in subsequent Draw tasks. */
export function createDrawWorkspace(root, { paper = window.paper } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "draw-canvas";
  canvas.setAttribute("aria-label", "Draw canvas");
  const hint = document.createElement("div");
  hint.className = "draw-workspace__hint";
  const heading = document.createElement("h1");
  heading.textContent = "Draw";
  const description = document.createElement("p");
  description.textContent = "Vector workspace";
  hint.append(heading, description);
  root.append(canvas, hint);
  const scope = new paper.PaperScope();
  try { scope.setup(canvas); }
  finally { paper.activate(); }
  scope.view.autoUpdate = false;
  function resize() {
    const { width, height } = root.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    try {
      scope.activate();
      scope.view.viewSize = new scope.Size(width, height);
      scope.view.update();
    } finally { paper.activate(); }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  return {
    scope,
    resize,
    destroy() {
      observer.disconnect();
      try { scope.remove(); }
      finally { paper.activate(); }
      root.replaceChildren();
    },
  };
}
