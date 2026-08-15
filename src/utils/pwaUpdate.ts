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
const PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // nur nach ausdrücklichem „Später"
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // stündlich, solange die App offen ist
const FOCUS_CHECK_THROTTLE_MS = 5 * 60 * 1000; // beim Zurückkommen, aber nicht ständig

/**
 * Die Anmeldung des Service Workers, sobald sie vorliegt.
 *
 * Sie wird für die Prüfung von Hand gebraucht (Knopf im Dialog „Über
 * SoundFuchs"). Ohne diesen Weg bleibt einem nur warten und hoffen — und
 * genau das war die Klage: „Sonst hab ich immer Probleme, die aktuelle
 * Version zu haben." Eine Frage, die man selbst stellen kann, ist die halbe
 * Antwort; die andere Hälfte ist die Bauzeit, die im selben Dialog steht.
 */
let anmeldung: ServiceWorkerRegistration | null = null;

/** Ergebnis einer Prüfung von Hand. */
export type Updateergebnis = 'update-bereit' | 'aktuell' | 'nicht-verfuegbar';

/**
 * Von Hand nachsehen, ob eine neue Fassung bereitliegt.
 *
 * Antwortet immer — auch mit „aktuell". Ein Knopf, der bei Erfolg schweigt,
 * ist von einem kaputten nicht zu unterscheiden.
 */
export async function pruefeAufUpdate(): Promise<Updateergebnis> {
  if (!anmeldung) return 'nicht-verfuegbar';
  try {
    await anmeldung.update();
  } catch (fehler) {
    logger.warn('Update-Prüfung fehlgeschlagen', fehler);
    return 'nicht-verfuegbar';
  }
  return anmeldung.waiting || anmeldung.installing ? 'update-bereit' : 'aktuell';
}

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
      anmeldung = registration; // für die Prüfung von Hand
      const check = () => void registration.update().catch(() => {});

      // Gleich beim Start einmal nachsehen. Ohne das erfährt eine App, die
      // tagelang als Kachel offen liegt, erst nach einer Stunde von einer
      // neuen Fassung — oder gar nicht, wenn sie vorher geschlossen wird.
      check();

      // Beim Zurückkommen aus dem Hintergrund erneut, aber gedrosselt: Wer
      // zwischen Apps hin- und herspringt, löst sonst im Minutentakt aus.
      let letzterBlick = 0;
      const beiRueckkehr = () => {
        const jetzt = Date.now();
        if (jetzt - letzterBlick < FOCUS_CHECK_THROTTLE_MS) return;
        letzterBlick = jetzt;
        check();
        maybeShowPrompt();
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') beiRueckkehr();
      });
      // `focus` zusätzlich zu `visibilitychange`: Auf dem Schreibtisch wechselt
      // man das Fenster, ohne dass die Seite je unsichtbar wird. So macht es
      // auch TourFuchs (src/ui/pwaUpdate.js).
      window.addEventListener('focus', beiRueckkehr);

      // Und turnusmäßig, solange die App offen bleibt.
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

    // Die Sperre startet NICHT hier.
    //
    // Bis zum 14.08.2026 wurde der Zeitpunkt beim Anzeigen weggeschrieben.
    // Damit schwieg die App 24 Stunden lang über eine neue Fassung, sobald der
    // Hinweis einmal erschienen war — auch wenn ihn niemand gesehen hatte,
    // weil er im Hintergrund auflief, weggewischt wurde oder die Seite neu
    // lud. Das ist der Grund, warum man „immer Probleme hat, die aktuelle
    // Version zu haben": Der Hinweis kam genau einmal und dann einen Tag lang
    // nicht mehr, während die alte Fassung weiterlief.
    //
    // Jetzt schweigt die App nur, wenn jemand ausdrücklich „Später" sagt. Wer
    // den Hinweis übersieht, bekommt ihn beim nächsten Start wieder.
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
        {
          label: t('update.available.later'),
          onClick: () => {
            promptVisible = false;
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
          },
        },
      ],
    });
  }
}
