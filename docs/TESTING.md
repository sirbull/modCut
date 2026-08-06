# M1 test guide

This guide starts with a hardware-free acceptance test. Do not connect a laser
until all dry-run checks pass.

## 1. Automated checks

Install Node.js 18+ and a JDK 17+, then run:

```sh
npm install
npm test
```

Expected result: all Java unit tests, the Node/Java bridge test, SVG conversion
tests and contrast checks pass.

## 2. Dry-run acceptance test

Run `npm start` and keep **Dry run** checked.

1. Select Dummy or create a GRBL machine profile.
2. Click **Connect**. The status must read `Ready · dry run`.
3. Import a small SVG or draw a rectangle wholly inside the bed.
4. Confirm Cut power/speed and leave at least one layer enabled.
5. Click **Simulate** and inspect the complete toolpath.
6. Click **Frame**. The job should finish without a connection to hardware.
7. Click **Run dry-run**. Progress should reach 100% and report completion.

Boundary test: move part of the design outside the bed and run again. The Java
sidecar must reject the job with an out-of-bounds error.

### Raster photo acceptance test

1. Import a small color PNG or JPG. Its layer operation must default to
   **Engrave**; Cut and Score must not be available for that raster layer.
2. Confirm that the preview contains multiple gray tones rather than only black
   and white.
3. Move Brightness, Contrast, Black point, White point and Midtones. The preview
   must update without permanently changing the source image; Midtones must
   change values between black and white while preserving the end points, and
   Reset bitmap must restore it.
4. Leave Raster mode at **Grayscale** and choose 4 Gray levels. The preview must
   visibly posterize neighboring tones into no more than four gray bands. Run in
   dry-run: the job must contain matching laser-power steps, none above the
   layer's configured Power percentage.
5. Repeat with Jarvis or Floyd-Steinberg. Gray levels must become inactive and
   Dither threshold active. Moving Threshold must update the black/white preview
   and generated dot pattern, while the raster remains an Engrave operation.

### Layer color and Ignore acceptance test

1. Import an SVG containing at least one stroked object and one filled object.
   Switch to element selection, select an object and change its color under
   Properties. Click outside and select it again: the chosen color must remain.
2. Select several elements, right-click and choose an existing color under
   **Move selection to layer**. Their existing strokes and fills must use that
   color, and the source/target rows under Cuts / Layers must update.
3. Set one layer to **Ignore**, connect in dry-run and run the job. Geometry on
   that layer must remain visible in the design but must not appear in the
   simulated or generated laser job.
4. Move a raster to a blue Engrave layer. When unselected, the preview should
   use blue tones; when selected, it should return to neutral grayscale. The
   generated engraving must still use the original adjusted grayscale values.
5. Confirm that Cut and Score targets are unavailable for a selected raster,
   while Engrave and Ignore remain available.

### Group isolation acceptance test

1. Import a PNG and draw two vector shapes. Element selection must be the
   default, and clicking one vector shape must not select or move the PNG or the
   other vector shape. New vectors should avoid the raster's default color
   layer unless the user assigns that color explicitly.
2. Select both vector shapes. Group must be available in Edit, with
   **Cmd/Ctrl+G**, and in the context menu. Group must be disabled in the context
   menu when fewer than two elements are selected.
3. Double-click the resulting group. A `Main view › Group` breadcrumb must
   appear at the top-left of the bed. Group contents remain selectable, while
   all outside elements are rendered at 50% opacity and cannot be selected.
4. Double-click outside the group contents. The breadcrumb must disappear and
   outside elements must become fully visible and selectable again.
5. Select the group. Ungroup must be available via Edit,
   **Cmd/Ctrl+Shift+G**, and the context menu, restoring its child elements at
   the same stacking position.

### New, Import and Add acceptance test

1. Create or import a design and make a change. Click **New**. A second, blank
   project tab must open without a save prompt, and the first tab must retain
   its design and unsaved indicator.
2. In a dirty tab, click **Import**. Cancel must preserve the workspace, while Don't save
   must open the selected file and replace the old workspace.
3. Import one design, then click **Add** and select two supported artwork files.
   Both must be added as independent elements without removing the original
   design and without showing the destructive-action save prompt.
4. Confirm the File menu shortcuts: **Cmd/Ctrl+O** opens Import and
   **Cmd/Ctrl+Shift+O** opens Add.

### Project tabs acceptance test

1. Open three tabs with **New** or the plus button. Give each tab different
   geometry, layer operations, raster controls and material selections.
2. Switch tabs by clicking and with **Cmd/Ctrl+Tab**. Each project must restore
   only its own design and settings; changes in one tab must not affect another.
3. Undo and redo in each tab. The history must belong to that tab and remain
   available after switching away and back.
4. Close a dirty tab with its close button or **Cmd/Ctrl+W**. The prompt must
   show **Don't Save**, **Cancel**, **Save** in that order, with Save using the
   primary CTA color and keyboard focus. Cancel must keep the tab unchanged.
5. Close the final tab. The window should close while modCut remains available
   on macOS; **Cmd+N** must reopen a new window with one blank tab.

### Pen tool acceptance test

1. Select **Pen** and place the first anchor. Moving the pointer without clicking
   must show a live preview from the last anchor to the pointer.
2. Click-drag an anchor to make a curve. Anchor points, direction lines and
   Bézier handles must remain visible while the path is active.
3. Finish the open path with Enter, Escape or double-click. Move Pen over either
   endpoint. The endpoint must be highlighted and a small continuation slash
   must appear beside the pointer.
4. Click the indicated endpoint, move the pointer and place another anchor. The
   existing path must be extended instead of creating a second path. This must
   work from either end of the path.
5. Hover the first anchor while drawing. The pointer must show the close-circle;
   clicking must close the path. Undo must restore the state before the completed
   drawing or continuation.
6. With Pen, click an internal anchor on a completed path. With Edit points
   (<code>A</code>), click any anchor. Only that anchor must be selected. Delete
   and Backspace must remove the selected anchor rather than the whole path;
   Shift-click must allow an open endpoint to be selected instead of continued.
7. A selected anchor must be shown slightly larger than an unselected anchor,
   with a white center and green outline. Shift-click two adjacent anchors, then
   drag the path segment between them. Both anchors and the segment between them
   must move together while the remaining anchors stay in place.
   Edit Points must also recognize the segment within a 14-screen-pixel hit area
   and show a translucent green hover highlight. Clicking a segment directly
   selects both adjacent anchors; click-dragging it moves the segment immediately.
8. Switch to Select (<code>V</code>), select an element, then press and drag on
   the selected element. It must begin moving without requiring a second click
   or first clearing the selection.
9. Finish a straight and a curved path, then hover Pen over the middle of each
   path segment. The cursor must show a small plus and the exact insertion point
   must be highlighted. Click once: one anchor must be added without changing
   the visible path shape. Undo must remove the new anchor. Hovering an existing
   open endpoint must still show Continue rather than Add.

### Transform modifier acceptance test

1. Select a raster image or vector element and drag a corner transform handle
   while holding Shift. Its width/height ratio must remain unchanged.
2. Undo, then hold Alt/Option before dragging a corner. The element's center
   must remain fixed while both opposite sides scale.
3. Undo and repeat with Shift+Alt/Option. Both the aspect ratio and center must
   remain fixed.

### Delayed tooltip acceptance test

1. Hover a toolbar button for less than one second. No tooltip should appear.
2. Continue hovering beyond one second. A styled tooltip must show the action
   name and its keyboard shortcut when one exists.
3. Move away, click, press a key or scroll. The tooltip must disappear.

### Connected-machine binding acceptance test

1. Configure two machine profiles. Select machine A in one project tab and
   machine B in another.
2. Connect tab A in dry-run, then switch to tab B. Frame and Start must be
   disabled and status must say that reconnection to B is required.
3. Attempt the same mismatch directly against the sidecar. It must reject the
   job by machine ID, and job-supplied bed/feed values must not override the
   limits captured from the connected profile.

### Vector Engrave acceptance test

1. Draw an open three-anchor Pen path with no fill and assign it to Engrave.
   Dry-run must generate and complete a traced line-engraving job.
2. Repeat with a closed stroke-only path; it must trace its outline.
3. Give a closed path a visible fill. Engrave must use scan/hatch lines across
   the filled region instead of treating it as a stroke-only path.

### macOS window lifecycle acceptance test

1. On macOS, close the last modCut window without quitting the application. The
   menu bar and Dock indicator should remain available.
2. Press **Cmd+N**. A new blank modCut window must open without a JavaScript
   main-process error.
3. Close the window again and click the modCut Dock icon. A new window must open,
   and Connect in dry-run must still work, confirming that the sidecar remained
   available while the app had no windows.

## 3. GRBL preparation

Before enabling a real connection:

- use a machine with a physical emergency stop and working lid/interlocks;
- remove material or disable the laser power supply for the first motion test;
- verify the configured bed width, height and maximum feed;
- verify GRBL 1.1-compatible firmware, the correct serial port and normally
  115200 baud (or the configured TCP bridge address);
- keep a hand on the physical emergency stop.

Create or edit the machine under **Machine → Manage machines** and select the
GRBL driver. Uncheck **Dry run** only when the machine is ready.

For a laser on the local network, follow [`NETWORK.md`](NETWORK.md). A successful
connection now means the TCP endpoint returned a valid GRBL status response;
an open port by itself is not accepted.

## 4. Hardware acceptance stages

Perform these stages in order:

1. **Connection only:** click Connect and confirm that no motion starts.
2. **Frame without laser power:** disconnect the laser power supply, frame a
   10×10 mm square near the bed origin and verify direction/scale.
3. **Stop:** frame a larger rectangle and press Stop during motion. GRBL receives
   feed-hold (`!`) followed by soft reset (`0x18`); the controller will need to be
   re-homed/reconnected afterwards.
4. **Low-power mark:** reconnect laser power and use a known safe material at the
   lowest useful power. Confirm dimensions and origin.
5. **Normal test job:** use a proven material preset, ventilation and supervision.

Never leave a running laser unattended. Software Stop supplements the physical
emergency stop; it does not replace it.

## Current M1 limits

- Real execution is GRBL-only.
- The first physical run must validate controller-specific homing and axis
  orientation; modCut does not automatically issue `$H`.
- Job streaming waits for GRBL `ok` after every line for conservative flow
  control rather than maximum throughput.
- Raster workflows generate line-based G-code. Grayscale mode uses variable
  `M4 S` power; support and useful tone range must be tested on the actual GRBL
  controller, laser and material before production use.
