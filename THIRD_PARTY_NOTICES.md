# Third-party notices

This file records Draw geometry, icon and text dependencies and the experimental D0.3 spike.
It is not a complete inventory of modCut's pre-existing dependencies.

## Fontkit — Draw text shaping and outlines (D2.1b)

- Source: https://github.com/foliojs/fontkit/tree/v2.0.4
- npm package: `fontkit` 2.0.4, pinned in package.json and package-lock.json.
- Author: Devon Govett. Upstream README and package.json declare the MIT license;
  the published package has no separate LICENSE file. Its original README,
  package metadata, source and distribution files are retained in the app archive.
- Used in Electron main to enumerate installed vector fonts, perform OpenType/AAT
  shaping and obtain quadratic/cubic glyph contours. No upstream UI or font assets
  are copied. Font files stay on the user's computer; projects store glyph geometry.
- Runtime dependencies are included with their original notices: @swc/helpers
  (Apache-2.0, including LICENSE), tslib (0BSD, including LICENSE.txt and
  CopyrightNotice.txt), and the MIT packages brotli, base64-js, clone, dfa,
  fast-deep-equal, restructure, tiny-inflate, unicode-properties, unicode-trie
  and pako. Exact versions and integrity hashes are recorded in package-lock.json.
- `scripts/verify-font-package.mjs` imports the service from the built app archive
  to verify that its transitive dependencies ship with the application.

## VectorCraft — development experiment only

- Source: https://github.com/storytold/vectorcraft
- Commit: `0a33cff3f6e2a1e9e672f4c3816f58cd8d3d032e`, version 0.11.0.
- Copyright 2026 ArtCraft Team and the VectorCraft contributors.
- License: MIT OR Apache-2.0, as supplied by upstream.
- Used by: `native/modcut-geom`, an optional development WASM experiment.
  This module is not loaded or distributed by the modCut application.
- Copies of upstream license texts and NOTICE are retained in
  `native/modcut-geom/licenses/`. Upstream NOTICE also describes assets used by
  upstream; that is not a claim that those assets are included in modCut.
- No upstream UI, logos, artwork or fonts were copied into modCut. The adapter
  is original code using upstream public APIs; there are zero upstream patches.

## Experiment dependencies

The bridge directly adds wasm-bindgen 0.2.105 (MIT OR Apache-2.0), serde and
serde_json (MIT OR Apache-2.0), plus the pinned VectorCraft crates. Cargo.lock
pins their resolved versions. The metadata inventory at
`docs/draw/evidence/vectorcraft-dependencies.json` records license expressions
for all 162 normal/build packages reachable on `wasm32-unknown-unknown`, excluding
the local adapter and dev-only dependency edges. It contains no missing license
expressions and no GPL/AGPL/LGPL/SSPL expressions.

The inventory is build metadata, not a redistribution license bundle. If this
experimental WASM is ever selected for distribution, collect the complete texts
and notices for its exact shipped dependency graph first. The current decision
uses the JS fallback; none of these Rust packages become app requirements.

The provisional fixture generator uses the existing Paper.js 0.12.18 dependency
(MIT, https://github.com/paperjs/paper.js). Fixtures contain original synthetic
geometry, including an original letter-shaped contour; no third-party artwork
or font outlines are copied.

## Clipper JavaScript — Draw JS fallback (D0.4)

- Package: `clipper-lib` 6.4.2, pinned exactly in package.json and package-lock.json.
- Source: https://github.com/junmer/clipper-lib
- Original library: Angus Johnson, copyright 2010–2017; JavaScript port:
  Timo Kähkönen, copyright 2012–2017.
- License: Boost Software License 1.0 (npm calls it `BSL`). The embedded JSBN
  implementation by Tom Wu has its own permission notice and disclaimer.
- Used only inside Draw's geometry worker for polygon union. This is the pure JS
  Clipper 6 port, not Clipper2/WASM. It is selected for the D0.4 fallback skeleton
  because it has no runtime dependencies, supports nonzero/evenodd compound fills
  and loads without a bundler. Curves are flattened by original modCut code.
- The distributed `node_modules/clipper-lib/clipper.js` retains its original
  copyright headers. Complete Boost and JSBN license texts are retained under
  `docs/draw/licenses/`, included through the existing docs packaging rule.
  Sources: https://www.boost.org/LICENSE_1_0.txt and
  https://github.com/andyperlitch/jsbn/blob/master/LICENSE (Tom Wu notice).
  The packaging allow-list includes clipper-lib.
- No code is copied from GPL implementations; no WASM spike binary is used.

## Tabler Icons — Draw tool icons (D0.5)

- Source: https://github.com/tabler/tabler-icons
- Package: `@tabler/icons` 3.49.0, outline SVGs only.
- Copyright (c) 2020–2026 Paweł Kuna. License: MIT.
- 49 SVG files copied without artwork changes into `renderer/draw/icons/`,
  renamed to modCut's stable icon IDs and combined into a generated sprite.
- `renderer/draw/icons/sources.json` records upstream filenames, SHA-256 hashes,
  the exact package tarball URL and npm integrity. The complete upstream license
  is preserved in `renderer/draw/icons/LICENSE.tabler.txt` and shipped through
  the existing `renderer/**/*` packaging rule.
- No runtime library, webfont or CDN is used. The user-supplied CTA icons in
  `ICONS/` are separate assets.
