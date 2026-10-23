/** Copy Tabler outline icons from an extracted @tabler/icons package into a Draw icon folder and record provenance.
 * Usage: node scripts/vendor-tabler-icons.mjs <extracted-package-dir> <renderer/draw/.../icons> name [name...] */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const [packageDir, target, ...names] = process.argv.slice(2);
if (!packageDir || !target || !names.length) throw new Error('Usage: vendor-tabler-icons.mjs <package-dir> <icons-dir> name...');
const version = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')).version;
const manifestPath = join(target, 'sources.json'), manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== version) throw new Error(`Manifest pins @tabler/icons ${manifest.version}, package is ${version}.`);
for (const name of names) {
  const path = `icons/outline/${name}.svg`, text = readFileSync(join(packageDir, path), 'utf8').replace(/\r\n/g, '\n');
  writeFileSync(join(target, `${name}.svg`), text);
  manifest.icons[name] = { name, path, sha256: createHash('sha256').update(text).digest('hex') };
}
manifest.icons = Object.fromEntries(Object.entries(manifest.icons).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Vendored ${names.length} Tabler icon(s) into ${target}`);
