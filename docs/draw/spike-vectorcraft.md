# D0.3: VectorCraft til WASM

Dato: 2026-10-14. Status: evalueringen er gjennomført; **JS-fallback velges for
D0.4 og fase 1–3**, etter beslutningsregelen i DRAW_WORKSPACE.md §16.3.
VectorCraft er ikke valgt som produksjonskjerne. Vurder det igjen før fase 4.

Det uendrede upstream-bygget fungerer og ytelsen er lovende på de målte inngangene,
men den samlede WASM-filen overskrider både rå- og gzip-budsjettet. Enkelte andre
akseptkriterier er også uverifisert. Det er derfor ikke grunnlag for å godkjenne
VectorCraft som kernel nå.

## Kilde og oppsett

- Upstream: [storytold/vectorcraft, eksakt commit](https://github.com/storytold/vectorcraft/tree/0a33cff3f6e2a1e9e672f4c3816f58cd8d3d032e), versjon 0.11.0.
- Rust/cargo 1.95.0, target `wasm32-unknown-unknown`, wasm-bindgen/CLI 0.2.105.
- Release-profil: `opt-level = "s"`, LTO, én codegen unit, panic abort, strip debuginfo.
  Ingen etterfølgende wasm-opt-optimalisering ble brukt.
- Maskin: Apple M1 Pro, macOS arm64; Node 22.12.0 og Electron fra prosjektets
  eksisterende installasjon. Chrome-versjon står i målefilen.
- Rust manglet i miljøet og ble installert isolert for målingen. Det er ikke
  lagt til noe krav om Rust for å starte eller distribuere modCut.
- Adapter: `native/modcut-geom`, kildepin i `upstream.json`, låste Rust-avhengigheter
  i `Cargo.lock`. Alle målinger kjøres i en egen Electron-instans med midlertidig
  brukerprofil, og geometrien kjører i en faktisk module Web Worker.

## Resultat for de seks kriteriene

MB i tabellen er desimale bytegrenser. Binære MiB ville heller ikke endret utfallet.

| Nr. | Krav | Målt resultat | Vurdering |
|---|---|---|---|
| 1 | pathops + trace + pdf til WASM; ingen filsystem-, tråd- eller GPU-avhengighet; <6 MB rått og <2 MB gzip | Alle tre crates bygges. 15 583 658 byte rått (15,58 MB), 5 346 187 byte gzip (5,35 MB). Modulen har 2 wasm-bindgen-importer og 0 host-importer for filsystem/tråder/GPU. | **Ikke bestått: størrelse.** |
| 2 | 30 korrekte golden cases, median <20 ms per case | 30/30 samsvarer med foreløpig Paper.js-referanse. Høyeste median per case: 0,20 ms. Største relative arealavvik: 1,59×10⁻¹²; største samplede grenseavstand: 1,57×10⁻⁷ mm. | Timing bestått lokalt. Geometrisamsvar er foreløpig: korpus mangler manuell godkjenning, og kontinuerlig Hausdorff-grense er ikke bevist. |
| 3 | Trace av 2 MP svart/hvitt på <2 s i worker | 1600×1250 = 2 000 000 piksler. Logo: median 73,6 ms, 2 paths / 15 ankre. Sjakkmønster: median 137,1 ms, 400 paths / 1600 ankre. | Bestått for de to syntetiske inngangene på denne maskinen. |
| 4 | PDF åpner i Acrobat/Preview, pdf.js og Illustrator; qpdf --check | Generert PDF: 2208 byte, 1 side, 10 sideoperatorer; pdf.js parser både dokument og operatorliste. Sidestørrelse 566,92914×283,46457 pt, tilsvarende 200×100 mm. qpdf: 0 kjøringer (ikke installert). Manuell appkontroll: 0 av 3. | Ikke ferdig verifisert. |
| 5 | API kan pakkes inn med ≤200 linjer upstream-fork | 0 endrede upstream-linjer. Den originale adapteren er 98 linjer og bruker offentlige API-er til boolean, trace og minimal PDF-eksport. | Bestått for spike-grensesnittet. Dette er ikke en full GeometryKernel/ResolvedScene-adapter. |
| 6 | Bygg kjører i CI på Linux, macOS og Windows | 1 lokal macOS/arm64-bygging er målt; 0/3 CI-plattformer kjørt. Eksisterende ci.yml har én Ubuntu-jobb og bygger ikke denne Rust-craten. | Uverifisert. Ingen ny Rust-jobb aktiveres for en backend som ikke er valgt. |

Oppgaven er fullført som en evaluering med beslutning om fallback. Det betyr ikke
at alle seks kvalifiseringskriteriene er bestått eller målt på alle plattformer.

## Målemetode og grenser

**Boolean.** 30 originale syntetiske innganger i mm: overlapp, innkapsling,
adskilte og identiske figurer, felles kanter, hjørnetangering, sirkler/tangerende
sirkler, stjerne, hull, selvkryssing og en egen bokstavformet kontur. Operasjonene
er Unite, Intersect, Minus Front og Exclude. Ingen fontkonturer eller kundedata
ble kopiert. Adapteren konverterer relative modCut-håndtak til absolutte
upstream-håndtak og tilbake, og bruker kurvepresisjon 0,001 mm.

Referansene genereres uavhengig med eksisterende Paper.js 0.12.18. Per case kjøres
3 oppvarminger og 9 målte kall. Timing inkluderer WASM-kall og JSON-retur, men ikke
forberedelse av inngangsstrengen eller sammenligning med referanse. Timeren har
omtrent 0,1 ms oppløsning; rapporterte 0 ms betyr under måleoppløsningen.

Areal sammenlignes etter normalisering av konturenes retning: motsatt winding på
adskilte XOR-øyer skal ikke kansellere målt fylt areal. Grenseavstand samples med
maksimalt 0,05 mm mellom punktene og nærmeste punkt på referansekurvene. Dette er
et estimat, ikke et sertifisert kontinuerlig Hausdorff-maksimum på 0,01 mm.
Korpuset er derfor et spike-verktøy, ikke godkjente golden tests for D2.2.

**Trace.** Tre kjøringer per bilde, svart/hvitt-defaults med Ignore White. Logoen
inneholder et stort rektangel og en sirkel; sjakkmønsteret har 50 px ruter.
Timing inkluderer overføring inn i WASM, tracing, serialisering og JSON-parsing,
men ikke bildegenerering eller lasting av WASM. Hele modulinitialiseringen var
65,5 ms i den lagrede kjøringen. Støyete bilder/foto og høyere oppløsninger ble
ikke målt, så tallene er ikke en garanti for vilkårlige bilder.

**PDF.** Adapteren lager en enkel scene med svarte fylte kurver og konverterer
mm til pt ved eksportgrensen. Dette tester at PDF-skriveren kan kalles fra WASM,
ikke full eksportparitet for tekst, gradienter, bilder eller effekter. Bytefilen
ligger lokalt under ignorert `native/modcut-geom/results/`; ingen binær testfil
legges inn i repoet. Kontroll med pdf.js er automatisk; ingen manuell åpning i
Adobe-programmer eller Preview påstås.

## Arkitektur, lisenser og gjenbruk

Ingen upstream-filer er endret, og ingen upstream UI-/brand-/font-assets sjekkes
inn som modCut-assets. Kildetreet hentes som en ignorert byggeinput. Upstream har
MIT OR Apache-2.0; lisensfiler og NOTICE beholdes i `native/modcut-geom/licenses/`.
Se også `THIRD_PARTY_NOTICES.md` og den lagrede avhengighetsoversikten.

Målbygget har to wasm-bindgen-importer for tekst/externref; ingen WASI, filsystem,
GPU eller vertsbaserte trådfunksjoner. Trace har en egen wasm-sti uten native
trådspawning; fontdatabasen har wasm-grener som ikke leser systemfontmapper.
Dette ble kontrollert mot target-bygget og importtabellen, ikke bare ved søk i
hele kildekoden (som også inneholder native- og testkode).

162 normale/byggeavhengigheter er registrert med lisensuttrykk fra Cargo-metadata.
Ingen mangler lisensuttrykk, og ingen har GPL/AGPL/LGPL/SSPL-uttrykk. Dette er en
inventarliste for eksperimentet; full lisenspakking for distribusjon er ikke
påstått utført. Craten lastes ikke av renderer, og ingen Rust-avhengigheter eller
WASM-filer er lagt til i appens runtime eller pakkeoppsett.

## Beslutning og videre arbeid

D0.4 implementerer det smale worker-baserte GeometryKernel-grensesnittet og
JS-fallback. Arkitekturen skal fortsatt tillate en senere WASM-implementasjon.
Vi endrer ikke størrelsesgrensene for å få denne kandidaten gjennom.

Hvis VectorCraft vurderes igjen før fase 4, undersøk om mer avgrensede features
eller en mindre eksportkjerne kan bringe størrelsen under begge grensene; mål
den faktiske gevinsten før valg. Gjennomfør deretter manuelt godkjente golden
cases, kontinuerlig/geometrisk sterkere avstandskontroll, de manglende PDF-sjekkene
og en faktisk Linux/macOS/Windows CI-matrise. Denne spiken har ikke gjort slike
oppstrømsendringer eller antatt at de vil løse problemet.

## Reproduksjon og verifisering

- [Bygg- og målekommandoer](../../native/modcut-geom/README.md).
- [Måledata](evidence/vectorcraft-metrics.json), [avhengigheter](evidence/vectorcraft-dependencies.json)
  og [hvordan evidensen/referansene ble laget](evidence/README.md).
- `node --test docs/draw/spike-fixtures.test.mjs`: 3/3 tester passerer, inkludert
  reproduksjon av korpuset, XOR-areal og kontroll av flyttet geometri med likt areal.
- `node scripts/build-wasm.mjs`: passerer med pinnet verktøykjede; den første
  release-kompileringen tok omtrent 65 s. WASM-hash står i måledataene.
- `node docs/draw/measure-vectorcraft.mjs`: passerer i en ekte Electron Web Worker;
  rådata viser alle 30 boolean-sammenligninger og begge trace-mønstrene.
- `npm test`: sidecar, bridge, main, renderer, Draw og kontrast passerer; den fulle
  E2E-kjøringen stoppet i den tidligere observerte Cut-testen «Backspace must delete
  a newly created and automatically selected shape» (2 objekter igjen). Ingen
  endringer i Cut eller bildeeditoren inngår i D0.3.
