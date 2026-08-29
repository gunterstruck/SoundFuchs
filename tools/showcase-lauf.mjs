/**
 * Browserwächter für alle fünf Mini-Schulungen.
 *
 * Er startet absichtlich mit der kleinsten erlaubten, gespeicherten
 * Blatthöhe. Damit reproduziert er genau den Handyfehler, bei dem nur Reiter
 * zu sehen waren und der vorgeführte Inhalt unterhalb des Bildschirms lag.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORT = { width: 390, height: 844 };
const STORIES = ['core', 'difference', 'import', 'recognition', 'briefing'];
const SHEET_MOMENTS = {
  difference: [
    ['5/11', '.klangbild-quellen'],
    ['7/11', '.hoerlupe'],
    ['10/11', '#tab-dreid'],
  ],
  import: [
    ['4/8', '.klangbild'],
    ['5/8', '#tab-button-briefing'],
    ['8/8', '#tab-briefing'],
  ],
  briefing: [['6/11', '#tab-briefing']],
};

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

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

async function startPreview(port) {
  const vite = resolve(ROOT, 'node_modules/vite/bin/vite.js');
  const child = spawn(
    process.execPath,
    [vite, 'preview', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await pause(200);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return child;
    } catch {
      /* Vite startet noch. */
    }
  }
  child.kill();
  throw new Error(`Vorschau startete nicht: ${stderr.trim()}`);
}

async function openStory(browser, baseUrl, story) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: 'de-DE',
    colorScheme: 'light',
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('sf_sheet_height', '140');
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btn-info', { state: 'visible', timeout: 20_000 });
  await pause(2800);
  await page.evaluate(() => {
    document.documentElement.dataset.showcaseSpeed = '0.12';
  });
  await page.locator('#btn-info').click();
  await page.waitForSelector('.bottomsheet-visible');
  await page.locator('.info-sheet-row[data-showcase]').click();
  await page.waitForSelector('#showcase-dialog[open]');
  await page.locator(`#showcase-dialog [data-story="${story}"]`).click();
  await page.waitForSelector('.sc-toolbar', { state: 'visible', timeout: 10_000 });
  return { context, page };
}

async function runStory(browser, baseUrl, story) {
  const { context, page } = await openStory(browser, baseUrl, story);
  const expected = new Map(SHEET_MOMENTS[story] ?? []);
  const seen = new Set();
  const deadline = Date.now() + 50_000;
  try {
    while (Date.now() < deadline) {
      const state = await page.evaluate((moments) => {
        const progress = document.querySelector('.sc-progress')?.textContent?.trim() ?? '';
        const selector = moments[progress];
        const bubbleVisible = document.querySelector('.sc-bubble')?.classList.contains('sc-show');
        const sidebar = document.getElementById('sidebar');
        const target = selector ? document.querySelector(selector) : null;
        const sidebarRect = sidebar?.getBoundingClientRect();
        const targetRect = target?.getBoundingClientRect();
        return {
          progress,
          bubbleVisible: Boolean(bubbleVisible),
          sheetOpen: Boolean(sidebar?.classList.contains('open')),
          sheetHeight: sidebarRect?.height ?? 0,
          targetVisible: Boolean(
            targetRect &&
            targetRect.width > 0 &&
            targetRect.height > 0 &&
            targetRect.bottom > 0 &&
            targetRect.top < window.innerHeight
          ),
          outcome: document.querySelector('#showcase-dialog[open]')?.dataset.view ?? '',
          failed: Boolean(document.querySelector('.sc-outcome-failed')),
          failure: document.querySelector('.sc-failure-reason')?.textContent?.trim() ?? '',
        };
      }, Object.fromEntries(expected));

      if (state.bubbleVisible && expected.has(state.progress)) {
        if (!state.sheetOpen) throw new Error(`${story} ${state.progress}: Blatt ist geschlossen`);
        if (state.sheetHeight < VIEWPORT.height * 0.7) {
          throw new Error(
            `${story} ${state.progress}: Blatt nur ${Math.round(state.sheetHeight)} px hoch`
          );
        }
        if (!state.targetVisible) {
          throw new Error(
            `${story} ${state.progress}: Ziel ${expected.get(state.progress)} unsichtbar`
          );
        }
        seen.add(state.progress);
      }

      if (state.outcome === 'outcome') {
        if (state.failed) throw new Error(`${story}: ${state.failure || 'unterbrochen'}`);
        for (const progress of expected.keys()) {
          if (!seen.has(progress))
            throw new Error(`${story}: Sichtprüfung ${progress} nicht erreicht`);
        }
        console.log(`✓ ${story}`);
        return;
      }
      await pause(30);
    }
    throw new Error(`${story}: Abschluss nach 50 Sekunden nicht erreicht`);
  } finally {
    await context.close();
  }
}

const port = await freePort();
const server = await startPreview(port);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--lang=de-DE'] });
try {
  for (const story of STORIES) await runStory(browser, `http://127.0.0.1:${port}/`, story);
  console.log('Alle fünf Mini-Schulungen vollständig und sichtbar.');
} finally {
  await browser.close();
  server.kill();
}
