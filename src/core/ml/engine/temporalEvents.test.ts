/**
 * Tests für den Tier-2 Ereignis-Pfad (T3, Stufe T2-a2).
 *
 * Kernaussagen:
 * 1. Onset-Segmentierung findet genau die transienten Klacks einer
 *    Valve-artigen Sequenz (ein Ereignis pro Klack, kein Doppelzählen
 *    durch die Rückfall-Flanke).
 * 2. Zustandsbasierte Ausdehnung: anhaltende neue Zustände werden EIN
 *    Ereignis mit korrekter Dauer, der Deskriptor bleibt unverwässert.
 * 3. Ereignis-Bank dedupliziert (ein Klack-Typ = ein Eintrag), die Dichte
 *    zählt trotzdem alle Ereignisse.
 * 4. matchEvent trennt bekannte von anomalen Ereignissen (Cosine).
 * 5. Stationäre Sequenzen erzeugen keine Ereignisse (Floor).
 */

import { describe, it, expect } from 'vitest';
import {
  noveltySeries,
  noveltyThreshold,
  noveltyBackground,
  detectEvents,
  buildEventBank,
  matchEvent,
  NOVELTY_FLOOR,
  EVENT_KNOWN_COS,
} from './temporalEvents.js';

const BINS = 64;
const HOP_SEC = 0.066;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function humSpectrum(): number[] {
  const s = new Array<number>(BINS).fill(0.01);
  s[5] = 0.6;
  s[12] = 0.35;
  return s;
}

function clackA(): number[] {
  const s = humSpectrum();
  s[30] = 0.9;
  s[31] = 0.5;
  return s;
}

function clackB(): number[] {
  const s = humSpectrum();
  s[45] = 0.9;
  s[46] = 0.5;
  return s;
}

function jittered(base: number[], rng: () => number, jitter = 0.1): Float64Array {
  const out = new Float64Array(BINS);
  let total = 0;
  for (let k = 0; k < BINS; k++) {
    out[k] = base[k] * (1 + jitter * (rng() * 2 - 1));
    total += out[k];
  }
  for (let k = 0; k < BINS; k++) out[k] /= total;
  return out;
}

/** Valve-Sequenz: Brummen, jedes `period`-te Frame ist ein Klack. */
function valveSequence(count: number, clack: () => number[], seed: number, period = 10): Float64Array[] {
  const rng = mulberry32(seed);
  const frames: Float64Array[] = [];
  for (let i = 0; i < count; i++) {
    frames.push(jittered(i % period === period - 1 ? clack() : humSpectrum(), rng));
  }
  return frames;
}

/** Nur-Brummen-Sequenz (stationär). */
function humSequence(count: number, seed: number): Float64Array[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => jittered(humSpectrum(), rng));
}

describe('noveltySeries / noveltyThreshold', () => {
  it('is near zero for a stationary sequence and spikes at a clack', () => {
    const seq = valveSequence(30, clackA, 1);
    const nov = noveltySeries(seq);
    // Brumm→Brumm-Übergänge: winzige Novelty
    expect(nov[3]).toBeLessThan(0.01);
    // Brumm→Klack (Index 9) und Klack→Brumm (Index 10): deutliche Spitzen
    expect(nov[9]).toBeGreaterThan(NOVELTY_FLOOR);
    expect(nov[10]).toBeGreaterThan(NOVELTY_FLOOR);
  });

  it('threshold falls back to the floor for calm streams', () => {
    const nov = noveltySeries(humSequence(30, 2));
    expect(noveltyThreshold(nov)).toBe(NOVELTY_FLOOR);
    expect(noveltyBackground(nov)).toBeLessThan(NOVELTY_FLOOR);
  });
});

describe('detectEvents', () => {
  it('finds exactly one event per clack (no double count on the falling edge)', () => {
    const seq = valveSequence(120, clackA, 3);
    const events = detectEvents(seq);
    // 12 Klacks (Indizes 9, 19, …, 119)
    expect(events.length).toBe(12);
    for (const ev of events) {
      expect((ev.startIndex + 1) % 10).toBe(0); // Onset am Klack-Frame
      expect(ev.durationFrames).toBe(1); // Rückfall-Frame gehört NICHT dazu
    }
  });

  it('merges a sustained state change into one event with its duration', () => {
    const rng = mulberry32(4);
    const seq: Float64Array[] = [];
    for (let i = 0; i < 20; i++) seq.push(jittered(humSpectrum(), rng));
    for (let i = 0; i < 4; i++) seq.push(jittered(clackA(), rng)); // 4 Frames neuer Zustand
    for (let i = 0; i < 20; i++) seq.push(jittered(humSpectrum(), rng));

    const events = detectEvents(seq);
    expect(events.length).toBe(1);
    expect(events[0].startIndex).toBe(20);
    expect(events[0].durationFrames).toBe(4);
    // Deskriptor bleibt Klack-artig (unverwässert vom Grundgeräusch)
    expect(matchEvent(events[0].spectrum, [
      { meanSpectrum: Array.from(jittered(clackA(), mulberry32(5), 0)), durationFrames: 1, energyRatio: 1 },
    ])).toBeGreaterThan(EVENT_KNOWN_COS);
  });

  it('finds no events in a stationary sequence', () => {
    expect(detectEvents(humSequence(120, 6))).toEqual([]);
  });
});

describe('buildEventBank', () => {
  it('dedupes repeated clacks into one bank entry but counts all for the rate', () => {
    const seq = valveSequence(120, clackA, 7);
    const info = buildEventBank(seq, HOP_SEC);

    expect(info.eventCount).toBe(12);
    // Alle 12 Klacks sind derselbe Typ → 1 Bank-Eintrag
    expect(info.events.length).toBe(1);
    // Rate: 12 Ereignisse auf 120 × 66 ms = 7,92 s → ~90,9/min
    expect(info.eventRatePerMin).toBeCloseTo(12 / ((120 * HOP_SEC) / 60), 5);
  });

  it('stores an energy ratio when a frame-RMS series is provided', () => {
    const seq = valveSequence(60, clackA, 8);
    // Klack-Frames (Index 9, 19, …) sind doppelt so laut wie das Brummen
    const frameRms = seq.map((_, i) => (i % 10 === 9 ? 0.2 : 0.1));
    const info = buildEventBank(seq, HOP_SEC, frameRms);
    expect(info.events.length).toBe(1);
    expect(info.events[0].energyRatio).toBeCloseTo(2, 5);
  });

  it('returns an empty bank and zero rate for stationary references', () => {
    const info = buildEventBank(humSequence(120, 9), HOP_SEC);
    expect(info.events).toEqual([]);
    expect(info.eventCount).toBe(0);
    expect(info.eventRatePerMin).toBe(0);
  });
});

describe('matchEvent', () => {
  it('separates the known clack from an anomalous one', () => {
    const seq = valveSequence(120, clackA, 10);
    const bank = buildEventBank(seq, HOP_SEC).events;

    const knownSim = matchEvent(jittered(clackA(), mulberry32(11)), bank);
    const anomalousSim = matchEvent(jittered(clackB(), mulberry32(12)), bank);

    expect(knownSim).toBeGreaterThanOrEqual(EVENT_KNOWN_COS);
    expect(anomalousSim).toBeLessThan(EVENT_KNOWN_COS);
  });

  it('returns 0 for an empty bank', () => {
    expect(matchEvent(jittered(clackA(), mulberry32(13)), [])).toBe(0);
  });
});
