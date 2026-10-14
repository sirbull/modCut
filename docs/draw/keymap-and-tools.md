# Draw keymap, tools and icons (D0.5)

`renderer/draw/keymap.mjs` is the source of Draw key bindings. It exports frozen
`KEYMAP` entries with `{ id, keys, when, command }`, matching/formatting helpers,
native accelerator generation, conflict checking and a transient override engine.
`tools/registry.mjs` describes all 49 tools from specification chapter 6. Each
entry has `id`, `name`, `icon`, `group`, `phase` and a `bindingId` into the keymap.
`createToolRegistry({ pen: PenTool })` adds actual classes; the default registry
has no tool implementations. Unknown ids and invalid implementations are rejected.

## Use the engine

```js
import { createKeymap, toolTooltip, acceleratorFor } from '../../renderer/draw/keymap.mjs';

const keymap = createKeymap({
  isMac: true, // supplied by the host, keeping this module independent of the DOM
  isEnabled: (entry) => availableCommands.has(entry.command),
  dispatch: (command) => runCommand(command),
  onTemporaryToolChange: (tool) => updateTransientOverride(tool),
  selectionTool: () => lastSelectionToolId,
});

keymap.keydown(event, { workspace: 'draw', editable: false, textEditing: false });
keymap.keyup(event, { workspace: 'draw', editable: false, textEditing: false });
keymap.reset(); // blur or workspace switch

const tooltip = toolTooltip('pen'); // Pen Tool (P)
const accelerator = acceleratorFor('redo', { isMac: true }); // Cmd+Shift+Z
```

Only enabled entries dispatch or prevent default. In D0.5 the app connects common
project actions (New, Import, Save, Close, tab switching and Preferences). Future
drawing tools and document actions remain reserved metadata. No tool selection
or geometry editing is simulated before the actual tool implementations exist.
The keymap contains 148 entries, including aliases and temporary overrides.

`Mod` means Cmd on macOS and Ctrl elsewhere. Extra/foreign modifiers do not match.
Single-letter tools and global actions are skipped inside editable controls or
text editing; future `draw.text-editing` entries can explicitly opt in. Composition
and AltGraph never dispatch. Repeat is allowed for nudges/Delete, not tool toggles.
The app detects inputs, selects, textareas, contenteditable ancestors and role=textbox.
The existing Cut keyboard handler remains in place.

Physical `event.code` binds punctuation and digits where keyboard layout changes
printed characters. Line uses Backslash with IntlBackslash as the documented ISO
alternative (the `<` key on Norwegian layouts). Add Anchor accepts Equal with or
without Shift; Color/Gradient accept Comma/Period with or without Shift. Display
labels and native accelerators come from the same table. Synthetic tests without
`code` fall back to `key`. `shortcutLabel()` lists physical aliases for a command.

`findConflicts()` checks exact modifiers plus physical token, including overlaps
between global and Draw contexts and between Draw and text-editing contexts.
Cut-specific bindings may reuse keys in Draw. `Mod+Shift+O` is intentionally Add
in Cut and Create Outlines in Draw: Draw's Add menu item has no accelerator or
shortcut tooltip. Native menus only expose supported actions; reserved commands
such as Create Outlines remain unavailable until their implementation arrives.

## Temporary tools

Space requests Hand, Mod requests the last selection tool, Mod+Space requests
Zoom, and Alt+Mod+Space requests Zoom out. They use `onTemporaryToolChange`, not
permanent tool dispatch. Releasing keys in any order recomputes the override;
blur, mode changes, typing and composition clear it. Eligibility goes through
`isEnabled` too. These hooks are unit-tested but do not activate unimplemented
navigation tools in the D0.5 shell.

## Icons and native integration

All 49 glyphs are unmodified Tabler Icons outline SVGs from `@tabler/icons`
3.49.0 (MIT), vendored in `renderer/draw/icons/` under the stable specification IDs.
They share a 24×24 viewBox, currentColor and 2-unit stroke. `sources.json` maps
local IDs to upstream names and hashes; the complete license is shipped beside
them and recorded in `THIRD_PARTY_NOTICES.md`. Specialized tools use the closest
library symbol, documented in the icons README, rather than custom artwork.
`scripts/build-icons.mjs` checks source hashes and builds a sorted sprite;
`--check` catches stale output. No runtime dependency or CDN is required.
The accepted CTA artwork/style is preserved.

The renderer's old Draw-only shortcut switch is replaced by the engine, and
native Draw file/preference accelerators are generated from the keymap. Cut's
menus and keyboard bindings are otherwise retained. No new shortcut is assigned
to the workspace toggle because Mod+Shift+D is reserved for Transparency Grid.
The metadata can supply the later toolbar tooltips and shortcut overview; those
UI surfaces are not added to the empty shell in this task.

## Verification and status

`npm run test:draw` checks the sprite and runs 52 tests. Ten new tests cover
conflicts, platform modifiers, physical punctuation/ISO alternative, text input,
IME/AltGraph, repeats, accelerators, temporary release order, registry entries and
all icon names in the specification. Node coverage measures 100% lines in both
the keymap and registry; future tool implementation availability is checked too.

`npm run test:e2e:draw` tests New through the actual keymap, checks Draw's native
Add accelerator, renders all 49 external SVG `<use>` references and confirms that
Cut artwork/view/layers survive switching modes. Existing geometry worker tests
remain green. The full `npm test` reaches the previously observed image-editor
crop assertion failure; no changes to crop editing are part of D0.5.
