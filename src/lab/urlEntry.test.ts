/**
 * Tests für den Labor-Einstieg über die Adresse (?labor).
 *
 * 1. Der Parameter wird erkannt (auch neben anderen Parametern), abschaltbar.
 * 2. Desktop: das Labor wird geöffnet.
 * 3. Mobil/schmal: kein Start, nur ein Hinweis.
 * 4. Ohne Parameter wird das Labor gar nicht erst geladen.
 */

import { describe, it, expect, vi } from 'vitest';
import { wantsMessLabor, openMessLaborFromUrl, LABOR_UNSUPPORTED_HINT } from './urlEntry.js';

describe('wantsMessLabor', () => {
  it('erkennt ?labor in allen üblichen Schreibweisen', () => {
    expect(wantsMessLabor('?labor')).toBe(true);
    expect(wantsMessLabor('?labor=1')).toBe(true);
    expect(wantsMessLabor('?lang=de&labor')).toBe(true);
    expect(wantsMessLabor('labor')).toBe(true);
  });

  it('ohne Parameter oder abgeschaltet: nein', () => {
    expect(wantsMessLabor('')).toBe(false);
    expect(wantsMessLabor('?importUrl=x')).toBe(false);
    expect(wantsMessLabor('?laborx')).toBe(false);
    expect(wantsMessLabor('?labor=0')).toBe(false);
    expect(wantsMessLabor('?labor=false')).toBe(false);
  });
});

describe('openMessLaborFromUrl', () => {
  const lab = (supported: boolean) => ({
    isMessLaborSupported: vi.fn(() => supported),
    launchMessLabor: vi.fn(),
  });

  it('öffnet das Labor am Desktop direkt', async () => {
    const m = lab(true);
    const hint = vi.fn();
    const out = await openMessLaborFromUrl({ search: '?labor', load: async () => m, hint });
    expect(out).toBe('opened');
    expect(m.launchMessLabor).toHaveBeenCalledOnce();
    expect(hint).not.toHaveBeenCalled();
  });

  it('startet mobil nicht und zeigt nur den Hinweis', async () => {
    const m = lab(false);
    const hint = vi.fn();
    const out = await openMessLaborFromUrl({ search: '?labor', load: async () => m, hint });
    expect(out).toBe('unsupported');
    expect(m.launchMessLabor).not.toHaveBeenCalled();
    expect(hint).toHaveBeenCalledWith(LABOR_UNSUPPORTED_HINT);
  });

  it('lädt ohne Parameter nichts', async () => {
    const load = vi.fn(async () => lab(true));
    const out = await openMessLaborFromUrl({ search: '?lang=de', load });
    expect(out).toBe('none');
    expect(load).not.toHaveBeenCalled();
  });
});
