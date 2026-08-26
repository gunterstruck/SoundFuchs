/**
 * SOUNDFUCHS — DAS KUNDENFELD IM ANLEGEN-FORMULAR
 *
 * Eine Maschine steht irgendwo. Wer sie anlegt, weiß in diesem Moment am
 * besten, bei wem — später weiß es niemand mehr. Deshalb sitzt das Kundenfeld
 * dort, wo die Maschine entsteht, und nicht in einer eigenen Verwaltung, die
 * man erst suchen müsste.
 *
 * Es kostet niemanden etwas: Die Auswahl steht auf „kein Kunde", und wer sie
 * dort stehen lässt, merkt vom ganzen Vorgang nichts. Der Bestand funktioniert
 * ohne einen einzigen Kunden weiter (docs/kunden-und-karte.md §2).
 *
 * Wer einen anlegt, braucht nur Namen und Postleitzahl. Der Ort füllt sich
 * selbst — das ist von TourFuchs abgeschaut. Eine Straße kann zur Orientierung
 * ergänzt werden, bleibt aber reine lokale Anzeige: Fünf Ziffern genügen
 * weiterhin für Ort und Koordinaten, ohne Adressabfrage im Netz.
 */

import { getAllCustomers } from '@data/db.js';
import { ortZurPlz } from '../../services/plzGeocode.js';
import { aktuellePosition, Standortfehler, type GpsPunkt } from '../../services/deviceLocation.js';
import { STANDORT_GESPEICHERT, speichereStandort } from '../../services/standortCreate.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';
import type { Customer } from '@data/types.js';

/** Sonderwert der Auswahlliste: „einen neuen Kunden anlegen". */
const NEU = '__neu__';

/**
 * Ergebnis der Auswertung beim Speichern.
 *
 * `fehler` ist gesetzt, wenn die Eingabe unvollständig ist — dann wird die
 * Maschine NICHT angelegt. Ein halb angelegter Kunde wäre schlimmer als
 * keiner: Man sähe ihn in der Liste und wüsste nicht, was ihm fehlt.
 */
export interface Kundenwahl {
  kundeId?: string;
  fehler?: string;
}

export class CustomerField {
  private auswahl: HTMLSelectElement | null = null;
  private neuerBlock: HTMLElement | null = null;
  private nameFeld: HTMLInputElement | null = null;
  private plzFeld: HTMLInputElement | null = null;
  private ortFeld: HTMLInputElement | null = null;
  private strasseFeld: HTMLInputElement | null = null;
  private hinweis: HTMLElement | null = null;
  private gpsKnopf: HTMLButtonElement | null = null;
  private gpsHinweis: HTMLElement | null = null;
  private gpsPunkt: GpsPunkt | null = null;

  /**
   * Ob der Ort vom Menschen stammt. Nur ein leeres oder selbst gefülltes Feld
   * wird überschrieben — wer „Essen-Rüttenscheid" eingetippt hat, soll es
   * nicht bei der nächsten Ziffer verlieren.
   */
  private ortSelbstGefuellt = true;

  public init(): void {
    this.auswahl = document.getElementById('machine-customer-select') as HTMLSelectElement | null;
    this.neuerBlock = document.getElementById('new-customer-fields');
    this.nameFeld = document.getElementById('customer-name-input') as HTMLInputElement | null;
    this.plzFeld = document.getElementById('customer-plz-input') as HTMLInputElement | null;
    this.ortFeld = document.getElementById('customer-ort-input') as HTMLInputElement | null;
    this.strasseFeld = document.getElementById('customer-street-input') as HTMLInputElement | null;
    this.hinweis = document.getElementById('customer-plz-hint');
    this.gpsKnopf = document.getElementById('customer-use-gps-btn') as HTMLButtonElement | null;
    this.gpsHinweis = document.getElementById('customer-gps-status');

    if (!this.auswahl) return;

    this.auswahl.addEventListener('change', () => this.zeigeNeuenBlock());

    this.plzFeld?.addEventListener('input', () => {
      void this.ortNachtragen();
    });

    this.gpsKnopf?.addEventListener('click', () => void this.gpsHolen());

    // Ein Standort kann inzwischen außerhalb dieses Formulars vorbereitet
    // werden. Ohne dieses Nachladen sähe das direkt danach geöffnete
    // Maschinenformular noch die alte Auswahlliste und verlöre die bekannte
    // Zuordnung. `neueMaschineAmStandort` wartet bereits auf genau dieses
    // asynchrone Nachziehen.
    document.addEventListener(STANDORT_GESPEICHERT, () => void this.lade());

    // Wer den Ort anfasst, behält ihn.
    this.ortFeld?.addEventListener('input', () => {
      this.ortSelbstGefuellt = false;
    });

    void this.lade();
  }

  /**
   * Die Auswahlliste aus dem Bestand füllen.
   *
   * Wird nach jedem Anlegen erneut aufgerufen, damit ein frisch angelegter
   * Kunde beim nächsten Mal in der Liste steht statt doppelt angelegt zu
   * werden.
   */
  public async lade(): Promise<void> {
    if (!this.auswahl) return;
    const gewaehlt = this.auswahl.value;
    let kunden: Customer[] = [];
    try {
      kunden = await getAllCustomers();
    } catch (fehler) {
      logger.warn('Kundenliste nicht ladbar', fehler);
    }

    // Nur die eigenen Einträge werden ersetzt. Die beiden festen Einträge
    // („kein Kunde", „+ Neuer Kunde") stehen im HTML und tragen dort ihre
    // Übersetzungsschlüssel — würde man sie hier bauen, blieben sie beim
    // Sprachwechsel in der alten Sprache stehen.
    this.auswahl.querySelectorAll('option[data-kunde]').forEach((o) => o.remove());
    const marke = this.auswahl.querySelector(`option[value="${NEU}"]`);
    for (const kunde of kunden) {
      const eintrag = new Option(kunde.ort ? `${kunde.name} · ${kunde.ort}` : kunde.name, kunde.id);
      eintrag.dataset.kunde = '1';
      this.auswahl.insertBefore(eintrag, marke);
    }

    // Die vorherige Wahl überlebt das Neuladen, sofern es sie noch gibt.
    if (gewaehlt && Array.from(this.auswahl.options).some((o) => o.value === gewaehlt)) {
      this.auswahl.value = gewaehlt;
    }
    this.zeigeNeuenBlock();
  }

  private zeigeNeuenBlock(): void {
    if (!this.neuerBlock) return;
    const neu = this.auswahl?.value === NEU;
    this.neuerBlock.style.display = neu ? '' : 'none';
    if (neu) this.nameFeld?.focus();
  }

  /**
   * Den Ort zur eingegebenen Postleitzahl nachtragen.
   *
   * Die Datei mit den Ortsnamen wird erst hier geholt — wer nie einen Kunden
   * anlegt, lädt sie nie (siehe plzGeocode.ts).
   */
  private async ortNachtragen(): Promise<void> {
    if (!this.plzFeld || !this.ortFeld) return;
    const plz = this.plzFeld.value.trim();
    if (!/^\d{5}$/.test(plz)) return;

    const ort = await ortZurPlz(plz);
    if (ort && this.ortSelbstGefuellt) {
      this.ortFeld.value = ort;
    }
    if (this.hinweis) {
      this.hinweis.textContent = ort ? t('customers.plzFound', { ort }) : t('customers.plzUnknown');
    }
  }

  /** GPS nur nach einem ausdrücklichen Tipp anfragen. */
  private async gpsHolen(): Promise<void> {
    if (!this.gpsKnopf) return;
    this.gpsKnopf.disabled = true;
    if (this.gpsHinweis) this.gpsHinweis.textContent = t('customers.gpsLocating');
    try {
      this.gpsPunkt = await aktuellePosition();
      if (this.gpsHinweis) {
        this.gpsHinweis.textContent = t('customers.gpsReady', {
          accuracy: String(Math.max(1, Math.round(this.gpsPunkt.genauigkeit))),
        });
      }
      const text = this.gpsKnopf.querySelector('span');
      if (text) text.textContent = t('customers.gpsUpdate');
    } catch (fehler) {
      this.gpsPunkt = null;
      if (this.gpsHinweis) {
        this.gpsHinweis.textContent =
          fehler instanceof Standortfehler && fehler.art === 'verweigert'
            ? t('customers.gpsErrorPermission')
            : fehler instanceof Standortfehler && fehler.art === 'zeit'
              ? t('customers.gpsErrorTimeout')
              : t('customers.gpsErrorUnavailable');
      }
    } finally {
      this.gpsKnopf.disabled = false;
    }
  }

  /**
   * Auswerten, was im Formular steht — und bei Bedarf den Kunden anlegen.
   *
   * Wird beim Speichern der Maschine gerufen. Der Rückgabewert ist die
   * Kennung, die an der Maschine hängen bleibt.
   */
  public async ermittleKunde(): Promise<Kundenwahl> {
    if (!this.auswahl) return {};
    const wahl = this.auswahl.value;
    if (!wahl) return {};
    if (wahl !== NEU) return { kundeId: wahl };

    const name = this.nameFeld?.value.trim() ?? '';
    const plz = this.plzFeld?.value.trim() ?? '';

    if (!name) {
      this.nameFeld?.focus();
      return { fehler: t('customers.nameRequired') };
    }
    if ((!this.gpsPunkt && !/^\d{5}$/.test(plz)) || (plz && !/^\d{5}$/.test(plz))) {
      this.plzFeld?.focus();
      return { fehler: t('customers.plzOrGpsRequired') };
    }

    // Derselbe Speicherweg wie im eigenständigen Standortdialog. Damit kann
    // ein Standort wahlweise aus einer PLZ-Ortsmitte oder aus der bewusst
    // abgefragten Geräteposition entstehen, ohne zwei Datenformate zu bauen.
    const kunde = await speichereStandort({
      name,
      plz,
      ort: this.ortFeld?.value,
      strasse: this.strasseFeld?.value,
      gps: this.gpsPunkt,
    });
    await this.lade();
    this.auswahl.value = kunde.id;
    this.zeigeNeuenBlock();
    return { kundeId: kunde.id };
  }

  /** Nach dem Anlegen einer Maschine aufräumen. */
  public zuruecksetzen(): void {
    if (this.auswahl) this.auswahl.value = '';
    if (this.nameFeld) this.nameFeld.value = '';
    if (this.plzFeld) this.plzFeld.value = '';
    if (this.ortFeld) this.ortFeld.value = '';
    if (this.strasseFeld) this.strasseFeld.value = '';
    if (this.hinweis) this.hinweis.textContent = '';
    if (this.gpsHinweis) this.gpsHinweis.textContent = '';
    this.gpsPunkt = null;
    const gpsText = this.gpsKnopf?.querySelector('span');
    if (gpsText) gpsText.textContent = t('customers.gpsButton');
    this.ortSelbstGefuellt = true;
    this.zeigeNeuenBlock();
  }
}
