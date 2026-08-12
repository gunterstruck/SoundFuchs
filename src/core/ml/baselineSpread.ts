/**
 * ZANOBOT — EIGENSTREUUNG EINER REFERENZ (robust: Median + MAD)
 *
 * Warum das hier steht:
 *
 * Jede Engine fittet ihre tanh²-Kennlinie so, dass die MITTLERE Trainings-
 * ähnlichkeit exakt `TARGET_SELF_SCORE` (0,9 → 90 %) ergibt, und kalibriert
 * den Live-Score danach mit `score / baselineScore · 100`, gedeckelt bei 100
 * (`gmia.ts` calculateScalingConstant, `SpectralCosineEngine` calibrateScore).
 * Folge: Die angezeigte Skala ist oben stark gestaucht. Auf der ausgelieferten
 * Kennlinie liest sich ein Verlust von 15 % relativer Ähnlichkeit noch als
 * ~94 % — und genau dort liegen die eigenen Cross-Device-Messwerte des
 * Projekts (93–94 %, README) und die Wiederholstreuung auf demselben Gerät
 * (95–97 %). Eine FESTE Prozentschwelle hat in diesem Band keinen stabilen
 * Platz: sie feuert auf Gerätewechsel und Messwiederholung, bevor sie auf eine
 * Maschinenänderung feuert.
 *
 * Einen stabilen Platz hat dagegen die Eigenstreuung der Referenz selbst.
 * `baselineScore` ist der MITTELWERT der Selbsttest-Scores und wirft die
 * Streuung weg. Dieses Modul behält sie robust daneben (Median + MAD), damit
 * eine Schwelle als „k · MAD unter dem Normalzustand DIESER Maschine"
 * ausgedrückt werden kann statt als runde Zahl.
 *
 * Das Rezept ist nicht neu: Der Drift-Detektor benutzt es seit
 * `calibrateAdaptiveThresholds` (`core/dsp/driftDetector.ts`) — Median ± k · MAD
 * aus Referenz-Partitionen, mit k = 3. Gleiches k, umgekehrtes Vorzeichen:
 * Drift ist ein ABSTAND (größer = schlechter), ein Score ist eine ÄHNLICHKEIT
 * (kleiner = schlechter).
 *
 * ABGRENZUNG: Der Live-ENTSCHEIDUNGSPFAD liest diese Felder weiterhin NICHT.
 * Die Ampel entscheidet unverändert an den beiden festen Schwellen. Gelesen
 * werden sie an zwei Stellen, die nichts entscheiden: das Mess-Labor berichtet
 * `baselineFloor` über echte Referenzen, und der Ergebnis-Screen SAGT die
 * Auflösung (`baselineResolution`) als eigene Zeile.
 *
 * Diese Reihenfolge ist Absicht. Eine Zahl erst anzeigen, dann — wenn sich über
 * genug Referenzen zeigt, wo sie liegt — die Schwelle darauf umstellen. Nicht
 * umgekehrt: Messgerät vor Experiment.
 */

import { mad, median } from '@core/dsp/driftDetector.js';

/**
 * k für die Schwelle „k · MAD unter dem Median der Eigenstreuung".
 *
 * 3 ist keine freie Wahl: `driftDetector.calibrateAdaptiveThresholds` benutzt
 * für dieselbe Aufgabe `median + 3 · MAD` (Warnung) und `median + 6 · MAD`
 * (kritisch). Übernommen wird die 3 — die 6 fällt weg, weil es künftig nur
 * noch EINE Schwelle mit EINER Konsequenz geben soll.
 */
export const DEFAULT_BASELINE_K = 3;

/** Ergebnis der Selbsttest-Statistik einer Referenz (rohe, unkalibrierte Scores). */
export interface BaselineSpread {
  /** Mittelwert — identisch mit dem historischen `baselineScore`. */
  mean: number;
  /** Median der Selbsttest-Scores (robust gegen einzelne Ausreißerframes). */
  median: number;
  /** MAD, auf σ skaliert (Faktor 1,4826) — wie im Drift-Detektor. */
  mad: number;
}

/**
 * Median + MAD + Mittelwert der Selbsttest-Scores eines frisch trainierten
 * Modells. Eingabe sind die ROHEN (unkalibrierten) Scores, aus denen bisher
 * nur der Mittelwert als `baselineScore` behalten wurde.
 *
 * @param selfScores Selbsttest-Scores des Modells gegen eigene Trainingsdaten.
 * @throws wenn die Liste leer ist — ohne Selbsttest gibt es keine Referenz.
 */
export function computeBaselineSpread(selfScores: number[]): BaselineSpread {
  if (selfScores.length === 0) {
    throw new Error('computeBaselineSpread: keine Selbsttest-Scores vorhanden.');
  }
  const sum = selfScores.reduce((acc, s) => acc + s, 0);
  return {
    mean: sum / selfScores.length,
    median: median(selfScores),
    mad: mad(selfScores),
  };
}

/**
 * Alles, was ein Modell mitbringen muss, um eine Schwelle aus seiner
 * Eigenstreuung ableiten zu können. Bewusst alle Felder optional: Altmodelle
 * (und die Temporal-Engine, siehe unten) tragen sie nicht.
 *
 * Die Temporal-Engine ist ausgenommen, weil ihr `baselineScore` KEIN Mittel
 * über eine Verteilung ist, sondern ein einzelner Skalar auf der aggregierten
 * Selbst-Ähnlichkeit (`TemporalEngine.train`: ein `aggSelfSim` pro Referenz).
 * Eine Streuung existiert dort nicht ohne ein anderes Konstruktionsprinzip
 * (z. B. LONO-Partitionen) — sie zu erfinden wäre eine Zahl ohne Messung.
 */
export interface BaselineSpreadCarrier {
  baselineScore?: number;
  baselineMedian?: number;
  baselineMad?: number;
}

/**
 * Was eine Referenz auflöst — dieselbe Rechnung wie `baselineFloor`, aber mit
 * den Zwischenwerten, die man braucht, um es SAGEN zu können.
 *
 * Die Zahl, die den Unterschied macht, ist `points`: der Abstand, den eine
 * Messung vom Normalzustand haben muss, um aus der Wiederholstreuung dieser
 * Referenz herauszuragen. Darunter ist ein Punkteverlust Rauschen — nicht die
 * Maschine. Das ist der Satz, der „ich diagnostiziere nicht" von einer Ausrede
 * trennt: Wer nicht diagnostiziert, muss sagen können, was er stattdessen
 * leistet.
 */
export interface BaselineResolution {
  /** Median der Eigenstreuung auf der angezeigten Skala (liegt bei ~100). */
  medianScore: number;
  /**
   * `k · MAD` auf der angezeigten Skala — die Auflösung in Punkten. Kleiner ist
   * besser: eine leise, gleichmäßige Maschine mit sauberer Aufnahme löst
   * feiner auf als eine mit schwankendem Betriebspunkt.
   */
  points: number;
  /** `medianScore − points`, geklemmt auf [0, 100] — der Boden. */
  floor: number;
  /** k, mit dem gerechnet wurde. */
  k: number;
}

/**
 * Auflösung und Boden einer Referenz auf der ANGEZEIGTEN (kalibrierten) Skala.
 *
 * Die Kalibrierung ist bis zum Deckel eine lineare Streckung um
 * `100 / baselineScore`, deshalb transformieren Median und MAD mit. Gerechnet
 * wird der Boden, nicht der Deckel — der Boden liegt immer unter 100.
 *
 * Der Median wird NICHT geklemmt: er darf über 100 liegen (bei linksschiefer
 * Selbsttest-Verteilung ist der Median größer als der Mittelwert, mit dem
 * kalibriert wird). Ihn auf 100 zu klemmen würde `points` still verkleinern und
 * die Auflösung besser aussehen lassen, als sie ist.
 *
 * @returns `null`, wenn das Modell die Streuung nicht mitbringt (Altmodelle,
 *          Temporal-Engine) — dann gibt es keine Zahl, und der Aufrufer muss
 *          das sagen statt eine zu erfinden.
 * @throws bei ungültigem k — das ist ein Programmierfehler, kein Datenfall.
 */
export function baselineResolution(
  model: BaselineSpreadCarrier,
  k: number = DEFAULT_BASELINE_K
): BaselineResolution | null {
  if (!Number.isFinite(k) || k < 0) {
    throw new Error(`baselineResolution: k muss endlich und ≥ 0 sein, war ${k}.`);
  }
  const { baselineScore, baselineMedian, baselineMad } = model;
  if (baselineScore === undefined || !(baselineScore > 0)) return null;
  if (baselineMedian === undefined || baselineMad === undefined) return null;
  if (!Number.isFinite(baselineMedian) || !Number.isFinite(baselineMad)) return null;
  if (baselineMad < 0) return null;

  const stretch = 100 / baselineScore;
  const medianScore = baselineMedian * stretch;
  const points = k * baselineMad * stretch;
  return {
    medianScore,
    points,
    floor: Math.max(0, Math.min(100, medianScore - points)),
    k,
  };
}

/**
 * Die Schwelle dieses Modells auf der ANGEZEIGTEN (kalibrierten) Skala:
 * `k · MAD` unter dem Median der Eigenstreuung.
 *
 * @returns Score in [0, 100], unter dem „nachsehen" gilt, oder `null`, wenn das
 *          Modell die Streuung nicht mitbringt (dann bleibt der Aufrufer bei
 *          seiner festen Schwelle).
 * @throws bei ungültigem k — das ist ein Programmierfehler, kein Datenfall.
 */
export function baselineFloor(
  model: BaselineSpreadCarrier,
  k: number = DEFAULT_BASELINE_K
): number | null {
  return baselineResolution(model, k)?.floor ?? null;
}

/**
 * Verteilung über MEHRERE Referenzen — die Messung, die vor jeder
 * Schwellenentscheidung stehen muss.
 *
 * Die offene Frage lautet: Liegt `baselineScore` in der Praxis wirklich dort,
 * wo die Kennlinie ihn verankert (knapp unter 90), oder streut er weit? Davon
 * hängt ab, ob eine feste Schwelle überhaupt irgendwo sitzen kann.
 * `baselineMin`/`baselineMax` beantworten genau das.
 */
export interface BaselineSpreadSummary {
  /** Modelle, die Streuung UND Baseline mitbrachten (Rest ignoriert). */
  n: number;
  /** Median / Spannweite der `baselineScore`-Werte über die Modelle. */
  baselineMedian: number;
  baselineMin: number;
  baselineMax: number;
  /** Median / Spannweite der Schwellen (`baselineFloor`) über die Modelle. */
  floorMedian: number;
  floorMin: number;
  floorMax: number;
  /** k, mit dem die Schwellen gerechnet wurden. */
  k: number;
}

/**
 * Fasst die Eigenstreuung einer Menge von Modellen zusammen. Modelle ohne
 * Streuungsfelder werden übersprungen (nicht geschätzt) — `n` sagt, wie viele
 * tatsächlich beigetragen haben.
 *
 * @returns `null`, wenn kein einziges Modell die Felder mitbrachte.
 */
export function summarizeBaselineSpread(
  models: ReadonlyArray<BaselineSpreadCarrier>,
  k: number = DEFAULT_BASELINE_K
): BaselineSpreadSummary | null {
  const baselines: number[] = [];
  const floors: number[] = [];
  for (const m of models) {
    const floor = baselineFloor(m, k);
    if (floor === null || m.baselineScore === undefined) continue;
    baselines.push(m.baselineScore);
    floors.push(floor);
  }
  if (baselines.length === 0) return null;
  return {
    n: baselines.length,
    baselineMedian: median(baselines),
    baselineMin: Math.min(...baselines),
    baselineMax: Math.max(...baselines),
    floorMedian: median(floors),
    floorMin: Math.min(...floors),
    floorMax: Math.max(...floors),
    k,
  };
}
