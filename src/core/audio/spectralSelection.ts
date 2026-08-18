/**
 * ZANOBOT — EINEN ZEIT-/FREQUENZBEREICH HÖRBAR MACHEN
 *
 * Das Spektrogramm zeigt einen Ausschnitt, dieses Modul baut daraus die
 * passende Hörhilfe: Zeit ausschneiden, Frequenzband begrenzen, Ränder weich
 * ein-/ausblenden und mit definiertem Headroom auf eine gut hörbare Spitze
 * bringen. Die Eingabe wird nie verändert; das Ergebnis ist keine neue
 * Messung und darf nicht in die Bewertung zurücklaufen.
 */

export interface SpectralSelection {
  startSec: number;
  endSec: number;
  lowHz: number;
  highHz: number;
}

export interface SpectralSelectionMetrics {
  startSample: number;
  endSample: number;
  lowHz: number;
  highHz: number;
  outputPeak: number;
  gain: number;
}

export interface SpectralSelectionResult {
  channels: Float32Array[];
  metrics: SpectralSelectionMetrics;
}

export const SPECTRAL_SELECTION_CEILING = 0.9;
const TARGET_PEAK = 0.78;
const MAX_GAIN = 12;
const FADE_SECONDS = 0.012;
const MIN_SECONDS = 0.05;
const MIN_BAND_HZ = 20;
const EPSILON = 1e-7;

interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Auswahl auf Dauer und Nyquist begrenzen; unbrauchbare Rechtecke verwerfen. */
export function normalizeSpectralSelection(
  selection: SpectralSelection,
  durationSec: number,
  sampleRate: number
): SpectralSelection | null {
  if (!(durationSec > 0) || !(sampleRate > 0) || !Number.isFinite(durationSec)) return null;
  const nyquist = sampleRate / 2;
  const startSec = clamp(finite(selection.startSec), 0, durationSec);
  const endSec = clamp(finite(selection.endSec), 0, durationSec);
  const lowHz = clamp(finite(selection.lowHz), 0, nyquist);
  const highHz = clamp(finite(selection.highHz), 0, nyquist);
  const timeFrom = Math.min(startSec, endSec);
  const timeTo = Math.max(startSec, endSec);
  const freqFrom = Math.min(lowHz, highHz);
  const freqTo = Math.max(lowHz, highHz);
  if (timeTo - timeFrom < MIN_SECONDS || freqTo - freqFrom < MIN_BAND_HZ) return null;
  return { startSec: timeFrom, endSec: timeTo, lowHz: freqFrom, highHz: freqTo };
}

/** RBJ-Cookbook-Biquad; zwei passende Q-Stufen ergeben einen Butterworth-Filter 4. Ordnung. */
function biquad(
  kind: 'lowpass' | 'highpass',
  cutoffHz: number,
  sampleRate: number,
  q: number
): BiquadCoefficients {
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const cosine = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * q);
  const a0 = 1 + alpha;
  const common = kind === 'lowpass' ? 1 - cosine : 1 + cosine;
  return {
    b0: common / 2 / a0,
    b1: (kind === 'lowpass' ? common : -common) / a0,
    b2: common / 2 / a0,
    a1: (-2 * cosine) / a0,
    a2: (1 - alpha) / a0,
  };
}

function applyBiquad(input: Float32Array, coefficients: BiquadCoefficients): Float32Array {
  const output = new Float32Array(input.length);
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < input.length; i++) {
    const sample = finite(input[i]);
    const value = coefficients.b0 * sample + z1;
    z1 = coefficients.b1 * sample - coefficients.a1 * value + z2;
    z2 = coefficients.b2 * sample - coefficients.a2 * value;
    output[i] = finite(value);
  }
  return output;
}

function filterBand(
  input: Float32Array,
  lowHz: number,
  highHz: number,
  sampleRate: number
): Float32Array {
  const nyquist = sampleRate / 2;
  let output = input;
  // Q-Werte eines Butterworth-Filters 4. Ordnung. Zwei Stufen unterdrücken das
  // Motorgrundgeräusch deutlich, ohne den ausgewählten Ton schmalbandig klingeln zu lassen.
  const stages = [0.5411961, 1.306563];
  if (lowHz > 10) {
    const cutoff = clamp(lowHz, 10, nyquist * 0.96);
    for (const q of stages) output = applyBiquad(output, biquad('highpass', cutoff, sampleRate, q));
  }
  if (highHz < nyquist * 0.98) {
    const cutoff = clamp(highHz, 10, nyquist * 0.98);
    for (const q of stages) output = applyBiquad(output, biquad('lowpass', cutoff, sampleRate, q));
  }
  return output;
}

/** Reine Kanal-Funktion für Tests und Browser: schneiden, filtern, blenden, pegeln. */
export function isolateSpectralSelectionChannels(
  channels: readonly Float32Array[],
  sampleRate: number,
  selection: SpectralSelection
): SpectralSelectionResult | null {
  if (channels.length === 0 || !(sampleRate > 0) || !Number.isFinite(sampleRate)) return null;
  const sourceLength = Math.min(...channels.map((channel) => channel.length));
  if (sourceLength < 1) return null;
  const normalized = normalizeSpectralSelection(selection, sourceLength / sampleRate, sampleRate);
  if (!normalized) return null;

  const startSample = clamp(Math.floor(normalized.startSec * sampleRate), 0, sourceLength - 1);
  const endSample = clamp(Math.ceil(normalized.endSec * sampleRate), startSample + 1, sourceLength);
  const selectedLength = endSample - startSample;
  const filtered = channels.map((channel) => {
    const crop = new Float32Array(selectedLength);
    for (let i = 0; i < selectedLength; i++) crop[i] = finite(channel[startSample + i]);
    return filterBand(crop, normalized.lowHz, normalized.highHz, sampleRate);
  });

  const fadeLength = Math.min(
    Math.round(sampleRate * FADE_SECONDS),
    Math.floor(selectedLength / 2)
  );
  let peak = 0;
  for (const channel of filtered) {
    for (let i = 0; i < channel.length; i++) {
      let envelope = 1;
      if (fadeLength > 0 && i < fadeLength) {
        envelope = 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeLength);
      } else if (fadeLength > 0 && i >= channel.length - fadeLength) {
        envelope = 0.5 - 0.5 * Math.cos((Math.PI * (channel.length - 1 - i)) / fadeLength);
      }
      channel[i] = finite(channel[i]) * envelope;
      peak = Math.max(peak, Math.abs(channel[i]));
    }
  }
  if (peak <= EPSILON) return null;

  const gain = Math.min(MAX_GAIN, TARGET_PEAK / peak);
  let outputPeak = 0;
  for (const channel of filtered) {
    for (let i = 0; i < channel.length; i++) {
      channel[i] = clamp(
        channel[i] * gain,
        -SPECTRAL_SELECTION_CEILING,
        SPECTRAL_SELECTION_CEILING
      );
      outputPeak = Math.max(outputPeak, Math.abs(channel[i]));
    }
  }

  return {
    channels: filtered,
    metrics: {
      startSample,
      endSample,
      lowHz: normalized.lowHz,
      highHz: normalized.highHz,
      outputPeak,
      gain,
    },
  };
}

/** Neuen AudioBuffer der Auswahl bauen; die Aufnahme bleibt unverändert. */
export function createSpectralSelectionBuffer(
  source: AudioBuffer,
  selection: SpectralSelection
): { buffer: AudioBuffer; metrics: SpectralSelectionMetrics } | null {
  const channels = Array.from({ length: source.numberOfChannels }, (_, index) =>
    source.getChannelData(index)
  );
  const result = isolateSpectralSelectionChannels(channels, source.sampleRate, selection);
  if (!result) return null;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  const context = new AudioCtx();
  try {
    const buffer = context.createBuffer(
      result.channels.length,
      result.channels[0].length,
      source.sampleRate
    );
    for (let channel = 0; channel < result.channels.length; channel++) {
      buffer.getChannelData(channel).set(result.channels[channel]);
    }
    return { buffer, metrics: result.metrics };
  } finally {
    void context.close();
  }
}
