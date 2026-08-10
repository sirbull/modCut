# Driver and controller support

ModCut separates a user-facing **manufacturer/model preset** from the stable
**controller driver ID**. A preset supplies convenient defaults; `driverId` is
the execution identity. This permits, for example, separate future OMTech/Ruida
and converted OMTech/GRBL profiles without treating OMTech as a protocol.

## Support matrix

| Family | LibLaserCut driver | Integrated | Automated | Physical |
|---|---:|---:|---:|---:|
| Dummy | n/a | yes | yes | n/a |
| GRBL | Grbl (validation uses ModCut transport) | yes | yes | pending full acceptance |
| Epilog Zing | EpilogZing | yes | yes | **yes** |
| Epilog Helix | EpilogHelix | yes | yes | pending |
| Ruida | Ruida | no | no | no |
| K40/M2 Nano | K40NanoDriver | no | no | no |
| Smoothieware | SmoothieBoard | no | no | no |
| Marlin | Marlin | no | no | no |
| Trocen/Leetro | not established in pinned library | no | no | no |

“Driver exists” never means ModCut exposes a real run path. An adapter needs
capability metadata, profile normalization, sidecar allow-listing and validation,
job construction/transport, fake-transport tests, documentation, and then a
separate physical verification record. Add metadata and a preset independently:
a new preset can reuse a driver without renderer changes.

The pinned LibLaserCut source defines Zing raster resolutions as 100, 200, 250,
400, 500 and 1000 DPI, and Helix as 75, 150, 200, 300, 400, 600 and 1200 DPI.
ModCut therefore uses 500 and 600 DPI respectively for vector parts. Both use
LPD port 515, native binary/grayscale raster parts and software focus from
-12.6 through +12.6 mm. An LPD completion means uploaded to the laser queue,
not physically completed; software emergency stop is unavailable after handoff.

## Identifying the Chinese laser

Before selecting a controller family, record: machine brand and exact model,
controller-board manufacturer/model/revision, software currently used, USB/
Ethernet/serial connection type, and clear photos of the controller, connectors,
labels and any display. Then compare in this order:

1. **Ruida:** identify RDC board/display and protocol; implement an isolated adapter.
2. **GRBL/FluidNC:** capture `$I`, status and settings without motion.
3. **K40/M2 Nano:** identify Nano board revision and USB identifiers.
4. **Smoothieware:** identify board and configuration file/firmware.
5. **Marlin:** identify board, firmware version and laser command dialect.
6. **Trocen/Leetro:** identify exact controller and protocol; do not assume Ruida compatibility.
