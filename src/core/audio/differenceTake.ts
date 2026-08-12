/**
 * ZANOBOT — DIE DIFFERENZ ALS EIGENE „AUFNAHME"
 *
 * `isolateDifference` liefert Samples. Drei Stellen brauchen daraus mehr als das:
 *
 *  - der Hörknopf „nur die Differenz" braucht einen abspielbaren AudioBuffer,
 *  - die 3D-Ansicht braucht FFT-Frames für die Spektrogramm-Matrix,
 *  - die Transposition braucht das Spektrum, um den Peak zu finden.
 *
 * Alle drei sollen dasselbe Signal sehen — sonst zeigt das Auge etwas anderes,
 * als das Ohr hört. Und die spektrale Subtraktion ist teuer (STFT über beide
 * Aufnahmen), also darf sie nicht dreimal laufen.
 *
 * Deshalb hier: EIN Aufruf, gemerkt an der Messung. Der Cache ist eine WeakMap
 * auf den Mess-Buffer — verschwindet die Aufnahme, verschwindet der Eintrag.
 */

import type { FeatureVector } from '@data/types.js';
import { isolateDifference } from './differenceIsolation.js';
import { extractFeatures, DEFAULT_DSP_CONFIG } from '../dsp/features.js';
import { logger } from '@utils/logger.js';

export interface DifferenceTake {
  /** Abspielbares Differenz-Signal. */
  buffer: AudioBuffer;
  /** FFT-Frames desselben Signals (Produktions-Extraktion). */
  features: FeatureVector[];
}

/** Cache: Mess-Buffer → Differenz gegen die zugehörige Referenz. */
const cache = new WeakMap<AudioBuffer, { reference: AudioBuffer; take: DifferenceTake | null }>();

/** Mono-Samples in einen abspielbaren AudioBuffer verpacken. */
function samplesToAudioBuffer(samples: Float32Array, sampleRate: number): AudioBuffer | null {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  const ctx = new AudioCtx();
  try {
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  } finally {
    void ctx.close();
  }
}

/**
 * Differenz-Signal zwischen Referenz und Messung — abspielbar und analysierbar.
 *
 * Synchron und rechenintensiv (STFT beider Aufnahmen). Aufrufer sollten den
 * Aufruf hinter ein `setTimeout(…, 0)` legen, damit vorher noch ein
 * „berechne…"-Zustand gezeichnet werden kann.
 *
 * @returns Die Differenz, oder `null` wenn sie sich nicht bilden lässt (zu kurze
 *          Aufnahme, kein Web-Audio, Subtraktion ergab nichts).
 */
export function getDifferenceTake(
  reference: AudioBuffer,
  measurement: AudioBuffer
): DifferenceTake | null {
  const hit = cache.get(measurement);
  if (hit && hit.reference === reference) return hit.take;

  let take: DifferenceTake | null = null;
  try {
    const result = isolateDifference(reference, measurement);
    if (result.samples.length > 0) {
      const buffer = samplesToAudioBuffer(result.samples, result.sampleRate);
      if (buffer) {
        take = {
          buffer,
          features: extractFeatures(buffer, {
            ...DEFAULT_DSP_CONFIG,
            sampleRate: buffer.sampleRate,
          }),
        };
      }
    }
  } catch (error) {
    logger.warn('Differenz-Signal konnte nicht gebildet werden:', error);
    take = null;
  }

  // Auch das Scheitern wird gemerkt: ein zweiter teurer Versuch bringt nichts.
  cache.set(measurement, { reference, take });
  return take;
}
