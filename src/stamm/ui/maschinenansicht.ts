/**
 * DIE MASCHINEN-ARBEITSEBENE
 *
 * Eine Maschine ist eine eigene semantische Ebene, kein Abschnitt am Ende
 * einer langen Bestandsseite. Diese Datei ist diese Ebene.
 *
 * ## Was sie ersetzt
 *
 * Gemessen am 16.08.2026, nachdem man eine Maschinenzeile angetippt hatte:
 *
 *   130 Maschinenzeilen im Arbeitskontext
 *   178 fokussierbare Elemente hinter dem Scharnier
 *   10 174 px innere Höhe (Handy), 11 016 px (Schreibtisch)
 *   ein Auswahlfenster für die Maschine, die man gerade ausgewählt hatte
 *
 * Der Bestand ist der Kontext, aus dem man kommt — nicht der, in dem man
 * arbeitet. Er bleibt jetzt draußen, und zwar vollständig: nicht nur aus dem
 * Bild, sondern aus dem Tab-Weg und aus dem Vorlesebaum. Ein Ding, das man
 * nicht sieht, aber vierzig Tabs lang durchtabben muss, ist nicht verborgen.
 *
 * ## Was sie zeigt
 *
 * Oben Name, Standort und der letzte bekannte Zustand — drei Zeilen
 * Orientierung. Darunter **eine** Handlung. Welche das ist, entscheidet die
 * Zustandsmaschine (`stamm/maschine/zustand.ts`), nicht diese Datei: Die
 * Ansicht malt, sie urteilt nicht.
 *
 * ## Sie ist kein Stamm — und sieht trotzdem so aus
 *
 * TourFuchs hat keine Maschinenebene. Gebaut ist sie aus dessen Teilen:
 * `.stat-grid` für die Kennzahlen, `button.primary` für die Handlung,
 * `.near-row` für den Verlauf, dieselben Abstände und Radien. Kein zweites
 * Formenvokabular (§0h).
 */

import type { DiagnosisResult, Machine } from '@data/types.js';
import {
  getDiagnosesForMachine,
  getLatestDiagnosis,
  getMachinesForCustomer,
  getRecordingsForMachine,
} from '@data/db.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';
import { farbeFuerZustand } from '../features/standortmarker.js';
import { zustandZuWert } from '../../services/bestandsuebersicht.js';
import {
  zustandAus,
  handlungFuer,
  istErgebnis,
  type Lage,
  type Maschinenzustand,
} from '../maschine/zustand.js';
import { oeffneTiefe, TIEFE_GEOEFFNET, TIEFE_GESCHLOSSEN, type TiefeDetail } from './scharnier.js';
import { NORMALZUSTAND_GESPEICHERT, ReferencePhase } from '@ui/phases/2-Reference.js';
import { renderMachineFingerprint } from '@ui/components/MachineFingerprint.js';
import { getReferenceIrisVector } from '@ui/phases/referenceIris.js';
import { getMachine } from '@data/db.js';
import { Klangbild } from '@ui/components/Klangbild.js';
import { geraeuschMitbringen } from '@ui/components/GeraeuschMitbringen.js';
import { holeErgebnis, PRUEFUNG_FERTIG, vergissErgebnis } from '../maschine/ergebnis.js';
import { pruefeMitgebrachtenTon } from '../maschine/pruefungAusDatei.js';
import { classifyHealthStatus } from '@core/ml/scoring.js';
import { resolutionLineState } from '@ui/phases/resolutionLine.js';
import { isViewLevelAtLeast } from '@utils/viewLevelSettings.js';
import {
  analyseblattFuellen,
  analyseblattLeeren,
  analyseblattOeffnen,
  blattLupe,
} from './analyseblatt.js';
import { blattAufziehen } from './schale.js';
import {
  erledigte,
  merkeGeprueft,
  naechsteInDerRunde,
  rundeBeenden,
  standortBetreten,
} from '../maschine/runde.js';

export interface MaschinenansichtDeps {
  /**
   * Die Maschine, um die es geht — von außen gesetzt, weil das Scharnier nur
   * den Standort kennt.
   */
  aktuelleMaschine: () => Machine | null;
  /**
   * Den nächsten Schritt auslösen: Aufnahme oder Prüfung.
   *
   * Die Ansicht sagt nur, DASS es weitergeht. Womit, entscheidet der Router
   * anhand dessen, was die Maschine schon hat — dieselbe Entscheidung, die er
   * ohnehin für `MASCHINE_GEWAEHLT` trifft. Sie hier zu wiederholen wäre eine
   * zweite Stelle, an der sie falsch sein kann.
   */
  starteNaechstenSchritt: (maschine: Machine) => void;
  /** Den Verlauf dieser Maschine öffnen. */
  zeigeVerlauf: (maschine: Machine) => void;
  /**
   * Eine andere Maschine desselben Standorts öffnen — die Runde.
   *
   * Es ist derselbe Weg, den auch die Standortansicht benutzt. Ein eigener
   * wäre eine zweite Art, eine Maschine zu öffnen, und damit eine zweite, die
   * beim nächsten Umbau vergessen wird.
   */
  zeigeMaschine: (maschine: Machine) => void;
  /**
   * Eine frischere Fassung derselben Maschine übernehmen.
   *
   * Nach dem Speichern des Normalzustands trägt die Maschine ein
   * Referenzmodell, das die Fassung in der Hand nicht kennt. Ohne dieses
   * Nachreichen stünde die Ebene weiter auf „Noch kein Normalzustand" — direkt
   * neben dem Fingerabdruck, der gerade daraus entstanden ist.
   */
  uebernimmMaschine: (maschine: Machine) => void;
}

const BEHAELTER_ID = 'maschinen-ansicht';

let deps: MaschinenansichtDeps | null = null;

/**
 * Der Fingerabdruck-Moment steht an, sobald ein Normalzustand gespeichert
 * wurde — einmal, für das nächste Zeichnen der Ebene.
 *
 * Als Merker und nicht als eigener Zustand in `zustand.ts`: Er ist kein Zustand
 * der Maschine, sondern ein Augenblick in der Reise. Die Maschine ist danach
 * schlicht `ready`; dass sie es gerade erst geworden ist, gehört der
 * Oberfläche und nicht der Fachlogik.
 */
let fingerabdruckZeigen = false;

/**
 * Ein Geräusch, das von außen mitgebracht wurde und noch keinen Platz hat.
 *
 * Der Schnellcheck liest eine Datei, bevor es die Maschine gibt. Er kann den
 * Ton also nicht in die Ablage legen und die Ebene ihn von dort holen lassen —
 * er reicht ihn hier durch. Beim nächsten Zeichnen genau dieser Maschine wird
 * er ins Blatt gelegt und danach vergessen.
 */
let mitgebracht: { maschinenId: string; ton: AudioBuffer; dateiname: string } | null = null;

/**
 * Eine Maschine öffnen und ein mitgebrachtes Geräusch mitgeben.
 *
 * Der Weg des Schnellchecks. Er öffnet die Tiefe nicht selbst: Diese Ebene
 * weiß, wie sie aufgeht, und zwei Stellen, die dasselbe tun, laufen
 * auseinander.
 */
export function zeigeMitgebrachtesGeraeusch(
  maschine: Machine,
  ton: AudioBuffer,
  dateiname: string
): void {
  mitgebracht = { maschinenId: maschine.id, ton, dateiname };
  deps?.uebernimmMaschine(maschine);
  oeffneTiefe(maschine.customerId ?? null, 'maschine');
}

function behaelter(): HTMLElement | null {
  return document.getElementById(BEHAELTER_ID);
}

/** Wann war die letzte Prüfung — in Worten. */
function vorWieLange(zeitpunkt: number): string {
  const minuten = Math.max(0, Math.round((Date.now() - zeitpunkt) / 60000));
  if (minuten < 2) return t('site.justNow');
  if (minuten < 60) return t('site.agoMinutes', { count: String(minuten) });
  const stunden = Math.round(minuten / 60);
  if (stunden < 24) return t('site.agoHours', { count: String(stunden) });
  return t('site.agoDays', { count: String(Math.round(stunden / 24)) });
}

/**
 * DIE RUNDE
 *
 * Ein Techniker prüft an einem Standort nicht eine Maschine, sondern Maschine
 * für Maschine. Bisher endete jede Prüfung an derselben Stelle: bei „Fertig",
 * einem Knopf, der die Seite neu zeichnet und sonst nichts. Wer weitermachen
 * wollte, tippte auf „Zum Standort", suchte in der Liste die nächste und tippte
 * darauf — zwei Tipps und ein Suchvorgang, je Maschine, obwohl feststeht, was
 * ohnehin drankommt.
 *
 * Welche als Nächstes drankommt, entscheidet dieselbe Frage wie die Sortierung
 * der Standortliste: Was noch nie geprüft wurde, kommt zuerst; danach das, was
 * am längsten her ist. Bei Gleichstand der Name, damit die Reihenfolge zwischen
 * zwei Besuchen dieselbe bleibt.
 *
 * Sie ist ein **Angebot**, keine Führung. Die eine dominante Handlung bleibt,
 * was sie war — wer die Runde nicht geht, sieht einen zweiten, leiseren Knopf
 * und ignoriert ihn. Und wenn es nichts Nächstes gibt, steht dort nichts:
 * Ein Knopf, der zur eigenen Maschine zurückführt, wäre eine Runde von eins.
 */
interface Rundenstand {
  /** Wer als Nächstes drankommt — oder `null`, wenn niemand mehr offen ist. */
  naechste: Machine | null;
  /** Wie viele Maschinen der Standort hat (diese eingeschlossen). */
  gesamt: number;
  /** Wie viele davon in diesem Besuch schon geprüft wurden. */
  erledigt: number;
}

async function rundenstand(maschine: Machine): Promise<Rundenstand> {
  const standort = maschine.customerId;
  if (!standort) return { naechste: null, gesamt: 1, erledigt: 1 };
  const alle = await getMachinesForCustomer(standort);
  const geschwister = alle.filter((m) => m.id !== maschine.id);

  const mitStand = await Promise.all(
    geschwister.map(async (m) => ({
      maschine: m,
      zuletzt: (await getLatestDiagnosis(m.id))?.timestamp ?? null,
    }))
  );
  const schonDran = erledigte(standort);
  return {
    naechste: naechsteInDerRunde(mitStand, schonDran),
    gesamt: alle.length,
    erledigt: alle.filter((m) => schonDran.has(m.id)).length,
  };
}

/**
 * Der Satz über dem Ergebnis — in Alltagssprache.
 *
 * „Klingt wie der Normalzustand", nicht „Score 94". Die Zahl steht daneben und
 * stützt die Aussage; sie führt sie nicht an. Und niemals eine Ursache: Die
 * App hört einen Unterschied, sie sieht kein Lager.
 */
function urteil(zustand: Maschinenzustand): string {
  switch (zustand) {
    case 'untrained':
      return t('maschine.lageUntrained');
    case 'ready':
      return t('maschine.lageReady');
    case 'result-similar':
      return t('maschine.lageSimilar');
    case 'result-deviating':
      return t('maschine.lageDeviating');
    case 'permission-blocked':
      return t('maschine.lageMikrofon');
    case 'quality-insufficient':
      return t('maschine.lageQualitaet');
    case 'offline':
      return t('maschine.lageOffline');
    default:
      return t('maschine.lageLaeuft');
  }
}

/** Die Handlungsbeschriftung. Ausgeschrieben, damit `check-i18n` sie sieht. */
function handlungstext(schluessel: string): string {
  switch (schluessel) {
    case 'maschine.aktionReferenz':
      return t('maschine.aktionReferenz');
    case 'maschine.aktionPruefen':
      return t('maschine.aktionPruefen');
    case 'maschine.aktionStoppen':
      return t('maschine.aktionStoppen');
    case 'maschine.aktionRechnet':
      return t('maschine.aktionRechnet');
    case 'maschine.aktionFertig':
      return t('maschine.aktionFertig');
    case 'maschine.aktionUnterschied':
      return t('maschine.aktionUnterschied');
    case 'maschine.aktionMikrofon':
      return t('maschine.aktionMikrofon');
    case 'maschine.aktionWiederholen':
      return t('maschine.aktionWiederholen');
    default:
      return t('maschine.aktionErneut');
  }
}

/**
 * DER ERSTE WOW-MOMENT
 *
 * „Normalzustand ist bereit" — und daneben das, was gerade entstanden ist:
 * der akustische Fingerabdruck dieser Maschine, als radiale Iris.
 *
 * Er ist kein Schmuck. Bis hierher hat der Nutzer zehn Sekunden lang ein
 * Mikrofon an eine Maschine gehalten und musste glauben, dass dabei etwas
 * herauskam. Das Bild ist der Beleg: Es ist bei jeder Maschine anders, es
 * entsteht aus ihrem Klang, und man erkennt sie daran wieder.
 *
 * Gezeichnet wird mit der Komponente, die es längst gibt
 * (`MachineFingerprint`) — sie steht schon auf den Maschinenkarten und im
 * Messlabor. Eine zweite Fassung wäre ein zweites Bild derselben Sache.
 */
async function zeichneFingerabdruck(ziel: HTMLElement, maschine: Machine): Promise<void> {
  const kasten = document.createElement('div');
  kasten.className = 'maschine-fingerabdruck';

  const leinwand = document.createElement('canvas');
  leinwand.className = 'maschine-iris';
  leinwand.setAttribute('role', 'img');
  leinwand.setAttribute('aria-label', t('maschine.fingerabdruckAlt'));
  kasten.appendChild(leinwand);

  const satz = document.createElement('p');
  satz.className = 'maschine-fingerabdruck-satz';
  satz.textContent = t('maschine.fingerabdruckFertig');
  kasten.appendChild(satz);

  ziel.appendChild(kasten);

  // Erst zeichnen, wenn die Leinwand im Baum steht und ihre Maße hat.
  const vektor = await getReferenceIrisVector(maschine);
  if (vektor) requestAnimationFrame(() => renderMachineFingerprint(leinwand, vektor));
}

/**
 * Das Klangbild dieser Ebene — höchstens eines, und es wird abgeräumt.
 *
 * Es kann ein WebGL-Gebirge halten, und WebGL-Kontexte sind eine knappe
 * Ressource: Browser vergeben nur eine Handvoll pro Seite.
 */
let klangbild: Klangbild | null = null;

/**
 * Den Rückweg dorthin zurückhängen, wo das Scharnier ihn erwartet.
 *
 * Aufzurufen, bevor die Maschinenfläche geleert wird und wenn eine andere
 * Ebene aufgeht — sonst verschwände er mit der Fläche, die ihn gerade
 * beherbergt, oder er würde mit ihr ausgeblendet.
 */
function rueckwegNachHause(): void {
  const wurzel = document.getElementById('zanobo-tiefe');
  const knopf = document.querySelector<HTMLElement>('.tiefe-zurueck');
  if (wurzel && knopf && knopf.parentElement !== wurzel) wurzel.prepend(knopf);
}

function raeumeKlangbildAb(): void {
  klangbild?.destroy();
  klangbild?.element.remove();
  klangbild = null;
}

/**
 * ── DIE HÖR-LUPE IST UMGEZOGEN ────────────────────────────────────────────
 *
 * Hier standen `raeumeLupeAb()` und `zeichneLupe()`. Seit dem 23.08.2026 liegt
 * die Hör-Lupe im Analyseblatt (`analyseblatt.ts`) und nicht mehr auf dieser
 * Seite. Sie dort UND hier zu halten hieße, dieselbe Komponente an zwei
 * Stellen zu führen — mit zwei Web-Audio-Spielern, von denen der zweite den
 * ersten übertönt.
 *
 * Die Handlungen der Seite sind geblieben: „Unterschied anhören" und „Letzten
 * Unterschied anhören" ziehen jetzt das Blatt auf, öffnen den 2D-Reiter und
 * spielen dort.
 */

/**
 * Die Aufnahmen einer Maschine — EINMAL geholt.
 *
 * Hier stand zuerst eine Funktion je Prüfung. Sobald die Maschinenseite mehr
 * als eine Prüfung anbieten sollte, wurde daraus ein Ladevorgang je Prüfung,
 * und die untere Hälfte der Seite erschien messbar später als die obere:
 * Gemessen am 18.08.2026 fehlten Zweitaktionen und Verlauf noch, als die Seite
 * längst stand.
 *
 * `getRecordingsForMachine` liefert ohnehin alles auf einmal. Also einmal
 * laden, dann zuordnen: der jüngste Normalzustand als Referenz, und je
 * Prüfung ihre Messung — die Kennung der Aufnahme ist die der Diagnose.
 */
async function toeneDerMaschine(
  maschine: Machine
): Promise<{ referenz: AudioBuffer | null; messungen: Map<string, AudioBuffer> }> {
  const messungen = new Map<string, AudioBuffer>();
  try {
    const alle = await getRecordingsForMachine(maschine.id);
    const referenz =
      alle
        .filter((r) => r.type === 'reference' && r.audioBuffer)
        .sort((a, b) => b.timestamp - a.timestamp)[0]?.audioBuffer ?? null;
    for (const r of alle) {
      if (r.type === 'diagnosis' && r.audioBuffer) messungen.set(r.id, r.audioBuffer);
    }
    return { referenz, messungen };
  } catch (fehler) {
    logger.warn('Maschinenansicht: Aufnahmen nicht ladbar', fehler);
    return { referenz: null, messungen };
  }
}

/**
 * Ein mitgebrachtes Geräusch ins Analyseblatt legen — NEBEN den Normalzustand.
 *
 * Bis zum 23.08.2026 lag es dort allein, mit der Begründung, dass es zu ihm
 * keine Vergleichsaufnahme gebe. Das stimmte nur für Maschinen ohne
 * Normalzustand. Hat die Maschine einen, ist er genau der zweite Ton, den
 * Gebirge und Hör-Lupe brauchen — und er ist der Grund, warum jemand vier
 * Wochen später noch einmal filmt.
 *
 * Hat sie keinen, bleibt es beim einen Ton, und das Briefing behandelt ihn
 * weiter als `single-recording`: keine Vergleichsaufnahme, also keine
 * behauptete Abweichung.
 */
async function legeMitgebrachtesInsBlatt(
  maschine: Machine,
  ton: AudioBuffer,
  dateiname: string
): Promise<void> {
  const { referenz } = await toeneDerMaschine(maschine);
  analyseblattFuellen({
    referenz,
    messung: ton,
    maschinenname: `${maschine.name} · ${dateiname}`,
    modelle: maschine.referenceModels ?? [],
    /**
     * Ohne Status.
     *
     * Ein mitgebrachter Ton ist hier noch nichts beurteilt worden — die
     * Prüfung ist ein eigener Knopf. Die Kurve bleibt darum neutral gefärbt,
     * statt eine Farbe zu tragen, die niemand gerechnet hat.
     */
  });
  analyseblattOeffnen('zweid');
  blattAufziehen();
}

async function zeichne(maschine: Machine): Promise<void> {
  const ziel = behaelter();
  if (!ziel) return;
  raeumeKlangbildAb();
  /**
   * Das Blatt bekommt zuerst den leeren Stand.
   *
   * Ohne diese Zeile stand der 2D-Reiter auf einer Maschine ohne Normalzustand
   * offen und leer da. Die beiden Wege weiter unten — frisches Ergebnis und
   * gespeicherte letzte Prüfung — legen dann den echten Stoff nach.
   */
  analyseblattFuellen(null);
  /**
   * Den Rückweg retten, bevor die Fläche geleert wird.
   *
   * `.tiefe-zurueck` gehört dem Scharnier und liegt normalerweise oben in
   * `#zanobo-tiefe`. Auf dieser Ebene steht er in einer Zeile mit der einen
   * Handlung — dafür wird er hierher UMGEHÄNGT, nicht nachgebaut: Ein zweiter
   * Rückwärtsknopf wäre eine zweite Stelle mit derselben Beschriftung und
   * demselben Verhalten, und eine davon wäre irgendwann falsch.
   *
   * Umgehängt heißt aber auch: Beim nächsten Zeichnen läge er im Bereich, den
   * diese Zeile gleich leert. Also erst zurück nach Hause, dann leeren.
   */
  rueckwegNachHause();
  ziel.textContent = '';
  ziel.classList.remove('maschinen-ansicht-ergebnis');

  const letzte = await getLatestDiagnosis(maschine.id);
  /**
   * Das Ergebnis dieser Sitzung — und nur dieser.
   *
   * `holeErgebnis` liefert etwas, wenn der Nutzer gerade eben geprüft hat. Ein
   * Wert aus der Datenbank kommt hier bewusst NICHT hinein: Die Ebene öffnet
   * sich im Ruhezustand, nicht in einem Ergebnis von vorgestern. Was vorgestern
   * war, steht darunter als Auskunft.
   */
  const frisch = holeErgebnis(maschine.id);
  const lage: Lage = {
    hatNormalzustand: (maschine.referenceModels?.length ?? 0) > 0,
    ergebnis: frisch ? frisch.wert : null,
  };
  const zustand = zustandAus(lage);

  // ── Kopf: Name, Standort, letzter Zustand ────────────────────────────────
  const kopf = document.createElement('header');
  kopf.className = 'maschine-kopf';

  /**
   * Name und letzter Stand in einer Zeile.
   *
   * „Zuletzt 87 % · vor 4 Tagen" stand darunter und nahm eine eigene Zeile für
   * eine Auskunft, die neben den Namen passt: Das ist der Steckbrief dieser
   * Maschine, nicht ihre Nachricht. Bei einem langen Namen bricht die Zeile um
   * und es steht wieder untereinander — dann ist es der Platz, der entscheidet,
   * und nicht eine feste Regel.
   */
  const titelzeile = document.createElement('div');
  titelzeile.className = 'maschine-titelzeile';

  const titel = document.createElement('h2');
  titel.textContent = maschine.name;
  titelzeile.appendChild(titel);
  kopf.appendChild(titelzeile);

  /**
   * Punkt und Urteil nur dort, wo sie etwas sagen.
   *
   * Im Ruhezustand stand hier „● Bereit zum Prüfen" — direkt über „Zuletzt
   * 87 % · vor 4 Tagen". Zwei Zeilen für dieselbe Auskunft, und die obere ist
   * die schwächere: Sie sagt nur, dass ein Normalzustand vorliegt, was der
   * Prüfknopf ohnehin beweist.
   *
   * Im Ergebnis ist es umgekehrt — „Deutliche akustische Abweichung" ist die
   * Nachricht, und der Punkt daneben trägt die Farbe dazu. Dort bleibt beides
   * stehen: Farbe allein wäre eine reine Farbcodierung. Ebenso in den
   * Störungsfällen, wo das Urteil sagt, was zu tun ist.
   */
  const urteilZeigen =
    istErgebnis(zustand) || zustand === 'quality-insufficient' || zustand === 'permission-blocked';
  /**
   * Das Urteil steht UNTER dem Bild, nicht über ihm.
   *
   * Der Auftraggeber hat am 22.08.2026 beschrieben, warum: Kommt ein Ergebnis,
   * schoben sich Punkt, Satz und Beleg über das Spektrogramm und drückten es
   * nach unten. Wer zwischen zwei Zuständen hin- und herschaltet, um mit dem
   * Auge zu vergleichen, vergleicht dann zwei Bilder an zwei verschiedenen
   * Stellen — und genau das kann das Auge nicht.
   *
   * Es wird hier gebaut, weil hier alles beisammen ist, was es braucht, und
   * weiter unten eingehängt. Über dem Bild steht nur noch, was in JEDEM
   * Zustand dasteht: Name, letzter Stand, die eine Handlung.
   */
  const urteilsblock = document.createElement('div');
  urteilsblock.className = 'maschine-urteil';
  if (urteilZeigen) {
    const lageZeile = document.createElement('p');
    lageZeile.className = 'maschine-lage';
    const punkt = document.createElement('span');
    punkt.className = 'maschine-punkt';
    punkt.style.background = farbeFuerZustand(
      zustandZuWert(frisch?.wert ?? letzte?.healthScore ?? null)
    );
    punkt.setAttribute('aria-hidden', 'true');
    lageZeile.append(punkt, urteil(zustand));
    urteilsblock.appendChild(lageZeile);
  }

  /**
   * Erst der Satz, dann die Zahl.
   *
   * „Die Messung klingt anders als der Normalzustand" ist die Aussage;
   * „Ähnlichkeit 61 %" ist der Beleg dafür. In der anderen Reihenfolge müsste
   * der Nutzer aus einer Prozentzahl schließen, was sie bedeutet — und genau
   * das kann er nicht, weil er die Schwelle nicht kennt.
   *
   * Und niemals eine Ursache: Die App hört einen Unterschied. Sie sieht kein
   * Lager.
   */
  if (frisch) {
    const satz = document.createElement('p');
    satz.className = 'maschine-ergebnissatz';
    satz.textContent =
      zustand === 'result-deviating'
        ? t('maschine.ergebnisAbweichung')
        : t('maschine.ergebnisAehnlich');
    urteilsblock.appendChild(satz);

    const beleg = document.createElement('p');
    beleg.className = 'muted small maschine-zuletzt';
    beleg.textContent = t('maschine.aehnlichkeit', {
      wert: String(Math.round(frisch.wert)),
      wann: vorWieLange(frisch.zeitpunkt),
    });
    urteilsblock.appendChild(beleg);

    /**
     * WIE GENAU IST DIESE ZAHL? — die Auflösungszeile, zurückgeholt.
     *
     * `resolutionLine.ts` gibt es seit langem, es ist getestet, und es war
     * seit dem 23.08.2026 **nirgends mehr zu sehen**: Sein Aufrufer stand im
     * alten Ergebnisdialog, den ich mit #100 abgerissen habe. Das Modul sagt
     * selbst, wo es hingehört — „das Setzen von `textContent` bleibt in
     * 3-Diagnose" —, und genau diese Stelle gibt es nicht mehr. Das Ergebnis
     * steht heute hier.
     *
     * Warum sie zählt: `baselineSpread.ts` hält fest, dass die eigenen
     * Cross-Device-Messwerte des Projekts bei 93–94 % liegen und die
     * Wiederholstreuung auf demselben Gerät bei 95–97 %. In diesem Band sagt
     * „88 %" ohne Maßstab nichts. Die Zeile setzt den Maßstab daneben.
     *
     * ## Warum nur bei GENAU EINEM Normalzustand
     *
     * Die Zahl gehört zu der Referenz, die den Score erzeugt hat. Welche das
     * war, hält die Prüfung nicht fest — `DiagnosisResult` hat kein Feld
     * dafür. Bei genau einer gesunden Referenz ist die Frage beantwortet;
     * bei mehreren wäre der Rückfall auf die erste ein stilles Raten, und
     * dann stünde eine echte Zahl unter einem Score, zu dem sie nicht gehört.
     * Genau davor warnt `resolutionLine.ts` in seinem eigenen Kopf.
     *
     * Lieber keine Zeile als eine, die zur falschen Referenz gehört.
     */
    const gesunde = (maschine.referenceModels ?? []).filter((m) => m.type === 'healthy');
    if (gesunde.length === 1) {
      const stand = resolutionLineState(gesunde, '', isViewLevelAtLeast('advanced'));
      if (stand.kind !== 'hidden') {
        const zeile = document.createElement('p');
        zeile.className = 'muted small maschine-aufloesung';
        zeile.textContent =
          stand.kind === 'value'
            ? t('resultAmpel.resolution', { points: stand.points })
            : t('resultAmpel.resolutionUnknown');
        urteilsblock.appendChild(zeile);
      }
    }
  } else if (letzte) {
    // Neben den Namen, nicht darunter: Der letzte Stand gehört zum Steckbrief
    // der Maschine. Der Beleg eines frischen Ergebnisses gehört dagegen unter
    // seinen Satz — dort ist er die Begründung und nicht die Kopfzeile.
    const zuletzt = document.createElement('span');
    zuletzt.className = 'muted small maschine-zuletzt';
    zuletzt.textContent = t('maschine.zuletzt', {
      wert: String(Math.round(letzte.healthScore)),
      wann: vorWieLange(letzte.timestamp),
    });
    titelzeile.appendChild(zuletzt);
  }
  ziel.appendChild(kopf);

  // ── Der Fingerabdruck, einmal ────────────────────────────────────────────
  const geradeGelernt = fingerabdruckZeigen;
  if (geradeGelernt) {
    fingerabdruckZeigen = false;
    await zeichneFingerabdruck(ziel, maschine);
  }

  // ── Die eine Handlung ────────────────────────────────────────────────────
  //
  // Genau eine, und sie steht ohne Scrollen im Bild. Was es sonst noch gibt —
  // Verlauf, Flotte, Einstellungen — ist entweder sekundär oder gehört auf
  // eine andere Ebene.
  const handlung = handlungFuer(zustand);
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = `primary maschine-aktion maschine-aktion-${handlung.art}`;
  /**
   * Im Fingerabdruck-Moment heißt derselbe Schritt anders.
   *
   * Der Zustand ist `ready` wie immer, die Handlung ist dieselbe — eine
   * Prüfung starten. Nur das Wort wechselt: „Jetzt Gegenprobe machen" knüpft
   * an das an, was gerade passiert ist, „Jetzt 10 Sekunden prüfen" stünde da
   * wie beim hundertsten Mal.
   *
   * Das ist Darstellung und keine Fachlogik, deshalb steht es hier und nicht
   * in `zustand.ts`. Die Zustandsmaschine kennt keine Augenblicke.
   */
  knopf.textContent = geradeGelernt
    ? t('maschine.aktionGegenprobe')
    : handlungstext(handlung.schluessel);
  if (zustand === 'processing') {
    // Eine Auskunft, kein Angebot. Sie steht an der Stelle der Handlung, damit
    // die Fläche nicht eingefroren wirkt — aber sie ist nicht drückbar, sonst
    // verspricht sie etwas, das sie nicht hat.
    knopf.disabled = true;
  }

  /**
   * Rückweg und Handlung in einer Zeile: wohin man geht, und was man tut.
   *
   * Vorher lag der Rückweg allein ganz oben, und zwischen ihm und der Handlung
   * stand fast nichts — auf dem Handy rund 60 px Luft an der wertvollsten
   * Stelle der Seite.
   *
   * Die Handlung bleibt dominant: Sie nimmt den Rest der Zeile, ist gefüllt
   * und höher. Der Rückweg behält seine Pillenform und nur seine eigene
   * Breite — er ist kein gleichrangiges Angebot.
   */
  const aktionszeile = document.createElement('div');
  aktionszeile.className = 'maschine-aktionszeile';
  const rueckweg = document.querySelector<HTMLElement>('.tiefe-zurueck');
  if (rueckweg) aktionszeile.appendChild(rueckweg);
  aktionszeile.appendChild(knopf);
  ziel.appendChild(aktionszeile);

  /**
   * ── EIN GERÄUSCH MITBRINGEN ──────────────────────────────────────────────
   *
   * Der Auftraggeber: Menschen filmen, was komisch klingt, und der Film liegt
   * schon auf dem Telefon. SoundFuchs nimmt ihn entgegen, löst die Tonspur
   * heraus und legt sie ins Analyseblatt — 2D, Gebirge, Stelle greifen und
   * hören, Briefing.
   *
   * Es steht UNTER der einen Handlung und ungefüllt: Aufnehmen bzw. Prüfen
   * bleibt der Hauptweg. Wer eine Datei hat, sieht eine ruhige Alternative;
   * wer keine hat, geht daran vorbei.
   */
  const mitbringen = document.createElement('button');
  mitbringen.type = 'button';
  mitbringen.className = 'maschine-mitbringen';
  mitbringen.textContent = t('mitbringen.knopf');
  mitbringen.addEventListener('click', () => {
    geraeuschMitbringen({
      uebernehmen: (ton, dateiname) => void legeMitgebrachtesInsBlatt(maschine, ton, dateiname),
      /**
       * ── UND DER ZWEITE AUSGANG: DER NORMALZUSTAND ──────────────────────
       *
       * Der Auftraggeber: „Dann kann man sein Auto heute filmen und in vier
       * Wochen vergleichen."
       *
       * `vorhanden` entscheidet nur, ob vorher gefragt wird. Es kommt aus der
       * Maschine in der Hand — und die ist an dieser Stelle frisch: Die Ebene
       * wird nach jedem Speichern eines Normalzustands neu gezeichnet.
       */
      normalzustand: {
        vorhanden: (maschine.referenceModels?.length ?? 0) > 0,
        speichern: (ton) => new ReferencePhase(maschine).normalzustandAusTon(ton),
        /**
         * Und der Vergleich selbst — wofür SoundFuchs gebaut ist.
         *
         * Er rechnet mit derselben Engine, mit der der Normalzustand angelernt
         * wurde; das entscheidet das Modell, nicht der Aufrufer. Das Ergebnis
         * landet über `merkeErgebnis` auf der Maschinenebene, wo jede Prüfung
         * landet — ein zweiter Ort wäre eine zweite Wahrheit.
         */
        pruefen: (ton) => pruefeMitgebrachtenTon(maschine, ton),
      },
    });
  });
  ziel.appendChild(mitbringen);

  /**
   * ── DER BILDPLATZ ────────────────────────────────────────────────────────
   *
   * Ab hier steht das Bild — und zwar in JEDEM Zustand an derselben Stelle.
   *
   * Über ihm liegt nur, was sich zwischen den Zuständen nicht ändert: Name und
   * letzter Stand, dann die eine Handlung. Alles, was ein Zustand mitbringt —
   * Urteil, Ergebnissatz, Beleg, Hinweis, die Runde, die Hör-Lupe — steht
   * darunter.
   *
   * Der Grund ist ein optischer: Zwei Spektrogramme vergleicht das Auge, indem
   * es hin- und herschaltet. Wandert das Bild dabei um drei Zeilen, vergleicht
   * es zwei Stellen statt zweier Bilder.
   */
  const bildplatz = document.createElement('div');
  bildplatz.className = 'maschine-bildplatz';
  ziel.appendChild(bildplatz);

  /**
   * Im Ergebnis steht dasselbe Bild wie im Ruhezustand.
   *
   * Bis hierher gab es das Klangbild nur in Ruhe; im Ergebnis stand an seiner
   * Stelle die Hör-Lupe. Wer nach einer Prüfung sehen wollte, was sich geändert
   * hat, musste also erst „Fertig" drücken. Die Aufnahmen liegen im Ergebnis
   * ohnehin im Speicher — es aus ihnen zu zeichnen kostet keinen Ladevorgang.
   */
  if (frisch) {
    const bild = new Klangbild({
      reference: frisch.referenz,
      measurement: frisch.messung,
      ohneGebirge: true,
      ohneAuswahl: true,
      // Das Positionsbild dieser Maschine — als gleichrangige Quelle neben
      // Normalzustand, Messung, Unterschied und Iris.
      foto: maschine.referenceImage ?? null,
    });
    if (bild.hasContent) {
      raeumeKlangbildAb();
      klangbild = bild;
      bildplatz.appendChild(bild.element);
    }
    /**
     * Dieselben Aufnahmen liegen ab jetzt auch im Analyseblatt.
     *
     * Der Stoff wird eingelegt, nicht gezeigt: Gebaut wird ein Reiter erst,
     * wenn er aufgeht. Wer das Blatt unten lässt, zahlt für die Analyse nichts.
     */
    analyseblattFuellen({
      referenz: frisch.referenz,
      messung: frisch.messung,
      maschinenname: maschine.name,
      /**
       * Die Betriebspunkte und die Farbe der Kurve — für den Reiter „Details".
       *
       * Der Status wird durchgereicht und nicht im Blatt neu gerechnet: Oben
       * steht bereits eine Zahl zu dieser Messung, und zwei Urteile über
       * dieselbe Messung wären eines zu viel.
       */
      modelle: maschine.referenceModels ?? [],
      status: classifyHealthStatus(frisch.wert),
    });
  }

  ziel.appendChild(urteilsblock);

  /**
   * Der stützende Satz — aber nicht im Ergebnis.
   *
   * Dort stand bis zur ersten Messung dieses Schnitts „Halte das Gerät wie beim
   * letzten Mal an dieselbe Stelle": ein Hinweis zum Aufnehmen, unter einem
   * Knopf, der etwas abspielt. Im Ergebnis erklärt sich der nächste Schritt
   * durch die Hör-Lupe direkt darunter, und die bringt ihren eigenen Satz mit.
   * Zwei Sätze übereinander, von denen einer falsch ist, sind schlechter als
   * einer.
   */
  if (!istErgebnis(zustand)) {
    const hinweis = document.createElement('p');
    hinweis.className = 'muted small maschine-hinweis';
    hinweis.textContent =
      zustand === 'untrained' ? t('maschine.hinweisReferenz') : t('maschine.hinweisPruefung');
    if (geradeGelernt) hinweis.textContent = t('maschine.hinweisGegenprobe');
    if (zustand === 'processing') hinweis.textContent = t('maschine.rechnetHinweis');
    ziel.appendChild(hinweis);
  }

  /**
   * Die Runde — nur nach einem Ergebnis.
   *
   * Vorher wäre sie ein Drängen: „Nächste Maschine", bevor man diese geprüft
   * hat. Danach ist sie die Antwort auf die Frage, die man ohnehin hat.
   *
   * Sie wird nachgereicht, nicht abgewartet: Der Platz steht sofort, die
   * Beschriftung kommt, sobald der Standort gelesen ist. Wer die Seite mit
   * einem leeren Knopf sähe, würde auf ihn tippen — deshalb steht er erst da,
   * wenn er einen Namen hat. Und er steht unter dem Bild: Ein Knopf, der nur
   * im Ergebnis auftaucht, würde das Bild sonst um seine eigene Höhe schieben.
   */
  const rundenplatz = document.createElement('div');
  rundenplatz.className = 'maschine-rundenplatz';
  ziel.appendChild(rundenplatz);
  if (istErgebnis(zustand)) {
    void rundenstand(maschine).then((stand) => {
      if (!rundenplatz.isConnected) return;
      if (stand.naechste) {
        const naechste = stand.naechste;
        const weiter = document.createElement('button');
        weiter.type = 'button';
        weiter.className = 'maschine-runde';
        weiter.textContent = t('maschine.naechsteMaschine', { name: naechste.name });
        weiter.addEventListener('click', () => {
          vergissErgebnis();
          deps?.zeigeMaschine(naechste);
        });
        rundenplatz.appendChild(weiter);
        return;
      }
      /**
       * Die Runde ist zu Ende — und sagt es.
       *
       * Vorher stand hier nichts: Der Knopf verschwand einfach. Wer eine Runde
       * geht, erfährt so nie, dass er fertig ist; er tippt „Zum Standort" und
       * zählt die Zeilen nach. Ein Ende, das man selbst feststellen muss, ist
       * kein Ende.
       *
       * Nur, wenn in diesem Besuch überhaupt etwas erledigt wurde und der
       * Standort mehr als eine Maschine hat: Eine „Runde" von einer Maschine
       * für abgeschlossen zu erklären, wäre eine Feier für das Aufstehen.
       */
      if (stand.erledigt < 2 || stand.gesamt < 2) return;
      const fertig = document.createElement('p');
      fertig.className = 'maschine-rundefertig';
      fertig.setAttribute('role', 'status');
      fertig.textContent = t('maschine.rundeFertig', { anzahl: String(stand.erledigt) });
      rundenplatz.appendChild(fertig);
    });
  }

  // ── Das Ergebnis: die Hör-Lupe ───────────────────────────────────────────
  //
  // Sie ist der Punkt, an dem aus einer Prozentzahl etwas wird, das ein
  // zweiter Mensch nachvollziehen kann. Deshalb steht sie IM Ergebnis und
  // nicht hinter einem Weg dorthin.
  if (frisch) {
    /**
     * Am Schreibtisch bekommt das Ergebnis zwei Spalten.
     *
     * Die Klasse steht nur am Ergebnis, nicht an der Ebene: Im Ruhezustand
     * gibt es nichts, was eine zweite Spalte füllen würde, und eine leere
     * Spalte ist keine Nutzung der Fläche, sondern ein Loch. Was die Klasse
     * bewirkt, entscheidet allein die Schreibtisch-Abfrage in `tiefe.css` —
     * auf dem Handy bleibt alles, wie es ist.
     */
    ziel.classList.add('maschinen-ansicht-ergebnis');
  }

  if (frisch && zustand === 'result-deviating') {
    /**
     * Ein Tipp bis zum hörbaren Unterschied — jetzt über das Blatt.
     *
     * Bis zum 23.08.2026 baute die Seite hier ihre eigene Hör-Lupe. Seit die
     * Analyse im Blatt liegt, wäre das die zweite: dieselbe Komponente an zwei
     * Stellen, von denen eine gerade verdeckt ist.
     *
     * Die Handlung bleibt, was sie war. Sie zieht das Blatt auf, öffnet den
     * 2D-Reiter und spielt. Die Komponente wird dabei an ihrer eigenen
     * Schnittstelle gerufen und nicht per nachgemachtem Klick — das wäre die
     * erste Bedienung, die kaputtgeht, wenn dort jemand eine Klasse umbenennt.
     */
    knopf.addEventListener('click', () => {
      analyseblattOeffnen('zweid');
      blattAufziehen();
      void blattLupe()?.spieleUnterschied();
    });
  } else if (frisch && zustand === 'result-similar') {
    /**
     * „Fertig" ist die einzige Primäraktion — die Lupe bleibt erreichbar.
     *
     * Auch ein gutes Ergebnis muss überprüfbar sein: Wer misstraut, soll
     * nachhören können, ohne dass die App ihm dazu einen zweiten gleich
     * lauten Knopf danebenstellt.
     */
    knopf.addEventListener('click', () => {
      vergissErgebnis();
      void zeichne(maschine);
    });

    const trotzdem = document.createElement('button');
    trotzdem.type = 'button';
    trotzdem.className = 'linklike maschine-trotzdem';
    trotzdem.textContent = t('maschine.trotzdemHoeren');
    trotzdem.addEventListener('click', () => {
      analyseblattOeffnen('zweid');
      blattAufziehen();
    });
    ziel.appendChild(trotzdem);
  } else if (zustand !== 'processing') {
    knopf.addEventListener('click', () => deps?.starteNaechstenSchritt(maschine));
  }

  /**
   * ── DAS KLANGBILD ────────────────────────────────────────────────────────
   *
   * Ohne Tipp im Bild, in der Hälfte des Bildschirms, die vorher leer war.
   *
   * Gemessen am 18.08.2026 (390 × 844, Maschine in Ruhe): Das unterste
   * Angebot endete bei 422 px, darunter standen 422 px leer — und das
   * Eindrucksvollste, das 3D-Gebirge, lag vier Tipps entfernt hinter
   * „Verlauf → Hören → 3D-Ansicht → Quelle", erreichbar nur auf der
   * Profi-Stufe. Das war kein Platzproblem, sondern ein Belegungsproblem.
   *
   * Es steht UNTER der einen Handlung: Prüfen bleibt der Hauptweg, das Bild
   * ist der Beleg der letzten Prüfung. Und es ersetzt „Letzten Unterschied
   * anhören" nicht — es steht daneben, weil Sehen und Hören zwei Sinne sind.
   */
  /**
   * ── Die Seite steht, bevor der Ton geladen ist ───────────────────────────
   *
   * Klangbild, Prüfungsreihe und die beiden Zweitaktionen brauchen die
   * Aufnahmen — und deren Laden dauert. Gemessen am 18.08.2026 fehlte die
   * untere Hälfte der Seite noch, als die obere längst stand: Wer schnell
   * tippte, fand „Letzten Unterschied anhören" und den Verlauf nicht vor.
   *
   * Deshalb bekommt der tonabhängige Teil hier einen Platz, und der Rest der
   * Seite wird zuerst fertig gebaut. Was ohne Ton auskommt — die eine
   * Handlung, der Verlauf — steht sofort.
   */
  const tonplatz = document.createElement('div');
  tonplatz.className = 'maschine-tonplatz';
  if (!frisch && letzte && zustand === 'ready') ziel.appendChild(tonplatz);

  // ── Sekundär: der Verlauf ────────────────────────────────────────────────
  if (maschine.lastDiagnosisAt) {
    const verlauf = document.createElement('button');
    verlauf.type = 'button';
    verlauf.className = 'linklike maschine-verlauf';
    verlauf.textContent = t('history.viewHistory');
    /**
     * Die Zahl kommt nach.
     *
     * „Verlauf" allein war ein Wort in Kleinschrift, hinter dem niemand etwas
     * vermutete; die Zahl sagt, dass dort etwas liegt. Sie zu zählen heißt
     * aber, alle Diagnosen dieser Maschine zu lesen — und darauf soll die
     * Seite nicht warten. Sie trägt sich nach, wenn sie da ist.
     */
    void getDiagnosesForMachine(maschine.id).then((alle) => {
      if (alle.length > 0 && verlauf.isConnected) {
        // Eine Prüfung ist keine „1 Prüfungen".
        verlauf.textContent =
          alle.length === 1
            ? t('maschine.verlaufEine')
            : t('maschine.verlaufMitZahl', { anzahl: String(alle.length) });
      }
    });
    verlauf.addEventListener('click', () => deps?.zeigeVerlauf(maschine));
    ziel.appendChild(verlauf);
  }

  if (!frisch && letzte && zustand === 'ready') {
    const { referenz, messungen } = await toeneDerMaschine(maschine);
    const klaengeZu = (d: DiagnosisResult) => {
      const messung = messungen.get(d.id);
      return referenz && messung ? { referenz, messung } : null;
    };
    const toene = klaengeZu(letzte);
    if (toene) {
      const zeigePruefung = (
        klaenge: { referenz: AudioBuffer; messung: AudioBuffer },
        davor: HTMLElement | null
      ) => {
        /**
         * Ohne Bildunterschrift.
         *
         * Hier stand „Letzte Prüfung · 87 % · vor 4 Tagen" — dieselbe Auskunft,
         * die schon neben dem Maschinennamen steht. Der Auftraggeber hat sie am
         * 22.08.2026 auf einem Bildschirmfoto angestrichen.
         *
         * Sie war außerdem nicht immer wahr: Wer in der Reihe darunter auf
         * „89 % · vor 5 Tagen" tippte, bekam weiterhin das Wort „Letzte
         * Prüfung" über einer Prüfung, die nicht die letzte war. Welche im Bild
         * steht, sagt die hervorgehobene Prüfung in der Reihe — und die sagt es
         * richtig.
         */
        const bild = new Klangbild({
          reference: klaenge.referenz,
          measurement: klaenge.messung,
          ohneGebirge: true,
          ohneAuswahl: true,
          foto: maschine.referenceImage ?? null,
        });
        if (!bild.hasContent) return null;
        raeumeKlangbildAb();
        klangbild = bild;
        if (davor) davor.insertAdjacentElement('afterend', bild.element);
        else bildplatz.appendChild(bild.element);
        return bild;
      };
      const ankerFuerBild: HTMLElement | null = null;
      zeigePruefung(toene, ankerFuerBild);
      // Auch im Ruhezustand liegt die letzte Prüfung im Blatt bereit.
      analyseblattFuellen({
        referenz: toene.referenz,
        messung: toene.messung,
        maschinenname: maschine.name,
        modelle: maschine.referenceModels ?? [],
        // Hier liegt der Status schon fertig in der Prüfung — er muss nicht
        // aus dem Wert zurückgerechnet werden.
        status: letzte.status,
      });

      const zeile = document.createElement('div');
      zeile.className = 'maschine-zweitaktionen';

      const nachhoeren = document.createElement('button');
      nachhoeren.type = 'button';
      nachhoeren.className = 'maschine-nachhoeren';
      nachhoeren.textContent = t('maschine.letzterUnterschied');
      nachhoeren.addEventListener('click', () => {
        analyseblattOeffnen('zweid');
        blattAufziehen();
        void blattLupe()?.spieleUnterschied();
      });
      zeile.appendChild(nachhoeren);

      /**
       * ── DAS BRIEFING IST UMGEZOGEN ─────────────────────────────────────
       *
       * Hier stand ein zweiter Knopf „✨ Geräusch-Briefing". Seit dem
       * 23.08.2026 hat das Briefing einen eigenen Reiter im Analyseblatt —
       * zusammen mit 2D und dem Gebirge, den beiden anderen Werkzeugen, die
       * vorher ebenfalls je eine eigene Tür hatten.
       *
       * Der Knopf hier bliebe die zweite Tür zum selben Werkzeug, und genau
       * das war die Unordnung, die das Blatt beseitigt. Wer ihn sucht: ein Zug
       * am Griff, dritter Reiter.
       */

      tonplatz.appendChild(zeile);

      /**
       * ── DER VERLAUF WECHSELT DAS BILD ──────────────────────────────────
       *
       * Bis hierher war der Verlauf ein Wort in Kleinschrift — und trotzdem
       * die einzige Tür zu allem Guten: Verlauf → Hören → 3D-Ansicht →
       * Quelle. Vier Tipps für etwas, das man vergleichen will.
       *
       * Die letzten Prüfungen stehen jetzt als Reihe unter dem Bild. Ein Tipp
       * wechselt, was im Klangbild steht — er öffnet keine neue Welt. Das ist
       * der semantische Zoom, den der Auftraggeber gemeint hat: im Bild, nicht
       * in der Navigation.
       *
       * Nur Prüfungen mit Ton kommen in die Reihe: Die Aufbewahrung ist eine
       * Einstellung des Nutzers, und ein Knopf, der nichts zeigen kann, ist
       * schlimmer als kein Knopf. Erst ab zwei wählbaren Prüfungen erscheint
       * sie überhaupt — eine Wahl ohne Alternative ist keine.
       */
      const letzten = await getDiagnosesForMachine(maschine.id, 4);
      const waehlbar: Array<{
        diagnose: DiagnosisResult;
        klaenge: { referenz: AudioBuffer; messung: AudioBuffer };
      }> = [];
      for (const d of letzten) {
        const k = klaengeZu(d);
        if (k) waehlbar.push({ diagnose: d, klaenge: k });
      }
      if (waehlbar.length > 1) {
        const reihe = document.createElement('div');
        reihe.className = 'maschine-pruefungen';
        for (const { diagnose, klaenge } of waehlbar) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'maschine-pruefung';
          chip.textContent = t('maschine.pruefungKurz', {
            wert: String(Math.round(diagnose.healthScore)),
            wann: vorWieLange(diagnose.timestamp),
          });
          chip.setAttribute('aria-pressed', diagnose.id === letzte.id ? 'true' : 'false');
          chip.classList.toggle('is-aktiv', diagnose.id === letzte.id);
          chip.addEventListener('click', () => {
            for (const anderer of reihe.querySelectorAll('.maschine-pruefung')) {
              anderer.classList.remove('is-aktiv');
              anderer.setAttribute('aria-pressed', 'false');
            }
            chip.classList.add('is-aktiv');
            chip.setAttribute('aria-pressed', 'true');
            zeigePruefung(klaenge, ankerFuerBild);
          });
          reihe.appendChild(chip);
        }
        // Vor die Zweitaktionen: Erst wählen, was man sieht, dann damit
        // etwas tun.
        bildplatz.appendChild(reihe);
      }

      // ── Sekundär: die letzte Prüfung nachhören ────────────────────────────
      //
      // Der Weg zur letzten Hör-Lupe, ohne Umweg über den Verlauf. Er
      // erscheint nur, wenn es den Ton wirklich gibt — die Aufbewahrung ist
      // eine Einstellung des Nutzers, und sie wird hier nicht heimlich
      // umgestellt, nur damit ein Knopf dastehen kann.
    }
  }

  /**
   * ── ZULETZT: EIN VON AUSSEN MITGEBRACHTES GERÄUSCH ───────────────────────
   *
   * Es kommt aus dem Schnellcheck — dort gab es die Maschine noch nicht, als
   * die Datei gelesen wurde. Es steht ganz am Ende dieser Methode, weil jeder
   * Weg darüber selbst ins Blatt schreiben kann: Ein frisches Ergebnis, eine
   * gespeicherte letzte Prüfung, und ganz oben `analyseblattFuellen(null)`.
   * Stünde es weiter oben, wäre der mitgebrachte Ton wieder weg, bevor ihn
   * jemand sieht.
   *
   * Und es gilt nur einmal: Beim nächsten Zeichnen derselben Maschine ist er
   * nicht mehr die Nachricht.
   */
  if (mitgebracht && mitgebracht.maschinenId === maschine.id) {
    const { ton, dateiname } = mitgebracht;
    mitgebracht = null;
    await legeMitgebrachtesInsBlatt(maschine, ton, dateiname);
  }
}

/**
 * Die Ebene in Betrieb nehmen.
 *
 * Sie hört auf das Scharnier, statt von außen gefüttert zu werden — wie die
 * Standortansicht. Wer die Tür auf `maschine` stellt, hat gerade gesagt, um
 * welche es geht.
 */
export function maschinenansichtAufbauen(abhaengigkeiten: MaschinenansichtDeps): void {
  deps = abhaengigkeiten;

  const tiefe = document.getElementById('zanobo-tiefe');
  if (!tiefe) {
    logger.warn('Maschinenansicht: #zanobo-tiefe fehlt — sie hätte keinen Platz');
    return;
  }

  let ziel = behaelter();
  if (!ziel) {
    ziel = document.createElement('section');
    ziel.id = BEHAELTER_ID;
    ziel.className = 'maschinen-ansicht';
    const standort = document.getElementById('standort-ansicht');
    if (standort?.nextSibling) tiefe.insertBefore(ziel, standort.nextSibling);
    else tiefe.prepend(ziel);
  }

  /**
   * Ein Normalzustand ist gespeichert — zurück auf die Maschinenebene, und
   * dort den Fingerabdruck zeigen.
   *
   * Der Weg zurück gehört hierher und nicht in die Referenzphase: Diese Ebene
   * hat den Nutzer hingeschickt, sie holt ihn auch wieder ab. Die Maschine
   * wird dabei frisch geholt — sie hat gerade ein Referenzmodell bekommen,
   * und die Fassung in der Hand ist die von vorher.
   */
  document.addEventListener(NORMALZUSTAND_GESPEICHERT, (ereignis) => {
    const { machineId } = (ereignis as CustomEvent<{ machineId: string }>).detail;
    void (async () => {
      const frisch = await getMachine(machineId);
      if (!frisch) return;
      fingerabdruckZeigen = true;
      deps?.uebernimmMaschine(frisch);
      oeffneTiefe(frisch.customerId ?? null, 'maschine');
    })();
  });

  /**
   * Eine Prüfung ist ausgewertet — zurück auf die Maschinenebene, und dort
   * steht das Ergebnis.
   *
   * Null Tipps vom Ende der Messung bis zum sichtbaren Ergebnis: Der Nutzer hat
   * die Prüfung gestartet, er hat damit schon gesagt, dass er das Ergebnis
   * sehen will. Eine Nachfrage wäre dieselbe Frage ein zweites Mal.
   */
  document.addEventListener(PRUEFUNG_FERTIG, (ereignis) => {
    const { machineId } = (ereignis as CustomEvent<{ machineId: string }>).detail;
    void (async () => {
      const frisch = await getMachine(machineId);
      if (!frisch) return;
      // Diese Maschine ist in dieser Runde erledigt. Der Vermerk gehört hierher
      // und nicht in die Ablage: Er sagt nicht „zuletzt geprüft am", sondern
      // „von mir, in diesem Besuch" — und gilt nur, solange der Besuch dauert.
      merkeGeprueft(frisch.customerId ?? null, machineId);
      deps?.uebernimmMaschine(frisch);
      oeffneTiefe(frisch.customerId ?? null, 'maschine');
    })();
  });

  /**
   * Die Tür ist zu — die Runde ist vorbei.
   *
   * Wer den Standort verlässt, hat aufgehört, ihn durchzugehen; ob vollständig
   * oder nicht, entscheidet er selbst. Eine Runde, die über das Verlassen
   * hinweg weiterliefe, würde beim nächsten Besuch Maschinen überspringen, die
   * niemand geprüft hat.
   */
  document.addEventListener(TIEFE_GESCHLOSSEN, () => rundeBeenden());

  document.addEventListener(TIEFE_GEOEFFNET, (ereignis) => {
    const detail = (ereignis as CustomEvent<TiefeDetail>).detail;
    // Ein anderer Standort beginnt eine neue Runde; derselbe setzt sie fort.
    // Deshalb steht das vor allen Abzweigungen: Auch der Weg über die
    // Standortebene und die Arbeitsebene meldet sich hier.
    standortBetreten(detail.standortId);
    /**
     * Wer die Maschine verlässt, lässt auch ihr Ergebnis los.
     *
     * Zwei Aufnahmen sind rund zwei Megabyte. Sie festzuhalten, bis die Seite
     * neu lädt, wäre ein Leck, das man erst nach dem fünfzigsten Standort
     * merkt. Die Arbeitsebene zählt nicht als Verlassen — dorthin führt der
     * Weg der Prüfung selbst.
     */
    if (detail.ebene !== 'maschine') rueckwegNachHause();
    if (detail.ebene !== 'maschine' && detail.ebene !== 'arbeit') {
      raeumeKlangbildAb();
      // Das Blatt gehört zur Maschine. Wer sie verlässt, lässt auch ihre
      // Analyse los — sonst hinge ein Gebirge der vorigen Maschine im Reiter.
      analyseblattLeeren();
      vergissErgebnis();
    }
    if (detail.ebene !== 'maschine') return;
    const maschine = deps?.aktuelleMaschine() ?? null;
    if (!maschine) {
      // Ohne Maschine gibt es nichts zu zeigen. Das passiert, wenn jemand über
      // einen Deep-Link kommt, dessen Maschine gelöscht wurde — dann ist der
      // Standort der ehrlichere Ort als eine leere Überschrift.
      logger.warn('Maschinenansicht: keine Maschine gewählt');
      oeffneTiefe(detail.standortId, 'standort');
      return;
    }
    void zeichne(maschine);
  });
}
