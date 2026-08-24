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

/**
 * DER ZUSTAND LIEGT IM MODUL, NICHT IN DER CLOSURE.
 *
 * Bis zum 24.08.2026 standen `updatePending`, `maybeShowPrompt`, `applyUpdate`
 * und `updateSW` sämtlich in der Closure von `initPwaUpdate`. `pruefeAufUpdate`
 * ist eine Funktion daneben und kam an keines davon heran.
 *
 * Das Ergebnis war eine Sackgasse, und zwar eine, die wie Erfolg aussah: Der
 * Knopf „Nach Update suchen" meldete „Neue Fassung gefunden" — und danach
 * geschah nichts. Kein Hinweis, kein Knopf, keine Aktualisierung. Wer die
 * neue Fassung wollte, konnte nichts weiter tun, während die alte weiterlief.
 * Genau die Klage, gegen die dieses Modul ursprünglich gebaut wurde.
 *
 * Deshalb liegen die drei Zeiger jetzt hier. `initPwaUpdate` füllt sie; wer
 * sonst noch etwas zu sagen hat, findet sie.
 */
let updatePending = false;
let promptVisible = false;
let applying = false;
/** Der neue Worker kontrolliert diese Seite bereits; zum Wechsel fehlt nur Reload. */
let updateActivated = false;
/** Von `initPwaUpdate` gesetzt — vorher gibt es nichts anzuwenden. */
let zeigeHinweis: (() => void) | null = null;
let wendeAn: (() => void) | null = null;

/** Ergebnis einer Prüfung von Hand. */
export type Updateergebnis = 'update-bereit' | 'aktuell' | 'nicht-verfuegbar';

/**
 * Wartet gerade eine neue Fassung darauf, angewendet zu werden?
 *
 * Der „Über SoundFuchs"-Dialog fragt danach, um seinen Knopf zu setzen.
 */
export function updateWartet(): boolean {
  return updatePending && !applying;
}

/**
 * Die wartende Fassung jetzt anwenden — Neustart in die neue Version.
 *
 * Tut nichts, solange eine Messung läuft; das entscheidet `applyUpdate`
 * drinnen, und zwar mit derselben Regel wie beim Hinweis: Eine laufende
 * Messung wird nie unterbrochen.
 */
export function wendeUpdateAn(): void {
  wendeAn?.();
}

/**
 * Von Hand nachsehen, ob eine neue Fassung bereitliegt.
 *
 * Antwortet immer — auch mit „aktuell". Ein Knopf, der bei Erfolg schweigt,
 * ist von einem kaputten nicht zu unterscheiden.
 *
 * Und die Antwort ist nicht nur ein Satz: Wer hier etwas findet, merkt es
 * vor (`updatePending`) und ruft den Hinweis auf. Sonst wäre die Auskunft
 * „gefunden" eine Sackgasse — siehe oben.
 */
export async function pruefeAufUpdate(): Promise<Updateergebnis> {
  if (!anmeldung) return 'nicht-verfuegbar';
  try {
    await anmeldung.update();
  } catch (fehler) {
    logger.warn('Update-Prüfung fehlgeschlagen', fehler);
    return 'nicht-verfuegbar';
  }
  /**
   * `installing` ist noch nicht `waiting`.
   *
   * Eine Fassung, die gerade heruntergeladen wird, lässt sich nicht anwenden —
   * ein Knopf dafür liefe ins Leere. Also wird abgewartet, bis sie im
   * Wartestand ankommt, und erst dann gemeldet. Kommt sie dort nie an (Abbruch,
   * Fehler beim Installieren), bleibt es bei „aktuell", und die nächste
   * Prüfung fragt erneut.
   */
  if (!anmeldung.waiting && anmeldung.installing) {
    await warteAufWartestand(anmeldung.installing);
  }
  // Der Worker darf sofort aktiv werden. In diesem Fall gibt es absichtlich
  // keinen `waiting` mehr, wohl aber eine neue Fassung, die per Reload
  // sichtbar wird.
  if (updateActivated || updatePending) return 'update-bereit';
  if (!anmeldung.waiting) return 'aktuell';

  updatePending = true;
  zeigeHinweis?.();
  return 'update-bereit';
}

/** Bis der Arbeiter installiert ist — höchstens 20 Sekunden. */
function warteAufWartestand(arbeiter: ServiceWorker): Promise<void> {
  return new Promise((fertig) => {
    const schluss = (): void => {
      arbeiter.removeEventListener('statechange', beiWechsel);
      clearTimeout(uhr);
      fertig();
    };
    const beiWechsel = (): void => {
      if (arbeiter.state === 'installed' || arbeiter.state === 'redundant') schluss();
    };
    const uhr = setTimeout(schluss, 20000);
    arbeiter.addEventListener('statechange', beiWechsel);
  });
}

export function initPwaUpdate(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  /**
   * Der Worker darf sich selbst aktivieren, damit auch alte Installationen aus
   * ihrem Wartestand herauskommen. Aktivieren ist aber nicht gleich neu laden:
   * Eine laufende Messung bleibt unberührt. Sobald der Controller wechselt,
   * behandeln wir die neue Fassung wie jedes andere bereitstehende Update.
   *
   * Der allererste Controller einer Neuinstallation ist kein Update und soll
   * deshalb keinen unnötigen Neustart-Hinweis auslösen.
   */
  let hatteController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hatteController) {
      hatteController = true;
      return;
    }
    updateActivated = true;
    updatePending = true;
    zeigeHinweis?.();
  });

  const updateSW = registerSW({
    onNeedRefresh() {
      // Fallback für Browser/Fassungen, in denen ein Worker doch wartet. Der
      // aktuelle Rettungs-Worker aktiviert sich normalerweise selbst.
      updatePending = true;
      maybeShowPrompt();
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      anmeldung = registration; // für die Prüfung von Hand

      /**
       * Eine Fassung, die schon wartet, wenn wir ankommen.
       *
       * `onNeedRefresh` meldet den Übergang — den Augenblick, in dem ein neuer
       * Arbeiter in den Wartestand tritt. Wer die App schließt, während dort
       * schon einer steht, und sie später wieder öffnet, erlebt diesen
       * Übergang nicht mehr: Der Arbeiter wartet bereits, und niemand sagt es.
       *
       * Genau so sieht die Lage aus, die gemeldet wurde — die alte Fassung
       * läuft weiter, obwohl die neue längst bereitliegt.
       */
      if (registration.waiting) {
        updatePending = true;
        maybeShowPrompt();
      }

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

  // Die beiden Wege von außen: der Hinweis und das Anwenden. Ohne diese zwei
  // Zeilen bleibt `pruefeAufUpdate` genau die Sackgasse, die es war.
  zeigeHinweis = maybeShowPrompt;
  wendeAn = applyUpdate;

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
          if (updateActivated) window.location.reload();
          else void updateSW(true); // wartenden Altfall aktivieren + neu laden
        }
      });
      return;
    }
    applying = true;
    if (updateActivated) window.location.reload();
    else void updateSW(true); // wartenden Altfall aktivieren + neu laden
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
