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
Grayscale-bilder vises i gråtoner; bildeoppløsning og fysisk laserresultat er ikke simulert eksakt.
Skjult, Ignore og ikke-utskrivbart blir ikke vist som output; templates er dempet referanse.

Outline og Laser Preview er gjensidig utelukkende. Av/på gjenoppretter tidligere Outline.
Pixel Preview har ingen separat implementert visningsmodus i dagens app.

## Eksplisitte begrensninger

- Dotted/ravfarget kontur eller dempet bilde betyr uavklart prosess eller utseende. Avanserte
  kompositter (blend/envelope/masks), uekspanderte effekter, avanserte graveringsstreker og
  rasterdithering krever ekspandering eller kontroll i Cut. Å velge en operasjon gjør ikke en
  uverifisert effekt til en støttet simulering.
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

Siste kontroll: 338 Draw-enhetstester og kontrast er grønne. Fullkjøringen passerte Java,
bridge/main/renderer og hele Cut-E2E, men stoppet i en eldre Character-test som valgte en familie
uten Bold. Dette er rettet, og målrettet Character-E2E er grønn. Resten av full Draw-E2E er ikke
kjørt på nytt; målrettet Laser Preview-E2E med bilde, Outline-lag og omstart er grønn på siste kode.
