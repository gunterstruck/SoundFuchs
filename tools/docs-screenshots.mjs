/** Reproduzierbare Guided-Agent-Screenshots aus der echten SoundFuchs-App. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'public/docs/screenshots');
const APP_VERSION = '2.0.0';
const CAPTURE_DATE = '2026-08-29';
const VIEWPORT = { width: 390, height: 844 };
const ONLY_STORY = process.env.DOCS_STORY?.trim() || '';

mkdirSync(OUTPUT, { recursive: true });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

async function startServer(port) {
  const vite = resolve(ROOT, 'node_modules/vite/bin/vite.js');
  const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await sleep(250);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return child;
    } catch { /* Server startet noch. */ }
  }
  child.kill();
  throw new Error(`Vite startete nicht: ${stderr.trim()}`);
}

async function freshPage(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: 'de-DE',
    colorScheme: 'light',
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'language', { get: () => 'de-DE' });
    Object.defineProperty(Navigator.prototype, 'languages', { get: () => ['de-DE', 'de'] });
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#map', { timeout: 20_000 });
  await page.waitForSelector('#btn-info', { state: 'visible', timeout: 20_000 });
  await page.evaluate(async () => {
    const { setLanguage } = await import('/src/i18n/index.ts');
    await setLanguage('de', true);
  });
  await page.waitForFunction(() => document.documentElement.lang === 'de', null, { timeout: 5000 });
  await sleep(2800);
  return { context, page };
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(OUTPUT, name), animations: 'disabled' });
  console.log(`  ${name}`);
}

async function openTraining(page) {
  await page.locator('#btn-info').click();
  await page.waitForSelector('.bottomsheet-visible');
  await page.locator('.info-sheet-row[data-showcase]').click();
  await page.waitForSelector('#showcase-dialog[open]');
}

async function captureStory(browser, baseUrl, { id, captureMs, file }) {
  const { context, page } = await freshPage(browser, baseUrl);
  try {
    await openTraining(page);
    await page.locator(`#showcase-dialog [data-story="${id}"]`).click();
    await page.waitForSelector('.sc-toolbar', { state: 'visible', timeout: 10_000 });
    await sleep(captureMs);
    await shot(page, file);
    await page.locator('.sc-cancel').click().catch(() => {});
  } finally {
    await context.close();
  }
}

const port = await freePort();
const server = await startServer(port);
const baseUrl = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--lang=de-DE',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});

try {
  console.log(`SoundFuchs ${APP_VERSION} · ${CAPTURE_DATE} · echte App-Oberfläche`);

  if (!ONLY_STORY) {
    const { context, page } = await freshPage(browser, baseUrl);
    try {
      await shot(page, 'BILD-START-01-beispieldaten.png');
      const demoClear = page.locator('#btn-demo-clear');
      if (await demoClear.isVisible().catch(() => false)) {
        await demoClear.click();
        await page.waitForSelector('#map-empty-new-site-btn', { state: 'visible', timeout: 15_000 });
      }
      await page.locator('#map-empty-new-site-btn').click();
      await page.waitForSelector('#site-create-modal', { state: 'visible' });
      await shot(page, 'BILD-START-02-standort-anlegen.png');
    } finally {
      await context.close();
    }
  }

  if (!ONLY_STORY) {
    const { context, page } = await freshPage(browser, baseUrl);
    try {
      await openTraining(page);
      await shot(page, 'BILD-SCHULUNG-01-fuenf-live-demos.png');
    } finally {
      await context.close();
    }
  }

  const stories = [
    {
      id: 'core',
      captureMs: 21_000,
      file: 'BILD-NORMAL-01-normalzustand-und-pruefung.png',
    },
    {
      id: 'difference',
      captureMs: 13_000,
      file: 'BILD-UNTERSCHIED-01-hoerlupe.png',
    },
    {
      id: 'import',
      captureMs: 5_000,
      file: 'BILD-IMPORT-01-handyfilm-mitbringen.png',
    },
    {
      id: 'recognition',
      captureMs: 10_000,
      file: 'BILD-ERKENNEN-01-lokaler-treffer.png',
    },
    {
      id: 'briefing',
      captureMs: 16_000,
      file: 'BILD-BRIEFING-01-lokal-vorbereiten.png',
    },
  ];
  const selectedStories = ONLY_STORY ? stories.filter((story) => story.id === ONLY_STORY) : stories;
  if (ONLY_STORY && selectedStories.length === 0) {
    throw new Error(`Unbekannte Mini-Schulung: ${ONLY_STORY}`);
  }
  for (const story of selectedStories) await captureStory(browser, baseUrl, story);
} finally {
  await browser.close();
  server.kill();
}

console.log(`Fertig: ${OUTPUT}`);
