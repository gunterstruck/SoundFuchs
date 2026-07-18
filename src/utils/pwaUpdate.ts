/**
 * ZANOBOT - PWA UPDATE CONTROLLER
 *
 * Active update handling for the installed PWA:
 * - actively checks for a new version on launch, on resume (visibility), and
 *   hourly while open (the browser otherwise only checks ~daily / on navigation),
 * - shows a DISCREET prompt ("Neue Version – aktualisieren?") instead of a
 *   silent reload,
 * - if the user ignores/declines, re-prompts at most once per day,
 * - NEVER reloads while a measurement is running (deferred until it ends).
 *
 * The update only swaps the cached app assets. The machine data lives in
 * IndexedDB, which a service-worker update never touches.
 */

import { registerSW } from 'virtual:pwa-register';
import { notify } from './notifications.js';
import { t } from '../i18n/index.js';
import { logger } from './logger.js';
import { isMeasurementActive, onMeasurementEnd } from './measurementActivity.js';

const DISMISS_KEY = 'zanobot-update-prompt-shown-at';
const PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // re-prompt at most once per day
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // re-check hourly while the app is open

export function initPwaUpdate(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  let updatePending = false; // a new version is waiting to be activated
  let promptVisible = false; // the discreet toast is currently shown
  let applying = false; // an update was accepted and will reload

  const updateSW = registerSW({
    onNeedRefresh() {
      // A new service worker is waiting (registerType: 'prompt' → it does NOT
      // auto-activate, so the current session keeps running until we apply it).
      updatePending = true;
      maybeShowPrompt();
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => {});
      // On resume from background: re-check and re-evaluate the prompt.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          check();
          maybeShowPrompt();
        }
      });
      // Periodic check while the app stays open.
      setInterval(check, CHECK_INTERVAL_MS);
    },
    onRegisterError(error) {
      logger.warn('Service worker registration failed:', error);
    },
  });

  // When a running measurement finishes, a pending update may now be applied.
  onMeasurementEnd(() => maybeShowPrompt());

  function promptOnCooldown(): boolean {
    const shownAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Number.isFinite(shownAt) && Date.now() - shownAt < PROMPT_COOLDOWN_MS;
  }

  function applyUpdate(): void {
    if (applying) return;
    if (isMeasurementActive()) {
      // Safety: never reload mid-measurement – defer until it ends.
      notify.info(t('update.deferred'));
      onMeasurementEnd(() => {
        if (!applying) {
          applying = true;
          void updateSW(true); // skipWaiting + reload
        }
      });
      return;
    }
    applying = true;
    void updateSW(true); // skipWaiting + reload into the new version
  }

  function maybeShowPrompt(): void {
    if (!updatePending || promptVisible || applying) return;
    if (isMeasurementActive()) return; // wait until the measurement is done
    if (promptOnCooldown()) return; // declined recently → at most once per day

    promptVisible = true;
    // Record the show time so an ignored/declined prompt does not reappear for
    // 24h (across sessions). Accepting it reloads anyway.
    localStorage.setItem(DISMISS_KEY, String(Date.now()));

    notify.info(t('update.available.message'), {
      title: t('update.available.title'),
      duration: 0,
      dismissible: true,
      actions: [
        {
          label: t('update.available.action'),
          onClick: () => {
            promptVisible = false;
            applyUpdate();
          },
        },
      ],
    });
  }
}
