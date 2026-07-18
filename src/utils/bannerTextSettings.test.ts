/**
 * ZANOBOT - BANNER TEXT SETTINGS TESTS
 *
 * Focus: the per-theme text position, which drives whether "Reset" is offered
 * and whether it reverts the overlay text to its original place.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBannerTextPosition,
  setBannerTextPosition,
  resetBannerTextPosition,
  hasCustomBannerTextPosition,
} from './bannerTextSettings.js';

// Minimal in-memory localStorage polyfill (tests run in the 'node' environment).
function installLocalStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage: Storage }).localStorage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  };
}

const DEFAULT = { x: 36, y: 50 };

describe('bannerTextSettings – position', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('reports no custom position by default and returns the default', () => {
    expect(hasCustomBannerTextPosition('brand')).toBe(false);
    expect(getBannerTextPosition('brand')).toEqual(DEFAULT);
  });

  it('flags a custom position once the text has been moved', () => {
    setBannerTextPosition('neon', { x: 10, y: 80 });
    expect(hasCustomBannerTextPosition('neon')).toBe(true);
    expect(getBannerTextPosition('neon')).toEqual({ x: 10, y: 80 });
    // Position is per-theme: another theme is unaffected.
    expect(hasCustomBannerTextPosition('brand')).toBe(false);
  });

  it('detects a custom position even when only one axis was moved', () => {
    setBannerTextPosition('brand', { x: 5 });
    expect(hasCustomBannerTextPosition('brand')).toBe(true);
  });

  it('reset reverts to the default position (Reset returns text to its place)', () => {
    setBannerTextPosition('brand', { x: 0, y: 12 });
    expect(hasCustomBannerTextPosition('brand')).toBe(true);

    resetBannerTextPosition('brand');

    expect(hasCustomBannerTextPosition('brand')).toBe(false);
    expect(getBannerTextPosition('brand')).toEqual(DEFAULT);
  });
});
