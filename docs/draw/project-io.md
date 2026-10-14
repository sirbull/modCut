# Draw project IO (D0.6)

The project envelope is now `.modcut` version 4. It retains the existing Cut
fields and adds `draw` (Draw schema version 1) and `workspace` (`cut` or `draw`).
Both workspaces save together. Opening legacy project versions 1–3 creates an
empty Draw document and leaves the source file untouched until explicitly saved.

`renderer/draw/io/project.mjs` is independent of DOM/Paper.js. Call
`validateProject(project)` before changing the UI, then
`createProjectDraw(project.draw)` to get a document, history and selection.
The tab retains this state even before its canvas is mounted. The shell exposes
it as `getDrawWorkspace(root).state` once mounted, for future tool integration.

- `snapshot()` returns the immutable document snapshot, reusing it until edits.
- `dirty` combines history changes and an unsaved marker restored from recovery.
- `captureSavepoint()` returns a callback to commit after successful file IO.
  It marks the captured state saved; edits made during IO remain dirty. Cancel or
  failure leaves the callback unused. Coalescing cannot cross a captured boundary.
- `subscribe(listener)` observes history/dirty changes and returns an unsubscribe.
- `warning` and `report` describe unsupported or quarantined content.

Invalid Draw data opens read-only and saves its original source, rather than
the sanitized display model. Unknown Draw versions also remain read-only with
their source preserved. Project versions newer than 4 are rejected before Cut
is imported. Older releases already installed elsewhere cannot show a new
compatibility warning and may drop Draw when saving; save v4 projects here or in
a newer release. Do not promise that old apps can preserve unfamiliar fields.

The existing recovery envelope stays version 1 for compatibility. Each tab's
session adds `draw`, `drawDirty`, `cutDirty` and `workspace`. Sessions without
these fields still restore their old Cut state. Undo history and selection are
transient. Restored Draw changes remain dirty until saved, even with empty history.
In-memory snapshots reuse unchanged models; the on-disk recovery file is still
one complete atomic JSON snapshot, not an incremental journal. Draw changes wait
up to two seconds, with a fixed deadline during continuous editing. Cut keeps
its 350 ms debounce within that deadline. Canceling native Close/Quit resumes IO.

All disk IO goes through main. `electron/project-store.mjs` writes a unique
temporary file beside the destination and renames only after a complete write.
Failed writes retain the destination and remove partial temporary files.
`electron/recovery-store.mjs` serializes writes and clear so they cannot collide
on its shared temporary file or revive recovery after a successful close.

Verification: `npm run test:draw`, `npm run test:main` and
`npm run test:e2e:draw`. The latter verifies real IPC file saving, empty/nonempty
roundtrips, v3 Cut preservation, unknown Draw preservation, native dirty guards,
continuous autosave and two models/modes through actual process kill/relaunch.
Both the existing Cut E2E and this dedicated Draw pass are included in
`npm run test:e2e` and therefore `npm test`. Model commands seed test content
because visible Draw tools arrive in phase 1.
