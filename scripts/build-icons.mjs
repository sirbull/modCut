/** Deterministic sprite from vendored Tabler and original modCut SVGs. No bundler or network. */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TOOL_DEFINITIONS } from '../renderer/draw/tools/registry.mjs';
import { PANEL_DEFINITIONS } from '../renderer/draw/panels/registry.mjs';
function build(directory, definitions) {
const names = readdirSync(directory).filter((name) => name.endsWith('.svg') && name !== 'sprite.svg').sort();
const manifest = JSON.parse(readFileSync(new URL('sources.json', directory), 'utf8'));
if (JSON.stringify(Object.keys(manifest.icons).sort()) !== JSON.stringify(names.map((name) => name.slice(0, -4)).sort())) throw new Error('Draw icon sources do not match the source manifest.');
const symbols = names.map((name) => {
  // Git's Windows checkout may use CRLF. Verify canonical source text, not platform line endings.
  const bytes = Buffer.from(readFileSync(new URL(name, directory), 'utf8').replace(/\r\n/g, '\n'));
  const provenance = manifest.icons[name.slice(0, -4)];
  if (createHash('sha256').update(bytes).digest('hex') !== provenance.sha256) throw new Error(`Modified icon source: ${name}`);
  const source = bytes.toString('utf8').trim();
  const match = source.match(/^<svg\s+([^>]+)>([\s\S]*)<\/svg>$/);
  if (!match || !match[1].includes('viewBox="0 0 24 24"') || !match[1].includes('stroke="currentColor"')) throw new Error(`Invalid Draw icon: ${name}`);
  if (/<(?:script|foreignObject|image|use)\b|\bon\w+=|(?:href|url\()/.test(match[2])) throw new Error(`Unexpected external/active content in ${name}`);
  const attrs = match[1].replace(/xmlns="[^"]+"\s*/, '');
  return `<symbol id="icon-${name.slice(0, -4)}" ${attrs}>${match[2]}</symbol>`;
});
for (const tool of definitions) if (!names.includes(`${tool.icon}.svg`)) throw new Error(`Missing icon for ${tool.id}: ${tool.icon}`);
const sprite = `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`;
const target = new URL('sprite.svg', directory);
if (process.argv.includes('--check')) {
  if (!existsSync(target) || readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== sprite) throw new Error('Draw sprite is stale. Run npm run build:icons.');
} else writeFileSync(target, sprite);
console.log(`Draw icons: ${symbols.length} symbols${process.argv.includes('--check') ? ' verified' : ` written to ${fileURLToPath(target)}`}`);
}
build(new URL('../renderer/draw/icons/', import.meta.url), TOOL_DEFINITIONS);
build(new URL('../renderer/draw/panels/icons/', import.meta.url), PANEL_DEFINITIONS);
