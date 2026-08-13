/**
 * TOKEN-PRUEFUNG
 *
 * Findet CSS-Variablen, die verwendet, aber nirgends definiert werden.
 *
 * Warum das eine eigene Pruefung verdient: Ein falsch geschriebener Tokenname
 * ist in CSS kein Fehler. `background: var(--card-bg)` mit einem Token, das
 * `--bg-card` heisst, faellt still aus – die Deklaration wird ungueltig und die
 * Flaeche bleibt durchsichtig. Steht darauf weisse Schrift, ist sie unsichtbar.
 *
 * Genau das lag monatelang in der App: `--status-faulty`, `--status-critical`
 * und `--accent` wurden an 15 Stellen benutzt und nie definiert. Auf dem alten
 * dunklen Grund fiel es nicht auf, weil weisse Schrift dort ohnehin las. Erst
 * der helle Look legte es frei – als leere Kaesten.
 *
 * Ausgenommen sind Variablen, die JavaScript zur Laufzeit inline setzt; sie
 * stehen unten namentlich.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const VERZEICHNIS = 'src/styles';
// Diese setzt der Quelltext zur Laufzeit am Element selbst (style="--x: ...").
const ZUR_LAUFZEIT = new Set([
  '--bar-width',
  '--animation-delay',
  '--banner-text-x',
  '--banner-text-y',
]);

const dateien = readdirSync(VERZEICHNIS).filter((f) => f.endsWith('.css'));
const quelle = dateien.map((f) => readFileSync(join(VERZEICHNIS, f), 'utf8')).join('\n');

const definiert = new Set([...quelle.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]));

const fehlend = new Map();
for (const m of quelle.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,)?/g)) {
  const [, name, ausweich] = m;
  if (definiert.has(name) || ZUR_LAUFZEIT.has(name)) continue;
  const e = fehlend.get(name) ?? { mitAusweich: 0, ohne: 0 };
  e[ausweich ? 'mitAusweich' : 'ohne'] += 1;
  fehlend.set(name, e);
}

if (fehlend.size === 0) {
  console.log(`✓ ${definiert.size} Tokens definiert, keine unbekannten Namen.`);
  process.exit(0);
}

console.log(`\n${fehlend.size} unbekannte CSS-Variablen:\n`);
console.log(`  ${'Name'.padEnd(32)} ${'mit Ausweich'.padStart(12)} ${'ohne'.padStart(6)}`);
let hart = 0;
for (const [name, e] of [...fehlend].sort((a, b) => b[1].ohne - a[1].ohne)) {
  hart += e.ohne;
  const warnung = e.ohne ? '   <-- faellt ersatzlos aus' : '';
  console.log(
    `  ${name.padEnd(32)} ${String(e.mitAusweich).padStart(12)} ${String(e.ohne).padStart(6)}${warnung}`
  );
}
console.log(
  hart
    ? `\n✗ ${hart} Verwendungen ohne Ausweichwert. Diese Deklarationen wirken nicht.\n`
    : `\n! Alle haben einen Ausweichwert, wirken also – aber der Name stimmt nicht.\n`
);
process.exit(1);
