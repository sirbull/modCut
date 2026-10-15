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
