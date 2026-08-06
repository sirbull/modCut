# modCut

Modern, cross-platform laser control for **Horten Folkeverksted** — an Electron
UI with a Java sidecar that integrates [LibLaserCut](https://github.com/t-oster/LibLaserCut)
and provides a guarded GRBL execution path.

## Status — M1 testing

The first complete, hardware-testable path is available:

- import SVG and DXF artwork, and import PNG/JPG raster artwork automatically as
  engraving with non-destructive grayscale photo controls;
- open artwork in a new workspace with Import, or combine multiple selected
  artwork files non-destructively with Add;
- keep multiple independent projects open as tabs, including separate designs,
  layers, raster settings, materials and undo/redo histories;
- engrave grayscale images with variable GRBL laser power, or select Jarvis,
  Floyd-Steinberg, Stucki or Bayer dithering;
- preview Photoshop-style gray-level posterization, midtone adjustment and
  dither threshold before generating the laser job;
- move one or many selected elements between color layers from the properties
  panel or context menu, and retain reference geometry with Ignore;
- group selected objects with Cmd/Ctrl+G, isolate a group by double-clicking it,
  and return to the main canvas by double-clicking outside;
- generate and simulate GRBL G-code;
- connect to GRBL over serial or TCP;
- verify that a configured TCP endpoint is a responsive GRBL controller before
  reporting it connected;
- validate every job against an allow-list, bed dimensions, maximum feed and
  laser power before transmission;
- frame the design with the laser forced off;
- run a job asynchronously and stop it with GRBL feed-hold + soft reset;
- exercise the complete flow without hardware using the default dry-run mode.

Ruida and Epilog are not enabled for real execution yet. The UI only offers
drivers that the M1 sidecar can safely execute: Dummy and GRBL.

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
5. Click **Frame**, then **Run dry-run**.
6. Verify that the job finishes and that Stop can cancel a longer job.

Only move on to hardware after the dry-run checklist passes. The full procedure,
including GRBL setup and acceptance criteria, is in [`docs/TESTING.md`](docs/TESTING.md).
Local-network setup and troubleshooting are in [`docs/NETWORK.md`](docs/NETWORK.md).

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Java unit tests, bridge test, renderer test and WCAG check |
| `npm run test:sidecar` | Maven/JUnit sidecar tests |
| `npm run test:bridge` | Build the fat JAR and test Node ↔ Java JSON-RPC |
| `npm run test:renderer` | SVG unit conversion tests |
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
