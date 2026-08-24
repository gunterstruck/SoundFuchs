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
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  /**
   * Playwright ist exakt im Lockfile gepinnt. Fehlt das Paket trotzdem, ist
   * die Arbeitskopie nicht vollständig installiert; der Browser selbst wird
   * separat mit `playwright install chromium` bereitgestellt.
   */
  console.error('Playwright fehlt. Bitte zuerst `npm ci` ausführen.');
  process.exit(1);
}
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
  /** Um wie viele Pixel der Bildplatz zwischen zwei Zuständen wandern darf. */
  bildplatzWandert: 2,
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

/**
 * Lesbarkeit und Antippbarkeit — für jede Ebene hinter dem Scharnier.
 *
 * Dieselben zwei Fragen gelten überall: Kann man den Text lesen, und trifft
 * man die Knöpfe? Deshalb steht die Messung einmal hier und nicht je Ebene
 * einmal. Dass die Standortebene ihre eigenen Befunde jahrelang behalten
 * durfte, lag genau daran, dass sie niemand gestellt hat.
 */
const AUFMASS_LESBARKEIT = () => {
  const sichtbar = (e) => {
    const cs = getComputedStyle(e);
    return (
      cs.display !== 'none' && cs.visibility !== 'hidden' && e.getBoundingClientRect().height > 0
    );
  };
  const tiefe = document.getElementById('zanobo-tiefe');

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
    zuKlein: [...tiefe.querySelectorAll('button')]
      .filter(sichtbar)
      .filter((b) => {
        const k = b.getBoundingClientRect();
        return k.height < 44 || k.width < 44;
      })
      .map(
        (b) =>
          `${b.className || b.id}(${Math.round(
            b.getBoundingClientRect().height
          )}×${Math.round(b.getBoundingClientRect().width)})`
      ),
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
  };
};

/**
 * Was auf der Standortebene steht — als Zahlen.
 *
 * Die Ebene, auf der ein Techniker ankommt. Ihre Aufgabe ist die Wahl der
 * Maschine; gemessen wird deshalb, ob diese Wahl trifft, spricht und den
 * Bildschirm benutzt.
 */
const AUFMASS_STANDORT = () => {
  const sichtbar = (e) => {
    const cs = getComputedStyle(e);
    return (
      cs.display !== 'none' && cs.visibility !== 'hidden' && e.getBoundingClientRect().height > 0
    );
  };
  const tiefe = document.getElementById('zanobo-tiefe');
  const alle = [...tiefe.querySelectorAll('*')].filter(sichtbar);
  const unten = alle.reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0);
  const zeilen = [...document.querySelectorAll('.standort-maschine')];
  return {
    zeilen: zeilen.length,
    // Jede Zeile sagt in Worten, was mit ihrer Maschine los ist — und zwar in
    // denselben Worten wie die Maschinenseite selbst.
    lagen: zeilen.map((z) => z.querySelector('.standort-maschine-lage')?.textContent?.trim() ?? ''),
    lageSatz: document.querySelector('.standort-lage')?.textContent?.trim() ?? '',
    // „Maschinen" über einer Maschinenliste unter einer Kachel „4 Maschinen".
    ueberschriften: [...tiefe.querySelectorAll('h3')].filter(sichtbar).length,
    kacheln: [...tiefe.querySelectorAll('.stat')].filter(sichtbar).length,
    primaer: [...tiefe.querySelectorAll('button.primary')].filter(sichtbar).length,
    ungenutzt: Math.max(0, Math.round(window.innerHeight - unten)),
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

    // ── Die Standortebene, bevor sie verlassen wird ────────────────────────
    //
    // Sie wurde bis zum 21.08.2026 von keinem Wächter angesehen — der
    // Durchlauf ging über sie hinweg zur Maschine, und `wow` fing erst dort
    // an zu zählen. Gefunden hat das eine Messung von Hand: Zeilen mit 42 px,
    // ein Anlegen-Knopf mit 33 px, Nebentext bei 4,2:1 und im Dunkeln ein
    // Maschinenname, der beim Antippen auf 1:1 verschwand.
    const standort = await page.evaluate(AUFMASS_STANDORT);
    const standortLesbar = await page.evaluate(AUFMASS_LESBARKEIT);

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
    const maschine = {
      ...(await page.evaluate(AUFMASS_MASCHINE)),
      ...(await page.evaluate(AUFMASS_LESBARKEIT)),
    };

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
    console.log(`  — Standortebene —`);
    console.log(`  Maschinenzeilen           ${standort.zeilen}`);
    console.log(`  Lage in einem Satz        ${standort.lageSatz || '(fehlt)'}`);
    console.log(`  Zeile sagt die Lage       ${standort.lagen[0] || '(fehlt)'}`);
    console.log(`  Kacheln / Überschriften   ${standort.kacheln} / ${standort.ueberschriften}`);
    console.log(`  Primäraktionen            ${standort.primaer}`);
    console.log(`  ungenutzter Bildschirm    ${standort.ungenutzt} px`);
    console.log(`  zu kleine Antippziele     ${standortLesbar.zuKlein.join(', ') || 'keine'}`);
    console.log(`  zu blasser Text           ${standortLesbar.blass.join(' | ') || 'keiner'}`);
    console.log(`  — Maschinenebene —`);
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

    // ── Die Standortebene ──────────────────────────────────────────────────
    pruefe(
      standortLesbar.zuKlein.length === 0,
      `${name}/Standort: Antippziele unter ${BUDGET.antippgroesse} px — ${standortLesbar.zuKlein.join(', ')}`
    );
    pruefe(
      standortLesbar.blass.length === 0,
      `${name}/Standort: Text unter dem nötigen Kontrast — ${standortLesbar.blass.join(' | ')}`
    );
    pruefe(
      standort.lagen.every((l) => l.length > 0),
      `${name}/Standort: eine Maschinenzeile sagt nicht, was mit ihrer Maschine los ist`
    );
    pruefe(
      standort.lageSatz.length > 0,
      `${name}/Standort: der Standort sagt seine Lage nicht in einem Satz`
    );
    // Dasselbe Wort dreimal auf 150 px: Kachel „4 Maschinen", Überschrift
    // „Maschinen", darunter die Maschinen.
    pruefe(
      standort.kacheln === 0 && standort.ueberschriften === 0,
      `${name}/Standort: ${standort.kacheln} Kacheln und ${standort.ueberschriften} Überschriften über einer Liste, die sich selbst erklärt`
    );
    // Wo Maschinen stehen, ist die Liste die Handlung — nicht das Anlegen.
    pruefe(
      standort.primaer === 0,
      `${name}/Standort: ${standort.primaer} dominante Handlungen neben einer Liste, die selbst die Handlung ist`
    );
    // Für den ungenutzten Bildschirm gibt es hier ABSICHTLICH keine Grenze.
    //
    // Auf der Maschinenebene war leerer Platz ein Befund: Dort lag das Beste
    // vier Tipps entfernt, während die halbe Seite leer stand. Hier hängt die
    // Höhe an der Zahl der Maschinen — ein Standort mit vier Maschinen füllt
    // kein Handy, und das ist eine Tatsache über den Standort, keine über den
    // Entwurf. Eine Obergrenze würde zum Auffüllen zwingen, und Auffüllen ist
    // genau das, was diese Ebene vorher hatte. Die Zahl wird berichtet, damit
    // man sie sieht, und nicht erzwungen.
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

/**
 * Das Analyseblatt aufziehen und einen Reiter öffnen.
 *
 * Seit dem 23.08.2026 liegen 2D, Gebirge und Briefing im Blatt hinter dem
 * Scharnier. Der Griff hört auf Zeigerereignisse, nicht auf `click` — ein
 * Skript-Klick ginge ins Leere und meldete anschließend, das Werkzeug fehle.
 */
async function blattAufziehen(page, reiter) {
  const kasten = await page.locator('#sheet-grip').boundingBox();
  const offen = await page.evaluate(() => document.body.classList.contains('sheet-open'));
  if (!kasten) console.log('     (kein #sheet-grip gefunden)');
  if (kasten && !offen) {
    const x = kasten.x + kasten.width / 2;
    const y = kasten.y + kasten.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 380, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(900);
  }
  if (reiter) {
    const stand = await page.evaluate((r) => {
      const b = document.querySelector(`.tab-button[data-tab="${r}"]`);
      const k = b?.getBoundingClientRect();
      const mitte =
        k && k.width ? document.elementFromPoint(k.x + k.width / 2, k.y + k.height / 2) : null;
      return {
        offen: document.body.classList.contains('sheet-open'),
        blattOben: Math.round(
          document.getElementById('sidebar')?.getBoundingClientRect().top ?? -1
        ),
        rect: k
          ? `${Math.round(k.x)},${Math.round(k.y)} ${Math.round(k.width)}×${Math.round(k.height)}`
          : '(fehlt)',
        display: b ? getComputedStyle(b).display : '(fehlt)',
        amPunkt: mitte ? mitte.className || mitte.tagName : '(nichts)',
        fensterHoch: window.innerHeight,
        ebene: document.body.className.match(/tiefe-\w+/g)?.join(' ') ?? '(keine)',
      };
    }, reiter);
    /**
     * Nur melden, wenn der Reiter nicht dasteht.
     *
     * Diese Zeile hat den Fehler gefunden, den ein „ging nicht" verschwiegen
     * hätte: Ebene vor dem Tipp `tiefe-offen tiefe-maschine`, danach
     * `(keine)` — ein Tipp auf einen Reiter schloss die ganze Tiefe.
     */
    if (stand.display === 'none' || !stand.offen)
      console.log(
        `     [Blatt ${stand.offen ? 'offen' : 'ZU'} @${stand.blattOben} · „${reiter}" ${stand.display} ${stand.rect} · darauf: ${stand.amPunkt} · ${stand.ebene}]`
      );
  }
  if (reiter) {
    const fehler = await page
      .locator(`.tab-button[data-tab="${reiter}"]`)
      .click({ timeout: 6000 })
      .then(() => null)
      .catch((e) => String(e.message).split('\n')[0]);
    if (fehler) console.log(`     (Reiter „${reiter}" nicht antippbar: ${fehler.slice(0, 70)})`);
    await page.waitForTimeout(1600);
  }
}

/** Das Blatt wieder zuziehen, damit der Rest des Laufs die Seite vorfindet. */
async function blattZuziehen(page) {
  const offen = await page.evaluate(() => document.body.classList.contains('sheet-open'));
  if (!offen) return;
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
        fenster:
          [...document.querySelectorAll('.modal')]
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
    hervorhebung: [...document.querySelectorAll('.hoerlupe-hervorhebung-knopf')]
      .filter(sichtbar)
      .map((b) => b.textContent.trim()),
    /**
     * Was die Stufe verbirgt.
     *
     * Gefragt wird nach SICHTBARKEIT, nicht nach Anwesenheit: Die Stufe
     * versteckt per `display: none`, und ein `querySelectorAll` findet solche
     * Elemente weiterhin. Ein Wächter, der sie zählt, misst den Baum statt der
     * Oberfläche.
     */
    hervorhebungGruppe: [...document.querySelectorAll('.hoerlupe-hervorhebung')].filter(sichtbar)
      .length,
    tiefeAuswahl: [...document.querySelectorAll('.hoerlupe-auswahl')].filter(sichtbar).length,
    stufe: document.documentElement.getAttribute('data-view-level') ?? '(keine)',
    hervorhebungHinweis:
      document.querySelector('.hoerlupe-hervorhebung-hinweis')?.textContent?.trim() ?? '',
    teilenVorherSichtbar: !document.querySelector('.hoerlupe-teilen')?.hidden,
    trotzdem: Boolean(document.querySelector('.maschine-trotzdem')),
    // Die Runde: Nach einem Ergebnis steht da, was ohnehin als Nächstes
    // drankommt — mit Namen, sonst wäre es ein Sprung ins Ungewisse.
    runde: document.querySelector('.maschine-runde')?.textContent?.trim() ?? '',
    // Der Bildplatz: Steht das Spektrogramm im Ergebnis dort, wo es auch im
    // Ruhezustand stand? Nur dann kann das Auge zwei Zustände vergleichen.
    klangbildOben: (() => {
      const k = document
        .querySelector('#maschinen-ansicht .klangbild-flach')
        ?.getBoundingClientRect();
      return k ? Math.round(k.top) : null;
    })(),
    name: document.querySelector('.maschine-kopf h2')?.textContent?.trim() ?? '',
    zuKlein: [...tiefe.querySelectorAll('button')]
      .filter(sichtbar)
      .filter((b) => {
        const k = b.getBoundingClientRect();
        return k.height < 44 || k.width < 44;
      })
      // Beide Kanten nennen: Die Bedingung prüft Höhe UND Breite, gemeldet
      // wurde nur die Höhe. „klangbild-quelle(44px)" als Befund über eine zu
      // schmale Schaltfläche kostete am 23.08.2026 eine Minute Suche.
      .map(
        (b) =>
          `${b.className || b.id}(${Math.round(b.getBoundingClientRect().height)}×${Math.round(
            b.getBoundingClientRect().width
          )}px)`
      ),
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
    console.log(`  die Runde                      ${gut.runde || '(fehlt)'}`);

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
    // Die Runde. Der Standort der Beispieldaten hat mehrere Maschinen; nach
    // einer Prüfung muss dastehen, welche als Nächstes drankommt — und sie muss
    // beim Namen genannt sein. „Weiter" ohne Ziel wäre ein Sprung ins Ungewisse,
    // und die eigene Maschine als „nächste" wäre eine Runde von eins.
    pruefe(
      gut.runde.length > 0,
      'Fall B: nach dem Ergebnis steht nicht, welche Maschine als Nächstes drankommt'
    );
    pruefe(
      gut.name.length > 0 && !gut.runde.includes(gut.name),
      `Fall B: die Runde bietet die Maschine an, auf der man schon steht — „${gut.runde}"`
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
          cs.display !== 'none' &&
          cs.visibility !== 'hidden' &&
          e.getBoundingClientRect().height > 0
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
      const bild = document.querySelector('#maschinen-ansicht .klangbild-flach');
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
      const verlaufText = document.querySelector('.maschine-verlauf')?.textContent?.trim() ?? '';
      /**
       * Die Reiter des Analyseblatts.
       *
       * Gefragt wird nach `display`, nicht nach Höhe: Bei zugezogenem Blatt
       * sind sie beschnitten und hätten Höhe 0 — der erste Versuch dieses
       * Wächters meldete deshalb „das Blatt trägt ‚‘". Ob der richtige
       * Reitersatz gilt, ist eine andere Frage als, ob man ihn gerade sieht.
       */
      const reiter = [...document.querySelectorAll('.tab-button')].filter(
        (b) => getComputedStyle(b).display !== 'none'
      );
      return {
        blattOffen: document.body.classList.contains('sheet-open'),
        reiterSichtbar: reiter.map((b) => b.textContent.trim()),
        reiterHoch: reiter.length
          ? Math.round(
              Math.min(
                ...reiter.map(
                  (b) =>
                    parseFloat(getComputedStyle(b).minHeight) || b.getBoundingClientRect().height
                )
              )
            )
          : 0,
        verlaufText,
        urteil: document.querySelector('.maschine-lage')?.textContent?.trim() ?? '',
        aktionsname: document.querySelector('.maschine-aktion')?.textContent?.trim() ?? '',
        nachhoeren: nach?.textContent?.trim() ?? '',
        nachhoerenHoch: k ? Math.round(k.height) : 0,
        lupe: Boolean(document.querySelector('.hoerlupe')),
        klangbild: Boolean(bild),
        klangbildGemalt: gemalt,
        klangbildImBild: bildKasten ? bildKasten.bottom <= window.innerHeight : false,
        // Wo genau das Bild anfängt. Der Vergleich mit derselben Zahl im
        // Ergebnis ist der ganze Zweck des Bildplatzes.
        klangbildOben: bildKasten ? Math.round(bildKasten.top) : null,
        klangbildQuellen: document.querySelectorAll('#maschinen-ansicht .klangbild-quelle').length,
        klangbildQuellenNamen: [
          ...document.querySelectorAll('#maschinen-ansicht .klangbild-quelle'),
        ].map((b) => b.textContent.trim()),
        ungenutztUnten: Math.round(window.innerHeight - unterste),
      };
    });

    console.log('\n=== Reise, Teil 3: die Maschine später wieder öffnen (Fall C) ===');
    console.log(`  Urteil                    ${ruhe.urteil || '(leer)'}`);
    console.log(`  eine Handlung             ${ruhe.aktionsname || '(fehlt)'}`);
    console.log(`  letzte Hör-Lupe           ${ruhe.nachhoeren || '(fehlt)'}`);
    console.log(`  Klangbild ohne Tipp       ${ruhe.klangbildGemalt ? 'gemalt' : 'NEIN'}`);
    console.log(
      `  ungenutzter Bildschirm    ${ruhe.ungenutztUnten} px (Budget ${BUDGET.leerRaum})`
    );

    pruefe(
      /prüfen/i.test(ruhe.aktionsname),
      `Fall C: die Ebene öffnet nicht im Ruhezustand — die Handlung heißt „${ruhe.aktionsname}"`
    );
    /**
     * Die Analyse drängt sich nicht auf.
     *
     * Bis zum 23.08.2026 hieß das „die Hör-Lupe steht nicht auf der Seite".
     * Seit sie im Blatt liegt, ist die Frage eine andere und dieselbe: Das
     * Blatt darf sich nicht von selbst aufziehen. Wer die Maschine öffnet,
     * will prüfen — nicht analysieren.
     */
    pruefe(
      !ruhe.blattOffen,
      'Fall C: das Analyseblatt zieht sich von selbst auf, statt einen Zug zu kosten'
    );
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
    /**
     * Fünf Quellen, seit das Positionsbild dazugehört (23.08.2026).
     *
     * Der Auftraggeber: „Das gespeicherte Prüfbild zum Erkennen der Maschine
     * wäre genauso wichtig wie das Referenzspektrum." Genauso wichtig heißt:
     * in derselben Zeile, nicht daneben. Die Zahl bleibt fest — sie ist die
     * Sperre gegen eine Zeile, in die mit der Zeit alles hineinwandert.
     */
    pruefe(
      ruhe.klangbildQuellen === 5,
      `Fall C: das Klangbild bietet ${ruhe.klangbildQuellen} Quellen statt Normalzustand, Messung, Unterschied, Iris und Foto`
    );
    pruefe(
      ruhe.ungenutztUnten <= BUDGET.leerRaum,
      `Fall C: ${ruhe.ungenutztUnten} px Bildschirm bleiben ungenutzt (erlaubt ${BUDGET.leerRaum})`
    );

    /**
     * ── DAS BRIEFING IST IN DAS BLATT GEZOGEN ─────────────────────────────
     *
     * Gemessen am 18.08.2026 stand „Geräusch-Briefing erstellen" bei
     * y = 1027 px — 183 px unter dem Rand, erreichbar nur über die Hör-Lupe.
     * Der Schnitt vom 22.08. holte es als zweiten Knopf auf die Seite; seit
     * dem 23.08. hat es einen eigenen Reiter im Analyseblatt, zusammen mit den
     * beiden anderen Werkzeugen, die vorher je eine eigene Tür hatten.
     *
     * Geprüft wird deshalb der Reiter: Er muss dastehen, beschriftet sein und
     * eine Fingerkuppe breit sein.
     */
    pruefe(
      ruhe.reiterSichtbar.join(' ') === '2D 3D Briefing',
      `Fall C: das Blatt trägt „${ruhe.reiterSichtbar.join(' · ')}" statt 2D · 3D · Briefing`
    );
    pruefe(
      ruhe.reiterHoch >= BUDGET.antippgroesse,
      `Fall C: die Reiter des Blatts sind ${ruhe.reiterHoch} px hoch`
    );

    /**
     * ── DIE TÜR AM ENDE DES BRIEFINGS ─────────────────────────────────────
     *
     * Das Geräusch-Briefing entsteht vollständig im Browser: ein ZIP und ein
     * Arbeitsauftrag in der Zwischenablage. Bis zum 23.08.2026 endete der
     * Erfolgsbildschirm dort — „Nochmal kopieren" und „Fertig". Wohin damit,
     * musste jeder selbst wissen. Der letzte Schritt einer Funktion, die es
     * genau für diesen Schritt gibt, war der einzige ohne Weg.
     *
     * Gemessen wird nicht, dass ein Knopf dasteht, sondern dass er das
     * GEWÄHLTE Werkzeug beim Namen nennt und wirklich dessen Adresse öffnet.
     * Ein Knopf „In Claude öffnen", der auf die eigene Startseite führte, sähe
     * im Quelltext gleich aus.
     *
     * Der Lauf steht hier, weil an dieser Stelle beides vorliegt, was das
     * Briefing braucht: ein Normalzustand und eine Messung. Er kostet kein
     * zusätzliches Mikrofonsignal.
     */
    await blattAufziehen(page, 'briefing');
    await page
      .locator('.blatt-briefing-knopf')
      .click({ timeout: 6000 })
      .catch(() => {});
    await page.waitForTimeout(1500);
    // Ein Wächter, der nur „ging nicht" sagt, ist einer, den man überblättert.
    // Wenn der Dialog nicht aufgeht, gehört ins Protokoll, was stattdessen da
    // stand — sonst beginnt die Suche bei null.
    const briefingZustand = await page.evaluate(() => {
      const zustimmung = document.querySelector('.analysepaket-zustimmung input');
      if (zustimmung) {
        zustimmung.checked = true;
        zustimmung.dispatchEvent(new Event('change'));
        return { offen: true, gesehen: '' };
      }
      return {
        offen: false,
        gesehen:
          [...document.querySelectorAll('[class*="analysepaket"]')]
            .map((e) => e.className)
            .slice(0, 3)
            .join(' | ') || '(nichts vom Briefing im Baum)',
      };
    });
    const briefingOffen = briefingZustand.offen;
    let tuer = { knopf: '', wechsel: '', hinweis: '', ziel: '', primaer: 0 };
    if (briefingOffen) {
      await page.evaluate(() => document.querySelector('.analysepaket-erstellen')?.click());
      await page
        .waitForFunction(() => Boolean(document.querySelector('.analysepaket-tuer')), null, {
          timeout: 60000,
        })
        .catch(() => {});
      /**
       * Wohin der Knopf führt — gemessen an der Adresse, die er dem Browser
       * übergibt, nicht am geladenen Tab.
       *
       * Der erste Versuch fing den neuen Tab ab und las dessen `url()`. Das
       * misst zwei Dinge auf einmal: unsere Adresse UND die Erreichbarkeit
       * von claude.ai. Im abgeschotteten Lauf gibt es keine Route nach
       * draußen — der Tab ging auf und blieb ohne Adresse, und der Wächter
       * meldete „führt nirgendwohin", obwohl die Tür stand.
       *
       * `window.open` abzufangen misst genau das, wofür das Produkt zuständig
       * ist: welche Adresse es nennt. Ob der Browser sie erreicht, ist nicht
       * unsere Aussage.
       */
      await page.evaluate(() => {
        window.__tuerZiel = '';
        const echt = window.open;
        window.open = (adresse, ...rest) => {
          window.__tuerZiel = String(adresse ?? '');
          return echt.call(window, 'about:blank', ...rest);
        };
      });
      await page
        .locator('.analysepaket-tuer-knopf')
        .click({ timeout: 8000 })
        .catch(() => {});
      await page.waitForTimeout(600);
      tuer = await page.evaluate(() => ({
        knopf: document.querySelector('.analysepaket-tuer-knopf')?.textContent?.trim() ?? '',
        wechsel: document.querySelector('.analysepaket-tuer-wechsel')?.textContent?.trim() ?? '',
        hinweis: document.querySelector('.analysepaket-tuer-schritte')?.textContent?.trim() ?? '',
        ziel: window.__tuerZiel ?? '',
        primaer: [...document.querySelectorAll('.analysepaket-erfolg .primary-btn')].filter(
          (b) => getComputedStyle(b).display !== 'none'
        ).length,
      }));
      for (const seite of page.context().pages()) {
        if (seite !== page) await seite.close().catch(() => {});
      }
    }
    console.log('\n=== Der Weg zum Auswertungswerkzeug ===');
    console.log(
      `  Briefing geöffnet         ${briefingOffen ? 'ja' : `NEIN — ${briefingZustand.gesehen}`}`
    );
    console.log(`  Knopf                     ${tuer.knopf || '(fehlt)'}`);
    console.log(`  was dort zu tun ist       ${tuer.hinweis || '(fehlt)'}`);
    console.log(`  anderes Werkzeug          ${tuer.wechsel || '(fehlt)'}`);
    console.log(`  führt nach                ${tuer.ziel || '(nirgendwohin)'}`);
    pruefe(briefingOffen, 'Briefing: der Weg zum Geräusch-Briefing führt nicht in den Dialog');
    pruefe(
      /Claude/.test(tuer.knopf),
      `Briefing: am Ende steht kein Weg zum gewählten Werkzeug — „${tuer.knopf}"`
    );
    pruefe(
      tuer.ziel.startsWith('https://claude.ai/'),
      `Briefing: der Knopf führt nach „${tuer.ziel || 'nirgendwohin'}" statt zum gewählten Werkzeug`
    );
    pruefe(
      /ChatGPT/.test(tuer.wechsel),
      `Briefing: kein leiser Wechsel zum anderen Werkzeug — „${tuer.wechsel}"`
    );
    pruefe(
      tuer.hinweis.length > 0,
      'Briefing: der Knopf sagt nicht, was am Ziel zu tun ist — einfügen und das ZIP anhängen'
    );
    pruefe(
      tuer.primaer === BUDGET.primaer,
      `Briefing: ${tuer.primaer} dominante Handlungen auf dem Erfolgsbildschirm statt genau einer`
    );
    // Den Dialog wieder schließen, damit der Rest des Laufs vorfindet, was er
    // erwartet.
    await page.evaluate(() => {
      const knoepfe = [...document.querySelectorAll('.analysepaket-erfolg-aktionen button')];
      (knoepfe[knoepfe.length - 1] ?? document.querySelector('.analysepaket-schliessen'))?.click();
    });
    await page.waitForTimeout(1200);

    /**
     * Und der Verlauf sagt, wie viel dahinter liegt. „Verlauf" allein war ein
     * Wort in Kleinschrift, hinter dem niemand etwas vermutete.
     */
    pruefe(
      /\d/.test(ruhe.verlaufText),
      `Fall C: der Verlauf nennt keine Zahl („${ruhe.verlaufText}")`
    );

    /**
     * Ein Tipp auf „Iris" → der runde Vergleich, und zwar gezeichnet.
     *
     * Gezählt werden gesetzte Bildpunkte, nicht Maße: Eine leere Leinwand mit
     * 340 px Höhe ist genau der Fehler, den man auf einem Bildschirmfoto nicht
     * sieht. Dieselbe Lehre wie beim Fingerabdruck und beim Gebirge.
     */
    // Ab hier wird im Analyseblatt gemessen: Quellen, Iris, Ziehen und Gebirge
    // liegen seit dem 23.08.2026 dort. Das Bild auf der Seite ist Beleg.
    await blattAufziehen(page, 'zweid');
    await page.evaluate(() => {
      const knopf = [...document.querySelectorAll('#tab-zweid .klangbild-quelle')].find((b) =>
        /iris/i.test(b.textContent)
      );
      knopf?.click();
    });
    await page.waitForTimeout(2500);
    const rund = await page.evaluate(() => {
      const c = document.querySelector('#tab-zweid .klangbild-iris');
      if (!c || !c.width || !c.height)
        return { da: Boolean(c), gemalt: false, flachWeg: false, hinweisWeg: false, farbig: false };
      if (!c || c.hidden)
        return { da: false, gemalt: false, flachWeg: false, hinweisWeg: false, farbig: false };
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let gemalt = false;
      /**
       * Farbig heißt: kalt UND warm im selben Bild.
       *
       * Die Iris färbt nach Stärke ein — kalt leise, rot stark. Eine Iris, die
       * nur eine Linie zeichnet oder einfarbig füllt, wäre wieder der Zustand,
       * den der Auftraggeber am 22.08.2026 angemerkt hat: „jetzt sehe ich nur
       * den Pfad oder eine Linie im Kreis".
       */
      let kalt = false;
      let warm = false;
      for (let i = 0; i < d.length; i += 4 * 11) {
        if (d[i + 3] === 0) continue;
        gemalt = true;
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        if (b > r + 40) kalt = true;
        if (r > b + 60 && r > g + 40) warm = true;
      }
      const flach = document.querySelector('#tab-zweid .klangbild-flach');
      const hinweis = document.querySelector('#tab-zweid .klangbild-hinweis');
      return {
        da: true,
        gemalt,
        // Zwei Bilder übereinander wären zwei Aussagen über dieselbe Fläche.
        flachWeg: Boolean(flach && flach.hidden),
        // Seit dem 23.08.2026 trägt das Klangbild der Seite gar keinen
        // „vergrößern"-Hinweis mehr: Es ist Beleg, nicht Werkzeug. Ein
        // Versprechen, das es nicht halten kann, gibt es damit auch nicht.
        hinweisWeg: !hinweis || getComputedStyle(hinweis).display === 'none',
        farbig: kalt && warm,
      };
    });
    console.log(`  Quellen im Klangbild      ${ruhe.klangbildQuellenNamen.join(' · ')}`);
    console.log(
      `  ein Tipp auf „Iris"       ${rund.gemalt ? 'runder Vergleich gemalt' : 'NICHTS'}${
        rund.farbig ? ', nach Stärke gefärbt' : ''
      }`
    );
    pruefe(rund.da, 'Fall C: „Iris" bringt keine runde Ansicht');
    pruefe(rund.gemalt, 'Fall C: die Iris ist leer — eine Leinwand mit Maßen ist kein Bild');
    pruefe(
      rund.farbig,
      'Fall C: die Iris zeigt keine Stärke — kalt für leise, rot für stark fehlt im Bild'
    );
    pruefe(rund.flachWeg, 'Fall C: das flache Spektrogramm steht noch unter der Iris');
    pruefe(
      rund.hinweisWeg,
      'Fall C: die Iris verspricht eine große Ansicht, die es für sie nicht gibt'
    );

    /**
     * ── EINE STELLE HERAUSGREIFEN UND HÖREN ──────────────────────────────
     *
     * Der Auftraggeber am 22.08.2026: Er sieht das flache Spektrum, kann aber
     * keine Stelle daraus herausnehmen und anhören. Gemessen wird deshalb die
     * ganze Kette: Zug auf dem Bild → Rahmen steht → Bereich benannt → ein
     * Tipp spielt.
     *
     * Der Zug wird mit echten Zeigerereignissen gefahren, nicht gesetzt: Ob
     * Tipp und Zug auseinandergehalten werden, ist genau die Frage.
     */
    await page.evaluate(() => {
      const knopf = [...document.querySelectorAll('#tab-zweid .klangbild-quelle')].find((b) =>
        /messung/i.test(b.textContent)
      );
      knopf?.click();
    });
    await page.waitForTimeout(1200);
    const flaeche = await page.evaluate(() => {
      const k = document.querySelector('#tab-zweid .klangbild-flaeche')?.getBoundingClientRect();
      return k ? { x: k.x, y: k.y, w: k.width, h: k.height } : null;
    });
    if (flaeche) {
      await page.mouse.move(flaeche.x + flaeche.w * 0.2, flaeche.y + flaeche.h * 0.3);
      await page.mouse.down();
      await page.mouse.move(flaeche.x + flaeche.w * 0.45, flaeche.y + flaeche.h * 0.5, {
        steps: 6,
      });
      await page.mouse.move(flaeche.x + flaeche.w * 0.7, flaeche.y + flaeche.h * 0.75, {
        steps: 6,
      });
      await page.mouse.up();
      await page.waitForTimeout(1200);
    }
    const zug = await page.evaluate(() => {
      const rahmen = document.querySelector('#tab-zweid .klangbild-auswahlrahmen');
      const zeile = document.querySelector('#tab-zweid .klangbild-auswahlzeile');
      const k = rahmen?.getBoundingClientRect();
      return {
        rahmenDa: Boolean(rahmen && !rahmen.hidden && k && k.width > 4 && k.height > 4),
        zeileDa: Boolean(zeile && !zeile.hidden),
        bereich:
          document.querySelector('#tab-zweid .klangbild-auswahl-bereich')?.textContent?.trim() ??
          '',
        // Ein Zug darf das Gebirge NICHT geöffnet haben.
        gebirge: Boolean(document.querySelector('.spectro3d-panel')),
      };
    });
    console.log(`  Zug auf dem Bild          ${zug.rahmenDa ? 'Rahmen steht' : 'NICHTS'}`);
    console.log(`  Bereich                   ${zug.bereich || '(fehlt)'}`);
    pruefe(zug.rahmenDa, 'Fall C: ein Zug über das Bild hinterlässt keinen Auswahlrahmen');
    pruefe(zug.zeileDa, 'Fall C: zur Auswahl gibt es keine Zeile zum Abspielen');
    pruefe(
      /\d.*s.*Hz|kHz/i.test(zug.bereich),
      `Fall C: die Auswahl nennt keinen Zeit- und Frequenzbereich („${zug.bereich}")`
    );
    pruefe(
      !zug.gebirge,
      'Fall C: der Zug wurde als Tipp gewertet — das Gebirge steht, statt eine Auswahl zu bestehen'
    );

    // Und sie muss zu hören sein.
    await page.evaluate(() =>
      document.querySelector('#tab-zweid .klangbild-auswahl-spielen')?.click()
    );
    await page.waitForTimeout(1800);
    const hoert = await page.evaluate(
      () =>
        document.querySelector('#tab-zweid .klangbild-auswahl-spielen')?.textContent?.trim() ?? ''
    );
    console.log(`  ein Tipp spielt die Auswahl ${hoert}`);
    pruefe(
      /stopp/i.test(hoert),
      `Fall C: die Auswahl lässt sich nicht abspielen — der Knopf sagt „${hoert}"`
    );
    await page.evaluate(() => document.querySelector('#tab-zweid .klangbild-auswahl-weg')?.click());
    await page.waitForTimeout(600);

    /**
     * ── DAS GEBIRGE HAT EINEN EIGENEN REITER ───────────────────────────────
     *
     * Bis zum 23.08.2026 entstand es nach einem Tipp auf das Klangbild. Seit
     * die Analyse im Blatt liegt, steht es im zweiten Reiter — immer an
     * derselben Stelle, unabhängig davon, was oben gerade zu sehen ist.
     *
     * Der Tausch ist bewusst: ein Zug plus ein Tipp statt eines Tipps, dafür
     * ein Ort statt dreier.
     */
    await blattAufziehen(page, 'dreid');
    await page
      .waitForFunction(
        () => {
          const c = document.querySelector('#tab-dreid .spectro3d canvas');
          return Boolean(c && c.width > 0 && c.height > 0);
        },
        null,
        { timeout: 25000 }
      )
      .catch(() => {});
    const tief = await page.evaluate(() => {
      const c = document.querySelector('#tab-dreid .spectro3d canvas');
      const panel = document.querySelector('#tab-dreid .spectro3d-panel');
      const inhalt = document.getElementById('tab-dreid');
      return {
        panel: Boolean(panel),
        leinwand: Boolean(c && c.width > 0 && c.height > 0),
        masse: c ? `${c.width}×${c.height}` : '(keine Leinwand)',
        text: inhalt?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
        ebene: document.body.classList.contains('tiefe-maschine'),
      };
    });
    console.log(
      `  Reiter „3D"               ${tief.leinwand ? `Gebirge steht (${tief.masse})` : `NICHTS — Panel ${tief.panel ? 'da' : 'fehlt'}, ${tief.masse}, „${tief.text}"`}`
    );
    pruefe(tief.panel && tief.leinwand, 'Fall C: der Reiter „3D" bringt kein Gebirge');

    /**
     * ── AUCH DAS GEBIRGE WANDERT NICHT ────────────────────────────────────
     *
     * Der Auftraggeber am 22.08.2026: „Jede Kommentarzumessung kommt immer noch
     * oberhalb von diesem 3D-Gebirge, und deswegen verschiebt sich das. Nun ist
     * ein Vergleich ziemlich schlecht."
     *
     * Gemessen wird dasselbe wie beim Bildplatz, eine Etage tiefer: die
     * Oberkante der Leinwand, vor und nach einem Wechsel der Quelle. Die
     * Stärkeanzeige darunter darf sich ändern, wie sie will — das Bild bleibt.
     */
    const gebirgeVorher = await page.evaluate(() => {
      const c = document.querySelector('#tab-dreid .spectro3d-panel canvas');
      return c ? Math.round(c.getBoundingClientRect().top) : null;
    });
    const gewechselt = await page.evaluate(() => {
      const sichtbar = (e) => getComputedStyle(e).display !== 'none';
      const chips = [
        ...document.querySelectorAll('#tab-dreid .spectro3d-toggle-row button'),
      ].filter(
        (b) =>
          sichtbar(b) &&
          !b.classList.contains('spectro3d-reset') &&
          !b.classList.contains('spectro3d-scale') &&
          !b.classList.contains('spectro3d-time') &&
          !/🏔️/.test(b.textContent)
      );
      /**
       * Auf „Unterschied" wechseln, nicht irgendwohin.
       *
       * Genau dort füllt sich die Stärkeanzeige („Leicht erhöht" samt zwei
       * Absätzen Erklärung) — bei Messung und Normalzustand bleibt sie leer.
       * Ein Wechsel zwischen zwei leeren Zuständen verschiebt nichts und wäre
       * eine Messung, die nie anschlägt: Der erste Versuch dieses Wächters tat
       * genau das und blieb auch dann grün, als der Fehler absichtlich wieder
       * eingebaut war.
       */
      const ziel = chips.find((b) => /unterschied/i.test(b.textContent)) ?? chips[1] ?? chips[0];
      if (!ziel) return '';
      ziel.click();
      return ziel.textContent.trim();
    });
    await page.waitForTimeout(3500);
    const gebirgeNachher = await page.evaluate(() => {
      const c = document.querySelector('#tab-dreid .spectro3d-panel canvas');
      return c ? Math.round(c.getBoundingClientRect().top) : null;
    });
    console.log(
      `  Gebirge bei „${gewechselt || '(keine Quelle)'}"   ${gebirgeVorher} px → ${gebirgeNachher} px`
    );
    pruefe(
      gebirgeVorher !== null && gebirgeNachher !== null,
      'Fall C: die Leinwand des Gebirges ist beim Quellenwechsel verschwunden'
    );
    pruefe(
      gebirgeVorher === null ||
        gebirgeNachher === null ||
        Math.abs(gebirgeVorher - gebirgeNachher) <= BUDGET.bildplatzWandert,
      `Fall C: das Gebirge wandert beim Quellenwechsel um ${
        gebirgeVorher !== null && gebirgeNachher !== null
          ? Math.abs(gebirgeVorher - gebirgeNachher)
          : '?'
      } px (erlaubt ${BUDGET.bildplatzWandert})`
    );
    pruefe(
      tief.ebene,
      'Fall C: das Gebirge öffnet eine neue Ebene — es soll an Ort und Stelle wachsen'
    );
    // Das Blatt wieder zuziehen, damit der Rest des Laufs die Seite vorfindet.
    await blattZuziehen(page);

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
    console.log(
      `  Bildplatz (Ruhe → Ergebnis)    ${ruhe.klangbildOben} px → ${schlecht.klangbildOben} px`
    );

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
    /**
     * ── ZWEI STUFEN, HINTER DEM SCHARNIER ────────────────────────────────
     *
     * In BASIS beantwortet die Hör-Lupe die eine Frage: Normalzustand, Messung,
     * Unterschied. Die Werkzeuge zum Sezieren — die bearbeitete Hörhilfe und
     * die tiefe Auswahl mit Maßstabsvergleich — stehen dort NICHT.
     */
    console.log(`  Stufe                          ${schlecht.stufe}`);
    console.log(
      `  in Basis verborgen             Hervorhebung ${schlecht.hervorhebungGruppe === 0 ? 'ja' : 'NEIN'} · tiefe Auswahl ${schlecht.tiefeAuswahl === 0 ? 'ja' : 'NEIN'}`
    );
    pruefe(
      schlecht.stufe === 'basic',
      `Fall A: die Reise läuft auf Stufe „${schlecht.stufe}" statt auf Basis — der Vergleich der Stufen wäre keiner`
    );
    pruefe(
      schlecht.hervorhebungGruppe === 0,
      'Fall A/Basis: die bearbeitete Hörhilfe steht in Basis — sie ist ein Profi-Werkzeug'
    );
    pruefe(
      schlecht.tiefeAuswahl === 0,
      'Fall A/Basis: die tiefe Auswahl mit Maßstabsvergleich steht in Basis'
    );

    /**
     * Und jetzt auf Profi — über die Oberfläche, nicht über das Attribut.
     *
     * Gemessen am 22.08.2026 war der Basis/Profi-Schalter hinter dem Scharnier
     * `unsichtbar`: Er lag im Kopfstreifen beziehungsweise in der Leiste, und
     * beide ruhten dort.
     *
     * Der erste Versuch holte ihn mit „☰" in einer aufziehbaren Leiste hervor.
     * Der Auftraggeber hat widersprochen: Er will den Streifen **sehen**, nicht
     * in einem Tipp erreichen. Gemessen wird deshalb genau das — der Schalter
     * steht da, **ohne** dass irgendetwas angetippt wurde.
     */
    const rahmen = await page.evaluate(() => {
      const sicht = (el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        const k = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && k.height > 0 ? k : null;
      };
      const schalter = sicht(document.getElementById('depth-switch'));
      const streifen = sicht(document.getElementById('mobile-topnav'));
      const leiste = sicht(document.getElementById('sidebar'));
      const tiefe = document.getElementById('zanobo-tiefe')?.getBoundingClientRect();
      return {
        schalterHoch: schalter ? Math.round(schalter.height) : 0,
        schalterUnten: schalter ? Math.round(schalter.bottom) : 0,
        streifenUnten: streifen ? Math.round(streifen.bottom) : 0,
        leisteOben: leiste ? Math.round(leiste.top) : 0,
        blattOffen: document.body.classList.contains('sheet-open'),
        tiefeOben: tiefe ? Math.round(tiefe.top) : 0,
        tiefeUnten: tiefe ? Math.round(tiefe.bottom) : 0,
        kartenstilSichtbar: Boolean(sicht(document.querySelector('.basemap-control'))),
      };
    });
    console.log(
      `  Rahmen um die Tiefe            Streifen bis ${rahmen.streifenUnten} px · Tiefe ${rahmen.tiefeOben}–${rahmen.tiefeUnten} px · Blatt ab ${rahmen.leisteOben} px`
    );
    console.log(
      `  Stufenschalter ohne Tipp       ${rahmen.schalterHoch > 0 ? `sichtbar (${rahmen.schalterHoch} px)` : 'UNSICHTBAR'}`
    );
    pruefe(
      rahmen.schalterHoch > 0,
      'S5d: der Basis/Profi-Schalter ist hinter dem Scharnier nicht zu sehen — er soll dastehen, nicht in einem Tipp liegen'
    );
    pruefe(rahmen.schalterHoch >= 40, `S5d: der Stufenschalter ist ${rahmen.schalterHoch} px hoch`);
    /**
     * Die Tiefe liegt IM Rahmen, nicht darüber.
     *
     * Beginnt sie über der Unterkante des Streifens, scrollt ihr Inhalt unter
     * der Basis/Profi-Pille durch — dann steht der Schalter zwar da, aber die
     * Arbeitsfläche schiebt sich unter ihn.
     */
    pruefe(
      rahmen.tiefeOben >= rahmen.streifenUnten - 2,
      `S5d: die Tiefe beginnt bei ${rahmen.tiefeOben} px, der Kopfstreifen endet erst bei ${rahmen.streifenUnten} px — der Inhalt läuft darunter durch`
    );
    /**
     * Die Tiefe endet an der Guckhöhe des Blatts — solange es unten liegt.
     *
     * Seit dem 23.08.2026 kann das Blatt absichtlich aufgezogen sein: Dann
     * liegt die Analyse darin und verdeckt die untere Hälfte der Seite. Das
     * ist die Aufteilung, nicht ihr Bruch. Gemessen wird deshalb nur im
     * geschlossenen Zustand — der erste Versuch dieses Wächters meldete nach
     * dem Gebirge-Bein „das Blatt beginnt schon bei 270 px" und beschrieb
     * damit genau das, was er messen sollte.
     */
    pruefe(
      rahmen.blattOffen || rahmen.leisteOben === 0 || rahmen.tiefeUnten <= rahmen.leisteOben + 2,
      `S5d: die Tiefe endet bei ${rahmen.tiefeUnten} px, das Blatt beginnt schon bei ${rahmen.leisteOben} px`
    );
    pruefe(
      !rahmen.kartenstilSichtbar,
      'S5e: die Leiste bietet hinter dem Scharnier den Kartenstil an — eine Bedienung für eine Karte, die man dort nicht sieht'
    );

    await page.evaluate(() => {
      document.querySelector('#depth-switch .view-level-btn[data-level="expert"]')?.click();
    });
    await page.waitForTimeout(1200);
    const profi = await page.evaluate(AUFMASS_ERGEBNIS);
    console.log(`  nach dem Umschalten            Stufe ${profi.stufe}`);
    console.log(
      `  in Profi sichtbar              Hervorhebung ${profi.hervorhebung.length} Stufen · tiefe Auswahl ${profi.tiefeAuswahl}`
    );
    pruefe(
      profi.stufe === 'expert',
      `S5d: der Schalter stellt die Stufe nicht um — sie steht auf „${profi.stufe}"`
    );
    pruefe(
      profi.hervorhebung.length === 3,
      `Fall A/Profi: die Hervorhebung zeigt ${profi.hervorhebung.length} Stufen statt Originalmessung, Deutlich und Stark`
    );
    pruefe(
      profi.tiefeAuswahl === 1,
      'Fall A/Profi: die tiefe Auswahl fehlt, obwohl Profi eingeschaltet ist'
    );
    pruefe(
      /bearbeitete hörhilfe/i.test(profi.hervorhebungHinweis) &&
        /unverändert/i.test(profi.hervorhebungHinweis),
      'Fall A: die Hervorhebung ist nicht klar als bearbeitete, folgenlose Hörhilfe gekennzeichnet'
    );
    pruefe(
      !profi.teilenVorherSichtbar,
      'Schnitt 4b: Teilen wird angeboten, bevor feststeht, welche Hörhilfe gemeint ist'
    );
    pruefe(
      schlecht.zuKlein.length === 0,
      `Fall A: Antippziele unter ${BUDGET.antippgroesse} px — ${schlecht.zuKlein.join(', ')}`
    );
    /**
     * DER BILDPLATZ WANDERT NICHT.
     *
     * Dieselbe Maschine, zwei Zustände, ein Bild — und es muss an derselben
     * Stelle stehen. Der Auftraggeber hat am 22.08.2026 beschrieben, warum:
     * Wer zwischen zwei Ansichten hin- und herschaltet, um mit dem Auge zu
     * vergleichen, vergleicht zwei Stellen statt zweier Bilder, sobald sich
     * die Ansicht dazwischen verschiebt.
     *
     * Verglichen wird gegen Fall C — denselben Ruhezustand, dieselbe Maschine,
     * dasselbe Fenster, nur ein paar Sekunden früher.
     */
    pruefe(
      schlecht.klangbildOben !== null,
      'Fall A: im Ergebnis steht kein Spektrogramm — es gibt nichts zu vergleichen'
    );
    pruefe(
      ruhe.klangbildOben !== null &&
        schlecht.klangbildOben !== null &&
        Math.abs(ruhe.klangbildOben - schlecht.klangbildOben) <= BUDGET.bildplatzWandert,
      `Fall A: der Bildplatz wandert zwischen Ruhe und Ergebnis um ${
        ruhe.klangbildOben !== null && schlecht.klangbildOben !== null
          ? Math.abs(ruhe.klangbildOben - schlecht.klangbildOben)
          : '?'
      } px (erlaubt ${BUDGET.bildplatzWandert})`
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
    await page
      .locator('.hoerlupe-hervorhebung-knopf[data-highlight-level="clear"]')
      .click({ timeout: 15000 })
      .catch(() => {});
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

    await page
      .locator('.hoerlupe-hervorhebung-knopf[data-highlight-level="strong"]')
      .click({ timeout: 15000 })
      .catch(() => {});
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

    await page
      .locator('.hoerlupe-hervorhebung-knopf[data-highlight-level="off"]')
      .click({ timeout: 15000 })
      .catch(() => {});
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
    // Melden statt sterben: Steht die tiefe Auswahl nicht da — etwa weil die
    // Stufe nicht umgeschaltet hat —, ist das ein Befund. Ein Lauf, der hier
    // in einen Zeitablauf rennt, verschweigt alle Befunde davor.
    await canvas.scrollIntoViewIfNeeded({ timeout: 15000 }).catch(() => {});
    const canvasBox = await canvas.boundingBox().catch(() => null);
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
    await page
      .locator('.hoerlupe-auswahl-spielen')
      .click({ timeout: 15000 })
      .catch(() => {});
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
    await page
      .locator('.hoerlupe-auswahl-spielen')
      .click({ timeout: 15000 })
      .catch(() => {});
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
        /**
         * Nebeneinander — und zwar auf beiden Seiten gültig.
         *
         * Bis zum 23.08.2026 hieß das „die Lupe steht rechts von der
         * Handlung": Sie lag in der zweiten Spalte des Ergebnisses. Seit die
         * Analyse im Blatt liegt, steht sie am Schreibtisch in der
         * Seitenleiste — also LINKS. Die Frage ist dieselbe geblieben: Muss
         * man scrollen, um an die Analyse zu kommen, oder liegt sie daneben?
         */
        nebeneinander: l.right <= a.left + 1 || l.left >= a.right - 1,
        /** Und sie teilen sich wirklich die Höhe, statt untereinander zu liegen. */
        gleicheHoehe: l.top < a.bottom && a.top < l.bottom,
        lupeOben: Math.round(l.top),
        aktionOben: Math.round(a.top),
      };
    });

    console.log('\n=== Reise, Teil 5: dasselbe Ergebnis am Schreibtisch (1440×900) ===');
    console.log(`  Breite der Fläche              ${tisch ? tisch.breite + ' px' : '(fehlt)'}`);
    console.log(
      `  Hör-Lupe neben der Handlung    ${tisch?.nebeneinander ? 'ja' : 'NEIN'}${
        tisch?.gleicheHoehe ? ', auf gleicher Höhe' : ''
      }`
    );

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
