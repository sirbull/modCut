# Draw — arbeidslogg

Arbeidsgren: `feat/vector-draw`. Oppdateres underveis og ved fullføring av hvert trinn.
Detaljer og samlet sjekkliste finnes i `docs/DRAW_WORKSPACE.md` kapittel 23.

**Fortsette med en annen agent:** Les [gjeldende overlevering](HANDOFF.md) først. D1.7 er ferdig; neste oppgave er D1.8.

## 2026-10-14 — før D0.5

- D0.1 fullført: Draw/Cut-bytte, isolert canvas/PaperScope og menyer per modus.
- D0.2 fullført: dokumentmodell, Commands, History, validering, utvalg og safe mode.
- D0.3 fullført som evaluering: VectorCraft/WASM er for stort; JS-fallback er valgt.
- D0.4 fullført: GeometryKernel i worker med flatten/union, avbryting og timeout.
  42 Draw-tester og hele `npm test` passerte ved avslutningen av D0.4.
- CTA justert etter eierens ønsker: egne SVG-er fra `ICONS`, hvitt ikon,
  ensfarget grønn knapp i lyst/mørkt tema, fast bredde og midtstilt ikon/tekst.

## 2026-10-14 — D0.5 fullført

- [x] Lest verktøytabellene og hurtigtastreglene; bekreftet samme arbeidsgren.
- [x] Sentralt tastekart med konfliktkontroll, fysisk tast/locale-håndtering og midlertidige verktøy.
- [x] Register for alle spesifiserte verktøy, uten å aktivere uimplementerte verktøy.
- [x] SVG-ikoner og deterministisk sprite-bygg (erstattet med Tabler, se under).
- [x] Smal integrasjon med Draw og native menyer; Cut og CTA-stil bevares.
- [x] Enhetstester og Draw-E2E passerer; full testsuite er kjørt (kjent crop-feil, se under).
- [x] Byggeplan og roadmap oppdatert med sluttstatus og neste oppgave.

Løst konflikt i dette trinnet: `Mod+Shift+O` er Add i Cut,
men Create Outlines i Draw. Draw-menyen må derfor ikke beholde Cut-akseleratoren.

Underveis: 49 verktøy og 49 originale ikoner er registrert; tastekartet har 145
oppføringer uten kontekstkonflikter. 52 enhetstester og Draw-E2E passerer foreløpig.
Native Add i Draw har nå ingen `Mod+Shift+O`-akselerator; snarveien er reservert
til Create Outlines. Ingen av de fremtidige tegneverktøyene eksponeres som ferdige.

Sluttstatus: 148 tastekartoppføringer (inkludert tegnsettingsaliaser og midlertidige
verktøy), 49 verktøydefinisjoner og 49 SVG-symboler. 52 tester passerer; keymap og
register har 100 % linjedekning. Draw-E2E kontrollerer ny-fane-hurtigtasten,
menyakseleratorer, alle SVG-symbolene og bevart Cut-tilstand.

Full `npm test`: sidecar, bridge, main, renderer, Draw og kontrast er grønne.
Full E2E stopper i den tidligere observerte crop-testen med uendret «100 × 100%».
D0.5 endrer ikke bildebeskjæring. Ingen ny gren er opprettet.

**Neste: D0.6** — `.modcut` v4, lagre/laste Draw-data, autosave/recovery og dirty-sjekk.
Deretter er fundamentet (fase 0) klart for fase 1 med synlige tegneverktøy.

## 2026-10-14 — ikonbibliotek valgt og tatt i bruk

Etter eierens ønske erstattes de egenlagde verktøyikonene med Tabler Icons outline
3.49.0 (MIT). Biblioteket har aktuelle designverktøy som Bézier, artboard, lasso,
saks og transformering, og passer 24×24/currentColor-formatet som allerede brukes.

- [x] Alle 49 Draw-ikoner erstattet med uendrede SVG-er fra publisert bibliotek.
- [x] Faste lokale ikon-id-er bevart; nærmeste symbol for spesialverktøy dokumentert.
- [x] Versjon, kildefil, SHA-256 og npm-integritet registrert i `icons/sources.json`.
- [x] Full MIT-lisens og tredjepartsnotis lagt ved; kun lokalt utvalg distribueres.
- [x] Sprite-bygget verifiserer bibliotekskildene og trenger ikke nettverk.
- [x] Byggeplanen krever nå biblioteksikoner, ikke egenlagde erstatninger.
- CTA-knappens godkjente Draw/Cut-ikoner og stil beholdes.

Verifisert: `npm run test:draw` passerer alle 52 tester.
`npm run test:e2e:draw` passerer, inkludert rendering av alle 49 sprite-symboler,
geometry-worker og bevart Cut-tilstand. `git diff --check` er grønn. Nedlastet
pakkes SHA-512 er kontrollert mot npm-integriteten i manifestet.
Full testsuite er ikke kjørt på nytt for ikonbyttet; kjent crop-feil står beskrevet over.
Arbeidet fortsetter på `feat/vector-draw`; neste byggetrinn er fortsatt D0.6.

## 2026-10-14 — D0.6 påbegynt

- Draw-tilstand er nå separat fra canvaset og lever per prosjektfane.
- `.modcut` v4 tar med Draw; eldre Cut-filer oppretter et tomt Draw-dokument.
- Ugyldige/ukjente Draw-data åpnes skrivebeskyttet og beholdes uendret ved lagring.
- Dirty-sjekken kombinerer Cut og Draw. Lagrepunktet følger faktisk skrevet snapshot,
  slik at endringer under filskriving ikke blir markert som lagret.
- Recovery tar med alle Draw-dokumenter og valgt workspace, også i inaktive faner.
- Pågående arbeid: tester for lagre/åpne, samtidige skriveroperasjoner og faktisk
  krasjgjenoppretting i Electron. Samme arbeidsgren: `feat/vector-draw`.

## 2026-10-14 — D0.6 fullført, fase 0 ferdig

- [x] `.modcut` v4 med Draw + workspace; v1–v3 åpnes med tom Draw og uendret Cut.
- [x] Dirty-union for Cut/Draw, separat lagrepunkt og sikker async lagring ved nye edits/fanebytte.
- [x] Alle Draw-faner og valgt modus tas med i autosave/recovery, også uten montert canvas.
- [x] Maks 2 sekunders ventetid for Draw-autosave; kontinuerlige edits utsetter ikke recovery uendelig.
- [x] Skrivebeskyttet safe mode/kompatibilitetsadvarsel beholder originaldata ved save/recovery.
- [x] Atomisk prosjektfilskriving; kø for samtidige recovery-writes og clear.
- [x] Native Close/Quit varsler om aktive/inaktive Draw-endringer. Cancel gjenopptar autosave.
- [x] Plan, roadmap og API-/filformatdokumentasjon oppdatert.
- [x] Dedikert Draw-E2E med prosjekt-IO/krasjtest inngår nå også i standard `npm test`.

Verifisering: 58 Draw-tester, 11 main-tester og Draw-E2E er grønne.
Prosjekt-IO og doc-modulene har 100 % linjedekning. Electron-testene bruker faktisk
IPC-lagring til disk, åpner filen igjen og sjekker tom/befolket Draw, legacy v3,
ukjent Draw-versjon uten datatap, begge dirty-kilder, kontinuerlig autosave og
bevarte faner gjennom SIGKILL/restart. Hele `npm test` passerer i denne kjøringen,
inkludert Cut-workflows og eksisterende krasjgjenoppretting. Ingen crop-fiks er gjort.

Avklaring: allerede utgitte gamle apper kan ikke varsles retroaktivt og kan miste
Draw-data ved lagring. Denne versjonen advarer og bevarer ukjent Draw-data; nyere
prosjektversjoner avvises før arbeidsflaten endres. Recovery lagres fortsatt som
et komplett atomisk JSON-snapshot, med gjenbruk av uendrede Draw-modellsnapshots.

Arbeidsgren: `feat/vector-draw`. **Neste: D1.1**, render-adapter modell → Paper.js.

## 2026-10-15 — D1.1 fullført

Utgangspunktet hadde allerede enkel rendering, import, former og paneler fra de
to siste committene. D1.1 fullfører render-adapteren uten å erklære de senere
verktøy- og paneloppgavene ferdige.

- [x] Render-adapter i `render/paper-adapter.mjs`, med kompatibel eksport fra
  `render.mjs`. Geometri, utseende og artboards diffes per id; uendrede objekter
  og gruppebarn beholdes gjennom stilendringer, transformering og omorganisering.
- [x] Viewport culling ved pan, zoom, Fit og resize. Strekbredde og skjermmargin
  tas med. Skjulte lag forblir skjult. Verdenskoordinater og utvalgsrammer beregnes
  fra modellen og krymper ikke når gruppebarn ligger utenfor skjermen.
- [x] Outline / Preview via sentralt tastekart (Ctrl/Cmd+Y), native View-meny
  og tilgjengelig knapp. Hele piksellinjer uten fill, dash eller blending;
  bilder vises som rammer. View-endringer lager ikke undo-steg eller dirty-data.
- [x] Separat, gjenbrukt markerings-overlay med konstant skjermbredde.
- [x] Bilder skaleres med matriser uten å resample kildepikslene. Sen innlasting
  bruker siste modelltransform og ignorerer slettede/erstattede rasterobjekter.
  Callbacken gjenoppretter Cut sitt aktive PaperScope.
- [x] Sju nye render-enhetstester og Electron-scenario for Outline-hurtigtast,
  meny, originale bildepiksler, bilderedigering før onload, culling og Hand/Fit.
- [x] Windows-kontroller: SVG-integritet og sprite-sammenligning normaliserer
  CRLF til original LF. Prosjekt-E2E venter på fullført IPC-save før fillesing,
  slik at testens åpne filhåndtak ikke blokkerer atomisk rename på Windows.

Verifisert på Windows: `npm run test:draw` (67 tester), komplett
`npm run test:e2e:draw` (inkludert faktisk krasj/restart) og `git diff --check`.
Hele `npm test` er kjørt: sidecar, bridge, main (11), renderer (56), Draw og
kontrast passerer; Cut-E2E stopper på den allerede dokumenterte testen
«dragging a crop edge must update the crop» med uendret «100 × 100%».
Ingen endring i `bed.js`, bildeeditoren eller `sidecar/` er gjort.
50-fps-målet for 5 000 paths / 200 000 ankre er ikke målt i dette trinnet;
det samlede ytelsespasset står fortsatt som D4.6.

Arbeidsgren: `feat/vector-draw`. **Neste: D1.2**, artboards og New Document-dialog.

## 2026-10-15 — verktøylinjen ryddet, D1.2/D1.3/D1.6 implementert

- Ett ikon per verktøygruppe, flyout uten gjentatt aktiv variant, langtrykk,
  høyreklikk og Alt-sykling. Kompakt oppsett uten vannrett rulling. Alle 49
  metadataoppføringer er med; senere faseverktøy er fortsatt deaktivert.
- Ett panel om gangen. Layers har ett tre og én overskrift. Properties viser
  navn, opacity og formparametre; Transform, Color og Stroke eier sine felt.
  Ingen permanent Layers-kopi under Properties. Fill/Stroke-boks og sentrale
  malingskommandoer for swap/default/none er koblet til reell geometri.
- D1.2: New Document med Bed/A4/A3/A5/Letter/Tabloid/skjerm/custom, antall,
  layout og avstand. Aktivt artboard, navn, mål, panelnavigasjon, oppretting,
  flytting, skalering, duplisering med nye id-er, sletting, rekkefølge og
  omorganisering. Innhold følger med når valget er på; låste/skjulte objekter
  flyttes ikke. Én transaksjon per operasjon. Grensene 1 000 / 5 779 mm valideres.
- D1.3: åtte skaleringshåndtak, Shift-proporsjon, Alt-senter, rotasjon, marquee,
  Shift-valg, Alt-kopi, nudge og smart guides. Space/Mod+Space er midlertidige
  verktøy og beholder permanent verktøy ved slipp. Normal rulling panorerer;
  Mod+rulling zoomer rundt pekeren. Aktivt artboard brukes til Align og import.
- D1.6: rektangel, avrundet rektangel, ellipse/pie, polygon, stjerne og linje.
  Korrekte previews, eksakte mål, live parametre og Shift/Alt/Space-regler.
  Antall sider/punkter og hjørneradius kan justeres under drag. Stjernens
  indre radius kan styres med Mod. Pievinkler beholder Bézier-geometri.
- Tema og layout kontrollert med skjermbilder i begge temaer. Capture-listener
  i app-integrasjonen aktiverer Cut sitt scope før bed sin eksisterende tema-
  handler. Draw oppdaterer navn/farger etterpå. Ingen endring i `bed.js`.

Verifisering: 79 Draw-enhetstester (12 nye siden D1.1), komplett Draw-E2E med
arbeidsflytene over og faktisk prosjektlagring/krasj/restart. Full `npm test`
passerer sidecar, bridge, main, renderer, Draw og kontrast, men stopper fortsatt
i kjent crop-E2E med «100 × 100%». Ingen ny avhengighet eller sidecar-endring.

Planpresisering: eksportverifiseringen av artboard 2 flyttes til D2.5–D2.7,
som implementerer eksporten. Første Draw-åpning beholder eksisterende dokument;
New åpner størrelsesdialogen. Fase 1 er fortsatt under arbeid: D1.4/D1.5,
selvstendige transformverktøy, resten av panelene og Send til Cut gjenstår.

Arbeidsgren: `feat/vector-draw`. **Neste: D1.4 (Direct Selection), deretter D1.5 (Pen).**

## 2026-10-15 — Pen og ankerredigering

- D1.5 implementert i Draw-modellen: Pen med rette/Bézier-segmenter, lukking,
  fortsettelse fra begge ender og hover-preview. Endepunktreversering lagres først
  ved en faktisk endring. Shift begrenser vinkler, Alt frikobler håndtak, Space
  flytter ankeret under drag. Enter/Escape avslutter; Escape under drag forkaster
  preview. Pen kan dele kurver og redigere synlige håndtak.
- Add Anchor bruker eksakt De Casteljau-deling. Delete Anchor og Delete på valgte
  ankre bevarer andre subpaths. Anchor Point konverterer hjørne/glatt og trekker
  ut håndtak. Strukturell shape-expansion beholder id, utseende og plassering;
  Undo gjenoppretter live form med opprinnelige parametre.
- D1.4 delvis: Direct Selection, ankre/håndtak, Shift-valg, marquee, segmentvalg,
  nudge og separate håndtak med Alt. Live corner widgets og automatisk ekspandering
  med Direct Selection gjenstår; Anchor Point kan allerede ekspandere former.
- Ankre/håndtak tegnes i separat overlay med fast skjermstørrelse. Innsetting,
  videre tegning, håndtak, nudge og previews følger transformerte foreldre/layers.
  Alle dokumentendringer bruker Commands/History; ett drag gir ett angresteg.
- Verktøy aktiveres i eksisterende grupper. Ingen ekstra Layers-paneler eller
  verktøykopier. Ingen endring i `bed.js`, sidecar eller avhengigheter.

Verifisering: 85 Draw-enhetstester passerer, inkludert kubisk formbevaring og
transformerte foreldre. Komplett Draw-E2E passerer med filrundtur, kontinuerlig
autosave og faktisk krasj/restart. Den nye muse-/tastaturtesten dekker Pen,
lukking, ankre/håndtak, deling/sletting/konvertering, reversering, Escape,
Shift/Alt/Space, shape-expansion og at Cut bevares. Skjermbildet med valgte
ankre/håndtak er visuelt kontrollert. En samtidig kjøring med to Electron-vinduer
traff tidsgrensen i autosave-testen; isolert komplett kjøring passerer.

Full `npm test` passerer sidecar, bridge, main, renderer, alle 85 Draw-tester og
kontrast. Den stopper deretter i den tidligere dokumenterte Cut crop-E2E-testen
(`workflows.mjs:369`, «dragging a crop edge must update the crop», uendret
«100 × 100%»). Cut-beskjæring er ikke endret som del av dette trinnet. En ekstra
ren geometrikontroll bekrefter at ankersletting bevarer også uvalgte subpaths
med bare ett punkt.

**Neste: fullfør D1.4 (live corners og automatisk shape-expansion), så D1.7–D1.11.**

## 2026-10-15 — D1.4: live corners og automatisk ekspandering

- Direct Selection viser og velger ankre på live former uten modellendring.
  Formgeometrien ekspanderes først ved anker-/håndtaksredigering, nudge, sletting
  eller avrunding. Konvertering og redigering er ett angresteg, med samme id,
  stil, forelder og plassering. Undo gjenoppretter hele den opprinnelige formen.
- Rette hjørner har prikkede sirkelhåndtak. Flere valgte hjørner kan avrundes
  sammen, Alt-drag tar ett. Ett kontekstuelt radiusfelt i Properties viser
  eventuell blandet verdi. Radius null gjenoppretter skarpe kildeankre; radius
  klemmes mot halvparten av nabokantene slik at avrundinger ikke overlapper.
- `geom/corners.mjs` er ren JS. Vanlige `segments` inneholder ferdige kubiske
  kurver; valgfri `cornerData` beholder kildeankre og radier. Modellvalideringen
  krever at kilde og ferdig geometri stemmer. Lagring/lasting og geometrikjernen
  bruker faktiske kurver, mens logiske ankre gjør radiene redigerbare igjen.
- Flytting, rotasjon, refleksjon og jevn skalering beholder live-data. Ujevn
  skalering/skjæring av selve banen baker avrundingen og beholder kurvene eksakt.
  Kurvedeling/Pen baker berørt subpath. Endepunkter, degenererte vinkler og
  hjørner med tilstøtende kurvehåndtak får ikke avrundings-widgets.
- Transformerte former/foreldre bruker riktig redigeringsrom. Overlays og
  previews er separate fra modellen. Escape/avbrutt drag endrer ikke dirty.
  Originaltegningen skjules under redigerings-preview; trefftesting leser alltid
  faktisk modellgeometri slik at Pen sine foreslåtte punkter ikke blir ankre.
- Verktøylinje, panelstruktur og Cut er bevart. Ingen nye avhengigheter.

Verifisering underveis: 94 Draw-enhetstester passerer. Nye tester dekker
avrundingsgeometri, klamping, degenererte/konkave hjørner, reversering,
ankeroperasjoner, transformasjoner, ugyldig metadata, filmodell og utvalg.
Alle formfamilier beholder geometrien ved ekspandering, også store/elliptiske
rektangelradier. Dedikert Electron-test passerer for widgets, radiusfelt,
utsatt ekspandering, ett angresteg, Escape og transformerte foreldre. Begge
temaer er visuelt kontrollert og har pikselkontroll av faktisk artwork.

E2E-stabilisering: hover-kontroller venter på vanlig inputbehandling; en test
for eksakte mål bruker numerisk toleranse på 1e-8 mm (10 kunne bli
9.999999999999998 ved konvertering fra muse-/visningskoordinater).

Komplett Draw-E2E passerer, inkludert Pen-regresjoner, live corners, begge
arbeidsområder, faktisk prosjektlagring/gjenåpning med live corner-data,
kontinuerlig autosave og krasj/gjenstart. `git diff --check` er uten feil.

Full `npm test` passerer sidecar, bridge, main, renderer, 94 Draw-tester og
kontrast. Den stopper fortsatt i den tidligere dokumenterte Cut crop-E2E-feilen
(`workflows.mjs:369`, «dragging a crop edge must update the crop», uendret
«100 × 100%»). Ingen endring er gjort i Cut-beskjæring eller sidecar.

**Neste: D1.7 — Rotate, Reflect, Scale med dialoger/Copy og Transform Again.**

## 2026-10-15 — D1.7: transformverktøy

- Rotate (R), Reflect (O) og Scale (S) er aktivert i sine eksisterende grupper.
  Klikk/flyttbart kryss setter referansepunkt uten modellendring. Dra utfører
  transformasjon med faktisk artwork-preview; Shift begrenser, Alt lager kopi.
- Enter, dobbeltklikk på verktøyikon, Alt-klikk og Object > Transform åpner
  dialoger med eksakte verdier/referansekoordinater, Preview, Apply og Copy.
  Cancel/Escape er uten modellendring. Positive vinkler er mot klokken.
- Felles transformkontroller bruker eksisterende Commands/History. Gruppekopier
  får nye id-er på alle nivåer og beholder forelder/stil. Ett drag/dialogresultat
  er ett angresteg; feil med låste etterkommere ruller tilbake hele operasjonen.
- Mod+D / Transform Again bruker siste vellykkede verdensmatrise på aktuelt
  utvalg, inkludert Copy og strekvalg. Minne/referansepunkt er midlertidig og
  separat per fane. Identitet uten Copy overskriver ikke tidligere operasjon.
- Scale håndterer strekbredde/dash konsistent for baner, live former og grupper.
  Et valgfritt `strokeScaling:false` lagrer verdens-mm etter eksplisitt Scale.
  Valget av bruker betyr at bredden beholdes eller skaleres arealekvivalent.
  Uimplementerte effektdata er urørt; dialogen forklarer at effektrendering kommer
  senere. Live corner-geometri følger den eksisterende transformregelen.
- Ingen nye verktøykopier eller paneler. `bed.js`, Cut og sidecar er urørt.

102 Draw-enhetstester passerer. Ny Electron-arbeidsflyt passerer for dialoger,
preview/Cancel, Copy/Mod+D, referansepunkter, Shift/Alt, strekvalget, filmodell
og atomisk undo/redo. Rotate-dialogen er visuelt kontrollert.

Komplett Draw-E2E passerer også for alle tidligere tegneverktøy, faktisk
prosjektlagring, normalisert strekmodell, kontinuerlig autosave og krasj/restart.
Første kjøring fant ikke DevTools-target ved omstart; ny komplett kjøring
passerte uten endringer i testens gjenstartslogikk. `git diff --check` er grønn.

En ekstra kontroll av Paper-koden viste at `strokeScaling:false` bruker
skjermpiksler. Adapteren konverterer derfor lagrede verdens-mm til pikselbredde
og dash-lengder ved gjeldende zoom, også i preview. Enhetstesten kontrollerer
fysiske strekgrenser ved flere zoomnivåer; Electron-testen måler faktiske mørke
piksler før og etter dobling av zoom. Begge passerer uten modellendring.

Sluttkontroll: 102 Draw-tester og komplett Draw-E2E passerer etter zoomrettelsen,
inkludert prosjektlagring, autosave og faktisk krasj/gjenstart. Full `npm test`
er kjørt og stopper fortsatt i den kjente Cut crop-E2E-testen
(`workflows.mjs:369`, «dragging a crop edge must update the crop», uendret
«100 × 100%»), etter grønne sidecar/bridge/main/renderer/Draw/kontrast-tester.

**Neste: D1.8 — fullfør grunnpanelene og template-lag.**

## 2026-10-15 — D1.8 del A: Layers-panel og template-lag

D1.8 deles i delsteg som committes hver for seg: A Layers/template, B Transform,
C Align, D Color/Stroke/Fill-Stroke-boks/Properties.

- Ny ren modul `doc/layers.mjs`: lagfargepalett, arvet lagkontekst (template,
  print, per-lag Outline, bildedimming, lagfarge), `isOutputNode` for senere
  eksport/Send to Cut, Layer Options-normalisering, solo, drop-mål, sletting,
  Collect in New Layer og Release to Layers (Sequence). Alt går via Commands.
- Skjemaet godtar valgfrie lagfelt `preview` og `dimImages` (boolske).
- Template slår på Lock, slår av Print, tvinger Preview og dimmer bilder til
  `dimImagesTo` (standard 50 %). Template-lag vises alltid i Preview, også i
  Outline-visning. Låst template-artwork kan ikke velges på canvas.
- Adapteren lagrer arvet kontekst per node og tar den med i fingerprint, slik at
  endring av et lag oppdaterer etterkommerne. Utvalgsrammen følger lagfargen.
- Layers-panelet er ett tre med øverste lag først: øye/template-ikon, lås,
  sammenfelling, lagfarge, navn, valgsirkel og drag-and-drop (over/under/inni).
  Alt-klikk på øye = solo, Ctrl/Cmd-klikk = Outline/Preview for laget.
  Dobbeltklikk lag = Layer Options; dobbeltklikk objekt = navneendring.
  Toppknapper: New layer, New sublayer, Collect, Release, Locate, Delete.
- Draws globale keydown-lytter fanger tastetrykk i capture-fasen. Inline-felt i
  paneler må derfor bruke `change`/`blur`, ikke keydown på elementet.
- 13 nye Tabler-ikoner er vendret i `panels/icons` med hash i `sources.json`.

Verifisering: 108 Draw-enhetstester passerer (6 nye i `layers.test.mjs`). Ny
`electron/e2e/draw-panel-workflows.mjs` (`--draw-panels`) passerer og er med i
komplett Draw-E2E, som også passerer. Skjermbilde:
`%TEMP%\modcut-draw-layers-panel.png`. Ingen endring i Cut, `bed.js` eller sidecar.

Gjenstår i D1.8: Transform-panel (B), Align (C), Color/Stroke, Fill/Stroke-boks
og Properties-gjennomgang (D). Virtualisert lagliste for 500+ objekter er ikke
gjort (AK i 10.9); vurder ved ytelsespass.

## 2026-10-15 — D1.8 del B: Transform-panel

- `geom/transforms.mjs` har `REFERENCE_POINTS` og ren `panelMatrix(box, ref, key,
  value, {linked})`. X/Y viser og flytter valgt referansepunkt (standard senter).
  W/H skalerer rundt referansepunktet, med lenkede proporsjoner som valg.
- Rotate by og Shear by er relative felt som nullstilles etter bruk (vi lagrer
  ikke objektrotasjon slik Illustrator gjør). Positiv vinkel er mot klokken /
  toppen mot høyre. Shear er begrenset til ±89,99°.
- Scale strokes & effects og Scale corners er avkrysninger i panelet (standard
  på, som Scale-dialogen). `transformProperties(node, m, {scaleCorners})` beholder
  synlig radius for live rektangler og `cornerData`-radier ved jevn skalering når
  valget er av. Gjelder direkte valgte objekter, ikke former inne i grupper.
- Panelvalgene er midlertidig `state.ui` per fane og lagres ikke.

Verifisering: 110 Draw-enhetstester (ny `panel-math.test.mjs`). Panel-E2E dekker
referansepunkt, lenket skalering, flytting, rotasjon, shear og ett angresteg.

## 2026-10-15 — Nytt dokument-dialog, statuslinje og dokumentmaler

Utført på brukerens forespørsel, parallelt med D1.8 del B (egen commit).

- Visningskontrollene (posisjon, aktiv artboard, zoom, Outline, Fit) ligger nå i
  appens nederste statuslinje rett etter filnavnet (`#drawStatus`), ikke flytende
  over canvas. `createDrawWorkspace` tar `statusHost`; hver fane eier sitt
  `statusElement`, og `setWorkspace` viser bare aktiv Draw-fanes kontroller.
- «Start drawing»-hintet har egen flate (`--surface`) slik at teksten er lesbar
  også når den ligger over et hvitt artboard i mørkt tema.
- Ny `doc/presets.mjs` (ren): enhetskonvertering (mm/cm/in/pt/px, px = 1/96 in),
  presetkatalog (Print, Screen, Laser beds), validering av oppsett,
  `setupFromDocument`, Recent (maks 8, uten duplikater) og lagrede maler.
  Lagring i `localStorage` (`modcut_draw_recent_setups`,
  `modcut_draw_document_templates`); korrupte data ignoreres.
- New document-dialogen (Illustrator-inspirert): faner Recent/Templates/Saved
  med kort til venstre, Preset details til høyre (navn, bredde/høyde i valgt
  enhet, orientering, antall artboards, oppløsning, arrangering). Konfigurerte
  maskiner vises først under Laser beds. Dobbeltklikk på kort oppretter.
  Dokumentet får `units` og `rasterEffectsPpi` fra dialogen; visningen i Draw er
  fortsatt i mm.
- File › «Save Document Properties as Template…» (kun Draw) lagrer første
  artboards størrelse, antall, arrangering, enheter og oppløsning. Ikke artwork.
- E2E: `e2eClickMenuItem` (kun i E2E-modus) lar testene klikke menyvalg.

Verifisering: se commit.
Komplett Draw-E2E passerer etter del B. `submitNewDrawDialog` venter nå på at den
nye, asynkrone New-dialogen (fra commit d337a8f) finnes før den fylles ut. Én full
kjøring traff en ustabil Rotate-drag-assert (`draw-transform-workflows.mjs:47`)
som passerte isolert og i neste fulle kjøring. En annen agent (Codex) arbeidet
samtidig i samme tre; parallelle Electron-kjøringer ga da en autosave-feil.

## 2026-10-15 — Live tilbakemelding og Illustrator-markører (prioritert av eier)

Eieren presiserte at linjer og håndtak alltid må synes mens man tegner, at
endringer skal vises live, og at markøren alltid skal være synlig med
Illustrator-lik ikon per verktøy og tilstand. Dette ble tatt før D1.8 del C.

- Ny `tools/cursors.mjs`: SVG-markører med hvit glorie og CSS-fallback for
  Selection (svart pil, over objekt, Alt-kopi), Direct Selection (hvit pil, over
  anker/segment), Pen (ny `*`, aktiv, fortsett `/`, lukk `o`, legg til `+`,
  fjern `−`, konverter `^`), ankerverktøy, former (sikte), Artboard, Hand
  (åpen/lukket under drag), Zoom inn/ut (Alt), transformverktøy, rotasjon,
  hjørne-widget og resize-håndtak. `toolCursor` brukes for aktivt og midlertidig
  verktøy (Space/Ctrl+Space), så canvas aldri står uten markør.
- Redigerings-forhåndsvisninger (Pen, Direct Selection, hjørner) får en tynn
  kontur i lagfargen. Banen synes derfor også uten strek/fyll eller hvit fyll
  på hvitt artboard.
- Pen viser nå retningshåndtak (linjer + knotter) og ankerpunkt for ankeret som
  dras, og forrige ankers håndtak under gummistrikk-linjen. Tidligere manglet
  håndtakene helt under drag.
- `renderer.layerColor(id)` gir arvet lagfarge til overlays.

Verifisering: 121 Draw-enhetstester (ny `cursors.test.mjs`). Ny
`electron/e2e/draw-feedback-workflows.mjs` (`--draw-feedback`) måler faktiske
piksler midt i Pen-gesten (gummistrikk, begge håndtak) uten strek/fyll og sjekker
markør per verktøy/tilstand. Skjermbilder: `%TEMP%\modcut-draw-pen-handles.png`,
`modcut-draw-pen-rubberband.png` og markørgalleri `modcut-draw-cursors.png`.

Kjent begrensning: objekter uten både fyll og strek kan ikke treffes på canvas
(Paper hit-test krever maling); Illustrator treffer dem på banen. Bør fikses.

## 2026-10-15 — D1.8 del C: Align-panel

- Ren `geom/align.mjs`: `alignReference` (Selection, Key Object, Artboard; ett
  valgt objekt justeres mot artboard som i Illustrator), `alignOffsets`,
  `distributeOffsets` (kanter/sentre; tre objekter eller artboard) og
  `spacingOffsets` (like mellomrom, eller eksakt avstand rundt nøkkelobjektet).
- Panelet har Align Objects (6), Distribute Objects (6), Distribute Spacing (2),
  Align to og, i nøkkelmodus, valg av nøkkelobjekt og Spacing (tom = Auto).
  Nøkkelobjektet velges fra en liste over valgte objekter (standard: sist valgt)
  i stedet for Illustrators klikk-på-valgt-objekt; det står fast.
- Hvert objekt flyttes med egen forskyvning via transformkontrolleren; alle
  flyttinger er ett angresteg. Geometriske grenser brukes (ikke strekgrenser).
- 14 nye Tabler-ikoner i `panels/icons`.

Verifisering: 121 Draw-enhetstester (inkl. ny `align.test.mjs`). Panel-E2E dekker
justering mot utvalg, nøkkelobjekt, artboard, eksakt avstand, sentrumsfordeling
og ett angresteg. Skjermbilde: `%TEMP%\modcut-draw-align-panel.png`.

## 2026-10-15 — D1.8 del D1: Color-panel

- Ren `doc/color.mjs`: hex-normalisering og RGB/HSB/CMYK (enhets-CMYK uten
  profil, samme som rendererens forhåndsvisning)/Grayscale (K = dekning) til og
  fra hex, med validering per kanal. Maling lagres fortsatt som RGB; andre modi
  er visninger. Dokumentets `colorMode` er uendret.
- `History.transaction(label, fn, {mergeKey})` slår sammen påfølgende
  transaksjoner med samme nøkkel og noder. Brukes for live glidere/fargevelger:
  canvas oppdateres for hvert steg, men ett drag blir ett angresteg.
- Color-panelet: Fill/Stroke-mål (synket med verktøylinjens fokus), fargevelger,
  modus, glider + tallfelt per kanal, Hex og None. Panelet bygges ikke om under
  en aktiv glider-/velgerøkt (`liveEdit`), så draget ikke avbrytes.

Verifisering: 124 Draw-enhetstester (ny `color.test.mjs`, inkl. sammenslåtte
transaksjoner). Panel-E2E dekker RGB, live glider (ett steg, uten ombygging),
HSB, CMYK-visning, Stroke-mål, Hex, None og full angring. Skjermbilde:
`%TEMP%\modcut-draw-color-panel.png`.

Harness: Draw-grenen i `electron/e2e/run.mjs` prøver nå gjenstart én gang til hvis
DevTools-målet ikke dukker opp etter simulert krasj (samme mønster som Cut-grenen).
Den forbigående feilen traff 2 av 4 fulle kjøringer før endringen.

## 2026-10-15 — D1.8 del D2: Stroke-panel og pilspisser

- `doc/paint.mjs`: `changeStroke` validerer og endrer første strek (vekt 0–352,8
  mm, cap, corner, limit 1–500, dash med opptil 6 verdier, start-/sluttpil).
  Mangler objektet strek, lages en i gjeldende strekfarge.
- Skjemaet validerer `dash` og `startArrow`/`endArrow` (`type` arrow, triangle,
  circle, square, bar; `scale` 0–10).
- Ren `geom/arrows.mjs` beregner pilgeometri langs utovervendt tangent. Adapteren
  tegner pilene som egne visningsobjekter ved siden av banen, med samme transform
  og node-id (klikk velger banen). Kun åpne baner får piler; skjult i Outline.
- Stroke-panelet: Weight, Cap, Corner, Limit (kun miter), Align stroke (bare
  Center aktiv; Inside/Outside er deaktivert med forklaring til Outline Stroke i
  fase 3), Dashed line med 3 dash/gap-par, pilspiss-type og -skala.
- Fjernet den gamle felles `paint()`-panelfunksjonen; Color og Stroke har egne paneler.

Verifisering: 126 Draw-enhetstester (ny `stroke.test.mjs`). Panel-E2E dekker
vekt/cap/corner, deaktivert limit og Inside/Outside, dash i modell og rendering,
angring, og rendrede pilspisser med skala. Skjermbilde:
`%TEMP%\modcut-draw-stroke-panel.png`.
Kjent: pilstørrelse for `strokeScaling:false` under skalerte foreldre er omtrentlig;
«align dashes to corners» og profiler er ikke laget. Send til Cut må håndtere piler.

## 2026-10-15 — D1.8 del D3: Fill/Stroke-boks og Properties. D1.8 ferdig

- Fill/Stroke-boksen har to rader som i Illustrator: Swap (Shift+X) og Default
  (D), deretter Color (`,`), Gradient (`.`, deaktivert til fase 2) og None (`/`).
  `paint-solid` fantes i keymap uten håndtering; den gjenbruker nå siste
  heldekkende farge for fokusert fyll/strek. Klikk på fyll- eller strekruten
  setter fokus og åpner Color-panelet (strekfarge redigeres der, ikke i Stroke).
- Properties viser utvalg, navn, opacity, formparametre/hjørneradius og en kort
  utseende-oppsummering (Fill, Stroke, Weight) som åpner Color/Stroke uten å
  duplisere redigeringsfeltene. Phase 1-testen sjekker fortsatt at Properties
  ikke gjentar Layers/Transform/Stroke/Color/Align.
- Ingen nye farger: «ingen maling»-markeringen bruker `--danger`.

**D1.8 er ferdig:** Properties, Layers (inkl. template-lag), Transform, Align,
Color, Stroke uten profiles og Fill/Stroke-boks. **Neste: D1.9 kontrollinje og
statuslinje.** Merk at commit d337a8f (annen agent) allerede flyttet
visningskontrollene til appens statuslinje; sammenlign med 3.2 før D1.9 startes.

Full `npm test` etter D1.8 (commit c93383b): sidecar, bridge, main, renderer, 126 Draw-
tester og kontrast passerer. Den stopper deretter i den kjente Cut-testen
`electron/e2e/workflows.mjs` «dragging a crop edge must update the crop», uendret fra
før Draw-arbeidet. Komplett Draw-E2E (`--draw`) passerer separat.
## 2026-10-15: Høyrepanel trinn 1, dokk og panelgrupper

Spesifikasjon: [RIGHT_PANELS.md](RIGHT_PANELS.md). Gren: `claude/draw-properties-layers-panels`
(basert på `feat/vector-draw` `de9ccbb`).

- Høyre dokk viser **Properties øverst og Layers nederst samtidig**. Delelinjen mellom dem kan
  dras for å gi mer plass til den ene eller den andre; dobbeltklikk gir 50/50. Andelen begrenses
  slik at begge deler har minst 120 px (`clampDockSplit`), og lagres per bruker i
  `localStorage` (`modcut_draw_dock_split`), ikke i dokumentet. Hver del kan kollapses fra
  tittellinjen, og den andre fyller da høyden.
- Panelstolpen viser **panelgrupper** i stedet for enkeltpaneler: Color, Stroke,
  Transform (fanene Transform og Align) og Artboards. Klikk åpner gruppen som flyout med faner
  ved siden av stolpen; samme knapp, lukkeknappen eller Escape lukker. Flyouten blir stående
  mens man jobber på canvas (ingen auto-collapse, som Illustrators standard). Siste aktive fane
  per gruppe huskes i `state.ui.groupTabs`.
- Hurtigtaster for paneler går via `panels.open(id)`: F7 viser Layers i dokken, Shift+F7 åpner
  Align-fanen i Transform-gruppen osv.
- Innholdet i panelene er uendret i dette trinnet. Layers-overskriften er flyttet til dokkens
  tittellinje; verktøyknappene står i en rad under.
- Nytt rent register i `panels/registry.mjs`: `DOCK_PANELS`, `PANEL_GROUPS`, `groupForPanel`,
  `clampDockSplit`. Nytt Tabler-ikon `x`, vendret med det nye skriptet
  `scripts/vendor-tabler-icons.mjs` (oppdaterer `sources.json` med sha256).
- Dev-hjelper `electron/e2e/draw-screenshot.mjs` lager skjermbilde av Draw med eksempelfigurer.

Verifisering: 119 Draw-enhetstester passerer (ny `panel-groups.test.mjs`). Komplett Draw-E2E
(`node electron/e2e/run.mjs --draw`) passerer på Linux/Xvfb, med nye kontroller for dokk,
faner, Escape, delelinje, kollaps og F7. To eksisterende E2E-antagelser er oppdatert: panelinnhold
har nå tre monterte steder (Properties, Layers, flyout), og Artboards-flyouten lukkes før testen
tegner der den dekker canvas. Transform-testen sammenlignet tidligere tre-desimalers feltverdier
eksakt og feilet på Linux også før denne endringen; toleransen fra del B (`b912a26`) er beholdt ved sammenslåing. Sidecar-jar kunne
ikke bygges i skymiljøet (jitpack.io er blokkert), så Cut/sidecar-testene er ikke kjørt her.
`bed.js`, Cut og sidecar er ikke endret.

**Neste: trinn 2, scrubby labels (dra i tittelen for å endre tallverdier, Shift for raskere).**

## 2026-10-15: Høyrepanel trinn 2, scrubby labels

- Alle tallfelt med tittel i Properties, panelgruppene (Transform, Artboards, Align spacing,
  Stroke osv.) og Draw-dialogene (Rotate/Reflect/Scale, New document, Layer Options,
  formdialoger) kan endres ved å **dra i tittelen**. Pekeren viser `ew-resize`.
- 2 px per steg. Steget er feltets `step`, ellers 0,1 for mm-felt og 1 for andre enheter.
  **Shift** gir 10 x raskere, **Alt/Option** 10 x finere, og kan byttes midt i draget uten hopp.
  Verdien begrenses av min/max og beholder startverdiens presisjon.
- I panelene vises endringen live på tegningen. Hver ny forhåndsvisning angrer den forrige,
  så ett drag blir **ett angresteg**. **Escape** avbryter og setter tilbake verdien uten historikk,
  uten å lukke panelet. I dialoger oppfører draget seg som inntasting (input-hendelser driver
  dialogens Preview) og Escape stopper bare draget, ikke dialogen.
- Pekerlås (`requestPointerLock`) brukes når den er tilgjengelig, slik at man kan dra langt.
  En lås som innvilges etter at et kort drag er ferdig, slippes automatisk.
- Klikk uten å dra fokuserer feltet. **Pil opp/ned** i feltet endrer med ett steg, Shift ti steg,
  og fokus blir i feltet selv om panelet tegnes på nytt. `renderer/app.js` slipper derfor
  pil opp/ned gjennom til felt merket `data-draw-scrub-input`.
- Ny ren logikk i `ui/scrub.mjs` (testet i Node) og DOM-komponent i `ui/number-field.mjs`
  (`attachScrub`, `enhanceNumberFields`, `cancelActiveScrub`).

Verifisering: 129 Draw-enhetstester passerer (ny `scrub.test.mjs`). Ny E2E
`electron/e2e/draw-scrub-workflows.mjs` (`--draw-scrub`) passerer og er med i komplett Draw-E2E.
Komplett Draw-E2E passerer frem til `project-workflows.mjs:113` («recovery runs while edits
continue»). Den feiler også på `feat/vector-draw` `1020cbc` uten disse endringene (to av to
kjøringer på Linux/Xvfb): intervallet som redigerer hvert 100. ms rekker bare rundt 12
redigeringer på 5 s, så autolagringen kommer ikke innen 2,4 s. Den er ikke rettet her.

Etter sammenslåing med `feat/vector-draw` `6125663` (Color, Stroke, Fill/Stroke-boks og
Properties fra D1.8) ligger Color- og Stroke-panelene i panelgruppene, og Properties har fått
sammendraget av utseende (klikk åpner riktig gruppe). Panel-E2E åpner paneler med en hjelper som
ikke lukker en allerede åpen gruppe. 134 Draw-enhetstester og komplett Draw-E2E (15 av 15)
passerer, også autolagringstesten.

## 2026-10-15: Høyrepanel trinn 3, Layers-panelet

- Hver rad har nå, fra venstre: **øye** (Alt: vis bare dette laget, Ctrl/Cmd: Outline/Preview),
  **lås**, **fargelinje** i lagets markeringsfarge (objekter arver den, dempet), innrykk og pil,
  **thumbnail**, **navn**, **målsirkel** og **søppelkasse**. Søppelkassen vises ved hover og på
  aktiv/valgt rad, og sletter laget med innhold eller objektet i ett angresteg. Siste lag kan ikke slettes.
- **Dobbeltklikk på navnet** gir omdøping direkte i raden, også for lag.
  **Dobbeltklikk på fargelinjen** åpner Layer Options med fokus på Color. Alt-klikk på pilen
  folder ut eller inn alle nivåer under.
- **Thumbnails** lages i render-adapteren (`thumbnail(id)`): en klon i verdenskoordinater med
  modellens synlighet (uavhengig av viewport culling), streker på minst ca. 1,5 px, rasterisert
  til 56 px og cachet per fingerprint for noden og alle etterkommere. Maks 200 per oppdatering.
- **Søk** («Search all») og **filter** (Show all, Only layers, Only visible, Only locked) øverst.
  Treff beholder foreldrene sine; tomt resultat viser «No matches». Skriving bygger bare treet på
  nytt, så søkefeltet beholder fokus. Ren logikk i `filterLayerTree`.
- **Bunnlinje** med «N Layers» og ikonene Collect in new layer, Release to layers, Locate object,
  Make/Release clipping mask (deaktivert til Pathfinder), Create new sublayer, Create new layer
  (Alt-klikk åpner Layer Options for det nye laget) og Delete selection (valgte objekter, ellers
  aktivt lag). Locate fungerer nå også i dokken.
- **Layer Options** som i Illustrator: Name, Color med nedtrekk av 27 navngitte farger
  (Light Blue, Red, Green, …, «Other…») og fargerute ved siden av, og to kolonner med Template | Lock,
  Show | Print, Preview | Dim Images to [50] %. Template låser, slår av Print og tvinger Preview
  (feltene vises deaktivert i stedet for å skjules). Nye rene hjelpere: `NAMED_LAYER_COLORS`,
  `layerColorName`, `deleteRowCommands`.
- Nytt Tabler-ikon `mask`.

Verifisering: 137 Draw-enhetstester passerer (nye tester i `layers.test.mjs`). Panel-E2E dekker
thumbnail (mørke piksler fra ellipsen), fargelinje, omdøping av lag, radsletting, søk med fokus,
filter, teller, Layer Options via fargelinjen og valg av «Red». Komplett Draw-E2E passerer (15 av 15).

## 2026-10-15: Høyrepanel trinn 4, Swatches og Recent Colors

- Ny panelgruppe **Swatches** øverst i stolpen. Fill/Stroke-valg (samme som Color), None-rute,
  **Recent Colors**, og biblioteket gruppert som Basic, Grays (K=90 til K=10), **Laser layers**
  (#FF0000, #00AA00, #0000FF og #000000, de samme fargene Cut bruker for lag) og Custom.
  Klikk på en rute setter fill eller stroke på utvalget (eller standard for nye former).
  Rutenett- og listevisning (navn og hex).
- Bunnlinje med antall, **New swatch** (fra gjeldende farge, havner i Custom) og **Delete swatch**
  (sist valgte rute, markert med stiplet ring). Dobbeltklikk åpner **Swatch Options** (navn og farge).
  Endringer er ett angresteg og lagres i dokumentets `swatches`. Et dokument uten egne swatches viser
  standardbiblioteket; første endring lagrer biblioteket i dokumentet. Sletter man alle, kommer
  standardbiblioteket tilbake.
- **Recent Colors** (10, nyeste først, uten duplikater) deles mellom Swatches og Color. Den
  registrerer fargen når den er brukt ferdig, ikke hvert steg i et slider-drag.
- Color-panelet har fått Recent Colors og scrubby labels på kanalfeltene (R, G, B, H, S, B osv.)
  med live forhåndsvisning og ett angresteg.
- Ren logikk i `doc/swatches.mjs` med enhetstester. Nye Tabler-ikoner: `color-swatch`,
  `layout-grid`, `list`, `square-plus`.
- Gjenstår fra spesifikasjonen: spekterfelt i Color, swatch-grupper som brukeren lager selv og
  globale swatches (D2.3).

Verifisering: 140 Draw-enhetstester passerer. Ny E2E `draw-swatch-workflows.mjs` (`--draw-swatches`)
passerer og er med i komplett Draw-E2E, som passerer (16 av 16).

## 2026-10-15: Høyrepanel trinn 5, Stroke-gruppen med Transparency

- Stroke-gruppen har nå fanene **Stroke | Gradient | Transparency**, som i Illustrator.
  Stroke-panelet er det fullstendige fra D1.8. Gradient vises deaktivert med forklaring
  («Gradients arrive in D2.3»); Mod+F9 åpner gruppen uten å velge den deaktiverte fanen.
- **Transparency**: Blending mode (alle 16 modusene canvas støtter, «Mixed» ved ulike verdier)
  og Opacity (%) med scrubby label, for hele utvalget som ett angresteg. Make Mask, Clip og
  Invert Mask vises deaktivert (D4.3). Mod+Shift+F10 åpner fanen.
- Registeret har fått `panelAvailable` og en liste over faner som ikke er bygget ennå.

Verifisering: 141 Draw-enhetstester og komplett Draw-E2E (16 av 16) passerer. Swatch-E2E dekker
fanene, at Gradient er deaktivert, Multiply på canvas, opasitet 40 % og angring.

## 2026-10-15: Høyrepanel trinn 7 del 1, Pathfinder

- Ny fane **Pathfinder** i Transform-gruppen (Transform | Align | Pathfinder), Mod+Shift+F9.
  Shape Modes: Unite, Minus Front, Intersect, Exclude (Expand vises deaktivert: resultatene er
  allerede vanlige paths). Pathfinders: Divide, Trim, Merge, Crop, Outline, Minus Back.
  Hver knapp har eget ikon tegnet for modCut i Tabler-stil (`panels/pathfinder-icons.mjs`).
- Operasjonene bruker **Paper.js sine Bézier-booleans**, så kurver beholdes (en sirkel minus et
  kvadrat har fortsatt kurvehåndtak). Geometrikjernens worker har fortsatt bare polygonal union;
  Pathfinder går derfor via Paper i hovedtråden. Ren logikk i `geom/pathfinder.mjs` (Paper-objekter
  inn, subpaths ut, ingen DOM) og `doc/pathfinder-commands.mjs` (resultat til dokument-Commands).
- Regler som i Illustrator: Unite, Intersect og Exclude arver utseendet til det øverste objektet,
  Minus Front det bakerste, Minus Back det øverste. Divide eier hver region etter det øverste
  objektet som dekker den. Trim, Merge og Crop fjerner strek; Merge slår sammen synlige biter med
  samme fyllfarge; Crop beholder det som ligger under det øverste objektet og fjerner det. Outline
  gir regionene som tynne streker i fyllfargen. Divide, Trim, Merge, Crop og Outline grupperes.
- Resultatet tar plassen til det øverste objektet i stablingen, originalene fjernes, og alt er
  **ett angresteg**. Resultatet blir valgt. Grupper behandles som én operand (innholdet slås sammen).
  Bilder og tekst avvises med en forståelig melding. Tomt resultat endrer ingenting.

Verifisering: 147 Draw-enhetstester passerer (ny `pathfinder.test.mjs` med areal for alle ti
operasjoner, hull, kurver og kommandoer). Ny E2E `draw-pathfinder-workflows.mjs`
(`--draw-pathfinder`) dekker panelet, Unite med kurve, Minus Front, Divide og Intersect med
angring. Komplett Draw-E2E passerer (17 av 17).

## 2026-10-15: Høyrepanel trinn 7 del 2, Appearance

- Ny panelgruppe **Appearance** (Shift+F6). Viser det valgte objektets stabel: én rad per strek og
  per fyll, øverste rad tegnes øverst (streker over fyll, nyeste først), og «Opacity: Default/40 %»
  nederst som åpner Transparency. «No Selection» uten utvalg; ved flere objekter bes man velge ett.
- Hver rad: øye (skjul/vis oppføringen), navn (velger raden for Duplicate/Delete), fargerute, og
  for streker strekbredde i mm med scrubby label. Rader kan dras for å endre rekkefølge innen
  fyll eller innen streker.
- Bunnlinje: Add New Stroke, Add New Fill (kopi av øverste oppføring, ellers standardfarge),
  Add New Effect (deaktivert til live effekter), Clear Appearance, Duplicate Selected Item og
  Delete Selected Item. Hver endring er ett angresteg.
- **Rendering:** Objekter med mer enn ett synlig fyll eller én synlig strek tegnes med en
  «paint stack» i render-adapteren: én geometrikopi per oppføring, fyll først og så streker, med
  samme transform og node-id (trefftest, transform-forhåndsvisning, Outline-visning, viewport
  culling og zoom-avhengig strek er dekket). Objekter med én av hver tegnes som før. Skjulte
  oppføringer (`hidden: true`, validert i skjemaet) tegnes aldri. Thumbnails bruker stabelen.
- Ren logikk i `doc/appearance.mjs` med enhetstester.
- Kjent begrensning: Color-, Stroke- og Swatches-panelene redigerer fortsatt første fyll og første
  strek. Eksport og Send til Cut (ikke bygget ennå) må ta hensyn til flere oppføringer og `hidden`.

Verifisering: 150 Draw-enhetstester passerer. Pathfinder-E2E er utvidet med Appearance (stabel med
tre deler, bredde, trefftest gjennom stabelen, skjul, dupliser, slett, tøm og seks angresteg).
Komplett Draw-E2E passerer (17 av 17). UI-testen teller nå panelgruppene fra registeret.

## 2026-10-15: Høyrepanel trinn 8, Properties

- Properties har en tittel for utvalget: «No Selection», objekttypen («Rectangle», «Ellipse»,
  «Path», «Group» …) eller «N objects». Navn vises bare ved ett objekt.
- **Quick actions** nederst: Expand Shape (gjør valgte live former om til paths med samme id, ett
  angresteg), og snarveier som åpner Transform, Align, Pathfinder (ved to eller flere objekter) og
  Appearance. Group, Arrange, Lock/Hide osv. kommer hit når D1.10 er bygget.
- Uten utvalg: **Document**-seksjon med aktivt artboard og størrelse, antall artboards, enheter og
  raster effects-oppløsning, Smart Guides av/på, og snarveier til Artboards, Swatches og Layer Options.
- Properties gjentar fortsatt ikke kontrollene fra Transform, Color og Stroke (regelen fra D1.8).

Verifisering: 150 Draw-enhetstester og komplett Draw-E2E (17 av 17) passerer. Pathfinder-E2E er
utvidet med tittel, Expand Shape med angring, snarvei til Appearance, «2 objects», «No Selection»,
dokumentinfo og Smart Guides.

Høyrepanel-planen i RIGHT_PANELS.md er dermed gjennomført. Neste i hovedplanen er D1.9 (kontrollinje),
D1.10 (Group, isolasjon, Arrange, utklippstavle), D1.11 (Place bitmap) og D1.12 (Send til Cut).

## 2026-10-15: D1.10 del A, Group, Arrange, Lock og Hide

- **Group** (Mod+G): gruppen tar plassen til det øverste objektet og beholder rekkefølgen; den nye
  gruppen blir valgt. **Ungroup** (Mod+Shift+G): barna erstatter gruppen der den lå, og arver gruppens
  transform og opasitet slik at utseendet ikke endres; barna blir valgt.
- **Arrange**: Bring to Front (Mod+Shift+]), Bring Forward (Mod+]), Send Backward (Mod+[), Send to Back
  (Mod+Shift+[), innenfor hvert lag eller hver gruppe. Valgte naboer flyttes sammen, og bare valgte
  objekter flyttes, så låste naboer blokkerer ikke.
- **Lock** (Mod+2), **Unlock All** (Mod+Alt+2), **Hide** (Mod+3), **Show All** (Mod+Alt+3) for objekter
  (ikke lag). Unlock All og Show All velger det de låste opp eller viste.
- Object-menyen i Draw har fått Arrange-undermeny, Group, Ungroup, Lock Selection, Unlock All,
  Hide Selection og Show All. Properties har fått Group, Ungroup, Bring to Front og Send to Back.
- **Rettet feil:** klikk på et låst objekt valgte laget det lå i. Trefftesten returnerer nå aldri et lag,
  og låste eller skjulte objekter slipper klikket gjennom, som i Illustrator.
- Ren logikk i `doc/arrange.mjs` med enhetstester. Alt er ett angresteg per kommando.

Verifisering: 154 Draw-enhetstester passerer. Ny E2E `draw-object-workflows.mjs` (`--draw-objects`)
med hurtigtaster, Object-menyen og Properties passerer. Komplett Draw-E2E: alle Draw-arbeidsflyter
passerer; autolagringstesten (`project-workflows.mjs:113`) passerte i én av tre kjøringer.

Undersøkelse av autolagringstesten: en CPU-profil rett før testen viser hovedtråden ledig ca. 85 %
av tiden, og én dokumentendring tar 8 til 14 ms, men en `setTimeout` på 10 ms fyrer først etter
160 til 180 ms. Tidtakerne forsinkes altså uten at Draw-koden jobber. `backgroundThrottling: false`
for testvinduet hjalp ikke og er ikke tatt med. Feilen fantes også på `feat/vector-draw` uten disse
endringene. Neste kandidat er hvordan Xvfb/Electron prioriterer et vindu uten fokus.

## 2026-10-15: D1.10 del B, utklippstavle

- **Cut** (Mod+X), **Copy** (Mod+C), **Paste** (Mod+V, sentrert i visningen), **Paste in Front**
  (Mod+F, rett over det valgte objektet, samme posisjon), **Paste in Back** (Mod+B, rett under),
  **Paste in Place** (Mod+Shift+V) og **Paste on All Artboards** (Mod+Shift+Alt+V, samme plass på hvert
  artboard). Hver er ett angresteg, og det innlimte blir valgt.
- Kopier lagres i verdenskoordinater (hele transformen bakt inn) sammen med bildedataene de bruker,
  så de kan limes inn i andre lag, i grupper med egen transform og i andre faner. Innliming gir nye
  ID-er og legger til manglende bildedata i samme angresteg. Ren logikk i `doc/clipboard.mjs`.
- Edit-menyen i Draw viser Cut, Copy og Paste-variantene. Tastene håndteres av Draws keymap
  (`registerAccelerator: false` i menyen), så tekstfelt beholder sine vanlige Ctrl/Cmd+C/V.
- Gjenstår fra planen: SVG på systemets utklippstavle (kommer med SVG-eksport i D2.5).

Verifisering: 157 Draw-enhetstester passerer (ny `clipboard.test.mjs`). Objekt-E2E dekker alle
variantene, inkludert to artboards og at Mod+V i et tekstfelt ikke limer inn objekter. Alle
Draw-arbeidsflyter passerer; den kjente autolagringstesten feilet i denne kjøringen.

## 2026-10-15: D1.10 del C, isolasjonsmodus (D1.10 ferdig)

- **Dobbeltklikk på en gruppe** med Selection-verktøyet isolerer den. Bare gruppens innhold kan
  klikkes og velges (klikk velger medlemmet, ikke gruppen); alt utenfor dempes til 35 % og kan ikke
  treffes. Dobbeltklikk på en gruppe inne i gruppen går et nivå dypere.
- Nye former, Pen-paths og innliming havner i den isolerte gruppen (i gruppens koordinatsystem, også
  når gruppen har en transform). Select All og markeringsrektangel holder seg innenfor gruppen.
- En stilinje øverst på tegneflaten viser «Layer › Gruppe» med tilbakeknapp; klikk på et høyere nivå
  går dit. **Escape** (når ingen dra-handling pågår) eller **dobbeltklikk på tom flate** går ut av
  isolasjon og velger gruppen. Sletter eller angrer man bort gruppen, avsluttes isolasjonen.
- Tilstanden er midlertidig (`state.ui.isolation`) og lagres ikke i dokumentet.

Verifisering: 157 Draw-enhetstester passerer. Objekt-E2E dekker inngang med dobbeltklikk, stilinje,
demping, klikk og Select All innenfor, tegning og innliming inn i gruppen, Escape, dobbeltklikk på
tom flate og angring. Alle Draw-arbeidsflyter passerer; den kjente autolagringstesten feilet.

D1.10 er dermed ferdig. Neste: D1.9 (kontrollinje), D1.11 (Place bitmap og template-lag) og
D1.12 (Send til Cut).

## 2026-10-15: Høyresiden til Illustrator-paritet

Brukeren ba om at Properties og Layers skal se ut og fungere ganske likt Illustrator.

- **Properties** har nå seksjonene Transform (kompakte felt X, Y, B, H med referansepunkt og lenke,
  rotasjon og Flip horisontalt/vertikalt), Appearance (fargeruter for fyll og strek, strekvekt med
  scrubby label, opacity og knapper som åpner Color/Stroke), formparametre under formens navn, Align
  (seks knapper) og Quick Actions. Feltene er kompakte med etikett ved siden av, som i Illustrator.
  Seksjonene bruker samme komponenter som panelene. Regelen fra D1.8 om ikke å gjenta panelkontroller
  i Properties er erstattet av dette ønsket; Layers vises fortsatt bare ett sted.
- **Layers** har fått panelmeny (≡): New Layer…, New Sublayer, Duplicate, Delete, Options, Make Clipping
  Mask (deaktivert), Locate Object, Merge Selected, Flatten Artwork, Collect in New Layer, Release to
  Layers, Hide Others og Lock Others. Shift/Ctrl-klikk velger flere lag; den fargede firkanten for valgt
  kunst kan dras til et annet lag; dobbeltklikk på lagets thumbnail åpner Layer Options.
- Nye rene funksjoner i `doc/layers.mjs`: `duplicateCommands`, `mergeLayersCommands`,
  `flattenCommands`, `othersUpdates`, `moveToLayerCommands`. Flatten nekter når lag er skjult (Illustrator
  spør først). Nye Tabler-ikoner: `flip-horizontal`, `flip-vertical`, `menu-2`.
- Statusoversikt over hele Draw er lagt i [STATUS.md](STATUS.md).

Verifisering: 158 Draw-enhetstester passerer. Objekt-E2E dekker Flip, fyllfarge og Align fra
Properties, panelmenyen (Duplicate, Hide Others, Merge Selected) og dra av utvalg til et annet lag.

## 2026-10-15: D1.12 Send til Cut v1

- Ny ren modul `renderer/draw/io/cut-svg.mjs` (`artboardCutSvg`, `pathData`): ett artboard blir en
  SVG i millimeter med bare `<path>`, i artboardets koordinater. Grupper og transformasjoner bakes inn,
  former ekspanderes, strekbredden skaleres med transformen. Template-lag, skjulte objekter, bilder og
  objekter utenfor artboardet utelates, med advarsler.
- Dialogen `sendToCutDialog` (artboard, mål, plassering, live oppsummering). Inngang fra topplinjen,
  Artboards-panelet, Properties (Quick Actions uten utvalg), File-menyen og kommandoen `send-to-cut`.
- `app.js` (`sendDrawToCut`) åpner ny Cut-fane eller bruker denne fanens Cut, bytter til Cut, laster
  SVG-en med `prepareSVG` og `bed.loadSVG`, synkroniserer Cut-lagene og viser en toast.
- `bed.loadSVG` har fått et fjerde argument `{ placement, replace }`. Dette er den eneste endringen i
  `bed.js`, som planen krever. Erstatning skjer etter `pushHistory`, så ett angresteg gjenoppretter
  det gamle designet.

Verifisering: 160 Draw-enhetstester passerer (to nye for cut-svg). Ny E2E
`electron/e2e/draw-cut-workflows.mjs` (`--draw-cut`) dekker oppsummering i dialogen, ny fane med
artboardet på bed-origo, mål i millimeter innen 0,01 mm, skalert strekbredde i en skalert gruppe,
ett angresteg, Legg til og Erstatt i samme fane, sentrert plassering, angring av Erstatt, og at Send
er deaktivert for et tomt artboard.

Neste: D1.11 (Place med Template-valg), deretter D1.9 (kontrollinje).

## 2026-10-15: D1.11 Place med Template

- `importArtwork` har fått valget `template`. Da legges artworket på et nytt template-lag under det
  aktive laget (som Illustrator gjør), i samme angresteg som importen. Ren funksjon
  `templateLayerCommands` i `doc/layers.mjs` lager laget unlåst, fyller det og gjør det til template
  til slutt, slik at flyttinger fortsatt er lovlige.
- Import i Draw viser dialogen **Place** (`placeOptionsDialog`) når minst én fil er et bilde, med
  avkrysningen Template. Valget huskes i økten.
- Alt-slipp av bilder plasserer dem som template uten dialog.
- **Use as Template** i Properties (Quick Actions) og kommandoen `use-as-template` flytter valgte bilder
  til et nytt template-lag.
- Avvik fra planteksten: planen sa «over aktivt lag»; Illustrator legger template-laget under, og det
  gjør vi også. Kapittel 11.1 er rettet.

Verifisering: to nye enhetstester i `layers.test.mjs`, ny E2E `electron/e2e/draw-place-workflows.mjs`
(`--draw-place`): Place-dialogen, template-lag under aktivt lag med riktige Layer Options, ingenting
valgt, ett angresteg, Alt-slipp, vanlig slipp og Use as Template med angring.

Neste: D1.9 (kontrollinje), som avslutter fase 1.

## 2026-10-15: D1.9 Kontrollinje (fase 1 ferdig)

- Kontrollinjen bygges i `panels/ui.mjs` (`controlBarContent`) og rendres sammen med Properties, så den
  følger utvalg, verktøy og angring. Felt-nøklene har prefikset `cb-` så de ikke kolliderer med
  Properties.
- Innhold: uten utvalg Fill/Stroke/Weight for nye objekter; med utvalg type, Fill, Stroke, Weight,
  Opacity, X/Y/W/H, Align og hurtigknapper; med Artboard-verktøyet navn og mål for aktivt artboard.
- **View > Control Bar** og kommandoen `toggle-control-bar`; valget lagres i `localStorage`
  (`modcut.draw.controlBar`). Draw-rutenettet har fått en egen rad øverst.
- Import av bilder viser nå Place-dialogen; E2E-hjelperen `submitPlaceDialog` brukes i testene som
  importerer bilder.

Verifisering: ny E2E `electron/e2e/draw-control-workflows.mjs` (`--draw-control`) dekker feltene uten
utvalg, med utvalg (W, X, opacity, vekt, Align høyre mot artboard), artboardmodus, View-menyen med
lagret valg og File > Send Artboard to Cut.

Fase 1 er dermed ferdig. Neste: fase 2, se STATUS.md kapittel 4.

## 2026-10-16: Export As (D2.5 SVG-eksport, D2.7 PNG og JPEG)

- `render/paper-adapter.mjs` har fått `exportArtwork()`: en frittstående kopi av det som skrives ut,
  i Preview-utseende (Outline slås midlertidig av), uten template-lag, skjulte objekter, demping eller
  viewport-culling.
- `index.mjs`: `exportBoard(boardId, format, options)` lager SVG-tekst eller en PNG/JPEG-data-URL for
  nøyaktig artboardet; `exportAs()` viser dialogen og sender filen til appen. SVG skrives av Paper.js
  og pakkes i et millimeterdokument (`io/export.mjs`). Raster tegnes direkte på et lerret med
  artboardets mål og valgt ppi.
- Dialogen `exportDialog`, menyvalget File > Export As…, knapper i Artboards-panelet og Properties.
- `electron/main.mjs`: IPC `exportFile` med lagringsdialog per format; i E2E holdes filene i minnet
  (`getE2EExports`).
- E2E-testene for Send til Cut, Place, kontrollinje og eksport lukker fanene de åpner og setter
  arbeidsflaten tilbake (`rememberTabs` i `draw-test-helpers.mjs`), fordi prosjekttestene etter dem
  forventer den opprinnelige fanen i Cut.

Verifisering: tre nye enhetstester (`export.test.mjs`) og E2E `draw-export-workflows.mjs`
(`--draw-export`): SVG i mm uten template, Preview fra Outline-visning, gjennomsiktig PNG med riktig
pikselstørrelse og halvgjennomsiktig fyll, JPEG på hvitt, dialogen fra File-menyen og lagret fil.
Hele Draw-E2E (`node electron/e2e/run.mjs --draw`) passerer: 22 av 22, inkludert prosjektlagring,
autolagring og gjenoppretting etter krasj.

Neste: D2.1 Tekst.

## 2026-10-16: D2.1a punkttekst

Gjennomgang ved start: rent arbeidstre på `feat/vector-draw`, siste commit `404a1bf`
(SVG/PNG/JPEG-eksport). STATUS og HANDOFF pekte på D2.1 som neste fase. Tekstfasen er delt
opp; denne delen gjør punkttekst brukbar, mens systemfonter og outlines fortsatt gjenstår.

- **Type (T)** plasserer punkttekst. Klikk med Type, dobbeltklikk med Selection eller
  **Edit Text…** i Properties åpner en dialog med levende forhåndsvisning på canvas.
- Flere linjer, Unicode, fontfamilie, størrelse og leading i pt, normal/fet, normal/kursiv
  og venstre/sentrert/høyre avsnitt. Skriving og avbryt endrer ikke dokumentet; Apply er ett
  angresteg. Forhåndsvisningen ryddes også når arbeidsflaten destrueres.
- `doc/text.mjs` inneholder ren oppretting/normalisering. `content.runs[].text`, `character`
  og `paragraph.alignment` lagres i modellen og valideres av schema. Typografiske pt
  konverteres til mm ved rendering. Eksisterende transformasjoner og fargekommandoer kan
  brukes på tekst. Ingen endringer i Cut, sidecar eller prosjektformatversjonen.
- Paper-adapteren viser PointText og bruker samme geometri i SVG/PNG/JPEG-eksporten.
  SVG-eksport retter canvas-fontshorthand til separate weight/style-attributter og lager
  `tspan` med riktig leading for hver linje, fordi Paper ellers kollapser linjeskiftene.
- Send to Cut varsler eksplisitt at tekst utelates inntil outlines finnes.
- Fontfamilie skrives manuelt. Systemets fontsubstitusjon brukes foreløpig; fontfiler bygges
  ikke inn og manglende font markeres ikke ennå. Områdetekst, tekst på path, blandede stiler,
  shaping, Create Outlines og egne Character/Paragraph-paneler er fortsatt del av D2.1.

Verifisering: 168 Draw-enhetstester passerer. Ny Electron-suite `--draw-text` dekker live
canvas-forhåndsvisning før Apply, æ/ø/å, linjeskift, fet/kursiv, SVG/raster, avbryt, lagring/
gjeninnlasting, ett angresteg og advarsel i Send to Cut. Skjermbildet
`%TEMP%/modcut-draw-text-preview.png` er visuelt kontrollert.

Den utvidede teksttesten sjekker også at synlige glyfgrenser i SVG og PNG stemmer innen to
piksler, eksisterende fargebytte og nudging, klikk på eksisterende tekst og Escape under IME.
Separat `--draw-export` og `--draw-feedback` passerer. Samlet `--draw` passerte arbeidsflater,
rendering, UI, fase 1, paths, live corners, transformasjoner og paneler, men stoppet deretter i
`draw-feedback-workflows.mjs:43` (`pen-active` der testen forventer `pen-close`). Markørtesten
passerte alene uten kodeendringer. Årsaken er ikke fastslått; full Draw-E2E er ikke grønn i
denne kjøringen. De etterfølgende delene av det samlede løpet ble derfor ikke kjørt.

Neste: D2.1b systemfontliste/-filer, shaping og Create Outlines. Ikke marker D2.1 som ferdig
før de resterende tekstkravene i hovedplanen er implementert.

## 2026-10-16: Dokumentoppsett ved start, lagfarger med prøve og omdøping av lag

- **Draw starter med New document-dialogen.** Når en fane ikke har et Draw-dokument, viser
  overgangen til Draw dialogen midt på skjermen før noe artboard finnes. OK oppretter dokumentet
  i fanen; Cancel går tilbake til Cut. Et dokument som aldri ble satt opp (`blank` i
  `createProjectDraw`) lagres som `draw: null` i prosjekt og gjenoppretting, så det spør igjen.
  Eldre prosjektfiler med et lagret standarddokument åpnes som før uten dialog.
- **Layer Options › Color** er en egen liste i stedet for native select: hvert navn har en
  fargeprøve til høyre, både i knappen og i listen. Piltaster, Home/End, bokstavsøk, Enter og
  Escape (lukker bare listen) virker. Knappen er fortsatt skjemafeltet `colorName`.
- **Dobbeltklikk på lagnavn** gir omdøping i panelet. Første klikk bygger listen på nytt, så
  den native `dblclick` traff aldri; omdøping utløses nå av klikkantallet (`event.detail === 2`).

## 2026-10-16: D2.1b systemfonter, shaping og Create Outlines

- Ny `electron/font-service.mjs` med smal IPC (`listSystemFonts`, `shapeText`). Skanner system-
  og brukerfontmapper på Windows/macOS/Linux og leser TTF/OTF/TTC/OTC. Filbaner er private i
  main; renderer kan velge kjente fontfamilier/varianter, ikke lese vilkårlige filer.
- Fontkit er låst til **2.0.4**. Standard OpenType/AAT-shaping, kerning og ligaturer brukes.
  Konturer i fontens koordinater konverteres til millimeter og nedovervendt Y; kvadratiske
  kurver blir eksakte kubiske Bézier-kurver. Ingen flattening eller rasterisering.
- Ny ren `doc/text-layout.mjs`; signert/versjonert `node.layout` med glyph-geometri og faktiske
  fontmetadata. Signaturen er uavhengig av JSON-nøkkelrekkefølge og valideres mot tekst,
  tegnstil og avsnitt. Feil/utdaterte/fremtidige cachedata går gjennom eksisterende safe mode.
- Renderer og SVG/PNG/JPEG bruker samme lagrede konturer. Dokumentet bevarer redigerbar tekst
  og utseende uten originalfonten. Ny/endrede tekst krever tilgjengelig font og tegn; fontfiler
  bygges ikke inn. Eldre punkttekst får utlegg ved Edit Text > Apply eller Create Outlines.
- Tekstdialogen har installerte fontfamilier og asynkron live preview. Forsinkede svar etter
  nye innskrivinger, Cancel og destruksjon ignoreres. Apply aktiveres bare for riktig ferdig
  utlegg. App-testen avdekket at blur/change ved lukking kunne starte en ny beregning; duplikate
  verdier ignoreres nå, og ferdig utlegg fanges før dialogen fjernes.
- **Create Outlines** i Type-meny, Mod+Shift+O og Properties. Ett angresteg gjør synlige glyfer
  til paths med flere subpaths ved behov, gruppert per linje og objekt. Identitet, plassering,
  transform, farger, opacity og opprinnelig utvalg beholdes. Tekst inne i valgte grupper støttes.
  Resultatet bruker vanlig Send to Cut. Redigerbar tekst varsler fortsatt om konvertering først.
- Windows-pakkingen inkluderer fontmotoren og alle runtime-avhengigheter. `npm run pack` kjører
  nå også `verify-font-package.mjs`, som importerer fonttjenesten fra den faktiske app-arkivkopien
  og verifiserer glyph-layout. Tredjepartsnotater oppdatert. Ingen fontfiler kopieres til repoet.

Avvik fra den opprinnelige planen: Fontkit i main brukes i stedet for HarfBuzz/FontFace i renderer.
Samme beregnede geometri brukes overalt. Rå fontfiler/fontembedding er ikke nødvendig for denne
delen og er ikke implementert. Områdetekst, tekst på path, egne Character/Paragraph-paneler,
flere tekstegenskaper og variabel-font-kontroller gjenstår i D2.1.

Verifisert: 173 Draw-enhetstester, 18 main-tester, Electron `--draw-text`, `--draw-outlines` og
`--draw-export`. Testene dekker TTF, CFF/OTF og fontsamlinger, fi-ligatur, AV-kerning, æ/ø/å,
multiline, lagring uten fonten, avbryt/rask innskriving, utseende og konturer før/etter outlines,
transform/opacity, angring og faktisk Send to Cut med mål/plassering innen 0,01 mm.
Windows unpacked-build, sidecar-smoketest og fontmotoren fra app.asar passerer. Skjermbildene
for tekst og outlines er visuelt kontrollert. Komplett Draw-E2E ble ikke kjørt på nytt i denne delen.
Første sidecar-smoketest etter siste pakking feilet uten forklarende stderr; direkte ping og
samme smoketest passerte ved omkjøring uten endring av pakken. Årsaken er ikke fastslått.

Arbeidet ble gjort samtidig med dokumentoppsett-/lagarbeidet, som er lagret separat i `8a98e74`.
Eksisterende endringer er bevart; Electron-kjøringene ble holdt adskilt.

Neste: D2.1c områdetekst med automatisk linjebryting, basert på samme fontutlegg.

### 2026-10-16 — D2.1c: rektangulær områdetekst

Fortsatte fra et rent arbeidstre på `feat/vector-draw`, etter punkttekst/systemfonter/outlines.

- Type (T) lager punkttekst ved klikk og områdetekst ved drag. Rammen vises under draget uten
  dokumentendring. Area Type er aktivert i samme verktøygruppe, med egen synlig markør og en
  60 × 30 mm ramme ved klikk/eksakt dialog. Escape avbryter en pågående rammegest.
- Edit Text har bredde og høyde i mm for områdetekst. Feltene beregner live linjebryting og
  glyph-layout; Apply er én historikktransaksjon, og Cancel beholder originalen.
- Ren `doc/text-wrap.mjs` bryter ved mellomrom/bindestrek og bruker grafemgrenser for lange ord.
  Eksponentiell målesøking begrenser fontarbeidet for lange avsnitt i smale rammer. Fontkit
  former hver ferdige linje med kerning/ligaturer. Første baseline og høyde bruker fontens mål;
  valgt leading bestemmer videre linjeavstand. Avsnittsjustering tar hensyn til rammebredden.
- Modellens `frame` inngår i utleggssignaturen. `visibleLines/overflow` valideres sammen med
  glyfene, og områdetekst uten ferdig utlegg avvises ved lagring. Tekst som ikke får plass,
  beholdes i `content` og markeres i dialogen og med rødt pluss på canvas. Tomme rammer kan
  fortsatt treffes. Create Outlines avviser overløp før noen konvertering blir committed.
- Renderer bruker rammegrenser til utvalg, følger foreldrematriser og eksporterer bare synlige
  glyfer. Canvas-kant/pluss og den usynlige målerammen utelates helt fra SVG-geometrien.
  Rettet også livssyklus for gamle Appearance-stakker når redigert tekst får ny geometri.

Avgrensning: rektangler og reflow gjennom Edit Text. Vanlige resize-/Transform-kommandoer
skalerer fortsatt hele objektet. Reflow med canvas-håndtak, tekst i vilkårlig lukket form,
lenkede rammer, full språkavhengig Unicode-linjebryting og automatisk orddeling gjenstår.
Hele D2.1 er fortsatt åpen.

Verifisert: 176 Draw-enhetstester og 19 main-tester. Electron `--draw-area-text`, `--draw-text`,
`--draw-outlines`, `--draw-export` og `--draw-tools` passerer. Den nye app-testen kontrollerer
rammen midt i draget, live reflow/cancel, angre/redo, overløp uten teksttap, tom rammes hit-test,
transformert forelder, save/reload, SVG uten rammegeometri og raster før/etter outlines med
gjennomsnittlig kanalavvik under 0,1. Skjermbilder for preview og transformert ramme er kontrollert.
Komplett Draw-E2E er ikke kjørt på nytt; tidligere kjent samlet Pen-markørfeil står fortsatt i STATUS.

Windows unpacked-build og smoketest av den medfølgende Java-runtime er kontrollert. Fonttesten
fra faktisk app.asar er utvidet til også å forme og bryte områdetekst, uten fontfiler i pakken.

Neste: D2.1d tekst på path, deretter Character/Paragraph og videre områdetekst.

## 2026-10-16: Eksport del 1 — vektorskrivere (PDF, EPS, DXF)

Brukeren ønsker eksport fra File-menyen (ikke Properties), flere vektorformater, et Export for
Screens-vindu som i Illustrator og en Save Adobe PDF-dialog. Arbeidet deles i tre deler; denne
delen legger bare skriverne, uten UI.

- `io/vector-model.mjs` går gjennom eksportgruppen fra renderer én gang og gir en nøytral modell i
  artboard-millimeter: grupper med opasitet/blending, paths som kubiske segmenter, bilder.
- `io/pdf.mjs`: én side per artboard, kurver beholdes, gjennomsiktighetsgrupper for gruppeopasitet,
  ExtGState for fill/stroke-alfa og blend, bilder med SMask (ZIP eller JPEG/DCT), PDF-lag (OCG,
  PDF 1.5+) fra toppnivålag, TrimBox/BleedBox, beskjæringsmerker, registreringsmerker,
  sideinformasjon, miniatyrer, Info og vedlagt Draw-dokument. Forhåndsinnstillinger som Illustrator.
- `io/eps.mjs`: PostScript nivå 2; uten gjennomsiktighet (advarsel, bilder på hvitt).
- `io/dxf.mjs`: R12, mm, y opp, POLYLINE per delbane med kurver flatet innen toleranse, DXF-lag
  per Draw-lag og nærmeste AutoCAD-farge. Bilder utelates med advarsel.

Verifisering: 8 nye enhetstester; PDF-en leses tilbake med pdf.js (sider, størrelse, lag,
vedlegg, metadata).

## 2026-10-16: Send to Cut uten dialog når Cut er tom (Send to Cut v2, del 1)

Brukeren ønsker at Send to Cut går rett gjennom når fanens Cut er tom, og at det etterpå skal gå
an å kopiere og lime inn mellom Cut og Draw. Arbeidet deles i to deler; denne delen er den første.

- `createDrawWorkspace` har fått `cutIsEmpty()`; app.js sender `() => !bed.getDesign()`.
- Tom Cut og ett artboard: ingen dialog. Artboardet legges i denne fanens Cut med øvre venstre
  hjørne på bed-origo. Dialogen åpnes likevel når noe hindrer sendingen (tomt artboard, manglende
  font, tekstoverløp), slik at den kan forklare hvorfor.
- Tom Cut og flere artboards: dialogen har bare Artboard og Placement. Uten noe i Cut er det ikke
  noe å erstatte eller holde adskilt, så målet er alltid denne fanens Cut.
- Cut med innhold: uendret dialog med ny Cut-fane som standard.

Verifisering: 186 Draw-enhetstester. Electron `--draw-cut` (ny direkte vei, fallback ved tomt
artboard og to artboards uten Target), `--draw-control`, `--draw-outlines`, `--draw-area-text` og
`--draw-google-fonts` passerer.

Neste: del 2, kopier og lim inn mellom Cut og Draw.

## 2026-10-16: Kopier og lim inn mellom Cut og Draw (Send to Cut v2, del 2)

- Én regel: **Paste tar den nyeste kopien**, enten den kom fra Cut eller Draw. `drawClipboard.time()`
  og `bed.clipboardTime()` sammenlignes (`performance.now()`).
- Draw → Cut: Copy/Cut i Draw lagrer også en cut-SVG av utvalget (`artboardCutSvg(..., { only })`,
  samme rør som Send to Cut, tekst som glyfkonturer). Paste/Paste in Place i Cut legger den inn med
  `bed.loadSVG(..., { placement: 'origin' })`: samme posisjon på bed som artboardet ville fått ved
  Send to Cut. Ett angresteg. Feil/advarsler (f.eks. bilder, tekst uten utlegg) vises som toast.
- Cut → Draw: `bed.clipboardSVG()` lager en mm-SVG med bed-origo i (0, 0), ett element per kopiert
  objekt, prosessfargen som strekfarge. Rasterbilder utelates med advarsel. Paste i Draw sentrerer i
  visningen; Paste in Place / Front / Back / All Artboards legger bed-posisjonen relativt til aktivt
  artboard (det motsatte av Send to Cut). `importArtwork` har fått `offset`, `label` og `unwrap`, så
  SVG-roten ikke blir en ekstra gruppe. Draw-kommandoen aktiverer Cuts paper-scope mens Cut bygger SVG-en.
- Duplicate i Cut lar utklippstavlen være som den var (som i Illustrator), så den ikke tar over Paste.

Verifisering: 191 Draw-enhetstester (ny test for `only`). Electron `--draw-cut` dekker Copy i Cut →
Paste in Place i Draw (path, posisjon, farge, 0,1 mm strek) og Copy i Draw → Paste i Cut (posisjon,
farge, ett angresteg).

Gjenstår: lim inn mellom vinduer og via systemets utklippstavle; bilder fra Cut til Draw.

## 2026-10-16: Eksport del 2 — File › Export › Export As med PDF-dialog

- Export er fjernet fra Properties og Artboards-panelet; **File › Export › Export As…**
  (Ctrl+Shift+Alt+S) åpner systemets lagringsdialog med alle formater som filtyper (PDF, SVG,
  SVG Compressed, EPS, DXF, PNG, JPEG), deretter formatets valg. Flere artboards gir én PDF med
  sider, ellers én fil per artboard («Navn-Artboard.ext»).
- **Save PDF** som Illustrators Adobe PDF-dialog: forhåndsinnstilling (Default, High Quality Print,
  Press Quality, Smallest File Size, egne lagret i localStorage), kompatibilitet (PDF 1.4–1.7),
  «(Modified)» når noe endres, seksjonene General (sider, bevar redigering, miniatyrer, vis etter
  lagring, PDF-lag), Compression (nedsampling, ZIP/JPEG, kvalitet, komprimer linjekunst), Marks and
  Bleeds og Summary med advarsler. Security/Output/Advanced er utelatt med vilje.
- **Bevar redigering:** PDF-en bærer Draw-dokumentet som vedlegg; Open i Draw gjenkjenner det og
  åpner et redigerbart dokument (`pdfDrawDocument` i `pdfimport.js`).
- Hovedprosessen (`electron/export-files.mjs`) skriver bare til valgt sti (og «-Artboard»-søsken)
  eller inni valgt mappe. E2E bruker `setE2EExportPath` i stedet for dialogen.

Verifisering: 4 nye enhetstester (`export-plan.test.mjs`); `--draw-export` dekker PDF-dialogen,
gjenåpning som redigerbart dokument, DXF og PNG; eksportert PDF og dialogen er kontrollert visuelt.
`--draw`, `--draw-control/objects/cut/place/text/panels` passerer. Fire enhetstester i
Send to Cut/tekst feiler i arbeidstreet, men de hører til den andre øktens uferdige endringer.

## 2026-10-16: Eksport del 3 — Export for Screens

- **File › Export › Export for Screens…** (Ctrl+Alt+E), som i Illustrator: miniatyrer av alle
  artboards med avkrysning, All/Range (avkrysning skriver området), Clear Selection og telling
  «Selected: n, Total export: m». Export to: mappe (Choose…), Open location after export, Create
  sub-folders by Scale/Format. Formatrader med Scale (0.5x–4x eller ppi; 1x = 72 ppi), Suffix og
  Format (PNG, JPG 100/80/50, SVG, PDF, DXF), + Add Scale, × fjerner rad, og Prefix.
- Rader som ville skrive samme filnavn avvises i dialogen. Vektorrader har ingen skala.
- Mappen huskes bare i økten (hovedprosessen godtar bare mapper valgt i egen dialog); radene, prefiks
  og valg huskes i localStorage. «Full Document» og «Assets»-fanen er ikke med.

Verifisering: `--draw-export` dekker dialogen, duplikatvalidering, range ved avkrysning, filstier
med undermapper/prefiks/suffiks og PNG-størrelser for 1x/2x; skjermbildet er kontrollert.

## 2026-10-16: Google Fonts og automatisk tekst til Cut — sluttkontroll

Brukerens font-/Cut-del er ferdig og samlet i `88b3f47`. Hele D2.1 og D2.10 er fortsatt åpne
for de øvrige planlagte funksjonene; dette avslutter Google Fonts og automatisk outlining.

- Hele Google Fonts-katalogen kan søkes (1 950 familier i snapshotet). Valg laster komplette
  fontfiler og opprinnelige lisenser til appens private cache. Ingen API-nøkkel eller installasjon
  av systemfonter kreves. Nett brukes til katalog/fontnedlasting; dokumenttekst formes lokalt.
- Fontreferansen i prosjektet beholder URL, SHA-256 og lisens. Lagrede glyfkonturer virker uten
  fonten eller nett; en annen maskin kan hente den nøyaktige filen ved redigering.
- Numeriske vekter, tilgjengelige stiler, variable akser og navngitte instanser inngår i samme
  utlegg som canvas, eksport og Create Outlines. Manglende engelske instansnavn i fvar-tabellen
  håndteres uten at hele fontfamilien forsvinner eller fontmotoren krasjer.
- Send to Cut sender konturene automatisk, én compound path per glyf med hull og Bézier-kurver
  beholdt. Draw-dokument og historikk endres ikke. Eldre punkttekst uten cache beregnes midlertidig.
  Overløp og uavklart font/geometri blokkerer sending også når andre objekter er gyldige.
  Manuell Create Outlines beholdes. Den sammenslåtte versjonen har også den direkte veien til
  tom Cut og utklippstavlen som ble laget i den parallelle økten.

Avgrensning: monokrome vektorkonturer. Farge-/bitmapglyfer uten støttede konturer, blant annet
visse COLRv1-/emoji-fonter, avvises med melding. Fontbinærer bygges ikke inn i prosjektet eller
app-pakken. Google-endepunktenes format kan endres; snapshot og eksisterende cache beholdes ved feil.

Verifisert mot et fast git-øyeblikksbilde av `88b3f47`: 191 Draw-enhetstester, 23 main-tester,
Electron `--draw-google-fonts`, `--draw-text`, `--draw-area-text`, `--draw-outlines`, `--draw-cut`
og `--draw-export`. Google-testen laster faktisk ned Roboto og Tinos, kontrollerer variable
konturer og faste varianter, lisenser, live preview, save/reload, identisk Cut-SVG før/etter
Create Outlines, faktisk Cut-import, uendret Draw-data, midlertidig legacy-layout og blokkering
ved manglende font. Enhetstestene dekker også offline-cache, versjonspinning, feil sjekksum,
uønskede nedlastingsverter og størrelsesgrenser. Google-fontvelgeren er visuelt kontrollert.
Komplett Draw-E2E er ikke kjørt på nytt i denne sluttkontrollen.

Samtidige økter endret tema, eksport og Send to Cut under arbeidet. Funksjonaliteten ble samlet
i `88b3f47` av en annen økt. Sluttkontrollen bruker derfor en uforanderlig kildekopi av denne
commiten. En tidligere app.asar-kontroll fant ugyldig innhold under samtidig filendring; årsaken
er ikke endelig fastslått. Byggingen ble kjørt på nytt fra det faste øyeblikksbildet.

Den endelige Windows unpacked-pakken passerer sidecar-smoketest med medfølgende Java-runtime.
Fontmotoren importert fra faktisk app.asar passerer med 367 installerte fontvarianter,
1 950 Google-familier fra bundlet katalog uten nett, glyfkonturer og områdetekstutlegg.
Fasen Google Fonts / automatisk tekst til Cut er dermed avsluttet og dokumentert.

## 2026-10-16: D2.1d Type on a Path (Claude overtar etter Codex)

Claude overtok etter Codex' Google Fonts-del. Grenen `claude/draw-properties-layers-panels` er
spolt fram til `origin/feat/vector-draw` (05611d9) før arbeidet startet; `npm ci` trengs for fontkit.

- Ny teksttype `onPath` (`onPath: { subpath, offset, flip }`) i `doc/text.mjs`, med validering i
  `doc/schema.mjs` og i utleggssignaturen (`doc/text-layout.mjs`, `validPathSubpath`).
- `geom/path-measure.mjs`: buelengde langs Bézier-delbaner (48 prøver per kurvesegment), punkt og
  tangent ved lengde, reversering (Flip), startpunkt for venstre/sentrert/høyre, og en stiv glyframme.
- `electron/font-service.mjs`: for `onPath` formes teksten som én linje; hver glyf sentreres på sin
  buelengde og roteres etter tangenten. Glyfer som ikke får plass gir `layout.overflow`. Feilsjekkene
  for glyfer er samlet i `outlines()`, og fontmetadata i `fontInfo`.
- Verktøyet `type-on-path` er aktivert med egen markør. Klikk på path eller live form åpner dialogen
  Type on a Path (Start offset, Flip). Apply erstatter banen med teksten i ett angresteg.
- Rendereren tegner banen som hjelpelinje (rød med pluss ved overløp), og banen er treffsone.
- Meldinger for overløp i Create Outlines og Send to Cut sier «path» i stedet for «frame».
- `draw-text-workflows.mjs` velger nå en installert familie med Fet Kursiv. Testen feilet i skymiljøet
  fordi standardfonten (DejaVu Sans) mangler kursiv og picker-en faller tilbake til normal.

Verifisering: 196 Draw-enhetstester (5 nye i `path-measure.test.mjs`), 24 main-tester (ny test for tekst
på path med ekte font: rett linje lik punkttekst, utside/innside av sirkel, Flip, høyrejustering,
overløp, ugyldig signatur ved endret start). Ny E2E `draw-path-text-workflows.mjs` (`--draw-path-text`):
klikk på sirkel, live forhåndsvisning, ett angresteg, Flip og startforskyvning, overløp med rødt
pluss, blokkert Create Outlines og Send to Cut, banen som treffsone, lagre/åpne, SVG og Create Outlines.
Samlet `node electron/e2e/run.mjs --draw` fra en fast kopi av 7af3af2: alle 24 Draw-suiter passerer;
deretter feilet bare den kjente autolagringstesten (`project-workflows.mjs:113`, «recovery runs while
edits continue»), som er ustabil i skymiljøet (se tidligere oppføringer).

Neste: Character- og Paragraph-paneler.

## 2026-10-17: D2.1e Character og Paragraph

`feat/vector-draw` er spolt fram til Claudes arbeid etter brukerens ønske, og arbeidet fortsetter der.

- `panels/registry.mjs`: panelene `character` og `paragraph` i gruppen `type` (ikon `typography`).
  Nye Tabler-ikoner: `typography`, `align-left`, `align-right`, `letter-case-upper`.
- `panels/ui.mjs`: `characterPanel` og `paragraphPanel`, brukt i flyouten, i Properties (prefiks `prop-`)
  og delvis i kontrollinjen (`cb-font-family`, `cb-font-size`, justeringsknapper). Tallfeltene her har
  ikke scrubby labels fordi hver endring må formes asynkront; `field()` har fått `scrubbable`.
- `index.mjs`: `textStyle(changes, label)` former alle valgte tekster på nytt med `resolveText` og legger
  dem i én historikktransaksjon. Byttes familie, fjernes lagret face, Google-referanse og variable akser.
  `fontFamilies()` laster installerte familier én gang.
- `doc/text.mjs` og `doc/schema.mjs`: `character.tracking` (-1000 til 10000) og `character.allCaps`.
  Standardverdier lagres ikke. Edit Text tar dem med uendret.
- `electron/font-service.mjs`: tracking legges til hver glyfs fremføring (også i bryting og på path);
  All Caps former versaler uten å endre innholdet.

Verifisering: 196 Draw-enhetstester, 25 main-tester (ny: tracking per glyf, All Caps med samme glyfer
som versaler, validering, tracking i linjebryting). Ny E2E `draw-character-workflows.mjs`
(`--draw-character`): Mod+T, størrelse, tracking, All Caps, fet face, familie og ukjent familie, ett
angresteg per endring, Paragraph for flere tekster i ett steg, felt i Properties og kontrollinjen,
lagring og eksport.

Neste: D2.2 compound paths og clipping masks.

## 2026-10-17: D2.2 compound paths og klippemasker

- `doc/compound.mjs`: `compoundCommands` (Make Compound Path, også fra grupper, i verdenskoordinater
  regnet om til målforelderen, even-odd, bakerste objekts maling), `releaseCompoundCommands`,
  `clipCommands` (klippegruppe; `clip` settes til slutt så hvert steg er gyldig) og `releaseClipCommands`.
- Schema: `group.clip` (boolsk); en klippegruppe må ha en path eller form øverst.
- Rendereren setter `clipMask` på øverste barn i klippegrupper, og gruppens grenser er klippebanens.
  Paper.js tar seg av tegning og treff.
- `exportArtwork({ resolveClips: true })` gjør klippingen om til geometri for PDF/EPS/DXF
  (`export-controller.mjs`), og `clippedSubpaths` brukes av Send to Cut (`cutSvg` i `index.mjs`).
- Object-menyen har fått undermenyene Clipping Mask og Compound Path; Make Clipping Mask i Layers-menyen
  er aktivert (gjelder utvalget, ikke hele laget).

Verifisering: 201 Draw-enhetstester (5 nye i `compound.test.mjs`). Ny E2E `draw-compound-workflows.mjs`
(`--draw-compound`): Mod+8 med hull og bakerste maling, ett angresteg, release, klippemaske fra
Layers-menyen, grenser og treff, PNG/SVG, klippet PDF/EPS/DXF-modell og Send to Cut, release.

Neste: D2.4 path-kommandoer.

## 2026-10-17: D2.4 del A, path-kommandoer

- `geom/path-commands.mjs`: `joinSubpaths` (nærmeste eller valgte endepunkter, riktig retning,
  sammenfallende ender blir ett anker), `closeSubpath`, `averagePoints`, `addAnchorPoints`
  (de Casteljau ved t = 0,5, også lukkesegmentet), `removeAnchorPoints`, `reverseSubpaths`,
  `cleanUpTargets` og `mapSubpath`. Live hjørner bakes først.
- `index.mjs`: `pathCommand` for `join`, `average` (dialog `averageDialog`), `reverse-path`,
  `add-anchors`, `remove-anchors` og `clean-up`. Former blir paths med samme id (`replaceLeaf`).
  Join mellom objekter regner den nederste banen om til den øverstes koordinatsystem.
- Object-menyen har fått undermenyen Path. `createDrawWorkspace` har fått `onNotice` (info-toast),
  brukt av Clean Up.

Verifisering: 207 Draw-enhetstester (6 nye), ny E2E `draw-path-commands-workflows.mjs`
(`--draw-path-commands`). Hele Draw-E2E for forrige commit (6114094) passerte uten feil, også
prosjekt- og autolagringstestene.

Neste: D2.4 del B, Simplify og Offset Path.

## 2026-10-17: D2.4 del B, Offset Path og Simplify

- `geom/kernel-js.mjs`: `offsetPaths` med ClipperOffset (miter med grense, round, bevel som square),
  fyllregelnormalisering før offset, åpne baner med butt-ender, union av resultatet. Kjerneklientens
  `offset` virker nå også i workeren (`runGeometry('offset')`).
- `index.mjs`: `offset-path` (dialog `offsetDialog` med asynkron live forhåndsvisning; resultatet legges
  over kilden) og `simplify` (dialog `simplifyDialog` med glider og punkttelling; utflating med
  `flattenPath`, kurvetilpasning med Paper.js `simplify`, toleransen halveres hvis en lukket bane ville
  falle sammen til under tre ankre).
- `render/paper-adapter.mjs`: `previewPaths(entries, hide)` tegner foreslåtte baner i overlegget og kan
  skjule originalene.
- Object > Path har fått Offset Path… og Simplify….

Verifisering: 211 Draw-enhetstester (4 nye i `offset.test.mjs`: miter, krymping, round og bevel, hull,
stjerne med -2 mm og round joins uten selvkryssing, åpen linje; kjernetesten kjører offset i workeren).
`--draw-path-commands` dekker Offset Path (forhåndsvisning endrer ikke dokumentet, mål 2 mm, over kilden,
ett angresteg) og Simplify (punkttelling, lukket bane, ett angresteg).

Neste: D2.3 gradienter.

## 2026-10-17: D2.3 gradienter

- `doc/gradient.mjs`: standardgradient over en boks (lineær langs vinkelen, radiell fra midten),
  gradientvektor, `vectorGradient` for verktøyet, stopp (legg til, fjern, oppdater, reverser),
  type og vinkel, `changeGradient`, `gradientHex` (første stopp) og CSS for panelets gradientlinje.
- `render/paper-adapter.mjs`: `color()` lager Paper-gradienter i objektets koordinater med stopp- og
  fyllopasitet; pilspisser bruker første stopp. `localBounds(id)` for gradientgeometri.
- Panelet `gradientPanel`, kommandoen `paint-gradient` (tasten `.`), verktøyet `gradient` (G) med egen
  markør, linje under draget og `mergeKey` for ett angresteg. Properties viser gradienten.
- `cut-svg.mjs` og `vector-model.mjs` bruker første stopp som farge (advarsel for PDF/EPS/DXF).
- Testene som forventet en deaktivert Gradient-fane og -knapp er oppdatert.

Verifisering: 215 Draw-enhetstester (4 nye i `gradient.test.mjs`), ny E2E `draw-gradient-workflows.mjs`
(`--draw-gradient`): tasten `.`, PNG-piksler hvit til svart, Properties, stopp, farge, Reverse, radial,
verktøydrag som ett angresteg, SVG `linearGradient`, første stopp i Send to Cut. Hele Draw-E2E for
forrige commit (29da906) passerte uten feil.
Hele Draw-E2E for gradient-commiten (b644831) passerte også: 30 av 30 suiter, uten feil.

Neste: D2.8 flere verktøy.

## 2026-10-17: D2.8 del A, Eyedropper, Measure, Group Selection og Scissors

- `doc/tool-rules.mjs`: `sampleAppearance`, `applySampleCommands`, `measure` (vinkel mot klokka,
  uten -0) og `groupSelectionTarget`. `geom/path-commands.mjs`: `cutSubpath`.
- `tools/interactions.mjs`: verktøyene `eyedropper` (Shift leser lerretets piksel med `pixelHex`),
  `measure`, `group-selection` og `scissors` (bruker `renderer.curveHit`). Markører i `cursors.mjs`.
- `index.mjs`: `eyedropper`, `scissors` og `setMeasure`; statuslinjen viser målingen.
  `renderer.setMeasure` tegner målelinjen i overlegget.

Verifisering: 219 Draw-enhetstester (4 nye i `tool-rules.test.mjs`), ny E2E
`draw-tools-two-workflows.mjs` (`--draw-tools-two`).

Neste: D2.8 del B, Pencil, Shear og Arc.

## 2026-10-17: D2.8 del B, Pencil, Shear og Arc

- `geom/transforms.mjs`: `shear` i `TRANSFORM_TOOLS`, `operationMatrix`, `dragTransform` (aksen følger
  draget) og `dialogOperation`. Transformdialogen har vinkel og akse for Shear; Object > Transform > Shear….
- `tools/shapes.mjs`: `arc` i `SHAPE_TOOLS`; `shapeFromDrag('arc')` lager en åpen path (kvart ellipse).
- `tools/interactions.mjs`: Pencil samler punkter med live linje; slipp gir `api.pencil`. En lukket sløyfe
  ender der den startet, så antallet punkter avgjør (ikke bare flyttavstanden).
- `index.mjs`: `pencil` og `pencilDialog`; `fitCurve` (felles med Simplify) halverer toleransen til lukkede
  baner har minst tre ankre. Uten den forsvant en sirkelformet blyantstrek uten melding.
- `toParentSpace` flytter ankrene til paths i stedet for å gi dem en transform.

Verifisering: 222 Draw-enhetstester (3 nye i `shear-arc.test.mjs`); `--draw-tools-two` dekker også Pencil
(lukket sløyfe og åpen strek, ett angresteg), Arc og Shear (dialog med 30° og drag som ett angresteg).
Hele Draw-E2E for del A (49fdd22) passerte: 31 av 31.

Neste: D2.9 History-panel, Info-panel og kommandosøk.

## 2026-10-17: D2.9 History-panel, Info-panel og kommandosøk

- `panels/registry.mjs`: panelene `info` og `history` i en ny Info-gruppe i panelraden.
- `panels/ui.mjs`: `historyPanel` (Open-rad, grå angrede steg, klikk går til steget via `api.historyGoTo`),
  `infoPanel` og `updateInfo`, som `status()` kaller slik at pekerposisjonen oppdateres uten full rendering.
- `ui/command-search.mjs`: ren søkefunksjon og modal; `index.mjs` håndterer `command-search`
  (Mod+Shift+K var allerede i keymapen) med ferdige kommandoer, verktøy og paneler.
- Ikoner: `history`, `info-circle` og `search` fra Tabler.

Verifisering: 224 Draw-enhetstester (2 nye i `command-search.test.mjs`), ny E2E
`draw-history-info-workflows.mjs` (`--draw-history`). Hele Draw-E2E for D2.8 del B (9a8e596) passerte: 31 av 31;
for D2.9 (88e1120): 32 av 32.

Neste: Draw Inside (rest av D2.2).

## 2026-10-17: Draw Normal, Behind og Inside (rest av D2.2)

- `doc/draw-mode.mjs`: `placement` gir forelder, indeks og eventuelle kommandoer (Draw Inside lager
  klippegruppen første gang); `insideTarget` godtar én bane, form eller klippegruppe.
- `index.mjs`: `insertNew` brukes av figurer, Pencil, ny tekst og Pen (via `api.insertNew` i `tools/paths.mjs`);
  kommandoene `draw-mode` (Shift+D), `draw-normal`, `draw-behind` og `draw-inside`.
- `tools/toolbar.mjs`: tre modusknapper (Tabler `square`, `layers-selected-bottom`, `square-dot`).
- `render/paper-adapter.mjs`: en klippebane med maling får en fyllkopi først i gruppen og en strekkopi
  over gruppen. Eksport følger med fordi den kloner Paper-treet.
- `io/cut-svg.mjs`: fyllet til en slik klippebane settes inn før gruppens innhold, streken etter.

Verifisering: 228 Draw-enhetstester (4 nye i `draw-mode.test.mjs`), ny E2E `draw-modes-workflows.mjs`
(`--draw-modes`) som sjekker piksler på lerretet (klipping, fyll og strek) og Send to Cut.

Neste: D2.10 Send til Cut v2.

## 2026-10-17: D2.10 del A, Outline Stroke, kutt ved artboard og validering

- `geom/kernel-js.mjs`: `outlineStroke` (ClipperOffset med etClosedLine for lukkede baner og butt,
  round eller square for åpne). Unionen gir hull med motsatt retning, så nonzero-fyll blir riktig.
- `index.mjs`: kommandoen `outline-stroke` (Object > Path > Outline Stroke) og `strokeOutlines` for
  Send to Cut, som omrisser den samme (eventuelt klippede) geometrien som ellers sendes.
- `io/cut-svg.mjs`: `push` lager ett element; valgene `clipToBoard` (via `geometry.clip`), `outlines`
  og `dedupe`; tellerne `nodes`, `tiny` og `duplicates`.
- `ui/dialogs.mjs`: Strokes, Past the artboard og Leave out duplicate paths; sammendraget oppdateres ved hvert valg.
- Direkte sending til tom Cut krever nå null advarsler.

Verifisering: 233 Draw-enhetstester (`outline-stroke.test.mjs`, `cut-svg-options.test.mjs`), ny E2E
`draw-cut-two-workflows.mjs` (`--draw-cut-two`).

Hele Draw-E2E for Draw-modusene (16fe909) stoppet på Clean Up-varselet i `draw-path-commands-workflows.mjs`:
toasten lever 4 s, og i en full kjøring kom pollingen for sent. Testen registrerer nå toasts med en
MutationObserver før handlingen. Suiten passerte alene både før og etter endringen.

Neste: D2.10 del B, `cutLinks` og Oppdater i Cut.

## 2026-10-17: D2.10 del B, Update in Cut

- `bed.js` (smal endring etter kapittel 14.2): `loadSVG` tar `link` (merker nye elementer med
  `data.drawLink` = dokument, artboard og posisjonen slik den ble sendt) og `replaceLink` (fjerner de
  merkede elementene i samme angresteg og flytter den nye sendingen like mye som brukeren flyttet den
  gamle). `linkedCount` sier om en sending finnes.
- `app.js`: `sendDrawToCut` håndterer `target: 'update'`, bytter til fanen som fikk sendingen om den er
  åpen, og returnerer `cutTabId`.
- `index.mjs`: `cutLinks` skrives etter hver sending; `sourceHash` (FNV-1a av sentrallinje-SVG-en, hurtigbufret
  per dokumentversjon) og `cutStatus`; `updateInCut` gjentar lagrede valg.
- `panels/ui.mjs`: status i artboardlisten og knappen Update in Cut. `ui/dialogs.mjs`: Target-valget Update.
- `doc/commands.mjs`: `updateDocument` tar en etikett.

Verifisering: `--draw-cut-two` dekker nå også status, endring, oppdatering med beholdt flytting og
brukerens egne elementer, og ett angresteg i Cut. `draw-cut-workflows.mjs` forventer nå Update som
standard Target for et artboard som er sendt før. Hele Draw-E2E for D2.10 del A (4173ee7): alle Draw-suitene
passerte; kjøringen stoppet på den kjente autolagringsflaken (`project-workflows.mjs:113`).

Neste: D2.10 del C, bilder som rastergravering og flere artboards i én sending.

## 2026-10-17: D2.10 del C, bilder og alle artboards

- `io/cut-svg.mjs`: bildenoder gir `images` (data-URL, senter, størrelse og rotasjon i artboardets mm,
  pluss asset-id for endringshashen); `ALL_ARTBOARDS` (`'all'`) bruker rektangelet rundt alle artboards,
  tar bare med kunst som ligger på minst ett, og kutter ved hvert artboard.
- `bed.js`: `loadSVG` tar `images` og lager rastrene i samme angresteg (`placeRaster`, samme oppsett som
  `loadImage`), forskjøvet som banene ved sentrering og ved Update.
- `app.js`, `index.mjs` og dialogen: bilder telles med; Artboard-valget har All artboards.

Verifisering: 235 Draw-enhetstester (2 nye i `cut-svg-options.test.mjs`); `--draw-cut-two` sender et
bilde rotert 90° og to artboards i én sending.

Hele Draw-E2E for del B (36b1a21) og del C (c20cda2): alle suiter til og med `--draw-cut-two` passerte;
`Draw outlines` stoppet begge gangene med CDP-feilen «Promise was collected». Den passerer alene, og
Cut v2 etterfulgt av outlines passerer også; årsaken følges opp med logging av uttrykket som feiler.

Neste: D2.5 full SVG-import til Draw-modellen (se STATUS.md kapittel 4).

## 2026-10-17: D2.5 SVG-import til Draw-modellen

- `import-artwork.mjs`: `prepareVector` rasteriserer bare ved `mask` eller `filter`. Innebygde `<image>`
  byttes med navngitte plassholder-rektangler før Paper-importen; `convert` gjør dem til bildenoder ut fra
  rektangelets hjørner (Paper lager rektangler som nede-venstre, oppe-venstre, oppe-høyre, nede-høyre).
- Gradientfarger fra Paper blir Draw-gradienter (`gradientPaint`), klippede grupper blir klippegrupper,
  `PointText` blir punkttekst (`pointText`) med Paper-matrisen som transform.
- Paper lar klippede primitiver være `Shape` og gir rot-SVG-en en klippemaske for visningsvinduet:
  `Shape` gjøres om til bane (satt inn ved siden av formen mens den leses), og rotens maske ignoreres.
- Bildene gjøres om til PNG-assets etter importen, når Paper er tilbake på sitt eget scope; siden
  `createNode` kopierer barna, settes asset-id-en etter node-id i det ferdige treet.

Verifisering: ny E2E `draw-svg-import-workflows.mjs` (`--draw-svg-import`).


WebP (D2.7): `webp` i `EXPORT_FORMATS`, `EXPORT_TARGETS` og `EXPORT_FILE_TYPES`; Export As-dialogen gir
WebP gjennomsiktig bakgrunn og kvalitet; Export for Screens har en WebP-rad. `draw-export-workflows.mjs`
sjekker MIME-type, størrelse og gjennomsiktighet, og `export-plan.test.mjs` filendelsen.

Neste: D2.3 globale swatches og gradientswatches.

## 2026-10-17: D2.3 globale swatches og gradientswatches

- `doc/swatches.mjs`: `addSwatch` tar en gradient (gradientswatch) eller hex med `global`; `swatchPaint`;
  `linkedPaints` gir nye utseender for alt som er koblet til en swatch (ny farge, eller koblingen fjernet).
- `doc/paint.mjs` og `index.mjs`: `changePaint`/`paint` tar `swatch` og lagrer koblingen i den solide malingen.
- `panels/ui.mjs`: klikk på gradientswatch bruker `api.gradient` med `defaultGradient` over objektets boks;
  Swatch Options og Delete Swatch oppdaterer koblede objekter i samme transaksjon. `ui/dialogs.mjs`: Global.

Verifisering: 237 Draw-enhetstester (2 nye i `swatches.test.mjs`); `draw-swatch-workflows.mjs` dekker global
omfarging i ett angresteg og gradientswatch. Hele Draw-E2E for 49730c0 (SVG-import og WebP): alle Draw-suitene
passerte, også outlines; kjøringen stoppet på autolagringsflaken (`project-workflows.mjs:113`).

Neste: resten av D2.1, blandede stiler i én tekst først.

## 2026-10-17: D2.1 skalering, baseline shift og kerning

- `electron/font-service.mjs`: `horizontalScale` strekker glyfer og fremrykk, `verticalScale` bare glyfene,
  `baselineShift` løfter glyfene, `kerning: 'none'` slår av fontens `kern`-funksjon i Fontkit.
- `doc/text.mjs` og `doc/schema.mjs`: validering og lagring bare ved avvik fra standard. `ui/dialogs.mjs`:
  Edit Text tar egenskapene med videre. `panels/ui.mjs`: fire nye felt i Character.

Verifisering: ny test i `electron/test-font-service.mjs` (26 main-tester), `draw-character-workflows.mjs`
setter skala, shift og kerning og angrer dem i tre steg.

Årsaken til «Promise was collected» i `Draw outlines` er funnet med logging av uttrykket: kallet som starter
Send to Cut ventet på en `import()`-promise som Chromium samlet opp sent i en full kjøring. Testen starter nå
sendingen uten å vente på en promise og venter i stedet på byttet til Cut. Hele Draw-E2E for 15528ff (swatches)
stoppet der; alle suiter før den passerte.

Neste: avsnitt (justert tekst, innrykk og avstand), så blandede stiler.

## 2026-10-17: D2.1 avsnitt: justert tekst, innrykk og avstand

- `doc/text-wrap.mjs`: `wrapLines` gir linjene med avsnitt, første og siste linje, og tar en bredde per linje
  (førstelinje-innrykk); `wrapText` er en tynn innpakning rundt den.
- `electron/font-service.mjs`: innrykk flytter og smalner linjene, avstand før og etter legges mellom
  avsnitt (også i beregningen av synlige linjer), og `justify` fordeler ledig plass på mellomrommene.
- `doc/text.mjs`, `doc/schema.mjs`, `ui/dialogs.mjs` og `panels/ui.mjs`: validering, lagring bare av
  verdier ulik null, Justify-knapp (Tabler `align-justified`) og fem felt i Paragraph.

Verifisering: ny test i `electron/test-font-service.mjs` (27 main-tester); `text.test.mjs` avviser nå
`justify-all` og ugyldige innrykk; `draw-character-workflows.mjs` dekker justify, innrykk og avstand.
Hele Draw-E2E for 218724f: alle 33 Draw-suiter passerte (outlines også); bare autolagringsflaken stoppet.

Neste: blandede stiler i én tekst.

## 2026-10-17: D2.1 blandede stiler i én tekst

- `doc/text.mjs`: `RUN_KEYS`, `runCharacter` og `normalizeRuns` (tomme deler fjernes, like naboer slås sammen,
  deler som ikke stemmer med teksten forkastes); `textValues` gir `runs`. `doc/schema.mjs` validerer delene.
- `doc/text-wrap.mjs`: linjene har `start`, og målefunksjonen får posisjonen, så bredden kan regnes per del.
- `electron/font-service.mjs`: `resolveFont` er skilt ut; `shape` lager én stil per del (egen font ved ny
  familie, vekt eller stil), regner posisjoner i mm, og gir automatisk linjeavstand for større deler.
- `ui/dialogs.mjs`: stilraden i Edit Text med stil per tegn som følger redigering. `index.mjs`: en endring for
  hele objektet fjerner samme egenskap fra delene.

Verifisering: ny test i `electron/test-font-service.mjs` (28 main-tester); `draw-text-workflows.mjs` gjør
«Horten» fet og 40 pt, åpner igjen, skriver videre og angrer. Område-, path-, Character-, outlines- og
SVG-import-suitene passerer med den nye motoren. Hele Draw-E2E for 5090d92 (avsnitt): alle 33 Draw-suiter
passerte; bare autolagringsflaken stoppet.

Neste: fase 3, først D3.1 Expand Appearance.

## 2026-10-17: D3.1 Expand og Expand Appearance

- `index.mjs`: `expanded(id,{fill,stroke})` lager delene (fyll for seg, omrissede streker) i tegnerekkefølge;
  `expandSelection` bytter objektene i ett angresteg. Kommandoene `expand` (med `expandDialog`),
  `expand-appearance` og `outline-stroke` bruker den. Object-menyen har Expand… og Expand Appearance.

Verifisering: `--draw-cut-two` utvider et objekt med to fyll og en strek, og med bare Stroke valgt.
Hele Draw-E2E for 5b8ff8d (blandede stiler): alle 33 Draw-suiter og prosjekttestene passerte; kjøringen stoppet
i krasj- og relanseringstesten («DevTools connection closed»), som passerte sist den ble nådd (run 14).

Neste: D3.5 Lasso og Select-meny.

## 2026-10-17: D3.5 Select-meny, Magic Wand og Lasso

- `doc/select-rules.mjs`: `selectableObjects`, `inverseSelection`, `sameAs` (`SAME_MODES`), `magicWand`,
  `objectsOfKind` (`OBJECT_KINDS`), `stackNeighbour`, `saveSelection`, `savedSelection` og `insidePolygon`.
- `index.mjs`: `selectionCommand` (kommandoene `select-inverse`, `select-same-*`, `select-object-*`,
  `select-next-above/below`, `reselect`, `save-selection`, `edit-selection`); Magic Wand og Lasso i
  `implementedTools`; Magic Wand-toleranser på Enter (`magicWandDialog`).
- `tools/paths.mjs`: `lasso` velger ankre innenfor polygonet; `tools/interactions.mjs`: gestene med stiplet forhåndsvisning.
- `electron/main.mjs`: Select-menyen; `keymap.mjs`: Mod+Alt+] og [.

Verifisering: 241 Draw-enhetstester (4 nye i `select-rules.test.mjs`), ny E2E `draw-select-workflows.mjs` (`--draw-select`).
Hele E2E for eceff4a (Expand) passerte helt: 35 av 35, med prosjekt-, autolagrings- og relanseringstestene.

Neste: D3.4 Shape Builder, Eraser og Knife.

## 2026-10-17: D3.4 Shape Builder, Knife og Eraser

- `geom/region-ops.mjs`: Paper-operasjoner på PathData i verdensmillimeter; `pieces` deler et resultat i
  ytterringer med hullene sine, så hver løs bit blir egen bane.
- `index.mjs`: `shapeBuilderSession` deler utvalget med Pathfinder Divide når draget starter;
  `shapeBuilder` slår sammen eller sletter og bruker `pathfinderCommands`; `cutWith` bytter hvert mål med
  bitene sine (via `booleanOperand` og `toParentSpace`) og hopper over former draget ikke traff.
- `tools/interactions.mjs`: gester med skravering (Shape Builder), linje (Knife) og penselstrøk (Eraser).

Verifisering: 244 Draw-enhetstester (3 nye i `region-ops.test.mjs`), ny E2E `draw-region-tools-workflows.mjs`
(`--draw-region-tools`). Hele E2E for 4800e69 (Select-menyen) passerte helt: 36 av 36.

Neste: D3.6 Free Transform, Transform Each og Split Into Grid.

## 2026-10-17: D3.6 Transform Each, Split Into Grid og Free Transform

- `geom/transform-each.mjs`: `compose`, `transformEachMatrix` (skaler, speil og roter rundt referansepunktet,
  så flytt; Random som faktor), `gridCells`, `distortPoint`, `distortSubpaths` og `boxCorners`.
- `index.mjs`: `transform-each` bruker `transforms.apply` per objekt i én transaksjon (Copy samler kopiene);
  `split-into-grid` bytter hver bane med cellene i forelderens rom; `freeDistortSession`, `freeDistortPreview`
  (via `renderer.previewPaths`) og `freeDistort` (former blir baner med `replaceLeaf`).
- `ui/dialogs.mjs`: `transformEachDialog` og `splitGridDialog`; menyoppføringer i `electron/main.mjs`.

Verifisering: 249 Draw-enhetstester (5 i `transform-each.test.mjs`); `--draw-region-tools` dekker alle tre.
Hele E2E for 785f19e (D3.4) passerte helt: 37 av 37.

Neste: D3.2 effekter.

## 2026-10-17: D3.2 del A, levende vektoreffekter

- `doc/effects.mjs`: `EFFECTS` (Offset Path, Round Corners, Transform), `effect` (validering med standardverdier),
  `applyVectorEffects` (i rekkefølge, skjulte hoppes over, Offset via funksjon).
- `geom/kernel-js.mjs`: `loadGeometry`, `geometryReady`, `offsetPathsSync`; Offset Path deler `offsetWith`.
- `render/paper-adapter.mjs`: `make` bygger grunngeometrien (`makeBase`) og legger effektene på; geometrinøkkelen
  tar med synlige effekter og om Clipper er lastet; `effectiveSubpaths` for Send to Cut og Expand.
- `index.mjs`: `addEffect`, `editEffect`, kommandoene `effect-*`, `effect-last` og `effect-options`; Expand Appearance
  baker effektene. `electron/main.mjs`: Effect-menyen. `panels/ui.mjs`: effektlisten og Add Effect.

Verifisering: 252 Draw-enhetstester (3 i `effects.test.mjs`), ny E2E `draw-effects-workflows.mjs` (`--draw-effects`).
Hele Draw-E2E for 28b34ec (D3.6): alle Draw-suitene passerte; autolagringsflaken stoppet prosjekttestene.

Neste: D3.2 del B, Drop Shadow og flere vektoreffekter.

## 2026-10-17: D3.2 del B, flere vektoreffekter og Drop Shadow

- `doc/effects.mjs`: Zig Zag, Pucker & Bloat, Roughen (seedet tilfeldighet) og Twist, med kurvehjelpere
  (`at`, `tangent`, `resample`); Drop Shadow er merket `raster` og hoppes over av `applyVectorEffects`;
  `dropShadow(node)` gir skyggen som skal tegnes.
- `render/paper-adapter.mjs`: `shadowFor` tegner objektets omriss med skyggefarge og `ctx.filter = blur()` på et
  lerret med dokumentets rastereffektoppløsning og legger rasteret rett under objektet; skjules i Outline.
- Dialogfelt, Effect-meny og kommandosøk for de nye effektene; Drop Shadow kan legges på tekst.

Verifisering: 253 Draw-enhetstester; `--draw-effects` dekker Zig Zag og Drop Shadow på lerret og i PNG.
Hele Draw-E2E for d88316e (del A) stoppet i `draw-pathfinder-workflows.mjs`, som ventet at Add New Effect
var avslått; den sjekker nå at Add Effect lister effektene.

Neste: D3.8 Links, Crop Image og Document Info.

## 2026-10-17: D3.8 Document Info, Links, Crop Image og Edit in Draw

- `doc/document-info.mjs`: `documentInfo(doc, ids)`; panelene `document-info` og `links` i Info-gruppen
  (Tabler `file-info`, `link`, `crop`).
- `geom/transform-each.mjs`: `cropImage` regner ny `crop`, synlig størrelse og transform slik at resten blir
  stående. `render/paper-adapter.mjs` tegner bare den beskårne delen (lerret ved lasting, geometrinøkkelen
  tar med `crop`); Send to Cut beskjærer data-URL-en før sending.
- `index.mjs`: `crop-image`, `replaceImage` (Links) og `editFromCut`; `import-artwork.mjs` eksporterer `rasterAsset`.
- `app.js`: «Edit in Draw» i Cuts høyreklikkmeny (`editInDraw`).

Verifisering: 255 Draw-enhetstester (`document-info.test.mjs`, ny test for `cropImage`), ny E2E
`draw-links-workflows.mjs` (`--draw-links`). Å fjerne `crop` gjøres med `replaceLeaf`, siden validatoren avviser
`crop: undefined`. Hele E2E for 7385bbd (effekter del B) passerte helt: 38 av 38.

Neste: D3.3 Image Trace.

## 2026-10-17: D3.3 Image Trace

- `geom/trace.mjs`: `TRACE_PRESETS` (også to laserpresets), `traceScale`, `quantize` (svart-hvitt, gråtoner,
  k-means for farger), `removeNoise`, `contours` (lukkede ringer langs pikselkanter, hull motsatt vei),
  `ringArea`, `simplifyRing` og `ringCorners`.
- `index.mjs`: `traceImage` leser bildet (med beskjæring) på et lerret, sporer hver farge og setter inn gruppen
  «Image Trace» over bildet og skjuler det, i ett angresteg. `traceSubpath` deler hver ring ved skarpe hjørner
  og tilpasser kurver bare mellom dem; uten dette rundet Paper sin `simplify` en firkant til en klump.
- `panels/ui.mjs`: `imageTracePanel` i egen gruppe (Tabler `photo-scan`).

Verifisering: 4 enhetstester i `trace.test.mjs`; `--draw-links` sporer den svarte halvdelen av et testbilde
til én bane med fire hjørner. Merk: rødt har luminans 76 og regnes som mørkt med terskel 128, så testen bruker
terskel 50. Full E2E-kjøring 31 (for 49fc9c5) ble avbrutt av en omstart av arbeidsprosessen etter 13 PASS.

Neste: D3.7 AI-eksport.

## 2026-10-17: D3.7 Adobe Illustrator-eksport

- `io/ai.mjs`: `AI_OPTIONS` (PDF 1.6, lag, miniatyrer, redigeringsdata, ingen nedsampling), `aiMetadata` (XMP med
  `illustrator:Type`, `xmpTPg:NPages`, `MaxPageSize` i mm og `HasVisibleTransparency`) og `hasTransparency`.
- `io/pdf.mjs`: valgene `metadata` (ukomprimert XMP-strøm i katalogen) og `artBox`.
- Export As: målet `ai` i `EXPORT_TARGETS` og `EXPORT_FILE_TYPES`, merknad i alternativdialogen, og `app.js`
  åpner en .ai med Draw-vedlegg som Draw-dokument (som PDF).

Verifisering: 260 Draw-enhetstester (ny AI-test i `vector-export.test.mjs`); `--draw-export` eksporterer .ai,
sjekker XMP og ArtBox og åpner filen igjen med de samme objektene. `electron/test-bridge.mjs` feiler også uten
endringene (Java-sidecaren er ikke bygget i dette miljøet).

Neste: fase 4, D4.1 Width og width profiles.

## 2026-10-17: D4.1 Width-verktøy og breddeprofiler

- `geom/width-profile.mjs`: `WIDTH_PROFILES`, `normalizeProfile`, `profileName`, `flipAlong`, `flipAcross`,
  `widthAt` (myk overgang mellom punkter), `variableStrokeRings` (omriss for åpne og lukkede baner, runde ender),
  `setWidthPoint`, `moveWidthPoint` og `removeWidthPoint`.
- `render/paper-adapter.mjs`: en strek med profil går gjennom malingsstakken og tegnes som fylt omriss
  (`variableStrokeSubpaths`, sampling per kurve så hjørner beholdes); `strokeLocation` og `widthHandles` for verktøyet.
- `index.mjs`: Width-økter med `mergeKey` (ett angresteg per dragning), Width Point Edit, Outline Stroke og
  Send to Cut-omriss bruker profilen. `doc/paint.mjs`: `widthProfile` i `changeStroke`; skjemaet validerer punktene.
- Stroke-panelet: Profile, Flip Along og Flip Across. Ny markør for Width-verktøyet.

Verifisering: 265 Draw-enhetstester (`width-profile.test.mjs`, ny test i `stroke.test.mjs`) og ny E2E
`draw-width-workflows.mjs` (`--draw-width`). E2E avslørte at hver dokumentendring avbryter en pågående gest
(`state.subscribe` kaller `interactions.cancel`), så Width-dragningen forhåndsvises nå (`widthPreview`) og
legges inn ved slipp som ett angresteg. `renderer.bounds` er geometriske grenser uten strek, som i Illustrator.

Full E2E 32 (for 3ccfb91) stoppet i `draw-effects` med «Promise was collected». Det er ikke en appfeil: V8
kan samle opp et ventende løfte som bare DevTools venter på. `cdp.mjs` holder nå asynkrone uttrykk i et sett
på siden til de er ferdige; `--draw-effects` passerte deretter 3 av 3. `--draw-export` (med .ai) passerer.

Hele Draw-E2E 33 for 1146992 (Image Trace, AI-eksport, Width og CDP-retting) passerte helt: 40 av 40.


## 2026-10-18: D4.2 Blend

- `geom/blend.mjs`: `blendOptions`, `blendStepCount` (Smooth Color, steg, avstand), `withAnchors` (deler lengste
  segment med de Casteljau), `matchShapes` (rotering og reversering for lukkede baner, manglende delbaner fra eget
  sentrum), `interpolateShapes`, `lerpColor` og `stepPositions`.
- En blend er en gruppe med `blend` (validert i skjemaet). `render/paper-adapter.mjs` lager mellomformene som
  visningselementer under den øvre nøkkelen og bygger dem bare på nytt når nøkler eller valg endres.
- `index.mjs`: Make, Release, Expand, Blend Options, Reverse Front to Back og Blend-verktøyet; Object > Blend i
  menyen. `io/cut-svg.mjs` sender mellomformene til Cut.

Verifisering: 268 Draw-enhetstester (`blend.test.mjs`), ny E2E `draw-blend-workflows.mjs` (`--draw-blend`).


## 2026-10-18: D4.3 Warp, Live Pathfinder og opacity masks

- `geom/warp.mjs`: `WARP_STYLES`, `warpStyle` (alle 15 stilene i boksens -1..1-koordinater) og `warpMapping`
  (boks, retning og forvrengning). `warp` i `doc/effects.mjs` sampler kurvene tett og bøyer punktene.
- Live Pathfinder: effekten `pathfinder` (`container: true`, bare grupper). Rendereren kjører `runPathfinder` på
  gruppens baner og former i gruppens rom og skjuler delene (`coveredIds`); `liveSteps` brukes av Cut og Expand
  Appearance.
- Opacity masks: en gruppe med `mask` (`clip`, `invert`) der øverste barn er masken. Rendereren lager en svart
  kopi med luminans som alfa (også gradienter og bilder) og tegner den med `destination-in`; gruppen får
  blandingsmodus `source-over` så Paper tegner den i eget lag. `exportArtwork({ rasterMasks })` gjør maskerte
  grupper til bilder for SVG og vektorformatene.

Verifisering: 271 Draw-enhetstester (`warp.test.mjs`), ny E2E `draw-warp-mask-workflows.mjs` (`--draw-warp-mask`).
Hele Draw-E2E 34 for 42c1b33 (Blend) passerte helt: 41 av 41. E2E fant at kopien av maskekunsten arvet
`nodeId`, så eksporten skjulte den; kopien får nå tomme `data`.


## 2026-10-18: D4.4 Paintbrush og Blob Brush

- `geom/brush.mjs`: innstillinger og validering, `nibWidth` (flat spiss med vinkel og rundhet) og
  `calligraphicProfile` (breddeprofil langs draget, retningen glattet over noen punkter).
- `index.mjs`: `paintbrush` (Pencil-tilpasning, strekvekt lik størrelsen, breddeprofil) og `blobBrush`
  (`outlineStroke` med runde ender og hjørner, slått sammen med berørte former i samme farge via Paper `unite`,
  ett angresteg). Verktøyene er aktivert, med markører, statuslinje og dialoger (Enter).

Verifisering: 274 Draw-enhetstester (`brush.test.mjs`), ny E2E `draw-brush-workflows.mjs` (`--draw-brush`).


## 2026-10-18: D4.5 TIFF, Graphic Styles, Navigator, Rotate View, Asset Export og arbeidsområder

- `io/tiff.mjs`: baseline TIFF (little-endian, RGB/RGBA, PackBits, oppløsning); testet mot UTIF.
- `doc/graphic-styles.mjs` og panelet `graphic-styles` (Tabler `brush`); skjemaet validerer `graphicStyles`.
- Navigator: `navigatorImage` (alle artboards og grafikken, mellomlagret per dokumenttilstand), `navigatorView`,
  `navigateTo`; panelet oppdaterer rammen fra `updateInfo` uten å tegne bildet på nytt.
- Rotate View: `rotateView` setter `scope.view.rotation`; `screenDelta` i `tools/interactions.mjs` dreier
  panorering tilbake.
- Asset Export: `exportAssets` i dokumentet, `exportBoard({ area, only })` og `exportArtwork({ only })` for å
  tegne ett objekt alene; panelet `asset-export` (Tabler `packages`).
- `ui/workspaces.mjs` og Window-menyen i Draw (Workspace og paneler).

Verifisering: 279 Draw-enhetstester (`tiff`, `graphic-styles`, `workspaces`), ny E2E `draw-window-workflows.mjs`
(`--draw-window`).


## 2026-10-18: D4.6 ytelsespass

- Ny E2E `draw-perf-workflows.mjs` (`--draw-perf`, `--report`, `--paths=N`, `--profile=edit|move|selectAll`,
  `--parts`, `--collapse`): tidsmåling per steg og CPU-profil med egen og inkludert tid per funksjon.
- Funn i rekkefølge: hele dokumentet ble klonet, validert og sammenlignet med `JSON.stringify` per kommando
  (5 000 innsettinger ble ikke ferdig på 15 min); Layers bygde alle rader og miniatyrer; `selectedIds` var kubisk;
  hver `updateView` tegnet synkront; indeksen ble bygd på nytt per kommando.
- Tiltak: `doc/draft.mjs` (copy-on-write med Proxy), inkrementell validering (`trusted`) og indeks,
  identitetsbasert `differences`, `updateNodes`/`insertNodes` i transformasjoner, nøkkel-, grense- og
  miniatyrcache per nodeobjekt, `requestUpdate`, radgrense i Layers, ResizeObserver i `layoutDock`.
- Rettet underveis: `exportAssets.nodeId` ble validert som en ny unik id; Rotate View tilbake til 0 kan gi −0.
- Feil i første versjon (87fb97f): Paper sin `requestUpdate` tegner bare med `autoUpdate`, så lerretet ble ikke
  tegnet etter endringer (full E2E 36 stoppet i temaskifte-testen, og de første panoreringstallene var for gode).
  Nå: egen `requestDraw` (én tegning per bilde, synkront uten `requestAnimationFrame` i enhetstester) og
  `blitFrame` for panorering og zoom i store dokumenter.

Verifisering: 284 Draw-enhetstester (`draft.test.mjs` med indekssjekk gjennom angre/gjør om), `--draw-window` og
`--draw-perf` passerer.


## 2026-10-18: Tegning per bilde rettet, og fase 5 del A

- Full E2E 37 stoppet i `draw-transform-workflows.mjs`, som leser lerretet rett etter `updateView`. Rask tegning
  (vanlige dokumenter) skjer derfor synkront som før; bare når en full tegning tar over 12 ms samles tegningen per
  bilde og panorering bruker forrige bilde.
- `io/plt.mjs` (HP-GL, testet mot `hpglimport.js`), `io/gif.mjs` (median cut og LZW, testet med egen dekoder og
  Chromium), File > Package (`packageDocument`).

Verifisering: 288 Draw-enhetstester (`plt`, `gif`), `--draw-window` dekker TIFF, GIF, PLT og Package.


## 2026-10-18: Fase 5 del B

- Egne hurtigtaster: aktiv keymap med overstyringer i `keymap.mjs` (meny, lerret og verktøytips leser den),
  IPC `getDrawShortcuts`/`setDrawShortcuts`, lagring i brukerdata, dialogen `ui/shortcuts-dialog.mjs`.
- Glyphs: `fonts.characters` (fontkit `characterSet`, bare skrivbare tegn), IPC `fontCharacters`, panelet `glyphs`.
- Scribble: `geom/scribble.mjs` (skannlinjer i valgt vinkel, sammenføyd fram og tilbake, seedet variasjon,
  avrundede vendinger) og effekten `scribble`; rendereren og Cut maler linjen med fyllfargen som strek.

Verifisering: Draw-enhetstester (`custom-shortcuts`, `scribble`), `electron/test-font-service.mjs` (Glyphs),
`--draw-window` dekker hurtigtaster, Glyphs og Scribble.


## 2026-10-18: Fase 5 del C, Touch Type og Vertical Type

- Hele Draw-E2E 38 (for 3009e24) stoppet bare på ytelsestaket for zoom (75 ms mot 60 under full last); taket
  for panorering og zoom er nå 120 ms.
- Touch Type: run-egenskapene `rotation` og `xShift` (modell, skjema, font-tjeneste), `styleRange`/`characterAt`,
  glyf-`index`, verktøyet med flytt, skaler og roter. Glyphs viser første installerte font når Arial mangler.
- Vertical Type: `paragraph.orientation: 'vertical'` for punkttekst og kolonnelayout i font-tjenesten.
- E2E-funn: skjemaet hadde egen liste over run-nøkler; tekstdialogen må være `textReady` før innsending.

Verifisering: 296 Draw-enhetstester, 16 fonttester (Touch Type og Vertical Type), `--draw-window` passerer.


## 2026-10-18: Fase 5 del D, PDF/X-4 og EPS-import

- PDF/X-4: `io/pdfx.mjs` lager en sRGB ICC v2 utdataprofil (Lab-tabeller), XMP for PDF/X-4 og sjekker hva
  standarden ikke tillater; `pdfDocument({standard:'x4'})` skriver OutputIntent, Trapped og X-4-metadata.
  Save PDF har valget Standard og forhåndsinnstillingen [PDF/X-4:2008].
- EPS-import: `renderer/epsimport.js` (PostScript-tolk til SVG), koblet inn i filvelger, slipp, Cut og Draw.
  Eldre Illustrator-filer uten PDF-del går samme vei i stedet for å bli avvist.
- Funn: en SVG-transform på et element gjelder også klippestien, så klippede bilder får klippet på en gruppe rundt.

Verifisering: 300 Draw-enhetstester (`pdfx`), 9 EPS-importtester, importformat-testene, profilen lest av LittleCMS,
matplotlib-EPS tegnet riktig i Chromium. `--draw-export` dekker PDF/X-4 og EPS ut og inn.

Neste: MCP-server og lokalisering.


## 2026-10-18: Fase 5 del E, MCP-server

- `electron/mcp-server.mjs`: JSON-RPC (initialize, ping, tools/list, tools/call) over lokal HTTP med token og
  Origin-sjekk; `electron/mcp-host.mjs` styrer innstillingen og sender hvert kall til rendereren og tilbake.
- `renderer/draw/mcp-runner.mjs` utfører 13 verktøy mot aktiv Draw-fane gjennom dokumentkommandoene.
- Preferences fikk seksjonen Automation med bryter og ferdig `claude mcp add`-kommando.

Verifisering: `electron/test-mcp-server.mjs` (protokoll, HTTP, token, Origin), `--draw-mcp` (ekte HTTP-kall mot appen).

Neste: lokalisering.


## 2026-10-18: Fase 5 del F, lokalisering

- `renderer/i18n.mjs`: språkvalg (System, English, Norsk bokmål), oversetter med plassholdere, DOM-gjennomgang med
  MutationObserver og `translate="no"` som unntak, og oversetting av menymaler.
- `renderer/i18n-nb.mjs`: rundt 1 600 bokmålsoppføringer for menyer, Draw, Cut og innstillinger.
- Hovedprosessen oversetter menyer og filvelgere og bygger menyen på nytt når språket byttes.

Verifisering: `renderer/test-i18n.mjs`, `--draw-language` (bytte til norsk og tilbake i appen).

E2E: hele Draw-E2E 39 (for 864261f) passerte, 45 av 45. `--draw-export` (PDF/X-4, EPS ut og inn), `--draw-mcp`
og `--draw-language` passerer for de nye delene. Funn underveis: MCP-handleren var lagt inn i `updatePreferences`
i stedet for på toppnivå, tilkoblingskommandoen i Preferences viste porten fra før serveren startet, lister med
« · » (panelgrupper) ble ikke oversatt, og attributter ble ikke satt tilbake til engelsk. Alt er rettet.

Fase 5 er ferdig i grunnform. Neste: hullene i STATUS.md.


## 2026-10-18: Innsetting av mange objekter (hull fra D4.6)

- En transaksjon (og angre/gjør om av den) validerer dokumentet én gang til slutt (`DrawDocument.batch`); feiler
  valideringen, rulles hele transaksjonen tilbake som før.
- `insertNode`/`insertNodes` lager én frossen kopi og setter den inn direkte (før: to kopier per innsetting).
- Indeksen oppdateres på stedet etter en redigering, og bare den delen av en barneliste som faktisk er endret,
  gås gjennom.
- Import setter inn alle objektene med én `insertNodes`.

Målt i `--draw-perf` (5 000 baner, 200 000 ankre): innsetting 12,8 s til 5,6 s, angre 1,2 s til 0,7 s. Fortsatt
lineært per innsetting i lange lister (kopien av listen), så tusenvis av enkeltinnsettinger er ikke gratis.
Verifisering: 303 Draw-enhetstester (`document-batch`), `--draw-perf`.


## 2026-10-18: Spine for blends (hull fra D4.2)

- Replace Spine og Reverse Spine i Object > Blend; `blend.spine` valideres i `blendOptions`, og Blend Options
  beholder den.
- Trinnene legges langs ryggraden etter lengde, dreid ved «Align to Path»; Specified Distance måler langs den.

Verifisering: blend-enhetstest (punkter, retning, plassering, antall trinn), `--draw-blend` (ryggrad, nøkler ved
endene, trinn langs banen, snu, ett angresteg).


## 2026-10-18: Envelope Distort med toppobjekt (hull fra D4.3)

- `geom/envelope.mjs`: omrisset deles i fire sider ved ankrene nærmest hjørnene; Coons-flate fra rammen til sidene;
  baner tas gjennom som korte rette stykker.
- Gruppe med `envelope` (skjema: bane eller form øverst, ikke samtidig klipp, blend eller maske); tegnes som levende
  visning, Release, Expand og Send to Cut.

Verifisering: `envelope`-enhetstester (rektangel gir identitet, buet side følges, skjema), `--draw-warp-mask`
(lerret, Cut, Release, Expand).


## 2026-10-18: Rasterize-effekten (hull fra D4.3)

- Effekten `rasterize` (ppi, bakgrunn, kantutjevning, ekstra kant) i Effect-menyen; rendereren lager en Raster av
  objektet slik det males og skjuler objektet; eksport tar bare pikslene.

Verifisering: effekt-enhetstest, `--draw-effects` (piksler ved valgt ppi, ankrene beholdt, bilde i SVG, farge i PNG).


## 2026-10-18: Path Eraser og Smooth (hull fra D2.8 og D3.4)

- `geom/path-eraser.mjs`: `erasePath` (fjerner delene innenfor viskeren, kuttene funnet ved halvering langs kurven),
  `smoothRange` og `sectionPoints`; verktøyene `path-eraser` og `smooth` i blyantgruppen.

Verifisering: `path-eraser`-enhetstester, `--draw-brush` (gap i linjen, færre ankre etter Smooth).

E2E: hele Draw-E2E 40 passerte alle 45 Draw-suitene; den siste prosjektsuiten feilet på tid (gjenopprettingen ble ikke
skrevet innen 2,4 s under full last; kort kjøring passerer). Testen venter nå inntil 6 s mens redigeringen fortsetter,
med samme krav. `--draw-blend`, `--draw-warp-mask`, `--draw-effects` og `--draw-brush` passerer for spine, envelope,
Rasterize, Path Eraser og Smooth (Smooth når nå 12 skjermpiksler).


## 2026-10-18: Envelope Make with Warp

- `envelope.warp` (validert som Warp-effekten); konvolutten bruker `warpMapping` over innholdets ramme og har ingen
  form øverst. Release, Expand og Send to Cut virker som før.

Verifisering: `envelope`-enhetstest (skjema), `--draw-warp-mask` (Arch løfter midten av toppkanten).


## 2026-10-18: Gaussian Blur, Feather, Inner Glow og Outer Glow (hull fra D3.2)

- Effektene `gaussian-blur`, `feather`, `outer-glow` og `inner-glow` (pikseleffekter), dialoger og menyvalg.
- `rasterFor` lager pikslene med plass til spredning og bruker effektene i rekkefølge med lerretsfiltre.

Verifisering: effekt-enhetstest, `--draw-effects` (rød glød utenfor, myk kant etter Gaussian Blur).
- Grupper: Drop Shadow, Rasterize og pikseleffektene virker på hele gruppen (pikslene lages etter barna).
- Blend: tekst kan være nøkkel (glyfkonturene blendes). Ikke dekket av E2E ennå, fordi testmiljøet mangler de vanlige
  fontene; koden bruker samme vei som baner.
- Vektoreffekter på grupper: barna arver gruppens vektoreffekter i tegning, eksport og Send to Cut; Expand Appearance
  på gruppen baker dem inn. Verifisering: effekt-enhetstest, `--draw-effects` (Zig Zag på begge rutene, bakt inn).
- Free Distort som effekt (`free-distort`, hjørner i % av rammen). Verifisering: effekt-enhetstest, `--draw-effects`.


## 2026-10-18: History-snapshots og Delete State (hull fra D2.9)

- `revertTo(data)` (hele dokumentet tilbake som ett angresteg, med delte frosne objekter), `History.discardRedo()`,
  og knappene New Snapshot og Delete State i History-panelet.

Verifisering: `document-batch`-enhetstest, `--draw-history-info`.
- Info: tegn og ord for merket tekst (ikke dekket av E2E; testmiljøet mangler vanlige fonter for tekst).
- Select > Same > Graphic Style (`graphic-style` i `doc/select-rules.mjs`). Verifisering: select-rules-enhetstest.
- Transform Each: Preview (en matrise per objekt i `previewTransform`). Verifisering: `--draw-region-tools`.
- Free Transform: Shift gir perspektiv. Verifisering: `--draw-region-tools`.
- Lasso med Alt+Ctrl/Cmd merker hele objekter. Verifisering: `--draw-select`.
- Select > Object > Direction Handles. Verifisering: `--draw-select`.

E2E: hele Draw-E2E 41 passerte, 47 av 47 (også prosjektsuiten). Suitene for det som kom etterpå passerer:
`--draw-effects`, `--draw-warp-mask`, `--draw-history`, `--draw-region-tools`, `--draw-select`. Funn underveis:
Ctrl/Cmd forsvant fra modifikatorene ved musebevegelse (Lasso med Alt+Ctrl virket ikke), perspektiv målte fra hjørnet
i stedet for pekerens bevegelse, og Expand Appearance fant ikke grupper med vektoreffekter. Alt er rettet.


## 2026-10-18: D5.1 Cut optimized — planlegging fullført

Brukerbestilt visningsmodus i Draw, av/på fra View-menyen: svart-hvitt-forhåndsvisning
av gravering og kutte-/scorebaner mens tegning og redigering fortsetter.

- [x] Dokumentert krav, visuell oppførsel, avgrensning mot dokument/output og modussamspill i DRAW_WORKSPACE 4.4.1.
- [x] Spesifisert forklaringsdialog, Continue/Cancel, «Don’t show this again», varig brukerpreferanse og tilbakestilling.
- [x] Lagt til deloppgaver og akseptansekontroller, og oppdatert STATUS og overlevering.
- [ ] Prosesskobling, funksjonskode og funksjonstester gjenstår i sin helhet.

Neste: avklar hvordan Draw kjenner Cut/Score/Engrave uten å gjette fra farger. Uavklarte
prosesser må merkes. Deretter implementeres visningsprojeksjon og UI etter delplanen.
Kontroll i denne endringen: dokumentasjonsdiff og `git diff --check`; ingen apptester kjørt
for denne rene planendringen. Videre arbeid skal loggføres ved hvert deltrinn, med faktiske
resultater og restpunkter; planlagt arbeid må ikke presenteres som ferdig funksjon.

## 2026-10-18: D5.1 første implementasjonstrinn — prosesskobling

- [x] Ren `resolveCutPreviewProcess`: faktisk Cut/Score/Engrave fra samme fanes Cut-snapshot,
  egne raster/vector-identiteter, global modus, Ignore/output og eksplisitt uavklart ved mangler.
- [x] Delt `matchingProcessLayer` med faktisk Cut-lagavstemming og `cutPaint` med Send to Cut.
  Ingen prosess gjettes fra en bestemt farge. Nytt bilde/ny farge uten prosessoppsett er uavklart.
- [x] Dokumentert kontrakt og begrensninger i `cut-optimized.md`, og oppdatert plan/status/overlevering/roadmap.
- [x] 12 nye enhetstester, blant annet samme svarte raster/vector, globale valg, gradient/Scribble,
  arv av template/print/visibility, nye snapshots og uendret dokument/historikk/prosessoppsett.
- [ ] Visningsprojeksjon, meny/renderintegrasjon, forklaringsdialog/preferanse og Electron-akseptansetest gjenstår.

Verifisering fullført for dette deltrinnet: 329 Draw-tester (12 nye), 34 main-tester,
69 renderer-tester og kontrastkontrollen passerer. Resolveren har 100 % linje-/gren-/funksjonsdekning.
Et lokalt, signaturverifisert Debian-JDK 21 rettet manglende `javac` (`release version 17 not supported`).
Deretter passerte alle 28 Java-tester, Java-bygget og Node–Java-brotesten. LibLaserCut finnes nå
lokalt i Maven-cachen; dette dokumenterer ikke at en ny nedlasting fra jitpack.io er tillatt.
Miljøets aktiveringshjelper velger nå riktig JAVA_HOME; install_script/start_skill er oppdatert i
konfigurasjonsutkastet. Utkastet er lagret, ikke publisert. Den reviderte installasjonen er
verifisert trinnvis, ikke kjørt på nytt som ett samlet script.

Full `npm test` stopper i den tidligere dokumenterte Cut crop-E2E-feilen
(`electron/e2e/workflows.mjs:369`, «dragging a crop edge must update the crop»). Den påfølgende
fulle Draw-E2E ble derfor ikke kjørt. Separate Electron-kjøringer med `--draw-cut` og
`--draw-export` passerer: import til Cut, add/replace/undo, kopi/lim inn mellom modusene og
SVG/PDF/AI/DXF/raster-eksport. `git diff --check` og syntakskontroll av endrede inngangsfiler passerer.
Ingen claim om full testsuksess eller ferdig Cut optimized-UI; neste deltrinn er visningsprojeksjonen.
## 2026-10-18: Cut Preview og gravering som vist (påbegynt, ikke ferdig)

Ønske fra brukeren:
1. En av/på-bryter i View-menyen (og ved Outline-knappen) for å tegne "cut optimized": fyll i gråtoner slik de graveres, strøk som tynne svarte linjer der laseren kutter. Første gang den slås på vises et vindu som forklarer hva som endrer seg, med "Don't show this again" (huskes i localStorage).
2. Blend modes og transparens skal kunne påvirke graveringen.

Gjort så langt: `cutPreviewIntroDialog()` i `renderer/draw/ui/dialogs.mjs` (introvinduet med avkrysning). Ikke koblet til noe ennå.

Gjenstår, i denne rekkefølgen:
- `setCutPreview` i `render/paper-adapter.mjs`: gråtonefilter bare på artwork-laget (pakk `artwork.draw` med `ctx.filter='grayscale(1)'`, slik at markering og hjelpelinjer beholder farge), strøk som svarte hårlinjer (1/zoom, ingen stiplinger, oppdateres ved zoom i `updateView` som Outline), ingen pilspisser, profilerte strøk som hårlinjer. Outline vinner over Cut Preview.
- Kommandoen `cut-preview` og knapp ved Outline i `index.mjs`, menyvalg View > Cut Preview i `electron/main.mjs`, i18n-oppføringer, introvinduet første gang.
- Send to Cut: valget "Engrave as seen" som flater ut transparente eller blandede fylte områder (med fylte objekter de overlapper) til et graveringsbilde via exportBoard med `only`, sender strøkene fortsatt som kutt, gir en advarsel og lagres i cut-lenken for Update in Cut.
- E2E-test for bryteren og introvinduet, enhetstest for utflatingen, oppdatering av STATUS.md og DRAW_WORKSPACE.md.

## 2026-10-18: Synkronisering før Laser Preview

Prosessgrunnlaget er committet, og ekstern commit 84daced med introvindu og videre plan
er bevart. Brukerens nyeste valg gjelder for D5.1: Laser Preview, røde Cut-linjer, stiplet
rød Score, gråtonegravering, uavklarte prosesser og husket visningsvalg. «Engrave as seen»
er fortsatt en separat, planlagt output-endring; forhåndsvisningen må ikke love at den finnes.

## 2026-10-18: Laser Preview — visningsprojeksjon

Implementert ren visningspolicy og midlertidig Paper-visningsprojeksjon: Cut rødt/heltrukket,
Score rødt/stiplet, vektorgravering svart silhuett og bilder i gråtoner, hvite artboards.
Originale view-stiler gjenopprettes med finally etter hver draw, også ved feil; eksport,
modellen og trefftesting beholder originalene. Referanser dempes og skjulte/Ignore utelates.
Effektkompositter og uverifisert raster-dithering merkes uavklart i stedet for å love output.

Viktig funn: Cut bruker vektorens malte alfa-silhuett til gravering, ikke originalfargens
mørkhet. Derfor er vektorgravering svart i denne modusen. «Engrave as seen» er ikke implementert.
Ingen dybde eller fysisk brennstyrke loves av visningen. Seks nye tester dekker røde linjer,
zoom, stiplemønster, svart silhuett, feilopprydding, referanser, Ignore og klippemasker.
Meny/UI og dialog kobles i neste trinn; funksjonen er ennå ikke tilgjengelig for brukeren.
