/**
 * UEBERSETZUNGS-PRUEFUNG
 *
 * Prueft zweierlei:
 *   1. Wird ein Schluessel verwendet, den es nicht gibt?
 *   2. Fehlt einer Sprache ein Schluessel, den Deutsch hat?
 *
 * Warum das noetig ist: t() gibt bei fehlendem Schluessel den Schluessel selbst
 * zurueck. In der Oberflaeche steht dann woertlich "buttons.ok" statt "OK" –
 * sichtbar, aber von keinem Test bemerkt. Beim Aufraeumen am 13.08.2026 waren
 * es 28 solcher Stellen, eine davon durch das Umbenennen von Zanobo auf
 * SoundFuchs neu entstanden: Der Schluessel hiess in den Sprachdateien
 * plotzlich anders als im Quelltext.
 *
 * Die Sprachdateien werden ausgewertet, nicht gelesen – ein Textmuster
 * verzaehlt sich an verschachtelten Objekten.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SPRACHEN = ['de', 'en', 'es', 'fr', 'zh'];
const ablage = mkdtempSync(join(tmpdir(), 'i18n-'));

const flach = (o, p = '') =>
  Object.entries(o ?? {}).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flach(v, `${p}${k}.`) : [`${p}${k}`]
  );

const vorhanden = {};
for (const s of SPRACHEN) {
  const r = await build({
    entryPoints: [`src/i18n/locales/${s}.ts`],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'node',
  });
  const datei = join(ablage, `${s}.mjs`);
  writeFileSync(datei, r.outputFiles[0].text);
  const mod = await import(datei);
  vorhanden[s] = new Set(flach(mod.default ?? Object.values(mod)[0]));
}

// Verwendung einsammeln. Der Doc-Kommentar in i18n/index.ts nennt Beispiele,
// die absichtlich nicht existieren – die Datei bleibt daher aussen vor.
const dateien = [];
(function lauf(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) lauf(p);
    else if (p.endsWith('.ts') && !p.includes('locales') && !p.endsWith('i18n/index.ts'))
      dateien.push(p);
  }
})('src');

const quelle = dateien.map((f) => readFileSync(f, 'utf8')).join('\n');
const html = readFileSync('index.html', 'utf8');
const benutzt = new Set([
  ...[...html.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)].map((m) => m[1]),
  ...[...quelle.matchAll(/\bt\(\s*['"]([a-zA-Z][\w.]*)['"]/g)].map((m) => m[1]),
]);

const fehlend = [...benutzt].filter((k) => !vorhanden.de.has(k)).sort();
const luecken = SPRACHEN.filter((s) => s !== 'de')
  .map((s) => [s, [...vorhanden.de].filter((k) => !vorhanden[s].has(k))])
  .filter(([, f]) => f.length);

console.log(`${vorhanden.de.size} Schluessel je Sprache, ${benutzt.size} verwendet.`);

if (!fehlend.length && !luecken.length) {
  console.log('✓ Keine unbekannten Schluessel, keine Luecken zwischen den Sprachen.');
  process.exit(0);
}

if (fehlend.length) {
  console.log(`\n✗ ${fehlend.length} verwendete Schluessel gibt es nicht.`);
  console.log('  In der Oberflaeche erscheint dann der Schluessel selbst:');
  fehlend.forEach((k) => console.log(`    ${k}`));
}
for (const [s, f] of luecken) {
  console.log(`\n✗ ${s}: ${f.length} Schluessel fehlen gegenueber Deutsch`);
  f.slice(0, 10).forEach((k) => console.log(`    ${k}`));
}
console.log();
process.exit(1);
