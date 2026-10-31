/**
 * Tests für die reine Planung des Handy-Protokolls und die Statistik.
 *
 * Kernaussagen:
 * 1. Die Referenz eines Durchlaufs ist NIE in dessen Testmenge.
 * 2. Gleicher Seed → gleiche Auswahl; anderer Seed → andere Auswahl.
 * 3. Die Kappung kürzt nur den Test, nie die Referenz-Ziehung.
 * 4. Median/Quartile stimmen (Typ 7, lineare Interpolation).
 */

import { describe, it, expect } from 'vitest';
import type { ParsedSection } from './parseFolder.js';
import {
  planPhoneProtocol,
  capEvenly,
  quantile,
  summarize,
  wavSampleRate,
} from './phoneProtocolPlan.js';

function section(nNormal: number, nAbnormal: number, key = 'pump/id_00'): ParsedSection {
  const pad = (i: number) => String(i).padStart(8, '0');
  return {
    key,
    machine: 'pump',
    section: 'id_00',
    trainNormalPaths: [],
    testNormalPaths: [],
    abnormalPaths: Array.from({ length: nAbnormal }, (_, i) => `${key}/abnormal/${pad(i)}.wav`),
    normalPaths: Array.from({ length: nNormal }, (_, i) => `${key}/normal/${pad(i)}.wav`),
    hasExplicitSplit: false,
  };
}

describe('planPhoneProtocol', () => {
  it('nimmt die Referenz nie in den Test und testet alle übrigen Clips', () => {
    const plan = planPhoneProtocol(section(30, 10), { runs: 20, seed: 7 });
    expect(plan.skipped).toBeUndefined();
    expect(plan.runs).toHaveLength(20);
    for (const run of plan.runs) {
      expect(run.testNormal).not.toContain(run.refPath);
      expect(run.testAbnormal).not.toContain(run.refPath);
      expect(run.testNormal).toHaveLength(29);
      expect(run.testAbnormal).toHaveLength(10);
      expect(new Set([...run.testNormal, run.refPath]).size).toBe(30);
    }
    // Jede Referenz kommt nur einmal vor.
    expect(new Set(plan.runs.map((r) => r.refPath)).size).toBe(20);
  });

  it('gleicher Seed ergibt gleiche Auswahl, anderer Seed eine andere', () => {
    const a = planPhoneProtocol(section(50, 5), { runs: 10, seed: 42 });
    const b = planPhoneProtocol(section(50, 5), { runs: 10, seed: 42 });
    const c = planPhoneProtocol(section(50, 5), { runs: 10, seed: 43 });
    expect(a.runs.map((r) => r.refPath)).toEqual(b.runs.map((r) => r.refPath));
    expect(a.runs.map((r) => r.testNormal)).toEqual(b.runs.map((r) => r.testNormal));
    expect(a.runs.map((r) => r.refPath)).not.toEqual(c.runs.map((r) => r.refPath));
  });

  it('die Kappung trifft nur den Test, nie die Referenz', () => {
    const uncapped = planPhoneProtocol(section(40, 12), { runs: 8, seed: 9 });
    const capped = planPhoneProtocol(section(40, 12), { runs: 8, seed: 9, maxTestPerClass: 5 });
    // Dieselben Referenzen — gezogen aus ALLEN Normal-Clips.
    expect(capped.runs.map((r) => r.refPath)).toEqual(uncapped.runs.map((r) => r.refPath));
    for (const run of capped.runs) {
      expect(run.testNormal).toHaveLength(5);
      expect(run.testAbnormal).toHaveLength(5);
      expect(run.testNormal).not.toContain(run.refPath);
    }
    // Referenzen dürfen auch außerhalb der gekappten Testmenge liegen.
    const testedAnywhere = new Set(capped.runs.flatMap((r) => r.testNormal));
    expect(capped.runs.some((r) => !testedAnywhere.has(r.refPath))).toBe(true);
  });

  it('überspringt Bereiche mit weniger als 2 Normal-Clips', () => {
    expect(planPhoneProtocol(section(1, 5)).skipped).toMatch(/mindestens 2/);
    expect(planPhoneProtocol(section(0, 5)).runs).toHaveLength(0);
    expect(planPhoneProtocol(section(2, 0)).skipped).toBeUndefined();
  });

  it('begrenzt die Durchläufe auf die Zahl der Normal-Clips', () => {
    const plan = planPhoneProtocol(section(4, 2), { runs: 20 });
    expect(plan.runs).toHaveLength(4);
    expect(plan.runsRequested).toBe(20);
  });

  it('legt train/test-Ordner für die Normal-Clips zusammen', () => {
    const s: ParsedSection = {
      ...section(0, 2),
      trainNormalPaths: ['a/train/normal/1.wav', 'a/train/normal/2.wav'],
      testNormalPaths: ['a/test/normal/3.wav'],
      hasExplicitSplit: true,
    };
    const plan = planPhoneProtocol(s, { runs: 3 });
    expect(plan.normals).toHaveLength(3);
    expect(plan.runs).toHaveLength(3);
  });
});

describe('capEvenly', () => {
  it('verteilt gleichmäßig und lässt kurze Listen unverändert', () => {
    const list = Array.from({ length: 10 }, (_, i) => `f${i}`);
    expect(capEvenly(list, 5)).toEqual(['f0', 'f2', 'f4', 'f6', 'f8']);
    expect(capEvenly(list, 0)).toEqual(list);
    expect(capEvenly(list, 20)).toEqual(list);
  });
});

describe('quantile / summarize', () => {
  it('Median und Quartile (lineare Interpolation)', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantile([1, 2, 3, 4, 5], 0.75)).toBe(4);
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
    expect(quantile([7], 0.9)).toBe(7);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });

  it('summarize sortiert, ignoriert NaN und liefert Min/Max/Mittel', () => {
    const s = summarize([0.9, NaN, 0.5, 0.7, 0.6, 0.8]);
    expect(s.n).toBe(5);
    expect(s.min).toBe(0.5);
    expect(s.max).toBe(0.9);
    expect(s.median).toBeCloseTo(0.7);
    expect(s.q1).toBeCloseTo(0.6);
    expect(s.q3).toBeCloseTo(0.8);
    expect(s.mean).toBeCloseTo(0.7);
    const empty = summarize([NaN]);
    expect(empty.n).toBe(0);
    expect(Number.isNaN(empty.median)).toBe(true);
  });
});

describe('wavSampleRate', () => {
  it('liest die Rate aus dem fmt-Chunk und lehnt Nicht-WAV ab', () => {
    const buf = new ArrayBuffer(44);
    const v = new DataView(buf);
    const put = (off: number, s: string) =>
      [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));
    put(0, 'RIFF');
    v.setUint32(4, 36, true);
    put(8, 'WAVE');
    put(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint32(24, 16000, true);
    put(36, 'data');
    expect(wavSampleRate(buf)).toBe(16000);
    expect(Number.isNaN(wavSampleRate(new ArrayBuffer(8)))).toBe(true);
  });
});
