/**
 * ZANOBOT - DIAGNOSIS AUDIO RETENTION SETTING
 *
 * Controls whether the measurement audio of a diagnosis is kept (so a past
 * check can later be re-opened with A/B listening / difference isolation):
 *
 * - 'none'   : never store measurement audio (smallest footprint)
 * - 'latest' : keep only the most recent measurement per machine (default)
 * - 'all'    : keep every measurement (largest footprint)
 *
 * Stored audio is local-only, like everything else in the app.
 */

export type DiagnosisAudioMode = 'none' | 'latest' | 'all';

export const DIAGNOSIS_AUDIO_SETTINGS_EVENT = 'zanobot:diagnosis-audio-settings-change';

const STORAGE_KEY = 'zanobot.diagnosis-audio.mode';
const defaultMode: DiagnosisAudioMode = 'latest';

function validate(value: unknown): DiagnosisAudioMode {
  return value === 'none' || value === 'latest' || value === 'all' ? value : defaultMode;
}

export function getDiagnosisAudioMode(): DiagnosisAudioMode {
  try {
    return validate(localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultMode;
  }
}

export function setDiagnosisAudioMode(mode: DiagnosisAudioMode): DiagnosisAudioMode {
  const next = validate(mode);
  try {
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(
      new CustomEvent<DiagnosisAudioMode>(DIAGNOSIS_AUDIO_SETTINGS_EVENT, { detail: next })
    );
  } catch (error) {
    throw new Error(
      `Failed to save diagnosis audio setting: ${error instanceof Error ? error.message : 'localStorage not available'}`
    );
  }
  return next;
}
