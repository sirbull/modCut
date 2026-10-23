import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function createRecoveryStore(directory, io = { mkdir, readFile, rename, unlink, writeFile }) {
  const path = join(directory, "session-recovery-v1.json");
  const temporaryPath = path + ".tmp";
  // IPC writes can overlap. Keep the shared temporary file and clear operation ordered.
  let pending = Promise.resolve();
  function enqueue(operation) {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  }

  return {
    path,
    async read() {
      await pending;
      try {
        return await io.readFile(path, "utf8");
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    },
    write(json) { return enqueue(async () => {
      await io.mkdir(directory, { recursive: true });
      await io.writeFile(temporaryPath, String(json), "utf8");
      await io.rename(temporaryPath, path);
      return true;
    }); },
    clear() { return enqueue(async () => {
      for (const target of [temporaryPath, path]) {
        try {
          await io.unlink(target);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      return true;
    }); },
  };
}
