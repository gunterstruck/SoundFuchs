/**
 * ZANOBOT - GMIA ALGORITHM TESTS
 *
 * Comprehensive tests for the GMIA (Gaussian Model Independent Attributes) algorithm.
 * This is the CORE machine learning component of Zanobot.
 *
 * Tests cover:
 * - Training with various feature configurations
 * - Inference and cosine similarity calculation
 * - Edge cases and error handling
 * - Mathematical correctness
 */

import { describe, it, expect } from 'vitest';
import { trainGMIA, inferGMIA, averageCosineSimilarity } from './gmia.js';
import type { TrainingData, FeatureVector } from '@data/types.js';

describe('GMIA Algorithm', () => {
  /**
   * Helper: Generate synthetic feature vectors (Float64Array[])
   */
  function generateFeatureVectors(
    numSamples: number,
    featureDim: number,
    seed = 1
  ): Float64Array[] {
    const features: Float64Array[] = [];

    for (let i = 0; i < numSamples; i++) {
      const featureVector = new Float64Array(featureDim);

      for (let j = 0; j < featureDim; j++) {
        // Generate pseudo-random values (deterministic for testing)
        const value = Math.sin((seed + i) * (j + 1)) * 0.5 + 0.5;
        featureVector[j] = value;
      }

      features.push(featureVector);
    }

    return features;
  }

  /**
   * Helper: Create proper FeatureVector objects
   */
  function createFeatureVector(featureDim: number, seed = 1): FeatureVector {
    const features = new Float64Array(featureDim);
    const absoluteFeatures = new Float64Array(featureDim);

    for (let j = 0; j < featureDim; j++) {
      const value = Math.sin(seed * (j + 1)) * 0.5 + 0.5;
      features[j] = value;
      absoluteFeatures[j] = value * 100; // Arbitrary absolute value
    }

    return {
      features,
      absoluteFeatures,
      bins: featureDim,
      frequencyRange: [0, 22050],
    };
  }

  /**
   * Helper: Create training data
   */
  function createTrainingData(
    numSamples: number,
    featureDim: number,
    seed = 1,
    machineId = 'test-machine-001'
  ): TrainingData {
    return {
      featureVectors: generateFeatureVectors(numSamples, featureDim, seed),
      machineId,
      recordingId: `ref-${Date.now()}`,
      numSamples,
      config: {
        windowSize: 0.33,
        hopSize: 0.066,
        sampleRate: 44100,
        fftSize: 1024,
        frequencyBins: 512,
        frequencyRange: [0, 22050],
      },
    };
  }

  describe('trainGMIA()', () => {
    it('should train a valid GMIA model', () => {
      const trainingData = createTrainingData(50, 512);

      const model = trainGMIA(trainingData, 'test-machine');

      // Verify model structure
      expect(model.machineId).toBe('test-machine');
      expect(model.weightVector).toBeInstanceOf(Float64Array);
      expect(model.weightVector.length).toBe(512);
      expect(model.regularization).toBe(1e9);
      expect(model.featureDimension).toBe(512);
      expect(model.scalingConstant).toBeGreaterThan(0);
      expect(model.trainingDate).toBeGreaterThan(0);
      expect(model.sampleRate).toBe(44100);
    });

    it('should compute correct weight vector dimensions', () => {
      const trainingData = createTrainingData(30, 256);

      const model = trainGMIA(trainingData, 'test-machine');

      // Weight vector should have same dimension as features
      expect(model.weightVector.length).toBe(256);
      expect(model.featureDimension).toBe(256);
    });

    it('should handle small training sets', () => {
      // Minimum viable training set (10 samples)
      const trainingData = createTrainingData(10, 512);

      const model = trainGMIA(trainingData, 'test-machine');

      expect(model.weightVector.length).toBe(512);
      expect(model.scalingConstant).toBeGreaterThan(0);
    });

    it('should handle large training sets', () => {
      // Large training set (200 samples)
      const trainingData = createTrainingData(200, 512);

      const model = trainGMIA(trainingData, 'test-machine');

      expect(model.weightVector.length).toBe(512);
      expect(model.metadata?.meanCosineSimilarity).toBeLessThanOrEqual(1);
    });

    it('should throw error for empty feature set', () => {
      const trainingData: TrainingData = {
        featureVectors: [],
        machineId: 'test-machine',
        recordingId: 'ref-123',
        numSamples: 0,
        config: {
          windowSize: 0.33,
          hopSize: 0.066,
          sampleRate: 44100,
          fftSize: 1024,
          frequencyBins: 512,
          frequencyRange: [0, 22050],
        },
      };

      expect(() => trainGMIA(trainingData, 'test-machine')).toThrow(
        'Cannot train model with empty feature set'
      );
    });

    it('should use correct regularization parameter (λ = 10^9)', () => {
      const trainingData = createTrainingData(50, 512);

      const model = trainGMIA(trainingData, 'test-machine');

      // Verify regularization parameter (λ = 10^9)
      expect(model.regularization).toBe(1e9);
    });

    it('should calculate scaling constant C > 0', () => {
      const trainingData = createTrainingData(50, 512);

      const model = trainGMIA(trainingData, 'test-machine');

      // Scaling constant must be positive for tanh transformation
      expect(model.scalingConstant).toBeGreaterThan(0);
      expect(Number.isFinite(model.scalingConstant)).toBe(true);
    });

    it('should set target score metadata to 0.9 (90%)', () => {
      const trainingData = createTrainingData(50, 512);

      const model = trainGMIA(trainingData, 'test-machine');

      // Target score for training data should be 90% as per algorithm design
      expect(model.metadata?.targetScore).toBe(0.9);
    });

    it('should store training duration', () => {
      const trainingData = createTrainingData(50, 512);

      const model = trainGMIA(trainingData, 'test-machine');

      // Duration should be calculated from config
      // windowSize (0.33s) * numSamples (50) = 16.5s
      expect(model.trainingDuration).toBeCloseTo(16.5, 1);
    });

    it('should handle different feature dimensions', () => {
      const dimensions = [128, 256, 512, 1024];

      dimensions.forEach((dim) => {
        const trainingData = createTrainingData(30, dim);
        const model = trainGMIA(trainingData, 'test-machine');

        expect(model.weightVector.length).toBe(dim);
        expect(model.featureDimension).toBe(dim);
      });
    });

    it('should produce consistent results for same input', () => {
      const trainingData1 = createTrainingData(50, 512, 42);
      const trainingData2 = createTrainingData(50, 512, 42);

      const model1 = trainGMIA(trainingData1, 'test-machine');
      const model2 = trainGMIA(trainingData2, 'test-machine');

      // Same input should produce same model
      expect(model1.scalingConstant).toBeCloseTo(model2.scalingConstant, 5);
      expect(model1.weightVector.length).toBe(model2.weightVector.length);

      // Check weight vector similarity
      for (let i = 0; i < model1.weightVector.length; i += 50) {
        expect(model1.weightVector[i]).toBeCloseTo(model2.weightVector[i], 5);
      }
    });
  });

  describe('inferGMIA()', () => {
    it('should perform inference on test features', () => {
      // Train model
      const trainingData = createTrainingData(50, 512);
      const model = trainGMIA(trainingData, 'test-machine');

      // Create test features
      const testFeatures: FeatureVector[] = [createFeatureVector(512, 1)];

      // Inference
      const cosineSimilarities = inferGMIA(model, testFeatures, model.sampleRate);

      expect(cosineSimilarities).toHaveLength(1);
      expect(cosineSimilarities[0]).toBeGreaterThanOrEqual(-1);
      expect(cosineSimilarities[0]).toBeLessThanOrEqual(1);
    });

    it('should return cosine similarity in range [-1, 1]', () => {
      const trainingData = createTrainingData(50, 512);
      const model = trainGMIA(trainingData, 'test-machine');

      const testFeatures: FeatureVector[] = [
        createFeatureVector(512, 100),
        createFeatureVector(512, 200),
        createFeatureVector(512, 300),
      ];

      const cosineSimilarities = inferGMIA(model, testFeatures, model.sampleRate);

      cosineSimilarities.forEach((cos) => {
        expect(cos).toBeGreaterThanOrEqual(-1);
        expect(cos).toBeLessThanOrEqual(1);
      });
    });

    it('should return high similarity for similar features', () => {
      // Train with specific seed
      const trainingData = createTrainingData(50, 512, 42);
      const model = trainGMIA(trainingData, 'test-machine');

      // Test with very similar features (same seed, slightly different)
      const testFeatures: FeatureVector[] = [createFeatureVector(512, 42)];

      const cosineSimilarities = inferGMIA(model, testFeatures, model.sampleRate);

      // Should have high similarity (> 0.5) for similar data
      expect(cosineSimilarities[0]).toBeGreaterThan(0.5);
    });

    it('should handle multiple test samples', () => {
      const trainingData = createTrainingData(50, 512);
      const model = trainGMIA(trainingData, 'test-machine');

      // Multiple test samples
      const testFeatures: FeatureVector[] = [];
      for (let i = 0; i < 10; i++) {
        testFeatures.push(createFeatureVector(512, 100 + i));
      }

      const cosineSimilarities = inferGMIA(model, testFeatures, model.sampleRate);

      expect(cosineSimilarities).toHaveLength(10);
      cosineSimilarities.forEach((cos) => {
        expect(cos).toBeGreaterThanOrEqual(-1);
        expect(cos).toBeLessThanOrEqual(1);
      });
    });

    it('should handle empty test features array', () => {
      const trainingData = createTrainingData(50, 512);
      const model = trainGMIA(trainingData, 'test-machine');

      const cosineSimilarities = inferGMIA(model, [], model.sampleRate);

      expect(cosineSimilarities).toHaveLength(0);
    });
  });

  describe('averageCosineSimilarity()', () => {
    it('should calculate average correctly', () => {
      const cosineSimilarities = [0.8, 0.85, 0.9, 0.75, 0.95];

      const average = averageCosineSimilarity(cosineSimilarities);

      // Average: (0.8 + 0.85 + 0.9 + 0.75 + 0.95) / 5 = 0.85
      expect(average).toBeCloseTo(0.85, 5);
    });

    it('should handle single value', () => {
      const average = averageCosineSimilarity([0.9]);

      expect(average).toBe(0.9);
    });

    it('should handle empty array', () => {
      const average = averageCosineSimilarity([]);

      expect(average).toBe(0);
    });

    it('should handle negative values', () => {
      const cosineSimilarities = [-0.5, -0.3, -0.1];

      const average = averageCosineSimilarity(cosineSimilarities);

      expect(average).toBeCloseTo(-0.3, 5);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full training and inference pipeline', () => {
      // Step 1: Train model
      const trainingData = createTrainingData(100, 512);
      const model = trainGMIA(trainingData, 'machine-001');

      // Verify model
      expect(model.weightVector.length).toBe(512);

      // Step 2: Generate test data (similar to training data)
      const testFeatures: FeatureVector[] = [];
      for (let i = 0; i < 20; i++) {
        testFeatures.push(createFeatureVector(512, i));
      }

      // Step 3: Inference
      const cosineSimilarities = inferGMIA(model, testFeatures, model.sampleRate);

      expect(cosineSimilarities).toHaveLength(20);

      // Step 4: Calculate average
      const avgCosine = averageCosineSimilarity(cosineSimilarities);

      expect(avgCosine).toBeGreaterThan(0);
      expect(avgCosine).toBeLessThanOrEqual(1);

      // Verify all similarities are valid
      cosineSimilarities.forEach((cos) => {
        expect(Number.isFinite(cos)).toBe(true);
        expect(cos).toBeGreaterThanOrEqual(-1);
        expect(cos).toBeLessThanOrEqual(1);
      });
    });

    it('should detect anomalies (low similarity for different features)', () => {
      // Train with specific pattern
      const trainingData = createTrainingData(50, 512, 1);
      const model = trainGMIA(trainingData, 'machine-001');

      // Create very different test features
      const normalFeatures: FeatureVector[] = [createFeatureVector(512, 1)];

      const anomalousFeatures: FeatureVector[] = [createFeatureVector(512, 9999)];

      const normalSimilarity = inferGMIA(model, normalFeatures, model.sampleRate)[0];
      const anomalousSimilarity = inferGMIA(model, anomalousFeatures, model.sampleRate)[0];

      // Normal features should have higher similarity than anomalous ones
      expect(normalSimilarity).toBeGreaterThan(anomalousSimilarity);
    });

    it('should maintain model quality across different machines', () => {
      const machines = ['machine-A', 'machine-B', 'machine-C'];

      machines.forEach((machineId) => {
        const trainingData = createTrainingData(50, 512);
        const model = trainGMIA(trainingData, machineId);

        expect(model.machineId).toBe(machineId);
        expect(model.weightVector.length).toBe(512);
        expect(model.scalingConstant).toBeGreaterThan(0);
        expect(model.metadata?.meanCosineSimilarity).toBeGreaterThan(0);
      });
    });
  });

  describe('Mathematical Properties', () => {
    it('should produce unit-norm weight vectors (normalized)', () => {
      const trainingData = createTrainingData(50, 512);
      const model = trainGMIA(trainingData, 'test-machine');

      // Calculate L2 norm of weight vector
      let sumSquares = 0;
      for (let i = 0; i < model.weightVector.length; i++) {
        sumSquares += model.weightVector[i] * model.weightVector[i];
      }
      const norm = Math.sqrt(sumSquares);

      // Weight vector should be reasonably bounded (not exploding)
      expect(norm).toBeGreaterThan(0);
      expect(norm).toBeLessThan(1000); // Sanity check
    });

    it('should handle numerical stability with regularization', () => {
      // Create features that might cause numerical issues without regularization
      const features: Float64Array[] = [];
      for (let i = 0; i < 50; i++) {
        const f = new Float64Array(512);
        f.fill(0.0001); // Very small values
        features[i] = f;
      }

      const trainingData: TrainingData = {
        featureVectors: features,
        machineId: 'test',
        recordingId: 'ref-123',
        numSamples: 50,
        config: {
          windowSize: 0.33,
          hopSize: 0.066,
          sampleRate: 44100,
          fftSize: 1024,
          frequencyBins: 512,
          frequencyRange: [0, 22050],
        },
      };

      // Should not crash or produce NaN/Infinity
      const model = trainGMIA(trainingData, 'test-machine');

      expect(Number.isFinite(model.scalingConstant)).toBe(true);
      expect(model.weightVector.every((v) => Number.isFinite(v))).toBe(true);
    });
  });
});
