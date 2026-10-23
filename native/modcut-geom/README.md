# modCut geometry spike (D0.3)

This is an **experimental** WASM adapter. modCut does not import it, and it is not
included in the app bundle. The evaluation selects the JS fallback for D0.4;
see [the report](../../docs/draw/spike-vectorcraft.md).

`upstream.json` pins the upstream repository/commit and toolchain. `Cargo.lock`
pins the Rust dependencies. `upstream/`, `target/`, `pkg/` and `results/` are
ignored build inputs/outputs. There are no upstream patches. The Rust adapter
is original code which calls the public APIs; license texts are in `licenses/`.
No upstream UI, branding, artwork or font files were added as tracked modCut assets.

## Reproduce

Install Rust 1.95.0 with the `wasm32-unknown-unknown` target and
`wasm-bindgen-cli` 0.2.105. These are developer tools, not app requirements.

```sh
rustup toolchain install 1.95.0 --profile minimal --target wasm32-unknown-unknown
cargo +1.95.0 install wasm-bindgen-cli --version 0.2.105 --locked
# From the modCut repository root; use the pinned toolchain for cargo:
RUSTUP_TOOLCHAIN=1.95.0 node scripts/build-wasm.mjs
node --test docs/draw/spike-fixtures.test.mjs
npm run build:sidecar
node docs/draw/measure-vectorcraft.mjs
```

`MODCUT_CARGO` and `MODCUT_WASM_BINDGEN` may point to locally installed executables.
The build script checks the upstream commit, rejects tracked upstream changes and
requires the exact bindgen version. It clones the source if needed. Network access
is needed on the first build. Run the commands shown here from the repo root; the scripts themselves resolve
build paths relative to their own location.

Measurement launches a separate Electron instance with temporary user data and
runs the WASM in a real module Web Worker. On headless Linux it requires `xvfb-run`.
The sidecar JAR must already be built. Measurements and a one-page PDF are written
to `results/`; `qpdf --check` runs if qpdf is on PATH. The Node process also parses
the PDF and its page operators with the existing pdf.js dependency.

The adapter accepts modCut-style relative handles in millimetres, with four
boolean operations (`unite`, `intersect`, `minusFront`, `exclude`), RGBA black/white
tracing up to 2 MP, and a minimal solid-path PDF scene. PDF coordinates convert
to points at the boundary. This is deliberately not the complete GeometryKernel,
full ResolvedScene support, an import API or a supported production backend.
