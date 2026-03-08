/**
 * ZANOBOT - TYPE DEFINITIONS
 *
 * Core TypeScript interfaces for the entire application.
 * Based on GMIA specifications.
 */

/**
 * Machine Identification
 */
export interface Machine {
  id: string; // Unique identifier (from barcode/QR or user-generated)
  name: string; // Human-readable name
  createdAt: number; // Timestamp
  lastDiagnosisAt?: number; // Last diagnosis timestamp
  referenceModels: GMIAModel[]; // Trained reference models (multiclass diagnosis)
  referenceImage?: Blob; // Optional reference image for visual positioning (Ghost Image Overlay)

  // Internal/Runtime Fields (derived from NFC deep link, not user-editable)
  // Note: referenceDbUrl is now derived at runtime from customerId via HashRouter.buildDbUrlFromCustomerId()
  // These fields are kept for backward compatibility but are no longer exposed in UI
  /** @internal Derived from NFC customerId parameter - not user-editable */
  referenceDbUrl?: string;
  /** @internal */
  location?: string;
  /** @internal */
  notes?: string;
  /** @internal Version of the downloaded reference database */
  referenceDbVersion?: string;
  /** @internal Whether the reference DB has been downloaded */
  referenceDbLoaded?: boolean;

  /**
   * Mean log-energy vector of the reference session.
   * 512 values: refLogMean[k] = (1/N) · Σ ln(absoluteFeatures[n][k] + ε)
   * Computed at reference creation. Used for Session Bias Match in diagnosis.
   * Stored as number[] (not Float64Array) because IndexedDB/JSON
   * does not natively serialize TypedArrays.
   * null/undefined for old references (before this update).
   */
  refLogMean?: number[] | null;

  /**
   * Standard deviation of log-energy per frequency bin of the reference session.
   * 512 values: refLogStd[k] = std( ln(absoluteFeatures[n][k] + ε) )
   * Computed at reference creation alongside refLogMean.
   * Used by the Drift Detector for variance-normalized local drift (D_local / σ_ref_mean).
   * null/undefined for old references (before this update) – drift works without it.
   */
  refLogStd?: number[] | null;

  /**
   * Residual standard deviation of log-energy per frequency bin (fine structure variance).
   * 512 values: For each frame, residual = frame_log - smoothed_ref_mean, then std over frames.
   * Measures variance of the FINE STRUCTURE (not overall spectrum).
   * Preferred over refLogStd for Drift Detector D_local normalization (V2).
   * null/undefined for old references – falls back to refLogStd.
   */
  refLogResidualStd?: number[] | null;

  /**
   * Calibrated drift baseline from reference partition analysis.
   * Computed during reference creation by splitting frames into partitions,
   * computing drift between all pairs, then deriving thresholds from median + MAD.
   * null when calibration was skipped (too few frames) or old reference.
   */
  refDriftBaseline?: {
    globalMedian: number;
    globalMAD: number;
    localMedian: number;
    localMAD: number;
    adaptiveGlobalWarning: number;
    adaptiveGlobalCritical: number;
    adaptiveLocalWarning: number;
    adaptiveLocalCritical: number;
  } | null;

  /**
   * Reverberation time (T60) of the reference environment in seconds.
   * Measured via chirp at reference creation.
   * null when T60 measurement was disabled or chirp failed.
   * Used for environment comparison during diagnosis.
   */
  refT60?: number | null;

  /**
   * Classification of the reference environment.
   * One of: 'very_dry' | 'dry' | 'medium' | 'reverberant' | 'very_reverberant'
   * Derived from refT60. null when no T60 available.
   */
  refT60Classification?: string | null;

  /**
   * Optional fleet group identifier for fleet check mode.
   * Machines with the same fleetGroup are compared as a fleet.
   * null/undefined = no group assigned (uses time-based fallback in fleet mode).
   */
  fleetGroup?: string | null;

  /**
   * Optional: Machine ID of the fleet's Gold Standard.
   * When set, this machine uses the referenced machine's referenceModels for diagnosis.
   * null/undefined = uses own referenceModels (default, backward compatible).
   */
  fleetReferenceSourceId?: string | null;

  /**
   * Set to true when the machine was auto-created and the name is a placeholder
   * (e.g. the machine ID or a generic "Maschine <id>" string).
   * When true, the merge-import logic will prefer the imported name over the existing one.
   * Cleared after a successful merge import overwrites the placeholder name.
   */
  nameIsPlaceholder?: boolean;
}

/**
 * GMIA Model - Trained reference for a machine
 */
export interface GMIAModel {
  machineId: string;
  label: string; // State label (e.g., "Baseline", "Lagerschaden", "Unwucht")
  type: 'healthy' | 'faulty'; // State type: healthy = normal operation, faulty = known failure mode
  weightVector: Float64Array; // w_p vector from GMIA training
  regularization: number; // λ (lambda) = 10^9
  scalingConstant: number; // C for tanh scaling
  featureDimension: number; // Number of frequency bins (default: 512)
  trainingDate: number; // Timestamp
  trainingDuration: number; // Recording duration in seconds
  sampleRate: number; // Audio sample rate (Hz)
  baselineScore?: number; // Self-recognition score (model tested against its own training data)
  metadata: {
    meanCosineSimilarity: number; // μ for C calculation
    targetScore: number; // Target score (e.g., 0.9)
    weightMagnitude?: number; // L2 norm of weight vector (for signal quality validation)
  };
}

/**
 * Audio Recording
 */
export interface Recording {
  id: string;
  machineId: string;
  type: 'reference' | 'diagnosis';
  audioBuffer: AudioBuffer;
  timestamp: number;
  duration: number;
  sampleRate: number;
}

/**
 * Feature Vector - Energy Spectral Densities
 */
export interface FeatureVector {
  features: Float64Array; // Relative features (sum = 1 in baseline mode)
  normalizedFeatures?: Float64Array; // Alias for relative features (backward/forward compatibility)
  absoluteFeatures: Float64Array; // Absolute energy values
  bins: number; // Number of frequency bins
  frequencyRange: [number, number]; // [min, max] Hz
  rmsAmplitude?: number; // RMS amplitude BEFORE standardization (preserves signal strength) - OPTIONAL for backward compatibility
}

/**
 * Recording Quality Assessment Result
 * Used to evaluate reference recordings before saving
 */
export interface QualityResult {
  score: number; // 0-100 (higher is better)
  rating: 'GOOD' | 'OK' | 'BAD'; // Qualitative rating
  issues: string[]; // List of detected issues (empty if GOOD)
  metadata?: {
    variance: number; // Spectral variance across time
    stability: number; // Signal stability metric
    outlierCount: number; // Number of outlier frames detected
    signalMagnitude?: number; // L2 norm of mean feature vector (used for brown noise detection)
    frameSimilarity?: number; // Median cosine similarity to median frame
    signalSnr?: number; // Peak-to-median ratio of mean spectrum
  };
}

/**
 * Diagnosis Result
 */
export interface DiagnosisResult {
  id: string;
  machineId: string;
  timestamp: number;
  healthScore: number; // 0-100%
  status: 'healthy' | 'uncertain' | 'faulty'; // Strict type for proper type checking
  confidence: number; // 0-100% (model quality indicator)
  rawCosineSimilarity?: number; // Raw cosine value (optional for real-time)
  metadata?: Record<string, unknown>; // Flexible metadata
  analysis?: {
    frequencyAnomalies?: Array<{ frequency: number; deviation: number }>;
    hint?: string;
  };
}

/**
 * DSP Processing Configuration
 */
export interface DSPConfig {
  sampleRate: number; // Default: 48000 Hz
  windowSize: number; // 0.330s (330ms)
  hopSize: number; // 0.066s (66ms)
  fftSize: number; // Calculated from windowSize
  frequencyBins: number; // Default: 512
  frequencyRange: [number, number]; // [0, 24000] Hz (Nyquist)
}

/**
 * Audio Chunk - Processed sub-signal
 */
export interface AudioChunk {
  samples: Float32Array;
  startTime: number; // Offset in seconds
  duration: number; // Chunk duration (0.330s)
  normalized: boolean; // Whether standardization was applied
}

/**
 * Training Data - Collection of feature vectors
 */
export interface TrainingData {
  featureVectors: Float64Array[]; // Each row is a feature vector
  machineId: string;
  recordingId: string;
  numSamples: number; // Number of chunks
  config: DSPConfig;
}

/**
 * Settings & Configuration
 */
export interface AppSettings {
  recordingDuration: number; // Default: 10 seconds
  confidenceThreshold: number; // Default: 75%
  theme: 'light' | 'dark' | 'brand';
  debugMode: boolean;
}

/**
 * Fleet database export format for NFC/QR provisioning.
 * Contains everything needed to provision a complete fleet on a new device.
 *
 * CRITICAL: This format is the contract between export and import.
 * Every field marked as required MUST be present, otherwise import MUST fail.
 */
export interface FleetDbFile {
  /** Format identifier – MUST be exactly 'zanobot-fleet-db' */
  format: 'zanobot-fleet-db';

  /** Schema version (SemVer). Import MUST reject files with major > 1. */
  schemaVersion: '1.0.0';

  /** App DB_VERSION at export time. */
  exportDbVersion: number;

  /** ISO 8601 timestamp of export. */
  exportedAt: string;

  /** App version string at export time (for debugging). */
  appVersion?: string;

  /** Fleet metadata */
  fleet: {
    /** Fleet group name (becomes fleetGroup on all machines) */
    name: string;
    /** Slugified fleet ID (used in URL path) */
    id: string;
    /** Optional description */
    description?: string;
  };

  /**
   * Gold Standard machine ID within this fleet (null = no shared reference).
   * MUST match exactly one entry in machines[] where isGoldStandard === true.
   */
  goldStandardId: string | null;

  /**
   * Gold Standard reference models + calibration data.
   * MUST be present if goldStandardId is not null.
   */
  goldStandardModels?: {
    referenceModels: GMIAModel[];
    refLogMean?: number[] | null;
    refLogStd?: number[] | null;
    refLogResidualStd?: number[] | null;
    refDriftBaseline?: Machine['refDriftBaseline'];
    refT60?: number | null;
    refT60Classification?: string | null;
  };

  /**
   * List of machines in this fleet. MUST contain >= 2 entries.
   * Each machine becomes a Machine record in IndexedDB with fleetGroup set.
   */
  machines: Array<{
    /** Machine ID (used as IndexedDB key). MUST be unique within this array. */
    id: string;
    /** Machine display name */
    name: string;
    /** Is this the Gold Standard? */
    isGoldStandard: boolean;
    /** Optional location info */
    location?: string;
    /** Optional notes */
    notes?: string;
  }>;
}

/**
 * Reference Database File Format - Official format for Google Drive files
 *
 * This is the expected format for reference database files stored in Google Drive.
 * Contains metadata about the database version and origin.
 *
 * Example:
 * {
 *   "db_meta": {
 *     "db_version": "1.0.0",
 *     "created_by": "service",
 *     "created_at": "2025-01-15",
 *     "description": "Normalbetrieb 50 Hz"
 *   },
 *   "models": [...],
 *   "references": [...]
 * }
 */
export interface ReferenceDbMeta {
  db_version: string; // Semantic version (e.g., "1.0.0")
  created_by: string; // Creator identifier (e.g., "service")
  created_at: string; // ISO date string (YYYY-MM-DD)
  description?: string; // Optional description of the database
}

export interface ReferenceDbFile {
  db_meta: ReferenceDbMeta;
  models: GMIAModel[]; // Official reference models
  references?: unknown[]; // Additional reference data (for future use)
  // Legacy fields (for backward compatibility)
  referenceModels?: GMIAModel[];
  machineName?: string;
  location?: string;
  notes?: string;
  config?: Record<string, unknown>;
}

/**
 * Reference Database - Local storage format for downloaded reference data
 * Contains pre-trained reference models and machine configuration
 */
export interface ReferenceDatabase {
  machineId: string; // Links to Machine.id
  version: string; // Database version for update checking (from db_meta.db_version)
  downloadedAt: number; // Timestamp when downloaded
  sourceUrl: string; // Original download URL
  dbMeta?: ReferenceDbMeta; // Original metadata from the file
  data: {
    // Reference models that can be imported
    referenceModels?: GMIAModel[];
    // Machine metadata
    machineName?: string;
    location?: string;
    notes?: string;
    // Any additional configuration
    config?: Record<string, unknown>;
  };
  // Track locally added references (by user)
  localModels?: GMIAModel[]; // Models added locally after initial download
  localModelsUpdatedAt?: number; // Timestamp of last local modification
}

/**
 * Database Schema for IndexedDB
 */
export interface DBSchema {
  machines: {
    key: string; // Machine ID
    value: Machine;
    indexes: {
      'by-name': string;
      'by-created': number;
    };
  };
  recordings: {
    key: string; // Recording ID
    value: Recording;
    indexes: {
      'by-machine': string;
      'by-timestamp': number;
    };
  };
  diagnoses: {
    key: string; // Diagnosis ID
    value: DiagnosisResult;
    indexes: {
      'by-machine': string;
      'by-timestamp': number;
    };
  };
}

// ============================================================================
// AUTO-DETECTION TYPES
// Used for automatic machine recognition in "Zustand prüfen" flow
// ============================================================================

/**
 * Auto-Detection Thresholds
 * Defines the confidence levels for machine recognition decisions
 */
export const AUTO_DETECTION_THRESHOLDS = {
  /** High confidence: Automatic recognition (≥80%) */
  HIGH_CONFIDENCE: 80,
  /** Low confidence: Below this, no match found (<40%) */
  LOW_CONFIDENCE: 40,
  /** Minimum models required: At least one reference model needed */
  MIN_MODELS: 1,
} as const;

/**
 * Result of comparing audio against a single machine's reference models
 */
export interface MachineMatchResult {
  /** The machine being compared */
  machine: Machine;
  /** Best matching model from this machine */
  bestModel: GMIAModel | null;
  /** Similarity score [0-100] */
  similarity: number;
  /** Raw cosine similarity */
  rawCosine: number;
  /** Detected state label */
  detectedState: string;
  /** Health status based on best model type */
  status: 'healthy' | 'uncertain' | 'faulty';
}

/**
 * Result of auto-detection across all machines
 */
export interface AutoDetectionResult {
  /** Detection outcome category */
  outcome: 'high_confidence' | 'uncertain' | 'no_match';
  /** Best matching machine (if any) */
  bestMatch: MachineMatchResult | null;
  /** All machine matches, sorted by similarity (highest first) */
  candidates: MachineMatchResult[];
  /** Timestamp of the detection */
  timestamp: number;
  /** Feature vector used for detection (for subsequent diagnosis) */
  featureVector?: FeatureVector;
}
