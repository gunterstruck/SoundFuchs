/**
 * Tests für die Temporal-Engine (Tier 2).
 *
 * Kernaussagen:
 * 1. Valve-Szenario: Eine NUR-transiente Anomalie (seltener Klack mit anderem
 *    Spektrum, Grundgeräusch identisch) wird von der Temporal-Engine klar
 *    erkannt, während der Mittelwert-Signatur-Ansatz sie kaum sieht —
 *    die Kernbehauptung des Tier-2-Konzepts (vgl. arXiv:2603.13749, MIMII).
 * 2. LONO-Kalibrierung liefert einen ehrlichen Baseline-Score (Quality-Gate).
 * 3. Sequenzzustand: resetSequenceState() und Session-Lücken-Auto-Reset.
 * 4. Robustheit: Dimensions-Mismatch wird übersprungen, leere Daten werfen.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  TemporalEngine,
  aggregateAnomalies,
  frameSimilarity,
  buildCoverageBank,
} from './TemporalEngine.js';
import type { TrainInput, FrameInput } from './types.js';
import type { FeatureVector, TrainingData, ReferenceModel } from '@data/types.js';
import { DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import { cosineSimilarity } from '../mathUtils.js';

const BINS = 64;
const SR = 48000;

/** Deterministischer Pseudo-Zufall (Mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Brumm-Grundspektrum (stationärer Anteil der Maschine). */
function humSpectrum(): number[] {
  const s = new Array<number>(BINS).fill(0.01);
  s[5] = 0.6;
  s[12] = 0.35;
  return s;
}

/** Klack A (normales Ereignis): Energieburst um Bin 30. */
function clackA(): number[] {
  const s = humSpectrum();
  s[30] = 0.9;
  s[31] = 0.5;
  return s;
}

/** Klack B (anomales Ereignis): gleicher Pegel, anderes Spektrum (Bin 45). */
function clackB(): number[] {
  const s = humSpectrum();
  s[45] = 0.9;
  s[46] = 0.5;
  return s;
}

/** Spektrum → Float64Array mit multiplikativem Jitter. */
function jittered(base: number[], rng: () => number, jitter = 0.1): Float64Array {
  const out = new Float64Array(BINS);
  let total = 0;
  for (let k = 0; k < BINS; k++) {
    out[k] = base[k] * (1 + jitter * (rng() * 2 - 1));
    total += out[k];
  }
  for (let k = 0; k < BINS; k++) out[k] /= total; // relative ESD (Σ = 1)
  return out;
}

/**
 * Valve-artige Sequenz: Brummen, jedes `period`-te Frame ist ein Klack.
 */
function valveSequence(
  count: number,
  clack: () => number[],
  seed: number,
  period = 10
): Float64Array[] {
  const rng = mulberry32(seed);
  const frames: Float64Array[] = [];
  for (let i = 0; i < count; i++) {
    frames.push(jittered(i % period === period - 1 ? clack() : humSpectrum(), rng));
  }
  return frames;
}

function makeTrainInput(features: Float64Array[]): TrainInput {
  const trainingData: TrainingData = {
    featureVectors: features,
    machineId: 'valve-test',
    recordingId: 'rec-valve',
    numSamples: features.length,
    config: { ...DEFAULT_DSP_CONFIG, sampleRate: SR, frequencyBins: BINS },
  };
  return { trainingData, sampleRate: SR };
}

function makeFrame(features: Float64Array, rmsAmplitude = 0.1): FrameInput {
  const fv: FeatureVector = {
    features,
    normalizedFeatures: features,
    absoluteFeatures: features,
    bins: BINS,
    frequencyRange: [0, SR / 2],
    rmsAmplitude,
  };
  return { feature: fv, sampleRate: SR };
}

/** Sequenz durch die Engine schicken; letzter Score = Voll-Fenster-Aggregat. */
function classifySequence(
  engine: TemporalEngine,
  models: ReferenceModel[],
  frames: Float64Array[]
): number {
  engine.resetSequenceState();
  let last = 0;
  for (const f of frames) {
    last = engine.classify(models, makeFrame(f)).healthScore;
  }
  return last;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TemporalEngine training', () => {
  it('trains a model with ordered bank and honest LONO baseline', () => {
    const engine = new TemporalEngine();
    const train = valveSequence(120, clackA, 1);
    const model = engine.train(makeTrainInput(train), 'valve-test');

    expect(model.engineId).toBe('temporal');
    if (model.engineId !== 'temporal') throw new Error('unreachable');
    expect(model.bank.length).toBeGreaterThan(0);
    expect(model.bank.length).toBeLessThanOrEqual(96);
    expect(model.featureDimension).toBe(BINS);
    // Baseline muss das Quality-Gate (≥ 75 %) passieren, aber nicht 100 sein
    expect(model.baselineScore!).toBeGreaterThanOrEqual(75);
    expect(model.baselineScore!).toBeLessThanOrEqual(100);
    expect(model.metadata?.meanSimilarity).toBeGreaterThan(0.5);
  });

  it('throws on empty training data', () => {
    const engine = new TemporalEngine();
    expect(() => engine.train(makeTrainInput([]), 'x')).toThrow();
  });
});

describe('Valve-Szenario: transiente Anomalie (Tier-2-Kernbehauptung)', () => {
  it('detects a transient-only anomaly that a mean-signature approach barely sees', () => {
    const engine = new TemporalEngine();
    const train = valveSequence(120, clackA, 2);
    const model = engine.train(makeTrainInput(train), 'valve-test');
    model.label = 'Referenz';
    model.type = 'healthy';

    // Gesunde Test-Sequenz: gleiches Muster (Klack A)
    const healthySeq = valveSequence(30, clackA, 3);
    // Anomale Test-Sequenz: NUR die Klacks sind anders (B statt A);
    // 27 von 30 Frames (das Brummen) sind identisch verteilt.
    const anomalousSeq = valveSequence(30, clackB, 4);

    const healthyScore = classifySequence(engine, [model], healthySeq);
    const anomalousScore = classifySequence(engine, [model], anomalousSeq);

    // Temporal-Engine: deutliche Trennung
    expect(healthyScore).toBeGreaterThan(80);
    expect(anomalousScore).toBeLessThan(healthyScore - 15);

    // Kontrolle Mittelwert-Ansatz: Cosine der SEQUENZ-MittelSpektren.
    // Da nur 3 von 30 Frames abweichen, ist die Mittel-Ähnlichkeit fast
    // identisch — genau der blinde Fleck, den Tier 2 schließt.
    const meanOfSeq = (seq: Float64Array[]): Float64Array => {
      const m = new Float64Array(BINS);
      for (const f of seq) for (let k = 0; k < BINS; k++) m[k] += f[k];
      for (let k = 0; k < BINS; k++) m[k] /= seq.length;
      return m;
    };
    const trainMean = meanOfSeq(train);
    const simHealthyMean = cosineSimilarity(meanOfSeq(healthySeq), trainMean);
    const simAnomalousMean = cosineSimilarity(meanOfSeq(anomalousSeq), trainMean);
    const meanGap = simHealthyMean - simAnomalousMean;

    // Der Mittelwert-Ansatz sieht fast nichts (Cosine-Lücke winzig) …
    expect(meanGap).toBeLessThan(0.02);
    // … während die Temporal-Engine ≥ 15 Score-Punkte trennt (oben geprüft).
  });

  it('scores a fully matching stationary-plus-clack sequence high (no false alarm)', () => {
    const engine = new TemporalEngine();
    const train = valveSequence(120, clackA, 5);
    const model = engine.train(makeTrainInput(train), 'valve-test');
    model.label = 'Referenz';
    model.type = 'healthy';

    const healthyScore = classifySequence(engine, [model], valveSequence(30, clackA, 6));
    expect(healthyScore).toBeGreaterThan(80);
  });
});

describe('Sequenzzustand', () => {
  it('resetSequenceState() clears the ring buffer between clips', () => {
    const engine = new TemporalEngine();
    const train = valveSequence(120, clackA, 7);
    const model = engine.train(makeTrainInput(train), 'valve-test');
    model.label = 'Referenz';
    model.type = 'healthy';

    // Anomale Sequenz verarbeiten → Puffer ist "verseucht"
    classifySequence(engine, [model], valveSequence(30, clackB, 8));

    // Nach Reset muss eine gesunde Sequenz wieder hoch scoren
    const healthyAfterReset = classifySequence(engine, [model], valveSequence(30, clackA, 9));
    expect(healthyAfterReset).toBeGreaterThan(80);
  });

  it('auto-resets after a session gap (> 2 s between frames)', () => {
    const engine = new TemporalEngine();
    const train = valveSequence(120, clackA, 10);
    const model = engine.train(makeTrainInput(train), 'valve-test');
    model.label = 'Referenz';
    model.type = 'healthy';

    let fakeNow = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => fakeNow);

    // Anomale Session (Frames im 330-ms-Takt)
    engine.resetSequenceState();
    for (const f of valveSequence(30, clackB, 11)) {
      engine.classify([model], makeFrame(f));
      fakeNow += 330;
    }

    // 5 s Pause → neue Session, alter Puffer darf nicht nachwirken
    fakeNow += 5000;
    let lastScore = 0;
    for (const f of valveSequence(30, clackA, 12)) {
      lastScore = engine.classify([model], makeFrame(f)).healthScore;
      fakeNow += 330;
    }
    expect(lastScore).toBeGreaterThan(80);
  });

  it('scoreAll does not mutate the sequence buffer (read-only ranking)', () => {
    const engine = new TemporalEngine();
    const train = valveSequence(120, clackA, 13);
    const model = engine.train(makeTrainInput(train), 'valve-test');
    model.label = 'Referenz';
    model.type = 'healthy';

    engine.resetSequenceState();
    const frame = makeFrame(valveSequence(1, clackA, 14)[0]);
    // Mehrfaches Ranking desselben Frames …
    engine.scoreAll([model], frame);
    engine.scoreAll([model], frame);
    // … dann classify: der Puffer darf erst 1 Frame enthalten (den von classify)
    const r = engine.classify([model], frame);
    expect(r.healthScore).toBeGreaterThan(0);
    // Indirekter Nachweis: gleicher Score wie bei frischer Engine (1-Frame-Fenster)
    const fresh = new TemporalEngine();
    const freshScore = fresh.classify([model], frame).healthScore;
    expect(r.healthScore).toBeCloseTo(freshScore, 5);
  });
});

describe('T3 Ereignis-Pfad (T2-a2)', () => {
  /** Nur-Brummen-Sequenz (Maschine läuft, aber der Takt fehlt). */
  function humSequence(count: number, seed: number): Float64Array[] {
    const rng = mulberry32(seed);
    return Array.from({ length: count }, () => jittered(humSpectrum(), rng));
  }

  /** Letztes DiagnosisResult einer Batch-Sequenz (schnelle Frame-Abstände). */
  function lastResult(
    engine: TemporalEngine,
    models: ReferenceModel[],
    frames: Float64Array[]
  ) {
    engine.resetSequenceState();
    let last = engine.classify(models, makeFrame(frames[0]));
    for (const f of frames.slice(1)) last = engine.classify(models, makeFrame(f));
    return last;
  }

  it('training stores an event bank and the expected rate for a valve reference', () => {
    const engine = new TemporalEngine();
    const model = engine.train(makeTrainInput(valveSequence(120, clackA, 20)), 'valve-test');
    if (model.engineId !== 'temporal') throw new Error('unreachable');

    // 12 Klacks auf 120 × 66 ms = 7,92 s → ~90,9/min; dedupliziert 1 Typ
    expect(model.events!.length).toBe(1);
    expect(model.metadata?.eventCount).toBe(12);
    expect(model.eventRatePerMin!).toBeGreaterThan(80);
    expect(model.eventRatePerMin!).toBeLessThan(100);
  });

  it('detects the MISSING beat (kNN blind spot): machine hums on, clacks stop', () => {
    const engine = new TemporalEngine();
    const model = engine.train(makeTrainInput(valveSequence(120, clackA, 21)), 'valve-test');
    model.label = 'Referenz';
    model.type = 'healthy';

    // 150 Frames Nur-Brummen im Batch-Takt (≈ 9,9 s) → Takt fehlt komplett
    const silentValve = humSequence(150, 22);
    const result = lastResult(engine, [model], silentValve);

    const meta = result.metadata?.temporalEvents as {
      densityFinding: string | null;
      observedRatePerMin: number | null;
    };
    expect(meta.densityFinding).toBe('missing');
    expect(meta.observedRatePerMin).toBe(0);
    // Dichte-Anomalie zieht den Score klar herunter …
    expect(result.healthScore).toBeLessThan(40);

    // … während die reine Frame-kNN (Modell OHNE Ereignis-Pfad) blind ist:
    // jedes Brumm-Frame passt zur Bank, der Score bliebe hoch.
    if (model.engineId !== 'temporal') throw new Error('unreachable');
    const blindModel = { ...model };
    delete blindModel.events;
    delete blindModel.eventRatePerMin;
    const blindEngine = new TemporalEngine();
    const blindScore = lastResult(blindEngine, [blindModel], silentValve).healthScore;
    expect(blindScore).toBeGreaterThan(80);
  });

  it('classifies live events as known (clack A) vs anomalous (clack B) for the timeline', () => {
    const engine = new TemporalEngine();
    const model = engine.train(makeTrainInput(valveSequence(120, clackA, 23)), 'valve-test');
    model.label = 'Referenz';
    model.type = 'healthy';

    const healthyMeta = lastResult(engine, [model], valveSequence(60, clackA, 24)).metadata
      ?.temporalEvents as { events: Array<{ known: boolean }> };
    expect(healthyMeta.events.length).toBeGreaterThanOrEqual(4);
    expect(healthyMeta.events.every((e) => e.known)).toBe(true);

    const anomalousMeta = lastResult(engine, [model], valveSequence(60, clackB, 25)).metadata
      ?.temporalEvents as { events: Array<{ known: boolean }> };
    expect(anomalousMeta.events.length).toBeGreaterThanOrEqual(4);
    expect(anomalousMeta.events.every((e) => !e.known)).toBe(true);
  });

  it('keeps a matching valve sequence free of density findings (no false alarm)', () => {
    const engine = new TemporalEngine();
    const model = engine.train(makeTrainInput(valveSequence(120, clackA, 26)), 'valve-test');
    model.label = 'Referenz';
    model.type = 'healthy';

    // 150 Frames gesunder Takt im Batch-Raster (≈ 9,9 s Beobachtung)
    const result = lastResult(engine, [model], valveSequence(150, clackA, 27));
    const meta = result.metadata?.temporalEvents as { densityFinding: string | null };
    expect(meta.densityFinding).toBeNull();
    expect(result.healthScore).toBeGreaterThan(80);
  });

  it('stays backward compatible with T2-a1 models without event fields', () => {
    const engine = new TemporalEngine();
    const model = engine.train(makeTrainInput(valveSequence(120, clackA, 28)), 'valve-test');
    model.label = 'Referenz';
    model.type = 'healthy';
    if (model.engineId !== 'temporal') throw new Error('unreachable');
    delete model.events;
    delete model.eventRatePerMin;

    const result = lastResult(engine, [model], valveSequence(30, clackA, 29));
    expect(result.healthScore).toBeGreaterThan(80);
    expect(result.metadata?.temporalEvents).toBeUndefined();
  });

  it('does not fire the density guard for stationary references (rate ~0)', () => {
    const engine = new TemporalEngine();
    const model = engine.train(makeTrainInput(humSequence(120, 30)), 'hum-test');
    model.label = 'Referenz';
    model.type = 'healthy';
    if (model.engineId !== 'temporal') throw new Error('unreachable');
    expect(model.eventRatePerMin!).toBe(0);

    const result = lastResult(engine, [model], humSequence(150, 31));
    const meta = result.metadata?.temporalEvents as { densityFinding: string | null };
    expect(meta.densityFinding).toBeNull();
    expect(result.healthScore).toBeGreaterThan(80);
  });
});

describe('T4 Zyklus-Pfad (T2-a3)', () => {
  /** Nur-Brummen-Frames (Spektrum stationär — die Frame-kNN ist hier blind). */
  function humSequence(count: number, seed: number): Float64Array[] {
    const rng = mulberry32(seed);
    return Array.from({ length: count }, () => jittered(humSpectrum(), rng));
  }

  /** Sägezahn-Wert an Stützstelle i (rampUp 0.8 = langsam hoch, schnell runter). */
  function saw(i: number, period: number, rampUpFraction: number): number {
    const phase = (i % period) / period;
    return phase < rampUpFraction
      ? 0.3 + 0.7 * (phase / rampUpFraction)
      : 1 - 0.7 * ((phase - rampUpFraction) / (1 - rampUpFraction));
  }

  /** Trainings-Input mit Roh-Rauschen, dessen Amplitude dem Sägezahn folgt. */
  function makeCyclicTrainInput(features: Float64Array[], seed: number): TrainInput {
    const input = makeTrainInput(features);
    const rng = mulberry32(seed);
    const hop = DEFAULT_DSP_CONFIG.hopSize;
    const seconds = features.length * hop + DEFAULT_DSP_CONFIG.windowSize;
    const raw = new Float32Array(Math.floor(seconds * SR));
    const periodSamples = Math.floor(2 * SR); // Zyklus: 2 s
    for (let i = 0; i < raw.length; i++) {
      const env = saw(i, periodSamples, 0.8);
      raw[i] = (rng() * 2 - 1) * 0.5 * env;
    }
    return { ...input, rawBuffer: raw };
  }

  it('training stores a cycle template for a cyclic reference (and none for flat raw)', () => {
    const engine = new TemporalEngine();
    const model = engine.train(makeCyclicTrainInput(humSequence(120, 40), 41), 'cycle-test');
    if (model.engineId !== 'temporal') throw new Error('unreachable');
    expect(model.cyclePeriodSec).toBeDefined();
    expect(model.cyclePeriodSec!).toBeGreaterThan(1.5);
    expect(model.cyclePeriodSec!).toBeLessThan(2.5);
    expect(model.cycleEnvelope!.length).toBeGreaterThan(0);
    expect(model.metadata?.cycleSelfDtwMean).toBeDefined();
  });

  it('detects a mirrored cycle shape (T1–T3 blind: same frames, same level set)', () => {
    const engine = new TemporalEngine();
    const model = engine.train(makeCyclicTrainInput(humSequence(120, 42), 43), 'cycle-test');
    model.label = 'Referenz';
    model.type = 'healthy';

    const period = 30; // 2 s im 66-ms-Raster
    // Live-RMS wie in der echten Extraktion: das 330-ms-Fenster glättet die
    // Hüllkurve (gleitendes Mittel über ~5 Hop-Schritte) — genau wie das
    // Trainings-Template aus frameRmsSeries entstand.
    const smoothedSaw = (count: number, rampUp: number): number[] => {
      const vals = Array.from({ length: count + 4 }, (_, i) => saw(i, period, rampUp));
      return Array.from({ length: count }, (_, i) => {
        let s = 0;
        for (let k = 0; k < 5; k++) s += vals[i + k];
        return s / 5;
      });
    };
    const feed = (rampUp: number, seed: number): { score: number; cycle: unknown } => {
      engine.resetSequenceState();
      const rms = smoothedSaw(90, rampUp);
      let last = engine.classify([model], makeFrame(humSequence(1, seed)[0], 0.29));
      const frames = humSequence(90, seed);
      frames.forEach((f, i) => {
        last = engine.classify([model], makeFrame(f, 0.29 * rms[i]));
      });
      return { score: last.healthScore, cycle: last.metadata?.temporalCycle };
    };

    // Gesunder Verlauf: gleiche Zyklusform wie die Referenz
    const healthy = feed(0.8, 44);
    const healthyCycle = healthy.cycle as { anomaly: number; dtwZ: number | null };
    expect(healthyCycle.anomaly).toBe(0);
    expect(healthy.score).toBeGreaterThan(80);

    // Gespiegelter Verlauf: gleiche Frames, gleiche Pegel-MENGE, andere Form
    const mirrored = feed(0.2, 45);
    const mirroredCycle = mirrored.cycle as { anomaly: number; dtwZ: number | null };
    expect(mirroredCycle.anomaly).toBeGreaterThan(0.5);
    expect(mirrored.score).toBeLessThan(healthy.score - 20);

    // Kontrolle: OHNE Zyklus-Felder (T2-a2-Modell) ist der Spiegel unsichtbar
    if (model.engineId !== 'temporal') throw new Error('unreachable');
    const blind = { ...model, metadata: { ...model.metadata } };
    delete blind.cycleEnvelope;
    delete blind.cyclePeriodSec;
    const blindEngine = new TemporalEngine();
    blindEngine.resetSequenceState();
    let blindLast = 0;
    humSequence(90, 45).forEach((f, i) => {
      blindLast = blindEngine.classify([blind], makeFrame(f, 0.29 * saw(i, period, 0.2)))
        .healthScore;
    });
    expect(blindLast).toBeGreaterThan(80);
  });
});

describe('Robustheit & Helfer', () => {
  it('skips models with mismatching feature dimension', () => {
    const engine = new TemporalEngine();
    const train = valveSequence(120, clackA, 15);
    const model = engine.train(makeTrainInput(train), 'valve-test');
    model.label = 'Referenz';
    model.type = 'healthy';

    const wrongDim = new Float64Array(32).fill(1 / 32);
    // Nur ein Modell, das nicht passt → uncertain/UNKNOWN, kein Wurf
    const result = engine.classify([model], {
      feature: {
        features: wrongDim,
        absoluteFeatures: wrongDim,
        bins: 32,
        frequencyRange: [0, SR / 2],
        rmsAmplitude: 0.1,
      },
      sampleRate: SR,
    });
    expect(result.status).toBe('uncertain');
  });

  it('aggregateAnomalies emphasizes rare spikes (transient retention)', () => {
    // 27 ruhige Frames + 3 Spitzen — Mittel allein würde ~0.13 sehen
    const series = [...new Array<number>(27).fill(0.05), 0.8, 0.8, 0.8];
    const agg = aggregateAnomalies(series);
    const plainMean = series.reduce((a, b) => a + b, 0) / series.length;
    expect(agg).toBeGreaterThan(plainMean * 1.8); // deutlich über dem Mittel
    expect(agg).toBeLessThan(0.8); // aber kein reines Max (DMM-Fusion)
  });

  it('buildCoverageBank keeps rare periodic event frames despite subsample aliasing', () => {
    // Regressionsfall: 120 Frames, Klack alle 10 Frames (Indizes 9, 19, …).
    // Reines uniformes Subsampling auf 96 (Schritt 1,25) würde exakt die
    // Indizes ≡ 4 mod 5 auslassen — also ALLE Klack-Frames. Der Coverage-
    // Pass muss sie in die Bank holen.
    const train = valveSequence(120, clackA, 42);
    const bank = buildCoverageBank(train, 96);

    // Ein Klack-Frame muss in der Bank einen sehr nahen Nachbarn haben
    const clackFrame = train[9]; // Index 9 = Klack
    let best = 0;
    for (const b of bank) {
      const s = cosineSimilarity(clackFrame, b);
      if (s > best) best = s;
    }
    expect(best).toBeGreaterThan(0.95);
  });

  it('frameSimilarity LONO excludes the frame and its neighbors', () => {
    const bank = valveSequence(20, clackA, 16);
    // Mit Selbst-Ausschluss muss die Ähnlichkeit < 1 sein (kein Selbst-Match)
    const simLono = frameSimilarity(bank[10], bank, 10);
    expect(simLono).toBeLessThan(0.99999);
    // Ohne Ausschluss (Diagnosefall) ist der Selbst-Match dabei → höher
    const simFull = frameSimilarity(bank[10], bank, -1);
    expect(simFull).toBeGreaterThanOrEqual(simLono);
  });
});
