# modCut

Modern, cross-platform laser control for **Horten Folkeverksted** — an Electron
UI with a Java sidecar that integrates [LibLaserCut](https://github.com/t-oster/LibLaserCut)
and provides a guarded GRBL execution path.

## Status — M1 testing

The first complete, hardware-testable path is available:

- import SVG, DXF and raster artwork, arrange it on the laser bed and map colors
  to Cut / Engrave / Score operations;
- generate and simulate GRBL G-code;
- connect to GRBL over serial or TCP;
- validate every job against an allow-list, bed dimensions, maximum feed and
  laser power before transmission;
- frame the design with the laser forced off;
- run a job asynchronously and stop it with GRBL feed-hold + soft reset;
- exercise the complete flow without hardware using the default dry-run mode.

Ruida and Epilog are not enabled for real execution yet. The UI only offers
drivers that the M1 sidecar can safely execute: Dummy and GRBL.

## Requirements

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

## Safe first test

1. Leave **Dry run — do not send to hardware** checked.
2. Click **Connect**.
3. Import or draw a small design inside the bed.
4. Assign a material and verify every active layer.
5. Click **Frame**, then **Run dry-run**.
6. Verify that the job finishes and that Stop can cancel a longer job.

Only move on to hardware after the dry-run checklist passes. The full procedure,
including GRBL setup and acceptance criteria, is in [`docs/TESTING.md`](docs/TESTING.md).

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Java unit tests, bridge test, renderer test and WCAG check |
| `npm run test:sidecar` | Maven/JUnit sidecar tests |
| `npm run test:bridge` | Build the fat JAR and test Node ↔ Java JSON-RPC |
| `npm run test:renderer` | SVG unit conversion tests |
| `npm run check:contrast` | WCAG AA palette guardrail |
| `npm start` | Build the sidecar and start Electron |

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
