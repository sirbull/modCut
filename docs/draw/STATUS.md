# Draw: status, hva er gjort og hva gjenstår

> Én side for å se hvor Draw står. Oppdateres i samme commit som endrer status.
> Detaljer: [hovedplanen](../DRAW_WORKSPACE.md) (spesifikasjon og byggeplan),
> [RIGHT_PANELS.md](RIGHT_PANELS.md) (høyresiden), [WORK_LOG.md](WORK_LOG.md) (hva som er gjort, dag for dag)
> og [HANDOFF.md](HANDOFF.md) (overlevering til neste agent).
> Sist oppdatert: 2026-10-15 (fase 1 ferdig). Arbeidsgren: `claude/draw-properties-layers-panels`.

## 1. Kort oppsummert

Draw kan i dag brukes til å tegne enkle logoer og former: artboards, utvalg, Pen og ankerredigering,
grunnformer med live hjørner, transformasjoner, lag med template-lag, farger, swatches, strek,
gjennomsiktighet, flere fyll og streker (Appearance), Pathfinder, gruppering, rekkefølge, låsing,
utklippstavle, isolasjonsmodus, kontrollinje og Place med Template. Et artboard kan sendes til Cut
med **Send to Cut** (D1.12 v1), så det man tegner kan kuttes. Fase 1 er ferdig. Tekst, eksport, Image Trace og effekter er ikke bygget.

## 2. Høyresiden sammenlignet med Illustrator

| Del | Status | Som i Illustrator | Mangler |
|---|---|---|---|
| Dokk: Properties over Layers med delelinje | Ferdig | Ja | |
| Panelstolpe med grupper og faner | Ferdig | Swatches, Color, Stroke/Gradient/Transparency, Appearance, Transform/Align/Pathfinder, Artboards | Brushes, Symbols, Color Guide, Graphic Styles (ikke bygget). Gradient-fanen er deaktivert. |
| Layers | Ferdig | Øye, lås, fargelinje, thumbnail, navn, målsirkel, søppelkasse, søk, filter, bunnlinje med teller, Layer Options, panelmeny (≡), flervalg av lag, dra utvalg til lag | Paste Remembers Layers; Make Clipping Mask (venter på D2.2) |
| Properties | Ferdig | Tittel, navn, Transform (referansepunkt, X, Y, B, H, lenke, rotasjon, Flip), Appearance (fyll, strek, vekt, opacity), form, Align, Quick Actions, Document uten utvalg | Character/Paragraph når tekst finnes (D2.1) |
| Swatches | Ferdig for solide farger | Bibliotek, laserfarger, Recent Colors, ny/rediger/slett, liste/rutenett | Swatch-grupper, globale swatches, mønstre |
| Color | Ferdig | Fill/Stroke, modus, glidere, hex, Recent Colors | Spekterfelt |
| Stroke | Ferdig | Vekt, cap, corner, limit, align, dash, pilspisser | Width profiles (D4.1) |
| Transparency | Ferdig | Blending mode, opacity | Opacity masks (D4.3) |
| Appearance | Ferdig | Flere fyll og streker, skjul, rekkefølge, legg til, dupliser, slett, tøm | Effekter (D3.2) |
| Transform | Ferdig | Referansepunkt, X, Y, B, H, lenke, rotasjon, skjær | |
| Align | Ferdig | Align, Distribute, Distribute Spacing, Align To og key object | |
| Pathfinder | Ferdig | Alle ti operasjoner | Compound shapes med Alt-klikk |
| Artboards | Fungerer | Liste, navn, størrelse, ny, dupliser, slett, rekkefølge | Thumbnails og radmønster som Layers |
| Scrubby labels | Ferdig | Dra i tittel, Shift raskere, Alt finere | |

### 2.1 Gjort for Illustrator-paritet (2026-10-15)

* **Layers:** panelmeny (≡) med New Layer, New Sublayer, Duplicate, Delete, Options, Make Clipping Mask
  (deaktivert til D2.2), Locate Object, Merge Selected, Flatten Artwork, Collect in New Layer,
  Release to Layers, Hide Others og Lock Others. Shift/Ctrl-klikk velger flere lag (for Merge Selected).
  Den fargede firkanten for valgt kunst kan dras til et annet lag. Dobbeltklikk på lagets thumbnail
  åpner Layer Options.
* **Properties:** seksjonene Transform (kompakt, med Flip horisontalt/vertikalt), Appearance (fargeruter,
  strekvekt med scrubby label, opacity, og knapper som åpner Color/Stroke), formparametre, Align (seks
  knapper; ett objekt justeres mot artboardet) og Quick Actions. Seksjonene gjenbruker panelenes komponenter.
  Regelen fra D1.8 om at Properties ikke skal gjenta panelkontroller er erstattet av brukerens ønske om
  Illustrator-likhet. Layers vises fortsatt bare ett sted.

### 2.2 Send til Cut v1 (D1.12, 2026-10-15)

Hva som virker:

* Knappen **Send to Cut** i topplinjen (bare i Draw), i Artboards-panelet, i Properties uten utvalg
  (Quick Actions), i File-menyen (**Send Artboard to Cut…**) og som kommandoen `send-to-cut`.
* Dialogen velger artboard, mål (**ny Cut-fane** som standard, **erstatt** designet i denne fanens Cut,
  eller **legg til**) og plassering (artboardets øvre venstre hjørne på bed-origo som standard, eller
  sentrert). Den viser hvor mange paths som sendes og advarsler før noe skjer; Send er deaktivert når
  artboardet er tomt.
* `renderer/draw/io/cut-svg.mjs` lager en kanonisk SVG i millimeter: bare `<path>` med hex-farger,
  artboard-lokale koordinater, transformasjoner og grupper bakt inn, former ekspandert, strekbredde
  skalert med transformen (unntatt når strokeScaling er av). Template-lag, skjulte og ikke-utskrivbare
  objekter og objekter helt utenfor artboardet tas ikke med.
* Cut tar imot via den vanlige SVG-importen (`prepareSVG` og `bed.loadSVG`). `loadSVG` har fått valgene
  `placement: "origin"` og `replace: true`; erstatning og innsetting er ett angresteg i Cut. Farger blir
  Cut-lag som ved vanlig import (strekfargen bestemmer laget).
* Advarsler: bilder sendes ikke ennå, objekter som stikker utenfor artboardet sendes hele, bare første
  fyll og strek sendes når en figur har flere, åpne paths med fyll.

Gjenstår til Send til Cut v2 (D2.10): bilder som rastergravering, tekst til outlines (etter D2.1),
Outline Stroke som valg, klipping til artboard, flere artboards samtidig, validering av små segmenter
og duplikater, `cutLinks` med **Oppdater i Cut**.

### 2.3 Place med Template (D1.11, 2026-10-15)

* **Import** i Draw (File > Import, Mod+Shift+P) viser dialogen **Place** når minst én fil er et bilde.
  Avkrysningen **Template** huskes i økten, som i Illustrator.
* Med Template havner hver fil på et eget lag **under** aktivt lag, kalt «Template filnavn»: låst,
  dimmet til 50 %, ikke utskrivbart. Tegning fortsetter på det aktive laget, og ingenting velges.
  Hele plasseringen er ett angresteg.
* **Alt-slipp** av bilder fra Finder/Explorer gjør det samme uten dialog.
* **Use as Template** (Quick Actions i Properties når et bilde er valgt, og kommandoen
  `use-as-template`) flytter valgte bilder til et nytt template-lag.
* Template-lag kommer aldri med i Send til Cut (og senere eksport).
* Ren funksjon: `templateLayerCommands` i `doc/layers.mjs`.

Gjenstår fra kapittel 11.1: høyreklikkmeny på bilder (opacity, lås, Image Trace, Crop, Embed/Unlink,
Show in Folder), Crop Image, lenkede bilder og Links-panelet, liming av bilder fra utklippstavlen.

### 2.4 Kontrollinje (D1.9, 2026-10-15)

* En rad over tegneflaten, som Illustrators Control-panel. Uten utvalg: Fill, Stroke og Weight for nye
  objekter, og snarveier til Artboards og Swatches. Med utvalg: objekttype, Fill, Stroke, Weight,
  Opacity, X, Y, W, H (fra referansepunktet), seks Align-knapper (ett objekt justeres mot artboardet),
  Expand Shape for live former, Use as Template for bilder og Transform…. Med Artboard-verktøyet:
  navn, X, Y, W, H og knapper for nytt og slett artboard.
* Alle felt har scrubby labels og gir ett angresteg. Ingen funksjon finnes bare her.
* **View > Control Bar** (og kommandoen `toggle-control-bar`) skjuler og viser den; valget huskes
  per bruker. Statuslinjen nederst (posisjon, artboard, zoom, Outline, Fit) fantes fra før.

### 2.5 Export As: SVG, PNG og JPEG (D2.5 og D2.7, 2026-10-16)

* **File > Export As…** (Mod+Shift+Alt+S), knappen **Export…** i Artboards-panelet og i Properties uten
  utvalg, og kommandoen `export-as`.
* Dialogen velger artboard, format (SVG, PNG, JPEG), oppløsning (72, 150, 300, 600 ppi) og bakgrunn
  (gjennomsiktig, hvit eller artboardets farge). JPEG kan ikke være gjennomsiktig. Valgene huskes i økten.
* Eksporten tegnes fra det som skrives ut: template-lag, skjulte og ikke-utskrivbare objekter tas ikke
  med, og eksporten blir som Preview selv om man står i Outline-visning. Isolasjonsdemping og
  «Dim Images» påvirker ikke filen.
* SVG er i millimeter (`width="120mm"`, `viewBox` i artboardets koordinater) med flere fyll og streker,
  opacity, stiplede linjer og innebygde bilder slik Paper.js skriver dem.
* PNG og JPEG har nøyaktig artboardets størrelse ved valgt oppløsning (for eksempel 120 × 80 mm ved
  72 ppi blir 340 × 227 piksler). Over 16 384 piksler i en retning avvises med beskjed.
* Kode: `io/export.mjs` (rene hjelpere: filnavn, rasterstørrelse, SVG-dokument), `exportArtwork()` i
  `render/paper-adapter.mjs`, `exportBoard`/`exportAs` i `index.mjs`, IPC `exportFile` i `electron/main.mjs`.

Gjenstår: alle artboards i én eksport, Export for Screens, WebP, skala i prosent, SVG-valg (tekst,
CSS-stil), og PDF (D2.6).

## 3. Hovedplanen (fra DRAW_WORKSPACE.md kapittel 23)

| Oppgave | Status |
|---|---|
| Fase 0 (D0.1 til D0.6) | Ferdig |
| D1.1 til D1.8 | Ferdig |
| D1.9 Kontrollinje og statuslinje | Ferdig (se 2.4) |
| D1.10 Group, Arrange, Clipboard, isolasjon | Ferdig |
| D1.11 Place bitmap og template-lag | Ferdig (se 2.3); høyreklikkmeny, Crop Image og Links gjenstår |
| D1.12 Send til Cut v1 | Ferdig (se 2.2) |
| D2.1 Tekst | Gjenstår |
| D2.2 Pathfinder, Compound, Clipping | Pathfinder ferdig; compound paths og clipping masks gjenstår |
| D2.3 Gradienter og Swatches | Swatches ferdig (solide); gradienter og globale swatches gjenstår |
| D2.4 Path-kommandoer | Gjenstår |
| D2.5 SVG eksport/import | SVG-eksport ferdig (se 2.5); SVG-import finnes i enkel form |
| D2.6 PDF-eksport | Gjenstår |
| D2.7 Raster-eksport | PNG og JPEG ferdig (se 2.5); WebP, Export for Screens og skala gjenstår |
| D2.8 Pencil, Shear, Eyedropper m.fl. | Gjenstår |
| D2.9 Transparency, History, Info, kommandosøk | Transparency ferdig; resten gjenstår |
| D2.10 Send til Cut v2 | Gjenstår |
| D3.1 Outline Stroke og Expand | Gjenstår (Expand Shape finnes) |
| D3.2 Appearance og effekter | Appearance ferdig; effekter gjenstår |
| D3.3 til D3.8, fase 4 og 5 | Gjenstår |

## 4. Rekkefølge videre

Fase 1 er ferdig. Neste er fase 2, i denne rekkefølgen:

SVG-, PNG- og JPEG-eksport er gjort (2.5).

1. **D2.1 Tekst** (Type-verktøy, Character/Paragraph, Create Outlines). Neste.
2. D2.2 Compound paths og clipping masks (Make Clipping Mask i Layers-menyen venter på dette).
3. D2.4 Path-kommandoer (Join, Average, Offset Path, Simplify).
4. D2.6 PDF-eksport, D2.3 gradienter, D2.8 flere verktøy, D2.9 History/Info/kommandosøk.
5. D2.10 Send til Cut v2.

## 5. Kjente begrensninger og risiko

* Color, Stroke og Swatches endrer første fyll og første strek når en figur har flere.
* Autolagringstesten (`project-workflows.mjs:113`) er ustabil i skymiljøet; se WORK_LOG.
* Cut/sidecar-tester kan ikke kjøres i skymiljøet (jitpack.io er blokkert).
* Geometrikjernens worker har bare polygonal union; Pathfinder bruker Paper.js i hovedtråden.
