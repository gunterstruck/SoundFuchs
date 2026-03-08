/**
 * ZANOBOT - UI CONSTANTS
 *
 * Centralized UI text constants using i18n for multi-language support.
 * These are now getters that return translated strings dynamically.
 */

import { t } from '../i18n/index.js';

/**
 * Button text constants
 * Used across different phases to ensure consistency
 */
export const BUTTON_TEXT = {
  // Recording modal buttons
  get STOP_REFERENCE() { return t('buttons.stop'); },
  get STOP_DIAGNOSE() { return t('buttons.stopAndSave'); },

  // Phase buttons
  get SCAN() { return t('buttons.scan'); },
  get CREATE_MACHINE() { return t('buttons.create'); },
  get RECORD() { return t('buttons.record'); },
  get DIAGNOSE() { return t('buttons.startDiagnosis'); },

  // Modal actions
  get CLOSE() { return t('buttons.close'); },
  get CANCEL() { return t('buttons.cancel'); },
  get SAVE() { return t('buttons.save'); },
  get DISCARD() { return t('buttons.discard'); },
};

/**
 * Status text constants
 */
export const STATUS_TEXT = {
  get HEALTHY() { return t('status.healthy'); },
  get UNCERTAIN() { return t('status.uncertain'); },
  get FAULTY() { return t('status.faulty'); },
  get UNKNOWN() { return t('status.unknown'); },
};

/**
 * Modal title constants
 */
export const MODAL_TITLE = {
  get RECORDING_REFERENCE() { return t('modals.referenceRecording'); },
  get RECORDING_DIAGNOSE() { return t('modals.liveDiagnosis'); },
  get SCANNER() { return t('modals.qrScanner'); },
};
