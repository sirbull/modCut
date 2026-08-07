import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronPath from "electron";

import { connectToApp, wait } from "./cdp.mjs";
import { runWorkflows, verifyRecoveredSession } from "./workflows.mjs";

const port = 9400 + (process.pid % 200);
const profile = await mkdtemp(join(tmpdir(), "modcut-e2e-profile-"));
let child = null;
let output = "";

function launch() {
  const electronArgs = [".", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`];
  if (process.platform === "linux") electronArgs.push("--no-sandbox");
  const useXvfb = process.platform === "linux" && !process.env.DISPLAY;
  const command = useXvfb ? "xvfb-run" : electronPath;
  const args = useXvfb ? ["-a", electronPath, ...electronArgs] : electronArgs;
  const env = { ...process.env, MODCUT_E2E: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(command, args, {
    cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  return child;
}

async function stop(signal = "SIGTERM") {
  if (!child || child.exitCode != null) return;
  const terminate = (nextSignal) => {
    try {
      if (process.platform !== "win32") process.kill(-child.pid, nextSignal);
      else child.kill(nextSignal);
    } catch {
      child.kill(nextSignal);
    }
  };
  terminate(signal);
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    wait(3000).then(() => { if (child?.exitCode == null) terminate("SIGKILL"); }),
  ]);
}

try {
  launch();
  const first = await connectToApp(port);
  const expected = await runWorkflows(first);
  first.socket.close();
  await stop("SIGKILL");
  await wait(500);

  output = "";
  launch();
  const second = await connectToApp(port);
  await verifyRecoveredSession(second, expected);
  second.socket.close();
  process.stdout.write("PASS Electron E2E: tabs, Pen/node, scaling, save prompt, import/add, raster quality, native Close/Quit and crash recovery\n");
} catch (error) {
  process.stderr.write(output + "\n");
  throw error;
} finally {
  await stop();
  await rm(profile, { recursive: true, force: true });
}
