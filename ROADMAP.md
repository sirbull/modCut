# modCut roadmap

Last updated: 2026-10-14

This is the living engineering checklist for the work required before modCut is
ready for routine workshop use. Update the checkbox and the short result note in
the same commit that completes an item.

## P0 — safety and output correctness

- [x] Bind every live connection to an immutable machine ID/connection token.
  Block Frame and Start when the active project's machine differs from the
  connected machine, and enforce the same check in the Java sidecar. Completed
  with connected-profile limit snapshots and cross-tab UI blocking.
- [x] Correct vector Engrave behavior. Open paths are traced because they
  enclose no area; all closed shapes use ordered raster/hatch engraving.
  Score is the explicit operation for tracing a closed outline.
- [x] Protect every dirty tab when the native window is closed or the app quits.
  Completed with a renderer/main-process close handshake, per-tab save prompts,
  atomic disk autosave and automatic recovery after a renderer/app crash.
- [ ] Complete the physical GRBL acceptance sequence: connection-only, frame
  with laser power disconnected, Stop/reset recovery, low-power mark and normal
  supervised test job.

## P1 — regression protection and fidelity

- [x] Commit Electron end-to-end tests for tabs, Pen/node editing, modifier-key
  scaling, save prompts, raster controls, import/add, native Close/Quit and crash
  recovery. The suite runs through `npm test` and in CI.
- [x] Remove silent output-quality reductions. Actual jobs honor requested raster
  DPI and use a fixed 0.2 mm vector sampling tolerance. Layers show effective
  output detail, while oversized jobs are blocked with an actionable warning.
- [x] Make supported file formats truthful. The picker and documentation now
  advertise only modCut, SVG, DXF, PNG, JPG/JPEG, BMP and GIF; AI, PDF, PLT,
  HPGL and existing G-code remain hidden until implemented.
- [ ] Replace the native real-job confirmation with a modCut safety dialog that
  shows the connected machine, material, bounds, operations and checklist.

## P2 — release readiness and maintainability

- [ ] Sign and notarize macOS builds and sign Windows installers.
- [ ] Test installers on clean Apple Silicon, Intel macOS, Windows and Linux hosts.
- [ ] Make UI language consistent and prepare English/Norwegian localization.
- [ ] Split the large renderer and bed modules into document, editing, toolpath,
  machine and UI components with focused tests.

## P3: Draw workspace (vector editor)

- [x] D0.1: Draw/Cut switch with an isolated canvas and PaperScope per tab,
  workspace-specific native menu and Electron regression coverage.
- [x] D0.2: Pure JS document model, validated commands, atomic undo/redo,
  nested transactions, selection and safe loading. 16 tests, 100% model line
  coverage and a seeded 1,000-command undo/redo round trip.
- [x] D0.3: Pinned VectorCraft WASM spike and six-criterion report. JS fallback
  selected: WASM is 15.58 MB raw / 5.35 MB gzip, exceeding the 6 MB / 2 MB budgets.
  See [`docs/draw/spike-vectorcraft.md`](docs/draw/spike-vectorcraft.md) for measurements
  and the PDF/CI checks that remain unverified.
- [x] D0.4: Worker-based GeometryKernel with JS flatten/union, cancellation,
  timeout/restart and busy hooks. Clipper 6 JS is pinned with notices and package
  inclusion. 42 Draw tests and the full `npm test` suite pass in this run.
- [x] D0.5: Central keymap with 148 entries and no context conflicts, 49 tool
  definitions and Tabler outline SVG icons with a deterministic sprite. 52 Draw tests
  and Draw E2E pass; the full suite still encounters the known crop assertion.
  Progress log: [`docs/draw/WORK_LOG.md`](docs/draw/WORK_LOG.md).

- [ ] Build the Draw workspace described in
  [`docs/DRAW_WORKSPACE.md`](docs/DRAW_WORKSPACE.md). Task status is tracked in
  chapter 23 of that document.

- [ ] Phase 0 — Foundation: workspace, document model/history, geometry kernel,
  keymap and `.modcut` v4 persistence. In progress; D0.1–D0.5 complete, D0.6 is next.
- [ ] Phase 1 — Basic drawing MVP: artboards, Pen, shapes, layers, bitmap
  references and Send to Cut v1.
- [ ] Phase 2 — Core vector editing: text, Pathfinder, gradients, import/export
  and Send to Cut v2.
- [ ] Phase 3 — Advanced editing: stroke expansion, effects, Image Trace,
  additional editing tools and AI/DXF export.
- [ ] Phase 4 — Full feature set: Width, Blend, brushes, additional export
  formats and performance work.
- [ ] Phase 5 — Polish and extras: localization, additional typography,
  print features and an optional MCP server. Deferred until phases 0–4 are complete.

## Recently completed

- [x] Dedicated non-destructive engraving image editor with direct-manipulation
  crop, tone/detail controls, reusable presets, five engraving style families,
  physical-DPI warnings and shared preview/laser processing.
- [x] Portable `.modcut` documents with embedded vector/raster design, layers,
  operations and document settings, separate from local machine connections and libraries.
- [x] SVG/SVGZ, common 2D DXF and HP-GL/PLT vector import, plus PNG, JPEG, BMP, GIF,
  WebP, AVIF and TIFF raster import.
- [x] Hybrid page-one import for PDF and PDF-compatible Illustrator files,
  preserving solid vector paths while rasterizing text, images and complex effects.
- [x] Named Cut, Engrave and Score process profiles with per-operation power,
  speed, frequency, layer focus offset and engraving raster controls.
- [x] Guarded focus control combining a global machine calibration with each
  layer's offset, explicit Z capability/range/feed configuration, laser-off
  moves and independent Java-side validation.
- [x] Independent project tabs with per-tab design, layers, settings and history.
- [x] Illustrator-style Pen preview, handles, close/continue cursors and endpoint continuation.
- [x] Pen add-anchor cursor and shape-preserving insertion on existing paths.
- [x] Individual anchor selection and Delete/Backspace removal.
- [x] High-visibility selected anchors and direct dragging of a path segment
  between two selected adjacent anchors.
- [x] Forgiving Edit Points path hit area with segment hover feedback and
  whole-shape anchor selection from path or fill clicks.
- [x] Shift aspect-ratio scaling, Alt center scaling and combined Shift+Alt scaling.
- [x] Consistent delayed button tooltips with tool names and keyboard shortcuts.
- [x] Adobe-style Don't Save / Cancel / Save confirmation dialog.
- [x] Grayscale raster controls, gray-level posterization and photo engraving preview.
- [x] Ignore layers, persistent layer colors and group isolation editing.
