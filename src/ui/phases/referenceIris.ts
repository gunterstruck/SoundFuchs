/**
 * ZANOBOT - REFERENCE IRIS VECTOR
 *
 * Resolves the spectrum vector used to draw a machine's acoustic fingerprint
 * "iris": the reference SOUND's spectrum when a reference recording exists
 * (distinctive per machine), otherwise the model weight vector as a fallback.
 *
 * Shared by the machine overview cards and the machine detail modal. Stateless
 * (no `this`, no DOM) but does async DB I/O, so it lives apart from the pure
 * machineStatus helpers.
 */

import { getRecordingsForMachine } from '@data/db.js';
import { averageSpectrum } from '@core/dsp/spectrumSummary.js';
import { logger } from '@utils/logger.js';
import type { Machine } from '@data/types.js';
import { isGMIAModel } from '@data/types.js';

export async function getReferenceIrisVector(machine: Machine): Promise<ArrayLike<number> | null> {
  try {
    const recordings = await getRecordingsForMachine(machine.id);
    const ref = recordings
      .filter((r) => r.type === 'reference' && r.audioBuffer)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    if (ref?.audioBuffer) return averageSpectrum(ref.audioBuffer);
  } catch (error) {
    logger.warn('Could not load reference audio for iris:', error);
  }
  const baseline =
    (machine.referenceModels || []).find((m) => m.label === 'Baseline') ||
    (machine.referenceModels || [])[0];
  return baseline && isGMIAModel(baseline) && baseline.weightVector.length
    ? baseline.weightVector
    : null;
}
