# Cut optimized: prosesskobling og fremdrift

Oppdatert 2026-10-18. Oppgave D5.1 i DRAW_WORKSPACE 4.4.1.

## Ferdig i første implementasjonstrinn

`renderer/draw/view/cut-process.mjs` har en ren `resolveCutPreviewProcess(doc, id, snapshot)`.
Den returnerer `resolved`, `unresolved`, `excluded` eller `container`. Den endrer verken dokument,
Cut-innstillinger, historikk, preferanser eller geometri. Resolveren er foreløpig **ikke koblet til UI**.

- Snapshot er `{mappingMode, layers}` fra **samme fanes Cut**. Det er en forhåndsvisning av det
  oppsettet, ikke en lovnad om prosessene i en ny eller annen Cut-fane.
- `matchingProcessLayer` i `renderer/layer-model.mjs` deles med Cuts faktiske `syncLayers`.
  Eksakt prosessnøkkel prioriteres, deretter farge og type. En raster kan aldri arve en vektors
  Cut/Score-innstillinger fordi begge er svarte. Dette bevarer eksisterende Cut-valg.
- `cutPaint` i `draw/io/cut-paint.mjs` deles med Send to Cut: første synlige strekfarge, ellers
  første synlige fyllfarge; gradientens første stopp etter offset. Scribble sender fyllfargen
  som linje. Dette identifiserer et prosesslag; det velger **ikke** en laseroperasjon fra fargen.
- Bilder sendes til Cuts svarte rasterlag. Et bilde uten tilsvarende prosesslag er uavklart,
  ikke automatisk fremstilt som en allerede konfigurert gravering.
- I global modus kreves et faktisk globalt prosesslag med samsvarende operasjon. Ugyldige
  eller manglende innstillinger gir uavklart. Ingen effekt, hastighet, DPI eller dither gjettes.
- Skjulte, template- og ikke-utskrivbare noder utelukkes med samme `isOutputNode` som eksport.
  Ignore og deaktivert output utelukkes. Containerens barn må vurderes hver for seg.
- Resolveren gir en uavhengig kopi av prosessinnstillingene ved treff. Nye oppslag leser nye
  snapshots; den beholder ingen cache som kan gjøre prosessvalg utdaterte.

## Gjenstår før funksjonen kan vises som ferdig

1. Ren visningsprojeksjon og representative geometritester. Prosessoppslag er ikke rendering:
   tekstutlegg/overløp, klipp, blend/envelope, effekter og rasterprosessor må kobles til sine
   eksisterende output-regler. Outline Stroke kan produsere egne fyll-/streklag og må vurderes
   etter utvidelse; én nodeidentitet er ikke en simulering av alle Send to Cut-valg.
2. Live rendering under tegning, tynne skjermstore Cut/Score-baner, gravering, hvit arbeidsflate,
   referanselag og synlig merking av uavklarte prosesser. Ikke gjett op fra tegnefarger.
3. View-meny, aktiv status per fane og samspill med Outline/Pixel Preview.
4. Forklaringsdialog, Continue/Cancel, varig «Don’t show this again», Help/Preferences og oversettelser.
5. Electron-testene og sammenligning med Cut. Toggles skal bevare originaldokument, eksport,
   Send to Cut, undo/redo og dirty-status. Material-/maskinresultat kan ikke forutsies eksakt.

Deloppgaver og resultat føres videre i hovedplanen, STATUS og WORK_LOG ved hvert trinn.

## Verifisert for første deltrinn

329 Draw-tester (12 nye), 34 main, 69 renderer, 28 Java, bridge og kontrast passerer.
Målrettet Electron `--draw-cut` og `--draw-export` passerer. Full `npm test` stopper på
allerede dokumentert crop-E2E-assertion i `workflows.mjs:369`; full Draw-E2E ble ikke nådd.
Se arbeidsloggen for lokal JDK-retting. Toggle og dialog er ikke implementert eller testet.
