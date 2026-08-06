# modCut roadmap

Last updated: 2026-08-07

This is the living engineering checklist for the work required before modCut is
ready for routine workshop use. Update the checkbox and the short result note in
the same commit that completes an item.

## P0 — safety and output correctness

- [x] Bind every live connection to an immutable machine ID/connection token.
  Block Frame and Start when the active project's machine differs from the
  connected machine, and enforce the same check in the Java sidecar. Completed
  with connected-profile limit snapshots and cross-tab UI blocking.
- [x] Correct vector Engrave behavior. Open paths and stroke-only paths are
  traced as line engraving; closed filled shapes use raster/hatch engraving.
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

## Recently completed

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
