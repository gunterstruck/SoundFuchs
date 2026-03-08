/**
 * ZANOBOT - SCORING TESTS
 *
 * Tests for health score calculation and classification
 */

import { describe, it, expect } from 'vitest';
import {
  calculateHealthScore,
  classifyHealthStatus,
  getClassificationDetails,
  calculateConfidence,
  filterHealthScoreForDisplay,
  ScoreHistory,
  calculateScoreStatistics,
  calculateDegradation,
  classifyDiagnosticState,
  calculateMagnitudeFactor,
} from './scoring.js';
import type { GMIAModel, FeatureVector } from '@data/types.js';

describe('Health Scoring', () => {
  const mockModel: GMIAModel = {
    machineId: 'test-machine',
    label: 'Baseline',
    type: 'healthy',
    weightVector: new Float64Array([1, 2, 3]),
    regularization: 1e9,
    scalingConstant: 2.5,
    featureDimension: 3,
    trainingDate: Date.now(),
    trainingDuration: 10,
    sampleRate: 44100,
    metadata: {
      meanCosineSimilarity: 0.95,
      targetScore: 0.9,
    },
  };

  describe('calculateHealthScore()', () => {
    it('should calculate score using tanh formula', () => {
      const cosineSimilarity = 0.9;
      const scalingConstant = 2.5;

      const score = calculateHealthScore(cosineSimilarity, scalingConstant);

      // Score = 100 * (tanh(2.5 * 0.9))^2
      const expected = Math.pow(Math.tanh(2.5 * 0.9), 2) * 100;

      expect(score).toBeCloseTo(expected, 2);
    });

    it('should return 100 for perfect similarity', () => {
      const score = calculateHealthScore(1.0, 2.5);

      expect(score).toBeGreaterThan(95);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should handle negative similarity (clamped to zero)', () => {
      const score = calculateHealthScore(-0.5, 2.5);

      // IMPORTANT: Implementation clamps negative cosine to 0 before tanh
      // This prevents negative similarity from producing false positives
      // See scoring.ts:38 - clampedCosine = Math.max(0, cosineSimilarity)
      expect(score).toBe(0);
    });

    it('should clamp score to [0, 100]', () => {
      const highScore = calculateHealthScore(10, 10); // Extreme values
      const lowScore = calculateHealthScore(-10, 10);

      expect(highScore).toBeLessThanOrEqual(100);
      expect(lowScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('classifyHealthStatus()', () => {
    it('should classify score >= 75 as healthy (default threshold)', () => {
      expect(classifyHealthStatus(75)).toBe('healthy');
      expect(classifyHealthStatus(85)).toBe('healthy');
      expect(classifyHealthStatus(100)).toBe('healthy');
    });

    it('should classify score 50-75 as uncertain (default threshold)', () => {
      expect(classifyHealthStatus(50)).toBe('uncertain');
      expect(classifyHealthStatus(60)).toBe('uncertain');
      expect(classifyHealthStatus(74)).toBe('uncertain');
    });

    it('should classify score < 50 as faulty (default threshold)', () => {
      expect(classifyHealthStatus(0)).toBe('faulty');
      expect(classifyHealthStatus(25)).toBe('faulty');
      expect(classifyHealthStatus(49)).toBe('faulty');
    });

    it('should respect custom healthy threshold', () => {
      // With threshold of 84, a score of 73 should be uncertain (not healthy)
      expect(classifyHealthStatus(73, 84)).toBe('uncertain');
      expect(classifyHealthStatus(84, 84)).toBe('healthy');
      expect(classifyHealthStatus(90, 84)).toBe('healthy');

      // With threshold of 90, a score of 85 should be uncertain
      expect(classifyHealthStatus(85, 90)).toBe('uncertain');
      expect(classifyHealthStatus(90, 90)).toBe('healthy');
    });

    it('should still use uncertain threshold (50) for faulty classification with default', () => {
      // Even with custom healthy threshold, uncertain/faulty boundary stays at 50 by default
      expect(classifyHealthStatus(49, 90)).toBe('faulty');
      expect(classifyHealthStatus(50, 90)).toBe('uncertain');
      expect(classifyHealthStatus(89, 90)).toBe('uncertain');
      expect(classifyHealthStatus(90, 90)).toBe('healthy');
    });

    it('should respect custom faulty threshold', () => {
      // With healthyThreshold=80 and faultyThreshold=40
      expect(classifyHealthStatus(85, 80, 40)).toBe('healthy');   // >= 80
      expect(classifyHealthStatus(80, 80, 40)).toBe('healthy');   // >= 80
      expect(classifyHealthStatus(60, 80, 40)).toBe('uncertain'); // 40-80
      expect(classifyHealthStatus(40, 80, 40)).toBe('uncertain'); // >= 40
      expect(classifyHealthStatus(39, 80, 40)).toBe('faulty');    // < 40

      // With healthyThreshold=84 and faultyThreshold=60
      expect(classifyHealthStatus(90, 84, 60)).toBe('healthy');   // >= 84
      expect(classifyHealthStatus(73, 84, 60)).toBe('uncertain'); // 60-84
      expect(classifyHealthStatus(60, 84, 60)).toBe('uncertain'); // >= 60
      expect(classifyHealthStatus(59, 84, 60)).toBe('faulty');    // < 60
    });

    it('should handle edge case where both thresholds are the same', () => {
      // If both thresholds are 70, scores >=70 are healthy, <70 are faulty (no uncertain range)
      expect(classifyHealthStatus(70, 70, 70)).toBe('healthy');
      expect(classifyHealthStatus(69, 70, 70)).toBe('faulty');
    });
  });

  describe('getClassificationDetails()', () => {
    it('should provide healthy classification with recommendation', () => {
      const details = getClassificationDetails(85);

      expect(details.status).toBe('healthy');
      expect(details.confidence).toBeGreaterThan(70);
      expect(details.recommendation).toContain('normal');
    });

    it('should provide uncertain classification', () => {
      const details = getClassificationDetails(60);

      expect(details.status).toBe('uncertain');
      expect(details.recommendation).toContain('Review recommended');
    });

    it('should provide faulty classification', () => {
      const details = getClassificationDetails(30);

      expect(details.status).toBe('faulty');
      expect(details.recommendation).toContain('Inspection recommended');
    });
  });

  describe('calculateConfidence()', () => {
    it('should return higher confidence for consistent readings', () => {
      const consistentReadings = [0.9, 0.91, 0.89, 0.9, 0.92];

      const confidence = calculateConfidence(mockModel, consistentReadings);

      expect(confidence).toBeGreaterThan(70);
    });

    it('should return lower confidence for inconsistent readings', () => {
      const inconsistentReadings = [0.1, 0.9, 0.2, 0.8, 0.3];

      const confidence = calculateConfidence(mockModel, inconsistentReadings);

      expect(confidence).toBeLessThan(50);
    });

    it('should penalize old models', () => {
      const oldModel = {
        ...mockModel,
        trainingDate: Date.now() - 365 * 24 * 60 * 60 * 1000, // 1 year ago
      };

      const readings = [0.9, 0.9, 0.9];
      const confidence = calculateConfidence(oldModel, readings);

      expect(confidence).toBeLessThan(80);
    });
  });

  describe('filterHealthScoreForDisplay()', () => {
    it('should filter scores using trimmed mean (remove 2 min, 2 max)', () => {
      const scores = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95];
      // After removing 2 min (50, 55) and 2 max (90, 95): [60, 65, 70, 75, 80, 85]
      // Mean: (60+65+70+75+80+85)/6 = 72.5

      const filtered = filterHealthScoreForDisplay(scores);

      expect(filtered).toBeCloseTo(72.5, 1);
    });

    it('should return mean if less than 10 scores', () => {
      const scores = [70, 80, 90];
      const filtered = filterHealthScoreForDisplay(scores);

      expect(filtered).toBeCloseTo(80, 1);
    });

    it('should handle empty array', () => {
      const filtered = filterHealthScoreForDisplay([]);

      expect(filtered).toBe(0);
    });
  });

  describe('ScoreHistory', () => {
    it('should maintain rolling buffer of scores', () => {
      const history = new ScoreHistory();

      for (let i = 1; i <= 15; i++) {
        history.addScore(i * 10);
      }

      const scores = history.getAllScores();

      expect(scores.length).toBe(10); // Max 10 scores
      expect(scores[0]).toBe(60); // First score after 5 dropped
      expect(scores[9]).toBe(150); // Last score
    });

    it('should provide filtered score', () => {
      const history = new ScoreHistory();

      for (let i = 1; i <= 10; i++) {
        history.addScore(i * 10);
      }

      const filtered = history.getFilteredScore();

      // Removes 10, 20, 90, 100, mean of rest
      expect(filtered).toBeGreaterThan(40);
      expect(filtered).toBeLessThan(70);
    });

    it('should clear all scores', () => {
      const history = new ScoreHistory();
      history.addScore(50);
      history.addScore(60);

      history.clear();

      expect(history.getAllScores().length).toBe(0);
    });

    it('should track if history is full', () => {
      const history = new ScoreHistory();

      expect(history.hasFullHistory()).toBe(false);

      for (let i = 0; i < 10; i++) {
        history.addScore(50);
      }

      expect(history.hasFullHistory()).toBe(true);
    });
  });

  describe('calculateScoreStatistics()', () => {
    it('should calculate statistics correctly', () => {
      const scores = [70, 75, 80, 85, 90];

      const stats = calculateScoreStatistics(scores);

      expect(stats.mean).toBeCloseTo(80, 1);
      expect(stats.min).toBe(70);
      expect(stats.max).toBe(90);
      expect(stats.stdDev).toBeGreaterThan(5);
    });

    it('should handle empty array', () => {
      const stats = calculateScoreStatistics([]);

      expect(stats.mean).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.stdDev).toBe(0);
    });
  });

  describe('calculateDegradation()', () => {
    it('should calculate positive degradation for declining scores', () => {
      const degradation = calculateDegradation(90, 70);

      expect(degradation).toBe(20); // 90 - 70 = 20
    });

    it('should calculate negative degradation for improving scores', () => {
      const degradation = calculateDegradation(70, 90);

      expect(degradation).toBe(-20); // 70 - 90 = -20
    });

    it('should return zero for unchanged scores', () => {
      const degradation = calculateDegradation(80, 80);

      expect(degradation).toBe(0);
    });
  });

  describe('classifyDiagnosticState() - MULTICLASS DIAGNOSIS', () => {
    // Create test models with different characteristics
    // Mix of healthy states and fault states to test type system
    const baselineModel: GMIAModel = {
      machineId: 'test-machine',
      label: 'Baseline',
      type: 'healthy',
      weightVector: new Float64Array([1.0, 0.5, 0.3]),
      regularization: 1e9,
      scalingConstant: 2.5,
      featureDimension: 3,
      trainingDate: Date.now(),
      trainingDuration: 10,
      sampleRate: 44100,
      metadata: {
        meanCosineSimilarity: 0.95,
        targetScore: 0.9,
      },
    };

    const healthyModel2: GMIAModel = {
      machineId: 'test-machine',
      label: 'Volllast',
      type: 'healthy',
      weightVector: new Float64Array([0.8, 0.6, 0.4]),
      regularization: 1e9,
      scalingConstant: 2.5,
      featureDimension: 3,
      trainingDate: Date.now(),
      trainingDuration: 10,
      sampleRate: 44100,
      metadata: {
        meanCosineSimilarity: 0.95,
        targetScore: 0.9,
      },
    };

    const faultModel1: GMIAModel = {
      machineId: 'test-machine',
      label: 'Unwucht',
      type: 'faulty',
      weightVector: new Float64Array([0.3, 1.0, 0.5]),
      regularization: 1e9,
      scalingConstant: 2.5,
      featureDimension: 3,
      trainingDate: Date.now(),
      trainingDuration: 10,
      sampleRate: 44100,
      metadata: {
        meanCosineSimilarity: 0.95,
        targetScore: 0.9,
      },
    };

    const faultModel2: GMIAModel = {
      machineId: 'test-machine',
      label: 'Lagerschaden',
      type: 'faulty',
      weightVector: new Float64Array([0.5, 0.3, 1.0]),
      regularization: 1e9,
      scalingConstant: 2.5,
      featureDimension: 3,
      trainingDate: Date.now(),
      trainingDuration: 10,
      sampleRate: 44100,
      metadata: {
        meanCosineSimilarity: 0.95,
        targetScore: 0.9,
      },
    };

    it('should select model with highest score', () => {
      const models = [baselineModel, faultModel1, faultModel2];

      // Feature vector that matches baseline model closely
      const featureVector: FeatureVector = {
        features: new Float64Array([0.95, 0.48, 0.29]),
        absoluteFeatures: new Float64Array([0.95, 0.48, 0.29]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, featureVector, 44100);

      // Should match Baseline (highest similarity)
      expect(result.metadata?.detectedState).toBe('Baseline');
      expect(result.status).toBe('healthy');
    });

    it('should detect fault state when feature matches fault model', () => {
      const models = [baselineModel, faultModel1, faultModel2];

      // Feature vector that matches fault model 1 (Unwucht)
      const featureVector: FeatureVector = {
        features: new Float64Array([0.29, 0.95, 0.48]),
        absoluteFeatures: new Float64Array([0.29, 0.95, 0.48]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, featureVector, 44100);

      // Should match Unwucht (fault state)
      expect(result.metadata?.detectedState).toBe('Unwucht');
      expect(result.status).toBe('faulty');
    });

    it.skip('should detect uncertain for low scores (< 70%) - SKIPPED: Test depends on Magnitude Factor (deactivated)', () => {
      const models = [baselineModel, faultModel1, faultModel2];

      // Feature vector with very low similarity to all models
      const featureVector: FeatureVector = {
        features: new Float64Array([0.1, 0.1, 0.1]),
        absoluteFeatures: new Float64Array([0.1, 0.1, 0.1]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, featureVector, 44100);

      // Should be uncertain (anomaly that doesn't match any known state)
      expect(result.metadata?.detectedState).toBe('UNKNOWN');
      expect(result.status).toBe('uncertain');
      expect(result.healthScore).toBeLessThan(70);
    });

    it('should evaluate all models and store count in metadata', () => {
      const models = [baselineModel, faultModel1, faultModel2];

      const featureVector: FeatureVector = {
        features: new Float64Array([0.5, 0.5, 0.5]),
        absoluteFeatures: new Float64Array([0.5, 0.5, 0.5]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, featureVector, 44100);

      expect(result.metadata?.multiclassMode).toBe(true);
      expect(result.metadata?.evaluatedModels).toBe(3);
    });

    it('should throw error if no models provided', () => {
      const featureVector: FeatureVector = {
        features: new Float64Array([0.5, 0.5, 0.5]),
        absoluteFeatures: new Float64Array([0.5, 0.5, 0.5]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      expect(() => classifyDiagnosticState([], featureVector, 44100)).toThrow();
    });

    it('should include analysis hint with detected state', () => {
      const models = [baselineModel, faultModel1];

      const featureVector: FeatureVector = {
        features: new Float64Array([0.95, 0.48, 0.29]),
        absoluteFeatures: new Float64Array([0.95, 0.48, 0.29]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, featureVector, 44100);

      expect(result.analysis?.hint).toBeDefined();
      expect(result.analysis?.hint).toContain('Baseline');
    });

    it('should work with single model (backward compatibility)', () => {
      const models = [baselineModel];

      const featureVector: FeatureVector = {
        features: new Float64Array([0.95, 0.48, 0.29]),
        absoluteFeatures: new Float64Array([0.95, 0.48, 0.29]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, featureVector, 44100);

      expect(result.metadata?.detectedState).toBe('Baseline');
      expect(result.metadata?.evaluatedModels).toBe(1);
    });

    // NEW: Tests for type system (healthy vs faulty)
    it('should inherit status from model type (healthy)', () => {
      const models = [baselineModel, healthyModel2, faultModel1];

      // Feature vector that matches healthyModel2 (Volllast)
      const featureVector: FeatureVector = {
        features: new Float64Array([0.78, 0.59, 0.39]),
        absoluteFeatures: new Float64Array([0.78, 0.59, 0.39]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, featureVector, 44100);

      // Should match Volllast (healthy state)
      expect(result.metadata?.detectedState).toBe('Volllast');
      expect(result.status).toBe('healthy'); // Type from model!
    });

    it('should inherit status from model type (faulty)', () => {
      const models = [baselineModel, faultModel1, faultModel2];

      // Feature vector that matches faultModel2 (Lagerschaden)
      const featureVector: FeatureVector = {
        features: new Float64Array([0.48, 0.29, 0.95]),
        absoluteFeatures: new Float64Array([0.48, 0.29, 0.95]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, featureVector, 44100);

      // Should match Lagerschaden (fault state)
      expect(result.metadata?.detectedState).toBe('Lagerschaden');
      expect(result.status).toBe('faulty'); // Type from model!
    });

    it('should support multiple healthy states', () => {
      // Test scenario: Multiple normal operating conditions
      const models = [baselineModel, healthyModel2];

      // Feature matches healthyModel2
      const featureVector: FeatureVector = {
        features: new Float64Array([0.78, 0.59, 0.39]),
        absoluteFeatures: new Float64Array([0.78, 0.59, 0.39]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, featureVector, 44100);

      expect(result.metadata?.detectedState).toBe('Volllast');
      expect(result.status).toBe('healthy');
    });

    it('should support multiple fault states', () => {
      // Test scenario: Multiple known failure modes
      const models = [faultModel1, faultModel2];

      // Feature matches faultModel1
      const featureVector: FeatureVector = {
        features: new Float64Array([0.29, 0.95, 0.48]),
        absoluteFeatures: new Float64Array([0.29, 0.95, 0.48]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, featureVector, 44100);

      expect(result.metadata?.detectedState).toBe('Unwucht');
      expect(result.status).toBe('faulty');
    });

    it('should throw error on sample rate mismatch', () => {
      // Test sample rate validation
      const models = [baselineModel]; // Model trained at 44100Hz

      const featureVector: FeatureVector = {
        features: new Float64Array([0.95, 0.48, 0.29]),
        absoluteFeatures: new Float64Array([0.95, 0.48, 0.29]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      // Try to classify with different sample rate (48000Hz)
      expect(() => classifyDiagnosticState(models, featureVector, 48000)).toThrow(
        'Sample Rate Mismatch'
      );
    });

    it('should accept matching sample rate', () => {
      // Test that matching sample rate works correctly
      const models = [baselineModel]; // Model trained at 44100Hz

      const featureVector: FeatureVector = {
        features: new Float64Array([0.95, 0.48, 0.29]),
        absoluteFeatures: new Float64Array([0.95, 0.48, 0.29]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      // Should work with matching sample rate
      expect(() => classifyDiagnosticState(models, featureVector, 44100)).not.toThrow();
    });
  });

  describe.skip('calculateMagnitudeFactor() - MAGNITUDE FACTOR EXTENSION (DISABLED - Feature deactivated)', () => {
    it('should return 1.0 when magnitudes are equal', () => {
      const w = new Float64Array([3, 4]); // ||w|| = 5
      const f = new Float64Array([3, 4]); // ||f|| = 5
      const factor = calculateMagnitudeFactor(w, f);

      expect(factor).toBeCloseTo(1.0, 2);
    });

    it('should return < 1.0 when feature magnitude is smaller', () => {
      const w = new Float64Array([30, 40]); // ||w|| = 50
      const f = new Float64Array([3, 4]); // ||f|| = 5
      const factor = calculateMagnitudeFactor(w, f);

      // Expected: 5 / 50 = 0.1
      expect(factor).toBeCloseTo(0.1, 2);
    });

    it('should return 1.0 (clamped) when feature magnitude is larger', () => {
      const w = new Float64Array([3, 4]); // ||w|| = 5
      const f = new Float64Array([30, 40]); // ||f|| = 50
      const factor = calculateMagnitudeFactor(w, f);

      // Expected: min(1, 50/5) = min(1, 10) = 1.0
      expect(factor).toBe(1.0);
    });

    it('should return 0 for zero feature vector', () => {
      const w = new Float64Array([3, 4, 5]);
      const f = new Float64Array([0, 0, 0]);
      const factor = calculateMagnitudeFactor(w, f);

      expect(factor).toBe(0);
    });

    it('should return 0 for zero weight vector (edge case)', () => {
      const w = new Float64Array([0, 0, 0]);
      const f = new Float64Array([1, 2, 3]);
      const factor = calculateMagnitudeFactor(w, f);

      // weightMagnitude === 0 triggers safety check
      expect(factor).toBe(0);
    });

    it('should handle very small magnitudes without NaN', () => {
      const w = new Float64Array([1e-10, 1e-10]);
      const f = new Float64Array([1e-11, 1e-11]);
      const factor = calculateMagnitudeFactor(w, f);

      // UPDATED: With MIN_REFERENCE_MAGNITUDE check, very small weight vectors
      // are rejected (magnitude < 0.3), returning 0 instead of ratio
      expect(Number.isFinite(factor)).toBe(true);
      expect(factor).toBe(0); // Rejected due to low reference magnitude
    });

    it('should handle very large magnitudes without overflow', () => {
      const w = new Float64Array([1e100, 1e100]);
      const f = new Float64Array([1e99, 1e99]);
      const factor = calculateMagnitudeFactor(w, f);

      // Should still calculate ratio correctly
      expect(Number.isFinite(factor)).toBe(true);
      expect(factor).toBeCloseTo(0.1, 1);
    });

    it('should handle realistic audio feature vectors (512 bins)', () => {
      // Simulate realistic feature vectors from audio
      // UPDATED: Use larger values to pass MIN_REFERENCE_MAGNITUDE threshold (0.3)
      const w = new Float64Array(512).fill(0).map(() => Math.random() * 0.05); // Reference (magnitude ~0.6)
      const f = new Float64Array(512).fill(0).map(() => Math.random() * 0.025); // Test (half energy)

      const factor = calculateMagnitudeFactor(w, f);

      // Factor should be around 0.5 (test is half the energy of reference)
      // Reference magnitude > 0.3, so calculation proceeds normally
      expect(factor).toBeGreaterThan(0.3);
      expect(factor).toBeLessThan(0.7);
    });

    it('should be proportional to energy ratio', () => {
      const w = new Float64Array([10, 0]); // ||w|| = 10

      // Test different energy levels
      const f1 = new Float64Array([10, 0]); // ||f|| = 10 → factor = 1.0
      const f2 = new Float64Array([5, 0]); // ||f|| = 5  → factor = 0.5
      const f3 = new Float64Array([1, 0]); // ||f|| = 1  → factor = 0.1

      expect(calculateMagnitudeFactor(w, f1)).toBeCloseTo(1.0, 2);
      expect(calculateMagnitudeFactor(w, f2)).toBeCloseTo(0.5, 2);
      expect(calculateMagnitudeFactor(w, f3)).toBeCloseTo(0.1, 2);
    });

    it('should never return values > 1.0 (clamping)', () => {
      const w = new Float64Array([1, 0]);

      // Test increasingly loud signals
      for (let scale = 1; scale <= 100; scale *= 10) {
        const f = new Float64Array([scale, 0]);
        const factor = calculateMagnitudeFactor(w, f);
        expect(factor).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe.skip('INTEGRATION: Magnitude Factor in Multiclass Diagnosis (DISABLED - Feature deactivated)', () => {
    const baselineModel: GMIAModel = {
      machineId: 'test-machine',
      label: 'Baseline',
      type: 'healthy',
      weightVector: new Float64Array([1.0, 0.5, 0.3]),
      regularization: 1e9,
      scalingConstant: 2.5,
      featureDimension: 3,
      trainingDate: Date.now(),
      trainingDuration: 10,
      sampleRate: 44100,
      metadata: {
        meanCosineSimilarity: 0.95,
        targetScore: 0.9,
      },
    };

    it('should reject silent background noise (low magnitude)', () => {
      const models = [baselineModel];

      // Simulate background noise: random pattern, very low energy (1% of normal)
      const noisyFeature: FeatureVector = {
        features: new Float64Array([0.01, 0.005, 0.003]), // Very quiet
        absoluteFeatures: new Float64Array([0.01, 0.005, 0.003]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, noisyFeature, 44100);

      // Should have very low score due to low magnitude
      // Even if pattern matches, magnitude factor will penalize it heavily
      expect(result.healthScore).toBeLessThan(20);
    });

    it('should accept loud signal with similar pattern', () => {
      const models = [baselineModel];

      // Similar pattern to baseline, high energy (150% of normal)
      const loudFeature: FeatureVector = {
        features: new Float64Array([1.5, 0.75, 0.45]), // 50% louder
        absoluteFeatures: new Float64Array([1.5, 0.75, 0.45]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, loudFeature, 44100);

      // Should NOT be penalized (magnitude factor clamped to 1.0)
      // Only pattern matters, not higher energy
      expect(result.healthScore).toBeGreaterThan(80);
    });

    it('should penalize microphone-too-far scenario (50% energy)', () => {
      const models = [baselineModel];

      // Same pattern as baseline, but only 50% energy (microphone further away)
      const distantFeature: FeatureVector = {
        features: new Float64Array([0.5, 0.25, 0.15]),
        absoluteFeatures: new Float64Array([0.5, 0.25, 0.15]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, distantFeature, 44100);

      // Magnitude factor should be ~0.5, reducing score
      // Score should be lower than if magnitude was equal
      expect(result.healthScore).toBeLessThan(80);
      expect(result.healthScore).toBeGreaterThan(30); // Still some similarity
    });

    it('should handle machine-off scenario (near-zero energy)', () => {
      const models = [baselineModel];

      // Machine is OFF: only ambient noise, extremely low energy
      const machineOffFeature: FeatureVector = {
        features: new Float64Array([0.001, 0.0005, 0.0003]),
        absoluteFeatures: new Float64Array([0.001, 0.0005, 0.0003]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, machineOffFeature, 44100);

      // Should be classified as uncertain or very low score
      expect(result.healthScore).toBeLessThan(10);
      // Status should be uncertain due to low score
      expect(result.status).toBe('uncertain');
      expect(result.metadata?.detectedState).toBe('UNKNOWN');
    });

    it('should distinguish between pattern mismatch and energy mismatch', () => {
      const models = [baselineModel];
      // Baseline model has weightVector: [1.0, 0.5, 0.3]

      // Scenario 1: Wrong pattern, correct energy
      // Use orthogonal pattern (perpendicular vector in feature space)
      const wrongPattern: FeatureVector = {
        features: new Float64Array([0.0, 0.8, 0.0]), // Orthogonal pattern
        absoluteFeatures: new Float64Array([0.0, 0.8, 0.0]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      // Scenario 2: Correct pattern, wrong energy (too quiet)
      const wrongEnergy: FeatureVector = {
        features: new Float64Array([0.1, 0.05, 0.03]), // Same pattern, 10% energy
        absoluteFeatures: new Float64Array([0.1, 0.05, 0.03]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result1 = classifyDiagnosticState(models, wrongPattern, 44100);
      const result2 = classifyDiagnosticState(models, wrongEnergy, 44100);

      // Pattern mismatch: Low score due to poor cosine similarity
      // Energy mismatch: Low score due to magnitude penalty on top of some similarity

      // CRITICAL INSIGHT: Magnitude factor makes energy mismatch worse than pattern mismatch
      // Because energy mismatch = (lower cosine similarity) * (magnitude penalty)
      // Pattern mismatch = (lower cosine similarity) * 1.0 (no magnitude penalty)
      expect(result2.healthScore).toBeLessThan(result1.healthScore);

      // Both should have low scores (either < 70 or at least not "healthy")
      expect(result1.healthScore < 75 || result2.healthScore < 75).toBe(true);
    });

    it('should not affect perfect match (same pattern, same energy)', () => {
      const models = [baselineModel];

      // Perfect match: same pattern, same energy
      const perfectMatch: FeatureVector = {
        features: new Float64Array([1.0, 0.5, 0.3]),
        absoluteFeatures: new Float64Array([1.0, 0.5, 0.3]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, perfectMatch, 44100);

      // Should have very high score (magnitude factor = 1.0, no penalty)
      expect(result.healthScore).toBeGreaterThan(85);
      expect(result.status).toBe('healthy');
    });

    it('should reject only completely degenerate models (near-zero weight vectors)', () => {
      // Create a completely degenerate model (pure silence / zero signal)
      // UPDATED: With new threshold (0.0001), only EXTREME cases are rejected
      // Weight vector magnitude must be < 0.0001 to be blocked
      // Using [0.00001, 0.00001, 0.00001] → magnitude ~0.000017 < 0.0001
      const degenerateModel: GMIAModel = {
        machineId: 'test-machine',
        label: 'Degenerate Model (Pure Silence)',
        type: 'healthy',
        weightVector: new Float64Array([0.00001, 0.00001, 0.00001]), // Magnitude: ~0.000017 (< 0.0001 threshold)
        regularization: 1e9,
        scalingConstant: 2.5,
        featureDimension: 3,
        trainingDate: Date.now(),
        trainingDuration: 10,
        sampleRate: 44100,
        metadata: {
          meanCosineSimilarity: 0.5,
          targetScore: 0.5,
        },
      };

      const models = [degenerateModel];

      // Test with any signal
      const testSignal: FeatureVector = {
        features: new Float64Array([0.3, 0.4, 0.3]),
        absoluteFeatures: new Float64Array([0.3, 0.4, 0.3]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, testSignal, 44100);

      // NEW BEHAVIOR: Magnitude factor = 0 because weight magnitude < 0.0001 (extreme degenerate case)
      // This forces health score to 0, preventing false diagnosis from completely broken models
      expect(result.healthScore).toBe(0);
      expect(result.status).toBe('uncertain');
      expect(result.metadata?.detectedState).toBe('UNKNOWN');
    });

    it('should accept models with sufficient energy even if test is quiet', () => {
      // Normal model with good magnitude (> 0.038 threshold)
      const normalModel: GMIAModel = {
        machineId: 'test-machine',
        label: 'Healthy Machine',
        type: 'healthy',
        weightVector: new Float64Array([1.0, 0.5, 0.3]), // Magnitude: ~1.2 (> 0.3 threshold)
        regularization: 1e9,
        scalingConstant: 2.5,
        featureDimension: 3,
        trainingDate: Date.now(),
        trainingDuration: 10,
        sampleRate: 44100,
        metadata: {
          meanCosineSimilarity: 0.95,
          targetScore: 0.9,
        },
      };

      const models = [normalModel];

      // Test with quiet signal (50% energy)
      const quietTest: FeatureVector = {
        features: new Float64Array([0.5, 0.25, 0.15]), // 50% of reference
        absoluteFeatures: new Float64Array([0.5, 0.25, 0.15]),
        bins: 3,
        frequencyRange: [0, 22050],
      };

      const result = classifyDiagnosticState(models, quietTest, 44100);

      // Model passes MIN_REFERENCE_MAGNITUDE check (1.2 > 0.3)
      // Magnitude factor = 0.5 (test is 50% of reference)
      // Score should be reduced but not zero
      expect(result.healthScore).toBeGreaterThan(0);
      expect(result.healthScore).toBeLessThan(75); // Penalty applied
    });
  });
});
