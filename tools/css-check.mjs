/**
 * PRUEFUNG AUF TOTE CSS-REGELN
 *
 * Meldet Regeln, deren Selektor auf kein Element zeigen kann, weil der
 * Klassen- oder ID-Name im ganzen Projekt sonst nicht vorkommt.
 *
 * Dritte Pruefung derselben Familie nach token-check und check-i18n. Alle drei
 * suchen Dinge, die still ins Leere laufen: CSS meldet weder einen falsch
 * geschriebenen Variablennamen noch eine Regel fuer ein Element, das es nicht
 * mehr gibt. Beim Entfernen des Hero-Bereichs blieben so 13 Regeln stehen; sie
 * fielen nur auf, weil ich zufaellig ueber sie stolperte.
 *
 * VORSICHT MIT DEM URTEIL
 *
 * Klassen entstehen zur Laufzeit - `el.classList.add('aktiv')`, Vorlagen wie
 * `class="status-${zustand}"`. Ein Werkzeug, das solche Namen als tot meldet,
 * ist schlimmer als keines: Man lernt, seine Meldungen zu ueberblaettern.
 *
 * Deshalb der bewusst grosszuegige Massstab: Ein Name gilt als lebendig, sobald
 * er irgendwo in HTML oder Quelltext als Wort auftaucht - auch mitten in einer
 * Zeichenkette. Gemeldet wird nur, was nirgends vorkommt. Zusammengesetzte
 * Namen bleiben dadurch unentdeckt; das ist der Preis dafuer, dass jede Meldung
 * stimmt.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CSS_ORT = 'src/styles';

// Von aussen gesetzt oder vom Browser vergeben, nie im Projekt geschrieben.
//
// Der zweite Block kommt von Leaflet. Es baut seine Bedienelemente selbst und
// vergibt dabei eigene Namen; im Quelltext dieses Projekts stehen sie nirgends,
// und trotzdem muessen wir sie ansprechen koennen - die Zoom-Bedienung sitzt
// unten rechts und muss dem Blatt ausweichen. Sie hier zu nennen ist keine
// Ausnahme vom Massstab, sondern die Angabe der fehlenden Quelle.
const VON_AUSSEN = new Set([
  'active',
  'hidden',
  'visible',
  'open',
  'closed',
  'disabled',
  'selected',
  'loading',
  'error',
  'success',
  'warning',
  'dragging',
  'expanded',
  'collapsed',
  'leaflet-top',
  'leaflet-bottom',
  'leaflet-left',
  'leaflet-right',
  'leaflet-control',
  'leaflet-popup',
]);

const quelltext = [];
(function lauf(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) {
      if (e !== 'styles') lauf(p);
    } else if (/\.(ts|js|mjs|html)$/.test(p)) quelltext.push(readFileSync(p, 'utf8'));
  }
})('src');
quelltext.push(readFileSync('index.html', 'utf8'));
const wortschatz = quelltext.join('\n');

// Namen, die der Quelltext stueckweise zusammensetzt:
//   'drift-bar-' + schwere        oder     `status-${zustand}`
// Der Rumpf davor ist ein lebendiger Praefix; alles, was damit beginnt, gilt
// als erreichbar. Ohne diese Regel meldet das Werkzeug 8 Balkenklassen des
// Drift-Panels als tot, die es taeglich benutzt.
const praefixe = [
  // Der Praefix steht am Ende der Zeichenkette, nicht zwingend am Anfang:
  //   'drift-bar drift-bar-' + schwere
  ...wortschatz.matchAll(/([a-zA-Z][\w-]*-)['"`]\s*\+/g),
  ...wortschatz.matchAll(/([a-zA-Z][\w-]*-)\$\{/g),
].map((m) => m[1]);

const lebt = (name) => {
  if (VON_AUSSEN.has(name)) return true;
  if (praefixe.some((p) => name.startsWith(p))) return true;
  const wort = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`[^\\w-]${wort}[^\\w-]`).test(wortschatz);
};

/**
 * Alle Stylesheets, auch die in Unterordnern.
 *
 * Bis zum 17.08.2026 stand hier ein flaches `readdirSync` — und seit die
 * Stamm-Dateien in `src/styles/stamm/` liegen, prüfte dieses Werkzeug den
 * größten Teil des CSS gar nicht mehr. Aufgefallen ist es beim Falsifizieren:
 * Ein absichtlich erfundener Selektor in `stamm/tiefe.css` wurde nicht
 * gemeldet. Ein Wächter, der schweigt, weil er nicht hinsieht, ist schlimmer
 * als keiner — man verlässt sich auf ihn.
 */
function alleStylesheets(ort) {
  const gefunden = [];
  for (const eintrag of readdirSync(ort)) {
    const pfad = join(ort, eintrag);
    if (statSync(pfad).isDirectory()) gefunden.push(...alleStylesheets(pfad));
    else if (eintrag.endsWith('.css')) gefunden.push(pfad);
  }
  return gefunden;
}

/**
 * Der kopierte Stamm wird berichtet, nicht erzwungen.
 *
 * `src/styles/stamm/` ist Datei für Datei unverändert aus TourFuchs übernommen
 * (§0h in docs/nutzerreise-wie-tourfuchs.md). Dort stehen Regeln für Dinge, die
 * es in SoundFuchs bewusst nicht gibt — Tourenplanung, Lasso, Simulation. Diese
 * Selektoren greifen hier nie, und das ist richtig so: Sie zu löschen hieße, den
 * Stamm zu bearbeiten, und danach könnte niemand mehr durch einen Vergleich
 * feststellen, ob er noch der Stamm ist.
 *
 * Also derselbe Maßstab wie bei `stammvergleich`: Was uns gehört, wird
 * erzwungen; was kopiert ist, wird gezählt und genannt.
 *
 * `tiefe.css` ist ausgenommen — sie ist die Grenzschicht und in diesem Haus
 * geschrieben. Sie zählt zum eigenen Bestand.
 */
const STAMM_ORT = join(CSS_ORT, 'stamm');
const istStamm = (pfad) =>
  pfad.startsWith(STAMM_ORT + '/') && !pfad.endsWith('tiefe.css');

const dateien = alleStylesheets(CSS_ORT);
const tot = [];
const stammTot = [];
let geprueft = 0;

for (const datei of dateien) {
  const css = readFileSync(datei, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const roh = m[1].trim();
    if (!roh || roh.startsWith('@') || roh.includes(':root')) continue;
    for (const einzeln of roh
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (/^(html|body|\*|from|to|\d+%)$/.test(einzeln)) continue;
      const namen = [...einzeln.matchAll(/[.#]([a-zA-Z][\w-]*)/g)].map((x) => x[1]);
      if (!namen.length) continue;
      geprueft++;
      const fehlend = namen.filter((n) => !lebt(n));
      if (!fehlend.length) continue;
      const befund = { datei, selektor: einzeln, fehlend: [...new Set(fehlend)] };
      if (istStamm(datei)) stammTot.push(befund);
      else tot.push(befund);
    }
  }
}

console.log(`${geprueft} Selektoren geprueft in ${dateien.length} Dateien.`);
if (stammTot.length) {
  // Bericht, kein Befund: TourFuchs-Regeln fuer Dinge, die SoundFuchs bewusst
  // nicht hat. Die Zahl steht da, damit sie auffaellt, wenn sie springt.
  const je = {};
  for (const t of stammTot) je[t.datei] = (je[t.datei] ?? 0) + 1;
  const liste = Object.entries(je)
    .map(([d, n]) => `${d.replace('src/styles/stamm/', '')} ${n}`)
    .join(', ');
  console.log(`· Stamm (kopiert, nicht erzwungen): ${stammTot.length} ungenutzte Selektoren — ${liste}`);
}
if (!tot.length) {
  console.log('✓ Kein eigener Selektor zeigt auf einen Namen, den es nirgends gibt.');
  process.exit(0);
}
console.log(`\n✗ ${tot.length} Selektoren koennen nie greifen:\n`);
for (const t of tot)
  console.log(
    `  ${t.datei.padEnd(30)} ${t.selektor.slice(0, 58).padEnd(60)} ← ${t.fehlend.join(', ')}`
  );
console.log();
process.exit(1);
