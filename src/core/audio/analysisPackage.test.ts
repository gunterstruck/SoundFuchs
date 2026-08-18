import { describe, expect, it } from 'vitest';
import { createAnalysisPrompt, measureRecordingQuality } from './analysisPackage.js';

function buffer(samples: number[], sampleRate = 4): AudioBuffer {
  const data = Float32Array.from(samples);
  return {
    numberOfChannels: 1,
    length: data.length,
    sampleRate,
    duration: data.length / sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe('createAnalysisPrompt', () => {
  it('trennt Hörhilfe, Messung und Hypothese ausdrücklich', () => {
    const prompt = createAnalysisPrompt({
      situation: {
        kind: 'vehicle-engine-bay',
        description: 'Fahrzeug · Motorraum',
        details: ['Motorhaube offen', 'warmer Leerlauf'],
      },
      machineName: 'Golf 7',
      selection: { startSec: 2, endSec: 4.5, lowHz: 1_000, highHz: 4_000 },
    });

    expect(prompt).toContain('Golf 7');
    expect(prompt).toContain('2.00–4.50 s und 1000–4000 Hz');
    expect(prompt).toContain('absichtlich verstärkte Hörhilfe');
    expect(prompt).toContain('keine sichere Diagnose');
    expect(prompt).toContain('Beobachtung, Interpretation und Hypothese');
  });

  it('lässt die Maschinenbezeichnung bei privatem Export weg', () => {
    const prompt = createAnalysisPrompt({
      situation: { kind: 'other', description: 'Schleifmaschine in der Garage' },
    });
    expect(prompt).toContain('Bezeichnung der Maschine/Anlage: nicht mitgegeben');
    expect(prompt).toContain('gesamte Aufnahme');
  });

  it('behauptet bei einer Einzelaufnahme weder Abweichung noch gesunde Referenz', () => {
    const prompt = createAnalysisPrompt({
      mode: 'single-recording',
      situation: { kind: 'vehicle-engine-bay', description: 'Motorraum, warmer Leerlauf' },
    });
    expect(prompt).toContain('KEINEN bekannten gesunden Normalzustand');
    expect(prompt).toContain('inneren Mustern derselben Aufnahme');
    expect(prompt).toContain('Vergleiche einen markierten Fokus mit dem Rest');
    expect(prompt).toContain('NAECHSTE-GEGENAUFNAHME.txt');
  });

  it('bezeichnet zwei unklare Aufnahmen nur als neutralen A/B-Kontrast', () => {
    const prompt = createAnalysisPrompt({
      mode: 'neutral-comparison',
      situation: { kind: 'other', description: 'Pumpe in zwei Betriebsstufen' },
    });
    expect(prompt).toContain('KEINE der beiden Aufnahmen ist als gesund bestätigt');
    expect(prompt).toContain('nie eine Seite als gesund oder defekt');
    expect(prompt).toContain('kontrast-hoerhilfe.wav');
  });
});

describe('measureRecordingQuality', () => {
  it('misst Pegel und markiert Übersteuerung, ohne einen Schaden zu bewerten', () => {
    const quality = measureRecordingQuality(buffer([0, 0.5, -1, 0.0005]));
    expect(quality.durationSec).toBe(1);
    expect(quality.peak).toBe(1);
    expect(quality.clippedSamplePercent).toBe(25);
    expect(quality.nearSilentSamplePercent).toBe(50);
    expect(quality.dominantPeakHz).toBeNull();
    expect(quality.notes.join(' ')).toMatch(/Übersteuerung/);
  });
});
