/**
 * ZANOBOT · Mess-Labor — „Handy-Protokoll“: reine Planung + Statistik (pure)
 *
 * Am Handy lernt SoundFuchs aus GENAU EINER Referenzaufnahme und prüft spätere
 * Aufnahmen derselben Maschine dagegen. Das Handy-Protokoll misst genau das:
 * je Bereich werden N Referenz-Clips reproduzierbar gezogen, jeder davon wird
 * einzeln angelernt, und alle übrigen Clips desselben Bereichs werden geprüft.
 *
 * Diese Datei enthält nur die reinen, testbaren Teile:
 *  - planPhoneProtocol(): Referenzen ziehen + Testmengen je Durchlauf bilden
 *    (Referenz nie im Test; die Kappung kürzt NUR den Test, nie die Referenz),
 *  - summarize()/quantile(): Median, Quartile, Min/Max über die Durchläufe,
 *  - wavSampleRate(): Abtastrate aus dem RIFF-Kopf (für den 16-kHz-Vermerk).
 */

import { shuffledIndices } from './rng.js';
import type { ParsedSection } from './parseFolder.js';

/** Standardwerte des Protokolls (auch in der UI vorbelegt). */
export const PHONE_PROTOCOL_DEFAULTS = {
  /** Referenz-Durchläufe je Bereich (je Durchlauf genau EIN Referenz-Clip). */
  runs: 20,
  /** Seed für die reproduzierbare Referenz-Ziehung. */
  seed: 20261031,
  /** 0 = alle Testclips je Klasse. */
  maxTestPerClass: 0,
};

/** Ein Durchlauf: ein Referenz-Clip + die Clips, die dagegen geprüft werden. */
export interface PhoneRunPlan {
  /** Laufende Nummer (0-basiert). */
  index: number;
  /** Der EINE Referenz-Clip dieses Durchlaufs. */
  refPath: string;
  /** Geprüfte Normal-Clips (ohne die Referenz, ggf. gekappt). */
  testNormal: string[];
  /** Geprüfte Abnormal-Clips (ggf. gekappt; in allen Durchläufen gleich). */
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
  /** Grund, warum der Bereich übersprungen wird (sonst undefined). */
  skipped?: string;
  /** Angefragte, aber mangels Normal-Clips nicht mögliche Durchläufe. */
  runsRequested: number;
}

export interface PhonePlanOptions {
  runs?: number;
  seed?: number;
  /** Max. Testclips je Klasse (0/undefined = alle). Kürzt nie die Referenz. */
  maxTestPerClass?: number;
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

/**
 * Plane das Handy-Protokoll für einen Bereich.
 *
 *  1. Referenzen: reproduzierbare Permutation (mulberry32/shuffledIndices) der
 *     sortierten Normal-Clips; die ersten `runs` Einträge sind die Referenzen.
 *     Gezogen wird IMMER aus allen Normal-Clips — die Kappung wirkt hier nicht.
 *  2. Test je Durchlauf: alle übrigen Normal-Clips (ohne die Referenz) und alle
 *     Abnormal-Clips; erst danach wird je Klasse gekappt.
 *  3. Weniger als 2 Normal-Clips → übersprungen (es bliebe kein Normal-Test).
 */
export function planPhoneProtocol(
  section: ParsedSection,
  options: PhonePlanOptions = {}
): PhoneSectionPlan {
  const runsRequested = Math.max(1, Math.floor(options.runs ?? PHONE_PROTOCOL_DEFAULTS.runs));
  const seed = options.seed ?? PHONE_PROTOCOL_DEFAULTS.seed;
  const maxTest = options.maxTestPerClass;
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

  if (normals.length < 2) {
    return {
      ...base,
      runs: [],
      skipped: `nur ${normals.length} Normal-Clip(s) — mindestens 2 nötig (1 Referenz + 1 Test)`,
    };
  }

  const order = shuffledIndices(normals.length, seed);
  const nRuns = Math.min(runsRequested, normals.length);
  const testAbnormal = capEvenly(abnormals, maxTest);
  const runs: PhoneRunPlan[] = [];
  for (let r = 0; r < nRuns; r++) {
    const refPath = normals[order[r]];
    const rest = normals.filter((p) => p !== refPath);
    runs.push({
      index: r,
      refPath,
      testNormal: capEvenly(rest, maxTest),
      testAbnormal,
    });
  }
  return { ...base, runs };
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
