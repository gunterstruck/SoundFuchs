/**
 * Tests für die Filterbank.
 *
 * Die wichtigste Aussage ist die erste: `linear-512` muss das historische
 * Verhalten von `binFrequencies` BIT-GENAU reproduzieren.
 *
 * Gegengeprüft wurde das zusätzlich Ende-zu-Ende gegen den ECHTEN alten Code aus
 * git (`extractFeatures` vom Stand auf main gegen den neuen, 8 s Signal bei
 * 48 kHz und 44,1 kHz, ~120.000 Werte je Rate, plus der Live-Pfad
 * `extractFeaturesFromChunk`): null Abweichung. Dieser Test hier ist die
 * dauerhafte Absicherung derselben Aussage, ohne den Altstand einzuchecken. Nur dann lässt sich
 * jeder Verbraucher, der heute „Band × 46,875 Hz" rechnet, verhaltensgleich auf
 * die Bank umstellen — und erst danach das Layout umschalten. Ohne diesen Beweis
 * wäre die Umstellung ein Blindflug.
 */

import { describe, it, expect } from 'vitest';
import {
  buildFilterBank,
  bandCenterHz,
  bandRangeHz,
  bandWidthHz,
  bandEdgesHz,
  hzToBand,
  rawBinWidthHz,
  LOW_BLOCK_MAX_HZ,
  CURRENT_FEATURE_LAYOUT,
  LEGACY_FEATURE_LAYOUT,
} from './filterBank.js';

const RAW = 8192;
const NY = 24000;
const BANDS = 512;

/**
 * Die historische Implementierung, wörtlich aus `features.binFrequencies`
 * übernommen (Stand vor der Filterbank). Referenz für die Bit-Gleichheit.
 */
function legacyBinFrequencies(magnitudes: Float64Array, numBins: number): Float64Array {
  const effectiveBins = Math.min(numBins, magnitudes.length);
  const binnedEnergy = new Float64Array(numBins);
  const binSize = Math.max(1, Math.floor(magnitudes.length / effectiveBins));

  for (let bin = 0; bin < effectiveBins; bin++) {
    const startIdx = bin * binSize;
    const endIdx = bin === effectiveBins - 1 ? magnitudes.length : (bin + 1) * binSize;
    let sum = 0;
    let count = 0;
    for (let i = startIdx; i < endIdx; i++) {
      sum += magnitudes[i] * magnitudes[i];
      count++;
    }
    const meanSquare = count > 0 ? sum / count : 0;
    binnedEnergy[bin] = Math.sqrt(meanSquare);
  }
  return binnedEnergy;
}

/** Bündelung über eine Bank — identisch zur neuen Implementierung in features.ts. */
function bandEnergies(
  magnitudes: Float64Array,
  bank: ReturnType<typeof buildFilterBank>
): Float64Array {
  const out = new Float64Array(bank.numBands);
  for (let b = 0; b < bank.numBands; b++) {
    const start = bank.edges[b];
    const end = bank.edges[b + 1];
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      sum += magnitudes[i] * magnitudes[i];
      count++;
    }
    out[b] = count > 0 ? Math.sqrt(sum / count) : 0;
  }
  return out;
}

/** Reproduzierbares Pseudo-Spektrum (kein Math.random – Tests müssen stabil sein). */
function spectrum(n: number, seed = 12345): Float64Array {
  const out = new Float64Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (s / 0x7fffffff) * (1 + Math.sin(i / 37));
  }
  return out;
}

describe('linear-512 reproduziert das historische Verhalten bit-genau', () => {
  it('gleiche Werte wie legacyBinFrequencies bei 8192 → 512', () => {
    const mags = spectrum(RAW);
    const bank = buildFilterBank('linear-512', BANDS, RAW, NY);
    const neu = bandEnergies(mags, bank);
    const alt = legacyBinFrequencies(mags, BANDS);
    expect(neu.length).toBe(alt.length);
    for (let i = 0; i < alt.length; i++) {
      // Bit-genau, nicht „nahe genug": dieselbe Summationsreihenfolge.
      expect(neu[i]).toBe(alt[i]);
    }
  });

  it('auch bei ungeradem Verhältnis — die Rest-Regel des letzten Bandes bleibt', () => {
    // 1000 Rohbins auf 512 Bänder: binSize = 1, das letzte belegte Band nimmt
    // den ganzen Rest. Genau die Regel, die still verschwinden könnte.
    for (const raw of [1000, 777, 513, 8191]) {
      const mags = spectrum(raw, raw);
      const bank = buildFilterBank('linear-512', BANDS, raw, NY);
      const neu = bandEnergies(mags, bank);
      const alt = legacyBinFrequencies(mags, BANDS);
      for (let i = 0; i < alt.length; i++) expect(neu[i]).toBe(alt[i]);
    }
  });

  it('mehr Bänder als Rohbins: überzählige Bänder bleiben leer wie vorher', () => {
    const mags = spectrum(100);
    const bank = buildFilterBank('linear-512', BANDS, 100, NY);
    const neu = bandEnergies(mags, bank);
    const alt = legacyBinFrequencies(mags, BANDS);
    for (let i = 0; i < alt.length; i++) expect(neu[i]).toBe(alt[i]);
    expect(neu[BANDS - 1]).toBe(0);
  });

  it('Bandbreite ist die bekannte 46,875 Hz', () => {
    const bank = buildFilterBank('linear-512', BANDS, RAW, NY);
    expect(bandWidthHz(bank, 0)).toBeCloseTo(46.875, 6);
    expect(bandWidthHz(bank, 300)).toBeCloseTo(46.875, 6);
    expect(bandCenterHz(bank, 0)).toBeCloseTo(23.4375, 6);
  });
});

describe('hybrid-512', () => {
  const bank = buildFilterBank('hybrid-512', BANDS, RAW, NY);

  it('löst unten mit der vollen Rohauflösung auf', () => {
    expect(rawBinWidthHz(bank)).toBeCloseTo(2.9297, 4);
    expect(bandWidthHz(bank, 0)).toBeCloseTo(rawBinWidthHz(bank), 6);
    expect(bandWidthHz(bank, 50)).toBeCloseTo(rawBinWidthHz(bank), 6);
  });

  it('trennt die Ordnungen eines 4-Zylinder-Viertakts bei 1800 min⁻¹', () => {
    // Zylinder 15 Hz, Kurbelwelle 30 Hz, Zündfolge 60 Hz, Harmonische 120/180/240.
    // Linear lagen 15 und 30 Hz gemeinsam in Band 0 — das ist der ganze Punkt.
    const bands = [15, 30, 60, 120, 180, 240].map((hz) => hzToBand(bank, hz));
    const unique = new Set(bands);
    expect(unique.size).toBe(bands.length);
    // Und aufsteigend, mit echtem Abstand
    for (let i = 1; i < bands.length; i++) expect(bands[i]).toBeGreaterThan(bands[i - 1]);

    const linear = buildFilterBank('linear-512', BANDS, RAW, NY);
    expect(hzToBand(linear, 15)).toBe(hzToBand(linear, 30)); // Gegenprobe: linear nicht trennbar
  });

  it('doppelt keinen Rohbin: jedes Band hat mindestens einen', () => {
    for (let b = 0; b < bank.numBands; b++) {
      expect(bank.edges[b + 1]).toBeGreaterThan(bank.edges[b]);
    }
    expect(bank.edges[bank.numBands]).toBe(RAW);
  });

  it('geht oben logarithmisch — gleiche Bänderzahl je Oktave', () => {
    const oct1 = hzToBand(bank, 2000) - hzToBand(bank, 1000);
    const oct2 = hzToBand(bank, 4000) - hzToBand(bank, 2000);
    const oct3 = hzToBand(bank, 8000) - hzToBand(bank, 4000);
    expect(oct2).toBeCloseTo(oct1, -1); // ±~5 Bänder Rundung
    expect(oct3).toBeCloseTo(oct1, -1);
  });

  it('deckt den ganzen Bereich lückenlos ab', () => {
    const edges = bandEdgesHz(bank);
    expect(edges.length).toBe(BANDS + 1);
    expect(edges[0]).toBe(0);
    expect(edges[BANDS]).toBeCloseTo(NY, 3);
    for (let b = 1; b <= BANDS; b++) expect(edges[b]).toBeGreaterThan(edges[b - 1]);
  });

  it('funktioniert auch bei 44,1 kHz (viele Telefone)', () => {
    const b441 = buildFilterBank('hybrid-512', BANDS, RAW, 22050);
    for (let b = 0; b < b441.numBands; b++) {
      expect(b441.edges[b + 1]).toBeGreaterThan(b441.edges[b]);
    }
    const bands = [15, 30, 60, 120].map((hz) => hzToBand(b441, hz));
    expect(new Set(bands).size).toBe(bands.length);
  });

  it('fällt auf linear zurück, wenn die FFT zu klein für den Hybrid ist', () => {
    // 64 Rohbins bei 24 kHz = 375 Hz pro Bin: der lineare Block würde 1 Band
    // umfassen und der Log-Teil hätte keine Bins. Dann lieber ehrlich linear.
    const tiny = buildFilterBank('hybrid-512', BANDS, 64, NY);
    const linear = buildFilterBank('linear-512', BANDS, 64, NY);
    expect(Array.from(tiny.edges)).toEqual(Array.from(linear.edges));
  });

  it('legt ~20 % der Bänder unter die Kniefrequenz', () => {
    const knee = hzToBand(bank, LOW_BLOCK_MAX_HZ);
    expect(knee / BANDS).toBeGreaterThan(0.15);
    expect(knee / BANDS).toBeLessThan(0.25);
  });
});

describe('hzToBand', () => {
  const bank = buildFilterBank('hybrid-512', BANDS, RAW, NY);

  it('ist konsistent mit bandRangeHz', () => {
    for (const hz of [5, 15, 60, 300, 1000, 5000, 20000]) {
      const b = hzToBand(bank, hz);
      const [lo, hi] = bandRangeHz(bank, b);
      expect(hz).toBeGreaterThanOrEqual(lo - 1e-6);
      expect(hz).toBeLessThanOrEqual(hi + 1e-6);
    }
  });

  it('klemmt außerhalb statt zu überlaufen', () => {
    expect(hzToBand(bank, -100)).toBe(0);
    expect(hzToBand(bank, 0)).toBe(0);
    expect(hzToBand(bank, 999999)).toBe(BANDS - 1);
  });
});

describe('Layout-Konstanten', () => {
  it('das aktive Layout ist noch das historische — der Wechsel kommt separat', () => {
    // Absichtlich festgenagelt: solange irgendein Verbraucher „Band × 46,875 Hz"
    // rechnet, würde ein Wechsel Masken und Beschriftungen still verschieben.
    expect(CURRENT_FEATURE_LAYOUT).toBe('linear-512');
    expect(LEGACY_FEATURE_LAYOUT).toBe('linear-512');
  });

  it('weist unbrauchbare Eingaben als Programmierfehler ab', () => {
    expect(() => buildFilterBank('linear-512', 0, RAW, NY)).toThrow(/numBands/);
    expect(() => buildFilterBank('linear-512', BANDS, 0, NY)).toThrow(/rawBins/);
    expect(() => buildFilterBank('linear-512', BANDS, RAW, 0)).toThrow(/nyquistHz/);
  });
});
