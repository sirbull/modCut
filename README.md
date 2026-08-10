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
- move one or many selected elements between color layers from the properties
  panel or context menu, and retain reference geometry with Ignore;
- save reusable named Cut, Engrave and Score process profiles with power, speed,
  frequency, layer focus offset and operation-specific raster settings;
- combine a machine-wide focus calibration with each layer's focus offset on
  profiles that explicitly enable a bounded GRBL Z axis, or encode the layer
  offset as bounded Epilog software focus; unsafe values are rejected;
- group selected objects with Cmd/Ctrl+G, isolate a group by double-clicking it,
  and return to the main canvas by double-clicking outside;
- generate and simulate GRBL G-code;
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
| PDF | Hybrid vector/raster | Solid stroked and filled paths on page 1 become editable vectors. Text, images, clipping, patterns and unsupported effects remain a raster engraving at up to 300 DPI and 36 megapixels. Extracted paths are removed from the raster pass to avoid duplicate output. |
| AI | Hybrid vector/raster | Works when Illustrator saved a PDF-compatible AI file. Outlined artwork is retained as editable paths; live text and unsupported effects use the raster fallback. |
| MODCUT | Editable project | Portable project document described below. |

EPS/PostScript, CDR, PSD, G-code/NC and multi-page PDF/TIFF import are not
currently supported. Existing machine output is deliberately not treated as an
editable design source.

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

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Java/bridge/renderer tests, WCAG check and Electron E2E suite |
| `npm run test:sidecar` | Maven/JUnit sidecar tests |
| `npm run test:bridge` | Build the fat JAR and test Node ↔ Java JSON-RPC |
| `npm run test:renderer` | Import, layer, raster, toolpath and quality unit tests |
| `npm run test:e2e` | Real Electron workflows, native close and crash recovery |
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

## Machine drivers

Machine profiles now bind stable controller IDs to user-facing manufacturer and
model presets. The implemented catalog is Generic/Dummy, Generic/GRBL,
Epilog/Zing and Epilog/Helix. Zing is physically verified; Helix is implemented
and automatically tested but awaits physical verification. See
[`docs/DRIVERS.md`](docs/DRIVERS.md) for capabilities and extension guidance.
