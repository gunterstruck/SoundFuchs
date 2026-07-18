/**
 * ZANOBOT - Temporal Engine (Tier 2 — vierte Engine)
 *
 * Für nicht-stationäre, bewegte und transiente Geräusche (Ventile, Pressen,
 * Rampen, Abschreit-Aufnahmen). Konzept: docs/TIER2_TEMPORAL_ENGINE_KONZEPT.md.
 *
 * Kernidee — Zeit behalten statt mitteln:
 *
 *  1. Referenz = zeitlich geordnete FRAME-BANK (keine Mittelwert-Signatur µ).
 *  2. Pro Live-Frame eine kNN-Anomalie a(t) = 1 − meanTopK cos(f_t, Bank)
 *     (energie-gewichtet, scale-frei — derselbe Wirkmechanismus wie
 *     GMIA/Spektral-Cosine, nur pro Frame statt einmal).
 *  3. Die Anomalie-ZEITREIHE eines gleitenden Fensters wird deviation-/max-
 *     bewusst aggregiert statt gemittelt:
 *       A_mean = Mittel der Anomalien           (stabile Struktur)
 *       A_max  = Mittel des obersten Dezils     (Transienten! — Temporal-Max,
 *                arXiv:2603.13749: Valve ~54 % AUC mit Mean vs. bis 99,9 %
 *                mit Transienten-Erhalt)
 *       A_rdp  = deviation-gewichtetes Mittel   (RDP, arXiv:2603.04605)
 *       A      = DMM-Fusion (Mittel der drei, parameterfrei, AdaBEAM-Stil)
 *  4. Score = 100·tanh(C·(1−A))², baseline-normiert wie GMIA.
 *
 * Kalibrierung: Leave-One-Neighborhood-Out auf der Bank — jedes Bank-Frame
 * wird ohne sich selbst UND ohne seine zeitlichen Nachbarn gescort. Das
 * verhindert die künstlich winzige Trainings-Streuung durch überlappende
 * Fenster (Lehre aus dem Tier-0-Pivot §3.2).
 *
 * Sequenz-Zustand: Die Engine hält pro Modell einen Ringpuffer der letzten
 * Frame-Ähnlichkeiten (WeakMap). Er setzt sich automatisch zurück, wenn
 * zwischen zwei Frames > SESSION_GAP_MS liegen (neue Diagnose-Session) —
 * kein Eingriff in die Echtzeitschleife nötig. Batch-Läufer (Mess-Labor)
 * rufen zusätzlich resetSequenceState() pro Clip auf.
 *
 * SCHUTZ DES BESTEHENDEN: rein additiv. GMIA, Spektral-Cosine, YAMNet und
 * die Echtzeitschleife sind unangetastet; die Engine ist nur über den
 * Settings-Umschalter für NEUE Referenzen wählbar.
 */

import type { DiagnosisEngine, FrameInput, TrainInput } from './types.js';
import type { ReferenceModel, TemporalModel, DiagnosisResult } from '@data/types.js';
import type { WorkPointScore } from '../scoring.js';
import { calculateConfidenceFromScore, generateMulticlassHint } from '../scoring.js';
import { cosineSimilarity, vectorMagnitude } from '../mathUtils.js';
import { scoreFromCosine, energyGate } from './SpectralCosineEngine.js';
import {
  buildEventBank,
  matchEvent,
  noveltyThreshold,
  noveltyBackground,
  EVENT_KNOWN_COS,
  NOVELTY_FLOOR,
} from './temporalEvents.js';
import {
  buildCycleTemplate,
  scoreCycleWindow,
  frameRmsSeries,
  CYCLE_MIN_LIVE_SAMPLES,
  type CycleTemplate,
} from './temporalCycle.js';
import { DEFAULT_DSP_CONFIG } from '../../dsp/features.js';
import { getRecordingSettings } from '@utils/recordingSettings.js';
import { logger } from '@utils/logger.js';

/** Ziel-Selbst-Score der Referenz (GMIA-Konvention, 0.9 = 90 %). */
const TARGET_SELF_SCORE = 0.9;

/** kNN-Nachbarn pro Frame (klein, wie Spektral-Cosine — Briefing §17.2). */
const KNN_K = 5;

/** Max. Bank-Größe: Trainings-Frames werden gleichmäßig darauf subsampled. */
const MAX_BANK = 96;

/**
 * Leave-One-Neighborhood-Out: beim Selbsttest werden zusätzlich zum Frame
 * selbst die ±N zeitlichen Bank-Nachbarn ausgeschlossen (Überlappungs-
 * Korrelation der 66-ms-Hop-Fenster).
 */
const LONO_NEIGHBORS = 1;

/** Sequenzfenster der Aggregation in Frames (~10 s bei 3 Frames/s Echtzeit). */
const SEQ_WINDOW = 30;

/** Anteil des obersten Anomalie-Dezils für A_max (bei 30 Frames → Top 3). */
const TOP_FRACTION = 0.1;

/** Frames bis die Aggregation greift (davor Mittel über das Vorhandene). */
const MIN_SEQ_FRAMES = 3;

/** Lücke zwischen zwei Frames, ab der eine neue Session angenommen wird. */
const SESSION_GAP_MS = 2000;

// ── T3 Ereignis-Pfad (T2-a2, Konzept §4.4) ────────────────────────────────

/** Mindest-Referenzrate, ab der der Dichte-Wächter aktiv ist (Takte/min). */
const DENSITY_MIN_EXPECTED_PER_MIN = 30;

/** Mindest-Beobachtungsdauer, bevor die Dichte bewertet wird (Sekunden). */
const DENSITY_MIN_ELAPSED_SEC = 8;

/** "Fehlender Takt" (Batch/Labor, Kadenz = Trainings-Hop): Rate < 1/3 der Referenz. */
const DENSITY_MISSING_RATIO = 1 / 3;

/**
 * "Fehlender Takt" im LIVE-Betrieb: strenger (Rate < 1/8 UND höchstens ein
 * Ereignis). Live-Frames (~330 ms, nicht überlappend) unterzählen schnelle
 * Takte systematisch — der Live-Befund behauptet deshalb nur den praktisch
 * völlig ausgebliebenen Takt, nicht graduelle Abweichungen.
 */
const DENSITY_MISSING_RATIO_LIVE = 1 / 8;
const DENSITY_MISSING_MAX_EVENTS_LIVE = 1;

/** "Deutlich mehr Ereignisse": über dem 3-Fachen von max(Referenz, 20)/min. */
const DENSITY_EXCESS_RATIO = 3;

/**
 * Frame-Abstände darunter gelten als Batch-Verarbeitung (Mess-Labor spielt
 * Hop-gerasterte Frames ohne Echtzeit ab) — die Beobachtungsdauer wird dann
 * aus Frame-Anzahl × Trainings-Hop gerechnet statt aus der Wanduhr.
 */
const BATCH_DELTA_MS = 50;

/** Ereignisse, die für die UI-Zeitleiste vorgehalten werden. */
const EVENTS_UI_KEEP = 20;

/** Novelty-Historie, bevor Live-Onsets erkannt werden (adaptive Schwelle). */
const NOVELTY_MIN_HISTORY = 5;

/** Ein Ereignis auf der UI-Zeitleiste (Zeitstempel + bekannt/anomal). */
export interface TimelineEvent {
  at: number; // Date.now()-Zeitstempel
  similarity: number; // beste Cosine zur Ereignis-Bank
  known: boolean; // ≥ EVENT_KNOWN_COS → grauer Marker, sonst rot
}

/** Ereignis-Metadata der Diagnose (für die Expert-Zeitleiste). */
export interface TemporalEventsMetadata {
  events: TimelineEvent[];
  expectedRatePerMin: number;
  observedRatePerMin: number | null; // null, solange das Fenster zu kurz ist
  densityFinding: 'missing' | 'excess' | null;
}

/** Zyklus-Metadata der Diagnose (T4, für die Expert-Zeitleiste). */
export interface TemporalCycleMetadata {
  periodSec: number;
  /** z-Wert des DTW-Abstands (selbst-kalibriert); null bis genug Hüllkurve da ist. */
  dtwZ: number | null;
  anomaly: number;
}

/** Max. vorgehaltene Hüllkurven-Stützstellen (8 s Periode im 66-ms-Raster). */
const RMS_RING = 160;

/** Per-Modell-Sequenzzustand (lebt in der Engine-Instanz, nicht im Modell). */
interface SequenceState {
  similarities: number[]; // Ringpuffer der Frame-Ähnlichkeiten
  lastFrameAt: number; // Timestamp des letzten Frames (Auto-Reset)
  // T3 Ereignis-Pfad
  prevFeature: Float64Array | null; // letzter Frame für die Novelty
  novelties: number[]; // Ringpuffer (adaptive Onset-Schwelle)
  inEvent: boolean; // steigende-Flanke-Erkennung
  backgroundFeature: Float64Array | null; // letzter Nicht-Ereignis-Zustand
  events: TimelineEvent[]; // letzte Ereignisse (UI-Zeitleiste)
  sessionEventCount: number; // ALLE Ereignisse der Session (Dichte)
  frameCount: number; // Frames der Session (Batch-Dauer)
  firstFrameAt: number; // Sessionbeginn (Live-Dauer)
  batchDeltas: number; // Frame-Abstände < BATCH_DELTA_MS
  deltaCount: number; // gezählte Frame-Abstände
  rmsSeries: number[]; // Energie-Hüllkurve der Session (T4 Zyklus-Pfad)
}

function freshSequenceState(now: number): SequenceState {
  return {
    similarities: [],
    lastFrameAt: now,
    prevFeature: null,
    novelties: [],
    inEvent: false,
    backgroundFeature: null,
    events: [],
    sessionEventCount: 0,
    frameCount: 0,
    firstFrameAt: now,
    batchDeltas: 0,
    deltaCount: 0,
    rmsSeries: [],
  };
}

export class TemporalEngine implements DiagnosisEngine {
  readonly id = 'temporal' as const;

  /** Sequenzzustand pro Modell (WeakMap → räumt sich mit dem Modell auf). */
  private sequenceStates = new WeakMap<TemporalModel, SequenceState>();

  // ── Training ───────────────────────────────────────────────────────────

  train(input: TrainInput, machineId: string): ReferenceModel {
    const features = input.trainingData.featureVectors;
    if (features.length === 0) {
      throw new Error('Cannot train temporal model with empty feature set');
    }
    if (!features[0] || features[0].length === 0) {
      throw new Error('Invalid feature vector: first feature is empty or undefined');
    }

    const numSamples = features.length;
    const dim = features[0].length;

    // Zeitlich geordnete Bank: gleichmäßiges Subsampling PLUS Coverage-Pass.
    // Reines uniformes Subsampling kann durch Aliasing systematisch genau die
    // seltenen Ereignis-Frames (Klacks!) auslassen, wenn deren Periode mit dem
    // Subsample-Schritt zusammenfällt — dann wäre die Bank für Valve-artige
    // Maschinen blind. Der Coverage-Pass ergänzt gezielt die am schlechtesten
    // abgedeckten Trainings-Frames (per Unit-Test abgesichert).
    const bank = buildCoverageBank(features, MAX_BANK);

    // Mittelspektrum nur für Ghost-Overlay/Anzeige.
    const meanVec = new Float64Array(dim);
    for (const f of features) {
      for (let k = 0; k < dim; k++) meanVec[k] += f[k];
    }
    for (let k = 0; k < dim; k++) meanVec[k] /= numSamples;

    // LONO-Selbstähnlichkeiten: Frame i gegen die Bank ohne i±LONO_NEIGHBORS.
    const selfSims = bank.map((v, i) => frameSimilarity(v, bank, i));
    const muSim = meanOf(selfSims);
    if (!(muSim > 1e-6) || !isFinite(muSim)) {
      throw new Error(
        'Signal zu schwach oder inkonsistent für Training ' +
          `(mittlere LONO-kNN-Ähnlichkeit: ${muSim.toExponential(2)}).`
      );
    }

    // Kalibrierung auf der AGGREGIERTEN Ähnlichkeit: die Selbst-Anomalie-
    // Zeitreihe wird mit exakt derselben DMM/RDP-Formel aggregiert wie in
    // der Diagnose, damit Kennlinie und Baseline dieselbe Größe messen.
    const selfAnomalies = selfSims.map((s) => 1 - s);
    const aggSelfSim = 1 - aggregateAnomalies(selfAnomalies);
    const scalingConstant = Math.atanh(Math.sqrt(TARGET_SELF_SCORE)) / aggSelfSim;
    const baselineScore = scoreFromCosine(aggSelfSim, scalingConstant);

    const trainingRms = input.rawBuffer ? rmsOf(input.rawBuffer) : undefined;

    // T3 (T2-a2): Ereignis-Bank + erwartete Dichte aus derselben Sequenz.
    const config = input.trainingData.config;
    const frameRms = input.rawBuffer
      ? frameRmsSeries(input.rawBuffer, config.windowSize, config.hopSize, config.sampleRate)
      : undefined;
    const eventInfo = buildEventBank(features, config.hopSize, frameRms);

    // T4 (T2-a3): Zyklus-Template aus der Energie-Hüllkurve — nur wenn die
    // Referenz stabil zyklisch ist und genug volle Zyklen enthält.
    const cycle = frameRms ? buildCycleTemplate(frameRms, config.hopSize) : null;

    logger.info(
      `✅ Temporal model trained: N=${numSamples}, bank=${bank.length}, k=${KNN_K}, ` +
        `μsim(LONO)=${muSim.toFixed(4)}, aggSim=${aggSelfSim.toFixed(4)}, ` +
        `C=${scalingConstant.toFixed(4)}, baseline=${baselineScore.toFixed(1)}%, ` +
        `events=${eventInfo.eventCount} (bank=${eventInfo.events.length}, ` +
        `${eventInfo.eventRatePerMin.toFixed(1)}/min)` +
        (cycle ? `, cycle=${cycle.periodSec.toFixed(2)}s` : ', cycle=none')
    );

    const model: TemporalModel = {
      engineId: 'temporal',
      machineId,
      label: '', // vom Aufrufer gesetzt (2-Reference)
      type: 'healthy', // vom Aufrufer gesetzt
      bank: bank.map((v) => Array.from(v)),
      mean: Array.from(meanVec),
      scalingConstant,
      featureDimension: dim,
      sampleRate: input.trainingData.config.sampleRate,
      trainingDate: Date.now(),
      trainingDuration: input.trainingData.config.windowSize * numSamples,
      baselineScore,
      trainingRms,
      events: eventInfo.events,
      eventRatePerMin: Math.round(eventInfo.eventRatePerMin * 10) / 10,
      cycleEnvelope: cycle ? cycle.envelope : undefined,
      cyclePeriodSec: cycle ? Math.round(cycle.periodSec * 1000) / 1000 : undefined,
      metadata: {
        meanSimilarity: muSim,
        targetScore: TARGET_SELF_SCORE,
        bankSize: bank.length,
        eventCount: eventInfo.eventCount,
        cycleSelfDtwMean: cycle ? cycle.selfDtwMean : undefined,
        cycleSelfDtwStd: cycle ? cycle.selfDtwStd : undefined,
      },
    };
    return model;
  }

  // ── Diagnose ───────────────────────────────────────────────────────────

  classify(models: ReferenceModel[], frame: FrameInput): DiagnosisResult {
    const tModels = models.filter(isTemporal);
    if (tModels.length === 0) {
      throw new Error('No temporal reference models available for classification');
    }

    const f = frame.feature.features;
    let bestScore = -1;
    let bestSim = 0;
    let bestLabel = 'UNKNOWN';
    let bestModel: TemporalModel | null = null;
    let bestEvents: TemporalEventsMetadata | null = null;
    let bestCycle: TemporalCycleMetadata | null = null;

    for (const model of tModels) {
      if (f.length !== model.featureDimension) {
        logger.warn(
          `⚠️ Temporal feature dim mismatch (${f.length} vs ${model.featureDimension}) for "${model.label}"`
        );
        continue;
      }
      const { aggSim, score, events, cycle } = this.scoreModel(model, frame);
      if (score > bestScore) {
        bestScore = score;
        bestSim = aggSim;
        bestLabel = model.label;
        bestModel = model;
        bestEvents = events;
        bestCycle = cycle;
      }
    }

    const settings = getRecordingSettings();
    const uncertaintyThreshold = settings.confidenceThreshold;

    let status: DiagnosisResult['status'];
    if (bestModel === null || bestScore < uncertaintyThreshold) {
      status = 'uncertain';
      bestLabel = 'UNKNOWN';
    } else {
      status = bestModel.type;
    }

    const safeScore = bestScore < 0 ? 0 : bestScore;

    return {
      id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      machineId: bestModel?.machineId || tModels[0].machineId,
      timestamp: Date.now(),
      healthScore: Math.round(safeScore * 10) / 10,
      status,
      confidence: calculateConfidenceFromScore(safeScore),
      rawCosineSimilarity: Math.round(bestSim * 10000) / 10000, // aggregierte Sequenz-Ähnlichkeit
      metadata: {
        detectedState: bestLabel,
        multiclassMode: true,
        evaluatedModels: tModels.length,
        engineId: 'temporal',
        // T3 (T2-a2): Ereignisse + Dichte-Befund für die Expert-Zeitleiste.
        temporalEvents: bestEvents ?? undefined,
        // T4 (T2-a3): Zyklus-Status (DTW gegen das Referenz-Template).
        temporalCycle: bestCycle ?? undefined,
        // Debug-Block in GMIA-Form, damit die Expert-Ansicht funktioniert.
        debug: bestModel
          ? {
              weightMagnitude: 0,
              featureMagnitude: vectorMagnitude(frame.feature.features),
              magnitudeFactor: 1,
              cosine: bestSim,
              adjustedCosine: bestSim,
              scalingConstant: bestModel.scalingConstant,
              rawScore: safeScore,
            }
          : undefined,
      },
      analysis: {
        hint: generateMulticlassHint(safeScore, bestLabel, status),
      },
    };
  }

  scoreAll(models: ReferenceModel[], frame: FrameInput): WorkPointScore[] {
    const f = frame.feature.features;
    const scores: WorkPointScore[] = [];
    for (const model of models) {
      if (!isTemporal(model)) continue;
      if (f.length !== model.featureDimension) continue;
      const { score } = this.scoreModel(model, frame, /* updateState */ false);
      scores.push({
        label: model.label,
        score: Math.round(score * 10) / 10,
        isHealthy: model.type === 'healthy',
        trainingDate: model.trainingDate,
      });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores;
  }

  /**
   * Sequenzzustand aller Modelle verwerfen. Batch-Läufer (Mess-Labor) rufen
   * das pro Clip auf, damit keine Anomalien über Clip-Grenzen "lecken".
   * Im Echtzeitbetrieb genügt der Auto-Reset über SESSION_GAP_MS.
   */
  resetSequenceState(): void {
    this.sequenceStates = new WeakMap<TemporalModel, SequenceState>();
  }

  // ── Intern ─────────────────────────────────────────────────────────────

  /**
   * Ein Modell gegen den aktuellen Frame scoren: Frame-kNN-Ähnlichkeit in
   * den Sequenzpuffer schreiben, Anomalie-Zeitreihe DMM/RDP-aggregieren,
   * Kennlinie + Baseline + Energy-Gate anwenden.
   *
   * T3 (T2-a2): Zusätzlich Novelty-Onsets erkennen, gegen die Ereignis-Bank
   * klassifizieren (bekannt/anomal → Zeitleiste) und die Ereignisdichte
   * wachen. Ein FEHLENDER Takt (Ventil klackt nicht mehr) ist die Blindstelle
   * der Frame-kNN — jeder Einzel-Frame passt weiter zur Bank. Die Dichte-
   * Anomalie fließt deshalb per Max-Fusion in die aggregierte Anomalie ein
   * (Konzept §4.6: der schlechteste Aspekt zählt).
   *
   * @param updateState false für reine Anzeige-Pfade (scoreAll), damit der
   *        Ranking-Aufruf denselben Frame nicht doppelt in den Puffer schreibt.
   */
  private scoreModel(
    model: TemporalModel,
    frame: FrameInput,
    updateState: boolean = true
  ): {
    aggSim: number;
    score: number;
    events: TemporalEventsMetadata | null;
    cycle: TemporalCycleMetadata | null;
  } {
    const bank = getBankF64(model);
    const f = frame.feature.features;
    const sim = frameSimilarity(f, bank, -1);

    const now = Date.now();
    let state = this.sequenceStates.get(model);
    if (!state || now - state.lastFrameAt > SESSION_GAP_MS) {
      state = freshSequenceState(now);
      this.sequenceStates.set(model, state);
    }

    if (updateState) {
      this.trackEvents(model, state, f, frame.feature.rmsAmplitude, now);
      state.lastFrameAt = now;
    }

    // Fürs Ranking (scoreAll) nur lesen: aktuellen Frame temporär anhängen.
    const series = updateState ? state.similarities : [...state.similarities];
    series.push(sim);
    if (series.length > SEQ_WINDOW) series.shift();

    const anomalies = series.map((s) => 1 - s);
    let aggAnomaly =
      series.length >= MIN_SEQ_FRAMES ? aggregateAnomalies(anomalies) : meanOf(anomalies);

    // T3-Dichte + T4-Zyklus: Max-Fusion — der schlechteste Aspekt zählt (§4.6).
    const density = evaluateEventDensity(model, state, now);
    if (density !== null && density.anomaly > aggAnomaly) {
      aggAnomaly = density.anomaly;
    }
    const cycle = evaluateCycle(model, state, now);
    if (cycle !== null && cycle.anomaly > aggAnomaly) {
      aggAnomaly = cycle.anomaly;
    }
    const aggSim = 1 - aggAnomaly;

    const raw = scoreFromCosine(aggSim, model.scalingConstant);
    const calibrated = calibrateScore(raw, model.baselineScore);
    const score = energyGate(calibrated, model.trainingRms, frame.feature.rmsAmplitude);

    const events: TemporalEventsMetadata | null =
      model.events !== undefined
        ? {
            events: [...state.events],
            expectedRatePerMin: model.eventRatePerMin ?? 0,
            observedRatePerMin: density?.observedPerMin ?? null,
            densityFinding: density?.finding ?? null,
          }
        : null;
    return { aggSim, score, events, cycle };
  }

  /**
   * Novelty-Onset-Erkennung im Live-Strom (steigende Flanke über der
   * adaptiven Schwelle) + Klassifikation gegen die Ereignis-Bank.
   * Nur aktiv, wenn das Modell eine Ereignis-Bank trägt (T2-a2-Modelle);
   * ältere Temporal-Modelle laufen unverändert ohne Ereignis-Pfad.
   */
  private trackEvents(
    model: TemporalModel,
    state: SequenceState,
    f: Float64Array,
    rmsAmplitude: number | undefined,
    now: number
  ): void {
    if (state.frameCount > 0) {
      state.deltaCount++;
      if (now - state.lastFrameAt < BATCH_DELTA_MS) state.batchDeltas++;
    }
    state.frameCount++;

    // T4: Energie-Hüllkurve der Session (Zyklus-Pfad)
    if (typeof rmsAmplitude === 'number' && Number.isFinite(rmsAmplitude)) {
      state.rmsSeries.push(rmsAmplitude);
      if (state.rmsSeries.length > RMS_RING) state.rmsSeries.shift();
    }

    const prevBefore = state.prevFeature;
    const novelty = prevBefore ? 1 - cosineSimilarity(f, prevBefore) : 0;
    const fCopy = Float64Array.from(f);
    state.prevFeature = fCopy;
    state.novelties.push(novelty);
    if (state.novelties.length > SEQ_WINDOW) state.novelties.shift();

    if (model.events === undefined || state.novelties.length < NOVELTY_MIN_HISTORY) {
      state.backgroundFeature = fCopy;
      return;
    }

    // Spiegel der Batch-Logik in detectEvents: Onset = Novelty-Spitze UND
    // Unähnlichkeit zum letzten HINTERGRUND-Zustand (die Rückfall-Flanke
    // Klack→Brummen kehrt zum Hintergrund zurück und zählt nicht doppelt);
    // Ereignis-Ende zustandsbasiert (zurück beim Hintergrund).
    const threshold = noveltyThreshold(state.novelties);
    const awayFromBackground = state.backgroundFeature
      ? 1 - cosineSimilarity(f, state.backgroundFeature)
      : novelty;

    if (!state.inEvent) {
      if (novelty > threshold && awayFromBackground > threshold / 2) {
        // Onset: Ereignis öffnen und sofort klassifizieren (live kann nicht
        // auf Folge-Frames warten; der Onset-Frame trägt das Ereignis-Spektrum)
        state.inEvent = true;
        state.sessionEventCount++;
        const matchSim = matchEvent(f, model.events);
        state.events.push({
          at: now,
          similarity: Math.round(matchSim * 10000) / 10000,
          known: matchSim >= EVENT_KNOWN_COS,
        });
        if (state.events.length > EVENTS_UI_KEEP) state.events.shift();
      } else {
        state.backgroundFeature = fCopy;
      }
    } else if (awayFromBackground <= threshold / 2) {
      state.inEvent = false;
      state.backgroundFeature = fCopy;
    }
  }
}

// ── Reine Helfer (exportiert für Unit-Tests) ─────────────────────────────

function isTemporal(model: ReferenceModel): model is TemporalModel {
  return model.engineId === 'temporal';
}

/**
 * Frame-Ähnlichkeit: Mittel der Top-k Cosine-Ähnlichkeiten zur Bank.
 * excludeIndex ≥ 0 aktiviert Leave-One-Neighborhood-Out (Training):
 * Bank-Einträge im Bereich excludeIndex ± LONO_NEIGHBORS werden übersprungen.
 */
export function frameSimilarity(
  f: Float64Array,
  bank: Float64Array[],
  excludeIndex: number
): number {
  const sims: number[] = [];
  for (let i = 0; i < bank.length; i++) {
    if (excludeIndex >= 0 && Math.abs(i - excludeIndex) <= LONO_NEIGHBORS) continue;
    sims.push(cosineSimilarity(f, bank[i]));
  }
  if (sims.length === 0) return 0;
  sims.sort((a, b) => b - a);
  const k = Math.min(KNN_K, sims.length);
  let sum = 0;
  for (let i = 0; i < k; i++) sum += sims[i];
  return sum / k;
}

/**
 * DMM/RDP-Aggregation einer Anomalie-Zeitreihe (der Tier-2-Kern):
 *   A_mean — Mittel (stabile Struktur)
 *   A_max  — Mittel des obersten Dezils (Transienten-Erhalt, Temporal-Max)
 *   A_rdp  — deviation-gewichtetes Mittel (Relative Deviation Pooling)
 *   Fusion — parameterfreies Mittel der drei (DMM-Default aus AdaBEAM)
 */
export function aggregateAnomalies(anomalies: number[]): number {
  const n = anomalies.length;
  if (n === 0) return 0;
  if (n === 1) return anomalies[0];

  const aMean = meanOf(anomalies);

  // A_max: Mittel des obersten Dezils (mind. 1 Wert)
  const sorted = [...anomalies].sort((a, b) => b - a);
  const topCount = Math.max(1, Math.round(n * TOP_FRACTION));
  let topSum = 0;
  for (let i = 0; i < topCount; i++) topSum += sorted[i];
  const aMax = topSum / topCount;

  // A_rdp: Gewicht ∝ |a − median| (+ε, damit flache Reihen zum Mittel werden)
  const median = sorted[Math.floor(n / 2)];
  const EPS = 1e-6;
  let wSum = 0;
  let awSum = 0;
  for (const a of anomalies) {
    const w = Math.abs(a - median) + EPS;
    wSum += w;
    awSum += w * a;
  }
  const aRdp = awSum / wSum;

  return (aMean + aMax + aRdp) / 3;
}

/** Anteil der Bank, der gleichmäßig gezogen wird (Rest = Coverage-Pass). */
const UNIFORM_BANK_FRACTION = 0.8;

/**
 * Zeitlich geordnete Bank mit Coverage-Garantie:
 *  1. ~80 % der Plätze gleichmäßig über die Aufnahme (Trajektorie),
 *  2. ~20 % greedy an die Trainings-Frames vergeben, die von der bisherigen
 *     Bank am SCHLECHTESTEN abgedeckt sind (niedrigste Max-Cosine) —
 *     das sichert seltene Ereignis-Frames (transiente Klacks) gegen
 *     Subsampling-Aliasing. Ergebnis ist nach Original-Index sortiert
 *     (Reihenfolge = Trajektorie, wichtig für die LONO-Nachbarschaft).
 * Exportiert für Unit-Tests.
 */
export function buildCoverageBank(features: Float64Array[], cap: number): Float64Array[] {
  if (features.length <= cap) return features.map((f) => Float64Array.from(f));

  const uniformCount = Math.max(1, Math.floor(cap * UNIFORM_BANK_FRACTION));
  const chosen = new Set<number>();
  const step = features.length / uniformCount;
  for (let i = 0; i < uniformCount; i++) {
    chosen.add(Math.floor(i * step));
  }

  // Coverage-Pass: pro freiem Platz das am schlechtesten abgedeckte Frame.
  // maxSim[j] = beste Cosine von Frame j zur aktuellen Auswahl (inkrementell).
  const n = features.length;
  const maxSim = new Float64Array(n).fill(-1);
  for (let j = 0; j < n; j++) {
    if (chosen.has(j)) {
      maxSim[j] = 2; // eigene Auswahl nie erneut wählen
      continue;
    }
    for (const c of chosen) {
      const s = cosineSimilarity(features[j], features[c]);
      if (s > maxSim[j]) maxSim[j] = s;
    }
  }
  while (chosen.size < cap) {
    let worst = -1;
    let worstSim = 2;
    for (let j = 0; j < n; j++) {
      if (maxSim[j] < worstSim) {
        worstSim = maxSim[j];
        worst = j;
      }
    }
    if (worst < 0) break;
    chosen.add(worst);
    maxSim[worst] = 2;
    // Abdeckung inkrementell aktualisieren
    for (let j = 0; j < n; j++) {
      if (maxSim[j] >= 2) continue;
      const s = cosineSimilarity(features[j], features[worst]);
      if (s > maxSim[j]) maxSim[j] = s;
    }
  }

  return [...chosen]
    .sort((a, b) => a - b)
    .map((i) => Float64Array.from(features[i]));
}

/**
 * T3-Dichte-Wächter: beobachtete Ereignisrate gegen die Referenzrate.
 *
 * Beobachtungsdauer: im Batch-Betrieb (Mess-Labor, Frame-Abstände < 50 ms)
 * aus Frame-Anzahl × Trainings-Hop, live aus der Wanduhr. Der Wächter ist
 * bewusst konservativ:
 *  - aktiv erst ab DENSITY_MIN_ELAPSED_SEC Beobachtung und nur bei klarem
 *    Referenz-Takt (≥ 30 Ereignisse/min);
 *  - live gilt das strengere Kriterium (Takt praktisch ganz ausgeblieben),
 *    weil nicht überlappende ~330-ms-Frames schnelle Takte unterzählen;
 *  - Sicherheitsventil: liegt das Novelty-Grundrauschen selbst über dem
 *    Floor (Strom wechselt permanent den Zustand), ist die Onset-Zählung
 *    nicht aussagekräftig → kein "missing"-Befund.
 * "missing" hebt die Anomalie kontinuierlich an (0 an der Grenze, 1 bei
 * völligem Stillstand des Takts); "excess" ist nur ein Befund für die
 * Zeitleiste — zusätzliche fremde Ereignisse drückt bereits die
 * Frame-kNN-Anomalie.
 */
function evaluateEventDensity(
  model: TemporalModel,
  state: SequenceState,
  now: number
): { finding: 'missing' | 'excess' | null; observedPerMin: number | null; anomaly: number } | null {
  if (model.events === undefined || model.eventRatePerMin === undefined) return null;

  const batchLike = state.deltaCount >= 3 && state.batchDeltas / state.deltaCount > 0.5;
  const elapsedSec = batchLike
    ? state.frameCount * DEFAULT_DSP_CONFIG.hopSize
    : (now - state.firstFrameAt) / 1000;
  if (elapsedSec < DENSITY_MIN_ELAPSED_SEC) {
    return { finding: null, observedPerMin: null, anomaly: 0 };
  }

  const observedPerMin = (state.sessionEventCount / elapsedSec) * 60;
  const expected = model.eventRatePerMin;

  const onsetCountReliable = noveltyBackground(state.novelties) <= NOVELTY_FLOOR;
  if (expected >= DENSITY_MIN_EXPECTED_PER_MIN && onsetCountReliable) {
    const missingLimit =
      expected * (batchLike ? DENSITY_MISSING_RATIO : DENSITY_MISSING_RATIO_LIVE);
    const countOk = batchLike || state.sessionEventCount <= DENSITY_MISSING_MAX_EVENTS_LIVE;
    if (observedPerMin < missingLimit && countOk) {
      return {
        finding: 'missing',
        observedPerMin,
        anomaly: 1 - observedPerMin / missingLimit,
      };
    }
  }
  if (observedPerMin > Math.max(expected, 20) * DENSITY_EXCESS_RATIO) {
    return { finding: 'excess', observedPerMin, anomaly: 0 };
  }
  return { finding: null, observedPerMin, anomaly: 0 };
}

/**
 * T4-Zyklus-Bewertung: letzten Live-Zyklus (Hüllkurven-Fenster von genau
 * einer Periode) per DTW gegen das Referenz-Template. Inaktiv (anomaly 0,
 * dtwZ null), solange die Hüllkurve kürzer als eine Periode ist oder die
 * Kadenz zu grob auflöst (< CYCLE_MIN_LIVE_SAMPLES Stützstellen/Zyklus).
 */
function evaluateCycle(
  model: TemporalModel,
  state: SequenceState,
  now: number
): TemporalCycleMetadata | null {
  const periodSec = model.cyclePeriodSec;
  const envelope = model.cycleEnvelope;
  const selfMean = model.metadata?.cycleSelfDtwMean;
  if (periodSec === undefined || envelope === undefined || selfMean === undefined) return null;

  const inactive: TemporalCycleMetadata = { periodSec, dtwZ: null, anomaly: 0 };
  const batchLike = state.deltaCount >= 3 && state.batchDeltas / state.deltaCount > 0.5;
  const intervalSec = batchLike
    ? DEFAULT_DSP_CONFIG.hopSize
    : state.frameCount > 1
      ? (now - state.firstFrameAt) / 1000 / (state.frameCount - 1)
      : 0;
  if (intervalSec <= 0) return inactive;

  const samplesPerCycle = Math.round(periodSec / intervalSec);
  if (samplesPerCycle < CYCLE_MIN_LIVE_SAMPLES) return inactive; // Kadenz zu grob
  if (state.rmsSeries.length < samplesPerCycle) return inactive; // noch kein voller Zyklus

  const template: CycleTemplate = {
    envelope,
    periodSec,
    selfDtwMean: selfMean,
    selfDtwStd: model.metadata?.cycleSelfDtwStd ?? 0,
  };
  const window = state.rmsSeries.slice(-samplesPerCycle);
  const { z, anomaly } = scoreCycleWindow(window, template);
  return { periodSec, dtwZ: Math.round(z * 100) / 100, anomaly };
}

function meanOf(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function rmsOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
  return Math.sqrt(sumSq / samples.length);
}

/** Baseline-Normierung, identisch zur GMIA-/Spektral-Cosine-Konvention. */
function calibrateScore(rawScore: number, baselineScore?: number): number {
  if (baselineScore && baselineScore > 0) {
    return Math.min(100, (rawScore / baselineScore) * 100);
  }
  return rawScore;
}

/** Bank-Cache als Float64Array[] (keine Re-Allokation pro Frame). */
const bankCache = new WeakMap<TemporalModel, Float64Array[]>();

function getBankF64(model: TemporalModel): Float64Array[] {
  let cached = bankCache.get(model);
  if (!cached) {
    cached = model.bank.map((v) =>
      v instanceof Float64Array ? v : Float64Array.from(v)
    );
    bankCache.set(model, cached);
  }
  return cached;
}
