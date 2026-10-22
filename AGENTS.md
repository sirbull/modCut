# Agent notes

## E2E windows

E2E runs (`node electron/e2e/run.mjs ...`) open the app window invisible: transparent,
click-through and unfocused, but on the taskbar. Click it there to watch a run. The page
renders exactly as a visible window does, so screenshots and assertions are unaffected.

- Background (default): leave `MODCUT_E2E_FOREGROUND` unset.
- Foreground, the window comes up front and takes focus: `MODCUT_E2E_FOREGROUND=1`.

Do not minimize or move E2E windows off-screen instead: Chromium stops painting them,
so screenshots time out and media-query events never arrive.

Start child processes with `windowsHide: true` so no console windows pop up on Windows.
