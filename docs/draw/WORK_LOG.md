# Draw — arbeidslogg

Arbeidsgren: `feat/vector-draw`. Oppdateres underveis og ved fullføring av hvert trinn.
Detaljer og samlet sjekkliste finnes i `docs/DRAW_WORKSPACE.md` kapittel 23.

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
