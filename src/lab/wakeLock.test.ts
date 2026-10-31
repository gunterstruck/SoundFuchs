/**
 * Bildschirm wachhalten: ohne API kein Fehler; mit API Anfordern + Freigeben.
 */
import { describe, it, expect, vi } from 'vitest';
import { keepScreenAwake } from './wakeLock.js';

describe('keepScreenAwake', () => {
  it('läuft ohne Wake-Lock-API einfach weiter', async () => {
    const release = await keepScreenAwake({}, undefined);
    await expect(release()).resolves.toBeUndefined();
  });

  it('läuft weiter, wenn der Browser ablehnt', async () => {
    const nav = { wakeLock: { request: vi.fn(async () => Promise.reject(new Error('nein'))) } };
    const release = await keepScreenAwake(nav, undefined);
    await expect(release()).resolves.toBeUndefined();
  });

  it('fordert an und gibt wieder frei', async () => {
    const sentinel = { release: vi.fn(async () => {}) };
    const nav = { wakeLock: { request: vi.fn(async () => sentinel) } };
    const release = await keepScreenAwake(nav, undefined);
    expect(nav.wakeLock.request).toHaveBeenCalledWith('screen');
    await release();
    await release();
    expect(sentinel.release).toHaveBeenCalledOnce();
  });
});
