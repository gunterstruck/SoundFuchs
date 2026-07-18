/**
 * Evaluation-engine selection.
 *
 * Decides which engine trains NEW reference recordings. Default is 'gmia'
 * (unchanged behavior). Diagnosis of EXISTING models always dispatches by the
 * model's own engineId (see engine/registry.ts), so switching this setting
 * never breaks already-trained machines.
 *
 * Mirrors the shape of recordingSettings.ts (localStorage + change event).
 */

import type { EngineId } from '@data/types.js';

export const EVALUATION_ENGINE_EVENT = 'zanobot:evaluation-engine-change';

const STORAGE_KEY = 'zanobot.evaluation.engine';

const VALID_ENGINES: readonly EngineId[] = ['gmia', 'spectral-cosine', 'yamnet', 'temporal'];

const DEFAULT_ENGINE: EngineId = 'gmia';

const validateEngine = (value: string | null | undefined): EngineId => {
  if (value && (VALID_ENGINES as readonly string[]).includes(value)) {
    return value as EngineId;
  }
  return DEFAULT_ENGINE;
};

export const getEvaluationEngine = (): EngineId => {
  try {
    return validateEngine(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_ENGINE;
  }
};

export const setEvaluationEngine = (id: EngineId): EngineId => {
  const next = validateEngine(id);
  try {
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(
      new CustomEvent<EngineId>(EVALUATION_ENGINE_EVENT, { detail: next })
    );
  } catch (error) {
    throw new Error(
      `Failed to save evaluation engine: ${error instanceof Error ? error.message : 'localStorage not available'}`
    );
  }
  return next;
};
