/**
 * ZANOBOT · Mess-Labor — „Handy-Protokoll“: reine Planung + Statistik (pure)
 *
 * Am Handy lernt SoundFuchs aus GENAU EINER Referenzaufnahme und prüft spätere
 * Aufnahmen derselben Maschine dagegen. Das Handy-Protokoll misst genau das:
 * je Bereich werden N Referenzen reproduzierbar gezogen (je aus k Clips, Standard
 * 1), jede wird einzeln angelernt und gegen eine feste Testmenge geprüft.
 * Optional schätzen m Kalibrier-Clips je Durchlauf eine eigene Schwelle.
 *
 * Diese Datei enthält nur die reinen, testbaren Teile:
 *  - planPhoneProtocol(): Testmenge festlegen, Referenz- und Kalibrier-Clips
 *    ziehen (Referenz, Kalibrierung und Test überschneiden sich nie),
 *  - calibrationThreshold()/calibratedFlag(): Schwellenregeln,
 *  - summarize()/quantile(): Median, Quartile, Min/Max über die Durchläufe,
 *  - wavSampleRate(): Abtastrate aus dem RIFF-Kopf (für den 16-kHz-Vermerk).
 */

import { shuffledIndices } from './rng.js';
import type { ParsedSection } from './parseFolder.js';

/** Standardwerte des Protokolls (auch in der UI vorbelegt). */
export const PHONE_PROTOCOL_DEFAULTS = {
  /** Referenz-Durchläufe je Bereich. */
  runs: 20,
  /** Seed für die reproduzierbare Referenz-Ziehung. */
  seed: 20261031,
  /** 0 = alle Testclips je Klasse. */
  maxTestPerClass: 0,
  /** Kalibrier-Clips m je Durchlauf (0 = keine kalibrierte Schwelle). */
  calibClips: 0,
  /** Referenz aus k Clips (1 = wie am Handy heute). */
  refClips: 1,
  /** Schwellenregel bei m > 0. */
  calibRule: 'max-factor' as CalibRule,
  /** Faktor für „größte Abweichung × Faktor“. */
  calibFactor: 1.25,
  /** z für „Mittel + z · Standardabweichung“. */
  calibZ: 3,
};

/** Grenzen der neuen Optionen. */
export const CALIB_CLIPS_MAX = 10;
export const REF_CLIPS_MAX = 5;
/** „Mittel + z · σ“ braucht mindestens so viele Kalibrier-Clips. */
export const CALIB_MEAN_Z_MIN = 3;

/** Ein Durchlauf: k Referenz-Clips, m Kalibrier-Clips und die Testclips. */
export interface PhoneRunPlan {
  /** Laufende Nummer (0-basiert). */
  index: number;
  /** Erster Referenz-Clip (bei k = 1 DIE Referenz). */
  refPath: string;
  /** Alle k Referenz-Clips (zusammen angelernt). */
  refPaths: string[];
  /** Die m Kalibrier-Clips (Normal, nicht im Test, nicht in der Referenz). */
  calibPaths: string[];
  /** Geprüfte Normal-Clips. */
  testNormal: string[];
  /** Geprüfte Abnormal-Clips (in allen Durchläufen gleich). */
  testAbnormal: string[];
}

/** Plan für einen Bereich. `skipped` gesetzt → Bereich wird nicht gemessen. */
export interface PhoneSectionPlan {
  key: string;
  machine: string;
  section: string;
  /** Alle Normal-Clips des Bereichs (sortiert, Split-Ordner zusammengelegt). */
  normals: string[];
  /** Alle Abnormal-Clips des Bereichs (sortiert). */
  abnormals: string[];
  runs: PhoneRunPlan[];
  /**
   * true: Die Testmenge ist über alle Durchläufe gleich; Referenz und
   * Kalibrierung stammen aus den übrigen Normal-Clips. false: Es gibt keine
   * übrigen Clips (Max. Testclips = 0 oder zu wenige) — Referenz und
   * Kalibrierung werden je Durchlauf aus dem Test herausgenommen.
   */
  testSetFixed: boolean;
  /** Grund, warum der Bereich übersprungen wird (sonst undefined). */
  skipped?: string;
  /** Angefragte, aber mangels Normal-Clips nicht mögliche Durchläufe. */
  runsRequested: number;
}

export interface PhonePlanOptions {
  runs?: number;
  seed?: number;
  /** Max. Testclips je Klasse (0/undefined = alle). */
  maxTestPerClass?: number;
  /** Kalibrier-Clips m (0–10). */
  calibClips?: number;
  /** Referenz aus k Clips (1–5). */
  refClips?: number;
}

/** Alle Normal-Clips eines Bereichs, egal ob mit oder ohne train/test-Ordner. */
export function normalsOf(section: ParsedSection): string[] {
  return [
    ...new Set([...section.normalPaths, ...section.trainNormalPaths, ...section.testNormalPaths]),
  ].sort();
}

/**
 * Gleichmäßig über die (zeitlich sortierte) Liste verteilt kappen — wie der
 * 'interleaved'-Split: so stammen die Testclips nicht nur vom Anfang der
 * Aufnahmesession. Deterministisch.
 */
export function capEvenly(paths: string[], max?: number): string[] {
  if (!max || max <= 0 || paths.length <= max) return [...paths];
  const out: string[] = [];
  for (let j = 0; j < max; j++) out.push(paths[Math.floor((j * paths.length) / max)]);
  return out;
}

function clampInt(v: number | undefined, lo: number, hi: number, fallback: number): number {
  const n = Math.floor(v ?? fallback);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/**
 * Plane das Handy-Protokoll für einen Bereich.
 *
 *  1. Testmenge EINMAL festlegen: Normal- und Abnormal-Clips gleichmäßig
 *     verteilt gekappt (capEvenly); über alle Durchläufe gleich.
 *  2. Referenz- (k) und Kalibrier-Clips (m) je Durchlauf aus den ÜBRIGEN
 *     Normal-Clips ziehen: reproduzierbare Permutation (mulberry32 /
 *     shuffledIndices), Durchlauf r nimmt die Positionen r·(k+m) … r·(k+m)+k+m−1
 *     (zyklisch), die ersten k sind Referenz, die nächsten m Kalibrierung.
 *  3. Bleiben keine bzw. zu wenige übrige Clips (Max. Testclips = 0 → alle
 *     Normal-Clips sind Test), wird wie bisher aus ALLEN Normal-Clips gezogen
 *     und Referenz + Kalibrierung je Durchlauf aus dem Test herausgenommen.
 *     Mit k = 1, m = 0, Max = 0 ist das exakt die bisherige Auswahl.
 *  4. Referenz, Kalibrierung und Test überschneiden sich nie.
 */
export function planPhoneProtocol(
  section: ParsedSection,
  options: PhonePlanOptions = {}
): PhoneSectionPlan {
  const runsRequested = Math.max(1, Math.floor(options.runs ?? PHONE_PROTOCOL_DEFAULTS.runs));
  const seed = options.seed ?? PHONE_PROTOCOL_DEFAULTS.seed;
  const maxTest = options.maxTestPerClass;
  const k = clampInt(options.refClips, 1, REF_CLIPS_MAX, PHONE_PROTOCOL_DEFAULTS.refClips);
  const m = clampInt(options.calibClips, 0, CALIB_CLIPS_MAX, PHONE_PROTOCOL_DEFAULTS.calibClips);
  const g = k + m;
  const normals = normalsOf(section);
  const abnormals = [...section.abnormalPaths].sort();

  const base = {
    key: section.key,
    machine: section.machine,
    section: section.section,
    normals,
    abnormals,
    runsRequested,
  };

  if (normals.length < g + 1) {
    return {
      ...base,
      runs: [],
      testSetFixed: false,
      skipped:
        `nur ${normals.length} Normal-Clip(s) — mindestens ${g + 1} nötig ` +
        `(${k} Referenz${m > 0 ? ` + ${m} Kalibrierung` : ''} + 1 Test)`,
    };
  }

  const testAbnormal = capEvenly(abnormals, maxTest);
  const fixedTest = capEvenly(normals, maxTest);
  const testSet = new Set(fixedTest);
  const rest = normals.filter((p) => !testSet.has(p));
  const testSetFixed = rest.length >= g;
  const pool = testSetFixed ? rest : normals;

  const order = shuffledIndices(pool.length, seed);
  const nRuns = Math.min(runsRequested, pool.length);
  const runs: PhoneRunPlan[] = [];
  for (let r = 0; r < nRuns; r++) {
    const group: string[] = [];
    for (let j = 0; j < g; j++) group.push(pool[order[(r * g + j) % pool.length]]);
    const refPaths = group.slice(0, k);
    const calibPaths = group.slice(k);
    const drawn = new Set(group);
    runs.push({
      index: r,
      refPath: refPaths[0],
      refPaths,
      calibPaths,
      testNormal: testSetFixed ? fixedTest : fixedTest.filter((p) => !drawn.has(p)),
      testAbnormal,
    });
  }
  return { ...base, runs, testSetFixed };
}

// ── Kalibrierte Schwelle ─────────────────────────────────────────────────────

/** Schwellenregel aus den Rohwerten der Kalibrier-Clips. */
export type CalibRule = 'max-factor' | 'mean-z';

export interface CalibParams {
  rule: CalibRule;
  /** Faktor für 'max-factor'. */
  factor: number;
  /** z für 'mean-z'. */
  z: number;
}

/**
 * Schwelle aus den Roh-Anomalien (1 − Ähnlichkeit) der Kalibrier-Clips.
 *
 *  - 'max-factor': größte Abweichung × Faktor.
 *  - 'mean-z'    : Mittel + z · Stichproben-Standardabweichung (n − 1);
 *                  erst ab CALIB_MEAN_Z_MIN Werten, sonst NaN.
 *
 * NaN, wenn keine Werte vorliegen oder einer nicht endlich ist (ohne Rohwert
 * keine ehrliche Schwelle).
 */
export function calibrationThreshold(values: number[], params: CalibParams): number {
  if (values.length === 0 || values.some((v) => !Number.isFinite(v))) return NaN;
  if (params.rule === 'max-factor') {
    return Math.max(...values) * params.factor;
  }
  if (values.length < CALIB_MEAN_Z_MIN) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let ss = 0;
  for (const v of values) ss += (v - mean) * (v - mean);
  const sd = Math.sqrt(ss / (values.length - 1));
  return mean + params.z * sd;
}

/** Kalibriertes Urteil: „auffällig“, wenn der Rohwert ÜBER der Schwelle liegt. */
export function calibratedFlag(raw: number, threshold: number): boolean | null {
  if (!Number.isFinite(raw) || !Number.isFinite(threshold)) return null;
  return raw > threshold;
}

// ── Statistik über die Durchläufe ───────────────────────────────────────────

/**
 * Quantil einer AUFSTEIGEND sortierten Liste mit linearer Interpolation
 * (Hyndman–Fan Typ 7, wie R/NumPy-Standard). NaN bei leerer Liste.
 */
export function quantile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** Lage + Streuung einer Messgröße über alle Durchläufe. */
export interface SpreadSummary {
  /** Anzahl endlicher Werte (NaN-Durchläufe zählen nicht). */
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
}

/** Median, Quartile, Min/Max und Mittel; nicht-endliche Werte werden ignoriert. */
export function summarize(values: number[]): SpreadSummary {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) {
    return { n: 0, min: NaN, q1: NaN, median: NaN, q3: NaN, max: NaN, mean: NaN };
  }
  let sum = 0;
  for (const x of v) sum += x;
  return {
    n: v.length,
    min: v[0],
    q1: quantile(v, 0.25),
    median: quantile(v, 0.5),
    q3: quantile(v, 0.75),
    max: v[v.length - 1],
    mean: sum / v.length,
  };
}

// ── WAV-Kopf ─────────────────────────────────────────────────────────────────

/**
 * Abtastrate aus dem RIFF/WAVE-Kopf lesen (fmt-Chunk), OHNE zu dekodieren.
 * Wird gebraucht, weil decodeAudioData auf die Kontextrate (48 kHz) umrechnet
 * und die Originalrate danach nicht mehr sichtbar ist. NaN, wenn kein WAV.
 */
export function wavSampleRate(bytes: ArrayBuffer): number {
  if (bytes.byteLength < 12) return NaN;
  const view = new DataView(bytes);
  const tag = (off: number): string =>
    String.fromCharCode(
      view.getUint8(off),
      view.getUint8(off + 1),
      view.getUint8(off + 2),
      view.getUint8(off + 3)
    );
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return NaN;
  let off = 12;
  while (off + 8 <= bytes.byteLength) {
    const id = tag(off);
    const size = view.getUint32(off + 4, true);
    if (id === 'fmt ') {
      return off + 12 <= bytes.byteLength ? view.getUint32(off + 12, true) : NaN;
    }
    off += 8 + size + (size % 2);
  }
  return NaN;
}
