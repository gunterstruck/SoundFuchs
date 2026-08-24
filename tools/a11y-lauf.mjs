/**
 * Barrierefreiheits-Wächter für die ausgelieferte PWA.
 *
 * Unit-Tests sehen weder den berechneten Kontrast noch den tatsächlich
 * zusammengesetzten Dialog. Dieser Lauf prüft deshalb den Produktionsbau in
 * Chromium: Startseite auf Handy und Desktop sowie die beiden rechtlich
 * wichtigen Dialoge. Kritische und schwere WCAG-Verstöße stoppen die CI.
 */

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

function freierPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function warteAufServer(url) {
  for (let versuch = 0; versuch < 60; versuch += 1) {
    try {
      const antwort = await fetch(url);
      if (antwort.ok) return;
    } catch {
      // Der Vorschauprozess braucht noch einen Augenblick.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vorschau antwortet nicht: ${url}`);
}

function beschreibe(verstoss) {
  const stellen = verstoss.nodes
    .slice(0, 3)
    .map((node) => node.target.join(' '))
    .join(' · ');
  return `${verstoss.id} (${verstoss.impact ?? 'ohne Einstufung'}): ${verstoss.help} — ${stellen}`;
}

async function pruefeSeite(page, name, selector) {
  let pruefung = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
  ]);
  if (selector) pruefung = pruefung.include(selector);
  const ergebnis = await pruefung.analyze();
  const schwer = ergebnis.violations.filter(
    (verstoss) => verstoss.impact === 'critical' || verstoss.impact === 'serious'
  );
  console.log(`${schwer.length ? '✗' : '✓'} ${name}: ${schwer.length} schwere Verstöße`);
  for (const verstoss of schwer) console.log(`  ${beschreibe(verstoss)}`);
  return schwer;
}

const port = await freierPort();
const url = `http://127.0.0.1:${port}/`;
const vorschau = spawn(
  'npx',
  ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
  { stdio: 'ignore' }
);

let browser;
let fehler = 0;
try {
  await warteAufServer(url);
  browser = await chromium.launch({ headless: true });

  for (const ansicht of [
    { name: 'Startseite mobil', viewport: { width: 390, height: 844 } },
    { name: 'Startseite Desktop', viewport: { width: 1280, height: 900 } },
  ]) {
    const kontext = await browser.newContext({ viewport: ansicht.viewport, locale: 'de-DE' });
    const page = await kontext.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    fehler += (await pruefeSeite(page, ansicht.name)).length;

    if (ansicht.name === 'Startseite mobil') {
      await page.evaluate(() => document.getElementById('datenschutz-btn')?.click());
      await page.locator('#datenschutz-modal').waitFor({ state: 'visible' });
      fehler += (await pruefeSeite(page, 'Datenschutzdialog', '#datenschutz-modal')).length;
      await page.locator('#close-datenschutz-modal').click();

      await page.evaluate(() => document.getElementById('about-btn')?.click());
      await page.locator('#about-modal').waitFor({ state: 'visible' });
      fehler += (await pruefeSeite(page, 'Über-SoundFuchs-Dialog', '#about-modal')).length;
    }

    await kontext.close();
  }
} finally {
  await browser?.close();
  vorschau.kill('SIGTERM');
}

if (fehler) {
  console.error(`\n${fehler} schwere Barrierefreiheitsverstöße gefunden.`);
  process.exit(1);
}

console.log('\n✓ Die geprüften Oberflächen haben keine kritischen oder schweren WCAG-Verstöße.');
