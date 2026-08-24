import { describe, expect, it, vi } from 'vitest';
import type { DiagnosisResult, ReferenceModel } from '@data/types.js';
import type { FrameInput } from './types.js';

/**
 * Kein echtes TF-Hub-Modell im Unit-Test: Hier wird die Verantwortung des
 * Dispatchers geprüft — YAMNet darf im asynchronen Dateiweg weder verworfen
 * noch als „kein synchrones Modell“ abgelehnt werden.
 */
vi.mock('./YamnetEngine.js', () => ({
  YamnetEngine: class {
    readonly id = 'yamnet' as const;
    readonly isAsync = true as const;
    async init(): Promise<void> {}
    async train(): Promise<ReferenceModel> {
      throw new Error('not used');
    }
    async classify(models: ReferenceModel[]): Promise<DiagnosisResult> {
      return {
        id: 'yamnet-test',
        machineId: models[0]?.machineId ?? 'm',
        timestamp: 1,
        healthScore: 87.5,
        status: 'healthy',
        confidence: 0.9,
        rawCosineSimilarity: 0.875,
      };
    }
    async scoreAll() {
      return [
        {
          label: 'YAMNet-Referenz',
          score: 87.5,
          isHealthy: true,
          trainingDate: 1,
        },
      ];
    }
  },
}));

import { classifyWithEnginesAsync, scoreAllWithEnginesAsync } from './registry.js';

const model = {
  engineId: 'yamnet',
  machineId: 'm',
  label: 'YAMNet-Referenz',
  type: 'healthy',
  bank: [[1]],
  mean: [1],
  scalingConstant: 1,
  embeddingDim: 1,
  featureDimension: 1,
  sampleRate: 48000,
  trainingDate: 1,
  trainingDuration: 10,
} as ReferenceModel;

const frame = {
  feature: { features: new Float64Array([1]) },
  rawChunk: new Float32Array(46080),
  sampleRate: 48000,
} as FrameInput;

describe('asynchroner Engine-Dispatcher', () => {
  it('bewertet einen reinen YAMNet-Modellbestand', async () => {
    await expect(classifyWithEnginesAsync([model], frame)).resolves.toMatchObject({
      healthScore: 87.5,
      machineId: 'm',
    });
  });

  it('liefert YAMNet in der Betriebspunkt-Rangliste', async () => {
    await expect(scoreAllWithEnginesAsync([model], frame)).resolves.toEqual([
      expect.objectContaining({ label: 'YAMNet-Referenz', score: 87.5 }),
    ]);
  });
});
