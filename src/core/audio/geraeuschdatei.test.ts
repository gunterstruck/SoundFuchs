/**
 * Die Suche nach der ruhigsten Stelle.
 *
 * Ein Video ist lang, das Interessante darin kurz. Welchen Abschnitt SoundFuchs
 * vorschlägt, ist eine Rechnung ohne Browser — und deshalb hier prüfbar.
 *
 * Gesucht wird nicht das lauteste und nicht das leiseste Fenster, sondern das
 * **gleichmäßigste**: Ein Übersteuern verdirbt die Analyse ebenso wie eine
 * Pause.
 */
import { describe, expect, it } from 'vitest';
import { istVideo, MINDESTDAUER, ruhigsteStelle } from './geraeuschdatei.js';

const RATE = 1000;

/** Ein Signal bauen: je Sekunde eine Amplitude. */
function signal(...sekunden: number[]): Float32Array {
  const daten = new Float32Array(sekunden.length * RATE);
  sekunden.forEach((amp, s) => {
    for (let i = 0; i < RATE; i += 1) {
      // Abwechselndes Vorzeichen: ein Ton, kein Gleichanteil.
      daten[s * RATE + i] = i % 2 === 0 ? amp : -amp;
    }
  });
  return daten;
}

describe('Die ruhigste Stelle', () => {
  it('meidet den lauten Anfang', () => {
    // 0–2 s laut und ungleichmäßig, 2–5 s gleichmäßig.
    const s = signal(0.9, 0.1, 0.3, 0.3, 0.3);
    expect(ruhigsteStelle(s, RATE, 3)).toBeGreaterThanOrEqual(2);
  });

  it('meidet Übersteuern, auch wenn es gleichmäßig ist', () => {
    // 0–3 s vollständig übersteuert (und damit sehr „gleichmäßig"),
    // 3–6 s ordentlich.
    const s = signal(1, 1, 1, 0.25, 0.25, 0.25);
    expect(ruhigsteStelle(s, RATE, 3)).toBeGreaterThanOrEqual(3);
  });

  it('meidet die Stille', () => {
    const s = signal(0, 0, 0, 0.3, 0.3, 0.3);
    expect(ruhigsteStelle(s, RATE, 3)).toBeGreaterThanOrEqual(3);
  });

  it('fängt vorn an, wenn das Stück kürzer als das Fenster ist', () => {
    expect(ruhigsteStelle(signal(0.3, 0.3), RATE, 10)).toBe(0);
  });

  it('fängt vorn an, wenn alles gleich klingt', () => {
    expect(ruhigsteStelle(signal(0.3, 0.3, 0.3, 0.3, 0.3), RATE, 3)).toBe(0);
  });

  it('bleibt im Stück', () => {
    const s = signal(0.9, 0.1, 0.3, 0.3, 0.3);
    const stelle = ruhigsteStelle(s, RATE, 3);
    expect(stelle + 3).toBeLessThanOrEqual(5);
  });
});

describe('Ist das ein Video?', () => {
  const datei = (name: string, typ: string) => new File([new Uint8Array(1)], name, { type: typ });

  it('erkennt es am Typ', () => {
    expect(istVideo(datei('a.mp4', 'video/mp4'))).toBe(true);
    expect(istVideo(datei('a.wav', 'audio/wav'))).toBe(false);
  });

  /** Manche Telefone liefern einen leeren Typ — dann zählt die Endung. */
  it('erkennt es ohne Typ an der Endung', () => {
    expect(istVideo(datei('IMG_0042.MOV', ''))).toBe(true);
    expect(istVideo(datei('aufnahme.m4a', ''))).toBe(false);
  });
});

describe('Die Grenzen', () => {
  it('nennt eine Mindestdauer, statt sie zu verstecken', () => {
    expect(MINDESTDAUER).toBe(1);
  });
});
