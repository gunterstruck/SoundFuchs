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
 * Ausgeführt wird gegen `dist/` — also vorher `npm run build`.
 *
 *   npm run attention-check
 *   npm run attention-check -- --frei      (nur messen, keine Budgets prüfen)
 *
 * Voraussetzung, bewusst **nicht** in `package.json`, damit ein normales
 * `npm install` keinen Browser-Download auslöst:
 *
 *   npm i -D playwright && npx playwright install chromium
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
  erstbild: 12,
  schritteOffen: 16,
  einstellungenBasis: 28,
  einstellungenExperte: 52,
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
try {
  ({ chromium } = require('playwright'));
} catch {
  vorschau.kill();
  console.error(
    'Playwright fehlt. Einmalig:  npm i -D playwright && npx playwright install chromium'
  );
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
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
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
  // KNOPF UND ZIEL AUF DERSELBEN STUFE
  //
  // Manche Knöpfe springen zu einer Stelle, statt etwas zu tun. Liegt diese
  // Stelle auf einer höheren Ansichtstiefe als der Knopf, dann ist der Knopf
  // auf der niedrigeren Stufe zwar sichtbar und anklickbar — aber sein Ziel
  // ist `display:none`, und `scrollIntoView` darauf bewirkt nichts.
  //
  // Genau das war „Details" im Prüfergebnis: Es springt zum Klangbild
  // (`.result-fingerprint`, Stufe „advanced"), stand aber selbst auf jeder
  // Stufe. Unter Basis — der Voreinstellung, also dem Normalfall — tat der
  // Knopf nichts.
  //
  // Geprüft wird das am ruhenden Markup, nicht nach einer echten Prüfung: Das
  // Ergebnis-Fenster liegt ohnehin im Dokument, und die Frage ist eine des
  // Aufbaus, nicht des Messwerts.
  {
    const ctx = await browser.newContext({ viewport: FORMATE[0].viewport, locale: 'de-DE' });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    /** Knopf → Stelle, zu der er springt. */
    const PAARE = [{ knopf: '#result-btn-details', ziel: '#diagnosis-modal .result-fingerprint' }];

    console.log('\n=== Knopf und Ziel ===');
    for (const paar of PAARE) {
      const befund = await page.evaluate((p) => {
        const knopf = document.querySelector(p.knopf);
        const ziel = document.querySelector(p.ziel);
        if (!knopf || !ziel) return { fehlt: true };
        // Das Ergebnis-Fenster einblenden, sonst ist alles darin unsichtbar.
        const fenster = knopf.closest('.modal');
        const vorher = fenster ? fenster.style.display : null;
        if (fenster) fenster.style.display = 'flex';
        const stufen = ['basic', 'advanced', 'expert'];
        const alt = document.documentElement.getAttribute('data-view-level');
        const zeilen = stufen.map((s) => {
          document.documentElement.setAttribute('data-view-level', s);
          return {
            stufe: s,
            knopf: getComputedStyle(knopf).display !== 'none',
            ziel: getComputedStyle(ziel).display !== 'none',
          };
        });
        if (alt) document.documentElement.setAttribute('data-view-level', alt);
        if (fenster) fenster.style.display = vorher ?? 'none';
        return { zeilen };
      }, paar);

      if (befund.fehlt) {
        console.log(`${paar.knopf}  → Knopf oder Ziel nicht im Markup`);
        pruefe(false, `${paar.knopf}: Knopf oder Ziel (${paar.ziel}) gibt es nicht`);
        continue;
      }

      for (const z of befund.zeilen) {
        const gut = !z.knopf || z.ziel;
        console.log(
          `${paar.knopf}  ${z.stufe.padEnd(8)} Knopf ${z.knopf ? 'sichtbar' : 'verborgen'}` +
            ` · Ziel ${z.ziel ? 'sichtbar' : 'verborgen'}  ${gut ? '' : '←'}`
        );
        pruefe(
          gut,
          `${paar.knopf} ist auf Stufe „${z.stufe}" sichtbar, sein Ziel ${paar.ziel} aber nicht` +
            ' — der Knopf tut dort nichts'
        );
      }
    }

    await ctx.close();
  }

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
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const knopf = page.locator('#empty-state-cta');
    const knopfDa = await knopf.isVisible().catch(() => false);
    let feldDa = false;
    if (knopfDa) {
      await knopf.click();
      await page.waitForTimeout(1200);
      feldDa = await page
        .locator('#machine-name-input')
        .isVisible()
        .catch(() => false);
    }

    console.log('\n=== erster Start (leerer Bestand) ===');
    console.log(`„Erste Maschine anlegen"  ${knopfDa ? 'sichtbar' : 'FEHLT'}`);
    console.log(`Namensfeld danach         ${feldDa ? 'sichtbar' : 'NICHT sichtbar'}`);

    pruefe(knopfDa, 'erster Start: „Erste Maschine anlegen" ist im Leerzustand nicht sichtbar');
    pruefe(
      feldDa,
      'erster Start: „Erste Maschine anlegen" führt nicht zum Namensfeld — der Knopf tut nichts'
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
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const cta = page.locator('#empty-state-cta');
    if (await cta.isVisible().catch(() => false)) {
      await cta.click();
      await page.waitForTimeout(1000);
    }

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
    let gebiete = 0;
    let quelle = '';
    let blattDa = false;
    let maschineImBlatt = false;
    let karteZu = false;

    if (inListe) {
      await page.locator('#app-menu-btn').click();
      await page.waitForTimeout(700);
      const zeile = page.locator('.info-sheet-row[data-karte]');
      zeileDa = await zeile.isVisible().catch(() => false);

      if (zeileDa) {
        await zeile.click();
        // Leaflet wird erst jetzt geholt.
        await page.waitForTimeout(2500);

        markerZahl = await page.locator('#customer-map .leaflet-marker-icon').count();
        gruende = await page.locator('#map-basemap-row .map-basemap-btn').count();
        // Die Postleitzahlgebiete als Flächen — das „Deutschlandbild". Zehn
        // einstellige Gebiete auf der Übersichtsstufe. Ohne sie wäre die Karte
        // wieder nur Kacheln mit Punkten darauf.
        gebiete = await page.locator('#customer-map path.leaflet-interactive').count();
        quelle = await page
          .locator('#customer-map .leaflet-control-attribution')
          .first()
          .innerText()
          .catch(() => '');

        if (markerZahl > 0) {
          await page.locator('#customer-map .leaflet-marker-icon').first().click();
          await page.waitForTimeout(800);
          blattDa = await page
            .locator('#customer-sheet')
            .isVisible()
            .catch(() => false);
          const reihe = page.locator('.customer-machine-row', { hasText: 'Pumpe 17' }).first();
          maschineImBlatt = await reihe.isVisible().catch(() => false);

          if (maschineImBlatt) {
            await reihe.click();
            await page.waitForTimeout(1200);
            karteZu = !(await page
              .locator('#customer-map-modal')
              .isVisible()
              .catch(() => true));
          }
        }
      }
    }

    console.log('\n=== Standortkarte ===');
    console.log(`Menüzeile „Standortkarte" ${zeileDa ? 'sichtbar' : 'FEHLT'}`);
    console.log(`Marker auf der Karte      ${markerZahl}`);
    console.log(`Kartengründe              ${gruende}`);
    console.log(`PLZ-Gebiete (Flächen)     ${gebiete}`);
    console.log(
      `Quellenangabe             ${quelle.replace(/\s+/g, ' ').slice(0, 60) || '(leer)'}`
    );
    console.log(`Standortblatt             ${blattDa ? 'sichtbar' : 'NICHT sichtbar'}`);
    console.log(`Maschine im Blatt         ${maschineImBlatt ? 'sichtbar' : 'NICHT sichtbar'}`);
    console.log(`Karte schließt beim Tipp  ${karteZu ? 'ja' : 'nein'}`);

    pruefe(zeileDa, 'Karte: die Menüzeile fehlt, obwohl ein verorteter Standort da ist');
    pruefe(gebiete >= 10, `Karte: nur ${gebiete} Postleitzahlgebiete — das Deutschlandbild fehlt`);
    pruefe(
      markerZahl > 0,
      'Karte: kein Marker — der Standort ist ohne Koordinaten angelegt worden'
    );
    pruefe(gruende === 3, `Karte: ${gruende} statt 3 Kartengründe (Hell · Standard · Satellit)`);
    pruefe(
      quelle.includes('OpenStreetMap'),
      'Karte: die Quellenangabe der Kacheln fehlt — sie ist Bedingung der Nutzung, kein Schmuck'
    );
    pruefe(blattDa, 'Karte: der Marker öffnet kein Standortblatt — er tut nichts');
    pruefe(maschineImBlatt, 'Karte: das Standortblatt zeigt seine Maschinen nicht');
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
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const stufe = await page.evaluate(() =>
      document.documentElement.getAttribute('data-view-level')
    );

    await page.locator('#app-menu-btn').click();
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
    let markerNachEinstieg = 0;

    if (karteImMenue) {
      await page.locator('.info-sheet-row[data-karte]').click();
      // Leaflet plus die Flächendatei.
      await page.waitForTimeout(5000);
      flaechen = await page.locator('#customer-map path.leaflet-interactive').count();
      einstiegDa = await page
        .locator('#map-empty')
        .isVisible()
        .catch(() => false);

      if (einstiegDa) {
        await page.locator('#map-empty-demo-btn').click();
        await page.waitForTimeout(9000);
        markerNachEinstieg = await page.locator('#customer-map .leaflet-marker-icon').count();
      }
    }

    console.log('\n=== Weg hinein (leerer Bestand, Voreinstellung) ===');
    console.log(`Ansichtsstufe             ${stufe}`);
    console.log(`„Standortkarte" im Menü   ${karteImMenue ? 'ja' : 'NEIN'}`);
    console.log(`„Standorte" im Menü       ${kundenImMenue ? 'ja' : 'NEIN'}`);
    console.log(`PLZ-Gebiete ohne Punkte   ${flaechen}`);
    console.log(`Einstieg in der Karte     ${einstiegDa ? 'sichtbar' : 'NICHT sichtbar'}`);
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
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
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
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Die Kategorie liegt hinter der Experten-Stufe (wie die Datenverwaltung
    // direkt daneben) — ohne den Wechsel bliebe die Menüzeile unsichtbar und
    // der Test träfe die falsche Ursache.
    await page.locator('.view-level-btn[data-level="expert"]').first().click();
    await page.waitForTimeout(500);

    await page.locator('#app-menu-btn').click();
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

      await page.locator('.view-level-btn[data-level="expert"]').first().click();
      await page.waitForTimeout(300);
      await page.locator('#app-menu-btn').click();
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
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.locator('.view-level-btn[data-level="expert"]').first().click();
    await page.waitForTimeout(500);
    await page.locator('#app-menu-btn').click();
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
      // Import plus Neuladen der Seite.
      await page.waitForTimeout(3500);
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
  // DIE NEUE SCHALE (Schnitt 2 — docs/nutzerreise-wie-tourfuchs.md)
  //
  // Die Schale hängt vorhandene Abschnitte um, statt sie neu zu bauen. Das
  // ist ihre ganze Sicherheit — und zugleich die Stelle, an der sie still
  // brechen kann: Ein Element, das nach dem Umhängen nicht ankommt, ist
  // einfach weg. Nichts stürzt ab, nichts meldet sich.
  //
  // Gemessen wird deshalb beides, Hinweg und Rückweg:
  //
  //   1. Der Grund trägt die Karte, nicht mehr das Fenster.
  //   2. Der Kopfstreifen trägt Ansichtstiefe UND vier Reiter.
  //   3. Das Blatt steht im leeren Bestand halbhoch, nicht als 46-px-Streifen.
  //   4. Ein Reiterwechsel wechselt wirklich die Tafel.
  //   5. Zurückgeschaltet steht alles wieder da, wo es herkam.
  //
  // Punkt 5 ist der wichtigste. Solange die alte Reise die geprüfte ist, darf
  // der Ausflug in die neue sie nicht beschädigen.
  {
    const ctx = await browser.newContext({
      viewport: FORMATE[0].viewport,
      hasTouch: true,
      isMobile: true,
      locale: 'de-DE',
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('zanobot.schale', 'neu'));
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const an = await page.evaluate(() => ({
      merkmal: document.documentElement.dataset.schale ?? '(aus)',
      grundDa: Boolean(document.getElementById('karten-grund')),
      karteImGrund: Boolean(document.querySelector('#karten-grund #customer-map')),
      tiefeImStreifen: Boolean(document.querySelector('#schale-streifen #depth-switch')),
      reiter: document.querySelectorAll('#schale-streifen .schale-reiter-btn').length,
      rumpfInTafel: Boolean(document.querySelector('#schale-tafel-daten .container')),
      kopfUeberAllem: document.querySelector('.topbar')?.parentElement?.tagName === 'BODY',
      blattHoch: Math.round(
        document.getElementById('schale-blatt')?.getBoundingClientRect().height ?? 0
      ),
      einstieg: document.getElementById('schale-blatt')?.classList.contains('einstieg') ?? false,
    }));

    // Ein Reiterwechsel muss die Tafel wirklich wechseln — sonst sind die
    // Reiter vier Knöpfe, die nichts tun.
    let tafelGewechselt = false;
    if (an.reiter > 0) {
      await page.locator('.schale-reiter-btn[data-reiter="filter"]').click();
      await page.waitForTimeout(400);
      tafelGewechselt = await page.evaluate(
        () =>
          (document.getElementById('schale-tafel-filter')?.classList.contains('active') ?? false) &&
          !(document.getElementById('schale-tafel-daten')?.classList.contains('active') ?? true)
      );
    }

    // Zurückschalten über den Schalter in den Einstellungen — den Weg, den
    // auch ein Mensch geht.
    await page
      .locator('.schale-reiter-btn[data-reiter="daten"]')
      .click()
      .catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('#app-info-btn').click();
    await page.waitForTimeout(700);
    await page.locator('.info-sheet-row[data-thema="ansicht"]').click();
    await page.waitForTimeout(800);
    const schalterDa = await page
      .locator('#schale-toggle')
      .isVisible()
      .catch(() => false);
    if (schalterDa) await page.locator('#schale-toggle').click({ force: true });
    await page.waitForTimeout(1200);

    const zurueck = await page.evaluate(() => ({
      merkmal: document.documentElement.dataset.schale ?? '(aus)',
      grundWeg: !document.getElementById('karten-grund'),
      karteImFenster: Boolean(document.querySelector('#customer-map-modal #customer-map')),
      tiefeImRumpf: Boolean(document.querySelector('.container > #depth-switch')),
      kopfImRumpf: Boolean(document.querySelector('.container > .topbar')),
      rumpfImKoerper: document.querySelector('.container')?.parentElement?.tagName === 'BODY',
    }));

    console.log('\n=== Neue Schale ===');
    console.log(`Merkmal am <html>         ${an.merkmal}`);
    console.log(`Karte im Grund            ${an.karteImGrund ? 'ja' : 'NEIN'}`);
    console.log(`Tiefe im Kopfstreifen     ${an.tiefeImStreifen ? 'ja' : 'NEIN'}`);
    console.log(`Reiter im Streifen        ${an.reiter}`);
    console.log(`Rumpf im Reiter „Daten"   ${an.rumpfInTafel ? 'ja' : 'NEIN'}`);
    console.log(`Kopfleiste über allem     ${an.kopfUeberAllem ? 'ja' : 'NEIN'}`);
    console.log(`Blatt im leeren Bestand   ${an.blattHoch} px (Einstieg: ${an.einstieg})`);
    console.log(`Reiterwechsel             ${tafelGewechselt ? 'wechselt' : 'WECHSELT NICHT'}`);
    console.log(`Schalter in Einstellungen ${schalterDa ? 'sichtbar' : 'FEHLT'}`);
    console.log(`Zurück: Merkmal           ${zurueck.merkmal}`);
    console.log(`Zurück: Karte im Fenster  ${zurueck.karteImFenster ? 'ja' : 'NEIN'}`);
    console.log(`Zurück: Tiefe im Rumpf    ${zurueck.tiefeImRumpf ? 'ja' : 'NEIN'}`);
    console.log(`Zurück: Kopf im Rumpf     ${zurueck.kopfImRumpf ? 'ja' : 'NEIN'}`);

    pruefe(
      an.merkmal === 'neu',
      'Schale: der Schalter steht auf „neu", die Schale läuft aber nicht'
    );
    pruefe(an.karteImGrund, 'Schale: die Karte liegt nicht im Grund — der Grund ist leer');
    pruefe(
      an.tiefeImStreifen,
      'Schale: die Ansichtstiefe ist nicht in den Kopfstreifen gezogen — sie fährt mit dem Blatt aus dem Bild'
    );
    pruefe(an.reiter === 4, `Schale: ${an.reiter} statt 4 Reiter im Kopfstreifen`);
    pruefe(
      an.rumpfInTafel,
      'Schale: der bisherige Rumpf steht nicht im Reiter „Daten" — die ganze bisherige Reise wäre unerreichbar'
    );
    pruefe(an.kopfUeberAllem, 'Schale: die Kopfleiste sitzt noch im Blatt und fährt mit ihm weg');
    pruefe(
      an.einstieg && an.blattHoch > 300,
      `Schale: das Blatt steht im leeren Bestand ${an.blattHoch} px hoch — erwartet halbhoch, sonst sagt beim ersten Start nichts, was zu tun ist`
    );
    pruefe(
      tafelGewechselt,
      'Schale: der Reiterwechsel wechselt die Tafel nicht — die Reiter tun nichts'
    );
    pruefe(schalterDa, 'Schale: der Schalter fehlt in den Einstellungen — es gibt keinen Rückweg');
    pruefe(
      zurueck.merkmal === '(aus)',
      'Schale: zurückgeschaltet bleibt das Merkmal am <html> stehen'
    );
    pruefe(zurueck.grundWeg, 'Schale: zurückgeschaltet bleibt der Grund im Baum stehen');
    pruefe(
      zurueck.karteImFenster,
      'Schale: zurückgeschaltet ist die Karte nicht in ihr Fenster zurückgekehrt — die Kartenzeile im Menü führt ins Leere'
    );
    pruefe(
      zurueck.tiefeImRumpf,
      'Schale: zurückgeschaltet steht die Ansichtstiefe nicht wieder im Rumpf'
    );
    pruefe(
      zurueck.kopfImRumpf,
      'Schale: zurückgeschaltet steht die Kopfleiste nicht wieder im Rumpf'
    );
    pruefe(
      zurueck.rumpfImKoerper,
      'Schale: zurückgeschaltet hängt der Rumpf nicht wieder am Körper'
    );

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DIE KETTE VON DER KARTE IN DIE PRÜFUNG (Schnitt 3)
  //
  //   Marker → Standortblatt → Maschinenzeile → Maschinenblatt → Prüfung
  //
  // Das ist die Reise, um die es in der neuen Schale geht: Der Maschinenknopf
  // im Standort-Popup entspricht TourFuchs' Briefing-Knopf, und dahinter baut
  // sich im semantischen Zoom der Prüfablauf auf (§0c des Papiers).
  //
  // Jedes Glied kann still reißen, und zwei sind es beim Bauen auch:
  //
  //   1. Die Karte kannte ihren freien Bereich nicht. Deutschland lag unter
  //      dem Blatt, die Marker waren nicht anzutippen — die Kette begann
  //      nicht einmal. Gemessen wird deshalb, wo das erste Marker-Symbol
  //      wirklich liegt, nicht ob es existiert.
  //   2. Der letzte Sprung landete in einer eingeklappten Tafel. Getippt,
  //      nichts passiert, die Karte steht unverändert da. Gemessen wird
  //      deshalb, ob der nächste Abschnitt am Ende IM BILD steht.
  {
    const ctx = await browser.newContext({
      viewport: FORMATE[0].viewport,
      hasTouch: true,
      isMobile: true,
      locale: 'de-DE',
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('zanobot.schale', 'neu'));
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Beispieldaten über den Knopf in der leeren Karte — derselbe Weg, den
    // ein Neuling nimmt.
    const einstieg = page.locator('#map-empty-demo-btn');
    if (await einstieg.isVisible().catch(() => false)) {
      await einstieg.click();
      await page.waitForTimeout(8000);
    }

    // JETZT messen, mit noch aufgezogenem Blatt. Genau das ist die Lage, in
    // der es brach: Das Blatt verdeckt 439 von 792 Punkten, und die Karte muss
    // ihren Inhalt in den Rest darüber schieben. Erst danach einklappen —
    // eingeklappt hätte die Messung nichts zu sagen, weil dann ohnehin fast
    // die ganze Fläche frei ist.
    const messeMarker = () =>
      page.evaluate(() => {
        const blatt = document.getElementById('schale-blatt')?.getBoundingClientRect();
        const alle = [...document.querySelectorAll('#customer-map .leaflet-marker-icon')];
        const oberstes = alle.length
          ? Math.min(...alle.map((e) => Math.round(e.getBoundingClientRect().top)))
          : null;
        const grenze = blatt ? blatt.top : window.innerHeight;
        return {
          marker: alle.length,
          einzeln: document.querySelectorAll('#customer-map .customer-marker-wrapper').length,
          stapel: document.querySelectorAll('#customer-map .customer-cluster-wrapper').length,
          oberstesMarkerY: oberstes,
          blattOben: blatt ? Math.round(blatt.top) : null,
          // Nicht das oberste Symbol zählt, sondern das unterste: Rutscht die
          // Karte nach unten, verschwinden zuerst die südlichen Standorte, und
          // das oberste steht weiter unschuldig im Bild.
          hinterDemBlatt: alle.filter((e) => e.getBoundingClientRect().top >= grenze).length,
        };
      });
    const karte = await messeMarker();

    // Das Blatt einklappen: Die Karte ist der Grund, und man sieht sie an.
    await page
      .locator('#schale-griff')
      .click()
      .catch(() => {});
    await page.waitForTimeout(1400);

    // In Stapel hineinzoomen, bis ein einzelner Standort dasteht.
    for (let i = 0; i < 8; i += 1) {
      const einzeln = page.locator('#customer-map .customer-marker-wrapper');
      if ((await einzeln.count()) > 0) {
        await einzeln.first().click({ force: true });
        await page.waitForTimeout(1300);
        break;
      }
      const stapel = page.locator('#customer-map .customer-cluster-wrapper');
      if ((await stapel.count()) === 0) break;
      await stapel.first().click({ force: true });
      await page.waitForTimeout(1400);
    }

    const blattDa = await page
      .locator('#customer-sheet')
      .isVisible()
      .catch(() => false);
    const zeilen = await page.locator('#customer-sheet .customer-machine-row').count();

    let fensterDa = false;
    let knopfText = '(nicht erreicht)';
    if (zeilen > 0) {
      await page.locator('#customer-sheet .customer-machine-row').first().click({ force: true });
      await page.waitForTimeout(1600);
      fensterDa = await page
        .locator('#machine-detail-modal')
        .isVisible()
        .catch(() => false);
      const knopf = page.locator('#machine-detail-select-btn');
      if (await knopf.isVisible().catch(() => false)) {
        knopfText = (await knopf.innerText()).trim();
        await knopf.click({ force: true });
        await page.waitForTimeout(2500);
      }
    }

    const ziel = await page.evaluate(() => {
      const imBild = (id) => {
        const e = document.getElementById(id);
        if (!e) return null;
        const cs = getComputedStyle(e);
        if (cs.display === 'none') return null;
        const r = e.getBoundingClientRect();
        return r.height > 0 && r.top < window.innerHeight && r.bottom > 0
          ? { y: Math.round(r.top), h: Math.round(r.height) }
          : null;
      };
      const sichtbar = (sel) => {
        const e = document.querySelector(sel);
        return Boolean(e) && !e.hidden && getComputedStyle(e).display !== 'none';
      };
      return {
        blattOffen: document.getElementById('schale-blatt')?.classList.contains('offen') ?? false,
        reiter: document.querySelector('.schale-reiter-btn.active')?.dataset.reiter ?? '—',
        aufnahme: imBild('record-reference-content'),
        pruefung: imBild('run-diagnosis-content'),
        // Die Zoomstufe: Leiste statt Reiter, mit dem Namen der Maschine.
        zoomleiste: sichtbar('#schale-zoom'),
        reiterleiste: sichtbar('.schale-reiter'),
        zoomName: document.getElementById('schale-zoom-name')?.textContent?.trim() ?? '',
        // Die Karten des Ablaufs liegen in der Zoomstufe, nicht in den Daten.
        kartenInDerTiefe: Boolean(
          document.querySelector('#schale-tafel-pruefen #card-record') &&
          document.querySelector('#schale-tafel-pruefen #card-check')
        ),
      };
    });
    const naechsterSchritt = ziel.aufnahme ?? ziel.pruefung;

    // Der Weg heraus: „‹ Daten" muss zurück in die Reiter führen.
    await page
      .locator('.schale-zoom-zurueck')
      .click()
      .catch(() => {});
    await page.waitForTimeout(800);
    const heraus = await page.evaluate(() => {
      const sichtbar = (sel) => {
        const e = document.querySelector(sel);
        return Boolean(e) && !e.hidden && getComputedStyle(e).display !== 'none';
      };
      const liste = document.getElementById('erste-schritte');
      return {
        reiterleiste: sichtbar('.schale-reiter'),
        zoomleiste: sichtbar('#schale-zoom'),
        reiter: document.querySelector('.schale-reiter-btn.active')?.dataset.reiter ?? '—',
        // Erste-Schritte-Liste: drei Zeilen, davon die erledigten markiert.
        schritte:
          liste && !liste.hidden ? liste.querySelectorAll('.erste-schritte-zeile').length : 0,
        getan: liste ? liste.querySelectorAll('.erste-schritte-zeile.getan').length : 0,
        standortzeile: sichtbar('#schale-standorte-zeile'),
      };
    });

    // Die Standort-Zeile muss die Einstellungen auf ihr Thema stellen.
    let standortThema = '(nicht erreicht)';
    if (heraus.standortzeile) {
      await page.locator('#schale-standorte-zeile').click({ force: true });
      await page.waitForTimeout(900);
      standortThema = await page.evaluate(
        () => document.querySelector('.settings-list')?.dataset.filter ?? '(kein Filter)'
      );
    }

    console.log('\n=== Kette: Karte → Prüfung ===');
    console.log(`Marker (einzeln/Stapel)   ${karte.einzeln} / ${karte.stapel}`);
    console.log(
      `Marker hinter dem Blatt   ${karte.hinterDemBlatt} von ${karte.marker} (Blatt ab ${karte.blattOben} px)`
    );
    console.log(`Standortblatt             ${blattDa ? 'offen' : 'ZU'}`);
    console.log(`Maschinenzeilen darin     ${zeilen}`);
    console.log(`Maschinenblatt            ${fensterDa ? 'offen' : 'NICHT offen'}`);
    console.log(`Knopf darin               ${knopfText}`);
    console.log(`danach: Blatt             ${ziel.blattOffen ? 'aufgezogen' : 'EINGEKLAPPT'}`);
    console.log(
      `danach: nächster Schritt  ${naechsterSchritt ? `im Bild bei ${naechsterSchritt.y} px` : 'NICHT IM BILD'}`
    );
    console.log(
      `Zoomstufe                 Leiste ${ziel.zoomleiste ? 'da' : 'FEHLT'} · Reiter ${ziel.reiterleiste ? 'DA' : 'weg'} · „${ziel.zoomName}"`
    );
    console.log(
      `Prüfkarten in der Tiefe   ${ziel.kartenInDerTiefe ? 'ja' : 'NEIN (liegen in den Daten)'}`
    );
    console.log(
      `zurück über „‹ Daten"     Reiter ${heraus.reiterleiste ? 'wieder da' : 'FEHLEN'} · aktiv „${heraus.reiter}"`
    );
    console.log(`Erste-Schritte-Liste      ${heraus.schritte} Zeilen, ${heraus.getan} erledigt`);
    console.log(`Standort-Zeile → Thema    ${standortThema}`);

    pruefe(
      karte.marker > 0,
      'Kette: kein Marker auf der Karte — die Beispieldaten kommen im Grund nicht an'
    );
    // Warum 3 und nicht 0: Das aufgezogene Blatt nimmt 55 % der Karte. Was
    // bleibt, reicht für Deutschland gerade so — die Karte kann nicht unter
    // ihre kleinste Stufe, und der Rand um den Bestand (`pad(0.25)`) will auch
    // noch Platz. Null zu verlangen hieße, eine Zusage zu geben, die die
    // Fläche nicht hergibt. Gemessen: ohne Polsterung 9 von 12, mit ihr 2 —
    // die Schwelle liegt weit genug von beiden, um den Rückfall zu fangen,
    // ohne bei jedem Punkt am Rand anzuschlagen.
    pruefe(
      karte.hinterDemBlatt <= 3,
      `Kette: ${karte.hinterDemBlatt} von ${karte.marker} Markern liegen hinter dem aufgezogenen Blatt — die Karte kennt ihren freien Bereich nicht, und diese Standorte sind nicht anzutippen`
    );
    pruefe(blattDa, 'Kette: der Marker öffnet kein Standortblatt');
    pruefe(
      zeilen > 0,
      'Kette: das Standortblatt zeigt keine Maschinenzeile — es gibt keinen Knopf'
    );
    pruefe(fensterDa, 'Kette: die Maschinenzeile öffnet das Maschinenblatt nicht');
    pruefe(
      ziel.blattOffen,
      'Kette: nach dem Knopf bleibt das Blatt eingeklappt — es sieht aus, als sei nichts passiert'
    );
    pruefe(
      Boolean(naechsterSchritt),
      'Kette: der nächste Schritt steht am Ende nicht im Bild — der rote Faden reißt an der letzten Stelle'
    );

    // ── DIE ZOOMSTUFE (Schnitt 4) ────────────────────────────────────────
    pruefe(
      ziel.zoomleiste && !ziel.reiterleiste,
      `Zoomstufe: Reiterleiste ${ziel.reiterleiste ? 'steht noch' : 'weg'}, Zoomleiste ${ziel.zoomleiste ? 'da' : 'fehlt'} — in der Maschine muss die eine an die Stelle der anderen treten, sonst ist unklar, wo man ist`
    );
    pruefe(
      ziel.zoomName.length > 0,
      'Zoomstufe: die Leiste nennt die Maschine nicht — dann ist sie nur ein Zurück-Knopf ohne Auskunft'
    );
    pruefe(
      ziel.kartenInDerTiefe,
      'Zoomstufe: die beiden Karten des Ablaufs liegen nicht in der Prüf-Tafel — dann stehen sie wieder mitten in den Daten, auch ohne gewählte Maschine'
    );
    pruefe(
      heraus.reiterleiste && !heraus.zoomleiste && heraus.reiter === 'daten',
      `Zoomstufe: „‹ Daten" führt nicht zurück (Reiter „${heraus.reiter}", Leiste ${heraus.zoomleiste ? 'noch da' : 'weg'}) — man käme aus der Maschine nicht mehr heraus`
    );

    // ── DER KOPF DES REITERS „DATEN" (Schnitt 4) ─────────────────────────
    pruefe(
      heraus.schritte === 3,
      `Daten: die Erste-Schritte-Liste zeigt ${heraus.schritte} statt 3 Zeilen — der rote Faden ist nicht sichtbar`
    );
    pruefe(
      heraus.getan >= 1,
      'Daten: kein Schritt ist als erledigt markiert, obwohl Maschinen im Bestand stehen — die Liste zeigt keinen Fortschritt, sondern nur eine Anleitung'
    );
    pruefe(
      standortThema === 'standorte',
      `Daten: die Standort-Zeile stellt die Einstellungen auf „${standortThema}" statt „standorte"`
    );

    // ── DER REITER „FLOTTE" (Schnitt 5) ──────────────────────────────────
    //
    // Die beiden Wege aus §0e. Beide gab es schon, beide an prominenter
    // falscher Stelle: der „Flottencheck" als Umschalter MITTEN in der
    // Maschinenliste, der „Schnellvergleich" als Knopf darüber.
    //
    // Gemessen wird, dass der Reiter beides wirklich trägt — und dass der
    // Bestand dabei EINE Liste bleibt, die pendelt, statt einer zweiten,
    // die auseinanderlaufen kann.
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('.schale-reiter-btn[data-reiter="flotte"]').click({ force: true });
    await page.waitForTimeout(2000);

    const flotte = await page.evaluate(() => {
      const tafel = document.getElementById('schale-tafel-flotte');
      const sichtbar = (sel) => {
        const e = document.querySelector(sel);
        return Boolean(e) && e.getBoundingClientRect().height > 0;
      };
      return {
        bestandInFlotte: Boolean(tafel?.querySelector('#machine-overview-section')),
        schnellvergleichInFlotte: Boolean(tafel?.querySelector('#quick-compare-cta')),
        schnellvergleichSichtbar: sichtbar('#schale-tafel-flotte #quick-compare-cta'),
        umschalterSichtbar: sichtbar('.workflow-toggle-row'),
        flottenzeilen: document.querySelectorAll('#machine-overview .fleet-rank-item').length,
        reihenzeilen: document.querySelectorAll('#machine-overview .machine-item').length,
        kopf: document.querySelector('#machine-overview .fleet-header-title')?.textContent ?? '',
        saetze: document.querySelectorAll('#schale-tafel-flotte .schale-flotten-satz').length,
      };
    });

    await page.locator('.schale-reiter-btn[data-reiter="daten"]').click({ force: true });
    await page.waitForTimeout(2000);
    const zurueckInDaten = await page.evaluate(() => ({
      bestandInDaten: Boolean(
        document.querySelector('#schale-tafel-daten #machine-overview-section')
      ),
      reihenzeilen: document.querySelectorAll('#machine-overview .machine-item').length,
      // Eine zweite Liste wäre eine zweite Wahrheit. Es darf sie nicht geben.
      listen: document.querySelectorAll('#machine-overview').length,
    }));

    console.log('\n=== Reiter „Flotte" ===');
    console.log(`Bestand im Reiter         ${flotte.bestandInFlotte ? 'ja' : 'NEIN'}`);
    console.log(`nach Flotten gruppiert    ${flotte.flottenzeilen} Zeilen · „${flotte.kopf}"`);
    console.log(
      `Schnellvergleich          ${flotte.schnellvergleichSichtbar ? 'sichtbar' : 'NICHT sichtbar'}`
    );
    console.log(`alter Umschalter          ${flotte.umschalterSichtbar ? 'STEHT NOCH' : 'weg'}`);
    console.log(`erklärende Sätze          ${flotte.saetze}`);
    console.log(
      `zurück: Bestand in Daten  ${zurueckInDaten.bestandInDaten ? 'ja' : 'NEIN'} · ${zurueckInDaten.reihenzeilen} Zeilen · ${zurueckInDaten.listen} Liste(n)`
    );

    pruefe(
      flotte.bestandInFlotte,
      'Flotte: der Bestand zieht nicht in den Reiter — dann ist dort nichts, woraus man eine Flotte wählen könnte'
    );
    pruefe(
      flotte.flottenzeilen >= 2 && flotte.reihenzeilen === 0,
      `Flotte: ${flotte.flottenzeilen} Flottenzeilen und ${flotte.reihenzeilen} Reihenzeilen — im Reiter „Flotte" muss die Liste nach Flotten gruppiert sein, sonst tut der Reiter nichts`
    );
    pruefe(
      flotte.kopf.trim().length > 0,
      'Flotte: die Liste nennt die Flotte nicht — man sieht Maschinen und weiß nicht, welche Flotte das ist'
    );
    pruefe(
      flotte.schnellvergleichSichtbar,
      'Flotte: der Schnellvergleich fehlt — der zweite Weg aus §0e (Flotte ohne Bestand) ist nicht da'
    );
    pruefe(
      !flotte.umschalterSichtbar,
      'Flotte: der alte Umschalter „Übersicht / Flottencheck" steht noch in der Liste — zwei Bedienelemente für denselben Zustand'
    );
    pruefe(flotte.saetze === 2, `Flotte: ${flotte.saetze} statt 2 erklärende Sätze`);
    pruefe(
      zurueckInDaten.bestandInDaten && zurueckInDaten.reihenzeilen > 0,
      'Flotte: der Bestand kommt nicht als Reihe in die Daten zurück — der Reiterwechsel lässt ihn gruppiert stehen'
    );
    pruefe(
      zurueckInDaten.listen === 1,
      `Flotte: ${zurueckInDaten.listen} Maschinenlisten im Baum — eine zweite Liste wäre eine zweite Wahrheit`
    );

    await ctx.close();
  }
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
