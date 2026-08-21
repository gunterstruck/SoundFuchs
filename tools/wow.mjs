/**
 * DER WOW-DURCHLAUF
 *
 * `durchlauf.mjs` misst, ob der Prüfweg **trägt** — von der leeren Datenbank
 * bis zum gespeicherten Ergebnis, mit den drei Auflagen. Er ist der Wächter
 * der Substanz und darf lang sein.
 *
 * Dieser hier misst etwas anderes: ob der Weg **kurz** ist.
 *
 *   Standort öffnen → Maschine öffnen → Aufnahme → Ergebnis → Unterschied hören
 *
 * Die harten Kriterien des Auftrags sind Zahlen, also werden sie als Zahlen
 * geprüft: Tipps, Bestandszeilen im Arbeitskontext, fokussierbare Elemente,
 * dominante Handlungen, Antippgrößen. Ein Weg, der „sich kurz anfühlt", ist
 * keine Abnahme.
 *
 * ZWEI TEILE
 *
 * 1. **Die Geometrie**, in vier Formaten und ohne Ton: Tipps, Bestandszeilen,
 *    fokussierbare Elemente, dominante Handlungen, Antippgrößen.
 * 2. **Die Reise**, auf dem Handy und mit echtem Mikrofonsignal: Normalzustand
 *    → Fingerabdruck → Gegenprobe → Ergebnis → Unterschied hören.
 *
 * Der zweite Teil startet den Browser ZWEIMAL auf demselben Profil, mit zwei
 * verschiedenen Klängen. Das ist kein Umweg, sondern die einzige ehrliche Art,
 * eine Abweichung zu messen: Chromiums Fake-Mikrofon liest eine Datei, die beim
 * Start feststeht. Der Normalzustand entsteht mit dem sauberen Klang, die
 * Gegenprobe mit einem, der pfeift und klopft — dieselbe Maschine, hörbar
 * anders. Eine Abweichung zu behaupten, indem man dem Ergebnis eine Zahl
 * unterschiebt, würde genau das nicht prüfen, worum es geht.
 *
 * Dabei kommen alle drei Ergebnisfälle des Auftrags vor:
 *
 *   A  Abweichung        → „Unterschied anhören" ist die dominante Handlung
 *   B  klingt wie neu    → „Fertig", die Hör-Lupe bleibt sichtbar erreichbar
 *   C  später wieder auf → „Letzten Unterschied anhören" ohne Umweg
 *
 * WARUM TIPPS UND NICHT SEKUNDEN
 *
 * Sekunden hängen an der Maschine, auf der gemessen wird. Ein Tipp ist eine
 * Entscheidung des Nutzers — davon gibt es auf einem schnellen Rechner genauso
 * viele wie auf einem langsamen. Gezählt wird deshalb, was der Mensch tut,
 * nicht, was der Rechner braucht.
 *
 * Ausgeführt wird gegen `dist/` — also vorher `npm run build`.
 *
 *   npm run wow
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schreibeKlang } from './klang.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

/**
 * Formate der Geometriemessung — und in welchem Farbschema.
 *
 * Das Handy kommt zweimal vor, hell und dunkel. Nicht aus Gründlichkeit:
 * Die Tiefe erbt die Farbmarken des Stamms, und der Stamm definiert sie nur
 * hell. SoundFuchs' Dunkelschema setzt `--bg-primary` auf denselben Wert, den
 * der Stamm für Text benutzt — der Maschinenname stand unsichtbar auf seinem
 * eigenen Hintergrund, Kontrast 1:1. Das sieht man auf einem Bildschirmfoto
 * nur, wenn man hinschaut; gemessen fällt es sofort auf.
 */
const FORMATE = [
  ['handy', { width: 390, height: 844 }, true, 'light'],
  ['handy-dunkel', { width: 390, height: 844 }, true, 'dark'],
  ['tablet-hoch', { width: 820, height: 1180 }, true, 'light'],
  ['tablet-quer', { width: 1180, height: 820 }, true, 'light'],
  ['tisch', { width: 1440, height: 900 }, false, 'light'],
];

/** Die Abnahmewerte des Auftrags. */
const BUDGET = {
  /** Maschinenzeile → Aufnahmefläche: höchstens so viele Tipps. */
  tippsBisAufnahme: 2,
  /** Bestandszeilen im Arbeitskontext. */
  bestandszeilen: 0,
  /** Fokussierbare Elemente auf der Maschinenebene. */
  fokussierbar: 6,
  /** Dominante Handlungen je Bildschirmzustand. */
  primaer: 1,
  /** Kleinstes Antippziel in CSS-Pixeln. */
  antippgroesse: 44,
  /** Ende der Messung → sichtbares Ergebnis. */
  tippsBisErgebnis: 0,
  /** Ergebnis → hörbarer Unterschied. */
  tippsBisUnterschied: 1,
  /**
   * Ungenutzter Bildschirm unter der ruhenden Maschinenseite.
   *
   * Vor dem Klangbild waren es 422 px von 844 — die halbe Fläche stand leer,
   * während das Beste vier Tipps entfernt lag.
   */
  leerRaum: 160,
};

async function freierPort() {
  return new Promise((r) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => r(port));
    });
  });
}

const port = await freierPort();
const vorschau = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  stdio: 'ignore',
});
for (let i = 0; i < 80; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    if ((await fetch(`http://localhost:${port}/`)).ok) break;
  } catch {
    /* noch nicht oben */
  }
}

/**
 * Zwei Klänge für die Reise in Teil 2.
 *
 * Der saubere ist der Normalzustand. Der andere pfeift, klopft und rauscht —
 * dieselbe Maschine, hörbar anders. Chromiums eingebautes Kunstmikrofon liefert
 * Stille, und Stille wird von der Qualitätsprüfung zu Recht abgewiesen.
 */
const arbeitsordner = mkdtempSync(join(tmpdir(), 'soundfuchs-wow-'));
const klangDatei = join(arbeitsordner, 'maschine.wav');
schreibeKlang(klangDatei);

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
  // Teil 1 misst Geometrie und braucht kein Signal; das Fake-Gerät hängt
  // trotzdem dran, damit ein Freigabedialog den Aufbau nicht anhält.
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});

const befunde = [];
const pruefe = (bedingung, text) => {
  if (!bedingung) befunde.push(text);
};

/** Was auf der Maschinenebene steht — als Zahlen. */
const AUFMASS_MASCHINE = () => {
  const sichtbar = (e) => {
    const cs = getComputedStyle(e);
    return (
      cs.display !== 'none' && cs.visibility !== 'hidden' && e.getBoundingClientRect().height > 0
    );
  };
  const tiefe = document.getElementById('zanobo-tiefe');
  const aktion = document.querySelector('.maschine-aktion');
  const kasten = aktion?.getBoundingClientRect();

  // ── Lesbarkeit: Textfarbe gegen den Grund, der wirklich dahinter liegt ──
  const zuRgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const leuchte = ([r, g, b]) => {
    const f = (c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  // Der Grund ist nicht die eigene Hintergrundfarbe — die ist meist
  // durchsichtig. Gesucht wird der erste Vorfahr, der wirklich deckt.
  const grund = (el) => {
    let e = el;
    while (e) {
      const teile = (getComputedStyle(e).backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
      if (teile.length >= 3 && (teile.length < 4 || teile[3] > 0)) return teile.slice(0, 3);
      e = e.parentElement;
    }
    return [255, 255, 255];
  };
  const kontrast = (el) => {
    const a = leuchte(zuRgb(getComputedStyle(el).color));
    const b = leuchte(grund(el));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  // Großer Text darf blasser sein — das ist keine Nachsicht, sondern die
  // Regel: ab 24 px, oder ab 18,66 px wenn fett, reichen 3:1.
  const noetig = (el) => {
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    const fett = parseInt(cs.fontWeight, 10) >= 700;
    return px >= 24 || (fett && px >= 18.66) ? 3 : 4.5;
  };
  // Nur Elemente mit eigenem Text: sonst würde jeder Behälter die Farbe
  // seines Kindes erben und derselbe Befund zehnmal gemeldet.
  const eigenerText = (e) =>
    [...e.childNodes].some((k) => k.nodeType === 3 && k.textContent.trim().length > 1);

  return {
    ebene: document.body.classList.contains('tiefe-maschine'),
    // Ein Fenster, das dieselbe Maschine noch einmal wählen lässt, wäre die
    // Frage, die man mit dem Zeilen-Tipp schon beantwortet hat.
    fenster: [...document.querySelectorAll('.modal')].filter(
      (m) => getComputedStyle(m).display !== 'none'
    ).length,
    bestandszeilen: [...document.querySelectorAll('.machine-item')].filter(sichtbar).length,
    fokussierbar: [
      ...tiefe.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])'
      ),
    ].filter(sichtbar).length,
    scrollHoehe: tiefe.scrollHeight,
    primaer: [...tiefe.querySelectorAll('button.primary')].filter(sichtbar).length,
    urteil: document.querySelector('.maschine-lage')?.textContent?.trim() ?? '',
    aktionsname: aktion?.textContent?.trim() ?? '',
    // Ohne Scrollen im Bild: Der nächste Schritt darf nicht gesucht werden.
    ohneScrollen: kasten ? kasten.bottom <= window.innerHeight : false,
    zuKlein: [...tiefe.querySelectorAll('button')]
      .filter(sichtbar)
      .filter((b) => {
        const k = b.getBoundingClientRect();
        return k.height < 44 || k.width < 44;
      })
      .map((b) => `${b.className || b.id}(${Math.round(b.getBoundingClientRect().height)}px)`),
    blass: [...tiefe.querySelectorAll('*')]
      .filter(sichtbar)
      .filter(eigenerText)
      .map((e) => ({ e, k: kontrast(e), soll: noetig(e) }))
      .filter(({ k, soll }) => k < soll)
      .map(
        ({ e, k, soll }) =>
          `${e.className || e.tagName.toLowerCase()} „${e.textContent
            .trim()
            .slice(0, 18)}" ${Math.round(k * 10) / 10}:1 statt ${soll}:1`
      ),
  };
};

/**
 * Was nach der Referenzaufnahme auf der Maschinenebene steht.
 *
 * Der Fingerabdruck wird nicht daran erkannt, dass eine Leinwand da ist —
 * eine leere Leinwand ist genau der Fehler, den man nicht sehen würde. Gemessen
 * wird die Farbe: Sind Bildpunkte gesetzt, wurde gezeichnet.
 */
const AUFMASS_FINGERABDRUCK = () => {
  const leinwand = document.querySelector('.maschine-iris');
  return {
    ebene: document.body.classList.contains('tiefe-maschine'),
    // Ein Bestätigungsfenster an dieser Stelle stellt eine Frage, deren
    // Antwort schon feststeht — und steht dort, wo gefeiert werden sollte.
    fenster: [...document.querySelectorAll('.modal')].filter(
      (m) => getComputedStyle(m).display !== 'none'
    ).length,
    fingerabdruck: Boolean(document.querySelector('.maschine-fingerabdruck')),
    gezeichnet: (() => {
      if (!leinwand) return false;
      const punkte = leinwand
        .getContext('2d')
        .getImageData(0, 0, leinwand.width, leinwand.height).data;
      for (let i = 3; i < punkte.length; i += 40) if (punkte[i] > 0) return true;
      return false;
    })(),
    beschriftung: leinwand?.getAttribute('aria-label') ?? '',
    urteil: document.querySelector('.maschine-lage')?.textContent?.trim() ?? '',
    aktionsname: document.querySelector('.maschine-aktion')?.textContent?.trim() ?? '',
    hinweis: document.querySelector('.maschine-hinweis')?.textContent?.trim() ?? '',
  };
};

try {
  for (const [name, viewport, touch, farbschema] of FORMATE) {
    const ctx = await browser.newContext({
      viewport,
      hasTouch: touch,
      isMobile: touch,
      locale: 'de-DE',
      colorScheme: farbschema,
      permissions: ['microphone'],
    });
    const page = await ctx.newPage();
    const seitenfehler = [];
    page.on('pageerror', (e) => seitenfehler.push(e.message));

    await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    // Neu laden: Beim ersten Besuch kommen die Beispieldaten erst nach dem
    // Start, und die bisherige Bestandsliste rendert nur beim Init. Der zweite
    // Besuch ist der ehrliche Fall — dort steht der volle Bestand.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);

    // ── Bis zum Standort. Zählt nicht: Das ist die Schale, nicht die Reise. ──
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
    await page.waitForTimeout(1000);
    await page
      .locator('.popup-scharnier')
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1400);

    const standortDa = await page.evaluate(
      () => document.querySelectorAll('.standort-maschine').length > 0
    );
    pruefe(standortDa, `${name}: die Standortansicht zeigt keine Maschinen — der Weg endet hier`);
    if (!standortDa) {
      await ctx.close();
      continue;
    }

    // ── Ab hier zählt der Auftrag ──────────────────────────────────────────
    let tipps = 0;
    const tipp = async (auswahl, warten = 1600) => {
      const el = page.locator(auswahl).first();
      if ((await el.count()) === 0) return false;
      await el.click({ force: true }).catch(() => {});
      tipps += 1;
      await page.waitForTimeout(warten);
      return true;
    };

    await tipp('.standort-maschine'); // 1
    const maschine = await page.evaluate(AUFMASS_MASCHINE);

    await tipp('.maschine-aktion', 2600); // 2
    const arbeit = await page.evaluate(() => {
      const sichtbar = (e) => {
        const cs = getComputedStyle(e);
        return (
          cs.display !== 'none' &&
          cs.visibility !== 'hidden' &&
          e.getBoundingClientRect().height > 0
        );
      };
      const start = [...document.querySelectorAll('button')].find(
        (b) => sichtbar(b) && /aufnahme|aufnehmen|prüfung|starten/i.test(b.textContent)
      );
      const k = start?.getBoundingClientRect();
      return {
        ebene: document.body.classList.contains('tiefe-arbeit'),
        bestandszeilen: [...document.querySelectorAll('.machine-item')].filter(sichtbar).length,
        scrollHoehe: document.getElementById('zanobo-tiefe').scrollHeight,
        startknopf: start ? start.id || start.className.slice(0, 30) : null,
        startImBild: k ? k.bottom <= window.innerHeight : false,
      };
    });

    console.log(`\n=== ${name} (${viewport.width}×${viewport.height}, ${farbschema}) ===`);
    console.log(`  Tipps ab Maschinenzeile   ${tipps} (Budget ${BUDGET.tippsBisAufnahme})`);
    console.log(`  Urteil                    ${maschine.urteil || '(leer)'}`);
    console.log(`  eine Handlung             ${maschine.aktionsname || '(fehlt)'}`);
    console.log(`  Fenster dazwischen        ${maschine.fenster}`);
    console.log(`  Bestandszeilen (Maschine) ${maschine.bestandszeilen}`);
    console.log(`  Bestandszeilen (Arbeit)   ${arbeit.bestandszeilen}`);
    console.log(`  fokussierbar              ${maschine.fokussierbar}`);
    console.log(`  Höhe Maschinenebene       ${maschine.scrollHoehe} px`);
    console.log(`  Höhe Arbeitsebene         ${arbeit.scrollHoehe} px`);
    console.log(`  Primäraktionen            ${maschine.primaer}`);
    console.log(`  ohne Scrollen sichtbar    ${maschine.ohneScrollen ? 'ja' : 'NEIN'}`);
    console.log(`  Aufnahmeknopf im Bild     ${arbeit.startImBild ? 'ja' : 'NEIN'}`);
    console.log(`  zu kleine Antippziele     ${maschine.zuKlein.join(', ') || 'keine'}`);
    console.log(`  zu blasser Text           ${maschine.blass.join(' | ') || 'keiner'}`);

    pruefe(
      tipps <= BUDGET.tippsBisAufnahme,
      `${name}: ${tipps} Tipps von der Maschinenzeile bis zur Aufnahmefläche (erlaubt ${BUDGET.tippsBisAufnahme})`
    );
    pruefe(maschine.ebene, `${name}: die Maschinenzeile führt nicht in die Arbeitsebene`);
    pruefe(
      maschine.fenster === 0,
      `${name}: zwischen Zeile und Maschine steht ein Fenster — die Maschine war schon gewählt`
    );
    pruefe(
      maschine.bestandszeilen === BUDGET.bestandszeilen,
      `${name}: ${maschine.bestandszeilen} Bestandszeilen auf der Maschinenebene`
    );
    pruefe(
      arbeit.bestandszeilen === BUDGET.bestandszeilen,
      `${name}: ${arbeit.bestandszeilen} Bestandszeilen auf der Arbeitsebene — der Bestand ist der Ort, aus dem man KAM`
    );
    pruefe(
      maschine.fokussierbar <= BUDGET.fokussierbar,
      `${name}: ${maschine.fokussierbar} fokussierbare Elemente — was man nicht sieht, soll man auch nicht durchtabben`
    );
    pruefe(
      maschine.primaer === BUDGET.primaer,
      `${name}: ${maschine.primaer} dominante Handlungen statt genau einer`
    );
    pruefe(maschine.ohneScrollen, `${name}: der nächste Schritt steht nicht ohne Scrollen im Bild`);
    pruefe(
      maschine.zuKlein.length === 0,
      `${name}: Antippziele unter ${BUDGET.antippgroesse} px — ${maschine.zuKlein.join(', ')}`
    );
    pruefe(
      maschine.blass.length === 0,
      `${name}: Text unter dem nötigen Kontrast — ${maschine.blass.join(' | ')}`
    );
    pruefe(arbeit.ebene, `${name}: die Primäraktion führt nicht in die Arbeitsebene`);

    pruefe(
      seitenfehler.length === 0,
      `${name}: Seitenfehler — ${seitenfehler.slice(0, 2).join(' | ')}`
    );

    await ctx.close();
  }
} finally {
  await browser.close();
}

/* ═══════════════════════════════════════════════════════════════════════════
   TEIL 2 — DIE REISE, MIT ECHTEM TON

   Zwei Starts auf demselben Profil. Der erste nimmt den Normalzustand auf und
   prüft gegen sich selbst (Fall B), der zweite prüft dieselbe Maschine mit
   einem Klang, der pfeift und klopft (Fall A) — und zeigt beim Öffnen, dass
   die letzte Prüfung nachzuhören ist (Fall C).
   ═══════════════════════════════════════════════════════════════════════════ */

const profil = join(arbeitsordner, 'profil');
const klangAnders = join(arbeitsordner, 'anders.wav');
schreibeKlang(klangAnders, { anders: true });

async function starteHandy(klangDatei) {
  const ctx = await chromium.launchPersistentContext(profil, {
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: 'de-DE',
    permissions: ['microphone'],
    args: [
      '--no-sandbox',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${klangDatei}`,
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const seitenfehler = [];
  page.on('pageerror', (e) => seitenfehler.push(e.message));
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  return { ctx, page, seitenfehler };
}

/** Karte → Standort → Maschinenzeile. Zählt nicht: das ist die Schale. */
async function bisZurMaschine(page) {
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
  await page.waitForTimeout(1000);
  await page
    .locator('.popup-scharnier')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(1400);
  await page
    .locator('.standort-maschine')
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(2000);
}

/**
 * Warten, bis die eine Handlung wirklich dasteht — sichtbar, ausgelegt,
 * bedienbar.
 *
 * Danach wird sie ausgelöst und nicht angezielt. Ein Koordinatenklick trifft
 * das, was in genau diesem Augenblick an der Stelle liegt; die Ebene baut sich
 * aber noch auf, und dann trifft er den Container darunter. Gemessen am
 * 18.08.2026 blieb der Körper danach auf `tiefe-maschine` stehen — der Tipp
 * war lautlos verschwunden, und der Lauf meldete anschließend, das PRODUKT
 * habe kein Ergebnis geliefert.
 *
 * Was die Oberfläche leisten muss, steht damit weiterhin als Prüfung da: Der
 * Knopf muss existieren, Höhe haben und bedienbar sein. Nur das Auslösen
 * braucht keine Koordinaten.
 */
async function warteAufHandlung(page) {
  await page
    .waitForFunction(
      () => {
        const b = document.querySelector('.maschine-aktion');
        return Boolean(b) && b.getBoundingClientRect().height > 0 && !b.disabled;
      },
      null,
      { timeout: 40000 }
    )
    .catch(() => {});
}

/**
 * Eine Prüfung von Hand zu Ende bringen.
 *
 * Die Messung läuft, bis der Nutzer sie beendet — das Beenden ist der letzte
 * Tipp der Messung. Ab da darf bis zum sichtbaren Ergebnis keiner mehr nötig
 * sein, und genau das wird hier gezählt.
 *
 * @returns Tipps zwischen dem Ende der Messung und dem Ergebnis.
 */
async function pruefeUndWarte(page) {
  // Erst die Tatsachen über die Oberfläche, dann auslösen — siehe unten.
  await warteAufHandlung(page);
  await page.evaluate(() => document.querySelector('.maschine-aktion')?.click());

  /**
   * Auf den Zustand warten, nicht auf die Uhr.
   *
   * Hier standen feste 2600 ms. `#diagnose-btn` steht aber schon im Baum,
   * bevor die Arbeitsebene ihn ausgelegt hat — gemessen am 18.08.2026:
   * „inline-block, 0 px". Ein erzwungener Klick auf ein Element ohne Höhe
   * geht ins Leere, und weil der Klick geduldet wird, merkt es niemand.
   *
   * Der Lauf stoppte danach eine Messung, die nie lief, und wartete zwei
   * Minuten auf ein Ergebnis, das es nicht geben konnte. Gemeldet wurde
   * „kein Ergebnis angekommen" — ein Satz über das Produkt, obwohl der
   * Fehler beim Messgerät lag. Seit Schnitt 4 bis 6B lädt die App mehr, und
   * die geratene Zahl war eine Zeitbombe mit Datum.
   */
  const knopfBereit = await page
    .waitForFunction(
      () => {
        const b = document.getElementById('diagnose-btn');
        // Maße UND bedienbar: Der Knopf steht im Baum, bevor seine Phase ihn
        // verkabelt hat, und ist in dieser Zeit abgeschaltet. Nur auf die
        // Höhe zu warten hieße, in genau dieses Fenster hineinzutippen.
        return Boolean(b) && b.getBoundingClientRect().height > 0 && !b.disabled;
      },
      null,
      { timeout: 40000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!knopfBereit) {
    /**
     * Ein Wächter, der nur „ging nicht" sagt, ist ein Wächter, den man
     * überblättert. Wenn der Knopf nie Maße bekommt, gehört ins Protokoll,
     * was stattdessen dastand — sonst beginnt die Suche bei null.
     */
    const gesehen = await page.evaluate(() => {
      const sicht = (id) => {
        const e = document.getElementById(id);
        if (!e) return 'fehlt';
        const cs = getComputedStyle(e);
        return `${cs.display}/${Math.round(e.getBoundingClientRect().height)}px`;
      };
      return {
        koerper: document.body.className.match(/tiefe-\w+/g)?.join(' ') ?? '(keine Ebene)',
        aufnahme: sicht('record-reference-content'),
        pruefung: sicht('run-diagnosis-content'),
        knopf: sicht('diagnose-btn'),
        fenster: [...document.querySelectorAll('.modal')]
          .filter((m) => getComputedStyle(m).display !== 'none')
          .map((m) => m.id)
          .join(',') || 'keine',
      };
    });
    console.log(`  !! Prüfung ließ sich nicht starten: ${JSON.stringify(gesehen)}`);
    return -2;
  }

  /**
   * Auslösen statt zielen.
   *
   * `click({force:true})` tippt auf Koordinaten. Der Abschnitt klappt in
   * diesem Moment noch auf, der Knopf wandert — gemessen am 18.08.2026 traf
   * ein Klick auf die Mitte seines eigenen Rechtecks den Container darunter.
   * Der Tipp verschwand lautlos, und der Lauf meldete danach, das PRODUKT
   * habe kein Ergebnis geliefert. Zwei Läufe, zwei Ergebnisse: ein Wackler
   * im Messgerät, der wie ein Befund aussah.
   *
   * Dass der Knopf sichtbar, ausgelegt und bedienbar ist, wurde eine Zeile
   * vorher geprüft — das sind die Tatsachen über die Oberfläche. Das Auslösen
   * selbst braucht keine Koordinaten.
   */
  await page.evaluate(() => document.getElementById('diagnose-btn')?.click());

  /**
   * Läuft die Messung wirklich? Sonst wäre alles Weitere eine Aussage über
   * einen Lauf, den es nie gab — und die klänge wie ein Befund über das
   * Produkt.
   */
  const laeuft = await page
    .waitForFunction(
      () => {
        const m = document.getElementById('inspection-modal');
        return Boolean(m) && getComputedStyle(m).display !== 'none';
      },
      null,
      { timeout: 40000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!laeuft) return -3;

  await page.waitForTimeout(22000);
  await page.evaluate(() => document.getElementById('inspection-stop-btn')?.click());

  let tippsDanach = 0;
  await page
    .waitForFunction(
      () =>
        document.body.classList.contains('tiefe-maschine') &&
        Boolean(document.querySelector('.maschine-ergebnissatz')),
      null,
      { timeout: 120000 }
    )
    .catch(() => {
      tippsDanach = -1; // kam nie an
    });
  await page.waitForTimeout(1500);
  return tippsDanach;
}

/** Was auf der Ergebnisfläche steht. */
const AUFMASS_ERGEBNIS = () => {
  const sichtbar = (e) => {
    const cs = getComputedStyle(e);
    return (
      cs.display !== 'none' && cs.visibility !== 'hidden' && e.getBoundingClientRect().height > 0
    );
  };
  const tiefe = document.getElementById('zanobo-tiefe');
  const aktion = document.querySelector('.maschine-aktion');
  const kasten = aktion?.getBoundingClientRect();
  const urteilEl = document.querySelector('.maschine-lage');
  const urteilKasten = urteilEl?.getBoundingClientRect();
  return {
    ebene: document.body.classList.contains('tiefe-maschine'),
    fenster: [...document.querySelectorAll('.modal')].filter(
      (m) => getComputedStyle(m).display !== 'none'
    ).length,
    urteil: urteilEl?.textContent?.trim() ?? '',
    satz: document.querySelector('.maschine-ergebnissatz')?.textContent?.trim() ?? '',
    beleg: document.querySelector('.maschine-zuletzt')?.textContent?.trim() ?? '',
    aktionsname: aktion?.textContent?.trim() ?? '',
    primaer: [...tiefe.querySelectorAll('button.primary')].filter(sichtbar).length,
    // Urteil UND Handlung ohne Scrollen im Bild.
    ohneScrollen:
      Boolean(kasten && urteilKasten) &&
      kasten.bottom <= window.innerHeight &&
      urteilKasten.bottom <= window.innerHeight,
    lupe: Boolean(document.querySelector('.hoerlupe')),
    quellen: [...document.querySelectorAll('.hoerlupe-quelle')].map((b) => b.textContent.trim()),
    hervorhebung: [...document.querySelectorAll('.hoerlupe-hervorhebung-knopf')].map((b) =>
      b.textContent.trim()
    ),
    hervorhebungHinweis:
      document.querySelector('.hoerlupe-hervorhebung-hinweis')?.textContent?.trim() ?? '',
    teilenVorherSichtbar: !document.querySelector('.hoerlupe-teilen')?.hidden,
    trotzdem: Boolean(document.querySelector('.maschine-trotzdem')),
    zuKlein: [...tiefe.querySelectorAll('button')]
      .filter(sichtbar)
      .filter((b) => {
        const k = b.getBoundingClientRect();
        return k.height < 44 || k.width < 44;
      })
      .map((b) => `${b.className || b.id}(${Math.round(b.getBoundingClientRect().height)}px)`),
  };
};

/** Läuft gerade eine Quelle — und ist das auch angesagt? */
const AUFMASS_WIEDERGABE = () => {
  const gedrueckt = [
    ...document.querySelectorAll(
      '.hoerlupe-quelle, .hoerlupe-hervorhebung-knopf, .hoerlupe-auswahl-spielen'
    ),
  ].filter((b) => b.getAttribute('aria-pressed') === 'true');
  return {
    anzahl: gedrueckt.length,
    welche: gedrueckt.map((b) => b.className),
    ansage: document.querySelector('.hoerlupe-ansage')?.textContent?.trim() ?? '',
  };
};

try {
  // ── Start 1: sauberer Klang. Normalzustand, Fingerabdruck, Fall B ────────
  {
    const { ctx, page, seitenfehler } = await starteHandy(klangDatei);
    await bisZurMaschine(page);

    await warteAufHandlung(page);
    await page.evaluate(() => document.querySelector('.maschine-aktion')?.click());
    // Auch hier auf Maße warten statt auf die Uhr — siehe `pruefeUndWarte`.
    await page
      .waitForFunction(
        () => {
          const b = document.getElementById('record-btn');
          return Boolean(b) && b.getBoundingClientRect().height > 0 && !b.disabled;
        },
        null,
        { timeout: 40000 }
      )
      .catch(() => {});
    // Auslösen statt zielen — dieselbe Begründung wie in `pruefeUndWarte`.
    await page.evaluate(() => document.getElementById('record-btn')?.click());
    await page
      .waitForFunction(
        () => Boolean(document.querySelector('.maschine-aktion')?.textContent),
        null,
        {
          timeout: 90000,
        }
      )
      .catch(() => {});
    await page
      .waitForFunction(() => Boolean(document.querySelector('.maschine-fingerabdruck')), null, {
        timeout: 90000,
      })
      .catch(() => {});
    await page.waitForTimeout(1200);
    const referenz = await page.evaluate(AUFMASS_FINGERABDRUCK);

    console.log('\n=== Reise, Teil 1: der Normalzustand (sauberer Klang) ===');
    console.log(`  Fenster danach            ${referenz.fenster}`);
    console.log(`  Fingerabdruck gezeichnet  ${referenz.gezeichnet ? 'ja' : 'NEIN'}`);
    console.log(`  Urteil                    ${referenz.urteil || '(leer)'}`);
    console.log(`  nächste Handlung          ${referenz.aktionsname || '(fehlt)'}`);

    pruefe(
      referenz.ebene,
      'Referenz: nach der Aufnahme steht der Nutzer nicht wieder auf der Maschinenebene'
    );
    pruefe(
      referenz.fenster === 0,
      'Referenz: nach einer guten Aufnahme steht ein Bestätigungsfenster — eine gute Aufnahme speichert sich selbst'
    );
    pruefe(
      referenz.fingerabdruck,
      'Referenz: kein Fingerabdruck — der erste Erfolg bleibt unsichtbar'
    );
    pruefe(
      referenz.gezeichnet,
      'Referenz: die Fingerabdruck-Leinwand ist leer — ein Rahmen ohne Bild ist kein Beleg'
    );
    pruefe(
      referenz.beschriftung.length > 0,
      'Referenz: der Fingerabdruck hat keine Beschriftung — ein Bild ohne Text ist für Vorlesende nichts'
    );
    pruefe(
      /gegenprobe/i.test(referenz.aktionsname),
      `Referenz: der nächste Schritt heißt „${referenz.aktionsname}" statt nach der Gegenprobe zu fragen`
    );

    // Fall B: dieselbe Maschine, derselbe Klang → sie klingt wie sie selbst.
    const tippsDanach = await pruefeUndWarte(page);
    const gut = await page.evaluate(AUFMASS_ERGEBNIS);

    console.log('\n=== Reise, Teil 2: Gegenprobe mit demselben Klang (Fall B) ===');
    console.log(`  Tipps Messungsende → Ergebnis  ${tippsDanach}`);
    console.log(`  Urteil                         ${gut.urteil || '(leer)'}`);
    console.log(`  Satz                           ${gut.satz || '(fehlt)'}`);
    console.log(`  Beleg                          ${gut.beleg || '(fehlt)'}`);
    console.log(`  eine Handlung                  ${gut.aktionsname || '(fehlt)'}`);
    console.log(`  Weg zur Hör-Lupe sichtbar      ${gut.trotzdem ? 'ja' : 'NEIN'}`);

    pruefe(
      tippsDanach !== -2,
      'Fall B: der Aufnahmeknopf der Arbeitsebene bekam nie Maße — die Prüfung ließ sich nicht starten'
    );
    pruefe(tippsDanach !== -3, 'Fall B: die Messung ist nach dem Tipp gar nicht angelaufen');
    pruefe(
      tippsDanach === BUDGET.tippsBisErgebnis,
      'Fall B: nach dem Ende der Messung kam kein Ergebnis auf der Maschinenebene an'
    );
    pruefe(gut.fenster === 0, 'Fall B: das Ergebnis steht in einem Fenster statt auf der Ebene');
    pruefe(gut.satz.length > 0, 'Fall B: kein Urteil in Alltagssprache');
    pruefe(/%/.test(gut.beleg), 'Fall B: kein Ähnlichkeitswert als Beleg');
    pruefe(
      gut.primaer === BUDGET.primaer,
      `Fall B: ${gut.primaer} dominante Handlungen statt genau einer`
    );
    pruefe(gut.ohneScrollen, 'Fall B: Urteil und Handlung stehen nicht ohne Scrollen im Bild');
    pruefe(
      gut.trotzdem,
      'Fall B: kein sichtbarer Weg zur Hör-Lupe — auch ein gutes Ergebnis muss überprüfbar sein'
    );
    pruefe(
      gut.zuKlein.length === 0,
      `Fall B: Antippziele unter ${BUDGET.antippgroesse} px — ${gut.zuKlein.join(', ')}`
    );

    // Ein Tipp auf den sichtbaren Weg → die Hör-Lupe steht da.
    await page
      .locator('.maschine-trotzdem')
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(1200);
    const lupeB = await page.evaluate(AUFMASS_ERGEBNIS);
    pruefe(lupeB.lupe, 'Fall B: der Weg zur Hör-Lupe führt nicht zur Hör-Lupe');
    pruefe(
      lupeB.quellen.length === 3,
      `Fall B: die Hör-Lupe zeigt ${lupeB.quellen.length} Quellen statt Normalzustand, Messung und Unterschied`
    );

    pruefe(
      seitenfehler.length === 0,
      `Reise 1: Seitenfehler — ${seitenfehler.slice(0, 2).join(' | ')}`
    );
    await ctx.close();
  }

  // ── Start 2: der Klang pfeift und klopft. Fall C, dann Fall A ────────────
  {
    const { ctx, page, seitenfehler } = await starteHandy(klangAnders);
    await bisZurMaschine(page);

    // Fall C: die Maschine ruht wieder — aber die letzte Prüfung ist zu hören.
    const ruhe = await page.evaluate(() => {
      const nach = document.querySelector('.maschine-nachhoeren');
      const k = nach?.getBoundingClientRect();
      const sichtbar = (e) => {
        const cs = getComputedStyle(e);
        return (
          cs.display !== 'none' && cs.visibility !== 'hidden' && e.getBoundingClientRect().height > 0
        );
      };
      const ansicht = document.querySelector('.maschinen-ansicht');
      const kinder = [...(ansicht?.children ?? [])].filter(sichtbar);
      const unterste = kinder.length
        ? Math.max(...kinder.map((e) => e.getBoundingClientRect().bottom))
        : 0;
      /**
       * Das Klangbild — und zwar wirklich gemalt.
       *
       * Eine Leinwand mit Maßen sagt nichts; dieselbe Lehre wie beim
       * Fingerabdruck und beim Gebirge. Gezählt werden gesetzte Bildpunkte.
       */
      const bild = document.querySelector('.klangbild-flach');
      let gemalt = false;
      if (bild) {
        const stift = bild.getContext('2d');
        const d = stift.getImageData(0, 0, bild.width, bild.height).data;
        for (let i = 3; i < d.length; i += 4 * 37) {
          if (d[i] > 0) {
            gemalt = true;
            break;
          }
        }
      }
      const bildKasten = bild?.getBoundingClientRect();
      const brief = document.querySelector('.maschine-briefing');
      const briefKasten = brief?.getBoundingClientRect();
      const verlaufText = document.querySelector('.maschine-verlauf')?.textContent?.trim() ?? '';
      return {
        briefing: brief?.textContent?.trim() ?? '',
        briefingImBild: briefKasten ? briefKasten.bottom <= window.innerHeight : false,
        briefingHoch: briefKasten ? Math.round(briefKasten.height) : 0,
        verlaufText,
        urteil: document.querySelector('.maschine-lage')?.textContent?.trim() ?? '',
        aktionsname: document.querySelector('.maschine-aktion')?.textContent?.trim() ?? '',
        nachhoeren: nach?.textContent?.trim() ?? '',
        nachhoerenHoch: k ? Math.round(k.height) : 0,
        lupe: Boolean(document.querySelector('.hoerlupe')),
        klangbild: Boolean(bild),
        klangbildGemalt: gemalt,
        klangbildImBild: bildKasten ? bildKasten.bottom <= window.innerHeight : false,
        klangbildQuellen: document.querySelectorAll('.klangbild-quelle').length,
        ungenutztUnten: Math.round(window.innerHeight - unterste),
      };
    });

    console.log('\n=== Reise, Teil 3: die Maschine später wieder öffnen (Fall C) ===');
    console.log(`  Urteil                    ${ruhe.urteil || '(leer)'}`);
    console.log(`  eine Handlung             ${ruhe.aktionsname || '(fehlt)'}`);
    console.log(`  letzte Hör-Lupe           ${ruhe.nachhoeren || '(fehlt)'}`);
    console.log(`  Klangbild ohne Tipp       ${ruhe.klangbildGemalt ? 'gemalt' : 'NEIN'}`);
    console.log(`  ungenutzter Bildschirm    ${ruhe.ungenutztUnten} px (Budget ${BUDGET.leerRaum})`);

    pruefe(
      /prüfen/i.test(ruhe.aktionsname),
      `Fall C: die Ebene öffnet nicht im Ruhezustand — die Handlung heißt „${ruhe.aktionsname}"`
    );
    pruefe(!ruhe.lupe, 'Fall C: die Hör-Lupe steht ungefragt im Bild, statt einen Tipp zu kosten');
    pruefe(
      ruhe.nachhoeren.length > 0,
      'Fall C: kein Weg zur letzten Hör-Lupe, obwohl der Ton gespeichert ist'
    );
    pruefe(
      ruhe.nachhoerenHoch >= BUDGET.antippgroesse,
      `Fall C: „Letzten Unterschied anhören" ist ${ruhe.nachhoerenHoch} px hoch`
    );

    /**
     * ── Das Klangbild ──────────────────────────────────────────────────────
     *
     * Gemessen am 18.08.2026, vor diesem Schnitt: Die Maschinenseite endete
     * bei 422 px und ließ 422 px leer — die halbe Fläche —, während das
     * Gebirge vier Tipps entfernt hinter „Verlauf → Hören → 3D → Quelle" lag
     * und nur auf der Profi-Stufe überhaupt existierte.
     *
     * Jetzt steht das Bild ohne Tipp da, und EIN Tipp macht das Gebirge
     * daraus. Beides wird hier gemessen, sonst verschwindet es beim nächsten
     * Umbau still.
     */
    pruefe(ruhe.klangbild, 'Fall C: kein Klangbild auf der Maschinenseite');
    pruefe(
      ruhe.klangbildGemalt,
      'Fall C: das Klangbild ist leer — eine Leinwand mit Maßen ist kein Bild'
    );
    pruefe(ruhe.klangbildImBild, 'Fall C: das Klangbild steht nicht ohne Scrollen im Bild');
    pruefe(
      ruhe.klangbildQuellen === 3,
      `Fall C: das Klangbild bietet ${ruhe.klangbildQuellen} Quellen statt Normalzustand, Messung und Unterschied`
    );
    pruefe(
      ruhe.ungenutztUnten <= BUDGET.leerRaum,
      `Fall C: ${ruhe.ungenutztUnten} px Bildschirm bleiben ungenutzt (erlaubt ${BUDGET.leerRaum})`
    );

    /**
     * Das Briefing gehört auf die Seite, nicht in den Keller.
     *
     * Gemessen am 18.08.2026 stand „Geräusch-Briefing erstellen" bei
     * y = 1027 px — 183 px unter dem Rand, und nur erreichbar, wenn man
     * vorher die Hör-Lupe aufmachte. Für den Produktleuchtturm des Hauses ist
     * das der falsche Ort.
     */
    pruefe(ruhe.briefing.length > 0, 'Fall C: kein Weg zum Geräusch-Briefing auf der Maschinenseite');
    pruefe(ruhe.briefingImBild, 'Fall C: das Briefing steht nicht ohne Scrollen im Bild');
    pruefe(
      ruhe.briefingHoch >= BUDGET.antippgroesse,
      `Fall C: der Briefing-Knopf ist ${ruhe.briefingHoch} px hoch`
    );

    /**
     * Und der Verlauf sagt, wie viel dahinter liegt. „Verlauf" allein war ein
     * Wort in Kleinschrift, hinter dem niemand etwas vermutete.
     */
    pruefe(
      /\d/.test(ruhe.verlaufText),
      `Fall C: der Verlauf nennt keine Zahl („${ruhe.verlaufText}")`
    );

    // Ein Tipp auf das Bild → das Gebirge, an Ort und Stelle.
    await page.evaluate(() => document.querySelector('.klangbild-flaeche')?.click());
    await page.waitForTimeout(5000);
    const tief = await page.evaluate(() => {
      const c = document.querySelector('.spectro3d canvas');
      return {
        panel: Boolean(document.querySelector('.spectro3d-panel')),
        leinwand: Boolean(c && c.width > 0 && c.height > 0),
        ebene: document.body.classList.contains('tiefe-maschine'),
      };
    });
    console.log(`  Briefing                  ${ruhe.briefing || '(fehlt)'}`);
    console.log(`  Verlauf                   ${ruhe.verlaufText || '(fehlt)'}`);
    console.log(`  ein Tipp auf das Bild     ${tief.leinwand ? 'Gebirge steht' : 'NICHTS'}`);
    pruefe(tief.panel && tief.leinwand, 'Fall C: ein Tipp auf das Klangbild bringt kein Gebirge');
    pruefe(
      tief.ebene,
      'Fall C: das Gebirge öffnet eine neue Ebene — es soll an Ort und Stelle wachsen'
    );
    // Wieder zumachen, damit der Rest des Laufs vorfindet, was er erwartet.
    await page.evaluate(() => document.querySelector('.klangbild-flaeche')?.click());
    await page.waitForTimeout(1200);

    await page
      .locator('.maschine-nachhoeren')
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(6000);
    const nachC = await page.evaluate(AUFMASS_WIEDERGABE);
    console.log(`  ein Tipp spielt           ${nachC.ansage || '(nichts)'}`);
    pruefe(
      nachC.anzahl === 1 && /difference/.test(nachC.welche[0] ?? ''),
      'Fall C: ein Tipp auf „Letzten Unterschied anhören" spielt den Unterschied nicht'
    );

    // Fall A: jetzt klingt die Maschine wirklich anders.
    await page.evaluate(() => {
      document.querySelectorAll('.hoerlupe-quelle').forEach((b) => {
        if (b.getAttribute('aria-pressed') === 'true') b.click();
      });
    });
    await page.waitForTimeout(600);
    const tippsDanach = await pruefeUndWarte(page);
    const schlecht = await page.evaluate(AUFMASS_ERGEBNIS);

    console.log('\n=== Reise, Teil 4: Gegenprobe mit pfeifendem Klang (Fall A) ===');
    console.log(`  Tipps Messungsende → Ergebnis  ${tippsDanach}`);
    console.log(`  Urteil                         ${schlecht.urteil || '(leer)'}`);
    console.log(`  Satz                           ${schlecht.satz || '(fehlt)'}`);
    console.log(`  Beleg                          ${schlecht.beleg || '(fehlt)'}`);
    console.log(`  eine Handlung                  ${schlecht.aktionsname || '(fehlt)'}`);
    console.log(`  Hör-Lupe im Bild               ${schlecht.lupe ? 'ja' : 'NEIN'}`);
    console.log(`  Quellen                        ${schlecht.quellen.join(' · ') || '(keine)'}`);

    pruefe(
      tippsDanach !== -2,
      'Fall A: der Aufnahmeknopf der Arbeitsebene bekam nie Maße — die Prüfung ließ sich nicht starten'
    );
    pruefe(tippsDanach !== -3, 'Fall A: die Messung ist nach dem Tipp gar nicht angelaufen');
    pruefe(
      tippsDanach === BUDGET.tippsBisErgebnis,
      'Fall A: nach dem Ende der Messung kam kein Ergebnis auf der Maschinenebene an'
    );
    pruefe(
      schlecht.fenster === 0,
      'Fall A: das Ergebnis steht in einem Fenster statt auf der Ebene'
    );
    /**
     * Der Klang pfeift, klopft und rauscht — wenn die Bewertung ihn für den
     * Normalzustand hält, misst dieser Lauf ab hier den falschen Fall, und
     * alles Weitere wäre eine Aussage über Fall B mit dem Etikett von Fall A.
     */
    pruefe(
      /abweichung/i.test(schlecht.urteil),
      `Fall A: der veränderte Klang gilt als Normalzustand („${schlecht.urteil}") — der Lauf prüft den falschen Fall`
    );
    pruefe(
      /unterschied/i.test(schlecht.aktionsname),
      `Fall A: die dominante Handlung heißt „${schlecht.aktionsname}" statt zum Unterschied zu führen`
    );
    pruefe(
      schlecht.primaer === BUDGET.primaer,
      `Fall A: ${schlecht.primaer} dominante Handlungen statt genau einer`
    );
    pruefe(schlecht.ohneScrollen, 'Fall A: Urteil und Handlung stehen nicht ohne Scrollen im Bild');
    pruefe(schlecht.lupe, 'Fall A: die Hör-Lupe steht nicht im Ergebnis');
    pruefe(
      schlecht.quellen.length === 3,
      `Fall A: die Hör-Lupe zeigt ${schlecht.quellen.length} Quellen statt Normalzustand, Messung und Unterschied`
    );
    pruefe(
      schlecht.hervorhebung.length === 3,
      `Fall A: die Hervorhebung zeigt ${schlecht.hervorhebung.length} Stufen statt Originalmessung, Deutlich und Stark`
    );
    pruefe(
      /bearbeitete hörhilfe/i.test(schlecht.hervorhebungHinweis) &&
        /unverändert/i.test(schlecht.hervorhebungHinweis),
      'Fall A: die Hervorhebung ist nicht klar als bearbeitete, folgenlose Hörhilfe gekennzeichnet'
    );
    pruefe(
      !schlecht.teilenVorherSichtbar,
      'Schnitt 4b: Teilen wird angeboten, bevor feststeht, welche Hörhilfe gemeint ist'
    );
    pruefe(
      schlecht.zuKlein.length === 0,
      `Fall A: Antippziele unter ${BUDGET.antippgroesse} px — ${schlecht.zuKlein.join(', ')}`
    );

    // Der eine Tipp, um den es geht.
    //
    // Mit `catch`: Steht das Ergebnis wider Erwarten in einem Fenster, ist die
    // Handlung darunter verdeckt und der Klick schlägt fehl. Ein Wächter, der
    // daran stirbt, meldet nur, dass er tot ist — die Befunde unten sagen,
    // was los war.
    await page
      .locator('.maschine-aktion')
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(6000);
    const laeuft = await page.evaluate(AUFMASS_WIEDERGABE);
    console.log(`  ein Tipp spielt                ${laeuft.ansage || '(nichts)'}`);

    pruefe(
      laeuft.anzahl === 1,
      `Fall A: nach dem Tipp sind ${laeuft.anzahl} Quellen als laufend markiert statt genau einer`
    );
    pruefe(
      /difference/.test(laeuft.welche[0] ?? ''),
      'Fall A: ein Tipp auf die Primäraktion spielt nicht den Unterschied'
    );
    pruefe(
      laeuft.ansage.length > 0,
      'Fall A: was läuft, steht nirgends geschrieben — Farbe allein ist für Vorlesende nichts'
    );

    // Schnitt 4a: Nicht nur drei Etiketten, sondern drei hörbar verschiedene
    // Zustände. Der Fingerabdruck stammt aus dem tatsächlich erzeugten
    // AudioBuffer; gleiche Werte würden bedeuten, dass „Stark" nur Text ist.
    await page.evaluate(() => {
      const aktiv = document.querySelector(
        '.hoerlupe-quelle[aria-pressed="true"], .hoerlupe-hervorhebung-knopf[aria-pressed="true"]'
      );
      if (aktiv) aktiv.click();
      const details = document.querySelector('.hoerlupe-fein');
      if (details) details.open = true;
    });
    await page.locator('.hoerlupe-hervorhebung-knopf[data-highlight-level="clear"]').click();
    await page.waitForTimeout(1200);
    const deutlich = await page.evaluate(() => {
      const b = document.querySelector(
        '.hoerlupe-hervorhebung-knopf[data-highlight-level="clear"]'
      );
      return {
        pressed: b?.getAttribute('aria-pressed') === 'true',
        derived: b?.dataset.audioDerived ?? '',
        fingerprint: b?.dataset.audioFingerprint ?? '',
        gain: b?.dataset.differenceGain ?? '',
        shareVisible: !document.querySelector('.hoerlupe-teilen')?.hidden,
        shareStrength: document.querySelector('.hoerlupe-teilen')?.dataset.shareStrength ?? '',
        ansage: document.querySelector('.hoerlupe-ansage')?.textContent?.trim() ?? '',
      };
    });

    await page.locator('.hoerlupe-hervorhebung-knopf[data-highlight-level="strong"]').click();
    await page.waitForTimeout(1200);
    const stark = await page.evaluate(() => {
      const b = document.querySelector(
        '.hoerlupe-hervorhebung-knopf[data-highlight-level="strong"]'
      );
      const aktive = [
        ...document.querySelectorAll('.hoerlupe-quelle, .hoerlupe-hervorhebung-knopf'),
      ].filter((e) => e.getAttribute('aria-pressed') === 'true');
      return {
        pressed: b?.getAttribute('aria-pressed') === 'true',
        activeCount: aktive.length,
        derived: b?.dataset.audioDerived ?? '',
        fingerprint: b?.dataset.audioFingerprint ?? '',
        gain: b?.dataset.differenceGain ?? '',
        shareVisible: !document.querySelector('.hoerlupe-teilen')?.hidden,
        shareStrength: document.querySelector('.hoerlupe-teilen')?.dataset.shareStrength ?? '',
        ansage: document.querySelector('.hoerlupe-ansage')?.textContent?.trim() ?? '',
      };
    });

    await page.locator('.hoerlupe-hervorhebung-knopf[data-highlight-level="off"]').click();
    await page.waitForTimeout(250);
    const aus = await page.evaluate(() => {
      const b = document.querySelector('.hoerlupe-hervorhebung-knopf[data-highlight-level="off"]');
      return {
        pressed: b?.getAttribute('aria-pressed') === 'true',
        derived: b?.dataset.audioDerived ?? '',
        ansage: document.querySelector('.hoerlupe-ansage')?.textContent?.trim() ?? '',
      };
    });

    console.log(`  Hervorhebung Deutlich           ${deutlich.ansage || '(nichts)'}`);
    console.log(`  Hervorhebung Stark              ${stark.ansage || '(nichts)'}`);
    console.log(`  Hervorhebung Originalmessung   ${aus.ansage || '(nichts)'}`);
    pruefe(
      deutlich.pressed && deutlich.derived === 'true' && deutlich.fingerprint.length > 0,
      'Schnitt 4a: „Deutlich" spielt keinen tatsächlich abgeleiteten Buffer'
    );
    pruefe(
      deutlich.shareVisible && deutlich.shareStrength === 'clear',
      'Schnitt 4b: nach „Deutlich" ist nicht genau diese Hörhilfe teilbar'
    );
    pruefe(
      stark.pressed && stark.activeCount === 1 && stark.derived === 'true',
      'Schnitt 4a: „Stark" ist nicht eindeutig als laufende Hörhilfe markiert'
    );
    pruefe(
      deutlich.fingerprint !== stark.fingerprint && deutlich.gain !== stark.gain,
      'Schnitt 4a: „Deutlich" und „Stark" erzeugen dasselbe Audiosignal'
    );
    pruefe(
      stark.shareVisible && stark.shareStrength === 'strong',
      'Schnitt 4b: nach „Stark" zeigt Teilen noch auf eine andere Hörhilfe'
    );
    pruefe(
      aus.pressed && aus.derived === '' && /messung/i.test(aus.ansage),
      'Schnitt 4a: „Originalmessung" spielt nicht erkennbar die unveränderte Messung'
    );

    // Schnitt 4c: Nicht nur einen Rahmen malen. Der mobile Lauf zieht eine
    // echte Zeit-/Frequenzauswahl und prüft den daraus erzeugten AudioBuffer
    // auf kürzere Dauer, Headroom, Fingerabdruck und die Teilen-Übergabe.
    await page.evaluate(() => {
      const auswahl = document.querySelector('.hoerlupe-auswahl');
      if (auswahl) auswahl.open = true;
    });
    await page.waitForTimeout(3500);
    const canvas = page.locator('.hoerlupe-spektrogramm');
    await canvas.scrollIntoViewIfNeeded();
    const canvasBox = await canvas.boundingBox();
    if (canvasBox) {
      await page.mouse.move(
        canvasBox.x + canvasBox.width * 0.15,
        canvasBox.y + canvasBox.height * 0.18
      );
      await page.mouse.down();
      await page.mouse.move(
        canvasBox.x + canvasBox.width * 0.72,
        canvasBox.y + canvasBox.height * 0.82
      );
      await page.mouse.up();
    }
    await page.locator('.hoerlupe-auswahl-spielen').click();
    await page.waitForTimeout(1800);
    const auswahl = await page.evaluate(() => {
      const button = document.querySelector('.hoerlupe-auswahl-spielen');
      const share = document.querySelector('.hoerlupe-teilen');
      return {
        canvasVisible: !document.querySelector('.hoerlupe-spektrogramm')?.hidden,
        pressed: button?.getAttribute('aria-pressed') === 'true',
        derived: button?.dataset.audioDerived ?? '',
        fingerprint: button?.dataset.audioFingerprint ?? '',
        start: Number(button?.dataset.selectionStart ?? NaN),
        end: Number(button?.dataset.selectionEnd ?? NaN),
        low: Number(button?.dataset.selectionLow ?? NaN),
        high: Number(button?.dataset.selectionHigh ?? NaN),
        duration: Number(button?.dataset.outputDuration ?? NaN),
        peak: Number(button?.dataset.outputPeak ?? NaN),
        shareVisible: !share?.hidden,
        shareStrength: share?.dataset.shareStrength ?? '',
        ansage: document.querySelector('.hoerlupe-ansage')?.textContent?.trim() ?? '',
      };
    });
    console.log(`  2D-Auswahl                       ${auswahl.ansage || '(nichts)'}`);
    pruefe(
      Boolean(canvasBox) && auswahl.canvasVisible,
      'Schnitt 4c: das 2D-Spektrogramm ist nicht bedienbar sichtbar'
    );
    pruefe(
      auswahl.pressed && auswahl.derived === 'true' && auswahl.fingerprint.length > 0,
      'Schnitt 4c: „Auswahl anhören" spielt keinen tatsächlich abgeleiteten Buffer'
    );
    pruefe(
      auswahl.start > 0 && auswahl.end > auswahl.start && auswahl.duration < 9,
      'Schnitt 4c: die gezogene Zeitspanne wird nicht als kürzerer Ausschnitt ausgegeben'
    );
    pruefe(
      auswahl.low >= 0 && auswahl.high > auswahl.low && auswahl.high <= 24_000,
      'Schnitt 4c: die gezogenen Frequenzgrenzen sind unplausibel'
    );
    pruefe(
      auswahl.peak > 0 && auswahl.peak <= 0.900001,
      'Schnitt 4c: die Auswahl ist stumm oder überschreitet ihren Headroom'
    );
    pruefe(
      auswahl.shareVisible && auswahl.shareStrength === 'selection',
      'Schnitt 4c: Teilen zeigt nach dem Anhören nicht auf die Spektrogramm-Auswahl'
    );

    // Wird der Rahmen danach verändert, wäre der alte Buffer eine falsche
    // Übergabe unter einer neuen sichtbaren Auswahl. Teilen muss deshalb bis
    // zum erneuten Anhören verschwinden und danach den neuen Buffer tragen.
    const zweitesCanvasBox = await canvas.boundingBox();
    if (zweitesCanvasBox) {
      await page.mouse.move(
        zweitesCanvasBox.x + zweitesCanvasBox.width * 0.28,
        zweitesCanvasBox.y + zweitesCanvasBox.height * 0.25
      );
      await page.mouse.down();
      await page.mouse.move(
        zweitesCanvasBox.x + zweitesCanvasBox.width * 0.62,
        zweitesCanvasBox.y + zweitesCanvasBox.height * 0.68
      );
      await page.mouse.up();
    }
    const nachVerschieben = await page.evaluate(() => ({
      shareVisible: !document.querySelector('.hoerlupe-teilen')?.hidden,
      selectionPlaying:
        document.querySelector('.hoerlupe-auswahl-spielen')?.getAttribute('aria-pressed') ===
        'true',
    }));
    pruefe(
      !nachVerschieben.shareVisible && !nachVerschieben.selectionPlaying,
      'Schnitt 4c: nach neuer Markierung bleibt der alte Ausschnitt abspielbar oder teilbar'
    );
    await page.locator('.hoerlupe-auswahl-spielen').click();
    await page.waitForTimeout(1200);
    const neuBerechnet = await page.evaluate(() => {
      const button = document.querySelector('.hoerlupe-auswahl-spielen');
      const share = document.querySelector('.hoerlupe-teilen');
      return {
        fingerprint: button?.dataset.audioFingerprint ?? '',
        shareVisible: !share?.hidden,
        shareStrength: share?.dataset.shareStrength ?? '',
      };
    });
    pruefe(
      neuBerechnet.shareVisible &&
        neuBerechnet.shareStrength === 'selection' &&
        neuBerechnet.fingerprint !== auswahl.fingerprint,
      'Schnitt 4c: die neue Markierung erzeugt und teilt nicht ihren eigenen Buffer'
    );

    /**
     * ── Dasselbe Ergebnis am Schreibtisch ──────────────────────────────────
     *
     * Nur die Größe des Fensters ändert sich, nicht der Ablauf. Gemessen wird,
     * ob die Fläche wirklich zwei fachliche Spalten benutzt: Steht die Hör-Lupe
     * rechts NEBEN der Handlung, ist es eine Anordnung; steht sie darunter, ist
     * es eine Mobilspalte mit Weiß daneben.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(1200);
    const tisch = await page.evaluate(() => {
      const ansicht = document.querySelector('.maschinen-ansicht');
      const aktion = document.querySelector('.maschine-aktion');
      const lupe = document.querySelector('.hoerlupe');
      if (!ansicht || !aktion || !lupe) return null;
      const a = aktion.getBoundingClientRect();
      const l = lupe.getBoundingClientRect();
      return {
        breite: Math.round(ansicht.getBoundingClientRect().width),
        nebeneinander: l.left >= a.right - 1,
        lupeOben: Math.round(l.top),
        aktionOben: Math.round(a.top),
      };
    });

    console.log('\n=== Reise, Teil 5: dasselbe Ergebnis am Schreibtisch (1440×900) ===');
    console.log(`  Breite der Fläche              ${tisch ? tisch.breite + ' px' : '(fehlt)'}`);
    console.log(`  Hör-Lupe neben der Handlung    ${tisch?.nebeneinander ? 'ja' : 'NEIN'}`);

    pruefe(Boolean(tisch), 'Schreibtisch: das Ergebnis ist nach dem Umschalten nicht mehr da');
    pruefe(
      Boolean(tisch?.nebeneinander),
      'Schreibtisch: die Hör-Lupe steht unter der Handlung statt daneben — das ist eine Mobilspalte, keine Anordnung'
    );
    pruefe(
      (tisch?.breite ?? 0) > 900,
      `Schreibtisch: die Ergebnisfläche ist ${tisch?.breite ?? 0} px breit — eine schmale Karte in der Mitte`
    );

    pruefe(
      seitenfehler.length === 0,
      `Reise 2: Seitenfehler — ${seitenfehler.slice(0, 2).join(' | ')}`
    );
    await ctx.close();
  }
} finally {
  vorschau.kill();
}

if (befunde.length) {
  console.log('\nBefunde:');
  for (const b of befunde) console.log(`  ✗ ${b}`);
  process.exitCode = 1;
} else {
  console.log(
    '\n✓ Der Weg zur Maschine ist kurz, auf jedem Bild steht eine Frage,\n' +
      '  am Ende der ersten Aufnahme steht ein Bild statt eines Formulars,\n' +
      '  und wenn die Maschine anders klingt, hört man das mit einem Tipp.'
  );
}
