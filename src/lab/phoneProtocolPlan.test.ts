/**
 * Tests für die reine Planung des Handy-Protokolls und die Statistik.
 *
 * Kernaussagen:
 * 1. Die Referenz eines Durchlaufs ist NIE in dessen Testmenge.
 * 2. Gleicher Seed → gleiche Auswahl; anderer Seed → andere Auswahl.
 * 3. Mit Kappung ist die Testmenge fest; Referenz und Kalibrierung stammen aus
 *    den übrigen Normal-Clips. Referenz, Kalibrierung und Test überschneiden
 *    sich nie.
 * 4. Median/Quartile stimmen (Typ 7, lineare Interpolation).
 * 5. Schwellenregeln (größte Abweichung × Faktor, Mittel + z · σ).
 */

import { describe, it, expect } from 'vitest';
import type { ParsedSection } from './parseFolder.js';
import {
  planPhoneProtocol,
  capEvenly,
  quantile,
  summarize,
  wavSampleRate,
  calibrationThreshold,
  calibratedFlag,
  fileNumber,
  numberSpan,
  spreadRefChannels,
  probeChannelPool,
  planChannels,
  channelLabel,
  wavChannelCount,
} from './phoneProtocolPlan.js';
import { shuffledIndices } from './rng.js';

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

  it('mit Kappung: feste Testmenge, Referenz aus den übrigen Normal-Clips', () => {
    const plan = planPhoneProtocol(section(40, 12), { runs: 8, seed: 9, maxTestPerClass: 5 });
    expect(plan.testSetFixed).toBe(true);
    const first = plan.runs[0];
    for (const run of plan.runs) {
      expect(run.testNormal).toEqual(first.testNormal);
      expect(run.testAbnormal).toEqual(first.testAbnormal);
      expect(run.testNormal).toHaveLength(5);
      expect(run.testAbnormal).toHaveLength(5);
      expect(run.testNormal).not.toContain(run.refPath);
    }
    // Feste Testmenge = gleichmäßig verteilt wie capEvenly.
    expect(first.testNormal).toEqual(capEvenly(plan.normals, 5));
  });

  it('m = 0, k = 1, ohne Kappung: exakt die bisherige Auswahl', () => {
    const n = 30;
    const plan = planPhoneProtocol(section(n, 4), { runs: 6, seed: 11 });
    const order = shuffledIndices(n, 11);
    expect(plan.testSetFixed).toBe(false);
    plan.runs.forEach((run, r) => {
      expect(run.refPath).toBe(plan.normals[order[r]]);
      expect(run.refPaths).toEqual([run.refPath]);
      expect(run.calibPaths).toEqual([]);
      expect(run.testNormal).toEqual(plan.normals.filter((p) => p !== run.refPath));
    });
  });

  it('Referenz, Kalibrierung und Test überschneiden sich nie (k = 3, m = 5)', () => {
    for (const maxTestPerClass of [0, 10]) {
      const plan = planPhoneProtocol(section(40, 8), {
        runs: 12,
        seed: 5,
        maxTestPerClass,
        refClips: 3,
        calibClips: 5,
      });
      expect(plan.runs).toHaveLength(12);
      for (const run of plan.runs) {
        expect(run.refPaths).toHaveLength(3);
        expect(run.calibPaths).toHaveLength(5);
        const ref = new Set(run.refPaths);
        const cal = new Set(run.calibPaths);
        expect(ref.size + cal.size).toBe(8);
        for (const p of run.calibPaths) expect(ref.has(p)).toBe(false);
        for (const p of run.testNormal) {
          expect(ref.has(p)).toBe(false);
          expect(cal.has(p)).toBe(false);
        }
      }
      if (maxTestPerClass > 0) {
        expect(plan.testSetFixed).toBe(true);
        const t0 = plan.runs[0].testNormal;
        for (const run of plan.runs) expect(run.testNormal).toEqual(t0);
      } else {
        // Ohne Kappung wie heute: gezogene Clips fehlen im Test.
        for (const run of plan.runs) expect(run.testNormal).toHaveLength(40 - 8);
      }
    }
  });

  it('gleicher Seed ergibt gleiche Referenz- und Kalibrier-Clips', () => {
    const opts = { runs: 6, seed: 77, maxTestPerClass: 8, refClips: 2, calibClips: 4 };
    const a = planPhoneProtocol(section(50, 6), opts);
    const b = planPhoneProtocol(section(50, 6), opts);
    const c = planPhoneProtocol(section(50, 6), { ...opts, seed: 78 });
    expect(a.runs.map((r) => [r.refPaths, r.calibPaths])).toEqual(
      b.runs.map((r) => [r.refPaths, r.calibPaths])
    );
    expect(a.runs.map((r) => r.refPaths)).not.toEqual(c.runs.map((r) => r.refPaths));
  });

  it('fällt ohne übrige Normal-Clips auf „Referenz aus dem Test nehmen“ zurück', () => {
    // 10 Normal, Kappung 8 → nur 2 übrig, aber k + m = 4 nötig.
    const plan = planPhoneProtocol(section(10, 3), {
      runs: 3,
      maxTestPerClass: 8,
      refClips: 1,
      calibClips: 3,
    });
    expect(plan.testSetFixed).toBe(false);
    for (const run of plan.runs) {
      const drawn = new Set([...run.refPaths, ...run.calibPaths]);
      for (const p of run.testNormal) expect(drawn.has(p)).toBe(false);
    }
  });

  it('überspringt Bereiche ohne genug Normal-Clips für k + m + 1', () => {
    expect(planPhoneProtocol(section(5, 2), { refClips: 2, calibClips: 3 }).skipped).toMatch(
      /mindestens 6/
    );
    expect(
      planPhoneProtocol(section(6, 2), { refClips: 2, calibClips: 3 }).skipped
    ).toBeUndefined();
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

describe('calibrationThreshold / calibratedFlag', () => {
  it('größte Abweichung × Faktor', () => {
    expect(
      calibrationThreshold([0.1, 0.4, 0.2], { rule: 'max-factor', factor: 1.25, z: 3 })
    ).toBeCloseTo(0.5);
    expect(calibrationThreshold([0.08], { rule: 'max-factor', factor: 2, z: 3 })).toBeCloseTo(0.16);
  });

  it('Mittel + z · Standardabweichung (Stichprobe, n − 1), erst ab 3 Werten', () => {
    // Mittel 0,2; σ = 0,1 (Werte 0,1/0,2/0,3) → 0,2 + 3 · 0,1 = 0,5
    expect(calibrationThreshold([0.1, 0.2, 0.3], { rule: 'mean-z', factor: 1, z: 3 })).toBeCloseTo(
      0.5
    );
    expect(
      calibrationThreshold([0.2, 0.2, 0.2, 0.2], { rule: 'mean-z', factor: 1, z: 3 })
    ).toBeCloseTo(0.2);
    expect(
      Number.isNaN(calibrationThreshold([0.1, 0.2], { rule: 'mean-z', factor: 1, z: 3 }))
    ).toBe(true);
  });

  it('ohne Werte oder mit fehlendem Rohwert keine Schwelle', () => {
    expect(Number.isNaN(calibrationThreshold([], { rule: 'max-factor', factor: 1.25, z: 3 }))).toBe(
      true
    );
    expect(
      Number.isNaN(calibrationThreshold([0.1, NaN], { rule: 'max-factor', factor: 1.25, z: 3 }))
    ).toBe(true);
  });

  it('auffällig nur ÜBER der Schwelle', () => {
    expect(calibratedFlag(0.51, 0.5)).toBe(true);
    expect(calibratedFlag(0.5, 0.5)).toBe(false);
    expect(calibratedFlag(0.2, NaN)).toBeNull();
  });
});

describe('Referenz-Lage', () => {
  it('fileNumber / numberSpan lesen die letzte Ziffernfolge im Dateinamen', () => {
    expect(fileNumber('pump/id_06/normal/00000123.wav')).toBe(123);
    expect(fileNumber('pump/id_06/normal/clip_7_v2.wav')).toBe(2);
    expect(Number.isNaN(fileNumber('pump/id_06/normal/x.wav'))).toBe(true);
    expect(numberSpan(['a/00000010.wav', 'a/00000013.wav', 'a/00000011.wav'])).toBe(3);
    expect(Number.isNaN(numberSpan(['a/x.wav']))).toBe(true);
  });

  it('„verteilt“ ist bitgleich zum bisherigen Plan (ohne Angabe = verteilt)', () => {
    const opts = { runs: 8, seed: 21, maxTestPerClass: 10, refClips: 3, calibClips: 4 };
    const before = planPhoneProtocol(section(60, 9), opts);
    const spread = planPhoneProtocol(section(60, 9), { ...opts, refLayout: 'spread' });
    expect(spread).toEqual(before);
    // Bisherige Auswahl explizit nachgerechnet: Gruppen aus der Permutation des Pools.
    const pool = before.normals.filter((p) => !new Set(before.runs[0].testNormal).has(p));
    const order = shuffledIndices(pool.length, 21);
    spread.runs.forEach((run, r) => {
      const group = Array.from({ length: 7 }, (_, j) => pool[order[(r * 7 + j) % pool.length]]);
      expect(run.refPaths).toEqual(group.slice(0, 3));
      expect(run.calibPaths).toEqual(group.slice(3));
    });
  });

  it('„am Stück“: k aufeinanderfolgende freie Nummern, ohne Überschneidung, per Seed reproduzierbar', () => {
    for (const maxTestPerClass of [0, 10]) {
      const opts = {
        runs: 12,
        seed: 33,
        maxTestPerClass,
        refClips: 3,
        calibClips: 5,
        refLayout: 'block' as const,
      };
      const plan = planPhoneProtocol(section(60, 9), opts);
      const again = planPhoneProtocol(section(60, 9), opts);
      expect(again).toEqual(plan);
      expect(plan.runs).toHaveLength(12);
      const testSet = new Set(plan.runs[0].testNormal);
      const free = plan.normals.filter((p) => !(maxTestPerClass > 0 && testSet.has(p)));
      for (const run of plan.runs) {
        expect(run.refPaths).toHaveLength(3);
        expect(run.calibPaths).toHaveLength(5);
        // aufeinanderfolgend in der Liste der freien Clips (nach Nummer)
        const pos = run.refPaths.map((p) => free.indexOf(p));
        expect(pos[1]).toBe(pos[0] + 1);
        expect(pos[2]).toBe(pos[0] + 2);
        expect(run.refSpan).toBe(fileNumber(run.refPaths[2]) - fileNumber(run.refPaths[0]));
        const ref = new Set(run.refPaths);
        for (const p of run.calibPaths) expect(ref.has(p)).toBe(false);
        for (const p of run.testNormal) {
          expect(ref.has(p)).toBe(false);
          expect(run.calibPaths).not.toContain(p);
        }
      }
      if (maxTestPerClass === 0) {
        // ohne Kappung sind alle Clips frei → Nummern direkt hintereinander
        for (const run of plan.runs) expect(run.refSpan).toBe(2);
      }
    }
    const other = planPhoneProtocol(section(60, 9), {
      runs: 12,
      seed: 34,
      refClips: 3,
      refLayout: 'block',
    });
    const base = planPhoneProtocol(section(60, 9), {
      runs: 12,
      seed: 33,
      refClips: 3,
      refLayout: 'block',
    });
    expect(other.runs.map((r) => r.refPaths)).not.toEqual(base.runs.map((r) => r.refPaths));
  });

  it('bei k = 1 sind beide Lagen gleich', () => {
    const opts = { runs: 6, seed: 5, maxTestPerClass: 8, refClips: 1, calibClips: 3 };
    expect(planPhoneProtocol(section(30, 4), { ...opts, refLayout: 'block' })).toEqual(
      planPhoneProtocol(section(30, 4), { ...opts, refLayout: 'spread' })
    );
  });
});

describe('Mikrofon-Szenario (Kanalplan)', () => {
  const paths = Array.from(
    { length: 40 },
    (_, i) => `pump/id_00/normal/${String(i).padStart(8, '0')}.wav`
  );

  it('verteilt k Referenz-Kanäle über den Ring; Prüf-Pool = Rest', () => {
    expect(spreadRefChannels(3, 8).map((c) => c + 1)).toEqual([1, 4, 6]);
    expect(spreadRefChannels(2, 8).map((c) => c + 1)).toEqual([1, 5]);
    expect(probeChannelPool(3, 8).map((c) => c + 1)).toEqual([2, 3, 5, 7, 8]);
    expect(probeChannelPool(1, 8).map((c) => c + 1)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it('A = Mittel, B = alles Kanal 1', () => {
    const a = planChannels('mean', 3, 8, 1);
    expect(a.refChannel(0)).toBe('mean');
    expect(a.probeChannel(paths[0])).toBe('mean');
    const b = planChannels('same', 3, 8, 1);
    for (let j = 0; j < 3; j++) expect(b.refChannel(j)).toBe(0);
    for (const p of paths) expect(b.probeChannel(p)).toBe(0);
    expect(channelLabel('mean')).toBe('Mittel');
    expect(channelLabel(0)).toBe('1');
  });

  it('C: Referenz Kanal 1, Prüfung aus dem Pool; D: Referenz 1/4/6, nie Überschneidung', () => {
    const c = planChannels('other', 3, 8, 7);
    const d = planChannels('spread', 3, 8, 7);
    for (let j = 0; j < 3; j++) expect(c.refChannel(j)).toBe(0);
    expect([0, 1, 2].map((j) => d.refChannel(j))).toEqual([0, 3, 5]);
    const dRefs = new Set([0, 3, 5]);
    const used = new Set<number>();
    for (const p of paths) {
      const pc = c.probeChannel(p) as number;
      const pd = d.probeChannel(p) as number;
      // C und D: derselbe Kanal je Clip
      expect(pd).toBe(pc);
      expect(dRefs.has(pd)).toBe(false);
      used.add(pd);
    }
    // über viele Clips werden mehrere Kanäle des Pools genutzt
    expect(used.size).toBeGreaterThan(2);
  });

  it('reproduzierbar per Seed, anderer Seed andere Zuordnung', () => {
    const a = planChannels('other', 2, 8, 11);
    const b = planChannels('other', 2, 8, 11);
    const c = planChannels('other', 2, 8, 12);
    expect(paths.map((p) => a.probeChannel(p))).toEqual(paths.map((p) => b.probeChannel(p)));
    expect(paths.map((p) => a.probeChannel(p))).not.toEqual(paths.map((p) => c.probeChannel(p)));
  });

  it('nur ein Kanal: alle Szenarien auf Kanal 1, mit Hinweis', () => {
    for (const sc of ['same', 'other', 'spread'] as const) {
      const pl = planChannels(sc, 3, 1, 1);
      expect(pl.refChannel(2)).toBe(0);
      expect(pl.probeChannel(paths[3])).toBe(0);
      expect(pl.note).toMatch(/nur einen Kanal/);
    }
  });

  it('wavChannelCount liest die Kanalzahl aus dem fmt-Chunk', () => {
    const buf = new ArrayBuffer(44);
    const v = new DataView(buf);
    const put = (off: number, t: string) =>
      [...t].forEach((ch, i) => v.setUint8(off + i, ch.charCodeAt(0)));
    put(0, 'RIFF');
    put(8, 'WAVE');
    put(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(22, 8, true);
    v.setUint32(24, 16000, true);
    put(36, 'data');
    expect(wavChannelCount(buf)).toBe(8);
    expect(Number.isNaN(wavChannelCount(new ArrayBuffer(4)))).toBe(true);
  });
});
