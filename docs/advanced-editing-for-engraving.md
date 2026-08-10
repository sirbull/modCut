# Advanced Editing for Engraving

## Sammendrag

Det er fullt mulig å bygge dette direkte i modCut uten Photoshop, eksterne tjenester eller en større omskriving. Appen har allerede den viktigste grunnmuren: ikke-destruktive rasterinnstillinger, Paper.js/canvas-preview, gråtone med variabel effekt, dithering, fysisk DPI, lagring/undo og både kontekstmeny og native toppmeny.

Første versjon skal være en produksjonsklar, lokal rastereditor med fem stilfamilier:

1. Foto og dithering
2. Halftone med prikker av variabel størrelse
3. Parallelle linjer med variabel tykkelse
4. Krysskravering i banknote-/kobberstikkstil
5. Sketch/edge engraving

Resultatet lagres som en ikke-destruktiv oppskrift per bilde. Preview og laserjobb skal bruke samme prosesseringsmotor og samme fysiske DPI, slik at bildet ikke blir dithret en gang til under eksport.

## Researchgrunnlag

| Verktøy/teknikk | Hva det gjør | Konsekvens for modCut |
|---|---|---|
| PhotoGrav | Materialprofiler, clipping, gamma, histogramutjevning, smoothing, edge strengthening, laseroptimalisert error diffusion, støy mot banding og veiledende materialsimulering. [PhotoGrav](https://www.photograv.com/), [PhotoGrav-dokumentasjon](https://documentation.help/PhotoGrav-3.0/ug_chapter3.htm) | Kombiner tonebehandling, detaljforbedring, materialpresets og justerbar dithering i én arbeidsflyt. |
| ImagR og 1-Touch | Automatiske materialoppskrifter, kontrast/skarphet/dithering, positiv eller negativ polaritet, DPI-verktøy og eksport av ferdig binær bitmap. [ImagR](https://imag-r.com/), [1-Touch Laser Photo](https://ulsinc.com/support/1-touch-laser.html) | Materialvalg bør gi et anbefalt utgangspunkt, men ikke overskrive brukerens bilde lydløst. |
| Laser Photo Wizard | Sketch, vanlig fotodithering, kontraststerk «dithered gray» og metoder som forsøker å kompensere for overlappende laserpunkter. [Laser Photo Wizard](https://www.laserphotowizard.com/) | Sketch og kontroll over mønstertetthet bør være egne stiler, ikke bare flere navn på samme filter. |
| LightBurn | Side-ved-side-preview, per-image tone/skarphet, threshold, ordered/error diffusion, Newsprint, Halftone, Sketch og Grayscale. Halftone eksponerer cellestørrelse og vinkel. [Adjust Image](https://docs.lightburnsoftware.com/2.1/Reference/AdjustImage/), [Image Modes](https://docs.lightburnsoftware.com/latest/Reference/CutSettingsEditor/ImageMode/) | Editorens preview bør inkludere både bildebehandling og lagets DPI/outputinnstillinger. |
| Photoshop/GIMP | Photoshop tilbyr threshold, pattern/diffusion dither og halftone med frekvens, vinkel og punktform. GIMP tilbyr linjer, sirkler, diamanter, krysslinjer, periode og vinkel. [Photoshop Bitmap Mode](https://helpx.adobe.com/photoshop/desktop/adjust-color/color-modes/convert-an-image-to-bitmap-mode.html), [GIMP Newsprint](https://docs.gimp.org/3.0/en/gimp-filter-newsprint.html) | Prikker og linjer kan implementeres som kontrollerbare halftone-spotfunksjoner direkte på laserens pikselrutenett. |
| EngraverIII/EngraverAI | Lager håndtegnet gravyrpreg med linjemønstre og krysskravering, men er primært visuelle Photoshop-filtre og ikke laser-/materialkalibrering. [Adobes pluginoversikt](https://helpx.adobe.com/no/photoshop/kb/plugins.html) | modCut må kombinere det visuelle uttrykket med faktisk DPI og binært laseroutput. |
| Banknote-/portrettgravering | Variabel linjetykkelse og krysskravering kan genereres med ordered dithering. Linjer som bøyer seg rundt et ansikt krever landmarks, dybdeestimat eller annen innholdsbevisst warping. [Image-based Portrait Engraving](https://arxiv.org/abs/2008.05336) | Rett krysskravering er med i første versjon; ansikts-/formtilpassede kurver utsettes. Guilloché-bakgrunner er en separat geometrigenerator, ikke et fotofilter. |

## Brukeropplevelse

- Kommandoen heter **Advanced Editing for Engraving…** og åpnes fra:

  - Høyreklikkmenyen når nøyaktig ett rasterbilde er valgt.
  - `Edit`-menyen, aktivert bare når nøyaktig ett rasterbilde er valgt.
  - `Alt/Option+I`.

- Editorvinduet blir en stor modal med:

  - Synkronisert original og prosessert preview med pan, zoom og «fit».
  - Stilvelger med de fem stilfamiliene.
  - Felles tone-/detaljkontroller og stilspesifikke parametere.
  - Faktisk lag-DPI, forventet outputstørrelse og advarsler om for lav kildeoppløsning eller for små mønsterceller.
  - Valgfri **Approximate material preview**, tydelig merket som veiledende og ikke en garanti for fysisk resultat.
  - Presetvelger, **Save preset**, **Reset**, **Cancel** og **Apply**.

- Endringer er midlertidige mens dialogen er åpen. `Apply` oppretter ett undo-steg; `Cancel` endrer ingenting.
- De eksisterende kontrollene i sidepanelet beholdes som hurtigjusteringer og redigerer samme oppskrift.

## Prosesseringsmodell og grensesnitt

Innfør en versjonert `EngravingRecipe` per Paper.js-raster:

```text
EngravingRecipe {
  version
  adjustments {
    brightness, contrast, blackPoint, whitePoint, gamma, invert
    denoise, enhanceRadius, enhanceAmount
  }
  style: Photo | Dots | Lines | Crosshatch | Sketch
}
```

Stilvariantene får følgende kontroller:

### Photo

- Grayscale, Jarvis, Floyd–Steinberg, Stucki, Atkinson eller Bayer.
- Threshold/density for binære modi.
- Gray levels for variabel lasereffekt.
- Deterministisk noise gain for å redusere banding og repeterende feil.

### Dots

- Cells per inch, vinkel og tone/density.
- Rund, ellipse, diamant eller firkant.
- Minimum og maksimum punktstørrelse.

### Lines

- Lines per inch, vinkel og tone/density.
- Minimum og maksimum linjetykkelse.
- Kontrollert roughness med deterministisk seed.

### Crosshatch / Banknote

- Linjefrekvens, hovedvinkel og kryssvinkel.
- Krysskraveringsstyrke/terskel, slik at sekundærlinjene hovedsakelig kommer i mørke partier.
- Minimum/maksimum linjetykkelse og valgfri roughness.
- Implementeres som strukturert ordered dithering, ikke som guilloché eller AI-basert ansiktsanalyse.

### Sketch

- Edge radius, edge amount, threshold og smoothing.
- Lager et binært høy-pass/edge-resultat egnet for tegninger, håndskrift, bygninger og andre tydelige konturer.

Opprett rene prosesseringsgrensesnitt som kan brukes identisk av preview og jobbbygging:

```text
normalizeEngravingRecipe(recipe)
processEngravingImage(sourceImageData, outputGrid, recipe)
effectiveEngravingRecipe(raster, layerDefaults)
```

`processEngravingImage` returnerer enten:

- en binær maske for dither, dots, lines, crosshatch og sketch, eller
- gråtoneverdier for variabel effekt.

Avanserte binære resultater behandles internt som pass-through og skal aldri dithres på nytt. Laget beholder power, speed, frequency, DPI, retning og native/vector scan; bildet eier den visuelle oppskriften.

## Implementasjonsendringer

- Samle tonebehandling, resampling og stilrendering i rasterprosesseringsmodulen. Mønstre beregnes på laserens faktiske output-grid fra bildets fysiske størrelse og lagets DPI, ikke bare på kildebildets piksler.
- Flytt tung previewprosessering til en lokal Web Worker med debounce, kansellering av utdaterte jobber og deterministiske resultater. Grensen på åtte millioner rastersamples beholdes.
- La lagets eksisterende rastermodus fungere som standard for eldre og uredigerte bilder. Når Advanced Editing brukes, får bildet en eksplisitt per-image override. Lagpanelet merkes da med at enkelte bilder bruker egne innstillinger.
- Utvid materialmodellen med valgfri anbefalt engraving-preset, mark polarity og previewfarger. Endring av materiale foreslår preset, men overskriver aldri et allerede redigert bilde automatisk.
- Legg inne immutable startpresets for Photo/Wood, Photo/Dark Surface, Bold Lines, Halftone Dots, Banknote Crosshatch og Technical Sketch. Brukerpresets lagres lokalt og inneholder kun bildeoppskriften, ikke maskinens power/speed.
- Oppdater native menytilstand via IPC når utvalget endres. Kontekstmenyen og menykommandoen bruker samme validering.
- Oppgrader dokumentformatet til versjon 3. Versjon 2-dokumenter migreres ved å bygge en Photo-oppskrift fra eksisterende `rasterSettings`, `rasterMode` og lagets ditherinnstilling. Originalens `dataUrl` beholdes urørt.

## Testplan og akseptansekriterier

- Unit-tester med små, kjente gradienter verifiserer hvert mønster, parameternormalisering, transparens, invert/polaritet og deterministisk noise/roughness.
- Preview og laserjobb skal produsere identisk maske/hash for samme bilde, oppskrift, størrelse og DPI.
- Verifiser at prikkdiameter og linjetykkelse øker monotonisk når bildet blir mørkere.
- Verifiser at crosshatch først introduserer sekundærlinjer etter valgt toneterskel.
- Verifiser at samme lag kan inneholde flere rasterbilder med forskjellige advanced-oppskrifter.
- E2E-tester dekker menyaktivering, høyreklikk, Apply, Cancel, Reset, undo/redo, presets, lagring/gjenåpning og migrering av eldre dokumenter.
- Kjør eksisterende renderer-, main- og Electron-E2E-suite for å sikre at GRBL, Epilog binary/native raster og eksisterende ditherjobber fortsatt fungerer.
- Manuell akseptanse utføres med en fotografisk gradient, et portrett, en logo og en transparent PNG ved minst to DPI-verdier. Simulert materialvisning skal alltid vise at resultatet er veiledende.

## Avgrensninger og standardvalg

- Første versjon er fullstendig lokal og bruker ingen AI, nettsky eller Photoshop-plugin.
- Resultatet forblir rasterbasert og ikke-destruktivt; konvertering til redigerbare vektorbaner er ikke med.
- Form-/ansiktstilpassede kurver, Weighted Voronoi-stippling, automatisk bakgrunnsfjerning, fysisk kalibrert materialsimulering og guilloché-generator vurderes separat etter at kjernerendereren er validert på ekte materialer.
- Materialpreview er et sammenligningsverktøy. Faktisk resultat avhenger fortsatt av laserpunkt, fokus, effekt, hastighet og variasjoner i materialet.
