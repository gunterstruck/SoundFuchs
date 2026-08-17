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

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const FORMATE = [
  ['handy', { width: 390, height: 844 }, true],
  ['tablet-hoch', { width: 820, height: 1180 }, true],
  ['tablet-quer', { width: 1180, height: 820 }, true],
  ['tisch', { width: 1440, height: 900 }, false],
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

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
  args: ['--no-sandbox'],
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
  };
};

try {
  for (const [name, viewport, touch] of FORMATE) {
    const ctx = await browser.newContext({
      viewport,
      hasTouch: touch,
      isMobile: touch,
      locale: 'de-DE',
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
      () => (document.querySelectorAll('.standort-maschine').length > 0)
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
          cs.display !== 'none' && cs.visibility !== 'hidden' && e.getBoundingClientRect().height > 0
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

    console.log(`\n=== ${name} (${viewport.width}×${viewport.height}) ===`);
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
    pruefe(arbeit.ebene, `${name}: die Primäraktion führt nicht in die Arbeitsebene`);
    pruefe(
      seitenfehler.length === 0,
      `${name}: Seitenfehler — ${seitenfehler.slice(0, 2).join(' | ')}`
    );

    await ctx.close();
  }
} finally {
  await browser.close();
  vorschau.kill();
}

if (befunde.length) {
  console.log('\nBefunde:');
  for (const b of befunde) console.log(`  ✗ ${b}`);
  process.exitCode = 1;
} else {
  console.log('\n✓ Der Weg zur Maschine ist kurz, und auf jedem Bild steht eine Frage.');
}
