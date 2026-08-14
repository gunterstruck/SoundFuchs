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
 * Wer einen anlegt, tippt zwei Dinge: Namen und Postleitzahl. Der Ort füllt
 * sich selbst — das ist von TourFuchs abgeschaut und der Grund, warum hier
 * eine Postleitzahl steht und keine Adresse. Fünf Ziffern, und die App weiß
 * Ort und Koordinaten; eine Adresse wären vier Felder und eine Netzabfrage.
 */

import { saveCustomer, getAllCustomers } from '@data/db.js';
import { ortZurPlz, verorteUeberPlz } from '../../services/plzGeocode.js';
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
  private hinweis: HTMLElement | null = null;

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
    this.hinweis = document.getElementById('customer-plz-hint');

    if (!this.auswahl) return;

    this.auswahl.addEventListener('change', () => this.zeigeNeuenBlock());

    this.plzFeld?.addEventListener('input', () => {
      void this.ortNachtragen();
    });

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
    if (!/^\d{5}$/.test(plz)) {
      this.plzFeld?.focus();
      return { fehler: t('customers.plzInvalid') };
    }

    const id =
      `K-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();
    const ort = this.ortFeld?.value.trim() || (await ortZurPlz(plz)) || undefined;
    const punkt = await verorteUeberPlz(plz, id);

    // Eine unbekannte Postleitzahl hält niemanden auf: Der Kunde wird
    // angelegt, er hat nur keinen Punkt auf der Karte. `geo: 'none'` hält das
    // fest, statt eine Stelle zu erfinden.
    const kunde: Customer = {
      id,
      name,
      plz,
      ort,
      lat: punkt?.lat,
      lng: punkt?.lng,
      geo: punkt ? 'plz' : 'none',
      createdAt: Date.now(),
    };
    await saveCustomer(kunde);
    await this.lade();
    this.auswahl.value = id;
    this.zeigeNeuenBlock();
    return { kundeId: id };
  }

  /** Nach dem Anlegen einer Maschine aufräumen. */
  public zuruecksetzen(): void {
    if (this.auswahl) this.auswahl.value = '';
    if (this.nameFeld) this.nameFeld.value = '';
    if (this.plzFeld) this.plzFeld.value = '';
    if (this.ortFeld) this.ortFeld.value = '';
    if (this.hinweis) this.hinweis.textContent = '';
    this.ortSelbstGefuellt = true;
    this.zeigeNeuenBlock();
  }
}
