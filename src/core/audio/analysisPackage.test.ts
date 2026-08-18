import { describe, expect, it } from 'vitest';
import { createAnalysisPrompt } from './analysisPackage.js';

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
});
