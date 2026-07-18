/**
 * ZANOBOT - MEASUREMENT ACTIVITY FLAG
 *
 * A tiny global signal that is true while a reference recording or a diagnosis
 * measurement is running. Used so a PWA update is never applied (page reload)
 * in the middle of a measurement. Phases flip it on recording start/stop and
 * defensively clear it on cleanup.
 */

let active = false;
const endListeners = new Set<() => void>();

/** Mark a measurement as active (true) or finished (false). */
export function setMeasurementActive(value: boolean): void {
  if (active === value) return;
  active = value;
  if (!value) {
    // Notify "measurement ended" listeners (e.g. a deferred PWA update).
    for (const listener of endListeners) {
      try {
        listener();
      } catch {
        // ignore listener errors – must never break the recording lifecycle
      }
    }
  }
}

/** True while a reference recording or diagnosis measurement is running. */
export function isMeasurementActive(): boolean {
  return active;
}

/** Run a callback the next time a measurement transitions from active → idle. */
export function onMeasurementEnd(callback: () => void): void {
  endListeners.add(callback);
}
