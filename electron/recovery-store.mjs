import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function createRecoveryStore(directory, io = { mkdir, readFile, rename, unlink, writeFile }) {
  const path = join(directory, "session-recovery-v1.json");
  const temporaryPath = path + ".tmp";

  return {
    path,
    async read() {
      try {
        return await io.readFile(path, "utf8");
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    },
    async write(json) {
      await io.mkdir(directory, { recursive: true });
      await io.writeFile(temporaryPath, String(json), "utf8");
      await io.rename(temporaryPath, path);
      return true;
    },
    async clear() {
      for (const target of [temporaryPath, path]) {
        try {
          await io.unlink(target);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      return true;
    },
  };
}
