// Dev helper: launches modCut, opens Draw with a sample document and saves a PNG.
// Usage: node electron/e2e/draw-screenshot.mjs <out.png> [script.js]
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import electronPath from 'electron';
import { connectToApp, inputHelpers, wait } from './cdp.mjs';
import { activeDraw, submitNewDrawDialog, enterDraw } from './draw-test-helpers.mjs';

const [out = 'draw.png', extra] = process.argv.slice(2);
const port = 9600 + (process.pid % 200);
const profile = await mkdtemp(join(tmpdir(), 'modcut-shot-'));
const args = ['-a', '-s', '-screen 0 1600x1000x24', electronPath, '.', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-sandbox'];
const env = { ...process.env, MODCUT_E2E: '1' }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn('xvfb-run', args, { env, stdio: 'ignore', detached: true });
try {
  const client = await connectToApp(port);
  const { evaluate, command } = client, { drag } = inputHelpers(client);
  for (let i = 0; i < 100 && !(await evaluate("!!document.querySelector('.doc-tab.is-active')")); i++) await wait(100);
  await command('Emulation.setDeviceMetricsOverride', { width: 1500, height: 920, deviceScaleFactor: 1, mobile: false });
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'Shot' });
  await wait(300);
  const screen = p => evaluate(`(async()=>{const w=${activeDraw},p=w.scope.view.projectToView(new w.scope.Point(${p})),b=w.scope.view.element.getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y}})()`);
  await evaluate(`(async()=>(${activeDraw}.setTool('rectangle')))()`);
  await drag(await screen([10, 10]), await screen([50, 40]));
  await evaluate(`(async()=>(${activeDraw}.setTool('ellipse')))()`);
  await drag(await screen([60, 20]), await screen([100, 60]));
  if (extra) await evaluate(await readFile(extra, 'utf8'));
  await wait(400);
  const shot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(out, Buffer.from(shot.data, 'base64'));
  client.socket.close();
} finally { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
process.exit(0);
