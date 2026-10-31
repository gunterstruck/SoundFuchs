/**
 * ZANOBOT · Mess-Labor — „Handy-Protokoll“: eine Referenz, viele Prüfungen, AUC
 *
 * Misst, was ein Nutzer am Handy wirklich erlebt: SoundFuchs lernt aus GENAU
 * EINER Referenzaufnahme und prüft spätere Aufnahmen derselben Maschine
 * dagegen. Je Bereich (Maschinen-ID) und Engine:
 *
 *   1. N Referenz-Clips reproduzierbar ziehen (planPhoneProtocol, Seed).
 *   2. Je Durchlauf GENAU diesen einen Clip anlernen wie am Handy —
 *      trainPipeline (Cherry-Picking, Raumkompensation) → trainFingerprint,
 *      Referenz-Statistik für Bias-Match/Drift wie in interactive.ts.
 *   3. Alle übrigen Normal-Clips und alle Abnormal-Clips prüfen wie am Handy:
 *      frische LivePipeline je Prüfung, Frames durch engine.classify(),
 *      je Clip aggregiert wie im AUC-Modus (clipAggregate, Rohwert bevorzugt).
 *   4. AUC/pAUC je Durchlauf (auc.ts).
 *   5. Mit den Schwellen aus den Einstellungen (phoneVerdict, wie die
 *      Handy-Simulation): Fehlalarm-, Erkennungs- und Zwischenbereichsquote.
 *
 * Erweiterungen (Standard aus → Verhalten wie oben):
 *   - Referenz aus k Clips: die Handy-Vorverarbeitung läuft je Clip, die
 *     Features (und das Rohsignal für YAMNet) werden aneinandergehängt wie
 *     bei einer längeren Aufnahme und gemeinsam angelernt.
 *   - Kalibrier-Clips m: nach dem Anlernen werden m weitere Normal-Clips wie
 *     Prüfungen bewertet; aus ihren Rohwerten entsteht eine Schwelle
 *     (calibrationThreshold). Ein Testclip ist kalibriert „auffällig“, wenn
 *     sein Rohwert darüber liegt.
 *   - Die Testmenge ist je Bereich fest (siehe planPhoneProtocol).
 *
 * Sequenz-Engines (Zeitmuster) bekommen pro Clip resetSequenceState() wie in
 * benchmark.ts. YAMNet läuft asynchron in ≈1-s-Fenstern über das Rohsignal; die
 * spektralen Handy-Stufen wirken dort — wie am Handy — nicht.
 *
 * HARTE INVARIANTEN (wie bei allen Labor-Läufern): echte Engines + echte
 * Feature-Pipeline, keine Engine-Logik verändert; strikt lesend (nichts in
 * IndexedDB, keine echte Referenz); lazy geladen; yieldToUi + AbortSignal.
 */

import { getEngine } from '@core/ml/engine/registry.js';
import { isAsyncEngine } from '@core/ml/engine/types.js';
import type { AnyDiagnosisEngine } from '@core/ml/engine/types.js';
import type { EngineId, FeatureVector, GMIAModel, QualityResult } from '@data/types.js';
import { GmiaEngine } from '@core/ml/engine/GmiaEngine.js';
import { getRecordingSettings } from '@utils/recordingSettings.js';
import { getCherryPickSettings } from '@core/dsp/cherryPicking.js';
import { getRoomCompSettings } from '@core/dsp/roomCompensation.js';
import { logger } from '@utils/logger.js';
import { auc, pAUC } from './auc.js';
import { clipAggregate, CLIP_AGG_DEFAULT, type ClipAggMode } from './clipAggregate.js';
import { trainFingerprint, type Fingerprint } from './classifyBenchmark.js';
import { phoneVerdict, type PredClass } from './classifyEval.js';
import type { ParsedDataset } from './parseFolder.js';
import {
  trainPipeline,
  computeRefStats,
  LivePipeline,
  pipelineSummary,
  type RefStats,
} from './phonePipeline.js';
import {
  planPhoneProtocol,
  summarize,
  wavSampleRate,
  PHONE_PROTOCOL_DEFAULTS,
  CALIB_CLIPS_MAX,
  REF_CLIPS_MAX,
  type PhoneSectionPlan,
  type SpreadSummary,
} from './phoneProtocolPlan.js';
import {
  calibrationThreshold,
  calibratedFlag,
  CALIB_MEAN_Z_MIN,
  type CalibParams,
  type CalibRule,
  type RefLayout,
} from './phoneProtocolPlan.js';
import {
  type ClipSource,
  type DecodedClip,
  concatRaw,
  throwIfAborted,
  yieldToUi,
  decodeClip,
  makeAudioContext,
  yamnetFrame,
  YAMNET_WINDOW_SEC,
  YAMNET_HOP_SEC,
} from './runnerShared.js';
import type { BenchmarkProgress, ScoreBasis } from './types.js';

// ── Optionen & Ergebnis-Typen ────────────────────────────────────────────────

/** GMIA-λ-Stufe: 'standard' = λ = 10^9 (App), Zahl = α für λ = α · Spur(XᵀX) / N. */
export type GmiaLambdaStage = 'standard' | number;

/** Vorschlag der Stufen in der Oberfläche. */
export const GMIA_LAMBDA_STAGES: GmiaLambdaStage[] = ['standard', 1, 0.1, 0.01, 0.001];

/** Ab dieser Konditionszahl von XᵀX + λI gilt eine Stufe als „eingeschränkt“. */
export const GMIA_CONDITION_LIMIT = 1e10;

/**
 * Eine Zeile im Bericht: eine Engine — oder bei GMIA eine λ-Stufe. Der
 * Schlüssel der Standard-Stufe ist 'gmia' (wie bisher), sonst z. B. 'gmia-a0.1'.
 */
export interface PhoneUnit {
  key: string;
  engineId: EngineId;
  label: string;
  /** Nur bei GMIA gesetzt. */
  gmiaStage?: GmiaLambdaStage;
}

/** Schlüssel + Anzeigename einer GMIA-λ-Stufe. */
export function gmiaStageUnit(stage: GmiaLambdaStage): PhoneUnit {
  if (stage === 'standard')
    return { key: 'gmia', engineId: 'gmia', label: 'GMIA', gmiaStage: stage };
  return {
    key: `gmia-a${stage}`,
    engineId: 'gmia',
    label: `GMIA α=${String(stage).replace('.', ',')}`,
    gmiaStage: stage,
  };
}

export interface PhoneProtocolOptions {
  engines: EngineId[];
  /**
   * GMIA-λ-Stufen (nur wirksam, wenn 'gmia' in engines). Standard: nur
   * 'standard' → genau eine Zeile „GMIA“ wie bisher.
   */
  gmiaStages?: GmiaLambdaStage[];
  /** Referenz-Durchläufe je Bereich (Standard 20). */
  runs?: number;
  /** Seed der Referenz-Ziehung (reproduzierbar). */
  seed?: number;
  /** Max. Testclips je Klasse (0/undefined = alle). Kürzt nie die Referenz. */
  maxTestPerClass?: number;
  /** Clip-Aggregation für AUC/pAUC (wie im AUC-Modus). */
  clipAgg?: ClipAggMode;
  /** Kalibrier-Clips m je Durchlauf (0–10, Standard 0 = keine kalibrierte Schwelle). */
  calibClips?: number;
  /** Referenz aus k Clips (1–5, Standard 1). */
  refClips?: number;
  /** Lage der k Referenz-Clips: 'spread' (Standard, verteilt) oder 'block' (am Stück). */
  refLayout?: RefLayout;
  /** Schwellenregel bei m > 0 (Standard 'max-factor'). */
  calibRule?: CalibRule;
  /** Faktor für 'max-factor' (Standard 1,25). */
  calibFactor?: number;
  /** z für 'mean-z' (Standard 3). */
  calibZ?: number;
  signal?: AbortSignal;
  onProgress?: (p: BenchmarkProgress) => void;
  /**
   * Nur für Tests/Node: eigener Decoder statt AudioContext. Im Browser bleibt
   * das leer — dann wird wie im AUC-Modus über einen 48-kHz-AudioContext
   * dekodiert (16-kHz-Dateien werden dabei umgerechnet).
   */
  decode?: (src: ClipSource) => Promise<DecodedClip>;
}

/** Eine geprüfte Clip-Paarung (Referenz × Testclip) — für den Detail-Export. */
export interface PhoneClipRecord {
  sectionKey: string;
  engine: EngineId;
  /** Berichtszeile (Engine bzw. GMIA-λ-Stufe), siehe PhoneUnit.key. */
  unit: string;
  run: number;
  refPath: string;
  testPath: string;
  /** 0 = normal, 1 = abnormal. */
  label: 0 | 1;
  /** Aggregierte Roh-Anomalie (1 − Rohähnlichkeit), NaN wenn nicht verfügbar. */
  raw: number;
  /** Aggregierte Anomalie auf dem gedeckelten Score (100 − Health) — Fallback-Basis. */
  capped: number;
  /** Angezeigter Score am Handy (Mittel der Frame-Scores, 0–100). */
  displayScore: number;
  /** Urteil mit den Schwellen aus den Einstellungen. */
  status: PredClass;
  /** Kalibrierte Schwelle dieses Durchlaufs (NaN ohne Kalibrierung). */
  threshold: number;
  /** Kalibriertes Urteil: true = auffällig, false = unauffällig, null = keine Schwelle. */
  calibFlag: boolean | null;
}

/** Ergebnis EINES Durchlaufs (eine Referenz) für eine Engine. */
export interface PhoneRunResult {
  run: number;
  refPath: string;
  /** Alle k Referenz-Clips (bei k = 1 nur refPath). */
  refPaths: string[];
  /** Die m Kalibrier-Clips dieses Durchlaufs. */
  calibPaths: string[];
  /** Referenz-Spanne: größte minus kleinste Dateinummer der Referenz-Clips. */
  refSpan: number;
  /** GMIA: verwendetes λ (sonst NaN). */
  lambda: number;
  /** GMIA: Konditionszahl von XᵀX + λI (sonst NaN). */
  conditionNumber: number;
  /** Qualität der Referenzaufnahme, bewertet wie am Handy (schlechteste der k Clips). */
  refQuality: QualityResult['rating'] | null;
  /** Roh-Anomalien der Kalibrier-Clips (Basis der Schwelle). */
  calibRaw: number[];
  /** Kalibrierte Schwelle auf dem Rohwert (NaN ohne Kalibrierung). */
  threshold: number;
  /** Normal-Clips mit Rohwert über der Schwelle / alle Normal-Clips. */
  calibFalseAlarmRate: number;
  /** Abnormal-Clips mit Rohwert über der Schwelle / alle Abnormal-Clips. */
  calibDetectionRate: number;
  auc: number;
  pAuc: number;
  scoreBasis: ScoreBasis;
  nTestNormal: number;
  nTestAbnormal: number;
  /** Normal-Clips mit Urteil „auffällig“ (faulty) / alle Normal-Clips. */
  falseAlarmRate: number;
  /** Abnormal-Clips mit Urteil „auffällig“ / alle Abnormal-Clips. */
  detectionRate: number;
  /** Anteil Normal-Clips im Zwischenbereich (unsicher). */
  normalUncertainRate: number;
  /** Anteil Abnormal-Clips im Zwischenbereich (unsicher). */
  abnormalUncertainRate: number;
  /** Anteil aller geprüften Clips im Zwischenbereich. */
  uncertainRate: number;
  /** Gesetzt, wenn dieser Durchlauf nicht bewertet werden konnte. */
  error?: string;
}

/** Wie sauber eine Engine mit der Handy-Pipeline lief. */
export type PhoneEngineHealth = 'ok' | 'eingeschränkt' | 'fehler';

export interface PhoneEngineSummary {
  health: PhoneEngineHealth;
  /** Klartext-Hinweise (Abweichungen, Fehler, Besonderheiten). */
  issues: string[];
  runsOk: number;
  runsFailed: number;
  auc: SpreadSummary;
  pAuc: SpreadSummary;
  falseAlarmRate: SpreadSummary;
  detectionRate: SpreadSummary;
  uncertainRate: SpreadSummary;
  /** Kalibrierte Schwelle und Quoten über die Durchläufe (n = 0 ohne Kalibrierung). */
  threshold: SpreadSummary;
  calibFalseAlarmRate: SpreadSummary;
  calibDetectionRate: SpreadSummary;
  /** Referenz mit der besten / schlechtesten AUC (zeigt die Referenz-Abhängigkeit). */
  bestRef: { path: string; auc: number } | null;
  worstRef: { path: string; auc: number } | null;
}

export interface PhoneEngineResult {
  runs: PhoneRunResult[];
  summary: PhoneEngineSummary;
}

export interface PhoneSectionResult {
  key: string;
  machine: string;
  section: string;
  nNormal: number;
  nAbnormal: number;
  runsRequested: number;
  runsPlanned: number;
  /** Testmenge über alle Durchläufe gleich (siehe planPhoneProtocol). */
  testSetFixed: boolean;
  /** Testclips je Durchlauf (nach Kappung). */
  nTestNormal: number;
  nTestAbnormal: number;
  /** Je Berichtszeile (PhoneUnit.key): Engine bzw. GMIA-λ-Stufe. */
  perEngine: Partial<Record<string, PhoneEngineResult>>;
  /** Bereichsweite Hinweise (z. B. fehlende Abnormal-Clips). */
  notes: string[];
}

export interface PhoneProtocolResult {
  engines: EngineId[];
  /** Berichtszeilen in Reihenfolge (Engines, GMIA ggf. je λ-Stufe). */
  units: PhoneUnit[];
  /** Gewählte GMIA-λ-Stufen. */
  gmiaStages: GmiaLambdaStage[];
  clipAgg: ClipAggMode;
  runs: number;
  seed: number;
  maxTestPerClass: number;
  /** Kalibrier-Clips m je Durchlauf. */
  calibClips: number;
  /** Referenz aus k Clips. */
  refClips: number;
  /** Lage der Referenz-Clips. */
  refLayout: RefLayout;
  /** Schwellenregel, Faktor und z (wirksam nur bei m > 0). */
  calibRule: CalibRule;
  calibFactor: number;
  calibZ: number;
  confidenceThreshold: number;
  faultyThreshold: number;
  /** Aktive Handy-Stufen laut Einstellungen (pipelineSummary). */
  pipeline: string;
  sections: PhoneSectionResult[];
  /** Übersprungene Bereiche mit Grund. */
  skipped: Array<{ key: string; reason: string }>;
  /** Originale Abtastraten der gelesenen WAVs: Rate (Hz) → Anzahl Dateien. */
  sourceSampleRates: Record<string, number>;
  /** Laufweite Hinweise (z. B. 16-kHz-Vermerk). */
  notes: string[];
  /** Eine Zeile je geprüfter Paarung (Detail-Export). */
  details: PhoneClipRecord[];
  startedAt: number;
  finishedAt: number;
  totalClipsScored: number;
}

// ── Prüfung eines Clips wie am Handy ─────────────────────────────────────────

interface PhoneClipScore {
  raw: number;
  rawValid: boolean;
  capped: number;
  displayScore: number;
  status: PredClass;
  /** Frames, die das Cherry-Picking-Gate verworfen hat. */
  gateRejected: number;
  /** Alle Frames verworfen → ohne Gate neu bewertet (wie die Handy-Simulation). */
  gateFallback: boolean;
}

/**
 * Einen Clip gegen EINE Referenz prüfen. Frame-Schleife wie scoreClip im
 * AUC-Modus (classify je Frame, Rohwert + gedeckelter Wert), aber die Frames
 * laufen vorher durch eine FRISCHE LivePipeline wie bei einer Prüfung am Handy.
 * Angezeigter Score = Mittel der Frame-Scores (wie fingerprintScores in der
 * Handy-Simulation; bei einer einzigen Referenz identisch mit scoreAll), Urteil
 * über phoneVerdict mit beiden Schwellen.
 */
async function scorePhoneClip(
  engine: AnyDiagnosisEngine,
  fp: Fingerprint,
  refStats: RefStats | null,
  clip: DecodedClip,
  mode: ClipAggMode,
  thresholds: { confidence: number; faulty: number }
): Promise<PhoneClipScore> {
  const models = [fp.model];

  const run = async (
    transform: ((fv: FeatureVector) => FeatureVector | null) | null
  ): Promise<{ capped: number[]; raw: number[]; health: number[]; frames: number }> => {
    // Sequenz-Engines (Zeitmuster): Ringpuffer pro Clip zurücksetzen — genau
    // wie scoreClip in benchmark.ts.
    (engine as { resetSequenceState?: () => void }).resetSequenceState?.();
    const capped: number[] = [];
    const raw: number[] = [];
    const health: number[] = [];
    let frames = 0;
    const consume = (r: { healthScore: number; rawCosineSimilarity?: number }): void => {
      frames++;
      health.push(r.healthScore);
      capped.push(100 - r.healthScore);
      const sim = r.rawCosineSimilarity;
      if (typeof sim === 'number' && Number.isFinite(sim)) raw.push(1 - sim);
    };

    if (isAsyncEngine(engine)) {
      const win = Math.max(1, Math.round(YAMNET_WINDOW_SEC * clip.sampleRate));
      const hop = Math.max(1, Math.round(YAMNET_HOP_SEC * clip.sampleRate));
      if (clip.raw.length < win) {
        consume(await engine.classify(models, yamnetFrame(clip.raw, clip.sampleRate)));
      } else {
        for (let start = 0; start + win <= clip.raw.length; start += hop) {
          const chunk = clip.raw.subarray(start, start + win);
          consume(await engine.classify(models, yamnetFrame(chunk, clip.sampleRate)));
        }
      }
    } else {
      for (const feature of clip.features) {
        const fv = transform ? transform(feature) : feature;
        if (!fv) continue; // vom Cherry-Picking-Gate verworfen
        consume(engine.classify(models, { feature: fv, sampleRate: clip.sampleRate }));
      }
    }
    return { capped, raw, health, frames };
  };

  // YAMNet bewertet Rohaudio — die spektralen Handy-Stufen greifen dort nicht
  // (wie am Handy und in der Handy-Simulation).
  const live = isAsyncEngine(engine) ? null : new LivePipeline(refStats);
  let out = await run(live ? (fv) => live.process(fv).feature : null);
  let gateFallback = false;
  if (live && live.accepted === 0 && live.rejected > 0) {
    // Wie interactive.ts: alle Frames transient → ohne Gate bewerten.
    out = await run(null);
    gateFallback = true;
  }

  const rawValid = out.frames > 0 && out.raw.length === out.frames;
  let display = NaN;
  if (out.health.length > 0) {
    let sum = 0;
    for (const h of out.health) sum += h;
    display = sum / out.health.length;
  }
  const verdict = phoneVerdict(
    [{ label: fp.label, type: 'healthy', score: Number.isFinite(display) ? display : 0 }],
    thresholds.confidence,
    thresholds.faulty
  );
  return {
    raw: rawValid ? clipAggregate(out.raw, mode) : NaN,
    rawValid,
    capped: clipAggregate(out.capped, mode),
    displayScore: Number.isFinite(display) ? Math.round(display * 10) / 10 : NaN,
    status: verdict.status,
    gateRejected: live?.rejected ?? 0,
    gateFallback,
  };
}

// ── Kennzahlen eines Durchlaufs ──────────────────────────────────────────────

interface RunBucket {
  labels: number[];
  raw: number[];
  capped: number[];
  status: PredClass[];
  rawAllValid: boolean;
  scoringErrors: number;
}

function emptyBucket(): RunBucket {
  return { labels: [], raw: [], capped: [], status: [], rawAllValid: true, scoringErrors: 0 };
}

/** AUC/pAUC + Schwellen-Quoten eines Durchlaufs (rein, exportiert für Tests). */
export function runMetrics(
  b: Pick<RunBucket, 'labels' | 'raw' | 'capped' | 'status' | 'rawAllValid'>
): Omit<
  PhoneRunResult,
  | 'run'
  | 'refPath'
  | 'refPaths'
  | 'calibPaths'
  | 'refSpan'
  | 'refQuality'
  | 'lambda'
  | 'conditionNumber'
  | 'calibRaw'
  | 'threshold'
  | 'calibFalseAlarmRate'
  | 'calibDetectionRate'
  | 'error'
> {
  const useRaw = b.rawAllValid && b.raw.length === b.labels.length && b.labels.length > 0;
  const metric = useRaw ? b.raw : b.capped;
  let nN = 0;
  let nA = 0;
  let nFaultyN = 0;
  let nFaultyA = 0;
  let nUncN = 0;
  let nUncA = 0;
  b.labels.forEach((l, i) => {
    const s = b.status[i];
    if (l === 1) {
      nA++;
      if (s === 'faulty') nFaultyA++;
      else if (s === 'uncertain') nUncA++;
    } else {
      nN++;
      if (s === 'faulty') nFaultyN++;
      else if (s === 'uncertain') nUncN++;
    }
  });
  const rate = (k: number, n: number): number => (n > 0 ? k / n : NaN);
  return {
    auc: nN > 0 && nA > 0 ? auc(b.labels, metric) : NaN,
    pAuc: nN > 0 && nA > 0 ? pAUC(b.labels, metric, 0.1) : NaN,
    scoreBasis: useRaw ? 'raw-cosine' : 'capped-score',
    nTestNormal: nN,
    nTestAbnormal: nA,
    falseAlarmRate: rate(nFaultyN, nN),
    detectionRate: rate(nFaultyA, nA),
    normalUncertainRate: rate(nUncN, nN),
    abnormalUncertainRate: rate(nUncA, nA),
    uncertainRate: rate(nUncN + nUncA, nN + nA),
  };
}

/**
 * Quoten mit der kalibrierten Schwelle (rein, exportiert für Tests): Anteil der
 * Normal- bzw. Abnormal-Clips, deren Rohwert über der Schwelle liegt. NaN ohne
 * Schwelle oder wenn ein Rohwert fehlt.
 */
export function calibratedRates(
  labels: number[],
  raw: number[],
  threshold: number
): { calibFalseAlarmRate: number; calibDetectionRate: number } {
  if (!Number.isFinite(threshold) || raw.some((v) => !Number.isFinite(v))) {
    return { calibFalseAlarmRate: NaN, calibDetectionRate: NaN };
  }
  let nN = 0;
  let nA = 0;
  let fN = 0;
  let fA = 0;
  labels.forEach((l, i) => {
    const flag = raw[i] > threshold;
    if (l === 1) {
      nA++;
      if (flag) fA++;
    } else {
      nN++;
      if (flag) fN++;
    }
  });
  return {
    calibFalseAlarmRate: nN > 0 ? fN / nN : NaN,
    calibDetectionRate: nA > 0 ? fA / nA : NaN,
  };
}

/** Engine-Zusammenfassung über alle Durchläufe (rein, exportiert für Tests). */
export function summarizeEngineRuns(runs: PhoneRunResult[], issues: string[]): PhoneEngineSummary {
  const ok = runs.filter((r) => !r.error);
  const failed = runs.length - ok.length;
  let best: { path: string; auc: number } | null = null;
  let worst: { path: string; auc: number } | null = null;
  for (const r of ok) {
    if (!Number.isFinite(r.auc)) continue;
    if (!best || r.auc > best.auc) best = { path: r.refPath, auc: r.auc };
    if (!worst || r.auc < worst.auc) worst = { path: r.refPath, auc: r.auc };
  }
  const allIssues = [...issues];
  if (failed > 0) allIssues.unshift(`${failed} von ${runs.length} Durchläufen fehlgeschlagen`);
  const health: PhoneEngineHealth =
    ok.length === 0 ? 'fehler' : allIssues.length > 0 ? 'eingeschränkt' : 'ok';
  return {
    health,
    issues: allIssues,
    runsOk: ok.length,
    runsFailed: failed,
    auc: summarize(ok.map((r) => r.auc)),
    pAuc: summarize(ok.map((r) => r.pAuc)),
    falseAlarmRate: summarize(ok.map((r) => r.falseAlarmRate)),
    detectionRate: summarize(ok.map((r) => r.detectionRate)),
    uncertainRate: summarize(ok.map((r) => r.uncertainRate)),
    threshold: summarize(ok.map((r) => r.threshold)),
    calibFalseAlarmRate: summarize(ok.map((r) => r.calibFalseAlarmRate)),
    calibDetectionRate: summarize(ok.map((r) => r.calibDetectionRate)),
    bestRef: best,
    worstRef: worst,
  };
}

// ── Läufer ───────────────────────────────────────────────────────────────────

const ENGINE_NAME: Record<EngineId, string> = {
  gmia: 'GMIA',
  'spectral-cosine': 'Spektral-Kosinus',
  yamnet: 'YAMNet',
  temporal: 'Zeitmuster',
};

/** Schlechteste Qualitätsbewertung mehrerer Referenz-Clips. */
function worstRating(ratings: QualityResult['rating'][]): QualityResult['rating'] {
  if (ratings.includes('BAD')) return 'BAD';
  if (ratings.includes('OK')) return 'OK';
  return 'GOOD';
}

interface TrainedRef {
  fp: Fingerprint;
  refStats: RefStats | null;
}

/**
 * Handy-Protokoll über alle Bereiche des Datensatzes ausführen. Strikt lesend:
 * Fingerprints leben nur in diesem Funktionsaufruf.
 */
export async function runPhoneProtocol(
  dataset: ParsedDataset,
  resolve: (path: string) => ClipSource,
  options: PhoneProtocolOptions
): Promise<PhoneProtocolResult> {
  const startedAt = Date.now();
  const signal = options.signal;
  const clipAgg = options.clipAgg ?? CLIP_AGG_DEFAULT;
  const runsRequested = Math.max(1, Math.floor(options.runs ?? PHONE_PROTOCOL_DEFAULTS.runs));
  const seed = options.seed ?? PHONE_PROTOCOL_DEFAULTS.seed;
  const maxTestPerClass = Math.max(0, Math.floor(options.maxTestPerClass ?? 0));
  const calibClips = Math.min(
    CALIB_CLIPS_MAX,
    Math.max(0, Math.floor(options.calibClips ?? PHONE_PROTOCOL_DEFAULTS.calibClips))
  );
  const refClips = Math.min(
    REF_CLIPS_MAX,
    Math.max(1, Math.floor(options.refClips ?? PHONE_PROTOCOL_DEFAULTS.refClips))
  );
  const refLayout: RefLayout = options.refLayout ?? PHONE_PROTOCOL_DEFAULTS.refLayout;
  const calib: CalibParams = {
    rule: options.calibRule ?? PHONE_PROTOCOL_DEFAULTS.calibRule,
    factor: options.calibFactor ?? PHONE_PROTOCOL_DEFAULTS.calibFactor,
    z: options.calibZ ?? PHONE_PROTOCOL_DEFAULTS.calibZ,
  };
  const settings = getRecordingSettings();
  const thresholds = { confidence: settings.confidenceThreshold, faulty: settings.faultyThreshold };
  // Spektrale Handy-Stufen aktiv? Dann weicht YAMNet (Rohaudio) davon ab.
  const spectralStagesActive = getCherryPickSettings().enabled || getRoomCompSettings().enabled;

  // Originale Abtastrate aus dem WAV-Kopf mitschreiben, BEVOR dekodiert wird
  // (decodeAudioData rechnet auf die Kontextrate um).
  const rateCounts = new Map<number, number>();
  const seenRate = new Set<string>();
  const sniffing = (path: string): ClipSource => {
    const src = resolve(path);
    return {
      read: async () => {
        const bytes = await src.read();
        if (!seenRate.has(path)) {
          seenRate.add(path);
          const rate = wavSampleRate(bytes);
          const k = Number.isFinite(rate) ? rate : 0;
          rateCounts.set(k, (rateCounts.get(k) ?? 0) + 1);
        }
        return bytes;
      },
    };
  };

  let ctx: AudioContext | null = null;
  const decode = async (path: string): Promise<DecodedClip> => {
    if (options.decode) return options.decode(sniffing(path));
    ctx ??= await makeAudioContext();
    return decodeClip(ctx, sniffing(path));
  };

  // Berichtszeilen: jede Engine einmal, GMIA je gewählter λ-Stufe. Die
  // Standard-Stufe trainiert exakt wie die App (λ = 10^9); alle GMIA-Zeilen
  // schreiben zusätzlich die Konditionszahl mit (ändert das Modell nicht).
  const gmiaStages: GmiaLambdaStage[] =
    options.gmiaStages && options.gmiaStages.length > 0 ? options.gmiaStages : ['standard'];
  const units: PhoneUnit[] = [];
  const engines = new Map<string, AnyDiagnosisEngine>();
  for (const id of options.engines) {
    if (id === 'gmia') {
      for (const stage of gmiaStages) {
        const unit = gmiaStageUnit(stage);
        if (engines.has(unit.key)) continue;
        units.push(unit);
        engines.set(
          unit.key,
          new GmiaEngine(
            stage === 'standard'
              ? { computeCondition: true }
              : { relativeAlpha: stage, computeCondition: true }
          )
        );
      }
    } else {
      units.push({ key: id, engineId: id, label: ENGINE_NAME[id] });
      engines.set(id, getEngine(id));
    }
  }
  const unitEngineId = new Map(units.map((u) => [u.key, u.engineId]));
  for (const engine of engines.values()) {
    if (isAsyncEngine(engine)) {
      options.onProgress?.({
        phase: 'init',
        sectionKey: '',
        filesDone: 0,
        filesTotal: 0,
        message: 'Lade YAMNet-Modell (einmalig)…',
      });
      await engine.init();
    }
  }

  // Planung + Fortschritts-Gesamtzahl (Referenzen + eindeutige Testclips).
  const plans: PhoneSectionPlan[] = dataset.sections.map((s) =>
    planPhoneProtocol(s, {
      runs: runsRequested,
      seed,
      maxTestPerClass,
      calibClips,
      refClips,
      refLayout,
    })
  );
  let filesTotal = 0;
  for (const p of plans) {
    if (p.skipped) continue;
    const scored = new Set<string>();
    for (const r of p.runs)
      for (const t of [...r.testNormal, ...r.testAbnormal, ...r.calibPaths]) scored.add(t);
    filesTotal += p.runs.length * refClips + scored.size;
  }

  let filesDone = 0;
  let totalClipsScored = 0;
  const sections: PhoneSectionResult[] = [];
  const skipped: Array<{ key: string; reason: string }> = [];
  const details: PhoneClipRecord[] = [];

  try {
    for (const plan of plans) {
      throwIfAborted(signal);
      if (plan.skipped) {
        skipped.push({ key: plan.key, reason: plan.skipped });
        continue;
      }

      const sectionNotes: string[] = [];
      if (plan.abnormals.length === 0) {
        sectionNotes.push('keine Abnormal-Clips — AUC nicht berechenbar, nur Fehlalarmquote');
      }
      if (!plan.testSetFixed && (calibClips > 0 || refClips > 1 || maxTestPerClass > 0)) {
        sectionNotes.push(
          'Testmenge nicht fest: keine übrigen Normal-Clips für Referenz/Kalibrierung — ' +
            'sie werden je Durchlauf aus dem Test herausgenommen'
        );
      }
      if (plan.runs.length < plan.runsRequested) {
        sectionNotes.push(
          `nur ${plan.runs.length} statt ${plan.runsRequested} Durchläufe (so viele Normal-Clips gibt es)`
        );
      }

      // ── 1+2: Jede Referenz einzeln anlernen, wie am Handy ──────────────────
      const trained = new Map<string, TrainedRef | { error: string }>(); // `${run}|${engine}`
      const refQuality = new Map<number, QualityResult['rating'] | null>();
      const engineIssues = new Map<string, Set<string>>();
      for (const id of engines.keys()) engineIssues.set(id, new Set());

      for (const run of plan.runs) {
        throwIfAborted(signal);
        options.onProgress?.({
          phase: 'train',
          sectionKey: plan.key,
          filesDone,
          filesTotal,
          message: `Anlernen ${plan.key}: Referenz ${run.index + 1}/${plan.runs.length}`,
        });
        // k Referenz-Clips dekodieren; Handy-Vorverarbeitung JE CLIP (wie bei
        // einer Aufnahme), danach aneinanderhängen wie eine längere Aufnahme.
        // Bei k = 1 ist das exakt das bisherige Anlernen.
        const parts: DecodedClip[] = [];
        let decodeError = '';
        for (const refPath of run.refPaths) {
          try {
            parts.push(await decode(refPath));
          } catch (err) {
            decodeError = `Referenz nicht lesbar (${refPath}): ${err instanceof Error ? err.message : String(err)}`;
            logger.warn(`Mess-Labor (Handy-Protokoll): Referenz übersprungen (${refPath}):`, err);
            break;
          }
          filesDone++;
        }
        if (decodeError || parts.length === 0) {
          filesDone += run.refPaths.length - parts.length;
          for (const id of engines.keys())
            trained.set(`${run.index}|${id}`, { error: decodeError || 'Referenz nicht lesbar' });
          refQuality.set(run.index, null);
        } else {
          const pres = parts.map((c) => trainPipeline(c.features));
          refQuality.set(run.index, worstRating(pres.map((p) => p.quality.rating)));
          const processed = pres.flatMap((p) => p.features);
          const clip: DecodedClip =
            parts.length === 1
              ? parts[0]
              : {
                  features: parts.flatMap((c) => c.features),
                  raw: concatRaw(parts.map((c) => c.raw)),
                  sampleRate: parts[0].sampleRate,
                };
          const refStats = computeRefStats(processed);
          for (const [id, engine] of engines) {
            throwIfAborted(signal);
            const fp = await trainFingerprint(
              engine,
              clip,
              'healthy',
              'Referenz',
              plan.key,
              processed
            );
            trained.set(
              `${run.index}|${id}`,
              fp ? { fp, refStats } : { error: 'Anlernen fehlgeschlagen (siehe Konsole)' }
            );
          }
        }
        await yieldToUi();
      }

      // ── 3: Testclips einmal dekodieren, gegen jede passende Referenz prüfen ─
      // Jeder Clip wird einmal dekodiert und gegen jeden Durchlauf bewertet, in
      // dem er Test- ODER Kalibrier-Clip ist (Rollen schließen sich je
      // Durchlauf aus, siehe planPhoneProtocol).
      const runsOfClip = new Map<string, Array<{ run: number; calib: boolean }>>();
      const abnormalSet = new Set(plan.abnormals);
      const addRole = (p: string, run: number, isCalib: boolean): void => {
        const list = runsOfClip.get(p) ?? [];
        list.push({ run, calib: isCalib });
        runsOfClip.set(p, list);
      };
      for (const run of plan.runs) {
        for (const p of [...run.testNormal, ...run.testAbnormal]) addRole(p, run.index, false);
        for (const p of run.calibPaths) addRole(p, run.index, true);
      }
      const buckets = new Map<string, RunBucket>(); // `${run}|${engine}`
      const calibRaw = new Map<string, number[]>(); // `${run}|${engine}` → Rohwerte
      const detailIdx = new Map<string, number[]>(); // `${run}|${engine}` → details-Indizes
      for (const run of plan.runs)
        for (const id of engines.keys()) {
          buckets.set(`${run.index}|${id}`, emptyBucket());
          calibRaw.set(`${run.index}|${id}`, []);
          detailIdx.set(`${run.index}|${id}`, []);
        }
      const gateStats = new Map<string, { rejected: number; fallbacks: number }>();
      let decodeFailures = 0;

      const testPaths = [...runsOfClip.keys()].sort();
      for (const path of testPaths) {
        throwIfAborted(signal);
        options.onProgress?.({
          phase: 'score',
          sectionKey: plan.key,
          filesDone,
          filesTotal,
          message: `Prüfen ${plan.key}`,
        });
        let clip: DecodedClip | null = null;
        try {
          clip = await decode(path);
        } catch (err) {
          decodeFailures++;
          logger.warn(`Mess-Labor (Handy-Protokoll): Prüf-Clip übersprungen (${path}):`, err);
        }
        if (clip) {
          const label: 0 | 1 = abnormalSet.has(path) ? 1 : 0;
          for (const role of runsOfClip.get(path) ?? []) {
            const runIdx = role.run;
            throwIfAborted(signal);
            for (const [id, engine] of engines) {
              const ref = trained.get(`${runIdx}|${id}`);
              const bucket = buckets.get(`${runIdx}|${id}`);
              if (!ref || 'error' in ref || !bucket) continue;
              try {
                const s = await scorePhoneClip(
                  engine,
                  ref.fp,
                  ref.refStats,
                  clip,
                  clipAgg,
                  thresholds
                );
                if (role.calib) {
                  // Kalibrier-Clip: nur der Rohwert zählt (wie für die AUC).
                  calibRaw.get(`${runIdx}|${id}`)?.push(s.raw);
                  continue;
                }
                if (!Number.isFinite(s.capped)) {
                  bucket.scoringErrors++;
                  continue;
                }
                bucket.labels.push(label);
                bucket.raw.push(s.raw);
                bucket.capped.push(s.capped);
                bucket.status.push(s.status);
                if (!s.rawValid || !Number.isFinite(s.raw)) bucket.rawAllValid = false;
                const g = gateStats.get(id) ?? { rejected: 0, fallbacks: 0 };
                g.rejected += s.gateRejected;
                if (s.gateFallback) g.fallbacks++;
                gateStats.set(id, g);
                detailIdx.get(`${runIdx}|${id}`)?.push(details.length);
                details.push({
                  sectionKey: plan.key,
                  engine: unitEngineId.get(id) ?? 'gmia',
                  unit: id,
                  run: runIdx,
                  refPath: plan.runs[runIdx].refPaths.join(' + '),
                  testPath: path,
                  label,
                  raw: s.raw,
                  capped: s.capped,
                  displayScore: s.displayScore,
                  status: s.status,
                  threshold: NaN,
                  calibFlag: null,
                });
              } catch (err) {
                bucket.scoringErrors++;
                logger.warn(
                  `Mess-Labor (Handy-Protokoll): Prüfung fehlgeschlagen (${id}/${path}):`,
                  err
                );
              }
            }
            if ([...engines.values()].some(isAsyncEngine)) await yieldToUi();
          }
          totalClipsScored++;
        }
        filesDone++;
        await yieldToUi();
      }
      if (decodeFailures > 0)
        sectionNotes.push(`${decodeFailures} Prüf-Clip(s) nicht lesbar — übersprungen`);

      // ── 4+5: Kennzahlen je Durchlauf, Zusammenfassung je Engine ─────────────
      const perEngine: PhoneSectionResult['perEngine'] = {};
      for (const [id, engine] of engines) {
        const issues = engineIssues.get(id) ?? new Set<string>();
        const runs: PhoneRunResult[] = [];
        let scoringErrors = 0;
        let cappedRuns = 0;
        let calibFailed = 0;
        const illConditioned: number[] = [];
        for (const run of plan.runs) {
          const key = `${run.index}|${id}`;
          const ref = trained.get(key);
          const bucket = buckets.get(key) ?? emptyBucket();
          scoringErrors += bucket.scoringErrors;
          const cal = calibRaw.get(key) ?? [];
          const threshold = calibClips > 0 ? calibrationThreshold(cal, calib) : NaN;
          const gm =
            ref && !('error' in ref) && unitEngineId.get(id) === 'gmia'
              ? (ref.fp.model as GMIAModel)
              : null;
          const conditionNumber = gm?.metadata?.conditionNumber ?? NaN;
          if (conditionNumber > GMIA_CONDITION_LIMIT) illConditioned.push(conditionNumber);
          const ident = {
            lambda: gm ? gm.regularization : NaN,
            conditionNumber,
            run: run.index,
            refPath: run.refPath,
            refPaths: run.refPaths,
            calibPaths: run.calibPaths,
            refSpan: run.refSpan,
            refQuality: refQuality.get(run.index) ?? null,
            calibRaw: cal,
            threshold,
          };
          if (!ref || 'error' in ref) {
            runs.push({
              ...runMetrics(emptyBucket()),
              ...calibratedRates([], [], NaN),
              ...ident,
              error: ref && 'error' in ref ? ref.error : 'nicht angelernt',
            });
            continue;
          }
          if (calibClips > 0 && !Number.isFinite(threshold)) calibFailed++;
          // Detail-Zeilen um Schwelle + kalibriertes Urteil ergänzen.
          for (const i of detailIdx.get(key) ?? []) {
            details[i].threshold = threshold;
            details[i].calibFlag = calibratedFlag(details[i].raw, threshold);
          }
          const rates = calibratedRates(bucket.labels, bucket.raw, threshold);
          if (bucket.labels.length === 0) {
            runs.push({
              ...runMetrics(bucket),
              ...rates,
              ...ident,
              error: 'kein Testclip bewertbar',
            });
            continue;
          }
          const m = runMetrics(bucket);
          if (m.scoreBasis === 'capped-score') cappedRuns++;
          runs.push({ ...m, ...rates, ...ident });
        }
        if (illConditioned.length > 0) {
          issues.add(
            `Konditionszahl von XᵀX + λI in ${illConditioned.length} Durchlauf/Durchläufen über ` +
              `${GMIA_CONDITION_LIMIT.toExponential(0)} (bis ${Math.max(...illConditioned).toExponential(1)}) ` +
              '— Lösung numerisch unsicher, Ergebnis mit Vorsicht lesen'
          );
        }
        if (calibFailed > 0) {
          issues.add(
            calib.rule === 'mean-z' && calibClips < CALIB_MEAN_Z_MIN
              ? `Regel „Mittel + z · σ“ braucht mindestens ${CALIB_MEAN_Z_MIN} Kalibrier-Clips — keine kalibrierte Schwelle`
              : `Kalibrierte Schwelle in ${calibFailed} Durchlauf/Durchläufen nicht bestimmbar (Rohwert fehlte)`
          );
        }

        if (scoringErrors > 0)
          issues.add(`${scoringErrors} Prüfung(en) fehlgeschlagen oder ohne Frames`);
        if (cappedRuns > 0) {
          issues.add(
            `Rohwert fehlte in ${cappedRuns} Durchlauf/Durchläufen — AUC dort auf dem gedeckelten Score (Gleichstände möglich)`
          );
        }
        const g = gateStats.get(id);
        if (g && g.fallbacks > 0) {
          issues.add(
            `${g.fallbacks}× alle Frames vom Cherry-Picking verworfen — ohne Gate bewertet`
          );
        }
        if (unitEngineId.get(id) === 'temporal' && g && g.rejected > 0) {
          issues.add(
            `Cherry-Picking hat ${g.rejected} Frames aus den Prüfungen entfernt — die Zeitmuster-Sequenz ist dort lückenhaft`
          );
        }
        if (isAsyncEngine(engine) && spectralStagesActive) {
          issues.add(
            'YAMNet bewertet Rohaudio in ≈1-s-Fenstern — Cherry-Picking und Raumkompensation wirken hier nicht (wie am Handy)'
          );
        }
        perEngine[id] = { runs, summary: summarizeEngineRuns(runs, [...issues]) };
      }

      const first = plan.runs[0];
      sections.push({
        key: plan.key,
        machine: plan.machine,
        section: plan.section,
        nNormal: plan.normals.length,
        nAbnormal: plan.abnormals.length,
        runsRequested: plan.runsRequested,
        runsPlanned: plan.runs.length,
        testSetFixed: plan.testSetFixed,
        nTestNormal: first?.testNormal.length ?? 0,
        nTestAbnormal: first?.testAbnormal.length ?? 0,
        perEngine,
        notes: sectionNotes,
      });
    }
  } finally {
    if (ctx) {
      try {
        await (ctx as AudioContext).close();
      } catch {
        /* ignore */
      }
    }
  }

  const sourceSampleRates: Record<string, number> = {};
  for (const [rate, n] of [...rateCounts.entries()].sort((a, b) => a[0] - b[0])) {
    sourceSampleRates[rate > 0 ? String(rate) : 'unbekannt'] = n;
  }
  const notes: string[] = [];
  const low = [...rateCounts.entries()].filter(([r]) => r > 0 && r < 48000);
  if (low.length > 0) {
    const desc = low.map(([r, n]) => `${n}× ${(r / 1000).toLocaleString('de-DE')} kHz`).join(', ');
    notes.push(
      `Abtastrate unter 48 kHz (${desc}): wie im AUC-Modus beim Dekodieren auf die ` +
        `Kontextrate (48 kHz) umgerechnet. Nutzinhalt reicht nur bis zur halben Originalrate ` +
        `(bei 16 kHz: 8 kHz); darüber liegen leere Bänder.`
    );
  }
  if (options.engines.includes('gmia') && gmiaStages.some((st) => st !== 'standard')) {
    notes.push(
      'GMIA-λ-Stufen: „GMIA“ = Standard der App (λ = 10^9, praktisch Mittelwert-Vergleich); ' +
        '„GMIA α=…“ = relatives λ = α · Spur(XᵀX) / N je Training. Anlernen sonst wie die App ' +
        '(Selbsttest, Baseline, Skalierung).'
    );
  }
  if (engines.has('temporal')) {
    notes.push(
      'Zeitmuster: in der Handy-Simulation bisher nicht angeboten. Hier über classify() je ' +
        'Frame mit resetSequenceState() je Clip (wie im AUC-Modus); angezeigter Score = Mittel der Frame-Scores.'
    );
  }

  return {
    engines: options.engines,
    units,
    gmiaStages,
    clipAgg,
    runs: runsRequested,
    seed,
    maxTestPerClass,
    calibClips,
    refClips,
    refLayout,
    calibRule: calib.rule,
    calibFactor: calib.factor,
    calibZ: calib.z,
    confidenceThreshold: thresholds.confidence,
    faultyThreshold: thresholds.faulty,
    pipeline: pipelineSummary(),
    sections,
    skipped,
    sourceSampleRates,
    notes,
    details,
    startedAt,
    finishedAt: Date.now(),
    totalClipsScored,
  };
}

export { ENGINE_NAME };
