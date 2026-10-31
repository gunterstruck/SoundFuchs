/**
 * ZANOBOT - GMIA (Generalized Mutual Interdependence Analysis)
 *
 * The CORE machine learning algorithm for acoustic diagnostics.
 *
 * GMIA Equation 2
 * Formula: w_p(λ) = X_p * (X_p^T * X_p + λI)^(-1) * 1
 *
 * Where:
 * - X_p: Feature matrix (512 x N) - features as rows, samples as columns
 * - λ: Regularization parameter, default 10^9 (from Report p.25) — see LAMBDA
 * - 1: Ones vector
 * - w_p: Weight vector (learned model)
 */

import {
  matrixMultiply,
  matrixTranspose,
  matrixInverse,
  addRegularization,
  onesVector,
  matrixVectorMultiply,
  cosineSimilarity,
  mean,
  featuresToMatrix,
  vectorMagnitude,
} from './mathUtils.js';

import type { GMIAModel, FeatureVector, TrainingData } from '@data/types.js';
import { logger } from '@utils/logger.js';

/**
 * Regularisierung λ für GMIA — Standard der App: 10^9 (Report S. 25).
 *
 * λ ist SKALENABHÄNGIG: Es wirkt nur relativ zur Größenordnung von XᵀX. Die
 * Merkmale sind je Frame auf Summe 1 normiert, die Einträge von XᵀX liegen
 * daher weit unter 1. Gegen sie ist 10^9 riesig: (XᵀX + λI)⁻¹ ≈ I/λ, und der
 * Gewichtsvektor w = X(XᵀX + λI)⁻¹·1 ist praktisch das (skalierte) mittlere
 * Spektrum. GMIA arbeitet mit diesem Standard also als Mittelwert-Vergleich.
 * Kleinere λ gehen Richtung MIA (gemeinsame, frameübergreifend gleich starke
 * Anteile). Ob das besser erkennt, misst das Mess-Labor (relatives λ, siehe
 * relativeLambda); der Standard der App bleibt 10^9.
 */
export const LAMBDA = 1e9;

/** Optionale Trainingsparameter — ohne Angabe exakt das bisherige Verhalten. */
export interface GmiaTrainOptions {
  /** Absolutes λ. Vorrang vor relativeAlpha. Standard: LAMBDA (10^9). */
  lambda?: number;
  /** Relatives λ: λ = α · Spur(XᵀX) / N (siehe relativeLambda). */
  relativeAlpha?: number;
  /**
   * Konditionszahl von XᵀX + λI mitschreiben (metadata.conditionNumber).
   * Nur fürs Labor; kostet zusätzliche Rechenzeit, ändert das Modell nicht.
   */
  computeCondition?: boolean;
}

/**
 * Relatives λ: α · Spur(XᵀX) / N = α · mittlere quadrierte Frame-Norm.
 * Damit hat α unabhängig von der Merkmals-Skalierung dieselbe Bedeutung:
 * α = 1 entspricht der typischen Diagonale von XᵀX.
 */
export function relativeLambda(features: Float64Array[], alpha: number): number {
  if (features.length === 0) throw new Error('relativeLambda: keine Merkmale');
  let trace = 0;
  for (const f of features) {
    for (let i = 0; i < f.length; i++) trace += f[i] * f[i];
  }
  return (alpha * trace) / features.length;
}

/** Größter Eigenwert einer symmetrischen, positiv semidefiniten Matrix (Potenzmethode). */
function largestEigenvalue(A: Float64Array[], maxIter = 500, tol = 1e-12): number {
  const n = A.length;
  // Deterministischer, „unregelmäßiger“ Startvektor: ein konstanter Vektor
  // wäre zum Eigenvektor des kleinsten Eigenwerts oft fast orthogonal.
  let v: Float64Array = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = 1 + Math.sin(12.9898 * (i + 1)) * 0.5;
  const v0 = vectorMagnitude(v);
  for (let i = 0; i < n; i++) v[i] /= v0;
  let lambda = 0;
  for (let it = 0; it < maxIter; it++) {
    const w = matrixVectorMultiply(A, v);
    const norm = vectorMagnitude(w);
    if (!(norm > 0) || !Number.isFinite(norm)) return norm;
    for (let i = 0; i < n; i++) w[i] /= norm;
    v = w;
    if (Math.abs(norm - lambda) <= tol * norm) return norm;
    lambda = norm;
  }
  return lambda;
}

/**
 * Konditionszahl κ = λmax(R) · λmax(R⁻¹) einer symmetrisch positiv definiten
 * Matrix R und ihrer (bereits berechneten) Inversen. Schätzung über die
 * Potenzmethode — genau genug, um κ > 10^10 sicher zu erkennen.
 */
export function conditionNumberSpd(R: Float64Array[], Rinv: Float64Array[]): number {
  return largestEigenvalue(R) * largestEigenvalue(Rinv);
}

/**
 * Train GMIA model from reference audio
 *
 * This creates the "fingerprint" of a healthy machine.
 *
 * @param trainingData - Feature vectors from reference recording
 * @param machineId - Machine identifier
 * @returns Trained GMIA model
 */
export function trainGMIA(
  trainingData: TrainingData,
  machineId: string,
  options: GmiaTrainOptions = {}
): GMIAModel {
  logger.info(`🧠 Training GMIA model for machine ${machineId}...`);

  const features = trainingData.featureVectors;

  if (features.length === 0) {
    throw new Error('Cannot train model with empty feature set');
  }

  if (!features[0] || features[0].length === 0) {
    throw new Error('Invalid feature vector: first feature is empty or undefined');
  }

  const numSamples = features.length;
  const featureDim = features[0].length;

  logger.debug(`   Features: ${featureDim} dimensions, ${numSamples} samples`);

  // Step 1: Convert features to matrix X_p (features as rows, samples as columns)
  const X_p = featuresToMatrix(features);

  // Validate matrix dimensions
  if (X_p.length === 0 || !X_p[0]) {
    throw new Error('Matrix X_p is empty or malformed after feature conversion');
  }

  logger.debug(`   Matrix X_p: ${X_p.length}x${X_p[0].length}`);

  // Step 2: Compute X_p^T (transpose)
  const X_p_T = matrixTranspose(X_p);

  // Step 3: Compute X_p^T * X_p (gram matrix)
  const gramMatrix = matrixMultiply(X_p_T, X_p);

  // Validate gram matrix
  if (gramMatrix.length === 0 || !gramMatrix[0]) {
    throw new Error('Gram matrix is empty or malformed');
  }

  logger.debug(`   Gram matrix: ${gramMatrix.length}x${gramMatrix[0].length}`);

  // Step 4: Add regularization: X_p^T * X_p + λI (Standard: LAMBDA = 10^9)
  const lambda =
    options.lambda ??
    (options.relativeAlpha !== undefined
      ? relativeLambda(features, options.relativeAlpha)
      : LAMBDA);
  const regularized = addRegularization(gramMatrix, lambda);

  logger.debug(`   Regularization: λ = ${lambda}`);

  // Step 5: Invert: (X_p^T * X_p + λI)^(-1)
  const inverted = matrixInverse(regularized);
  const conditionNumber = options.computeCondition
    ? conditionNumberSpd(regularized, inverted)
    : undefined;

  // Step 6: Create ones vector
  const ones = onesVector(numSamples);

  // Step 7: Multiply inverted matrix with ones vector
  const temp = matrixVectorMultiply(inverted, ones);

  // Step 8: Multiply X_p with temp to get weight vector
  const weightVector = matrixVectorMultiply(X_p, temp);

  logger.debug(`   Weight vector: ${weightVector.length} dimensions`);

  // Step 9: Calculate scaling constant C for tanh
  const scalingConstant = calculateScalingConstant(features, weightVector);

  logger.debug(`   Scaling constant C: ${scalingConstant.toFixed(6)}`);

  // Step 10: Calculate mean cosine similarity for metadata
  const cosineSimilarities = features.map((f) => cosineSimilarity(weightVector, f));
  const meanCosine = mean(cosineSimilarities);

  // Step 11: Calculate weight vector magnitude (L2 norm) for quality validation
  const weightMagnitude = vectorMagnitude(weightVector);

  // DEBUG LOGGING: Show weight magnitude details
  logger.debug('🧠 GMIA Training Debug:', {
    numSamples,
    featureDim,
    meanCosine: meanCosine.toFixed(4),
    scalingConstant: scalingConstant.toFixed(6),
    weightMagnitude: weightMagnitude.toExponential(2),
    minThreshold: 1e-10,
    isAboveThreshold: weightMagnitude >= 1e-10,
  });

  logger.debug(`   Mean cosine similarity: ${meanCosine.toFixed(4)}`);
  logger.debug(`   Weight vector magnitude: ${weightMagnitude.toExponential(2)} (threshold: 1e-10, status: ${weightMagnitude >= 1e-10 ? 'PASS ✓' : 'FAIL ✗'})`);

  // CRITICAL: Validate weight vector is not degenerate (all zeros)
  if (weightMagnitude < 1e-10) {
    throw new Error(`GMIA Training failed: Weight vector is degenerate (magnitude = ${weightMagnitude.toExponential(2)}). This indicates the input features are all zero or nearly constant. Please ensure the audio signal has sufficient variation.`);
  }

  logger.info(`✅ GMIA model trained successfully!`);

  // Calculate total training duration based on window size per sample.
  // This reflects the cumulative analysis time of all processed windows.
  // Example: 50 samples * 0.330s window = 16.5s
  const actualDuration = trainingData.config.windowSize * numSamples;

  return {
    machineId,
    label: '', // Will be set by caller (Phase 2: "Baseline" for first, user-provided for others)
    type: 'healthy', // Default type, will be set by caller based on user selection
    weightVector,
    regularization: lambda,
    scalingConstant,
    featureDimension: featureDim,
    trainingDate: Date.now(),
    trainingDuration: actualDuration,
    sampleRate: trainingData.config.sampleRate,
    metadata: {
      meanCosineSimilarity: meanCosine,
      targetScore: 0.9, // Target 90% health score for reference data
      weightMagnitude, // Store magnitude for later validation
      ...(conditionNumber !== undefined ? { conditionNumber } : {}),
    },
  };
}

/**
 * Calculate scaling constant C for tanh transformation
 *
 * Goal: Average health score of training data should be ~90%
 *
 * Steps:
 * 1. Calculate mean cosine similarity μ of training data
 * 2. Solve for t using: t = (√(0.9) + 1) / (√(0.9) - 1)
 * 3. Calculate C = ln(t) / (2 * μ)
 *
 * @param features - Training feature vectors
 * @param weightVector - Trained weight vector
 * @returns Scaling constant C
 */
function calculateScalingConstant(features: Float64Array[], weightVector: Float64Array): number {
  // Calculate mean cosine similarity (μ)
  const cosineSimilarities = features.map((f) => cosineSimilarity(weightVector, f));
  const mu = mean(cosineSimilarities);

  // Sanity check: Signal quality must be sufficient for training
  // CRITICAL FIX: Increased threshold from 1e-9 to 1e-6 for numerical stability
  // 1e-9 is too close to floating-point precision limits and can cause NaN in atanh()
  if (Math.abs(mu) < 1e-6 || !isFinite(mu)) {
    throw new Error(
      'Signal zu schwach oder inkonsistent für Training. ' +
      'Bitte sicherstellen: Mikrofon nah an Maschine, ' +
      'Maschine läuft, kein reines Hintergrundrauschen. ' +
      `(Durchschnittliche Cosinus-Ähnlichkeit: ${mu.toExponential(2)})`
    );
  }

  // Target score (0.9 = 90%)
  const targetScore = 0.9;

  // Solve for t using quadratic equation from Appendix B
  // Score = (tanh(C * μ))^2 = targetScore
  // tanh(C * μ) = √targetScore
  // Inverse: C * μ = atanh(√targetScore)
  // C = atanh(√targetScore) / μ

  const sqrtTarget = Math.sqrt(targetScore);
  const atanhValue = Math.atanh(sqrtTarget);
  const C = atanhValue / mu;

  return C;
}

/**
 * Validate sample rate compatibility between model and test data
 *
 * CRITICAL: FFT-based features are physically bound to sample rate.
 * A model trained at 48kHz cannot perform inference at 44.1kHz due to
 * frequency bin mismatch. This would cause incorrect feature alignment.
 *
 * Energy Spectral Densities (ESD) are calculated from FFT, which maps bins
 * to physical frequencies based on sample rate: f = (bin * sampleRate) / fftSize
 *
 * @param modelSampleRate - Sample rate used during model training
 * @param testSampleRate - Sample rate of current test data
 * @throws Error if sample rates don't match
 */
function validateSampleRateIntegrity(modelSampleRate: number, testSampleRate: number): void {
  if (modelSampleRate !== testSampleRate) {
    throw new Error(
      `CRITICAL: Sample Rate Mismatch. ` +
        `Model trained at ${modelSampleRate}Hz, but inference attempted at ${testSampleRate}Hz. ` +
        `FFT frequency bins are incompatible. Please use the same audio hardware/settings ` +
        `as during training, or retrain the model with the current sample rate.`
    );
  }
}

/**
 * Perform inference on new audio data
 *
 * Compare test features against trained model.
 *
 * CRITICAL: Validates sample rate integrity before inference.
 * This prevents frequency bin mismatches that would cause incorrect results.
 *
 * @param model - Trained GMIA model
 * @param testFeatures - Features from test recording
 * @param testSampleRate - Sample rate of the test recording (required for validation)
 * @returns Array of cosine similarities (one per chunk)
 * @throws Error if sample rates don't match
 */
export function inferGMIA(
  model: GMIAModel,
  testFeatures: FeatureVector[],
  testSampleRate: number
): number[] {
  // CRITICAL FIX: Comprehensive sample rate validation
  // Check type, finite value, and positive range to prevent mathematical errors
  if (typeof testSampleRate !== 'number' || !isFinite(testSampleRate) || testSampleRate <= 0) {
    throw new Error(
      `Invalid test sample rate: ${testSampleRate}. Must be a positive finite number (e.g., 48000).`
    );
  }

  validateSampleRateIntegrity(model.sampleRate, testSampleRate);

  const cosineSimilarities = testFeatures.map((featureVector) =>
    cosineSimilarity(model.weightVector, featureVector.features)
  );

  return cosineSimilarities;
}

/**
 * Calculate average cosine similarity from inference results
 *
 * @param cosineSimilarities - Array of cosine values
 * @returns Average cosine similarity
 */
export function averageCosineSimilarity(cosineSimilarities: number[]): number {
  return mean(cosineSimilarities);
}
