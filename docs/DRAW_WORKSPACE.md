# modCut Draw: vektoreditor i modCut

> Status: spesifikasjon og byggeplan. Ingen kode er skrevet ennå.
> Sist oppdatert: 2026-10-14.
> Målgruppe: utviklere og kodeagenter (Claude Code og Codex) som skal bygge løsningen.

Dette dokumentet er den autoritative planen for Draw, en egen tegneseksjon i modCut.
Draw gjør modCut til et program der man både kan lage design (logoer, skilt, ornamenter,
monteringsdeler) og kutte/gravere dem, uten å gå via Illustrator eller Inkscape.

Dokumentet er skrevet slik at hver oppgave i [Byggeplan](#18-byggeplan-faser-og-oppgaver)
kan gis til én agent som én avgrenset pull request.

## Innhold

1. [Mål og avgrensning](#1-mål-og-avgrensning)
2. [Viktige beslutninger](#2-viktige-beslutninger)
3. [Brukeropplevelse og layout](#3-brukeropplevelse-og-layout)
4. [Arkitektur](#4-arkitektur)
5. [Dokumentmodell](#5-dokumentmodell)
6. [Verktøy](#6-verktøy)
7. [Hurtigtaster](#7-hurtigtaster)
8. [Paneler](#8-paneler)
9. [Menyer i Draw-modus](#9-menyer-i-draw-modus)
10. [Funksjonsspesifikasjoner](#10-funksjonsspesifikasjoner)
11. [Bitmap som referanse og Image Trace](#11-bitmap-som-referanse-og-image-trace)
12. [Import](#12-import)
13. [Eksport](#13-eksport)
14. [Send til Cut](#14-send-til-cut)
15. [Filformat og migrering](#15-filformat-og-migrering)
16. [Gjenbruk av åpen kildekode og lisenser](#16-gjenbruk-av-åpen-kildekode-og-lisenser)
17. [MCP og agentverktøy](#17-mcp-og-agentverktøy)
18. [Byggeplan: faser og oppgaver](#18-byggeplan-faser-og-oppgaver)
19. [Testing og kvalitetskrav](#19-testing-og-kvalitetskrav)
20. [Arbeidsregler for Claude og Codex](#20-arbeidsregler-for-claude-og-codex)
21. [Åpne spørsmål](#21-åpne-spørsmål)
22. [Kilder](#22-kilder)

---

## 1. Mål og avgrensning

### 1.1 Mål

* En **Draw**-knapp i hovedverktøylinjen (CTA-farge) bytter modCut fra Cut-modus til en
  fullverdig vektoreditor i samme vindu og samme prosjektfane.
* Arbeidsflyten skal kjennes kjent for Illustrator-brukere: samme verktøy, samme
  hurtigtaster, samme begreper (artboards, layers, appearance, pathfinder, outline
  stroke, image trace, create outlines). UI-et skal **ikke** være en kopi av Illustrator,
  men følge modCuts eget designsystem (`design/tokens.css`).
* Flere artboards per dokument, med fri pasteboard rundt.
* Bitmap kan dras inn og brukes som referanse (template-lag, låst, dempet) for å tegne over.
* Layers, fill, stroke, gradienter, effekter, tekst, outline stroke, pathfinder,
  image trace og eksport til vektor- og skjermformater.
* Et valgt artboard kan sendes til Cut med én knapp. Cut fungerer som i dag.
* Robust: alt er angrebart, autosaves og krasjgjenopprettes som resten av modCut,
  og alle geometrioperasjoner er testet mot faste referansefiler.

### 1.2 Utenfor omfang (første versjon)

Disse er bevisst utsatt. De skal ikke bygges før fase 1 til 5 er ferdige.

* Gradient mesh, perspective grid, 3D, envelope distort, live paint, symbol sprayer.
* Pattern-swatches og brushes utover en enkel Paintbrush og Blob Brush.
* Fargestyring med ICC-profiler og ekte CMYK-separasjoner. CMYK vises og lagres som verdier,
  men rendres via RGB.
* Lesing av native, ikke-PDF-kompatible `.ai`-filer (Illustrators private format).
* Samarbeid i sanntid og skylagring.

---

## 2. Viktige beslutninger

Disse beslutningene er tatt. En agent skal ikke endre dem uten at dokumentet oppdateres i
samme PR og eieren godkjenner det.

| Nr | Beslutning | Begrunnelse |
|---|---|---|
| B1 | Draw bygges i den eksisterende Electron-appen, i `renderer/draw/`, som egen modul ved siden av Cut. | Én app, én installasjon, samme prosjektfaner og samme lagring. |
| B2 | Draw har **sin egen dokumentmodell** (rene JS-objekter, versjonert JSON). Paper.js brukes som render- og trefftestmotor, ikke som sannhetskilde. | Modellen kan testes i Node uten canvas, serialiseres stabilt og migreres. Paper.js-objekter er vanskelige å versjonere og diff'e. |
| B3 | Draw bruker et **eget `paper.PaperScope`** og eget `<canvas>`. `renderer/bed.js` endres ikke, bortsett fra et smalt API for import fra Draw. | Hindrer at Draw og Cut ødelegger hverandres tilstand og verktøy. |
| B4 | Intern enhet er **millimeter** (double). Visningsenhet velges per dokument (mm, cm, in, pt, px, pica). | Cut og maskinene bruker mm. Konvertering skjer kun i UI og eksport. |
| B5 | Tunge geometrioperasjoner (boolean, offset, outline stroke, simplify, trace, PDF/EPS-skriving) kjører i en **Web Worker** bak et smalt grensesnitt, `GeometryKernel`. | UI fryser aldri. Kjernen kan byttes uten at verktøyene endres. |
| B6 | Førstevalg for `GeometryKernel` er en WebAssembly-build av utvalgte crates fra **VectorCraft** (MIT/Apache-2.0). Fallback er rene JS-biblioteker (se kapittel 16). Valget avgjøres i spike D0.3 med målbare kriterier. | VectorCraft har allerede exact curve booleans, trace, PDF/EPS/SVG og Illustrator-lik oppførsel, men er alfa og to uker gammelt. Derfor en kontrollert spike. |
| B7 | Ingen GPL-kode kopieres inn (Inkscape, Potrace, Scribus o.l.). De kan brukes som **referanse for oppførsel** og som testorakel, ikke som kildekode. | modCut har i dag ingen GPL-avhengigheter. GPL ville tvunget hele appen over på GPL. Se 16.2. |
| B8 | Hurtigtaster følger Illustrator i Draw-modus. Keymap er sentralisert, data-drevet og modusavhengig. | Kjent for brukerne, og konflikter med Cut løses ett sted. |
| B9 | "Send til Cut" går via en **kanonisk cut-SVG** (mm, ekspandert, uten effekter) inn i eksisterende `bed.loadSVG`/`bed.loadImage`. | Gjenbruker den testede importstien i Cut i stedet for å lage en ny. |
| B10 | Hver eksport og hver Send til Cut bruker samme **resolve-steg** (`resolveScene`) som gjør live effekter, tekst og appearance om til ren geometri. | Én sannhet: det man ser er det som eksporteres og det som kuttes. |

### 2.1 MCP-verktøy for utviklingen

Ingen MCP-server er nødvendig for å bygge Draw. Funksjonene bygges med egen kode, Paper.js og
gjenbrukt kode fra VectorCraft (kapittel 16), og testes med prosjektets egne tester (kapittel 19).
To MCP-servere er **valgfrie** hjelpemidler under utviklingen. Ingen av dem er en del av produktet.

* **REA** (Reverse Engineer Anything, <https://github.com/morluto/rea>, MIT, npm-pakke
  `rea-agents`): analyse av apper, binærfiler, JavaScript/Electron, WASM og filer, med
  sporbar evidens. Brukes til å analysere modCut selv, VectorCraft-bygget vårt og
  eksempelfiler, og til å fange og sammenligne Electron-scenarier og skjermbilder.
  Se 17.1 for oppsett og 17.2 for hva den skal og **ikke** skal brukes til.
* **VectorCraft MCP** (`vectorcraft-cli mcp`): en Illustrator-lik editor der en agent kan
  styre menyer, verktøy og eksport. Brukes til å lage referansefiler og sammenligne oppførsel.
  Se 17.3.

---

## 3. Brukeropplevelse og layout

### 3.1 Bytte mellom Cut og Draw

* I hovedverktøylinjen (`renderer/index.html`, `header.toolbar`) legges en knapp
  **Draw** med klassen `btn btn--primary btn--sm` (CTA, `--grad-primary`), plassert rett etter
  `Import`/`Add`-gruppen. Ikon: pennespiss (`draw`), tekst "Draw", tooltip
  `Draw: vektoreditor (Shift+Cmd/Ctrl+D)` hvis tasten er ledig, ellers kun klikk og menyvalg
  `View > Draw workspace`.
* Når Draw er aktiv, byttes knappen til **Cut** (`btn--secondary`) som tar brukeren tilbake.
  Ved siden av vises **Send til Cut** som `btn--primary` når minst ett artboard er valgt.
* Bytte er øyeblikkelig og taper ingen tilstand. Hver prosjektfane husker sist brukte modus.
* `body` får `data-workspace="cut"` eller `data-workspace="draw"`. All synlighet styres med CSS
  på dette attributtet, ikke med spredte `hidden`-klasser.
* Hovedprosessen (`electron/main.mjs`) får beskjed om modus via IPC og bygger menyen på nytt
  (se kapittel 9).

### 3.2 Layout i Draw-modus

```text
+------------------------------------------------------------------------------+
| Topplinje: modCut | New Import Add | [Cut] [Send til Cut] |   ...   zoom     |
+------------------------------------------------------------------------------+
| Faner (prosjekter)                                                           |
+------------------------------------------------------------------------------+
| Kontrollinje: kontekstuelle egenskaper for valgt objekt/verktøy              |
+----+---------------------------------------------------------+---------------+
| V  |                                                         | Properties    |
| A  |        pasteboard                                       | Layers        |
| P  |     +-----------+   +-----------+                       | Artboards     |
| T  |     | Artboard 1|   | Artboard 2|                       | Appearance    |
| M  |     |           |   |           |                       | Stroke/Color  |
| L  |     +-----------+   +-----------+                       | Swatches      |
| .. |                                                         | Pathfinder    |
| Fill/Stroke-boks                                             | Align/Transf. |
+----+---------------------------------------------------------+---------------+
| Statuslinje: zoom, artboard, verktøyhint, X/Y, enhet, snapping               |
+------------------------------------------------------------------------------+
```

* **Verktøylinje til venstre**: vertikal, én eller to kolonner (bryter om ved høyde < 800 px).
  Verktøy med varianter grupperes som i Illustrator: et lite hjørnemerke på ikonet, langt trykk
  eller høyreklikk åpner en flyout, Alt+klikk sykler gjennom variantene.
  Nederst: Fill/Stroke-boks med swap (Shift+X), default (D), og Color/Gradient/None (`<`, `>`, `/`).
  Deretter Draw Normal/Behind/Inside og Screen Mode.
* **Kontrollinje** (Illustrators Control bar / Properties): viser kontekstuelle felt: fill,
  stroke, vekt, opacity, X/Y/B/H, og knapper som Image Trace, Expand, Create Outlines,
  Align. Ingen knapp her skal finnes kun her; alt finnes også i meny eller panel.
* **Paneler til høyre**: dokkbare, kollapsbare, rekkefølge kan dras. Hvert panel kan åpnes fra
  `Window`-menyen og med Illustrator-tasten (F7 Layers, osv.). Tab skjuler alle paneler,
  Shift+Tab skjuler alle unntatt verktøylinjen.
* **Statuslinje**: zoomprosent (redigerbar), aktivt artboard (nedtrekk og pil), verktøyhint
  (f.eks. "Shift: begrens til 45°, Alt: fra senter"), musekoordinater i valgt enhet.

### 3.3 Visuelle regler

* Bruk eksisterende tokens fra `design/tokens.css`. Ingen nye farger uten at
  `npm run check:contrast` utvides og passerer.
* Canvasbakgrunn (pasteboard) er `--surface-2`. Artboards er hvite med `--shadow-1`.
* Markeringsfarge for objekter følger **lagets farge** som i Illustrator (hvert lag får en farge
  fra en fast palett). Ankerpunkter: fylt firkant = valgt, hul = ikke valgt.
* Alle verktøy har **ikon**, **navn** og **hurtigtast** i tooltip, i formatet
  `Pen Tool (P)`. Tooltips bruker eksisterende forsinkede tooltip-mekanisme i `renderer/ui.js`.
* Cursorer er egne SVG-cursorer per verktøy og tilstand (pen: ny path, fortsett, lukk, legg til,
  fjern anker, konverter), slik Pen allerede gjør i Cut.

### 3.4 Ikoner

* Ett ikonsett i `renderer/draw/icons/`, én SVG-fil per ikon, 24 x 24 viewBox, `currentColor`,
  samme strektykkelse og hjørneradius på alle.
* Grunnlag: **Material Symbols Outlined** (Apache-2.0), som allerede brukes i Cut. Der Material
  mangler et fagspesifikt ikon (Direct Selection, Add/Delete Anchor, Anchor Point, Shape Builder,
  Width, Pathfinder-operasjonene, Outline Stroke, Image Trace, Artboard), tegnes egne ikoner
  i samme stil. Egne ikoner kan tegnes i Draw når fase 2 er ferdig (dogfooding).
* Et byggeskript `scripts/build-icons.mjs` lager en SVG-sprite `renderer/draw/icons/sprite.svg`.
  Verktøylinjen refererer `<use href="#icon-pen">`.
* Ikonnavnene står i verktøytabellen i kapittel 6 og er bindende for `toolRegistry`.

---

## 4. Arkitektur

### 4.1 Mappestruktur

```text
renderer/draw/
  index.mjs                 # createDrawWorkspace(root, services): monterer Draw i en fane
  doc/
    schema.mjs              # typer, defaults, validering av dokument (ren JS)
    document.mjs            # DrawDocument: tre, oppslag på id, spørringer
    commands.mjs            # alle mutasjoner som Command-objekter (do/undo)
    history.mjs             # transaksjoner, coalescing, history-panel
    migrate.mjs             # versjonsmigrering av draw-JSON
    selection.mjs           # utvalg, direct-utvalg (ankre), lagring av utvalg
  geom/
    kernel.mjs              # GeometryKernel-grensesnitt (promise-basert)
    kernel-worker.mjs       # Web Worker som laster wasm eller JS-fallback
    bezier.mjs              # rene JS-hjelpere: bbox, split, nearest point, flatten
    transform.mjs           # matriser, reference point, transform each
    snapping.mjs            # smart guides, grid, punkt, pixel
  render/
    paper-adapter.mjs       # synker DrawDocument til Paper.js-items (diff per node)
    overlays.mjs            # bounding box, ankre, håndtak, smart guides, artboard-rammer
    appearance.mjs          # live effekter til renderbar geometri (via resolveScene)
    raster-render.mjs       # rendering til OffscreenCanvas for eksport og raster-effekter
  resolve/
    resolve-scene.mjs       # appearance, tekst, effekter, clipping til ren geometri
  tools/
    registry.mjs            # alle verktøy: id, navn, ikon, tast, gruppe, klasse
    base-tool.mjs           # felles livssyklus: activate, pointer*, key*, deactivate
    selection.mjs direct-selection.mjs group-selection.mjs magic-wand.mjs lasso.mjs
    pen.mjs add-anchor.mjs delete-anchor.mjs anchor-point.mjs curvature.mjs
    pencil.mjs smooth.mjs path-eraser.mjs paintbrush.mjs blob-brush.mjs
    rectangle.mjs rounded-rectangle.mjs ellipse.mjs polygon.mjs star.mjs line.mjs arc.mjs spiral.mjs
    type.mjs area-type.mjs type-on-path.mjs touch-type.mjs
    rotate.mjs reflect.mjs scale.mjs shear.mjs free-transform.mjs width.mjs
    shape-builder.mjs scissors.mjs knife.mjs eraser.mjs
    gradient.mjs eyedropper.mjs measure.mjs blend.mjs
    artboard.mjs hand.mjs zoom.mjs rotate-view.mjs
  text/
    fonts.mjs               # systemfonter via main-prosessen, lasting av fontfiler
    shaping.mjs             # HarfBuzz-shaping, linjebryting, area type
    outlines.mjs            # glyfer til paths (Create Outlines)
  trace/
    image-trace.mjs         # forhåndsinnstillinger, parametre, kall til kernel
  io/
    svg-export.mjs svg-import.mjs
    pdf-export.mjs ai-export.mjs eps-export.mjs dxf-export.mjs
    raster-export.mjs       # PNG, JPEG, WebP, TIFF, med transparens og skala
    export-dialogs.mjs      # Export As, Export for Screens, Save a Copy
    cut-bridge.mjs          # Send til Cut (kapittel 14)
  ui/
    toolbar.mjs control-bar.mjs status-bar.mjs
    panels/                 # ett modul per panel (kapittel 8)
    dialogs/                # Transform Each, Offset Path, Image Trace, Document Setup, ...
  keymap.mjs                # data-drevet tastekart for Draw (kapittel 7)
  draw.css
renderer/draw/test/          # node --test, ingen DOM der det ikke trengs
native/modcut-geom/          # Rust crate som eksporterer kernel-funksjoner via wasm-bindgen
scripts/build-wasm.mjs       # bygger native/modcut-geom til renderer/draw/geom/wasm/
```

Regel: filer under `doc/`, `geom/`, `resolve/` og `io/` skal **ikke** importere DOM-API-er eller
Paper.js, slik at de kan testes med `node --test`. Unntak må begrunnes i filens toppkommentar.

### 4.2 Lag og dataflyt

```text
  Pointer/tastatur
        |
     Tool (tools/*)  ---- leser ---->  DrawDocument (doc/*)
        |                                   ^
        | lager Command                     | apply/undo
        v                                   |
     History (transaksjon) -----------------+
        |
        | "changed(nodeIds)"
        v
  paper-adapter  ---> Paper.js scene (kun visning og hit-test)
  overlays       ---> UI-lag (ankre, bbox, guides)
  panels         ---> leser modell og utvalg, sender Commands

  Eksport / Send til Cut:
  DrawDocument -> resolveScene(artboard, options) -> ResolvedScene
               -> svg-export | pdf-export | raster-export | cut-bridge
```

* **All** mutasjon går via `Command`. Paneler og verktøy endrer aldri modellen direkte.
* En `Command` har `do(doc)`, `undo(doc)`, `label` (vises i History og Edit-menyen:
  "Undo Move") og valgfri `merge(next)` for å slå sammen f.eks. pilnudging.
* `History.transaction(label, fn)` grupperer flere kommandoer til ett angresteg.
* Under et drag oppdateres en **forhåndsvisning** uten å skrive til historikk. Ved slipp
  committes én kommando. Escape avbryter og ruller tilbake forhåndsvisningen.

### 4.3 GeometryKernel

Grensesnitt (alle funksjoner async, data er rene JSON-strukturer i mm):

```ts
interface GeometryKernel {
  boolean(op: 'unite'|'minusFront'|'intersect'|'exclude'|'divide'|'trim'|'merge'|'crop'|'outline'|'minusBack',
          paths: PathData[]): Promise<PathData[]>
  offset(paths: PathData[], distance: number, join: 'miter'|'round'|'bevel', miterLimit: number): Promise<PathData[]>
  outlineStroke(path: PathData, stroke: StrokeStyle): Promise<PathData[]>   // caps, joins, dashes, width profile, align
  simplify(path: PathData, precision: number, opts): Promise<PathData>
  smooth(path: PathData, amount: number): Promise<PathData>
  flatten(path: PathData, tolerance: number): Promise<Polyline[]>
  trace(image: ImageDataLike, opts: TraceOptions): Promise<TraceResult>
  shapeText(run: TextRun, font: FontRef): Promise<GlyphRun>                  // kan ligge i text/ i JS
  writePdf(scene: ResolvedScene[], opts: PdfOptions): Promise<Uint8Array>
  writeEps(scene: ResolvedScene, opts: EpsOptions): Promise<Uint8Array>
}
```

* `PathData` = `{ closed: boolean, segments: [{ p:[x,y], in:[dx,dy], out:[dx,dy] }] }[]` (en
  compound path er en liste av subpaths). Fill rule lagres separat (`nonzero`/`evenodd`).
* Kjernen er **ren funksjon**: samme input gir samme output. Det gjør golden tests mulig.
* `kernel.mjs` velger implementasjon: wasm hvis den lastes, ellers JS-fallback, og logger
  valget én gang. Begge implementasjonene kjører samme testsuite.
* Kall som tar over 50 ms viser en ikke-blokkerende fremdriftsindikator. Kall kan avbrytes.

### 4.4 Rendering

* `paper-adapter` holder et kart `nodeId -> paper.Item` og oppdaterer bare endrede noder.
* Normal visning: Paper.js tegner fill, stroke, gradienter, opacity og blend modes.
  Live effekter rendres via `appearance.mjs` (vektoreffekter som geometri, rastereffekter
  som cachede `paper.Raster` med oppløsningen fra Document Raster Effects Settings).
* **Outline view** (Cmd/Ctrl+Y): alle objekter som 0-bredde-linjer uten fill og effekter.
* **GPU Preview / Pixel Preview** (Alt+Cmd/Ctrl+Y): rendrer som raster på 72 ppi for
  skjermeksport.
* Overlays tegnes i eget Paper-lag i skjermpiksler (konstant størrelse uansett zoom).
* Ytelsesmål: 5 000 paths med til sammen 200 000 ankre skal panorere og zoome i minst 50 fps
  på en vanlig bærbar (M1/Ryzen 5). Utenfor skjerm skal items deaktiveres (viewport culling).

### 4.5 Integrasjon med resten av modCut

* `renderer/app.js` eier fanene. Hver fane får `tab.draw` (DrawDocument + historikk + UI-tilstand)
  i tillegg til eksisterende Cut-tilstand. Draw monteres lazy første gang Draw åpnes i fanen.
* Autosave og krasjgjenoppretting (`electron/recovery-store.mjs`) utvides til å ta med `draw`.
* Lukk/avslutt-dialogen (dirty-sjekk) må regne en fane som endret hvis Draw **eller** Cut er endret.
* Undo/redo er per modus: Cmd+Z i Draw angrer i Draw, i Cut angrer i Cut.
* Clipboard: kopiering fra Draw legger både intern JSON (`application/x-modcut-draw`) og SVG
  (`image/svg+xml`) på utklippstavlen, slik at man kan lime inn i Illustrator/Inkscape og omvendt.

---

## 5. Dokumentmodell

### 5.1 Skjema (forenklet)

```text
DrawDocument {
  version: 1
  id, name
  units: 'mm'|'cm'|'in'|'pt'|'px'|'pc'          # visningsenhet
  rasterEffectsPpi: 300                          # Document Raster Effects Settings
  colorMode: 'rgb'|'cmyk'                        # visning og lagring av verdier
  artboards: Artboard[]                          # rekkefølge = artboardnummer
  layers: Layer[]                                # toppnivå, rekkefølge = stabling (siste øverst)
  swatches: Swatch[]; swatchGroups: SwatchGroup[]
  graphicStyles: GraphicStyle[]
  assets: { [hash]: Asset }                      # innebygde bilder og fonter, sha256-nøkkel
  guides: Guide[]                                # globale hjelpelinjer
  settings: { grid, snapping, smartGuides, keyboardIncrement, cornerRadius, ... }
  cutLinks: CutLink[]                            # se kapittel 14
}

Artboard { id, name, x, y, width, height, background: 'transparent'|color, preset? }

Node (felles):
  { id, type, name?, visible, locked, opacity, blendMode, transform: [a,b,c,d,e,f],
    appearance: Appearance, clip?: boolean, templateOf?: ... , data?: {} }

Layer   : Node + { color, template: boolean, printable: boolean, dimImagesTo?: 50, children: Node[] }
Group   : Node + { children: Node[], clipGroup?: boolean, isolated?: boolean }
Path    : Node + { subpaths: PathData, fillRule }
Shape   : Node + { shape: 'rect'|'ellipse'|'polygon'|'star'|'line'|'arc'|'spiral', params } # live shape, kan ekspanderes til Path
Text    : Node + { kind: 'point'|'area'|'onPath', content: RichText, areaPath?, onPath?, paragraph }
Image   : Node + { assetId, link?: { path, mtime }, crop?, ppiEffective, reference: boolean }
Trace   : Node + { sourceImageId, options: TraceOptions, result?: cached }   # live trace, kan ekspanderes
Blend   : Node + { a: nodeId, b: nodeId, spine?, steps|distance, orientation }
CompoundPath: Node + { children: Path[] }

Appearance {
  fills:   [{ paint: Paint, opacity, blendMode, effects: Effect[] }]
  strokes: [{ paint: Paint, width, cap, join, miterLimit, align: 'center'|'inside'|'outside',
              dash?: { array:[...], offset, alignToCorners }, startArrow?, endArrow?,
              widthProfile?: [{ t, left, right }], opacity, blendMode, effects: Effect[] }]
  effects: Effect[]                              # objektnivå, i rekkefølge
}

Paint = { type:'none' } | { type:'solid', color: Color, swatchId? }
      | { type:'linear'|'radial', stops:[{ offset, color, opacity, midpoint }], origin, angle, length, aspect, highlight? }
Color = { space:'rgb'|'cmyk'|'gray'|'hsb', values:[...], spot?: name }
Effect = { id, type, enabled, params }          # se 10.7
```

### 5.2 Regler

* Id-er er stabile strenger (`nanoid`-lignende, 12 tegn) og endres aldri ved flytting.
* Koordinater lagres i **dokumentkoordinater i mm** med origo i øvre venstre hjørne av
  artboard 1 (Illustrator CC-konvensjon, y nedover). Linjaler kan vise origo per artboard.
* `transform` brukes for grupper, bilder, tekst og live shapes. Paths får transform
  "bakt inn" i ankrene ved commit (som Illustrator), slik at ankerkoordinater er absolutte.
* Live shapes (rektangel med hjørneradius, polygon, stjerne) beholder parametre til de
  ekspanderes (Object > Shape > Expand Shape) eller redigeres med Direct Selection.
* Validering (`schema.mjs`) kjøres ved lasting, ved import og i tester. Ugyldige noder
  repareres når det er trygt, ellers lastes dokumentet i "safe mode" med en rapport.

---

## 6. Verktøy

Kolonnen **Fase** viser når verktøyet skal være ferdig (se kapittel 18).
Kolonnen **Ikon** er navnet i `renderer/draw/icons/`. Hurtigtaster er Illustrator-standard.

### 6.1 Utvalg

| Verktøy | Tast | Ikon | Oppførsel | Fase |
|---|---|---|---|---|
| Selection | V | `select` | Velg objekt/gruppe, flytt, skaler og roter via bounding box. Shift legg til/fjern. Alt+dra dupliserer. Dobbeltklikk går inn i isolasjonsmodus. | 1 |
| Direct Selection | A | `direct-select` | Velg ankre, segmenter og håndtak. Live corner widgets på hjørner. | 1 |
| Group Selection | (flyout under A) | `group-select` | Hvert klikk velger ett gruppenivå opp. | 2 |
| Magic Wand | Y | `magic-wand` | Velg objekter med lik fill, stroke, vekt, opacity eller blend mode, med toleranse. | 3 |
| Lasso | Q | `lasso` | Frihånds utvalg av ankre. | 3 |
| Artboard | Shift+O | `artboard` | Lag, flytt, skaler, dupliser (Alt+dra), slett artboards. Presets i kontrollinjen. | 1 |

### 6.2 Tegning og paths

| Verktøy | Tast | Ikon | Oppførsel | Fase |
|---|---|---|---|---|
| Pen | P | `pen` | Bézier-tegning. Klikk = hjørne, dra = glatt. Alt under drag bryter håndtak. Space under drag flytter ankeret. Hover over endepunkt fortsetter, over startpunkt lukker. Gjenbruk logikk fra Cut-pennen. | 1 |
| Add Anchor Point | + | `anchor-add` | Legg til anker på segment uten å endre form. | 1 |
| Delete Anchor Point | - | `anchor-remove` | Fjern anker og tilpass naboer. | 1 |
| Anchor Point | Shift+C | `anchor-convert` | Konverter mellom hjørne og glatt, dra ut håndtak. | 1 |
| Curvature | Shift+~ | `curvature` | Tegn med punkter, kurven går gjennom dem. | 3 |
| Pencil | N | `pencil` | Frihånd, med fidelity-innstilling og automatisk forenkling. | 2 |
| Smooth | (flyout N) | `smooth` | Glatter path der man drar. | 3 |
| Path Eraser | (flyout N) | `path-eraser` | Fjerner deler av path langs drag. | 3 |
| Paintbrush | B | `brush` | Kalligrafisk/enkel pensel som lager path med stroke og width profile. | 4 |
| Blob Brush | Shift+B | `blob-brush` | Maler fylte former som slås sammen med like naboer (union). | 4 |
| Eraser | Shift+E | `eraser` | Visker ut fylte områder (boolean minus). Alt+dra = rektangulær. | 3 |
| Scissors | C | `scissors` | Klipper path i punkt. | 2 |
| Knife | (flyout Shift+E) | `knife` | Frihåndskutt gjennom fylte former. | 3 |
| Shape Builder | Shift+M | `shape-builder` | Dra over regioner for å slå sammen, Alt+dra for å fjerne. Viser regioner ved hover. | 3 |
| Width | Shift+W | `width` | Variabel strekbredde, lager `widthProfile`. | 4 |

### 6.3 Former

Alle former: dra for å tegne, Shift = proporsjonal, Alt = fra senter, Space under drag flytter,
klikk uten drag åpner dialog med eksakt størrelse. Piltaster under drag endrer antall sider/
punkter der det er relevant.

| Verktøy | Tast | Ikon | Merknad | Fase |
|---|---|---|---|---|
| Rectangle | M | `rect` | Live hjørneradius. | 1 |
| Rounded Rectangle | (flyout M) | `rect-rounded` | Piltast opp/ned endrer radius under drag. | 1 |
| Ellipse | L | `ellipse` | Live pie-vinkler. | 1 |
| Polygon | (flyout M) | `polygon` | Opp/ned endrer sider. | 1 |
| Star | (flyout M) | `star` | Opp/ned endrer punkter, Cmd/Ctrl endrer indre radius. | 1 |
| Line Segment | \ | `line` | Shift = 45°-trinn. | 1 |
| Arc | (flyout \) | `arc` | X veksler åpen/lukket, F flipper. | 2 |
| Spiral | (flyout \) | `spiral` | Opp/ned endrer segmenter. | 3 |
| Rectangular Grid / Polar Grid | (flyout \) | `grid-rect` / `grid-polar` | Nyttig for laserkutt (rutenett, skiver). | 4 |

### 6.4 Tekst

| Verktøy | Tast | Ikon | Merknad | Fase |
|---|---|---|---|---|
| Type | T | `type` | Klikk = punkttekst, dra = områdetekst. Klikk i en lukket path = områdetekst i formen. | 2 |
| Area Type | (flyout T) | `type-area` | Tekst i vilkårlig form. | 2 |
| Type on a Path | (flyout T) | `type-path` | Tekst langs path, med start/slutt/flipp-håndtak. | 2 |
| Vertical Type | (flyout T) | `type-vertical` | Lav prioritet. | 5 |
| Touch Type | Shift+T | `type-touch` | Flytt/roter/skaler enkelttegn uten å konvertere. | 5 |

### 6.5 Transformasjon, maling og navigasjon

| Verktøy | Tast | Ikon | Merknad | Fase |
|---|---|---|---|---|
| Rotate | R | `rotate` | Klikk setter referansepunkt, dra roterer. Enter/dobbeltklikk = dialog med Copy. | 1 |
| Reflect | O | `reflect` | Som over, med akse. | 1 |
| Scale | S | `scale` | Som over, med "Scale strokes & effects". | 1 |
| Shear | (flyout S) | `shear` | Vinkel og akse. | 2 |
| Free Transform | E | `free-transform` | Inkl. perspective distort og free distort. | 3 |
| Gradient | G | `gradient` | Redigerer gradient direkte på objektet (stops, vinkel, lengde). | 2 |
| Eyedropper | I | `eyedropper` | Kopierer appearance. Shift = kun farge fra punkt. Alt = påfør. | 2 |
| Measure | (flyout I) | `measure` | Avstand og vinkel i statuslinjen og Info-panel. | 2 |
| Blend | W | `blend` | Klikk to objekter for blend. Dobbeltklikk verktøy = Blend Options. | 4 |
| Live Paint Bucket | K | `paint-bucket` | Utsatt (kapittel 1.2). Tasten reserveres. | ut |
| Hand | H, Space (midlertidig) | `hand` | Panorering. | 1 |
| Zoom | Z, Cmd/Ctrl+Space (midlertidig) | `zoom` | Klikk inn, Alt+klikk ut, dra = scrubby zoom. | 1 |
| Rotate View | Shift+H | `rotate-view` | Roterer visningen, ikke dokumentet. | 4 |

---

## 7. Hurtigtaster

### 7.1 Prinsipper

* `renderer/draw/keymap.mjs` er én tabell: `{ id, keys: ['Mod+Shift+O'], when: 'draw' | 'draw.text-editing' | 'global', command }`.
  `Mod` = Cmd på macOS, Ctrl ellers. Samme tabell brukes til tooltips, menyakseleratorer og
  en hurtigtastoversikt (Help > Keyboard Shortcuts).
* Enkeltbokstav-taster er **deaktivert** mens et tekstfelt eller teksteditering har fokus.
* Midlertidige verktøy (Space = Hand, Mod = siste utvalgsverktøy, Mod+Space = Zoom,
  Alt+Mod+Space = Zoom ut) gjelder mens tasten holdes, og går tilbake ved slipp.
* En test kontrollerer at ingen to oppføringer med samme `when` deler tast.
* Senere: egendefinerte taster lagres i preferanser. Ikke i første versjon.

### 7.2 Verktøytaster

Se kapittel 6. I tillegg:

| Tast | Handling |
|---|---|
| D | Standard fill (hvit) og stroke (svart, 1 pt) |
| X | Bytt fokus mellom Fill og Stroke |
| Shift+X | Bytt farger mellom fill og stroke |
| , (komma) | Color (siste solide farge) |
| . (punktum) | Gradient (siste gradient) |
| / | None |
| Shift+D | Sykle Draw Normal / Behind / Inside |
| F | Sykle skjermmodus |
| Tab / Shift+Tab | Skjul paneler / skjul paneler unntatt verktøylinje |
| Piltaster | Flytt med Keyboard Increment (standard 1 pt = 0,3528 mm) |
| Shift+piltaster | Flytt 10 x increment |
| Alt+piltaster | Dupliser og flytt |
| Enter med verktøy valgt | Åpner verktøyets dialog (Rotate, Scale, Reflect, Shear) |

Merk: I Illustrator er komma/punktum markert som `<` og `>` på amerikansk tastatur. Vi binder
til fysisk tast (`event.code`: `Comma`, `Period`, `Slash`, `Backslash`, `Equal`, `Minus`) slik at
det virker på norsk tastatur. Samme gjelder `+` og `-` for anker-verktøyene og zoom, og `\` for Line.
Der fysisk tast mangler eller krever AltGr på norsk tastatur (f.eks. `\`), skal alternativ tast
dokumenteres i hurtigtastoversikten.

### 7.3 Kommandotaster

| Tast | Kommando | Meny |
|---|---|---|
| Mod+N / Mod+O / Mod+S / Mod+Shift+S | New / Open / Save / Save As (felles med Cut) | File |
| Mod+Alt+S | Save a Copy | File |
| Mod+Shift+P | Place (bilde/vektor) | File |
| Mod+Alt+P | Document Setup | File |
| Mod+Alt+E | Export for Screens | File |
| Mod+Shift+Alt+S | Export As (alle formater) | File |
| Mod+Z / Mod+Shift+Z | Undo / Redo | Edit |
| Mod+X / Mod+C / Mod+V | Cut / Copy / Paste | Edit |
| Mod+F / Mod+B | Paste in Front / Paste in Back | Edit |
| Mod+Shift+V | Paste in Place | Edit |
| Mod+Shift+Alt+V | Paste on All Artboards | Edit |
| Mod+K | Preferences | Edit (Win) / modCut (mac) |
| Mod+D | Transform Again | Object |
| Mod+Shift+Alt+D | Transform Each | Object |
| Mod+Shift+M | Move (dialog) | Object |
| Mod+] / Mod+[ | Bring Forward / Send Backward | Object > Arrange |
| Mod+Shift+] / Mod+Shift+[ | Bring to Front / Send to Back | Object > Arrange |
| Mod+G / Mod+Shift+G | Group / Ungroup | Object |
| Mod+2 / Mod+Alt+2 | Lock / Unlock All | Object |
| Mod+3 / Mod+Alt+3 | Hide / Show All | Object |
| Mod+J | Join | Object > Path |
| Mod+Alt+J | Average | Object > Path |
| Mod+8 / Mod+Shift+Alt+8 | Make / Release Compound Path | Object |
| Mod+7 / Mod+Alt+7 | Make / Release Clipping Mask | Object |
| Mod+Alt+B / Mod+Shift+Alt+B | Make / Release Blend | Object > Blend |
| Mod+Shift+O | Create Outlines (tekst) | Type |
| Mod+T / Mod+Alt+T | Character / Paragraph panel | Window |
| Mod+A / Mod+Shift+A | Select All / Deselect | Select |
| Mod+Alt+A | Select All on Active Artboard | Select |
| Mod+6 | Select Again | Select |
| Mod+Y | Outline / Preview | View |
| Mod+Alt+Y | Pixel Preview | View |
| Mod++ / Mod+- | Zoom in / ut | View |
| Mod+0 / Mod+Alt+0 | Fit Artboard / Fit All | View |
| Mod+1 | 100 % | View |
| Mod+R | Rulers | View |
| Mod+; / Mod+Alt+; | Vis / lås guides | View |
| Mod+5 / Mod+Alt+5 | Make / Release Guides | View |
| Mod+U | Smart Guides | View |
| Mod+' / Mod+Shift+' | Grid / Snap to Grid | View |
| Mod+Alt+' | Snap to Point | View |
| Mod+H | Hide Edges | View |
| Mod+Shift+H | Hide Artboards | View |
| Mod+Shift+B | Bounding Box | View |
| Mod+Shift+D | Transparency Grid | View |
| F7 | Layers | Window |
| F6 | Color | Window |
| Mod+F10 | Stroke | Window |
| Mod+F9 | Gradient | Window |
| Mod+Shift+F9 | Pathfinder | Window |
| Shift+F6 | Appearance | Window |
| Shift+F7 | Align | Window |
| Shift+F8 | Transform | Window |
| F8 | Info | Window |

Image Trace, Outline Stroke, Offset Path og Expand har ingen standardtast i Illustrator og får
ingen i Draw. De nås fra meny, kontrollinje og kommandosøk.

### 7.4 Konflikter med dagens Cut-modus

| Tast | Cut i dag | Draw (Illustrator) | Løsning |
|---|---|---|---|
| Mod+Y | Redo | Outline view | Gjelder per modus. Draw: Redo = Mod+Shift+Z. Cut beholder Mod+Y og får i tillegg Mod+Shift+Z. |
| Mod+U | Move up | Smart Guides | Per modus. |
| Mod+Alt+N | Move down | (ingen) | Uendret i Cut. Draw bruker Mod+[ og Mod+]. |
| C | Ellipse | Scissors | Per modus. Vurder å flytte Cut til L for konsistens (eget tiltak, ikke del av Draw). |
| L | Line | Ellipse | Per modus. |
| Mod+0 | Fit to bed | Fit artboard | Samme intensjon, ingen konflikt. |
| Mod+D | Duplicate | Transform Again | Per modus. |
| Alt+I | Advanced Editing (Cut) | (ingen) | Uendret. |

Electron-menyakseleratorer er globale for vinduet. Derfor må menyen bygges på nytt ved
modusbytte (kapittel 9), ellers stjeler Cut-akseleratorer taster i Draw.

---

## 8. Paneler

Hvert panel er en modul i `ui/panels/` med `mount(el, ctx)`, `update(changes)`, `unmount()`.
Paneler leser modell og utvalg, og skriver kun via Commands.

| Panel | Tast | Innhold | Fase |
|---|---|---|---|
| Properties | (alltid) | Kontekstuelt: Transform, Appearance-sammendrag, Quick Actions (Image Trace, Expand, Outline Stroke, Create Outlines, Send til Cut). | 1 |
| Layers | F7 | Tre med lag, underlag og objekter. Øye (synlighet), lås, valgsirkel, dra for å flytte, Alt+klikk øye = solo. Dobbeltklikk lag = Layer Options (navn, farge, Template, Lock, Show, Print, Preview, Dim Images to %). Lag nytt lag, nytt underlag, slett, Collect in New Layer, Release to Layers, Locate Object. | 1 |
| Artboards | (i Window) | Liste, rekkefølge, navn, Rearrange All, Fit to Artwork Bounds, Fit to Selected Art, Duplicate, Delete, og **Send til Cut** per artboard. | 1 |
| Color | F6 | RGB, HSB, CMYK, Grayscale, Hex. Fargespekter. | 1 |
| Swatches | (Window) | Swatches, grupper, globale swatches (endring oppdaterer alle bruk), import av `.ase`. Egne laserswatches: Cut, Engrave, Score i farger som matcher Cut-lagene. | 2 |
| Stroke | Mod+F10 | Weight, Cap, Corner, Limit, Align Stroke, Dashed Line (6 felt, aligning), Arrowheads, Profile. | 1 |
| Gradient | Mod+F9 | Type, vinkel, aspect, stops, midpoints, opacity per stop, reverse. | 2 |
| Transparency | Shift+Mod+F10 | Blend mode, opacity, Make Mask (opacity mask, fase 4). | 2 |
| Appearance | Shift+F6 | Stakk av fills, strokes og effekter. Legg til ny fill/stroke, dra for rekkefølge, dupliser, slett, synlighet per element, klikk effekt for å redigere. | 3 |
| Graphic Styles | Shift+F5 | Lagre og påføre appearance-stakker. | 4 |
| Pathfinder | Mod+Shift+F9 | Shape Modes (Unite, Minus Front, Intersect, Exclude) og Pathfinders (Divide, Trim, Merge, Crop, Outline, Minus Back). Alt+klikk lager compound shape (fase 4). | 2 |
| Align | Shift+F7 | Align/Distribute objekter og spacing, Align To: Selection, Key Object, Artboard. | 1 |
| Transform | Shift+F8 | X, Y, B, H, vinkel, shear, referansepunkt (9 punkter), lenkede proporsjoner, Scale Strokes & Effects, Scale Corners. | 1 |
| Character | Mod+T | Font, stil, størrelse, leading, kerning (Auto/Optical/Metrics), tracking, baseline shift, versaler. | 2 |
| Paragraph | Mod+Alt+T | Justering, innrykk, avstand, orddeling (av/på). | 2 |
| Glyphs | (Window) | Velg glyfer fra font. | 5 |
| Image Trace | (Window) | Se kapittel 11. | 3 |
| Links | (Window) | Lenkede/innebygde bilder, relink, embed, oppdater ved endret fil. | 3 |
| Info | F8 | Koordinater, størrelse, avstand, farge under markør. | 2 |
| History | (Window) | Liste over angresteg, klikk for å gå tilbake. | 2 |
| Navigator | (Window) | Miniatyr med visningsramme. | 4 |
| Document Info | (Window) | Fonter, bilder, antall objekter, ankre. Viktig før Send til Cut. | 3 |

Kommandosøk: Mod+Shift+K (ingen Illustrator-konflikt i Draw) åpner et søkefelt som finner alle
kommandoer i menyer og paneler. Fase 2.

---

## 9. Menyer i Draw-modus

`electron/main.mjs` får `buildMenu(mode)`. Renderer sender `window.modcut.setWorkspace('draw')`
via preload. Menyen i Draw:

* **modCut** (mac): som i dag.
* **File**: New, Import, Add (felles), Place, Save document, Save document as, Save a Copy,
  Document Setup, Export As, Export for Screens, Export Selection, Package (samler lenkede
  filer, fase 5), Close Tab.
* **Edit**: Undo, Redo, Cut, Copy, Paste, Paste in Front/Back/Place/All Artboards, Clear,
  Find and Replace (tekst, fase 4), Spelling (ut), Edit Colors (Recolor, Invert, Adjust,
  Convert to Grayscale), Keyboard Shortcuts, Preferences.
* **Object**: Transform (Again, Move, Rotate, Reflect, Scale, Shear, Transform Each, Reset
  Bounding Box), Arrange, Align, Group, Ungroup, Lock, Unlock All, Hide, Show All, Expand,
  Expand Appearance, Flatten Transparency (fase 4), Rasterize, Path (Join, Average, Outline
  Stroke, Offset Path, Reverse Path Direction, Simplify, Add Anchor Points, Remove Anchor Points,
  Divide Objects Below, Split Into Grid, Clean Up), Shape (Convert to Shape, Expand Shape),
  Blend, Clipping Mask, Compound Path, Artboards (Convert to Artboards, Rearrange All,
  Fit to Artwork Bounds, Fit to Selected Art), Image Trace (Make, Make and Expand, Release, Expand).
* **Type**: Font, Size, Glyphs, Area Type Options, Type on a Path, Create Outlines,
  Change Case, Show Hidden Characters.
* **Select**: All, All on Active Artboard, Deselect, Reselect, Inverse, Next/Previous Object
  Above/Below, Same (Appearance, Fill & Stroke, Fill Color, Opacity, Stroke Color, Stroke Weight,
  Graphic Style, Shape, Text), Object (All on Same Layers, Direction Handles, Stray Points, Open
  Paths, Clipping Masks, Text Objects, Raster Images), Save Selection, Edit Selection.
* **Effect**: Apply Last Effect (Mod+Shift+E), Last Effect (Mod+Shift+Alt+E), Document Raster
  Effects Settings, Distort & Transform, Path (Offset Path, Outline Object, Outline Stroke),
  Pathfinder, Rasterize, Stylize (Drop Shadow, Feather, Inner Glow, Outer Glow, Round Corners,
  Scribble), Blur (Gaussian Blur), Warp. Se 10.7.
* **View**: Outline/Preview, Pixel Preview, Zoom, Fit Artboard, Fit All, Actual Size, Hide/Show
  Edges, Artboards, Bounding Box, Transparency Grid, Rulers, Guides, Smart Guides, Grid, Snap
  to Grid/Point/Pixel, New View (fase 5), **Cut workspace**.
* **Window**: alle paneler fra kapittel 8, Workspace (Reset, lagre eget oppsett i fase 4).
* **Help**: som i dag, pluss Keyboard Shortcuts og lenke til denne dokumentasjonen.

Menyvalg som avhenger av utvalg (f.eks. Create Outlines) skal være deaktivert når de ikke kan
brukes. Renderer sender `menuState` (en liste med aktiverte kommando-id-er) til main ved hver
utvalgsendring, maks én gang per animasjonsramme.

---

## 10. Funksjonsspesifikasjoner

Hver underseksjon har **akseptkriterier** (AK). En oppgave er ikke ferdig før AK er testet.

### 10.1 Artboards

* Nytt dokument (Draw > New eller første åpning i en fane): dialog med presets: A4, A3, A5,
  Letter, Tabloid, 1080 x 1080 px, 1920 x 1080 px, **Bed: <maskinnavn>** (bruker aktiv
  maskins arbeidsflate fra Cut), og egendefinert. Antall artboards, rekkefølge (grid by row/
  column, arrange by row/column), spacing.
* Artboard-verktøy (Shift+O): dra for nytt, dra kanter for størrelse, Alt+dra dupliserer med
  innhold hvis "Move/Copy Artwork with Artboard" er på (standard på), Delete sletter.
* Artboard-navn vises over hvert artboard. Aktivt artboard har tykkere ramme.
* Maks 1 000 artboards (som Illustrator). Maks størrelse 5 779 x 5 779 mm (227 x 227 in).
* AK: 3 artboards kan lages, omdøpes, flyttes med innhold, omorganiseres og angres. Eksport
  av "artboard 2" gir nøyaktig dette artboardets mål.

### 10.2 Utvalg og transformasjon

* Bounding box med 8 håndtak, rotasjon utenfor hjørner. Shift = proporsjonal, Alt = fra senter
  (samme regler som allerede er implementert i Cut, gjenbruk og test på nytt).
* Smart guides: justering mot ankre, senter, kanter og artboard, med etiketter
  ("anchor", "center", "intersect", "path") og målbobler (dX, dY, B, H, vinkel).
* Transform Again (Mod+D) husker siste transformasjon inkl. kopi.
* Transform Each: skala, flytt, roter, refleks, tilfeldig, per objekt rundt eget referansepunkt.
* Align To Key Object: klikk et valgt objekt én gang til for å gjøre det til key object.
* Snapping: til grid, til punkt (Mod+Alt+'), til pixel (for skjermdesign), til guides.
* Isolasjonsmodus for grupper og lag (dobbeltklikk, Escape går ut), med brødsmuler øverst.
* AK: Rotasjon med Shift går i 45° steg, Mod+D gjentar, Transform Each med 10 objekter gir
  10 ulike referansepunkter. Smart guides snapper innen 4 skjermpiksler.

### 10.3 Paths og redigering

* Join (Mod+J): to valgte endepunkter, eller to åpne paths (nærmeste endepunkter). Hvis
  endepunktene ligger oppå hverandre, slås de sammen til ett anker.
* Average: horisontalt, vertikalt, begge.
* Simplify: slider med automatisk forhåndsvisning, "Convert to Straight Lines", hjørnevinkel-
  terskel, viser antall ankre før/etter.
* Smooth, Reverse Path Direction, Add Anchor Points (halverer segmenter), Remove Anchor Points.
* Offset Path: avstand, joins (miter, round, bevel), miter limit. Negativ avstand tillatt.
* Outline Stroke: se 10.6.
* Clean Up: fjern stray points, umalte objekter, tomme tekstbokser.
* Split Into Grid: rader, kolonner, gutter, legg til guides.
* Compound paths og fill rule. Make Compound Path skal gi hull der to paths overlapper.
* Clipping mask: øverste objekt i utvalg blir klippebane. Draw Inside (Shift+D) lager
  klippegruppe automatisk.
* AK: Join av to åpne paths gir én path med korrekt retning. Offset Path på en stjerne med
  -2 mm og round joins gir gyldig, lukket path uten selvkryssing (verifisert av kernel-test).

### 10.4 Pathfinder og Shape Builder

* Shape Modes: Unite, Minus Front, Intersect, Exclude. Resultat beholder appearance fra
  øverste (Unite) eller bakerste (Minus Front) objekt, som Illustrator.
* Pathfinders: Divide, Trim, Merge, Crop, Outline, Minus Back.
* Presisjon: Pathfinder Options med Precision (standard 0,028 pt), Remove Redundant Points,
  Divide and Outline Will Remove Unpainted Artwork.
* Shape Builder: beregner alle regioner med `boolean('divide')` ved aktivering (cachet),
  hover markerer region, dra slår sammen, Alt+dra fjerner. Gap detection kan utsettes.
* Alle operasjoner må være **eksakte kurve-booleans** (ikke polygonisert) når kernel støtter
  det. Fallback (polygon + kurvetilpasning) skal ha avvik under 0,01 mm og merkes i Document Info.
* AK: Golden test-sett i `renderer/draw/test/fixtures/pathfinder/` med minst 30 tilfeller
  (sirkler, stjerner, tangerende kanter, felles kanter, hull, selvkryssende input, tekstkonturer).
  Resultatet sammenlignes med referanse-SVG via areal (avvik < 0,1 %) og Hausdorff-avstand (< 0,01 mm).

### 10.5 Fill, stroke og farger

* Fill: none, solid, linear og radial gradient. Pattern er utsatt.
* Stroke: vekt (0 til 1 000 pt), cap (butt, round, projecting), corner (miter, round, bevel),
  miter limit (1 til 500), align (center, inside, outside; inside/outside kun på lukkede paths),
  dash (opptil 3 dash/gap-par, "align dashes to corners and path ends"), pilspisser (et
  sett på ca. 20 standardtyper, skala, plassering), width profiles (fase 4).
* Gradient på stroke: within, along, across (fase 4, standard "within").
* Swatches: global swatch endrer alle objekter som bruker den. Spot-farger lagres med navn.
* Opacity og blend modes per objekt, per fill og per stroke (alle 16 blend modes som Canvas
  2D støtter).
* AK: Endring av en global swatch oppdaterer 100 objekter i én angrbar operasjon.

### 10.6 Outline Stroke og Expand

* Outline Stroke gjør stroke om til fylt path med eksakt geometri for vekt, cap, join,
  miter limit, align, dash og width profile. Resultat: en gruppe med fill (hvis fill fantes) og
  stroke-konturen som compound path, som i Illustrator.
* Expand: valg av Object, Fill, Stroke. Expand Appearance gjør hele appearance-stakken om til
  vanlige objekter (effekter blir geometri eller rasterbilder).
* Expand Shape gjør live shapes til vanlige paths.
* AK: Outline Stroke av en 2 mm linje med round caps gir stadion-form med areal innenfor 0,1 %
  av analytisk verdi. Dashed stroke gir ett lukket element per dash. Selvkryssende stroke gir
  sammenslått kontur uten hull-artefakter (nonzero).

### 10.7 Effekter (live, ikke-destruktive)

Effekter ligger i `appearance.effects` og kan redigeres, slås av og omorganiseres i Appearance.

| Gruppe | Effekter | Type | Fase |
|---|---|---|---|
| Path | Offset Path, Outline Object, Outline Stroke | vektor | 3 |
| Pathfinder | Add, Intersect, Exclude, Subtract, Divide (som live effekt på gruppe) | vektor | 4 |
| Distort & Transform | Transform (med kopier), Free Distort, Pucker & Bloat, Roughen, Twist, Zig Zag | vektor | 3 |
| Stylize | Round Corners | vektor | 3 |
| Stylize | Drop Shadow, Inner Glow, Outer Glow, Feather | raster | 3 |
| Stylize | Scribble | vektor | 5 |
| Blur | Gaussian Blur | raster | 3 |
| Warp | Arc, Arch, Bulge, Flag, Wave, Fish, Rise, Fisheye, Inflate, Squeeze, Twist | vektor | 4 |
| Rasterize | Rasterize (live) | raster | 4 |

* Rastereffekter rendres med `rasterEffectsPpi` (standard 300) og caches per node, nøkkel
  basert på geometri, appearance og ppi.
* Effect > Apply Last Effect og Last Effect (dialog) fungerer.
* Alle effektdialoger har Preview-avkrysning med live forhåndsvisning.
* AK: Drop Shadow + Round Corners + Offset Path på samme objekt kan redigeres og omorganiseres,
  lagres, lastes på nytt og eksporteres til SVG og PNG identisk med skjermvisning (pikseldiff
  under 0,5 % ved 2x).

### 10.8 Tekst

* Fonter: main-prosessen lister systemfonter (filbaner, familie, stil) og leser fontfiler på
  forespørsel. Renderer bruker `FontFace` for visning og HarfBuzz for shaping og glyfkonturer.
  Fonter som brukes i dokumentet kan bygges inn (`assets`) hvis lisensen tillater det
  (`fsType`-sjekk), ellers vises advarsel ved åpning på maskin uten fonten.
* Punkttekst, områdetekst med automatisk bryting, tekst på path.
* Character: font, stil, størrelse, leading, kerning (metrics, optical = ut, manuell),
  tracking, horisontal/vertikal skalering, baseline shift, All Caps, Small Caps, understrek.
* Paragraph: venstre, senter, høyre, justert (med siste linje), innrykk, avstand før/etter.
* OpenType-features: ligaturer og kontekstuelle alternativer (på som standard).
* Create Outlines (Mod+Shift+O): én compound path per tegn, gruppert per linje/objekt.
* Manglende font: tekst vises med erstatningsfont og rosa markering, som Illustrator.
* AK: Tekst med æ, ø, å, ligatur "fi" og kerning "AV" i Arial og en OTF-font konverteres til
  outlines med samme glyfposisjoner som på skjerm (avvik < 0,01 mm). Tekst i en sirkel bryter
  korrekt.

### 10.9 Lag

* Lag og underlag i vilkårlig dybde. Objekter vises i lagtreet.
* Layer Options: navn, farge, Template, Show, Preview, Lock, Print, Dim Images to (%).
* **Template-lag** (standard for referansebilder, se 11.1): låst, dimmet 50 %, ikke med i
  eksport og ikke med i Send til Cut.
* "Paste Remembers Layers" (Layers-meny).
* Merge Selected, Flatten Artwork, Collect in New Layer, Release to Layers (Sequence/Build).
* AK: Lagtre med 500 objekter scroller jevnt (virtualisert liste). Dra objekt mellom lag er
  én angrbar kommando.

### 10.10 Linjaler, guides og grid

* Linjaler (Mod+R) i visningsenhet, artboard- eller globale linjaler.
* Dra guides fra linjaler, Make Guides fra paths (Mod+5), lås, slett.
* Grid med inndeling, "grid in back", snap.
* AK: Guide dratt fra linjal snapper til hele enheter når Shift holdes.

---

## 11. Bitmap som referanse og Image Trace

### 11.1 Plassere og bruke bitmap som referanse

* Bilder kan dras inn fra Finder/Explorer, limes inn, eller plasseres med File > Place
  (Mod+Shift+P). Støttede format: PNG, JPEG, WebP, AVIF, GIF, BMP, TIFF (gjenbruk
  `renderer/tiffimport.js` og raster-dekodingen fra Cut). PDF/SVG/AI plasseres som vektor
  (kapittel 12).
* Place-dialogen har avkrysning **Template**. Når den er på (eller når brukeren slipper et
  bilde med Alt), opprettes et nytt template-lag over aktivt lag med bildet: låst, dimmet
  50 %, `printable: false`, `reference: true`.
* Høyreklikk på bilde: Bruk som referanse (flytt til template-lag), Juster opacity, Lås,
  Image Trace, Crop Image, Embed/Unlink, Show in Folder.
* Link vs. embed: standard er **embed** (dokumentet skal være portabelt som `.modcut` i dag).
  Link er valgfritt og vises i Links-panelet med status (OK, endret, mangler).
* Crop Image: direkte beskjæring med håndtak, ikke-destruktiv (lagres som `crop`).
* Referansebilder rendres alltid under vektorobjekter i samme lag med mindre brukeren flytter dem.
* AK: Et 24 MP JPEG kan dras inn, settes som template, og man kan tegne over med Pen i 60 fps.
  Template-laget kommer ikke med i SVG/PDF/PNG-eksport eller Send til Cut.

### 11.2 Image Trace

Image Trace-panelet og kontrollinjeknappen "Image Trace" med forhåndsinnstillinger.

* **Presets** (som Illustrator): Default, High Fidelity Photo, Low Fidelity Photo, 3 Colors,
  6 Colors, 16 Colors, Shades of Gray, Black and White Logo, Sketched Art, Silhouettes,
  Line Art, Technical Drawing. Pluss modCut-spesifikke: **Laser: Cut outline** (svart/hvitt,
  kun ytterkonturer, minimum detaljstørrelse 0,5 mm) og **Laser: Engrave fill** (svart/hvitt,
  hull bevart).
* **Parametre**: View (Tracing Result, Outlines, Outlines with Source, Source Image), Mode
  (Color, Grayscale, Black and White), Palette (Limited, Full Tone, Automatic, Document Library),
  Colors/Grays (2 til 256), Threshold (0 til 255), Paths (fidelity), Corners, Noise (px), Method
  (Abutting, Overlapping), Fills/Strokes, Stroke max width, Snap Curves to Lines, Ignore White.
* **Live trace**: resultatet er et `Trace`-objekt knyttet til kildebildet. Endring av parametre
  re-tracer i worker (debounce 250 ms, avbrytbart). Knapper: Expand, Release, Make and Expand.
* Statistikk i panelet: antall paths, ankre, farger.
* Forhåndsbehandling før trace: skalering (maks 4 MP til trace, konfigurerbart), valgfri
  median-filter for støy.
* AK: Black and White Logo på en 2 MP logo i PNG gir lukkede, glatte paths på under 2 s.
  Expand gir vanlige paths gruppert per farge. Ignore White fjerner hvit bakgrunn.

---

## 12. Import

Gjenbruk eksisterende importkode der det går, men importer til **Draw-modellen**, ikke Cut:

| Format | Kilde | Draw-oppførsel |
|---|---|---|
| SVG/SVGZ | `renderer/svgimport.js` (normalisering) + ny `io/svg-import.mjs` | Full struktur: grupper, lag (fra `<g inkscape:groupmode="layer">` og Illustrators `<g id="Layer_1">`), fill/stroke, gradienter, clipPath, tekst som tekst når fonten finnes, ellers outlines. |
| PDF / PDF-kompatibel AI | `renderer/pdf-vector.mjs`, `pdfimport.js` | Hver side kan bli et artboard. Vektorer med fill/stroke, tekst som outlines i første versjon, bilder som Image. Valg: side(r), "importer som artboards". |
| EPS | kernel `eps`-crate (hvis wasm) | Fase 5. |
| DXF | `renderer/dxfimport.js` | Til paths med stroke, enhet fra `$INSUNITS`. |
| HPGL/PLT | `renderer/hpglimport.js` | Til paths. |
| Bitmap | se 11.1 | Image-node. |
| `.ai` som ikke er PDF-kompatibel | | Samme forklaring som Cut gir i dag. |

Import fra Cut: "Rediger i Draw" (høyreklikk i Cut) kopierer valgte Cut-objekter som nye
Draw-objekter på et nytt artboard i bed-størrelse. Fase 3.

---

## 13. Eksport

### 13.1 Felles

* All eksport går via `resolveScene(scope, options)` der `scope` er `{ artboards: [ids] }`,
  `{ selection }` eller `{ all }`. Template-lag, skjulte lag og lag med `printable: false`
  utelates.
* Eksport kjører i worker der det er mulig. Store eksporter viser fremdrift og kan avbrytes.
* Filnavn per artboard: `<dokument>-<artboardnavn>.<ext>`, med valg om suffiks.
* Alle eksportdialoger husker siste innstillinger per dokument.

### 13.2 Vektorformater

| Format | Implementasjon | Innstillinger | Merknader | Fase |
|---|---|---|---|---|
| **SVG** | `io/svg-export.mjs` (egen skriver i JS) | Styling: presentation attributes / inline style / internal CSS. Font: SVG text / convert to outlines. Bilder: embed / link. Desimaler (1 til 7, standard 3). Minify. Responsive (uten width/height). Enhet: mm eller px. | Valid SVG 1.1 med SVG 2-features kun når nødvendig. Live effekter: vektor som geometri, raster som innebygd `<image>` eller SVG-filter (valg). | 2 |
| **PDF** | kernel `writePdf` (VectorCraft `pdf`-crate) eller `pdf-lib` (MIT) | Ett artboard per side eller alle i én side, PDF/X-4 (fase 5), bleed, beskjæringsmerker (fase 5), komprimering, bilder nedsamplet til ppi (av/på), fonter innebygd som subset eller outlines. | Ekte vektor, korrekte gradienter (shading), transparens bevart, side-størrelse = artboard. | 2 |
| **AI** | Samme som PDF + AI-kompatibilitetsdata | Samme som PDF. | Skrives som **PDF-kompatibel .ai** (PDF med `.ai`-filendelse og AI-metadata der kernel støtter det). Illustrator åpner den, men live effekter og lag kan bli flatet. Dette skal stå tydelig i dialogen. | 3 |
| **EPS** | kernel `writeEps` eller egen PostScript Level 2/3-skriver | Forhåndsvisning (TIFF/ingen), transparens flattening-kvalitet. | Transparens og blur må flates til raster i EPS. | 4 |
| **DXF** | `io/dxf-export.mjs` | R12 (LINE/LWPOLYLINE) eller R2000 (SPLINE), enhet mm, flatten-toleranse (standard 0,01 mm), tekst som outlines, lag fra Draw-lag. | Viktig for CAD og andre laserprogrammer. | 3 |
| **PLT/HPGL** | `io/plt-export.mjs` | 40 enheter/mm. | For skjæreplotter/vinylkutter. | 5 |
| **`.modcut-draw` / `.modcut`** | se kapittel 15 | | Native, taper ingenting. | 1 |

### 13.3 Skjermformater (Export for Screens / Export As)

* **Formater**: PNG, PNG-8, JPEG (kvalitet 0 til 100), WebP (tapsfri/tapsbasert, transparens),
  AVIF (fase 5), TIFF (fase 4), GIF (fase 5), SVG og PDF (samme som 13.2).
* **Skalering**: 0,5x, 1x, 2x, 3x, 4x, egendefinert faktor, eller bredde/høyde i px, eller ppi
  (72, 150, 300, egendefinert). 1x = 72 ppi (Illustrator-kompatibelt: 1 pt = 1 px).
* **Transparens**: PNG, PNG-8, WebP og TIFF støtter **transparent bakgrunn** (standard når
  artboardet har `background: 'transparent'`). Valg: Transparent, White, Black, Artboard color.
  JPEG har alltid matte (standard hvit).
* **Antialiasing**: None, Art Optimized (Supersampling), Type Optimized (Hinted). Kantutjevning
  for piksel-perfekte ikoner ved "None" og Pixel Preview.
* **Export for Screens** (Mod+Alt+E): to faner, Artboards og Assets. Velg artboards (alle,
  område "1-3, 5", eller avkrysning). Flere formater og skaler i samme operasjon, med suffiks
  (`@2x`). Assets: dra objekter til Asset Export-panelet (fase 4).
* **Fargeprofil**: sRGB innebygd i PNG/JPEG/WebP.
* **Metadata**: valgfri tittel og copyright i PNG/JPEG.
* Raster-rendring bruker samme renderer som skjermen (`render/raster-render.mjs`) på
  `OffscreenCanvas` i worker. Maks 32 768 px per side og 268 MP totalt, med tydelig feilmelding.
* AK: Eksport av et artboard med transparent bakgrunn til PNG 2x gir korrekt alfakanal
  (kantpiksler med delvis alfa, ingen hvit halo), og pikseldiff mot referanse under 0,5 %.

---

## 14. Send til Cut

### 14.1 Brukerflyt

1. Brukeren velger et artboard: klikk på artboard-navnet, i Artboards-panelet, eller med
   Artboard-verktøyet. Flere artboards kan velges.
2. Knappen **Send til Cut** (CTA i topplinjen, også i Artboards-panelet, Properties, høyreklikk
   på artboard, og File-menyen) åpner en kort dialog:
   * **Mål**: Ny Cut-fane (standard) / Erstatt design i denne fanens Cut / Legg til i Cut.
   * **Plassering**: Artboardets øvre venstre hjørne til bed-origo (standard), sentrert på
     bed, eller behold posisjon fra forrige sending.
   * **Strokes**: "Bruk senterlinje" (standard, riktig for Cut og Score) eller "Outline Stroke"
     (for gravering av strekens areal).
   * **Tekst**: alltid konvertert til outlines (info, ikke valg).
   * **Effekter**: vektoreffekter ekspanderes. Rastereffekter: "Rasteriser til gravering" eller
     "Utelat" (standard: utelat, med advarsel).
   * **Bilder**: ikke-referansebilder sendes som raster-gravering. Template/referanse utelates.
   * **Validering** (vises i dialogen før sending): åpne paths med fill, ekstremt små segmenter
     (< 0,05 mm), duplikate overlappende linjer, objekter utenfor artboard (blir klippet eller
     tatt med, valg), objekter utenfor bed, manglende fonter, antall noder.
3. Etter sending byttes visning til Cut, med det nye designet valgt. En toast viser
   "Artboard 1 sendt til Cut. Angre i Cut med Mod+Z."

### 14.2 Teknisk flyt (`io/cut-bridge.mjs`)

```text
artboard -> resolveScene({ artboards:[id] }, { forCut: true, strokes, rasterEffects })
         -> klipp til artboard (valgfritt)
         -> transformer til artboard-lokale mm-koordinater
         -> toCutSvg(scene): <svg width="Wmm" height="Hmm" viewBox="0 0 W H">,
              kun <path>, <g>, <image>, fill og stroke som hex-farger,
              stroke-width i mm, ingen effekter, ingen tekst, ingen clipPath
         -> bed.loadSVG(svgString, { placement, merge })   # eksisterende API i renderer/bed.js
            bed.loadImage(...) for bilder
```

* Fargene i Draw blir Cut-lag akkurat som ved SVG-import i dag (layer by color). Brukeren kan
  derfor bruke laserswatchene (10.5: Cut, Engrave, Score) for å styre operasjoner direkte.
* `bed.js` trenger et smalt tillegg: `loadSVG` må kunne ta imot en streng uten filnavn og
  returnere id-er på innlagte items, slik at sendingen kan angres som ett steg. Dette er den
  **eneste** endringen i `bed.js` som Draw-arbeidet tillates å gjøre.
* `cutLinks` i Draw-dokumentet lagrer `{ artboardId, cutTabId, sentAt, sourceHash }`. Hvis
  artboardet endres etter sending, viser Artboards-panelet "Endret siden sending" og knappen
  heter **Oppdater i Cut**. Oppdatering erstatter tidligere sendte items i Cut, men beholder
  Cut-lagenes innstillinger (power, speed).
* AK: Et artboard med tekst, en Offset Path-effekt, en outline-stroke og et bilde sendes til
  Cut, simuleres og gir G-code uten feil. Mål i Cut stemmer med Draw til 0,01 mm. Angre i Cut
  fjerner hele sendingen i ett steg.

---

## 15. Filformat og migrering

* `.modcut` går fra `version: 3` til `version: 4`. Ny toppnøkkel `draw` med DrawDocument
  (kapittel 5). Eksisterende `design` (Cut) er uendret.
* Store binærdata (bilder, fonter) lagres i `draw.assets` som base64 med sha256-nøkkel og
  deles hvis samme bilde brukes flere ganger. Hvis filen blir over 50 MB, foreslå
  "Link i stedet for embed" (fase 4).
* Versjon 3-filer åpnes som før, med tomt Draw-dokument. Version 4-filer åpnet i eldre modCut:
  den eldre appen ignorerer `draw` og viser en advarsel om at tegnedata ikke kan redigeres
  (legg inn sjekken i `app.js` nå, i fase 0, slik at den finnes i neste release).
* `migrate.mjs` har en migreringsfunksjon per Draw-versjon og tester for hver.
* Autosave/recovery serialiserer `draw` inkrementelt (maks hvert 2. sekund ved endring).
* Eget eksportformat **`.modcut-draw`** er ikke nødvendig; `.modcut` holder. Alle vanlige
  formater dekkes av eksport.

---

## 16. Gjenbruk av åpen kildekode og lisenser

### 16.1 Kandidater

| Prosjekt | Lisens | Bruk | Hvordan |
|---|---|---|---|
| **VectorCraft** (storytold/vectorcraft, Rust) | MIT eller Apache-2.0 | Geometrikjerne: `pathops` (eksakte booleans, offset), `trace`, `pdf`, `svg`, `eps`, `effects`, `text`. Oppførsel og sjekklister for Illustrator-paritet. MCP-server som referanse. | Kompiler utvalgte crates til wasm via egen crate `native/modcut-geom` med `wasm-bindgen`. Pin til eksakt commit. Behold `LICENSE-MIT`, `LICENSE-APACHE` og NOTICE. **Ikke** bruk navnet, logo eller varemerker til ArtCraft/VectorCraft i UI. Sjekk `ASSETS.md` før assets kopieres. UI-crate (`ui-egui`) brukes ikke. |
| **Paper.js** | MIT | Rendering, hit-test, enkle path-operasjoner | Finnes allerede (`paper@0.12`). |
| **Clipper2** (JS/WASM-port) | Boost Software License 1.0 | Fallback for offset og polygon-booleans | npm-pakke, kun i worker. |
| **Bezier.js** | MIT | Kurve-hjelpere (nearest point, offset-approksimasjon, intersections) | Fallback og verktøyhjelp. |
| **pdf-lib** | MIT | Fallback PDF-skriver | Ren JS. |
| **pdfjs-dist** | Apache-2.0 | PDF-import | Finnes allerede. |
| **harfbuzzjs** | MIT (HarfBuzz: "Old MIT") | Tekstshaping | wasm, i renderer. |
| **opentype.js** eller **fontkit** | MIT | Glyfkonturer, fontmetadata | Velg én i D2.1. |
| **imagetracerjs** | Unlicense (public domain) | Fallback for Image Trace | Ren JS, i worker. |
| **Material Symbols** | Apache-2.0 | Ikoner | Allerede brukt. |
| **UTIF.js** | MIT | TIFF | Finnes allerede. |
| **Inkscape** | GPL-2.0+ | **Kun referanse**: oppførsel, testfiler vi lager selv, testorakel via CLI i CI | Aldri kopier kode. |
| **Potrace** | GPL-2.0 | **Ikke** bruk (lisens). | Bruk VectorCraft `trace` eller imagetracerjs. |

### 16.2 Lisensregler for agenter

* Før en avhengighet legges til: oppgi lisens i PR-beskrivelsen og legg den i
  `THIRD_PARTY_NOTICES.md` (opprettes i D0.4).
* Ingen GPL, LGPL (unntatt dynamisk lenket og godkjent), AGPL, SSPL eller "non-commercial".
* Kode portert fra et prosjekt skal ha toppkommentar med kilde, commit og lisens.
* modCut-repoet har i dag ingen `LICENSE`-fil. Eieren bør velge lisens (se 21) før kode fra
  Apache-2.0-prosjekter distribueres, slik at NOTICE-krav kan oppfylles i installerne.

### 16.3 Spike-kriterier for VectorCraft (D0.3)

VectorCraft velges som kernel hvis alle disse er oppfylt, ellers brukes JS-fallback i fase 1 til 3,
og spørsmålet tas opp igjen før fase 4:

1. `pathops`, `trace` og `pdf` kompilerer til `wasm32-unknown-unknown` uten `std::fs`, tråder
   eller GPU-avhengigheter, med samlet `.wasm` under 6 MB (gzip under 2 MB).
2. Boolean på 30 golden cases (10.4) er korrekt og raskere enn 20 ms per case i median.
3. Trace av 2 MP svart/hvitt bilde under 2 s i worker.
4. PDF-utdata åpnes uten feil i Acrobat/Preview, pdf.js og Illustrator (manuell sjekk), og
   passerer `qpdf --check`.
5. Crate-API-ene kan pakkes inn uten å forke mer enn 200 linjer av upstream.
6. Bygget kjører i CI på Linux, macOS og Windows (`.github/workflows/ci.yml`).

---

## 17. MCP og agentverktøy

### 17.1 REA (valgfritt): installasjon og oppsett

REA er ikke påkrevd. Ingen oppgave i byggeplanen avhenger av den, og alle krav kan verifiseres
med `npm test`. Bruk den bare hvis den sparer tid.

REA krever Node.js 22.19 eller nyere (22.x), 24.11+ eller 26+. Statisk JavaScript/Electron-analyse,
Electron-scenarier og skjermbildesammenligning trenger ingen ekstra motorer. Analyse av native
binærfiler krever Ghidra, Hopper eller IDA, og trengs **ikke** for dette prosjektet.

Anbefalt oppsett (interaktivt, velger agenter og viser endringer før de skrives):

```sh
npx rea-agents@6.5.0 setup
# start agenten på nytt etterpå
```

Manuell registrering, pinnet versjon:

```sh
# Claude Code, kun for dette repoet (lagres i ~/.claude.json, ikke i repoet)
cd /sti/til/modCut
claude mcp add --scope local rea -- npx -y rea-agents@6.5.0 mcp
# Windows:
claude mcp add --scope local rea -- cmd.exe /d /c npx -y rea-agents@6.5.0 mcp
```

```toml
# Codex: ~/.codex/config.toml
[mcp_servers.rea]
command = "npx"
args = ["-y", "rea-agents@6.5.0", "mcp"]
startup_timeout_sec = 30
```

Ikke bruk `claude mcp add --scope project`: det skriver `.mcp.json` inn i repoet. Hver utvikler
registrerer REA lokalt. Kontroller med `rea doctor` (for CLI: `npm install --global rea-agents@6.5.0`).
Oppdater bevisst og samtidig hos alle (`rea update`), og endre versjonsnummeret i dette kapitlet.

Verifisert 2026-10-14: REA 6.5.0 installert i skymiljøet, og
`rea analyze-javascript-application . --artifact-format directory --source-path renderer/bed.js --source-path renderer/app.js`
ga en forseglet evidensgraf for modCut (applikasjonsgraf og Electron-grenser).

### 17.2 REA (valgfritt): mulige bruksområder

| Bruk | REA-kommando (CLI-navn, samme som MCP-verktøy) | Kan hjelpe i |
|---|---|---|
| Kartlegge dagens modCut før Draw kobles inn: moduler, IPC-kanaler, preload-grenser, hvem som kaller `bed.loadSVG`, tastebindinger og menyer. | `analyze-javascript-application`, `inspect-analysis-view` | D0.1, D0.6, D1.12 |
| Sjekke at Draw ikke endrer Cut: analyser `renderer/` før og etter en PR og sammenlign grafene (nye kall inn i `bed.js` skal bare gå via API-et i 14.2). | `analyze-javascript-application` + `compare-application-versions` | Alle PR-er som berører `app.js`, `bed.js`, `main.mjs` |
| Kjøre et Draw-scenario i den ekte Electron-appen og lagre evidens (klikk, taster, skjermbilder). Supplement til `electron/e2e/`. | `capture-electron-scenario` | Fase 1 og utover |
| Visuell regresjon: sammenligne skjermbilder av canvas før og etter, og eksportert PNG mot referanse. | `compare-web-screenshots` | 10.7, 13.3, D2.7 |
| Kontrollere at wasm-kjernen har samme grensesnitt etter oppdatering av VectorCraft-pin. | `compare-wasm-interfaces` | D0.3, D0.4, hver oppdatering av `native/modcut-geom` |
| Inspisere strukturen i eksempel- og eksportfiler (PDF-kompatibel `.ai`, PDF, SVGZ) for interoperabilitet, f.eks. `modCut_logo.ai` i repoet. | `extract-artifact`, `inspect` | D2.6, D3.7, 12 |
| Analysere en tredjeparts JS/Electron- eller webapp med åpen og tillatende lisens for å forstå en teknikk. | `analyze-javascript-application`, `analyze-web-bundle` | Ved behov |

**Grenser (bindende for alle agenter som velger å bruke REA):**

* REA skal **ikke** brukes til å dekompilere eller disassemblere Adobe Illustrator eller annen
  lukket programvare for å kopiere implementasjon. Adobes lisensvilkår forbyr reverse
  engineering, og REA selv er beregnet på programvare man eier eller har tillatelse til å
  undersøke. Illustrator-paritet oppnås ved å observere **oppførsel** (dokumentasjon,
  hurtigtaster, bruk av programmet) og implementere selv.
* Filer fra brukere (kundelogoer o.l.) analyseres kun lokalt og sjekkes ikke inn.
* Evidens som sjekkes inn (i `docs/draw/evidence/`) skal være liten, uten absolutte stier
  til private mapper, og ha en kort README om hvordan den ble laget.
* Kode kopieres aldri fra en analysert app med inkompatibel lisens, se 16.2.

### 17.3 VectorCraft MCP som utviklingsverktøy

VectorCraft sin MCP-server brukes **under utvikling**, ikke i produktet, til:

* å lage referansefiler (golden outputs) for Pathfinder, Outline Stroke, Offset, Trace og eksport;
* å sammenligne oppførsel ("hva gjør en Illustrator-lik editor her?") når spesifikasjonen er uklar;
* å eksportere testfiler til PDF/AI/EPS for import-tester.

Oppsett lokalt (eier eller agent med nett og Rust-verktøykjede):

```sh
# Last ned en release eller bygg fra kilde (pin samme commit som native/modcut-geom)
git clone https://github.com/storytold/vectorcraft vendor-tools/vectorcraft
cd vendor-tools/vectorcraft && git checkout <PINNET_COMMIT>
cargo build --release -p vectorcraft-cli

# Registrer i Claude Code, med begrenset filtilgang
claude mcp add vectorcraft -- "$PWD/target/release/vectorcraft-cli" mcp \
  --automation-read-root "$REPO/renderer/draw/test/fixtures" \
  --automation-write-root "$REPO/renderer/draw/test/fixtures/generated"
```

For Codex: legg tilsvarende oppføring i Codex sin MCP-konfigurasjon (`~/.codex/config.toml`,
seksjon `[mcp_servers.vectorcraft]` med `command` og `args`).

`vendor-tools/` skal stå i `.gitignore`. Genererte referansefiler sjekkes inn **etter**
manuell kontroll, med en `README.md` i fixture-mappen som sier hvordan de ble laget.

### 17.4 Andre verktøy for agenter

* **Playwright / Electron CDP**: eksisterende E2E-rammeverk i `electron/e2e/` utvides med
  Draw-arbeidsflyter (kapittel 19). Chromium er tilgjengelig i skymiljøet.
* **Inkscape CLI** (valgfritt, kun som orakel i CI): `inkscape --export-type=png` for å
  sammenligne SVG-eksport visuelt. Ikke en runtime-avhengighet.
* **qpdf** for strukturkontroll av PDF-eksport.

### 17.5 Fremtidig: modCut som MCP-server (fase 5, valgfritt)

modCut kan senere eksponere en egen MCP-server (via main-prosessen) med kommandoer som
`draw.createArtboard`, `draw.applyCommand`, `draw.export`, `draw.sendToCut`. Fordi all mutasjon
allerede går gjennom Commands, er dette en tynn adapter. Ikke en del av fase 1 til 4.

---

## 18. Byggeplan: faser og oppgaver

Hver oppgave har id, avhengigheter, filer den eier, og akseptkriterier. En agent tar **én**
oppgave per PR. Oppgaver i samme fase uten avhengighet til hverandre kan kjøres parallelt
av forskjellige agenter fordi de eier ulike filer.

### Fase 0: Fundament (ingen synlig funksjon ennå)

| Id | Oppgave | Avhenger av | Eier filer | Ferdig når |
|---|---|---|---|---|
| D0.1 | Workspace-bytte: Draw-knapp (CTA), `data-workspace`, tom Draw-flate med eget canvas og eget `PaperScope`, IPC `setWorkspace`, `buildMenu(mode)` med tom Draw-meny. | | `renderer/index.html` (kun knapp og container), `renderer/draw/index.mjs`, `renderer/draw/draw.css`, `electron/main.mjs` (menyfunksjon), `electron/preload.cjs` | E2E: klikk Draw, se tom flate, klikk Cut, Cut-designet er urørt. Menyen bytter. |
| D0.2 | Dokumentmodell, Commands, History, migrering, validering. Ren JS. | | `renderer/draw/doc/*`, tester | 95 % linjedekning i `doc/`. Undo/redo av 1 000 tilfeldige kommandoer gir identisk dokument (property test med fast seed). |
| D0.3 | Spike: VectorCraft til wasm (`native/modcut-geom`), måling mot 16.3. Skriv resultat i `docs/draw/spike-vectorcraft.md`. | | `native/`, `scripts/build-wasm.mjs`, `docs/draw/` | Rapport med tall for alle 6 kriterier og anbefaling. |
| D0.4 | `GeometryKernel`-grensesnitt, worker, JS-fallback-skjelett, `THIRD_PARTY_NOTICES.md`. | D0.2 | `renderer/draw/geom/kernel*.mjs`, `THIRD_PARTY_NOTICES.md` | Kernel lastes i worker, `flatten` og `boolean('unite')` virker i fallback. |
| D0.5 | Keymap-motor og verktøyregister med ikoner (sprite-bygg). | D0.1 | `renderer/draw/keymap.mjs`, `tools/registry.mjs`, `icons/`, `scripts/build-icons.mjs` | Test: ingen tastekonflikter. Alle verktøy i tabell 6 har ikon-id. |
| D0.6 | `.modcut` v4: lagre/laste `draw`, autosave/recovery, dirty-sjekk, advarsel i eldre versjon. | D0.2 | `renderer/app.js` (kun dokument-IO), `electron/recovery-store.mjs` | E2E: tegn ingenting, lagre, åpne; v3-fil åpnes uendret; krasjgjenoppretting tar med Draw. |

### Fase 1: Tegne det grunnleggende (MVP som kan brukes til enkle logoer)

| Id | Oppgave | Avhenger av |
|---|---|---|
| D1.1 | Render-adapter (modell til Paper) med diff, viewport culling, Outline view. | D0.2, D0.1 |
| D1.2 | Artboards: modell, Artboard-verktøy, Artboards-panel, New Document-dialog med presets inkl. Bed. | D1.1 |
| D1.3 | Selection (V) med bounding box, smart guides v1 (punkt, senter, kant), Hand, Zoom, piltaster. | D1.1, D0.5 |
| D1.4 | Direct Selection (A), ankre og håndtak, live corners. | D1.3 |
| D1.5 | Pen, Add/Delete/Convert Anchor. Port logikk fra Cut-pennen (`bed.js` linje ca. 861 til 1070) til Draw-modellen, uten å endre Cut. | D1.4 |
| D1.6 | Former: Rectangle, Rounded Rectangle, Ellipse, Polygon, Star, Line, med live parametre og klikk-dialog. | D1.3 |
| D1.7 | Rotate, Reflect, Scale med dialoger og Copy, Transform Again. | D1.3 |
| D1.8 | Paneler: Properties, Layers (inkl. Template-lag), Transform, Align, Color, Stroke (uten profiles). Fill/Stroke-boks i verktøylinja. | D1.1 |
| D1.9 | Kontrollinje og statuslinje. | D1.8 |
| D1.10 | Group, isolasjonsmodus, Arrange, Lock/Hide, Copy/Paste (intern + SVG), Paste in Front/Back/Place. | D1.3 |
| D1.11 | Place og drag-and-drop av bitmap, template-lag, embed. | D1.8 |
| D1.12 | **Send til Cut v1**: senterlinje-strokes, ingen effekter, tekst finnes ikke ennå. Smalt API i `bed.js`. | D1.2, D1.6 |

Fase 1 er ferdig når en bruker kan: lage nytt dokument med bed-størrelse, legge inn et bilde
som template, tegne over med Pen og former, bruke lag, og sende artboardet til Cut og kutte det.

### Fase 2: Illustrator-kjernen

| Id | Oppgave | Avhenger av |
|---|---|---|
| D2.1 | Tekst: fontliste fra main, shaping, punkt-, område- og path-tekst, Character/Paragraph, Create Outlines. | D1.x |
| D2.2 | Pathfinder-panel (alle 10), Compound Path, Clipping Mask, Draw Inside. | D0.4 (kernel) |
| D2.3 | Gradienter (linear/radial), Gradient-verktøy og panel, Swatches med globale swatches og laserswatches. | D1.8 |
| D2.4 | Join, Average, Simplify, Offset Path, Reverse, Add/Remove Anchor Points, Clean Up, Scissors. | D2.2 |
| D2.5 | **SVG-eksport** og **SVG-import** til Draw-modellen. | D1.x |
| D2.6 | **PDF-eksport** (ett artboard per side). | D0.3/D0.4 |
| D2.7 | **Raster-eksport**: Export As og Export for Screens, PNG/JPEG/WebP, skala, transparens, antialiasing. | D1.1 |
| D2.8 | Pencil, Shear, Eyedropper, Measure, Group Selection, Arc. | D1.x |
| D2.9 | Transparency-panel, blend modes, opacity per fill/stroke. History-panel, Info-panel, kommandosøk. | D1.8 |
| D2.10 | Send til Cut v2: tekst til outlines, outline-stroke-valg, validering i dialog, "Oppdater i Cut". | D2.1, D2.4 |

### Fase 3: Avansert redigering og trace

| Id | Oppgave |
|---|---|
| D3.1 | Outline Stroke og Expand/Expand Appearance med golden tests (10.6). |
| D3.2 | Appearance-panel med flere fills/strokes og live effekter: Path-effekter, Distort & Transform, Round Corners, Drop Shadow, Glow, Feather, Gaussian Blur. Document Raster Effects Settings. |
| D3.3 | Image Trace med presets, live trace, Expand, laser-presets. |
| D3.4 | Shape Builder, Eraser, Knife, Path Eraser, Smooth, Curvature. |
| D3.5 | Magic Wand, Lasso, Select-menyen (Same, Object, Save Selection). |
| D3.6 | Free Transform, Transform Each, Split Into Grid. |
| D3.7 | AI-eksport (PDF-kompatibel) og DXF-eksport. |
| D3.8 | Links-panel, Crop Image, Document Info. "Rediger i Draw" fra Cut. |

### Fase 4: Fullpakke

| Id | Oppgave |
|---|---|
| D4.1 | Width-verktøy og width profiles, pilspisser, gradient på stroke. |
| D4.2 | Blend (W), Blend Options, Make/Release/Expand Blend. |
| D4.3 | Warp-effekter, Live Pathfinder-effekter, Rasterize-effekt, Opacity masks. |
| D4.4 | Paintbrush og Blob Brush. |
| D4.5 | EPS-eksport, TIFF-eksport, Graphic Styles, Navigator, Rotate View, Asset Export, egne workspaces. |
| D4.6 | Ytelsespass: 5 000 paths / 200 000 ankre ved 50 fps, profilering og tiltak. |

### Fase 5: Polering og ekstra

Vertical Type, Touch Type, Glyphs-panel, Scribble, Package, PDF/X-4, bleed og merker,
AVIF/GIF-eksport, PLT-eksport, EPS-import, egendefinerte hurtigtaster, modCut MCP-server,
lokalisering (norsk/engelsk, samme system som resten av appen).

---

## 19. Testing og kvalitetskrav

### 19.1 Testtyper

| Type | Hvor | Kjøres av |
|---|---|---|
| Enhetstester for modell, Commands, migrering, keymap, geometri-hjelpere | `renderer/draw/test/*.test.mjs` med `node --test` | `npm run test:draw` (nytt skript), inkludert i `npm test` |
| Golden tests for kernel (boolean, offset, outline stroke, simplify, trace) | `renderer/draw/test/kernel/` + fixtures | `npm run test:draw` (kjører både wasm og fallback) |
| Eksporttester: SVG valideres mot skjema og rundtur (eksport, import, likt dokument); PDF med `qpdf --check` og pdf.js-parsing; PNG pikseldiff mot referanse | `renderer/draw/test/io/` | `npm run test:draw` |
| E2E: verktøy, hurtigtaster, paneler, lagre/åpne, Send til Cut, gjenoppretting | `electron/e2e/draw-workflows.mjs` | `npm run test:e2e` |
| Ytelse: syntetiske dokumenter, fps-måling under pan/zoom | `electron/e2e/draw-perf.mjs` | manuelt + nattlig CI |
| Kontrast for nye UI-farger | `design/check-contrast.mjs` | `npm run check:contrast` |

### 19.2 Minimumskrav per PR

* Alle eksisterende tester passerer (`npm test`).
* Nye funksjoner har enhetstester, og verktøy har minst én E2E-test som bruker hurtigtasten.
* Ingen endring i Cut-oppførsel, med mindre oppgaven sier det. E2E for Cut skal være grønn.
* Ingen ny avhengighet uten lisensnotat (16.2).
* Oppdater sjekkboksen i `ROADMAP.md` og status i dette dokumentet.

### 19.3 Robusthetsregler

* Kernel-feil (exception, timeout over 10 s) skal aldri ødelegge dokumentet: kommandoen
  avbrytes, dokumentet er uendret, og brukeren får en forståelig melding.
* All filskriving går via main-prosessen og skrives atomisk (temp-fil og rename), som i dag.
* Import av ukjent/defekt fil skal gi melding, aldri hvit skjerm. Fuzz-test SVG-import med
  minst 200 genererte filer.
* Store dokumenter: advarsel ved over 1 million ankre, aldri krasj.
* Alle tall fra brukerinput valideres (NaN, Infinity, negative størrelser) i Command-laget.

---

## 20. Arbeidsregler for Claude og Codex

Denne seksjonen er skrevet direkte til kodeagentene.

1. **Les først**: dette dokumentet, `README.md`, `ROADMAP.md`, `design/tokens.css` og filene
   oppgaven nevner. Ikke les hele `bed.js` hvis oppgaven ikke trenger det; den er stor.
2. **Én oppgave, én gren, én PR.** Grennavn: `draw/<oppgave-id>-<kort-navn>`, f.eks.
   `draw/D1.5-pen-tool`. PR-tittel starter med oppgave-id.
3. **Hold deg innenfor "Eier filer".** Trenger du å endre en fil en annen oppgave eier, gjør
   minst mulig endring og skriv det i PR-beskrivelsen.
4. **Ikke endre** `renderer/bed.js` utover API-et beskrevet i 14.2, og ikke endre
   `sidecar/` i det hele tatt.
5. **Rent lag**: `doc/`, `geom/`, `resolve/`, `io/` uten DOM og uten Paper.js.
6. **Alle mutasjoner via Commands.** Ingen direkte endring av modellen fra UI.
7. **Hurtigtaster** legges kun i `keymap.mjs`. Menyakseleratorer leses derfra.
8. **Ikoner**: hvert nytt verktøy eller panelvalg får ikon i `renderer/draw/icons/` og tooltip
   med navn og tast.
9. **Tester først der det går** (særlig geometri og IO). Golden fixtures sjekkes inn med en
   README som sier hvordan de ble laget.
10. **Lisens**: se 16.2. Kopier aldri GPL-kode, heller ikke "bare en funksjon".
11. **Stil**: ES-moduler (`.mjs`), ingen bundler, ingen TypeScript-kompilering (JSDoc-typer er
    velkomne), samme kodestil som eksisterende filer. Ingen nye rammeverk (React, Vue o.l.).
12. **Dokumentasjon**: når en oppgave er ferdig, oppdater sjekklisten i [kapittel 23](#23-statussjekkliste)
    og eventuelle avvik fra spesifikasjonen i samme PR.
13. **MCP-verktøy** (REA, VectorCraft) er valgfrie. Ingen oppgave skal blokkeres av at de mangler.
    Brukes REA, gjelder grensene i 17.2.
14. **Usikkerhet**: hvis spesifikasjonen er uklar, velg Illustrators oppførsel, skriv valget i
    PR-beskrivelsen, og legg et spørsmål i kapittel 21.

Forslag til prompt for en agent:

```text
Du jobber i repoet sirbull/modCut. Les docs/DRAW_WORKSPACE.md, spesielt kapittel 2, 4, 20
og oppgave <ID> i kapittel 18. Implementer kun oppgave <ID>. Hold deg til filene oppgaven eier.
Skriv tester, kjør `npm run test:draw` og `npm test`, oppdater statussjekklisten, og lag én PR
fra grenen draw/<ID>-<navn>.
```

---

## 21. Åpne spørsmål

| Nr | Spørsmål | Foreløpig valg |
|---|---|---|
| Q1 | Skal valgfrie REA-sjekker noen gang inn i CI? | Nei. REA er et valgfritt lokalt hjelpemiddel. |
| Q2 | Hvilken lisens skal modCut ha? Påvirker NOTICE-krav og hvilke biblioteker som kan brukes. | Ingen fil i dag. Anbefaling: MIT eller Apache-2.0. |
| Q3 | Skal Draw også fungere som frittstående vindu (som Advanced Editing), eller kun som modus i fanen? | Kun modus i fanen. |
| Q4 | Skal Cut-verktøyenes taster endres til Illustrator-standard (L = ellipse, C = scissors) for konsistens? | Nei i første omgang, per modus. |
| Q5 | Skal Send til Cut støtte flere artboards til samme bed (nesting) eller til hver sin fane? | Hver sin fane, eller "Legg til i Cut" sekvensielt. Nesting er et eget prosjekt. |
| Q6 | Standard visningsenhet i nye dokumenter: mm (verksted) eller pt (Illustrator)? | mm. |
| Q7 | Trengs CMYK-separasjon/PDF/X for trykk? | Nei før fase 5. |

---

## 22. Kilder

* VectorCraft (MIT/Apache-2.0, Rust, Illustrator-lik, MCP-server): <https://github.com/storytold/vectorcraft>
* VectorCraft-gjennomgang: <https://pasqualepillitteri.it/en/news/21639/vectorcraft-guide-free-illustrator-alternative-rust>
* REA (Reverse Engineer Anything): <https://github.com/morluto/rea>
* REA installasjon og MCP-registrering: <https://github.com/morluto/rea/blob/main/docs/installation.md>
* Adobe Illustrator, standard hurtigtaster: <https://helpx.adobe.com/illustrator/using/default-keyboard-shortcuts.html>
* Adobe Illustrator, Image Trace: <https://helpx.adobe.com/illustrator/using/image-trace.html>
* Adobe Illustrator, Export for Screens: <https://helpx.adobe.com/illustrator/using/collect-assets-export.html>
* Paper.js: <http://paperjs.org/>
* Clipper2: <https://github.com/AngusJohnson/Clipper2>
* HarfBuzz (harfbuzzjs): <https://github.com/harfbuzz/harfbuzzjs>
* imagetracerjs: <https://github.com/jankovicsandras/imagetracerjs>
* pdf-lib: <https://pdf-lib.js.org/>

---

## 23. Statussjekkliste

Oppdateres i samme PR som fullfører oppgaven.

* [ ] D0.1 Workspace-bytte
* [ ] D0.2 Dokumentmodell og historikk
* [ ] D0.3 VectorCraft-spike
* [ ] D0.4 GeometryKernel og worker
* [ ] D0.5 Keymap og verktøyregister
* [ ] D0.6 `.modcut` v4
* [ ] D1.1 Render-adapter
* [ ] D1.2 Artboards
* [ ] D1.3 Selection, Hand, Zoom
* [ ] D1.4 Direct Selection
* [ ] D1.5 Pen og ankerverktøy
* [ ] D1.6 Former
* [ ] D1.7 Rotate, Reflect, Scale
* [ ] D1.8 Grunnpaneler
* [ ] D1.9 Kontrollinje og statuslinje
* [ ] D1.10 Group, Arrange, Clipboard
* [ ] D1.11 Place bitmap og template-lag
* [ ] D1.12 Send til Cut v1
* [ ] D2.1 Tekst
* [ ] D2.2 Pathfinder, Compound, Clipping
* [ ] D2.3 Gradienter og Swatches
* [ ] D2.4 Path-kommandoer
* [ ] D2.5 SVG eksport/import
* [ ] D2.6 PDF-eksport
* [ ] D2.7 Raster-eksport
* [ ] D2.8 Pencil, Shear, Eyedropper m.fl.
* [ ] D2.9 Transparency, History, Info, kommandosøk
* [ ] D2.10 Send til Cut v2
* [ ] D3.1 Outline Stroke og Expand
* [ ] D3.2 Appearance og effekter
* [ ] D3.3 Image Trace
* [ ] D3.4 Shape Builder, Eraser, Knife m.fl.
* [ ] D3.5 Magic Wand, Lasso, Select-meny
* [ ] D3.6 Free Transform, Transform Each, Split Into Grid
* [ ] D3.7 AI- og DXF-eksport
* [ ] D3.8 Links, Crop Image, Document Info, Rediger i Draw
* [ ] D4.1 til D4.6 Fullpakke
* [ ] Fase 5
