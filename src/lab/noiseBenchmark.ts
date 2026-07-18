/**
 * ZANOBOT · Mess-Labor — Lärm-Robustheits-Benchmark (A/B, Stufe 2 des
 * Lärmprofil-Konzepts, siehe docs/NOISE_PROFILE_SUBTRAKTION_KONZEPT.md §4.5)
 *
 * Mischt echte Maschinen-Clips mit einer separaten Lärmaufnahme bei
 * definierten SNR-Stufen und misst die AUC MIT vs. OHNE Lärmprofil-
 * Subtraktion. Erwartung: deutlicher Gewinn im Bereich −5…+15 dB,
 * Neutralität darüber, dokumentierter Zerfall darunter — daraus lassen
 * sich die Schwellen der SNR-Konfidenz-Ampel aus Daten statt Theorie
 * ableiten.
 *
 * Realismus-Details:
 *  - Das Lärmprofil wird aus der ERSTEN Hälfte der Lärmaufnahme gebaut,
 *    gemischt wird mit Segmenten der ZWEITEN Hälfte (Profil ≠ exakter
 *    Mischlärm, wie im Feld).
 *  - Referenz wird auf SAUBEREN Clips trainiert (Werks-Szenario:
 *    Fingerprint entsteht im leisen Werk, Diagnose in der lauten Halle).
 *  - Feature-Pipeline, Subtraktion und SNR-Schätzer sind exakt die
 *    Produktions-Implementierungen (extractFeaturesFromChunk,
 *    applyNoiseSubtraction, estimateClipSnrDb) — nichts reimplementiert.
 *
 * HARD INVARIANTS wie bei den anderen Runnern: rein lesend, nur
 * Sync-Engines (GMIA / Spektral-Cosine), kooperative Yields, AbortSignal.
 */

import { DEFAULT_DSP_CONFIG, extractFeaturesFromChunk } from '@core/dsp/features.js';
import {
  buildNoiseProfileFromFeatures,
  applyNoiseSubtraction,
  estimateClipSnrDb,
  DEFAULT_NOISE_SUB_SETTINGS,
  type NoiseSubtractionSettings,
  type StoredNoiseProfile,
} from '@core/dsp/noiseProfile.js';
import { getEngine } from '@core/ml/engine/registry.js';
import { isAsyncEngine, type DiagnosisEngine } from '@core/ml/engine/types.js';
import type { EngineId, FeatureVector, ReferenceModel, TrainingData } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { auc, pAUC } from './auc.js';
import { clipAggregate, CLIP_AGG_DEFAULT, type ClipAggMode } from './clipAggregate.js';
import { mulberry32 } from './rng.js';
import {
  planSplit,
  SPLIT_MODE_DEFAULT,
  type ParsedDataset,
  type SplitMode,
} from './parseFolder.js';
import {
  type ClipSource,
  throwIfAborted,
  yieldToUi,
  decodeClip,
  makeAudioContext,
  cap,
} from './runnerShared.js';
import type { BenchmarkProgress } from './types.js';

// ── Ergebnis-Typen ───────────────────────────────────────────────────────────

/** AUC-Paar (ohne/mit Subtraktion) einer SNR-Stufe in einem Bereich. */
export interface NoiseLevelScore {
  snrDb: number; // Ziel-Misch-SNR
  aucWithout: number;
  aucWith: number;
  pAucWithout: number;
  pAucWith: number;
  /** Mittel des Produktions-SNR-Schätzers über die gemischten Test-Clips. */
  meanEstimatedSnrDb: number;
  nNormal: number;
  nAbnormal: number;
}

export interface NoiseSectionResult {
  key: string;
  machine: string;
  section: string;
  /** Baseline: AUC auf den UNGEMISCHTEN Test-Clips. */
  cleanAuc: number;
  levels: NoiseLevelScore[];
  trainNormal: number;
  testNormal: number;
  testAbnormal: number;
  error?: string;
}

export interface NoiseBenchmarkResult {
  engineId: EngineId;
  snrLevels: number[];
  clipAgg: ClipAggMode;
  seed: number;
  /** Stationaritäts-Kennzahl des im Lauf gebauten Lärmprofils. */
  profileStationarity: number;
  profileFrames: number;
  beta: number;
  spectralFloor: number;
  sections: NoiseSectionResult[];
  startedAt: number;
  finishedAt: number;
  totalClipsScored: number;
}

export interface NoiseBenchmarkOptions {
  /** Nur Sync-Engines — die Subtraktion arbeitet auf Spektral-Features. */
  engineId: EngineId;
  snrLevels?: number[];
  clipAgg?: ClipAggMode;
  splitMode?: SplitMode;
  splitRatio?: number;
  splitSeed?: number;
  maxFilesPerSection?: number;
  /** Seed für die Wahl der Lärm-Segmente (reproduzierbar). */
  seed?: number;
  signal?: AbortSignal;
  onProgress?: (p: BenchmarkProgress) => void;
}

export const DEFAULT_SNR_LEVELS = [15, 10, 5, 0, -5, -10];

// ── Pure Helfer (Node-testbar) ───────────────────────────────────────────────

/** Mittlere Leistung (mean square) eines Signals. */
export function signalPower(x: Float32Array): number {
  if (x.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return sum / x.length;
}

/**
 * Mischt Lärm in einen Clip bei exakt der Ziel-SNR (bezogen auf die
 * Leistungen der tatsächlich verwendeten Segmente):
 *
 *   SNR_dB = 10·log10( P_clip / (α²·P_noise) )  →  α = √(P_clip / (P_noise·10^(SNR/10)))
 *
 * Der Lärm wird ab `noiseOffset` gelesen und bei Bedarf zyklisch
 * fortgesetzt (modulo), damit auch kurze Lärmaufnahmen lange Clips
 * abdecken.
 */
export function mixAtSnr(
  clean: Float32Array,
  noise: Float32Array,
  snrDb: number,
  noiseOffset = 0
): Float32Array {
  if (noise.length === 0) return clean.slice();

  // Leistung des tatsächlich verwendeten (zyklischen) Lärm-Segments
  const segment = new Float32Array(clean.length);
  for (let i = 0; i < clean.length; i++) {
    segment[i] = noise[(noiseOffset + i) % noise.length];
  }

  const pClip = signalPower(clean);
  const pNoise = signalPower(segment);
  if (pClip <= 0 || pNoise <= 0) return clean.slice();

  const alpha = Math.sqrt(pClip / (pNoise * Math.pow(10, snrDb / 10)));

  const mixed = new Float32Array(clean.length);
  for (let i = 0; i < clean.length; i++) {
    mixed[i] = clean[i] + alpha * segment[i];
  }
  return mixed;
}

/**
 * Produktions-Feature-Pipeline über ein rohes Signal: identisches
 * Chunking wie chunkSignal() in features.ts (330-ms-Fenster, 66-ms-Hop),
 * jeder Chunk durch das öffentliche extractFeaturesFromChunk().
 */
export function extractFeaturesFromRaw(raw: Float32Array, sampleRate: number): FeatureVector[] {
  const config = {
    ...DEFAULT_DSP_CONFIG,
    sampleRate,
    frequencyRange: [0, sampleRate / 2] as [number, number],
  };
  const windowSamples = Math.floor(config.windowSize * sampleRate);
  const hopSamples = Math.floor(config.hopSize * sampleRate);

  const features: FeatureVector[] = [];
  for (let offset = 0; offset + windowSamples <= raw.length; offset += hopSamples) {
    features.push(extractFeaturesFromChunk(raw.slice(offset, offset + windowSamples), config));
  }
  return features;
}

/** Log-Mittel der Referenz-Features (gleiche Formel wie in 2-Reference.ts). */
export function computeRefLogMean(features: FeatureVector[]): Float64Array | null {
  if (features.length === 0) return null;
  const LOG_EPSILON = 1e-12;
  const K = features[0].absoluteFeatures.length;
  const mu = new Float64Array(K);
  for (const fv of features) {
    for (let k = 0; k < K; k++) {
      mu[k] += Math.log(fv.absoluteFeatures[k] + LOG_EPSILON);
    }
  }
  for (let k = 0; k < K; k++) mu[k] /= features.length;
  return mu;
}

/** Clip-Anomalie einer Feature-Liste für eine Sync-Engine (wie benchmark.ts). */
export function scoreFeatureClip(
  engine: DiagnosisEngine,
  models: ReferenceModel[],
  features: FeatureVector[],
  sampleRate: number,
  mode: ClipAggMode
): { capped: number; raw: number; rawValid: boolean } {
  // Sequenz-Engines (Tier 2 'temporal'): Ringpuffer pro Clip zurücksetzen.
  (engine as { resetSequenceState?: () => void }).resetSequenceState?.();

  const capped: number[] = [];
  const raw: number[] = [];
  let frames = 0;

  for (const feature of features) {
    const r = engine.classify(models, { feature, sampleRate });
    frames++;
    capped.push(100 - r.healthScore);
    const sim = r.rawCosineSimilarity;
    if (typeof sim === 'number' && Number.isFinite(sim)) raw.push(1 - sim);
  }

  const rawValid = frames > 0 && raw.length === frames;
  return {
    capped: clipAggregate(capped, mode),
    raw: rawValid ? clipAggregate(raw, mode) : NaN,
    rawValid,
  };
}

/** AUC/pAUC auf der bevorzugten Basis (raw-cosine, Fallback capped). */
function gradeBucket(bucket: {
  raw: number[];
  capped: number[];
  labels: number[];
  rawAllValid: boolean;
}): { auc: number; pAuc: number } {
  const useRaw = bucket.rawAllValid && bucket.raw.length === bucket.labels.length;
  const metric = useRaw ? bucket.raw : bucket.capped;
  const nPos = bucket.labels.filter((l) => l === 1).length;
  const nNeg = bucket.labels.length - nPos;
  return {
    auc: auc(bucket.labels, metric),
    pAuc: nPos > 0 && nNeg > 0 ? pAUC(bucket.labels, metric, 0.1) : NaN,
  };
}

// ── Runner ───────────────────────────────────────────────────────────────────

/** Minimale Länge der Lärmaufnahme (Profil-Hälfte braucht ≥ mehrere Frames). */
const MIN_NOISE_SECONDS = 4;

/**
 * Führt den Lärm-Robustheits-Benchmark aus.
 *
 * @param dataset - Geparster MIMII-Ordner (wie bei den anderen Runnern)
 * @param resolve - Pfad → ClipSource (vom UI bereitgestellt)
 * @param noiseSource - Die separate Lärm-WAV (Hallenlärm, Maschine aus)
 */
export async function runNoiseBenchmark(
  dataset: ParsedDataset,
  resolve: (path: string) => ClipSource,
  noiseSource: ClipSource,
  options: NoiseBenchmarkOptions
): Promise<NoiseBenchmarkResult> {
  const engineCandidate = getEngine(options.engineId);
  if (isAsyncEngine(engineCandidate)) {
    throw new Error(
      'Lärm-Benchmark unterstützt nur Sync-Engines (GMIA/Spektral-Cosine) — ' +
        'die Subtraktion arbeitet auf Spektral-Features, die YAMNet ignoriert.'
    );
  }
  const engine: DiagnosisEngine = engineCandidate;

  const snrLevels = options.snrLevels ?? DEFAULT_SNR_LEVELS;
  const clipAgg = options.clipAgg ?? CLIP_AGG_DEFAULT;
  const seed = options.seed ?? 1337;
  const signal = options.signal;
  const startedAt = Date.now();

  const settings: NoiseSubtractionSettings = { ...DEFAULT_NOISE_SUB_SETTINGS, enabled: true };

  const ctx = await makeAudioContext();
  let totalClipsScored = 0;
  const sections: NoiseSectionResult[] = [];
  let profile: StoredNoiseProfile;

  try {
    // ── Lärmaufnahme dekodieren und in Profil-/Misch-Hälfte teilen ──────────
    options.onProgress?.({
      phase: 'init',
      sectionKey: '',
      filesDone: 0,
      filesTotal: 0,
      message: 'Lärmaufnahme dekodieren + Profil bauen…',
    });
    const noiseClip = await decodeClip(ctx, noiseSource);
    const noiseRaw = noiseClip.raw;
    const sr = noiseClip.sampleRate;
    if (noiseRaw.length < MIN_NOISE_SECONDS * sr) {
      throw new Error(`Lärmaufnahme zu kurz (< ${MIN_NOISE_SECONDS}s)`);
    }
    const half = Math.floor(noiseRaw.length / 2);
    const profileRaw = noiseRaw.subarray(0, half);
    const mixRaw = noiseRaw.slice(half); // eigene Kopie: Misch-Material

    const profileFeatures = extractFeaturesFromRaw(profileRaw, sr);
    profile = buildNoiseProfileFromFeatures(profileFeatures, sr, half / sr, 'Labor-Lärmprofil');

    // ── Splits planen und Fortschritts-Total bestimmen ──────────────────────
    const splitMode = options.splitMode ?? SPLIT_MODE_DEFAULT;
    const plans = dataset.sections.map((s) => ({
      section: s,
      plan: planSplit(s, { mode: splitMode, ratio: options.splitRatio, seed: options.splitSeed }),
    }));

    let filesTotal = 0;
    for (const { plan } of plans) {
      const nTrain = cap(plan.trainNormal, options.maxFilesPerSection).length;
      const nTest =
        cap(plan.testNormal, options.maxFilesPerSection).length +
        cap(plan.testAbnormal, options.maxFilesPerSection).length;
      // Training + 1× sauber prüfen + 1× je SNR-Stufe prüfen
      filesTotal += nTrain + nTest * (1 + snrLevels.length);
    }
    let filesDone = 0;
    const progress = (phase: BenchmarkProgress['phase'], key: string, message: string): void => {
      options.onProgress?.({ phase, sectionKey: key, filesDone, filesTotal, message });
    };

    // ── Pro Bereich: sauber trainieren, dann A/B je SNR-Stufe ────────────────
    for (const { section, plan } of plans) {
      throwIfAborted(signal);
      const trainPaths = cap(plan.trainNormal, options.maxFilesPerSection);
      const testNormal = cap(plan.testNormal, options.maxFilesPerSection);
      const testAbnormal = cap(plan.testAbnormal, options.maxFilesPerSection);

      const sectionBase: Omit<NoiseSectionResult, 'cleanAuc' | 'levels'> = {
        key: section.key,
        machine: section.machine,
        section: section.section,
        trainNormal: trainPaths.length,
        testNormal: testNormal.length,
        testAbnormal: testAbnormal.length,
      };

      // Training auf SAUBEREN Clips (Werks-Szenario)
      progress('train', section.key, `Anlernen (sauber): ${section.key}`);
      const trainFeatures: FeatureVector[] = [];
      const featureVectors: Float64Array[] = [];
      let clipRate = sr;
      for (const path of trainPaths) {
        throwIfAborted(signal);
        try {
          const clip = await decodeClip(ctx, resolve(path));
          clipRate = clip.sampleRate;
          for (const f of clip.features) {
            trainFeatures.push(f);
            featureVectors.push(f.features);
          }
        } catch (err) {
          logger.warn(`Lärm-Benchmark: Trainings-Clip übersprungen (${path}):`, err);
        }
        filesDone++;
        await yieldToUi();
      }

      if (featureVectors.length === 0) {
        sections.push({ ...sectionBase, cleanAuc: NaN, levels: [], error: 'Keine Trainings-Frames' });
        continue;
      }

      let model: ReferenceModel;
      try {
        const trainingData: TrainingData = {
          featureVectors,
          machineId: section.key,
          recordingId: `lab-noise-${section.key}`,
          numSamples: featureVectors.length,
          config: { ...DEFAULT_DSP_CONFIG, sampleRate: clipRate },
        };
        model = engine.train({ trainingData, sampleRate: clipRate }, section.key);
        model.label = 'Referenz';
        model.type = 'healthy';
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sections.push({ ...sectionBase, cleanAuc: NaN, levels: [], error: msg });
        continue;
      }

      // Referenz-Log-Mittel für Scale-Fit + SNR-Schätzer (wie in der Diagnose)
      const refLogMean = computeRefLogMean(trainFeatures);

      // Test-Clips einmal dekodieren (raw behalten fürs Mixing)
      const testClips: Array<{ raw: Float32Array; features: FeatureVector[]; label: 0 | 1; rate: number }> = [];
      for (const { path, label } of [
        ...testNormal.map((p) => ({ path: p, label: 0 as const })),
        ...testAbnormal.map((p) => ({ path: p, label: 1 as const })),
      ]) {
        throwIfAborted(signal);
        progress('score', section.key, `Prüfen (sauber): ${section.key}`);
        try {
          const clip = await decodeClip(ctx, resolve(path));
          testClips.push({ raw: clip.raw, features: clip.features, label, rate: clip.sampleRate });
        } catch (err) {
          logger.warn(`Lärm-Benchmark: Prüf-Clip übersprungen (${path}):`, err);
        }
        filesDone++;
        await yieldToUi();
      }

      // Baseline: saubere Test-Clips
      const cleanBucket = { raw: [] as number[], capped: [] as number[], labels: [] as number[], rawAllValid: true };
      for (const clip of testClips) {
        const v = scoreFeatureClip(engine, [model], clip.features, clip.rate, clipAgg);
        if (Number.isFinite(v.capped)) {
          cleanBucket.capped.push(v.capped);
          cleanBucket.raw.push(v.raw);
          cleanBucket.labels.push(clip.label);
          if (!v.rawValid || !Number.isFinite(v.raw)) cleanBucket.rawAllValid = false;
          totalClipsScored++;
        }
      }
      const cleanAuc = gradeBucket(cleanBucket).auc;

      // A/B je SNR-Stufe (Lärm-Segmente seeded aus der Misch-Hälfte)
      const rng = mulberry32(seed);
      const levels: NoiseLevelScore[] = [];
      for (const snrDb of snrLevels) {
        throwIfAborted(signal);
        const without = { raw: [] as number[], capped: [] as number[], labels: [] as number[], rawAllValid: true };
        const withSub = { raw: [] as number[], capped: [] as number[], labels: [] as number[], rawAllValid: true };
        const estimates: number[] = [];
        let nNormal = 0;
        let nAbnormal = 0;

        for (const clip of testClips) {
          throwIfAborted(signal);
          progress('score', section.key, `Prüfen @ ${snrDb} dB: ${section.key}`);

          const offset = Math.floor(rng() * mixRaw.length);
          const mixed = mixAtSnr(clip.raw, mixRaw, snrDb, offset);
          const mixedFeatures = extractFeaturesFromRaw(mixed, clip.rate);
          if (mixedFeatures.length === 0) {
            filesDone++;
            continue;
          }

          // OHNE Subtraktion
          const a = scoreFeatureClip(engine, [model], mixedFeatures, clip.rate, clipAgg);
          if (Number.isFinite(a.capped)) {
            without.capped.push(a.capped);
            without.raw.push(a.raw);
            without.labels.push(clip.label);
            if (!a.rawValid || !Number.isFinite(a.raw)) without.rawAllValid = false;
          }

          // MIT Subtraktion (Produktions-Batchpfad wie in der Referenz-Phase)
          const cleaned = applyNoiseSubtraction(mixedFeatures, profile, settings, refLogMean);
          const b = scoreFeatureClip(engine, [model], cleaned, clip.rate, clipAgg);
          if (Number.isFinite(b.capped)) {
            withSub.capped.push(b.capped);
            withSub.raw.push(b.raw);
            withSub.labels.push(clip.label);
            if (!b.rawValid || !Number.isFinite(b.raw)) withSub.rawAllValid = false;
          }

          // Produktions-SNR-Schätzer gegen die bekannte Misch-SNR
          const est = estimateClipSnrDb(mixedFeatures, profile, refLogMean);
          if (est !== null) estimates.push(est);

          if (clip.label === 0) nNormal++;
          else nAbnormal++;
          totalClipsScored += 2;
          filesDone++;
          await yieldToUi();
        }

        const gWithout = gradeBucket(without);
        const gWith = gradeBucket(withSub);
        levels.push({
          snrDb,
          aucWithout: gWithout.auc,
          aucWith: gWith.auc,
          pAucWithout: gWithout.pAuc,
          pAucWith: gWith.pAuc,
          meanEstimatedSnrDb:
            estimates.length > 0 ? estimates.reduce((s, v) => s + v, 0) / estimates.length : NaN,
          nNormal,
          nAbnormal,
        });
      }

      sections.push({ ...sectionBase, cleanAuc, levels });
    }
  } finally {
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
  }

  return {
    engineId: options.engineId,
    snrLevels,
    clipAgg,
    seed,
    profileStationarity: profile.stationarity,
    profileFrames: profile.frameCount,
    beta: settings.beta,
    spectralFloor: settings.spectralFloor,
    sections,
    startedAt,
    finishedAt: Date.now(),
    totalClipsScored,
  };
}

// ── Export (CSV/JSON) ────────────────────────────────────────────────────────

const fmt = (v: number): string => (Number.isFinite(v) ? v.toFixed(4) : '');

export function toCsvNoise(result: NoiseBenchmarkResult): string {
  const lines = [
    'machine,section,snr_db,auc_without,auc_with,delta_auc,pauc_without,pauc_with,mean_est_snr_db,n_normal,n_abnormal,clean_auc',
  ];
  for (const s of result.sections) {
    for (const l of s.levels) {
      lines.push(
        [
          s.machine,
          s.section,
          String(l.snrDb),
          fmt(l.aucWithout),
          fmt(l.aucWith),
          fmt(l.aucWith - l.aucWithout),
          fmt(l.pAucWithout),
          fmt(l.pAucWith),
          Number.isFinite(l.meanEstimatedSnrDb) ? l.meanEstimatedSnrDb.toFixed(1) : '',
          String(l.nNormal),
          String(l.nAbnormal),
          fmt(s.cleanAuc),
        ].join(',')
      );
    }
  }
  return lines.join('\n');
}

export function toJsonNoise(result: NoiseBenchmarkResult): string {
  return JSON.stringify(result, null, 2);
}
