import { runDrawLaserPreviewWorkflows,verifyLaserPreviewPreferences } from './draw-laser-preview-workflows.mjs';
import { runDrawLaserStrokeWorkflows } from './draw-laser-stroke-workflows.mjs';
import { runDrawLaserClippingWorkflows } from './draw-laser-clipping-workflows.mjs';
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronPath from "electron";

import { connectToApp, wait } from "./cdp.mjs";
import { enterDraw } from './draw-test-helpers.mjs';
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
import { runDrawContextWorkflows } from './draw-context-workflows.mjs';
import { runDrawRulerWorkflows } from './draw-ruler-workflows.mjs';
import { runDrawCutWorkflows } from './draw-cut-workflows.mjs';
import { runDrawPlaceWorkflows } from './draw-place-workflows.mjs';
import { runDrawControlWorkflows } from './draw-control-workflows.mjs';
import { runDrawColorWorkflows } from './draw-color-workflows.mjs';
import { runDrawDocumentSettingsWorkflows } from './draw-document-settings-workflows.mjs';
import { runDrawExportWorkflows } from './draw-export-workflows.mjs';
import { runDrawMcpWorkflows } from './draw-mcp-workflows.mjs';
import { runDrawLanguageWorkflows } from './draw-language-workflows.mjs';
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
import { runDrawModeWorkflows } from './draw-modes-workflows.mjs';
import { runDrawCutTwoWorkflows } from './draw-cut-two-workflows.mjs';
import { runDrawSvgImportWorkflows } from './draw-svg-import-workflows.mjs';
import { runDrawSelectWorkflows } from './draw-select-workflows.mjs';
import { runDrawRegionToolWorkflows } from './draw-region-tools-workflows.mjs';
import { runDrawEffectWorkflows } from './draw-effects-workflows.mjs';
import { runDrawLinkWorkflows } from './draw-links-workflows.mjs';
import { runDrawWidthWorkflows } from './draw-width-workflows.mjs';
import { runDrawBlendWorkflows } from './draw-blend-workflows.mjs';
import { runDrawWarpMaskWorkflows } from './draw-warp-mask-workflows.mjs';
import { runDrawBrushWorkflows } from './draw-brush-workflows.mjs';
import { runDrawWindowWorkflows } from './draw-window-workflows.mjs';
import { runDrawPerfWorkflows } from './draw-perf-workflows.mjs';
import { runDrawTextOutlineWorkflows } from './draw-text-outline-workflows.mjs';
import { runDrawFeedbackWorkflows } from './draw-feedback-workflows.mjs';
import { runDrawPenAltWorkflows } from './draw-pen-alt-workflows.mjs';
import { runDrawArtboardUIWorkflows } from './draw-artboard-ui-workflows.mjs';
import { runWorkflows, verifyRecoveredSession } from "./workflows.mjs";
import { runThemeWorkflows } from "./theme-workflows.mjs";
import { runBackgroundWorkflows } from "./background-workflows.mjs";
import { runDrawPanelLayoutWorkflows } from './draw-panel-layout-workflows.mjs';
import { runWorkspaceLayoutWorkflows } from './workspace-layout-workflows.mjs';

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
  const stopping=child;
  if (!stopping || stopping.exitCode != null || stopping.signalCode != null) return;
  const terminate = (nextSignal) => {
    try {
      if (process.platform !== "win32") process.kill(-stopping.pid, nextSignal);
      else stopping.kill(nextSignal);
    } catch {
      stopping.kill(nextSignal);
    }
  };
  // A timeout from the old process must never terminate a newly launched app.
  await new Promise(resolve=>{
    const timer=setTimeout(()=>terminate('SIGKILL'),3000);
    stopping.once('exit',()=>{clearTimeout(timer);resolve();});
    terminate(signal);
  });
}

try {
  launch();
  const first = await connectToApp(port);
  if (process.argv.includes('--draw-panel-layout')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawPanelLayoutWorkflows(first); first.socket.close();
  } else if (process.argv.includes('--workspace-layout')) {
    await runWorkspaceLayoutWorkflows(first);
    first.socket.close();
  } else if (process.argv.includes("--background")) {
    await runBackgroundWorkflows(first, port);
    first.socket.close();
  } else if (process.argv.includes("--theme")) {
    await runThemeWorkflows(first, port);
    first.socket.close();
  } else if (process.argv.includes('--draw-artboard-ui')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawArtboardUIWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-pen-alt')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawPenAltWorkflows(first);first.socket.close();
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
  } else if (process.argv.includes('--draw-links')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawLinkWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-perf')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawPerfWorkflows(first,{report:process.argv.includes('--report'),count:Number(process.argv.find(a=>a.startsWith('--paths='))?.slice(8)??5000)});first.socket.close();
  } else if (process.argv.includes('--draw-language')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawLanguageWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-mcp')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawMcpWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-window')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawWindowWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-brush')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawBrushWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-warp-mask')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawWarpMaskWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-blend')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawBlendWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-width')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawWidthWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-effects')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawEffectWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-region-tools')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawRegionToolWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-select')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawSelectWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-svg-import')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawSvgImportWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-cut-two')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawCutTwoWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-modes')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawModeWorkflows(first);first.socket.close();
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
  } else if (process.argv.includes('--draw-document-settings')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawDocumentSettingsWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-color')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawColorWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-control')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawControlWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-place')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawPlaceWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-laser-clipping')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawLaserClippingWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-laser-strokes') || process.argv.includes('--draw-laser-paints') || process.argv.includes('--draw-laser-effects') || process.argv.includes('--draw-laser-distortions') || process.argv.includes('--draw-laser-scribble')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    const scenario=process.argv.includes('--draw-laser-paints')?'paints':process.argv.includes('--draw-laser-effects')?'effects':process.argv.includes('--draw-laser-distortions')?'distortions':process.argv.includes('--draw-laser-scribble')?'scribble':'strokes';
    await runDrawLaserStrokeWorkflows(first,{scenario});first.socket.close();
  } else if (process.argv.includes('--draw-laser-preview')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawLaserPreviewWorkflows(first);
    await first.evaluate('window.modcut.requestE2EQuit()');
    for(let i=0;i<60&&child?.exitCode==null;i++){try{await first.evaluate("document.querySelector('[data-x=discard]')?.click()");}catch{/* The renderer may close before Chromium finishes flushing storage. */}await wait(50);}
    first.socket.close();await stop();await wait(500);launch();
    const restarted=await connectToApp(port);await verifyLaserPreviewPreferences(restarted);restarted.socket.close();
  } else if (process.argv.includes('--draw-cut')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawCutWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-rulers')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawRulerWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-context')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawContextWorkflows(first);first.socket.close();
  } else if (process.argv.includes('--draw-objects')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    // This workflow clicks native menu items by their English labels.
    await first.evaluate("window.modcut.setLanguage('en')");
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
  } else if (process.argv.includes('--draw-ui')) {
    for(let attempt=0;attempt<100;attempt++) {if(await first.evaluate("!!document.querySelector('.doc-tab.is-active')"))break;await wait(100);}
    await runDrawUIWorkflows(first);first.socket.close();
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
  } else if (process.argv.includes("--draw") || process.argv.includes('--draw-recovery')) {
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt++) {
      ready = await first.evaluate("!!document.querySelector('.doc-tab.is-active') && !!window.paper?.project");
      if (!ready) await wait(100);
    }
    if (!ready) throw new Error("Draw test: project did not initialize");
    if(process.argv.includes('--draw-recovery')) {
      await enterDraw(first.evaluate);
      // The IO assertions also preserve nonempty Cut geometry, as the full suite does.
      await first.evaluate(`(() => { paper.project.layers[1].activate();
        const shape=new paper.Path.Rectangle(new paper.Rectangle(10,10,40,30));
        shape.strokeColor='black';paper.view.update(); })()`);
    }
    else {
      await runDrawTabWorkflows(first);
      await first.evaluate(`(() => {
        paper.project.layers[1].activate();
        const shape = new paper.Path.Rectangle(new paper.Rectangle(10, 10, 40, 30));
        shape.strokeColor = 'black'; shape.selected = true; paper.view.update();
      })()`);
      await runDrawWorkflows(first);
      await runDrawUIWorkflows(first);
      await runDrawArtboardUIWorkflows(first);
      await runDrawPhaseOneWorkflows(first);
      await runDrawPathWorkflows(first);
      await runDrawPenAltWorkflows(first);
      await runDrawCornerWorkflows(first);
      await runDrawTransformWorkflows(first);
      await runDrawPanelWorkflows(first);
      await runDrawFeedbackWorkflows(first);
      await runDrawScrubWorkflows(first);
      await runDrawSwatchWorkflows(first);
      await runDrawPathfinderWorkflows(first);
      await runDrawObjectWorkflows(first);
      await runDrawContextWorkflows(first);
      await runDrawRulerWorkflows(first);
      await runDrawCutWorkflows(first);
      await runDrawPlaceWorkflows(first);
      await runDrawControlWorkflows(first);
      await runDrawColorWorkflows(first);
      await runDrawDocumentSettingsWorkflows(first);
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
      await runDrawModeWorkflows(first);
      await runDrawCutTwoWorkflows(first);
      await runDrawSvgImportWorkflows(first);
      await runDrawSelectWorkflows(first);
      await runDrawRegionToolWorkflows(first);
      await runDrawEffectWorkflows(first);
      await runDrawLinkWorkflows(first);
      await runDrawWidthWorkflows(first);
      await runDrawBlendWorkflows(first);
      await runDrawWarpMaskWorkflows(first);
      await runDrawBrushWorkflows(first);
      await runDrawWindowWorkflows(first);
      await runDrawPanelLayoutWorkflows(first);
      await runDrawMcpWorkflows(first);
      await runDrawLanguageWorkflows(first);
      await runDrawPerfWorkflows(first);
      await runDrawTextOutlineWorkflows(first);
    }
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
      await runDrawLaserPreviewWorkflows(recovered);
      await runDrawLaserStrokeWorkflows(recovered);
      await runDrawLaserStrokeWorkflows(recovered,{scenario:'paints'});
      await runDrawLaserStrokeWorkflows(recovered,{scenario:'effects'});
      await runDrawLaserStrokeWorkflows(recovered,{scenario:'distortions'});
      await runDrawLaserStrokeWorkflows(recovered,{scenario:'scribble'});
      await runDrawLaserClippingWorkflows(recovered);
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
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
