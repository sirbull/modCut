# Draw: status, hva er gjort og hva gjenstår

> Én side for å se hvor Draw står. Oppdateres i samme commit som endrer status.
> Detaljer: [hovedplanen](../DRAW_WORKSPACE.md) (spesifikasjon og byggeplan),
> [RIGHT_PANELS.md](RIGHT_PANELS.md) (høyresiden), [WORK_LOG.md](WORK_LOG.md) (hva som er gjort, dag for dag)
> og [HANDOFF.md](HANDOFF.md) (overlevering til neste agent).
> Sist oppdatert: 2026-10-17 (verktøy, D2.8 del A og B). Arbeidsgren: `feat/vector-draw` (Claude og Codex
> jobber begge der; hent alltid før du starter, og kjør `npm ci` ved endrede avhengigheter).

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
| Panelstolpe med grupper og faner | Ferdig | Swatches, Color, Stroke/Gradient/Transparency, Appearance, Transform/Align/Pathfinder, Character/Paragraph, Artboards | Brushes, Symbols, Color Guide, Graphic Styles (ikke bygget) |
| Layers | Ferdig | Øye, lås, fargelinje, thumbnail, navn, målsirkel, søppelkasse, søk, filter, bunnlinje med teller, Layer Options, panelmeny (≡) med Make Clipping Mask, flervalg av lag, dra utvalg til lag | Paste Remembers Layers; klipping av et helt lag |
| Properties | Ferdig | Tittel, navn, Character og Paragraph for tekst, Transform (referansepunkt, X, Y, B, H, lenke, rotasjon, Flip), Appearance (fyll, strek, vekt, opacity), form, Align, Quick Actions, Document uten utvalg | |
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

### 2.11 Character og Paragraph (D2.1e, 2026-10-17)

* Ny panelgruppe **Type** i panelstolpen med fanene **Character** (Mod+T) og **Paragraph** (Mod+Alt+T).
* **Character:** font (installerte familier med autofullføring), vekt (normal, fet, 100 til 900), stil
  (normal, kursiv), størrelse og linjeavstand i pt, **tracking** i tusendeler av em og **All Caps**.
* **Paragraph:** venstre, sentrert og høyre. For tekst på path gjelder justeringen lengden fra
  startforskyvningen til banens slutt.
* Samme seksjoner i **Properties** når tekst er valgt, og font, størrelse og justering i **kontrollinjen**.
* Hver endring formes på nytt med fonten for alle valgte tekster og blir **ett angresteg**. Ukjent
  familie avvises med beskjed. Valgene huskes for neste nye tekst.
* Tracking og All Caps er nye tegnegenskaper (`character.tracking`, `character.allCaps`) som fontmotoren
  bruker for punkt-, område- og path-tekst, også i linjebryting. All Caps endrer bare formingen, ikke
  innholdet. Eksport, Create Outlines og Send to Cut følger automatisk.
* Google-fonter: panelet bytter til installerte fonter; ny Google-font velges i Edit Text.

Tillegg 2026-10-17: **horisontal og vertikal skalering** (1 til 10 000 %), **baseline shift** (pt, opp) og
**kerning** Metrics eller None, i Character-panelet og Properties, lagret bare når de avviker fra standard,
med i linjebryting, tekst på path, eksport, outlines og Send to Cut.

Avsnitt 2026-10-17: **Justify with last line aligned left** (område-tekst; ekstra plass fordeles på
mellomrommene, siste linje i hvert avsnitt venstrestilles; punkttekst og tekst på path venstrestilles),
**venstre, høyre og førstelinje-innrykk** og **avstand før og etter avsnitt**, alt i punkt, i Paragraph-panelet
og Edit Text. Område-tekst bryter linjene innenfor innrykkene, og avstanden telles med når det avgjøres
hvilke linjer som får plass i rammen.

**Blandede stiler (2026-10-17):** en tekst kan ha deler med egen font, vekt, stil, størrelse, tracking,
baseline shift og skalering (`content.runs[].character`). I Edit Text markerer man tegn og bruker **Bold**,
**Italic**, **Set size** eller **Clear style**; stilen følger tegnene når teksten redigeres (ny tekst arver
stilen foran). Fontmotoren former hver del med sin egen font, bryter linjer over delene og gir linjer med
større tekst automatisk linjeavstand (1,2 ganger største størrelse). Endres en egenskap for hele objektet i
Character-panelet, overstyrer den samme egenskap i delene. Farge per del finnes ikke ennå.

Gjenstår i Character/Paragraph (fra kapittel 10.8): optisk og manuell kerning, Small Caps, understreking,
de andre justeringsvariantene (siste linje sentrert, høyre eller justert), farge per tekstdel, og redigering
med markør direkte på lerretet (i dag via Edit Text).

### 2.12 Compound paths og klippemasker (D2.2, 2026-10-17)

* **Object > Compound Path > Make (Mod+8):** valgte paths og former, også inne i grupper, blir én path
  med alle delbanene og fyllregelen even-odd, så overlapp blir hull. Den får malingen til objektet
  som ligger bakerst, og tar plassen til det øverste. **Release (Mod+Shift+Alt+8)** gir én path per
  delbane. Tekst må gjøres om til konturer først.
* **Object > Clipping Mask > Make (Mod+7)** og **Make Clipping Mask** i Layers-menyen: det øverste valgte
  objektet (path eller form) blir klippebane for de andre i en klippegruppe (`group` med `clip: true`)
  og mister fyll og strek, som i Illustrator. Gruppen er like stor som klippebanen, og det som er
  klippet bort kan ikke klikkes. **Release (Mod+Alt+7)** slår av klippingen; gruppen og den umalte
  banen blir stående.
* Canvas, SVG og PNG/JPEG klipper med Paper.js. **PDF, EPS, DXF og Send to Cut** får klippingen som
  ekte geometri (Paper.js-booleans): fylte objekter skjæres som flater, rene streker beholder bitene
  innenfor. Laseren kutter altså det man ser. Bilder i en klippemaske eksporteres hele (advarsel).
* Kode: `doc/compound.mjs` (rene kommandoer), `clip` i schema, `resolveClipping` og `clippedSubpaths`
  i `render/paper-adapter.mjs`.

Gjenstår i D2.2 (Draw Inside er gjort, se 2.17): klippemaske for et helt lag fra Layers-menyen (Illustrators
lagklipping), redigering av compound path som egne delbaner med Group Selection, tekst som klippebane,
og compound shapes med Alt-klikk i Pathfinder (fase 4).

### 2.13 Path-kommandoer, del A (D2.4, 2026-10-17)

Object > Path:
* **Join (Mod+J):** to åpne paths eller former slås sammen ved de nærmeste endepunktene, slik at banen
  går én vei; endepunkter som ligger oppå hverandre blir ett anker. Resultatet får det øverste
  objektets maling og plass. Én åpen path lukkes. Med to endepunkter valgt med Direct Selection
  møtes nettopp de (to i samme bane lukker den).
* **Average… (Mod+Alt+J):** valgte ankre (eller alle i valgte paths) til felles posisjon horisontalt,
  vertikalt eller begge, i verdenskoordinater.
* **Reverse Path Direction**, **Add Anchor Points** (nytt anker midt på hvert segment, kurven uendret)
  og **Remove Anchor Points** (valgte ankre fjernes, banen henger sammen).
* **Clean Up:** fjerner løse punkter, umalte objekter og tom tekst; klippebaner beholdes.
* Live former blir paths med samme id når de redigeres slik. Hver kommando er ett angresteg.
* Kode: `geom/path-commands.mjs` (rene funksjoner), `pathCommand` i `index.mjs`.

Del B (2026-10-17):
* **Offset Path…:** avstand i mm (negativ krymper), joins Miter, Round eller Bevel og miter limit, med
  live forhåndsvisning. Kilden blir stående og den nye banen legges rett over, som i Illustrator. Hull i
  compound paths krymper når omrisset vokser. Åpne baner blir et lukket omriss. Resultatet er rette
  segmenter innen 0,005 mm (ClipperOffset i `geom/kernel-js.mjs`, `offsetPaths`).
* **Simplify…:** kurvepresisjon i prosent med glider, «Straight lines», forhåndsvisning og antall punkter
  før og nå. Banen flates ut og tilpasses kurver på nytt (Paper.js), og lukkede baner beholder minst tre
  ankre.

Gjenstår fra 10.3: Smooth, Split Into Grid, Divide Objects Below, hjørnevinkel i Simplify,
Outline Stroke (D3.1) og Scissors/Knife-verktøy (D2.8).

### 2.14 Gradienter (D2.3, 2026-10-17)

* **Gradient-knappen** i Fill/Stroke-boksen og tasten **.** gir fyllet eller streken (etter fokus) en
  gradient over hvert valgt objekt: siste gradient du brukte, ellers hvit til svart. Ett angresteg.
* **Gradient-panelet** (fanen i Stroke-gruppen, Mod+F9): Fill/Stroke, type Linear eller Radial, vinkel,
  gradientlinje med én markør per stopp, og for valgt stopp farge, posisjon og opasitet. Legg til stopp
  (midt i største mellomrom, med fargen der), slett stopp (minst to) og Reverse.
* **Gradient-verktøyet (G):** dra over utvalget for å sette retning og lengde, med linje og live
  oppdatering; hele draget er ett angresteg. Shift låser til 45°. Klikk gir standardgradient.
* Properties viser «Fill linear gradient» med gradientlinjen og åpner Gradient-panelet.
* Canvas, PNG/JPEG og SVG viser ekte gradienter (Paper.js). **PDF, EPS og DXF** får foreløpig første
  stopps farge (advarsel). **Send to Cut** bruker første stopps farge som Cut-lag.
* Modellen: `paint: { type: 'linear'|'radial', stops, origin, angle, length, aspect }` i objektets egne
  koordinater (`doc/gradient.mjs`).

Gjenstår: gradient-annotator med flyttbare stopp på canvas, ellipse-aspekt for radial, midtpunkter,
gradient på strek langs og på tvers, gradientswatches, ekte gradienter i PDF/EPS (shading), og globale
swatches.

### 2.15 Verktøy, del A (D2.8, 2026-10-17)

* **Eyedropper (I):** klikk på et objekt kopierer fyll, strek, opasitet og blandingsmodus til utvalget
  (ett angresteg, også inn i grupper); uten utvalg blir det fyll og strek for nye objekter. **Alt-klikk**
  gir objektet du klikker utvalgets utseende. **Shift-klikk** henter fargen under pekeren (også fra
  bilder og gradienter) til fyll eller strek etter fokus.
* **Measure (i Eyedropper-gruppen):** dra for avstand, bredde, høyde og vinkel (mot klokka) i
  statuslinjen, med en rød linje på canvas. Shift låser til 45°. Linjen forsvinner ved verktøybytte.
* **Group Selection (i Direct Selection-gruppen):** første klikk velger objektet, hvert nytt klikk ett
  gruppenivå opp (aldri laget; innenfor en isolert gruppe). Dra flytter, Shift legger til.
* **Scissors (C):** klikk på en bane eller form. En lukket bane åpnes der (begge ender i klikkpunktet);
  en åpen bane deles i to, og den nye delen legges rett over. Ett angresteg.
* Kode: `doc/tool-rules.mjs` (Eyedropper, Measure, Group Selection) og `cutSubpath` i
  `geom/path-commands.mjs`. Hvert verktøy har egen markør.

Del B (2026-10-17):
* **Pencil (N):** frihånd; punktene tilpasses Bézier-kurver. Slutter streken nær starten, lukkes banen.
  Enter åpner Pencil Tool Options: fidelity (Accurate til Smooth), lukkeavstand i piksler og Keep selected.
  Streken får standard strek og ikke fyll, som i Illustrator. Ett angresteg.
* **Shear (i Scale-gruppen):** dra for å skjære rundt referansepunktet; aksen følger draget (Shift holder
  den horisontal). Enter eller **Object > Transform > Shear…** åpner dialog med vinkel og akse, Preview og Copy.
* **Arc (i Line-gruppen):** dra for en kvart ellipse som vanlig åpen path med strek og uten fyll; Shift gir
  en sirkelbue, klikk åpner dialog for mål.
* Felles `fitCurve` i `index.mjs` brukes av Pencil og Simplify, og sørger for at lukkede baner ikke
  faller sammen til ett anker. `toParentSpace` legger paths i en transformert forelder ved å flytte
  ankrene, siden paths alltid har identitetstransform.

Gjenstår i D2.8 og nær beslektet: Smooth og Path Eraser, Knife, Lasso, Magic Wand, Curvature og Spiral
(fase 3).

### 2.16 History, Info og kommandosøk (D2.9, 2026-10-17)

* **History-panel** (Info-gruppen i panelraden, sammen med Info): én rad per angresteg under raden
  **Open**. Klikk på en rad angrer eller gjør om til det steget (Open gir dokumentet slik det ble åpnet).
  Steg etter det gjeldende vises grå og kursiv; det gjeldende er markert. Et nytt steg etter å ha gått
  tilbake forkaster de grå stegene, som i Illustrator.
* **Info-panel (F8):** pekerens X og Y i mm (oppdateres mens musa beveger seg, uten å bygge de andre
  panelene på nytt), utvalgets W, H, Left og Top, fyll og strek (farge eller gradienttype, strekbredde)
  og siste Measure-måling (avstand og vinkel).
* **Kommandosøk (Ctrl/Cmd+Shift+K):** søk i alle kommandoer, verktøy og paneler som er ferdige, med
  snarvei og type ved siden av. Hvert søkeord må starte et ord i navnet eller nøkkelordene (for eksempel
  finner «mask» Make Clipping Mask). Piltaster velger, Enter kjører, Escape lukker uten å kjøre.
* Kode: `historyPanel`, `infoPanel` og `updateInfo` i `panels/ui.mjs`; `historyGoTo` og `pointer` i
  panel-API-et i `index.mjs`; `ui/command-search.mjs` (`commandEntries`, `searchCommands`, `openCommandSearch`).

Gjenstår i D2.9: History-panelets Delete State og snapshots, Info for tekst (tegn og ord), og
kommandosøk i hjelpemenyen.

### 2.17 Draw Normal, Behind og Inside (D2.2, 2026-10-17)

* Tre knapper under fyll og strek nederst i verktøylinjen; **Shift+D** sykler mellom dem. Statuslinjen
  viser modusen når den ikke er Normal. Modusen gjelder figurer, Pen, Pencil og ny tekst.
* **Draw Behind:** nye objekter legges rett under det valgte objektet, eller nederst i laget uten utvalg.
* **Draw Inside:** krever én valgt bane eller form (eller en klippegruppe, da brukes klippebanen).
  Første objekt lager en klippegruppe rundt målet i samme angresteg; senere objekter legges i samme
  gruppe, over det som er der og under klippebanen. Shift+D hopper over Inside når ingenting passende
  er valgt, og knappen er da avslått.
* Til forskjell fra Make Clipping Mask **beholder klippebanen fyll og strek**, som i Illustrator: fyllet
  tegnes under innholdet og streken over. Det gjelder lerret, SVG/PNG/PDF-eksport og Send to Cut
  (fyllet sendes før de klippede objektene, streken etter).
* Kode: `doc/draw-mode.mjs` (`placement`, `insideTarget`, `nextDrawMode`), `insertNew` i `index.mjs`,
  `maskFill`/`maskStroke` i `render/paper-adapter.mjs` og rekkefølgen i `io/cut-svg.mjs`.

Gjenstår: stiplede hjørnemerker rundt Draw Inside-målet på lerretet, Paste i Draw Inside, og
lagklipping fra Layers-menyen.

### 2.18 Send til Cut v2, del A (D2.10, 2026-10-17)

* **Object > Path > Outline Stroke:** en strek blir det fylte arealet den maler (Clipper-offset med
  streken sin join, cap og miter limit). Et objekt med fyll blir en gruppe med fyllet og omrisset, som i
  Illustrator. Ett angresteg. Stiplede streker og pilspisser tas ikke med ennå.
* **Send to Cut-dialogen** har nye valg:
  * **Strokes:** Centerline (standard, for skjæring og score) eller Outline Stroke (gravering av strekens
    areal; fyllet sendes under omrisset).
  * **Past the artboard:** send hele objekter (som før) eller kutt dem ved artboardkanten (fyll beholder
    overlappet, streker delene innenfor).
  * **Leave out duplicate paths** (på som standard): helt like baner sendes én gang, så laseren ikke
    skjærer to ganger.
* **Validering** i dialogen: antall noder, segmenter kortere enn 0,05 mm (ikke for tekst), duplikater,
  objekter over kanten, i tillegg til det som fantes.
* Med tom Cut og ett artboard sendes fortsatt alt direkte, men bare når det ikke finnes advarsler;
  ellers åpner dialogen så valgene kan tas.
* Kode: `outlineStroke` i `geom/kernel-js.mjs`, `outline-stroke` og `strokeOutlines` i `index.mjs`,
  `clipToRect` i `render/paper-adapter.mjs`, valgene `clipToBoard`, `outlines` og `dedupe` i `io/cut-svg.mjs`.

Del B (2026-10-17), **Update in Cut**:
* Hver sending lagres i `cutLinks` i Draw-dokumentet: artboard, Cut-fane, tidspunkt, en hash av det som
  ble sendt og valgene (Strokes, Past the artboard, duplikater, plassering). Lagringen er et eget
  angresteg i Draw («Send to Cut»).
* Artboards-panelet viser **Sent to Cut** eller **Changed since sending** ved artboardet, og knappen
  **Update in Cut** når artboardet er sendt før.
* Update in Cut gjentar valgene uten dialog (dialogen åpner bare hvis noe blokkerer). I Cut byttes bare
  elementene fra den forrige sendingen av artboardet ut; andre elementer og lagenes innstillinger blir.
  Har brukeren flyttet de sendte elementene i Cut, beholdes flyttingen. Ett angresteg i Cut.
* I Send to Cut-dialogen er **Update the earlier send in Cut** et valg under Target, og standard når
  artboardet er sendt før. Finnes ikke den forrige sendingen i Cut, legges artboardet til, med beskjed.
* Kode: `data.drawLink` på Cut-elementene og `link`/`replaceLink` i `bed.loadSVG` (den smale endringen i
  `bed.js` som kapittel 14.2 tillater), `sendDrawToCut` i `app.js`, `cutLink`, `cutStatus` og `sourceHash`
  i `index.mjs`.

Del C (2026-10-17):
* **Bilder** sendes som graveringsraster i Cut (samme oppsett som Cuts egen bildeimport: gråtone, svart
  lag), med senter, størrelse og rotasjon som i Draw, i samme angresteg og med samme lenke som banene.
  Referansebilder sendes ikke. Skjeve eller speilvendte bilder sendes rotert og skalert (advarsel);
  bilder i en klippemaske sendes hele (advarsel). Crop Image finnes ikke ennå i Draw.
* **All artboards, as laid out** i Artboard-valget (når det er flere): alle artboards i én sending,
  plassert som i dokumentet. Kunst som ligger mellom artboards sendes ikke, og «Cut at the artboard
  edge» kutter ved hvert artboard.
* Sammendraget sier for eksempel «3 paths (12 nodes) and 1 image as engraving will be sent».

Gjenstår i D2.10: objekter utenfor bedet (krever bedmål fra Cut i dialogen), og å finne igjen en sending
i en annen fane etter at prosjektet er lukket og åpnet (fane-id-er er per økt).

### 2.19 SVG-import til Draw-modellen (D2.5, 2026-10-17)

* Før ble en SVG med tekst, bilder, klipping eller gradienter importert som ett rasterbilde. Nå blir
  innholdet redigerbare Draw-objekter:
  * **Gradienter** (lineære og radiale, også `objectBoundingBox`) blir Draw-gradienter med stopp,
    stoppopasitet og vektor.
  * **`clip-path`** blir en klippegruppe med en umalt klippebane øverst (flere baner i klippebanen slås
    sammen til én bane).
  * **Innebygde bilder** (`data:`) blir bildenoder med PNG-asset, plassert, skalert og rotert som i filen.
    `preserveAspectRatio` tas ikke hensyn til (bildet fyller rammen).
  * **Tekst** blir punkttekst ved grunnlinjen, med familie, størrelse i punkt, vekt, kursiv, farge og
    `text-anchor` som justering. Draw former teksten med installert font når den redigeres eller sendes.
    `tspan`-oppsett med egne posisjoner slås sammen til én linje.
* Bare `mask` og `filter` gir fortsatt rasterbilde (med beskjed). Bilder som lenker til filer utenfor SVG-en
  fjernes som før.
* Kode: `prepareVector` og `convert` i `import-artwork.mjs`.

**WebP-eksport (D2.7, 2026-10-17):** Export As har WebP med oppløsning, bakgrunn (gjennomsiktig, hvit
eller artboardfarge) og kvalitet 0 til 10, og Export for Screens har en WebP-rad (kvalitet 8, gjennomsiktig).
Kode: `webp` i `EXPORT_FORMATS` (`io/export.mjs`), `EXPORT_TARGETS` (`io/export-plan.mjs`) og
`EXPORT_FILE_TYPES` (`electron/export-files.mjs`).

**Globale swatches og gradientswatches (D2.3, 2026-10-17):**
* Nye swatches er **globale** (hvitt hjørne i panelet), som standard i Illustrator. Fyll og strek som får
  fargen fra en global swatch husker den (`paint.swatch`). Endres fargen i Swatch Options, får alle disse
  objektene ny farge i samme angresteg. **Global** kan slås av i Swatch Options (koblingene fjernes, fargene
  blir). Sletting av en global swatch beholder fargene uten kobling. Endres fargen i Color-panelet, brytes
  koblingen for det objektet. Nye objekter som tegnes etterpå, får vanlig farge.
* **Gradientswatches:** New Swatch med gradient i fokusert fyll eller strek lager en gradientswatch (type,
  stopp og vinkel). Klikk legger gradienten over hvert valgte objekts boks. Swatch Options gir bare navn.
* Kode: `addSwatch`, `swatchPaint`, `linkedPaints` og `editSwatch` i `doc/swatches.mjs`; `swatch`-argumentet
  i `changePaint` og `paint`.

### 2.20 Expand og Expand Appearance (D3.1, 2026-10-17)

* **Object > Expand…** med Fill og Stroke: hvert fyll blir egen bane (når det er flere), og hver strek blir
  det fylte arealet den maler. Streker som ikke utvides, blir liggende på en bane over fyllene.
* **Object > Expand Appearance:** for objekter med flere fyll og streker (eller fyll og strek). Delene ligger
  i samme rekkefølge som de tegnes, med sin egen opasitet og blandingsmodus; objektets opasitet og
  blandingsmodus flyttes til gruppen.
* **Outline Stroke** bruker samme kode og utvider nå alle synlige streker, ikke bare den første.
* Kode: `expanded` og `expandSelection` i `pathCommand` i `index.mjs`, `expandDialog` i `ui/dialogs.mjs`.

Gjenstår i D3.1: utvidelse av effekter (kommer med D3.2), stiplede streker og pilspisser.

### 2.21 Select-meny, Magic Wand og Lasso (D3.5, 2026-10-17)

* **Select-menyen:** All, All on Active Artboard, Deselect, **Reselect** (Mod+6, gjentar siste Select-kommando
  på nytt utvalg), **Inverse**, **Next Object Above/Below** (Mod+Alt+] og [), **Same** (Appearance, Fill &
  Stroke, Fill Color, Opacity, Stroke Color, Stroke Weight, Shape, Text; sammenligner alle malte objekter,
  også inne i grupper), **Object** (All on Same Layers, Stray Points, Open Paths, Clipping Masks, Text
  Objects, Raster Images), **Save Selection…** og **Edit Selection…** (velg eller slett). Lagrede utvalg
  ligger i dokumentet (`settings.savedSelections`), og lagring er ett angresteg.
* **Magic Wand (Y):** klikk velger objekter med lignende fyll; Enter åpner toleranser for fyll- og
  strekfarge (0 til 255 per kanal), strekbredde og opasitet. Shift legger til, Alt trekker fra.
* **Lasso (Q):** dra rundt ankerpunkter for å velge dem (som Direct Selection); Shift legger til, Alt trekker fra.
* Kode: `doc/select-rules.mjs` (rene regler), `selectionCommand` i `index.mjs`, `lasso` i `tools/paths.mjs`,
  gestene i `tools/interactions.mjs`, Select-menyen i `electron/main.mjs`.

Gjenstår i D3.5: Select > Same > Graphic Style (krever grafiske stiler), Direction Handles, og Lasso som
velger hele objekter med Alt+Mod.

### 2.22 Shape Builder, Knife og Eraser (D3.4, 2026-10-17)

* **Shape Builder (Shift+M):** med minst to valgte former deles de i regioner når man trykker ned. Regionene
  draget krysser skraveres og slås sammen til én bane når man slipper (fyll fra regionen der draget startet);
  resten blir egne baner. **Alt+drag** sletter regionene i stedet (skravert rødt). Ett angresteg.
* **Knife (i Eraser-gruppen):** dra over fylte former for å dele dem langs linjen (et kutt på 0,02 mm).
  Virker på utvalget, eller på alle fylte former når ingenting er valgt.
* **Eraser (Shift+E):** dra for å viske ut fra fylte former med en rund pensel (diameter på Enter, standard
  3 mm); biter som blir skilt, blir egne baner. Utvalget, eller alle fylte former uten utvalg.
* Delene beholder objektets utseende og havner i samme forelder (også i transformerte grupper).
* Kode: `geom/region-ops.mjs` (`pickRegions`, `mergeRegions`, `knifeCut`, `erase`, `pieces`, `bandAround`),
  `shapeBuilder*`, `cutWith`, `knife` og `eraser` i `index.mjs`, gestene i `tools/interactions.mjs`.

Gjenstår i D3.4: Path Eraser (visker deler av åpne baner), Shape Builder-valg (gap detection,
fargeplukking), og Eraser med trykkfølsomhet.

### 2.23 Transform Each, Split Into Grid og Free Transform (D3.6, 2026-10-17)

* **Object > Transform > Transform Each…** (Mod+Shift+Alt+D): skalering (horisontal og vertikal), flytting,
  rotasjon og speiling X/Y for hvert valgte objekt rundt sitt eget referansepunkt (ni valg), med **Random**
  (hver verdi ganges med en tilfeldig faktor per objekt) og **Copy**. Ett angresteg.
* **Object > Path > Split Into Grid…:** hver valgt bane eller form blir rader x kolonner rektangler innenfor
  sine grenser, med rad- og kolonnemellomrom i mm og samme utseende. «Add Guides» venter på hjelpelinjer
  som dokumentobjekter.
* **Free Transform (E):** dra et hjørne av utvalgsboksen for fri forvrengning (de andre hjørnene står);
  baner og former, også inne i grupper, følger bilineært, med live forhåndsvisning og ett angresteg.
  Skalering og rotasjon gjøres som før med Selection-verktøyets boks.
* Kode: `geom/transform-each.mjs` (`transformEachMatrix`, `gridCells`, `distortSubpaths`), kommandoene i
  `pathCommand` og `freeDistort*` i `index.mjs`, gesten i `tools/interactions.mjs`.

Gjenstår i D3.6: perspektiv (Shift i Free Transform) og forhåndsvisning i Transform Each-dialogen.

### 2.24 Levende effekter, del A (D3.2, 2026-10-17)

* Effekter ligger i `appearance.effects` og brukes i rekkefølge når objektet tegnes, eksporteres og sendes
  til Cut, mens objektets egne ankre forblir redigerbare. Banen og formen får effektene; tekst og grupper
  ikke ennå.
* **Effect-menyen:** Apply Last Effect, Last Effect…, Distort & Transform > **Transform…** (skalering,
  flytting, rotasjon og antall kopier), Path > **Offset Path…**, Stylize > **Round Corners…**. Hver ny effekt
  er ett angresteg. Effektene finnes også i kommandosøket.
* **Appearance-panelet** viser effektene: øyet skjuler, dobbeltklikk redigerer, pil opp flytter, søppelbøtten
  sletter. «Add Effect…» legger til fra panelet.
* **Expand Appearance** baker effektene inn i vanlige baner.
* Offset Path bruker Clipper, som lastes når arbeidsflaten starter; til den er lastet tegnes objektet uten
  Offset Path, og så tegnes det på nytt.
* Kode: `doc/effects.mjs` (`EFFECTS`, `effect`, `applyVectorEffects`), `make`/`effectiveSubpaths` i
  `render/paper-adapter.mjs`, `offsetPathsSync`/`loadGeometry` i `geom/kernel-js.mjs`, `addEffect`/`editEffect`
  i `index.mjs`, effektlisten i `panels/ui.mjs`. Skjemaet validerer kjente effekter.

Del B (2026-10-17):
* Nye vektoreffekter under Distort & Transform: **Zig Zag** (størrelse, rygger per segment, Smooth),
  **Pucker & Bloat** (−200 til 200 %), **Roughen** (størrelse, detalj per mm og en variasjon som gjør
  resultatet likt hver gang) og **Twist** (vinkel, mest i midten).
* **Drop Shadow** (Stylize): X/Y-forskyvning, uskarphet, farge og opasitet. Skyggen er et raster laget med
  dokumentets rastereffektoppløsning (standard 300 ppi) og ligger rett under objektet, så den følger med på
  lerretet og i PNG, JPEG, WebP, SVG og PDF. Send to Cut tar ikke med skygger. Virker også på tekst.

Gjenstår i D3.2: Inner/Outer Glow, Feather, Gaussian Blur, Free Distort som effekt, effekter på grupper,
og Preview i effektdialogene.

### 2.25 Document Info, Links, Crop Image og Edit in Draw (D3.8, 2026-10-17)

* **Document Info** (fane i Info-gruppen): artboards, lag, objekter per type, ankerpunkter, åpne baner,
  klippemasker, objekter med effekter, skjulte eller ikke-utskrivbare objekter, fonter (også fra tekstdeler)
  og bilder med piksler og ppi; for hele dokumentet eller bare utvalget. Påminnelse om åpne baner og tom tekst
  før Send to Cut.
* **Links** (fane i Info-gruppen): alle plasserte bilder med størrelse, ppi og «Embedded». Klikk velger
  bildet; **Replace…** bytter bildefil og beholder plassering og bredde (høyden følger det nye bildet).
* **Crop Image** (Object-menyen og Properties for bilder): beskjær i mm fra hver synlig kant; negative tall
  henter fram beskåret del, og «Show the whole image again» nullstiller. Ikke-destruktivt: bildet i dokumentet
  er helt, `crop` sier hvilken del som vises. Lerret, eksport og Send to Cut viser bare den beskårne delen.
  Ett angresteg.
* **Cut > høyreklikk > Edit in Draw:** valgte Cut-objekter kopieres til Draw på et nytt artboard i bedstørrelse
  («From Cut»), på samme plass som på bedet. Bilder blir i Cut.
* Kode: `doc/document-info.mjs`, `documentInfoPanel` og `linksPanel` i `panels/ui.mjs`, `cropImage` i
  `geom/transform-each.mjs`, beskjæring ved lasting i `render/paper-adapter.mjs`, `replaceImage` og `editFromCut`
  i `index.mjs`, `editInDraw` og menypunktet i `app.js`.

Gjenstår i D3.8: lenkede (ikke innebygde) bilder med status, Crop Image med håndtak på lerretet.

### 2.26 Image Trace (D3.3, 2026-10-17)

* **Image Trace-panelet** (Window > Image Trace, egen panelgruppe): velg et plassert bilde, velg preset og
  trykk Trace. Resultatet er en gruppe «Image Trace» med en fylt bane per farge (evenodd, så hull blir hull)
  over bildet, og bildet skjules. Ett angresteg; angre henter bildet fram igjen.
* **Presets:** Black and White Logo, Silhouettes, 3, 6 og 16 Colors, Shades of Gray, og to laserpresets:
  «Laser: Cut outline» (bare ytre konturer, små detaljer under 0,5 mm fjernes) og «Laser: Engrave fill».
* **Innstillinger:** modus (svart-hvitt, gråtoner, farge), terskel eller antall farger, støy (minste område
  i piksler), fidelity (hvor tett banene følger pikslene), Ignore White og Outer contours only.
* Hjørner holdes skarpe: konturen deles ved knekker over 60 grader, og bare strekkene mellom dem får
  tilpassede kurver. En firkant blir fire ankerpunkter.
* Beskårne bilder spores bare innenfor beskjæringen. Store bilder skaleres ned til maks 1 megapiksel først.
* Statistikk etter sporing: antall baner, ankerpunkter og farger.
* Kode: `geom/trace.mjs` (presets, kvantisering med k-means for farger, støyfjerning, konturer langs
  pikselkanter, Douglas-Peucker og hjørner), `traceImage` og `traceSubpath` i `index.mjs`, `imageTracePanel`
  i `panels/ui.mjs`.

Gjenstår i D3.3: live trace som oppdateres når innstillingene endres (nå er sporingen alltid «Make and Expand»),
og egen Object > Image Trace-meny.

### 2.27 Adobe Illustrator-eksport (D3.7, 2026-10-17)

* **File > Export > Export As… > Adobe Illustrator (PDF compatible) (.ai):** samme filformat som Illustrator
  skriver med «Create PDF Compatible File»: en PDF 1.6 der hvert artboard er en side, hvert lag et PDF-lag,
  med Illustrators XMP-felt (`illustrator:Type`, sider, største sidestørrelse, gjennomsiktighet), ArtBox lik
  artboardet, miniatyrbilder og Draw-dokumentet vedlagt.
* Illustrator åpner filen som grafikk; levende effekter og tekst kommer som utvidet grafikk. modCut åpner
  .ai-filen igjen som det redigerbare Draw-dokumentet (samme vedlegg som «Preserve modCut editing
  capabilities» i PDF). Dialogen sier dette.
* DXF-eksport fantes fra D2.6; D3.7 er dermed komplett.
* Kode: `io/ai.mjs` (`AI_OPTIONS`, `aiMetadata`, `hasTransparency`), `metadata` og `artBox` i `pdfDocument`
  (`io/pdf.mjs`), `ai` i `EXPORT_TARGETS` og `EXPORT_FILE_TYPES`, åpning i `app.js`.

Gjenstår: Illustrators private AI-data (native lag, symboler og effekter som Illustrator selv kan redigere)
skrives ikke; formatet er ikke offentlig.

### 2.28 Width-verktøy og breddeprofiler (D4.1, 2026-10-17)

* **Width-verktøyet (Shift+W):** dra på en strek der den skal bli bredere eller smalere; et nytt breddepunkt
  legges til der. Dra i endene av et breddepunkt for å endre det, dra i midten (ruten) for å flytte det langs
  banen. Alt endrer bare én side. Dobbeltklikk på et breddepunkt åpner **Width Point Edit** med hver side i mm
  og «Delete this width point». Hver dragning er ett angresteg. Breddepunktene vises når pekeren er over en
  strek med profil.
* **Stroke-panelet > Profile:** Uniform og Width Profile 1 til 6, «Custom» for profiler laget med verktøyet,
  og Flip Along og Flip Across.
* Profilen lagres som `widthProfile` på streken (`{t, left, right}`, sidene som andel av strekvekten), så
  profilen skaleres når vekten endres. Uniform fjerner profilen.
* Tegning: en strek med profil tegnes som en fylt omriss-form (lerret, SVG, PDF, PNG). Outline Stroke og
  Outline Stroke ved Send to Cut bruker samme omriss.
* Kode: `geom/width-profile.mjs`, `variableStrokeSubpaths`, `strokeLocation` og `widthHandles` i
  `render/paper-adapter.mjs`, `widthSession`, `widthDrag` og `widthPointEdit` i `index.mjs`, Width-grenen i
  `tools/interactions.mjs`, Profile i `strokePanel`.

Gjenstår i D4.1: stiplede streker med profil (stiplingen ignoreres når profilen er på), Inside og Outside
justering med profil, egne lagrede profiler, og gradient langs eller på tvers av streken (gradient på strek
finnes, men bare «within stroke»).

### 2.29 Blend (D4.2, 2026-10-18)

* **Object > Blend > Make (Alt+Mod+B):** de valgte objektene (samme lag eller gruppe) blir nøkler i en
  blend-gruppe («Blend»). Mellomformene tegnes mellom hvert nabopar av nøkler, med form, fyll, strek,
  strekbredde og opasitet interpolert. Ett angresteg.
* **Blend Options** (Object-menyen, eller dobbeltklikk på Blend-verktøyet): Smooth Color, Specified Steps og
  Specified Distance. Uten valgt blend settes valgene for nye blends.
* **Release (Alt+Shift+Mod+B)** beholder nøklene og fjerner mellomformene; **Expand** gjør mellomformene til
  vanlige baner mellom nøklene i en vanlig gruppe; **Reverse Front to Back** snur stablingen.
* **Blend-verktøyet (W):** klikk ett objekt og så et annet.
* Former med ulikt antall ankerpunkter matches ved å dele de lengste segmentene; lukkede baner roteres og
  snus så hvert punkt går korteste vei, og en delbane bare den ene nøkkelen har vokser fra sitt eget sentrum.
* Mellomformene er med på lerret (også i Outline), i SVG, PDF, PNG og i Send to Cut (mellom nøklene).
* Kode: `geom/blend.mjs`, `blendData` og `placeBlend` i `render/paper-adapter.mjs`, `makeBlend`,
  `blendOptionsCommand`, `blendClick` og blend-kommandoene i `index.mjs`, blend i `io/cut-svg.mjs`.

**Spine (2026-10-18):** Object > Blend > Replace Spine gjør en merket bane til blendens ryggrad: banen lagres i
`blend.spine` (i gruppens rom) og fjernes, nøklene flyttes til like store deler av lengden, og trinnene legges langs
den. «Align to Path» dreier trinnene etter retningen. Reverse Spine snur den, så nøklene bytter plass. Reverse Front
to Back snur ryggraden sammen med stablingen, Release gir den tilbake som en umalt bane, og Specified Distance måler
langs ryggraden. Kode: `spineCurve`, `placeOnSpine` og `keyPosition` i `geom/blend.mjs`, `replaceSpine`,
`placeKeys` og `reverseSpine` i `index.mjs`.

Gjenstår i D4.2: redigere ryggraden direkte med Direct Selection (nå: Release, rediger, lag på nytt), tekst og
grupper som nøkler (bare baner og former blir med), og Object > Expand på blends.

### 2.30 Warp, Live Pathfinder og opacity masks (D4.3, 2026-10-18)

* **Effect > Warp** med alle 15 stilene (Arc, Arc Lower, Arc Upper, Arch, Bulge, Shell Lower og Upper, Flag,
  Wave, Fish, Rise, Fisheye, Inflate, Squeeze, Twist): menypunktet åpner **Warp Options** med stilen valgt,
  med Bend, Horizontal/Vertical og Distortion. En levende effekt som de andre: ankerpunktene beholdes, og
  Appearance viser «Warp: Arch» osv.
* **Effect > Pathfinder** (Add, Intersect, Exclude, Subtract, Minus Back, Divide, Trim, Merge, Crop, Outline)
  på en gruppe: banene og formene i gruppen tegnes kombinert, med kildens utseende, og delene er fortsatt
  redigerbare. Send to Cut får resultatet; Expand Appearance gjør det til vanlige baner.
* **Opacity masks** (Transparency-panelet): **Make Mask** gjør det øverste av de valgte objektene til maske
  for resten (lys viser, mørk skjuler), med **Clip** og **Invert Mask**, og **Release**. Ett angresteg.
  Masken tegnes som alfa med `destination-in` i gruppens eget lag. PNG får masken direkte; SVG, PDF, EPS og
  DXF får maskerte grupper som bilder i 300 ppi. Send to Cut sender det maskerte uten masken og varsler.
* Kode: `geom/warp.mjs`, `warp` og `pathfinder` i `doc/effects.mjs`, `placeLivePathfinder`,
  `placeOpacityMask` og `rasterMasks` i `render/paper-adapter.mjs`, `mask-*`, `live-*` og `warp-*` i `index.mjs`,
  Transparency-panelet, `io/cut-svg.mjs`.

Gjenstår i D4.3: Rasterize-effekten, Envelope Distort (Make with Warp/Mesh), redigering av maskekunsten
(den er skjult; Release først), og Live Pathfinder med grupper eller tekst som deler.

### 2.31 Paintbrush og Blob Brush (D4.4, 2026-10-18)

* **Paintbrush (B):** frihånd som Pencil, men streket med en kalligrafisk pensel: flat spiss med vinkel og
  rundhet, så streken er tynn langs spissen og bred på tvers. Resultatet er en vanlig bane med strekvekt lik
  penselstørrelsen og en breddeprofil (D4.1), runde ender og hjørner. **Paintbrush Tool Options** (Enter eller
  dobbeltklikk): størrelse, vinkel, rundhet, fidelity, Fill new brush strokes og Keep selected.
* **Blob Brush (Shift+B):** draget blir en fylt form i strekfargen (uten strek), som slås sammen med fylte,
  ustrekede baner i samme farge som den berører (eller bare de valgte, med Merge only with selection). Ett
  angresteg. **Blob Brush Tool Options**: størrelse, fidelity, Keep selected og Merge only with selection.
* Kode: `geom/brush.mjs` (`nibWidth`, `calligraphicProfile`, validering), `paintbrush` og `blobBrush` i
  `index.mjs`, grenene i `tools/interactions.mjs`, dialogene i `ui/dialogs.mjs`.

Gjenstår i D4.4: art-, scatter- og pattern-pensler, Brushes-panelet og trykkfølsomhet.

### 2.32 TIFF, Graphic Styles, Navigator, Rotate View, Asset Export og arbeidsområder (D4.5, 2026-10-18)

* **TIFF-eksport** (Export As > TIFF): oppløsning, bakgrunn (gjennomsiktig gir alfakanal) og komprimering
  (PackBits eller ingen); ett artboard per fil. EPS-eksport fantes fra D2.6.
* **Graphic Styles** (fane ved Appearance): [Default] og egne stiler; **New Graphic Style** lager en fra det
  valgte objektet (fyll, strek, effekter, opasitet, blanding), klikk gir stilen til utvalget i ett angresteg,
  **Delete** sletter den valgte. Lagres i dokumentet (`graphicStyles`).
* **Navigator** (egen panelgruppe og Window-menyen): hele dokumentet i liten skala med den synlige delen i rødt;
  klikk eller dra for å flytte visningen, og zoom i prosent. Følger panorering og zoom.
* **Rotate View (Shift+H):** dra for å dreie visningen (Shift: 15°), View > Reset Rotate View. Panorering med
  Hand og hjul følger rotasjonen. Tegningen endres ikke.
* **Asset Export** (egen panelgruppe): Add Selection legger til objektene som egne eiendeler (navn kan endres),
  og Export… skriver hver som egen fil (PNG, JPEG, WebP eller SVG) i valgt skala til en mappe, beskåret til
  objektets kanter. Lagres i dokumentet (`exportAssets`).
* **Window-menyen** i Draw: Workspace (Essentials, New Workspace…, Manage Workspaces…) og panelene.
  Arbeidsområder lagrer panelgruppe, faner, dock-deling, sammenslåtte paneler og Control Bar på denne maskinen.
* Kode: `io/tiff.mjs`, `doc/graphic-styles.mjs`, `ui/workspaces.mjs`, `navigatorImage`, `rotateView`,
  `exportAssets` og `exportBoard({ area, only })` i `index.mjs` og `export-controller.mjs`, panelene i `panels/ui.mjs`.

Gjenstår i D4.5: Graphic Styles-biblioteker, Asset Export med flere formater per eiendel samtidig og PDF,
rotert visning for Artboard-verktøyets etiketter (de roteres med visningen).

### 2.33 Ytelsespass (D4.6, 2026-10-18)

Målt med `--draw-perf` (5 000 baner, 200 000 ankerpunkter, Electron i dette miljøet, millisekunder inkludert to
bilder for tegning):

| Steg | Før | Etter |
| --- | --- | --- |
| Sette inn alle i ett angresteg | over 15 minutter (ble ikke ferdig) | ca 11 000 |
| Panorere / zoome ett steg | ikke målbart (låst) | 30 / 30 (forrige bilde flyttes, så tegnes alt skarpt) |
| Full, skarp tegning | | ca 76 (ca 45 uten de to bildene) |
| Select All | | ca 300 |
| Flytte alt (Nudge) | | ca 2 600 |
| Flytte ett objekt | | ca 450 (selve handlingen ca 160) |
| Angre | | ca 500 |

Tiltak:

* **Copy-on-write-dokument** (`doc/draft.mjs`): en redigering kopierer bare stien til det som endres; resten
  deles med forrige tilstand. Tidligere ble hele dokumentet klonet to ganger per kommando.
* **Inkrementell validering og indeks:** noder som allerede er validert (frosne øyeblikksbilder) hoppes over;
  indeksen oppdateres bare for endrede barnelister; oppslag i redigeringer bruker indeksens sti.
* **`differences`** går bare endrede stier (identitet først), og patcher deler frosne verdier i stedet for å klone.
* **`updateNodes` og `insertNodes`**: transformasjoner av mange objekter blir én redigering.
* **Renderer:** nøkler og fingeravtrykk caches per nodeobjekt, grenser caches per objekt, én tegning per bilde,
  og når en full tegning er treg flyttes og skaleres forrige bilde under panorering og zoom (Hand, hjul,
  Navigator, Rotate View) til visningen står stille i 150 ms. Miniatyrer caches per nodeobjekt og store lag
  tegnes etter en pause.
* **Panel:** Layers viser de første 200 radene med «Show more», `layoutDock` tvinger ikke layout, og
  `selectedIds` var kubisk.

Gjenstår i D4.6: full tegning av 200 000 ankre er ca 45 ms (ca 22 bilder/s) og ikke 50 bilder/s; under panorering
brukes derfor forrige bilde. Innsetting av tusenvis av objekter er forbedret (se WORK_LOG «Innsetting av mange
objekter»): en transaksjon validerer én gang, og import bruker `insertNodes`; 5 000 enkeltinnsettinger tar ca 5,6 s
(før 12,8 s). Gjenopprettingskopien (JSON av hele dokumentet) tar ca 150 ms etter
en pause.

### 2.34 Fase 5, del A: PLT- og GIF-eksport og Package (2026-10-18)

* **PLT (HP-GL)** i Export As: 40 enheter per mm, origo nede til venstre, én penn per strek- eller fyllfarge
  (opptil 8), kurver som korte linjer med valgt nøyaktighet. For plottere og skjæreplottere; appens egen
  HP-GL-import leser filen tilbake.
* **GIF** i Export As: én ramme med inntil 256 farger (median cut) og av/på-gjennomsiktighet.
* **File > Package…:** mappen «<navn> Folder» med dokumentet (som File > Save skriver det, også Cut-delen),
  hvert plassert bilde i Links, Fonts.txt (fonter og kilde) og Report.txt (innhold fra Document Info).
* Kode: `io/plt.mjs`, `io/gif.mjs`, `packageDocument` i `export-controller.mjs`, `documentPayload` i appens
  eksportbro.

Gjenstår i fase 5: AVIF-eksport (Chromium kan ikke kode AVIF fra lerret), Vertical Type, Touch Type,
Glyphs-panel, Scribble, PDF/X-4, EPS-import, egne hurtigtaster, MCP-server og lokalisering.

### 2.35 Fase 5, del B: egne hurtigtaster, Glyphs og Scribble (2026-10-18)

* **Edit > Keyboard Shortcuts…:** alle verktøy og kommandoer med hurtigtast, søk, klikk og trykk de nye tastene
  (Backspace/Delete fjerner, Escape avbryter), Reset All. Konflikter avvises med navn på begge. Lagres i
  brukerdatamappen (`draw-shortcuts.json`) av hovedprosessen, som bygger menyene med dem; lerret og verktøytips
  bruker de samme.
* **Glyphs** (fane ved Character og Paragraph): alle tegn i fonten til valgt tekst (eller standardfonten), sist
  brukte først. Klikk setter tegnet inn ved markøren i tekstredigereren; med en tekst valgt åpnes redigereren først.
* **Effect > Stylize > Scribble…:** fyllet tegnes som én skriblet linje i fyllfargen (vinkel, avstand,
  strekbredde, overlapp, variasjon, kurvethet, frø). Hull respekteres. Send to Cut sender linjen som strek.
* Kode: overstyringer i `keymap.mjs` (`setKeyOverrides`, `validateOverrides`, `keyFromEvent`),
  `ui/shortcuts-dialog.mjs`, `characters` i `electron/font-service.mjs` og `glyphsPanel`, `geom/scribble.mjs` og
  `scribbleOf` i `doc/effects.mjs`.

Gjenstår i fase 5: AVIF-eksport, Vertical Type, Touch Type, PDF/X-4, EPS-import, MCP-server og lokalisering.

### 2.36 Fase 5, del C: Touch Type og Vertical Type (2026-10-18)

* **Touch Type (Shift+T):** klikk et tegn i en tekst; dra for å flytte det (sideveis og opp/ned), firkanten
  øverst til høyre skalerer, sirkelen over roterer. Bare det tegnet endres, teksten forblir redigerbar. Ett
  angresteg per dragning. Lagres som tegnstil på teksten (`rotation`, `xShift`, `baselineShift`, skalering).
* **Vertical Type:** klikk for loddrett punkttekst; hver linje er en kolonne med stående tegn, ett em mellom tegnene,
  kolonnene fra høyre mot venstre med linjeavstanden. Venstre/midt/høyre justering er topp/midt/bunn.
* Glyfene i tekstlayouten har nå `index` (hvor i teksten de står).
* Kode: `rotation`/`xShift` i `doc/text.mjs` (`styleRange`, `characterAt`) og skjemaet, tegnrotasjon og loddrett
  layout i `electron/font-service.mjs`, `touchGlyphAt`, `touchGlyph` og `touchType` i `index.mjs`, Touch Type-grenen
  i `tools/interactions.mjs`, `paragraph.orientation`.

Gjenstår i fase 5: AVIF-eksport, PDF/X-4, EPS-import, MCP-server og lokalisering. Loddrett tekst støttes ikke som
områdetekst eller tekst på bane.

### 2.37 Fase 5, del D: PDF/X-4 og EPS-import (2026-10-18)

* **PDF/X-4:** Save PDF har valget **Standard** (None eller PDF/X-4:2008) og forhåndsinnstillingen
  **[PDF/X-4:2008]** (lag og levende transparens beholdt, trim marks, 3 mm bleed). Filen får OutputIntent
  (`GTS_PDFX`) med en innebygd ICC-profil, XMP med `pdfxid:GTS_PDFXVersion` og dokument-ID-er, `/Trapped /False`
  og TrimBox/BleedBox på hver side. Kunstverket er DeviceRGB, så utdatahensikten er sRGB skrevet som en ICC v2
  utdataprofil (klasse `prtr`, Lab-tabeller A2B0/B2A0/gamt) som modCut lager selv; LittleCMS leser den og gjengir
  fargene eksakt. Standarden låser det den ikke tillater: PDF 1.6 eller nyere, ingen vedlagt Draw-dokument
  (Preserve editing), ingen sideinformasjon (den bruker en ikke-innebygd font). Kode: `io/pdfx.mjs`, `pdf.mjs`.
  Ikke gjort: CMYK-utdatahensikt (FOGRA/GRACoL) og CMYK-konvertering, og en ekstern PDF/X-validator (ingen er
  installert her).
* **EPS-import:** File > Open, Import og slipp av `.eps`, `.ps` og eldre `.ai` (PostScript, uten PDF-del) i både
  Cut og Draw. `renderer/epsimport.js` er en liten PostScript-tolk: stakker, ordbøker, prosedyrer og løkker, stier
  og buer, gråtone/RGB/CMYK/HSB og Separation/DeviceN via tint-funksjonen, transformasjoner, klipping (SVG
  clipPath), 8-bits og 1-bits bilder (hex, ASCII85 eller binært, også `imagemask`), Type 3-fonter som konturer
  og Illustrators egne operatorer (`m L C f S k Xa *u Ln` med flere) når procset mangler. Filer med DOS-binærhode
  åpnes. Resultatet blir SVG i punkt med lag som grupper, og går gjennom samme import som SVG.
  Advarsler sier hva som ikke ble med: tekst i andre fonter enn Type 3, gradienter (`shfill`), ukjente operatorer,
  sider etter den første. Testet mot egen EPS-eksport, Illustrator AI-format og matplotlib-EPS (stier, klipp,
  bilde, Type 3-tekst).
  Ikke gjort: Type 1/TrueType-tekst, gradienter og mønstre, filtrene Flate/LZW/RunLength/DCT for bilder, og nyere
  Illustrator-EPS som bare tegner gjennom AGM-procset kan mangle deler.

### 2.38 Fase 5, del E: modCut som MCP-server (2026-10-18)

* **Preferences > Automation:** bryteren «Let AI agents draw in modCut (MCP server)» (av som standard) starter en
  lokal MCP-server (Streamable HTTP, bare JSON-svar) på `http://127.0.0.1:47823/mcp`. Feltet under viser kommandoen
  for Claude Code: `claude mcp add --transport http modcut <url> --header "Authorization: Bearer <token>"`.
* **Sikkerhet:** lytter bare på 127.0.0.1, krever bearer-token (tilfeldig, lagret i `mcp.json` i brukerdata med
  filmodus 600), avviser `Origin` som ikke er lokal (nettsider kan ikke nå den), og alt går gjennom Draw-kommandoene,
  så hvert kall er ett angresteg.
* **Verktøy:** `document_info`, `list_objects`, `new_document`, `add_artboard`, `add_shape` (rektangel, avrundet
  rektangel, ellipse, polygon, stjerne, linje), `add_svg`, `update_object` (navn, fyll, strek, opasitet, synlig,
  lås, flytt), `delete_objects`, `select_objects`, `run_command` og `list_commands` (alle Draw-kommandoer, for
  eksempel group, pathfinder-unite, undo), `export_artboard` (PNG som bilde eller SVG som tekst) og `send_to_cut`.
  Mål i mm; x og y fra artboardets øvre venstre hjørne, y nedover.
* **Kode:** `electron/mcp-tools.mjs` (verktøydefinisjoner), `electron/mcp-server.mjs` (JSON-RPC og HTTP),
  `electron/mcp-host.mjs` (innstilling, token og rundtur til rendereren), `renderer/draw/mcp-runner.mjs` (utfører
  kallene i aktiv Draw-fane), IPC `getMcpServer`/`setMcpServer`/`mcp-call`/`mcpResult`.
* Ikke gjort: SSE-strøm (serveren sender aldri forespørsler selv), ressurser og prompts, valgfri port i
  innstillingene, og tekst/tekst på bane som egne verktøy (det går via `add_svg`).

### 2.39 Fase 5, del F: lokalisering, norsk og engelsk (2026-10-18)

* **Preferences > Language:** System (følger operativsystemet; nb, nn og no gir norsk), English eller Norsk bokmål.
  Byttet skjer med en gang, også i et åpent vindu, og gjelder Cut og Draw.
* **Slik virker det:** grensesnittet er skrevet på engelsk i koden. `renderer/i18n-nb.mjs` er en katalog fra engelsk
  tekst til bokmål (rundt 1 600 oppføringer: menyer, verktøy, paneler, dialoger, meldinger, Cut-vinduet og
  innstillingene). Meldinger med verdier bruker plassholdere (`"Save failed: {error}": "Lagring mislyktes: {error}"`),
  og verdien oversettes selv når den er grensesnittekst. `renderer/i18n.mjs` oversetter vinduet med en DOM-gjennomgang
  som følger senere endringer (tekst, `title`, `aria-label`, `placeholder`, `data-tooltip`), og hovedprosessen
  oversetter menyene og filvelgerne. Engelsk er kildeteksten, så det koster ingenting når engelsk vises.
* **Det som ikke oversettes:** innhold merket `translate="no"` (dokument- og lagnavn, filnavnet, Cut/Draw-knappen),
  verdier i inndatafelt, og tekst tegnet på lerretet. Edit > Cut heter «Klipp ut» i menyen, mens «Cut» ellers er
  laseroperasjonen («Kutt»).
* Nye engelske tekster vises på engelsk til de får en oppføring i katalogen; `renderer/test-i18n.mjs` sjekker at
  plassholderne stemmer og at oversettelsene ikke bruker tankestrek.
* Kode: `renderer/i18n.mjs`, `renderer/i18n-nb.mjs`, språkvalget i `preferences.mjs` og `app.js`, IPC `setLanguage`
  og `localizeMenuTemplate` i `electron/main.mjs`.
* Norsk er ikke et krav, men holdes ved like. **Tysk, fransk og spansk er planlagt, ikke startet**; se
  DRAW_WORKSPACE.md kapittel 18, «Planlagt senere: flere språk».

Gjenstår i fase 5: AVIF-eksport (Chromium kan ikke kode AVIF fra lerret).

## 3. Hovedplanen (fra DRAW_WORKSPACE.md kapittel 23)

| Oppgave | Status |
|---|---|
| Fase 0 (D0.1 til D0.6) | Ferdig |
| D1.1 til D1.8 | Ferdig |
| D1.9 Kontrollinje og statuslinje | Ferdig (se 2.4) |
| D1.10 Group, Arrange, Clipboard, isolasjon | Ferdig |
| D1.11 Place bitmap og template-lag | Ferdig (se 2.3); høyreklikkmeny, Crop Image og Links gjenstår |
| D1.12 Send til Cut v1 | Ferdig (se 2.2) |
| D2.1 Tekst | Ferdig i hovedsak (2.6 til 2.11): punkt-, område- og path-tekst, fonter, Character, Paragraph og blandede stiler; se 2.11 for det som gjenstår |
| D2.2 Pathfinder, Compound, Clipping | Pathfinder, compound paths, klippemasker (2.12) og Draw Normal/Behind/Inside (2.17) ferdig; lagklipping gjenstår |
| D2.3 Gradienter og Swatches | Ferdig: swatches, gradienter (2.14), globale swatches og gradientswatches (2.19); PDF-shading gjenstår |
| D2.4 Path-kommandoer | Ferdig (2.13): Join, Average, Reverse, Add/Remove Anchor Points, Clean Up, Offset Path, Simplify; Smooth og Split Into Grid gjenstår |
| D2.5 SVG eksport/import | Ferdig: eksport (2.5) og import med gradienter, klipping, bilder og tekst (2.19); mask og filter rasteriseres |
| D2.6 PDF-eksport | Ferdig (Codex): Save PDF-dialog med forhåndsinnstillinger, lag, merker, bevar redigering; også EPS og DXF. Se WORK_LOG «Eksport del 1 og 2» |
| D2.7 Raster-eksport | Ferdig: PNG og JPEG (2.5), Export for Screens (WORK_LOG «Eksport del 3») og WebP (2.19) |
| D2.8 Pencil, Shear, Eyedropper m.fl. | Ferdig (2.15): Eyedropper, Measure, Group Selection, Scissors, Pencil, Shear, Arc |
| D2.9 Transparency, History, Info, kommandosøk | Ferdig (2.16); snapshots i History gjenstår |
| D2.10 Send til Cut v2 | Ferdig (2.9 og 2.18): tekst til outlines, Outline Stroke, kutt ved artboard, validering, Update in Cut, bilder og alle artboards; varsel om objekter utenfor bedet gjenstår |
| D3.1 Outline Stroke og Expand | Ferdig (2.18, 2.20): Outline Stroke, Expand, Expand Appearance; effekter, stiplede streker og pilspisser gjenstår |
| D3.2 Appearance og effekter | Appearance, sju vektoreffekter og Drop Shadow (2.24); Glow, Feather, Blur og gruppeeffekter gjenstår |
| D3.3 Image Trace | Ferdig i grunnform (2.26); live trace gjenstår |
| D3.4 Shape Builder, Eraser og Knife | Ferdig (2.22); Path Eraser gjenstår |
| D3.5 Magic Wand, Lasso, Select-meny | Ferdig (2.21) |
| D3.6 Free Transform, Transform Each, Split Into Grid | Ferdig (2.23); perspektiv gjenstår |
| D3.7 AI- og DXF-eksport | Ferdig (2.27); Illustrators private AI-data gjenstår |
| D3.8 Links, Crop Image, Document Info, Edit in Draw | Ferdig (2.25); lenkede bilder og beskjæringshåndtak gjenstår |
| D4.1 Width og width profiles | Ferdig i grunnform (2.28); gradient langs strek og stiplet profil gjenstår |
| D4.2 Blend | Ferdig i grunnform (2.29), spine gjort; direkte redigering av ryggraden gjenstår |
| D4.3 Warp, Live Pathfinder, opacity masks | Ferdig i grunnform (2.30); Rasterize og Envelope gjenstår |
| D4.4 Paintbrush og Blob Brush | Ferdig i grunnform (2.31); art-, scatter- og pattern-pensler gjenstår |
| D4.5 EPS/TIFF, Graphic Styles, Navigator, Rotate View, Asset Export | Ferdig i grunnform (2.32) |
| D4.6 Ytelsespass | Gjort (2.33); innsetting av tusenvis forbedret (5,6 s for 5 000 enkeltvis) |
| Fase 5 | Del A (2.34) PLT, GIF, Package del B (2.35) hurtigtaster, Glyphs, Scribble, del C (2.36) Touch Type, Vertical Type og del D (2.37) PDF/X-4, EPS-import, del E (2.38) MCP-server og del F (2.39) lokalisering; bare AVIF gjenstår |

## 4. Rekkefølge videre

Fase 1 er ferdig. Neste er fase 2, i denne rekkefølgen:

SVG-, PNG- og JPEG-eksport er gjort (2.5).

1. **D2.1 Tekst** er ferdig i grunnform (2.6 til 2.11). Resten (kerning-modus, justert tekst, innrykk,
   blandede stiler, klammer for tekst på path, reflow med canvas-håndtak) tas senere.
   D2.2 compound paths og klippemasker er gjort (2.12).
2. D2.4 path-kommandoer (2.13), D2.3 gradienter (2.14), D2.8 verktøy (2.15) og D2.9 History, Info og
   kommandosøk (2.16) er gjort.
3. Draw Normal, Behind og Inside (2.17) er gjort.
4. D2.10 Send til Cut v2 (2.18) er gjort. Alle fase 2-oppgavene finnes nå i grunnform.
5. Hullene i fase 2: D2.5 SVG-import, D2.7 WebP og D2.3 globale swatches og gradientswatches (2.19) er
   gjort. Fra D2.1 er skalering, baseline shift, kerning, avsnitt og blandede stiler gjort (2.11).
6. Fase 3: D3.1 Expand og Expand Appearance (2.20) og D3.5 Select-meny, Magic Wand og Lasso (2.21) er gjort.
   D3.4 Shape Builder, Knife og Eraser (2.22) og D3.6 Free Transform, Transform Each og Split Into Grid
   (2.23) er også gjort, og D3.2 effekter (2.24), D3.8 (2.25), D3.3 Image Trace (2.26) og D3.7 AI-eksport (2.27). Fase 3 er ferdig i grunnform. Fase 4: D4.1 Width (2.28), D4.2 Blend (2.29) D4.3 Warp, Live Pathfinder og opacity masks (2.30) D4.4 Paintbrush og Blob Brush (2.31) og D4.5 TIFF, Graphic Styles, Navigator, Rotate View, Asset Export og arbeidsområder (2.32) og D4.6 ytelsespass (2.33) er gjort. Fase 4 er ferdig i grunnform. Fase 5 del A (2.34) til del F (2.39) er gjort; fase 5 er ferdig i grunnform (AVIF venter på støtte i Chromium). **Neste: hullene listet under hver del i kapittel 2, for eksempel Rasterize-effekt og Envelope.**


## 5. Kjente begrensninger og risiko

* Pen-markørtesten (`draw-feedback-workflows.mjs:43`) feilet én gang i en samlet kjøring hos Codex;
  den passerte i Claudes samlede kjøring 2026-10-16. Hold øye med den.
* Punkttekst-testen krever en installert familie med Fet Kursiv; den velger nå en slik familie selv
  (skymiljøet har DejaVu Sans uten kursiv som standard).
* Color, Stroke og Swatches endrer første fyll og første strek når en figur har flere.
* Autolagringstesten (`project-workflows.mjs:113`) er ustabil i skymiljøet; se WORK_LOG.
* Cut/sidecar-tester kan ikke kjøres i skymiljøet (jitpack.io er blokkert).
* Geometrikjernens worker har bare polygonal union; Pathfinder bruker Paper.js i hovedtråden.
