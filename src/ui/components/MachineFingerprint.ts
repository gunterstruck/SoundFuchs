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
import { signedColor } from '@core/dsp/klangfarben.js';

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
 * Dieselbe runde Form, aber zwei Spektren übereinander: der Normalzustand als
 * ruhige Linie, die Messung als kräftige Linie darauf, und der Zwischenraum in
 * der Richtungsfarbe — warm, wo die Messung lauter ist, kühl, wo sie leiser
 * ist.
 *
 * Warum rund und nicht flach: Der Auftraggeber hat es am 22.08.2026 so
 * beschrieben — „man kann direkt schnell erkennen, ob es wenigstens ähnlich
 * ist". Ein Spektrogramm muss man lesen; einen Ring sieht man. Ein glatter
 * Ring heißt gleich, eine Zacke heißt anders, und man braucht dafür weder
 * Achsenbeschriftung noch Übung.
 *
 * Die Farben sind NICHT die der Einzel-Iris, sondern die des Unterschieds
 * (`core/dsp/klangfarben.ts`). Wer im Spektrogramm gelernt hat, dass Warm
 * „mehr geworden" heißt, soll es hier nicht neu lernen müssen.
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
   * 0. Der Normalzustand als ruhige Fläche.
   *
   * Ohne sie standen im ersten Aufmaß zwei helle Linien fast deckungsgleich
   * übereinander, und man sah weder die eine noch die andere. Die Fläche ist
   * die Form, gegen die verglichen wird — sie muss zu sehen sein, auch da, wo
   * nichts abweicht.
   */
  ctx.beginPath();
  for (let p = 0; p <= punkte; p++) {
    const { x, y } = ort(normA[p % punkte], p % punkte);
    if (p === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(71, 85, 105, 0.55)';
  ctx.fill();

  // 1. Der Zwischenraum, Sektor für Sektor in der Richtungsfarbe.
  for (let p = 0; p < punkte; p++) {
    const q = (p + 1) % punkte;
    const abstand = (Math.abs(normB[p] - normA[p]) + Math.abs(normB[q] - normA[q])) / 2;
    if (abstand < 0.004) continue;
    const richtung = normB[p] + normB[q] >= normA[p] + normA[q] ? 1 : -1;
    // Der Abstand ist ein Anteil des Radius; ×3 macht kleine Abweichungen
    // sichtbar, ohne dass große sofort in die Sättigung laufen.
    const [r, g, bl] = signedColor(Math.min(1, abstand * 3), richtung);
    const a1 = ort(normA[p], p);
    const a2 = ort(normA[q], q);
    const b1 = ort(normB[p], p);
    const b2 = ort(normB[q], q);
    ctx.beginPath();
    ctx.moveTo(a1.x, a1.y);
    ctx.lineTo(a2.x, a2.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.closePath();
    const farbe = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(bl * 255)})`;
    ctx.fillStyle = farbe;
    ctx.fill();
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

  // 2. Der Normalzustand als ruhige Linie — die Form, gegen die man vergleicht.
  linie(normA, 'rgba(148, 163, 184, 0.95)', 1.5);
  // 3. Die Messung darauf, kräftiger: Sie ist das Neue.
  linie(normB, 'rgba(241, 245, 249, 0.95)', 2);
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
