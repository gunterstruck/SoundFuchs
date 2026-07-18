/**
 * ZANOBOT - GMIA Engine (thin wrapper)
 *
 * Wraps the existing, unchanged GMIA functions behind the DiagnosisEngine
 * interface. There is ZERO logic change here: train() calls trainGMIA() plus
 * the same baseline self-test that 2-Reference has always performed, and
 * classify()/scoreAll() delegate to classifyDiagnosticState()/getAllModelScores().
 */

import type { DiagnosisEngine, FrameInput, TrainInput } from './types.js';
import type { GMIAModel, ReferenceModel, FeatureVector } from '@data/types.js';
import type { WorkPointScore } from '../scoring.js';
import { trainGMIA } from '../gmia.js';
import { classifyDiagnosticState, getAllModelScores } from '../scoring.js';
import { logger } from '@utils/logger.js';

/** Number of training samples used for the baseline self-test (unchanged GMIA behavior). */
const BASELINE_SELFTEST_SAMPLES = 20;

export class GmiaEngine implements DiagnosisEngine {
  readonly id = 'gmia' as const;

  train(input: TrainInput, machineId: string): ReferenceModel {
    const model = trainGMIA(input.trainingData, machineId);
    model.engineId = 'gmia';

    // Baseline self-test (identical to the historical 2-Reference logic):
    // score the fresh model against a spread of its own training features.
    const featureVectors = input.trainingData.featureVectors;
    const numSamplesToTest = Math.min(BASELINE_SELFTEST_SAMPLES, featureVectors.length);
    const step = Math.max(1, Math.floor(featureVectors.length / numSamplesToTest));
    const testScores: number[] = [];

    for (let i = 0; i < numSamplesToTest; i++) {
      const featureIndex = Math.min(i * step, featureVectors.length - 1);
      const testFeature = toFeatureVector(featureVectors[featureIndex]);
      try {
        const diagnosis = classifyDiagnosticState([model], testFeature, input.sampleRate);
        testScores.push(diagnosis.healthScore);
      } catch (error) {
        logger.warn(`⚠️ GMIA self-test sample ${i} failed:`, error);
      }
    }

    if (testScores.length === 0) {
      throw new Error('Self-test failed: No valid scores could be calculated');
    }

    model.baselineScore = testScores.reduce((sum, s) => sum + s, 0) / testScores.length;
    return model;
  }

  classify(models: ReferenceModel[], frame: FrameInput) {
    return classifyDiagnosticState(models as GMIAModel[], frame.feature, frame.sampleRate);
  }

  scoreAll(models: ReferenceModel[], frame: FrameInput): WorkPointScore[] {
    return getAllModelScores(models as GMIAModel[], frame.feature, frame.sampleRate);
  }
}

/**
 * Wrap a raw 512-dim feature row as a minimal FeatureVector for inference.
 * GMIA inference only reads `.features`, so this is sufficient for the
 * self-test and avoids depending on FeatureVector internals.
 */
function toFeatureVector(features: Float64Array): FeatureVector {
  return {
    features,
    absoluteFeatures: features,
    bins: features.length,
    frequencyRange: [0, 0],
  };
}
