/**
 * ZANOBOT - MATH UTILS TESTS
 *
 * Tests for mathematical utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  matrixMultiply,
  matrixTranspose,
  matrixInverse,
  addRegularization,
  dotProduct,
  vectorMagnitude,
  cosineSimilarity,
  mean,
  variance,
  stdDev,
  matrixVectorMultiply,
  onesVector,
  featuresToMatrix,
} from './mathUtils.js';

describe('Mathematical Utilities', () => {
  describe('Matrix Operations', () => {
    it('should multiply matrices correctly', () => {
      const A = [new Float64Array([1, 2]), new Float64Array([3, 4])];
      const B = [new Float64Array([5, 6]), new Float64Array([7, 8])];

      const C = matrixMultiply(A, B);

      // Result: [[19, 22], [43, 50]]
      expect(C[0][0]).toBe(19);
      expect(C[0][1]).toBe(22);
      expect(C[1][0]).toBe(43);
      expect(C[1][1]).toBe(50);
    });

    it('should transpose matrices correctly', () => {
      const A = [new Float64Array([1, 2, 3]), new Float64Array([4, 5, 6])];

      const AT = matrixTranspose(A);

      expect(AT.length).toBe(3); // 3 rows
      expect(AT[0].length).toBe(2); // 2 columns
      expect(AT[0][0]).toBe(1);
      expect(AT[1][1]).toBe(5);
      expect(AT[2][1]).toBe(6);
    });

    it('should invert 2x2 matrix correctly', () => {
      const A = [new Float64Array([4, 7]), new Float64Array([2, 6])];

      const invA = matrixInverse(A);

      // Multiply A * invA should give identity
      const identity = matrixMultiply(A, invA);

      expect(identity[0][0]).toBeCloseTo(1, 5);
      expect(identity[0][1]).toBeCloseTo(0, 5);
      expect(identity[1][0]).toBeCloseTo(0, 5);
      expect(identity[1][1]).toBeCloseTo(1, 5);
    });

    it('should add regularization correctly', () => {
      const A = [new Float64Array([1, 2]), new Float64Array([3, 4])];

      const lambda = 10;
      const regularized = addRegularization(A, lambda);

      expect(regularized[0][0]).toBe(11); // 1 + 10
      expect(regularized[0][1]).toBe(2);
      expect(regularized[1][0]).toBe(3);
      expect(regularized[1][1]).toBe(14); // 4 + 10
    });

    it('should multiply matrix by vector', () => {
      const A = [new Float64Array([1, 2]), new Float64Array([3, 4])];
      const x = new Float64Array([5, 6]);

      const y = matrixVectorMultiply(A, x);

      // [1*5 + 2*6, 3*5 + 4*6] = [17, 39]
      expect(y[0]).toBe(17);
      expect(y[1]).toBe(39);
    });
  });

  describe('Vector Operations', () => {
    it('should calculate dot product correctly', () => {
      const a = new Float64Array([1, 2, 3]);
      const b = new Float64Array([4, 5, 6]);

      const result = dotProduct(a, b);

      // 1*4 + 2*5 + 3*6 = 32
      expect(result).toBe(32);
    });

    it('should calculate vector magnitude correctly', () => {
      const v = new Float64Array([3, 4]); // 3-4-5 triangle

      const magnitude = vectorMagnitude(v);

      expect(magnitude).toBeCloseTo(5, 5);
    });

    it('should calculate cosine similarity correctly', () => {
      const a = new Float64Array([1, 0, 0]);
      const b = new Float64Array([1, 0, 0]); // Same direction

      const similarity = cosineSimilarity(a, b);

      expect(similarity).toBeCloseTo(1, 5); // cos(0°) = 1
    });

    it('should calculate cosine similarity for orthogonal vectors', () => {
      const a = new Float64Array([1, 0]);
      const b = new Float64Array([0, 1]); // Perpendicular

      const similarity = cosineSimilarity(a, b);

      expect(similarity).toBeCloseTo(0, 5); // cos(90°) = 0
    });

    it('should create ones vector', () => {
      const ones = onesVector(5);

      expect(ones.length).toBe(5);
      for (let i = 0; i < 5; i++) {
        expect(ones[i]).toBe(1);
      }
    });
  });

  describe('Statistical Functions', () => {
    it('should calculate mean correctly', () => {
      const values = [1, 2, 3, 4, 5];
      const avg = mean(values);

      expect(avg).toBe(3);
    });

    it('should calculate variance correctly', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const v = variance(values);

      expect(v).toBeCloseTo(4, 1);
    });

    it('should calculate standard deviation correctly', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const sd = stdDev(values);

      expect(sd).toBeCloseTo(2, 1);
    });

    it('should handle empty arrays gracefully', () => {
      expect(mean([])).toBe(0);
      expect(variance([])).toBe(0);
      expect(stdDev([])).toBe(0);
    });
  });

  describe('Feature Conversion', () => {
    it('should convert feature vectors to matrix', () => {
      const features = [
        new Float64Array([1, 2, 3]),
        new Float64Array([4, 5, 6]),
        new Float64Array([7, 8, 9]),
      ];

      const matrix = featuresToMatrix(features);

      // Matrix should be 3x3 (features as rows, samples as columns)
      expect(matrix.length).toBe(3);
      expect(matrix[0].length).toBe(3);

      // Check values
      expect(matrix[0][0]).toBe(1); // Feature 0, Sample 0
      expect(matrix[1][1]).toBe(5); // Feature 1, Sample 1
      expect(matrix[2][2]).toBe(9); // Feature 2, Sample 2
    });

    it('should throw error for empty feature array', () => {
      expect(() => featuresToMatrix([])).toThrow('Cannot create matrix from empty feature array');
    });
  });
});
