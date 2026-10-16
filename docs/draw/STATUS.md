# Draw: status, hva er gjort og hva gjenstår

> Én side for å se hvor Draw står. Oppdateres i samme commit som endrer status.
> Detaljer: [hovedplanen](../DRAW_WORKSPACE.md) (spesifikasjon og byggeplan),
> [RIGHT_PANELS.md](RIGHT_PANELS.md) (høyresiden), [WORK_LOG.md](WORK_LOG.md) (hva som er gjort, dag for dag)
> og [HANDOFF.md](HANDOFF.md) (overlevering til neste agent).
> Sist oppdatert: 2026-10-16 (Type on a Path). Arbeidsgren: `feat/vector-draw` (Claude pusher til
> `claude/draw-properties-layers-panels`, som bygger på den).

## 1. Kort oppsummert

Draw kan i dag brukes til å tegne enkle logoer og former: artboards, utvalg, Pen og ankerredigering,
grunnformer med live hjørner, transformasjoner, lag med template-lag, farger, swatches, strek,
gjennomsiktighet, flere fyll og streker (Appearance), Pathfinder, gruppering, rekkefølge, låsing,
utklippstavle, isolasjonsmodus, kontrollinje og Place med Template. Et artboard kan sendes til Cut
med **Send to Cut** (D1.12 v1), så det man tegner kan kuttes. Fase 1 er ferdig. SVG-, PNG- og
JPEG-eksport, PDF/EPS/DXF-eksport, Export for Screens, punkttekst, rektangulær områdetekst, **tekst på path**,
systemfonter, Google Fonts og **Create Outlines** finnes. Send to Cut gjør tekst til konturer automatisk
uten å endre Draw-teksten. Image Trace og effekter gjenstår.

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
* **Tom Cut (2026-10-16):** Er fanens Cut tom og dokumentet har ett artboard, går Send to Cut rett
  gjennom uten dialog til denne fanens Cut, øvre venstre hjørne på bed-origo. Dialogen åpnes likevel
  når noe hindrer sendingen. Med flere artboards og tom Cut viser dialogen bare Artboard og Placement.
* **Kopier og lim inn mellom Cut og Draw (2026-10-16):** Paste tar den nyeste kopien fra Cut eller Draw.
  Fra Draw til Cut kommer objektene som cut-paths på samme bed-posisjon som Send to Cut ville gitt.
  Fra Cut til Draw: Paste sentrerer i visningen, Paste in Place beholder posisjonen relativt til
  aktivt artboard. Bilder fra Cut limes ikke inn i Draw ennå. Duplicate i Cut endrer ikke utklippstavlen.
* `renderer/draw/io/cut-svg.mjs` lager en kanonisk SVG i millimeter: bare `<path>` med hex-farger,
  artboard-lokale koordinater, transformasjoner og grupper bakt inn, former ekspandert, strekbredde
  skalert med transformen (unntatt når strokeScaling er av). Template-lag, skjulte og ikke-utskrivbare
  objekter og objekter helt utenfor artboardet tas ikke med.
* Cut tar imot via den vanlige SVG-importen (`prepareSVG` og `bed.loadSVG`). `loadSVG` har fått valgene
  `placement: "origin"` og `replace: true`; erstatning og innsetting er ett angresteg i Cut. Farger blir
  Cut-lag som ved vanlig import (strekfargen bestemmer laget).
* Advarsler: bilder sendes ikke ennå, objekter som stikker utenfor artboardet sendes hele, bare første
  fyll og strek sendes når en figur har flere, åpne paths med fyll.

Automatisk tekst til outlines er nå ferdig (2.9). Gjenstår til Send til Cut v2 (D2.10): bilder som rastergravering,
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

### 2.6 Punkttekst (D2.1a, 2026-10-16)

* **Type (T)**: klikk på canvas for punkttekst. Klikk på tekst med Type eller dobbeltklikk med
  Selection for å redigere. **Edit Text…** finnes også i Properties.
* Dialogen har flere linjer, fontfamilie, størrelse og linjeavstand i pt, normal/fet, normal/kursiv
  og venstre/sentrert/høyre avsnitt. Canvas viser endringene mens man skriver. **Apply** er ett
  angresteg; **Cancel/Escape** forkaster forhåndsvisningen uten å endre dokumentet.
* Tekst lagres som dokumentdata og kan flyttes, skaleres, grupperes og fargelegges med eksisterende
  verktøy og paneler. SVG bevarer tekst, linjeskift og stil; PNG/JPEG tegner teksten som i Preview.
* Fontnavn skrives manuelt; systemet bruker erstatningsfont dersom navnet ikke finnes. Fonter bygges
  ikke inn, og SVG-mottakeren trenger samme font. Systemfontliste og varsel for manglende font gjenstår.
* **Send to Cut** varsler at tekst utelates inntil Create Outlines er implementert.

Dette var første del av D2.1. Fontvalg, shaping og outlines er senere utvidet i D2.1b nedenfor.

### 2.7 Systemfonter, shaping og Create Outlines (D2.1b, 2026-10-16)

* Fontfamilie i tekstdialogen har en liste over installerte vektorfonter. System- og brukerfonter
  skannes på Windows, macOS og Linux; TTF, OTF og fontsamlinger (TTC/OTC) støttes. Normal/fet og
  normal/kursiv velger en faktisk fontvariant. Manglende font/stil eller tegn gir en tydelig feil.
* Fontkit 2.0.4 beregner kerning, standard OpenType-ligaturer og glyfposisjoner i main-prosessen.
  Kvadratiske og kubiske konturer beholdes som Bézier-geometri i millimeter. Den samme geometrien
  brukes i forhåndsvisningen, SVG/PNG/JPEG-eksport og **Create Outlines**.
* Dokumentet beholder både redigerbar tekst og et versjonert glyfutlegg. Geometrien bevarer
  utseendet på maskiner uten fonten; selve fontfilen bygges ikke inn. Endret tekst må beregnes med
  en tilgjengelig font. Utdatert eller ukjent utleggsdata avvises av dokumentvalideringen.
* **Type > Create Outlines**, **Mod+Shift+O** og knappen i Properties lager én compound path per
  synlig glyf, gruppert per linje og objekt. Plassering, transformasjon, farger og opacity beholdes;
  hele konverteringen er ett angresteg. Tekst inne i valgte grupper kan også konverteres.
* Etter konverteringen sendes banene med vanlig **Send to Cut**. Send to Cut kan nå også bruke
  redigerbar tekst direkte (2.9). SVG-eksport av beregnet tekst bruker konturer og
  trenger derfor ingen font på mottakerens maskin.
* Eldre punkttekst uten glyfutlegg vises fortsatt med systemets tekstmotor. Edit Text > Apply eller
  Create Outlines beregner et nytt utlegg med den valgte fonten.

Gjenstår i D2.1: videre områdetekst (se 2.8), tekst på path, blandede tekststiler, egne Character/Paragraph-paneler,
flere tegn-/avsnittsegenskaper. Fontvarianter og variable akser er lagt til i 2.9. Full fontembedding og
rosa markering av manglende fonter i selve canvas er heller ikke bygget.

### 2.8 Rektangulær områdetekst (D2.1c, 2026-10-16)

* **Type (T)** lager punkttekst ved klikk og områdetekst ved drag. Rammekanten er synlig under
  draget. **Area Type** i samme verktøygruppe har egen markør og åpner også en 60 × 30 mm ramme ved klikk.
* **Edit Text** har rammebredde og -høyde i mm. Endringer beregner linjebryting og glyfer på nytt
  i live preview; Apply er ett angresteg og Cancel gjenoppretter originalen.
* Teksten brytes ved mellomrom/bindestrek. Lange ord deles ved Unicode-grafemgrenser, slik at
  kombinerte tegn og emoji ikke splittes. Eksplisitte linjeskift og tomme avsnitt beholdes.
  Kerning og ligaturer beregnes per ferdig linje; venstre/sentrert/høyre bruker rammebredden.
* Fontens høyde og valgt leading avgjør antall synlige linjer. Resten av teksten beholdes i
  dokumentet. Overløp varsles i dialogen og med rødt pluss på canvas, også når ingen linje får plass.
  En tom ramme kan fortsatt treffes og redigeres. **Create Outlines** avviser overløp med beskjed
  om å øke rammen; SVG/PNG/JPEG eksporterer de synlige glyfene.
* Lagring, eksport og outlines bruker samme versjonerte utlegg. Endret ramme ugyldiggjør gammel
  geometri. Rammen følger modellens foreldrematriser, og UI-kanten/plussmarkeringen eksporteres ikke.

Avgrensning: reflow gjøres med rammefeltene i Edit Text. Vanlige resize-/Transform-kommandoer
skalerer hele objektet. Reflow med canvas-håndtak, tekst i vilkårlig lukket form, lenkede rammer,
automatisk orddeling og full språkavhengig Unicode-linjebryting gjenstår.

### 2.9 Google Fonts og automatisk tekst til Cut (brukerønske, 2026-10-16)

* **Edit Text > Font source > Google Fonts** gir søk i hele katalogen (snapshot med 1 950 familier).
  Første valg laster komplette TTF/OTF-filer og lisens til appens lokale cache; senere valg fungerer
  uten nett. **Refresh Google Fonts catalog** henter en ny katalog. Ingen API-nøkkel eller
  OS-installasjon av fonten kreves. Dokumenttekst sendes ikke til Google; shaping skjer lokalt.
* Numeriske vekter, faktiske normal-/kursivvarianter, alle tilgjengelige variable akser og navngitte
  instanser støttes. Valgene viser bare tilgjengelige vekter/stiler. Forhåndsvisning, eksport,
  Create Outlines og Send to Cut bruker samme Fontkit-beregnede Bézier-konturer.
* Prosjektet beholder Google-fontens versjonslåste URL, SHA-256 og lisens sammen med teksten.
  En annen maskin kan laste den eksakte fontfilen ved redigering. Uendrede dokumenter vises og
  konverteres til konturer uten fontfil eller nett. Fontbinærer bygges foreløpig ikke inn i prosjektet.
* **Send to Cut** omgjør tekst til paths i utdata, én compound path per glyf med hull og kurver
  beholdt. Draw-tekst, utvalg og historikk endres ikke. Manuell **Create Outlines** finnes fortsatt.
  Eldre punkttekst uten cache beregnes midlertidig. Manglende/ugyldige konturer eller overløp på
  valgt artboard blokkerer Send, også når resten av designet kan sendes.
* Google-manifester leverer også lisensen, som lagres lokalt og kan leses i fontvelgeren. Nettfeil
  ødelegger ikke lagret katalog eller allerede nedlastede fonter. Kontrollerte nedlastingsverter,
  størrelsesgrenser og sjekksum beskytter mot feil filer/versjoner.

Avgrensning: hele katalogen kan søkes, men dette er støtte for fonter som gir monokrome
vektorkonturer. Bitmap-/fargeglyfer uten støttede konturer (bl.a. visse COLRv1-/emoji-fonter) får
en tydelig feil; full fargefontgjengivelse er ikke bygget. Googles offentlige metadata-/manifest-
endepunkter kan endres; appen har et bundlet metadata-snapshot og bevarer lokal cache ved feil.
Google Fonts-innføringen endrer ikke status for tekst på path, blandede stiler eller Character/Paragraph.

### 2.10 Type on a Path (D2.1d, 2026-10-16)

* Verktøyet **Type on a Path** (i Type-gruppen, egen markør): klikk på en path eller en live form, og
  banen blir tekstbane, som i Illustrator. Klikk på eksisterende tekst redigerer den. Med en bane valgt
  åpner Enter dialogen direkte.
* Dialogen **Type on a Path** har de vanlige tekstvalgene pluss **Start offset (mm)** og **Flip to the
  other side**. Avsnittsjustering (venstre, sentrert, høyre) gjelder lengden fra startforskyvningen til
  banens slutt. Forhåndsvisningen er live; Apply er ett angresteg som erstatter banen med teksten.
* Glyfene plasseres i fontmotoren (`electron/font-service.mjs`) med samme Fontkit-shaping som annen
  tekst: hver glyf sentreres på sin buelengde og roteres etter tangenten, grunnlinjen ligger på banen.
  Linjeskift blir mellomrom. Ren geometri i `geom/path-measure.mjs` (buelengde, punkt og tangent,
  reversering for Flip).
* Banen vises som hjelpelinje når teksten er valgt eller i Outline, og kan klikkes, også når ingen glyf
  er tegnet. Glyfer som ikke får plass gir **overløp**: rødt pluss ved banens ende, melding i dialogen,
  og Create Outlines og Send to Cut nekter (slik at tekst ikke forsvinner). Eksport tar glyfene som får plass.
* Lagring, SVG/PNG/PDF-eksport, Create Outlines og Send to Cut bruker det samme lagrede utlegget.
  Teksttypen er `kind: "onPath"` med `onPath: { subpath, offset, flip }`, og den inngår i utleggssignaturen.

Avgrensning: bare banens første delbane brukes. Start-, slutt- og midtklammer som kan dras på canvas,
Type on a Path Options (Rainbow, Skew, 3D, Stair Step, Gravity, justering mot ascender/descender) og
Vertical Type on a Path er ikke bygget. Banen kan ikke redigeres med Direct Selection etterpå; endre
teksten med Edit Text, eller angre og tegn banen på nytt.

## 3. Hovedplanen (fra DRAW_WORKSPACE.md kapittel 23)

| Oppgave | Status |
|---|---|
| Fase 0 (D0.1 til D0.6) | Ferdig |
| D1.1 til D1.8 | Ferdig |
| D1.9 Kontrollinje og statuslinje | Ferdig (se 2.4) |
| D1.10 Group, Arrange, Clipboard, isolasjon | Ferdig |
| D1.11 Place bitmap og template-lag | Ferdig (se 2.3); høyreklikkmeny, Crop Image og Links gjenstår |
| D1.12 Send til Cut v1 | Ferdig (se 2.2) |
| D2.1 Tekst | Punkt-, område- og path-tekst, system-/Google-fonter, shaping, variable akser og outlines (2.6 til 2.10); Character/Paragraph-paneler gjenstår |
| D2.2 Pathfinder, Compound, Clipping | Pathfinder ferdig; compound paths og clipping masks gjenstår |
| D2.3 Gradienter og Swatches | Swatches ferdig (solide); gradienter og globale swatches gjenstår |
| D2.4 Path-kommandoer | Gjenstår |
| D2.5 SVG eksport/import | SVG-eksport ferdig (se 2.5); SVG-import finnes i enkel form |
| D2.6 PDF-eksport | Ferdig (Codex): Save PDF-dialog med forhåndsinnstillinger, lag, merker, bevar redigering; også EPS og DXF. Se WORK_LOG «Eksport del 1 og 2» |
| D2.7 Raster-eksport | PNG og JPEG (2.5) og Export for Screens med skala og suffiks (WORK_LOG «Eksport del 3») ferdig; WebP gjenstår |
| D2.8 Pencil, Shear, Eyedropper m.fl. | Gjenstår |
| D2.9 Transparency, History, Info, kommandosøk | Transparency ferdig; resten gjenstår |
| D2.10 Send til Cut v2 | Automatisk tekst til outlines ferdig (2.9); øvrige v2-deler gjenstår |
| D3.1 Outline Stroke og Expand | Gjenstår (Expand Shape finnes) |
| D3.2 Appearance og effekter | Appearance ferdig; effekter gjenstår |
| D3.3 til D3.8, fase 4 og 5 | Gjenstår |

## 4. Rekkefølge videre

Fase 1 er ferdig. Neste er fase 2, i denne rekkefølgen:

SVG-, PNG- og JPEG-eksport er gjort (2.5).

1. **D2.1 Tekst**: punkt-, område- og path-tekst er ferdig (2.6 til 2.10).
   **Neste del er egne Character- og Paragraph-paneler** (og tekstseksjoner i Properties), deretter
   klammer for tekst på path og reflow av områdetekst med canvas-håndtak.
2. D2.2 Compound paths og clipping masks (Make Clipping Mask i Layers-menyen venter på dette).
3. D2.4 Path-kommandoer (Join, Average, Offset Path, Simplify).
4. D2.6 PDF-eksport, D2.3 gradienter, D2.8 flere verktøy, D2.9 History/Info/kommandosøk.
5. D2.10 Send til Cut v2.

## 5. Kjente begrensninger og risiko

* Pen-markørtesten (`draw-feedback-workflows.mjs:43`) feilet én gang i en samlet kjøring hos Codex;
  den passerte i Claudes samlede kjøring 2026-10-16. Hold øye med den.
* Punkttekst-testen krever en installert familie med Fet Kursiv; den velger nå en slik familie selv
  (skymiljøet har DejaVu Sans uten kursiv som standard).
* Color, Stroke og Swatches endrer første fyll og første strek når en figur har flere.
* Autolagringstesten (`project-workflows.mjs:113`) er ustabil i skymiljøet; se WORK_LOG.
* Cut/sidecar-tester kan ikke kjøres i skymiljøet (jitpack.io er blokkert).
* Geometrikjernens worker har bare polygonal union; Pathfinder bruker Paper.js i hovedtråden.
