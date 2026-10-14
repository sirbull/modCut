# GeometryKernel (D0.4)

`renderer/draw/geom/kernel.mjs` exposes the promise-based geometry boundary.
It never imports Paper.js, accesses the DOM, or reads/mutates a DrawDocument.
The selected backend is the JS fallback from D0.3; the experimental WASM is not
loaded automatically. Browser work runs in a dedicated module Web Worker.

```js
import { createGeometryKernel } from '../../renderer/draw/geom/kernel.mjs';

const kernel = createGeometryKernel({
  onBusyChange: ({ id, method, busy }) => {
    // Future tools/status UI can track busy request ids here.
  },
});
const controller = new AbortController();
try {
  const polylines = await kernel.flatten(path, 0.001, { signal: controller.signal });
  const paths = await kernel.boolean('unite', [pathA, pathB], {
    fillRule: 'nonzero', tolerance: 0.001, signal: controller.signal,
  });
  // Only a successful result should be committed through a document Command.
} finally {
  kernel.dispose();
}
```

## Contract

All coordinates and tolerances use millimetres. `PathData` is an array of
`{ closed, segments: [{ p:[x,y], in:[dx,dy], out:[dx,dy] }] }` subpaths. Handles
are relative to their anchors. Arguments are copied when a request is made,
including while queued, and the worker only returns data. No model state travels
through the worker unless the caller explicitly passes geometry snapshots.

- `flatten(path, tolerance = 0.001, { signal } = {})` resolves to
  `[{ closed, points: [[x,y], ...] }]`. Closed contours omit a duplicated end point;
  empty subpaths remain empty. Cubics use adaptive De Casteljau subdivision,
  checking control-point distance to the chord **segment**, including collinear
  overshoot and curves whose endpoints coincide.
- `boolean('unite', paths, { tolerance = 0.001, fillRule = 'nonzero', signal } = {})`
  resolves to `PathData[]`. An empty union returns `[]`; otherwise the current
  backend returns one compound PathData containing the boundary rings, with
  zero handles. This is polygonal approximation, not exact Bézier reconstruction.
  Open contours are implicitly closed when used as filled boolean operands.
- The fill rule is `nonzero` or `evenodd`, shared by the input operands for this
  initial API. Each operand is normalized independently before union, so opposite
  winding on two filled shapes cannot cancel their overlap. Holes retain their
  topology. Per-operand mixed rules can be added when the Pathfinder adapter needs them.
- The rest of the planned API exists: `offset`, `outlineStroke`, `simplify`,
  `smooth`, `trace`, `shapeText`, `writePdf` and `writeEps`, plus other boolean
  operation names. They reject with `NOT_IMPLEMENTED`. They never return empty
  geometry as a substitute for an unsupported operation.

`kernel.backend`, initially null until the worker handshake, reports the backend
name, library/version, `approximate`, default tolerance and capabilities.
Backend selection is logged once per kernel instance, including across worker
restarts. A logger can be injected or disabled with `logger: () => {}`.
The API accepts an injected `workerFactory` for tests; Node tests use worker_threads
as a transport for the same pure dispatcher. Node-only transport code lives in tests.

## Cancellation and failure

Calls execute serially in a worker. `AbortSignal` cancels queued requests directly;
active work is interrupted by terminating the worker. Remaining queued requests
can start in a fresh worker. A stale worker's replies are ignored. There is no
attempt to synchronously execute fallback geometry on the UI thread.

Every request has a 10-second default deadline, including queue and startup time.
`onBusyChange({ id, method, busy })` fires after 50 ms if the request is still
pending, then emits `busy:false` when it ends. Observer/logger errors cannot alter
results. This hook supports the later tools/status UI; D0.4 adds no new status panel.
`timeoutMs` and `busyDelayMs` can be overridden by tests or explicit callers.

Errors have `name`, `message` and a stable `code`: `INVALID_GEOMETRY`,
`GEOMETRY_LIMIT`, `NOT_IMPLEMENTED`, `ABORTED` (`AbortError`), `TIMEOUT`
(`TimeoutError`), `WORKER_UNAVAILABLE`, `WORKER_ERROR`, `PROTOCOL_ERROR`,
`INVALID_REQUEST` or `DISPOSED`. A computation error rejects its own request;
worker crashes/protocol failures reject the pending batch. A later explicit call
can start a fresh worker. `dispose()` rejects all pending calls and prevents reuse.
No exception stacks are sent over the geometry protocol.

## Precision, bounds and dependencies

`kernel-js.mjs` is original modCut code, using the pure JS Clipper 6 port
`clipper-lib@6.4.2` for polygon union. It is not Clipper2/WASM. This is a deliberate
D0.4 fallback-skeleton choice: no transitive runtime dependencies, nonzero/evenodd
support, no bundler or DOM requirement for the worker execution path. Future
geometry work can replace it behind the same protocol.

Union first flattens at 0.001 mm by default, with configurable tolerance from
0.000001 to 0.0025 mm, then rounds to integer coordinates at 1,000,000 units/mm.
The local flatten flatness bound and integer rounding are controlled; a formal
global topology/error guarantee for every near-degenerate intersection is not
claimed. All 12 provisional union reference cases from D0.3 pass the area and
sampled-boundary comparisons. Full manually approved Pathfinder golden coverage
and curve fitting remain later work.

Coordinates and absolute control points are limited to ±1,000,000 mm. Requests
are bounded to 1,000,000 anchors/input flatten points, and subdivision depth 32.
Nonfinite, oversized or impossible inputs reject with errors rather than silently
coarsening the tolerance. Extremely large requests may still hit the worker timeout.
The module does not implement offset, tracing, writing or arbitrary Pathfinder yet.

The exact npm version is pinned in package.json and package-lock.json. Clipper's
Boost license and the embedded JSBN notice are documented in THIRD_PARTY_NOTICES.md;
full texts are retained under `docs/draw/licenses/`. The packaging allow-list includes
clipper-lib and THIRD_PARTY_NOTICES.md; the existing docs rule includes the texts.

## Verification

`npm run test:draw` tests the pure backend, the production protocol in real Node
workers, seeded document history, provisional union geometry, cancellation,
timeout, worker restart, queue handling, busy events, clone/transport failures
and disposal. The existing Draw Electron E2E workflow also runs the real module
Web Worker, verifying union, flatten, structured errors and unaffected Cut state.
Run it alone with `npm run test:e2e:draw`.
