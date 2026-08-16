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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const VERZEICHNIS = 'src/styles';
// Diese setzt der Quelltext zur Laufzeit am Element selbst (style="--x: ...").
const ZUR_LAUFZEIT = new Set([
  '--bar-width',
  '--animation-delay',
  // Am Marker und am Stapel gesetzt, aus `standortmarker.ts` heraus.
  '--marker-color',
  '--stack-color',
  '--stack-accent',
  // Die Schale rechnet sie beim Ziehen und beim Messen aus und schreibt sie
  // an <html> (`setSheetHeight`, `topnavMasse` in stamm/ui/schale.ts). Im CSS
  // stehen sie deshalb nirgends — sie sind der Ort, an dem JavaScript und
  // Gestaltung sich treffen.
  '--sheet-height',
  '--mobile-topnav-bottom',
  // Aus dem Stamm, gesetzt von Funktionen, die hier fachlich entfallen sind
  // (Routenanimation, Wischgeste). Ihre Regeln stehen mit Ausweichwert im
  // übernommenen CSS und fallen damit auf den Ruhezustand zurück.
  '--route-step',
  '--swipe-x',
]);

/**
 * Unverändert aus dem Stamm geerbt.
 *
 * `--color-surface-muted` ist auch in TourFuchs nirgends definiert — dort
 * genauso, an derselben Zeile (`components.css:2470`). Es wirkt trotzdem,
 * weil ein Ausweichwert danebensteht.
 *
 * Es gehört hierher und nicht in die Datei: Sobald man eine Stamm-Datei
 * anfasst, kann niemand mehr durch einen Vergleich feststellen, ob der Stamm
 * noch der Stamm ist (§0h). Ein geerbter Schönheitsfehler mit Ausweichwert ist
 * der geringere Preis. Sollte TourFuchs ihn eines Tages beheben, kommt die
 * Behebung beim nächsten Abgleich von selbst mit — und diese Zeile hier fällt
 * dann als überflüssig auf.
 */
const AUS_DEM_STAMM = new Set(['--color-surface-muted']);

/**
 * Auch in Unterordner schauen.
 *
 * Bis zum 16.08.2026 las diese Prüfung nur die oberste Ebene. Das ging gut,
 * solange dort alles lag. Seit der Stamm in `src/styles/stamm/` steht, liegen
 * dort aber die meisten Token — und die Prüfung meldete `--color-primary` als
 * unbekannt, obwohl `stamm/variables.css` ihn zwei Ordner tiefer definiert.
 *
 * Ein Werkzeug, das eine richtige Datei für falsch erklärt, ist schlimmer als
 * keines: Man lernt, seine Meldungen zu überblättern, und übersieht dann die
 * echte.
 */
function alleCss(ort) {
  return readdirSync(ort).flatMap((eintrag) => {
    const pfad = join(ort, eintrag);
    if (statSync(pfad).isDirectory()) return alleCss(pfad);
    return pfad.endsWith('.css') ? [pfad] : [];
  });
}

const dateien = alleCss(VERZEICHNIS);
const quelle = dateien.map((f) => readFileSync(f, 'utf8')).join('\n');

const definiert = new Set([...quelle.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]));

const fehlend = new Map();
for (const m of quelle.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,)?/g)) {
  const [, name, ausweich] = m;
  if (definiert.has(name) || ZUR_LAUFZEIT.has(name) || AUS_DEM_STAMM.has(name)) continue;
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
