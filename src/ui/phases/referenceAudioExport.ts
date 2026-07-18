/**
 * ZANOBOT - REFERENCE AUDIO EXPORT
 *
 * The "training done – download the reference recording?" prompt and the
 * actual file download, extracted from the Reference phase. Stateless: the
 * recorded blob and machine are passed in, so this does not touch the phase's
 * live-recording state.
 */

import { notify } from '@utils/notifications.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';
import type { Machine } from '@data/types.js';

/**
 * Offer to download the freshly recorded reference audio after a successful
 * training run. Builds a `<machineId>_REF_<timestamp>.<ext>` filename from the
 * blob's MIME type and downloads on confirmation.
 */
export function promptReferenceAudioExport(
  recordedBlob: Blob | null,
  machine: Machine | null
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

  // CRITICAL FIX: Determine file extension based on actual MIME type
  let extension = 'webm';
  if (recordedBlob) {
    if (recordedBlob.type.includes('ogg')) {
      extension = 'ogg';
    } else if (recordedBlob.type.includes('mp4')) {
      extension = 'm4a';
    }
  }
  const machineId = machine?.id || 'unknown';
  const machineName = machine?.name || 'Unknown Machine';
  const filename = `${machineId}_REF_${timestamp}.${extension}`;

  const shouldDownload = confirm(
    t('reference.success.modelTrained', { name: machineName }) +
      '\n\n' +
      t('reference.success.downloadPrompt')
  );

  if (shouldDownload && recordedBlob) {
    exportReferenceAudio(recordedBlob, filename);
  }
}

/**
 * Export reference audio as a downloadable file.
 */
function exportReferenceAudio(recordedBlob: Blob, filename: string): void {
  try {
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logger.info(`📥 Reference audio exported: ${filename}`);
  } catch (error) {
    logger.error('Export error:', error);
    notify.error(t('reference.errors.exportFailed'), error as Error, {
      title: t('reference.errors.exportFailed'),
    });
  }
}
