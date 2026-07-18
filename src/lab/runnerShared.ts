/**
 * ZANOBOT · Mess-Labor — shared browser-runner helpers.
 *
 * Decoding + the production feature pipeline, plus small cooperative-yield and
 * abort utilities, shared by both runners (AUC one-class and gut/schlecht
 * classification). Keeps engine reuse and the "exact product pipeline" contract
 * in one place.
 */

import { extractFeatures, DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import type { FeatureVector } from '@data/types.js';
import type { FrameInput } from '@core/ml/engine/types.js';

/** YAMNet scoring window over the raw waveform (≈ the product's 1-s ring buffer). */
export const YAMNET_WINDOW_SEC = 1.0;
export const YAMNET_HOP_SEC = 0.5;

/** Minimal FrameInput for the async YAMNet path (it reads only rawChunk + rate). */
export function yamnetFrame(rawChunk: Float32Array, sampleRate: number): FrameInput {
  const empty = new Float64Array(0);
  return {
    feature: { features: empty, absoluteFeatures: empty, bins: 0, frequencyRange: [0, 0] },
    rawChunk,
    sampleRate,
  };
}

/** A WAV clip resolved to its bytes (the UI joins parsed paths back to Files). */
export interface ClipSource {
  /** Read the clip's raw bytes (called once, lazily). */
  read(): Promise<ArrayBuffer>;
}

/** Decoded clip: features for sync engines + raw mono for the async (YAMNet) path. */
export interface DecodedClip {
  features: FeatureVector[];
  raw: Float32Array;
  sampleRate: number;
}

/** Abort helper that throws a DOMException-like AbortError. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('Messung abgebrochen');
    err.name = 'AbortError';
    throw err;
  }
}

/** Yield to the event loop so the UI can paint progress and stay responsive. */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/** Average all channels of a decoded buffer to a single mono Float32Array. */
export function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const n = buffer.length;
  const mono = new Float32Array(n);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < n; i++) mono[i] += data[i];
  }
  for (let i = 0; i < n; i++) mono[i] /= buffer.numberOfChannels;
  return mono;
}

/** Decode one WAV clip and run the production feature pipeline over it. */
export async function decodeClip(ctx: AudioContext, src: ClipSource): Promise<DecodedClip> {
  const bytes = await src.read();
  const buffer = await ctx.decodeAudioData(bytes);
  const config = { ...DEFAULT_DSP_CONFIG, sampleRate: buffer.sampleRate };
  const features = extractFeatures(buffer, config);
  return { features, raw: toMono(buffer), sampleRate: buffer.sampleRate };
}

/** Create the shared AudioContext for a run (48 kHz product config). */
export async function makeAudioContext(): Promise<AudioContext> {
  const ctx = new AudioContext({ sampleRate: DEFAULT_DSP_CONFIG.sampleRate });
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* decodeAudioData still works while suspended */
    }
  }
  return ctx;
}

/** Concatenate raw waveform parts into one Float32Array. */
export function concatRaw(parts: Float32Array[]): Float32Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Cap a path list to the first N (deterministic; lists are pre-sorted). */
export function cap(paths: string[], max?: number): string[] {
  return max && max > 0 ? paths.slice(0, max) : paths;
}
