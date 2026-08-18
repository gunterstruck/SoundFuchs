/**
 * ZANOBOT — DIE DIFFERENZ IN DER MESSUNG HERVORHEBEN
 *
 * Die reine Differenz ist ein gutes Suchlicht, klingt aber nicht mehr wie die
 * Maschine. Diese Stufe legt das Differenz-Signal deshalb dosiert zurück in die
 * Messung. Das Ergebnis ist ausschliesslich eine Hörhilfe: Originalbuffer,
 * Bewertung und gespeicherte Daten werden nie verändert.
 *
 * `differenceIsolation` normalisiert die isolierte Differenz absichtlich auf
 * einen gut hörbaren Spitzenpegel. Ihre absolute Lautstärke ist damit keine
 * physikalische Messgrösse mehr. Hier wird sie deshalb relativ zur RMS-Lautheit
 * der Messung dosiert, danach wird die Gesamtlautheit wieder an die Messung
 * angeglichen und zuletzt ein definierter Headroom erzwungen. So bedeutet
 * „Stark" mehr Anteil des Unterschieds — nicht bloss mehr Gesamtlautstärke.
 */

export type DifferenceHighlightStrength = 'clear' | 'strong';

/** Kein abgeleitetes Signal darf diese digitale Spitze überschreiten. */
export const DIFFERENCE_HIGHLIGHT_CEILING = 0.92;

/** Messwerte für Tests und Diagnose — sie werden nicht zur Bewertung benutzt. */
export interface DifferenceHighlightMetrics {
  applied: boolean;
  measurementRms: number;
  differenceRms: number;
  outputRms: number;
  outputPeak: number;
  differenceGain: number;
  loudnessDeltaDb: number;
  limiterGain: number;
}

export interface DifferenceHighlightResult {
  channels: Float32Array[];
  metrics: DifferenceHighlightMetrics;
}

const EPSILON = 1e-7;
const MAX_DIFFERENCE_GAIN = 32;
const FADE_SECONDS = 0.012;

/** Zielanteil der Differenz relativ zur RMS-Lautheit der Messung. */
const TARGET_DIFFERENCE_RMS: Record<DifferenceHighlightStrength, number> = {
  clear: 0.45,
  strong: 0.85,
};

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function rms(channels: readonly Float32Array[]): number {
  let sum = 0;
  let count = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      const sample = finite(channel[i]);
      sum += sample * sample;
      count++;
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

function peak(channels: readonly Float32Array[]): number {
  let result = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      result = Math.max(result, Math.abs(finite(channel[i])));
    }
  }
  return result;
}

function dbRatio(value: number, reference: number): number {
  if (value <= EPSILON || reference <= EPSILON) return 0;
  return 20 * Math.log10(value / reference);
}

function cleanCopy(channels: readonly Float32Array[]): Float32Array[] {
  return channels.map((input) => {
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) output[i] = finite(input[i]);
    return output;
  });
}

function unchanged(
  channels: readonly Float32Array[],
  differenceRms = 0
): DifferenceHighlightResult {
  const output = cleanCopy(channels);
  const measurementRms = rms(output);
  return {
    channels: output,
    metrics: {
      applied: false,
      measurementRms,
      differenceRms,
      outputRms: measurementRms,
      outputPeak: peak(output),
      differenceGain: 0,
      loudnessDeltaDb: 0,
      limiterGain: 1,
    },
  };
}

/**
 * Hebt eine normalisierte Mono-Differenz in einer ein- oder mehrkanaligen
 * Messung hervor. Die Eingaben bleiben unverändert.
 */
export function highlightDifferenceChannels(
  measurementChannels: readonly Float32Array[],
  difference: Float32Array,
  strength: DifferenceHighlightStrength,
  sampleRate: number
): DifferenceHighlightResult {
  if (measurementChannels.length === 0 || difference.length === 0) {
    return unchanged(measurementChannels);
  }

  const measurementRms = rms(measurementChannels);
  if (measurementRms <= EPSILON) return unchanged(measurementChannels);

  const longestChannel = Math.max(0, ...measurementChannels.map((channel) => channel.length));
  const overlap = Math.min(longestChannel, difference.length);
  if (overlap === 0) return unchanged(measurementChannels);

  // Nur den zugemischten Anteil ein- und ausblenden. Die Messung selbst bleibt
  // auch an den Rändern unangetastet; beim Umschalten entsteht dadurch kein
  // künstlicher Knackser aus einem abrupt beginnenden Residuum.
  const fadedDifference = new Float32Array(overlap);
  const safeRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 48_000;
  const fadeLength = Math.min(Math.round(safeRate * FADE_SECONDS), Math.floor(overlap / 2));
  for (let i = 0; i < overlap; i++) {
    let envelope = 1;
    if (fadeLength > 0 && i < fadeLength) {
      envelope = 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeLength);
    } else if (fadeLength > 0 && i >= overlap - fadeLength) {
      envelope = 0.5 - 0.5 * Math.cos((Math.PI * (overlap - 1 - i)) / fadeLength);
    }
    fadedDifference[i] = finite(difference[i]) * envelope;
  }

  const differenceRms = rms([fadedDifference]);
  if (differenceRms <= EPSILON) return unchanged(measurementChannels, differenceRms);

  const targetRms = measurementRms * TARGET_DIFFERENCE_RMS[strength];
  const differenceGain = Math.min(MAX_DIFFERENCE_GAIN, targetRms / differenceRms);
  const mixed = cleanCopy(measurementChannels);
  for (const channel of mixed) {
    const count = Math.min(channel.length, fadedDifference.length);
    for (let i = 0; i < count; i++) channel[i] += fadedDifference[i] * differenceGain;
  }

  // Lautheitsabgleich: Erst nachdem der Unterschied beigemischt wurde, wird die
  // gesamte Hörhilfe wieder auf die RMS-Lautheit der Messung gebracht.
  const mixedRms = rms(mixed);
  const loudnessGain = mixedRms > EPSILON ? measurementRms / mixedRms : 1;
  for (const channel of mixed) {
    for (let i = 0; i < channel.length; i++) channel[i] *= loudnessGain;
  }

  // Ein transparenter Peak-Limiter als letzte Schranke. Er greift nur ein,
  // wenn der definierte Headroom sonst überschritten würde. Keine Probe wird
  // weichgesättigt oder klanglich als „besser" dargestellt.
  const matchedPeak = peak(mixed);
  const limiterGain =
    matchedPeak > DIFFERENCE_HIGHLIGHT_CEILING ? DIFFERENCE_HIGHLIGHT_CEILING / matchedPeak : 1;
  if (limiterGain < 1) {
    for (const channel of mixed) {
      for (let i = 0; i < channel.length; i++) channel[i] *= limiterGain;
    }
  }

  const outputRms = rms(mixed);
  return {
    channels: mixed,
    metrics: {
      applied: true,
      measurementRms,
      differenceRms,
      outputRms,
      outputPeak: peak(mixed),
      differenceGain,
      loudnessDeltaDb: dbRatio(outputRms, measurementRms),
      limiterGain,
    },
  };
}

/** Baut aus der Hörhilfe einen neuen AudioBuffer. Keiner der Eingaben mutiert. */
export function createDifferenceHighlightBuffer(
  measurement: AudioBuffer,
  difference: AudioBuffer,
  strength: DifferenceHighlightStrength
): { buffer: AudioBuffer; metrics: DifferenceHighlightMetrics } | null {
  if (
    measurement.numberOfChannels < 1 ||
    difference.numberOfChannels < 1 ||
    measurement.length < 1 ||
    measurement.sampleRate !== difference.sampleRate
  ) {
    return null;
  }

  const channels = Array.from({ length: measurement.numberOfChannels }, (_, index) =>
    measurement.getChannelData(index)
  );
  const result = highlightDifferenceChannels(
    channels,
    difference.getChannelData(0),
    strength,
    measurement.sampleRate
  );

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  const ctx = new AudioCtx();
  try {
    const buffer = ctx.createBuffer(
      measurement.numberOfChannels,
      measurement.length,
      measurement.sampleRate
    );
    for (let channel = 0; channel < result.channels.length; channel++) {
      buffer.getChannelData(channel).set(result.channels[channel]);
    }
    return { buffer, metrics: result.metrics };
  } finally {
    void ctx.close();
  }
}
