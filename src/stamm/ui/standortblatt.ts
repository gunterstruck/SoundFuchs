/**
 * DAS BLATT AUF DER STANDORTEBENE
 *
 * Die eine offene Frage aus §7g: Karte → „Standorte" und „Filter", Maschine →
 * „2D", „3D", „Briefing" — und dazwischen? Dort standen weiter die
 * Kartenreiter, und das war genauso falsch wie auf der Maschinenebene.
 *
 * Der Auftraggeber hat entschieden: **Verlauf und das letzte Reihenergebnis.**
 *
 * ## Warum das zusammengehört
 *
 * Wer an einem Standort steht, hat zwei Fragen, die die Liste oben nicht
 * beantwortet:
 *
 *   „Was ist hier zuletzt passiert?"       → der Verlauf
 *   „Fällt eine aus der Reihe?"            → der Reihenbefund
 *
 * Beides will man nicht immer sehen. Genau dafür gibt es das Blatt: Es liegt
 * unten, und wer es braucht, zieht es auf.
 *
 * ## Was „letztes Reihenergebnis" hier heißt
 *
 * Nicht: das gespeicherte Ergebnis eines vergangenen Flottenlaufs — ein
 * solches gibt es nicht, gespeichert werden die einzelnen Prüfungen. Sondern:
 * derselbe Befund, aus den **aktuellen** letzten Werten der Reihe gerechnet.
 *
 * Das ist die ehrlichere Auskunft. Ein konserviertes Ergebnis von gestern
 * behauptete einen Stand, den zwei Prüfungen von heute längst überholt haben.
 * Gerechnet wird mit `reihenbefund` — derselben Funktion, die am Ende eines
 * Flottenlaufs urteilt. Zwei Rechenwege für dieselbe Aussage wären zwei
 * Wahrheiten.
 */

import { getDiagnosesForMachine, getMachinesForCustomer } from '@data/db.js';
import type { DiagnosisResult, Machine } from '@data/types.js';
import { t } from '../../i18n/index.js';
import { nameNennen, reihenbefund, VERGLEICHBAR_AB } from '../maschine/reihe.js';
import { farbeFuerZustand } from '../features/standortmarker.js';
import { zustandZuWert } from '../../services/bestandsuebersicht.js';

const PLATZ_ID = 'tab-standortblatt';

/** Wie viele Zeilen der Verlauf zeigt. */
const ZEILEN = 12;

export interface StandortblattDeps {
  /** Eine Maschine öffnen — dieselbe Tür wie aus der Liste. */
  zeigeMaschine: (machine: Machine) => void;
}

let deps: StandortblattDeps | null = null;
/** Für welchen Standort das Blatt gerade steht — damit es nicht doppelt lädt. */
let gezeigt: string | null = null;

function platz(): HTMLElement | null {
  return document.getElementById(PLATZ_ID);
}

/** Wann war das — in Worten. Dieselben Schlüssel wie überall sonst. */
function vorWieLange(zeitpunkt: number): string {
  const minuten = Math.max(0, Math.round((Date.now() - zeitpunkt) / 60000));
  if (minuten < 2) return t('site.justNow');
  if (minuten < 60) return t('site.agoMinutes', { count: String(minuten) });
  const stunden = Math.round(minuten / 60);
  if (stunden < 24) return t('site.agoHours', { count: String(stunden) });
  return t('site.agoDays', { count: String(Math.round(stunden / 24)) });
}

function ueberschrift(text: string): HTMLElement {
  const h = document.createElement('h3');
  h.className = 'standortblatt-titel';
  h.textContent = text;
  return h;
}

/**
 * Der Reihenbefund — in demselben Satz wie am Ende eines Flottenlaufs.
 *
 * Auch hier gilt die Grenze des Verfahrens: Unter drei geprüften Maschinen
 * kann `Median − 2·MAD` rechnerisch niemanden finden. Dann steht das da,
 * statt eines wahren Satzes, der nichts gemessen hat.
 */
function reihenblock(
  name: string,
  glieder: Array<{ id: string; name: string; wert: number | null }>
): HTMLElement {
  const kasten = document.createElement('div');
  kasten.className = 'standortblatt-reihe';

  const befund = reihenbefund(glieder);
  const auffaellig = befund.auffaellige.length > 0;
  if (auffaellig) kasten.style.borderLeftColor = farbeFuerZustand('warnung');

  const kopf = document.createElement('p');
  kopf.className = 'standortblatt-reihe-name';
  kopf.textContent = name;
  kasten.appendChild(kopf);

  const satz = document.createElement('p');
  satz.className = 'standortblatt-reihe-satz';
  satz.textContent = auffaellig
    ? t(befund.auffaellige.length === 1 ? 'reihe.faelltAuf' : 'reihe.fallenAuf', {
        name: nameNennen(
          befund.auffaellige.map((g) => g.name),
          t('reihe.und'),
          (n) => t('reihe.undWeitere', { count: String(n) })
        ),
      })
    : befund.vergleichbar
      ? t('reihe.keineFaelltAuf', { count: String(befund.geprueft) })
      : t('reihe.zuWenige', { count: String(VERGLEICHBAR_AB) });
  kasten.appendChild(satz);

  if (befund.spanne) {
    const beleg = document.createElement('p');
    beleg.className = 'standortblatt-reihe-beleg';
    beleg.textContent = t('reihe.belegSpanne', {
      von: String(Math.round(befund.spanne.von)),
      bis: String(Math.round(befund.spanne.bis)),
    });
    kasten.appendChild(beleg);
  }
  return kasten;
}

/** Eine Zeile des Verlaufs: welche Maschine, wie klang sie, wann. */
function verlaufszeile(maschine: Machine, d: DiagnosisResult): HTMLElement {
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'near-row standortblatt-zeile';

  const punkt = document.createElement('span');
  punkt.className = 'near-dot';
  punkt.style.background = farbeFuerZustand(zustandZuWert(d.healthScore));
  punkt.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'standortblatt-zeile-text';

  const name = document.createElement('span');
  name.className = 'near-name';
  name.textContent = maschine.name;

  const wann = document.createElement('span');
  wann.className = 'standortblatt-zeile-wann';
  // Derselbe Schlüssel wie auf der Maschinenseite: „Ähnlichkeit 87 % · vor
  // 3 Tagen". Eine zweite Formulierung wäre eine zweite Behauptung über
  // denselben Sachverhalt.
  wann.textContent = t('maschine.aehnlichkeit', {
    wert: String(Math.round(d.healthScore)),
    wann: vorWieLange(d.timestamp),
  });

  text.append(name, wann);
  knopf.append(punkt, text);
  knopf.addEventListener('click', () => deps?.zeigeMaschine(maschine));
  return knopf;
}

/**
 * Das Blatt für diesen Standort füllen.
 *
 * Lädt die Prüfungen aller Maschinen des Standorts. Das ist ein Lesevorgang je
 * Maschine — vertretbar, weil es erst geschieht, wenn jemand den Standort
 * öffnet, und weil die Standortansicht darüber ohnehin schon steht.
 */
export async function standortblattFuellen(standortId: string | null): Promise<void> {
  const ziel = platz();
  if (!ziel) return;
  if (!standortId) {
    gezeigt = null;
    ziel.replaceChildren();
    return;
  }
  if (gezeigt === standortId && ziel.childElementCount > 0) return;
  gezeigt = standortId;

  const maschinen = await getMachinesForCustomer(standortId);
  const proMaschine = await Promise.all(
    maschinen.map(async (m) => ({ maschine: m, pruefungen: await getDiagnosesForMachine(m.id) }))
  );
  // Zwischen Laden und Zeichnen kann der Nutzer weitergezogen sein.
  if (gezeigt !== standortId) return;

  ziel.replaceChildren();

  // ── Die Reihen ─────────────────────────────────────────────────────────
  const gruppen = new Map<string, Array<{ id: string; name: string; wert: number | null }>>();
  for (const { maschine, pruefungen } of proMaschine) {
    if (!maschine.fleetGroup) continue;
    gruppen.set(maschine.fleetGroup, [
      ...(gruppen.get(maschine.fleetGroup) ?? []),
      { id: maschine.id, name: maschine.name, wert: pruefungen[0]?.healthScore ?? null },
    ]);
  }
  const reihen = [...gruppen.entries()]
    .filter(([, glieder]) => glieder.length >= 2)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (reihen.length > 0) {
    ziel.appendChild(ueberschrift(t('standortblatt.reihen')));
    for (const [name, glieder] of reihen) {
      // Der Ort steht im Flottennamen, und man steht gerade dort.
      ziel.appendChild(reihenblock(name.split(' · ')[0] || name, glieder));
    }
  }

  // ── Der Verlauf ────────────────────────────────────────────────────────
  const alle = proMaschine
    .flatMap(({ maschine, pruefungen }) => pruefungen.map((d) => ({ maschine, d })))
    .sort((a, b) => b.d.timestamp - a.d.timestamp);

  ziel.appendChild(ueberschrift(t('standortblatt.verlauf')));
  if (alle.length === 0) {
    const leer = document.createElement('p');
    leer.className = 'blatt-leer';
    leer.textContent = t('standortblatt.nochNichts');
    ziel.appendChild(leer);
    return;
  }

  const liste = document.createElement('ul');
  liste.className = 'near-list standortblatt-liste';
  for (const { maschine, d } of alle.slice(0, ZEILEN)) {
    const li = document.createElement('li');
    li.appendChild(verlaufszeile(maschine, d));
    liste.appendChild(li);
  }
  ziel.appendChild(liste);

  if (alle.length > ZEILEN) {
    const mehr = document.createElement('p');
    mehr.className = 'standortblatt-mehr';
    mehr.textContent = t('standortblatt.undMehr', { count: String(alle.length - ZEILEN) });
    ziel.appendChild(mehr);
  }
}

/** Beim Verlassen der Standortebene wegräumen. */
export function standortblattLeeren(): void {
  gezeigt = null;
  platz()?.replaceChildren();
}

export function standortblattAufbauen(abhaengigkeiten: StandortblattDeps): void {
  deps = abhaengigkeiten;
}
