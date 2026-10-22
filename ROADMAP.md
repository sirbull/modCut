# modCut roadmap

Last updated: 2026-10-15

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

- [x] D5.1 Laser Preview first version: shared process lookup, red Cut/dashed Score,
  engraving, controls, explicit process setup, remembered introduction and Electron checks.
  Advanced unresolved appearances and Engrave as seen remain separate follow-ups.
  See `docs/draw/cut-optimized.md` and DRAW_WORKSPACE 4.4.1.
- [x] Laser Preview unresolved object details: per-object guidance, read-only dialog,
  English/Bokmål, model-neutral Electron checks and app restart.
- [x] Laser Preview for dashed single strokes and arrowheads during vector engraving:
  match the solid strokes actually sent to Cut, with 67,306 output comparison samples.
- [x] Laser Preview for width profiles and multiple fills/strokes on plain paths/shapes:
  first visible paint and constant width match standard Cut transfer (66,912 samples).
  Clipped stacks and remembered Outline Stroke transfers remain unresolved.
- [x] Verify clipping against actual Cut imports; keep stroke-width/whole-image and
  Cut/Score boundary limitations explicit in Laser Preview.
- [x] Complete Laser Preview first-version regression (2026-10-19): full `npm test`
  passes, including Java/bridge/main/renderer/Draw/contrast and all Cut/Draw E2E.
  Advanced appearance/output simulation remains separate follow-up work.
- [x] Extend Laser Preview to leaf Round Corners, Zig Zag, Offset Path and Transform:
  real Cut/Score display and 66,587 actual Cut raster samples match; 349 Draw tests
  and targeted recovery pass (full npm test not repeated after this extension).
- [x] Verify leaf Pucker & Bloat, Roughen, Twist, Free Distort and Warp in Laser Preview:
  66,798 actual Cut raster comparison samples match; targeted recovery passes.
- [x] Verify leaf Scribble in Laser Preview: fill-based process, own line width, holes,
  paint stacks, affine parents and world-mm widths; 64,315 actual Cut raster samples match.
  Fix row connectors crossing holes and match Cut’s imported sharp-corner limit.
  Full npm test passes after these extensions, including all Cut/Draw E2E and recovery.
- [x] Resolve the final full-Draw E2E connection close: cancel the old process shutdown
  timeout and target the captured process; verified with `--draw-recovery`.


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

- [x] D0.6: `.modcut` v4 Draw persistence, legacy Cut loading, compatibility
  warnings with original-data preservation, per-tab recovery and combined dirty
  guards. Atomic project writes and queued recovery writes. 58 Draw tests,
  11 main tests, Draw crash/relaunch E2E and the full `npm test` pass.

- [x] D1.1: Retained Paper render adapter with per-node/board diff, viewport
  culling, stable world bounds and reversible Outline view (Ctrl/Cmd+Y).
  Raster transforms retain full source resolution and handle late loads safely.
  67 Draw tests and the complete Draw Electron suite pass on Windows. Full
  `npm test` reaches the previously documented engraving crop E2E failure.

- [x] Draw toolbar cleanup: one entry per tool group, flyouts without repeated
  variants, fill/stroke swatches and one active panel. Layers has one tree and
  heading; Properties no longer repeats Transform, Color and Stroke editors.
- [x] D1.2: Artboards, machine/paper/screen presets, New Document dialog,
  active-board navigation, move/copy artwork, resize, rename, order and rearrange.
  The actual export acceptance check belongs to the later export implementation.
- [x] D1.3: Selection handles, modifier scaling, rotation, smart guides,
  marquee/additive selection, nudging and temporary Hand/Zoom.
- [x] D1.6: Rectangle, rounded rectangle, ellipse/pie, polygon, star and line,
  live parameters, modifier drawing and exact-size dialogs. 79 Draw tests and
  the complete Draw Electron workflow pass; both themes were visually checked.
- [x] D1.5: Bézier Pen, open/closed paths, endpoint continuation, modifier
  drawing, curve-preserving insertion and Add/Delete/Convert Anchor tools.
- [x] D1.4: Direct Selection edits anchors/handles, with marquee, Shift selection,
  nudging, live corner widgets and exact corner radii. Shapes expand only on an
  actual anchor edit; conversion and editing undo together. Rounded source
  corners remain editable and persist with ordinary resolved Bézier geometry.
- [x] D1.7: Rotate, Reflect and Scale with reference points, constrained dragging,
  exact dialogs, transient previews, Copy and Transform Again (Ctrl/Cmd+D).
  Explicit Scale supports fixed or scaled world-mm strokes and dash lengths.
- [x] D1.8: Basic panels: Layers with template layers and Layer Options,
  Transform, Align, Color (RGB/HSB/CMYK/Gray/Hex, live sliders), Stroke with
  dashes and arrowheads, Fill/Stroke box and Properties. Also Illustrator-style
  cursors and live Pen handle feedback.

- [ ] Build the Draw workspace described in
  [`docs/DRAW_WORKSPACE.md`](docs/DRAW_WORKSPACE.md). Task status is tracked in
  chapter 23 of that document.

- [x] Phase 0 — Foundation: workspace, document model/history, geometry kernel,
  keymap and `.modcut` v4 persistence. D0.1–D0.6 complete.
- [x] Phase 1 — Basic drawing MVP: artboards, Pen, shapes, layers, bitmap
  references and Send to Cut v1. D1.1 to D1.12 are complete, including the
  control bar, Place with Template and Send to Cut v1. Status: docs/draw/STATUS.md.
- [ ] Phase 2 — Core vector editing: text, Pathfinder, gradients, import/export
  and Send to Cut v2.
  SVG/PNG/JPEG export and D2.1a/b point text are implemented. Type (T) provides live
  preview, installed vector fonts, kerning/ligatures and multiline text. Create
  Outlines converts glyphs into editable Cut-ready paths in one undo step.
  D2.1c adds rectangular area text: Type drag, live wrapping through frame dimensions,
  preserved overset text and an overflow marker. Path text, further area-text features
  and Character/Paragraph panels remain in D2.1.
  Google Fonts adds the full searchable catalog, local font/license downloads,
  version-pinned references, numeric weights and variable axes. Send to Cut now
  sends editable text as outlines automatically; the Draw text stays editable.
  With an empty Cut and one artboard, Send to Cut goes straight through without a dialog.
  Copy and paste work between Cut and Draw in both directions; Paste takes the newest copy.
  Unsupported non-vector glyphs and overset text block incomplete text output.
  Gradients are being extended to match Illustrator in four parts: the Gradient panel with
  Recent, Presets and a draggable stop slider and the stroke modes (within, along, across)
  are done; on-canvas editing and Freeform gradients (points and lines) follow.
  Recolor (a colour wheel that turns every colour of the selection together, with harmony
  rules and colour libraries) is in progress: the core is done, the panel follows.
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
