# Tegneplan for modCut

Basert på prosjektets verktøyregister og musepekerkode, og filene i `ICONS/illustrator`.
Illustrator-filene er referanser. Lag egne originaltegninger eller bruk passende åpne ikoner.
De omtegnede `Cur_*.svg`-filene i `illustrator/redraw` brukes nå som kilde for musepekerne.
`S_*.svg`-filene er fortsatt referanser og er ikke koblet til verktøylinjen.

## Verktøylinje: 49 registrerte verktøy

Dette er registerdekning, ikke en bekreftelse på at alle verktøy er implementert.
Alle filnavn nedenfor er relative til `ICONS/illustrator/`.
«Ikke entydig funnet» betyr at navnelisten ikke gir et sikkert motstykke; det er ikke en visuell identifikasjon av alle SVG-filene.
Tegn ett ikon per rad hvis hele registeret skal få nye ikoner. Eksisterende Tabler-ikoner kan også beholdes.

| Verktøy | Referansefil | Nytt filnavn |
|---|---|---|
| Selection | `S_Select_Lg_N@2x.svg` | `select.svg` |
| Direct Selection | `S_AnchorSelect_Lg_N@2x.svg` (sannsynlig; sjekk formen) | `direct-select.svg` |
| Group Selection | `S_GroupAnchorSelect_Lg_N@2x.svg` (sannsynlig; sjekk formen) | `group-select.svg` |
| Magic Wand | Ikke entydig funnet | `magic-wand.svg` |
| Lasso | Ikke entydig funnet | `lasso.svg` |
| Artboard | `S_ArtboardTool_Lg_N@2x.svg` | `artboard.svg` |
| Pen | Ikke entydig funnet som verktøylinjeikon; `Cur_Pen_1_1@2x.svg` viser musepekeren | `pen.svg` |
| Add Anchor Point | `S_AnchorAdd_Lg_N@2x.svg` | `anchor-add.svg` |
| Delete Anchor Point | `S_AnchorDel_Lg_N@2x.svg` | `anchor-remove.svg` |
| Anchor Point | `S_ConvertAnchor_Lg_N@2x.svg` | `anchor-convert.svg` |
| Curvature | Ikke entydig funnet | `curvature.svg` |
| Pencil | Ikke entydig funnet | `pencil.svg` |
| Smooth | `S_Smooth_Lg_N@2x.svg` | `smooth.svg` |
| Path Eraser | Ikke entydig funnet | `path-eraser.svg` |
| Paintbrush | Ikke entydig funnet | `brush.svg` |
| Blob Brush | Ikke entydig funnet | `blob-brush.svg` |
| Eraser | `S_Erase_Lg_N@2x.svg` | `eraser.svg` |
| Scissors | `S_SegmentCut_Lg_N@2x.svg` | `scissors.svg` |
| Knife | `S_ObjectCut_Lg_N@2x.svg` | `knife.svg` |
| Shape Builder | `S_RegionEdgeSelection_Lg_N@2x.svg` (sannsynlig; sjekk formen) | `shape-builder.svg` |
| Width | `S_WidthTool_Lg_N@2x.svg` | `width.svg` |
| Rectangle | `S_Rectangle_Lg_N@2x.svg` | `rect.svg` |
| Rounded Rectangle | `S_RoundedRectangle_Lg_N@2x.svg` | `rect-rounded.svg` |
| Ellipse | `S_Ellipse_Lg_N@2x.svg` | `ellipse.svg` |
| Polygon | `S_Polygon_Lg_N@2x.svg` | `polygon.svg` |
| Star | `S_Star_Lg_N@2x.svg` | `star.svg` |
| Line Segment | `S_Line_Lg_N@2x.svg` | `line.svg` |
| Arc | `S_Arc_Lg_N@2x.svg` | `arc.svg` |
| Spiral | `S_Spiral_Lg_N@2x.svg` | `spiral.svg` |
| Rectangular Grid | `S_RectangularGrid_Lg_N@2x.svg` | `grid-rect.svg` |
| Polar Grid | `S_PolarGrid_Lg_N@2x.svg` | `grid-polar.svg` |
| Type | `S_TypeHoriz_Lg_N@2x.svg` | `type.svg` |
| Area Type | `S_AreaType_Lg_N@2x.svg` | `type-area.svg` |
| Type on a Path | `S_HorizTypePath_Lg_N@2x.svg` | `type-path.svg` |
| Vertical Type | `S_TypeVert_Lg_N@2x.svg` | `type-vertical.svg` |
| Touch Type | `S_TextTouchUpTool_Lg_N@2x.svg` | `type-touch.svg` |
| Rotate | `S_Rotate_Lg_N@2x.svg` | `rotate.svg` |
| Reflect | `S_Reflect_Lg_N@2x.svg` | `reflect.svg` |
| Scale | `S_Scale_Lg_N@2x.svg` | `scale.svg` |
| Shear | `S_Skew_Lg_N@2x.svg` | `shear.svg` |
| Free Transform | `S_FreeTransform_Lg_N@2x.svg` | `free-transform.svg` |
| Gradient | `S_Gradient_Lg_N@2x.svg` | `gradient.svg` |
| Eyedropper | `S_Sampler_Lg_N@2x.svg` | `eyedropper.svg` |
| Measure | `S_Measure_Lg_N@2x.svg`, alternativt `S_MeasureNew_Lg_N@2x.svg`; velg ett uttrykk | `measure.svg` |
| Blend | `S_Blend_Lg_N@2x.svg` | `blend.svg` |
| Live Paint Bucket | `S_LivePaint_Lg_N@2x.svg` | `paint-bucket.svg` |
| Hand | `S_Pan_Lg_N@2x.svg` | `hand.svg` |
| Zoom | `S_Magnification_Lg_N@2x.svg` | `zoom.svg` |
| Rotate View | Ikke entydig funnet | `rotate-view.svg` |

`S_VectorDraw`, `S_BrushShapeDraw`, `S_Merge` og andre interne navn bør identifiseres visuelt før de tilordnes verktøy. Ikke anta at de betyr Pencil, Paintbrush eller Shape Builder.

## Musepekere: start med disse referansene

Dette er en tegneliste, ikke en instruks om å kopiere banene. Tillegg kan lages én gang og gjenbrukes på egne grunnformer.
For pensel, måling, bredde, gradient og enkelte andre verktøy finnes allerede egne former i `renderer/draw/tools/cursors.mjs`, selv om mappen mangler et tydelig navngitt motstykke.

| Bruk | Referansefil(er) | Hva du trenger å tegne |
|---|---|---|
| Selection / Direct Selection | `Cur_Select_1_1@2x.svg`, `Cur_DirectSelect_1_1@2x.svg` | Svart og hvit pil |
| Flytting og kopiering | `Cur_Move_1_1@2x.svg`, `Cur_MoveCopy_1_1@2x.svg`, `Cur_DirectMove_1_1@2x.svg`, `Cur_DirectMoveCopy_1_1@2x.svg` | Gjenbruk pilene med tillegg |
| Group Selection | `Cur_DirectSelectAdd_1_1@2x.svg` (sjekk formen) | Hvit pil med plusstegn |
| Pen, grunnform | `Cur_Pen_1_1@2x.svg` | Én tydelig pennespiss |
| Pen, ny bane | `Cur_PenNew_1_1@2x.svg` | Pennespiss med stjerne |
| Pen, fortsett bane | `Cur_PenContinue_1_1@2x.svg` | Pennespiss med fortsett-markør |
| Pen, lukk bane | `Cur_PenClose_1_1@2x.svg` | Pennespiss med sirkel |
| Legg til / fjern anker | `Cur_PenAdd_1_1@2x.svg`, `Cur_PenSubstract_1_1@2x.svg` | Pennespiss med pluss / minus; behold merkingen av den feilstavede referansefilen |
| Pen, hjørne / sammenføying | `Cur_PenCorner_1_1@2x.svg`, `Cur_PenWeld_1_1@2x.svg` | Egne tillegg etter behov; kontroller betydning visuelt |
| Konverter anker | `Cur_EditAnchor_1_1@2x.svg` | Egen ankerpeker |
| Pensel | `Cur_Brush_2_16@2x.svg` | Penselform |
| Pipette | `Cur_Eyedropper_2_17@2x.svg` | Pipetteform |
| Saks | `Cur_Scissors_1_1@2x.svg` | Saksform |
| Hånd, hvilende / drar | `Cur_Hand_11_11@2x.svg`, `Cur_Fist_11_11@2x.svg` | Åpen og lukket hånd |
| Zoom | `Cur_ZoomIn_8_8@2x.svg`, `Cur_ZoomOut_8_8@2x.svg` | Ett forstørrelsesglass med pluss / minus |
| Tekst | `Cur_HorizontalText_1_1@2x.svg`, `Cur_HorizTextOnPath_11_12@2x.svg` | Tekstpeker og variant på bane; områdetekst trenger også en variant |
| Former | `Cur_Precise_9_9@2x.svg` | Ett felles trådkors |
| Skalering | `Cur_ScaleHorizontal_9_9@2x.svg`, `Cur_ScaleVertical_9_9@2x.svg`, `Cur_ScaleTLBR_9_9@2x.svg`, `Cur_ScaleTRBL_9_9@2x.svg` | Valgfritt: appen bruker systemets skaleringspekere nå |
| Rotasjon | `Cur_RotateTopLeftCorner_7_7@2x.svg` og de andre `Cur_Rotate*` | Én rotasjonsform kan være nok for dagens kode |

Andre musepekerformer i dagens kode: blyant, måling, bredde, blob brush, blend, gradient, artboard, transformasjon og hjørnerunding, samt små tillegg for anker- og segmentvalg. Disse kan også få nye originaltegninger hvis hele pekersettet skal byttes.

## Utsett disse

- `Cur_PrecisePen*`: ekstra presisjonsvarianter som dagens modCut ikke har et separat pekermodus for. Ett felles trådkors er nok først.
- `S_Symbol*`, `S_*Graph*`, sky-/synkroniseringsikoner, fontformatikoner, isolasjonsikoner og tabulatorpekere.
- Warp, Twirl, Pucker, Bloat, Scallop, Crystallize og Wrinkle.
- Perspective Grid, Perspective Selection, Mesh, Flare, Slice og ekstra tekstvarianter som Vertical Area Type. Disse finnes i referansebildet, men ikke i dagens verktøyregister.
- Varianter med `_D` trenger ikke egne tegninger hvis forskjellen bare er farge eller visningstilstand; kontroller før de forkastes.

## Levering av nye originaler

- Behold egne Illustrator-arbeidsfiler. Eksporter én selvstendig SVG per ikon uten innebygde rasterbilder eller eksterne ressurser.
- Verktøylinje: 24 × 24, transparent bakgrunn, helst én farge som appen kan styre.
- Musepekere: 32 × 32 som første mål, transparent bakgrunn, mørk form og lys kant for kontrast.
- Registrer hotspot som x/y-koordinater i den eksporterte SVG-ens koordinatsystem. Ikke utled koordinatene fra Adobe-filnavnene uten kontroll; filene er merket `@2x`.
- Pennens tilstander må ha samme plassering av spissen og samme hotspot.
- Forslag til egne mapper: `ICONS/modcut/toolbar/` og `ICONS/modcut/cursors/`.
- Prioriter først Pen, Add/Delete/Convert Anchor, Selection og Direct Selection, inkludert musepekervariantene.

## Integrasjon senere

Verktøylinjen bruker `renderer/draw/icons/sprite.svg`; musepekerne bygges i `renderer/draw/tools/cursors.mjs`.
Etter endringer i `ICONS/illustrator/redraw/Cur_*.svg`, kjør `npm run build:cursors` for å oppdatere musepekerne.
Å legge andre SVG-er i `ICONS` endrer ikke appen automatisk.
Dagens ikonbygger kontrollerer at verktøylinjeikonene samsvarer med Tabler-manifestet. Når egne originaler tas i bruk, må byggerens kilde-/lisenshåndtering og dokumentasjon også oppdateres.
