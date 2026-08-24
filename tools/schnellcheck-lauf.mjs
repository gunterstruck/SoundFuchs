/**
 * DER SCHNELLCHECK-LAUF — geht es auch ohne Maschine?
 *
 * Der Auftraggeber hat entschieden: Wer ein Geräusch mitbringt und noch keine
 * Maschine hat, bekommt eine von der App. Gemessen wird deshalb nicht, ob ein
 * Knopf da ist, sondern ob am Ende
 *
 *   1. ein Standort in der Ablage steht, den man WIEDERFINDET,
 *   2. eine Maschine darin, die nach der Datei heißt,
 *   3. der mitgebrachte Ton wirklich im Analyseblatt liegt,
 *   4. und der Reiter „Standorte" ihn zeigt — er ist der einzige Weg zurück,
 *      denn ein Standort ohne Postleitzahl hat keinen Punkt auf der Karte.
 *
 * Punkt 4 ist der wichtigste. Ohne ihn legte der Schnellcheck etwas an, das
 * niemand je wiedersieht — das Gegenteil von „heute filmen und in vier Wochen
 * vergleichen".
 *
 * Ausgeführt gegen `dist/` — also vorher `npm run build`.
 *
 *   npm run schnellcheck
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  /**
   * Playwright ist exakt im Lockfile gepinnt. Fehlt das Paket trotzdem, ist
   * die Arbeitskopie nicht vollständig installiert; der Browser selbst wird
   * separat mit `playwright install chromium` bereitgestellt.
   */
  console.error('Playwright fehlt. Bitte zuerst `npm ci` ausführen.');
  process.exit(1);
}
/**
 * Die Prüfdatei — mit einem Namen, der etwas zu tun gibt.
 *
 * `Motor_2.5 Liter.wav`: Unterstrich (wird ein Leerzeichen), ein Punkt mitten
 * im Namen (ist KEINE Endung) und eine echte Endung am Schluss. Ein Name wie
 * `ton.wav` hätte nichts gemessen.
 */
function schreibePruefton(pfad) {
  const rate = 16000;
  const sekunden = 12;
  const bilder = rate * sekunden;
  const daten = Buffer.alloc(bilder * 2);
  let keim = 4711;
  const wuerfel = () => {
    keim = (keim * 1103515245 + 12345) & 0x7fffffff;
    return keim / 0x3fffffff - 1;
  };
  for (let i = 0; i < bilder; i += 1) {
    const t = i / rate;
    const wert = 0.55 * Math.sin(2 * Math.PI * 190 * t) + 0.45 * wuerfel();
    daten.writeInt16LE(Math.round(0.25 * 32767 * wert), i * 2);
  }
  const kopf = Buffer.alloc(44);
  kopf.write('RIFF', 0);
  kopf.writeUInt32LE(36 + daten.length, 4);
  kopf.write('WAVEfmt ', 8);
  kopf.writeUInt32LE(16, 16);
  kopf.writeUInt16LE(1, 20);
  kopf.writeUInt16LE(1, 22);
  kopf.writeUInt32LE(rate, 24);
  kopf.writeUInt32LE(rate * 2, 28);
  kopf.writeUInt16LE(2, 32);
  kopf.writeUInt16LE(16, 34);
  kopf.write('data', 36);
  kopf.writeUInt32LE(daten.length, 40);
  writeFileSync(pfad, Buffer.concat([kopf, daten]));
}

const arbeitsordner = mkdtempSync(join(tmpdir(), 'schnellcheck-'));
const WAV = join(arbeitsordner, 'Motor_2.5 Liter.wav');
const ERWARTETER_NAME = 'Motor 2.5 Liter';
schreibePruefton(WAV);

const befunde = [];
const pruefe = (bedingung, text) => {
  console.log(`${bedingung ? '✓' : '✗'} ${text}`);
  if (!bedingung) befunde.push(text);
};

const port = await new Promise((res) => {
  const s = createServer();
  s.listen(0, () => {
    const { port } = s.address();
    s.close(() => res(port));
  });
});
const vorschau = spawn(
  'npx',
  ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
  { stdio: 'ignore' }
);
await new Promise((r) => setTimeout(r, 4000));

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: 'de-DE',
  });
  const page = await ctx.newPage();
  const seitenfehler = [];
  page.on('pageerror', (e) => seitenfehler.push(e.message));
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  /** Was in der Ablage steht — gelesen aus der Datenbank der Seite selbst. */
  const ablage = () =>
    page.evaluate(
      () =>
        new Promise((fertig) => {
          const anfrage = indexedDB.open('zanobot-db');
          anfrage.onerror = () => fertig({ ok: false });
          anfrage.onsuccess = () => {
            const db = anfrage.result;
            const tx = db.transaction(['customers', 'machines'], 'readonly');
            const k = tx.objectStore('customers').getAll();
            const m = tx.objectStore('machines').getAll();
            tx.oncomplete = () => {
              const standort = (k.result ?? []).find((x) => x.id === 'SF-SCHNELLCHECK');
              fertig({
                ok: true,
                standorte: (k.result ?? []).length,
                standort: standort
                  ? { name: standort.name, geo: standort.geo, plz: standort.plz }
                  : null,
                maschinen: (m.result ?? [])
                  .filter((x) => x.customerId === 'SF-SCHNELLCHECK')
                  .map((x) => x.name),
              });
            };
            tx.onerror = () => fertig({ ok: false });
          };
        })
    );

  /** Das Blatt aufziehen — mit einem echten Zug am Griff. */
  async function blattAufziehen() {
    if (await page.evaluate(() => document.body.classList.contains('sheet-open'))) return;
    const kasten = await page.locator('#sheet-grip').boundingBox();
    if (!kasten) return;
    const x = kasten.x + kasten.width / 2;
    const y = kasten.y + kasten.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 380, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(900);
  }
  async function blattZuziehen() {
    if (!(await page.evaluate(() => document.body.classList.contains('sheet-open')))) return;
    const kasten = await page.locator('#sheet-grip').boundingBox();
    if (!kasten) return;
    const x = kasten.x + kasten.width / 2;
    const y = kasten.y + kasten.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 500, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(900);
  }

  // ── 1. Der Reiter „Standorte" ist nicht mehr leer ───────────────────────
  console.log('\n=== Der Reiter „Standorte" auf der Kartenebene ===');
  await blattAufziehen();
  await page.waitForTimeout(1500);
  const reiter = await page.evaluate(() => {
    const daten = document.getElementById('tab-daten');
    const filter = document.getElementById('tab-filter');
    const zeilen = [...(daten?.querySelectorAll('.standorteliste-zeile') ?? [])];
    const erste = zeilen[0]?.getBoundingClientRect();
    return {
      aktiv: document.querySelector('.tab-button.active')?.textContent?.trim() ?? '',
      datenKinder: daten?.childElementCount ?? -1,
      zeilen: zeilen.length,
      zeileHoch: erste ? Math.round(erste.height) : 0,
      ersteZeile: zeilen[0]?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      filterKinder: filter?.childElementCount ?? -1,
      filterText: filter?.textContent?.trim() ?? '',
    };
  });
  console.log(`  aktiver Reiter            ${reiter.aktiv}`);
  console.log(`  Zeilen im Reiter          ${reiter.zeilen} (${reiter.zeileHoch} px hoch)`);
  console.log(`  erste Zeile               ${reiter.ersteZeile || '(keine)'}`);
  console.log(`  Reiter „Filter"           ${reiter.filterText || 'STUMM'}`);
  pruefe(reiter.datenKinder > 0, 'der Reiter „Standorte" steht leer da — 0 Kinder, wie vorher');
  pruefe(reiter.zeilen > 0, 'im Reiter „Standorte" steht keine einzige Standortzeile');
  pruefe(reiter.zeileHoch >= 44, `die Standortzeilen sind ${reiter.zeileHoch} px hoch`);
  /**
   * Die zweite Zeile trägt Worte, nicht nur eine Zahl.
   *
   * „3 Maschinen · schlechteste 61 %" — auf einer Liste aus lauter Zahlen ist
   * eine Zahl ohne Bezugswort keine Auskunft.
   */
  pruefe(
    /Maschine/i.test(reiter.ersteZeile),
    `die Standortzeile sagt nicht, wie viele Maschinen dort stehen — „${reiter.ersteZeile}"`
  );
  /**
   * Hier stand: „der Reiter ‚Filter' bleibt stumm statt zu sagen, was fehlt."
   *
   * Sein Gegenstand war ein Platzhaltersatz in einem Reiter ohne Funktion. Den
   * Reiter gibt es seit dem 23.08.2026 wirklich, und er baut sich erst, wenn
   * jemand ihn aufschlägt — dieselbe Zurückhaltung wie im Analyseblatt. Vorher
   * hat er 0 Kinder, und das ist jetzt richtig statt stumm.
   *
   * Was er zeigt, wenn man ihn aufschlägt, misst der nächste Abschnitt.
   */

  // ── 1b. Der Filter tut wirklich etwas ───────────────────────────────────
  //
  // Bis zum 23.08.2026 stand im Reiter „Filter" ein Satz: „gibt es noch
  // nicht." Ehrlich, aber eben nichts. Jetzt stehen dort Chips, und gemessen
  // wird nicht, DASS sie dastehen, sondern dass ein Tipp die Liste kürzer
  // macht — und dass man wieder herauskommt.
  console.log('\n=== Der Filter ===');
  await page
    .locator('.tab-button[data-tab="filter"]')
    .click({ force: true, timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(1200);

  const vorFilter = await page.evaluate(() => {
    const feld = document.getElementById('tab-filter');
    const chips = [...(feld?.querySelectorAll('.standortfilter-chip') ?? [])];
    return {
      aktiv: document.querySelector('.tab-button.active')?.dataset.tab ?? '(keiner)',
      feldAktiv: Boolean(feld?.classList.contains('active')),
      kinder: feld?.childElementCount ?? -1,
      roh: feld?.textContent?.trim().slice(0, 80) ?? '',
      reihen: feld?.querySelectorAll('.standortfilter-reihe').length ?? 0,
      chips: chips.map((c) => ({
        text: c.textContent.trim(),
        hoch: Math.round(c.getBoundingClientRect().height),
        breit: Math.round(c.getBoundingClientRect().width),
        gedrueckt: c.getAttribute('aria-pressed') === 'true',
      })),
      stand: feld?.querySelector('.standortfilter-stand')?.textContent?.trim() ?? '',
      aufheben: Boolean(feld?.querySelector('.standortfilter-aufheben')),
    };
  });
  console.log(
    `  aktiver Reiter            ${vorFilter.aktiv} · Feld aktiv ${vorFilter.feldAktiv} · ${vorFilter.kinder} Kinder`
  );
  console.log(`  Inhalt                    ${vorFilter.roh || '(leer)'}`);
  console.log(`  Reihen                    ${vorFilter.reihen}`);
  console.log(
    `  Chips                     ${vorFilter.chips.map((c) => c.text).join(' · ') || '(keine)'}`
  );
  console.log(`  Stand                     ${vorFilter.stand || '(keiner)'}`);
  pruefe(
    vorFilter.reihen >= 2,
    `der Filter hat ${vorFilter.reihen} Reihe(n) statt Zustand und Alter`
  );
  pruefe(
    vorFilter.chips.length > 0 && vorFilter.chips.every((c) => c.hoch >= 44 && c.breit >= 44),
    `ein Chip ist kleiner als 44 px — ${vorFilter.chips.map((c) => `${c.breit}×${c.hoch}`).join(' · ')}`
  );
  /**
   * Die Zahl steht am Chip, bevor man tippt.
   *
   * Ein Chip, der auf 0 Standorte führt, ist eine Sackgasse — und ohne Zahl
   * sieht man sie erst danach.
   */
  pruefe(
    vorFilter.chips.every((c) => /\d/.test(c.text)),
    `ein Chip nennt seine Anzahl nicht — „${vorFilter.chips.map((c) => c.text).join(' · ')}"`
  );
  pruefe(
    /\d+\D+\d+/.test(vorFilter.stand),
    `der Filter sagt nicht, wie viele von wie vielen übrig bleiben — „${vorFilter.stand}"`
  );
  pruefe(
    !vorFilter.aufheben,
    'ohne gesetzten Filter steht schon „Filter aufheben" da — dann sagt der Knopf nichts'
  );

  /**
   * ZWEI TIPPS, DIE NICHT VON DEN TESTDATEN ABHÄNGEN.
   *
   * Der erste Versuch suchte einen Chip mit „mehr als 0 und weniger als
   * alle". Mit den Beispieldaten gab es den nur in der Flottenreihe — hundert
   * Standorte, alle ungeprüft. Der Wächter maß damit die Flottenreihe, und als
   * die (zu Recht) verschwand, hatte er nichts mehr zu greifen. Ein Wächter,
   * der an der Zusammensetzung der Testdaten hängt, misst irgendwann etwas
   * anderes als das, wofür er geschrieben wurde.
   *
   * Gemessen wird deshalb die Zusage selbst: **Die Liste zeigt genau so viele
   * Standorte, wie am Chip steht.** Das gilt bei 0 wie bei 100.
   *
   *   1. ein Chip mit 0  →  keine Zeile, aber ein Satz, der das sagt
   *   2. ein Chip mit n  →  genau n Zeilen
   *   3. „Alle zeigen"   →  wieder alle
   */
  const zahlVon = (text) => Number(text.match(/(\d+)\s*$/)?.[1] ?? -1);
  const leerChip = vorFilter.chips.find((c) => zahlVon(c.text) === 0);
  const vollChip = vorFilter.chips.find((c) => zahlVon(c.text) > 0);
  console.log(`  Chip mit 0                ${leerChip?.text ?? '(keiner)'}`);
  console.log(`  Chip mit Treffern         ${vollChip?.text ?? '(keiner)'}`);
  pruefe(
    Boolean(leerChip) && Boolean(vollChip),
    'es gibt keinen Chip mit 0 und keinen mit Treffern — die Filterung ist nicht messbar'
  );

  /** Der Stand der Liste, nachdem ein Chip getippt wurde. */
  const listeNach = async (chiptext) => {
    await page
      .locator('.tab-button[data-tab="filter"]')
      .click({ force: true, timeout: 6000 })
      .catch(() => {});
    await page.waitForTimeout(700);
    await page
      .locator('.standortfilter-chip', { hasText: chiptext })
      .first()
      .click({ force: true, timeout: 6000 })
      .catch(() => {});
    await page.waitForTimeout(900);
    await page
      .locator('.tab-button[data-tab="daten"]')
      .click({ force: true, timeout: 6000 })
      .catch(() => {});
    await page.waitForTimeout(1000);
    return page.evaluate(() => {
      const daten = document.getElementById('tab-daten');
      const aus = daten?.querySelector('.standorteliste-filter-aus');
      return {
        zeilen: daten?.querySelectorAll('.standorteliste-zeile').length ?? 0,
        zeile: daten?.querySelector('.standorteliste-filtertext')?.textContent?.trim() ?? '',
        leersatz: daten?.querySelector('.blatt-leer')?.textContent?.trim() ?? '',
        ausHoch: Math.round(aus?.getBoundingClientRect().height ?? 0),
      };
    });
  };

  if (leerChip) {
    const leer = await listeNach(leerChip.text);
    console.log(
      `  nach „${leerChip.text}"${' '.repeat(Math.max(1, 18 - leerChip.text.length))}${leer.zeilen} Zeilen · „${leer.leersatz || '(kein Satz)'}"`
    );
    pruefe(leer.zeilen === 0, `„${leerChip.text}" führt zu ${leer.zeilen} Zeilen statt zu keiner`);
    /**
     * Eine leere Liste braucht einen Satz.
     *
     * Ohne ihn sieht ein Filter auf 0 Treffer genauso aus wie ein leerer
     * Bestand oder ein Fehler beim Laden — drei sehr verschiedene Lagen.
     */
    pruefe(
      leer.leersatz.length > 0,
      'ein Filter ohne Treffer zeigt eine leere Liste statt eines Satzes'
    );
    pruefe(leer.zeile.length > 0, 'über der leeren Liste steht nicht, dass gefiltert wird');
    // Zurücknehmen, damit der nächste Tipp allein steht.
    await page
      .locator('.standorteliste-filter-aus')
      .click({ force: true, timeout: 6000 })
      .catch(() => {});
    await page.waitForTimeout(900);
  }

  if (vollChip) {
    const soll = zahlVon(vollChip.text);
    const voll = await listeNach(vollChip.text);
    console.log(
      `  nach „${vollChip.text}"${' '.repeat(Math.max(1, 18 - vollChip.text.length))}${voll.zeilen} Zeilen (am Chip steht ${soll})`
    );
    console.log(`  Zeile über der Liste      ${voll.zeile || '(keine)'}`);
    /**
     * Die Zahl am Chip ist ein Versprechen.
     *
     * Sie wird VOR dem Tippen gelesen und entscheidet, ob jemand tippt. Weicht
     * sie vom Ergebnis ab, ist sie schlimmer als keine Zahl.
     */
    pruefe(
      voll.zeilen === soll,
      `„${vollChip.text}" verspricht ${soll} Standorte und zeigt ${voll.zeilen}`
    );
    pruefe(voll.zeile.length > 0, 'über der gefilterten Liste steht nicht, dass gefiltert wird');
    pruefe(voll.ausHoch >= 44, `„Alle zeigen" ist ${voll.ausHoch} px hoch`);

    await page
      .locator('.standorteliste-filter-aus')
      .click({ force: true, timeout: 6000 })
      .catch(() => {});
    await page.waitForTimeout(1000);
    const zurueck = await page.evaluate(() => {
      const daten = document.getElementById('tab-daten');
      return {
        zeilen: daten?.querySelectorAll('.standorteliste-zeile').length ?? 0,
        zeile: Boolean(daten?.querySelector('.standorteliste-filtertext')),
      };
    });
    console.log(`  nach „Alle zeigen"        ${zurueck.zeilen} Zeilen`);
    pruefe(
      zurueck.zeilen === reiter.zeilen && !zurueck.zeile,
      `„Alle zeigen" bringt nicht alle zurück — ${zurueck.zeilen} statt ${reiter.zeilen}`
    );
  }

  // ── 2. Der Weg hinein ───────────────────────────────────────────────────
  console.log('\n=== Der Knopf über der Karte ===');
  await blattZuziehen();
  const knopf = await page.evaluate(() => {
    const b = document.getElementById('btn-schnellcheck');
    const k = b?.getBoundingClientRect();
    const n = document.getElementById('btn-sound-detect');
    const nk = n?.getBoundingClientRect();
    const mitte =
      k && k.width ? document.elementFromPoint(k.x + k.width / 2, k.y + k.height / 2) : null;
    const nachbarMitte =
      nk && nk.width ? document.elementFromPoint(nk.x + nk.width / 2, nk.y + nk.height / 2) : null;
    return {
      text: b?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      aria: b?.getAttribute('aria-label') ?? '',
      fuechse: b?.querySelectorAll('.mns-fox').length ?? 0,
      fuchsVerzoegerung: b?.querySelector('.mns-fox')
        ? getComputedStyle(b.querySelector('.mns-fox')).animationDelay
        : '',
      hoch: k ? Math.round(k.height) : 0,
      imBild: k ? k.bottom <= window.innerHeight && k.right <= window.innerWidth : false,
      frei: Boolean(mitte && b && (mitte === b || b.contains(mitte))),
      nachbar: n?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      nachbarAria: n?.getAttribute('aria-label') ?? '',
      nachbarFuechse: n?.querySelectorAll('.mns-fox').length ?? 0,
      nachbarFuchsVerzoegerung: n?.querySelector('.mns-fox')
        ? getComputedStyle(n.querySelector('.mns-fox')).animationDelay
        : '',
      nachbarHoch: nk ? Math.round(nk.height) : 0,
      nachbarImBild: nk ? nk.bottom <= window.innerHeight && nk.right <= window.innerWidth : false,
      nachbarFrei: Boolean(nachbarMitte && n && (nachbarMitte === n || n.contains(nachbarMitte))),
    };
  });
  console.log(`  Nachbar                   ${knopf.nachbar || '(keiner)'}`);
  console.log(`  Schnellcheck              ${knopf.text || 'FEHLT'} (${knopf.hoch} px)`);
  pruefe(knopf.text.length > 0, 'über der Karte führt kein Weg zu einem Geräusch ohne Maschine');
  pruefe(
    /Erkennen/.test(knopf.nachbar),
    `der Live-Weg ist nicht knapp als „Erkennen“ beschriftet — „${knopf.nachbar || '(fehlt)'}“`
  );
  pruefe(
    /Maschine.*Geräusch.*erkennen/i.test(knopf.nachbarAria),
    '„Erkennen“ hat keinen eindeutigen zugänglichen Namen'
  );
  pruefe(knopf.nachbarFuechse === 1, 'am Erkennen-Knopf fehlt der Fuchs');
  pruefe(
    /Import/.test(knopf.text),
    `der Datei-Weg ist nicht knapp als „Import“ beschriftet — „${knopf.text || '(fehlt)'}“`
  );
  pruefe(
    /Geräusch.*Datei.*importieren/i.test(knopf.aria),
    '„Import“ hat keinen eindeutigen zugänglichen Namen'
  );
  pruefe(knopf.fuechse === 1, 'am Import-Knopf fehlt der Fuchs');
  pruefe(
    knopf.fuchsVerzoegerung !== knopf.nachbarFuchsVerzoegerung,
    'die beiden Füchse wackeln nicht zeitversetzt'
  );
  pruefe(knopf.nachbarHoch >= 44, `„Erkennen" ist ${knopf.nachbarHoch} px hoch`);
  pruefe(knopf.nachbarImBild, '„Erkennen" steht nicht vollständig im Bild');
  pruefe(knopf.nachbarFrei, '„Erkennen" ist an seiner Mitte verdeckt');
  pruefe(knopf.imBild, 'der Schnellcheck-Knopf steht nicht vollständig im Bild');
  /**
   * Und er ist so groß wie jeder andere Knopf dieser App.
   *
   * Gemessen 37 px, bevor `.map-fab` eine Mindesthöhe bekam — die Pillen
   * schweben über einer Karte, die man mit demselben Daumen verschiebt. Der
   * erste Knopf für jemanden, der noch nichts angelegt hat, darf nicht der
   * kleinste sein.
   */
  pruefe(knopf.hoch >= 44, `der Schnellcheck-Knopf ist ${knopf.hoch} px hoch`);
  /**
   * Er muss auch WIRKLICH anfassbar sein.
   *
   * Zwei Pillen nebeneinander auf 390 px: Der Wächter fragt deshalb nicht nur
   * nach dem Rechteck, sondern danach, was an seiner Mitte liegt. Ein Knopf
   * unter der Karte ist ein Knopf, den es nicht gibt.
   */
  pruefe(knopf.frei, 'an der Mitte des Schnellcheck-Knopfs liegt etwas anderes — er ist verdeckt');

  /**
   * Der frühere Knopf „In der Nähe" tat gar nichts. Deshalb reicht es hier
   * nicht, die neue Beschriftung zu sehen: Ein Tipp muss bis zum vorhandenen
   * Erkennungsablauf gelangen. Die Beispieldaten haben absichtlich noch keine
   * Normalzustände, also ist dessen ehrlicher erster Ausgang „Normalzustand
   * fehlt" — ohne Mikrofonabfrage und damit stabil im Browserwächter.
   */
  await page
    .locator('#btn-sound-detect')
    .click({ timeout: 8000 })
    .catch(() => {});
  await page
    .waitForSelector('.unified-flow-modal', { state: 'visible', timeout: 8000 })
    .catch(() => {});
  const erkennen = await page.evaluate(() => {
    const dialog = document.querySelector('.unified-flow-modal');
    return {
      offen: Boolean(dialog),
      titel: dialog?.querySelector('h3')?.textContent?.trim() ?? '',
      ausgang: dialog?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    };
  });
  console.log(`  Maschine erkennen         ${erkennen.titel || 'OHNE REAKTION'}`);
  pruefe(erkennen.offen, '„Maschine erkennen" reagiert auf einen Tipp nicht');
  pruefe(
    /Normalzustand/.test(erkennen.ausgang),
    `ohne angelernte Maschinen erklärt der Erkennungsweg den nächsten Schritt nicht — „${erkennen.ausgang}"`
  );
  await page
    .locator('.unified-flow-cancel')
    .click({ timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  pruefe(
    !(await page
      .locator('.unified-flow-modal')
      .isVisible()
      .catch(() => false)),
    'der Erkennungsdialog lässt sich nicht abbrechen'
  );

  // ── 3. Eine Datei ohne Maschine ─────────────────────────────────────────
  console.log(`\n=== Ein Geräusch ohne Maschine (${WAV.split('/').pop()}) ===`);
  const vorher = await ablage();
  console.log(
    `  vorher                    ${vorher.standorte} Standorte · Sammelstandort ${vorher.standort ? 'da' : 'nein'}`
  );

  const wahl = page.waitForEvent('filechooser');
  await page
    .locator('#btn-schnellcheck')
    .click({ timeout: 8000 })
    .catch(() => {});
  (await wahl).setFiles(WAV).catch(() => {});
  await page
    .waitForFunction(() => Boolean(document.querySelector('.mitbringen-nehmen')), null, {
      timeout: 30000,
    })
    .catch(() => {});
  const vorschauDa = await page.evaluate(() =>
    Boolean(document.querySelector('.mitbringen-nehmen'))
  );
  pruefe(vorschauDa, 'die Vorschau kam nicht zustande');

  /**
   * Solange nichts gewählt ist, entsteht auch nichts.
   *
   * Wer den Dialog wieder zumacht, soll keinen Standort und keine Maschine
   * hinterlassen. Gemessen VOR dem Übernehmen — nachher wäre es zu spät.
   */
  const beimAnsehen = await ablage();
  pruefe(
    beimAnsehen.standorte === vorher.standorte,
    'schon das Ansehen einer Datei hat einen Standort angelegt'
  );

  await page
    .locator('.mitbringen-nehmen')
    .click({ timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(4000);

  const nachher = await ablage();
  const sicht = await page.evaluate(() => ({
    ebene: document.body.className.match(/tiefe-\w+/g)?.join(' ') ?? '(keine)',
    titel: document.querySelector('.maschine-titelzeile h2')?.textContent?.trim() ?? '',
    blattOffen: document.body.classList.contains('sheet-open'),
    reiter: document.querySelector('.tab-button.active')?.textContent?.trim() ?? '',
    leerzustand: document.querySelectorAll('#tab-zweid .blatt-leer').length,
    bild: (() => {
      const c = document.querySelector('#tab-zweid .klangbild-flach');
      return Boolean(c && c.width > 0 && c.height > 0);
    })(),
    normalKnopf: document.querySelectorAll('.maschine-mitbringen').length,
    erstlauf: document.body.classList.contains('zb-first-run'),
  }));
  console.log(
    `  Standort                  ${nachher.standort ? `„${nachher.standort.name}" · geo ${nachher.standort.geo}` : 'KEINER'}`
  );
  console.log(`  Maschinen darin           ${nachher.maschinen.join(' · ') || '(keine)'}`);
  console.log(`  Ebene                     ${sicht.ebene} · ${sicht.titel || '(kein Titel)'}`);
  console.log(`  Blatt                     ${sicht.blattOffen ? 'offen' : 'ZU'} · ${sicht.reiter}`);
  console.log(`  Klangbild                 ${sicht.bild ? 'gemalt' : 'LEER'}`);

  console.log(`  Erstlauf-Zustand          ${sicht.erstlauf ? 'STEHT NOCH' : 'aufgehoben'}`);

  pruefe(Boolean(nachher.standort), 'der Schnellcheck hat keinen Standort angelegt');
  /**
   * Nach der ersten Maschine ist es kein Erstlauf mehr.
   *
   * Gemeldet am 24.08.2026: `body.zb-first-run` blieb nach dem Schnellcheck
   * stehen. Die Startseite zeigte weiter die Anleitung für die erste
   * Maschine — mit einer angelegten Maschine in der Ablage.
   *
   * Der Grund lag im Weg: Die Klasse wurde an zwei Stellen geführt, und beide
   * hängen an der Startseite. Der Schnellcheck geht an ihr vorbei.
   */
  pruefe(
    !sicht.erstlauf,
    'nach dem Schnellcheck steht der Erstlauf-Zustand noch — die App zeigt die Anleitung für eine Maschine, die es gibt'
  );
  /**
   * Ohne Postleitzahl — und das ist Absicht.
   *
   * Wo gefilmt wurde, weiß die App nicht. Eine erfundene Postleitzahl wäre ein
   * Punkt auf der Karte, der nicht stimmt. `geo: 'none'` hält genau das fest.
   */
  pruefe(
    nachher.standort?.geo === 'none',
    `der Sammelstandort behauptet eine Position (geo: ${nachher.standort?.geo})`
  );
  pruefe(
    nachher.maschinen.length === 1,
    `es entstanden ${nachher.maschinen.length} Maschinen statt genau einer`
  );
  pruefe(
    nachher.maschinen[0] === ERWARTETER_NAME,
    `die Maschine heißt „${nachher.maschinen[0]}" statt „${ERWARTETER_NAME}" — der Dateiname ging verloren`
  );
  pruefe(
    /tiefe-maschine/.test(sicht.ebene),
    'die Maschinenebene ging nach dem Übernehmen nicht auf'
  );
  pruefe(
    sicht.titel === ERWARTETER_NAME,
    `oben steht „${sicht.titel}" statt der frisch angelegten Maschine`
  );
  pruefe(sicht.blattOffen, 'das Analyseblatt geht nach dem Übernehmen nicht auf');
  /**
   * Der eigentliche Beweis: Der Ton hat den Umzug überlebt.
   *
   * Zwischen Dateiwahl und Blatt liegt eine frisch angelegte Maschine und ein
   * vollständiges Neuzeichnen der Ebene — und das beginnt mit
   * `analyseblattFuellen(null)`. Ein Ton, der dabei verlorengeht, hinterlässt
   * genau diesen Leerzustand.
   */
  pruefe(sicht.leerzustand === 0, 'der 2D-Reiter zeigt seinen Leerzustand — der Ton ging verloren');
  pruefe(sicht.bild, 'das Klangbild des mitgebrachten Tons ist leer');
  pruefe(
    sicht.normalKnopf > 0,
    'auf der frischen Maschine fehlt der Weg zu einem weiteren Geräusch'
  );

  // ── 4. Und der Weg zurück ───────────────────────────────────────────────
  console.log('\n=== Der Weg zurück in vier Wochen ===');
  await page.evaluate(() => {
    document
      .querySelector('.tiefe-zurueck')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(1200);
  // Bis zur Karte zurück — von der Maschine über den Standort.
  for (let i = 0; i < 3; i += 1) {
    if (await page.evaluate(() => !document.body.className.match(/tiefe-\w+/))) break;
    await page.evaluate(() => {
      document
        .querySelector('.tiefe-zurueck')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(1200);
  }
  await blattAufziehen();
  await page.waitForTimeout(1800);
  const zurueck = await page.evaluate(() => {
    const zeilen = [...document.querySelectorAll('#tab-daten .standorteliste-zeile')];
    return {
      ebene: document.body.className.match(/tiefe-\w+/g)?.join(' ') ?? '(karte)',
      texte: zeilen.map((z) => z.textContent.replace(/\s+/g, ' ').trim()),
    };
  });
  const treffer = zurueck.texte.find((x) => /Meine Geräusche/.test(x)) ?? '';
  console.log(`  Ebene                     ${zurueck.ebene}`);
  console.log(`  Zeile im Reiter           ${treffer || 'NICHT GEFUNDEN'}`);
  /**
   * Das ist die Zusage des ganzen Schnitts.
   *
   * Ein Standort ohne Kartenposition ist auf der Karte unsichtbar. Steht er
   * auch nicht in der Liste, hat der Schnellcheck etwas angelegt, das niemand
   * je wiedersieht — und „in vier Wochen vergleichen" wäre eine leere Zusage.
   */
  pruefe(
    treffer.length > 0,
    'der Standort des Schnellchecks steht nicht im Reiter „Standorte" — er ist unerreichbar'
  );
  pruefe(
    /1 Maschine/.test(treffer),
    `die Zeile sagt nicht, dass dort eine Maschine steht — „${treffer}"`
  );

  // Und ein Tipp führt wirklich hinein.
  await page
    .locator('#tab-daten .standorteliste-zeile', { hasText: 'Meine Geräusche' })
    .first()
    .click({ timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(2000);
  const drin = await page.evaluate(() => ({
    ebene: document.body.className.match(/tiefe-\w+/g)?.join(' ') ?? '(karte)',
    maschinen: [...document.querySelectorAll('.standort-maschine')]
      .filter((b) => getComputedStyle(b).display !== 'none')
      .map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
  }));
  console.log(`  nach dem Tipp             ${drin.ebene}`);
  console.log(`  Maschinen dort            ${drin.maschinen.join(' · ') || '(keine)'}`);
  /**
   * Die Standortebene heißt „tiefe-offen" — und sonst nichts.
   *
   * Der erste Versuch suchte nach `tiefe-standort` und meldete „führt
   * nirgendwohin", während die Maschinen dieses Standorts längst danebenstanden.
   * Die Tiefe trägt eine Klasse je Unterebene (`tiefe-maschine`, `tiefe-arbeit`,
   * `tiefe-bestand`); der Standort ist die Ebene OHNE Zusatz. Ein Wächter, der
   * eine Klasse erfindet, misst seine eigene Erfindung.
   */
  pruefe(
    drin.ebene === 'tiefe-offen',
    `ein Tipp auf die Standortzeile führte nach „${drin.ebene}" statt auf die Standortebene`
  );
  pruefe(
    drin.maschinen.some((x) => x.includes(ERWARTETER_NAME)),
    'im Standort steht die Maschine des Schnellchecks nicht'
  );

  console.log(`\nSeitenfehler                ${seitenfehler.length}`);
  pruefe(seitenfehler.length === 0, `Seitenfehler: ${seitenfehler.slice(0, 2).join(' | ')}`);
  await ctx.close();
} finally {
  await browser.close();
  vorschau.kill();
}

console.log(befunde.length ? `\n${befunde.length} Befunde.` : '\nDer Schnellcheck trägt.');
process.exit(befunde.length ? 1 : 0);
