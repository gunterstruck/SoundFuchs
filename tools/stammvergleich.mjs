/**
 * STEHT DER STAMM?
 *
 * Nicht „sieht es ähnlich aus", sondern: liegen dieselben Dinge an denselben
 * Stellen? Gemessen wird beides — TourFuchs und SoundFuchs — im selben
 * Fenster, mit demselben Skript, im selben Lauf.
 *
 * WARUM DIESES WERKZEUG DAS ALTE ERSETZT
 *
 * Bis zum 16.08.2026 stand hier `schalenvergleich.mjs`. Es legte zwei
 * SoundFuchs-Schalen nebeneinander — die bisherige und die „neue" — und maß,
 * ob die neue die alte einholt. Diese Frage ist zurückgenommen
 * (`docs/nutzerreise-wie-tourfuchs.md` §0h): Es gibt keine zwei Schalen mehr,
 * und die Messlatte war ohnehin die falsche. „Ist die neue so gut wie die
 * alte?" beantwortet nicht „ist es dasselbe wie TourFuchs?".
 *
 * Das Vorbild ist jetzt der Maßstab, und zwar buchstäblich: Beide Anwendungen
 * werden gestartet und ausgemessen, und was auseinanderliegt, steht mit
 * beiden Zahlen nebeneinander.
 *
 * WAS EIN UNTERSCHIED BEDEUTET
 *
 * Nicht jeder ist ein Fehler. Reiter und Pillen sollen sich unterscheiden —
 * Tourplanung, Umsatz und Lasso sind fachlich entfallen, das ist der Auftrag.
 * Geometrie dagegen soll übereinstimmen: Kopfleiste, Karte, Blatt, Knopfzeile
 * und Kopfstreifen sind der Aufbau selbst, und wo der abweicht, ist etwas
 * nachgebaut statt übernommen.
 *
 * Deshalb zwei Gruppen: GEOMETRIE wird geprüft, INHALT nur berichtet.
 *
 * Voraussetzung: beide Anwendungen sind gebaut (`npm run build`).
 *
 *   npm run stammvergleich
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

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
const STAMM_ORT = process.env.TOURFUCHS_ORT ?? '/workspace/gunterstruck/tourfuchs';

/** Diese Maße müssen übereinstimmen — sie sind der Aufbau. */
const GEOMETRIE = [
  'kopfleiste',
  'streifen',
  'blatt',
  'karte',
  'knopfzeile',
  'tiefeIm',
  'reiterIm',
  'gesicht',
];
/** Diese werden nur berichtet — hier ist Abweichung der Auftrag. */
const INHALT = ['reiter', 'pillen', 'marker', 'tiefePille', 'nurMobil', 'nurTisch'];

/**
 * EINGETRAGENE ABWEICHUNGEN — §4a des Papiers.
 *
 * Dieser Wächter endet mit dem Satz: „Entweder die Stelle richtigstellen —
 * oder die Abweichung in §4a des Papiers eintragen, mit Grund." Bis zum
 * 23.08.2026 gab es die zweite Hälfte nur als Satz: Wer eintrug, blieb
 * trotzdem rot, und ein Wächter, der dauerhaft rot steht, wird nicht mehr
 * gelesen.
 *
 * Hier stehen deshalb die Felder, deren Abweichung im Register steht. Sie
 * werden weiter GEMESSEN und GEZEIGT — nur nicht mehr als Befund gezählt, und
 * die Zeile sagt, wo der Grund nachzulesen ist.
 *
 * Der Wächter verliert dadurch nichts: Jede Abweichung an einer Stelle, die
 * hier NICHT steht, macht ihn weiter rot. Wer eine neue einträgt, muss diese
 * Liste anfassen — und damit den Grund aufschreiben.
 */
const EINGETRAGEN = {
  knopfzeile: '§4a Geometrie: 44 px Fingerziel statt der 38–41 px des Stamms',
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

async function starte(cwd) {
  const port = await freierPort();
  const kind = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: 'ignore',
    cwd,
  });
  for (let i = 0; i < 80; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      if ((await fetch(`http://localhost:${port}/`)).ok) return { port, kind };
    } catch {
      /* noch nicht oben */
    }
  }
  kind.kill();
  throw new Error(`Vorschau kam nicht hoch: ${cwd}`);
}

/** Was das erste Bild zeigt — als Zahlen, nicht als Eindruck. */
const AUFMASS = () => {
  /**
   * Der sichtbare Kasten — auf das Fenster beschnitten.
   *
   * Beschnitten, weil die Frage lautet „liegt dasselbe an derselben Stelle",
   * und was unterhalb des Bildschirmrands liegt, liegt nirgends. Das Blatt ist
   * der Anlass: Es steht unterwegs auf Guckhöhe und ragt mit seiner vollen
   * Höhe nach unten aus dem Fenster heraus. Gemessen ergab das TourFuchs 690
   * und SoundFuchs 574 — bei identischer Oberkante (744) und identischer
   * Knopfzeile darüber. Der Unterschied lag vollständig außerhalb des Bildes
   * und kam allein daher, dass im Blatt verschieden viel Inhalt steht.
   *
   * Ein ungeklammertes Maß hätte hier also einen Befund gemeldet, den niemand
   * sehen kann — und ein Wächter, der Unsichtbares anmahnt, wird überblättert.
   */
  const kasten = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const r = e.getBoundingClientRect();
    if (r.height <= 0 || r.width <= 0) return null;
    const links = Math.max(0, r.left);
    const oben = Math.max(0, r.top);
    const rechts = Math.min(window.innerWidth, r.right);
    const unten = Math.min(window.innerHeight, r.bottom);
    if (rechts <= links || unten <= oben) return null;
    return {
      x: Math.round(links),
      y: Math.round(oben),
      b: Math.round(rechts - links),
      h: Math.round(unten - oben),
    };
  };
  const text = (sel) =>
    [...document.querySelectorAll(sel)]
      .filter((e) => e.offsetParent !== null)
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim());

  return {
    kopfleiste: kasten('.topbar'),
    streifen: kasten('#mobile-topnav'),
    blatt: kasten('#sidebar'),
    karte: kasten('#map'),
    knopfzeile: kasten('.map-fab-row'),
    tiefePille: kasten('#depth-switch'),
    reiter: text('.tab-button'),
    pillen: text('.map-fab'),
    // Welches Gesicht steht im Bild? Nicht gefragt, sondern abgelesen: Der
    // Kopfstreifen gibt es unterwegs und am Schreibtisch nicht.
    gesicht: (() => {
      const nav = document.getElementById('mobile-topnav');
      const da = nav && getComputedStyle(nav).display !== 'none';
      return da ? 'phone' : 'desktop';
    })(),
    // Wer sichtbar ist, der oder der. Beide zugleich wäre der Zwitter.
    nurMobil: [...document.querySelectorAll('.only-mobile')].filter(
      (e) => getComputedStyle(e).display !== 'none'
    ).length,
    nurTisch: [...document.querySelectorAll('.only-desktop')].filter(
      (e) => getComputedStyle(e).display !== 'none'
    ).length,
    marker: document.querySelectorAll('#map .leaflet-marker-icon').length,
    // Sitzen Ansichtstiefe und Reiter im Kopfstreifen oder im Blatt? Das ist
    // keine Kosmetik: Im Stamm hängen sie unterwegs oben fest, damit sie beim
    // Einklappen des Blatts nicht mit aus dem Bild fahren.
    tiefeIm:
      document.getElementById('depth-switch')?.closest('#mobile-topnav, #sidebar')?.id ?? null,
    reiterIm: document.querySelector('.tabs')?.closest('#mobile-topnav, #sidebar')?.id ?? null,
  };
};

/**
 * Sechs Fenster, zwei Gesichter.
 *
 * Vier davon sind Geräte, die es gibt; zwei sind die Grenze selbst. Ein
 * Vergleich, der nur Handy und Schreibtisch misst, sieht genau das nicht, was
 * beim Umbau schiefgeht — der Zwitter entsteht dazwischen.
 *
 * `soll` ist das erwartete Gesicht. Es steht hier und nicht im Test, weil
 * dieses Werkzeug beide Anwendungen misst: Weicht TourFuchs selbst davon ab,
 * ist die Erwartung falsch und nicht die Anwendung.
 */
const FORMATE = [
  ['handy', { width: 390, height: 844 }, true, 'phone'],
  ['tablet-hoch', { width: 820, height: 1180 }, true, 'phone'],
  ['tablet-quer', { width: 1180, height: 820 }, true, 'desktop'],
  ['tisch', { width: 1440, height: 900 }, false, 'desktop'],
  ['flach-quer', { width: 900, height: 520 }, true, 'phone'],
  ['grenzfall', { width: 901, height: 521 }, true, 'desktop'],
];

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
  args: ['--no-sandbox'],
});

const ergebnis = {};
const kinder = [];

try {
  for (const [name, cwd] of [
    ['tourfuchs', STAMM_ORT],
    ['soundfuchs', process.cwd()],
  ]) {
    const { port, kind } = await starte(cwd);
    kinder.push(kind);
    ergebnis[name] = {};
    for (const [gesicht, viewport, touch] of FORMATE) {
      const ctx = await browser.newContext({
        viewport,
        hasTouch: touch,
        isMobile: touch,
        locale: 'de-DE',
      });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
      // Beide holen Leaflet nach und füllen die Karte mit Beispieldaten.
      await page.waitForTimeout(9000);
      ergebnis[name][gesicht] = await page.evaluate(AUFMASS);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  for (const k of kinder) k.kill();
}

const zeige = (v) =>
  v == null
    ? '—'
    : typeof v === 'object' && 'x' in v
      ? `${v.x},${v.y} ${v.b}×${v.h}`
      : JSON.stringify(v);

const befunde = [];

for (const [gesicht, viewport, , soll] of FORMATE) {
  const t = ergebnis.tourfuchs[gesicht];
  const s = ergebnis.soundfuchs[gesicht];
  console.log(
    `\n════ ${gesicht.toUpperCase()} (${viewport.width}×${viewport.height}, erwartet: ${soll}) ` +
      '═'.repeat(14)
  );
  for (const [wer, mass] of [
    ['TourFuchs', t],
    ['SoundFuchs', s],
  ]) {
    if (mass.gesicht !== soll) {
      befunde.push(`${gesicht}: ${wer} zeigt „${mass.gesicht}" statt „${soll}"`);
    }
    if (mass.nurMobil > 0 && mass.nurTisch > 0) {
      befunde.push(
        `${gesicht}: ${wer} zeigt Mobile- UND Desktop-Elemente zugleich ` +
          `(${mass.nurMobil} / ${mass.nurTisch}) — ein Zwitter`
      );
    }
  }
  console.log('  — Geometrie (muss übereinstimmen) —');
  for (const feld of GEOMETRIE) {
    const a = zeige(t[feld]);
    const b = zeige(s[feld]);
    const gleich = a === b;
    const eingetragen = EINGETRAGEN[feld];
    const zeichen = gleich ? '✓' : eingetragen ? '·' : '✗';
    console.log(
      `  ${zeichen} ${feld.padEnd(12)} TF ${a.padEnd(24)} SF ${b}${
        !gleich && eingetragen ? `   ← ${eingetragen}` : ''
      }`
    );
    if (!gleich && !eingetragen) {
      befunde.push(`${gesicht}/${feld}: TourFuchs ${a}, SoundFuchs ${b}`);
    }
  }
  console.log('  — Inhalt (darf abweichen: fachlich reduziert) —');
  for (const feld of INHALT) {
    const a = zeige(t[feld]);
    const b = zeige(s[feld]);
    console.log(`  ${a === b ? '=' : '·'} ${feld.padEnd(12)} TF ${a.padEnd(24)} SF ${b}`);
  }
}

if (befunde.length) {
  console.log('\nBefunde:');
  for (const b of befunde) console.log(`  ✗ ${b}`);
  console.log(
    '\nEine Abweichung in der Geometrie heißt: an dieser Stelle ist der Stamm\n' +
      'nachgebaut statt übernommen. Entweder die Stelle richtigstellen — oder\n' +
      'die Abweichung in §4a des Papiers eintragen, mit Grund.'
  );
  process.exitCode = 1;
} else {
  console.log('\n✓ Der Aufbau deckt sich mit dem Stamm.');
}
