import { describe, it, expect } from 'vitest';
import {
  phoneVerdict,
  emptyConfusion,
  addDecision,
  mergeConfusion,
  metricsOf,
} from './classifyEval.js';

describe('phoneVerdict (3-Diagnose live-loop logic)', () => {
  it('gauge shows the best HEALTHY score; healthy above the confidence threshold', () => {
    const v = phoneVerdict(
      [
        { label: 'Referenz', type: 'healthy', score: 88 },
        { label: 'Gut #2', type: 'healthy', score: 92 },
        { label: 'Schlecht #1', type: 'faulty', score: 40 },
      ],
      75,
      50
    );
    expect(v.healthScore).toBe(92);
    expect(v.status).toBe('healthy');
    expect(v.detectedState).toBe('Gut #2');
    expect(v.faultDetected).toBe(false);
  });

  it('a confidently matched FAULT forces faulty even with a high healthy score', () => {
    const v = phoneVerdict(
      [
        { label: 'Referenz', type: 'healthy', score: 90 },
        { label: 'Schlecht #1', type: 'faulty', score: 86 },
      ],
      75,
      50
    );
    expect(v.faultDetected).toBe(true);
    expect(v.status).toBe('faulty');
    expect(v.detectedState).toBe('Schlecht #1');
    expect(v.healthScore).toBe(90); // gauge still shows healthy closeness
  });

  it('both thresholds map the healthy score: uncertain band and faulty floor', () => {
    const mid = phoneVerdict([{ label: 'Referenz', type: 'healthy', score: 60 }], 75, 50);
    expect(mid.status).toBe('uncertain');
    const low = phoneVerdict([{ label: 'Referenz', type: 'healthy', score: 40 }], 75, 50);
    expect(low.status).toBe('faulty');
  });

  it('a weak fault match does NOT trigger fault detection', () => {
    const v = phoneVerdict(
      [
        { label: 'Referenz', type: 'healthy', score: 80 },
        { label: 'Schlecht #1', type: 'faulty', score: 74 },
      ],
      75,
      50
    );
    expect(v.faultDetected).toBe(false);
    expect(v.status).toBe('healthy');
  });

  it('with NO fault fingerprints the healthy score alone decides (the field case)', () => {
    // A machine that only carries its silently-created 'Baseline'. This is the
    // common real setup and it must produce a verdict, not a skipped clip.
    const ok = phoneVerdict([{ label: 'Baseline', type: 'healthy', score: 95 }], 90, 80);
    expect(ok.status).toBe('healthy');
    expect(ok.faultDetected).toBe(false);
    const alarm = phoneVerdict([{ label: 'Baseline', type: 'healthy', score: 70 }], 90, 80);
    expect(alarm.status).toBe('faulty');
  });

  it('a clip matching NOTHING reads faulty — the alarm the simplified rule hid', () => {
    // The rule this replaced returned 'uncertain' here, which metricsOf counts as
    // neither hit nor miss. Every alarm the phone raises on a poorly matching clip
    // was therefore invisible in the false-alarm figure.
    const v = phoneVerdict(
      [
        { label: 'Referenz', type: 'healthy', score: 30 },
        { label: 'Schlecht #1', type: 'faulty', score: 20 },
      ],
      90,
      80
    );
    expect(v.status).toBe('faulty');
    expect(v.faultDetected).toBe(false); // not a fault MATCH — just far from normal
  });

  it('predictedFree ignores both thresholds: the better-matching pool wins', () => {
    const faultCloser = phoneVerdict(
      [
        { label: 'Referenz', type: 'healthy', score: 40 },
        { label: 'Schlecht #1', type: 'faulty', score: 55 },
      ],
      90,
      80
    );
    expect(faultCloser.predictedFree).toBe('faulty');
    expect(faultCloser.status).toBe('faulty'); // threshold agrees here

    const healthyCloser = phoneVerdict(
      [
        { label: 'Referenz', type: 'healthy', score: 55 },
        { label: 'Schlecht #1', type: 'faulty', score: 40 },
      ],
      90,
      80
    );
    expect(healthyCloser.predictedFree).toBe('healthy');
    expect(healthyCloser.status).toBe('faulty'); // ...and here it does not
  });

  it('predictedFree is healthy when there is no fault pool at all', () => {
    const v = phoneVerdict([{ label: 'Baseline', type: 'healthy', score: 10 }], 90, 80);
    expect(v.predictedFree).toBe('healthy');
  });

  it('empty fingerprint set → faulty (score 0), no crash', () => {
    const v = phoneVerdict([], 90, 80);
    expect(v.status).toBe('faulty'); // bestHealthy 0 < faultyThreshold
    expect(v.detectedState).toBe('UNKNOWN');
  });
});

describe('confusion + metrics', () => {
  it('accumulates and computes hit rates, accuracy and uncertain rate', () => {
    const c = emptyConfusion();
    // 3 normal clips: 2 healthy, 1 uncertain
    addDecision(c, 'normal', { predicted: 'healthy', predictedFree: 'healthy' });
    addDecision(c, 'normal', { predicted: 'healthy', predictedFree: 'healthy' });
    addDecision(c, 'normal', { predicted: 'uncertain', predictedFree: 'faulty' });
    // 3 abnormal clips: 2 faulty, 1 healthy (a miss)
    addDecision(c, 'abnormal', { predicted: 'faulty', predictedFree: 'faulty' });
    addDecision(c, 'abnormal', { predicted: 'faulty', predictedFree: 'faulty' });
    addDecision(c, 'abnormal', { predicted: 'healthy', predictedFree: 'healthy' });

    const m = metricsOf(c);
    expect(m.nNormal).toBe(3);
    expect(m.nAbnormal).toBe(3);
    expect(m.recallGood).toBeCloseTo(2 / 3, 10);
    expect(m.recallBad).toBeCloseTo(2 / 3, 10);
    // threshold-based accuracy: (2 healthy-normal + 2 faulty-abnormal)/6
    expect(m.accuracy).toBeCloseTo(4 / 6, 10);
    // one normal became uncertain
    expect(m.uncertainRate).toBeCloseTo(1 / 6, 10);
    // threshold-free: normal→{healthy:2, faulty:1}, abnormal→{faulty:2, healthy:1}
    // correct free = 2 (normal healthy) + 2 (abnormal faulty) = 4 → 4/6
    expect(m.accuracyFree).toBeCloseTo(4 / 6, 10);
  });

  it('mergeConfusion folds runs together additively', () => {
    const a = emptyConfusion();
    addDecision(a, 'normal', { predicted: 'healthy', predictedFree: 'healthy' });
    const b = emptyConfusion();
    addDecision(b, 'abnormal', { predicted: 'faulty', predictedFree: 'faulty' });
    const m = metricsOf(mergeConfusion(a, b));
    expect(m.nNormal).toBe(1);
    expect(m.nAbnormal).toBe(1);
    expect(m.accuracy).toBe(1);
  });

  it('metrics are NaN for an empty confusion', () => {
    const m = metricsOf(emptyConfusion());
    expect(Number.isNaN(m.accuracy)).toBe(true);
    expect(Number.isNaN(m.recallGood)).toBe(true);
  });
});
