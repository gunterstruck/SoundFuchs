/** Kompakte WebP-Vorschauen der Guided-Agent-Screenshots. */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = resolve(ROOT, 'public/docs/screenshots');
const files = readdirSync(DIR).filter((name) => name.endsWith('.png')).sort();

for (const file of files) {
  const input = resolve(DIR, file);
  const output = resolve(DIR, file.replace(/\.png$/, '-preview.webp'));
  execFileSync('cwebp', ['-quiet', '-q', '76', '-resize', '390', '0', input, '-o', output]);
  console.log(`${file} -> ${output.split('/').pop()} (${Math.round(statSync(output).size / 1024)} KB)`);
}

console.log(`${files.length} WebP-Vorschauen erzeugt.`);
