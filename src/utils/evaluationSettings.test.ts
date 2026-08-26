import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EVALUATION_ENGINE_EVENT,
  getEvaluationEngine,
  setEvaluationEngine,
} from './evaluationSettings.js';

const speicher = new Map<string, string>();

beforeEach(() => {
  speicher.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => speicher.get(key) ?? null,
    setItem: (key: string, value: string) => speicher.set(key, value),
  });
});

describe('GMIA-Produktweg', () => {
  it('normalisiert eine alte experimentelle Auswahl auf GMIA', () => {
    speicher.set('zanobot.evaluation.engine', 'yamnet');

    expect(getEvaluationEngine()).toBe('gmia');
    expect(speicher.get('zanobot.evaluation.engine')).toBe('gmia');
  });

  it('lässt für neue Referenzen auch über die alte API nur GMIA zu', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal(
      'CustomEvent',
      class<T> {
        constructor(
          public type: string,
          public init: { detail: T }
        ) {}
      }
    );

    expect(setEvaluationEngine('temporal')).toBe('gmia');
    expect(speicher.get('zanobot.evaluation.engine')).toBe('gmia');
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: EVALUATION_ENGINE_EVENT, init: { detail: 'gmia' } })
    );
  });
});
