/**
 * ZANOBOT - Noise Profile Subtraction (Pipeline-Stufe 1.5)
 *
 * Optionale Vorverarbeitung zur Kompensation ADDITIVER Störungen:
 * Ein vor Ort aufgenommenes Umgebungslärm-Profil (Maschine aus) wird
 * per spektraler Subtraktion (Boll 1979) von der Messung abgezogen.
 *
 * Einsatz-Szenario: Fingerprint entsteht im Werk (leise), Diagnose läuft
 * beim Kunden (Hallenlärm). Das Profil wird aufgenommen, solange die
 * Maschine noch aus ist, und bei jeder späteren Messung abgezogen.
 *
 * Mathematik (Energie-Domäne, pro Frame n und Bin k):
 *   P_y(k)     = absoluteFeatures(k)²            // Energie der Messung
 *   P_n(k)     = g² · meanEnergy(k)              // skalierte Profilenergie
 *   G(k)       = max(1 − β · P_n(k) / (P_y(k) + ε), spectralFloor)
 *   clean(k)   = sqrt(G(k)) · absoluteFeatures(k), danach Re-Normierung auf Σ=1
 *
 * Der Skalierungsfaktor g kompensiert Pegelunterschiede zwischen
 * Profilaufnahme und Messung (Mikrofonabstand, Gerät). Er wird per
 * Least-Squares auf LÄRMDOMINIERTEN Bins geschätzt (Bins, in denen das
 * Profil stark und – falls bekannt – die Maschinenreferenz schwach ist).
 *
 * Entfernt wird nur stationärer/quasi-stationärer Lärm (Lüftung, HVAC,
 * Nachbaraggregate). Transienten bleiben Aufgabe des Cherry-Pickings.
 *
 * Pipeline-Reihenfolge: NACH Cherry-Picking, VOR Room Compensation
 * (additive Störungen zuerst, konvolutive danach).
 *
 * WICHTIG: Diese Funktionen werden NUR aufgerufen wenn die Einstellung
 * aktiv ist UND ein Profil ausgewählt wurde. Alle Operationen sind
 * immutable (Original-FeatureVectors bleiben unverändert).
 */

import type { FeatureVector } from '@data/types.js';
import { logger } from '@utils/logger.js';

// ============================================================================
// INTERFACES & DEFAULTS
// ============================================================================

/**
 * Gespeichertes Umgebungslärm-Profil.
 * Arrays als number[] (nicht TypedArray), damit JSON/localStorage-
 * Serialisierung verlustfrei funktioniert (gleiche Konvention wie
 * Machine.refLogMean).
 */
export interface StoredNoiseProfile {
  id: string;
  name: string;
  createdAt: number; // Timestamp (für Staleness-Anzeige)
  durationSec: number; // Länge der Profilaufnahme
  frameCount: number; // Anzahl gemittelter Frames
  sampleRate: number; // Sample-Rate der Aufnahme (Bin-Zuordnung!)
  bins: number; // Anzahl Frequenz-Bins (512)
  meanEnergy: number[]; // Mittlere Energie pro Bin: mean(absoluteFeatures²)
  stdEnergy: number[]; // Standardabweichung der Energie pro Bin
  broadbandRms: number; // Mittlere RMS-Amplitude (Plausibilisierung)
  stationarity: number; // Median-Variationskoeffizient (klein = stabil)
  deviceLabel?: string; // Mikrofon-Bezeichnung bei der Aufnahme (Warnung bei Wechsel)
}

export interface NoiseSubtractionSettings {
  enabled: boolean; // Master-Toggle (Standard: false)
  beta: number; // Über-Subtraktions-Faktor (0.5–2.0, Standard: 1.0)
  spectralFloor: number; // Minimaler Energie-Gain pro Bin (Standard: 0.05)
  activeProfileId: string | null; // Aktuell ausgewähltes Profil
  /**
   * Fallback ohne Profil (Minimum-Statistik): Wenn kein (kompatibles)
   * Profil vorliegt, wird der Lärmboden während der Diagnose aus dem
   * gleitenden Energie-Minimum geschätzt. Braucht refLogMean der
   * Maschine (Bin-Maske). Standard: false.
   */
  minStatsEnabled: boolean;
}

export const DEFAULT_NOISE_SUB_SETTINGS: NoiseSubtractionSettings = {
  enabled: false,
  beta: 1.0,
  spectralFloor: 0.05,
  activeProfileId: null,
  minStatsEnabled: false,
};

/** Floor gegen Division durch 0 */
const EPSILON = 1e-30;

/** Clamp-Grenzen für den Amplituden-Skalierungsfaktor g */
const MIN_SCALE = 0.25;
const MAX_SCALE = 4.0;

/** Frames, bevor der Realtime-Scale-Fit aktiv wird (davor g = 1) */
const MIN_FRAMES_FOR_SCALE_FIT = 3;

/** Exponentielle Glättung der laufenden Mess-Energie (Realtime) */
const RUNNING_MEAN_ALPHA = 0.05;

/**
 * Schwelle für die Stationaritäts-Warnung.
 * Bei 512 Bins über ~16 FFT-Werte gemittelt liegt der Variations-
 * koeffizient stationären Rauschens typisch bei ~0.25–0.5;
 * Sprache/Transienten treiben ihn deutlich über 0.8.
 */
export const STATIONARITY_WARN_THRESHOLD = 0.8;

/** Maximal gespeicherte Profile (localStorage-Budget schonen) */
export const MAX_NOISE_PROFILES = 10;

// ============================================================================
// PROFIL-ERSTELLUNG (Capture)
// ============================================================================

/**
 * Baut aus den Feature-Vektoren einer Lärmaufnahme (Maschine aus)
 * ein speicherbares Profil: Mittelwert + Standardabweichung der
 * Energie pro Bin sowie eine Stationaritäts-Kennzahl.
 *
 * @param features - FeatureVectors aus extractFeatures() der Lärmaufnahme
 * @param sampleRate - Sample-Rate der Aufnahme in Hz
 * @param durationSec - Dauer der Aufnahme in Sekunden
 * @param name - Anzeigename des Profils
 * @param deviceLabel - Optional: Mikrofon-Bezeichnung (Warnung bei Gerätewechsel)
 */
export function buildNoiseProfileFromFeatures(
  features: FeatureVector[],
  sampleRate: number,
  durationSec: number,
  name: string,
  deviceLabel?: string
): StoredNoiseProfile {
  if (features.length === 0) {
    throw new Error('Noise profile requires at least one feature frame');
  }

  const K = features[0].absoluteFeatures.length;
  const N = features.length;

  // Mittlere Energie pro Bin
  const meanEnergy = new Float64Array(K);
  for (const fv of features) {
    for (let k = 0; k < K; k++) {
      const a = fv.absoluteFeatures[k];
      meanEnergy[k] += a * a;
    }
  }
  for (let k = 0; k < K; k++) {
    meanEnergy[k] /= N;
  }

  // Standardabweichung der Energie pro Bin
  const stdEnergy = new Float64Array(K);
  if (N > 1) {
    for (const fv of features) {
      for (let k = 0; k < K; k++) {
        const a = fv.absoluteFeatures[k];
        const diff = a * a - meanEnergy[k];
        stdEnergy[k] += diff * diff;
      }
    }
    for (let k = 0; k < K; k++) {
      stdEnergy[k] = Math.sqrt(stdEnergy[k] / (N - 1));
    }
  }

  // Stationarität: Median des Variationskoeffizienten (std/mean) pro Bin
  const cvs: number[] = [];
  for (let k = 0; k < K; k++) {
    if (meanEnergy[k] > EPSILON) {
      cvs.push(stdEnergy[k] / meanEnergy[k]);
    }
  }
  cvs.sort((a, b) => a - b);
  const stationarity = cvs.length > 0 ? cvs[Math.floor(cvs.length / 2)] : 0;

  // Mittlere RMS-Amplitude (Vor-Standardisierung, aus features.ts)
  let rmsSum = 0;
  for (const fv of features) {
    rmsSum += fv.rmsAmplitude ?? 0;
  }

  return {
    id: `np-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: Date.now(),
    durationSec,
    frameCount: N,
    sampleRate,
    bins: K,
    meanEnergy: Array.from(meanEnergy),
    stdEnergy: Array.from(stdEnergy),
    broadbandRms: rmsSum / N,
    stationarity,
    ...(deviceLabel ? { deviceLabel } : {}),
  };
}

/**
 * Ist das Profil stabil genug aufgenommen worden?
 * false = Umgebung war während der Aufnahme unruhig (Sprache, Transienten).
 */
export function isProfileStationary(profile: StoredNoiseProfile): boolean {
  return profile.stationarity <= STATIONARITY_WARN_THRESHOLD;
}

/**
 * Prüft ob ein Profil zur aktuellen Aufnahme-Konfiguration passt.
 * Bei abweichender Sample-Rate zeigen die Bins auf andere Frequenzen –
 * dann darf NICHT subtrahiert werden (besser gar nicht als falsch).
 */
export function isProfileCompatible(
  profile: StoredNoiseProfile,
  sampleRate: number,
  bins: number
): boolean {
  return Math.abs(profile.sampleRate - sampleRate) < 1 && profile.bins === bins;
}

// ============================================================================
// SNR-KONFIDENZ-AMPEL & KONTEXT-WARNUNGEN
// ============================================================================

/**
 * Klassifikation der Breitband-SNR-Schätzung (Maschine vs. skalierter Lärm):
 * - machine_dominates: Subtraktion kaum nötig, Ergebnis sehr belastbar
 * - similar_levels:    Sweet Spot – Subtraktion aktiv und wirksam
 * - noise_dominates:   Hintergrund lauter als Maschine – nur der Lärm-
 *                      Mittelwert lässt sich abziehen, seine Schwankung
 *                      bleibt → Ergebnis eingeschränkt aussagekräftig
 */
export type NoiseSnrClassification =
  | 'machine_dominates'
  | 'similar_levels'
  | 'noise_dominates';

/** Ab dieser SNR dominiert die Maschine (grün) */
export const SNR_GREEN_THRESHOLD_DB = 15;
/** Unter dieser SNR dominiert der Hintergrund (rot) */
export const SNR_RED_THRESHOLD_DB = -5;

export function classifyNoiseSnr(snrDb: number): NoiseSnrClassification {
  if (snrDb >= SNR_GREEN_THRESHOLD_DB) return 'machine_dominates';
  if (snrDb < SNR_RED_THRESHOLD_DB) return 'noise_dominates';
  return 'similar_levels';
}

/** Ab diesem Alter gilt ein Profil als potenziell veraltet (R1) */
export const PROFILE_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage

/**
 * Ist das Profil älter als PROFILE_STALE_AFTER_MS?
 * Der Lärm vor Ort kann sich über Tage ändern (Schichtbetrieb,
 * Anlagen an/aus) – dann sollte neu aufgenommen werden.
 */
export function isProfileStale(profile: StoredNoiseProfile, now: number = Date.now()): boolean {
  return now - profile.createdAt > PROFILE_STALE_AFTER_MS;
}

/** Profilalter in ganzen Tagen (für Anzeige) */
export function profileAgeDays(profile: StoredNoiseProfile, now: number = Date.now()): number {
  return Math.floor((now - profile.createdAt) / (24 * 60 * 60 * 1000));
}

/**
 * Breitband-SNR-Schätzung für einen kompletten Clip (Batch-Pendant zu
 * RealtimeNoiseSubtraction.estimatedSnrDb, identische Mathematik):
 * mittlere Mess-Energie pro Bin → Scale-Fit g² → SNR über die Summen.
 *
 * Wird u. a. vom Mess-Labor-Benchmark genutzt, um den Produktions-
 * Schätzer der Konfidenz-Ampel gegen bekannte Misch-SNRs zu validieren.
 *
 * @returns SNR in dB oder null wenn nicht berechenbar
 */
export function estimateClipSnrDb(
  features: FeatureVector[],
  profile: StoredNoiseProfile,
  refLogMean?: Float64Array | null
): number | null {
  if (features.length === 0) return null;
  const K = features[0].absoluteFeatures.length;
  if (profile.bins !== K) return null;

  const measMeanEnergy = new Float64Array(K);
  for (const fv of features) {
    for (let k = 0; k < K; k++) {
      const a = fv.absoluteFeatures[k];
      measMeanEnergy[k] += a * a;
    }
  }
  for (let k = 0; k < K; k++) {
    measMeanEnergy[k] /= features.length;
  }

  const energyScale = estimateEnergyScale(measMeanEnergy, profile.meanEnergy, refLogMean);

  let totalMeas = 0;
  let totalNoise = 0;
  for (let k = 0; k < K; k++) {
    totalMeas += measMeanEnergy[k];
    totalNoise += energyScale * profile.meanEnergy[k];
  }
  if (totalNoise < EPSILON) return null;

  const signal = Math.max(totalMeas - totalNoise, totalNoise * 1e-3);
  return 10 * Math.log10(signal / totalNoise);
}

/** Ab dieser Kosinus-Ähnlichkeit gilt Profil ≈ Maschinensignatur (R5) */
export const OVERLAP_WARN_THRESHOLD = 0.9;

/**
 * Spektrale Überlappung zwischen Lärmprofil und Maschinenreferenz
 * (Kosinus-Ähnlichkeit der Energie-Spektren, 0..1).
 *
 * Hohe Werte bedeuten: Der Hintergrund klingt der Maschine sehr ähnlich
 * (typisch: baugleiche Nachbarmaschine). Die Subtraktion zieht dann auch
 * Maschinenenergie ab und kann die Signatur verfälschen.
 *
 * @param profile - Lärmprofil (meanEnergy pro Bin)
 * @param refLogMean - Log-Mittel der Maschinenreferenz (ln-Amplitude pro Bin)
 * @returns Kosinus-Ähnlichkeit oder null wenn nicht berechenbar
 */
export function noiseReferenceOverlap(
  profile: StoredNoiseProfile,
  refLogMean: Float64Array
): number | null {
  const K = profile.bins;
  if (refLogMean.length !== K || profile.meanEnergy.length !== K) {
    return null;
  }

  // Referenz von ln-Amplitude in Energie umrechnen: exp(2·µ)
  let dot = 0;
  let normProfile = 0;
  let normRef = 0;
  for (let k = 0; k < K; k++) {
    const refEnergy = Math.exp(2 * refLogMean[k]);
    const profEnergy = profile.meanEnergy[k];
    dot += refEnergy * profEnergy;
    normProfile += profEnergy * profEnergy;
    normRef += refEnergy * refEnergy;
  }

  const denom = Math.sqrt(normProfile) * Math.sqrt(normRef);
  if (denom < EPSILON || !isFinite(denom)) {
    return null;
  }
  return dot / denom;
}

// ============================================================================
// SCALE-FIT (Pegelabgleich Profil ↔ Messung)
// ============================================================================

/**
 * Wählt die lärmdominierten Bins für den Scale-Fit aus:
 * Profil-Energie über dem Median UND (falls Referenz bekannt)
 * Maschinen-Referenz unter ihrem Median. In Bins mit lauter Maschine
 * würde Maschinenenergie den Fit verfälschen.
 *
 * @returns Indizes der Fit-Bins (leer, wenn keine geeigneten Bins existieren)
 */
function selectNoiseDominatedBins(
  profileMeanEnergy: ArrayLike<number>,
  refLogMean?: Float64Array | null
): number[] {
  const K = profileMeanEnergy.length;

  const sortedProfile = Array.from(profileMeanEnergy).sort((a, b) => a - b);
  const profileMedian = sortedProfile[Math.floor(K / 2)];

  let refMedian = 0;
  if (refLogMean && refLogMean.length === K) {
    const sortedRef = Array.from(refLogMean).sort((a, b) => a - b);
    refMedian = sortedRef[Math.floor(K / 2)];
  }

  const bins: number[] = [];
  for (let k = 0; k < K; k++) {
    if (profileMeanEnergy[k] <= profileMedian) continue;
    if (refLogMean && refLogMean.length === K && refLogMean[k] >= refMedian) continue;
    bins.push(k);
  }
  return bins;
}

/**
 * Robuste Schätzung des ENERGIE-Skalierungsfaktors g² zwischen Profil
 * und Messung: Median der Bin-Verhältnisse M(k)/E_n(k) über die
 * lärmdominierten Bins.
 *
 * Der Median (statt Least Squares) ist entscheidend: In der Messung
 * steckt neben dem Lärm auch die Maschine. Vereinzelte Bins mit starken
 * Maschinen-Spektrallinien haben extreme Verhältnisse und würden einen
 * LS-Fit dominieren – den Median verschieben sie praktisch nicht,
 * solange die Maschinenlinien nicht die Mehrheit der Fit-Bins belegen.
 *
 * Geclampt auf [MIN_SCALE², MAX_SCALE²]; Fallback 1.0 wenn kein Fit möglich.
 *
 * @param measMeanEnergy - Mittlere Energie der Messung pro Bin
 * @param profileMeanEnergy - Mittlere Energie des Profils pro Bin
 * @param refLogMean - Optional: Log-Mittel der Maschinenreferenz (Bin-Auswahl)
 */
export function estimateEnergyScale(
  measMeanEnergy: ArrayLike<number>,
  profileMeanEnergy: ArrayLike<number>,
  refLogMean?: Float64Array | null
): number {
  if (measMeanEnergy.length !== profileMeanEnergy.length) {
    return 1.0;
  }

  const fitBins = selectNoiseDominatedBins(profileMeanEnergy, refLogMean);

  const ratios: number[] = [];
  for (const k of fitBins) {
    if (profileMeanEnergy[k] > EPSILON) {
      ratios.push(measMeanEnergy[k] / profileMeanEnergy[k]);
    }
  }

  if (ratios.length < 8) {
    return 1.0; // Zu wenige verlässliche Bins → neutraler Fallback
  }

  ratios.sort((a, b) => a - b);
  const g2 = ratios[Math.floor(ratios.length / 2)];

  if (!isFinite(g2) || g2 <= 0) {
    return 1.0;
  }

  return Math.min(Math.max(g2, MIN_SCALE * MIN_SCALE), MAX_SCALE * MAX_SCALE);
}

// ============================================================================
// SUBTRAKTION (Batch – Referenz-Phase)
// ============================================================================

/**
 * Wendet die Gain-Formel auf einen einzelnen Frame an (Energie-Domäne).
 * Gemeinsamer Kern von Batch- und Realtime-Pfad.
 */
function subtractFrame(
  fv: FeatureVector,
  profileMeanEnergy: ArrayLike<number>,
  energyScale: number,
  beta: number,
  spectralFloor: number
): FeatureVector {
  const K = fv.absoluteFeatures.length;
  const newAbsolute = new Float64Array(K);

  for (let k = 0; k < K; k++) {
    const amp = fv.absoluteFeatures[k];
    const currEnergy = amp * amp;
    const noiseEnergy = energyScale * profileMeanEnergy[k];
    const gain = Math.max(1.0 - (beta * noiseEnergy) / (currEnergy + EPSILON), spectralFloor);
    newAbsolute[k] = Math.sqrt(gain) * amp;
  }

  const newFeatures = normalizeToSum1(newAbsolute);

  return {
    features: newFeatures,
    normalizedFeatures: newFeatures,
    absoluteFeatures: newAbsolute,
    bins: fv.bins,
    frequencyRange: fv.frequencyRange,
    rmsAmplitude: fv.rmsAmplitude,
  };
}

/**
 * Batch-Lärmsubtraktion für die Referenz-Phase (und das Mess-Labor).
 *
 * Sicherheitsverhalten: Bei inkompatiblem Profil (Sample-Rate/Bins)
 * oder leerem Input wird der Input UNVERÄNDERT zurückgegeben und nur
 * gewarnt – die Pipeline läuft dann wie ohne Feature weiter.
 *
 * @param features - FeatureVectors der Messung/Referenzaufnahme
 * @param profile - Gespeichertes Lärmprofil
 * @param settings - Subtraktions-Einstellungen (beta, spectralFloor)
 * @param refLogMean - Optional: Referenz-Log-Mittel für den Scale-Fit
 * @returns Neue FeatureVector-Liste (Originale unangetastet)
 */
export function applyNoiseSubtraction(
  features: FeatureVector[],
  profile: StoredNoiseProfile,
  settings: NoiseSubtractionSettings,
  refLogMean?: Float64Array | null
): FeatureVector[] {
  if (features.length === 0) {
    return features;
  }

  const K = features[0].absoluteFeatures.length;
  const featureSampleRate = features[0].frequencyRange[1] * 2;

  if (!isProfileCompatible(profile, featureSampleRate, K)) {
    logger.warn(
      `⚠️ Noise profile incompatible (profile: ${profile.sampleRate}Hz/${profile.bins} bins, ` +
        `features: ${featureSampleRate}Hz/${K} bins) – subtraction skipped`
    );
    return features;
  }

  // Mittlere Mess-Energie pro Bin für den Scale-Fit
  const measMeanEnergy = new Float64Array(K);
  for (const fv of features) {
    for (let k = 0; k < K; k++) {
      const a = fv.absoluteFeatures[k];
      measMeanEnergy[k] += a * a;
    }
  }
  for (let k = 0; k < K; k++) {
    measMeanEnergy[k] /= features.length;
  }

  const energyScale = estimateEnergyScale(measMeanEnergy, profile.meanEnergy, refLogMean);

  const result = features.map((fv) =>
    subtractFrame(fv, profile.meanEnergy, energyScale, settings.beta, settings.spectralFloor)
  );

  logger.info(
    `🎚️ Noise subtraction applied to ${features.length} frames ` +
      `(profile "${profile.name}", g²=${energyScale.toFixed(3)}, β=${settings.beta})`
  );

  return result;
}

// ============================================================================
// REALTIME-SUBTRAKTION (Diagnose-Phase – Frame-für-Frame)
// ============================================================================

/**
 * Streaming-Variante für die Live-Diagnose (Spiegelbild von
 * RealtimeT60Subtraction): ein process(fv) pro Frame.
 *
 * Der Scale-Fit läuft adaptiv mit: Eine exponentiell geglättete mittlere
 * Mess-Energie wird pro Frame aktualisiert; ab MIN_FRAMES_FOR_SCALE_FIT
 * wird g² daraus geschätzt (davor g² = 1, da AGC deaktiviert ist und das
 * Profil absolut kalibriert vorliegt).
 */
export class RealtimeNoiseSubtraction {
  private readonly profileMeanEnergy: Float64Array;
  private readonly beta: number;
  private readonly spectralFloor: number;
  private readonly refLogMean: Float64Array | null;
  private readonly K: number;

  private runningMeasEnergy: Float64Array;
  private frameCount = 0;
  private energyScale = 1.0;

  constructor(
    profile: StoredNoiseProfile,
    settings: NoiseSubtractionSettings,
    refLogMean?: Float64Array | null
  ) {
    this.K = profile.bins;
    this.profileMeanEnergy = Float64Array.from(profile.meanEnergy);
    this.beta = settings.beta;
    this.spectralFloor = settings.spectralFloor;
    this.refLogMean = refLogMean && refLogMean.length === this.K ? refLogMean : null;
    this.runningMeasEnergy = new Float64Array(this.K);
  }

  /**
   * Verarbeitet einen einzelnen Frame und gibt die bereinigte Kopie zurück.
   * Frames mit abweichender Bin-Anzahl werden unverändert durchgereicht.
   */
  process(fv: FeatureVector): FeatureVector {
    if (fv.absoluteFeatures.length !== this.K) {
      return fv;
    }

    this.frameCount++;

    // Laufende mittlere Mess-Energie aktualisieren (exponentielle Glättung)
    if (this.frameCount === 1) {
      for (let k = 0; k < this.K; k++) {
        const a = fv.absoluteFeatures[k];
        this.runningMeasEnergy[k] = a * a;
      }
    } else {
      for (let k = 0; k < this.K; k++) {
        const a = fv.absoluteFeatures[k];
        this.runningMeasEnergy[k] =
          (1 - RUNNING_MEAN_ALPHA) * this.runningMeasEnergy[k] + RUNNING_MEAN_ALPHA * a * a;
      }
    }

    // Scale-Fit erst wenn die laufende Mittelung tragfähig ist
    if (this.frameCount >= MIN_FRAMES_FOR_SCALE_FIT) {
      this.energyScale = estimateEnergyScale(
        this.runningMeasEnergy,
        this.profileMeanEnergy,
        this.refLogMean
      );
    }

    return subtractFrame(
      fv,
      this.profileMeanEnergy,
      this.energyScale,
      this.beta,
      this.spectralFloor
    );
  }

  /** Aktueller Energie-Skalierungsfaktor g² (für Statusanzeige) */
  get currentEnergyScale(): number {
    return this.energyScale;
  }

  /**
   * Grobe Breitband-SNR-Schätzung in dB (Maschine vs. skalierter Lärm),
   * basierend auf der laufenden Mess-Energie. Für die Statusanzeige.
   * Gibt null zurück solange zu wenige Frames verarbeitet wurden.
   */
  get estimatedSnrDb(): number | null {
    if (this.frameCount < MIN_FRAMES_FOR_SCALE_FIT) {
      return null;
    }
    let totalMeas = 0;
    let totalNoise = 0;
    for (let k = 0; k < this.K; k++) {
      totalMeas += this.runningMeasEnergy[k];
      totalNoise += this.energyScale * this.profileMeanEnergy[k];
    }
    if (totalNoise < EPSILON) {
      return null;
    }
    const signal = Math.max(totalMeas - totalNoise, totalNoise * 1e-3);
    return 10 * Math.log10(signal / totalNoise);
  }

  reset(): void {
    this.runningMeasEnergy.fill(0);
    this.frameCount = 0;
    this.energyScale = 1.0;
  }
}

// ============================================================================
// MINIMUM-STATISTICS-FALLBACK (Stufe 3: Lärmschätzung ohne Profil)
// ============================================================================

/** Sub-Fenster-Länge in Frames (~0.8 s bei 66-ms-Hop) */
const MINSTATS_SUBWINDOW_FRAMES = 12;
/** Anzahl Sub-Fenster im Gesamtfenster (~6.3 s) */
const MINSTATS_SUBWINDOWS = 8;
/** Exponentielle Glättung der Energie vor der Minimum-Bildung */
const MINSTATS_SMOOTHING = 0.8;
/**
 * Bias-Kompensation: Das Minimum einer geglätteten Energie unterschätzt
 * den Mittelwert systematisch. Heuristischer Faktor (Martin 2001 nutzt
 * eine varianzabhängige Kompensation; für den Fallback genügt konstant).
 */
const MINSTATS_BIAS_COMPENSATION = 1.5;

/**
 * Vereinfachter Minimum-Statistics-Schätzer (nach Martin 2001):
 * verfolgt pro Bin das Minimum der geglätteten Energie über ein
 * gleitendes Fenster aus Sub-Fenstern. Das Minimum approximiert den
 * stationären Lärmboden, WÄHREND die Maschine läuft – es braucht also
 * kein separates "Maschine aus"-Profil.
 *
 * Grenzen (bewusst): Bei einer perfekt stationären Quelle konvergiert
 * das Minimum gegen deren Pegel – deshalb wird der Schätzer nur mit
 * einer Bin-Maske eingesetzt (siehe RealtimeMinStatsSubtraction), die
 * maschinendominierte Bins von der Subtraktion ausnimmt.
 */
export class MinimumStatisticsNoiseEstimator {
  private readonly K: number;
  private smoothed: Float64Array;
  /** Ring aus Sub-Fenster-Minima (pro Bin) */
  private subMinima: Float64Array[];
  private currentMin: Float64Array;
  private frameInSubwindow = 0;
  private frameCount = 0;

  constructor(numBins: number) {
    this.K = numBins;
    this.smoothed = new Float64Array(numBins);
    this.currentMin = new Float64Array(numBins).fill(Number.POSITIVE_INFINITY);
    this.subMinima = [];
  }

  /** Einen Frame (Energie = absoluteFeatures²) einarbeiten. */
  update(fv: FeatureVector): void {
    if (fv.absoluteFeatures.length !== this.K) return;
    this.frameCount++;

    for (let k = 0; k < this.K; k++) {
      const a = fv.absoluteFeatures[k];
      const energy = a * a;
      this.smoothed[k] =
        this.frameCount === 1
          ? energy
          : MINSTATS_SMOOTHING * this.smoothed[k] + (1 - MINSTATS_SMOOTHING) * energy;
      if (this.smoothed[k] < this.currentMin[k]) {
        this.currentMin[k] = this.smoothed[k];
      }
    }

    this.frameInSubwindow++;
    if (this.frameInSubwindow >= MINSTATS_SUBWINDOW_FRAMES) {
      this.subMinima.push(this.currentMin);
      if (this.subMinima.length > MINSTATS_SUBWINDOWS) {
        this.subMinima.shift();
      }
      this.currentMin = new Float64Array(this.K).fill(Number.POSITIVE_INFINITY);
      this.frameInSubwindow = 0;
    }
  }

  /** Frames bis die erste Schätzung verfügbar ist. */
  static readonly WARMUP_FRAMES = MINSTATS_SUBWINDOW_FRAMES;

  /**
   * Aktuelle Lärmboden-Schätzung (Energie pro Bin, bias-kompensiert)
   * oder null solange noch kein Sub-Fenster vollständig ist.
   */
  getEstimate(): Float64Array | null {
    if (this.subMinima.length === 0) return null;
    const est = new Float64Array(this.K);
    for (let k = 0; k < this.K; k++) {
      let min = Number.POSITIVE_INFINITY;
      for (const sub of this.subMinima) {
        if (sub[k] < min) min = sub[k];
      }
      // Laufendes (noch offenes) Sub-Fenster mit einbeziehen
      if (this.currentMin[k] < min) min = this.currentMin[k];
      est[k] = isFinite(min) ? MINSTATS_BIAS_COMPENSATION * min : 0;
    }
    return est;
  }

  reset(): void {
    this.smoothed.fill(0);
    this.currentMin.fill(Number.POSITIVE_INFINITY);
    this.subMinima = [];
    this.frameInSubwindow = 0;
    this.frameCount = 0;
  }
}

/**
 * Realtime-Subtraktion OHNE gespeichertes Profil (Fallback, Stufe 3):
 * Lärmboden per Minimum-Statistik live schätzen und nur in den
 * maschinen-SCHWACHEN Bins subtrahieren.
 *
 * Die Bin-Maske (refLogMean unter Median = Maschine schwach) ist die
 * zentrale Absicherung: In maschinendominierten Bins würde das
 * gleitende Minimum bei stationären Maschinen deren eigene Energie als
 * "Lärm" lernen und die Signatur verfälschen. Dort ist Lärm relativ
 * ohnehin vernachlässigbar – diese Bins bleiben unangetastet.
 *
 * Kein Scale-Fit nötig: Die Schätzung stammt aus derselben Session wie
 * die Messung (identischer Pegel per Konstruktion).
 */
export class RealtimeMinStatsSubtraction {
  private readonly estimator: MinimumStatisticsNoiseEstimator;
  private readonly beta: number;
  private readonly spectralFloor: number;
  private readonly K: number;
  /** true = Bin darf subtrahiert werden (Maschine dort schwach) */
  private readonly subtractMask: Uint8Array;
  private lastMeasEnergy: Float64Array;
  private frameCount = 0;

  /**
   * @param numBins - Anzahl Frequenz-Bins (512)
   * @param refLogMean - Log-Mittel der Maschinenreferenz (Pflicht: Bin-Maske)
   * @param settings - beta / spectralFloor wie beim Profil-Pfad
   */
  constructor(numBins: number, refLogMean: Float64Array, settings: NoiseSubtractionSettings) {
    if (refLogMean.length !== numBins) {
      throw new Error('RealtimeMinStatsSubtraction requires refLogMean matching bin count');
    }
    this.K = numBins;
    this.estimator = new MinimumStatisticsNoiseEstimator(numBins);
    this.beta = settings.beta;
    this.spectralFloor = settings.spectralFloor;
    this.lastMeasEnergy = new Float64Array(numBins);

    // Maske: nur Bins bis einschließlich Median-Referenzpegel subtrahieren.
    // "<=" statt "<": Referenzen mit flachem Grundpegel (viele identische
    // Bins am Median) würden sonst gar keine subtrahierbaren Bins liefern.
    const sorted = Array.from(refLogMean).sort((a, b) => a - b);
    const median = sorted[Math.floor(numBins / 2)];
    this.subtractMask = new Uint8Array(numBins);
    for (let k = 0; k < numBins; k++) {
      this.subtractMask[k] = refLogMean[k] <= median ? 1 : 0;
    }
  }

  /**
   * Frame verarbeiten: Schätzer aktualisieren (mit ROH-Energie), dann
   * in den maskierten Bins subtrahieren. Vor Abschluss des ersten
   * Sub-Fensters wird der Frame unverändert durchgereicht.
   */
  process(fv: FeatureVector): FeatureVector {
    if (fv.absoluteFeatures.length !== this.K) {
      return fv;
    }
    this.frameCount++;
    this.estimator.update(fv);

    for (let k = 0; k < this.K; k++) {
      const a = fv.absoluteFeatures[k];
      this.lastMeasEnergy[k] = a * a;
    }

    const estimate = this.estimator.getEstimate();
    if (!estimate) {
      return fv; // Warm-up: noch keine Schätzung
    }

    const newAbsolute = new Float64Array(this.K);
    for (let k = 0; k < this.K; k++) {
      const amp = fv.absoluteFeatures[k];
      if (this.subtractMask[k] === 0) {
        newAbsolute[k] = amp; // Maschinen-Bin: unangetastet
        continue;
      }
      const currEnergy = amp * amp;
      const gain = Math.max(
        1.0 - (this.beta * estimate[k]) / (currEnergy + EPSILON),
        this.spectralFloor
      );
      newAbsolute[k] = Math.sqrt(gain) * amp;
    }

    const newFeatures = normalizeToSum1(newAbsolute);
    return {
      features: newFeatures,
      normalizedFeatures: newFeatures,
      absoluteFeatures: newAbsolute,
      bins: fv.bins,
      frequencyRange: fv.frequencyRange,
      rmsAmplitude: fv.rmsAmplitude,
    };
  }

  /** true sobald die erste Lärmboden-Schätzung aktiv ist. */
  get isActive(): boolean {
    return this.frameCount >= MinimumStatisticsNoiseEstimator.WARMUP_FRAMES;
  }

  /**
   * Grobe Breitband-SNR-Schätzung in dB (analog RealtimeNoiseSubtraction),
   * berechnet über die maskierten Bins hinweg mit dem Min-Stats-Boden.
   */
  get estimatedSnrDb(): number | null {
    const estimate = this.estimator.getEstimate();
    if (!estimate) return null;
    let totalMeas = 0;
    let totalNoise = 0;
    for (let k = 0; k < this.K; k++) {
      totalMeas += this.lastMeasEnergy[k];
      totalNoise += estimate[k];
    }
    if (totalNoise < EPSILON) return null;
    const signal = Math.max(totalMeas - totalNoise, totalNoise * 1e-3);
    return 10 * Math.log10(signal / totalNoise);
  }

  reset(): void {
    this.estimator.reset();
    this.lastMeasEnergy.fill(0);
    this.frameCount = 0;
  }
}

// ============================================================================
// PERSISTENZ (localStorage – gleiche Konvention wie roomCompensation.ts)
// ============================================================================

const SETTINGS_STORAGE_KEY = 'zanobot-noise-sub-settings';
const PROFILES_STORAGE_KEY = 'zanobot-noise-profiles';

/** localStorage ist in Node-Tests nicht vorhanden → defensiv kapseln */
function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Liest die Subtraktions-Einstellungen aus localStorage.
 * Liefert Defaults, wenn nichts gespeichert ist oder Parsen fehlschlägt.
 */
export function getNoiseSubtractionSettings(): NoiseSubtractionSettings {
  if (storageAvailable()) {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_NOISE_SUB_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      /* ignore parse errors */
    }
  }
  return { ...DEFAULT_NOISE_SUB_SETTINGS };
}

/**
 * Schreibt (merged) die Subtraktions-Einstellungen nach localStorage.
 */
export function setNoiseSubtractionSettings(settings: Partial<NoiseSubtractionSettings>): void {
  if (!storageAvailable()) return;
  const current = getNoiseSubtractionSettings();
  const merged = { ...current, ...settings };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
}

/**
 * Liest alle gespeicherten Lärmprofile (neueste zuerst).
 */
export function getNoiseProfiles(): StoredNoiseProfile[] {
  if (!storageAvailable()) return [];
  try {
    const stored = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return (parsed as StoredNoiseProfile[])
      .filter(
        (p) =>
          p &&
          typeof p.id === 'string' &&
          Array.isArray(p.meanEnergy) &&
          typeof p.sampleRate === 'number'
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/**
 * Speichert ein neues Profil. Wirft einen Error wenn das Limit
 * (MAX_NOISE_PROFILES) erreicht ist oder localStorage voll läuft.
 */
export function saveNoiseProfile(profile: StoredNoiseProfile): void {
  if (!storageAvailable()) {
    throw new Error('localStorage not available');
  }
  const profiles = getNoiseProfiles();
  if (profiles.length >= MAX_NOISE_PROFILES) {
    throw new Error(`Noise profile limit reached (${MAX_NOISE_PROFILES})`);
  }
  profiles.unshift(profile);
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  logger.info(`🎚️ Noise profile saved: "${profile.name}" (${profile.frameCount} frames)`);
}

/**
 * Löscht ein Profil. Deaktiviert es zusätzlich, falls es aktiv war.
 */
export function deleteNoiseProfile(id: string): void {
  if (!storageAvailable()) return;
  const remaining = getNoiseProfiles().filter((p) => p.id !== id);
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(remaining));

  const settings = getNoiseSubtractionSettings();
  if (settings.activeProfileId === id) {
    setNoiseSubtractionSettings({ activeProfileId: null });
  }
}

/**
 * Liefert das aktuell ausgewählte Profil oder null.
 */
export function getActiveNoiseProfile(): StoredNoiseProfile | null {
  const settings = getNoiseSubtractionSettings();
  if (!settings.activeProfileId) return null;
  return getNoiseProfiles().find((p) => p.id === settings.activeProfileId) ?? null;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalisiert ein Float64Array auf Summe 1 (relative Features).
 * Identische Semantik wie normalizeToSum1 in roomCompensation.ts.
 */
function normalizeToSum1(values: Float64Array): Float64Array {
  const n = values.length;
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += values[i];
  }

  const normalized = new Float64Array(n);
  if (total > 0) {
    for (let i = 0; i < n; i++) {
      normalized[i] = values[i] / total;
    }
  }
  return normalized;
}
