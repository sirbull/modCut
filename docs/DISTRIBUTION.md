# Distribution

modCut is packaged as a self-contained desktop application. Every installer
includes Electron, `modcut-sidecar.jar`, a minimal Java runtime made with
`jlink`, Paper.js and all application assets. A clean end-user machine therefore
does not need Node.js, Maven, a JDK or a separately installed JRE.

The formats offered by the installed file picker are handled in-process. It does
not depend on Inkscape, pdf2svg, MuPDF or pstoedit being installed separately.

## Build locally

Install the developer prerequisites from the README, then run:

```sh
npm ci
npm test
npm run pack
npm run dist
```

`npm run pack` is the quickest packaging check. It builds an unpacked app and
then starts the packaged sidecar with the packaged Java executable. `npm run
dist` writes installers to `dist/`.

The builder creates the packages native to the build host:

| Build host | Output |
|---|---|
| macOS | DMG and ZIP |
| Windows | NSIS installer and portable EXE |
| Linux | AppImage and DEB |

## Automated packages

The `Package installers` GitHub Actions workflow builds and tests four targets:

- macOS Apple Silicon;
- macOS Intel;
- Windows x64;
- Linux x64.

It runs for packaging-related pull request changes, manual dispatches and
version tags. The resulting installers are uploaded as workflow artifacts.

## Signing and notarization

Unsigned artifacts are useful for internal testing, but macOS Gatekeeper and
Windows SmartScreen may warn users. Configure these GitHub Actions secrets for
a normal public installation experience:

| Platform | Repository secrets |
|---|---|
| macOS signing | `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` |
| macOS notarization | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| Windows signing | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` |

`MAC_CSC_LINK` and `WIN_CSC_LINK` can contain a base64-encoded certificate or a
secure URL accepted by electron-builder. Password values protect the relevant
certificate or Apple account credential. Keep every credential in GitHub
Secrets; never commit certificates or passwords.

## Release checklist

1. Run the full automated test suite.
2. Download and install every workflow artifact on a clean target machine.
3. Complete the dry-run procedure in `docs/TESTING.md`.
4. Verify the signature and, on macOS, notarization.
5. Tag the approved commit with a semantic version such as `v0.1.0`.
6. Attach the tested artifacts to the GitHub Release.

The current hardware acceptance scope is GRBL. Ruida and Epilog are visible as
future targets but are not enabled for real execution.
