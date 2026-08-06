import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createRecoveryStore } from "./recovery-store.mjs";

test("recovery store atomically writes, reads and clears a session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "modcut-recovery-test-"));
  try {
    const store = createRecoveryStore(directory);
    assert.equal(await store.read(), null);
    await store.write('{"tabs":2}');
    assert.equal(await store.read(), '{"tabs":2}');
    assert.equal(await readFile(store.path, "utf8"), '{"tabs":2}');
    await store.clear();
    assert.equal(await store.read(), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
