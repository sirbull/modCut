# Laser Preview (D5.1): kontrakt, verifisering og restliste

Oppdatert 2026-10-18. Første versjon implementert. Hovedplan: DRAW_WORKSPACE 4.4.1.

## Brukerflyt

View > Laser Preview eller knappen ved Outline slår visningen av/på. Nye brukere starter med
normal fargevisning. Siste valg huskes som brukerpreferanse; hver åpen fane beholder sin visning.
Heltrukket rødt er Cut, stiplet rødt Score, svart silhuett vektorgravering og gråtoner bilder.
Linjemønster og tekst supplerer fargene. Artboardet er hvitt. Tegning/redigering fortsetter.

Første aktivering forklarer visningen. Continue aktiverer; Cancel endrer ingenting. «Don’t show
this again» lagres bare ved Continue. Uten avkrysning vises dialogen igjen ved neste aktivering.
Help åpner forklaringen; Preferences kan tilbakestille den. Visningsvalg og undertrykking er
verifisert ved normal appomstart. Tekster finnes på engelsk og bokmål.

## Prosessvalg og lagring

`resolveCutPreviewProcess(doc,id,snapshot)` bruker `{mappingMode,layers}` fra **samme fanes Cut**.
`matchingProcessLayer` deles med Cuts lagavstemming; `cutPaint` deles med Send to Cut.
Fargen identifiserer et prosesslag, men brukes aldri til å gjette en laseroperasjon. Vektorer og
bilder har forskjellige nøkler, selv ved samme svarte farge. Manglende/ugyldige lag er uavklarte.

Laser processes åpner de faktiske operasjonsvalgene (Cut/Score/Engrave/Ignore) for fanen. Dette
**endrer Cut-innstillingene**, markerer prosjektet endret og lagres med eksisterende prosjektfelt.
Nyopprettede prosesser bruker appens vanlige defaults; effekt/hastighet må kontrolleres i Cut.
Registrerte Draw-prosesslag beholdes selv om Cut ennå er tom, ved fanebytte og ved filåpning.
Valg for en ny/annen Cut-fane kan avvike; tegnforklaringen angir at dette er denne fanens oppsett.

`processColorsForDocument` beholder bare eksplisitt konfigurerte, utskrivbare Draw-identiteter
ved Cuts lagavstemming. Nye farger uten prosessvalg blir ikke opprettet som antatt Cut i visningen.

## Rendering uten endret output

`laser-preview.mjs` definerer visningspolicy og en Paper-stiltransaksjon under artwork-draw.
Originalstilene gjenopprettes i finally, også ved feil. Eksport, trefftesting, dokumentmodell og
historikk leser fortsatt originalene. Artboards blir hvite bare under draw. Cut/Score har
skjermfast linjebredde og mønster. Markører/ankre/håndtak ligger utenfor projeksjonen.

Vektorgravering bruker svart alfa-silhuett fordi Cut gjør det samme, ikke gråtonen fra RGB-fargen.
Enkle SVG-streker vises med de standard caps/joins som den kanoniske Send to Cut-importen bruker.
Stiplede enkeltstreker og pilspisser ved vektorgravering er støttet: de vises som den
heltrukne streken uten pilspisser som faktisk sendes til Cut. Original stipling/pilspisser
beholdes i normal Draw-visning og eksport. Forklaringsdialogen gjør forskjellen tydelig.
Grayscale-bilder vises i gråtoner; bildeoppløsning og fysisk laserresultat er ikke simulert eksakt.
Skjult, Ignore og ikke-utskrivbart blir ikke vist som output; templates er dempet referanse.

Outline og Laser Preview er gjensidig utelukkende. Av/på gjenoppretter tidligere Outline.
Pixel Preview har ingen separat implementert visningsmodus i dagens app.

## Forklaring av uavklarte objekter

«Show unresolved objects» i tegnforklaringen åpner en lesende objektliste. Hvert objekt får
råd ut fra årsaken: velg prosess, kontroller/ekspander utseende eller strek på en kopi, rett
tekstutlegg/overløp eller kontroller rasterdithering i Cut. Navn fra dokumentet beholdes som
tekst og oversettes ikke. Å åpne/lukke oversikten endrer ingen prosessvalg eller dokumentdata.

## Eksplisitte begrensninger

- Dotted/ravfarget kontur eller dempet bilde betyr uavklart prosess eller utseende. Avanserte
  kompositter (blend/envelope/masks), uekspanderte effekter, klippede malingsstacker, avansert
  tekstutseende, ikke-sentrerte streker og rasterdithering krever ekspandering eller kontroll i Cut. Å velge en operasjon gjør ikke en
  uverifisert effekt til en støttet simulering.
- En lagret Cut-lenke med Outline Stroke gjør graveringsstreker uavklart. Dette er en
  konservativ dokumentregel inntil egne overføringsvalg kan forhåndsvises per artboard.
- «Engrave as seen» (flate ut transparens og blending til output-raster) er ikke implementert.
- Ingen simulering av kjørerekkefølge, raske forflytninger, DPI-scanlinjer, brenndybde eller
  materialresultat. Forhåndsvisningen erstatter ikke sluttkontroll av maskin, materiale og jobb i Cut.

## Verifisering og videre arbeid

Enhetstester dekker prosesskobling, raster/vector, globale lag, Ignore/print/template, snapshots,
stilopprydding ved feil, røde linjer/stiplemønster, silhuett, preferanser og oversettelser.
`node electron/e2e/run.mjs --draw-laser-preview` verifiserer faktisk rendering med pikselprøver,
originale Paper-stiler og identisk dokument/historikk/dirty/SVG, ekte musegest med ett angresteg,
dialogvalg, filåpning/fanebytte, native meny/Help/Outline og normal appomstart. Testen inngår
også etter recovery i full Draw-E2E. Skjermbilde er visuelt kontrollert.

Neste er stabilisering og utvidelse av de støttede tilfellene, med output-sammenligninger for
hvert nytt tilfelle. Oppdater denne kontrakten, hovedplanen, STATUS og WORK_LOG fortløpende.

Forrige kontroll før strekeutvidelsen: 340 Draw-enhetstester, i18n og kontrast er grønne. Målrettet Laser Preview-E2E
passerer med den nye objektlisten, riktige råd, trygg tekstvisning av navn, uendret dokument/SVG
og normal appomstart. Full Draw passerte alle funksjonsgrupper, autosave og krasjgjenoppretting,
men feilet deretter i siste Laser Preview-del med lukket DevTools-forbindelse. Hele kjøringen
er derfor fortsatt ikke grønn; denne overgangen isoleres i neste stabilisering.

Avslutningsfeilen er diagnostisert og rettet i testkjøreren: en gammel stop-timer kunne
avslutte den relanserte appen. Nytt fokusert løp `node electron/e2e/run.mjs --draw-recovery`
gjenskapte feilen før rettingen og passerer hele IO/autosave/crash/recovery/preview-overgangen
etter rettingen. Ingen full omkjøring eller full grønn `npm test` er hevdet.

## Verifisert utvidelse: stipling og pilspisser ved vektorgravering

`node electron/e2e/run.mjs --draw-laser-strokes` oppretter faktiske stiplede streker med
pilspisser, velger Engrave, måler canvas og sender via appens virkelige Send to Cut. Cut-importens
rasteriserte alfaflate (samme grunnlag som vektorgraveringen bruker) sammenlignes med preview
ved 67 306 punkter: 0 avvik, inkludert 5 140 svarte punkter. Anti-aliasing og en én-piksel
rand langs rastergrensen utelates fra sammenligningen. Vanlig strek, uniform skalering,
ulik X/Y-skalering med shear og fast verdens-mm-strekbredde er med; importerte bredder
er 2, 3, 2 og 2,1166 mm. Preview bruker Cuts geometriske middel for transformert strekbredde
som skjermfast bredde, slik at en affin forelder ikke deformerer strekflaten.

Preview bevarer modell/historikk. Selve Send to Cut legger som forventet til én Cut-lenke og
ett historikksteg; artwork og Cut-SVG er identiske. Originale dash/cap/farger beholdes.
Breddeprofiler, flere fyll/streker, effekter og avanserte kompositter forblir uavklart. Dette
er en kontroll av overført silhuett, ingen simulering av eksakt DPI, scanlinjer eller materiale.
343 Draw-enhetstester, i18n og kontrast passerer.

`--draw-recovery` passerer også etter denne utvidelsen, inkludert de eksisterende Laser
Preview-kontrollene og den nye Cut-sammenligningen. Full Draw/npm test er ikke gjentatt.

## Verifisert utvidelse 2026-10-19: breddeprofiler og flere malingslag

Baner og former uten klippemasker kan forhåndsvises med breddeprofiler og flere fyll/streker.
Visningen bruker første synlige fyll og strek med konstant bredde, som vanlig centerline-
overføring til Cut. Draws ekstra malingsstack skjules bare under draw; basegeometrien får
midlertidig kanonisk maling fra samme `cutPaint` som Send to Cut. Normal visning og eksport
beholder hele utseendet. Selv en basepath uten egen maling blir derfor korrekt vist.

`--draw-laser-paints` og samlet `--draw-recovery` passerer. Fire faktiske Cut-importer dekker
profilert bane, flere streker med skjult første oppføring, rektangel/ellipse med flere fyll
og streker, affine foreldre og fast mm-strekbredde. Mot Cut-rasterets alfaflate: 66 912
sammenlignede punkter, 14 465 svarte, null avvik. Samme kant-/anti-aliasing-avgrensning som
strekekontrollen gjelder. Testen sjekker også gjenopprettet normalvisning med blå piksler,
modell/historikk/SVG og Outline Stroke-varsel i objektlisten.

346 Draw-enhetstester, i18n og kontrast passerer. Full Draw/npm test er ikke gjentatt.
Klippede malingsstacker og avansert tekstutseende krever egne sammenligninger.
