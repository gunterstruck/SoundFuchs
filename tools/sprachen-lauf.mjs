/**
 * Browserwächter für die verzögert geladenen Sprachpakete.
 *
 * Jede Gerätesprache muss beim ersten Bild vollständig übersetzt sein. Zugleich
 * darf Französisch auf einem deutschen Gerät nicht im Netzprotokoll stehen.
 * Der letzte Block prüft außerdem einen Sprachwechsel während die App läuft.
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

const SPRACHEN = [
  ['de-DE', 'de', 'Standort, Maschine, PLZ suchen…', null],
  ['en-US', 'en', 'Search site, machine, postcode…', null],
  ['fr-FR', 'fr', 'Rechercher site, machine, code postal…', 'locale-fr-'],
  ['es-ES', 'es', 'Buscar ubicación, máquina, código postal…', 'locale-es-'],
  ['zh-CN', 'zh', '搜索地点、机器、邮编…', 'locale-zh-'],
];

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
const befunde = [];
const pruefe = (bedingung, satz) => {
  console.log(`${bedingung ? '✓' : '✗'} ${satz}`);
  if (!bedingung) befunde.push(satz);
};

try {
  for (const [locale, sprache, erwartet, eigenesBuendel] of SPRACHEN) {
    const context = await browser.newContext({
      locale,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const seitenfehler = [];
    page.on('pageerror', (fehler) => seitenfehler.push(fehler.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      (text) => document.getElementById('global-search')?.getAttribute('placeholder') === text,
      erwartet,
      { timeout: 15_000 }
    );

    const stand = await page.evaluate(() => ({
      sprache: document.documentElement.lang,
      platzhalter: document.getElementById('global-search')?.getAttribute('placeholder') ?? '',
      sprachbuendel: performance
        .getEntriesByType('resource')
        .map((eintrag) => new URL(eintrag.name).pathname.split('/').pop() ?? '')
        .filter((name) => name.startsWith('locale-')),
    }));

    console.log(`\n${locale}: ${stand.platzhalter}`);
    pruefe(stand.sprache === sprache, `${locale} setzt <html lang="${sprache}">`);
    pruefe(stand.platzhalter === erwartet, `${locale} übersetzt das erste Bild vollständig`);
    pruefe(seitenfehler.length === 0, `${locale} erzeugt keinen Seitenfehler`);
    if (eigenesBuendel) {
      pruefe(
        stand.sprachbuendel.length === 1 && stand.sprachbuendel[0].startsWith(eigenesBuendel),
        `${locale} lädt ausschließlich sein eigenes optionales Sprachpaket`
      );
    } else {
      pruefe(
        stand.sprachbuendel.length === 0,
        `${locale} lädt kein optionales Sprachpaket beim Start`
      );
    }

    if (sprache === 'en') {
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true });
        window.dispatchEvent(new Event('languagechange'));
      });
      const franzoesisch = SPRACHEN.find((eintrag) => eintrag[1] === 'fr')[2];
      await page.waitForFunction(
        (text) => document.getElementById('global-search')?.getAttribute('placeholder') === text,
        franzoesisch,
        { timeout: 15_000 }
      );
      pruefe(
        await page.evaluate(() => document.documentElement.lang === 'fr'),
        'ein Sprachwechsel während der Laufzeit wartet auf das neue Wörterbuch'
      );
    }

    await context.close();
  }
} finally {
  await browser.close();
  vorschau.kill();
}

if (befunde.length > 0) {
  console.error(`\n${befunde.length} Sprachbefund(e).`);
  process.exit(1);
}

console.log('\n✓ Alle Gerätesprachen sind vollständig, aber nur bei Bedarf im Startpfad.');
