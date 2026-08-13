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

const require = createRequire(import.meta.url);

const FREI = process.argv.includes('--frei');

/**
 * Zwei Maße genügen: das Handy (der Ort, an dem Zanobo benutzt wird) und der
 * Schreibtisch (der Ort, an dem es eingerichtet wird).
 */
const FORMATE = [
    { name: 'smartphone', viewport: { width: 390, height: 844 }, touch: true },
    { name: 'desktop', viewport: { width: 1440, height: 900 }, touch: false }
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
    einstellungenExperte: 52
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
        ['Fusszeile', '.footer']
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
        detached: false
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
    console.error('Playwright fehlt. Einmalig:  npm i -D playwright && npx playwright install chromium');
    process.exit(1);
}

const browser = await chromium.launch(chromiumPfad());

try {
    for (const format of FORMATE) {
        const ctx = await browser.newContext({
            viewport: format.viewport,
            hasTouch: format.touch,
            isMobile: format.touch,
            locale: 'de-DE'
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

        // Einstellungen: der globale Komplexitätsschalter liegt hier drin.
        await page.click('#settings-btn');
        await page.waitForTimeout(1000);
        const basis = await page.evaluate(SICHTBAR_PROBE);
        console.log(`Einstellungen Basis ${String(basis.bedienelemente).padStart(3)}   davon im Dialog ${basis.imModal}`);
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
