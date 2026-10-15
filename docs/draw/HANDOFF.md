# Draw: overlevering til neste agent

Oppdatert 2026-10-15. Arbeidsgren: `claude/draw-properties-layers-panels` (bygger på `feat/vector-draw`).

**Høyrepanelet følger nå [RIGHT_PANELS.md](RIGHT_PANELS.md).** Trinn 1 (dokk med Properties over
Layers, dragbar delelinje, panelgrupper som flyout med faner) trinn 2 (scrubby labels) og trinn 3
(Layers-rader, søk, bunnlinje, thumbnails og Layer Options) og trinn 4 (Swatches og Recent Colors)
er ferdige. Neste er trinn 5: Transparency-fanen i Stroke-gruppen (Stroke-panelet er allerede
fullt fra D1.8). Autolagringstesten `project-workflows.mjs:113` har
vært ustabil på Linux, se arbeidsloggen.
D1.8 (Transform, Align, Color, Stroke, Fill/Stroke-boks og Properties) ble fullført på
`feat/vector-draw` og er slått inn her; panelene ligger nå i panelgruppene.


## Status og neste oppgave

Fase 0 og D1.1–D1.8 er fullført. **Neste oppgave er D1.9: kontrollinje og statuslinje.**
Fase 1 er ikke ferdig (D1.9–D1.12 gjenstår). Ikke merk fasen ferdig før Send til Cut v1 virker.

Før du starter D1.9: commit `d337a8f` (en annen agent) flyttet allerede visningskontrollene
(posisjon, artboard, zoom, Outline, Fit) til appens nederste statuslinje (`#drawStatus`) og
la til ny New Document-dialog med maler. Sammenlign dette med kapittel 3.2 i
[hovedplanen](../DRAW_WORKSPACE.md) og bygg videre i stedet for å lage nye kopier.
Kontrollinjen (kontekstuelle felt øverst) finnes ikke ennå.

Les hovedplanen (kapittel 3, 8, 18 og sjekklisten i kapittel 23) og
[arbeidsloggen](WORK_LOG.md). Eldre «neste oppgave»-notater i loggen er historiske.

## Eierens arbeidsform og krav

- Ta **én fase/del av gangen**. Commit, push og oppdater denne filen, arbeidsloggen,
  kapittel 23 og `ROADMAP.md` etter **hver** del, slik at kvoten aldri brukes opp uten
  committet og dokumentert arbeid. D1.8 ble gjort som A, B, C, D1, D2, D3.
- **Live tilbakemelding er svært viktig:** linjer, håndtak og endringer skal alltid
  vises mens man tegner/redigerer (f.eks. Pen fra A til B: kurve og begge håndtak synlige
  under drag). Verifiser med E2E midt i gesten, ikke bare etter commit.
- **Markøren skal alltid være synlig** over canvas, med Illustrator-likt ikon per verktøy
  og tilstand (`renderer/draw/tools/cursors.mjs`). Nye verktøy/tilstander skal få markør.
- Ingen dupliserte paneler/verktøy: én høyrepanelvisning, ett Layers-tre; Properties
  gjentar ikke Transform/Color/Stroke/Align (testet i `draw-phase1-workflows.mjs`).
- Hold brukeren orientert underveis (norsk).
- En annen agent (Codex) kan jobbe i samme arbeidstre. Ser du fremmede endringer i
  `git status`, spør brukeren før du committer dem, og ikke kjør Electron-E2E samtidig.

## Sist fullført: D1.8 (se arbeidsloggen for detaljer per del)

- **Layers/template-lag:** ren `doc/layers.mjs` (arvet kontekst: template, print,
  per-lag Outline, bildedimming, lagfarge; `isOutputNode` for eksport/Send til Cut).
  Tre med øverste lag først, øye/template-ikon, lås, sammenfelling, lagfarge,
  valgsirkel, drag-and-drop, Alt-solo, Ctrl/Cmd-Outline, Layer Options, inline rename,
  New layer/sublayer, Collect, Release, Locate, Delete. Utvalgsramme i lagfarge.
- **Transform:** ni-punkts referanse, X/Y/W/H, lenkede proporsjoner, relative Rotate/Shear,
  Scale strokes & effects og Scale corners (`panelMatrix`, `transformProperties(...,{scaleCorners})`).
- **Align:** ren `geom/align.mjs`; Selection/Key object/Artboard, Align, Distribute
  Objects og Distribute Spacing (Auto eller eksakt mm).
- **Color:** ren `doc/color.mjs` (RGB/HSB/CMYK/Gray/Hex; maling lagres som RGB).
  Live glidere; `History.transaction(label, fn, {mergeKey})` gjør et drag til ett angresteg.
- **Stroke:** `changeStroke` (vekt, cap, corner, limit, dash, piler), ren `geom/arrows.mjs`,
  pilspisser rendres i adapteren. Inside/Outside er deaktivert til Outline Stroke (fase 3).
- **Fill/Stroke-boks:** Swap, Default, Color (`,`), Gradient (deaktivert), None (`/`).
  **Properties:** navn, opacity, formparametre og utseende-oppsummering som lenker til panelene.
- **Markører og live Pen-tilbakemelding:** se eierkrav over.

## Kjente begrensninger og forslag til senere arbeid

- Objekter uten både fyll og strek kan ikke treffes på canvas (Paper hit-test krever maling).
- Laglisten er ikke virtualisert (AK: 500 objekter jevnt). Vurder i ytelsespass.
- Nøkkelobjekt i Align velges i panelet, ikke ved klikk på valgt objekt.
- Fargespekter/ramp, «align dashes to corners» og width profiles mangler.
- Pilstørrelse for `strokeScaling:false` under skalerte foreldre er omtrentlig.
- Send til Cut (D1.12) må bruke `isOutputNode` og håndtere pilspisser og dash.

## Arkitektur og viktige fallgruver

- Modell og geometri skal være uten DOM/Paper. Alle dokumentendringer går gjennom Commands/History. Paper er kun visning; forhåndsvisning og håndtak er ikke dokumentdata.
- Draw har isolert PaperScope. Aktiver riktig scope før Paper-operasjoner og gjenopprett Cut-scope i `finally`. Bevar tema-capture-handleren i `renderer/app.js`.
- Ikke endre `renderer/bed.js` eller `sidecar/` for Draw-arbeid. En smal Draw→Cut-import hører til D1.12.
- `state.ui` er midlertidig og serialiseres ikke (panelvalg, referansepunkt, align-modus, fargemodus, siste farger).
- **Draws vindus-keydown-lytter i `renderer/app.js` kjører i capture-fasen og stopper hendelsen.** Input-elementer i paneler får derfor ikke keydown; bruk `change`/`blur`/`input` (se rename i Layers).
- Panelet bygges ikke om under en aktiv glider-/fargevelger-økt (`liveEdit` i `panels/ui.mjs`), ellers avbrytes draget.
- Adapteren lagrer arvet lagkontekst per node (`record.context`) og tar den med i fingerprint. Pilspisser og bilderammer er egne visningsobjekter ved siden av noden (`record.arrows`, `record.frame`) og må fjernes når noden erstattes/slettes.
- `strokeScaling:false`: modellens strekbredder er verdens-mm; Paper tolker false som skjermpiksler, så adapteren multipliserer med `view.zoom`. Bevar dette.
- Live corners: se tidligere notater i hovedplanen (metadata bevares ved likformige transformasjoner, bakes ellers).
- Paper kan cache foreldede globale matriser etter reparenting. Adapteren beregner verdensmatriser fra modellen.

## Filkart

| Fil/område | Ansvar |
| --- | --- |
| `renderer/draw/index.mjs` | Workspace, scope, kommandoer, panel-API (transformPanel, alignPanel, paint, strokeProps, paintFocus, layerOptions), markør per verktøy |
| `renderer/draw/panels/ui.mjs` | Én aktiv panelvisning: Properties, Layers, Artboards, Color, Stroke, Align, Transform |
| `renderer/draw/panels/registry.mjs`, `panels/icons/` | Panelregister og vendrede Tabler-ikoner (`sources.json` med hash, `npm run build:icons`) |
| `renderer/draw/doc/layers.mjs` | Lagregler, template-kontekst, solo, drop, collect/release, `isOutputNode` |
| `renderer/draw/doc/color.mjs`, `doc/paint.mjs` | Fargemodi; `changePaint`, `changeStroke`, `paintHex` |
| `renderer/draw/doc/history.mjs` | History med nestede og sammenslåbare (`mergeKey`) transaksjoner |
| `renderer/draw/geom/align.mjs`, `geom/arrows.mjs`, `geom/transforms.mjs` | Ren Align-, pil- og transform-/panelmatematikk |
| `renderer/draw/tools/cursors.mjs` | Illustrator-lik SVG-markør per verktøy/tilstand |
| `renderer/draw/tools/toolbar.mjs` | Verktøygrupper, flyouts, Fill/Stroke-boks |
| `renderer/draw/tools/interactions.mjs`, `tools/paths.mjs` | Canvas-gestures; Pen/Direct Selection med live håndtak og lagfarget kontur |
| `renderer/draw/render/paper-adapter.mjs` | Retained rendering, lagkontekst, pilspisser, previews, hit-testing |
| `renderer/draw/ui/dialogs.mjs` | Modaler inkl. Layer Options, transform og New Document |
| `electron/e2e/draw-panel-workflows.mjs` | E2E for alle D1.8-paneler (`--draw-panels`) |
| `electron/e2e/draw-feedback-workflows.mjs` | E2E for markører og live Pen-forhåndsvisning (`--draw-feedback`) |

## Verifisert ved stoppunktet

- **126 Draw-enhetstester passerer** (`npm run test:draw`).
- **Komplett Draw Electron-E2E passerer** (`node electron/e2e/run.mjs --draw`), inkludert
  paneler, live-tilbakemelding, prosjektlagring, autosave og krasj/gjenstart.
- Draw-relansering etter simulert krasj prøver nå én gang til hvis DevTools ikke dukker
  opp (forbigående feil traff tidligere ca. halvparten av kjøringene).
- Autosave-testen «recovery runs while edits continue» er tidsfølsom og kan feile under
  last eller ved parallelle Electron-kjøringer; den passerte ved omkjøring.
- Full `npm test` er ikke grønn: den kjente Cut-beskjæringstesten (`electron/e2e/workflows.mjs`,
  «dragging a crop edge must update the crop») feilet også før Draw-arbeidet. Siste fulle kjøring (etter c93383b): alt før
  denne testen passerer, inkludert sidecar, bridge, main, renderer, Draw og kontrast.

## Kjøring på denne maskinen

Node v24 og npm er installert. Portabel JDK17 finnes under `%TEMP%\modcut-draw-toolchain`.
Sett miljø bare for gjeldende PowerShell-prosess:

```powershell
$drawToolchain = Join-Path $env:TEMP 'modcut-draw-toolchain'
$env:JAVA_HOME = (Get-ChildItem -LiteralPath $drawToolchain -Directory -Filter 'jdk*' | Select-Object -First 1).FullName
$env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path
npm run test:draw
node electron/e2e/run.mjs --draw            # komplett Draw-E2E (~8 min)
node electron/e2e/run.mjs --draw-panels     # D1.8-paneler
node electron/e2e/run.mjs --draw-feedback   # markører og live Pen
```

Andre målrettede flagg: `--draw-tools`, `--draw-paths`, `--draw-corners`, `--draw-transforms`.
Ikke kjør Electron-E2E samtidig. Skjermbilder skrives til `%TEMP%` (bl.a.
`modcut-draw-layers-panel.png`, `-align-panel.png`, `-color-panel.png`, `-stroke-panel.png`,
`-fill-stroke-box.png`, `-pen-handles.png`, `-cursors.png`). CDP-skjermbilder viser ikke
markøren; markørgalleriet i feedback-testen gjør det. Ikke legg JDK, logger eller
skjermbilder i repoet. Nye Tabler-ikoner hentes fra den låste pakken `@tabler/icons@3.49.0`
(`npm pack`), kopieres med LF-linjeslutt og registreres med sha256 i `sources.json`.
