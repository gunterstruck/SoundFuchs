/**
 * ZANOBOT · Mess-Labor — Bildschirm während einer Messung wachhalten.
 *
 * Nutzt die Screen Wake Lock API. Fehlt sie oder lehnt der Browser ab (z. B.
 * Akku-Sparmodus, Tab im Hintergrund), läuft die Messung ohne Fehler weiter.
 * Der Browser gibt die Sperre frei, sobald der Tab verborgen wird; beim
 * Zurückkehren wird sie neu angefordert, solange die Messung läuft.
 */

interface WakeLockSentinelLike {
  release(): Promise<void>;
}
interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

/** Gibt die Sperre wieder frei (idempotent, wirft nie). */
export type ReleaseWakeLock = () => Promise<void>;

/**
 * Bildschirm wachhalten, bis die zurückgegebene Funktion aufgerufen wird.
 * `nav`/`doc` sind nur für Tests injizierbar.
 */
export async function keepScreenAwake(
  nav: { wakeLock?: WakeLockLike } | undefined = typeof navigator !== 'undefined'
    ? (navigator as unknown as { wakeLock?: WakeLockLike })
    : undefined,
  doc:
    | Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>
    | undefined = typeof document !== 'undefined' ? document : undefined
): Promise<ReleaseWakeLock> {
  const api = nav?.wakeLock;
  if (!api || typeof api.request !== 'function') return async () => {};

  let sentinel: WakeLockSentinelLike | null = null;
  let active = true;
  const acquire = async (): Promise<void> => {
    try {
      sentinel = await api.request('screen');
    } catch {
      sentinel = null; // abgelehnt — Messung läuft trotzdem weiter
    }
  };
  const onVisible = (): void => {
    if (active && doc?.visibilityState === 'visible') void acquire();
  };

  await acquire();
  doc?.addEventListener('visibilitychange', onVisible);

  return async () => {
    if (!active) return;
    active = false;
    doc?.removeEventListener('visibilitychange', onVisible);
    try {
      await sentinel?.release();
    } catch {
      /* bereits freigegeben */
    }
    sentinel = null;
  };
}
