import { describe, it, expect } from 'vitest';
import {
  computeBaselineSpread,
  baselineFloor,
  baselineResolution,
  summarizeBaselineSpread,
  DEFAULT_BASELINE_K,
} from './baselineSpread.js';

describe('computeBaselineSpread', () => {
  it('mean stays exactly the historical baselineScore', () => {
    // Guard against a silent change of meaning: the mean is what every engine
    // has always stored and what calibrateScore divides by. Median/MAD are
    // additive, they must not move it.
    const scores = [80, 85, 90, 95, 100];
    const s = computeBaselineSpread(scores);
    expect(s.mean).toBeCloseTo(90, 10);
  });

  it('median is robust where the mean is not', () => {
    // One collapsed frame (a door slam during the reference) drags the mean far
    // more than the median — which is the whole reason for keeping both.
    const withOutlier = computeBaselineSpread([88, 89, 90, 91, 2]);
    expect(withOutlier.median).toBe(89);
    expect(withOutlier.mean).toBeLessThan(80);
  });

  it('MAD is zero for a perfectly tight reference and grows with spread', () => {
    expect(computeBaselineSpread([90, 90, 90, 90]).mad).toBe(0);
    const tight = computeBaselineSpread([89, 90, 91]);
    const wide = computeBaselineSpread([70, 90, 110]);
    expect(wide.mad).toBeGreaterThan(tight.mad);
  });

  it('throws without any self-test score', () => {
    expect(() => computeBaselineSpread([])).toThrow(/keine Selbsttest-Scores/);
  });
});

describe('baselineFloor', () => {
  it('a tight reference yields a floor close to 100, a wide one far below', () => {
    const tight = { baselineScore: 89, baselineMedian: 89, baselineMad: 0.5 };
    const wide = { baselineScore: 89, baselineMedian: 89, baselineMad: 8 };
    const tightFloor = baselineFloor(tight)!;
    const wideFloor = baselineFloor(wide)!;
    expect(tightFloor).toBeGreaterThan(97);
    expect(wideFloor).toBeLessThan(75);
    // The point of the whole exercise: the SAME displayed score means different
    // things on these two machines, so one fixed percentage cannot serve both.
    expect(tightFloor - wideFloor).toBeGreaterThan(20);
  });

  it('is expressed on the calibrated (displayed) scale', () => {
    // median == baselineScore and mad == 0 → the floor is the calibration anchor,
    // i.e. exactly 100 on the displayed scale.
    expect(baselineFloor({ baselineScore: 89, baselineMedian: 89, baselineMad: 0 })).toBeCloseTo(
      100,
      10
    );
  });

  it('falls monotonically with k', () => {
    const m = { baselineScore: 89, baselineMedian: 89, baselineMad: 3 };
    const k1 = baselineFloor(m, 1)!;
    const k3 = baselineFloor(m, 3)!;
    const k6 = baselineFloor(m, 6)!;
    expect(k1).toBeGreaterThan(k3);
    expect(k3).toBeGreaterThan(k6);
  });

  it('defaults to k = 3, the same k the drift detector already uses', () => {
    expect(DEFAULT_BASELINE_K).toBe(3);
    const m = { baselineScore: 89, baselineMedian: 89, baselineMad: 2 };
    expect(baselineFloor(m)).toBe(baselineFloor(m, 3));
  });

  it('clamps into [0, 100] instead of returning nonsense', () => {
    const huge = { baselineScore: 89, baselineMedian: 89, baselineMad: 500 };
    expect(baselineFloor(huge)).toBe(0);
  });

  it('returns null for models without the spread fields (legacy + temporal)', () => {
    expect(baselineFloor({ baselineScore: 89 })).toBeNull();
    expect(baselineFloor({})).toBeNull();
    expect(baselineFloor({ baselineMedian: 89, baselineMad: 1 })).toBeNull();
    // A zero baseline would divide by zero — treated as "no information".
    expect(baselineFloor({ baselineScore: 0, baselineMedian: 89, baselineMad: 1 })).toBeNull();
  });

  it('rejects an invalid k as a programming error', () => {
    const m = { baselineScore: 89, baselineMedian: 89, baselineMad: 1 };
    expect(() => baselineFloor(m, -1)).toThrow(/k muss endlich/);
    expect(() => baselineFloor(m, NaN)).toThrow(/k muss endlich/);
  });
});

describe('baselineResolution', () => {
  it('says in points what the comparison resolves', () => {
    // MAD 0,5 auf einem Anker von 89 → k·MAD gestreckt auf die Anzeige-Skala:
    // 3 · 0,5 · 100/89 ≈ 1,69 Punkte. Das ist die Zahl, die angezeigt wird.
    const r = baselineResolution({ baselineScore: 89, baselineMedian: 89, baselineMad: 0.5 })!;
    expect(r.points).toBeCloseTo((3 * 0.5 * 100) / 89, 10);
    expect(r.medianScore).toBeCloseTo(100, 10);
    expect(r.k).toBe(DEFAULT_BASELINE_K);
  });

  it('stays consistent with baselineFloor — one calculation, two views', () => {
    // Wäre das doppelt gerechnet, könnten Zahl und Boden auseinanderlaufen und
    // die Anzeige würde etwas anderes behaupten als die Schwelle.
    for (const mad of [0, 0.3, 1, 4, 500]) {
      for (const k of [0, 1, 3, 6]) {
        const m = { baselineScore: 91.4, baselineMedian: 92.1, baselineMad: mad };
        expect(baselineResolution(m, k)!.floor).toBe(baselineFloor(m, k));
      }
    }
  });

  it('a median above the anchor is reported, not hidden — only the floor is clamped', () => {
    // Linksschiefe Selbsttest-Verteilung (einzelne schlechte Frames ziehen den
    // MITTELWERT, mit dem kalibriert wird, unter den Median): medianScore > 100.
    // Dann läuft der Boden über den Deckel und wird auf 100 geklemmt — dort ist
    // er nutzlos, weil der angezeigte Score ebenfalls bei 100 endet. Genau
    // deshalb ist `points` die angezeigte Zahl und nicht der Boden: die
    // Auflösung bleibt in diesem Fall aussagekräftig.
    const r = baselineResolution({ baselineScore: 89, baselineMedian: 93, baselineMad: 1 })!;
    expect(r.medianScore).toBeGreaterThan(100);
    expect(r.medianScore - r.points).toBeGreaterThan(100);
    expect(r.floor).toBe(100);
    expect(r.points).toBeCloseTo((3 * 100) / 89, 10);
  });

  it('a wide reference resolves coarsely — that is the whole message', () => {
    const tight = baselineResolution({ baselineScore: 89, baselineMedian: 89, baselineMad: 0.4 })!;
    const wide = baselineResolution({ baselineScore: 89, baselineMedian: 89, baselineMad: 6 })!;
    expect(tight.points).toBeLessThan(2);
    expect(wide.points).toBeGreaterThan(15);
  });

  it('returns null instead of inventing a number', () => {
    expect(baselineResolution({ baselineScore: 89 })).toBeNull();
    expect(baselineResolution({})).toBeNull();
    expect(baselineResolution({ baselineScore: 0, baselineMedian: 89, baselineMad: 1 })).toBeNull();
    // Eine negative Streuung kann nur ein Rechenfehler stromaufwärts sein.
    expect(
      baselineResolution({ baselineScore: 89, baselineMedian: 89, baselineMad: -1 })
    ).toBeNull();
  });

  it('rejects an invalid k as a programming error', () => {
    const m = { baselineScore: 89, baselineMedian: 89, baselineMad: 1 };
    expect(() => baselineResolution(m, -1)).toThrow(/k muss endlich/);
    expect(() => baselineResolution(m, NaN)).toThrow(/k muss endlich/);
  });
});

describe('summarizeBaselineSpread', () => {
  const model = (baselineScore: number, mad: number) => ({
    baselineScore,
    baselineMedian: baselineScore,
    baselineMad: mad,
  });

  it('reports the baselineScore range — the open question before any threshold', () => {
    const s = summarizeBaselineSpread([model(88, 1), model(90, 1), model(83, 1)])!;
    expect(s.n).toBe(3);
    expect(s.baselineMin).toBe(83);
    expect(s.baselineMax).toBe(90);
    expect(s.baselineMedian).toBe(88);
  });

  it('reports the floor range at k', () => {
    const s = summarizeBaselineSpread([model(89, 0), model(89, 8)])!;
    expect(s.k).toBe(DEFAULT_BASELINE_K);
    expect(s.floorMax).toBeCloseTo(100, 10);
    expect(s.floorMin).toBeLessThan(80);
  });

  it('skips models without spread instead of guessing for them', () => {
    const s = summarizeBaselineSpread([model(89, 1), { baselineScore: 89 }, {}])!;
    expect(s.n).toBe(1);
  });

  it('returns null when no model carries a spread at all', () => {
    expect(summarizeBaselineSpread([{ baselineScore: 89 }, {}])).toBeNull();
    expect(summarizeBaselineSpread([])).toBeNull();
  });
});
