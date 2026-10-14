// D0.3 reproducible experiment. Outputs stay outside the renderer until D0.4 chooses a backend.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crate = join(root, 'native', 'modcut-geom');
const pin = JSON.parse(readFileSync(join(crate, 'upstream.json'), 'utf8'));
const source = join(crate, 'upstream');
const cargo = process.env.MODCUT_CARGO || 'cargo';
const bindgen = process.env.MODCUT_WASM_BINDGEN || 'wasm-bindgen';
function run(command, args, cwd = crate) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) throw new Error(`${command}: ${result.error.message}. Install Rust ${pin.rust}, wasm32-unknown-unknown and wasm-bindgen-cli ${pin.wasmBindgen}.`);
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
if (!existsSync(join(source, '.git'))) {
  run('git', ['init', source]);
  run('git', ['remote', 'add', 'origin', pin.repository], source);
  run('git', ['fetch', '--depth', '1', 'origin', pin.commit], source);
  run('git', ['checkout', '--detach', 'FETCH_HEAD'], source);
}
if (run('git', ['rev-parse', 'HEAD'], source) !== pin.commit) throw new Error('VectorCraft checkout does not match upstream.json');
if (run('git', ['status', '--porcelain', '--untracked-files=no'], source)) throw new Error('VectorCraft checkout has local edits; spike requires unmodified upstream');
const bindgenVersion = run(bindgen, ['--version']);
if (bindgenVersion !== `wasm-bindgen ${pin.wasmBindgen}`) throw new Error(`Expected wasm-bindgen ${pin.wasmBindgen}, got ${bindgenVersion}`);
console.log(`Building VectorCraft ${pin.commit} using ${run(cargo, ['--version'])}`);
run(cargo, ['build', '--locked', '--target', 'wasm32-unknown-unknown', '--release']);
run(bindgen, ['--target', 'web', '--out-dir', 'pkg', '--no-typescript', 'target/wasm32-unknown-unknown/release/modcut_geom.wasm']);
console.log('WASM spike built: native/modcut-geom/pkg/modcut_geom_bg.wasm');
