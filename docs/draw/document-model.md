# Draw document API (D0.2)

The document model uses millimetres and versioned, plain JSON. It runs in Node
and the renderer without Paper.js, canvas, DOM APIs or external dependencies.
Node types are `layer`, `group`, `path`, `shape`, `text`, `image`, `trace`, `blend`
and `compoundPath`. Defaults describe future node types; rendering and editing
those types are delivered by the later tasks in `DRAW_WORKSPACE.md`.

## Create and edit

```js
import { DrawDocument } from '../../renderer/draw/doc/document.mjs';
import { createNode } from '../../renderer/draw/doc/schema.mjs';
import { History } from '../../renderer/draw/doc/history.mjs';
import { insertNode, updateNode } from '../../renderer/draw/doc/commands.mjs';

const doc = new DrawDocument();
const history = new History(doc);
const layerId = doc.data.layers[0].id;
const shape = createNode('shape', { shape: 'rect', params: { width: 40, height: 20 } });
history.transaction('Create rectangle', () => {
  history.execute(insertNode(layerId, shape));
  history.execute(updateNode(shape.id, { name: 'Logo background' }));
});
history.undo();
history.redo();
```

`doc.data`, `getNode`, `locate`, `getArtboard`, `ancestors` and `descendants`
expose frozen data. `toJSON()` returns a detached copy; `serialize()` returns JSON.
The `_edit` and `_restore` methods are internal command/history boundaries. UI,
tools and adapters must never call them. Commands are synchronous; expensive
geometry work must finish before a command is created.

`insertNode` accepts a container id or `null` for a top-level layer. `moveNode`
preserves ids and prevents cycles. Its index means the destination position
**after removal**; an omitted index appends. `removeNode` removes a subtree.
`updateNode` changes properties; identity, type and child arrays require structural
commands. Locked/hidden ancestors prevent geometry edits; Layers can still update
`locked` and `visible`. `insertArtboard`, `updateArtboard`, `removeArtboard` and
`updateDocument` cover document-level edits. At least one artboard must remain.
Referenced objects/assets must remain valid after each command.

Node transforms have six coefficients. Path transforms must remain the identity
matrix: future transform tools bake transformations into anchors. The model
rejects nonfinite coordinates, invalid opacity, negative dimensions, duplicate
ids, broken topology, invalid image/trace references and missing embedded assets.
It validates the current data contract, without implementing future geometry,
text shaping, appearance effects or asset decoding.

## History and changes

`execute`, `undo` and `redo` operate atomically. A failed command leaves the model
and history unchanged. Nested `transaction(label, fn)` calls become one undo step;
failure restores the transaction's initial document. Undo, redo, clear and marking
saved are disallowed inside a transaction. No-op transactions create no entry.

`updateNode(id, properties, { label, mergeKey })` opts into coalescing consecutive
edits with matching patch paths and merge keys. Marking a document saved creates
a merge boundary. `markSaved()` records the current clean state; `dirty` follows
undo/redo and branching. `clear()` discards undo/redo without pretending to save.

`history.subscribe(({ nodeIds, dirty }) => ...)` returns an unsubscribe function.
One notification is sent per transaction, execute, undo or redo; observer errors
cannot undo a successful edit. Empty `nodeIds` indicates a document-level change.
`entries`, `undoLabel`, `redoLabel`, `canUndo` and `canRedo` support future panels.
Preview drags should stay outside the document and execute one command on release.

## Loading and transient selection

`loadDocument(jsonOrObject)` returns `{ document, safeMode, report, source }`.
It restores missing defaults and reports each repair. Invalid geometry/subtrees
are quarantined; safe mode exposes a read-only valid document and retains the
original source for inspection. Unknown schema versions, cycles and non-JSON
values are rejected. Unversioned draft documents are treated as version 1.
This loader is for Draw JSON; `.modcut` v4 integration belongs to D0.6.

`Selection(doc)` stores object ids and `{ nodeId, subpath, segment }` anchor
references outside saved JSON. It filters missing, locked or hidden nodes and
invalid anchors, and supports `save(name)`, `restore(name)`, `deleteSaved(name)`
and `savedNames`. Selection changes are transient and do not dirty the document.

## Verification

Run `npm run test:draw` for model tests and coverage. The fixed-seed property test
executes 1,000 mixed commands, then checks each serialized intermediate state while
undoing and redoing the entire history. `npm test` includes the Draw tests.
