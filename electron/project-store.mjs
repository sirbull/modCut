import { writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/** Replace only after the complete project has been written beside its destination. */
export async function writeProject(path, json, io = { writeFile, rename, unlink }) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await io.writeFile(temporaryPath, json, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await io.rename(temporaryPath, path);
  } finally {
    try { await io.unlink(temporaryPath); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  return path;
}
