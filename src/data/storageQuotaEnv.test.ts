import { afterEach, describe, expect, it } from 'vitest';
import { checkStorageQuota, getStorageUsage } from './db';

/**
 * Umgebungen ohne `navigator`.
 *
 * Gefunden vom CI-Tor bei seinem allerersten Lauf – lokal war alles grün.
 * Der Grund: Node kennt das globale `navigator` erst ab Version 21. Die
 * Entwicklungsumgebung läuft auf Node 22, der Prüflauf (wie der Deploy) auf
 * Node 20. Dort warf `!navigator.storage` einen ReferenceError – ausgerechnet
 * in der Zeile, die das Fehlen der API abfangen sollte.
 *
 * Dieser Test macht den Unterschied lokal sichtbar, statt ihn von der
 * Node-Version des Prüfrechners abhängen zu lassen: Er nimmt `navigator` weg
 * und erwartet, dass beide Funktionen still zurückkehren.
 *
 * Das ist kein reines Testumgebungs-Problem. Die Funktionen sind so geschrieben,
 * dass sie ohne StorageManager-API weiterarbeiten sollen – ein Browser ohne
 * `navigator.storage` ist ausdrücklich vorgesehen. Eine Umgebung ohne
 * `navigator` gehört zur selben Familie.
 */
describe('Speicherplatz-Prüfung ohne navigator', () => {
  const echt = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  afterEach(() => {
    if (echt) Object.defineProperty(globalThis, 'navigator', echt);
  });

  const ohneNavigator = () => {
    // `delete globalThis.navigator` greift nicht bei einem nicht-konfigurierbaren
    // Getter – deshalb wird die Eigenschaft überschrieben.
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  };

  it('bricht nicht ab, wenn es gar kein navigator gibt', async () => {
    ohneNavigator();
    await expect(checkStorageQuota(1024)).resolves.toBeUndefined();
  });

  it('meldet in dem Fall schlicht keine Nutzung', async () => {
    ohneNavigator();
    await expect(getStorageUsage()).resolves.toBeUndefined();
  });
});
