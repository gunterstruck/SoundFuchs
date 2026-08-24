/**
 * DER UPDATE-WEG — führt „Neue Fassung gefunden" irgendwohin?
 *
 * ## Der Anlass
 *
 * Ein Prüfbericht vom 24.08.2026, Schwere „hoch": Auf der ausgelieferten Seite
 * lief trotz neuer Fassung weiter ein alter Stand. Der Knopf „Nach Update
 * suchen" meldete „Neue Fassung gefunden" — und danach geschah nichts. Kein
 * Hinweis, kein Knopf, keine Aktualisierung.
 *
 * Die Ursache lag nicht im Text, sondern in der Sichtbarkeit von Zustand:
 * `updatePending`, `maybeShowPrompt` und `updateSW` lagen in der Closure von
 * `initPwaUpdate`, und `pruefeAufUpdate` daneben. Die Prüfung KONNTE den Fund
 * gar nicht weitergeben.
 *
 * ## Was hier gemessen wird
 *
 * Nicht, ob ein Update existiert — dafür bräuchte es zwei Builds und einen
 * Neustart des Browsers, und der Lauf hinge an einer Serverkonfiguration.
 * Gemessen wird die Stelle, an der der Fehler saß: **Wenn ein Arbeiter
 * wartet, führt der Fund dann zu einer Handlung?**
 *
 * Der Wartestand wird dafür vorgetäuscht — die Anmeldung bekommt ein
 * `waiting`. Das ist keine Abkürzung, sondern genau die Lage, die gemeldet
 * wurde: Eine neue Fassung liegt bereit, und die Frage ist, ob die Oberfläche
 * einen Weg dorthin anbietet.
 *
 * ## Warum die Knöpfe direkt ausgelöst werden
 *
 * „Über SoundFuchs" steht in der Fußzeile hinter dem Scharnier. Der Weg
 * dorthin ist Gegenstand anderer Wächter; hier geht es um das, was der Knopf
 * IM Dialog tut. Ein Lauf, der erst durch die halbe Anwendung navigiert,
 * misst am Ende die Navigation mit und wird von jeder Umstellung dort rot.
 *
 * Ausgeführt wird gegen `dist/` — also vorher `npm run build`.
 *
 *   npm run update-weg
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright fehlt. Bitte zuerst `npm ci` ausführen.');
  process.exit(1);
}

const befunde = [];
const pruefe = (bedingung, text) => {
  console.log(`${bedingung ? '✓' : '✗'} ${text}`);
  if (!bedingung) befunde.push(text);
};

/**
 * Der alte Client kann neuen Anwendungscode nicht ausführen. Deshalb muss der
 * ausgelieferte Worker den Wartestand selbst auflösen. Diese zwei Zusagen
 * werden am tatsächlich erzeugten Artefakt geprüft, nicht nur an vite.config.
 */
const worker = readFileSync('dist/service-worker.js', 'utf8');
pruefe(
  worker.includes('self.skipWaiting()'),
  'der ausgelieferte Worker bleibt hinter einer alten Installation im Wartestand'
);
pruefe(
  /\.clientsClaim\(\)/.test(worker),
  'der ausgelieferte Worker übernimmt bereits offene SoundFuchs-Seiten nicht'
);

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
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
  const seitenfehler = [];
  page.on('pageerror', (e) => seitenfehler.push(e.message));
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);

  console.log('\n=== Ohne wartende Fassung ===');
  await page.evaluate(() => document.getElementById('about-btn')?.click());
  await page.waitForTimeout(1200);
  const ruhe = await page.evaluate(() => ({
    pruefknopf: Boolean(document.querySelector('#check-update-btn')),
    anwendenDa: document.querySelector('#apply-update-btn')
      ? !document.querySelector('#apply-update-btn').hidden
      : null,
  }));
  console.log(`  Prüfknopf                 ${ruhe.pruefknopf ? 'da' : 'FEHLT'}`);
  console.log(
    `  „Jetzt aktualisieren"     ${ruhe.anwendenDa === false ? 'verborgen' : ruhe.anwendenDa}`
  );
  pruefe(ruhe.pruefknopf, 'im Dialog steht kein Knopf, mit dem man von Hand nachsehen kann');
  /**
   * Ein Knopf, der nichts anzuwenden hat, darf nicht dastehen.
   *
   * Sonst tippt jemand darauf und nichts geschieht — dieselbe Sackgasse wie
   * die gemeldete, nur mit vertauschten Rollen.
   */
  pruefe(
    ruhe.anwendenDa === false,
    `ohne wartende Fassung steht „Jetzt aktualisieren" schon da (${ruhe.anwendenDa})`
  );

  console.log('\n=== Mit wartender Fassung ===');
  const vorbereitet = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    // Eine wartende Fassung vortäuschen — genau die gemeldete Lage.
    Object.defineProperty(reg, 'waiting', {
      get: () => ({ state: 'installed' }),
      configurable: true,
    });
    reg.update = () => Promise.resolve();
    return true;
  });
  pruefe(vorbereitet, 'kein Service Worker angemeldet — der Update-Weg ist nicht messbar');

  if (vorbereitet) {
    await page.evaluate(() => document.getElementById('check-update-btn')?.click());
    await page.waitForTimeout(3000);
    const fund = await page.evaluate(() => ({
      status: document.querySelector('#check-update-status')?.textContent?.trim() ?? '',
      anwendenDa: document.querySelector('#apply-update-btn')
        ? !document.querySelector('#apply-update-btn').hidden
        : false,
      anwendenText: document.querySelector('#apply-update-btn')?.textContent?.trim() ?? '',
      anwendenHoch: Math.round(
        document.querySelector('#apply-update-btn')?.getBoundingClientRect().height ?? 0
      ),
    }));
    console.log(`  Status                    ${fund.status || '(keiner)'}`);
    console.log(
      `  „Jetzt aktualisieren"     ${fund.anwendenDa ? `da (${fund.anwendenHoch} px)` : 'FEHLT'}`
    );
    pruefe(fund.status.length > 0, 'die Prüfung sagt nicht, was sie gefunden hat');
    /**
     * DIE ZUSAGE DIESES LAUFS.
     *
     * „Neue Fassung gefunden" ohne Handlung daneben ist genau der gemeldete
     * Fehler. Falsifiziert am 24.08.2026: Nimmt man die Zeile heraus, die den
     * Knopf sichtbar macht, meldet dieser Lauf „FEHLT".
     */
    pruefe(
      fund.anwendenDa,
      'die Prüfung meldet einen Fund und bietet keinen Weg dorthin — die gemeldete Sackgasse'
    );
    pruefe(fund.anwendenHoch >= 44, `„${fund.anwendenText}" ist ${fund.anwendenHoch} px hoch`);
  }

  console.log(`\nSeitenfehler                ${seitenfehler.length}`);
  pruefe(seitenfehler.length === 0, `Seitenfehler: ${seitenfehler.slice(0, 2).join(' | ')}`);
} finally {
  await browser.close();
  vorschau.kill();
}

if (befunde.length > 0) {
  console.log(`\n${befunde.length} Befunde.`);
  for (const b of befunde) console.log(`  ✗ ${b}`);
  process.exit(1);
}
console.log('\nDer Weg zur neuen Fassung ist offen.');
