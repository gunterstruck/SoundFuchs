/**
 * ZANOBOT - TYPE DEFINITIONS
 *
 * Core TypeScript interfaces for the entire application.
 * Based on GMIA specifications.
 */

import type { FeatureLayout } from '@core/dsp/filterBank.js';

/**
 * Machine Identification
 */
/**
 * Ein Kunde — der Ort, an dem Maschinen stehen.
 *
 * Bewusst schmal gehalten. Die Schwester-App TourFuchs führt am Kunden
 * Umsatz, Kanal, Bezirk und Zuständigkeit; das ist Vertriebswissen und
 * gehört dorthin, nicht hierher. Hier trägt der Kunde nur, was nötig ist, um
 * ihn auf einer Karte zu finden und ihm Maschinen zuzuordnen.
 *
 * Der gemeinsame Begriff ist zugleich die Brücke: Wer in TourFuchs einen
 * Kunden vor sich hat, könnte künftig sehen, welche Maschinen bei ihm stehen.
 * Dafür müssen beide Apps denselben Kunden meinen.
 *
 * Siehe docs/kunden-und-karte.md.
 */
export interface Customer {
  /** Eindeutige Kennung. Geht auch in den Versatz der Kartenposition ein. */
  id: string;
  /** Anzeigename, das einzige immer nötige Eingabefeld. */
  name: string;
  /** Fünfstellige deutsche Postleitzahl — leer, wenn der Punkt vom GPS kommt. */
  plz: string;
  /** Ortsname. Füllt sich aus der Postleitzahl, ist aber überschreibbar. */
  ort?: string;
  /** Breitengrad, aus der Postleitzahl berechnet. */
  lat?: number;
  /** Längengrad, aus der Postleitzahl berechnet. */
  lng?: number;
  /**
   * Wie genau die Position ist. `plz` heißt Ortsmitte, `gps` die ausdrücklich
   * am Gerät bestimmte Position; `none` heißt, dass kein Punkt bekannt ist.
   * Wird mitgeführt, damit die Karte keine Schärfe vortäuscht.
   */
  geo: 'plz' | 'gps' | 'none';
  createdAt: number;
  /**
   * Erfundener Vorführ-Kunde, keine echten Daten (docs/beispieldaten.md).
   *
   * Trennt Beispieldaten sauber vom echten Bestand: „Beispieldaten entfernen"
   * löscht genau die Kunden mit diesem Feld und keinen einzigen echten.
   */
  demo?: boolean;
}

export interface Machine {
  id: string; // Unique identifier (from barcode/QR or user-generated)
  name: string; // Human-readable name
  createdAt: number; // Timestamp
  lastDiagnosisAt?: number; // Last diagnosis timestamp
  referenceModels: ReferenceModel[]; // Trained reference models (multiclass diagnosis, possibly mixed engines)
  referenceImage?: Blob; // Optional reference image for visual positioning (Ghost Image Overlay)

  // Internal/Runtime Fields (derived from NFC deep link, not user-editable)
  // Note: referenceDbUrl is now derived at runtime from customerId via HashRouter.buildDbUrlFromCustomerId()
  // These fields are kept for backward compatibility but are no longer exposed in UI
  /** @internal Derived from NFC customerId parameter - not user-editable */
  referenceDbUrl?: string;
  /**
   * Der Kunde, bei dem diese Maschine steht (optional).
   *
   * Ohne ihn bleibt alles, wie es war: Der Bestand funktioniert vollständig
   * ohne einen einzigen Kunden. Erst wer Kunden anlegt, bekommt die Karte
   * und die Gruppierung dazu.
   *
   * ⚠ NICHT ZU VERWECHSELN mit dem `c`-Parameter aus dem NFC-Link, den
   * `HashRouter` intern ebenfalls `customerId` nennt. Der ist kein Kunde,
   * sondern der Name einer Referenz-Sammlung auf GitHub Pages — die
   * Oberfläche heißt ihn deshalb längst „Referenz-Sammlung (c)". Er landet
   * NIE hier, sondern ausschließlich in `referenceDbUrl` (siehe oben).
   * Wer ihn eines Tages hierher schreibt, hängt jede über NFC eingerichtete
   * Maschine an einen Kunden, den es nicht gibt.
   */
  customerId?: string;
  /** Erfundene Vorführ-Maschine, keine echten Daten. Siehe `Customer.demo`. */
  demo?: boolean;

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
 * Identifier of the evaluation engine that produced a reference model.
 * Existing GMIA models stored before the engine abstraction have no
 * engineId and are interpreted as 'gmia' (see resolveEngineId()).
 */
export type EngineId = 'gmia' | 'spectral-cosine' | 'yamnet' | 'temporal';

/**
 * GMIA Model - Trained reference for a machine
 */
export interface GMIAModel {
  /**
   * Engine discriminant. Optional for backward compatibility: a model
   * without engineId is a legacy GMIA model and read as 'gmia'.
   */
  engineId?: 'gmia';
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
  /**
   * Merkmals-Layout, mit dem dieses Modell trainiert wurde (Bandaufteilung der
   * Filterbank, siehe core/dsp/filterBank.ts). Zwei Layouts können dieselbe
   * Vektorlänge haben und völlig verschiedene Frequenzen beschreiben — ein
   * Cosinus darüber liefert dann einen plausiblen, bedeutungslosen Score.
   * Fehlt das Feld, stammt das Modell aus der Zeit davor und ist 'linear-512'.
   */
  featureLayout?: FeatureLayout;
  baselineScore?: number; // Self-recognition score (model tested against its own training data)
  /**
   * Robust spread of the SAME self-test scores whose mean is `baselineScore`:
   * median and MAD (σ-scaled). `baselineScore` alone throws the spread away,
   * which is what forces thresholds to be round numbers instead of derived from
   * this machine's own normal. See `core/ml/baselineSpread.ts`.
   * Absent on models trained before this field existed — callers fall back to
   * their fixed threshold.
   */
  baselineMedian?: number;
  baselineMad?: number;
  metadata: {
    meanCosineSimilarity: number; // μ for C calculation
    targetScore: number; // Target score (e.g., 0.9)
    weightMagnitude?: number; // L2 norm of weight vector (for signal quality validation)
  };
}

/**
 * Spectral one-class reference model (Tier 0 alternative engine).
 *
 * Uses a COSINE-to-mean distance with GMIA-style value calibration. (An earlier
 * diagonal-Mahalanobis distance was tried and abandoned — report §11.9/§11.10 —
 * because on relative-ESD features it over-weighted low-energy noise-floor bins
 * and collapsed the score to 0 for a matching signal.)
 *
 * Model: the reference mean spectrum μ (relative ESD) + a tanh² scaling
 * constant C. Diagnosis: cos(f, μ) → score = 100·tanh(C·cos)² (GMIA Eq. 4 form),
 * calibrated so the mean training cosine maps to ~90%. `mean` is stored as plain
 * number[] so it survives IndexedDB structured clone and JSON export untouched.
 */
export interface SpectralCosineModel {
  engineId: 'spectral-cosine';
  machineId: string;
  label: string; // State label (e.g., "Baseline", "Lagerschaden")
  type: 'healthy' | 'faulty';
  mean: number[]; // reference mean spectrum (cosine reference / ghost overlay / fallback)
  /**
   * Memory bank of training sub-window spectra for k-NN scoring (Briefing
   * §17.2): the live frame is compared to its k nearest reference sub-windows
   * instead of a single mean. Robust to multimodal/"moving" recordings.
   * Capped in size. Optional: when absent, scoring falls back to cosine-to-mean.
   */
  bank?: number[][];
  scalingConstant: number; // C for tanh² value calibration (GMIA Eq. 4 form)
  featureDimension: number; // 512
  sampleRate: number; // bound to FFT bins, same constraint as GMIA
  trainingDate: number; // Timestamp
  trainingDuration: number; // Cumulative analysis time of training windows (s)
  /**
   * Merkmals-Layout, mit dem dieses Modell trainiert wurde (Bandaufteilung der
   * Filterbank, siehe core/dsp/filterBank.ts). Zwei Layouts können dieselbe
   * Vektorlänge haben und völlig verschiedene Frequenzen beschreiben — ein
   * Cosinus darüber liefert dann einen plausiblen, bedeutungslosen Score.
   * Fehlt das Feld, stammt das Modell aus der Zeit davor und ist 'linear-512'.
   */
  featureLayout?: FeatureLayout;
  /** Mean self-recognition score over training data (quality gate + ranking parity). */
  baselineScore?: number;
  /**
   * Robust spread of the same self-test scores (median + σ-scaled MAD), kept so
   * a threshold can be expressed relative to this reference's own normal
   * instead of as a fixed percentage. See `core/ml/baselineSpread.ts`.
   * Absent on older models.
   */
  baselineMedian?: number;
  baselineMad?: number;
  /**
   * RMS amplitude of the raw reference audio. Used as an energy gate at
   * diagnosis: cosine similarity is magnitude-invariant, so near-silence can
   * still score moderately; scaling the score by the live/training energy ratio
   * pushes a stopped (silent) machine back down. Optional — models trained
   * before this carry none and are scored exactly as before (no gate).
   */
  trainingRms?: number;
  metadata?: {
    meanCosine?: number; // μ_cos used for C
    targetScore?: number; // target self-score band (e.g. 0.9)
  };
}

/**
 * YAMNet embedding reference model (Tier 1 — third, separately selectable engine).
 *
 * Built from pretrained YAMNet audio embeddings (1024-dim, computed from raw
 * audio resampled to 16 kHz). Diagnosis is distance-based against a memory bank
 * of reference embeddings (cosine k-NN), value-calibrated like the spectral
 * engines. Sample-rate independent (YAMNet resamples internally), so unlike GMIA
 * its bins are not tied to the capture rate. Stored as plain number[][] for
 * IndexedDB / JSON friendliness.
 */
/**
 * HINWEIS zum fehlenden `featureLayout`: YAMNet-Modelle entstehen aus ROHAUDIO
 * (intern auf 16 kHz resampelt) und berühren die spektrale Filterbank nie. Die
 * Ausnahme von der Layout-Prüfung steht deshalb hier im Typ und nicht als
 * if-Abfrage im Vergleichspfad (siehe core/ml/modelCompatibility.ts).
 */
export interface EmbeddingModel {
  engineId: 'yamnet';
  machineId: string;
  label: string;
  type: 'healthy' | 'faulty';
  /** Memory bank of L2-normalized reference embeddings (k-NN). */
  bank: number[][];
  /** Mean reference embedding (L2-normalized) — fallback + ghost. */
  mean: number[];
  scalingConstant: number; // C for tanh² value calibration on cosine
  embeddingDim: number; // 1024
  featureDimension: number; // = embeddingDim (interface parity)
  sampleRate: number; // original capture rate (informational; not bin-bound)
  trainingDate: number;
  trainingDuration: number;
  baselineScore?: number;
  /**
   * Robust spread of the same self-test scores (median + σ-scaled MAD).
   * See `core/ml/baselineSpread.ts`. Absent on older models.
   */
  baselineMedian?: number;
  baselineMad?: number;
  metadata?: { meanCosine?: number; targetScore?: number };
}

/**
 * Temporal reference model (Tier 2 — vierte Engine für nicht-stationäre,
 * bewegte und transiente Geräusche; siehe docs/TIER2_TEMPORAL_ENGINE_KONZEPT.md).
 *
 * Kernidee: Zeit behalten statt mitteln. Die Referenz wird als zeitlich
 * GEORDNETE Frame-Bank gespeichert (keine Mittelwert-Signatur); die Diagnose
 * bildet pro Frame eine kNN-Anomalie und aggregiert die Anomalie-ZEITREIHE
 * deviation-/max-bewusst (DMM aus AdaBEAM arXiv:2603.13749 + RDP aus
 * arXiv:2603.04605) statt sie wegzumitteln. Kalibrierung Leave-One-
 * Neighborhood-Out (Lehre aus dem Tier-0-Pivot: überlappende Fenster täuschen
 * sonst eine winzige Trainings-Streuung vor). Stored as plain number[][] for
 * IndexedDB / JSON friendliness.
 */
export interface TemporalModel {
  engineId: 'temporal';
  machineId: string;
  label: string;
  type: 'healthy' | 'faulty';
  /** Zeitlich geordnete Frame-Bank (relative ESD, evenly subsampled). */
  bank: number[][];
  /** Mittelspektrum (nur Ghost-Overlay/Anzeige — NICHT fürs Scoring). */
  mean: number[];
  scalingConstant: number; // C für tanh²-Kennlinie auf der aggregierten Ähnlichkeit
  featureDimension: number; // 512
  sampleRate: number; // an FFT-Bins gebunden, wie GMIA
  trainingDate: number;
  trainingDuration: number;
  /**
   * Merkmals-Layout, mit dem dieses Modell trainiert wurde (Bandaufteilung der
   * Filterbank, siehe core/dsp/filterBank.ts). Zwei Layouts können dieselbe
   * Vektorlänge haben und völlig verschiedene Frequenzen beschreiben — ein
   * Cosinus darüber liefert dann einen plausiblen, bedeutungslosen Score.
   * Fehlt das Feld, stammt das Modell aus der Zeit davor und ist 'linear-512'.
   */
  featureLayout?: FeatureLayout;
  /**
   * Selbst-Erkennungs-Score (LONO-kalibriert, Quality-Gate + Ranking-Parität).
   *
   * BEWUSST OHNE `baselineMedian`/`baselineMad` (anders als die drei mittelnden
   * Engines): Dieser Wert ist kein Mittel über eine Verteilung, sondern ein
   * EINZELNER Skalar auf der aggregierten Selbst-Ähnlichkeit (`aggSelfSim`) —
   * pro Referenz gibt es genau einen. Eine Streuung existiert hier nicht ohne
   * ein anderes Konstruktionsprinzip (z. B. LONO-Partitionen); sie zu erfinden
   * wäre eine Zahl ohne Messung. Siehe `core/ml/baselineSpread.ts`.
   */
  baselineScore?: number;
  /** RMS der Referenzaufnahme fürs Energy-Gate (wie SpectralCosineModel). */
  trainingRms?: number;
  /**
   * T3 Ereignis-Bank (T2-a2, optional — Modelle ohne Events bleiben gültig,
   * der Ereignis-Pfad ist dann inaktiv). Deskriptoren aus der Onset-
   * Segmentierung der Referenz, Konzept §4.4.
   */
  events?: TemporalEventDescriptor[];
  /** Erwartete Ereignisdichte der Referenz (z. B. Ventil-Takte pro Minute). */
  eventRatePerMin?: number;
  /**
   * T4 Zyklus-Template (T2-a3, optional — nur wenn die Referenz stabil
   * zyklisch ist): gain-normierte Energie-Hüllkurve EINES Zyklus, Konzept
   * §4.5. Modelle ohne Zyklus-Felder laufen unverändert ohne Zyklus-Pfad.
   */
  cycleEnvelope?: number[];
  /** Dominante Zyklusperiode der Referenz (Autokorrelation), Sekunden. */
  cyclePeriodSec?: number;
  metadata?: {
    meanSimilarity?: number; // μ_sim (LONO) für C
    targetScore?: number; // z. B. 0.9
    bankSize?: number;
    eventCount?: number; // Ereignisse in der Referenzaufnahme (vor Dedup)
    cycleSelfDtwMean?: number; // Selbst-DTW-Kalibrierung (T4)
    cycleSelfDtwStd?: number;
  };
}

/** Ein Referenz-Ereignis (Transient) der Temporal-Engine, Konzept §4.4. */
export interface TemporalEventDescriptor {
  /** Mittelspektrum über die Ereignis-Frames (relative ESD, Σ=1). */
  meanSpectrum: number[];
  /** Ereignisdauer in Frames (Hop-Raster der Referenz-Extraktion). */
  durationFrames: number;
  /** Ereignis-RMS / Median-Frame-RMS (1, wenn kein Rohsignal verfügbar). */
  energyRatio: number;
}

/**
 * A trained reference model produced by one of the swappable engines.
 * Backward compatible: legacy GMIAModel records (no engineId) are part of
 * this union and read as 'gmia'.
 */
export type ReferenceModel = GMIAModel | SpectralCosineModel | EmbeddingModel | TemporalModel;

/**
 * Type guard: is this a GMIA model? Legacy models without engineId count as GMIA.
 * Use to safely access GMIA-only fields (weightVector, scalingConstant, …) on
 * the ReferenceModel union.
 */
export function isGMIAModel(model: ReferenceModel): model is GMIAModel {
  return (model.engineId ?? 'gmia') === 'gmia';
}

/** Type guard: is this a YAMNet embedding model (Tier 1)? */
export function isEmbeddingModel(model: ReferenceModel): model is EmbeddingModel {
  return model.engineId === 'yamnet';
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
    signalTooWeak?: boolean; // True when signal is weak AND noise-masked (unreliable measurement)
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
    /**
     * "Bad features" of this check: frequency bands where the measurement adds
     * energy the reference doesn't. `strength` is 0–100 (how much of the band's
     * energy is unexplained by the reference). Populated on the result screen
     * when reference + measurement spectra are available; shown as a list and as
     * red timeline markers (when strength ≥ 50 %).
     */
    frequencyAnomalies?: Array<{ frequency: number; strength: number }>;
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
  /** A winner must also lead the runner-up clearly; otherwise ask the user. */
  MIN_CONFIDENCE_LEAD: 8,
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
  /** Best matching model from this machine (any engine) */
  bestModel: ReferenceModel | null;
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
