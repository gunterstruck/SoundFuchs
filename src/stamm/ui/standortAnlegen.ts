/**
 * Der eigenständige Standortweg.
 *
 * Er ist bewusst klein: Name plus entweder GPS oder Postleitzahl. Straße und
 * Hausnummer können zur Orientierung lokal ergänzt werden, lösen aber keine
 * Online-Geokodierung aus. GPS ist die schnelle Vor-Ort-Option, PLZ die
 * robuste Alternative für den Kartenpunkt.
 */

import type { Customer } from '@data/types.js';
import { t } from '../../i18n/index.js';
import { toast } from '../../ui/components/Toast.js';
import { aktuellePosition, Standortfehler, type GpsPunkt } from '../../services/deviceLocation.js';
import { ortZurPlz } from '../../services/plzGeocode.js';
import { STANDORT_GESPEICHERT, speichereStandort } from '../../services/standortCreate.js';
import { logger } from '@utils/logger.js';

let gps: GpsPunkt | null = null;
let vorherigerFokus: HTMLElement | null = null;
let aufgebaut = false;

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function gpsFehlertext(fehler: unknown): string {
  if (!(fehler instanceof Standortfehler)) return t('customers.gpsErrorUnavailable');
  if (fehler.art === 'verweigert') return t('customers.gpsErrorPermission');
  if (fehler.art === 'zeit') return t('customers.gpsErrorTimeout');
  return t('customers.gpsErrorUnavailable');
}

function status(text: string, fehler = false): void {
  const ausgabe = element<HTMLElement>('site-create-gps-status');
  if (!ausgabe) return;
  ausgabe.textContent = text;
  ausgabe.classList.toggle('input-error-visible', fehler);
}

async function ortNachtragen(): Promise<void> {
  const plz = element<HTMLInputElement>('site-create-plz')?.value.trim() ?? '';
  const ort = element<HTMLInputElement>('site-create-ort');
  if (!ort || !/^\d{5}$/.test(plz) || ort.dataset.selbst === '1') return;
  ort.value = (await ortZurPlz(plz)) ?? '';
}

async function gpsHolen(): Promise<void> {
  const knopf = element<HTMLButtonElement>('site-create-gps');
  if (!knopf) return;
  knopf.disabled = true;
  status(t('customers.gpsLocating'));
  try {
    gps = await aktuellePosition();
    status(
      t('customers.gpsReady', {
        accuracy: String(Math.max(1, Math.round(gps.genauigkeit))),
      })
    );
    knopf.querySelector('span')!.textContent = t('customers.gpsUpdate');
  } catch (fehler) {
    gps = null;
    status(gpsFehlertext(fehler), true);
  } finally {
    knopf.disabled = false;
  }
}

function zuruecksetzen(): void {
  gps = null;
  const name = element<HTMLInputElement>('site-create-name');
  const plz = element<HTMLInputElement>('site-create-plz');
  const ort = element<HTMLInputElement>('site-create-ort');
  const strasse = element<HTMLInputElement>('site-create-street');
  if (name) name.value = '';
  if (plz) plz.value = '';
  if (ort) {
    ort.value = '';
    delete ort.dataset.selbst;
  }
  if (strasse) strasse.value = '';
  const gpsKnopf = element<HTMLButtonElement>('site-create-gps');
  const gpsText = gpsKnopf?.querySelector('span');
  if (gpsText) gpsText.textContent = t('customers.gpsButton');
  status('');
  const fehler = element<HTMLElement>('site-create-error');
  if (fehler) fehler.textContent = '';
}

export function standortAnlegenSchliessen(): void {
  const dialog = element<HTMLElement>('site-create-modal');
  if (!dialog || dialog.style.display === 'none') return;
  dialog.style.display = 'none';
  vorherigerFokus?.focus();
  vorherigerFokus = null;
}

export function standortAnlegenOeffnen(): void {
  const dialog = element<HTMLElement>('site-create-modal');
  if (!dialog) return;
  vorherigerFokus = document.activeElement as HTMLElement | null;
  zuruecksetzen();
  dialog.style.display = 'flex';
  window.setTimeout(() => element<HTMLInputElement>('site-create-name')?.focus(), 50);
}

async function speichern(): Promise<void> {
  const nameFeld = element<HTMLInputElement>('site-create-name');
  const plzFeld = element<HTMLInputElement>('site-create-plz');
  const ortFeld = element<HTMLInputElement>('site-create-ort');
  const strasseFeld = element<HTMLInputElement>('site-create-street');
  const fehler = element<HTMLElement>('site-create-error');
  const speichernKnopf = element<HTMLButtonElement>('site-create-save');
  const name = nameFeld?.value.trim() ?? '';
  const plz = plzFeld?.value.trim() ?? '';

  if (!name) {
    if (fehler) fehler.textContent = t('customers.nameRequired');
    nameFeld?.focus();
    return;
  }
  if ((!gps && !/^\d{5}$/.test(plz)) || (plz && !/^\d{5}$/.test(plz))) {
    if (fehler) fehler.textContent = t('customers.plzOrGpsRequired');
    plzFeld?.focus();
    return;
  }

  if (fehler) fehler.textContent = '';
  if (speichernKnopf) speichernKnopf.disabled = true;
  try {
    const kunde = await speichereStandort({
      name,
      plz,
      ort: ortFeld?.value,
      strasse: strasseFeld?.value,
      gps,
    });
    standortAnlegenSchliessen();
    toast.success(t('customers.created', { name: kunde.name }));
    document.dispatchEvent(new CustomEvent<Customer>(STANDORT_GESPEICHERT, { detail: kunde }));
  } catch (grund) {
    logger.error('Standort konnte nicht angelegt werden', grund);
    if (fehler) fehler.textContent = t('customers.createError');
  } finally {
    if (speichernKnopf) speichernKnopf.disabled = false;
  }
}

export function standortAnlegenAufbauen(): void {
  if (aufgebaut) return;
  aufgebaut = true;

  element<HTMLButtonElement>('site-create-gps')?.addEventListener('click', () => void gpsHolen());
  element<HTMLInputElement>('site-create-plz')?.addEventListener(
    'input',
    () => void ortNachtragen()
  );
  element<HTMLInputElement>('site-create-ort')?.addEventListener('input', (ereignis) => {
    (ereignis.currentTarget as HTMLInputElement).dataset.selbst = '1';
  });
  element<HTMLButtonElement>('site-create-save')?.addEventListener('click', () => void speichern());
  element<HTMLButtonElement>('site-create-cancel')?.addEventListener(
    'click',
    standortAnlegenSchliessen
  );
  element<HTMLButtonElement>('site-create-close')?.addEventListener(
    'click',
    standortAnlegenSchliessen
  );

  const dialog = element<HTMLElement>('site-create-modal');
  dialog?.addEventListener('click', (ereignis) => {
    if (ereignis.target === dialog) standortAnlegenSchliessen();
  });
  dialog?.addEventListener('keydown', (ereignis) => {
    if (ereignis.key === 'Escape') standortAnlegenSchliessen();
  });
}
