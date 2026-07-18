/**
 * ZANOBOT - View Level Settings
 *
 * Manages the User Experience View Level system:
 * - basic: Simple "traffic light" interface for operators
 * - advanced: Additional details for supervisors/maintenance staff
 * - expert: Full technical details for engineers
 *
 * Follows the same pattern as visualizerSettings.ts
 */

import { t } from '../i18n/index.js';
import { logger } from './logger.js';

export type ViewLevel = 'basic' | 'advanced' | 'expert';

export const VIEW_LEVEL_EVENT = 'zanobot:view-level-change';

const STORAGE_KEY = 'zanobot.view-level';

const defaultLevel: ViewLevel = 'basic';

/**
 * Valid view levels for validation
 */
const validLevels: ViewLevel[] = ['basic', 'advanced', 'expert'];

/**
 * Display names for each view level (German)
 */
export const viewLevelDisplayNames: Record<ViewLevel, string> = {
  basic: t('viewLevels.basicLabel'),
  advanced: t('viewLevels.advancedLabel'),
  expert: t('viewLevels.expertLabel'),
};

/**
 * Descriptions for each view level (German)
 */
export const viewLevelDescriptions: Record<ViewLevel, string> = {
  basic: t('viewLevels.basic'),
  advanced: t('viewLevels.advanced'),
  expert: t('viewLevels.expert'),
};

/**
 * Read view level from localStorage
 */
const readFromStorage = (): ViewLevel => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultLevel;
    }
    // Validate the stored value
    if (validLevels.includes(raw as ViewLevel)) {
      return raw as ViewLevel;
    }
    return defaultLevel;
  } catch {
    return defaultLevel;
  }
};

/**
 * Read view level from DOM attribute (for temporary overrides like NFC onboarding)
 */
const readFromDom = (): ViewLevel | null => {
  try {
    const domValue = document.documentElement.getAttribute('data-view-level');
    if (domValue && validLevels.includes(domValue as ViewLevel)) {
      return domValue as ViewLevel;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Get the current view level.
 *
 * IMPORTANT: This function checks the DOM attribute FIRST, then falls back to localStorage.
 * This ensures that temporary overrides (like NFC onboarding forcing 'basic' mode)
 * are respected by all code that reads the view level.
 *
 * Priority:
 * 1. DOM attribute (data-view-level) - for temporary overrides
 * 2. localStorage - for persisted user preference
 * 3. defaultLevel ('basic') - fallback
 */
export const getViewLevel = (): ViewLevel => {
  // First check DOM attribute (handles temporary overrides like NFC onboarding)
  const domLevel = readFromDom();
  if (domLevel !== null) {
    return domLevel;
  }
  // Fall back to localStorage (persisted user preference)
  return readFromStorage();
};

/**
 * Set the view level and persist to localStorage
 * Also updates the data attribute on the HTML element
 */
export const setViewLevel = (level: ViewLevel): ViewLevel => {
  // Validate the level
  if (!validLevels.includes(level)) {
    level = defaultLevel;
  }

  // Persist to localStorage with quota check
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch (error) {
    // Handle storage errors (e.g., private mode, quota exceeded)
    logger.warn('⚠️ Failed to persist view level to localStorage:', error);
  }

  // Update the data attribute on the HTML element
  document.documentElement.setAttribute('data-view-level', level);

  // Dispatch custom event for reactive updates
  window.dispatchEvent(
    new CustomEvent<ViewLevel>(VIEW_LEVEL_EVENT, { detail: level })
  );

  return level;
};

/**
 * Apply the saved view level to the document
 * Should be called on app initialization
 */
export const applyViewLevel = (): ViewLevel => {
  const level = readFromStorage();
  document.documentElement.setAttribute('data-view-level', level);
  return level;
};

/**
 * Get all available view levels
 */
export const getAvailableViewLevels = (): ViewLevel[] => [...validLevels];

/**
 * Get the stored (persisted) view level from localStorage.
 *
 * Unlike getViewLevel(), this function ONLY reads from localStorage and
 * ignores any temporary DOM overrides. Use this for Settings UI to show
 * the user's actual saved preference.
 *
 * @returns The stored view level from localStorage (or default if not set)
 */
export const getStoredViewLevel = (): ViewLevel => readFromStorage();

/**
 * Set the view level temporarily WITHOUT persisting to localStorage.
 * Used for NFC onboarding to force "basic" mode without overwriting user preference.
 *
 * @param level - The view level to apply temporarily
 * @param reason - Optional reason for logging (e.g., 'nfc_onboarding')
 * @returns The applied level
 */
export const setViewLevelTemporary = (level: ViewLevel, reason?: string): ViewLevel => {
  // Validate the level
  if (!validLevels.includes(level)) {
    level = defaultLevel;
  }

  // Update the data attribute on the HTML element (but DO NOT persist to localStorage)
  document.documentElement.setAttribute('data-view-level', level);

  // Dispatch custom event for reactive updates
  window.dispatchEvent(
    new CustomEvent<ViewLevel>(VIEW_LEVEL_EVENT, { detail: level })
  );

  // Log for debugging
  if (reason) {
    logger.debug(`[ViewLevel] Temporary set to "${level}" (reason: ${reason})`);
  }

  return level;
};

/**
 * Restore the view level from localStorage (undo temporary override).
 * Called after NFC onboarding completes to restore user's preferred setting.
 *
 * @returns The restored level from localStorage
 */
export const restoreViewLevel = (): ViewLevel => {
  const savedLevel = readFromStorage();

  // Re-apply the saved level
  document.documentElement.setAttribute('data-view-level', savedLevel);

  // Dispatch custom event for reactive updates
  window.dispatchEvent(
    new CustomEvent<ViewLevel>(VIEW_LEVEL_EVENT, { detail: savedLevel })
  );

  logger.debug(`[ViewLevel] Restored to saved preference: "${savedLevel}"`);

  return savedLevel;
};

// ════════════════════════════════════════════════════════════
// Defaults / Reset
// ════════════════════════════════════════════════════════════

const INITIALIZED_KEY = 'zanobot.initialized';

/**
 * All localStorage keys managed by the app's UI settings.
 * IndexedDB data (machines, recordings, diagnoses) is NOT included.
 */
const UI_SETTINGS_KEYS = [
  'zanobot.visualizer.settings',
  'zanobot.recording.settings',
  'zanobot-drift-detector-settings',
  'zanobot-room-comp-settings',
  'zanobot-cherry-pick-settings',
] as const;

/**
 * Apply factory defaults: reset all UI settings to their initial state.
 *
 * - Sets view level to 'basic' (persisted)
 * - Sets theme to 'focus' (persisted)
 * - Removes localStorage keys for visualizer, recording, drift, room-comp,
 *   and cherry-pick settings so each module falls back to its built-in defaults.
 * - Does NOT touch IndexedDB (machines, recordings, diagnoses, references).
 * - Does NOT touch microphone selection, banner images, or language.
 */
export const applyDefaults = (): void => {
  // 1. View level → basic (persists + DOM + event)
  setViewLevel('basic');

  // 2. Theme → focus (persists + DOM + event)
  if (window.ZanobotTheme?.setTheme) {
    window.ZanobotTheme.setTheme('focus');
  } else {
    try { localStorage.setItem('zanobot-theme', 'focus'); } catch { /* ignore */ }
    document.documentElement.setAttribute('data-theme', 'focus');
  }

  // 3. Remove all other UI-setting keys → modules fall back to built-in defaults
  for (const key of UI_SETTINGS_KEYS) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }

  logger.info('[Defaults] All UI settings reset to factory defaults');
};

/**
 * Apply defaults temporarily (DOM only, no localStorage writes).
 * Used during NFC/QR onboarding to present a clean UI without
 * overwriting the user's saved preferences.
 *
 * Call `restoreViewLevel()` + `restoreTheme()` to undo.
 */
export const applyDefaultsTemporary = (): void => {
  // View level → basic (DOM only, already handled by setViewLevelTemporary)
  setViewLevelTemporary('basic', 'temporary_defaults');

  // Theme → focus (DOM only)
  document.documentElement.setAttribute('data-theme', 'focus');
};

/**
 * Restore theme from localStorage after a temporary override.
 */
export const restoreTheme = (): void => {
  try {
    const savedTheme = localStorage.getItem('zanobot-theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: savedTheme } }));
    }
  } catch { /* ignore */ }
  logger.debug('[Theme] Restored to saved preference');
};

/**
 * First-launch check: if the app has never been initialized,
 * apply defaults and set the initialized marker.
 * Should be called early in the app init flow, before UI rendering.
 */
export const checkFirstLaunch = (): void => {
  try {
    if (!localStorage.getItem(INITIALIZED_KEY)) {
      applyDefaults();
      localStorage.setItem(INITIALIZED_KEY, 'true');
      logger.info('[Defaults] First launch detected – defaults applied');
    }
  } catch {
    // localStorage not available – defaults will be used by each module anyway
  }
};
