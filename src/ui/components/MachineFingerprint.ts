/**
 * ZANOBOT - MACHINE FINGERPRINT ("acoustic portrait")
 *
 * Step 3: renders a machine's reference spectrum as a radial "iris" shape –
 * frequencies arranged around a circle, relative energy as radius. Each
 * machine thereby gets a recognizable visual signature that can sit on its
 * card, its detail view, or a printed NFC label.
 *
 * Purely decorative/identifying: it visualizes the stored reference, it does
 * not score or judge anything.
 */

import { setCanvasSize } from '@utils/canvasUtils.js';
import { turboColor } from '@core/dsp/klangfarben.js';

export interface FingerprintOptions {
  /** Number of points around the circle (the reference vector is averaged into this many). */
  points?: number;
  /** Inner radius as a fraction of the available radius (0..1). Default 0.45. */
  baseRadiusRatio?: number;
}

/**
 * Draws a radial acoustic fingerprint of a reference spectrum onto a canvas.
 *
 * Static, one-shot render – the portrait does not animate, so there is no
 * lifecycle to manage. Theme colors are read at render time.
 *
 * @param canvas - Target canvas element
 * @param vector - Reference spectrum (relative energy per frequency bin), e.g. a model's weight vector
 * @param options - Shape options
 */
export function renderMachineFingerprint(
  canvas: HTMLCanvasElement,
  vector: ArrayLike<number>,
  options: FingerprintOptions = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || vector.length === 0) return;

  setCanvasSize(canvas, ctx);

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  if (width <= 0 || height <= 0) return;

  const cx = width / 2;
  const cy = height / 2;

  const pointCount = Math.max(16, options.points ?? 120);
  const baseRatio = options.baseRadiusRatio ?? 0.45;

  // Downsample the reference vector into `pointCount` buckets on a LOGARITHMIC
  // frequency axis (equal angular space per octave). This spreads the low/mid
  // band – where machine tonal structure lives – around the circle instead of
  // squeezing it into a tiny arc, and gives the higher bands visible weight.
  const buckets = new Float32Array(pointCount);
  let max = 0;
  const iMin = 1; // skip DC bin
  const iMax = vector.length - 1;
  const logMin = Math.log(iMin);
  const logMax = Math.log(iMax);
  for (let p = 0; p < pointCount; p++) {
    const fStart = logMin + ((logMax - logMin) * p) / pointCount;
    const fEnd = logMin + ((logMax - logMin) * (p + 1)) / pointCount;
    const start = Math.max(iMin, Math.floor(Math.exp(fStart)));
    const end = Math.max(start + 1, Math.ceil(Math.exp(fEnd)));
    let sum = 0;
    let count = 0;
    for (let i = start; i < end && i < vector.length; i++) {
      sum += Math.max(0, vector[i]);
      count++;
    }
    const v = count > 0 ? sum / count : 0;
    buckets[p] = v;
    if (v > max) max = v;
  }
  if (max <= 0) max = 1;

  const maxRadius = Math.min(width, height) / 2 - 2;
  const baseRadius = maxRadius * baseRatio;
  const ampRadius = maxRadius - baseRadius;

  // Logarithmic (dB) amplitude: quiet components keep visible weight instead of
  // being crushed by the dominant tonal peaks. Mapped over a fixed dB range.
  const DB_RANGE = 45;
  const rim: { x: number; y: number }[] = [];
  const norms: number[] = [];
  for (let p = 0; p < pointCount; p++) {
    const db = 20 * Math.log10((buckets[p] + 1e-9) / (max + 1e-9));
    const norm = Math.min(1, Math.max(0, 1 + db / DB_RANGE));
    const r = baseRadius + norm * ampRadius;
    const angle = (p / pointCount) * Math.PI * 2 - Math.PI / 2;
    rim.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    norms.push(norm);
  }

  ctx.clearRect(0, 0, width, height);

  // Colour each radial sector by its strength: low → blue, mid → green,
  // high → light brown. Makes the "iris" vivid and, in a fleet grid, lets
  // differing machines stand out at a glance.
  for (let p = 0; p < pointCount; p++) {
    const curr = rim[p];
    const next = rim[(p + 1) % pointCount];
    const color = valueColor((norms[p] + norms[(p + 1) % pointCount]) / 2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(curr.x, curr.y);
    ctx.lineTo(next.x, next.y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    // Stroke with the same colour to hide hairline seams between sectors
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/**
 * DIE IRIS ALS VERGLEICH
 *
 * Dieselbe runde Form wie die Einzel-Iris und dieselbe Aussage ihrer Farben:
 * Der Körper ist die Messung, Sektor für Sektor nach der STÄRKE der Frequenz
 * eingefärbt — kalt heißt leise, rot heißt stark. Darüber liegt der
 * Normalzustand als weiße Umrisslinie.
 *
 * Warum rund und nicht flach: Der Auftraggeber hat es am 22.08.2026 so
 * beschrieben — „man kann direkt schnell erkennen, ob es wenigstens ähnlich
 * ist". Ein Spektrogramm muss man lesen; einen Ring sieht man. Ein glatter
 * Ring heißt gleich, eine Zacke heißt anders, und man braucht dafür weder
 * Achsenbeschriftung noch Übung.
 *
 * Die Farbskala ist `turboColor` — dieselbe wie im flachen Spektrogramm und im
 * Gebirge. Die alte Einzel-Iris hat eine eigene (blau → grün → braun); sie hier
 * zu übernehmen hieße, im selben Bildplatz zwei Stärkeskalen zu führen.
 *
 * Und es bleibt bei EINER Farbbedeutung. Die Richtung des Unterschieds liest
 * man an der Form: Wo Farbe über die Umrisslinie hinausragt, ist es lauter
 * geworden; wo die Linie außen liegt, leiser. Die Richtung in Farbe gibt es
 * eine Quelle weiter, unter „Unterschied".
 */
export function renderIrisVergleich(
  canvas: HTMLCanvasElement,
  referenz: ArrayLike<number>,
  messung: ArrayLike<number>,
  options: FingerprintOptions = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || referenz.length === 0 || messung.length === 0) return;

  setCanvasSize(canvas, ctx);
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  if (width <= 0 || height <= 0) return;

  const punkte = Math.max(16, options.points ?? 180);
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) / 2 - 4;
  const baseRadius = maxRadius * (options.baseRadiusRatio ?? 0.52);
  const ampRadius = maxRadius - baseRadius;

  /**
   * Beide Spektren auf DENSELBEN Maßstab.
   *
   * Jedes für sich zu normieren wäre der Fehler, der den ganzen Vergleich
   * wertlos macht: Eine durchweg doppelt so laute Messung sähe dann genauso
   * aus wie der Normalzustand. Der gemeinsame Höchstwert ist der Maßstab.
   */
  const a = irisStufen(referenz, punkte);
  const b = irisStufen(messung, punkte);
  const gemeinsam = Math.max(a.max, b.max);
  const normA = irisNormieren(a.werte, gemeinsam);
  const normB = irisNormieren(b.werte, gemeinsam);

  const ort = (norm: number, p: number): { x: number; y: number } => {
    const r = baseRadius + norm * ampRadius;
    const winkel = (p / punkte) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(winkel) * r, y: cy + Math.sin(winkel) * r };
  };

  ctx.clearRect(0, 0, width, height);

  /**
   * 1. Der Körper: die Messung, Sektor für Sektor nach STÄRKE eingefärbt.
   *
   * Kalt heißt leise, rot heißt stark — dieselbe Skala wie im flachen
   * Spektrogramm und im Gebirge (`turboColor`). Der Auftraggeber hat am
   * 22.08.2026 genau darauf hingewiesen: Die alte Iris hatte diese Farbe, die
   * erste Fassung des Vergleichs hatte nur noch eine Linie im Kreis. Damit war
   * zwar die Form zu sehen, aber nicht mehr, WO die Maschine laut ist.
   *
   * Und es bleibt bei EINER Farbbedeutung im Bild. Die erste Fassung färbte
   * zusätzlich den Zwischenraum nach Richtung ein — zwei Farbsprachen in einem
   * Kreis, von denen man beim Hinsehen nicht weiß, welche gerade gilt. Die
   * Richtung liest man an der Form: Wo Farbe über die Umrisslinie des
   * Normalzustands hinausragt, ist es lauter geworden; wo die Linie außen
   * liegt, leiser.
   */
  for (let p = 0; p < punkte; p++) {
    const q = (p + 1) % punkte;
    const [r, g, bl] = turboColor((normB[p] + normB[q]) / 2);
    const farbe = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(bl * 255)})`;
    const b1 = ort(normB[p], p);
    const b2 = ort(normB[q], q);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.closePath();
    ctx.fillStyle = farbe;
    ctx.fill();
    // Mit derselben Farbe nachziehen: sonst bleiben Haarlinien zwischen den
    // Sektoren stehen.
    ctx.strokeStyle = farbe;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const linie = (norm: Float32Array, farbe: string, breite: number): void => {
    ctx.beginPath();
    for (let p = 0; p <= punkte; p++) {
      const { x, y } = ort(norm[p % punkte], p % punkte);
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = farbe;
    ctx.lineWidth = breite;
    ctx.stroke();
  };

  /**
   * 2. Der Normalzustand als Umrisslinie — der Maßstab, nicht der Inhalt.
   *
   * Weiß und gestrichelt: Sie muss über jeder Turbo-Farbe lesbar sein, von
   * tiefem Blau bis Rot, und sie darf nicht wie ein Teil des Spektrums
   * aussehen. Ein durchgezogener heller Strich täte beides nicht.
   */
  ctx.setLineDash([5, 4]);
  linie(normA, 'rgba(255, 255, 255, 0.92)', 2);
  ctx.setLineDash([]);
}

/** Ein Spektrum in `punkte` Sektoren auf logarithmischer Frequenzachse. */
function irisStufen(
  vector: ArrayLike<number>,
  punkte: number
): { werte: Float32Array; max: number } {
  const werte = new Float32Array(punkte);
  let max = 0;
  const iMin = 1;
  const iMax = vector.length - 1;
  const logMin = Math.log(iMin);
  const logMax = Math.log(Math.max(iMin + 1, iMax));
  for (let p = 0; p < punkte; p++) {
    const start = Math.max(iMin, Math.floor(Math.exp(logMin + ((logMax - logMin) * p) / punkte)));
    const ende = Math.max(
      start + 1,
      Math.ceil(Math.exp(logMin + ((logMax - logMin) * (p + 1)) / punkte))
    );
    let summe = 0;
    let anzahl = 0;
    for (let i = start; i < ende && i < vector.length; i++) {
      summe += Math.max(0, vector[i]);
      anzahl++;
    }
    const v = anzahl > 0 ? summe / anzahl : 0;
    werte[p] = v;
    if (v > max) max = v;
  }
  return { werte, max };
}

/** dB gegen einen gemeinsamen Höchstwert, auf 0..1 gestaucht. */
function irisNormieren(werte: Float32Array, max: number): Float32Array {
  const DB_RANGE = 45;
  const bezug = max > 0 ? max : 1;
  const raus = new Float32Array(werte.length);
  for (let p = 0; p < werte.length; p++) {
    const db = 20 * Math.log10((werte[p] + 1e-9) / (bezug + 1e-9));
    raus[p] = Math.min(1, Math.max(0, 1 + db / DB_RANGE));
  }
  return raus;
}

/**
 * Map a normalized strength [0,1] to the iris colour ramp:
 * blue (low) → green (mid) → light brown (high).
 */
function valueColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const blue = [59, 130, 246];
  const green = [34, 197, 94];
  const brown = [184, 146, 90];
  const lerp = (a: number[], b: number[], k: number): number[] => [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
  const c =
    clamped < 0.5 ? lerp(blue, green, clamped * 2) : lerp(green, brown, (clamped - 0.5) * 2);
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
