/** Refresh the bundled metadata snapshot; no font binaries are added to the repository. */
import { writeFile } from 'node:fs/promises';
import { downloadGoogleCatalog } from '../electron/google-fonts-catalog.mjs';
const catalog=await downloadGoogleCatalog();
await writeFile(new URL('../assets/google-fonts-catalog.json',import.meta.url),JSON.stringify(catalog)+'\n');
console.log(`Google Fonts catalog: ${catalog.families.length} families at ${catalog.revision}.`);
