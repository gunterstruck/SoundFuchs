/**
 * ZANOBOT - MATHEMATICAL UTILITIES
 *
 * Core mathematical operations for GMIA algorithm.
 * Implements matrix operations, statistical functions, etc.
 */

/**
 * Matrix multiplication: C = A * B
 *
 * @param A - Matrix A (m x n)
 * @param B - Matrix B (n x p)
 * @returns Result matrix C (m x p)
 */
export function matrixMultiply(A: Float64Array[], B: Float64Array[]): Float64Array[] {
  // Validate input matrices
  if (!A || A.length === 0 || !A[0]) {
    throw new Error('Matrix A is empty or malformed');
  }
  if (!B || B.length === 0 || !B[0]) {
    throw new Error('Matrix B is empty or malformed');
  }

  const m = A.length;
  const n = A[0].length;
  const p = B[0].length;

  if (B.length !== n) {
    throw new Error(`Matrix dimensions mismatch: ${m}x${n} * ${B.length}x${p}`);
  }

  const C: Float64Array[] = [];

  for (let i = 0; i < m; i++) {
    C[i] = new Float64Array(p);
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += A[i][k] * B[k][j];
      }
      // CRITICAL FIX: Validate each cell to prevent NaN propagation
      if (!isFinite(sum)) {
        throw new Error(`Matrix multiplication produced NaN/Infinity at position [${i}][${j}]`);
      }
      C[i][j] = sum;
    }
  }

  return C;
}

/**
 * Matrix transpose: B = A^T
 *
 * @param A - Input matrix (m x n)
 * @returns Transposed matrix (n x m)
 */
export function matrixTranspose(A: Float64Array[]): Float64Array[] {
  // Validate input matrix
  if (!A || A.length === 0 || !A[0]) {
    throw new Error('Matrix A is empty or malformed');
  }

  const m = A.length;
  const n = A[0].length;

  const AT: Float64Array[] = [];

  for (let j = 0; j < n; j++) {
    AT[j] = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      AT[j][i] = A[i][j];
    }
  }

  return AT;
}

/**
 * Matrix inversion using Gauss-Jordan elimination
 *
 * Critical for GMIA: (X^T * X + λI)^(-1)
 *
 * @param A - Square matrix (n x n)
 * @returns Inverted matrix
 */
export function matrixInverse(A: Float64Array[]): Float64Array[] {
  const n = A.length;

  // CRITICAL FIX: Validate input matrix
  if (n === 0) {
    throw new Error('Cannot invert empty matrix');
  }

  // Validate that matrix is square and all rows exist
  for (let i = 0; i < n; i++) {
    if (!A[i] || A[i].length !== n) {
      throw new Error(
        `Matrix must be square. Row ${i} has length ` +
        `${A[i]?.length ?? 'undefined'}, expected ${n}`
      );
    }
  }

  // Create augmented matrix [A | I]
  const augmented: number[][] = [];

  for (let i = 0; i < n; i++) {
    augmented[i] = [];
    for (let j = 0; j < n; j++) {
      augmented[i][j] = A[i][j];
    }
    // Add identity matrix
    for (let j = 0; j < n; j++) {
      augmented[i][n + j] = i === j ? 1 : 0;
    }
  }

  // Gauss-Jordan elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }

    // Swap rows
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    // Check for singular matrix
    // Using 1e-12 threshold as we often work with large regularization (λ = 1e9)
    if (Math.abs(augmented[i][i]) < 1e-12) {
      throw new Error('Matrix is singular and cannot be inverted');
    }

    // Scale pivot row
    const pivot = augmented[i][i];
    for (let j = 0; j < 2 * n; j++) {
      augmented[i][j] /= pivot;
    }

    // Eliminate column
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = augmented[k][i];
        for (let j = 0; j < 2 * n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
  }

  // Extract inverse from augmented matrix
  const inverse: Float64Array[] = [];
  for (let i = 0; i < n; i++) {
    inverse[i] = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      inverse[i][j] = augmented[i][n + j];
    }
  }

  return inverse;
}

/**
 * Add regularization term to matrix: A + λI
 *
 * @param A - Square matrix (n x n)
 * @param lambda - Regularization parameter
 * @returns Regularized matrix
 */
export function addRegularization(A: Float64Array[], lambda: number): Float64Array[] {
  const n = A.length;
  const regularized: Float64Array[] = [];

  for (let i = 0; i < n; i++) {
    regularized[i] = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      regularized[i][j] = A[i][j] + (i === j ? lambda : 0);
    }
  }

  return regularized;
}

/**
 * Create ones vector
 *
 * @param n - Vector length
 * @returns Vector of ones
 */
export function onesVector(n: number): Float64Array {
  const ones = new Float64Array(n);
  ones.fill(1);
  return ones;
}

/**
 * Dot product of two vectors
 *
 * @param a - Vector a
 * @param b - Vector b
 * @returns Dot product
 * @throws Error if vectors contain NaN or have mismatched dimensions
 */
export function dotProduct(a: Float64Array, b: Float64Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }

  // CRITICAL FIX: Validate result to prevent NaN propagation
  // NaN can occur if input vectors contain NaN or Infinity values
  if (!isFinite(sum)) {
    throw new Error('Dot product produced NaN or Infinity - check input vectors for invalid values');
  }

  return sum;
}

/**
 * Vector magnitude (L2 norm)
 *
 * @param v - Input vector
 * @returns Magnitude (always >= 0)
 * @throws Error if vector contains NaN values
 */
export function vectorMagnitude(v: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  const magnitude = Math.sqrt(sum);

  // CRITICAL FIX: Validate result to prevent NaN propagation
  if (!isFinite(magnitude)) {
    throw new Error('Vector magnitude produced NaN/Infinity - check input vector for invalid values');
  }

  return magnitude;
}

/**
 * Cosine similarity between two vectors
 *
 * cos(α) = (a · b) / (||a|| * ||b||)
 *
 * Critical for GMIA scoring!
 *
 * @param a - Vector a
 * @param b - Vector b
 * @returns Cosine similarity [-1, 1]
 */
export function cosineSimilarity(a: Float64Array, b: Float64Array): number {
  const dotProd = dotProduct(a, b);
  const magA = vectorMagnitude(a);
  const magB = vectorMagnitude(b);

  // Use epsilon threshold to prevent numerical instability with very small magnitudes
  const EPSILON = 1e-10;
  if (magA < EPSILON || magB < EPSILON) {
    return 0;
  }

  return dotProd / (magA * magB);
}

/**
 * Calculate mean of array
 *
 * @param values - Input values
 * @returns Mean
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }

  return sum / values.length;
}

/**
 * Calculate variance
 *
 * @param values - Input values
 * @returns Variance
 */
export function variance(values: number[]): number {
  if (values.length === 0) return 0;

  const m = mean(values);
  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - m;
    sum += diff * diff;
  }

  return sum / values.length;
}

/**
 * Calculate standard deviation
 *
 * @param values - Input values
 * @returns Standard deviation
 */
export function stdDev(values: number[]): number {
  return Math.sqrt(variance(values));
}

/**
 * Matrix-vector multiplication: y = A * x
 *
 * @param A - Matrix (m x n)
 * @param x - Vector (n)
 * @returns Result vector (m)
 */
export function matrixVectorMultiply(A: Float64Array[], x: Float64Array): Float64Array {
  // Validate inputs
  if (!A || A.length === 0 || !A[0]) {
    throw new Error('Matrix A is empty or malformed');
  }
  if (!x || x.length === 0) {
    throw new Error('Vector x is empty');
  }

  const m = A.length;
  const n = A[0].length;

  if (x.length !== n) {
    throw new Error(`Dimension mismatch: ${m}x${n} * ${x.length}`);
  }

  const y = new Float64Array(m);

  for (let i = 0; i < m; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += A[i][j] * x[j];
    }
    // CRITICAL FIX: Validate each element to prevent NaN propagation
    if (!isFinite(sum)) {
      throw new Error(`Matrix-vector multiplication produced NaN/Infinity at position [${i}]`);
    }
    y[i] = sum;
  }

  return y;
}

/**
 * Convert feature vectors to matrix (features as columns)
 *
 * @param features - Array of feature vectors
 * @returns Matrix where each column is a feature vector
 */
export function featuresToMatrix(features: Float64Array[]): Float64Array[] {
  if (!features || features.length === 0) {
    throw new Error('Cannot create matrix from empty feature array');
  }

  if (!features[0] || features[0].length === 0) {
    throw new Error('Feature vectors are empty or malformed');
  }

  const numFeatures = features[0].length;
  const numSamples = features.length;

  // CRITICAL FIX: Validate all features have the same length
  // This prevents undefined/NaN values in the resulting matrix
  const expectedLength = features[0].length;
  for (let j = 0; j < numSamples; j++) {
    if (!features[j]) {
      throw new Error(`Feature vector at index ${j} is undefined/null`);
    }
    if (features[j].length !== expectedLength) {
      throw new Error(
        `Feature vector length mismatch at index ${j}: ` +
        `expected ${expectedLength}, got ${features[j].length}`
      );
    }
  }

  const matrix: Float64Array[] = [];

  // Matrix rows = feature dimensions, columns = samples
  for (let i = 0; i < numFeatures; i++) {
    matrix[i] = new Float64Array(numSamples);
    for (let j = 0; j < numSamples; j++) {
      matrix[i][j] = features[j][i];
    }
  }

  return matrix;
}
