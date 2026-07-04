# modCut

Modern, cross-platform laser control for **Horten Folkeverksted** — a modernized
[VisiCut](https://github.com/t-oster/VisiCut). Electron UI + a Java sidecar that
reuses VisiCut's proven driver engine ([LibLaserCut](https://github.com/t-oster/LibLaserCut))
to drive Epilog, Ruida/Chinese CO2, GRBL and more over USB or network.

Full design + roadmap: `../.claude/plans/jeg-nsker-bygge-reactive-popcorn.md`.

## Status — M0 (skeleton)

Proven so far, no laser hardware required:

- **Design system** — `design/tokens.css` (green-gradient palette, pill buttons), a
  living style guide, and a WCAG contrast guardrail.
- **Docs** — beginner user guide in `docs/index.html`.
- **Architecture** — Electron ⇄ Java sidecar over line-delimited JSON-RPC (stdio),
  answered by a Dummy driver.

## Try it

```sh
node design/check-contrast.mjs      # WCAG AA check over the palette
npm run test:bridge                 # compile sidecar + prove the Node<->Java round-trip
open design/styleguide.html         # the design language (toggle light/dark)
open docs/index.html                # beginner user guide

npm install && npm start            # boot the Electron shell (needs `electron` installed)
```

Requires Node 18+ and a JDK (17+). Maven arrives at M1 with the real LibLaserCut dependency.

## Layout

| Path | What |
|------|------|
| `design/` | `tokens.css` design system, style guide, contrast check |
| `docs/` | beginner documentation site |
| `electron/` | main process, preload, sidecar bridge + bridge test |
| `renderer/` | app window (M0 shell; LightBurn-style layout lands M1+) |
| `sidecar/` | Java JSON-RPC sidecar (`javac` now; Maven + LibLaserCut at M1) |
