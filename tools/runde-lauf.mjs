/**
 * DER RUNDEN-LAUF — endet die Runde wirklich?
 *
 * Die Entscheidung („wer kommt als Nächstes, und ob überhaupt noch jemand")
 * ist rein und mit elf Tests belegt (`src/stamm/maschine/runde.test.ts`). Was
 * die Tests NICHT sehen, ist die Verdrahtung: Wird `merkeGeprueft` beim
 * Ergebnis gerufen? Überlebt die Runde den Wechsel zwischen Standort- und
 * Maschinenebene? Endet sie beim Verlassen der Tiefe?
 *
 * Dieser Lauf misst genau das — an einem Standort mit ZWEI Maschinen, weil
 * dort das Ende nach zwei Prüfungen fällt statt nach vier. Beide Prüfungen
 * laufen echt: Aufnahme, Gegenprobe, Ergebnis.
 *
 * ## Warum er nicht im Standard-Satz steht
 *
 * Zwei vollständige Prüfungen mit echtem Mikrofonsignal kosten Minuten. Der
 * Lauf gehört deshalb zu Änderungen an der Runde, nicht zu jedem Schnitt. Was
 * er misst, misst sonst niemand: `wow` prüft, DASS ein Angebot dasteht, nicht
 * dass es irgendwann aufhört.
 *
 * ## Falsifiziert am 22.08.2026
 *
 * Mit `naechsteInDerRunde(mitStand, new Set())` — also ohne das Gedächtnis —
 * meldete er, was der Anlass war: Nach der zweiten Maschine stand dort
 * „▸ Nächste: Rührwerk 1". Ein Karussell, keine Runde.
 *
 * Ausgeführt wird gegen `dist/` — also vorher `npm run build`.
 *
 *   npm run runde
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schreibeKlang } from './klang.mjs';

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
const freierPort = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.on('error', rej);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

const port = await freierPort();
const vorschau = spawn(
  'npx',
  ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
  { stdio: 'ignore' }
);
await new Promise((r) => setTimeout(r, 4000));

const arbeitsordner = mkdtempSync(join(tmpdir(), 'runde-'));
const klangDatei = join(arbeitsordner, 'maschine.wav');
schreibeKlang(klangDatei);
const profil = join(arbeitsordner, 'profil');

const befunde = [];
const pruefe = (bedingung, text) => {
  console.log(`${bedingung ? '✓' : '✗'} ${text}`);
  if (!bedingung) befunde.push(text);
};

async function starte() {
  const ctx = await chromium.launchPersistentContext(profil, {
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: 'de-DE',
    permissions: ['microphone'],
    args: [
      '--no-sandbox',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${klangDatei}`,
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('pageerror', (e) => console.log('  ! Seitenfehler:', e.message));
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  return { ctx, page };
}

/**
 * Aus dem Flottenstandort (4 Maschinen) einen Zweier-Standort machen — und
 * alle anderen Standorte entfernen, damit die Karte genau einen Punkt zeigt
 * und der Weg dorthin nicht von Clustern abhängt.
 */
async function aufZweiKuerzen(page) {
  return page.evaluate(async () => {
    const db = await new Promise((r, j) => {
      const x = indexedDB.open('zanobot-db');
      x.onsuccess = () => r(x.result);
      x.onerror = () => j(x.error);
    });
    const alle = await new Promise((r, j) => {
      const q = db.transaction('machines').objectStore('machines').getAll();
      q.onsuccess = () => r(q.result);
      q.onerror = () => j(q.error);
    });
    const proStandort = new Map();
    for (const m of alle) {
      if (!m.customerId) continue;
      proStandort.set(m.customerId, [...(proStandort.get(m.customerId) ?? []), m]);
    }
    const flotte = [...proStandort.entries()].find(([, ms]) => ms.length === 4);
    if (!flotte) return null;
    const [standortId, maschinen] = flotte;
    const sortiert = [...maschinen].sort((a, b) => a.name.localeCompare(b.name));
    const weg = sortiert.slice(2);
    await new Promise((r, j) => {
      const tx = db.transaction('machines', 'readwrite');
      for (const m of weg) tx.objectStore('machines').delete(m.id);
      for (const m of alle)
        if (m.customerId !== standortId) tx.objectStore('machines').delete(m.id);
      tx.oncomplete = () => r();
      tx.onerror = () => j(tx.error);
    });
    const kunden = await new Promise((r, j) => {
      const q = db.transaction('customers').objectStore('customers').getAll();
      q.onsuccess = () => r(q.result);
      q.onerror = () => j(q.error);
    });
    await new Promise((r, j) => {
      const tx = db.transaction('customers', 'readwrite');
      for (const k of kunden) if (k.id !== standortId) tx.objectStore('customers').delete(k.id);
      tx.oncomplete = () => r();
      tx.onerror = () => j(tx.error);
    });
    return { standortId, bleiben: sortiert.slice(0, 2).map((m) => m.name) };
  });
}

/** Karte → der eine Standort → Maschinenliste. */
async function zumStandort(page) {
  for (let i = 0; i < 8; i += 1) {
    if ((await page.locator('#map .customer-marker-wrapper').count()) > 0) break;
    const stapel = page.locator('#map .cluster-wrapper');
    if ((await stapel.count()) === 0) break;
    await stapel.first().click({ force: true });
    await page.waitForTimeout(1500);
  }
  await page
    .locator('#map .customer-marker-wrapper')
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(1000);
  await page
    .locator('.popup-scharnier')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(1800);
}

const bild = async (page) =>
  page.evaluate(() => ({
    ebene: document.body.className.match(/tiefe-\w+/g)?.join(' ') ?? '(keine)',
    name: document.querySelector('.maschine-kopf h2')?.textContent?.trim() ?? '',
    runde: document.querySelector('.maschine-runde')?.textContent?.trim() ?? '',
    fertig: document.querySelector('.maschine-rundefertig')?.textContent?.trim() ?? '',
    zeilen: [...document.querySelectorAll('.standort-maschine')].map((e) =>
      e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)
    ),
  }));

/** Eine Maschine komplett durchspielen: Normalzustand aufnehmen, dann prüfen. */
async function durchspielen(page) {
  const warteAufAktion = () =>
    page
      .waitForFunction(
        () => {
          const b = document.querySelector('.maschine-aktion');
          return Boolean(b) && b.getBoundingClientRect().height > 0 && !b.disabled;
        },
        null,
        { timeout: 60000 }
      )
      .catch(() => {});

  // Normalzustand
  await warteAufAktion();
  await page.evaluate(() => document.querySelector('.maschine-aktion')?.click());
  await page
    .waitForFunction(
      () => {
        const b = document.getElementById('record-btn');
        return Boolean(b) && b.getBoundingClientRect().height > 0 && !b.disabled;
      },
      null,
      { timeout: 60000 }
    )
    .catch(() => {});
  await page.evaluate(() => document.getElementById('record-btn')?.click());
  await page
    .waitForFunction(() => Boolean(document.querySelector('.maschine-fingerabdruck')), null, {
      timeout: 120000,
    })
    .catch(() => {});
  await page.waitForTimeout(1500);

  // Gegenprobe
  await warteAufAktion();
  await page.evaluate(() => document.querySelector('.maschine-aktion')?.click());
  await page
    .waitForFunction(
      () => {
        const b = document.getElementById('diagnose-btn');
        return Boolean(b) && b.getBoundingClientRect().height > 0 && !b.disabled;
      },
      null,
      { timeout: 60000 }
    )
    .catch(() => {});
  await page.evaluate(() => document.getElementById('diagnose-btn')?.click());
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.getElementById('inspection-stop-btn')?.click());
  await page
    .waitForFunction(() => Boolean(document.querySelector('.maschine-ergebnissatz')), null, {
      timeout: 120000,
    })
    .catch(() => {});
  await page.waitForTimeout(2500);
}

try {
  const { ctx, page } = await starte();
  const standort = await aufZweiKuerzen(page);
  if (!standort) {
    console.log('Kein Flottenstandort in den Beispieldaten gefunden — Lauf abgebrochen.');
    process.exit(1);
  }
  console.log(`Standort ${standort.standortId}: ${standort.bleiben.join(' und ')}\n`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  await zumStandort(page);
  let jetzt = await bild(page);
  console.log(`Standortebene: ${jetzt.zeilen.length} Zeilen — ${jetzt.zeilen.join(' | ')}`);
  pruefe(jetzt.zeilen.length === 2, `Standort trägt zwei Maschinen (${jetzt.zeilen.length})`);

  // ── Maschine 1 ──────────────────────────────────────────────────────────
  await page
    .locator('.standort-maschine')
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(2000);
  await durchspielen(page);
  const nach1 = await bild(page);
  console.log(`\nNach Maschine 1 (${nach1.name}):`);
  console.log(`  Runde:  „${nach1.runde}"`);
  console.log(`  Fertig: „${nach1.fertig}"`);
  pruefe(nach1.runde.length > 0, 'nach der ersten steht ein Angebot da');
  pruefe(nach1.fertig === '', 'nach der ersten steht NICHT schon „Runde fertig"');

  // ── Maschine 2, über das Angebot der Runde ─────────────────────────────
  await page
    .locator('.maschine-runde')
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(2500);
  const auf2 = await bild(page);
  console.log(`\nDie Runde führte zu: ${auf2.name}`);
  pruefe(auf2.name !== nach1.name, 'die Runde führt zu einer ANDEREN Maschine');

  await durchspielen(page);
  const nach2 = await bild(page);
  console.log(`\nNach Maschine 2 (${nach2.name}):`);
  console.log(`  Runde:  „${nach2.runde}"`);
  console.log(`  Fertig: „${nach2.fertig}"`);
  pruefe(
    nach2.runde === '',
    `DER BEFUND: nach der letzten Maschine bietet die Runde weiter an — „${nach2.runde}"`
  );
  pruefe(/2/.test(nach2.fertig), `das Ende steht da und nennt die Zahl — „${nach2.fertig}"`);

  // ── Die Tiefe verlassen — die Runde ist vorbei ─────────────────────────
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  const draussen = await page.evaluate(() => document.body.classList.contains('tiefe-offen'));
  pruefe(!draussen, 'die Tür ist wieder zu');

  await zumStandort(page);
  await page
    .locator('.standort-maschine')
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(2500);
  const wieder = await bild(page);
  console.log(`\nNach Verlassen und Wiederkommen (${wieder.name}):`);
  console.log(`  Runde:  „${wieder.runde}"`);
  console.log(`  Fertig: „${wieder.fertig}"`);
  pruefe(
    wieder.fertig === '',
    `beim neuen Besuch steht kein altes „fertig" mehr da — „${wieder.fertig}"`
  );

  await ctx.close();
} finally {
  vorschau.kill();
}

console.log(befunde.length ? `\n${befunde.length} Befunde.` : '\nDie Runde endet.');
process.exit(befunde.length ? 1 : 0);
