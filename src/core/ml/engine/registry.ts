/**
 * ZANOBOT - Engine Registry & Dispatch
 *
 * Central place to obtain an engine by id and to run diagnosis dispatched by
 * the engine that PRODUCED each stored model (model.engineId), not by the
 * current setting — otherwise GMIA weight vectors would be compared with
 * spectral-cosine statistics. The current setting only decides which engine
 * trains NEW references (see 2-Reference).
 *
 * Normal case: a machine's reference models all share one engine → single
 * fast path, identical to the historical behavior for pure-GMIA machines.
 * Mixed-engine machines (rare; only if the setting was switched between
 * training states) are handled defensively: each engine group is scored and
 * the best healthScore wins.
 */

import type {
  DiagnosisEngine,
  AsyncDiagnosisEngine,
  AnyDiagnosisEngine,
  FrameInput,
} from './types.js';
import { isAsyncEngine } from './types.js';
import type {
  EngineId,
  ReferenceModel,
  GMIAModel,
  SpectralCosineModel,
  DiagnosisResult,
} from '@data/types.js';
import type { WorkPointScore } from '../scoring.js';
import { GmiaEngine } from './GmiaEngine.js';
import { SpectralCosineEngine } from './SpectralCosineEngine.js';
import { YamnetEngine } from './YamnetEngine.js';
import { TemporalEngine } from './TemporalEngine.js';

const factories: Record<EngineId, () => AnyDiagnosisEngine> = {
  gmia: () => new GmiaEngine(),
  'spectral-cosine': () => new SpectralCosineEngine(),
  yamnet: () => new YamnetEngine(),
  temporal: () => new TemporalEngine(),
};

// A shared instance per id (sync engines are stateless; YamnetEngine caches its
// loaded model across calls, so a singleton is exactly what we want).
const instances = new Map<EngineId, AnyDiagnosisEngine>();

export function getEngine(id: EngineId): AnyDiagnosisEngine {
  let engine = instances.get(id);
  if (!engine) {
    const factory = factories[id] ?? factories.gmia;
    engine = factory();
    instances.set(id, engine);
  }
  return engine;
}

/** The async engine for an id (YAMNet). Throws if the id is not async. */
export function getAsyncEngine(id: EngineId): AsyncDiagnosisEngine {
  const engine = getEngine(id);
  if (!isAsyncEngine(engine)) {
    throw new Error(`Engine '${id}' is not an async engine`);
  }
  return engine;
}

/** A synchronous engine for an id. Throws if the id is async (caller must filter). */
function getSyncEngine(id: EngineId): DiagnosisEngine {
  const engine = getEngine(id);
  if (isAsyncEngine(engine)) {
    throw new Error(`Engine '${id}' is async and cannot be used on the synchronous path`);
  }
  return engine;
}

/**
 * Resolve the engine that produced a model. Legacy GMIA models have no
 * engineId and are read as 'gmia'.
 */
export function resolveEngineId(model: ReferenceModel): EngineId {
  return model.engineId ?? 'gmia';
}

/** Group models by their producing engine, preserving order. */
function groupByEngine(models: ReferenceModel[]): Map<EngineId, ReferenceModel[]> {
  const groups = new Map<EngineId, ReferenceModel[]>();
  for (const model of models) {
    const id = resolveEngineId(model);
    const list = groups.get(id);
    if (list) list.push(model);
    else groups.set(id, [model]);
  }
  return groups;
}

/**
 * Multiclass diagnosis dispatched by stored model engine. For a single-engine
 * machine this is exactly getEngine(id).classify(models, frame).
 */
export function classifyWithEngines(
  models: ReferenceModel[],
  frame: FrameInput
): DiagnosisResult {
  // Async engines (YAMNet) are handled by a dedicated async path and never
  // reach the synchronous dispatcher.
  const syncModels = models.filter((m) => resolveEngineId(m) !== 'yamnet');
  if (syncModels.length === 0) {
    throw new Error('No synchronous reference models available for classification');
  }
  const groups = groupByEngine(syncModels);
  if (groups.size === 1) {
    const [id] = [...groups.keys()];
    return getSyncEngine(id).classify(syncModels, frame);
  }
  // Mixed engines: score each group, best healthScore wins.
  let best: DiagnosisResult | null = null;
  for (const [id, groupModels] of groups) {
    const result = getSyncEngine(id).classify(groupModels, frame);
    if (!best || result.healthScore > best.healthScore) best = result;
  }
  return best as DiagnosisResult;
}

/** Per-model ranking scores dispatched by engine (for WorkPointRanking). */
export function scoreAllWithEngines(
  models: ReferenceModel[],
  frame: FrameInput
): WorkPointScore[] {
  const syncModels = models.filter((m) => resolveEngineId(m) !== 'yamnet');
  const groups = groupByEngine(syncModels);
  const all: WorkPointScore[] = [];
  for (const [id, groupModels] of groups) {
    all.push(...getSyncEngine(id).scoreAll(groupModels, frame));
  }
  all.sort((a, b) => b.score - a.score);
  return all;
}

/**
 * Return the GMIA weight vector for a model if it has one (used as the
 * "reference spectrum" ghost overlay), otherwise undefined. Lets UI code
 * stay engine-agnostic without unsafe property access on the union.
 */
export function getModelWeightVector(model: ReferenceModel): Float64Array | undefined {
  const id = resolveEngineId(model);
  if (id === 'gmia') {
    return (model as GMIAModel).weightVector;
  }
  // Spectral-cosine: the stored mean spectrum IS the reference spectrum, so it
  // can drive the live "ghost" overlay just like a GMIA weight vector.
  if (id === 'spectral-cosine') {
    const meanVec = (model as SpectralCosineModel).mean;
    return meanVec && meanVec.length ? Float64Array.from(meanVec) : undefined;
  }
  // Temporal (Tier 2): the stored display mean drives the ghost overlay; the
  // scoring itself uses the ordered frame bank, not this mean.
  if (id === 'temporal') {
    const meanVec = (model as import('@data/types.js').TemporalModel).mean;
    return meanVec && meanVec.length ? Float64Array.from(meanVec) : undefined;
  }
  // YAMNet has no spectrum in the model (1024-d embedding); the ghost there is
  // sourced from the reference audio separately.
  return undefined;
}
