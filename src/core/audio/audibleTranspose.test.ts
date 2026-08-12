/**
 * Tests für den Transponier-Faktor.
 *
 * Kernaussagen:
 * 1. Der Faktor bringt den Peak ans Ziel, solange die Grenzen es erlauben, und
 *    meldet ehrlich, wenn er begrenzt wurde.
 * 2. Die Untergrenze schützt die Rhythmus-Wahrnehmung: 16 kHz landet NICHT bei
 *    3 kHz, weil der Takt dabei zu weit gestreckt würde.
 *
 * Die Peak-SUCHE selbst ist in fineSpectrogram.test.ts geprüft — sie arbeitet
 * dort auf der vollen Auflösung statt auf den 512 Bändern.
 */

import { describe, it, expect } from 'vitest';
import { planTranspose, AUDIBLE_TARGET_HZ, MIN_FACTOR, MAX_FACTOR } from './audibleTranspose.js';

describe('planTranspose', () => {
  it('bringt einen mittelhohen Peak exakt auf die Zielfrequenz', () => {
    const plan = planTranspose(6000);
    expect(plan.factor).toBeCloseTo(0.5, 10);
    expect(plan.resultHz).toBeCloseTo(AUDIBLE_TARGET_HZ, 6);
    expect(plan.clamped).toBe(false);
  });

  it('begrenzt nach unten und meldet das — 16 kHz landet NICHT bei 3 kHz', () => {
    // Ideal wäre 3000/16000 = 0,1875. Das streckt einen Takt von 120/min auf
    // 22/min, also unter die Wahrnehmungsgrenze für Rhythmus.
    const plan = planTranspose(16000);
    expect(plan.factor).toBe(MIN_FACTOR);
    expect(plan.clamped).toBe(true);
    expect(plan.resultHz).toBeCloseTo(4000, 6); // 16000 × 0,25
    // Immer noch klar besser als unbehandelt: 4 kHz ist hörbar, 16 kHz kaum.
    expect(plan.resultHz).toBeLessThan(6000);
  });

  it('begrenzt nach oben für sehr tieffrequente Unterschiede', () => {
    const plan = planTranspose(200);
    expect(plan.factor).toBe(MAX_FACTOR);
    expect(plan.clamped).toBe(true);
    expect(plan.resultHz).toBeCloseTo(400, 6);
  });

  it('lässt einen Peak im Zielbereich praktisch unangetastet', () => {
    const plan = planTranspose(3000);
    expect(plan.factor).toBeCloseTo(1, 10);
    expect(plan.clamped).toBe(false);
  });

  it('ist monoton: ein höherer Peak führt nie zu einem größeren Faktor', () => {
    const factors = [500, 1000, 3000, 8000, 16000].map((hz) => planTranspose(hz).factor);
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeLessThanOrEqual(factors[i - 1]);
    }
  });

  it('weist unmögliche Frequenzen als Programmierfehler ab', () => {
    expect(() => planTranspose(0)).toThrow(/müssen > 0 sein/);
    expect(() => planTranspose(-100)).toThrow(/müssen > 0 sein/);
    expect(() => planTranspose(1000, 0)).toThrow(/müssen > 0 sein/);
  });
});
