# Custom Draw cursors

The editable source drawings are `ICONS/illustrator/redraw/Cur_*.svg`.
Run `npm run build:cursors` after changing them. The builder packages all 32
drawings into `cursor-artwork.mjs`, which ships with the renderer and needs no
runtime access to the source directory. `npm run test:draw` checks freshness.
The editable directory is gitignored. When it is absent in a fresh checkout,
tests use the committed artwork module and skip the local source freshness check.
Toolbar artwork (`S_*.svg`) is separate and is not changed by this build.

The original 64 × 64 viewBox, paths, colors and opacity are preserved. An explicit
32 × 32 display size is added so Chromium can use the SVGs as cursor images.
CSS cursors are synchronous data URLs with platform fallbacks. Selection badges
are drawn over the new arrow artwork; tools without a supplied replacement keep
their existing generated artwork.

Hotspots in `cursors.mjs` use displayed pixels. They are measured against the
redrawn geometry rather than blindly copied from the source filenames: pen
variants share (3, 1), crosshair and scale centers use (10, 10), arrows use (1, 1).
Update these coordinates if a future drawing moves its active tip.

With Pen active, Option/Alt over an anchor uses `anchor-convert` (EditAnchor).
Dragging creates symmetric handles without moving the anchor or ending the path.
Option/Alt over a segment uses `bend-curve` (Arc); dragging bends the picked
point while keeping both anchors fixed. Pressing/releasing Option updates the
cursor even with a stationary pointer. Each completed drag is one undo step.

The supplied PenWeld and DirectMoveCopy artwork is packaged and exposed as
`pen-join` and `direct-copy`. Current Pen does not join distinct paths, and
Direct Selection does not duplicate anchors on Alt-drag, so these states are
reserved until those operations exist. Alt-drag of whole objects uses
`select-copy`; Alt-drag of direction handles retains its existing editing behavior.

Verification: `npm run test:draw` and `node electron/e2e/run.mjs --draw-feedback`.
The Electron workflow decodes every cursor, validates its dimensions under the
app's content security policy, exercises tool and drag states, and saves a
light/dark cursor gallery in the system temporary directory.
`node electron/e2e/run.mjs --draw-pen-alt` checks Option editing, including
transformed layers, continued drawing, undo/redo and cancelled drags.
