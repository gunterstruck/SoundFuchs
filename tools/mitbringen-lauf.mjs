/**
 * DER MITBRING-LAUF — kommt ein Geräusch von außen wirklich an?
 *
 * Der Auftraggeber: Menschen filmen, was komisch klingt. SoundFuchs soll die
 * Datei entgegennehmen, die Tonspur herauslösen und mit denselben Methoden
 * verarbeiten wie eine eigene Aufnahme.
 *
 * Gemessen werden zwei Wege:
 *
 * 1. **Eine Datei, die dieser Browser lesen kann** (WAV): Vorschau, Ausschnitt,
 *    Übernahme — und danach liegt der Ton wirklich im Analyseblatt.
 * 2. **Das echte Telefonvideo des Auftraggebers** (MP4, HEVC + AAC-LC): Der
 *    Testbrowser hat kein AAC. Erwartet wird deshalb NICHT, dass es klappt,
 *    sondern dass ein **benannter Satz** dasteht statt eines stillen
 *    Fehlschlags. Genau dafür gibt es den Fall „format".
 *
 * Ausgeführt wird gegen `dist/` — also vorher `npm run build`. Die beiden
 * Dateien liegen in `dist/__probe/` (nicht im Bestand, `dist/` ist ignoriert).
 *
 *   npm run mitbringen
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

/**
 * Die Prüfdatei entsteht hier — sie liegt nicht im Bestand.
 *
 * Sie ist absichtlich geformt: 0–2 s laut, 2–4 s fast still, ab 4 s
 * gleichmäßig. Damit ist prüfbar, ob der Vorschlag für den Ausschnitt den
 * lauten Anfang meidet — bei einem gleichförmigen Ton wäre jede Antwort
 * richtig, und der Wächter hätte nichts gemessen.
 *
 * Der erste Versuch legte sie unter `dist/__probe/`. Das war falsch: Der Build
 * räumt `dist/` und nahm dem Lauf beim nächsten Mal seine Grundlage.
 */
function schreibePruefton(pfad) {
  const rate = 16000;
  const sekunden = 14;
  const bilder = rate * sekunden;
  const daten = Buffer.alloc(bilder * 2);
  for (let i = 0; i < bilder; i += 1) {
    const t = i / rate;
    const amp = t < 2 ? 0.9 : t < 4 ? 0.05 : 0.25;
    daten.writeInt16LE(Math.round(amp * 32767 * Math.sin(2 * Math.PI * 220 * t)), i * 2);
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

const arbeitsordner = mkdtempSync(join(tmpdir(), 'mitbringen-'));
const WAV = join(arbeitsordner, 'geraeusch.wav');
schreibePruefton(WAV);

/**
 * Das echte Telefonvideo — nur, wenn eines dasteht.
 *
 * Es gehört niemandem außer dem Auftraggeber und liegt deshalb nicht im
 * Bestand. Wer es hat, gibt den Pfad mit:
 *
 *   BEISPIELVIDEO=/pfad/zum/film.mp4 npm run mitbringen
 */
const VIDEO = process.env.BEISPIELVIDEO ?? '';

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

  // Karte → Standort → Maschine
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
  await page.waitForTimeout(1200);
  await page
    .locator('.popup-scharnier')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(1600);
  await page
    .locator('.standort-maschine')
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(2500);

  // ── Der Weg hinein ──────────────────────────────────────────────────────
  const weg = await page.evaluate(() => {
    const b = document.querySelector('.maschine-mitbringen');
    const k = b?.getBoundingClientRect();
    return {
      text: b?.textContent?.trim() ?? '',
      hoch: k ? Math.round(k.height) : 0,
      imBild: k ? k.bottom <= window.innerHeight : false,
      primaer: document.querySelector('.maschine-aktion')?.textContent?.trim() ?? '',
    };
  });
  console.log('\n=== Der Weg hinein ===');
  console.log(`  eine Handlung             ${weg.primaer || '(fehlt)'}`);
  console.log(`  Geräusch mitbringen       ${weg.text || 'FEHLT'} (${weg.hoch} px)`);
  pruefe(weg.text.length > 0, 'auf der Maschinenseite führt kein Weg zu einer mitgebrachten Datei');
  pruefe(weg.hoch >= 44, `„Geräusch mitbringen" ist ${weg.hoch} px hoch`);
  pruefe(weg.imBild, '„Geräusch mitbringen" steht nicht ohne Scrollen im Bild');

  // ── 1. Eine lesbare Datei ───────────────────────────────────────────────
  console.log('\n=== Eine Datei, die dieser Browser lesen kann (WAV, 14 s) ===');
  const wahl = page.waitForEvent('filechooser');
  await page.locator('.maschine-mitbringen').click();
  (await wahl).setFiles(WAV).catch(() => {});
  await page
    .waitForFunction(() => Boolean(document.querySelector('.mitbringen-nehmen')), null, {
      timeout: 30000,
    })
    .catch(() => {});
  const sicht = await page.evaluate(() => {
    const leinwand = document.querySelector('.mitbringen-wellenbild');
    const fenster = document.querySelector('.mitbringen-fenster');
    const c = leinwand?.getContext?.('2d');
    let gemalt = false;
    if (leinwand && leinwand.width > 0 && c) {
      const d = c.getImageData(0, 0, leinwand.width, leinwand.height).data;
      for (let i = 3; i < d.length; i += 4 * 37) {
        if (d[i] > 8) {
          gemalt = true;
          break;
        }
      }
    }
    const fk = fenster?.getBoundingClientRect();
    const wk = leinwand?.getBoundingClientRect();
    return {
      dauer: document.querySelector('.mitbringen-dauer')?.textContent?.trim() ?? '',
      gemalt,
      fensterBreite: fk && wk && wk.width ? Math.round((fk.width / wk.width) * 100) : 0,
      fensterLinks: fk && wk && wk.width ? Math.round(((fk.left - wk.left) / wk.width) * 100) : 0,
      hoeren: document.querySelector('.mitbringen-hoeren')?.textContent?.trim() ?? '',
      nehmen: document.querySelector('.mitbringen-nehmen')?.textContent?.trim() ?? '',
      video: document.querySelectorAll('.mitbringen-video').length,
      hinweis: document.querySelector('.mitbringen-hinweis')?.textContent?.trim() ?? '',
    };
  });
  console.log(`  Dauer                     ${sicht.dauer || '(fehlt)'}`);
  console.log(`  Wellenform                ${sicht.gemalt ? 'gemalt' : 'LEER'}`);
  console.log(
    `  Ausschnitt                ${sicht.fensterBreite} % breit, beginnt bei ${sicht.fensterLinks} %`
  );
  console.log(`  Knöpfe                    ${sicht.hoeren} · ${sicht.nehmen}`);
  console.log(`  Bild                      ${sicht.video === 0 ? 'keins (Audiodatei)' : 'da'}`);
  pruefe(sicht.nehmen.length > 0, 'die Vorschau kam nicht zustande');
  pruefe(sicht.gemalt, 'die Wellenform ist leer — eine Leinwand mit Maßen ist kein Bild');
  pruefe(/14[.,]0 s/.test(sicht.dauer), `die Dauer stimmt nicht — „${sicht.dauer}"`);
  pruefe(
    sicht.fensterBreite >= 60 && sicht.fensterBreite <= 80,
    `der Ausschnitt ist ${sicht.fensterBreite} % breit statt rund 71 % (10 s von 14 s)`
  );
  /**
   * Der Vorschlag meidet den lauten, wechselhaften Anfang.
   *
   * Die Prüfdatei ist absichtlich so gebaut: 0–2 s laut, 2–4 s fast still,
   * ab 4 s gleichmäßig. Ein Vorschlag bei 0 % wäre keiner.
   */
  pruefe(
    sicht.fensterLinks >= 10,
    `der vorgeschlagene Ausschnitt beginnt bei ${sicht.fensterLinks} % — er meidet den lauten Anfang nicht`
  );
  pruefe(sicht.video === 0, 'eine Audiodatei zeigt ein Videobild');
  pruefe(sicht.hinweis.length > 0, 'die Vorschau sagt nicht, was man mit dem Ausschnitt tun kann');

  // Übernehmen — und nachsehen, ob der Ton wirklich im Analyseblatt liegt.
  await page
    .locator('.mitbringen-nehmen')
    .click({ timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(3000);
  const danach = await page.evaluate(() => ({
    dialogWeg: document.querySelectorAll('.mitbringen-dialog').length === 0,
    blattOffen: document.body.classList.contains('sheet-open'),
    reiter: document.querySelector('.tab-button.active')?.textContent?.trim() ?? '(keiner)',
    /**
     * Quellenknöpfe gibt es hier KEINE — und das ist richtig.
     *
     * Ein mitgebrachtes Geräusch kommt ohne Normalzustand. Zwischen
     * „Normalzustand", „Unterschied" und „Iris" gäbe es nichts zu wählen; das
     * Klangbild lässt die Reihe dann weg. Der erste Versuch dieses Wächters
     * forderte trotzdem Quellen und meldete „der Ton liegt nicht im Blatt",
     * obwohl er dalag.
     */
    quellen: [...document.querySelectorAll('#tab-zweid .klangbild-quelle')].map((b) =>
      b.textContent.trim()
    ),
    leerzustand: document.querySelectorAll('#tab-zweid .blatt-leer').length,
    bild: (() => {
      const c = document.querySelector('#tab-zweid .klangbild-flach');
      return Boolean(c && c.width > 0 && c.height > 0);
    })(),
    ebene: document.body.className.match(/tiefe-\w+/g)?.join(' ') ?? '(keine)',
  }));
  console.log('\n=== Nach „Diesen Ausschnitt verwenden" ===');
  console.log(`  Dialog                    ${danach.dialogWeg ? 'zu' : 'STEHT NOCH'}`);
  console.log(
    `  Blatt                     ${danach.blattOffen ? 'offen' : 'ZU'} · ${danach.reiter}`
  );
  console.log(`  Quellen im Blatt          ${danach.quellen.join(' · ') || '(keine)'}`);
  console.log(`  Klangbild                 ${danach.bild ? 'gemalt' : 'LEER'}`);
  pruefe(danach.dialogWeg, 'die Vorschau bleibt nach dem Übernehmen stehen');
  pruefe(danach.blattOffen, 'das Analyseblatt geht nach dem Übernehmen nicht auf');
  pruefe(/2D/.test(danach.reiter), `nach dem Übernehmen steht „${danach.reiter}" offen statt 2D`);
  pruefe(danach.leerzustand === 0, 'der 2D-Reiter zeigt seinen Leerzustand statt des Tons');
  pruefe(danach.bild, 'das Klangbild des mitgebrachten Tons ist leer');
  pruefe(danach.ebene !== '(keine)', 'das Übernehmen hat die Tiefe geschlossen');

  /**
   * Und die beiden anderen Reiter sagen die Wahrheit.
   *
   * Ohne Normalzustand kann das Gebirge keinen Unterschied zeigen — es sagt
   * das, statt leer dazustehen. Das Briefing dagegen arbeitet: Genau für
   * „eine verdächtige Aufnahme ohne bekannten Normalzustand" gibt es den
   * Modus `single-recording`.
   */
  await page
    .locator('.tab-button[data-tab="dreid"]')
    .click({ timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(2500);
  const dreid = await page.evaluate(
    () => document.getElementById('tab-dreid')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  );
  await page
    .locator('.tab-button[data-tab="briefing"]')
    .click({ timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  const brief = await page.evaluate(
    () => document.querySelector('.blatt-briefing-knopf')?.textContent?.trim() ?? ''
  );
  console.log(`  Reiter „3D"               ${dreid.slice(0, 70) || '(leer)'}`);
  console.log(`  Reiter „Briefing"         ${brief || '(kein Knopf)'}`);
  pruefe(
    dreid.length > 0,
    'der 3D-Reiter steht leer da, statt zu sagen, dass ihm der Normalzustand fehlt'
  );
  pruefe(brief.length > 0, 'ohne Normalzustand gibt es kein Briefing — dafür ist es aber gebaut');

  // ── 2. Das echte Telefonvideo ───────────────────────────────────────────
  if (VIDEO && existsSync(VIDEO)) {
    console.log('\n=== Das echte Telefonvideo (MP4, HEVC + AAC-LC, 23,9 MB) ===');
    await page
      .locator('.tab-button[data-tab="zweid"]')
      .click({ timeout: 6000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    const wahl2 = page.waitForEvent('filechooser');
    await page
      .locator('.maschine-mitbringen')
      .click({ force: true })
      .catch(() => {});
    (await wahl2).setFiles(VIDEO).catch(() => {});
    await page
      .waitForFunction(
        () =>
          Boolean(
            document.querySelector('.mitbringen-fehler') ||
            document.querySelector('.mitbringen-nehmen')
          ),
        null,
        { timeout: 60000 }
      )
      .catch(() => {});
    const video = await page.evaluate(() => ({
      fehlersatz: document.querySelector('.mitbringen-fehler p')?.textContent?.trim() ?? '',
      weiter: [...document.querySelectorAll('.mitbringen-fuss button')].map((b) =>
        b.textContent.trim()
      ),
      vorschauDa: Boolean(document.querySelector('.mitbringen-nehmen')),
    }));
    console.log(`  Vorschau                  ${video.vorschauDa ? 'ja' : 'nein'}`);
    console.log(`  Satz                      ${video.fehlersatz || '(keiner)'}`);
    console.log(`  Weg weiter                ${video.weiter.join(' · ') || '(keiner)'}`);
    /**
     * Zwei erlaubte Ausgänge, ein verbotener.
     *
     * Erlaubt: Die Vorschau steht (dann kann der Browser AAC) ODER es steht ein
     * benannter Satz da. Verboten ist ein stiller Fehlschlag — ein Dialog, der
     * nichts sagt, ist von einer kaputten Datei nicht zu unterscheiden.
     */
    pruefe(
      video.vorschauDa || video.fehlersatz.length > 0,
      'das Video scheitert still — kein Satz, keine Vorschau'
    );
    pruefe(
      video.vorschauDa || video.weiter.length > 0,
      'nach dem Fehlschlag gibt es keinen Weg weiter'
    );
    /**
     * Der Satz muss einen Ausweg nennen, nicht nur ein Scheitern.
     *
     * Der erste Versuch prüfte auf das Fehlen der Wörter „Fehler" und „ging
     * nicht". Bei der Falsifikation stand da „Die Datei ließ sich nicht
     * öffnen." — kein verbotenes Wort, und trotzdem eine Sackgasse. Der
     * Wächter ließ sie durch.
     *
     * Gemessen wird deshalb das Gegenteil: Kommt im Satz etwas vor, das man
     * TUN kann — ein anderer Browser, ein anderes Format, eine fehlende
     * Tonspur, ein kürzerer Film?
     */
    const ausweg = /chrome|safari|edge|telefon|wav|webm|tonspur|auflösung|kürze/i;
    pruefe(
      video.vorschauDa || ausweg.test(video.fehlersatz),
      `der Satz nennt keinen Ausweg, nur ein Scheitern — „${video.fehlersatz}"`
    );
  } else {
    console.log('\n(Kein BEISPIELVIDEO gesetzt — Teil 2 entfällt.)');
  }

  console.log(`\nSeitenfehler                ${seitenfehler.length}`);
  pruefe(seitenfehler.length === 0, `Seitenfehler: ${seitenfehler.slice(0, 2).join(' | ')}`);
  await ctx.close();
} finally {
  await browser.close();
  vorschau.kill();
}

console.log(befunde.length ? `\n${befunde.length} Befunde.` : '\nDas Geräusch kommt an.');
process.exit(befunde.length ? 1 : 0);
