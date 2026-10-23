/** Local D0.3 runner: real Electron Web Worker, independent oracle, pdf.js verification. */
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, platform, release, tmpdir, arch } from 'node:os';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import electron from 'electron';
import { connectToApp, wait } from '../../electron/e2e/cdp.mjs';
import { compare } from './spike-fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const crate = join(root, 'native/modcut-geom');
const resultDir = join(crate, 'results');
await mkdir(resultDir, { recursive: true });
const pin = JSON.parse(await readFile(join(crate, 'upstream.json'), 'utf8'));
const fixtures = JSON.parse(await readFile(new URL('./vectorcraft-fixtures.json', import.meta.url), 'utf8'));
const bytes = await readFile(join(crate, 'pkg/modcut_geom_bg.wasm'));
const module = await WebAssembly.compile(bytes);
const profile = await mkdtemp(join(tmpdir(), 'modcut-spike-'));
const port = 9600 + process.pid % 200;
const env = { ...process.env, MODCUT_E2E: '1' }; delete env.ELECTRON_RUN_AS_NODE;
const args = ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`];
if (platform() === 'linux') args.push('--no-sandbox');
const useXvfb = platform() === 'linux' && !process.env.DISPLAY;
const child = spawn(useXvfb ? 'xvfb-run' : electron, useXvfb ? ['-a', electron, ...args] : args,
  { cwd: root, env, detached: platform() !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
let client, output = '';
child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { output += chunk; });
try {
  client = await connectToApp(port);
  await client.evaluate(`window.__spikeResult = null; window.__spikeError = null;
    window.__spikeWorker = new Worker(new URL('../docs/draw/spike-browser-worker.mjs', location.href), {type:'module'});
    window.__spikeWorker.onerror = (event) => { window.__spikeError = event.message; };
    window.__spikeWorker.onmessage = ({data}) => { window.__spikeResult = data; };
    window.__spikeWorker.postMessage(${JSON.stringify(fixtures)});`);
  let done = false;
  for (let i = 0; i < 600 && !done; i++) {
    const status = await client.evaluate('({done:!!window.__spikeResult,error:window.__spikeError})');
    if (status.error) throw new Error(status.error);
    done = status.done;
    if (!done) await wait(100);
  }
  if (!done) throw new Error('WASM worker timed out after 60 seconds');
  const measured = await client.evaluate(`(() => { const result=window.__spikeResult;
    if (!result.ok) return result;
    return {...result,pdf:Array.from(result.pdf),versions:{chrome:navigator.userAgent}}; })()`);
  if (!measured.ok) throw new Error(measured.error);
  const pdf = Uint8Array.from(measured.pdf); delete measured.pdf;
  const pdfPath = join(resultDir, 'vectorcraft-spike.pdf'); await writeFile(pdfPath, pdf);
  measured.booleans = measured.booleans.map((item, i) => {
    const { output: actual, ...timing } = item;
    return { ...timing, ...compare(fixtures.cases[i].expected, actual) };
  });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: pdf.slice(), useSystemFonts: false, isEvalSupported: false }).promise;
  const page = await document.getPage(1), operators = await page.getOperatorList();
  const pdfCheck = { bytes: pdf.length, pages: document.numPages, pageSizePt: page.view.slice(2), operators: operators.fnArray.length };
  await document.destroy();
  const qpdf = spawnSync('qpdf', ['--check', pdfPath], { encoding: 'utf8' });
  pdfCheck.qpdf = qpdf.error?.code === 'ENOENT' ? { status: 'not-installed' } : { status: qpdf.status === 0 ? 'pass' : 'fail', exitCode: qpdf.status };
  const metrics = { upstream: pin, host: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, node: process.version },
    wasm: { bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex'), imports: WebAssembly.Module.imports(module) },
    ...measured, pdf: pdfCheck, upstreamChangedLines: 0, ciPlatformsExecuted: [],
    limitations: ['Paper.js oracle is provisional; references not manually approved', 'Hausdorff distance is sampled at <=0.05 mm, not a certified continuous bound', 'Acrobat, Preview and Illustrator not manually verified', 'Cross-platform CI has not been executed'] };
  await writeFile(join(resultDir, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  console.log(JSON.stringify({ wasm: metrics.wasm, booleanCases: metrics.booleans.length,
    booleanPassed: metrics.booleans.filter((c) => c.pass).length,
    maxBooleanMedianMs: Math.max(...metrics.booleans.map((c) => c.medianMs)), traces: metrics.traces, pdf: metrics.pdf }, null, 2));
} catch (error) {
  process.stderr.write(output); throw error;
} finally {
  client?.socket.close();
  try { if (platform() !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill(); } catch { /* exited */ }
  await new Promise((resolve) => { if (child.exitCode !== null || child.signalCode !== null) resolve(); else child.once('exit', resolve); });
  await rm(profile, { recursive: true, force: true });
}
