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
import { runDrawScrubWorkflows } from './draw-scrub-workflows.mjs';
import { runDrawSwatchWorkflows } from './draw-swatch-workflows.mjs';
import { runDrawPathfinderWorkflows } from './draw-pathfinder-workflows.mjs';
import { runDrawObjectWorkflows } from './draw-object-workflows.mjs';
import { runDrawCutWorkflows } from './draw-cut-workflows.mjs';
import { runDrawPlaceWorkflows } from './draw-place-workflows.mjs';
import { runDrawControlWorkflows } from './draw-control-workflows.mjs';
import { runDrawExportWorkflows } from './draw-export-workflows.mjs';
import { runDrawTextWorkflows } from './draw-text-workflows.mjs';
import { runDrawGoogleFontWorkflows } from './draw-google-font-workflows.mjs';
import { runDrawAreaTextWorkflows } from './draw-area-text-workflows.mjs';
import { runDrawPathTextWorkflows } from './draw-path-text-workflows.mjs';
import { runDrawCharacterWorkflows } from './draw-character-workflows.mjs';
import { runDrawCompoundWorkflows } from './draw-compound-workflows.mjs';
import { runDrawPathCommandWorkflows } from './draw-path-commands-workflows.mjs';
import { runDrawGradientWorkflows } from './draw-gradient-workflows.mjs';
import { runDrawToolsTwoWorkflows } from './draw-tools-two-workflows.mjs';
import { runDrawHistoryInfoWorkflows } from './draw-history-info-workflows.mjs';
import { runDrawTextOutlineWorkflows } from './draw-text-outline-workflows.mjs';
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
  } else if (process.argv.includes('--draw-google-fonts')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawGoogleFontWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-outlines')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawTextOutlineWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-tools-two')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawToolsTwoWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-history')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawHistoryInfoWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-gradient')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawGradientWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-path-commands')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawPathCommandWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-compound')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawCompoundWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-character')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawCharacterWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-path-text')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawPathTextWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-area-text')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawAreaTextWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-text')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawTextWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-export')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawExportWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-control')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawControlWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-place')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawPlaceWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-cut')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawCutWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-objects')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawObjectWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-pathfinder')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawPathfinderWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-swatches')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawSwatchWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-scrub')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawScrubWorkflows(first);first.socket.close();
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
    await runDrawScrubWorkflows(first);
    await runDrawSwatchWorkflows(first);
    await runDrawPathfinderWorkflows(first);
    await runDrawObjectWorkflows(first);
    await runDrawCutWorkflows(first);
    await runDrawPlaceWorkflows(first);
    await runDrawControlWorkflows(first);
    await runDrawExportWorkflows(first);
    await runDrawTextWorkflows(first);
    await runDrawAreaTextWorkflows(first);
    await runDrawPathTextWorkflows(first);
    await runDrawCharacterWorkflows(first);
    await runDrawCompoundWorkflows(first);
    await runDrawPathCommandWorkflows(first);
    await runDrawGradientWorkflows(first);
    await runDrawToolsTwoWorkflows(first);
    await runDrawHistoryInfoWorkflows(first);
    await runDrawTextOutlineWorkflows(first);
    const expected = await runProjectWorkflows(first, profile);
    first.socket.close();
    await stop("SIGKILL");
    await wait(500);
    // As in the Cut recovery path, retry only when the relaunched window never exposes DevTools.
    for (let attempt = 1; ; attempt++) {
      launch();
      let recovered;
      try { recovered = await connectToApp(port); }
      catch (error) {
        process.stderr.write(`Draw relaunch attempt ${attempt} failed: ${error.message}\n`);
        await stop();
        if (attempt >= 2) throw error;
        await wait(750); continue;
      }
      await verifyProjectRecovery(recovered, expected);
      recovered.socket.close();
      break;
    }
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
