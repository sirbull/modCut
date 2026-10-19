# modCut

Modern, cross-platform laser control for **Horten Folkeverksted** — an Electron
UI with a Java sidecar that integrates [LibLaserCut](https://github.com/t-oster/LibLaserCut)
and provides a guarded GRBL execution path.

## Status — M1 testing

The first complete, hardware-testable path is available:

- import SVG/SVGZ, DXF and HP-GL/PLT artwork as editable vector paths;
- import PNG, JPG, BMP, GIF, WebP, AVIF and TIFF images automatically as
  engraving with non-destructive grayscale photo controls;
- split page-one PDF and PDF-compatible Adobe Illustrator artwork into editable
  solid vector paths plus a high-resolution raster fallback for text, images,
  clipping, patterns and unsupported effects;
- open artwork in a new workspace with Import, or combine multiple selected
  artwork files non-destructively with Add;
- drag SVG, DXF and raster images directly into the active project, while
  dropped `.modcut` documents open in independent new tabs;
- keep multiple independent projects open as tabs, including separate designs,
  layers, raster settings, materials and undo/redo histories;
- guard every dirty tab during native Close/Quit and recover all open tabs from
  an atomic on-disk autosave after an unexpected app or renderer crash;
- draw Illustrator-style Bézier paths with a live pen preview, editable handles,
  close-path feedback, continuation from either open endpoint and point insertion
  directly on existing path segments;
- select individual anchors with high-visibility markers, drag a segment between
  two selected adjacent anchors, select every anchor by clicking the shape, use
  a forgiving highlighted path hit area, and remove anchors with Delete/Backspace;
- scale selections with Shift aspect locking, Alt/Option center scaling, or both
  modifiers together;
- engrave grayscale images with variable GRBL laser power, or select Jarvis,
  Floyd-Steinberg, Stucki or Bayer dithering;
- preview Photoshop-style gray-level posterization, midtone adjustment and
  dither threshold before generating the laser job;
- open a dedicated Advanced Editing window for one raster image, crop by dragging
  the image edges/corners, compare original and processed output, and apply
  non-destructive Photo, Halftone Dots, Lines, Banknote Crosshatch or Technical
  Sketch recipes using the same processor that generates the laser scanlines;
- move one or many selected elements between color layers from the properties
  panel or context menu, and retain reference geometry with Ignore;
- save reusable named Cut, Engrave and Score process profiles with power, speed,
  frequency, layer focus offset and operation-specific raster settings;
- combine a machine-wide focus calibration with each layer's focus offset on
  profiles that explicitly enable a bounded GRBL Z axis, or encode the layer
  offset as bounded Epilog software focus; unsafe values are rejected;
- group selected objects with Cmd/Ctrl+G, isolate a group by double-clicking it,
  and return to the main canvas by double-clicking outside;
- generate and simulate GRBL G-code, with compact modal power changes for
  high-resolution raster rows;
- honor requested raster DPI and a fixed 0.2 mm vector tolerance, with visible
  effective-quality details and blocking warnings instead of silent reduction;
- connect to GRBL over serial/TCP or an Epilog Zing through its LPD print queue;
- bind a live connection to its machine profile so another project's machine
  limits can never be used for the connected laser;
- verify that a configured TCP endpoint is a responsive GRBL controller or an
  accessible Epilog LPD service before reporting it connected;
- validate every job against an allow-list, bed dimensions, maximum feed and
  laser power before transmission;
- frame the design with the laser forced off;
- run a job asynchronously and stop it with GRBL feed-hold + soft reset;
- exercise the complete flow without hardware using the default dry-run mode.

The real-execution drivers are Dummy, GRBL and Epilog Zing. Epilog output uses
LibLaserCut's native HPGL/PCL job generation and LPR/LPD delivery on port 515;
it is not sent as GRBL G-code. Ruida is not enabled for real execution yet.

## Supported files

| File type | Import mode | Important limits |
|---|---|---|
| SVG, SVGZ | Editable vector | Recommended Illustrator interchange format. SVGZ is gzip-compressed SVG. Convert text to paths when the receiving computer may not have the fonts. |
| DXF | Editable vector | LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, ARC and ELLIPSE in common 2D files. Text, dimensions, hatches, blocks and splines are not imported yet. |
| HPGL, PLT | Editable vector | Common absolute/relative pen paths, pen selection, arcs and circles. Plotter coordinates use the conventional 40 units/mm. |
| PNG, JPG/JPEG, BMP, GIF, WebP, AVIF | Raster engraving | Animated images use the decoded still frame. |
| TIFF/TIF | Raster engraving | The first image/page is imported. |
| PDF | Hybrid vector/raster | Solid stroked and filled paths on page 1 become editable vectors. Every real vector stroke is retained regardless of line width; no 0.001 pt/hairline convention is required. Text, images, clipping, patterns and unsupported effects remain a raster engraving at up to 300 DPI and 36 megapixels. Raster and vector content remain separate process layers even when their colors match, and extracted paths are removed from the raster pass to avoid duplicate output. |
| AI | Hybrid vector/raster | Works when Illustrator saved a PDF-compatible AI file. Outlined artwork is retained as editable paths; live text and unsupported effects use the raster fallback. |
| MODCUT | Editable project | Portable project document described below. |

EPS/PostScript, CDR, PSD, G-code/NC and multi-page PDF/TIFF import are not
currently supported. Existing machine output is deliberately not treated as an
editable design source.

Vector stroke width never determines whether artwork is recognized as vector.
Cut and Score follow the center path once, while Engrave reproduces the painted
area, including fill, stroke width, caps, joins and dash patterns.

The file picker includes **All files** so an attempted unsupported import can
show a concise dialog with the complete supported-format list. A non-PDF-compatible
AI file gets a dedicated explanation with Illustrator's **Create PDF Compatible
File** steps and SVG export guidance instead of a generic import error.

## Portable `.modcut` projects

**Save document** writes the active tab as one portable `.modcut` JSON file.
It contains the complete Paper.js design (including embedded raster source
data), color layers and operations, layer power/speed/frequency/focus and raster
settings, document units, grid, path ordering, and the selected machine and
material identifiers. The original imported artwork does not need to travel
beside the project file.

Version 4 also contains the independent Draw document and the selected workspace.
Older version 1–3 projects open with an empty Draw document. Autosave recovers
Draw and Cut per tab; either workspace can trigger the unsaved-work prompt.
Unknown Draw schemas are read-only, with original data preserved on saving.
Use this or a newer modCut to save v4 projects; older releases may drop Draw data.
Draw currently offers multiple artboards, artwork import and grouped drawing tools.
New Draw documents have machine-bed, paper and screen presets. Artboards can be
renamed, resized, rearranged and copied with their artwork. Selection supports
resize handles, Shift/Alt scaling, smart guides and keyboard nudging. Rectangle,
rounded rectangle, ellipse/pie, polygon, star and line tools support exact sizes.
Each tool group has one toolbar entry; the right-hand rail opens one panel at a
time. Layers, Transform, Color and Stroke have their own editors. Pen draws
straight and Bézier paths, closes paths and continues either endpoint. Direct
Selection edits anchors and handles, including marquee selection and nudging.
Add/Delete/Anchor Point tools split curves and convert corner/smooth anchors.
Shift constrains angles, Alt separates handles and Space moves a Pen anchor
during dragging. Enter/Escape finishes an open path; Escape during a drag cancels
the preview. Anchor Point can expand a live shape into an editable path, with undo.
Direct Selection shows live-shape anchors without changing the document;
editing an anchor expands the shape, and one undo restores the original shape.
Dotted corner handles round straight corners, individually or together, with
an exact radius field in Properties. Setting the radius to zero restores sharp
corners. Grey tools are reserved for the later implementation steps.
Rotate (R), Reflect (O) and Scale (S) use a movable reference point. Click to
place it, drag to transform, hold Shift to constrain and Alt to copy. Enter or
double-click the toolbar tool for an exact dialog with Preview, Apply and Copy.
Object → Transform offers the same dialogs. Ctrl/Cmd+D repeats the last
transformation, including Copy. Scale can retain stroke widths or scale them
with the artwork; effect rendering remains planned for a later phase.
The renderer retains unchanged objects, skips artwork outside the viewport and
offers **Outline / Preview** with **Ctrl/Cmd+Y** or the Outline button. Outline
shows vector hairlines and image frames without changing the saved artwork.
The remaining drawing and editing tools are being built in stages; see the
[Draw implementation plan](docs/DRAW_WORKSPACE.md).

Type (T) places point text on click and rectangular area text on drag. Area Type in
the same tool group also opens a default frame on click. Edit Text offers frame width
and height in mm, with live wrapping. Text that does not fit remains editable and is
marked with a red plus; export includes visible text, and Create Outlines / Send to Cut require all
text to fit. Use Edit Text to reflow the frame; ordinary transforms scale the object.
Click text with Type, double-click it with Selection,
or use **Edit Text…** in Properties to edit it. The dialog previews text on the
canvas, with multiline content, font family, point size, leading, bold/italic and
paragraph alignment. Apply creates one undo step; Cancel discards the preview.
Text persists in projects and appears in SVG, PNG and JPEG exports. The font field
lists installed vector font families. New text keeps its shaped glyph outlines in
the document, so its appearance and export remain stable without the font installed.
**Send to Cut** sends text as vector outlines automatically, keeping the original
Draw text editable. **Type > Create Outlines** (Ctrl/Cmd+Shift+O) also remains available
to convert the Draw text to editable paths in one undo step. Editing text requires the original
font or choosing an available replacement; font files are not embedded.

Choose **Google Fonts** under **Font source** to search the full catalog (1,950
families in the bundled snapshot). Selecting a family downloads its complete font
files and licenses to the app cache for offline use, without installing OS fonts or
requiring an API key. Numeric weights, available styles, variable axes and named
instances preview on the canvas. Google font references retain the exact download
URL, checksum and license so another computer can fetch the same version. Text is
shaped locally. **Refresh Google Fonts catalog** updates the list. Fonts whose glyphs
have no supported monochrome vector contours cannot be used for laser output;
missing contours and text overflow block sending instead of omitting lettering.

The file does not copy local machine profiles, connection details, drivers,
material libraries or process-profile libraries. A receiving computer must
therefore have the intended machine/material configured locally and the user
must verify the selected machine, material, layer values and placement before
running. **Save job** and **Export G-code / RD** create machine output; they are
not substitutes for the editable `.modcut` document.

## Install modCut

Download the installer for your operating system from the release or CI
artifacts and install it as a normal desktop application. Everything required at
runtime is included: Electron, the Java sidecar, a private Java runtime and the
application assets. Users do not need to install Node.js, Java or Maven.

| Platform | Packages |
|---|---|
| macOS Apple Silicon and Intel | DMG and ZIP |
| Windows x64 | assisted installer and portable EXE |
| Linux x64 | AppImage and DEB |

## Developer requirements

- Node.js 18+
- JDK 17+
- Internet access on the first build (the included Maven wrapper downloads Maven
  and the pinned dependencies)

## Run

```sh
npm install
npm test
npm start
```

`npm start` builds the self-contained Java sidecar before Electron opens.

## Build an installer

```sh
npm run pack
npm run dist
```

`npm run pack` creates an unpacked application and verifies that its bundled
Java runtime can start the bundled sidecar. `npm run dist` creates the native
installer(s) for the current platform. Release signing and the complete build
matrix are documented in [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md).

## Safe first test

1. Leave **Dry run — do not send to hardware** checked.
2. Click **Connect**.
3. Import or draw a small design inside the bed.
4. Assign a material and verify every active layer.
5. If the machine uses Z focusing, verify its global machine focus offset, Z
   range and every layer's Focus offset before continuing.
6. Click **Frame**, then **Run dry-run**.
7. Verify that the job finishes and that Stop can cancel a longer job.

Only move on to hardware after the dry-run checklist passes. The full procedure,
including GRBL setup and acceptance criteria, is in [`docs/TESTING.md`](docs/TESTING.md).
Local-network setup and troubleshooting are in [`docs/NETWORK.md`](docs/NETWORK.md).

## Appearance

Open **Settings** in the toolbar or **Preferences…** in the application menu.
**Appearance** offers three options with icons: **System**, **Light** and **Dark**.
System is the default and follows operating-system changes automatically. Choose
a fixed theme with Light or Dark. Appearance changes apply and save immediately.
The choice persists across restarts and also applies
to Draw and Advanced Editing for Engraving. Appearance is included when exporting
preferences. The material preview is dimmed in dark mode; artwork colours and
laser output stay unchanged.

Preferences also includes **Show grid**, **Reverse zoom direction**, **Show
tooltips** and **Tooltip delay**. These choices apply and save immediately.
Reverse zoom affects Cmd/Ctrl + scroll and trackpad pinch in Cut; ordinary
scrolling still pans. Tooltips default to a one-second hover delay and can be
shown sooner, later or disabled. Unit and grid-spacing edits use **Save**.
Exported preferences include these options and grid spacing.

## Laser Preview in Draw

Use **View → Laser Preview** or the **Laser Preview** button beside Outline while drawing.
Solid red lines show Cut, dashed red lines distinguish Score, black shapes show vector
engraving, and supported images show in grayscale. Score dashes are a visual key; they do
not create gaps in the machine path. Vector engraving shows solid strokes without arrowheads,
as transferred by Send to Cut; normal Draw view keeps your original dashes and arrows.
Standard transfer uses the first visible fill and stroke with constant width on paths and
shapes, including artwork with width profiles or multiple paint layers. Extra paint stays in Draw.
Round Corners, Zig Zag, Offset Path, Transform, Pucker & Bloat, Roughen, Twist, Free Distort
and Warp on individual paths/shapes are supported.
Normal colour view is the default; your last choice is remembered.

**Laser processes** configures this tab's actual Cut/Score/Engrave/Ignore choices. Amber dotted
outlines or faded images indicate an unresolved process or appearance. Effects, advanced
composites and image dithering may need expansion or checking in Cut. Clipped strokes and images
are flagged when the transferred output can differ from the mask; **Show unresolved objects** explains why.
Review the final machine,
material, power and speed in Cut; the view does not predict burn depth or movement order.

The first activation explains the view and offers **Don’t show this again**. Reopen the explanation
from Help or reset it in Preferences. Toggling the view keeps the original artwork and exports.

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Java/bridge/renderer tests, WCAG check and Electron E2E suite |
| `npm run test:sidecar` | Maven/JUnit sidecar tests |
| `npm run test:bridge` | Build the fat JAR and test Node ↔ Java JSON-RPC |
| `npm run test:renderer` | Import, layer, raster, toolpath and quality unit tests |
| `npm run test:draw` | Draw model/kernel/keymap/project IO tests and SVG sprite consistency |
| `npm run build:icons` | Rebuild the Draw tool SVG sprite |
| `npm run test:e2e` | Real Electron workflows, native close and crash recovery |
| `npm run test:e2e:theme` | System appearance, Settings, persistence and editor theme synchronization |
| `npm run check:contrast` | WCAG AA palette guardrail |
| `npm start` | Build the sidecar and start Electron |
| `npm run pack` | Build and verify an unpacked native application |
| `npm run dist` | Build native installer files for the current platform |

## Architecture

| Path | Responsibility |
|---|---|
| `design/` | Design tokens, style guide and contrast test |
| `docs/` | User and hardware-testing documentation |
| `electron/` | Main process, preload bridge and sidecar lifecycle |
| `renderer/` | Editor, imports, toolpath generation, simulation and machine UI |
| `sidecar/` | Maven module, JSON-RPC, validation and GRBL transports |

The sidecar is deliberately the final safety boundary. Renderer-generated G-code
is treated as untrusted input and is revalidated in Java immediately before
framing or execution.
