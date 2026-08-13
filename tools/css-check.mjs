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

const dateien = readdirSync(CSS_ORT).filter((f) => f.endsWith('.css'));
const tot = [];
let geprueft = 0;

for (const datei of dateien) {
  const css = readFileSync(join(CSS_ORT, datei), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
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
      if (fehlend.length) tot.push({ datei, selektor: einzeln, fehlend: [...new Set(fehlend)] });
    }
  }
}

console.log(`${geprueft} Selektoren geprueft in ${dateien.length} Dateien.`);
if (!tot.length) {
  console.log('✓ Kein Selektor zeigt auf einen Namen, den es nirgends gibt.');
  process.exit(0);
}
console.log(`\n✗ ${tot.length} Selektoren koennen nie greifen:\n`);
for (const t of tot)
  console.log(
    `  ${t.datei.padEnd(22)} ${t.selektor.slice(0, 58).padEnd(60)} ← ${t.fehlend.join(', ')}`
  );
console.log();
process.exit(1);
