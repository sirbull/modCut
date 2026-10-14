import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { writeProject } from './project-store.mjs';

test('project replacement is atomic and failed writes keep the old project intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modcut-project-'));
  const path = join(directory, 'project.modcut');
  try {
    await writeProject(path, 'old');
    await assert.rejects(writeProject(path, 'new', {
      writeFile, unlink,
      rename: async () => { throw new Error('disk failure'); },
    }), /disk failure/);
    assert.equal(await readFile(path, 'utf8'), 'old');
    assert.deepEqual(await readdir(directory), ['project.modcut']);
    await assert.rejects(writeProject(path, 'partial', {
      rename, unlink,
      writeFile: async (temporary) => { await writeFile(temporary, 'partial'); throw new Error('disk full'); },
    }), /disk full/);
    assert.equal(await readFile(path, 'utf8'), 'old');
    assert.deepEqual(await readdir(directory), ['project.modcut']);
    assert.equal(await writeProject(path, 'complete'), path);
    assert.equal(await readFile(path, 'utf8'), 'complete');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
