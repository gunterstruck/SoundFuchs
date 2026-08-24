/**
 * PWA-Wächter: einmal online installieren, danach ohne Netz neu starten.
 *
 * Zusätzlich wechselt die bereits offline laufende deutsche App auf
 * Französisch. Damit ist belegt, dass ein verzögertes Sprachpaket nicht nur
 * den Online-Start verkleinert, sondern weiterhin im PWA-Vorrat liegt.
 *
 * Ausgeführt wird gegen `dist/` – also vorher `npm run build`.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright fehlt. Bitte zuerst `npm ci` ausführen.');
  process.exit(1);
}

const freierPort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const port = await freierPort();
const vorschau = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { stdio: 'ignore' }
);

let bereit = false;
for (let versuch = 0; versuch < 80; versuch += 1) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  try {
    if ((await fetch(`http://127.0.0.1:${port}/`)).ok) {
      bereit = true;
      break;
    }
  } catch {
    // Der Vorschau-Server startet noch.
  }
}
if (!bereit) {
  vorschau.kill();
  console.error('Die gebaute App wurde nicht rechtzeitig erreichbar.');
  process.exit(1);
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({
  locale: 'de-DE',
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'allow',
});
const page = await context.newPage();
const seitenfehler = [];
page.on('pageerror', (fehler) => seitenfehler.push(fehler.message));
const befunde = [];
const pruefe = (bedingung, satz) => {
  console.log(`${bedingung ? '✓' : '✗'} ${satz}`);
  if (!bedingung) befunde.push(satz);
};

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      document.getElementById('global-search')?.getAttribute('placeholder') ===
      'Standort, Maschine, PLZ suchen…',
    { timeout: 15_000 }
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), {
    timeout: 15_000,
  });

  const vorOffline = await page.evaluate(() => ({
    gesteuert: Boolean(navigator.serviceWorker.controller),
    fremdsprachenGeladen: performance
      .getEntriesByType('resource')
      .some((eintrag) => /locale-(?:fr|es|zh)-/.test(eintrag.name)),
  }));
  pruefe(vorOffline.gesteuert, 'der installierte Service Worker steuert die offene PWA');
  pruefe(
    !vorOffline.fremdsprachenGeladen,
    'der deutsche Online-Start lädt kein fremdes Sprachpaket'
  );

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForFunction(
    () =>
      document.getElementById('global-search')?.getAttribute('placeholder') ===
      'Standort, Maschine, PLZ suchen…',
    { timeout: 15_000 }
  );
  const offline = await page.evaluate(() => ({
    gesteuert: Boolean(navigator.serviceWorker.controller),
    lang: document.documentElement.lang,
  }));
  // `navigator.onLine` ist nur ein Hinweis des Betriebssystems und bleibt in
  // manchen Chromium-Umgebungen trotz gesperrtem Netzwerk auf `true`. Eine
  // absichtlich nicht vorgehaltene JSON-Anfrage beweist den Zustand direkt.
  const netzGesperrt = await page.evaluate(async () => {
    try {
      await fetch(`/version.json?netzprobe=${Date.now()}`, { cache: 'no-store' });
      return false;
    } catch {
      return true;
    }
  });
  pruefe(netzGesperrt, 'der zweite Start läuft tatsächlich ohne Netz');
  pruefe(offline.gesteuert, 'der Offline-Start kommt aus der installierten PWA');
  pruefe(offline.lang === 'de', 'die deutsche Oberfläche ist offline vollständig');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true });
    window.dispatchEvent(new Event('languagechange'));
  });
  await page.waitForFunction(
    () =>
      document.getElementById('global-search')?.getAttribute('placeholder') ===
      'Rechercher site, machine, code postal…',
    { timeout: 15_000 }
  );
  const franzoesisch = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    platzhalter: document.getElementById('global-search')?.getAttribute('placeholder') ?? '',
  }));
  pruefe(
    franzoesisch.lang === 'fr' && franzoesisch.platzhalter.startsWith('Rechercher'),
    'ein noch nicht benutztes Sprachpaket steht auch offline bereit'
  );
  pruefe(seitenfehler.length === 0, 'Online- und Offline-Start erzeugen keinen Seitenfehler');
} finally {
  await context.setOffline(false).catch(() => {});
  await context.close();
  await browser.close();
  vorschau.kill();
}

if (befunde.length > 0) {
  console.error(`\n${befunde.length} Offline-Befund(e).`);
  process.exit(1);
}

console.log('\n✓ Die PWA startet offline und hält optionale Sprachen weiter vor.');
