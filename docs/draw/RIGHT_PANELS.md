# Draw: høyrepanel, Layers og panelgrupper

> Status: spesifikasjon og byggeplan. Erstatter og utvider D1.8 del B til D i
> [hovedplanen](../DRAW_WORKSPACE.md). Del A (lagmodell og template-lag) er ferdig og gjenbrukes.
> Sist oppdatert: 2026-10-15.

Dette dokumentet beskriver hvordan høyresiden i Draw skal se ut og fungere: et fast område med
**Properties** øverst og **Layers** nederst, og en stående **panelstolpe** (rail) med panelgrupper
som åpnes ved siden av, strukturert slik Adobe Illustrator gjør det. UI-et følger modCuts
designsystem (`design/tokens.css`, lys og mørk), ikke Illustrators grå tema.

## 1. Utgangspunkt (slik det fungerer nå)

* `renderer/draw/panels/ui.mjs` lager én rail med sju knapper (Properties, Layers, Artboards,
  Color, Stroke, Align, Transform) og viser **ett** panel om gangen i samme flate.
* Layers-panelet har tre med øye, lås, sammenfelling, lagfarge, navn og valgsirkel, toppknapper
  for nytt lag, nytt underlag, collect, release, locate og slett, Layer Options-dialog og
  drag-and-drop. Lagmodellen (`doc/layers.mjs`) har farge, template, print, preview og
  bildedimming.
* Color og Stroke er enkle felt (fargevelger, bredde). Align er seks tekstknapper.
* Transform-panelet (D1.8 del B, commit `de9ccbb`) er ferdig: 9-punkts referansepunkt, X, Y, B, H,
  lenket proporsjon, Rotate by, Shear by, Scale strokes & effects og Scale corners. Det flyttes
  inn i Transform-gruppen uten funksjonsendring.
* Visningskontrollene (posisjon, artboard, zoom, Outline, Fit) ligger i statuslinjen nederst
  (commit `d337a8f`), ikke i høyrepanelet.
* Tallfelt endres bare ved inntasting.

## 2. Mål for layout

```text
 canvas                         | rail |  høyre dokk (fast)
                                |      | +------------------------------+
                                | [S]  | | Properties                   |
                                | [C]  | |  kontekstuelle seksjoner     |
          +-----------------+   | [St] | |                              |
          | flyout-gruppe   |<--| [Ap] | +============ deler ============+
          | Stroke|Grad|Tr  |   | [Al] | | Layers                       |
          +-----------------+   | [Ab] | |  søk, tre, bunnlinje         |
                                |      | +------------------------------+
```

* **Høyre dokk** er alltid synlig (kan skjules med Tab som i dag) og har to deler:
  * **Properties** øverst, scroller internt.
  * **Layers** nederst, scroller internt.
  * En horisontal **deler** mellom dem kan dras. Dobbeltklikk på deleren tilbakestiller til
    50/50. Høyden lagres per bruker i preferanser (ikke i dokumentet). Minimum 120 px for hver del.
  * Hver del har en tittellinje som kan klikkes for å kollapse delen (den andre fyller da høyden).
* **Panelstolpen** står mellom canvas og dokken, som Illustrators ikonstolpe. Hver knapp
  representerer en **panelgruppe**. Klikk åpner gruppen som en flyout til venstre for stolpen,
  over canvas. Klikk på samme knapp, lukkeknappen eller Escape lukker. Flyouten forblir åpen mens man
  jobber på canvas (som Illustrators standard, uten auto-collapse). Bare én flyout om gangen.
* En flyout har **faner** øverst (som `Stroke | Gradient | Transparency`), en lukkeknapp og
  innholdet til aktiv fane. Siste aktive fane per gruppe huskes.
* Tastatursnarveier fra hovedplanen åpner riktig gruppe og fane (F6 Color, Mod+F10 Stroke,
  Shift+F7 Align, Shift+F8 Transform, Mod+Shift+F9 Pathfinder, Shift+F6 Appearance, F7 fokuserer
  Layers i dokken).
* Properties og Layers finnes **bare** i dokken, ikke i stolpen. Ingen kontroll skal eksistere i
  to ulike implementasjoner: Properties gjenbruker de samme feltkomponentene som panelene.

### 2.1 Panelgrupper i stolpen

Rekkefølge ovenfra, med Tabler-ikon i parentes:

| Gruppe | Faner | Status i dag | Trinn |
|---|---|---|---|
| Swatches | Swatches | finnes ikke | 4 |
| Color | Color | enkel | 4 |
| Stroke | Stroke, Gradient, Transparency | Stroke enkel, resten finnes ikke | 5 (Gradient vises som "kommer i D2.3") |
| Appearance | Appearance | finnes ikke | 7 |
| Transform | Transform, Align, Pathfinder | Transform og Align ferdige (D1.8 B og C) | 7 |
| Artboards | Artboards | finnes | 1 (flyttes uendret) |

Faner som ikke er implementert ennå vises ikke. Ingen tomme "kommer snart"-faner bortsett fra
Gradient, som er tatt med for å vise strukturen og er deaktivert.

## 3. Layers-panelet

Referanse: Illustrators Layers-panel (bilde 1) og Layer Options (bilde 2), oversatt til modCut-stil.

### 3.1 Toppfelt

* Søkefelt "Search all" med forstørrelsesglass. Filtrerer treet på navn (ikke-treff skjules,
  foreldre til treff vises). Escape tømmer. Tomt resultat viser "No matches".
* Filterknapp ved siden av: meny med Show all, Only layers, Only visible, Only locked.

### 3.2 Rad

Fra venstre til høyre:

| Kolonne | Innhold | Interaksjon |
|---|---|---|
| Synlighet | Øye-ikon (eller template-ikon for template-lag, tomt når skjult) | Klikk av/på. Alt-klikk: vis bare dette laget. Mod-klikk: Outline/Preview for laget. Dra nedover flere rader for å slå av/på mange. |
| Lås | Hengelås når låst, tom ellers (vises ved hover) | Klikk av/på. |
| Fargelinje | Loddrett linje (3 px) i lagets markeringsfarge, også på underliggende objekter (arvet) | **Dobbeltklikk** åpner Layer Options med fokus på Color. |
| Innrykk og pil | Pil for å folde ut/inn når noden har barn | Klikk folder. Alt-klikk folder alle under. |
| Thumbnail | 28 x 28 px forhåndsvisning av lagets/objektets innhold, hvit bakgrunn med tynn kant | Klikk velger raden. |
| Navn | Lagnavn, eller objektnavn, eller `<Rectangle>`, `<Path>`, `<Group>` | Klikk gjør laget aktivt / velger objektet. **Dobbeltklikk** gir innebygd omdøping (Enter lagrer, Escape avbryter). |
| Målsirkel | Hul sirkel, fylt når noe i raden er valgt. Liten firkant i lagfarge til høyre når utvalg finnes i laget. | Klikk velger alt i laget / objektet. Shift-klikk legger til. |
| Slett | Søppelkasse-ikon, synlig ved hover og på aktiv rad | Klikk sletter laget/objektet (ett angresteg). Siste toppnivålag kan ikke slettes (knappen deaktiveres). |

* Aktiv rad har bakgrunn i `--surface-2`, valgte objekter markeres med kant i lagfargen.
* Radhøyde 36 px for lag, 32 px for objekter. Innrykk 14 px per nivå.
* Drag-and-drop som i dag (over, under, inni), med tydelig innsettingslinje.

### 3.3 Thumbnails

* Genereres fra **modellen** via render-adapteren til en liten offscreen-canvas, ikke fra skjermen.
* Innholdet skaleres til å passe ruten med 2 px marg. Tomme lag viser bare hvit rute.
* Cache per node, nøkkel = nodens fingerprint (adapteren har allerede fingerprint per node).
* Oppdateres med debounce (150 ms) etter endring, og bare for rader som er synlige i listen.
* Maks 200 thumbnails rendres per oppdatering; resten tegnes når de scrolles inn.

### 3.4 Bunnlinje

Venstre: tekst "N Layers" (antall toppnivålag, entall "1 Layer").
Høyre, ikonknapper med tooltip og eventuell hurtigtast:

| Ikon | Handling | Status |
|---|---|---|
| Collect in new layer | Samler valgte objekter i et nytt lag | finnes, flyttes hit |
| Release to layers | Release to Layers (Sequence) | finnes, flyttes hit |
| Locate object | Folder ut og scroller til valgt objekt | finnes, flyttes hit |
| Make/Release clipping mask | Deaktivert til D2.2 | ny, deaktivert |
| New sublayer | Nytt underlag i aktivt lag | finnes, flyttes hit |
| New layer | Nytt lag over aktivt lag. Alt-klikk åpner Layer Options først. | finnes, flyttes hit |
| Delete selection | Sletter valgte objekter, eller aktivt lag hvis ingen objekter er valgt | finnes, endres |

### 3.5 Layer Options-dialog

Som bilde 2, i modCut-stil:

* **Name**: tekstfelt, markert ved åpning.
* **Color**: nedtrekk med navngitte farger (Light Blue, Red, Green, Blue, Yellow, Magenta, Cyan,
  Gray, Black, Orange, Dark Green, Teal, Tan, Brown, Violet, Gold, Dark Blue, Pink, Lavender,
  Brick Red, Olive Green, Peach, Burgundy, Grass Green, Ochre, Purple, Light Gray, Other...) og
  en fargerute til høyre. Klikk på ruten eller "Other..." åpner fargevelger.
* Avkrysning i to kolonner: **Template**, **Lock**, **Show**, **Print**, **Preview**,
  **Dim Images to: [50 %]** (feltet aktivt bare når avkrysset).
* Template slår på Lock og av Print, slik modellen allerede gjør.
* OK og Cancel. Enter = OK, Escape = Cancel. Én History-transaksjon.

## 4. Dra-for-å-endre-verdi (scrubby labels)

Gjelder **alle** tallfelt med en tittel (label) i Properties, flyouts og dialoger.

* Pekeren blir `ew-resize` over tittelen. Trykk og dra vannrett endrer verdien.
* Steg: 1 enhet per 2 px som standard. Feltet definerer `step` (f.eks. 0,1 mm for mål,
  1 for grader og prosent, 0,25 pt for strek).
* **Shift** under drag: 10 x raskere. **Alt/Option**: 10 x finere. Kan byttes underveis.
* Verdien begrenses av feltets `min` og `max`, og avrundes til feltets presisjon.
* Under drag vises verdien live i feltet og objektet oppdateres som **forhåndsvisning**
  (ingen History-skriving). Ved slipp committes **ett** angresteg. **Escape** under drag avbryter
  og setter tilbake opprinnelig verdi.
* Pekeren låses (`requestPointerLock`) slik at man kan dra langt uten å treffe skjermkanten.
  Hvis pointer lock ikke er tilgjengelig, brukes vanlig musebevegelse.
* Klikk uten drag på tittelen fokuserer feltet (vanlig label-oppførsel).
* Piltaster i fokusert felt: opp/ned 1 steg, Shift 10 steg (som Illustrator).
* Tilgjengelighet: tittelen er fortsatt `<label for>`; skjermlesere ser et vanlig tallfelt.
* Implementeres som én gjenbrukbar komponent `renderer/draw/ui/number-field.mjs` med ren
  beregningslogikk i `renderer/draw/ui/scrub.mjs` (testes i Node).

## 5. Panelinnhold

### 5.1 Properties (dokk, øverst)

Kontekstuelle seksjoner, i denne rekkefølgen, bare når de gjelder:

1. **Utvalg**: type og antall ("Rectangle", "3 objects", "No selection"), navn ved ett objekt.
2. **Transform**: X, Y, B, H med referansepunkt og lenke for proporsjoner, rotasjon. Samme
   komponent som Transform-panelet.
3. **Appearance**: Fill-rute, Stroke-rute og vekt, Opacity. Klikk på rutene åpner Swatches-flyout.
4. **Shape / Corners**: live shape-parametre og hjørneradius (finnes i dag).
5. **Quick actions**: knapper som gjelder utvalget (Group/Ungroup, Arrange, Expand Shape,
   senere Image Trace, Outline Stroke, Create Outlines, Send til Cut).
6. **Uten utvalg**: Document-seksjon (aktivt artboard, enheter, Document Setup) og
   Ruler & Grids-snarveier.

### 5.2 Swatches

* Øverst: Fill/Stroke-rute (samme som verktøylinjen, synkronisert), None-knapp.
* **Recent Colors**: siste 10 brukte farger, delt med Color-panelet.
* Rutenett med swatches (standard sett som Illustrators basis: None, Registration utelates,
  hvit, svart, gråtoner, primærfarger og laserswatchene Cut, Engrave, Score). Listevisning og
  rutenettvisning.
* Bunnlinje: New swatch, New group, Delete. Global swatch-flagg kommer i D2.3.
* Swatches lagres i dokumentet (`swatches` i skjemaet).

### 5.3 Color

* Fill/Stroke-rute, Recent Colors, None/svart/hvit-snarveier, hex-felt med `#`.
* Fargemodus-meny: RGB, HSB, Grayscale, CMYK (CMYK lagres som verdier, vises via RGB).
* Spekter-felt (klikk/dra velger farge) og glidere per kanal med scrubby labels.

### 5.4 Stroke-gruppen

**Stroke** (bilde 3):
* Weight (med nedtrekk for vanlige verdier og scrubby label), enhet pt eller mm etter dokumentet.
* Cap: Butt, Round, Projecting (tre ikonknapper).
* Corner: Miter, Round, Bevel (tre ikonknapper) og Limit.
* Align Stroke: Center, Inside, Outside (Inside/Outside deaktivert for åpne paths).
* Dashed Line: avkrysning, valg "bevar nøyaktige lengder" eller "juster til hjørner",
  seks felt dash/gap.
* Arrowheads, Scale, Align og Profile vises deaktivert med tooltip "kommer i D4.1".

**Gradient**: deaktivert fane til D2.3.

**Transparency**: Blend mode-nedtrekk (16 moduser), Opacity med scrubby label. Make Mask,
Clip og Invert Mask vises deaktivert (D4.3).

### 5.5 Appearance

* Viser utvalgets appearance-stakk: Stroke (farge og vekt), Fill (farge), Opacity, og senere
  effekter. "No Selection" når ingenting er valgt (viser standardstil for nye objekter).
* Øye per rad, pil for å folde ut detaljer (Stroke viser Opacity per stroke).
* Bunnlinje: Add New Stroke, Add New Fill, Add New Effect (fx, deaktivert til D3.2), Clear
  Appearance, Duplicate Selected Item, Delete Selected Item.
* Flere fills/strokes per objekt krever at render-adapteren tegner alle oppføringer. Dette tas i
  trinn 7 og avgrenses om nødvendig til visning og redigering av første fill/stroke.

### 5.6 Transform-gruppen

**Transform**: ferdig (referansepunkt, X, Y, B, H, lenke, Rotate, Shear, Scale Corners,
Scale Strokes & Effects). Får scrubby labels i trinn 2.

**Align** (bilde 3):
* Align Objects: Left, Horizontal Center, Right, Top, Vertical Center, Bottom (ikoner).
* Distribute Objects: Vertical Top, Vertical Center, Vertical Bottom, Horizontal Left,
  Horizontal Center, Horizontal Right (ikoner).
* Distribute Spacing: Vertical, Horizontal, med avstandsfelt (scrubby).
* Align To: Selection, Key Object, Artboard (ikoner). Key Object velges ved å klikke et allerede
  valgt objekt én gang til.

**Pathfinder** (bilde 3):
* Shape Modes: Unite, Minus Front, Intersect, Exclude, og Expand.
* Pathfinders: Divide, Trim, Merge, Crop, Outline, Minus Back.
* Bruker `GeometryKernel.boolean`. Operasjoner kernel ikke støtter ennå er deaktivert med tooltip.

### 5.7 Artboards

Flyttes uendret til egen gruppe i stolpen i trinn 1. Senere: liste med thumbnails, samme
radmønster som Layers.

## 6. Ikoner

* Alle ikoner er vendret **Tabler outline** (MIT), som resten av Draw, med sha256 i
  `panels/icons/sources.json` og sprite fra `scripts/build-icons.mjs`.
* Der Tabler mangler et presist ikon (f.eks. Pathfinder-operasjonene, cap/corner/align stroke,
  distribute), tegnes egne 24 x 24 SVG-er i samme stil (2 px strek, runde ender) under
  `panels/icons/custom/` med egen oppføring `"source": "modcut"` i manifestet.
* Hver knapp har tooltip med navn og eventuell hurtigtast.

## 7. Byggetrinn

Hvert trinn committes og pushes for seg, med oppdatert `WORK_LOG.md` og `HANDOFF.md`.

| Trinn | Innhold | Ferdig når |
|---|---|---|
| 1 (ferdig) | Ny layout: dokk med Properties øverst og Layers nederst, dragbar deler, kollapsbare deler, stolpe med panelgrupper og flyout med faner. Eksisterende Color, Stroke, Align, Transform og Artboards flyttes inn uendret. | Enhetstester for gruppe-/faneregister. E2E: Properties og Layers synlige samtidig, flyout åpner/lukker, faner bytter, deler endrer høyde, eksisterende panel-E2E oppdatert og grønn. |
| 2 (ferdig) | Scrubby labels: `scrub.mjs` (ren logikk) og `number-field.mjs`, tatt i bruk i alle eksisterende tallfelt. | Enhetstester for steg, Shift/Alt, min/max, avrunding. E2E: drag på tittel endrer verdi, ett angresteg, Escape avbryter. |
| 3 (ferdig) | Layers-redesign: rad med øye, lås, fargelinje, thumbnail, navn, målsirkel, søppelkasse; søk og filter; bunnlinje med teller og ikoner; Layer Options som bilde 2. | E2E for alle interaksjonene i 3.2 og 3.4, thumbnail-test (piksel i forventet farge). |
| 4 (ferdig) | Swatches og Color med Recent Colors. | Enhetstester for fargekonvertering. E2E: velg swatch for fill og stroke. |
| 5 (ferdig; Stroke fra D1.8, Transparency her) | Stroke (full uten profiles/arrowheads) og Transparency. Render-adapteren støtter cap, join, limit, align og dash fullt. | Enhets- og pikseltester for cap/join/dash. |
| 6 (ferdig i `feat/vector-draw`, D1.8 del C) | Align (alle ikoner, distribute, distribute spacing, key object). Transform-panelet er også ferdig og har scrubby labels fra trinn 2. | Enhetstester for align/distribute-matematikk. E2E for key object. |
| 7 (Pathfinder ferdig, Appearance gjenstår) | Pathfinder og Appearance. | Golden tests for booleans via kernel. E2E for Unite og Minus Front. |
| 8 | Properties-gjennomgang med kontekstuelle seksjoner og quick actions. | E2E for hver seksjon ved ulike utvalg. |

## 8. Regler

* Alle endringer i dokumentet går gjennom Commands/History. Forhåndsvisning skriver ikke historikk.
* Ikke endre `renderer/bed.js`, Cut eller `sidecar/`.
* Draws globale keydown-lytter fanger taster i capture-fasen. Felt i paneler må bruke
  `change`/`blur` eller eksplisitt unntak i keymap for tekstfokus.
* Begge temaer (lys og mørk) skal kontrolleres visuelt for hvert trinn, og `npm run check:contrast`
  må passere hvis nye farger legges til.
