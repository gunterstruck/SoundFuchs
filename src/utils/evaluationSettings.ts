/**
 * Evaluation-engine selection.
 *
 * Product decision: NEW reference recordings are always trained with GMIA.
 * Diagnosis of EXISTING/imported models still dispatches by the model's own
 * engineId (see engine/registry.ts), so older experimental models remain
 * readable without exposing them as choices for new data.
 *
 * Mirrors the shape of recordingSettings.ts (localStorage + change event).
 */

import type { EngineId } from '@data/types.js';

export const EVALUATION_ENGINE_EVENT = 'zanobot:evaluation-engine-change';

const STORAGE_KEY = 'zanobot.evaluation.engine';

const DEFAULT_ENGINE: EngineId = 'gmia';

export const getEvaluationEngine = (): EngineId => {
  try {
    // Normalise a stale experimental selection from an older release. The
    // value is kept only as a migration key; it no longer controls new models.
    if (localStorage.getItem(STORAGE_KEY) !== DEFAULT_ENGINE) {
      localStorage.setItem(STORAGE_KEY, DEFAULT_ENGINE);
    }
  } catch {
    // Private browsing can make localStorage unavailable. GMIA still works.
  }
  return DEFAULT_ENGINE;
};

export const setEvaluationEngine = (_id: EngineId): EngineId => {
  const next = DEFAULT_ENGINE;
  try {
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent<EngineId>(EVALUATION_ENGINE_EVENT, { detail: next }));
  } catch (error) {
    throw new Error(
      `Failed to save evaluation engine: ${error instanceof Error ? error.message : 'localStorage not available'}`
    );
  }
  return next;
};
