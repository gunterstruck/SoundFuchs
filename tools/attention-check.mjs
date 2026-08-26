/**
 * Prüfstrecke für die Aufmerksamkeit.
 *
 * Vorbild ist `tools/attention-check.mjs` aus der Schwester-App TourFuchs. Der
 * Anlass dort war ein Produkt-Review, das einen Bereich als überladen bezeichnet
 * hatte — gestützt auf gezählte Knöpfe im Quelltext. Gezählt worden war damit
 * Markup, nicht Oberfläche. Der Befund war falsch, die Frage war richtig, und
 * sie war bis dahin schlicht unbeantwortbar.
 *
 * Dieselbe Lehre gilt hier, und sie hat sich sofort bestätigt: Zanobos
 * `index.html` enthält 117 `<button>`-Elemente. Im ersten Bild am Handy stehen
 * davon **neun**. Wer den Quelltext liest, hält Zanobo für überladen. Wer die
 * gebaute App misst, sieht das Gegenteil — und findet die Last dort, wo sie
 * wirklich liegt.
 *
 * Gemessen werden zwei Dinge:
 *
 *   **Bedienelemente** — „was kann ich anfassen", nicht „wie viel Text steht
 *   da". Ein erklärender Satz ist Orientierung, ein Knopf ist eine Entscheidung.
 *
 *   **Nutzbare Textbreite** — wie viel von der Gerätebreite beim Inhalt
 *   ankommt, nachdem alle Container ihre Polsterung genommen haben. Diese Zahl
 *   fehlt bei TourFuchs, weil sie dort kein Problem ist: Das Blatt hat genau
 *   eine Polsterung. Zanobo staffelt Karte in Karte in Container und verliert
 *   dabei knapp ein Drittel der Bildschirmbreite, bevor ein Zeichen erscheint.
 *   Was nicht gemessen wird, wächst weiter.
 *
 * Die Budgets unten sind keine Wunschzahlen, sondern der gemessene Ist-Stand
 * plus wenig Luft. Sie sind eine **Sperrklinke**: Sie verbieten nichts, was
 * heute da ist, machen aber jedes weitere Anwachsen sichtbar. Wer ein Budget
 * hebt, trifft damit eine bewusste Produktentscheidung — und genau darum geht
 * es.
 *
 * ── WELCHE SCHALE GEMESSEN WIRD ─────────────────────────────────────────────
 *
 * Seit Schnitt 7 startet die App in der neuen Schale. Die Budgets hier stammen
 * aber aus der alten und beschreiben deren Sorte Bild: eine scrollende Seite,
 * auf der jedes Bedienelement etwas verlangt. In der neuen Schale liegt eine
 * Karte als Grund, und zwei Drittel der gezählten Elemente sind ihre Marker —
 * also Inhalt, kein Verlangen. Dieselbe Zahl gegen dieselbe Schwelle zu halten
 * hieße, zwei verschiedene Dinge zu vergleichen.
 *
 * Die Läufe hier stellen deshalb ausdrücklich auf die alte Schale. Für die
 * neue ist `npm run schalenvergleich` zuständig; es legt beide nebeneinander
 * und hat eigene, dort begründete Schwellen. Die zwei Blöcke am Ende prüfen
 * die neue Schale selbst und stellen darauf um.
 *
 * Ausgeführt wird gegen `dist/` — also vorher `npm run build`.
 *
 *   npm run attention-check
 *   npm run attention-check -- --frei      (nur messen, keine Budgets prüfen)
 *
 * Voraussetzung: Playwright ist als exakt gepinnte Entwicklungsabhängigkeit
 * installiert; der Browser selbst wird bewusst separat bereitgestellt:
 *
 *   npm ci && npx playwright install chromium
 *
 * In Umgebungen mit vorhandenem Browser:
 *   PLAYWRIGHT_CHROMIUM_PATH=/pfad/zu/chrome npm run attention-check
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);

const FREI = process.argv.includes('--frei');

/**
 * Zwei Maße genügen: das Handy (der Ort, an dem Zanobo benutzt wird) und der
 * Schreibtisch (der Ort, an dem es eingerichtet wird).
 */
const FORMATE = [
  { name: 'smartphone', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, touch: false },
];

/**
 * Budgets für sichtbare Bedienelemente, je Tiefe.
 *
 * Gelesen als: „So viel darf diese Ansicht verlangen, bevor jemand hinsehen
 * muss." Getrennt nach Tiefe, weil Experte ausdrücklich mehr zeigen darf — aber
 * eben auch nicht beliebig viel mehr.
 */
const BUDGET = {
  /**
   * Angehoben am 22.08.2026, weil der Rahmen des Stamms hinter dem Scharnier
   * stehen bleibt.
   *
   * Der Auftraggeber hat auf einem Bildschirmfoto angestrichen, dass der
   * Basis/Profi-Streifen oben und das Blatt unten auf den tieferen Ebenen
   * fehlten. Sie ruhen seitdem nicht mehr — und damit zählt dieser Test sie mit.
   *
   * Die Zahlen sind nicht bis zum Grün geschoben, sondern um genau das, was der
   * Rahmen mitbringt:
   *
   *   Handy      +1  die Basis/Profi-Pille im Kopfstreifen
   *   Schreibtisch +4  dieselbe Pille, zwei Reiter und „Entfernen" in der Leiste
   *
   * Was der Rahmen kostet, ist damit sichtbar und begründet. Was die Ansicht
   * selbst verlangt, steht weiter unter demselben Maßstab wie vorher.
   *
   * ── 23.08.2026: +1 für die Wahl des Auswertungswerkzeugs ────────────────
   *
   * Ein Auswahlfeld mehr im Einstellungen-Dialog, auf beiden Stufen dasselbe.
   * Gemessen: Handy 29 (blieb unter dem alten Budget), Schreibtisch 32 und 54.
   *
   * Es ist bewusst ein Bedienelement und keine zweite Zeile im Menü, die auf
   * eine dritte Seite führt: Die Frage hat genau zwei Antworten, und ein
   * Auswahlfeld ist die kürzeste Form, sie zu stellen. Angehoben wird um
   * genau eins — nicht bis zum Grün, sondern um das, was dazugekommen ist.
   *
   * ── 23.08.2026: +1 für den Reiter „Details" ─────────────────────────────
   *
   * Der vierte Reiter des Analyseblatts, der die beiden Expertenansichten
   * trägt: Frequenzabweichung und Betriebspunkte. Am Schreibtisch steht das
   * Blatt als Seitenleiste, seine Reiter zählen also mit — gemessen 55 gegen
   * das Budget 54, und genau darum ist das Budget da.
   *
   * Warum es trotzdem steigt: Der Reiter trägt `data-view-level="expert"` und
   * ist auf Basis gar nicht im Bild. Er kostet also NUR auf der Stufe, auf der
   * jemand ausdrücklich mehr sehen wollte — `einstellungenBasis` bleibt
   * deshalb bei 32 und wurde nicht angefasst.
   *
   * Und er ersetzt einen Weg, statt einen hinzuzufügen: Vor dem 23.08. lagen
   * dieselben zwei Ansichten in einem Fenster, das über einen eigenen Knopf
   * aufging. Das Fenster ist abgerissen (#100), der Knopf mit ihm.
   *
   * Angehoben um genau eins. Wer den nächsten Reiter anhängt, sieht wieder rot
   * und muss wieder begründen — das ist die einzige Aufgabe dieser Zahl.
   */
  erstbild: 16,
  schritteOffen: 18,
  einstellungenBasis: 32,
  einstellungenExperte: 55,
};

/**
 * Mindestens so viel von der Gerätebreite muss beim Inhalt ankommen.
 *
 * Der Wert ist kein Geschmack: TourFuchs erreicht am selben Gerät 362 px, weil
 * sein Blatt genau eine Polsterung hat (`.tab-panel { padding: 14px }`). Zanobo
 * lag beim ersten Messen bei 274 px — 116 px oder 30 % der Bildschirmbreite
 * verschwanden in gestaffelten Containern, bevor der erste Buchstabe stand.
 * Die tiefste Beschriftung („Gespeicherte Maschinen") bekam davon 63 px und
 * brach in vier Zeilen um. Nach dem Zusammenlegen auf einen Rand: 330 px
 * bzw. 81 px.
 *
 * Am Schreibtisch ist die Zahl bewusst niedrig: Dort deckelt
 * `--content-max-width: 520px` die Spalte, und das ist kein verschwendeter
 * Platz, sondern lesbare Zeilenlänge. Ein hohes Budget würde hier ausgerechnet
 * eine richtige Entscheidung anklagen.
 */
const BUDGET_TEXTBREITE = { smartphone: 320, desktop: 380 };

const BEDIENBAR_JS = `
    // Die drei Hauptkarten sind heute <div data-target> mit reinem
    // click-Listener — ohne role, tabindex oder aria-expanded. Sie sind
    // Bedienelemente, auch wenn der Browser das nicht weiß, und werden hier
    // mitgezählt. Ein Messgerät, das sie übersieht, würde einen
    // Bedienbarkeitsfehler auch noch mit einer niedrigeren Zahl belohnen.
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

    // Eine Kopfzeile enthält ihren eigenen Aufklapp-Pfeil und ggf. einen
    // Hilfe-Knopf. Als Entscheidung zählt die Kopfzeile, nicht ihr Innenleben.
    const entdoppelt = (liste) => liste.filter((el, _i, alle) =>
        !alle.some((o) => o !== el && o.matches('.section-header[data-target]') && o.contains(el)));
`;

/**
 * Das Erstbild: alles, was ohne einen einzigen Klick im Fenster steht — samt
 * Herkunft. Die nackte Zahl sagt „zu viel", erst die Herkunft sagt „woher".
 */
const ERSTBILD_PROBE = `(() => {
    ${BEDIENBAR_JS}

    const BEREICHE = [
        ['Hero', '.hero-header'],
        ['Dashboard', '.status-dashboard'],
        ['Maschine', '#select-machine-content, [data-target="select-machine-content"]'],
        ['Referenz', '#record-reference-content, [data-target="record-reference-content"]'],
        ['Pruefen', '#run-diagnosis-content, [data-target="run-diagnosis-content"]'],
        ['Fusszeile', 'footer, .info-sheet-row']
    ];

    const imBild = entdoppelt([...document.querySelectorAll(BEDIENBAR)].filter(imFenster));
    const herkunft = {};
    for (const el of imBild) {
        const treffer = BEREICHE.find(([, sel]) => el.closest(sel));
        const name = treffer ? treffer[0] : 'Sonstiges';
        herkunft[name] = (herkunft[name] || 0) + 1;
    }

    return { bedienelemente: imBild.length, herkunft };
})()`;

/** Sichtbar auf der ganzen Seite — was der Bereich *anbietet*, ohne Fensterschnitt. */
const SICHTBAR_PROBE = `(() => {
    ${BEDIENBAR_JS}
    const offenesModal = [...document.querySelectorAll('.modal')]
        .find((m) => getComputedStyle(m).display !== 'none');
    return {
        bedienelemente: entdoppelt([...document.querySelectorAll(BEDIENBAR)].filter(sichtbar)).length,
        imModal: offenesModal
            ? entdoppelt([...offenesModal.querySelectorAll(BEDIENBAR)].filter(sichtbar)).length
            : 0,
        modal: offenesModal ? offenesModal.id : null
    };
})()`;

/**
 * Nutzbare Textbreite: wie breit ein Absatz an der engsten Stelle des
 * Hauptinhalts überhaupt werden **dürfte**.
 *
 * Nicht gemessen wird die Breite vorhandener Überschriften — ein kurzes Wort
 * ist schmal, weil es kurz ist, nicht weil die Spalte eng wäre. Stattdessen
 * wird in jeden Inhaltscontainer kurz ein leerer Block eingehängt und dessen
 * Breite genommen. Das ist genau die Frage, um die es geht: „Wie viel Platz
 * bekommt hier ein Satz?"
 *
 * Kacheln in mehrspaltigen Rastern sind ausgenommen — sie sind absichtlich
 * schmal. Ihre Beschriftung wird getrennt ausgewiesen, denn dort entscheidet
 * sich, ob „Gespeicherte Maschinen" in zwei oder in vier Zeilen umbricht.
 */
const BREITEN_PROBE = `(() => {
    const sichtbar = (el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };

    // Wie breit wird ein Absatz in diesem Container? Ein eingehängter leerer
    // Block nimmt genau die verfügbare Breite an – inklusive aller Polsterung,
    // Rahmen und Rasterspalten, die darüber liegen.
    const nutzbareBreite = (container) => {
        const probe = document.createElement('div');
        // align-self:stretch ist nötig, weil zentrierende Flex-Container
        // (etwa die Kacheln) einen eingehängten Block sonst auf 0 schrumpfen.
        probe.style.cssText =
            'display:block;width:100%;align-self:stretch;margin:0;padding:0;border:0;height:0';
        container.appendChild(probe);
        const px = Math.round(probe.getBoundingClientRect().width);
        probe.remove();
        return px;
    };

    const beschreibe = (el) => {
        const klasse = (el.className || '').toString().split(/\\s+/).filter(Boolean)[0];
        return (el.id ? '#' + el.id : '') + (klasse ? '.' + klasse : el.tagName.toLowerCase());
    };

    const inhalt = [...document.querySelectorAll('.container-content, .collapsible-content, .main-container')]
        .filter(sichtbar)
        .filter((el) => !el.closest('.footer, .hero-header, .modal'));

    const beschriftungen = [...document.querySelectorAll('.identify-tile, .view-level-btn')]
        .filter(sichtbar);

    const engste = (liste) => {
        if (!liste.length) return { px: null, wo: null };
        const paare = liste.map((el) => ({ px: nutzbareBreite(el), wo: beschreibe(el) }));
        return paare.reduce((a, b) => (a.px <= b.px ? a : b));
    };

    return {
        inhalt: engste(inhalt),
        beschriftung: engste(beschriftungen),
        viewport: window.innerWidth,
        proben: inhalt.length
    };
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
    detached: false,
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

const befunde = [];
function pruefe(bedingung, text) {
  if (FREI || bedingung) return;
  befunde.push(text);
}

const port = await freierPort();
const vorschau = await starteVorschau(port);

let chromium;
/**
 * Hinter das Scharnier.
 *
 * Die meisten Blöcke hier messen die bisherige SoundFuchs-Oberfläche —
 * Leerzustand, Standort anlegen, Beispieldaten, Import. Sie liegt seit dem
 * 16.08.2026 hinter dem Scharnier (§0h) und ist beim Start verborgen; ohne
 * diesen Griff misst jeder von ihnen ein `display: none` und meldet, dass
 * alles fehlt.
 *
 * Der Block „Stamm und Scharnier" ist die Ausnahme: Er misst die Kartenebene
 * selbst und muss draußen bleiben.
 */
/**
 * Die Beispieldaten draußen lassen.
 *
 * Der Stamm füllt eine leere Karte beim ersten Besuch selbst
 * (`stamm/ui/beispieldaten.ts`) — genau das macht sein erstes Bild aus. Für
 * ein Messgerät ist es Gift: Die Blöcke hier legen ihren eigenen Bestand an
 * und zählen ihn, und ein Ladevorgang, der 1,2 Sekunden nach dem Kartenaufbau
 * dazwischenfährt, verfälscht jede dieser Zahlen — mal so, mal so, je nachdem
 * wie schnell die Maschine ist.
 *
 * Abgesagt wird über denselben Merkposten, den auch der „Entfernen"-Knopf
 * setzt. Kein Sonderweg fürs Messen, sondern der Zustand eines Nutzers, der
 * die Beispieldaten schon einmal weggeräumt hat.
 */
async function ohneBeispieldaten(page) {
  await page.addInitScript(() => localStorage.setItem('sf_beispieldaten_abgelehnt', 'ja'));
}

async function inDieTiefe(page, { profi = false } = {}) {
  await page.waitForTimeout(2500);
  // Basis/Profi gilt für die ganze Anwendung und wird auf der Kartenebene
  // gestellt — also hier, bevor die Tür aufgeht. Vorher traf ein
  // `.view-level-btn[data-level="expert"]` per `.first()` immer die Pille in
  // der Kopfzeile; die liegt jetzt im Stamm und ruht, solange die Tiefe offen
  // ist. Umgekehrt herum ist es kein Behelf, sondern der Weg selbst.
  if (profi) {
    await page
      .locator('#depth-switch .view-level-btn[data-level="expert"]')
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(700);
  }
  await page.evaluate(() => {
    const tiefe = document.getElementById('zanobo-tiefe');
    if (!tiefe) return;
    tiefe.hidden = false;
    // Auf der Arbeitsebene, nicht auf der Standort- oder Maschinenebene.
    //
    // Seit dem Umbau der Nutzerreise liegen hinter der Tür DREI Ebenen:
    // `standort`, `maschine` (Zustand und ein nächster Schritt) und `arbeit`
    // (Aufnahme, Prüfung, Ergebnis — noch die bisherige Oberfläche). Jede
    // verdeckt die anderen mit Absicht.
    //
    // Gemessen wird auf der Bestandsebene: Diese Blöcke legen Maschinen an,
    // lesen Listen ein und zählen den Bestand — alles Dinge, die es auf der
    // Arbeitsebene mit Absicht nicht mehr gibt.
    document.body.classList.add('tiefe-offen', 'tiefe-bestand');
  });
  await page.waitForTimeout(600);
}

try {
  ({ chromium } = require('playwright'));
} catch {
  vorschau.kill();
  console.error('Playwright fehlt. Bitte zuerst `npm ci` ausführen.');
  process.exit(1);
}

const browser = await chromium.launch(chromiumPfad());

try {
  for (const format of FORMATE) {
    const ctx = await browser.newContext({
      viewport: format.viewport,
      hasTouch: format.touch,
      isMobile: format.touch,
      locale: 'de-DE',
    });
    const page = await ctx.newPage();
    await ohneBeispieldaten(page);
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await inDieTiefe(page);
    await page.waitForTimeout(2000);

    console.log(`\n=== ${format.name} (${format.viewport.width}×${format.viewport.height}) ===`);

    const erstbild = await page.evaluate(ERSTBILD_PROBE);
    const herkunft = Object.entries(erstbild.herkunft)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');
    console.log(`Erstbild            ${String(erstbild.bedienelemente).padStart(3)}   ${herkunft}`);
    pruefe(
      erstbild.bedienelemente <= BUDGET.erstbild,
      `${format.name}: Erstbild ${erstbild.bedienelemente} > Budget ${BUDGET.erstbild}`
    );

    // Im eingeklappten Zustand gibt es noch keinen Inhaltscontainer; die
    // engste Stelle entsteht erst, wenn ein Schritt offen ist. Gemessen
    // wird deshalb in beiden Zuständen, gemeldet wird die engere.
    const breitenZu = await page.evaluate(BREITEN_PROBE);

    // Alle Schritte aufklappen: was verlangt die Seite, wenn nichts mehr eingeklappt ist?
    await page.evaluate(() => {
      document.querySelectorAll('.section-header[data-target]').forEach((h) => {
        const ziel = document.getElementById(h.dataset.target);
        if (ziel && getComputedStyle(ziel).display === 'none') h.click();
      });
    });
    await page.waitForTimeout(1200);
    const breitenAuf = await page.evaluate(BREITEN_PROBE);
    const breiten = breitenZu.inhalt.px <= breitenAuf.inhalt.px ? breitenZu : breitenAuf;
    const anteil = ((breiten.inhalt.px / breiten.viewport) * 100).toFixed(0);
    console.log(
      `Textbreite          ${String(breiten.inhalt.px).padStart(3)} px` +
        ` von ${breiten.viewport} (${anteil} %)   engste Stelle: ${breiten.inhalt.wo}`
    );
    if (breitenAuf.beschriftung.px !== null) {
      console.log(
        `Kachelbeschriftung  ${String(breitenAuf.beschriftung.px).padStart(3)} px` +
          `                    engste Stelle: ${breitenAuf.beschriftung.wo}`
      );
    }
    pruefe(
      breiten.inhalt.px >= BUDGET_TEXTBREITE[format.name],
      `${format.name}: Textbreite ${breiten.inhalt.px} px < Budget ${BUDGET_TEXTBREITE[format.name]} px` +
        ` (engste Stelle: ${breiten.inhalt.wo})`
    );

    const offen = await page.evaluate(SICHTBAR_PROBE);
    console.log(`Alle Schritte offen ${String(offen.bedienelemente).padStart(3)}`);
    pruefe(
      offen.bedienelemente <= BUDGET.schritteOffen,
      `${format.name}: Schritte offen ${offen.bedienelemente} > Budget ${BUDGET.schritteOffen}`
    );

    // Einstellungen: der globale Komplexitaetsschalter liegt hier drin.
    //
    // Gemessen wird der Dialog UNGEFILTERT, ueber den verborgenen
    // Fusszeilen-Knopf. Seit dem 14.08.2026 fuehrt das Schiebefenster in
    // einzelne Themen (`data-filter`) und zeigt jeweils nur einen Ausschnitt —
    // das ist der Sinn der Sache, waere hier aber die falsche Zahl: Die Frage
    // dieser Messung ist, wie schwer die Einstellungen INSGESAMT sind. Wer den
    // Dialog entlastet, indem er Teile hinter Filter schiebt, hat ihn nicht
    // entlastet. Der Weg ueber ein Thema ist trotzdem der normale; er ist im
    // Durchlauf abgedeckt.
    await page.evaluate(() => document.getElementById('settings-btn')?.click());
    await page.waitForTimeout(1000);
    const basis = await page.evaluate(SICHTBAR_PROBE);
    console.log(
      `Einstellungen Basis ${String(basis.bedienelemente).padStart(3)}   davon im Dialog ${basis.imModal}`
    );
    pruefe(
      basis.bedienelemente <= BUDGET.einstellungenBasis,
      `${format.name}: Einstellungen/Basis ${basis.bedienelemente} > Budget ${BUDGET.einstellungenBasis}`
    );

    /**
     * Das Auswertungswerkzeug steht schon auf Basis.
     *
     * Es ist keine Feineinstellung der Messung, sondern die Entscheidung, an
     * wen man das Geräusch weitergibt. Wer ein Briefing erzeugen kann — und
     * das kann jeder, der Knopf steht auf der Maschinenseite —, muss auch
     * sagen dürfen, wohin damit. Läge es auf Profi, stünde am Ende des
     * Briefings ein Werkzeug, das man nicht wechseln kann, ohne vorher eine
     * Stufe zu finden, von der man nicht weiß, dass es sie gibt.
     */
    const werkzeugfeld = await page.evaluate(() => {
      const feld = document.getElementById('analysis-tool-select');
      if (!feld) return { da: false, sichtbar: false, auswahl: [] };
      const kasten = feld.getBoundingClientRect();
      return {
        da: true,
        sichtbar: getComputedStyle(feld).display !== 'none' && kasten.height > 0,
        auswahl: [...feld.options].map((o) => o.textContent.trim()),
      };
    });
    console.log(
      `Werkzeugwahl Basis  ${werkzeugfeld.sichtbar ? 'sichtbar' : '   FEHLT'}   ${werkzeugfeld.auswahl.join(' · ')}`
    );
    pruefe(
      werkzeugfeld.sichtbar,
      `${format.name}: die Wahl des Auswertungswerkzeugs steht auf Basis nicht da` +
        (werkzeugfeld.da ? ' (vorhanden, aber verborgen)' : ' (gar nicht im Baum)')
    );

    await page.evaluate(() => {
      document.querySelector('#view-level-selector [data-level="expert"]')?.click();
    });
    await page.waitForTimeout(800);
    const experte = await page.evaluate(SICHTBAR_PROBE);
    const faktor = (experte.imModal / Math.max(basis.imModal, 1)).toFixed(1);
    console.log(
      `Einstellungen Exp.  ${String(experte.bedienelemente).padStart(3)}   davon im Dialog ${experte.imModal} (×${faktor})`
    );
    pruefe(
      experte.bedienelemente <= BUDGET.einstellungenExperte,
      `${format.name}: Einstellungen/Experte ${experte.bedienelemente} > Budget ${BUDGET.einstellungenExperte}`
    );

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HIER STAND: KNOPF UND ZIEL AUF DERSELBEN STUFE
  //
  // Die Regel war gut: Ein Knopf, der zu einer Stelle springt, muss auf jeder
  // Ansichtstiefe sichtbar sein, auf der auch sein Ziel sichtbar ist — sonst
  // tut er nichts. Sie hatte genau einen Fall: „Details" im alten
  // Ergebnisdialog sprang zu `.result-fingerprint` (Stufe „advanced"), stand
  // aber selbst auf jeder Stufe.
  //
  // Mit dem Abriss des Dialogs (23.08.2026) hat die Prüfung keinen Gegenstand
  // mehr. Sie kommt zurück, sobald es wieder einen Knopf gibt, der springt
  // statt zu tun — die Regel steht so lange hier.

  // ═══════════════════════════════════════════════════════════════════════
  // ERSTER START
  //
  // Führt der einzige Knopf des Leerzustands irgendwohin?
  //
  // Am 14.08.2026 tat er das nicht. „Erste Maschine anlegen" schaltete den
  // Abschnitt `create-section` auf sichtbar — der liegt aber in der
  // eingeklappten Karte „Maschine auswählen", also blieb das Bild, wie es
  // war. Keine Fehlermeldung, kein fehlender Knopf, nichts, was eine Prüfung
  // über Bausteine gefunden hätte: Der Knopf war da, war beschriftet und
  // reagierte auf den Tipp — er führte nur nirgendwohin.
  //
  // Deshalb steht das hier und nicht bei den Unit-Tests. Die Frage ist nicht,
  // ob eine Funktion aufgerufen wurde, sondern ob danach etwas zu sehen ist.
  // Beim ersten Start ist das die härteste Frage, die es gibt: Wer hier
  // hängen bleibt, hat keinen zweiten Weg — die Liste ist ja leer.
  {
    const ctx = await browser.newContext({
      viewport: FORMATE[0].viewport,
      hasTouch: true,
      isMobile: true,
      locale: 'de-DE',
    });
    const page = await ctx.newPage();
    await ohneBeispieldaten(page);
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await inDieTiefe(page);
    await page.waitForTimeout(2000);

    const knopf = page.locator('#empty-state-cta');
    const knopfDa = await knopf.isVisible().catch(() => false);
    let feldDa = false;
    let optionenOffen = true;
    let speichernImBild = false;
    let abstandZumSpeichern = Number.POSITIVE_INFINITY;
    if (knopfDa) {
      await knopf.click();
      await page.waitForTimeout(1200);
      feldDa = await page
        .locator('#machine-name-input')
        .isVisible()
        .catch(() => false);
      const lage = await page.evaluate(() => {
        const name = document.getElementById('machine-name-input')?.getBoundingClientRect();
        const save = document.getElementById('create-machine-btn')?.getBoundingClientRect();
        const details = document.getElementById('machine-optional-details');
        return {
          optionenOffen: details?.open ?? true,
          speichernImBild: Boolean(save && save.top >= 0 && save.bottom <= window.innerHeight),
          abstand: name && save ? Math.round(save.top - name.bottom) : Number.POSITIVE_INFINITY,
        };
      });
      optionenOffen = lage.optionenOffen;
      speichernImBild = lage.speichernImBild;
      abstandZumSpeichern = lage.abstand;
    }

    console.log('\n=== erster Start (leerer Bestand) ===');
    console.log(`„Erste Maschine anlegen"  ${knopfDa ? 'sichtbar' : 'FEHLT'}`);
    console.log(`Namensfeld danach         ${feldDa ? 'sichtbar' : 'NICHT sichtbar'}`);
    console.log(`Optionen zunächst         ${optionenOffen ? 'OFFEN' : 'geschlossen'}`);
    console.log(
      `Speichern ohne Scrollen   ${speichernImBild ? `sichtbar (${abstandZumSpeichern}px nach Name)` : 'NICHT sichtbar'}`
    );

    pruefe(knopfDa, 'erster Start: „Erste Maschine anlegen" ist im Leerzustand nicht sichtbar');
    pruefe(
      feldDa,
      'erster Start: „Erste Maschine anlegen" führt nicht zum Namensfeld — der Knopf tut nichts'
    );
    pruefe(!optionenOffen, 'erster Start: optionale Maschinenangaben sind zunächst aufgeklappt');
    pruefe(
      speichernImBild && abstandZumSpeichern <= 260,
      `erster Start: Speichern ist nicht nah am Maschinennamen (${abstandZumSpeichern}px Abstand)`
    );

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STANDORT ANLEGEN
  //
  // Der Standort ist die Ebene, auf der später die Karte steht
  // (docs/kunden-und-karte.md). Drei Dinge müssen dafür zusammenspielen, und
  // jedes einzelne kann still ausfallen:
  //
  //   1. „+ Neuer Standort" muss die Felder aufklappen. Tut es das nicht, sitzt
  //      man vor einer Auswahl, die eine Möglichkeit nennt, die es nicht gibt.
  //   2. Die Postleitzahl muss den Ort nachtragen. Genau dafür ist die
  //      Postleitzahl gewählt worden statt einer Adresse — trägt sie nichts
  //      nach, ist die Entscheidung sinnlos geworden.
  //   3. Der angelegte Standort muss an der Maschine ankommen und in der Liste
  //      auftauchen. Sonst hat man Daten angelegt, die nirgends erscheinen.
  //
  // Punkt 2 hängt an zwei Dateien, die absichtlich nicht vorgeladen werden.
  // Wenn jemand `globPatterns` ändert oder die Dateien verschiebt, fällt genau
  // hier auf, dass der Ort leer bleibt — und nirgends sonst.
  {
    const ctx = await browser.newContext({
      viewport: FORMATE[0].viewport,
      hasTouch: true,
      isMobile: true,
      locale: 'de-DE',
    });
    const page = await ctx.newPage();
    await ohneBeispieldaten(page);
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await inDieTiefe(page);
    await page.waitForTimeout(2000);

    const cta = page.locator('#empty-state-cta');
    if (await cta.isVisible().catch(() => false)) {
      await cta.click();
      await page.waitForTimeout(1000);
    }

    await page.locator('#machine-optional-details > summary').click();
    await page.waitForTimeout(250);

    const auswahl = page.locator('#machine-customer-select');
    const auswahlDa = await auswahl.isVisible().catch(() => false);

    let felderDa = false;
    let ort = '';
    let inListe = false;

    if (auswahlDa) {
      await auswahl.selectOption('__neu__');
      await page.waitForTimeout(400);
      felderDa = await page
        .locator('#customer-name-input')
        .isVisible()
        .catch(() => false);

      if (felderDa) {
        await page.locator('#customer-name-input').fill('Müller Guss GmbH');
        await page.locator('#customer-plz-input').fill('45127');
        await page.locator('#customer-street-input').fill('Industriestraße 12');
        // Die Ortsdatei kommt erst jetzt aus dem Netz.
        await page.waitForTimeout(1500);
        ort = await page.locator('#customer-ort-input').inputValue();

        await page.locator('#machine-name-input').fill('Pumpe 17');
        await page.locator('#create-machine-btn').click();
        await page.waitForTimeout(2000);

        // Der Standortname steht in der Nebenzeile der Maschinenzeile.
        inListe = await page
          .locator('.machine-item .machine-meta', { hasText: 'Müller Guss' })
          .first()
          .isVisible()
          .catch(() => false);
      }
    }

    console.log('\n=== Standort anlegen ===');
    console.log(`Auswahlfeld               ${auswahlDa ? 'sichtbar' : 'FEHLT'}`);
    console.log(`Felder nach „Neuer Standort" ${felderDa ? 'sichtbar' : 'NICHT sichtbar'}`);
    console.log(`Ort aus PLZ 45127         ${ort || '(leer)'}`);
    console.log(`Standort an der Maschine  ${inListe ? 'sichtbar' : 'NICHT sichtbar'}`);

    pruefe(auswahlDa, 'Standort: das Auswahlfeld fehlt im Anlegen-Formular');
    pruefe(
      felderDa,
      'Standort: „+ Neuer Standort" klappt die Felder nicht auf — die Auswahl tut nichts'
    );
    pruefe(
      ort === 'Essen',
      `Standort: PLZ 45127 trägt den Ort nicht nach (gefunden: „${ort}") — die PLZ-Daten kommen nicht an`
    );
    pruefe(inListe, 'Standort: der angelegte Standort erscheint nicht an seiner Maschine');

    // ═════════════════════════════════════════════════════════════════════
    // DIE STANDORTKARTE
    //
    // Sie läuft im selben Fenster weiter, weil sie den eben angelegten Standort
    // braucht. Geprüft wird die Kette, nicht das Aussehen:
    //
    //   Menüzeile → Karte → Marker → Standortblatt → Maschinenansicht
    //
    // Jedes Glied kann still reißen. Der Marker etwa hängt daran, dass beim
    // Anlegen Koordinaten aus der PLZ gefallen sind; fehlen sie, ist die Karte
    // leer und sagt es nicht. Und die Quellenangabe der Kacheln ist keine
    // Höflichkeit, sondern Bedingung der Nutzung — verschwindet sie, benutzen
    // wir die Kacheln unzulässig, und niemandem fällt es auf.
    //
    // Die Kacheln selbst kommen aus dem Netz und dürfen fehlen; geprüft wird
    // deshalb Leaflets Aufbau, nicht das Bild.
    let zeileDa = false;
    let markerZahl = 0;
    let gruende = 0;
    let grundVorgabe = '';
    let gebiete = 0;
    let quelle = '';
    let blattDa = false;
    let maschineImBlatt = false;
    let karteZu = false;
    let scharnierIstKnopf = false;
    let scharnierOeffnet = false;
    let standort = null;
    let maschinenebene = null;
    let zurueckImStandort = false;

    if (inListe) {
      await page.locator('#btn-info').click();
      await page.waitForTimeout(700);
      const zeile = page.locator('.info-sheet-row[data-karte]');
      zeileDa = await zeile.isVisible().catch(() => false);

      if (zeileDa) {
        await zeile.click();
        // Leaflet wird erst jetzt geholt.
        await page.waitForTimeout(2500);

        markerZahl = await page.locator('#map .leaflet-marker-icon').count();
        // Der Kartenstil steht als Auswahlfeld in der Seitenleiste, wie im
        // Stamm — bis zum 16.08.2026 waren es drei Pillen aus einer älteren
        // TourFuchs-Fassung.
        gruende = await page.locator('#basemap-select option').count();
        grundVorgabe = await page
          .locator('#basemap-select')
          .inputValue()
          .catch(() => '');
        // Die Postleitzahlgebiete als Flächen — das „Deutschlandbild". Zehn
        // einstellige Gebiete auf der Übersichtsstufe. Ohne sie wäre die Karte
        // wieder nur Kacheln mit Punkten darauf.
        gebiete = await page.locator('#map path.leaflet-interactive').count();
        quelle = await page
          .locator('#map .leaflet-control-attribution')
          .first()
          .innerText()
          .catch(() => '');

        if (markerZahl > 0) {
          await page.locator('#map .leaflet-marker-icon').first().click();
          await page.waitForTimeout(900);
          blattDa = await page
            .locator('.leaflet-popup-content .popup-customer')
            .isVisible()
            .catch(() => false);

          // DAS SCHARNIER
          //
          // Der Auftraggeber hat den Übergang an genau einem Element
          // festgemacht: dem klickbaren Namen. Deshalb wird hier nicht
          // geprüft, dass irgendwo der Name steht, sondern dass er ein KNOPF
          // ist — eine Überschrift mit `onclick` sähe gleich aus, wäre für
          // Tastatur und Vorlesewerkzeuge aber keine Tür.
          scharnierIstKnopf =
            (await page.evaluate(
              () => document.querySelector('.popup-customer .popup-scharnier')?.tagName ?? ''
            )) === 'BUTTON';

          const reihe = page.locator('.popup-customer .rl-row', { hasText: 'Pumpe 17' }).first();
          maschineImBlatt = await reihe.isVisible().catch(() => false);

          if (scharnierIstKnopf) {
            await page.locator('.popup-customer .popup-scharnier').first().click();
            await page.waitForTimeout(1200);
            scharnierOeffnet = await page.evaluate(() =>
              document.body.classList.contains('tiefe-offen')
            );

            // DIE STANDORTANSICHT
            //
            // Der Auftraggeber hat aufgezählt, was sie enthalten muss: Name und
            // Adresse, alle Maschinen, „Neue Maschine anlegen". Geprüft wird
            // die Aufzählung und nicht das Aussehen — ein Kasten, der schön ist
            // und die Maschinen nicht zeigt, ist keine Standortansicht.
            standort = await page.evaluate(() => {
              const a = document.getElementById('standort-ansicht');
              if (!a || getComputedStyle(a).display === 'none') return null;
              return {
                titel: a.querySelector('h2')?.textContent?.trim() ?? '',
                adresse: a.querySelector('.standort-adresse')?.textContent?.trim() ?? '',
                maschinen: a.querySelectorAll('.standort-maschine').length,
                anlegen: Boolean(a.querySelector('.standort-neue-maschine')),
                // Der alte Rumpf gehört auf diese Ebene nicht ins Bild.
                rumpfWeg:
                  getComputedStyle(document.querySelector('.zanobo-tiefe > .container')).display ===
                  'none',
              };
            });

            // Eine Ebene tiefer und auf demselben Weg zurück.
            //
            // Der Tipp auf eine Maschinenzeile führt seit dem Umbau der
            // Nutzerreise DIREKT in die Arbeitsebene der Maschine — kein
            // Fenster mehr, in dem man dieselbe Maschine noch einmal wählt.
            if (standort?.maschinen) {
              await page
                .locator('.standort-maschine')
                .first()
                .click({ force: true })
                .catch(() => {});
              await page.waitForTimeout(1600);
              maschinenebene = await page.evaluate(() => {
                const sichtbar = (e) => {
                  const cs = getComputedStyle(e);
                  return (
                    cs.display !== 'none' &&
                    cs.visibility !== 'hidden' &&
                    e.getBoundingClientRect().height > 0
                  );
                };
                const tiefe = document.getElementById('zanobo-tiefe');
                const aktion = document.querySelector('.maschine-aktion');
                const kasten = aktion?.getBoundingClientRect();
                return {
                  drin: document.body.classList.contains('tiefe-maschine'),
                  // Kein Auswahlfenster für eine bereits gewählte Maschine.
                  fenster: [...document.querySelectorAll('.modal')].filter(
                    (m) => getComputedStyle(m).display !== 'none'
                  ).length,
                  // Der Bestand gehört nicht in den Arbeitskontext — weder ins
                  // Bild noch in den Tab-Weg.
                  bestandszeilen: [...document.querySelectorAll('.machine-item')].filter(sichtbar)
                    .length,
                  fokussierbar: [
                    ...tiefe.querySelectorAll(
                      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])'
                    ),
                  ].filter(sichtbar).length,
                  // Genau EINE dominante Handlung.
                  primaer: [...tiefe.querySelectorAll('button.primary')].filter(sichtbar).length,
                  // Und sie steht ohne Scrollen im Bild.
                  ohneScrollen: kasten ? kasten.bottom <= window.innerHeight : false,
                  urteil: document.querySelector('.maschine-lage')?.textContent?.trim() ?? '',
                };
              });

              await page
                .locator('.tiefe-zurueck')
                .click({ force: true })
                .catch(() => {});
              await page.waitForTimeout(1000);
              // Zurück muss im Standort landen: Der Weg herein führte über ihn.
              zurueckImStandort = await page.evaluate(
                () =>
                  !document.body.classList.contains('tiefe-maschine') &&
                  getComputedStyle(document.getElementById('standort-ansicht')).display !== 'none'
              );
            }

            // Wieder heraus, damit der nächste Griff die Karte vorfindet.
            await page
              .locator('.tiefe-zurueck')
              .click({ force: true })
              .catch(() => {});
            await page.waitForTimeout(900);
          }

          // Nur weitermessen, wenn wir wirklich wieder auf der Karte stehen.
          //
          // Ohne diese Zeile stirbt der Lauf mit einem Stapelabzug, sobald der
          // Rückweg klemmt: Der Marker ist dann von der Tiefe verdeckt, und
          // Playwright wartet 30 Sekunden auf ihn. Beim Falsifizieren des
          // Rückwegs ist genau das passiert — statt dreier Befunde kam ein
          // „TimeoutError", und der zeigt auf die falsche Stelle.
          const wiederAufDerKarte = await page.evaluate(
            () => !document.body.classList.contains('tiefe-offen')
          );

          if (maschineImBlatt && wiederAufDerKarte) {
            await page
              .locator('#map .leaflet-marker-icon')
              .first()
              .click({ force: true })
              .catch(() => {});
            await page.waitForTimeout(900);
            await page
              .locator('.popup-customer .rl-row', { hasText: 'Pumpe 17' })
              .first()
              .click({ force: true })
              .catch(() => {});
            await page.waitForTimeout(1200);
            karteZu = await page.evaluate(() => document.body.classList.contains('tiefe-offen'));
          }
        }
      }
    }

    console.log('\n=== Standortkarte ===');
    console.log(`Menüzeile „Standortkarte" ${zeileDa ? 'sichtbar' : 'FEHLT'}`);
    console.log(`Marker auf der Karte      ${markerZahl}`);
    console.log(`Kartengründe              ${gruende}`);
    console.log(`Voreingestellter Grund    ${grundVorgabe || '(leer)'}`);
    console.log(`PLZ-Gebiete (Flächen)     ${gebiete}`);
    console.log(
      `Quellenangabe             ${quelle.replace(/\s+/g, ' ').slice(0, 60) || '(leer)'}`
    );
    console.log(`Standort-Popup            ${blattDa ? 'sichtbar' : 'NICHT sichtbar'}`);
    console.log(`Name ist ein Knopf        ${scharnierIstKnopf ? 'ja' : 'NEIN'}`);
    console.log(`Name öffnet die Tiefe     ${scharnierOeffnet ? 'ja' : 'NEIN'}`);
    console.log(`Standortansicht           ${standort ? standort.titel : 'FEHLT'}`);
    console.log(`  Adresse                 ${standort?.adresse || '(leer)'}`);
    console.log(`  Maschinen darin         ${standort?.maschinen ?? 0}`);
    console.log(`  „Neue Maschine anlegen" ${standort?.anlegen ? 'ja' : 'NEIN'}`);
    console.log(`  alter Rumpf verdeckt    ${standort?.rumpfWeg ? 'ja' : 'NEIN'}`);
    console.log(`Maschinenebene erreicht   ${maschinenebene?.drin ? 'ja' : 'NEIN'}`);
    console.log(`  Urteil                  ${maschinenebene?.urteil || '(leer)'}`);
    console.log(`  offene Fenster          ${maschinenebene?.fenster ?? '—'} (erwartet 0)`);
    console.log(`  Bestandszeilen          ${maschinenebene?.bestandszeilen ?? '—'} (erwartet 0)`);
    console.log(`  fokussierbar            ${maschinenebene?.fokussierbar ?? '—'}`);
    console.log(`  Primäraktionen          ${maschinenebene?.primaer ?? '—'} (erwartet 1)`);
    console.log(`  ohne Scrollen sichtbar  ${maschinenebene?.ohneScrollen ? 'ja' : 'NEIN'}`);
    console.log(`Zurück landet im Standort ${zurueckImStandort ? 'ja' : 'NEIN'}`);
    console.log(`Maschine im Popup         ${maschineImBlatt ? 'sichtbar' : 'NICHT sichtbar'}`);
    console.log(`Maschinenzeile führt rein ${karteZu ? 'ja' : 'nein'}`);

    pruefe(zeileDa, 'Karte: die Menüzeile fehlt, obwohl ein verorteter Standort da ist');
    pruefe(gebiete >= 10, `Karte: nur ${gebiete} Postleitzahlgebiete — das Deutschlandbild fehlt`);
    pruefe(
      markerZahl > 0,
      'Karte: kein Marker — der Standort ist ohne Koordinaten angelegt worden'
    );
    pruefe(gruende === 3, `Karte: ${gruende} statt 3 Kartengründe (Hell · Standard · Satellit)`);
    pruefe(
      grundVorgabe === 'standard',
      `Karte: der Grund steht auf „${grundVorgabe}" statt auf „standard" — der Stamm stellt OSM voreinstellt, nicht CARTO`
    );
    pruefe(
      quelle.includes('OpenStreetMap'),
      'Karte: die Quellenangabe der Kacheln fehlt — sie ist Bedingung der Nutzung, kein Schmuck'
    );
    pruefe(blattDa, 'Karte: der Marker öffnet kein Standort-Popup — er tut nichts');
    pruefe(
      scharnierIstKnopf,
      'Scharnier: der Maschinenstandortname ist kein Knopf — der Übergang hängt genau an ihm'
    );
    pruefe(scharnierOeffnet, 'Scharnier: der Name lässt sich drücken, führt aber nirgendwohin');
    pruefe(
      Boolean(standort?.titel),
      'Standortansicht: hinter dem Scharnier steht kein Maschinenstandortname'
    );
    pruefe(
      Boolean(standort?.adresse),
      'Standortansicht: die Adresse fehlt — sie gehört laut Vorgabe dazu'
    );
    pruefe(
      standort?.adresse?.includes('Industriestraße 12'),
      'Standortansicht: die optionale Straße wurde nicht gespeichert oder nicht angezeigt'
    );
    pruefe(
      (standort?.maschinen ?? 0) > 0,
      'Standortansicht: sie zeigt keine Maschinen, obwohl an diesem Standort eine steht'
    );
    pruefe(
      Boolean(standort?.anlegen),
      'Standortansicht: „Neue Maschine anlegen" fehlt — die Handlung dieser Ebene'
    );
    pruefe(
      Boolean(standort?.rumpfWeg),
      'Standortansicht: die bisherige Oberfläche steht daneben — zwei Ebenen zugleich im Bild'
    );
    pruefe(
      Boolean(maschinenebene?.drin),
      'Standortansicht: eine Maschinenzeile führt nicht in die Arbeitsebene der Maschine'
    );
    pruefe(
      maschinenebene?.fenster === 0,
      'Maschinenebene: es öffnet sich ein Fenster — die Maschine war schon gewählt'
    );
    pruefe(
      maschinenebene?.bestandszeilen === 0,
      `Maschinenebene: ${maschinenebene?.bestandszeilen} Bestandszeilen im Arbeitskontext — der Bestand ist der Ort, aus dem man KAM`
    );
    pruefe(
      (maschinenebene?.fokussierbar ?? 99) <= 6,
      `Maschinenebene: ${maschinenebene?.fokussierbar} fokussierbare Elemente — was man nicht sieht, soll man auch nicht durchtabben`
    );
    pruefe(
      maschinenebene?.primaer === 1,
      `Maschinenebene: ${maschinenebene?.primaer} dominante Handlungen statt genau einer`
    );
    pruefe(
      Boolean(maschinenebene?.ohneScrollen),
      'Maschinenebene: die Primäraktion steht nicht ohne Scrollen im Bild'
    );
    pruefe(
      zurueckImStandort,
      'Scharnier: aus der Maschine führt der Weg zurück nicht in den Standort, aus dem man kam'
    );
    pruefe(maschineImBlatt, 'Karte: das Standort-Popup zeigt seine Maschinen nicht');
    pruefe(karteZu, 'Karte: der Tipp auf eine Maschine führt nicht in die Maschinenansicht');

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DER WEG HINEIN — aus dem Zustand, in dem jemand wirklich anfängt
  //
  // Dieser Block hat einen konkreten Anlass. Am 15.08.2026 schickte der
  // Auftraggeber einen Screenshot: Basis-Stufe, eine Maschine, kein Standort —
  // und die Frage, wo denn das Deutschlandbild bleibe. Nachgemessen war die
  // Antwort unangenehm: In genau dieser Lage war die Karte nicht erreichbar,
  // und auch auf Profi nicht, weil sie einen Standort voraussetzte, den nur die
  // ebenfalls versteckten Beispieldaten geliefert hätten.
  //
  // Die Regel dahinter — „kein Knopf auf ein leeres graues Feld" — war
  // richtig und ist anderswo mehrfach nützlich gewesen. Falsch war ihre
  // Anwendung: Sie mauerte die Tür zu, statt das Feld zu füllen. Ein Weg, den
  // es nur gibt, wenn man ihn schon gegangen ist, ist keiner.
  //
  // Deshalb wird hier nicht ein Knopf geprüft, sondern eine Lage: der
  // Anfangszustand. Er ist der einzige, den JEDER durchläuft.
  {
    const ctx = await browser.newContext({
      viewport: FORMATE[0].viewport,
      hasTouch: true,
      isMobile: true,
      locale: 'de-DE',
    });
    const page = await ctx.newPage();
    await ohneBeispieldaten(page);
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await inDieTiefe(page);
    await page.waitForTimeout(2000);

    const stufe = await page.evaluate(() =>
      document.documentElement.getAttribute('data-view-level')
    );

    await page.locator('#btn-info').click();
    await page.waitForTimeout(800);
    const karteImMenue = await page
      .locator('.info-sheet-row[data-karte]')
      .isVisible()
      .catch(() => false);
    const kundenImMenue = await page
      .locator('.info-sheet-row[data-thema="standorte"]')
      .isVisible()
      .catch(() => false);

    let flaechen = 0;
    let einstiegDa = false;
    let eigeneMaschineDa = false;
    let eigenerStandortDa = false;
    let standortDialogDa = false;
    let standortDialogPasst = false;
    let standortFormOhneScroll = false;
    let standortFelderInZeile = false;
    let standortTouchzieleGross = false;
    let markerNachEinstieg = 0;

    if (karteImMenue) {
      await page.locator('.info-sheet-row[data-karte]').click();
      // Leaflet plus die Flächendatei.
      await page.waitForTimeout(5000);
      flaechen = await page.locator('#map path.leaflet-interactive').count();
      einstiegDa = await page
        .locator('#map-empty')
        .isVisible()
        .catch(() => false);
      eigeneMaschineDa = await page
        .locator('#map-empty-new-machine-btn')
        .isVisible()
        .catch(() => false);
      eigenerStandortDa = await page
        .locator('#map-empty-new-site-btn')
        .isVisible()
        .catch(() => false);

      if (einstiegDa) {
        if (eigenerStandortDa) {
          await page.locator('#map-empty-new-site-btn').click();
          standortDialogDa = await page
            .locator('#site-create-modal')
            .isVisible()
            .catch(() => false);
          if (standortDialogDa) {
            const modalMasse = await page.evaluate(() => {
              const inhalt = document.querySelector('#site-create-modal .site-create-content');
              const formular = document.querySelector('#site-create-modal .modal-body');
              const plz = document.querySelector('#site-create-plz');
              const ort = document.querySelector('#site-create-ort');
              const abbrechen = document.querySelector('#site-create-cancel');
              const speichern = document.querySelector('#site-create-save');
              const inhaltRechteck = inhalt?.getBoundingClientRect();
              const plzRechteck = plz?.getBoundingClientRect();
              const ortRechteck = ort?.getBoundingClientRect();
              const abbrechenRechteck = abbrechen?.getBoundingClientRect();
              const speichernRechteck = speichern?.getBoundingClientRect();

              return {
                passt:
                  Boolean(inhaltRechteck && abbrechenRechteck && speichernRechteck) &&
                  inhaltRechteck.top >= -1 &&
                  inhaltRechteck.height <= window.innerHeight + 1 &&
                  abbrechenRechteck.bottom <= inhaltRechteck.bottom &&
                  speichernRechteck.bottom <= inhaltRechteck.bottom,
                ohneScroll: Boolean(formular) && formular.scrollHeight <= formular.clientHeight + 1,
                felderInZeile:
                  Boolean(plzRechteck && ortRechteck) &&
                  Math.abs(plzRechteck.top - ortRechteck.top) <= 1,
                touchzieleGross:
                  Boolean(abbrechenRechteck && speichernRechteck) &&
                  abbrechenRechteck.height >= 44 &&
                  speichernRechteck.height >= 44,
              };
            });
            standortDialogPasst = modalMasse.passt;
            standortFormOhneScroll = modalMasse.ohneScroll;
            standortFelderInZeile = modalMasse.felderInZeile;
            standortTouchzieleGross = modalMasse.touchzieleGross;
          }
          await page.locator('#site-create-cancel').click();
        }
        await page.locator('#map-empty-demo-btn').click();
        await page.waitForTimeout(9000);
        markerNachEinstieg = await page.locator('#map .leaflet-marker-icon').count();
      }
    }

    console.log('\n=== Weg hinein (leerer Bestand, Voreinstellung) ===');
    console.log(`Ansichtsstufe             ${stufe}`);
    console.log(`„Standortkarte" im Menü   ${karteImMenue ? 'ja' : 'NEIN'}`);
    console.log(`„Standorte" im Menü       ${kundenImMenue ? 'ja' : 'NEIN'}`);
    console.log(`PLZ-Gebiete ohne Punkte   ${flaechen}`);
    console.log(`Einstieg in der Karte     ${einstiegDa ? 'sichtbar' : 'NICHT sichtbar'}`);
    console.log(`Eigene Maschine anlegen   ${eigeneMaschineDa ? 'sichtbar' : 'NICHT sichtbar'}`);
    console.log(`Eigenen Standort anlegen  ${eigenerStandortDa ? 'sichtbar' : 'NICHT sichtbar'}`);
    console.log(`Standortdialog öffnet     ${standortDialogDa ? 'ja' : 'NEIN'}`);
    console.log(`Dialog passt ins Handy    ${standortDialogPasst ? 'ja' : 'NEIN'}`);
    console.log(`Formular ohne Scrollen    ${standortFormOhneScroll ? 'ja' : 'NEIN'}`);
    console.log(`PLZ und Ort in einer Zeile ${standortFelderInZeile ? 'ja' : 'NEIN'}`);
    console.log(`Aktionen mindestens 44 px ${standortTouchzieleGross ? 'ja' : 'NEIN'}`);
    console.log(`Marker nach dem Einstieg  ${markerNachEinstieg}`);

    pruefe(
      karteImMenue,
      `Weg hinein: „Standortkarte" fehlt im Menü auf Stufe „${stufe}" — die Karte ist aus dem Anfangszustand nicht erreichbar`
    );
    pruefe(
      kundenImMenue,
      `Weg hinein: „Standorte" fehlt im Menü auf Stufe „${stufe}" — die Beispieldaten sind ausgerechnet dem Neuling verborgen`
    );
    pruefe(
      flaechen >= 10,
      `Weg hinein: nur ${flaechen} Flächen auf der leeren Karte — ohne Standorte bliebe sie ein graues Feld statt Deutschland zu zeigen`
    );
    pruefe(einstiegDa, 'Weg hinein: die leere Karte bietet keinen Schritt an, der sie füllt');
    pruefe(
      eigeneMaschineDa,
      'Weg hinein: die leere Karte bietet nur Beispieldaten statt der ersten eigenen Maschine an'
    );
    pruefe(
      eigenerStandortDa && standortDialogDa,
      'Weg hinein: ein eigener Standort lässt sich nicht unabhängig von einer Maschine vorbereiten'
    );
    pruefe(
      standortDialogPasst,
      'Standortdialog: Sheet oder Aktionen sind größer als das typische Handyformat 390×844'
    );
    pruefe(
      standortFormOhneScroll,
      'Standortdialog: das Grundformular passt auf 390×844 nicht vollständig ins sichtbare Sheet'
    );
    pruefe(
      standortFelderInZeile,
      'Standortdialog: PLZ und Ort stehen auf dem Handy nicht in einer Zeile'
    );
    pruefe(
      standortTouchzieleGross,
      'Standortdialog: Abbrechen oder Speichern ist auf dem Handy kleiner als 44 px'
    );
    pruefe(
      markerNachEinstieg > 0,
      'Weg hinein: der Knopf in der leeren Karte bringt keine Standorte auf die Karte'
    );

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DIE QUELLENANGABE IM DIALOG
  //
  // Die schlimmste Entdeckung dieser Sitzung, und sie war zwei
  // Zusammenführungen lang unbemerkt: Der Block mit der Herkunft der Daten
  // stand seit PR #43 in `index.html` — mitten im Rumpf des Dialogs „Über
  // SoundFuchs". Diesen Rumpf ersetzt `AboutModalController` beim Start
  // vollständig durch eigenes Markup. Der Block war damit aus dem Dokument
  // verschwunden, bevor ihn je jemand sehen konnte; gemessen kam er null Mal
  // vor, nicht einmal vor dem Öffnen.
  //
  // Ich hatte in zwei Zusammenführungen berichtet, die Quellenangabe stehe im
  // Dialog. Das war falsch. Bei CC BY 4.0 und ODbL ist die Nennung nicht
  // Höflichkeit, sondern die Bedingung, unter der die Daten benutzt werden
  // dürfen — ein stiller Ausfall ist hier kein Schönheitsfehler.
  //
  // Geprüft wird deshalb nicht das Markup, sondern der sichtbare Text im
  // geöffneten Dialog. Nur das beantwortet die Frage, um die es geht: Steht
  // die Nennung da, wo ein Mensch sie liest?
  {
    const ctx = await browser.newContext({ viewport: FORMATE[0].viewport, locale: 'de-DE' });
    const page = await ctx.newPage();
    await ohneBeispieldaten(page);
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await inDieTiefe(page);
    await page.waitForTimeout(2000);

    await page.evaluate(() => document.getElementById('about-btn')?.click());
    await page.waitForTimeout(1200);

    const text = await page
      .locator('#about-modal .modal-body')
      .innerText()
      .catch(() => '');
    const geoNames = text.includes('GeoNames');
    const osm = text.includes('OpenStreetMap');
    const carto = text.includes('CARTO');
    const esri = text.includes('Esri');
    const standDa = /\d/.test(
      await page
        .locator('#about-build')
        .innerText()
        .catch(() => '')
    );
    const knopfDa = await page
      .locator('#check-update-btn')
      .isVisible()
      .catch(() => false);

    console.log('\n=== Quellenangabe im Dialog ===');
    console.log(`GeoNames (CC BY 4.0)      ${geoNames ? 'genannt' : 'FEHLT'}`);
    console.log(`OpenStreetMap (ODbL)      ${osm ? 'genannt' : 'FEHLT'}`);
    console.log(`CARTO                     ${carto ? 'genannt' : 'FEHLT'}`);
    console.log(`Esri                      ${esri ? 'genannt' : 'FEHLT'}`);
    console.log(`Bauzeit                   ${standDa ? 'sichtbar' : 'FEHLT'}`);
    console.log(`„Nach Update suchen"      ${knopfDa ? 'sichtbar' : 'FEHLT'}`);

    pruefe(
      geoNames,
      'Quellenangabe: GeoNames wird im Dialog nicht genannt — CC BY 4.0 verlangt die Nennung'
    );
    pruefe(
      osm,
      'Quellenangabe: OpenStreetMap wird im Dialog nicht genannt — ODbL verlangt die Nennung'
    );
    pruefe(carto, 'Quellenangabe: CARTO wird im Dialog nicht genannt');
    pruefe(esri, 'Quellenangabe: Esri wird im Dialog nicht genannt');
    pruefe(
      standDa,
      'Version: die Bauzeit steht nicht im Dialog — dann kann niemand sehen, welche Fassung läuft'
    );
    pruefe(knopfDa, 'Version: der Knopf „Nach Update suchen" fehlt im Dialog');

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BEISPIELDATEN
  //
  // Eigenes Fenster, eigener Bestand: Die Zahl der Beispiel-Standorte soll nicht
  // von den zwei Standorten aus dem vorigen Block verfälscht werden.
  //
  // Geprüft wird die Kette Knopf → Bestand → Knopf zeigt den neuen Zustand →
  // Rückgängig macht wirklich alles rückgängig. Der zweite Teil ist der
  // eigentliche Grund für diesen Test: „Beispieldaten entfernen" hängt am
  // `demo`-Feld. Verlöre eine künftige Änderung dieses Feld irgendwo auf dem
  // Weg, entfernte der Knopf nichts mehr — und niemand bemerkte es, weil er
  // anschließend anstandslos wieder „laden" anböte.
  {
    const ctx = await browser.newContext({
      viewport: FORMATE[0].viewport,
      hasTouch: true,
      isMobile: true,
      locale: 'de-DE',
    });
    const page = await ctx.newPage();
    await ohneBeispieldaten(page);
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    // Die Kategorie liegt hinter der Experten-Stufe (wie die Datenverwaltung
    // direkt daneben) — ohne den Wechsel bliebe die Menüzeile unsichtbar und
    // der Test träfe die falsche Ursache.
    await inDieTiefe(page, { profi: true });
    await page.waitForTimeout(2000);

    await page.locator('#btn-info').click();
    await page.waitForTimeout(700);
    const kundenZeile = page.locator('.info-sheet-row[data-thema="standorte"]');
    const zeileDa = await kundenZeile.isVisible().catch(() => false);
    if (zeileDa) await kundenZeile.click();
    await page.waitForTimeout(500);

    const knopf = page.locator('#demo-toggle-btn');
    const knopfDa = await knopf.isVisible().catch(() => false);
    const beschriftungVorher = knopfDa ? await knopf.innerText() : '';

    // Der Filter selbst: Ein themenfremder Abschnitt (hier "Ansicht") muss
    // verschwinden. Ohne diese Prüfung würde ein fehlender Eintrag in der
    // CSS-Aufzählung der Filter (style.css, ".settings-list[data-filter=…]")
    // nicht auffallen — der Knopf oben wäre trotzdem sichtbar, nur eben
    // zusammen mit alldem, was eigentlich ausgeblendet gehört. Genau das ist
    // beim Einbau dieser Kategorie passiert und wäre unbemerkt geblieben,
    // hätte nicht diese Zeile danach gefragt statt nur nach dem eigenen Knopf.
    const fremdesThemaSichtbar = await page
      .locator('.setting-category[data-thema~="ansicht"]')
      .first()
      .isVisible()
      .catch(() => false);

    let maschinenNachLaden = 0;
    let beschriftungNachLaden = '';
    let maschinenNachEntfernen = 0;

    if (knopfDa) {
      await knopf.click();
      // Rund 100 Standorte plus Maschinen anlegen, dann laedt die Seite neu.
      await page.waitForTimeout(6000);
      maschinenNachLaden = await page.locator('.machine-item').count();

      // Nach dem Neuladen steht die Tiefe wieder zu und die Stufe auf Basis.
      await inDieTiefe(page, { profi: true });
      await page.locator('#btn-info').click();
      await page.waitForTimeout(700);
      await page.locator('.info-sheet-row[data-thema="standorte"]').click();
      await page.waitForTimeout(500);
      beschriftungNachLaden = await page.locator('#demo-toggle-btn').innerText();

      await page.locator('#demo-toggle-btn').click();
      await page.waitForTimeout(3000);
      maschinenNachEntfernen = await page.locator('.machine-item').count();
    }

    console.log('\n=== Beispieldaten ===');
    console.log(`Menüzeile „Standorte"     ${zeileDa ? 'sichtbar' : 'FEHLT'}`);
    console.log(`Beschriftung vorher       ${beschriftungVorher || '(kein Knopf)'}`);
    console.log(`Filter blendet aus        ${fremdesThemaSichtbar ? 'NEIN' : 'ja'}`);
    console.log(`Maschinen nach dem Laden  ${maschinenNachLaden}`);
    console.log(`Beschriftung danach       ${beschriftungNachLaden}`);
    console.log(`Maschinen nach Entfernen  ${maschinenNachEntfernen}`);

    pruefe(zeileDa, 'Beispieldaten: die Menüzeile „Standorte" fehlt auf Experten-Stufe');
    pruefe(knopfDa, 'Beispieldaten: der Knopf fehlt in der Kategorie');
    pruefe(
      !fremdesThemaSichtbar,
      'Beispieldaten: das Thema "standorte" filtert nicht — ein fremder Abschnitt ("Ansicht") bleibt sichtbar (style.css: .settings-list[data-filter] fehlt der Eintrag)'
    );
    pruefe(
      maschinenNachLaden >= 50,
      `Beispieldaten: nur ${maschinenNachLaden} Maschinen nach dem Laden — erwartet nahe 100`
    );
    pruefe(
      beschriftungNachLaden.toLowerCase().includes('entfernen'),
      `Beispieldaten: der Knopf zeigt nach dem Laden „${beschriftungNachLaden}" statt „entfernen"`
    );
    pruefe(
      maschinenNachEntfernen === 0,
      `Beispieldaten: nach „entfernen" stehen noch ${maschinenNachEntfernen} Maschinen im Bestand`
    );

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STANDORTLISTE EINLESEN
  //
  // Dieselbe Kategorie, der zweite Knopf. Eine winzige CSV-Datei mit einer
  // Kopfzeile in eigener Schreibweise ("Firma" statt "Name") prüft genau die
  // Stelle, die am leichtesten stumm bricht: die Spaltenerkennung. Erkennt
  // sie „Firma" nicht mehr, legt die Funktion nichts an — nicht lautstark,
  // sondern einfach gar nicht.
  {
    const csvPfad = join(mkdtempSync(join(tmpdir(), 'kunden-')), 'kunden.csv');
    writeFileSync(
      csvPfad,
      'Firma,PLZ,Maschine\nAttention-Check Import GmbH,45127,Import-Pumpe 1\n',
      'utf8'
    );

    const ctx = await browser.newContext({
      viewport: FORMATE[0].viewport,
      hasTouch: true,
      isMobile: true,
      locale: 'de-DE',
    });
    const page = await ctx.newPage();
    await ohneBeispieldaten(page);
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await inDieTiefe(page, { profi: true });
    await page.waitForTimeout(2000);

    await page.locator('#btn-info').click();
    await page.waitForTimeout(700);
    const kundenZeileDa = await page
      .locator('.info-sheet-row[data-thema="standorte"]')
      .isVisible()
      .catch(() => false);
    if (kundenZeileDa) await page.locator('.info-sheet-row[data-thema="standorte"]').click();
    await page.waitForTimeout(500);

    const importKnopf = page.locator('#import-customers-btn');
    const importKnopfDa = await importKnopf.isVisible().catch(() => false);

    let maschineDa = false;
    if (importKnopfDa) {
      const [dateiwahl] = await Promise.all([
        page.waitForEvent('filechooser'),
        importKnopf.click(),
      ]);
      await dateiwahl.setFiles(csvPfad);
      // Import plus Neuladen der Seite. Danach steht die Tiefe wieder zu — der
      // Bestand liegt darin, und „nicht sichtbar" hieße sonst „gibt es nicht".
      await page.waitForTimeout(3500);
      await inDieTiefe(page);
      maschineDa = await page
        .locator('.machine-item', { hasText: 'Import-Pumpe 1' })
        .first()
        .isVisible()
        .catch(() => false);
    }

    console.log('\n=== Standortliste einlesen ===');
    console.log(`Importknopf               ${importKnopfDa ? 'sichtbar' : 'FEHLT'}`);
    console.log(`Maschine aus der CSV      ${maschineDa ? 'sichtbar' : 'NICHT sichtbar'}`);

    pruefe(importKnopfDa, 'Standortimport: der Knopf fehlt in der Kategorie');
    pruefe(
      maschineDa,
      'Standortimport: die aus „Firma,PLZ,Maschine" eingelesene Maschine erscheint nicht im Bestand — die Spalte „Firma" wird nicht mehr als Name erkannt'
    );

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DER STAMM UND DAS SCHARNIER (docs/nutzerreise-wie-tourfuchs.md §0h)
  //
  // Hier stand bis zum 16.08.2026 die Prüfung der „neuen Schale": Grund,
  // Kopfstreifen, vier Reiter, Hin- und Rückweg des Schalters. Diese Schale
  // gibt es nicht mehr — sie war der Nachbau, den §0h zurücknimmt, und mit
  // ihr sind Schalter, Umzugsliste und Rückweg entfallen.
  //
  // Was an ihre Stelle tritt, prüft die zwei Dinge, an denen der Stamm still
  // brechen kann:
  //
  //   1. Steht er überhaupt? Kopfleiste, Karte als Grund, Blatt, Knopfzeile,
  //      Ansichtstiefe und Reiter am jeweils richtigen Ort — auf dem Handy im
  //      Kopfstreifen, am Schreibtisch in der Seitenleiste.
  //   2. Trägt das Scharnier in beide Richtungen? Eine Tür, die aufgeht und
  //      nicht wieder zu, ist keine.
  //
  // Punkt 2 ist der wichtigere. Der Prüfweg liegt vollständig dahinter; wer
  // nicht zurückkommt, sitzt in der Tiefe fest, und die Karte — die ganze
  // erste Ebene — wäre unerreichbar.
  {
    const ctx = await browser.newContext({
      viewport: FORMATE[0].viewport,
      hasTouch: true,
      isMobile: true,
      locale: 'de-DE',
    });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);

    const steht = await page.evaluate(() => {
      const da = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return false;
        const cs = getComputedStyle(e);
        return (
          cs.display !== 'none' &&
          cs.visibility !== 'hidden' &&
          e.getBoundingClientRect().height > 0
        );
      };
      return {
        kopfleiste: da('#app > .topbar'),
        karteImGrund: da('#app > main#map'),
        blatt: Boolean(document.getElementById('sidebar')),
        knopfzeile: da('#map-fab-row'),
        tiefeImStreifen: Boolean(document.querySelector('#mobile-topnav #depth-switch')),
        reiterImStreifen: document.querySelectorAll('#mobile-topnav .tab-button').length,
        reiterImBlatt: document.querySelectorAll('#sidebar .tab-button').length,
        streifenHoch: Math.round(
          document.getElementById('mobile-topnav')?.getBoundingClientRect().height ?? 0
        ),
        tiefeZu: document.getElementById('zanobo-tiefe')?.hidden ?? false,
      };
    });

    // Die Tür in beide Richtungen. Der Weg des Nutzers führt über einen
    // Standort auf der Karte; der hängt an den Beispieldaten und daran, wo
    // gerade ein Punkt liegt. Geprüft wird deshalb die Mechanik selbst — sie
    // ist es, die tragen muss.
    await page.evaluate(() => {
      document.getElementById('zanobo-tiefe').hidden = false;
      document.body.classList.add('tiefe-offen');
    });
    await page.waitForTimeout(700);
    const drin = await page.evaluate(() => ({
      tiefeOffen: document.body.classList.contains('tiefe-offen'),
      // Gemessen an der Karte, nicht an `#app`: Die Kopfleiste bleibt mit
      // Absicht stehen (sie trägt ⓘ, Suche und Basis/Profi), also ist `#app`
      // selbst sichtbar. Ruhen muss, was die Tiefe verdecken würde.
      stammRuht: getComputedStyle(document.getElementById('map')).visibility === 'hidden',
      rueckwegDa: Boolean(document.querySelector('.tiefe-zurueck')),
      bestandDa: Boolean(document.querySelector('#zanobo-tiefe .container')),
    }));

    await page
      .locator('.tiefe-zurueck')
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(700);
    const zurueck = await page.evaluate(() => ({
      tiefeZu: document.getElementById('zanobo-tiefe')?.hidden ?? false,
      stammDa: getComputedStyle(document.getElementById('map')).visibility !== 'hidden',
      karteDa: (document.getElementById('map')?.getBoundingClientRect().height ?? 0) > 0,
    }));

    console.log('\n=== Stamm und Scharnier ===');
    console.log(`Kopfleiste                ${steht.kopfleiste ? 'ja' : 'NEIN'}`);
    console.log(`Karte als Grund           ${steht.karteImGrund ? 'ja' : 'NEIN'}`);
    console.log(`Knopfzeile über der Karte ${steht.knopfzeile ? 'ja' : 'NEIN'}`);
    console.log(`Tiefe im Kopfstreifen     ${steht.tiefeImStreifen ? 'ja' : 'NEIN'}`);
    console.log(`Reiter im Streifen        ${steht.reiterImStreifen} (erwartet 0)`);
    console.log(`Reiter im Blatt           ${steht.reiterImBlatt}`);
    console.log(`Streifenhöhe              ${steht.streifenHoch} px (erwartet 55)`);
    console.log(`Tiefe beim Start zu       ${steht.tiefeZu ? 'ja' : 'NEIN'}`);
    console.log(`Auf: Stamm ruht           ${drin.stammRuht ? 'ja' : 'NEIN'}`);
    console.log(`Auf: Bestand da           ${drin.bestandDa ? 'ja' : 'NEIN'}`);
    console.log(`Zu:  Karte wieder da      ${zurueck.karteDa ? 'ja' : 'NEIN'}`);

    pruefe(steht.kopfleiste, 'Stamm: die Kopfleiste steht nicht — das Gerüst ist nicht aufgebaut');
    pruefe(
      steht.karteImGrund,
      'Stamm: die Karte liegt nicht als Grund unter der Schale — die erste Ebene fehlt'
    );
    pruefe(steht.blatt, 'Stamm: das Blatt fehlt im Baum');
    pruefe(
      steht.knopfzeile,
      'Stamm: die Knopfzeile über der Karte fehlt — „Maschine erkennen" ist unerreichbar'
    );
    pruefe(
      steht.tiefeImStreifen,
      'Stamm: die Ansichtstiefe ist nicht in den Kopfstreifen gezogen — sie fährt mit dem Blatt aus dem Bild'
    );
    // Der Kopfstreifen trägt NUR die Ansichtstiefe.
    //
    // Bis zum 16.08.2026 stand hier „3 Reiter erwartet" — und der Streifen war
    // dadurch zweizeilig, 100 px statt der 55 des Stamms. Der Wächter hat den
    // Fehler nicht nur übersehen, er hat ihn festgeschrieben: Wer ihn
    // behoben hätte, wäre rot geworden.
    pruefe(
      steht.reiterImStreifen === 0,
      `Stamm: ${steht.reiterImStreifen} Reiter im Kopfstreifen — dort gehört nur Basis/Profi hin`
    );
    pruefe(
      steht.reiterImBlatt > 0,
      'Stamm: die Reiter sind weder im Streifen noch im Blatt — sie sind verschwunden'
    );
    pruefe(
      Math.abs(steht.streifenHoch - 55) <= 2,
      `Stamm: der Kopfstreifen ist ${steht.streifenHoch} px hoch statt 55 — er nimmt der Karte den Platz oben`
    );
    pruefe(
      steht.tiefeZu,
      'Scharnier: die Tiefe steht beim Start offen — die Karte wäre nie das erste Bild'
    );
    pruefe(
      drin.tiefeOffen && drin.bestandDa,
      'Scharnier: die Tür geht auf, aber dahinter steht nichts'
    );
    pruefe(
      drin.stammRuht,
      'Scharnier: der Stamm bleibt sichtbar, während die Tiefe offen ist — zwei Oberflächen übereinander'
    );
    pruefe(drin.rueckwegDa, 'Scharnier: es gibt keinen Rückweg aus der Tiefe');
    pruefe(zurueck.tiefeZu, 'Scharnier: die Tür geht nicht wieder zu');
    pruefe(
      zurueck.stammDa && zurueck.karteDa,
      'Scharnier: nach dem Zurückgehen ist die Karte nicht wieder da — der Rückweg führt ins Leere'
    );

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WAS HIER STAND
  //
  // Bis zum 16.08.2026 folgten hier drei weitere Blöcke: die Kette von der
  // Karte in die Prüfung (Schnitt 3), der Reiter „Flotte" (Schnitt 5) und die
  // Nahliste mit dem Standortfilter (Schnitt 6). Alle drei maßen Elemente der
  // alten Schale — `#schale-blatt`, `#schale-griff`, `.schale-reiter-btn`,
  // `#customer-map` im Fenster. Keines davon gibt es noch.
  //
  // Sie sind nicht ersatzlos gestrichen, sondern noch nicht neu geschrieben:
  // Was sie prüften, gehört hinter das Scharnier und wird dort gebaut. Bis
  // dahin wären es Wächter, die eine Behauptung über etwas Verschwundenes
  // aufrechterhalten — und ein Wächter, der immer grün ist, weil er nichts
  // mehr findet, ist schlimmer als keiner.
  //
  // Der Durchlauf deckt die Kette in der Zwischenzeit ab: Er geht denselben
  // Weg vom Bestand über Aufnahme und Prüfung bis zu den drei Auflagen.
  // ═══════════════════════════════════════════════════════════════════════
} finally {
  await browser.close();
  vorschau.kill();
}

if (FREI) {
  console.log('\n(--frei: nur gemessen, keine Budgets geprüft)');
  process.exit(0);
}

if (befunde.length) {
  console.log('\nBefunde:');
  for (const b of befunde) console.log(`  ✗ ${b}`);
  process.exit(1);
}

console.log('\n✓ Alle Budgets eingehalten.');
