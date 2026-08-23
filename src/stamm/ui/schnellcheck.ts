/**
 * DER SCHNELLCHECK — EIN GERÄUSCH OHNE MASCHINE
 *
 * Der Auftraggeber: „Ich habe hier einfach einen Film gemacht von einer
 * Motorhaube, wo vielleicht ein komisches Geräusch ist. Und ich glaube, das
 * ist sehr allgemein."
 *
 * Wer das tut, hat keine Maschine angelegt, keinen Standort erfasst und keine
 * Postleitzahl im Kopf. Er hat eine Datei. Bis eben führte der Weg dorthin nur
 * über die Maschinenebene — also über zwei Formulare, die niemand ausfüllen
 * will, bevor er weiß, ob überhaupt etwas zu sehen ist.
 *
 * Der Auftraggeber hat entschieden: **die App legt die Maschine an.**
 *
 * ## Wo das Geräusch dann steht
 *
 * In einem Standort „Meine Geräusche", der beim ersten Schnellcheck entsteht.
 * Er hat keine Postleitzahl und deshalb keinen Punkt auf der Karte
 * (`geo: 'none'`) — das ist ein Zustand, den die App seit jeher kennt, keine
 * neue Sonderform.
 *
 * Damit er trotzdem wiederzufinden ist, hat der Reiter „Standorte" seit
 * demselben Schnitt eine Liste. Ohne sie legte der Schnellcheck etwas an, das
 * niemand je wiedersieht — und genau das ist das Gegenteil von „heute filmen
 * und in vier Wochen vergleichen".
 *
 * ## Warum die Maschine nach der Datei heißt
 *
 * `createAutoMachine()` nummeriert durch: „Maschine 01", „Maschine 02". Bei
 * Maschinen an einem Standort ist das richtig — sie stehen dort und man sieht
 * sie. Bei drei Geräuschen aus drei Filmen sagt eine Nummer nichts. Der
 * Dateiname sagt etwas: Beim Beispielvideo des Auftraggebers ist er ein Datum
 * mit Uhrzeit.
 *
 * ## Was hier NICHT passiert
 *
 * Es wird nichts bewertet. Ein einzelner Ton ohne Normalzustand hat keinen
 * Prozentwert — das Briefing nennt diesen Fall `single-recording` und behauptet
 * keine Abweichung. Was der Schnellcheck kann: zeigen, hören, briefen. Und
 * einen Zug weiter steht im Blatt „Als Normalzustand speichern" — der Schritt,
 * der aus dem einmaligen Blick den Maßstab macht.
 */

import { geraeuschMitbringen } from '@ui/components/GeraeuschMitbringen.js';
import { getAllCustomers, saveCustomer, saveMachine } from '@data/db.js';
import type { Customer, Machine } from '@data/types.js';
import { ReferencePhase } from '@ui/phases/2-Reference.js';
import { zeigeMitgebrachtesGeraeusch } from './maschinenansicht.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';

const KNOPF_ID = 'btn-schnellcheck';

/**
 * Die Kennung des Sammelstandorts.
 *
 * Fest und nicht erzeugt: Beim zweiten Schnellcheck muss derselbe Standort
 * gefunden werden. Eine Suche über den Namen wäre nach dem ersten Umbenennen
 * falsch, eine erzeugte Kennung beim zweiten Mal ein zweiter Standort.
 */
const SAMMELSTANDORT = 'SF-SCHNELLCHECK';

/** So lang darf ein aus dem Dateinamen gewonnener Maschinenname sein. */
const NAMENSLAENGE = 40;

/**
 * Aus einem Dateinamen einen Maschinennamen machen.
 *
 * Endung weg, Unterstriche zu Leerzeichen, gekürzt. Bleibt nichts übrig — ein
 * Name aus lauter Punkten etwa —, entscheidet der Aufrufer.
 */
export function nameAusDatei(dateiname: string): string {
  /**
   * Nur Buchstaben und Ziffern gelten als Endung.
   *
   * Der erste Versuch nahm alles nach dem letzten Punkt, wenn es kurz genug
   * war. Aus „Motor 2.5 Liter" wurde damit „Motor 2" — ein Test hat es
   * gefunden. Eine Endung hat kein Leerzeichen.
   */
  const ohneEndung = dateiname.replace(/\.[A-Za-z0-9]{1,8}$/, '');
  const sauber = ohneEndung.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!sauber) return '';
  return sauber.length > NAMENSLAENGE ? `${sauber.slice(0, NAMENSLAENGE - 1).trimEnd()}…` : sauber;
}

/**
 * Den Sammelstandort holen oder anlegen.
 *
 * Angelegt wird er erst, wenn wirklich ein Geräusch kommt. Ein Standort, der
 * beim Start entsteht und leer bleibt, wäre ein Eintrag in der Liste, den
 * niemand gewollt hat.
 */
async function sammelstandort(): Promise<Customer> {
  const alle = await getAllCustomers();
  const vorhanden = alle.find((k) => k.id === SAMMELSTANDORT);
  if (vorhanden) return vorhanden;

  const neu: Customer = {
    id: SAMMELSTANDORT,
    name: t('schnellcheck.standortname'),
    // Keine Postleitzahl: Wo gefilmt wurde, weiß die App nicht, und eine zu
    // erfinden hieße, einen Punkt auf die Karte zu setzen, der nicht stimmt.
    plz: '',
    geo: 'none',
    createdAt: Date.now(),
  };
  await saveCustomer(neu);
  logger.info('🎞 Schnellcheck: Sammelstandort angelegt');
  return neu;
}

/** Eine Maschine für dieses eine Geräusch. */
async function maschineFuerGeraeusch(dateiname: string): Promise<Machine> {
  const standort = await sammelstandort();
  const name = nameAusDatei(dateiname) || t('schnellcheck.ohneNamen');
  const maschine: Machine = {
    id: `sc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    name,
    customerId: standort.id,
    createdAt: Date.now(),
    referenceModels: [],
  };
  await saveMachine(maschine);
  logger.info(`🎞 Schnellcheck: Maschine „${name}" angelegt`);
  return maschine;
}

export function schnellcheckAufbauen(): void {
  const knopf = document.getElementById(KNOPF_ID);
  if (!knopf) {
    logger.warn('Schnellcheck: der Knopf über der Karte fehlt');
    return;
  }

  knopf.addEventListener('click', () => {
    /**
     * Eine Maschine je Dialog, nicht je Knopfdruck.
     *
     * Beide Ausgänge legen eine an, und der Normalzustand kann abgelehnt
     * werden („zu kurz", „zu unruhig") — dann kehrt der Nutzer in dieselbe
     * Vorschau zurück und versucht eine andere Stelle. Ohne dieses Merken
     * entstünde bei jedem Versuch eine weitere Maschine, und „Meine Geräusche"
     * wäre nach drei Anläufen eine Liste aus drei gleichen Namen.
     */
    let angelegt: Machine | null = null;
    const maschine = async (dateiname: string): Promise<Machine> => {
      if (!angelegt) angelegt = await maschineFuerGeraeusch(dateiname);
      return angelegt;
    };

    geraeuschMitbringen({
      /**
       * Der übliche Weg: ansehen.
       *
       * Erst wenn eine Datei wirklich gelesen wurde und der Nutzer einen
       * Ausschnitt gewählt hat, entsteht etwas in der Ablage. Wer den Dialog
       * abbricht oder eine unlesbare Datei erwischt, hinterlässt nichts.
       */
      uebernehmen: (ton, dateiname) => {
        void (async () => {
          try {
            zeigeMitgebrachtesGeraeusch(await maschine(dateiname), ton, dateiname);
          } catch (fehler) {
            logger.error('Schnellcheck fehlgeschlagen:', fehler);
          }
        })();
      },
      /**
       * Und derselbe zweite Ausgang wie auf der Maschinenebene.
       *
       * `vorhanden: false` ist hier keine Annahme, sondern eine Tatsache: Die
       * Maschine entsteht in diesem Augenblick. Es gibt nichts zu ersetzen —
       * auch beim zweiten Versuch nicht, denn ein abgelehnter Normalzustand
       * wurde nicht gespeichert.
       */
      normalzustand: {
        vorhanden: false,
        speichern: async (ton, dateiname) =>
          new ReferencePhase(await maschine(dateiname)).normalzustandAusTon(ton),
      },
    });
  });
}
