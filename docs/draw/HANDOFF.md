# Draw: overlevering til neste agent

**Start med [STATUS.md](STATUS.md)**: én side med hva som er gjort og hva som gjenstår.

Oppdatert 2026-10-17. Arbeidsgren: `feat/vector-draw` (Claude og Codex jobber der; hent før du starter).

**Høyrepanelet følger nå [RIGHT_PANELS.md](RIGHT_PANELS.md).** Trinn 1 (dokk med Properties over
Layers, dragbar delelinje, panelgrupper som flyout med faner) trinn 2 (scrubby labels) og trinn 3
(Layers-rader, søk, bunnlinje, thumbnails og Layer Options) og trinn 4 (Swatches og Recent Colors)
er ferdige. Trinn 5 (Transparency) og Pathfinder-delen av trinn 7 er også ferdige. Appearance (resten av trinn 7) og trinn 8 (Properties) er også ferdige,
så hele høyrepanel-planen er gjennomført. D1.10 (Group, Arrange, Lock/Hide, utklippstavle og
isolasjonsmodus), D1.11 (Place med Template, STATUS.md 2.3) D1.12 (Send til Cut v1, STATUS.md 2.2) og D1.9 (kontrollinje, STATUS.md 2.4) er også ferdige. Grunnfasene er gjennomført; gjeldende prioritet er Laser Preview-stabilisering i STATUS.md kapittel 4. Autolagringstesten `project-workflows.mjs:113` har
vært ustabil på Linux, se arbeidsloggen.
D1.8 (Transform, Align, Color, Stroke, Fill/Stroke-boks og Properties) ble fullført på
`feat/vector-draw` og er slått inn her; panelene ligger nå i panelgruppene.


## Laser Preview — første versjon implementert 2026-10-18

Les `cut-optimized.md`, DRAW_WORKSPACE 4.4.1 og siste WORK_LOG. Meny/knapp, røde Cut-linjer,
stiplet Score, gravering, faktisk prosessoppsett, introvindu, Help/Preferences og huskede valg
finnes. Målrettet Electron verifiserer piksler, musegest, eksport-/modellnøytral visning,
prosesser ved filåpning/fanebytte og normal appomstart. Visning av uavklarte prosesser og
avanserte utseender er tilsiktet; ikke fjern disse markeringene for å få pene previews.
«Engrave as seen» er fortsatt en separat planlagt output-endring, ikke del av visningen.
«Show unresolved objects» er nå implementert, målrettet Electron-verifisert og pushet som
6122476. Full Draw passerte alle funksjonsgrupper og recovery. Siste preview-del ble drept
av en foreldet shutdown-timer i testkjøreren; denne er rettet og `--draw-recovery` passerer
hele IO/recovery→preview-overgangen. Ingen full omkjøring etter rettingen. Neste produktsteg
er å utvide støttede preview-tilfeller med faktisk Send to Cut-sammenligning.
Stiplede enkeltstreker/pilspisser ved vektorgravering er nå en slik verifisert utvidelse:
de vises heltrukket uten pilspisser, i samsvar med Cut-import. `--draw-laser-strokes` måler
67 306 prøvepunkter uten avvik; 343 Draw-tester passerer. Breddeprofiler og flere malingslag
forblir uavklart. Behold sammenligningen når flere preview-tilfeller støttes.

Ferdige trinn committes og pushes på `feat/vector-draw`. GitHub-tilgangen er rettet;
`b194897` er pushet og kontrollert på origin. Hent før du fortsetter og bevar parallelle commits.

## Status og neste oppgave

**Laser Preview er implementert i første versjon. «Engrave as seen» er fortsatt planlagt.** Se siste WORK_LOG og cut-optimized.md.

Fase 0 og fase 1 er fullført. Export As, **D2.1a/b punkttekst med systemfonter, shaping og
Create Outlines** og **D2.1c rektangulær områdetekst med linjebryting** er ferdige.
**Tekst på path (STATUS.md 2.10) og Character/Paragraph (2.11) er ferdige.** D2.1 er ferdig i grunnform;
resten står i 2.11. D2.2 compound paths og klippemasker er ferdige (2.12).
D2.4 path-kommandoer (2.13), D2.3 gradienter (2.14), D2.8 verktøy (2.15) og D2.9 History, Info og
kommandosøk (2.16) og Draw Normal/Behind/Inside (2.17) er ferdige. D2.10 Send til Cut v2 (2.18) er ferdig, og fase 2 er ferdig i grunnform.
D2.5 SVG-import, D2.7 WebP og D2.3 globale swatches og gradientswatches (2.19) er ferdige.
Fra D2.1 er skalering, baseline shift, kerning, avsnitt og blandede stiler gjort. D3.1 Expand og Expand
Appearance (2.20) er ferdig. D3.5 Select-meny, Magic
Wand og Lasso (2.21) er ferdig. D3.4 Shape Builder, Knife
og Eraser (2.22) er ferdig. D3.6 Free Transform,
Transform Each og Split Into Grid (2.23) er ferdig. D3.2 effekter (2.24) er ferdig.
D3.8 Links, Crop Image, Document Info og
Edit in Draw (2.25) er ferdig. D3.3 Image Trace (2.26) og D3.7 AI-eksport (2.27) er ferdige, så fase 3 er ferdig i grunnform. D4.1 Width og breddeprofiler (2.28), D4.2 Blend (2.29) D4.3 Warp, Live Pathfinder og opacity masks (2.30) D4.4 Paintbrush og Blob Brush (2.31), D4.5 (2.32) og D4.6 ytelsespass (2.33) er ferdige, så fase 4 er ferdig i grunnform. Fase 5 del A (PLT, GIF, Package, 2.34) del B (hurtigtaster, Glyphs, Scribble, 2.35) del C (Touch Type, Vertical Type, 2.36), del D (PDF/X-4, EPS-import, 2.37), del E (MCP-server, 2.38) og del F (lokalisering, 2.39) er gjort, så fase 5 er ferdig i grunnform. **Neste oppgave er hullene som er listet i STATUS.md kapittel 2 og 4.** Ny grensesnittekst skrives på engelsk og får en oppføring i `renderer/i18n-nb.mjs`. Viktig fra D4.6: dokumentet er copy-on-write (`doc/draft.mjs`); redigeringer må gå gjennom kommandoene i `doc/commands.mjs`, og mange endringer bør samles med `updateNodes`/`insertNodes`. Kjør `npm ci` etter pull.

**Brukerstyrt tillegg etter D2.1c:** Google Fonts og automatisk tekst til outlines ved Send to Cut
er implementert (STATUS.md 2.9). Tekst på path er fortsatt neste ordinære del.
Tekstdialogen har Installed / Google Fonts, søk i hele katalogen, vekter, tilgjengelige stiler,
variable akser og navngitte instanser. `assets/google-fonts-catalog.json` er et metadata-snapshot
(1 950 familier); oppdater med `npm run update:google-fonts` eller katalogknappen i appen.
Google Fonts bruker samme offentlige metadata-/nedlastingsendepunkter som fonts.google.com,
ikke Developer API med nøkkel. Endepunktformatene er ikke en stabil API-kontrakt; behold
snapshot/cache ved nettfeil og rapporter endret format. `google-fonts.mjs` laster komplette
TTF/OTF-filer og lisenser fra Googles manifest til userData/google-fonts. Ingen fontbinærer i repoet.
`character.googleFont` lagrer en versjonslåst URL, SHA-256 og lisens; dokumentet kan hente nøyaktig
samme font på en ny maskin. Visning/outlines/Cut fungerer fra lagret glyfgeometri også uten nett.
`fontAxes` og numerisk fontWeight er validert og inngår i utleggssignaturen.
Farge-/bitmapfonter uten støttede monokrome konturer avvises; ikke kall dette full COLRv1/emoji-støtte.

Send to Cut bruker glyfkonturene direkte, én compound path per synlig glyf, uten å endre Draw
eller historikken. Eldre punkttekst uten utlegg beregnes i en midlertidig kopi. Manglende font,
uavklart utlegg eller tekstoverløp på valgt artboard gir `summary.errors` og deaktiverer Send,
også hvis andre objekter er gyldige. `cutBusy` hindrer overlappende forberedelser/dialoger.
Create Outlines er fortsatt et eget destruktivt dokumentvalg med ett angresteg.

Sluttkontroll av samlet `88b3f47`: 191 Draw-tester, 23 main-tester og Electron `--draw-google-fonts`,
`--draw-text`, `--draw-area-text`, `--draw-outlines`, `--draw-cut`, `--draw-export` passerer.
Windows-pakke, medfølgende Java-runtime og fontmotor/katalog fra faktisk app.asar er verifisert.
Bygg fra et fast kildeøyeblikksbilde når andre økter endrer filer; se siste WORK_LOG-oppføring.
Tom Cut og ett artboard sender direkte uten dialog (`cutIsEmpty` fra app.js); dialogen åpnes likevel
ved feil eller tomt artboard, og har ingen Target når Cut er tom. Kopier/lim inn mellom
Cut og Draw: Paste tar nyeste kopi (`drawClipboard.time()` mot `bed.clipboardTime()`); Draw-kopier bærer
en cut-SVG (`artboardCutSvg` med `only`), Cut-kopier blir mm-SVG via `bed.clipboardSVG()` (WORK_LOG 2026-10-16).

Type (T): klikk lager punkttekst, dra lager en rektangulær tekstramme med live kant under drag.
Area Type finnes i Type-gruppen og har egen markør; klikk åpner en ramme på 60 × 30 mm.
Edit Text har bredde/høyde i mm for områdetekst; endringene bryter teksten på nytt i preview.
`text-wrap.mjs` bryter ved mellomrom/bindestrek og lange ord ved grafemgrenser, uten orddeling.
`node.frame` inngår i utleggssignaturen, og områdetekst krever et ferdig utlegg ved lagring.
`layout.visibleLines/overflow` beskriver hvilke linjer som får plass. Skjult tekst beholdes i
`content`; overløp vises i dialogen og som rødt pluss på canvas. Eksport tar synlige glyfer;
Create Outlines og Send to Cut avviser overløp, slik at skjult tekst ikke forsvinner.
Rammegrenser brukes til valg/hit-test, også under transformerte foreldre; UI-kant/pluss er
utenfor eksporten. Endre rammedimensjoner i Edit Text for reflow. Vanlige resize-/Transform-
kommandoer skalerer fortsatt hele objektet. Tekst i vilkårlig lukket form, lenkede rammer,
automatisk orddeling og reflow med canvas-håndtak gjenstår.

`electron/font-service.mjs` skanner system-/brukerfonter og bruker Fontkit 2.0.4 til å beregne
kerning, ligaturer og Bézier-konturer. IPC sender metadata og geometri, aldri vilkårlige fontfiler.
`doc/text-layout.mjs` inneholder ren konturkonvertering og signaturkontroll. `node.layout` inneholder
et versjonert glyfutlegg med koordinater i mm. Renderer, eksport og Create Outlines bruker dette
samme utlegget. Fontfilen bygges ikke inn; lagret tekst kan vises og konverteres uten fonten.
Endret tekst krever en tilgjengelig font. Utlegget valideres mot tekst/typografi; gjenbruk aldri
gammel geometri etter en tekstendring. Eldre tekst uten cache vises fortsatt med Paper PointText.

`textDialog()` venter på riktig asynkrone forhåndsvisning før Apply aktiveres. Forsinkede svar
etter nye tastetrykk/Cancel/destruert workspace ignoreres. `createTextOutlines()` venter på alle
fonter før én atomisk historikktransaksjon; én glyf blir én path med flere subpaths ved behov,
gruppert per linje/objekt. Send to Cut gjør nå samme konvertering midlertidig for redigerbar tekst.
SVG bruker outlines for beregnet tekst.
`scripts/verify-font-package.mjs` kontrollerer fontmotoren fra app.asar; kjøres av `npm run pack`.

E2E-flagg for de nye delene: `--draw-cut`, `--draw-place`, `--draw-control`, `--draw-export`,
`--draw-text`, `--draw-outlines`, `--draw-area-text`, `--draw-path-text`, `--draw-character`, `--draw-compound`, `--draw-path-commands`, `--draw-gradient`, `--draw-tools-two`, `--draw-google-fonts` (sistnevnte krever nett
ved første fontnedlasting; holdes utenfor den vanlige offline Draw-suiten).

Historikk for D1.9: commit `d337a8f` (en annen agent) flyttet allerede visningskontrollene
(posisjon, artboard, zoom, Outline, Fit) til appens nederste statuslinje (`#drawStatus`) og
la til ny New Document-dialog med maler. Sammenlign dette med kapittel 3.2 i
[hovedplanen](../DRAW_WORKSPACE.md) og bygg videre i stedet for å lage nye kopier.
Kontrollinjen (kontekstuelle felt øverst) ble senere fullført.

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

## Verifisert 2026-10-16 (D2.1b)

- **173 Draw-enhetstester og 18 main-tester passerer** (`npm run test:draw`, `npm run test:main`).
  Fonttestene dekker TrueType, OpenType/CFF, fontsamlinger, kerning, fi-ligatur, multiline/
  alignment, manglende fonter og lagret geometri uten tilgang til originalfonten.
- **Electron `--draw-text`, `--draw-outlines` og `--draw-export` passerer**. Outlines-testen
  kontrollerer uendrede glyph-konturer og mål innen 0,01 mm, rasterlikhet før/etter, transform/
  opacity, Type-meny, ett angresteg og reell overføring til Cut med samme mål/plassering.
- Windows-pakken (`electron-builder --dir --win --publish never`) og sidecar-smoketesten
  passerer. Fontmotoren er importert fra den bygde app.asar og beregner glyfer korrekt med
  de medfølgende avhengighetene (`node scripts/verify-font-package.mjs`).
- Tekstforhåndsvisning og outlines er visuelt kontrollert i `%TEMP%/modcut-draw-text-preview.png`
  og `%TEMP%/modcut-draw-text-outlines.png`.
- Det komplette Draw-løpet ble ikke kjørt på nytt her. Se tidligere helkjøringsfeil nedenfor;
  denne delen er kontrollert med de målrettede testene over.

## Tidligere verifisering 2026-10-16 (D2.1a)

- **168 Draw-enhetstester passerer** (`npm run test:draw`).
- **Punkttekst-E2E passerer** (`node electron/e2e/run.mjs --draw-text`); skjermbildet
  `%TEMP%/modcut-draw-text-preview.png` er visuelt kontrollert.
- **Eksport-E2E og markør-E2E passerer separat** (`--draw-export`, `--draw-feedback`).
- Det samlede `--draw`-løpet passerte til og med panelene, men stoppet i
  `draw-feedback-workflows.mjs:43`: forventet `pen-close`, fikk `pen-active`. Separat
  `--draw-feedback` passerte uten kodeendringer. Årsaken er ikke fastslått, og hele
  Draw-løpet er derfor ikke verifisert grønt ved dette stoppunktet.

## Tidligere verifisering (historikk)

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

## Overføring til lokal maskin etter Laser Preview

Ferdige kode-/stabiliseringstrinn er lokale commits 706a950, 9317e79, d4142c6 og 5d08ecd;
6f6ad76 bevarer origin-commit 84daced fra den parallelle økten. GitHub avviste push med 403
(«Permission to sirbull/modCut.git denied to sirbull»). Ikke anta at disse commitene ligger på origin.
En selvstendig `modcut-feat-vector-draw.bundle` leveres utenfor repoet med hele branchhistorikken.
Last ned denne og bruk følgende fra ditt eksisterende repo (endre filstien):

```sh
git status --short
git fetch /path/to/modcut-feat-vector-draw.bundle feat/vector-draw
git switch feat/vector-draw
git merge FETCH_HEAD
```

Bevar/commit egne lokale endringer før merge, og bruk vanlig merge dersom lokal/origin-branch
har egne nyere commits. Ingen reset/force-push trengs. Etter import kan du pushe med din vanlige
lokale GitHub-tilgang. Se STATUS og WORK_LOG for faktisk teststatus og eksplisitte restpunkter.
