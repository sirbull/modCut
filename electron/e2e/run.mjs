import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronPath from "electron";

import { connectToApp, wait } from "./cdp.mjs";
import { runDrawWorkflows, runDrawTabWorkflows } from "./draw-workflows.mjs";
import { runProjectWorkflows, verifyProjectRecovery } from "./project-workflows.mjs";
import { runDrawUIWorkflows } from "./draw-ui-workflows.mjs";
import { runDrawPhaseOneWorkflows } from './draw-phase1-workflows.mjs';
import { runDrawPathWorkflows } from './draw-path-workflows.mjs';
import { runDrawCornerWorkflows } from './draw-corner-workflows.mjs';
import { runDrawTransformWorkflows } from './draw-transform-workflows.mjs';
import { runDrawPanelWorkflows } from './draw-panel-workflows.mjs';
import { runDrawFeedbackWorkflows } from './draw-feedback-workflows.mjs';
import { runWorkflows, verifyRecoveredSession } from "./workflows.mjs";
import { runThemeWorkflows } from "./theme-workflows.mjs";

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
  if (process.argv.includes("--theme")) {
    await runThemeWorkflows(first, port);
    first.socket.close();
  } else if (process.argv.includes('--draw-feedback')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawFeedbackWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-panels')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawPanelWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-transforms')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawTransformWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-corners')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawCornerWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-paths')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawPathWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-tools')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawPhaseOneWorkflows(first);first.socket.close();
  } else if (process.argv.includes("--draw")) {
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt++) {
      ready = await first.evaluate("!!document.querySelector('.doc-tab.is-active') && !!window.paper?.project");
      if (!ready) await wait(100);
    }
    if (!ready) throw new Error("Draw test: project did not initialize");
    await runDrawTabWorkflows(first);
    await first.evaluate(`(() => {
      paper.project.layers[1].activate();
      const shape = new paper.Path.Rectangle(new paper.Rectangle(10, 10, 40, 30));
      shape.strokeColor = 'black'; shape.selected = true; paper.view.update();
    })()`);
    await runDrawWorkflows(first);
    await runDrawUIWorkflows(first);
    await runDrawPhaseOneWorkflows(first);
    await runDrawPathWorkflows(first);
    await runDrawCornerWorkflows(first);
    await runDrawTransformWorkflows(first);
    await runDrawPanelWorkflows(first);
    await runDrawFeedbackWorkflows(first);
    const expected = await runProjectWorkflows(first, profile);
    first.socket.close();
    await stop("SIGKILL");
    await wait(500);
    launch();
    const recovered = await connectToApp(port);
    await verifyProjectRecovery(recovered, expected);
    recovered.socket.close();
  } else {
    const expected = await runWorkflows(first, port);
    first.socket.close();
    await stop("SIGKILL");
    await wait(500);

    let recovered = false;
    let recoveryError = null;
    for (let attempt = 1; attempt <= 2 && !recovered; attempt++) {
      output = "";
      launch();
      try {
        const second = await connectToApp(port);
        await verifyRecoveredSession(second, expected);
        second.socket.close();
        recovered = true;
      } catch (error) {
        recoveryError = error;
        process.stderr.write(`Recovery verification attempt ${attempt} failed: ${error.message}\n`);
        await stop();
        if (attempt < 2) await wait(750);
      }
    }
    if (!recovered) throw recoveryError;
    process.stdout.write("PASS Electron E2E: tabs, Pen/node, scaling, save prompt, import/add, raster quality, native Close/Quit and crash recovery\n");
  }
} catch (error) {
  process.stderr.write(output + "\n");
  throw error;
} finally {
  await stop();
  await rm(profile, { recursive: true, force: true });
}
