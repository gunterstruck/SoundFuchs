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
  /**
   * Ein reiner Sinus wäre kein Maschinengeräusch.
   *
   * Seit dieser Lauf auch den Normalzustand misst, muss der Ton eines
   * abgeben können: Der Modellbau schaut auf 512 Bänder, und ein einzelner
   * Ton füllt genau eines davon. Deshalb Ton PLUS Rauschen — und das
   * Rauschen aus einem festen Zufallsgenerator, damit zwei Läufe dieselbe
   * Datei ergeben.
   */
  let keim = 12345;
  const wuerfel = () => {
    keim = (keim * 1103515245 + 12345) & 0x7fffffff;
    return keim / 0x3fffffff - 1;
  };
  for (let i = 0; i < bilder; i += 1) {
    const t = i / rate;
    const amp = t < 2 ? 0.9 : t < 4 ? 0.05 : 0.25;
    const wert = 0.55 * Math.sin(2 * Math.PI * 220 * t) + 0.45 * wuerfel();
    daten.writeInt16LE(Math.round(amp * 32767 * wert), i * 2);
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

  /**
   * Das Blatt zuziehen — mit einem echten Zug am Griff.
   *
   * Aufgezogen deckt es die untere Hälfte der Seite ab, und dort steht
   * „Geräusch mitbringen". Ein erzwungener Klick trifft dann das Blatt: Der
   * erste Versuch wartete 30 s vergeblich auf den Dateidialog, weil der Knopf
   * gar nicht angefasst wurde. Der Griff hört auf Zeigergesten, nicht auf
   * `click` — deshalb dieselbe Bewegung, die ein Daumen macht.
   */
  async function blattZuziehen() {
    if (!(await page.evaluate(() => document.body.classList.contains('sheet-open')))) return;
    const kasten = await page.locator('#sheet-grip').boundingBox();
    if (!kasten) return;
    const x = kasten.x + kasten.width / 2;
    const y = kasten.y + kasten.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 500, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(900);
  }

  /**
   * ── 1b. DER MITGEBRACHTE TON ALS NORMALZUSTAND ──────────────────────────
   *
   * Der Auftraggeber: „Dann kann man sein Auto heute filmen und in vier Wochen
   * vergleichen." Gemessen wird deshalb nicht, ob ein Knopf da ist, sondern ob
   * hinterher wirklich ein Normalzustand in der Ablage liegt — und ob der
   * bisherige nie still verschwindet.
   */
  async function messeNormalzustand() {
    console.log('\n=== Der mitgebrachte Ton als Normalzustand ===');
    await blattZuziehen();

    /** Was in der Ablage steht — gelesen aus der Datenbank der Seite selbst. */
    const ablage = () =>
      page.evaluate(() => {
        const name = document.querySelector('.maschine-titelzeile h2')?.textContent?.trim() ?? '';
        return new Promise((fertig) => {
          const anfrage = indexedDB.open('zanobot-db');
          anfrage.onerror = () => fertig({ name, gefunden: false });
          anfrage.onsuccess = () => {
            const db = anfrage.result;
            const tx = db.transaction(['machines', 'recordings'], 'readonly');
            const alle = tx.objectStore('machines').getAll();
            const auf = tx.objectStore('recordings').getAll();
            tx.oncomplete = () => {
              const m = (alle.result ?? []).find((x) => x.name === name);
              if (!m) return fertig({ name, gefunden: false });
              const modelle = m.referenceModels ?? [];
              fertig({
                name,
                gefunden: true,
                id: m.id,
                modelle: modelle.length,
                etiketten: modelle.map((x) => x.label ?? '(ohne)'),
                refAufnahmen: (auf.result ?? []).filter(
                  (r) => r.machineId === m.id && r.type === 'reference'
                ).length,
              });
            };
            tx.onerror = () => fertig({ name, gefunden: false });
          };
        });
      });

    const vorher = await ablage();
    console.log(
      `  vorher                    ${vorher.name} · ${vorher.modelle ?? '?'} Modelle (${(vorher.etiketten ?? []).join(', ') || '—'}) · ${vorher.refAufnahmen ?? '?'} Referenzaufnahmen`
    );
    pruefe(vorher.gefunden, 'die geöffnete Maschine steht nicht in der Ablage — nichts messbar');

    const wahl3 = page.waitForEvent('filechooser');
    await page
      .locator('.maschine-mitbringen')
      .click({ timeout: 8000 })
      .catch(() => {});
    (await wahl3).setFiles(WAV).catch(() => {});
    await page
      .waitForFunction(() => Boolean(document.querySelector('.mitbringen-nehmen')), null, {
        timeout: 30000,
      })
      .catch(() => {});

    const angebot = await page.evaluate(() => {
      const k = document.querySelector('.mitbringen-normal-knopf');
      const kk = k?.getBoundingClientRect();
      const haupt = document.querySelector('.mitbringen-nehmen')?.getBoundingClientRect();
      return {
        satz: document.querySelector('.mitbringen-normal-text')?.textContent?.trim() ?? '',
        knopf: k?.textContent?.trim() ?? '',
        hoch: kk ? Math.round(kk.height) : 0,
        unterHaupt: kk && haupt ? kk.top >= haupt.top : false,
      };
    });
    console.log(`  Satz                      ${angebot.satz || '(keiner)'}`);
    console.log(`  Knopf                     ${angebot.knopf || 'FEHLT'} (${angebot.hoch} px)`);
    pruefe(angebot.knopf.length > 0, 'die Vorschau bietet den Normalzustand gar nicht an');
    pruefe(angebot.hoch >= 44, `„${angebot.knopf}" ist ${angebot.hoch} px hoch`);
    pruefe(
      angebot.satz.length > 20,
      'der Knopf steht ohne Satz da — „Als Normalzustand speichern" allein sagt nicht, was folgt'
    );
    pruefe(
      angebot.unterHaupt,
      'der zweite Ausgang steht ÜBER der einen Handlung — dann ist er nicht mehr der zweite'
    );

    /**
     * §7e: Ein vorhandener Normalzustand wird nie still überschrieben.
     *
     * Das ist die Zusage, die hier fällt oder steht — deshalb wird sie
     * FALSIFIZIERT: erst gefragt, dann abgebrochen, dann nachgesehen, ob in der
     * Ablage wirklich nichts passiert ist.
     */
    const hatteSchonEinen = (vorher.modelle ?? 0) > 0;
    if (hatteSchonEinen) {
      await page
        .locator('.mitbringen-normal-knopf')
        .click({ timeout: 6000 })
        .catch(() => {});
      await page.waitForTimeout(600);
      const frage = await page.evaluate(() => ({
        satz: document.querySelector('.mitbringen-ersetzen-frage')?.textContent?.trim() ?? '',
        antworten: [...document.querySelectorAll('.mitbringen-fuss button')].map((b) =>
          b.textContent.trim()
        ),
        istGespeichert: document.querySelectorAll('.mitbringen-dialog').length === 0,
      }));
      console.log(`  Frage vor dem Ersetzen    ${frage.satz || '(KEINE)'}`);
      console.log(`  Antworten                 ${frage.antworten.join(' · ') || '(keine)'}`);
      pruefe(
        !frage.istGespeichert,
        'der vorhandene Normalzustand wurde ohne Frage ersetzt — genau das darf nie passieren'
      );
      pruefe(
        /ersetz|replace|sustitu|remplac|取代/i.test(frage.satz),
        `die Frage sagt nicht, dass ersetzt wird — „${frage.satz}"`
      );
      pruefe(frage.antworten.length === 2, 'die Frage hat nicht genau zwei benannte Antworten');

      // Abbrechen — und nachsehen, ob die Ablage unberührt ist.
      await page
        .locator('.mitbringen-fuss button')
        .first()
        .click({ timeout: 6000 })
        .catch(() => {});
      await page.waitForTimeout(800);
      const nachAbbruch = await ablage();
      const zurueckInVorschau = await page.evaluate(() =>
        Boolean(document.querySelector('.mitbringen-nehmen'))
      );
      console.log(
        `  nach „Abbrechen"          ${nachAbbruch.modelle} Modelle · Vorschau ${zurueckInVorschau ? 'wieder da' : 'WEG'}`
      );
      pruefe(
        nachAbbruch.modelle === vorher.modelle &&
          nachAbbruch.refAufnahmen === vorher.refAufnahmen,
        'nach „Abbrechen" hat sich die Ablage trotzdem verändert'
      );
      pruefe(zurueckInVorschau, 'nach „Abbrechen" steht die Vorschau nicht wieder da');

      await page
        .locator('.mitbringen-normal-knopf')
        .click({ timeout: 6000 })
        .catch(() => {});
      await page.waitForTimeout(600);
      await page
        .locator('.mitbringen-ersetzen-knopf')
        .click({ timeout: 6000 })
        .catch(() => {});
    } else {
      await page
        .locator('.mitbringen-normal-knopf')
        .click({ timeout: 6000 })
        .catch(() => {});
    }

    /**
     * Warten, bis es einen Ausgang gibt: Dialog zu (gespeichert) oder ein Satz,
     * der sagt, warum nicht. Merkmale ziehen und ein Modell trainieren sind auf
     * einem Telefon Sekunden — hier großzügig eine Minute.
     */
    await page
      .waitForFunction(
        () =>
          document.querySelectorAll('.mitbringen-dialog').length === 0 ||
          Boolean(document.querySelector('.mitbringen-normal-fehler')),
        null,
        { timeout: 60000 }
      )
      .catch(() => {});
    await page.waitForTimeout(2500);

    const ausgang = await page.evaluate(() => ({
      dialogWeg: document.querySelectorAll('.mitbringen-dialog').length === 0,
      fehlersatz: document.querySelector('.mitbringen-normal-fehler')?.textContent?.trim() ?? '',
      wegWeiter: document.querySelector('.mitbringen-normal-fehler + button')?.textContent ?? '',
      fingerabdruck: document.querySelectorAll('.maschine-fingerabdruck').length,
      handlung: document.querySelector('.maschine-aktion')?.textContent?.trim() ?? '',
    }));
    const nachher = await ablage();
    console.log(`  Dialog                    ${ausgang.dialogWeg ? 'zu' : 'steht noch'}`);
    console.log(
      `  nachher                   ${nachher.modelle} Modelle (${(nachher.etiketten ?? []).join(', ') || '—'}) · ${nachher.refAufnahmen} Referenzaufnahmen`
    );

    if (ausgang.dialogWeg) {
      /** Der Erfolgsweg: Es liegt wirklich ein Normalzustand da. */
      console.log(`  Fingerabdruck             ${ausgang.fingerabdruck ? 'gezeigt' : 'nicht da'}`);
      console.log(`  eine Handlung             ${ausgang.handlung || '(fehlt)'}`);
      pruefe(
        (nachher.modelle ?? 0) > 0 && (nachher.etiketten ?? []).includes('Baseline'),
        'der Dialog ging zu, aber in der Ablage steht kein Normalzustand'
      );
      pruefe(
        (nachher.refAufnahmen ?? 0) > (vorher.refAufnahmen ?? 0),
        'der Ton selbst wurde nicht aufbewahrt — dann gibt es in vier Wochen nichts zu vergleichen'
      );
      /**
       * ERSETZT, nicht dazugelegt.
       *
       * Das ist der Unterschied zwischen „der Normalzustand" und „einer von
       * dreien". Nur ein einziges Modell darf `Baseline` heißen — nach genau
       * diesem Namen suchen Geisterbild, Iris und Reihenvergleich.
       */
      const baselines = (nachher.etiketten ?? []).filter((e) => e === 'Baseline').length;
      console.log(`  Modelle namens „Baseline" ${baselines}`);
      pruefe(baselines === 1, `es gibt ${baselines} Modelle namens „Baseline" statt genau einem`);
      if (hatteSchonEinen) {
        pruefe(
          nachher.modelle === vorher.modelle,
          `aus ${vorher.modelle} Modell(en) wurden ${nachher.modelle} — ersetzt wurde nicht, es kam eines dazu`
        );
      }
    } else {
      /**
       * Der abgelehnte Weg ist auch ein Ausgang — aber nur mit Satz UND Weiter.
       *
       * Ein Ausschnitt kann zu kurz oder zu unruhig sein. Dann darf nichts
       * gespeichert werden, und der Nutzer muss lesen können, was jetzt hilft.
       */
      console.log(`  Satz                      ${ausgang.fehlersatz || '(KEINER)'}`);
      console.log(`  Weg weiter                ${ausgang.wegWeiter.trim() || '(KEINER)'}`);
      pruefe(ausgang.fehlersatz.length > 0, 'der Normalzustand kam nicht zustande, und keiner sagt warum');
      pruefe(ausgang.wegWeiter.trim().length > 0, 'nach der Ablehnung gibt es keinen Weg weiter');
      pruefe(
        nachher.modelle === vorher.modelle && nachher.refAufnahmen === vorher.refAufnahmen,
        'abgelehnt — und trotzdem hat sich die Ablage verändert'
      );
      await page
        .locator('.mitbringen-schliessen')
        .click({ timeout: 6000 })
        .catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  // Zweimal: beim ersten Mal hat die Maschine keinen Normalzustand, beim
  // zweiten hat sie einen — und nur dann ist die Ersetzen-Frage messbar.
  await messeNormalzustand();
  await messeNormalzustand();

  // ── 2. Das echte Telefonvideo ───────────────────────────────────────────
  if (VIDEO && existsSync(VIDEO)) {
    console.log('\n=== Das echte Telefonvideo (MP4, HEVC + AAC-LC, 23,9 MB) ===');
    await blattZuziehen();
    const wahl2 = page.waitForEvent('filechooser');
    await page
      .locator('.maschine-mitbringen')
      .click({ timeout: 8000 })
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
