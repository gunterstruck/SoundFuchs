/**
 * Settings backup helper.
 *
 * Collects and restores the user's UI settings so they can optionally be
 * included in a database export/import:
 *  - localStorage preferences (theme, view level, visualizer, recording,
 *    drift detector, room compensation, cherry-picking)
 *  - app_settings stored in IndexedDB (custom hero banners per theme)
 *
 * The actual IndexedDB data (machines, recordings, diagnoses) is handled
 * separately by exportData()/importData() in db.ts and is NOT part of this.
 */

import {
  exportAppSettings,
  importAppSettings,
  type SerializedAppSetting,
} from '@data/db.js';
import { logger } from './logger.js';

/**
 * All localStorage keys that make up the user's UI settings.
 * Kept in sync with UI_SETTINGS_KEYS in viewLevelSettings.ts plus the
 * persisted view level and theme.
 */
const SETTINGS_LOCALSTORAGE_KEYS = [
  'zanobo.visualizer.settings',
  'zanobo.recording.settings',
  'zanobo-drift-detector-settings',
  'zanobo-room-comp-settings',
  'zanobo-cherry-pick-settings',
  'zanobo.view-level',
  'zanobo-theme',
] as const;

/**
 * Snapshot of all user settings, suitable for embedding in a backup file.
 */
export interface SettingsBackup {
  localStorage: Record<string, string>;
  appSettings: SerializedAppSetting[];
}

/**
 * Collect the current UI settings into a JSON-serializable snapshot.
 */
export async function collectSettings(): Promise<SettingsBackup> {
  const stored: Record<string, string> = {};

  for (const key of SETTINGS_LOCALSTORAGE_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) {
        stored[key] = value;
      }
    } catch {
      /* localStorage not available – skip */
    }
  }

  let appSettings: SerializedAppSetting[] = [];
  try {
    appSettings = await exportAppSettings();
  } catch (error) {
    logger.warn('⚠️ Failed to collect app settings (banners) for export', error);
  }

  return { localStorage: stored, appSettings };
}

/**
 * Restore settings from a backup snapshot.
 *
 * localStorage values are only restored for known, allow-listed keys to avoid
 * importing arbitrary data. The caller should reload the app afterwards so the
 * restored theme/banner/view-level take effect.
 */
export async function applySettings(settings: SettingsBackup): Promise<void> {
  if (settings.localStorage) {
    for (const [key, value] of Object.entries(settings.localStorage)) {
      if (!(SETTINGS_LOCALSTORAGE_KEYS as readonly string[]).includes(key)) {
        continue; // safety: ignore unknown keys
      }
      try {
        localStorage.setItem(key, value);
      } catch {
        /* localStorage not available – skip */
      }
    }
  }

  if (settings.appSettings?.length) {
    try {
      await importAppSettings(settings.appSettings);
    } catch (error) {
      logger.warn('⚠️ Failed to import app settings (banners)', error);
    }
  }

  logger.info('✅ Settings restored from backup');
}

/**
 * Type guard: does a parsed backup object contain a settings snapshot?
 */
export function hasSettingsBackup(data: unknown): data is { settings: SettingsBackup } {
  if (data === null || typeof data !== 'object' || !('settings' in data)) {
    return false;
  }

  const settings = (data as { settings: unknown }).settings;
  if (settings === null || typeof settings !== 'object') {
    return false;
  }

  const candidate = settings as Partial<SettingsBackup>;
  const hasLocalStorage =
    !!candidate.localStorage &&
    typeof candidate.localStorage === 'object' &&
    Object.keys(candidate.localStorage).length > 0;
  const hasAppSettings = Array.isArray(candidate.appSettings) && candidate.appSettings.length > 0;

  return hasLocalStorage || hasAppSettings;
}
