import { describe, it, expect } from 'vitest';
import {
  decideClip,
  decideWithWinner,
  phoneVerdict,
  emptyConfusion,
  addDecision,
  mergeConfusion,
  metricsOf,
  type FingerprintScore,
} from './classifyEval.js';

describe('decideClip', () => {
  const fps: FingerprintScore[] = [
    { score: 40, type: 'healthy' },
    { score: 82, type: 'faulty' },
    { score: 55, type: 'healthy' },
  ];

  it('best match wins and its type is the threshold-free verdict', () => {
    const d = decideClip(fps, 75);
    expect(d.score).toBe(82);
    expect(d.predictedFree).toBe('faulty');
    expect(d.predicted).toBe('faulty'); // 82 ≥ 75
  });

  it('below the confidence threshold → uncertain (but free verdict keeps type)', () => {
    const d = decideClip([{ score: 60, type: 'healthy' }], 75);
    expect(d.predicted).toBe('uncertain');
    expect(d.predictedFree).toBe('healthy');
  });

  it('empty fingerprint set → uncertain', () => {
    expect(decideClip([], 75).predicted).toBe('uncertain');
  });
});

describe('decideWithWinner', () => {
  it('reports the winning fingerprint by label', () => {
    const d = decideWithWinner(
      [
        { label: 'Referenz', score: 91, type: 'healthy' },
        { label: 'Schlecht #1', score: 84, type: 'faulty' },
      ],
      75
    );
    expect(d.winnerLabel).toBe('Referenz');
    expect(d.predicted).toBe('healthy');
    expect(d.score).toBe(91);
  });

  it('threshold pushes a weak winner to uncertain but keeps its label', () => {
    const d = decideWithWinner([{ label: 'Gut #2', score: 60, type: 'healthy' }], 75);
    expect(d.predicted).toBe('uncertain');
    expect(d.predictedFree).toBe('healthy');
    expect(d.winnerLabel).toBe('Gut #2');
  });

  it('empty set → uncertain with empty label', () => {
    const d = decideWithWinner([], 75);
    expect(d.predicted).toBe('uncertain');
    expect(d.winnerLabel).toBe('');
  });
});

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
});

describe('confusion + metrics', () => {
  it('accumulates and computes hit rates, accuracy and uncertain rate', () => {
    const c = emptyConfusion();
    // 3 normal clips: 2 healthy, 1 uncertain
    addDecision(c, 'normal', { predicted: 'healthy', predictedFree: 'healthy', score: 90 });
    addDecision(c, 'normal', { predicted: 'healthy', predictedFree: 'healthy', score: 88 });
    addDecision(c, 'normal', { predicted: 'uncertain', predictedFree: 'faulty', score: 60 });
    // 3 abnormal clips: 2 faulty, 1 healthy (a miss)
    addDecision(c, 'abnormal', { predicted: 'faulty', predictedFree: 'faulty', score: 85 });
    addDecision(c, 'abnormal', { predicted: 'faulty', predictedFree: 'faulty', score: 80 });
    addDecision(c, 'abnormal', { predicted: 'healthy', predictedFree: 'healthy', score: 92 });

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
    addDecision(a, 'normal', { predicted: 'healthy', predictedFree: 'healthy', score: 90 });
    const b = emptyConfusion();
    addDecision(b, 'abnormal', { predicted: 'faulty', predictedFree: 'faulty', score: 85 });
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
