# Draw tool icons

Draw and Cut share these toolbar icons. Most use **Tabler Icons outline**,
pinned to `@tabler/icons` **3.49.0** (MIT).
Official catalog: https://tabler.io/icons
Source: https://github.com/tabler/tabler-icons

The library SVGs are byte-for-byte copies from the published package, renamed
only to preserve the specification's stable icon IDs. They use a 24×24 viewBox,
currentColor, a 2-unit stroke and round caps/joins. `sources.json` records each
upstream filename and SHA-256, plus the package URL and npm integrity.
`LICENSE.tabler.txt` retains the complete upstream copyright and license.
Only this subset is shipped; no CDN, icon font or runtime package is required.

Use existing library artwork for new icons unless the user requests their own artwork.
Some specialized Illustrator tools use the closest library symbol: anchor
addition/removal use pointer-plus/minus, Smooth uses wave-sine, rounded rectangle
uses square-rounded, Type on a Path uses text-orientation, Vertical Type uses
text-direction-rtl, and Gradient uses color-swatch. Tooltips supply the precise
tool name; these symbols do not claim Illustrator's exact visual vocabulary.
The user-provided CTA artwork in the root `ICONS` folder remains unchanged.

`pen.svg` is the user's original filled pen nib, adapted from the packaged
`Cur_Pen_1_1@2x.svg` cursor drawing and rotated to point down-left. `width.svg` is
the user's original Width tool drawing exported from Illustrator. Both are editable
directly in this directory and use `currentColor` for light and dark themes.
Their individual entries in `sources.json` record the custom provenance. After editing,
update the entry's SHA-256 and run `npm run build:icons` to rebuild the shared sprite.
Illustrator exports also need the standard SVG wrapper and theme-aware fill restored;
the icon builder deliberately checks these instead of silently accepting changed sources.
The cursor artwork and its state badges are separate and retain their original drawings.

Run `npm run build:icons` to regenerate `sprite.svg`. The builder verifies the
manifest hashes and tool coverage before generating sorted symbols.
`npm run test:draw` checks that the committed sprite matches its sources.
Consumers use `iconHref(toolId)` from `tools/registry.mjs` in an SVG `<use>`
with a 24×24 viewBox. Electron E2E verifies every external symbol reference.

To recover or update sources, use `npm pack @tabler/icons@3.49.0` and extract
its `package/` directory. Copy the files identified by `sources.json` to their
local IDs without editing SVG paths. For a version upgrade, update the package
metadata, source hashes and license together, then rebuild and run the checks.

Tools are metadata until an implementation is supplied to `createToolRegistry`.
An icon in this directory does not mean that its drawing tool is implemented.
