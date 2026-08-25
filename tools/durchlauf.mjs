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
 * Der Lauf ist Teil der Browser-Freigabe in CI. Navigation, Aufnahme und
 * Prüfung werden damit vor jedem Merge dort geprüft, wo ein Mensch tippt.
 *
 * Voraussetzung wie bei attention-check:
 *   npm ci && npx playwright install chromium
 *   PLAYWRIGHT_CHROMIUM_PATH=/pfad/zu/chrome npm run durchlauf
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schreibeKlang } from './klang.mjs';

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
  console.error('Playwright fehlt. Bitte zuerst `npm ci` ausführen.');
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

  // Die Beispieldaten draußen lassen.
  //
  // Der Stamm füllt eine leere Karte beim ersten Besuch selbst — 1,2 Sekunden
  // nach dem Kartenaufbau. Der Prüfweg beginnt aber im Leerzustand („Erste
  // Maschine anlegen"), und ob der noch dasteht, hinge damit daran, wer
  // schneller ist. Genau die Sorte Fehler, die wie Zufall aussieht.
  //
  // Abgesagt wird über denselben Merkposten, den auch der „Entfernen"-Knopf
  // setzt: der Zustand eines Nutzers, der die Beispieldaten weggeräumt hat.
  await page.addInitScript(() => localStorage.setItem('sf_beispieldaten_abgelehnt', 'ja'));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  /**
   * Hinter das Scharnier.
   *
   * Seit dem 16.08.2026 ist die Oberfläche vor dem Scharnier die von TourFuchs
   * übernommene Schale mit der Standortkarte (§0h). Der Prüfweg — anlegen,
   * Normalzustand aufnehmen, prüfen, hören, sehen — liegt dahinter, in
   * `#zanobo-tiefe`. Diese Fläche ist im Ruhezustand verborgen; ohne sie
   * träfen alle Schritte auf ein `display: none`.
   *
   * Das Aufmachen ist kein Schritt des Prüfwegs, sondern seine Voraussetzung,
   * und steht deshalb hier oben und nicht als zwölfte Nummer: Die Zahlen 1–11
   * messen die LÄNGE des Weges, und genau die soll vergleichbar bleiben.
   *
   * Vorher stand hier `zurueckInDenBestand()`, der Rückweg aus der Prüf-
   * Zoomstufe der alten Schale. Die Schale gibt es nicht mehr; die Stufen
   * ebenfalls nicht. Was bleibt, ist eine Tür — und ein offenes Fenster, das
   * jeden Klick abfängt, bleibt ein offenes Fenster.
   */
  const inDieTiefe = async () => {
    for (let versuch = 0; versuch < 6; versuch += 1) {
      const stand = await page.evaluate(() => ({
        offen:
          document.body.classList.contains('tiefe-offen') &&
          document.body.classList.contains('tiefe-bestand'),
        fenster: [...document.querySelectorAll('.modal')].some(
          (m) => getComputedStyle(m).display !== 'none'
        ),
      }));
      if (stand.offen && !stand.fenster) return;

      // Ein offenes Fenster fängt jeden Klick ab, auch einen erzwungenen.
      if (stand.fenster) {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
        continue;
      }

      // Die Tür von innen aufmachen. Der Weg über einen Standort auf der Karte
      // wäre der des Nutzers, taugt hier aber nicht als Voraussetzung: Er
      // hinge an den Beispieldaten und daran, welcher Punkt gerade wo liegt.
      // Der Prüfweg soll den Prüfweg messen, nicht die Kartenlage.
      await page.evaluate(() => {
        const tiefe = document.getElementById('zanobo-tiefe');
        if (!tiefe) return;
        tiefe.hidden = false;
        // Auf der Bestandsebene, nicht auf der Standort-, Maschinen- oder
        // Arbeitsebene.
        //
        // Seit dem Umbau der Nutzerreise liegen hinter der Tür vier Ebenen:
        // `standort`, `maschine`, `arbeit` und `bestand`. Der Prüfweg beginnt
        // im Bestand (Maschine anlegen) und läuft dann in der Arbeitsebene —
        // beide zeigen die bisherige Oberfläche, die Bestandsebene zusätzlich
        // mit Liste und Anlegen-Karte.
        //
        // Die anderen Ebenen müssen dabei WEG. Sie sind Geschwister, keine
        // Schichten: `tiefe-maschine` blendet die Bestandsliste aus, und wer
        // nur `tiefe-bestand` dazulegt, steht auf zwei Ebenen gleichzeitig und
        // sieht die Liste trotzdem nicht. Aufgefallen ist das, seit der
        // gespeicherte Normalzustand von selbst auf die Maschinenebene
        // zurückführt (17.08.2026) — vorher kam der Lauf nie mit einer anderen
        // Ebene hier an.
        document.body.classList.remove('tiefe-maschine', 'tiefe-arbeit');
        document.body.classList.add('tiefe-offen', 'tiefe-bestand');
      });
      await page.waitForTimeout(800);
    }
  };

  console.log('  Schale: Stamm (TourFuchs), Prüfweg hinter dem Scharnier');

  await inDieTiefe();

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

  /**
   * ── DIE SUCHE IN DER KOPFLEISTE ─────────────────────────────────────────
   *
   * Der Auftraggeber am 24.08.2026, mit Bildschirmfoto: „brau" im Feld, und
   * darunter passiert nichts. Gemessen wurden dann ZWEI Fehler übereinander,
   * und keiner davon war zu sehen, solange der andere stand:
   *
   *   1. Die Trefferliste stand auf `display: none` — 0 × 0 px, obwohl
   *      `hidden = false` war und die Treffer im DOM standen. Wer nur das DOM
   *      liest, sieht hier acht Treffer und meldet „geht".
   *   2. Ein Tipp auf einen Maschinen-Treffer öffnete das ALTE Fenster
   *      (`#machine-detail-modal`, gemessen 1280 × 900), während ein
   *      Standort-Treffer daneben die neue Ebene öffnete. Zwei Zeilen
   *      derselben Liste, zwei Oberflächen. Das war vorher nicht zu bemerken,
   *      weil Fehler 1 die Liste unantippbar machte.
   *
   * Deshalb wird hier nicht das DOM gezählt, sondern der GEMALTE Kasten
   * gemessen, und danach wirklich getippt. Der Lauf hat zu diesem Zeitpunkt
   * genau eine Maschine („Pumpe 17"); Standorte gibt es nicht, weil die
   * Beispieldaten abgelehnt sind — die Maschinenhälfte ist die, die brach war.
   */
  await page.fill('#global-search', 'Pumpe');
  await page.waitForTimeout(1200);
  const suchbild = await page.evaluate(() => {
    const liste = document.getElementById('search-results');
    const treffer = [...(liste?.querySelectorAll('.search-hit') ?? [])];
    const kasten = treffer[0]?.getBoundingClientRect();
    return {
      anzahl: treffer.length,
      hoehe: kasten ? Math.round(kasten.height) : 0,
      breite: kasten ? Math.round(kasten.width) : 0,
      name: treffer[0]?.querySelector('.search-hit-name')?.textContent?.trim() ?? '',
    };
  });
  pruefe(
    26,
    'die Suche zeigt einen sichtbaren Treffer',
    suchbild.anzahl > 0 &&
      suchbild.name.includes('Pumpe 17') &&
      suchbild.hoehe >= 44 &&
      suchbild.breite > 0,
    suchbild.anzahl
      ? `„${suchbild.name}" · ${suchbild.breite} × ${suchbild.hoehe} px`
      : 'kein Treffer im Bild',
  );

  /**
   * Der Tipp darf scheitern, der Lauf nicht abstürzen.
   *
   * Bei der Widerlegung von Prüfung 26 (Liste zurück auf `display: none`)
   * flog der Klick mit einer Zeitüberschreitung heraus und riss den ganzen
   * Lauf mit — Prüfung 27 kam gar nicht mehr dazu, sich zu melden. Ein
   * benannter Fehler ist mehr wert als ein Absturz, der drei weitere
   * Prüfungen verschluckt.
   */
  const tippFehler = await page
    .locator('.search-hit[data-art="maschine"]')
    .first()
    .click({ timeout: 4000 })
    .then(() => '')
    .catch((e) => String(e).split('\n')[0]);
  await page.waitForTimeout(1800);
  const nachTipp = await page.evaluate(() => ({
    ebene: document.body.className.match(/tiefe-[\w-]+/g)?.join(' ') ?? '(keine)',
    altesFenster: (() => {
      const m = document.getElementById('machine-detail-modal');
      return Boolean(m) && getComputedStyle(m).display !== 'none';
    })(),
  }));
  pruefe(
    27,
    'ein Treffer öffnet die Maschinenebene, nicht das alte Fenster',
    !tippFehler && nachTipp.ebene.includes('tiefe-maschine') && !nachTipp.altesFenster,
    tippFehler
      ? `nicht antippbar: ${tippFehler}`
      : `${nachTipp.ebene}${nachTipp.altesFenster ? ' · altes Fenster offen' : ''}`,
  );

  // Nach dem Anlegen steht die Schale in der Prüf-Zoomstufe — zurück in den
  // Bestand, bevor der Zeilen-Tipp kommt.
  await inDieTiefe();
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

  /**
   * Zwei gültige Ausgänge, seit dem 17.08.2026.
   *
   * Eine gute Aufnahme speichert sich selbst und zeigt den Fingerabdruck; nur
   * eine unbrauchbare fragt noch nach. Bis dahin stand hier ein
   * `waitForSelector` auf den Speichern-Knopf — der Lauf starb an einem
   * Zeitablauf, statt einen Befund zu melden, und ein toter Wächter sagt nur,
   * dass er tot ist. Gewartet wird deshalb auf beides und berichtet, welches
   * Ende eingetreten ist.
   */
  let ende = null;
  for (let i = 0; i < 100 && !ende; i++) {
    await page.waitForTimeout(1000);
    if (
      await page
        .locator('#review-save-btn')
        .isVisible()
        .catch(() => false)
    ) {
      ende = 'Rückfrage';
    } else if ((await page.locator('.maschine-fingerabdruck').count()) > 0) {
      ende = 'speichert selbst';
    }
  }
  pruefe(
    6,
    'Aufnahme läuft bis zum Ende',
    ende !== null,
    `${mikros} Mikrofone, Ausgang: ${ende ?? 'keiner'}`
  );

  if (ende === 'Rückfrage') await page.locator('#review-save-btn').click();
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
  // Auch hier: Nach der Aufnahme steht die Schale wieder in der Zoomstufe.
  await inDieTiefe();
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

  /**
   * ── EIN ERGEBNIS, EIN ORT ──────────────────────────────────────────────
   *
   * Dieser Lauf ist genau der Weg, um den es geht: Er kommt NICHT über die
   * Maschinenebene herein, sondern über die Bestandsliste (Schritt 8). Bis zum
   * 22.08.2026 landete er deshalb im alten Ergebnisdialog — dieselbe Prüfung,
   * zwei Darstellungen, und nur eine davon bewacht.
   *
   * Geprüft wird beides: dass das Ergebnis auf der Maschinenseite steht (in
   * ihren Worten, mit ihrem Bild) und dass der alte Dialog NICHT aufgeht. Nur
   * das zweite zu prüfen hieße, ein Verschwinden zu messen statt eines Orts.
   */
  await page.waitForTimeout(3000);
  const ergebnisort = await page.evaluate(() => {
    const dialog = document.getElementById('diagnosis-modal');
    const sichtbar = (el) =>
      Boolean(el) &&
      getComputedStyle(el).display !== 'none' &&
      el.getBoundingClientRect().height > 0;
    return {
      aufDerMaschine: document.body.classList.contains('tiefe-maschine'),
      satz: document.querySelector('.maschine-ergebnissatz')?.textContent?.trim() ?? '',
      bild: Boolean(document.querySelector('.klangbild-flach')),
      alterDialog: sichtbar(dialog),
      aufloesung: document.querySelector('.maschine-aufloesung')?.textContent?.trim() ?? '',
    };
  });
  pruefe(
    15,
    'Ergebnis steht auf der Maschinenseite',
    ergebnisort.aufDerMaschine && ergebnisort.satz.length > 0,
    ergebnisort.satz || (ergebnisort.aufDerMaschine ? 'kein Satz' : 'nicht auf der Maschinenebene')
  );
  pruefe(
    16,
    'der alte Ergebnisdialog bleibt zu',
    !ergebnisort.alterDialog,
    ergebnisort.alterDialog ? 'er steht offen' : 'zu'
  );
  /**
   * NEBEN DER ZAHL STEHT IHR MASSSTAB.
   *
   * `resolutionLine.ts` gab es schon, getestet, mit Texten in fünf Sprachen —
   * und seit dem 23.08.2026 stand es nirgends mehr, weil sein Aufrufer im
   * abgerissenen Ergebnisdialog lag (#100). Ein halbes Jahr Denkarbeit, das
   * niemand mehr sah.
   *
   * Warum das zählt: `baselineSpread.ts` hält die eigenen Messwerte des
   * Projekts fest — 93–94 % über verschiedene Geräte, 95–97 % bei bloßer
   * Wiederholung auf demselben Gerät. In diesem Band ist „88 %" ohne Maßstab
   * keine Auskunft. Die Zeile liefert den Maßstab.
   *
   * Geprüft wird, dass sie DA ist und eine Zahl trägt — nicht ihr Wortlaut.
   */
  pruefe(
    25,
    'neben der Ähnlichkeit steht, was sie auflöst',
    ergebnisort.aufloesung.length > 0 && /\d/.test(ergebnisort.aufloesung),
    ergebnisort.aufloesung || '(keine Auflösungszeile)'
  );

  /**
   * ── WIE KRÄFTIG IST DAS BILD, UND FÄNGT ES DEN FINGER? ──────────────────
   *
   * Der Auftraggeber am 23.08.2026, mit Bildschirmfoto: „Das Bild ist fahl.
   * Und wenn ich drauftippe zum Scrollen, geht das nicht."
   *
   * Beides ist am fertigen Bild messbar, und beides gehört hierher: Diese
   * Stelle ist die einzige im ganzen Lauf, an der ein ECHTES Klangbild aus
   * einer echten Aufnahme steht. Berichtet wird immer, geprüft nur, was eine
   * Zusage ist.
   */
  const bildbefund = await page.evaluate(() => {
    /**
     * Das SICHTBARE Klangbild — nicht das erstbeste.
     *
     * Der erste Versuch nahm `document.querySelector('.klangbild-flaeche')`.
     * Das traf das Bild im Analyseblatt: zugezogen, 0 px hoch, Gesten an. Die
     * beiden Zusagen darunter wurden dadurch grün, ohne je das Bild angesehen
     * zu haben, um das es geht. Ein Wächter, der das falsche Ding misst, misst
     * nichts.
     */
    const flaeche = [...document.querySelectorAll('.klangbild-flaeche')].find(
      (f) => f.getBoundingClientRect().height > 0
    );
    const c = flaeche?.querySelector('.klangbild-flach');
    const erg = {
      flaecheHoch: flaeche ? Math.round(flaeche.getBoundingClientRect().height) : 0,
      anteil: flaeche
        ? Math.round((flaeche.getBoundingClientRect().height / window.innerHeight) * 100)
        : 0,
      touchAction: flaeche ? getComputedStyle(flaeche).touchAction : '(keine Fläche)',
      deaktiviert: flaeche ? flaeche.matches(':disabled') : null,
      deckkraft: flaeche ? Number.parseFloat(getComputedStyle(flaeche).opacity) : 0,
      hinweis:
        flaeche
          ?.closest('.klangbild')
          ?.querySelector('.klangbild-ziehhinweis')
          ?.textContent?.trim() ?? '',
    };
    if (!c || !c.width) return { ...erg, bild: null };
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sat = 0;
    let n = 0;
    const eimer = new Array(5).fill(0);
    for (let i = 0; i < d.length; i += 4 * 5) {
      const r = d[i] / 255;
      const gg = d[i + 1] / 255;
      const bb = d[i + 2] / 255;
      const max = Math.max(r, gg, bb);
      const min = Math.min(r, gg, bb);
      sat += max === 0 ? 0 : (max - min) / max;
      // Fünf Körbe entlang des Turbo-Verlaufs: 0 = tiefblau … 4 = rot
      eimer[Math.min(4, Math.floor((r > bb ? (gg > 0.6 ? 0.8 : 1) : gg > 0.4 ? 0.5 : 0.2) * 5))] +=
        1;
      n += 1;
    }
    return {
      ...erg,
      bild: {
        leinwand: `${c.width}×${c.height}`,
        streckung: `${(c.getBoundingClientRect().width / c.width).toFixed(1)}× breit, ${(c.getBoundingClientRect().height / c.height).toFixed(1)}× hoch`,
        glaettung: getComputedStyle(c).imageRendering,
        mittlereSaettigung: +(sat / n).toFixed(3),
        anteilImOberenDrittelDerSkala: Math.round(((eimer[3] + eimer[4]) / n) * 100),
      },
    };
  });
  console.log('\n  — Das Bild auf der Maschinenseite —');
  console.log(`  Leinwand                  ${bildbefund.bild?.leinwand ?? '(kein Bild)'}`);
  console.log(`  gestreckt auf             ${bildbefund.bild?.streckung ?? '—'}`);
  console.log(`  Glättung                  ${bildbefund.bild?.glaettung ?? '—'}`);
  console.log(
    `  Fläche                    ${bildbefund.flaecheHoch} px (${bildbefund.anteil} % des Bildschirms)`
  );
  console.log(`  mittlere Sättigung        ${bildbefund.bild?.mittlereSaettigung ?? '—'}`);
  console.log(`  touch-action              ${bildbefund.touchAction}`);
  console.log(`  Fläche deaktiviert        ${bildbefund.deaktiviert}`);
  console.log(`  Deckkraft                 ${bildbefund.deckkraft}`);
  console.log(`  Hinweis darunter          ${bildbefund.hinweis || '(keiner)'}`);
  /**
   * Die Zusage: Ein Bild, das keine Geste annimmt, darf den Finger auch nicht
   * festhalten. `touch-action: none` sagt dem Browser „hier wird nicht
   * gescrollt" — auf einem Bild, das ein Drittel des Bildschirms einnimmt und
   * nichts tut, ist das eine Sperre ohne Gegenleistung.
   */
  pruefe(
    17,
    'das Bild lässt die Seite scrollen',
    !(bildbefund.deaktiviert === true && bildbefund.touchAction === 'none'),
    `touch-action: ${bildbefund.touchAction}, Fläche deaktiviert: ${bildbefund.deaktiviert}`
  );
  /**
   * Und es verspricht keine Geste, die es nicht gibt.
   */
  pruefe(
    18,
    'der Hinweis verspricht nur, was die Fläche kann',
    !(bildbefund.deaktiviert === true && /Tippen|Ziehen/.test(bildbefund.hinweis)),
    bildbefund.hinweis || '(keiner)'
  );
  /**
   * Und das Bild wird nicht gestreckt.
   *
   * Eine Aufnahme hat so viele Spalten, wie sie Zeitschritte hat — gemessen
   * 76. Läge die Leinwand in dieser Rohgröße vor und der Browser zöge sie auf
   * 356 Bildpunkte, interpolierte er dazwischen: Aus Blöcken würde ein
   * Farbnebel. Genau das war der Befund „das Bild ist fahl" (23.08.2026).
   *
   * Gemessen wird deshalb das Verhältnis von Anzeigebreite zu Leinwandbreite.
   * Es muss 1 sein — dann malt der Browser Bildpunkt auf Bildpunkt.
   */
  const streckung = bildbefund.bild ? Number.parseFloat(bildbefund.bild.streckung) : 0;
  pruefe(
    19,
    'das Bild wird nicht gestreckt',
    streckung > 0 && streckung <= 1.05,
    bildbefund.bild?.streckung ?? '(kein Bild)'
  );
  /**
   * Ein deaktivierter Button erbte 45 % Deckkraft und zog damit einen
   * graublauen Schleier über das gesamte Canvas. Die Farbsättigung im Canvas
   * selbst blieb korrekt; nur die zusammengesetzte Bildschirmdarstellung war
   * fahl. Deshalb muss der Wächter die berechnete Deckkraft der Fläche messen.
   */
  pruefe(
    '19a',
    'das Klangbild wird nicht abgeblendet',
    bildbefund.deckkraft === 1,
    `Deckkraft ${bildbefund.deckkraft}`
  );

  /**
   * ── DAS POSITIONSBILD AUF DER MASCHINENSEITE ────────────────────────────
   *
   * Der Auftraggeber am 23.08.2026: „Das gespeicherte Prüfbild zum Erkennen
   * der Maschine wäre genauso wichtig wie das Referenzspektrum."
   *
   * Es lag in der Ablage und erschien nur WÄHREND einer Prüfung als
   * Geisterbild über der Kamera — auf der Seite, auf der man die Maschine
   * wiedererkennen will, stand es nicht. „Genauso wichtig" heißt: dieselbe
   * Fläche wie das Spektrum, in derselben Quellenzeile.
   *
   * Gemessen wird beides: dass die Quelle da ist UND dass ein Tipp darauf
   * wirklich ein Bild zeigt. Ein Knopf, der eine leere Fläche aufschlägt,
   * wäre schlimmer als keiner.
   */
  const fotoKnopf = page.locator('#maschinen-ansicht .klangbild-quelle', { hasText: 'Foto' });
  const fotoDa = (await fotoKnopf.count()) > 0;
  if (fotoDa)
    await fotoKnopf
      .first()
      .click({ timeout: 6000 })
      .catch(() => {});
  await page.waitForTimeout(700);
  const foto = await page.evaluate(() => {
    const img = document.querySelector('#maschinen-ansicht .klangbild-foto');
    const k = img?.getBoundingClientRect();
    return {
      da: Boolean(img),
      sichtbar: Boolean(img) && !img.hidden && (k?.height ?? 0) > 0,
      geladen: img ? img.naturalWidth > 0 : false,
      groesse: k ? `${Math.round(k.width)}×${Math.round(k.height)}` : '—',
      hinweis:
        document.querySelector('#maschinen-ansicht .klangbild-ziehhinweis')?.textContent?.trim() ??
        '',
    };
  });
  console.log('\n  — Das Positionsbild —');
  console.log(`  Quelle „Foto"             ${fotoDa ? 'da' : 'FEHLT'}`);
  console.log(
    `  Bild                      ${foto.sichtbar ? foto.groesse : 'nicht sichtbar'} · geladen ${foto.geladen}`
  );
  console.log(`  Hinweis                   ${foto.hinweis || '(keiner)'}`);
  pruefe(
    20,
    'das Positionsbild steht als Quelle auf der Maschinenseite',
    fotoDa && foto.sichtbar && foto.geladen,
    fotoDa ? `${foto.groesse}, geladen ${foto.geladen}` : 'keine Quelle „Foto"'
  );

  /**
   * Der Reiter „Details" auf BASIS — hier gemessen, unten geprüft.
   *
   * Gemessen wird jetzt, weil jetzt Basis gilt: Wenige Zeilen weiter stellt
   * der Lauf auf Profi um und kommt nie wieder zurück. Wer diese Messung
   * dorthin verschöbe, prüfte eine Zusage über einen Zustand, den es an der
   * Stelle nicht mehr gibt.
   */
  const detailsAufBasis = await page.evaluate(() => {
    const knopf = document.querySelector('.tab-button[data-tab="details"]');
    return {
      da: Boolean(knopf),
      sichtbar: Boolean(knopf) && knopf.getBoundingClientRect().height > 0,
    };
  });

  /**
   * ── DIE BEIDEN EXPERTENANSICHTEN IM ANALYSEBLATT ────────────────────────
   *
   * Sie gingen mit dem Abriss des alten Ergebnisdialogs (#100) und sind am
   * 23.08.2026 zurückgeholt worden — als Reiter „Details" neben 2D und
   * Gebirge, hinter Profi.
   *
   * Was hier gemessen wird, ist nicht „steht ein Reiter da", sondern ob in ihm
   * wirklich etwas ist:
   *
   *   Kurve       die Leinwand ist hoch UND es sind verschiedene Farben
   *               darauf. Eine leere Leinwand ist genauso hoch wie eine
   *               bemalte — wer nur die Höhe misst, misst nichts.
   *   Rangliste   mindestens ein Betriebspunkt mit Namen und Wert.
   *
   * Und die Gegenprobe: Auf Basis darf der Reiter gar nicht dastehen.
   */
  /**
   * Auf Profi umstellen, OHNE die Maschine zu verlassen.
   *
   * Der erste Versuch hat den Reiter dort gemessen, wo der Lauf ohnehin schon
   * auf Profi war — nach `.tiefe-zurueck` und `inDieTiefe()`. Nur landet
   * `inDieTiefe()` auf der BESTANDSEBENE, nicht auf der Maschinenseite: Der
   * Reiter stand da, war offen, und dahinter lag nichts, weil das Blatt beim
   * Verlassen der Maschine geleert wird. Zwei Befunde, die nichts über die
   * Sache aussagten.
   *
   * Der Schalter liegt unterwegs im Kopfstreifen, und genau dafür liegt er
   * dort: Basis/Profi gilt für die ganze Anwendung und soll erreichbar sein,
   * ohne dass man seine Arbeit verlässt. Also wird hier gemessen, was ein
   * Mensch täte — umschalten und hinsehen.
   */
  await page
    .locator('#depth-switch .view-level-btn[data-level="expert"]')
    .click({ force: true, timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  /**
   * Erst das Blatt aufziehen, dann den Reiter wählen.
   *
   * Auf Guckhöhe sind die Reiter zwar sichtbar, ihr Inhalt aber 0 px hoch —
   * und eine Leinwand, die beim Zeichnen 0 px misst, bleibt leer, auch wenn
   * man das Blatt danach aufzieht. Der erste Versuch hat genau das gemessen
   * und als Befund gemeldet: „0 px hoch, 0 Farbstufen" unter einer sauber
   * gesetzten Überschrift.
   *
   * Ein Mensch zieht auf und tippt dann. Der Griff ist der Weg dorthin.
   */
  await page
    .locator('#sheet-grip')
    .click({ force: true, timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(900);
  await page
    .locator('.tab-button[data-tab="details"]')
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(1600);

  /** Was wirklich in der Ablage steht — damit ein leerer Reiter erklärbar ist. */
  const ablageModelle = await page.evaluate(
    () =>
      new Promise((fertig) => {
        const a = indexedDB.open('zanobot-db');
        a.onerror = () => fertig(-1);
        a.onsuccess = () => {
          const tx = a.result.transaction(['machines'], 'readonly');
          const alle = tx.objectStore('machines').getAll();
          tx.oncomplete = () =>
            fertig((alle.result ?? []).reduce((n, m) => n + (m.referenceModels?.length ?? 0), 0));
          tx.onerror = () => fertig(-1);
        };
      })
  );
  const details = await page.evaluate(() => {
    const feld = document.getElementById('tab-details');
    const c = feld?.querySelector('.blatt-details-canvas');
    const erg = {
      knopfSichtbar:
        (document.querySelector('.tab-button[data-tab="details"]')?.getBoundingClientRect()
          .height ?? 0) > 0,
      feldOffen: Boolean(feld?.classList.contains('active')),
      /**
       * Welche Felder das Blatt WIRKLICH zeigt — nicht welche es meint.
       *
       * Diese Zeile gäbe es nicht ohne einen Fehler vom 23.08.2026: Der neue
       * Reiter trug `data-view-level="expert"`, und die Regel dazu in
       * style.css setzt `display: revert !important`. `revert` wirft die
       * Autorenregeln weg — also auch `.tab-panel { display: none }` UND
       * `.tab-panel.active { display: block }`. Auf Profi stand damit das
       * INAKTIVE Feld „Details" 434 px hoch da, und das aktive „2D" war weg.
       *
       * Gefunden hat es `wow`, an einer ganz anderen Stelle: Die 2D-Auswahl
       * der Hör-Lupe nahm keinen zweiten Rahmen mehr an — sie stand gar nicht
       * mehr im Bild. Ein Wächter, der nur „ist der Knopf sichtbar?" fragt,
       * hätte davon nie etwas gemerkt.
       */
      gezeigteFelder: [...document.querySelectorAll('.tab-panel')]
        .filter((p) => getComputedStyle(p).display !== 'none')
        .map((p) => `${p.id}${p.classList.contains('active') ? '' : ' (NICHT aktiv)'}`),
      leer: feld?.querySelector('.blatt-leer')?.textContent?.trim() ?? '',
      ueberschrift: feld?.querySelector('.blatt-details-kurve h4')?.textContent?.trim() ?? '',
      hoch: c ? Math.round(c.getBoundingClientRect().height) : 0,
      punkte: [...(feld?.querySelectorAll('.ranking-item') ?? [])].map((z) => ({
        name: z.querySelector('.ranking-name')?.textContent?.trim() ?? '',
        wert: z.querySelector('.ranking-score')?.textContent?.trim() ?? '',
        breit: Math.round(z.querySelector('.ranking-bar')?.getBoundingClientRect().width ?? 0),
      })),
      farben: 0,
    };
    if (c && c.width && c.height) {
      /**
       * Wie viele verschiedene Farben liegen auf der Leinwand?
       *
       * Eine leergeräumte Leinwand ist durchsichtig — ein einziger Wert.
       * Achsen, Gitter, Kurve und Spitzen sind mehrere. Gezählt wird grob
       * (auf 32er-Stufen gerundet), damit Kantenglättung nicht als Vielfalt
       * durchgeht.
       */
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const gesehen = new Set();
      for (let i = 0; i < d.length; i += 4 * 7) {
        gesehen.add(`${d[i] >> 5},${d[i + 1] >> 5},${d[i + 2] >> 5},${d[i + 3] >> 5}`);
      }
      erg.farben = gesehen.size;
    }
    return erg;
  });
  console.log('\n  — Der Reiter „Details" —');
  console.log(
    `  auf Basis                 ${detailsAufBasis.sichtbar ? 'SICHTBAR' : 'verborgen'} (im Baum: ${detailsAufBasis.da})`
  );
  console.log(
    `  auf Profi                 ${details.knopfSichtbar ? 'sichtbar' : 'VERBORGEN'} · Feld offen ${details.feldOffen}`
  );
  console.log(`  gezeigte Felder           ${details.gezeigteFelder.join(' · ') || '(keins)'}`);
  console.log(`  Überschrift               ${details.ueberschrift || '(keine)'}`);
  console.log(`  Leinwand                  ${details.hoch} px · ${details.farben} Farbstufen`);
  console.log(
    `  Betriebspunkte            ${details.punkte.length} (Modelle in der Ablage: ${ablageModelle})`
  );
  for (const p of details.punkte.slice(0, 4)) {
    console.log(
      `    ${p.name || '(ohne Namen)'} — ${p.wert || '(ohne Wert)'} · Balken ${p.breit} px`
    );
  }
  if (details.leer) console.log(`  leerer Zustand            ${details.leer}`);

  pruefe(
    21,
    '„Details" steht auf Basis nicht im Weg',
    detailsAufBasis.da && !detailsAufBasis.sichtbar,
    detailsAufBasis.da
      ? `sichtbar: ${detailsAufBasis.sichtbar}`
      : 'der Reiter fehlt ganz — dann kann er auf Profi auch nicht auftauchen'
  );
  /**
   * Genau EIN Feld ist zu sehen, und zwar das aufgeschlagene.
   *
   * Ein Blatt mit zwei sichtbaren Feldern ist kein Schönheitsfehler: Was
   * darunter liegt, ist dann weg, ohne dass irgendwo „zu" steht.
   */
  pruefe(
    22,
    'die Frequenzkurve ist wirklich gezeichnet',
    details.hoch > 100 && details.farben >= 4,
    `${details.hoch} px hoch, ${details.farben} Farbstufen${details.leer ? ` — „${details.leer}"` : ''}`
  );
  /**
   * Der Reiter steht nie stumm da.
   *
   * Zwei Ausgänge sind ehrlich, und beide zählen:
   *
   *   entweder  jeder Betriebspunkt mit Namen und Wert
   *   oder      ein Satz, der sagt, warum nicht — und der die Zahlen nennt
   *
   * Der zweite Fall ist kein Notausgang, sondern der Regelfall dieses Laufs:
   * Das Modell hat bei 48 000 Hz gelernt, die aufbewahrte Messung liegt bei
   * 44 100 Hz. Ein Merkmalsfeld bedeutet dann bei beiden eine andere Frequenz,
   * und GMIA weist den Vergleich zu Recht zurück.
   *
   * Vor dem 23.08.2026 fiel das niemandem auf: Die Wertungen wurden einzeln
   * verworfen, die Liste blieb leer, und der Reiter behauptete „noch kein
   * angelernter Betriebspunkt" — bei einem vorhandenen Normalzustand. Ein
   * stiller Ausfall, der wie eine Auskunft aussah.
   *
   * Geprüft wird deshalb nicht „die Liste ist voll", sondern „es steht etwas
   * da, das trägt". Falsifizierbar bleibt es: Ein leerer Reiter fällt durch,
   * und ein Satz ohne Zahlen ebenfalls.
   */
  const ratenSatz = /\d[\d,.]*\s*kHz[\s\S]*\d[\d,.]*\s*kHz/.test(details.leer);
  pruefe(
    23,
    'die Betriebspunkte stehen mit Namen und Wert da — oder es steht da, warum nicht',
    (details.punkte.length > 0 && details.punkte.every((p) => p.name && p.wert)) || ratenSatz,
    details.punkte.length > 0
      ? details.punkte.map((p) => `${p.name}: ${p.wert}`).join(' · ')
      : ratenSatz
        ? `benannt: „${details.leer}"`
        : `weder Liste noch Begründung${details.leer ? ` — „${details.leer}"` : ''}`
  );

  // Zurück auf den 2D-Reiter — und genau HIER wird nachgesehen.
  await page
    .locator('.tab-button[data-tab="zweid"]')
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(900);
  const nachWechsel = await page.evaluate(() =>
    [...document.querySelectorAll('.tab-panel')]
      .filter((p) => getComputedStyle(p).display !== 'none')
      .map((p) => `${p.id}${p.classList.contains('active') ? '' : ' (NICHT aktiv)'}`)
  );
  console.log(`  nach Wechsel auf 2D       ${nachWechsel.join(' · ') || '(keins)'}`);
  /**
   * Genau EIN Feld ist zu sehen, und zwar das aufgeschlagene — gemessen,
   * NACHDEM woanders hingewechselt wurde.
   *
   * Der erste Versuch maß, während „Details" selbst offen stand. Dort war die
   * Zusage nicht zu verletzen: Das offene Feld ist immer das gezeigte. Beim
   * Falsifizieren blieb die Prüfung grün, obwohl der Fehler wieder eingebaut
   * war — ein Wächter, der zum falschen Zeitpunkt hinsieht, misst nichts.
   *
   * Der Fehler zeigt sich erst beim WEGGEHEN: `display: revert !important`
   * am Feld hebelt `.tab-panel { display: none }` aus, also bleibt „Details"
   * stehen, während „2D" verschwindet. Gemessen am 23.08.2026 auf Profi:
   * #tab-details nicht aktiv, 434 px hoch — #tab-zweid aktiv und unsichtbar.
   */
  pruefe(
    24,
    'das Blatt zeigt genau den Reiter, der aufgeschlagen ist',
    nachWechsel.length === 1 && nachWechsel[0] === 'tab-zweid',
    nachWechsel.join(' · ') || '(keins)'
  );

  // Und zurück auf Basis: Was danach kommt, misst den Hauptweg weiter und soll
  // ihn so vorfinden, wie er ihn immer vorfand — einschließlich der Stufe.
  await page
    .locator('#depth-switch .view-level-btn[data-level="basic"]')
    .click({ force: true, timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(900);

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

  // Nach dem Neuladen steht die Schale wieder im Ruhezustand: Blatt
  // eingeklappt, Bestand unsichtbar. Verlauf und Ergebnis liegen darin.
  await inDieTiefe();

  // Die Ansichtstiefe von hinter dem Scharnier stellen, nicht davor.
  //
  // Diese Zeile ist zweimal umgezogen, und beide Male aus demselben Grund: Es
  // gibt zwei Umschalter für dieselbe Sache — die Pille oben und den großen
  // Umschalter im Einstellungen-Dialog. `main.ts` verdrahtet beide gemeinsam
  // (`.view-level-btn[data-level]`), ein Zustand mit zwei Anzeigen.
  //
  // Erst traf `.first()` die Pille. Dann zog die Pille in den Kopfstreifen,
  // und `.first()` fand die verborgene Kopie im Dialog — daraufhin stand hier
  // `#depth-switch`. Jetzt gehört `#depth-switch` dem Stamm und liegt VOR dem
  // Scharnier; während der Prüfweg läuft, ist `#app` auf `visibility: hidden`,
  // und ein unsichtbarer Knopf lässt sich nicht drücken.
  //
  // Der Umschalter, der hier zählt, ist deshalb der im Dialog: Er liegt hinter
  // dem Scharnier, dort, wo der Prüfweg stattfindet. Der Zustand ist derselbe.
  // Der Weg führt durch das Scharnier — und wieder zurück.
  //
  // Diese Zeile ist zum dritten Mal umgezogen, und jedes Mal aus demselben
  // Grund: Es gibt zwei Umschalter für dieselbe Sache, die Pille oben und den
  // großen Umschalter im Einstellungen-Dialog. `main.ts` verdrahtet beide
  // gemeinsam — ein Zustand, zwei Anzeigen.
  //
  // Erst traf `.first()` die Pille. Dann zog die Pille in den Kopfstreifen,
  // und `.first()` fand die verborgene Kopie im Dialog; daraufhin stand hier
  // `#depth-switch`. Jetzt gehört `#depth-switch` dem Stamm und liegt VOR dem
  // Scharnier: Solange der Prüfweg läuft, steht `#app` auf
  // `visibility: hidden`, und ein unsichtbarer Knopf lässt sich nicht drücken.
  //
  // Der Umweg über den Dialog war der nächste Versuch und scheiterte an einer
  // Rundlauf-Bedingung: „Einstellungen" steht in der Fußzeile nur auf Profi —
  // also genau auf der Stufe, die hier erst eingeschaltet werden soll.
  //
  // Damit ist das hier kein Behelf mehr, sondern die Sache selbst: Basis/Profi
  // gilt für die ganze Anwendung und wird auf der Kartenebene gestellt. Der
  // Lauf geht deshalb hinaus, stellt um und kommt zurück — und misst dabei das
  // Scharnier in beide Richtungen mit.
  await page.locator('.tiefe-zurueck').click({ force: true });
  await page.waitForTimeout(900);
  await page.locator('#depth-switch .view-level-btn[data-level="expert"]').click();
  await page.waitForTimeout(1200);
  await inDieTiefe();
  await page.waitForTimeout(800);

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
    // In die Mitte holen, nicht nur „gerade eben ins Bild".
    //
    // Playwright scrollt so wenig wie möglich; das Ziel landet dann am unteren
    // Rand — und dort liegt der feste Streifen „Einstellungen & mehr". Ein
    // erzwungener Klick trifft, was am Punkt obenauf liegt, also den Streifen.
    // Gemessen: Der Verlaufseintrag wurde angetippt und es öffneten sich die
    // Einstellungen. Ein Mensch scrollt weiter und sieht die Zeile frei —
    // dafür ist der Zuschlag `padding-bottom` am Rumpf da.
    await el
      .evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }))
      .catch(() => {});
    await page.waitForTimeout(200);
    await el.click({ force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(warten);
    return true;
  };

  const verlaufDa = await tippeWennDa('.machine-history-link', 2000);

  // Der Verlauf ist zweistufig: erst die Liste der Maschinen mit Prüfungen
  // (`.history-item` mit Pfeil), dann die Prüfungen dieser einen Maschine
  // (`.history-item-header`). Diese Zwischenstufe fehlte hier bis zum
  // 16.08.2026 — und fiel nicht auf, weil der Lauf damals noch die
  // Beispieldaten mitlud: `.first()` traf eine Demo-Maschine, deren Verlauf
  // an anderer Stelle schon offen stand. Der Schritt war grün und maß das
  // Falsche. Seit der Lauf die Beispieldaten absagt, misst er den eigenen Weg.
  await tippeWennDa('.history-item', 1500);

  // Im Verlauf liegt jede Prüfung eingeklappt; „Anhören" steckt in der
  // Detailzeile darunter. Erst aufklappen, dann tippen — sonst greift man
  // nach einem Knopf, der zwar im Dokument steht, aber nicht zu sehen ist.
  //
  // Aufgeklappt wird, bis es aufgeklappt IST, höchstens dreimal. Ein einzelner
  // Tipp reichte nicht: Die Kopfzeile liegt in der Zeile, und beide hören auf
  // Klicks — der Tipp klappte auf und gleich wieder zu. Gemessen stand danach
  // `<div class="history-item-detail" style="display: none">` da, mit dem
  // Knopf „🔊 Anhören" ordentlich darin. Ein Wächter, der einmal tippt und
  // dann urteilt, hätte hier „Knopf fehlt" gemeldet — und der Knopf war da.
  for (let versuch = 0; versuch < 3; versuch += 1) {
    const offen = await page
      .locator('.history-item-detail')
      .first()
      .isVisible()
      .catch(() => false);
    if (offen) break;
    await tippeWennDa('.history-item-header');
  }
  const anhoerenDa = await tippeWennDa('.history-item-listen-btn', 3500);

  // Beim Fehlschlag sagen, WAS im Verlauf steht — sonst weiß man nur, dass
  // etwas fehlt, und nicht, ob der Verlauf leer ist, die Zeile zu, oder der
  // Knopf wirklich weg. Genau diese drei Fälle waren am 16.08.2026
  // nacheinander dran, und jeder sah von außen gleich aus.
  if (!anhoerenDa || (await page.locator('.listen-controls .listen-btn').count()) === 0) {
    console.log(
      '    Verlauf: ' +
        JSON.stringify(
          await page.evaluate(() => ({
            eintraege: document.querySelectorAll('.history-item').length,
            kopfzeilen: document.querySelectorAll('.history-item-header').length,
            detailOffen: [...document.querySelectorAll('.history-item-detail')].filter(
              (e) => getComputedStyle(e).display !== 'none'
            ).length,
            anhoerenKnopf: document.querySelectorAll('.history-item-listen-btn').length,
            fenster: [...document.querySelectorAll('.modal')]
              .filter((m) => getComputedStyle(m).display !== 'none')
              .map((m) => m.id),
          }))
        )
    );
  }

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
  let richtung = '';
  if (gebirgePanel) {
    await tippeWennDa('.spectro3d-panel .listen-btn', 3500);
    leinwand = await page.evaluate(() => {
      const c = document.querySelector('.spectro3d canvas');
      return Boolean(c && c.width > 0 && c.height > 0);
    });

    /**
     * Die vierte Ansicht: der Unterschied MIT Richtung.
     *
     * Sie ist das Einzige, was zeigt, wenn im Normalzustand etwas war, das
     * jetzt fehlt — der Hörpfad schneidet diese Richtung ab (`max(0, …)`).
     * Geprüft wird nicht, dass ein Chip dasteht, sondern dass nach dem Tipp
     * wirklich etwas gezeichnet ist.
     */
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll('.spectro3d-panel .listen-btn')].map((b) =>
        b.textContent.trim()
      )
    );
    const vorzeichenChip = chips.findIndex((x) => /mehr oder weniger/i.test(x));
    if (vorzeichenChip >= 0) {
      await page.evaluate((i) => {
        document.querySelectorAll('.spectro3d-panel .listen-btn')[i]?.click();
      }, vorzeichenChip);
      await page.waitForTimeout(3500);
      /**
       * Nicht „eine Leinwand ist da", sondern „es ist die richtige".
       *
       * Eine Leinwand mit Maßen sagt nichts — beim Fingerabdruck war genau das
       * schon einmal der blinde Fleck. Die Höhenachse beschriftet sich nach der
       * BEDEUTUNG der Höhe: Bei einem Pegel steht dort „0 dB", beim
       * Unterschied „gleich" und „±N dB". Steht das da, ist die
       * Vorzeichen-Matrix wirklich durchgelaufen.
       */
      const gemalt = await page.evaluate(() => {
        const c = document.querySelector('.spectro3d canvas');
        if (!(c && c.width > 0 && c.height > 0)) return false;
        const achse = [...document.querySelectorAll('.spectro3d-label')].map((e) =>
          e.textContent.trim()
        );
        return achse.includes('gleich') && achse.some((x) => /^±\d+ dB$/.test(x));
      });
      const zeitChip = chips.some((x) => /gleiche zeit|ganze aufnahme/i.test(x));
      richtung = `Richtungsansicht ${gemalt ? 'gezeichnet' : 'LEER'}, Zeitfenster ${
        zeitChip ? 'schaltbar' : 'FEHLT'
      }`;
      leinwand = leinwand && gemalt && zeitChip;
    } else {
      richtung = 'Richtungsansicht FEHLT';
      leinwand = false;
    }
  }

  // Den Reiter „3D" des Analyseblatts aufmachen — das ist der Bildschirm aus
  // dem Foto des Auftraggebers.
  pruefe(
    14,
    '3D-Gebirge',
    gebirgePanel && leinwand,
    gebirgePanel
      ? leinwand
        ? `Leinwand steht · ${richtung}`
        : `Panel da, aber ${richtung || 'keine Leinwand'}`
      : 'kein Panel'
  );

  /**
   * ── DIE KNOPFZEILE FLUCHTET, UND DIE WERKZEUGE STEHEN AM BILD ────────────
   *
   * Der Auftraggeber am 25.08.2026, mit Bildschirmfoto: „Die Knöpfe sind
   * irgendwie ungeordnet und bringen Unruhe rein. Zudem nehmen sie viel Platz
   * weg."
   *
   * Gemessen (390 × 790), vorher:
   *
   *     684    59 – 331   3D-Ansicht schließen │ Messung
   *     736    80 – 310   Normalzustand │ Unterschied
   *     788    41 – 350   Mehr oder weniger │ Ansicht zurücksetzen
   *     840    53 – 337   Stärke vergleichen │ Gleiche Zeit
   *
   * Jede Reihe ein anderer linker UND rechter Rand — das ist zentriertes
   * Umbrechen: Jede Reihe wird so breit, wie ihre Wörter gerade sind. Genau
   * das ist die „Unruhe", und sie ist messbar: gleiche Ränder oder nicht.
   *
   * Gemessen wird die Flucht, nicht eine Höhe. Eine Höhe hinge an der Sprache
   * — „Mehr oder weniger" ist im Englischen kürzer und bräche anders um.
   */
  const zeilen = await page.evaluate(() => {
    const sichtbar = (el) => Boolean(el) && el.getBoundingClientRect().height > 0;
    const panel = [...document.querySelectorAll('.spectro3d-panel')].find(sichtbar);
    if (!panel) return null;

    /**
     * Gemessen wird, was das Auge als Kante sieht — nicht jeder Knopf.
     *
     * Seit die vier Ansichten in einem Block liegen, sitzen ihre Knöpfe 1 px
     * innerhalb dessen Rahmens: Die Knöpfe ergaben 33–357, der Block 32–358.
     * Wer die Knöpfe zählt, meldet einen Versatz, den niemand sieht, und
     * übersieht den Rahmen, den jeder sieht.
     *
     * Geprüft werden deshalb die REIHEN der Zeile (Ausgang, Block) und
     * getrennt davon die Felder INNERHALB des Blocks.
     */
    const reihen = new Map();
    const zeile = panel.querySelector('.spectro3d-toggle-row');
    for (const el of zeile ? zeile.children : []) {
      if (!sichtbar(el)) continue;
      const k = el.getBoundingClientRect();
      const oben = Math.round(k.top);
      const r = reihen.get(oben) ?? { von: Infinity, bis: -Infinity };
      r.von = Math.min(r.von, Math.round(k.left));
      r.bis = Math.max(r.bis, Math.round(k.right));
      reihen.set(oben, r);
    }

    // Und innen: die Felder des Blocks, Reihe für Reihe.
    const innen = new Map();
    for (const b of panel.querySelectorAll('.spectro3d-ansichten .listen-btn')) {
      if (!sichtbar(b)) continue;
      const k = b.getBoundingClientRect();
      const oben = Math.round(k.top);
      const r = innen.get(oben) ?? { von: Infinity, bis: -Infinity };
      r.von = Math.min(r.von, Math.round(k.left));
      r.bis = Math.max(r.bis, Math.round(k.right));
      innen.set(oben, r);
    }
    const leinwand = panel.querySelector('canvas');
    const werkzeug = panel.querySelector('.spectro3d-werkzeug-row');
    return {
      reihen: [...reihen.values()],
      innen: [...innen.values()],
      leinwandOben: leinwand ? Math.round(leinwand.getBoundingClientRect().top) : null,
      werkzeugOben: sichtbar(werkzeug)
        ? Math.round(werkzeug.getBoundingClientRect().top)
        : null,
    };
  });

  const flucht = (rs) => rs.length > 0 && rs.every((r) => r.von === rs[0].von && r.bis === rs[0].bis);
  const raender = zeilen?.reihen ?? [];
  const innen = zeilen?.innen ?? [];
  const zeige = (rs) => rs.map((r) => `${r.von}–${r.bis}`).join(' · ') || '(nichts)';
  pruefe(
    30,
    'die Knöpfe über dem Gebirge stehen in einer Flucht',
    raender.length >= 1 && innen.length >= 1 && flucht(raender) && flucht(innen),
    raender.length ? `außen ${zeige(raender)} · innen ${zeige(innen)}` : 'keine Knopfzeile gefunden'
  );

  /**
   * ── EINE WAHL SIEHT AUS WIE EINE WAHL ────────────────────────────────────
   *
   * Die vier Ansichten schließen einander aus. Als vier einzeln stehende
   * Pillen war das nur durch Tippen zu erfahren: Der einzige Unterschied
   * zwischen gewählt und nicht gewählt war ein farbiger RAND — und ein Rand
   * sagt nicht, dass mit dem einen die anderen drei ausgehen.
   *
   * Geprüft wird die gemalte Fläche, nicht eine Klasse: Ob `listen-btn-active`
   * gesetzt ist, sagt nichts darüber, ob man es sieht. Genau so ist die
   * Trefferliste der Suche monatelang unsichtbar geblieben (Prüfung 26).
   *
   * Und zusätzlich die Auszeichnung: Wer die Seite hört statt sie zu sehen,
   * hört ohne `radiogroup`/`aria-checked` vier gleichrangige Schaltflächen.
   */
  const wahl = await page.evaluate(() => {
    const sichtbar = (el) => Boolean(el) && el.getBoundingClientRect().height > 0;
    const panel = [...document.querySelectorAll('.spectro3d-panel')].find(sichtbar);
    const gruppe = panel?.querySelector('.spectro3d-ansichten');
    if (!sichtbar(gruppe)) return null;
    const felder = [...gruppe.querySelectorAll('.listen-btn')].filter(sichtbar);
    const flaeche = (el) => getComputedStyle(el).backgroundColor;
    const gewaehlt = felder.filter((b) => b.getAttribute('aria-checked') === 'true');
    return {
      anzahl: felder.length,
      gewaehlt: gewaehlt.length,
      rolle: gruppe.getAttribute('role'),
      // Die Füllung der gewählten muss sich von der der anderen unterscheiden.
      fuellungGewaehlt: gewaehlt[0] ? flaeche(gewaehlt[0]) : '',
      fuellungenAndere: [
        ...new Set(felder.filter((b) => !gewaehlt.includes(b)).map(flaeche)),
      ],
    };
  });

  const abgehoben =
    wahl != null &&
    wahl.anzahl >= 2 &&
    wahl.gewaehlt === 1 &&
    wahl.rolle === 'radiogroup' &&
    wahl.fuellungenAndere.length > 0 &&
    !wahl.fuellungenAndere.includes(wahl.fuellungGewaehlt);
  pruefe(
    32,
    'genau eine Ansicht ist gewählt, und man sieht es an ihrer Fläche',
    abgehoben,
    wahl
      ? [
          `${wahl.gewaehlt} von ${wahl.anzahl}`,
          `${wahl.fuellungGewaehlt} gegen ${wahl.fuellungenAndere.join(' / ') || '(nichts)'}`,
          // Die Rolle mitnennen: Fehlt sie, zeigte die Meldung sonst nur
          // Farben, die in Ordnung aussehen — und der Grund bliebe im Dunkeln.
          `Rolle ${wahl.rolle ?? '(keine)'}`,
        ].join(' · ')
      : 'kein Ansichtenblock sichtbar'
  );

  /**
   * Und die Werkzeuge stehen bei dem, worauf sie wirken.
   *
   * Kamera, Maßstab und Zeitfenster stellen etwas am GESEHENEN nach. Über dem
   * Bild waren sie zwei Reihen, die man liest, bevor man weiß, worauf sie sich
   * beziehen — und sie schoben das Gebirge nach unten.
   */
  pruefe(
    31,
    'Kamera, Maßstab und Zeitfenster stehen unter dem Gebirge',
    zeilen?.werkzeugOben != null &&
      zeilen?.leinwandOben != null &&
      zeilen.werkzeugOben > zeilen.leinwandOben,
    zeilen?.werkzeugOben != null
      ? `Leinwand bei ${zeilen.leinwandOben} px, Werkzeuge bei ${zeilen.werkzeugOben} px`
      : 'keine Werkzeugzeile sichtbar'
  );

  /**
   * ── DER VERLAUF BEIM ANKOMMEN ────────────────────────────────────────────
   *
   * Der Auftraggeber am 25.08.2026: „Normalerweise will man doch die Historie
   * sehen, dann prüfen." Gemessen war die ganze Vorgeschichte einer Maschine
   * eine Zahl („Zuletzt 87 %") und ein Link; die letzte Zeile endete bei
   * 381 px von 844 px, darunter lag mehr als die halbe Bildschirmhöhe leer.
   *
   * Der Lauf hat an dieser Stelle genau EINE Prüfung — und aus einem Punkt
   * wird keine Linie. Die zweite wird deshalb direkt in die Ablage gelegt:
   * Geprüft wird die Zeichenregel, nicht die Prüfstrecke; die steht in den
   * Nummern 1–14 und ist dort schon gemessen.
   *
   * Danach wird neu geladen und über die Suche wieder hineingegangen — das ist
   * der Weg des Nutzers und derselbe, den die Nummern 26 und 27 belegen.
   */
  const zweiteAbgelegt = await page.evaluate(async () => {
    const db = await new Promise((r, j) => {
      const x = indexedDB.open('zanobot-db');
      x.onsuccess = () => r(x.result);
      x.onerror = () => j(x.error);
    });
    const maschinen = await new Promise((r, j) => {
      const q = db.transaction('machines').objectStore('machines').getAll();
      q.onsuccess = () => r(q.result);
      q.onerror = () => j(q.error);
    });
    const maschine = maschinen.find((m) => m.name === 'Pumpe 17');
    if (!maschine) return false;
    await new Promise((r, j) => {
      const tx = db.transaction('diagnoses', 'readwrite');
      tx.objectStore('diagnoses').put({
        id: 'durchlauf-zweite',
        machineId: maschine.id,
        timestamp: Date.now() - 86400000,
        healthScore: 92,
        status: 'healthy',
        confidence: 90,
      });
      tx.oncomplete = () => r();
      tx.onerror = () => j(tx.error);
    });
    return true;
  });

  let streifen = { da: false, grund: 'zweite Prüfung nicht ablegbar' };
  if (zweiteAbgelegt) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(7000);
    await page.fill('#global-search', 'Pumpe 17');
    await page.waitForTimeout(1200);
    const treffer = page.locator('.search-hit[data-art="maschine"]').first();
    if (await treffer.count()) {
      await treffer.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(3500);
    }
    streifen = await page.evaluate(() => {
      const kasten = (el) => (el ? el.getBoundingClientRect() : null);
      const bild = kasten(document.querySelector('.maschine-verlaufsbild'));
      const handlung = kasten(
        document.querySelector('.maschine-aktionszeile .action-btn') ??
          document.querySelector('.maschine-aktionszeile button:last-of-type')
      );
      return {
        da: Boolean(bild) && bild.width > 0 && bild.height > 0,
        imBild: Boolean(bild) && bild.top >= 0 && bild.top < window.innerHeight,
        masse: bild ? `${Math.round(bild.width)} × ${Math.round(bild.height)} px` : '(keine Kurve)',
        handlungOben: handlung ? Math.round(handlung.top) : null,
        verlaufOben: bild ? Math.round(bild.top) : null,
      };
    });
  }

  pruefe(
    28,
    'der Verlauf steht beim Ankommen im Bild',
    streifen.da && streifen.imBild,
    streifen.masse ?? streifen.grund
  );

  /**
   * UND ER SCHIEBT DIE HANDLUNG NICHT WEG.
   *
   * Die Frage war „erst die Historie, dann prüfen" — die Antwort ist nicht,
   * das Prüfen nach unten zu schieben. Wer die App aufmacht, will meistens
   * prüfen; der Verlauf ist der Zusammenhang, in dem das Ergebnis steht.
   * Diese Reihenfolge ist eine Zusage und wird deshalb gemessen.
   */
  pruefe(
    29,
    'die eine Handlung steht weiter über dem Verlauf',
    streifen.handlungOben !== null &&
      streifen.verlaufOben !== null &&
      streifen.handlungOben < streifen.verlaufOben,
    streifen.handlungOben !== null
      ? `Handlung bei ${streifen.handlungOben} px, Verlauf bei ${streifen.verlaufOben} px`
      : 'keine Handlung gefunden'
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
