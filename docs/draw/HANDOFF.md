# Draw: overlevering til neste agent

Oppdatert 2026-10-15. Arbeidsgren: `feat/vector-draw`.

## Status og neste oppgave

Fase 0 og D1.1–D1.7 er fullført. **D1.8 pågår** og gjøres i delsteg som committes
og pushes hver for seg: A Layers/template-lag (**ferdig**), B Transform-panel (**ferdig**),
C Align-panel, D Color/Stroke, Fill/Stroke-boks og Properties-gjennomgang.
Fortsett med første ikke-ferdige delsteg. Se [arbeidsloggen](WORK_LOG.md) for detaljer.

Les [hovedplanen](../DRAW_WORKSPACE.md), spesielt panelspesifikasjonen og sjekklisten i kapittel 23.

Brukeren ønsker at agenten tar én fase/del av gangen, committer, pusher og dokumenterer
etter hver del, holder dem orientert og unngår at Layers og andre verktøy vises flere steder.

Arbeidet er committet på `feat/vector-draw`. Ikke reset eller clean arbeidstreet.

## Sist fullført: D1.7

- Rotate, Reflect og Scale er aktivert i eksisterende verktøygrupper, med ett primærverktøy per gruppe.
- Flyttbart referansepunkt; dialoger med eksakte verdier, Preview, Cancel, Copy og Apply.
- Alt-drag lager kopi; Shift gir vinkelsteg eller proporsjonal skalering. Alt-klikk, Enter eller dobbeltklikk på verktøyet åpner dialog.
- Object > Transform-meny og Transform Again med Ctrl/Cmd+D. Gjentakelse bruker siste vellykkede verdensmatrise på gjeldende utvalg, inkludert kopi- og strekvalg.
- Dialogvinkler er positive mot klokken, selv om canvas har y-akse nedover.
- Forhåndsvisning endrer ikke dokument eller dirty-status. Endringer går som én History-transaksjon, og foreldede dialoger avviser commit hvis modellen endres mens dialogen er åpen.
- Scale kan bevare eller skalere strektykkelse og dashlengder. Skalering bruker `sqrt(abs(det(matrix)))`. Effektmetadata bevares; rendering/skalering av effekter tilhører senere fase.
- En nødvendig stilendring i låste/skjulte etterkommere avbryter hele Scale-transaksjonen.

Tidligere ferdige trinn inkluderer artboards, selection/hand/zoom, Direct Selection, live corners, Pen/ankerredigering og grunnformer. Live corners lagrer både redigerbar kildedata og faktisk oppløste Bézier-kurver.

## D1.8: anbefalt start

Sammenlign eksisterende paneler med hovedplanen før implementering. Omfanget er Properties, Layers (inkludert Template-lag), Transform, Align, Color og Stroke uten profiles, samt Fill/Stroke-boksen i verktøylinjen. Flere grunnfunksjoner finnes allerede; fullfør manglene.

- Bevar én montert høyrepanelvisning og ett Layers-tre. Properties skal ikke duplisere kontrollene fra Transform, Color og Stroke.
- Lagmodellen har allerede `color`, `template`, `printable` og `dimImagesTo`; UI/rendering for template-lag er ikke ferdig.
- Kontekstuell kontroll-/statuslinje er D1.9. Group/isolation/Arrange/clipboard er D1.10, Place/bitmap/template/embed D1.11 og Send to Cut D1.12. Ikke merk fase 1 ferdig etter D1.8.
- Oppdater hovedplan, roadmap og arbeidslogg når trinnet er ferdig, og oppdater denne filen ved neste overlevering.

## Arkitektur og viktige fallgruver

- Modell og geometri skal være uten DOM/Paper. Alle dokumentendringer går gjennom Commands/History. Paper er kun visning; forhåndsvisning og håndtak er ikke dokumentdata.
- Draw har isolert PaperScope. Aktiver riktig scope før Paper-operasjoner og gjenopprett Cut-scope i `finally`. Bevar tema-capture-handleren i `renderer/app.js`, som hindrer at Cut-tegning havner i Draw-scope.
- Ikke endre `renderer/bed.js` eller `sidecar/` for panelarbeidet. Disse er ikke endret av Draw-arbeidet. En smal Draw→Cut-import hører til D1.12.
- `state.ui` er midlertidig tilstand og serialiseres ikke. Dokumentet bruker stabile ID-er og immutable snapshots.
- Valgfri `strokeScaling:false` betyr at modellens strekbredder/dashlengder er i verdens-mm. **Paper tolker false som skjermpiksler**, derfor multipliserer adapteren verdiene med `view.zoom`, også i preview. Bevar denne kompensasjonen; den er verifisert med pikseltest ved dobbel zoom. Eldre noder beholder tidligere strekoppførsel frem til eksplisitt Scale.
- Live corners beholder metadata ved uniform transformasjon, rotasjon og speiling. Ikke-uniform skalering/shear av selve pathen baker metadata, men bevarer eksakte kurver. Segment-/Pen-endringer baker berørt subpath. Modellvalideringen krever samsvar mellom corner-kildedata og oppløste kurver.
- Paper kan cache foreldede globale matriser etter reparenting. Adapteren beregner verdensmatriser fra modellen. Hit-testing bruker modellen, ikke ghost-/preview-punkter.

## Filkart

| Fil/område | Ansvar |
| --- | --- |
| `renderer/draw/index.mjs` | Workspace, scope, kommandoer, verktøytilgjengelighet, panel- og dialogkobling; eksporterer `getDrawWorkspace(root)` til E2E |
| `renderer/draw/panels/ui.mjs` | Én aktiv panelvisning fra sju panelknapper; eksisterende grunnkontroller |
| `renderer/draw/tools/toolbar.mjs` | Verktøygrupper, flyouts uten aktiv variant, hold/høyreklikk/Alt-bytte, fargebokser |
| `renderer/draw/tools/interactions.mjs` | Canvas-gestures, selection, former, artboards, hand/zoom og transformasjoner |
| `renderer/draw/tools/transforms.mjs` | Transform-controller, kopiering, gjentakelse og History-transaksjoner |
| `renderer/draw/geom/transforms.mjs` | Rene transformmatriser og normalisering av strekstil |
| `renderer/draw/geom/corners.mjs` | Rene live-corner-beregninger |
| `renderer/draw/tools/paths.mjs` | Pen, ankerredigering, live-corner-gestures og shape→path |
| `renderer/draw/doc/` | Skjema, immutable dokument, Commands, History og separat utvalg |
| `renderer/draw/render/paper-adapter.mjs` | Retained rendering, bounds, verdensmatriser, hit-testing og previews |
| `renderer/draw/render/anchors.mjs`, `overlays.mjs` | Skjermkonstante anker-/corner-kontroller, bbox og referansekryss |
| `renderer/draw/ui/dialogs.mjs` | Tilgjengelige modaler, fokus, Escape/Tab, transform- og størrelsesdialoger |
| `electron/main.mjs` | Modusavhengige native menyer og akseleratorer |
| `electron/e2e/draw-*-workflows.mjs` | Draw E2E, inkludert corners og transforms |

Prosjektformatet er `.modcut` v4, med uavhengig Draw/Cut-state og dirty-status per fane, autosave og recovery. Ukjent Draw-format bevares i safe/read-only-modus. Enkel SVG importeres redigerbart; kompleks SVG bruker rasterfallback. Send to Cut/eksport er ikke ferdig.

## Verifisert ved stoppunktet

- **102 Draw-enhetstester passerer.**
- **Komplett Draw Electron E2E passerer**, inkludert transformasjoner, pikselkontroll av strek ved zoom, prosjektlagring/-åpning, autosave og prosessdrap/restart/recovery.
- `git diff --check` passerer.
- Full `npm test` stopper fortsatt i kjent Cut-beskjæringstest: `electron/e2e/workflows.mjs:369`, «dragging a crop edge must update the crop», der både actual og expected er `100 × 100%`. Sidecar, bridge, main, renderer, Draw og kontrasttestene passerer før dette. Ikke rapporter full suite som grønn.
- Én full Draw-kjøring traff en forbigående DevTools-tilkoblingsfeil etter simulert krasj. Komplett omkjøring passerte uten harness-endring. Endelig Draw-kjøring etter strek-/zoomrettelsen er grønn.

## Kjøring på denne maskinen

Node v24.16.0 og npm er installert. Portabel JDK17 finnes under `%TEMP%\modcut-draw-toolchain\jdk-17.0.20.1+1`. Sett miljø bare for gjeldende PowerShell-prosess:

```powershell
$drawToolchain = Join-Path $env:TEMP 'modcut-draw-toolchain'
$env:JAVA_HOME = (Get-ChildItem -LiteralPath $drawToolchain -Directory -Filter 'jdk*' | Select-Object -First 1).FullName
$env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path
npm run test:draw
npm run test:e2e:draw
```

Målrettede E2E-kjøringer bruker eksisterende bygget sidecar-jar:

```powershell
node electron/e2e/run.mjs --draw-tools
node electron/e2e/run.mjs --draw-paths
node electron/e2e/run.mjs --draw-corners
node electron/e2e/run.mjs --draw-transforms
```

Ikke kjør Electron E2E samtidig: vindusoverdekking/timer-throttling på Windows har gitt falske autosave-tidsfeil. Syntetiske hurtigtaster må sende både keydown og keyup og slippe modifikatorer. Bruk musehjelperne med input-venting før hover-asserts. Save-testene venter på ferdig-toast før fil-lesing for å unngå Windows rename/EPERM-race.

Testlogger finnes i `%TEMP%\modcut-draw-toolchain`: `draw-transform-unit.log`, `draw-transforms-full.log` og `npm-test-transforms.log`. Sistnevnte er fra før siste rendererrettelse; Draw-enhetstestene og komplett Draw E2E ble kjørt på nytt etter rettelsen. Skjermbilder finnes blant annet i `%TEMP%\modcut-draw-transform-dialog.png` og `%TEMP%\modcut-draw-corners-light.png` / `modcut-draw-corners-dark.png`. Ikke legg temporær JDK, logger eller skjermbilder i repoet.

Denne overleveringen er en dokumentasjonsoppdatering; det er ikke gjort nye kodeendringer etter ovennevnte testede stoppunkt.
