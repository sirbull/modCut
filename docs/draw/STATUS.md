# Draw: status, hva er gjort og hva gjenstår

> Én side for å se hvor Draw står. Oppdateres i samme commit som endrer status.
> Detaljer: [hovedplanen](../DRAW_WORKSPACE.md) (spesifikasjon og byggeplan),
> [RIGHT_PANELS.md](RIGHT_PANELS.md) (høyresiden), [WORK_LOG.md](WORK_LOG.md) (hva som er gjort, dag for dag)
> og [HANDOFF.md](HANDOFF.md) (overlevering til neste agent).
> Sist oppdatert: 2026-10-15. Arbeidsgren: `claude/draw-properties-layers-panels`.

## 1. Kort oppsummert

Draw kan i dag brukes til å tegne enkle logoer og former: artboards, utvalg, Pen og ankerredigering,
grunnformer med live hjørner, transformasjoner, lag med template-lag, farger, swatches, strek,
gjennomsiktighet, flere fyll og streker (Appearance), Pathfinder, gruppering, rekkefølge, låsing,
utklippstavle og isolasjonsmodus. Det som mangler for å kunne **kutte** det man tegner, er
**Send til Cut** (D1.12). Tekst, eksport, Image Trace og effekter er ikke bygget.

## 2. Høyresiden sammenlignet med Illustrator

| Del | Status | Som i Illustrator | Mangler |
|---|---|---|---|
| Dokk: Properties over Layers med delelinje | Ferdig | Ja | |
| Panelstolpe med grupper og faner | Ferdig | Swatches, Color, Stroke/Gradient/Transparency, Appearance, Transform/Align/Pathfinder, Artboards | Brushes, Symbols, Color Guide, Graphic Styles (ikke bygget). Gradient-fanen er deaktivert. |
| Layers: rader, søk, bunnlinje, Layer Options | Ferdig | Øye, lås, fargelinje, thumbnail, navn, målsirkel, søppelkasse, teller | Se 2.1 |
| Properties | Delvis | Tittel, navn, utseende, form, quick actions, dokument | Se 2.2 |
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

### 2.1 Layers: gjenstår for Illustrator-paritet

* Panelmeny (≡) med New Layer, New Sublayer, **Duplicate**, Delete, Options, Make/Release Clipping Mask,
  Locate Object, **Merge Selected**, **Flatten Artwork**, Collect in New Layer, Release to Layers,
  **Hide Others**, **Lock Others**, Paste Remembers Layers.
* Flere valgte lag (Shift/Ctrl-klikk på rader) for Merge Selected.
* Dra den lille fargede firkanten (valgt kunst) til et annet lag for å flytte utvalget dit.
* Dobbeltklikk på laget utenfor navnet (rad eller thumbnail) åpner Layer Options.

### 2.2 Properties: gjenstår for Illustrator-paritet

Illustrators Properties viser kontekstuelle seksjoner med de samme kontrollene som panelene:

* **Transform**: referansepunkt, X, Y, B, H, lenke, rotasjon, og knapper for Flip horisontalt/vertikalt.
* **Appearance**: Fill-rute og Stroke-rute som åpner fargevelger, strekvekt, Opacity.
* **Align**: seks align-knapper når noe er valgt (og distribute ved tre eller flere).
* Quick Actions som i dag.

Tidligere regel (fra D1.8) var at Properties ikke skulle gjenta panelkontroller. Brukeren har nå bedt om
at Properties skal fungere ganske likt Illustrator, så seksjonene over gjenbruker **samme komponenter**
som panelene (ingen kopiert kode), og Layers vises fortsatt bare ett sted.

## 3. Hovedplanen (fra DRAW_WORKSPACE.md kapittel 23)

| Oppgave | Status |
|---|---|
| Fase 0 (D0.1 til D0.6) | Ferdig |
| D1.1 til D1.8 | Ferdig |
| D1.9 Kontrollinje og statuslinje | Gjenstår (statuslinjen finnes delvis) |
| D1.10 Group, Arrange, Clipboard, isolasjon | Ferdig |
| D1.11 Place bitmap og template-lag | Delvis: template-lag og bildeimport finnes; Place-dialog og Template-valg gjenstår |
| D1.12 Send til Cut v1 | **Gjenstår, neste store oppgave** |
| D2.1 Tekst | Gjenstår |
| D2.2 Pathfinder, Compound, Clipping | Pathfinder ferdig; compound paths og clipping masks gjenstår |
| D2.3 Gradienter og Swatches | Swatches ferdig (solide); gradienter og globale swatches gjenstår |
| D2.4 Path-kommandoer | Gjenstår |
| D2.5 SVG eksport/import | Gjenstår (enkel SVG-import finnes) |
| D2.6 PDF-eksport | Gjenstår |
| D2.7 Raster-eksport | Gjenstår |
| D2.8 Pencil, Shear, Eyedropper m.fl. | Gjenstår |
| D2.9 Transparency, History, Info, kommandosøk | Transparency ferdig; resten gjenstår |
| D2.10 Send til Cut v2 | Gjenstår |
| D3.1 Outline Stroke og Expand | Gjenstår (Expand Shape finnes) |
| D3.2 Appearance og effekter | Appearance ferdig; effekter gjenstår |
| D3.3 til D3.8, fase 4 og 5 | Gjenstår |

## 4. Rekkefølge videre

1. Properties og Layers til Illustrator-paritet (2.1 og 2.2).
2. **D1.12 Send til Cut v1**: fra artboard til Cut med én knapp.
3. D1.11 Place bitmap med Template-valg.
4. D1.9 Kontrollinje.
5. Deretter fase 2: tekst, SVG/PDF/PNG-eksport, path-kommandoer, compound og clipping.

## 5. Kjente begrensninger og risiko

* Color, Stroke og Swatches endrer første fyll og første strek når en figur har flere.
* Autolagringstesten (`project-workflows.mjs:113`) er ustabil i skymiljøet; se WORK_LOG.
* Cut/sidecar-tester kan ikke kjøres i skymiljøet (jitpack.io er blokkert).
* Geometrikjernens worker har bare polygonal union; Pathfinder bruker Paper.js i hovedtråden.
