# M1 test guide

This guide starts with a hardware-free acceptance test. Do not connect a laser
until all dry-run checks pass.

## 1. Automated checks

Install Node.js 18+ and a JDK 17+, then run:

```sh
npm install
npm test
```

Expected result: all Java unit tests, the Node/Java bridge test, SVG conversion
tests and contrast checks pass.

## 2. Dry-run acceptance test

Run `npm start` and keep **Dry run** checked.

1. Select Dummy or create a GRBL machine profile.
2. Click **Connect**. The status must read `Ready · dry run`.
3. Import a small SVG or draw a rectangle wholly inside the bed.
4. Confirm Cut power/speed and leave at least one layer enabled.
5. Click **Simulate** and inspect the complete toolpath.
6. Click **Frame**. The job should finish without a connection to hardware.
7. Click **Run dry-run**. Progress should reach 100% and report completion.

Boundary test: move part of the design outside the bed and run again. The Java
sidecar must reject the job with an out-of-bounds error.

### Raster photo acceptance test

1. Import a small color PNG or JPG. Its layer must read **Raster → Engrave**;
   Cut and Score must not be available for that raster layer.
2. Confirm that the preview contains multiple gray tones rather than only black
   and white.
3. Move Brightness, Contrast, Black point, White point and Gamma. The preview
   must update without permanently changing the source image; Reset bitmap must
   restore it.
4. Leave Raster mode at **Grayscale**, choose 4 Gray levels and run in dry-run.
   The generated job must complete and contain multiple laser-power steps, none
   above the layer's configured Power percentage.
5. Repeat with Jarvis or Floyd-Steinberg. Dither threshold should affect the
   dot pattern, while the raster still remains an Engrave operation.

## 3. GRBL preparation

Before enabling a real connection:

- use a machine with a physical emergency stop and working lid/interlocks;
- remove material or disable the laser power supply for the first motion test;
- verify the configured bed width, height and maximum feed;
- verify GRBL 1.1-compatible firmware, the correct serial port and normally
  115200 baud (or the configured TCP bridge address);
- keep a hand on the physical emergency stop.

Create or edit the machine under **Machine → Manage machines** and select the
GRBL driver. Uncheck **Dry run** only when the machine is ready.

For a laser on the local network, follow [`NETWORK.md`](NETWORK.md). A successful
connection now means the TCP endpoint returned a valid GRBL status response;
an open port by itself is not accepted.

## 4. Hardware acceptance stages

Perform these stages in order:

1. **Connection only:** click Connect and confirm that no motion starts.
2. **Frame without laser power:** disconnect the laser power supply, frame a
   10×10 mm square near the bed origin and verify direction/scale.
3. **Stop:** frame a larger rectangle and press Stop during motion. GRBL receives
   feed-hold (`!`) followed by soft reset (`0x18`); the controller will need to be
   re-homed/reconnected afterwards.
4. **Low-power mark:** reconnect laser power and use a known safe material at the
   lowest useful power. Confirm dimensions and origin.
5. **Normal test job:** use a proven material preset, ventilation and supervision.

Never leave a running laser unattended. Software Stop supplements the physical
emergency stop; it does not replace it.

## Current M1 limits

- Real execution is GRBL-only.
- The first physical run must validate controller-specific homing and axis
  orientation; modCut does not automatically issue `$H`.
- Job streaming waits for GRBL `ok` after every line for conservative flow
  control rather than maximum throughput.
- Raster workflows generate line-based G-code. Grayscale mode uses variable
  `M4 S` power; support and useful tone range must be tested on the actual GRBL
  controller, laser and material before production use.
