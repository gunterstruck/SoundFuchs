/**
 * Wächter für den tatsächlichen Startvorrat der gebauten PWA.
 *
 * Vite schreibt Einstiegsskript, Modul-Vorladungen und Stylesheets direkt in
 * `dist/index.html`. Genau diese Dateien fordert der Browser beim Start an –
 * nicht jede Datei, die irgendwo unter `dist/assets` liegt. Der Wächter zählt
 * deshalb ausschließlich diese Verweise und ihre gzip-Größe.
 *
 * Ausgeführt wird nach `npm run build`:
 *
 *   npm run start-budget
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = join(process.cwd(), 'dist');
const html = readFileSync(join(DIST, 'index.html'), 'utf8');

const startpfade = new Set();
for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
  const pfad = match[1];
  if (!pfad.startsWith('/assets/')) continue;
  if (!/\.(?:js|css)$/.test(pfad)) continue;
  startpfade.add(pfad);
}

const dateien = [...startpfade].map((pfad) => {
  const inhalt = readFileSync(join(DIST, pfad.replace(/^\//, '')));
  return {
    name: basename(pfad),
    gzip: gzipSync(inhalt, { level: 9 }).byteLength,
  };
});

const htmlGzip = gzipSync(Buffer.from(html), { level: 9 }).byteLength;
const gesamt = htmlGzip + dateien.reduce((summe, datei) => summe + datei.gzip, 0);
const BUDGET = 410 * 1024;
const verboten = /^(?:tfjs|leaflet|vendor-qr|locale-(?:fr|es|zh))-/;
const zuFrueh = dateien.filter((datei) => verboten.test(datei.name));

console.log(`Startvorrat: ${(gesamt / 1024).toFixed(1)} KiB gzip`);
console.log(`  index.html: ${(htmlGzip / 1024).toFixed(1)} KiB`);
for (const datei of [...dateien].sort((a, b) => b.gzip - a.gzip)) {
  console.log(`  ${datei.name}: ${(datei.gzip / 1024).toFixed(1)} KiB`);
}

const befunde = [];
if (gesamt > BUDGET) {
  befunde.push(
    `Startvorrat ${(gesamt / 1024).toFixed(1)} KiB überschreitet das Budget von ${BUDGET / 1024} KiB`
  );
}
if (zuFrueh.length > 0) {
  befunde.push(`optionale Bündel werden vorgeladen: ${zuFrueh.map((d) => d.name).join(', ')}`);
}

if (befunde.length > 0) {
  console.error('\nBefunde:');
  for (const befund of befunde) console.error(`  ✗ ${befund}`);
  process.exit(1);
}

console.log('\n✓ Optionale Sprachen, Karte, QR-Scanner und YAMNet bleiben aus dem Startpfad.');
