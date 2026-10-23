# Draw test fixtures

`node-kernel-worker.mjs` is a test-only worker_threads transport for the production
`handleRequest` dispatcher. Browser coverage uses the actual module worker through
the existing Electron Draw E2E workflow.

`kernel-golden.test.mjs` reads the 12 union cases from
`docs/draw/vectorcraft-fixtures.json`. They are original synthetic millimetre
geometry generated with Paper.js as a provisional independent oracle. Provenance
and regeneration commands are in `docs/draw/evidence/README.md`; the fixtures
are unchanged from D0.3. They have not been manually approved as the final
Pathfinder golden corpus. Paper.js is imported only by the independent test
comparator, never by `geom/` production code.
