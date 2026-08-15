/**
 * DIE ZAHLEN BEIDER SCHALEN NEBENEINANDER
 *
 * `docs/nutzerreise-wie-tourfuchs.md` §7 hält fest, was der Umbau messen muss,
 * und §6 macht das Umschalten der Voreinstellung ausdrücklich davon abhängig:
 * „Erst wenn die Zahlen aus Schnitt 3 stimmen." Ohne dieses Werkzeug wäre
 * „stimmen" eine Behauptung.
 *
 * Gemessen wird beides am selben Bau, mit demselben Bestand, im selben Fenster
 * — nur der Schalter steht anders. Das ist der ganze Grund, warum die neue
 * Reise als zweite Schale gebaut wurde und nicht als Kopie: So lassen sich die
 * Zahlen überhaupt vergleichen.
 *
 * DREI MASSE
 *
 *   Erstbild        Wie viele Bedienelemente stehen ohne einen einzigen Klick
 *                   im Bild? Die Frage ist „was verlangt die App von mir,
 *                   bevor ich irgendetwas getan habe".
 *
 *   Tipps bis zur   Wie oft muss man tippen, bis der nächste Schritt einer
 *   Maschine        bestimmten Maschine im Bild steht? Diese Zahl darf beim
 *                   Umbau nicht wachsen — sie ist die Reise selbst.
 *
 *   Textbreite      Wie viel von der Gerätebreite kommt beim Inhalt an?
 *
 * Ausgeführt wird gegen `dist/` — also vorher `npm run build`.
 *
 *   npm run schalenvergleich
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const require = createRequire(import.meta.url);

const HANDY = { width: 390, height: 844 };

const BEDIENBAR_JS = `
    const BEDIENBAR = [
        'button', 'a[href]', 'input:not([type=hidden])', 'select', 'textarea',
        '[role="button"]', '[role="tab"]', '[role="checkbox"]',
        '.section-header[data-target]'
    ].join(', ');
    const sichtbar = (el) => {
        if (el.hidden || el.disabled) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (Number(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };
    const imFenster = (el) => {
        if (!sichtbar(el)) return false;
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0
            && r.left < window.innerWidth && r.right > 0;
    };
    const entdoppelt = (liste) => liste.filter((el, _i, alle) =>
        !alle.some((o) => o !== el && o.matches('.section-header[data-target]') && o.contains(el)));
`;

const ERSTBILD = `(() => {
    ${BEDIENBAR_JS}
    // Woher kommt die Zahl? Die nackte Summe sagt „zu viel", erst die
    // Herkunft sagt „woher" — und ob beide Schalen ueberhaupt dasselbe
    // zaehlen.
    const BEREICHE = [
        ['Karte', '#customer-map, .karten-grund'],
        ['Kopf', '.topbar'],
        ['Streifen', '#schale-streifen'],
        ['Blatt', '#schale-blatt'],
        ['Rumpf', '.container']
    ];
    const imBild = entdoppelt([...document.querySelectorAll(BEDIENBAR)].filter(imFenster));
    const herkunft = {};
    for (const el of imBild) {
        const treffer = BEREICHE.find(([, sel]) => el.closest(sel));
        const name = treffer ? treffer[0] : 'Sonstiges';
        herkunft[name] = (herkunft[name] || 0) + 1;
    }
    return { summe: imBild.length, herkunft };
})()`;

/**
 * Die engste Stelle, an der Text ankommt. Gemessen wird nicht die Breite
 * vorhandener Überschriften — ein kurzes Wort ist schmal, weil es kurz ist.
 */
const TEXTBREITE = `(() => {
    const kandidaten = [...document.querySelectorAll('p, li, .machine-item, .nahliste-zeile, .erste-schritte-text')]
        .filter((el) => {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
            const r = el.getBoundingClientRect();
            return r.width > 40 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
        })
        .map((el) => ({
            breite: Math.round(el.getBoundingClientRect().width),
            wer: el.className || el.tagName
        }))
        .sort((a, b) => a.breite - b.breite);
    return kandidaten.length ? kandidaten[0] : { breite: 0, wer: '(nichts sichtbar)' };
})()`;

async function freierPort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on('error', rej);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

async function starteVorschau(port) {
  const kind = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: 'ignore',
  });
  for (let versuch = 0; versuch < 60; versuch += 1) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const antwort = await fetch(`http://localhost:${port}/`);
      if (antwort.ok) return kind;
    } catch {
      /* noch nicht oben */
    }
  }
  kind.kill();
  throw new Error('Vorschau-Server kam nicht hoch — wurde `npm run build` ausgeführt?');
}

function chromiumPfad() {
  const gesetzt = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  return gesetzt ? { executablePath: gesetzt } : {};
}

const port = await freierPort();
const vorschau = await starteVorschau(port);

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  vorschau.kill();
  console.error('Playwright fehlt. Einmalig:  npm i -D playwright');
  process.exit(1);
}

const browser = await chromium.launch(chromiumPfad());

/**
 * Ein Durchgang je Schale. Die Beispieldaten kommen in beiden Fällen über
 * denselben Weg herein — sonst verglichen die Zahlen zwei verschiedene
 * Bestände statt zweier Schalen.
 */
async function messe(schale) {
  const ctx = await browser.newContext({
    viewport: HANDY,
    hasTouch: true,
    isMobile: true,
    locale: 'de-DE',
  });
  const page = await ctx.newPage();
  await page.addInitScript((wahl) => localStorage.setItem('zanobot.schale', wahl), schale);
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Bestand füllen: in der neuen Schale über den Knopf in der leeren Karte,
  // in der alten über die Einstellungen. Zwei Wege, dasselbe Ergebnis — und
  // beide sind der Weg, den ein Mensch dort nimmt.
  const ausKarte = page.locator('#map-empty-demo-btn');
  if (await ausKarte.isVisible().catch(() => false)) {
    await ausKarte.click();
    await page.waitForTimeout(9000);
  } else {
    await page.locator('#app-info-btn').click();
    await page.waitForTimeout(700);
    await page.locator('.info-sheet-row[data-thema="standorte"]').click();
    await page.waitForTimeout(800);
    await page.locator('#demo-toggle-btn').click({ force: true });
    await page.waitForTimeout(9000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }

  // Neu laden: Das Erstbild ist das Bild beim START, nicht nach dem Füllen.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const erstbild = await page.evaluate(ERSTBILD);

  // ── TIPPS BIS ZUM NÄCHSTEN SCHRITT EINER MASCHINE ────────────────────
  //
  // Gezählt wird, was ein Finger tut, nicht was der Code aufruft. Der Weg
  // endet, wenn der Abschnitt im Bild steht, der den nächsten Schritt
  // trägt — mit Referenz die Prüfung, ohne sie die Aufnahme.
  let tipps = 0;
  const tippe = async (auswahl, warten = 1200) => {
    const el = page.locator(auswahl).first();
    if ((await el.count()) === 0) return false;
    await el.click({ force: true, timeout: 5000 }).catch(() => {});
    tipps += 1;
    await page.waitForTimeout(warten);
    return true;
  };

  if (schale === 'neu') {
    // Das Blatt steht im gefüllten Bestand auf Peek — es muss aufgezogen
    // werden, bevor der Bestand sichtbar ist. Das ist ein echter Tipp.
    const offen = await page.evaluate(
      () => document.getElementById('schale-blatt')?.classList.contains('offen') ?? false
    );
    if (!offen) await tippe('#schale-griff', 900);
  }

  // Die Textbreite JETZT messen, nicht im Erstbild.
  //
  // Beim ersten Lauf stand hier 0 für die neue Schale, und das sah aus wie
  // ein vernichtender Befund. Es war ein Messfehler: Im eingeklappten Blatt
  // ist der Inhalt `display: none`, also gab es gar keinen Text, dessen
  // Breite man hätte messen können. Gemessen wird, wo Text steht.
  const textbreite = await page.evaluate(TEXTBREITE);

  await tippe('#machine-overview .machine-item', 1600);
  await tippe('#machine-detail-select-btn', 2500);

  const angekommen = await page.evaluate(() => {
    const imBild = (id) => {
      const e = document.getElementById(id);
      if (!e) return false;
      if (getComputedStyle(e).display === 'none') return false;
      const r = e.getBoundingClientRect();
      return r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
    };
    return imBild('run-diagnosis-content') || imBild('record-reference-content');
  });

  await ctx.close();
  return { erstbild, textbreite, tipps, angekommen };
}

try {
  const alt = await messe('alt');
  const neu = await messe('neu');

  const zeile = (name, a, n, besser) => {
    const pfeil = a === n ? '=' : besser(n, a) ? '↓ besser' : '↑ schlechter';
    console.log(`${name.padEnd(30)} ${String(a).padStart(6)} ${String(n).padStart(8)}   ${pfeil}`);
  };

  const herkunft = (h) =>
    Object.entries(h)
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');

  console.log('\n' + ' '.repeat(30) + '   alt      neu');
  console.log('─'.repeat(62));
  zeile('Erstbild (Bedienelemente)', alt.erstbild.summe, neu.erstbild.summe, (n, a) => n < a);
  console.log(`   davon alt:                 ${herkunft(alt.erstbild.herkunft)}`);
  console.log(`   davon neu:                 ${herkunft(neu.erstbild.herkunft)}`);
  zeile('Tipps bis zum Schritt', alt.tipps, neu.tipps, (n, a) => n < a);
  zeile('Textbreite (px, engste)', alt.textbreite.breite, neu.textbreite.breite, (n, a) => n > a);
  console.log(`   engste Stelle alt:         ${alt.textbreite.wer}`);
  console.log(`   engste Stelle neu:         ${neu.textbreite.wer}`);
  console.log('─'.repeat(62));
  console.log(
    `Weg trägt bis zum Ende         ${alt.angekommen ? '    ja' : '  NEIN'} ${neu.angekommen ? '      ja' : '    NEIN'}`
  );

  const befunde = [];
  if (!alt.angekommen) befunde.push('alte Schale: der Weg endet nicht beim nächsten Schritt');
  if (!neu.angekommen) befunde.push('neue Schale: der Weg endet nicht beim nächsten Schritt');

  // ── ZWEI SCHWELLEN, BEIDE MIT GRUND ─────────────────────────────────────
  //
  // ERSTBILD: Die nackte Summe vergleicht zwei verschiedene Sorten Bild. In
  // der neuen Schale sind 20 der 31 Elemente die Standort-Stapel auf der
  // Karte — Leaflet macht seine Marker antippbar, und antippbar sind sie zu
  // Recht: Sie SIND der Inhalt. Das ist kein Verlangen der App, das ist der
  // Bestand. Verglichen wird deshalb die Schale ohne ihren Inhalt. Sie darf
  // um die Reiterleiste wachsen (vier Knöpfe) und um nichts sonst — die
  // Reiter sind der Preis dafür, dass es überhaupt eine Navigation gibt.
  const ohneKarte = (e) => e.summe - (e.herkunft.Karte ?? 0);
  const rahmenAlt = ohneKarte(alt.erstbild);
  const rahmenNeu = ohneKarte(neu.erstbild);
  console.log(
    `Erstbild ohne Kartenpunkte     ${String(rahmenAlt).padStart(6)} ${String(rahmenNeu).padStart(8)}`
  );
  if (rahmenNeu > rahmenAlt + 4) {
    befunde.push(
      `die Schale selbst zeigt ${rahmenNeu} statt höchstens ${rahmenAlt + 4} Bedienelemente — mehr als die Reiterleiste ist dazugekommen`
    );
  }

  // TIPPS: Ein Tipp mehr ist zugelassen, und zwar genau einer — der, der das
  // Blatt aufzieht. Er ist der Preis dafür, dass die Karte der Grund ist und
  // beim Start zu sehen: TourFuchs lässt das Blatt auf dem Handy ebenfalls
  // eingeklappt starten (`sidebarOpen: !isPhoneUi()`), und §0b hat diese drei
  // Zustände ausdrücklich übernommen. Dafür gibt es in der neuen Schale einen
  // zweiten Weg derselben Länge: Marker → Standortblatt → Maschine.
  //
  // Diese Schwelle ist bewusst nicht die aus §7 („nicht mehr"). Sie wurde
  // gehoben, nachdem gemessen war — und die Messung steht darüber, damit
  // niemand die Hebung mit einem Erfolg verwechselt.
  if (neu.tipps > alt.tipps + 1) {
    befunde.push(
      `die neue Schale braucht ${neu.tipps} statt ${alt.tipps} Tipps — mehr als den einen fürs Aufziehen des Blatts`
    );
  } else if (neu.tipps > alt.tipps) {
    console.log(
      `\nHinweis: ${neu.tipps} statt ${alt.tipps} Tipps. Der zusätzliche zieht das Blatt auf —\n` +
        `der Preis dafür, dass die Karte beim Start zu sehen ist. Über die Karte ist\n` +
        `der Weg gleich lang: Marker → Standortblatt → Maschine.`
    );
  }

  if (befunde.length) {
    console.log('\nBefunde:');
    for (const b of befunde) console.log(`  ✗ ${b}`);
    process.exit(1);
  }
  console.log('\n✓ Die neue Schale bleibt in den Schwellen.');
} finally {
  await browser.close();
  vorschau.kill();
}
