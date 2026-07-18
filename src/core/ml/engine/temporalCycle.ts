/**
 * ZANOBOT — Tier 2 Zyklus-Pfad (T4, Stufe T2-a3)
 *
 * Reine Helfer für getaktete Maschinen (Konzept §4.5): Beim Anlernen wird
 * die dominante Periode der ENERGIE-Hüllkurve per Autokorrelation gesucht;
 * ist sie stabil und sind genug volle Zyklen vorhanden, entsteht ein
 * Zyklus-Template (mittlere Hüllkurve eines Zyklus, gain-normiert). In der
 * Diagnose wird der letzte Live-Zyklus per DTW mit Sakoe-Chiba-Band gegen
 * das Template gewarpt: moderate Tempo-/Lastvarianz wird toleriert
 * (±15 % Warping), ein fehlender oder vertauschter Phasenabschnitt nicht
 * (Rückblick §6.7.3, Risiko R2).
 *
 * Warum die Hüllkurve? Die Frame-Bank (T1) ist per Konstruktion
 * REIHENFOLGE-blind (kNN gegen die Menge der Frames) und die relative ESD
 * ist amplituden-invariant — eine Maschine, die dieselben Klänge in
 * falscher Reihenfolge oder mit gespiegeltem Lastverlauf abspielt, ist für
 * T1–T3 unsichtbar. Genau diese Lücke schließt der Zyklus-Pfad.
 *
 * Kalibrierung: Selbst-DTW der Trainings-Zyklen gegen das Template
 * (Mittel + Streuung) — der Live-Abstand wird z-normiert bewertet
 * (Konzept §4.6). Kein Zustand, kein DOM — vollständig unit-testbar.
 */

/**
 * Suchbereich der Zyklusperiode (Sekunden). Untergrenze 1 s = bewusste
 * Domänentrennung: schnelle Takte (Ventil-Klacks alle 0,5 s) sind das
 * Revier des EREIGNIS-Pfads (T3, Dichte-Wächter) — ihre spikigen
 * Hüllkurven aliasen im 66-ms-Raster und eichen nicht stabil. Der
 * Zyklus-Pfad (T4) ist für langsame LASTZYKLEN (Presse, Roboterzelle).
 */
export const CYCLE_MIN_PERIOD_SEC = 1.0;
export const CYCLE_MAX_PERIOD_SEC = 8;

/** Mindestzahl VOLLER Zyklen in der Referenz (Kalibrierung braucht Streuung). */
export const CYCLE_MIN_CYCLES = 3;

/** Mindest-Prominenz des Autokorrelations-Peaks (r[P]/r[0]). */
export const CYCLE_AUTOCORR_MIN = 0.4;

/** Punkte des gespeicherten Zyklus-Templates (resampled). */
export const CYCLE_TEMPLATE_POINTS = 32;

/** Sakoe-Chiba-Band: erlaubtes Warping als Anteil der Template-Länge. */
export const DTW_BAND_FRACTION = 0.15;

/** Mindest-Stützstellen pro Live-Zyklus (sonst Kadenz zu grob → inaktiv). */
export const CYCLE_MIN_LIVE_SAMPLES = 12;

/** z-Kennlinie der Zyklus-Anomalie: 0 bis Z_OK, 1 ab Z_BAD. */
export const CYCLE_Z_OK = 2;
export const CYCLE_Z_BAD = 6;

/** Ergebnis der Template-Erstellung beim Anlernen. */
export interface CycleTemplate {
  /** Gain-normierte mittlere Hüllkurve EINES Zyklus (CYCLE_TEMPLATE_POINTS). */
  envelope: number[];
  periodSec: number;
  /** Selbst-DTW der Trainings-Zyklen gegen das Template (Kalibrierung). */
  selfDtwMean: number;
  selfDtwStd: number;
}

/**
 * Frame-RMS-Reihe aus dem Rohsignal im Extraktions-Raster (Fenster/Hop) —
 * die Energie-Hüllkurve fürs Training (Diagnose nutzt rmsAmplitude je Frame).
 */
export function frameRmsSeries(
  raw: Float32Array,
  windowSec: number,
  hopSec: number,
  sampleRate: number
): number[] {
  const win = Math.max(1, Math.floor(windowSec * sampleRate));
  const hop = Math.max(1, Math.floor(hopSec * sampleRate));
  const out: number[] = [];
  for (let start = 0; start + win <= raw.length; start += hop) {
    let sumSq = 0;
    for (let i = start; i < start + win; i++) sumSq += raw[i] * raw[i];
    out.push(Math.sqrt(sumSq / win));
  }
  return out;
}

/**
 * Dominante Periode der Hüllkurve per (mittelwertbereinigter) Autokorrelation.
 * @returns Periode + Peak-Stärke r[P]/r[0], oder null wenn nichts Stabiles.
 */
export function detectCyclePeriod(
  envelope: number[],
  sampleIntervalSec: number
): { periodSec: number; strength: number } | null {
  const n = envelope.length;
  if (n < 8 || sampleIntervalSec <= 0) return null;

  const mean = envelope.reduce((s, v) => s + v, 0) / n;
  const x = envelope.map((v) => v - mean);
  let r0 = 0;
  for (const v of x) r0 += v * v;
  if (r0 <= 0) return null;

  const minLag = Math.max(2, Math.round(CYCLE_MIN_PERIOD_SEC / sampleIntervalSec));
  // Periode muss ≥ CYCLE_MIN_CYCLES-mal in die Aufnahme passen
  const maxLag = Math.min(
    Math.round(CYCLE_MAX_PERIOD_SEC / sampleIntervalSec),
    Math.floor(n / CYCLE_MIN_CYCLES)
  );
  if (maxLag <= minLag) return null;

  let bestLag = -1;
  let bestR = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    for (let t = 0; t + lag < n; t++) r += x[t] * x[t + lag];
    r /= r0;
    if (r > bestR) {
      bestR = r;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestR < CYCLE_AUTOCORR_MIN) return null;

  // Subharmonische bevorzugen: wenn die halbe Periode fast genauso stark
  // ist, ist SIE die Grundperiode (Autokorrelation peakt auch bei 2P).
  const half = Math.round(bestLag / 2);
  if (half >= 2) {
    let rHalf = 0;
    for (let t = 0; t + half < n; t++) rHalf += x[t] * x[t + half];
    rHalf /= r0;
    if (rHalf >= bestR * 0.9) {
      if (half < minLag) {
        // Die Grundperiode liegt UNTER der Mindest-Zyklusdauer: das ist ein
        // schneller TAKT (Spike-Train, z. B. Ventil-Klacks alle 0,5 s) —
        // Revier des Ereignis-Pfads (T3). Ein Template auf der Harmonischen
        // wäre nur ein aliasendes Doppel-Spike-Muster → kein Zyklus.
        return null;
      }
      bestLag = half;
      bestR = rHalf;
    }
  }

  return { periodSec: bestLag * sampleIntervalSec, strength: bestR };
}

/** Lineares Resampling einer Reihe auf `points` Stützstellen. */
export function resampleTo(series: number[], points: number): number[] {
  const n = series.length;
  if (n === 0) return new Array<number>(points).fill(0);
  if (n === 1) return new Array<number>(points).fill(series[0]);
  const out = new Array<number>(points);
  for (let i = 0; i < points; i++) {
    const pos = (i * (n - 1)) / (points - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(n - 1, lo + 1);
    out[i] = series[lo] + (series[hi] - series[lo]) * (pos - lo);
  }
  return out;
}

/** Gain-Normierung: Hüllkurve auf Mittel 1 (Lautstärke-invariant). */
export function normalizeEnvelope(env: number[]): number[] {
  const mean = env.reduce((s, v) => s + v, 0) / (env.length || 1);
  if (mean <= 0) return env.map(() => 1);
  return env.map((v) => v / mean);
}

/**
 * DTW-Distanz zweier gleich langer Reihen mit Sakoe-Chiba-Band,
 * pfadlängen-normiert (Kosten |a−b| pro Schritt).
 */
export function dtwDistance(a: number[], b: number[], bandFraction = DTW_BAND_FRACTION): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return Number.POSITIVE_INFINITY;
  const band = Math.max(1, Math.ceil(Math.max(n, m) * bandFraction));
  const INF = Number.POSITIVE_INFINITY;

  // dp[i][j] = (Kosten, Pfadlänge) — kompakt als zwei Zeilen
  let prevCost = new Array<number>(m + 1).fill(INF);
  let prevLen = new Array<number>(m + 1).fill(0);
  let curCost = new Array<number>(m + 1).fill(INF);
  let curLen = new Array<number>(m + 1).fill(0);
  prevCost[0] = 0;

  for (let i = 1; i <= n; i++) {
    curCost.fill(INF);
    const jMin = Math.max(1, i - band);
    const jMax = Math.min(m, i + band);
    for (let j = jMin; j <= jMax; j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1]);
      // Vorgänger: diagonal (prev[j-1]), oben (prev[j]), links (cur[j-1])
      let bestCost = prevCost[j - 1];
      let bestLen = prevLen[j - 1];
      if (prevCost[j] < bestCost) {
        bestCost = prevCost[j];
        bestLen = prevLen[j];
      }
      if (curCost[j - 1] < bestCost) {
        bestCost = curCost[j - 1];
        bestLen = curLen[j - 1];
      }
      if (bestCost === INF) continue;
      curCost[j] = bestCost + cost;
      curLen[j] = bestLen + 1;
    }
    [prevCost, curCost] = [curCost, prevCost];
    [prevLen, curLen] = [curLen, prevLen];
  }

  const total = prevCost[m];
  const len = prevLen[m];
  return len > 0 && Number.isFinite(total) ? total / len : Number.POSITIVE_INFINITY;
}

/**
 * Zirkulare Phasen-Ausrichtung: Fenster so rotieren, dass es dem Template
 * am besten entspricht (Live-Zyklen beginnen an beliebiger Phase).
 */
export function alignPhase(window: number[], template: number[]): number[] {
  const n = window.length;
  if (n !== template.length || n === 0) return window;
  let bestShift = 0;
  let bestScore = -Infinity;
  for (let shift = 0; shift < n; shift++) {
    let score = 0;
    for (let i = 0; i < n; i++) score += window[(i + shift) % n] * template[i];
    if (score > bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = window[(i + bestShift) % n];
  return out;
}

/**
 * Zyklus-Template aus der Trainings-Hüllkurve: Periode suchen, Zyklen
 * segmentieren, mitteln, selbst-kalibrieren. null, wenn die Aufnahme nicht
 * (stabil genug) zyklisch ist oder zu wenige volle Zyklen enthält —
 * der Zyklus-Pfad bleibt dann einfach inaktiv (Quality-Gate §7).
 */
export function buildCycleTemplate(
  envelope: number[],
  sampleIntervalSec: number
): CycleTemplate | null {
  const detected = detectCyclePeriod(envelope, sampleIntervalSec);
  if (!detected) return null;

  const period = Math.max(2, Math.round(detected.periodSec / sampleIntervalSec));
  const cycles = Math.floor(envelope.length / period);
  if (cycles < CYCLE_MIN_CYCLES) return null;

  // Zyklen segmentieren, aufs Template-Raster bringen und PHASEN-ALIGNIEREN:
  // Referenzaufnahmen können aus konkatenierten Abschnitten bestehen
  // (Mess-Labor trainiert über mehrere Clips) — die Zyklusphase springt dann
  // an den Nahtstellen. Ohne Ausrichtung würde das Mittel die Form
  // verwaschen; bei durchgehenden Aufnahmen ist die Ausrichtung ~Identität.
  const resampled: number[][] = [];
  for (let c = 0; c < cycles; c++) {
    const slice = envelope.slice(c * period, (c + 1) * period);
    const cyc = normalizeEnvelope(resampleTo(slice, CYCLE_TEMPLATE_POINTS));
    resampled.push(resampled.length === 0 ? cyc : alignPhase(cyc, resampled[0]));
  }

  // Zwei-Pass-Template mit Ausreißer-Trimmen: Referenzen aus konkatenierten
  // Abschnitten (Mess-Labor) enthalten Zyklen, die eine Nahtstelle
  // überspannen — die dürfen weder das Template verschmieren noch die
  // Selbst-Kalibrierung aufblähen (sonst würde jede echte Abweichung an der
  // aufgeblähten Streuung gemessen). Die Norm ist der TYPISCHE Zyklus:
  // schlechteste 25 % verwerfen, Template + Kalibrierung aus dem Kern.
  const meanOfCycles = (set: number[][]): number[] => {
    const out = new Array<number>(CYCLE_TEMPLATE_POINTS).fill(0);
    for (const cyc of set) {
      for (let i = 0; i < CYCLE_TEMPLATE_POINTS; i++) out[i] += cyc[i];
    }
    for (let i = 0; i < CYCLE_TEMPLATE_POINTS; i++) out[i] /= set.length;
    return out;
  };

  const draft = meanOfCycles(resampled);
  const draftDistances = resampled.map((cyc) => dtwDistance(alignPhase(cyc, draft), draft));
  const sortedD = [...draftDistances].sort((a, b) => a - b);
  const q75 = sortedD[Math.floor(sortedD.length * 0.75)];
  const kept = resampled.filter((_, i) => draftDistances[i] <= q75);
  if (kept.length < CYCLE_MIN_CYCLES) return null;

  const template = meanOfCycles(kept);
  const distances = kept.map((cyc) => dtwDistance(alignPhase(cyc, template), template));
  const mean = distances.reduce((s, v) => s + v, 0) / distances.length;
  const variance =
    distances.reduce((s, v) => s + (v - mean) * (v - mean), 0) / distances.length;
  const std = Math.sqrt(variance);

  // Kalibrierungs-Qualitäts-Gate: Sind die Selbst-Distanzen substanziell UND
  // streuen sie nach dem Trimmen noch stark (spikige/aliasende Hüllkurve),
  // ist keine ehrliche Eichung möglich → Zyklus-Pfad lieber inaktiv als
  // fehlalarmierend (Tier-0-Disziplin: kein Baustein ohne stabile Eichung).
  // Bei glatten Hüllkurven sind die Distanzen absolut winzig (~0,002) und
  // ihre RELATIVE Streuung naturgemäß hoch — dort greift stattdessen der
  // std-Floor der z-Kennlinie (scoreCycleWindow).
  if (mean > 0.02 && std / mean > 0.8) return null;

  return {
    envelope: template,
    periodSec: period * sampleIntervalSec,
    selfDtwMean: mean,
    selfDtwStd: std,
  };
}

/**
 * Letzten Live-Zyklus gegen das Template bewerten.
 * @param windowEnv Hüllkurven-Fenster von GENAU einer Periode Dauer
 * @returns DTW-Abstand, z-Wert (selbst-kalibriert) und Anomalie ∈ [0,1]
 */
export function scoreCycleWindow(
  windowEnv: number[],
  template: CycleTemplate
): { dtw: number; z: number; anomaly: number } {
  const window = alignPhase(
    normalizeEnvelope(resampleTo(windowEnv, CYCLE_TEMPLATE_POINTS)),
    template.envelope
  );
  const dtw = dtwDistance(window, template.envelope);
  // std-Floor 50 % des Selbst-Mittels: perfekt gleichförmige Referenzen
  // sollen nicht überempfindlich werden — die Anomalie beginnt erst, wenn
  // der DTW-Abstand das Selbst-Niveau etwa VERDOPPELT (z=2), nicht schon
  // bei winziger Streuung. Gespiegelte/vertauschte Formen liegen beim
  // 10- bis 40-Fachen und bleiben klar bei Anomalie 1.
  const std = Math.max(template.selfDtwStd, template.selfDtwMean * 0.5, 1e-3);
  const z = (dtw - template.selfDtwMean) / std;
  const anomaly = Math.min(1, Math.max(0, (z - CYCLE_Z_OK) / (CYCLE_Z_BAD - CYCLE_Z_OK)));
  return { dtw, z, anomaly };
}
