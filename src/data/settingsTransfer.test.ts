/**
 * ZANOBOT - SETTINGS EXPORT / IMPORT TESTS
 *
 * Covers the settings snapshot feature that lets a backup carry the app's UI
 * settings (localStorage preferences + banner image assets) alongside the
 * machine data:
 * - exportSettings / importSettings round-trip (localStorage + app_settings)
 * - banner Blob serialization survives the round-trip
 * - transient keys are excluded
 * - backupHasSettings detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDB,
  clearAllData,
  saveAppSetting,
  getAppSetting,
  exportSettings,
  importSettings,
  backupHasSettings,
} from './db.js';

import 'fake-indexeddb/auto';

// Minimal in-memory localStorage polyfill (the test runs in the 'node'
// environment, which has no localStorage).
function installLocalStorage(): void {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  };
  (globalThis as { localStorage: Storage }).localStorage = mock;
}

describe('Settings export / import', () => {
  beforeEach(async () => {
    installLocalStorage();
    try {
      await clearAllData();
    } catch {
      /* ignore */
    }
    await initDB();
  });

  afterEach(async () => {
    try {
      await clearAllData();
    } catch {
      /* ignore */
    }
    localStorage.clear();
  });

  it('round-trips localStorage preferences', async () => {
    localStorage.setItem('zanobot.view-level', 'expert');
    localStorage.setItem('zanobot-theme', 'neon');
    localStorage.setItem('zanobot.banner.headline.brand', 'Custom headline');

    const snapshot = await exportSettings();
    expect(snapshot.localStorage['zanobot.view-level']).toBe('expert');
    expect(snapshot.localStorage['zanobot-theme']).toBe('neon');
    expect(snapshot.localStorage['zanobot.banner.headline.brand']).toBe('Custom headline');

    // Wipe and restore from the snapshot
    localStorage.clear();
    await importSettings(snapshot);

    expect(localStorage.getItem('zanobot.view-level')).toBe('expert');
    expect(localStorage.getItem('zanobot-theme')).toBe('neon');
    expect(localStorage.getItem('zanobot.banner.headline.brand')).toBe('Custom headline');
  });

  it('ignores non-app and transient localStorage keys', async () => {
    localStorage.setItem('zanobot.view-level', 'advanced');
    localStorage.setItem('unrelated-key', 'should-not-export');
    localStorage.setItem('zanobot-migration-v3-occurred', '{"x":1}');

    const snapshot = await exportSettings();
    expect(snapshot.localStorage['zanobot.view-level']).toBe('advanced');
    expect(snapshot.localStorage['unrelated-key']).toBeUndefined();
    expect(snapshot.localStorage['zanobot-migration-v3-occurred']).toBeUndefined();
  });

  it('round-trips a banner image blob stored in app_settings', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const blob = new Blob([bytes], { type: 'image/png' });
    await saveAppSetting('hero_banner_brand', blob);

    const snapshot = await exportSettings();
    const exported = snapshot.appSettings.find((s) => s.key === 'hero_banner_brand');
    expect(exported).toBeDefined();
    // Blob is serialized to a JSON-friendly base64 envelope
    expect(JSON.stringify(snapshot)).not.toContain('[object Blob]');

    // Drop the banner, then restore from the snapshot (survives JSON cloning)
    await clearAllData();
    const cloned = JSON.parse(JSON.stringify(snapshot));
    await importSettings(cloned);

    const restored = await getAppSetting<Blob>('hero_banner_brand');
    expect(restored?.value).toBeInstanceOf(Blob);
    expect(restored?.value.type).toBe('image/png');
    const restoredBytes = new Uint8Array(await restored!.value.arrayBuffer());
    expect(Array.from(restoredBytes)).toEqual([1, 2, 3, 4, 5]);
  });

  it('importSettings tolerates undefined / empty input', async () => {
    await expect(importSettings(undefined)).resolves.toBeUndefined();
    await expect(importSettings(null)).resolves.toBeUndefined();
    await expect(
      importSettings({ localStorage: {}, appSettings: [] })
    ).resolves.toBeUndefined();
  });

  describe('backupHasSettings', () => {
    it('detects a populated settings section', () => {
      expect(
        backupHasSettings({ settings: { localStorage: { 'zanobot.view-level': 'expert' }, appSettings: [] } })
      ).toBe(true);
      expect(
        backupHasSettings({
          settings: { localStorage: {}, appSettings: [{ key: 'hero_banner_brand', value: {}, updatedAt: 0 }] },
        })
      ).toBe(true);
    });

    it('returns false when settings are missing or empty', () => {
      expect(backupHasSettings({ machines: [] })).toBe(false);
      expect(backupHasSettings({ settings: { localStorage: {}, appSettings: [] } })).toBe(false);
      expect(backupHasSettings(null)).toBe(false);
      expect(backupHasSettings('nope')).toBe(false);
    });
  });
});
