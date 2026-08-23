/**
 * DER REIHEN-LAUF — was sagt das Ergebnis einer Reihe?
 *
 * Eine einzelne Prüfung beantwortet: „Klingt diese Maschine wie ihr eigener
 * Normalzustand?" Der Flottenlauf beantwortet eine andere Frage: „Welche
 * dieser gleichartigen Maschinen fällt aus der Reihe?" Das ist keine
 * Wiederholung der ersten Frage, sondern eine zweite — und sie braucht eine
 * eigene Antwort.
 *
 * Dieser Lauf misst, in welcher Sprache diese Antwort gegeben wird. Er kürzt
 * einen Flottenstandort der Beispieldaten auf zwei Maschinen, nimmt für beide
 * einen Normalzustand auf und lässt dann den Flottenlauf über beide laufen.
 * Am Ende liest er, was dasteht.
 *
 * Ausgeführt wird gegen `dist/` — also vorher `npm run build`.
 *
 *   npm run reihe
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

const freierPort = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.on('error', rej);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

const port = await freierPort();
const vorschau = spawn(
  'npx',
  ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
  { stdio: 'ignore' }
);
await new Promise((r) => setTimeout(r, 4000));

const arbeitsordner = mkdtempSync(join(tmpdir(), 'reihe-'));
const klangDatei = join(arbeitsordner, 'maschine.wav');
schreibeKlang(klangDatei);
const profil = join(arbeitsordner, 'profil');

/**
 * Wie viele Knöpfe am Ende einer Reihe stehen dürfen.
 *
 * Gemessen am 23.08.2026: fünf — „Verlauf anzeigen", „Bericht exportieren",
 * „Weiter", „Ergebnisse speichern", „Verwerfen". Drei davon taten dasselbe.
 * Vier sind es jetzt: einer hinaus, zwei, die etwas mit dem Ergebnis tun, und
 * einer, der es wegwirft.
 */
const BUDGET_KNOEPFE = 4;

const befunde = [];
const pruefe = (bedingung, text) => {
  console.log(`${bedingung ? '✓' : '✗'} ${text}`);
  if (!bedingung) befunde.push(text);
};

async function starte() {
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
  page.on('pageerror', (e) => console.log('  ! Seitenfehler:', e.message));
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  return { ctx, page };
}

/** Genau ein Standort mit genau zwei gleichartigen Maschinen. */
async function aufZweiKuerzen(page) {
  return page.evaluate(async () => {
    const db = await new Promise((r, j) => {
      const x = indexedDB.open('zanobot-db');
      x.onsuccess = () => r(x.result);
      x.onerror = () => j(x.error);
    });
    const alle = await new Promise((r, j) => {
      const q = db.transaction('machines').objectStore('machines').getAll();
      q.onsuccess = () => r(q.result);
      q.onerror = () => j(q.error);
    });
    const proStandort = new Map();
    for (const m of alle) {
      if (!m.customerId) continue;
      proStandort.set(m.customerId, [...(proStandort.get(m.customerId) ?? []), m]);
    }
    const flotte = [...proStandort.entries()].find(([, ms]) => ms.length === 4);
    if (!flotte) return null;
    const [standortId, maschinen] = flotte;
    const sortiert = [...maschinen].sort((a, b) => a.name.localeCompare(b.name));
    await new Promise((r, j) => {
      const tx = db.transaction('machines', 'readwrite');
      for (const m of sortiert.slice(2)) tx.objectStore('machines').delete(m.id);
      for (const m of alle)
        if (m.customerId !== standortId) tx.objectStore('machines').delete(m.id);
      tx.oncomplete = () => r();
      tx.onerror = () => j(tx.error);
    });
    const kunden = await new Promise((r, j) => {
      const q = db.transaction('customers').objectStore('customers').getAll();
      q.onsuccess = () => r(q.result);
      q.onerror = () => j(q.error);
    });
    await new Promise((r, j) => {
      const tx = db.transaction('customers', 'readwrite');
      for (const k of kunden) if (k.id !== standortId) tx.objectStore('customers').delete(k.id);
      tx.oncomplete = () => r();
      tx.onerror = () => j(tx.error);
    });
    return {
      standortId,
      flotte: sortiert[0].fleetGroup,
      namen: sortiert.slice(0, 2).map((m) => m.name),
    };
  });
}

/** Karte → der eine Standort. */
async function zumStandort(page) {
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
  await page.waitForTimeout(1800);
}

/**
 * Für DIESE Maschine einen Normalzustand aufnehmen — ausgewählt am Namen.
 *
 * Nicht an der Listenstelle: Die Liste sortiert nach Lage, und sobald die
 * erste Maschine einen Normalzustand hat, steht an Stelle 0 wieder dieselbe.
 * Der erste Versuch nahm deshalb zweimal denselben Normalzustand auf und
 * meldete anschließend „nur 1 von 2".
 */
async function normalzustandFuer(page, name) {
  await aufDenStandort(page);
  const zeile = page.locator('.standort-maschine', { hasText: name }).first();
  await zeile.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  await zeile.click({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2200);
  const gelandet = await page.evaluate(() => ({
    name: document.querySelector('.maschine-kopf h2')?.textContent?.trim() ?? '(keine)',
    aktion: document.querySelector('.maschine-aktion')?.textContent?.trim() ?? '(keine)',
  }));
  console.log(`  → ${name}: gelandet bei „${gelandet.name}", Handlung „${gelandet.aktion}"`);
  await page
    .waitForFunction(
      () => {
        const b = document.querySelector('.maschine-aktion');
        return Boolean(b) && b.getBoundingClientRect().height > 0 && !b.disabled;
      },
      null,
      { timeout: 60000 }
    )
    .catch(() => {});
  await page.evaluate(() => document.querySelector('.maschine-aktion')?.click());
  await page
    .waitForFunction(
      () => {
        const b = document.getElementById('record-btn');
        return Boolean(b) && b.getBoundingClientRect().height > 0 && !b.disabled;
      },
      null,
      { timeout: 60000 }
    )
    .catch(() => {});
  await page.evaluate(() => document.getElementById('record-btn')?.click());
  await page
    .waitForFunction(() => Boolean(document.querySelector('.maschine-fingerabdruck')), null, {
      timeout: 120000,
    })
    .catch(() => {});
  // Nach dem Speichern zieht die App selbst noch einmal auf die Maschinenseite
  // („Normalzustand gespeichert" → Fingerabdruck zeigen). Erst wenn das durch
  // ist, lohnt der Rückweg — sonst geht man zurück und wird zurückgeholt.
  await page.waitForTimeout(3500);
}

/**
 * Auf die Standortebene, und zwar sicher.
 *
 * Zwei Anläufe waren falsch. Ein fester Zeitwert reichte nicht. Und die Zahl
 * der Maschinenzeilen zu zählen war schlimmer als nutzlos: Die Standortansicht
 * bleibt im Baum stehen, wenn die Maschinenseite darüber liegt —
 * `querySelectorAll` findet ihre Zeilen weiterhin, auch verborgen. Der Wächter
 * glaubte, er sei auf dem Standort, tippte auf eine unsichtbare Zeile und
 * meldete anschließend „nur 1 von 2", als läge es am Produkt.
 *
 * Gefragt wird deshalb nach SICHTBARKEIT — der einzigen Eigenschaft, die für
 * einen Menschen den Unterschied macht.
 */
async function aufDenStandort(page) {
  for (let versuch = 0; versuch < 6; versuch += 1) {
    const sichtbar = await page
      .locator('.standort-maschine')
      .first()
      .isVisible()
      .catch(() => false);
    if (sichtbar) return;
    await page.evaluate(() => document.querySelector('.tiefe-zurueck')?.click());
    await page.waitForTimeout(2000);
  }
}

try {
  const { ctx, page } = await starte();
  const standort = await aufZweiKuerzen(page);
  if (!standort) {
    console.log('Kein Flottenstandort in den Beispieldaten — Lauf abgebrochen.');
    process.exit(1);
  }
  console.log(`Flotte „${standort.flotte}": ${standort.namen.join(' und ')}\n`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  await zumStandort(page);

  console.log('=== Normalzustände aufnehmen ===');
  for (const name of standort.namen) await normalzustandFuer(page, name);
  const bereit = await page.evaluate(async () => {
    const db = await new Promise((r, j) => {
      const x = indexedDB.open('zanobot-db');
      x.onsuccess = () => r(x.result);
      x.onerror = () => j(x.error);
    });
    const alle = await new Promise((r, j) => {
      const q = db.transaction('machines').objectStore('machines').getAll();
      q.onsuccess = () => r(q.result);
      q.onerror = () => j(q.error);
    });
    return alle.filter((m) => (m.referenceModels ?? []).length > 0).length;
  });
  console.log(`  Maschinen mit Normalzustand  ${bereit}`);
  pruefe(bereit === 2, `nur ${bereit} von 2 Maschinen haben einen Normalzustand`);

  // ── Der Weg hinein ─────────────────────────────────────────────────────
  //
  // Gemessen am 23.08.2026: Die Standortseite bot die Maschinenliste und
  // „Neue Maschine anlegen" — mehr nicht. Der Flottenlauf war von dort aus
  // überhaupt nicht erreichbar; die Ebene, auf der sein Startknopf liegt,
  // öffnete nur, wer eine Maschine anlegen wollte. Die eine Funktion, die
  // „welche dieser vier fällt auf?" beantwortet, ließ sich an dem Ort, an dem
  // diese vier stehen, nicht starten.
  console.log('\n=== Der Weg in die Reihe ===');
  // Erst wirklich hingehen. Die Standortansicht bleibt im Baum stehen, während
  // die Maschinenseite darüber liegt — wer von dort aus misst, misst den Stand
  // von vorhin.
  await aufDenStandort(page);
  const amStandort = await page.evaluate(() => {
    const sichtbar = (e) => {
      const cs = getComputedStyle(e);
      return (
        cs.display !== 'none' && cs.visibility !== 'hidden' && e.getBoundingClientRect().height > 0
      );
    };
    const knopf = [...document.querySelectorAll('.standort-reihe')].find(sichtbar) ?? null;
    return {
      knopf: knopf?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      hoch: knopf ? Math.round(knopf.getBoundingClientRect().height) : 0,
      imBild: knopf ? knopf.getBoundingClientRect().bottom <= window.innerHeight : false,
      angebote: [...document.querySelectorAll('.standort-ansicht > button')]
        .filter(sichtbar)
        .map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
    };
  });
  console.log(`  Angebote am Standort      ${amStandort.angebote.join(' · ') || '(keine)'}`);
  console.log(`  Weg in die Reihe          ${amStandort.knopf || 'FEHLT'}`);
  pruefe(
    amStandort.knopf.length > 0,
    'am Standort führt kein Weg in die Reihe — die Funktion, die „welche fällt auf?" beantwortet, ist dort nicht startbar'
  );
  pruefe(
    amStandort.hoch === 0 || amStandort.hoch >= 44,
    `der Weg in die Reihe ist ${amStandort.hoch} px hoch`
  );
  pruefe(
    amStandort.knopf.length === 0 || amStandort.imBild,
    'der Weg in die Reihe steht nicht ohne Scrollen im Bild'
  );

  console.log('\n=== Der Flottenlauf ===');
  let start = '';
  if (amStandort.knopf) {
    await page.evaluate(() => document.querySelector('.standort-reihe')?.click());
    await page.waitForTimeout(2500);
    start = amStandort.knopf;
  } else {
    // Umweg, damit der Rest trotzdem gemessen werden kann: über das Anlegen
    // in die Bestandsebene, dort auf den Flotten-Reiter. Das ist KEIN Weg,
    // den ein Mensch findet — deshalb steht der Befund oben.
    await page.evaluate(() => document.querySelector('.standort-neue-maschine')?.click());
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.getElementById('toggle-fleet')?.click());
    await page.waitForTimeout(2500);
    start = await page.evaluate(() => {
      const b = document.querySelector('.fleet-check-all-btn');
      if (!b) return '';
      b.click();
      return b.textContent.trim();
    });
    console.log(`  (Umweg über den Bestand)  ${start || 'auch dort kein Startknopf'}`);
  }
  pruefe(start.length > 0, 'der Flottenlauf lässt sich nirgends starten');

  // Zwei Maschinen durchspielen: Ansage → Aufnahme → Stopp.
  for (let i = 0; i < 2; i += 1) {
    await page
      .waitForFunction(() => Boolean(document.querySelector('.fleet-guided-start-btn')), null, {
        timeout: 60000,
      })
      .catch(() => {});
    const ansage = await page.evaluate(() => {
      const p = document.getElementById('fleet-guided-prompt');
      return p ? p.textContent.replace(/\s+/g, ' ').trim() : '';
    });
    console.log(`  Ansage ${i + 1}                 ${ansage || '(fehlt)'}`);
    await page.evaluate(() => document.querySelector('.fleet-guided-start-btn')?.click());
    await page.waitForTimeout(9000);
    await page.evaluate(() => document.getElementById('inspection-stop-btn')?.click());
    await page.waitForTimeout(9000);
  }

  // ── Was am Ende dasteht ────────────────────────────────────────────────
  await page
    .waitForFunction(() => Boolean(document.querySelector('.fleet-result-modal')), null, {
      timeout: 60000,
    })
    .catch(() => {});
  await page.waitForTimeout(1500);
  const ergebnis = await page.evaluate(() => {
    const modal = document.querySelector('.fleet-result-modal');
    if (!modal) return null;
    const text = (sel) => modal.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return {
      imFenster: true,
      titel: text('.fleet-result-header h3'),
      banner: text('.fleet-result-status-title'),
      unterzeile: text('.fleet-result-status-subtitle'),
      kennzahlen: [...modal.querySelectorAll('.fleet-result-stats')]
        .map((e) => e.textContent.replace(/\s+/g, ' ').trim())
        .join(' | '),
      rangliste: [...modal.querySelectorAll('.fleet-result-ranking > *')]
        .slice(1)
        .map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      knoepfe: [...modal.querySelectorAll('.fleet-result-actions button')].map((b) =>
        b.textContent.replace(/\s+/g, ' ').trim()
      ),
      satz: text('.reihe-satz'),
      bedeutung: text('.reihe-bedeutung'),
      beleg: text('.reihe-beleg'),
      primaer: [...modal.querySelectorAll('.fleet-result-btn-save')].filter(
        (b) => getComputedStyle(b).display !== 'none'
      ).length,
      ebene: document.body.className.match(/tiefe-\w+/g)?.join(' ') ?? '(keine)',
    };
  });

  if (!ergebnis) {
    pruefe(false, 'am Ende des Flottenlaufs steht gar kein Ergebnis');
  } else {
    console.log('\n=== Das Ergebnis der Reihe ===');
    console.log(`  steht in einem Fenster    ${ergebnis.imFenster ? 'ja' : 'nein'}`);
    console.log(`  Titel                     ${ergebnis.titel || '(leer)'}`);
    console.log(`  Banner                    ${ergebnis.banner || '(leer)'}`);
    console.log(`  Unterzeile                ${ergebnis.unterzeile || '(leer)'}`);
    console.log(`  Kennzahlen                ${ergebnis.kennzahlen || '(keine)'}`);
    console.log(`  Satz                      ${ergebnis.satz || '(FEHLT)'}`);
    console.log(`  was das heißt             ${ergebnis.bedeutung || '(entfällt)'}`);
    console.log(`  Beleg                     ${ergebnis.beleg || '(FEHLT)'}`);
    for (const [i, z] of ergebnis.rangliste.entries())
      console.log(`  Rang ${i + 1}                    ${z}`);
    console.log(`  Knöpfe                    ${ergebnis.knoepfe.join(' · ') || '(keine)'}`);

    /**
     * Die Frage der Reihe ist „welche fällt auf?", und die Antwort gehört in
     * einen Satz — so, wie die Einzelprüfung „Die Messung klingt wie der
     * Normalzustand." sagt und die Zahl daneben als Beleg führt.
     */
    pruefe(
      ergebnis.satz.length > 0,
      'die Reihe sagt ihr Ergebnis nicht in einem Satz — nur Kennzahlen'
    );

    /**
     * ── DIE ZWEIERREIHE SAGT, DASS SIE NICHTS SAGEN KANN ──────────────────
     *
     * Dieser Lauf prüft genau zwei Maschinen, und bei zweien kann
     * `Median − 2·MAD` rechnerisch niemanden finden: Der Median liegt zwischen
     * beiden, beide weichen gleich weit ab, die Schwelle fällt unter beide.
     *
     * „Keine fällt aus der Reihe" wäre hier ein wahrer Satz, der nichts
     * gemessen hat — und bei 40 % gegen 92 % legte er das Gegenteil dessen
     * nahe, was dasteht. Gefunden beim Falsifizieren: Ein erzwungener
     * Ausreißer erschien nicht, weil er nicht erscheinen kann.
     */
    pruefe(
      /mindestens/i.test(ergebnis.satz) || /drei|3/.test(ergebnis.satz),
      `die Zweierreihe behauptet ein Ergebnis, das sie nicht haben kann — „${ergebnis.satz}"`
    );
    pruefe(
      ergebnis.bedeutung.length > 0,
      'die Zweierreihe sagt nicht, was stattdessen gilt — jede Maschine steht mit ihrem eigenen Ergebnis auf ihrer Seite'
    );

    /**
     * Und zwar in Alltagssprache: keine Kennzahl als Aussage, keine Ursache.
     * „Median" und „Spannweite" beantworten die Frage nicht, sie liefern das
     * Material, aus dem man sie beantworten könnte.
     */
    pruefe(
      !/median|spannweite|schlechteste/i.test(ergebnis.satz),
      `der Satz führt eine Kennzahl statt einer Auskunft — „${ergebnis.satz}"`
    );
    pruefe(
      !/defekt|kaputt|schaden|lager|unwucht/i.test([ergebnis.satz, ergebnis.bedeutung].join(' ')),
      `die Reihe nennt eine Ursache — „${ergebnis.satz} ${ergebnis.bedeutung}"`
    );

    /**
     * Der Beleg steht UNTER dem Satz, nicht statt seiner: wie viele geprüft
     * wurden und in welcher Spanne sie liegen.
     */
    pruefe(
      /\d+\s*von\s*\d+/.test(ergebnis.beleg),
      `unter dem Satz steht nicht, wie viele geprüft wurden — „${ergebnis.beleg}"`
    );

    /**
     * Drei der fünf Knöpfe taten dasselbe — das Fenster schließen. „Speichern"
     * speicherte nichts (die Ergebnisse liegen längst in der Ablage), „Weiter"
     * schloss ebenfalls, und das × oben rechts zum dritten Mal.
     */
    pruefe(
      ergebnis.knoepfe.length <= BUDGET_KNOEPFE,
      `${ergebnis.knoepfe.length} Knöpfe am Ende der Reihe (Budget ${BUDGET_KNOEPFE}) — ${ergebnis.knoepfe.join(', ')}`
    );
    pruefe(
      ergebnis.primaer === 1,
      `${ergebnis.primaer} dominante Handlungen am Ende der Reihe statt genau einer`
    );

    /** Und der Weg hinaus führt dorthin zurück, wo die Reihe begann. */
    await page.evaluate(() => document.querySelector('.fleet-result-btn-save')?.click());
    await page.waitForTimeout(2500);
    const danach = await page.evaluate(() => ({
      ebene: document.body.className.match(/tiefe-\w+/g)?.join(' ') ?? '(keine)',
      zeilen: document.querySelectorAll('.standort-maschine').length,
      fenster: document.querySelectorAll('.fleet-result-modal').length,
    }));
    console.log(`  „Fertig" führt nach       ${danach.ebene} · ${danach.zeilen} Maschinenzeilen`);
    pruefe(danach.fenster === 0, 'das Fenster der Reihe geht nicht zu');
    pruefe(
      danach.zeilen >= 2,
      `nach der Reihe steht nicht der Standort da, von dem sie ausging — ${danach.ebene}`
    );
  }

  await ctx.close();
} finally {
  vorschau.kill();
}

console.log(befunde.length ? `\n${befunde.length} Befunde.` : '\nDie Reihe sagt, was sie fand.');
process.exit(befunde.length ? 1 : 0);
