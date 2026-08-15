/**
 * Der Hauptweg, einmal von vorn bis hinten — und die drei Auflagen.
 *
 *   anlegen → Normalzustand aufnehmen → prüfen → Ergebnis      (Schritt 1–11)
 *   Kamerabild · Aufnahmen abspielen · 3D-Gebirge              (Schritt 12–14)
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
 * Seit dem 15.08.2026 stehen hinter dem Hauptweg drei weitere Schritte: die
 * Dinge, die der Auftraggeber ausdrücklich unter Schutz gestellt hat
 * („technisch muss alles erhalten bleiben"). Sie standen bis dahin in jeder
 * Zusammenfassung als „trägt" — aus dem Gedächtnis, nicht aus einer Messung.
 * Vor dem Umbau der Nutzerreise (docs/nutzerreise-wie-tourfuchs.md) ist das
 * nicht tragbar.
 *
 * Die Nummern 1–11 bleiben davon unberührt. Sie messen die LÄNGE des Weges,
 * und genau diese Zahl darf beim Umbau nicht wachsen; Prüfungen anzuhängen
 * würde sie unvergleichbar machen.
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
    // Kamera zusätzlich zum Mikrofon, damit die Absicht im Quelltext steht:
    // Dieser Lauf braucht beides.
    //
    // Wirksam ist die Zeile allerdings nicht — `--use-fake-ui-for-media-stream`
    // weiter oben nimmt jede Anfrage ohnehin an. Ich hatte zuerst das Gegenteil
    // hierhergeschrieben und es beim Falsifizieren widerlegt: Der Lauf ohne
    // „camera" bestand Schritt 12 unverändert. Die Zeile bleibt als Angabe,
    // was gebraucht wird; verlassen darf man sich nicht auf sie.
    permissions: ['microphone', 'camera'],
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

  // ── Auflage 1, hier gemessen, unten berichtet ────────────────────────────
  //
  // Das Kamerabild lebt nur, solange die Prüfung läuft: `renderDashboard()`
  // baut es beim Start und räumt es beim Beenden wieder ab. Es lässt sich
  // deshalb nicht nachträglich prüfen — die Messung muss hier stehen, das
  // Urteil steht unten bei den anderen beiden Auflagen.
  //
  // Geprüft wird nicht, dass ein <video> im Markup ist, sondern dass Bilder
  // ankommen: `videoWidth > 0` heißt, die Kamera liefert wirklich. Ein
  // stummes Element mit Breite null sähe im Quelltext gleich aus.
  const kamera = await page.evaluate(() => {
    const v = document.getElementById('diagnosis-video');
    const geist = document.getElementById('ghost-overlay-image');
    return {
      video: Boolean(v),
      breite: v ? v.videoWidth : 0,
      geistbild: Boolean(geist),
    };
  });

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

  // Hier endet der Hauptweg, und zwar bewusst beim gespeicherten Ergebnis: Das
  // war die Frage. Die Schritte 1–11 bleiben deshalb unverändert und
  // vergleichbar — sie messen die Länge des Weges, und diese Zahl darf beim
  // Umbau der Oberfläche nicht wachsen.

  // ═══════════════════════════════════════════════════════════════════════
  // DIE AUFLAGEN
  //
  // Drei Dinge hat der Auftraggeber ausdrücklich unter Schutz gestellt:
  // „technisch muss alles erhalten bleiben — das Kamerabild bei der Prüfung,
  // das Abspielen der Aufnahmen, das 3D-Gebirge."
  //
  // Bis zum 15.08.2026 bewachte sie nichts. Sie standen in jeder
  // Zusammenfassung als „trägt", aber niemand hatte sie je automatisch
  // angefasst — das Wort kam aus dem Gedächtnis, nicht aus einer Messung.
  // Vor dem Umbau der Nutzerreise (docs/nutzerreise-wie-tourfuchs.md) ist das
  // nicht tragbar: Man kann keine Umstellung mit einem Messgerät prüfen, das
  // die kritischen Stellen gar nicht ansieht.
  //
  // Sie stehen bewusst NACH dem Hauptweg und mit eigenen Nummern: Der Weg zum
  // Ergebnis wird dadurch nicht länger, und die Zahl 11 bleibt vergleichbar.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n  — Auflagen —');

  pruefe(
    12,
    'Kamerabild während der Prüfung',
    kamera.video && kamera.breite > 0 && kamera.geistbild,
    kamera.video
      ? `${kamera.breite} px breit${kamera.geistbild ? ', Positionsbild darüber' : ', OHNE Positionsbild'}`
      : 'kein Videobild im Prüfbild'
  );

  // Abspielen und Gebirge liegen im Verlauf einer Maschine, und der Weg
  // dorthin ist ein Profi-Weg: Der Verlaufs-Knopf an der Zeile trägt
  // `data-view-level="expert"`. Also erst aufräumen, dann die Stufe wechseln —
  // kein Kunstgriff, sondern derselbe Weg, den ein Mensch geht.
  //
  // Das Aufräumen ist nicht Beiwerk: Nach der Prüfung liegt das Ergebnis-
  // Fenster über der Seite und fängt jeden Klick ab. Wer es überspringt,
  // bekommt einen Zeitablauf und hält ihn für einen Fehler der Auflage.
  // Geschlossen wird über die Schließen-Knöpfe der Fenster, und danach wird
  // gewartet, bis wirklich keines mehr offen ist. Das Warten ist der Punkt:
  // Ein Fenster braucht nach dem Klick noch einen Moment, und wer sofort
  // weitertippt, trifft es noch — der Lauf scheitert dann mit einem
  // Zeitablauf, der wie ein Fehler der Auflage aussieht und keiner ist.
  for (let versuch = 0; versuch < 12; versuch++) {
    const offen = await page.evaluate(() => {
      const sichtbar = [...document.querySelectorAll('.modal')].filter(
        (m) => getComputedStyle(m).display !== 'none'
      );
      for (const m of sichtbar) m.querySelector('.close-modal-btn')?.click();
      return sichtbar.length;
    });
    if (offen === 0) break;
    await page.waitForTimeout(700);
  }

  // Frisch laden statt die Liste zu überreden: Der Verlaufs-Knopf erscheint
  // nur an einer Zeile, deren Maschine schon eine Prüfung hat, und die Liste
  // stand hier schon vor der Prüfung. Ein Neuladen ist der ehrlichste Weg zu
  // einer aktuellen Liste — die Daten liegen in IndexedDB und überleben es.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.locator('.view-level-btn[data-level="expert"]').first().click();
  await page.waitForTimeout(1500);

  /**
   * Tippen, wenn es etwas zu tippen gibt — sonst weitergehen.
   *
   * Ohne diese Vorsicht endet der Lauf mit einem Stapelabzug von Playwright,
   * sobald ein Knopf fehlt: „Timeout 30000ms exceeded". Beim Falsifizieren am
   * 15.08.2026 ist genau das passiert — ohne gespeicherte Aufnahmen starb der
   * Lauf, statt „✗ 13" zu melden.
   *
   * Das ist kein Schönheitsfehler. Beim Umbau der Nutzerreise wird genau
   * dieser Fall eintreten: Ein Knopf zieht um, wird umbenannt, landet in einem
   * Reiter. Wer dann einen Stapelabzug bekommt statt eines Befundes, muss erst
   * das Messgerät verstehen, bevor er die Sache versteht.
   */
  const tippeWennDa = async (auswahl, warten = 900) => {
    const el = page.locator(auswahl).first();
    if ((await el.count()) === 0) return false;
    await el.click({ force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(warten);
    return true;
  };

  const verlaufDa = await tippeWennDa('.machine-history-link', 2000);
  // Im Verlauf liegt jede Prüfung eingeklappt; „Anhören" steckt in der
  // Detailzeile darunter. Erst aufklappen, dann tippen — sonst greift man
  // nach einem Knopf, der zwar im Dokument steht, aber nicht zu sehen ist.
  await tippeWennDa('.history-item-header');
  const anhoerenDa = await tippeWennDa('.history-item-listen-btn', 3500);

  // Geprüft wird beides: dass das Blatt mit seinen Knöpfen da ist UND dass
  // überhaupt Ton dahinterliegt. Ein Blatt ohne Aufnahme wäre ein Knopf, der
  // nichts abspielt — genau die Sorte Fehler, die diese Sitzung mehrfach
  // gefunden hat.
  const knoepfe = await page.locator('.listen-controls .listen-btn').count();
  const tonDa = await page.evaluate(async () => {
    const db = await new Promise((r, j) => {
      const x = indexedDB.open('zanobot-db');
      x.onsuccess = () => r(x.result);
      x.onerror = () => j(x.error);
    });
    if (![...db.objectStoreNames].includes('recordings')) return 0;
    const rec = await new Promise((r, j) => {
      const q = db.transaction('recordings').objectStore('recordings').getAll();
      q.onsuccess = () => r(q.result);
      q.onerror = () => j(q.error);
    });
    return rec.filter((x) => x.audioBuffer).length;
  });

  // Der Weg dorthin gehört zur Auflage: Ein Abspielen, das man nicht erreicht,
  // ist keins. Deshalb nennt der Zusatz, an welcher Stelle es hakt.
  const wegHinweis = !verlaufDa
    ? 'kein Verlaufs-Knopf an der Maschinenzeile'
    : !anhoerenDa
      ? 'kein „Anhören" im Verlauf'
      : `${knoepfe} Knöpfe · ${tonDa} Aufnahmen mit Ton`;

  pruefe(
    13,
    'Aufnahmen abspielen',
    verlaufDa && anhoerenDa && knoepfe > 0 && tonDa > 0,
    wegHinweis
  );

  // Das Gebirge entsteht erst beim Tippen auf seinen Chip — Matrix, WebGL und
  // die spektrale Subtraktion sind bewusst nachgelagert. Der Test muss den
  // Chip also wirklich drücken; ein vorhandenes Panel allein sagt nichts.
  const gebirgePanel = await page
    .locator('.spectro3d-panel')
    .isVisible()
    .catch(() => false);
  let leinwand = false;
  if (gebirgePanel) {
    await tippeWennDa('.spectro3d-panel .listen-btn', 3500);
    leinwand = await page.evaluate(() => {
      const c = document.querySelector('.spectro3d canvas');
      return Boolean(c && c.width > 0 && c.height > 0);
    });
  }

  pruefe(
    14,
    '3D-Gebirge',
    gebirgePanel && leinwand,
    gebirgePanel ? (leinwand ? 'Leinwand steht' : 'Panel da, aber keine Leinwand') : 'kein Panel'
  );

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

console.log('\n✓ Der Hauptweg trägt von vorn bis hinten, die Auflagen stehen.');
