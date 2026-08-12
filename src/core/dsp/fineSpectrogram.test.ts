/**
 * Tests für das feine Anzeige-Spektrogramm.
 *
 * Kernaussage: An einem synthetischen 4-Zylinder-Viertakt bei 1800 min⁻¹ müssen
 * die Ordnungen 15/30/60/120 Hz in GETRENNTEN Spalten landen — genau das, was die
 * grobe 512-Band-Matrix nicht kann. Und der Peak muss auf wenige Hz genau
 * gefunden werden, weil der Transponier-Faktor direkt daraus folgt.
 */

import { describe, it, expect } from 'vitest';
import {
  buildFineSpectrogramMatrix,
  peakFrequencyFine,
  SPECTROGRAM_FINE_COLS,
} from './fineSpectrogram.js';
import { buildSpectrogramMatrix } from './spectrogram.js';
import { extractFeatures, DEFAULT_DSP_CONFIG } from './features.js';
import { freqToColumn } from './spectrogram.js';

const SR = 48000;

/** Minimaler AudioBuffer-Ersatz — vitest läuft ohne Web Audio. */
function fakeBuffer(samples: Float32Array, sampleRate = SR): AudioBuffer {
  return {
    sampleRate,
    length: samples.length,
    duration: samples.length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

/** Summe von Sinustönen, 2 s lang. */
function tones(freqs: number[], seconds = 2, amplitude = 0.3): Float32Array {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const f of freqs) v += Math.sin((2 * Math.PI * f * i) / SR);
    out[i] = (v / freqs.length) * amplitude;
  }
  return out;
}

describe('buildFineSpectrogramMatrix', () => {
  it('trennt die Ordnungen eines 4-Zylinder-Viertakts bei 1800 min⁻¹', () => {
    const m = buildFineSpectrogramMatrix(fakeBuffer(tones([15, 30, 60, 120])))!;
    expect(m).not.toBeNull();
    const col = (hz: number) => Math.floor(freqToColumn(hz, m.bandEdgesHz));
    const cols = [15, 30, 60, 120].map(col);
    expect(new Set(cols).size).toBe(4);
    for (let i = 1; i < cols.length; i++) expect(cols[i]).toBeGreaterThan(cols[i - 1]);
  });

  it('Gegenprobe: die grobe Matrix kann genau das nicht', () => {
    const features = extractFeatures(fakeBuffer(tones([15, 30, 60, 120])), {
      ...DEFAULT_DSP_CONFIG,
      sampleRate: SR,
    });
    const coarse = buildSpectrogramMatrix(features, DEFAULT_DSP_CONFIG.hopSize)!;
    const col = (hz: number) => Math.floor(freqToColumn(hz, coarse.bandEdgesHz));
    // 15 und 30 Hz liegen beide unterhalb der Untergrenze der groben Achse
    // (max(40 Hz, 2 × Bandbreite) = 93,75 Hz) und damit in derselben Spalte 0.
    expect(col(15)).toBe(col(30));
  });

  it('setzt das Maximum an die Frequenz des stärksten Tons', () => {
    const m = buildFineSpectrogramMatrix(fakeBuffer(tones([60], 2, 0.5)))!;
    let bestCol = -1;
    let best = -1;
    const midRow = Math.floor(m.rows / 2);
    for (let c = 0; c < m.cols; c++) {
      const v = m.values[midRow * m.cols + c];
      if (v > best) {
        best = v;
        bestCol = c;
      }
    }
    const expected = Math.floor(freqToColumn(60, m.bandEdgesHz));
    expect(Math.abs(bestCol - expected)).toBeLessThanOrEqual(1);
  });

  it('liefert die vereinbarte Geometrie und Werte in [0,1]', () => {
    const m = buildFineSpectrogramMatrix(fakeBuffer(tones([1000])))!;
    expect(m.cols).toBe(SPECTROGRAM_FINE_COLS);
    expect(m.bandEdgesHz.length).toBe(m.cols + 1);
    expect(m.maxFreqHz).toBe(SR / 2);
    // Unter der Uint16-Indexgrenze bleiben, sonst braucht das Mesh eine
    // WebGL-Erweiterung, die nicht jedes Gerät hat.
    expect(m.rows * m.cols).toBeLessThan(65535);
    for (const v of m.values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('gibt null zurück, wenn die Aufnahme kürzer als ein Fenster ist', () => {
    const short = new Float32Array(Math.floor(0.1 * SR));
    expect(buildFineSpectrogramMatrix(fakeBuffer(short))).toBeNull();
  });

  it('gibt null bei unbrauchbarer Sample-Rate zurück statt zu rechnen', () => {
    expect(buildFineSpectrogramMatrix(fakeBuffer(tones([100]), 0))).toBeNull();
  });

  it('funktioniert bei 44,1 kHz', () => {
    const n = Math.floor(2 * 44100);
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = 0.3 * Math.sin((2 * Math.PI * 60 * i) / 44100);
    const m = buildFineSpectrogramMatrix(fakeBuffer(s, 44100))!;
    expect(m).not.toBeNull();
    expect(m.maxFreqHz).toBe(22050);
  });
});

describe('peakFrequencyFine', () => {
  it('findet 60 Hz auf wenige Hz genau — grob wären es 47 Hz Raster', () => {
    const hz = peakFrequencyFine(fakeBuffer(tones([60], 2, 0.5)))!;
    expect(hz).toBeGreaterThan(50);
    expect(hz).toBeLessThan(70);
  });

  it('findet einen hochfrequenten Peak genauso', () => {
    const hz = peakFrequencyFine(fakeBuffer(tones([6000], 2, 0.5)))!;
    expect(Math.abs(hz - 6000)).toBeLessThan(60); // < 1 %
  });

  it('mittelt über die Zeit: eine Dauerlinie schlägt einen einzelnen Ausschlag', () => {
    const n = Math.floor(2 * SR);
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = 0.3 * Math.sin((2 * Math.PI * 3000 * i) / SR);
    // Ein kurzer, lauter Knall bei ~8 kHz über 20 ms
    for (let i = SR; i < SR + Math.floor(0.02 * SR); i++) {
      s[i] += 0.9 * Math.sin((2 * Math.PI * 8000 * i) / SR);
    }
    const hz = peakFrequencyFine(fakeBuffer(s))!;
    expect(Math.abs(hz - 3000)).toBeLessThan(100);
  });

  it('gibt null zurück, wenn nichts Verwertbares da ist', () => {
    expect(peakFrequencyFine(fakeBuffer(new Float32Array(100)))).toBeNull();
    expect(peakFrequencyFine(fakeBuffer(tones([100]), 0))).toBeNull();
    // Stille: kein Peak über Null
    expect(peakFrequencyFine(fakeBuffer(new Float32Array(Math.floor(2 * SR))))).toBeNull();
  });
});
