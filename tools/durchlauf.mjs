/**
 * Der Hauptweg, einmal von vorn bis hinten.
 *
 *   anlegen → Normalzustand aufnehmen → prüfen → Ergebnis
 *
 * Die Einzelprüfungen im Haus beantworten jeweils eine Frage: Stimmen die
 * Typen (`tsc`), zeigt ein CSS-Selektor ins Leere (`css-check`), fehlt ein
 * Sprachschlüssel (`check-i18n`), ist das Erstbild zu voll (`attention-check`).
 * Keine davon beantwortet die Frage, auf die es am Ende ankommt: **Kommt
 * jemand, der die App zum ersten Mal öffnet, bis zu einem Ergebnis?**
 *
 * Der Anlass war eine Reihe von UI-Änderungen an genau dieser Kette — der
 * Zeilen-Tipp führt seit dem 14.08.2026 in die Maschinenansicht statt direkt in
 * den Ablauf, der Knopf dort heißt je nach Zustand anders, unten liegt ein
 * fester Streifen über dem Inhalt. Jede Änderung war für sich geprüft. Ob die
 * Kette als Ganzes noch trägt, war damit nicht beantwortet.
 *
 * Das Mikrofon kommt von Chromium: `--use-file-for-fake-audio-capture` spielt
 * eine Datei ein, die dieses Skript vorher schreibt — 50 Hz Grundton mit
 * Oberwellen und etwas Rauschen, also etwas, das nach Maschine klingt. Das ist
 * nicht Zierde: Chromiums eingebautes Kunstmikrofon liefert Stille, und die App
 * weist Stille zu Recht ab („Signal is too constant or silent"). Ohne echtes
 * Signal endet der Weg bei Schritt 6.
 *
 * Ausgeführt wird gegen `dist/` — also vorher `npm run build`.
 *
 *   npm run durchlauf
 *
 * Bewusst **nicht** in der CI: Der Lauf dauert rund anderthalb Minuten und
 * braucht einen Browser. Er gehört vor jede Änderung an Navigation, Aufnahme
 * oder Prüfung — dorthin, wo ein Mensch hinschaut.
 *
 * Voraussetzung wie bei attention-check:
 *   npm i -D playwright && npx playwright install chromium
 *   PLAYWRIGHT_CHROMIUM_PATH=/pfad/zu/chrome npm run durchlauf
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

/** Ein freier Port, damit parallele Läufe sich nicht in die Quere kommen. */
function freierPort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on('error', rej);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

function starteVorschau(port) {
  const kind = spawn(
    'npx',
    ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { stdio: 'ignore' }
  );
  return kind;
}

/**
 * Ein Klang, der nach Maschine klingt: Drehzahl-Grundton, drei Oberwellen,
 * etwas Rauschen. Der feste Startwert hält den Lauf wiederholbar — sonst wäre
 * jedes Ergebnis ein anderes und ein Rückgang nicht von Zufall zu trennen.
 */
function schreibeKlang(pfad) {
  const sr = 48000;
  const sek = 30;
  const n = sr * sek;
  const daten = Buffer.alloc(n * 2);

  let saat = 7;
  const zufall = () => {
    saat = (saat * 1103515245 + 12345) & 0x7fffffff;
    return saat / 0x7fffffff;
  };

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0.35 * Math.sin(2 * Math.PI * 50 * t);
    s += 0.18 * Math.sin(2 * Math.PI * 100 * t);
    s += 0.1 * Math.sin(2 * Math.PI * 150 * t);
    s += 0.06 * Math.sin(2 * Math.PI * 430 * t);
    s += 0.04 * (zufall() * 2 - 1);
    daten.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 12000))), i * 2);
  }

  const kopf = Buffer.alloc(44);
  kopf.write('RIFF', 0);
  kopf.writeUInt32LE(36 + daten.length, 4);
  kopf.write('WAVE', 8);
  kopf.write('fmt ', 12);
  kopf.writeUInt32LE(16, 16);
  kopf.writeUInt16LE(1, 20); // PCM
  kopf.writeUInt16LE(1, 22); // mono
  kopf.writeUInt32LE(sr, 24);
  kopf.writeUInt32LE(sr * 2, 28);
  kopf.writeUInt16LE(2, 32);
  kopf.writeUInt16LE(16, 34);
  kopf.write('data', 36);
  kopf.writeUInt32LE(daten.length, 40);

  writeFileSync(pfad, Buffer.concat([kopf, daten]));
}

const befunde = [];
function pruefe(nummer, was, bedingung, zusatz = '') {
  const gut = Boolean(bedingung);
  console.log(`${gut ? '✓' : '✗'} ${nummer}. ${was}${zusatz ? '  →  ' + zusatz : ''}`);
  if (!gut) befunde.push(`${nummer}. ${was}`);
}

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error(
    'Playwright fehlt. Einmalig:  npm i -D playwright && npx playwright install chromium'
  );
  process.exit(1);
}

const arbeitsordner = mkdtempSync(join(tmpdir(), 'soundfuchs-durchlauf-'));
const klangDatei = join(arbeitsordner, 'maschine.wav');
schreibeKlang(klangDatei);

const port = await freierPort();
const vorschau = starteVorschau(port);

// Auf den Vorschau-Server warten.
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`);
    if (r.ok) break;
  } catch {
    /* noch nicht da */
  }
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
  args: [
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${klangDatei}`,
    '--use-fake-ui-for-media-stream',
  ],
});

try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 790 },
    locale: 'de-DE',
    permissions: ['microphone'],
  });

  const seitenfehler = [];
  page.on('pageerror', (e) => seitenfehler.push(e.message));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.locator('#empty-state-cta').click();
  await page.waitForTimeout(1200);
  pruefe(
    1,
    'Leerzustand führt zum Namensfeld',
    await page.locator('#machine-name-input').isVisible()
  );

  await page.locator('#machine-name-input').fill('Pumpe 17');
  await page.locator('#create-section button.action-btn').first().click();
  await page.waitForTimeout(2500);
  const namen = await page.locator('.machine-name').allTextContents();
  pruefe(
    2,
    'Maschine angelegt',
    namen.some((n) => n.includes('Pumpe 17'))
  );

  await page.locator('.machine-item').first().click();
  await page.waitForTimeout(1200);
  pruefe(
    3,
    'Zeilen-Tipp öffnet die Maschinenansicht',
    await page.locator('#machine-detail-modal').isVisible()
  );

  const knopfVor = (await page.locator('#machine-detail-select-btn').textContent()).trim();
  pruefe(4, 'Knopf nennt den nächsten Schritt', /Normalzustand/i.test(knopfVor), `„${knopfVor}"`);

  await page.locator('#machine-detail-select-btn').click();
  await page.waitForTimeout(2500);
  pruefe(5, 'Aufnahme-Sektion offen', await page.locator('#record-reference-content').isVisible());

  // Die Geräteliste einmal abfragen, bevor getippt wird: Ohne das startet die
  // Aufnahme in dieser Umgebung gelegentlich nicht.
  const mikros = await page.evaluate(async () => {
    const d = await navigator.mediaDevices.enumerateDevices();
    return d.filter((x) => x.kind === 'audioinput').length;
  });
  await page.locator('#record-btn').click();
  await page.waitForSelector('#review-save-btn', { state: 'visible', timeout: 90000 });
  pruefe(6, 'Aufnahme läuft bis zur Qualitätskontrolle', true, `${mikros} Mikrofone`);

  await page.locator('#review-save-btn').click();
  await page.waitForTimeout(4000);
  pruefe(
    7,
    'Normalzustand gespeichert',
    await page.evaluate(async () => {
      const db = await new Promise((r, j) => {
        const x = indexedDB.open('zanobot-db');
        x.onsuccess = () => r(x.result);
        x.onerror = () => j(x.error);
      });
      const m = await new Promise((r, j) => {
        const q = db.transaction('machines').objectStore('machines').getAll();
        q.onsuccess = () => r(q.result);
        q.onerror = () => j(q.error);
      });
      return m.some((x) => (x.referenceModels || []).length > 0);
    })
  );

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
  await page.locator('.machine-item').first().click();
  await page.waitForTimeout(1500);
  const knopfNach = (await page.locator('#machine-detail-select-btn').textContent()).trim();
  pruefe(8, 'Knopf heißt jetzt „Prüfung starten"', /Prüfung/i.test(knopfNach), `„${knopfNach}"`);

  await page.locator('#machine-detail-select-btn').click();
  await page.waitForTimeout(2500);
  pruefe(9, 'Prüf-Sektion offen', await page.locator('#run-diagnosis-content').isVisible());

  await page.locator('#diagnose-btn').click();
  await page.waitForTimeout(22000);
  const live = await page
    .locator('.inspection-score-value, #inspection-score, .score-value')
    .first()
    .textContent()
    .catch(() => null);
  pruefe(10, 'Prüfung zeigt laufend ein Ergebnis', Boolean(live), live ? live.trim() : '');

  // Beenden über einen Klick im Dokument: Hier geht es um die Wirkung des
  // Knopfes, nicht um seine Erreichbarkeit — die prüft attention-check.
  await page.evaluate(() => document.getElementById('inspection-stop-btn')?.click());

  let ergebnis = null;
  for (let i = 0; i < 40; i++) {
    ergebnis = await page.evaluate(async () => {
      const db = await new Promise((r, j) => {
        const x = indexedDB.open('zanobot-db');
        x.onsuccess = () => r(x.result);
        x.onerror = () => j(x.error);
      });
      if (![...db.objectStoreNames].includes('diagnoses')) return null;
      const d = await new Promise((r, j) => {
        const q = db.transaction('diagnoses').objectStore('diagnoses').getAll();
        q.onsuccess = () => r(q.result);
        q.onerror = () => j(q.error);
      });
      return d.length ? { score: d[0].healthScore, status: d[0].status } : null;
    });
    if (ergebnis) break;
    await page.waitForTimeout(1500);
  }
  pruefe(
    11,
    'Ergebnis ist gespeichert',
    Boolean(ergebnis),
    ergebnis ? JSON.stringify(ergebnis) : ''
  );

  // Hier endet der Lauf, und zwar bewusst beim gespeicherten Ergebnis: Das war
  // die Frage. Was danach kommt — Ergebnis-Fenster, Verlauf, der Griff am
  // unteren Rand — hat eigene Prüfungen und würde hier nur die Zahl der Stellen
  // erhöhen, an denen ein Lauf aus einem Grund scheitert, der nichts mit dem
  // Hauptweg zu tun hat.

  if (seitenfehler.length) {
    console.log('\nSeitenfehler:');
    for (const f of seitenfehler) console.log(`  ✗ ${f}`);
    befunde.push(`${seitenfehler.length} Seitenfehler`);
  }
} finally {
  await browser.close();
  vorschau.kill();
}

if (befunde.length) {
  console.log('\nBefunde:');
  for (const b of befunde) console.log(`  ✗ ${b}`);
  process.exit(1);
}

console.log('\n✓ Der Hauptweg trägt von vorn bis hinten.');
