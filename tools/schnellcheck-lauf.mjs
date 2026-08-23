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
   * Kein Fehler ohne Satz — auch nicht beim Werkzeug selbst.
   *
   * Playwright steht bewusst NICHT in `package.json`: Die CI führt `npm ci`
   * aus und keinen einzigen Browser-Wächter; es dort zu installieren lüde bei
   * jedem Lauf Browser herunter, die niemand benutzt.
   *
   * Der Preis dafür ist, dass es nach einem frischen `npm ci` fehlen kann.
   * Dann muss hier ein Satz stehen, der sagt, was zu tun ist. Am 23.08.2026
   * stürzten sechs von acht Wächtern stattdessen mit einer Stapelspur ab —
   * und ein Wächter, der gar nicht läuft, sieht in einem Protokoll aus wie
   * einer, der nichts gefunden hat.
   */
  console.error(
    'Playwright fehlt. Einmalig:  npm i -D playwright  (der Browser liegt schon bereit)'
  );
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
  pruefe(reiter.filterKinder > 0, 'der Reiter „Filter" bleibt stumm statt zu sagen, was fehlt');

  // ── 2. Der Weg hinein ───────────────────────────────────────────────────
  console.log('\n=== Der Knopf über der Karte ===');
  await blattZuziehen();
  const knopf = await page.evaluate(() => {
    const b = document.getElementById('btn-schnellcheck');
    const k = b?.getBoundingClientRect();
    const mitte =
      k && k.width ? document.elementFromPoint(k.x + k.width / 2, k.y + k.height / 2) : null;
    return {
      text: b?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      hoch: k ? Math.round(k.height) : 0,
      imBild: k ? k.bottom <= window.innerHeight && k.right <= window.innerWidth : false,
      frei: Boolean(mitte && b && (mitte === b || b.contains(mitte))),
      nachbar: document.getElementById('btn-nearby')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    };
  });
  console.log(`  Nachbar                   ${knopf.nachbar || '(keiner)'}`);
  console.log(`  Schnellcheck              ${knopf.text || 'FEHLT'} (${knopf.hoch} px)`);
  pruefe(knopf.text.length > 0, 'über der Karte führt kein Weg zu einem Geräusch ohne Maschine');
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

  // ── 3. Eine Datei ohne Maschine ─────────────────────────────────────────
  console.log(`\n=== Ein Geräusch ohne Maschine (${WAV.split('/').pop()}) ===`);
  const vorher = await ablage();
  console.log(`  vorher                    ${vorher.standorte} Standorte · Sammelstandort ${vorher.standort ? 'da' : 'nein'}`);

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
  }));
  console.log(`  Standort                  ${nachher.standort ? `„${nachher.standort.name}" · geo ${nachher.standort.geo}` : 'KEINER'}`);
  console.log(`  Maschinen darin           ${nachher.maschinen.join(' · ') || '(keine)'}`);
  console.log(`  Ebene                     ${sicht.ebene} · ${sicht.titel || '(kein Titel)'}`);
  console.log(`  Blatt                     ${sicht.blattOffen ? 'offen' : 'ZU'} · ${sicht.reiter}`);
  console.log(`  Klangbild                 ${sicht.bild ? 'gemalt' : 'LEER'}`);

  pruefe(Boolean(nachher.standort), 'der Schnellcheck hat keinen Standort angelegt');
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
  pruefe(/tiefe-maschine/.test(sicht.ebene), 'die Maschinenebene ging nach dem Übernehmen nicht auf');
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
    document.querySelector('.tiefe-zurueck')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
