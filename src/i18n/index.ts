/**
 * ZANOBOT - INTERNATIONALIZATION (i18n) MODULE
 *
 * Provides multi-language support for the PWA.
 * Detects browser language and loads appropriate translations.
 *
 * Supported languages:
 * - de: German (default)
 * - en: English
 * - fr: French
 * - es: Spanish
 * - zh: Chinese
 *
 * Fallback: English for unsupported languages
 */

import { de } from './locales/de.js';
import { en } from './locales/en.js';
import { fr } from './locales/fr.js';
import { es } from './locales/es.js';
import { zh } from './locales/zh.js';

/**
 * Supported language codes
 */
export type SupportedLanguage = 'de' | 'en' | 'fr' | 'es' | 'zh';

/**
 * Translation dictionary type (recursive for nested keys)
 */
export type TranslationDict = {
  [key: string]: string | TranslationDict;
};

/**
 * All available translations
 */
const translations: Record<SupportedLanguage, TranslationDict> = {
  de,
  en,
  fr,
  es,
  zh,
};

/**
 * Current active language
 */
let currentLanguage: SupportedLanguage = 'en';

/**
 * Custom event name for language change notifications
 * Components can listen to this event to react to language changes
 */
export const LANGUAGE_CHANGE_EVENT = 'i18n:languagechange';

/**
 * Callback type for language change listeners
 */
export type LanguageChangeCallback = (newLang: SupportedLanguage, oldLang: SupportedLanguage) => void;

/**
 * Registered language change listeners
 */
const languageChangeListeners: Set<LanguageChangeCallback> = new Set();

/**
 * Detect browser language and set appropriate app language
 *
 * @returns Detected/selected language code
 */
export function detectLanguage(): SupportedLanguage {
  // Get browser language (e.g., "de-DE", "en-US", "zh-CN")
  const browserLang = navigator.language || (navigator as Navigator & { userLanguage?: string }).userLanguage || 'en';

  // Extract primary language code (e.g., "de" from "de-DE")
  const primaryLang = browserLang.split('-')[0].toLowerCase();

  // Check if language is supported
  const supportedLangs: SupportedLanguage[] = ['de', 'en', 'fr', 'es', 'zh'];

  if (supportedLangs.includes(primaryLang as SupportedLanguage)) {
    return primaryLang as SupportedLanguage;
  }

  // Fallback to English for unsupported languages
  return 'en';
}

/**
 * Initialize i18n system
 * Call this once at app startup
 *
 * Sets up:
 * - Initial language detection
 * - System language change listener (for when user changes device language)
 */
export function initI18n(): SupportedLanguage {
  currentLanguage = detectLanguage();

  // Update HTML lang attribute
  document.documentElement.lang = currentLanguage;

  // Listen for system language changes (e.g., user changes device language)
  // Note: 'languagechange' event is fired when navigator.language changes
  window.addEventListener('languagechange', handleSystemLanguageChange);

  console.log(`🌐 Language initialized: ${currentLanguage}`);

  return currentLanguage;
}

/**
 * Handle system language change event
 * Called when the user changes the device/browser language
 */
function handleSystemLanguageChange(): void {
  const newLang = detectLanguage();

  if (newLang !== currentLanguage) {
    console.log(`🌐 System language changed, updating app: ${currentLanguage} → ${newLang}`);
    setLanguage(newLang, true);
  }
}

/**
 * Get current language
 */
export function getLanguage(): SupportedLanguage {
  return currentLanguage;
}

/**
 * Set language manually (for testing or user preference)
 * Triggers UI update and notifies listeners
 *
 * @param lang - Language code to set
 * @param updateUI - Whether to update DOM (default: true)
 */
export function setLanguage(lang: SupportedLanguage, updateUI: boolean = true): void {
  const oldLang = currentLanguage;

  // Skip if language hasn't changed
  if (oldLang === lang) {
    return;
  }

  currentLanguage = lang;
  document.documentElement.lang = lang;

  console.log(`🌐 Language changed: ${oldLang} → ${lang}`);

  // Notify registered listeners
  notifyLanguageChange(oldLang, lang);

  // Update DOM elements with data-i18n attributes
  if (updateUI) {
    translateDOM();

    // Dispatch custom event for components that need to re-render
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, {
      detail: { newLang: lang, oldLang }
    }));
  }
}

/**
 * Notify all registered language change listeners
 */
function notifyLanguageChange(oldLang: SupportedLanguage, newLang: SupportedLanguage): void {
  languageChangeListeners.forEach(callback => {
    try {
      callback(newLang, oldLang);
    } catch (error) {
      console.error('Error in language change listener:', error);
    }
  });
}

/**
 * Register a callback to be called when language changes
 *
 * @param callback - Function to call when language changes
 * @returns Unsubscribe function
 */
export function onLanguageChange(callback: LanguageChangeCallback): () => void {
  languageChangeListeners.add(callback);
  return () => languageChangeListeners.delete(callback);
}

/**
 * Get nested value from object using dot notation
 *
 * @param obj - Object to traverse
 * @param path - Dot-separated path (e.g., "buttons.save")
 * @returns Value at path or undefined
 */
function getNestedValue(obj: TranslationDict, path: string): string | undefined {
  const keys = path.split('.');
  let current: TranslationDict | string = obj;

  for (const key of keys) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = current[key];
    if (current === undefined) {
      return undefined;
    }
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Translate a key to the current language
 *
 * Supports:
 * - Simple keys: t('buttons.save')
 * - Nested keys: t('errors.camera.denied')
 * - Parameter interpolation: t('messages.machineLoaded', { name: 'Motor 1' })
 *
 * @param key - Translation key (dot notation for nested)
 * @param params - Optional parameters for interpolation
 * @returns Translated string or key if not found
 */
export function t(key: string, params?: Record<string, string | number>): string {
  // Get translation from current language
  let translation = getNestedValue(translations[currentLanguage], key);

  // Fallback to English if not found in current language
  if (translation === undefined && currentLanguage !== 'en') {
    translation = getNestedValue(translations.en, key);
  }

  // Fallback to German (original) if not found in English
  if (translation === undefined && currentLanguage !== 'de') {
    translation = getNestedValue(translations.de, key);
  }

  // Return key if translation not found
  if (translation === undefined) {
    console.warn(`⚠️ Translation missing: ${key}`);
    return key;
  }

  // Interpolate parameters: {{name}} -> value
  if (params) {
    translation = translation.replace(/\{\{(\w+)\}\}/g, (_, paramKey) => {
      const value = params[paramKey];
      return value !== undefined ? String(value) : `{{${paramKey}}}`;
    });
  }

  return translation;
}

/**
 * Get locale string for Intl/toLocaleString APIs
 * Maps our language codes to full locale strings
 */
export function getLocale(): string {
  const localeMap: Record<SupportedLanguage, string> = {
    de: 'de-DE',
    en: 'en-US',
    fr: 'fr-FR',
    es: 'es-ES',
    zh: 'zh-CN',
  };
  return localeMap[currentLanguage] || 'en-US';
}

/**
 * Translate all DOM elements with data-i18n attributes
 *
 * Usage in HTML:
 * - Text content:      <h3 data-i18n="identify.selectMachine">Maschine auswählen</h3>
 * - Placeholder:       <input data-i18n-placeholder="identify.machineName" placeholder="Maschinenname">
 * - Aria label:        <button data-i18n-aria="buttons.close" aria-label="Schließen">
 *
 * Call after DOM is ready and i18n is initialized.
 */
export function translateDOM(): void {
  // Translate text content
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      const translated = t(key);

      if (el.children.length === 0) {
        // Leaf element — safe to replace textContent directly
        el.textContent = translated;
      } else {
        // Element has child elements (e.g., <svg> icons in buttons).
        // Only replace direct text nodes to preserve child elements.
        const childNodes = Array.from(el.childNodes);
        for (const node of childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            el.removeChild(node);
          }
        }
        // Append translated text after child elements (e.g., icon + label)
        el.appendChild(document.createTextNode(' ' + translated));
      }
    }
  });

  // Translate placeholders
  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      (el as HTMLInputElement).placeholder = t(key);
    }
  });

  // Translate aria-labels
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) {
      el.setAttribute('aria-label', t(key));
    }
  });
}

/**
 * Shorthand for t() function - can be imported as default
 */
export default t;
