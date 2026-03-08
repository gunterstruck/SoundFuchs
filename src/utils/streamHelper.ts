/**
 * ZANOBOT - STREAM HELPER UTILITIES
 *
 * Shared utility functions for cleaning up media resources.
 * These utilities ensure consistent and safe resource cleanup
 * across all phases (Reference, Diagnose, etc.).
 */

import { logger } from '@utils/logger.js';

/**
 * Stop all tracks in a MediaStream and release the stream.
 *
 * This function safely handles null streams and ensures all tracks
 * are properly stopped to release microphone/camera resources.
 *
 * @param stream - The MediaStream to stop (can be null)
 * @returns true if stream was stopped, false if stream was null
 *
 * @example
 * ```typescript
 * // Stop microphone stream
 * stopMediaStream(this.mediaStream);
 * this.mediaStream = null;
 *
 * // Stop camera stream
 * stopMediaStream(this.cameraStream);
 * this.cameraStream = null;
 * ```
 */
export function stopMediaStream(stream: MediaStream | null): boolean {
  if (!stream) {
    return false;
  }

  stream.getTracks().forEach((track) => track.stop());
  return true;
}

/**
 * Safely close an AudioContext with error handling.
 *
 * This function:
 * 1. Checks if the context exists and is not already closed
 * 2. Attempts to close the context
 * 3. Logs any errors but continues execution to prevent leaks
 *
 * @param audioContext - The AudioContext to close (can be null)
 * @returns true if context was closed, false if context was null or already closed
 *
 * @example
 * ```typescript
 * closeAudioContext(this.audioContext);
 * this.audioContext = null;
 * ```
 */
export function closeAudioContext(audioContext: AudioContext | null): boolean {
  if (!audioContext) {
    return false;
  }

  if (audioContext.state === 'closed') {
    return false;
  }

  try {
    // AudioContext.close() returns a Promise - catch rejection to prevent unhandled errors
    audioContext.close().catch((error) => {
      logger.warn('⚠️ Error closing AudioContext (async):', error);
    });
    return true;
  } catch (error) {
    logger.warn('⚠️ Error closing AudioContext:', error);
    return false;
  }
}

/**
 * Clean up all media resources (streams and audio context) in one call.
 *
 * This is a convenience function for cleaning up all audio-related resources
 * at once. It handles null values safely.
 *
 * @param resources - Object containing resources to clean up
 * @param resources.mediaStream - Main audio stream (microphone)
 * @param resources.cameraStream - Camera stream for visual positioning
 * @param resources.audioContext - Web Audio API context
 *
 * @example
 * ```typescript
 * cleanupMediaResources({
 *   mediaStream: this.mediaStream,
 *   cameraStream: this.cameraStream,
 *   audioContext: this.audioContext,
 * });
 * this.mediaStream = null;
 * this.cameraStream = null;
 * this.audioContext = null;
 * ```
 */
export function cleanupMediaResources(resources: {
  mediaStream?: MediaStream | null;
  cameraStream?: MediaStream | null;
  audioContext?: AudioContext | null;
}): void {
  const { mediaStream, cameraStream, audioContext } = resources;

  // Stop media streams
  stopMediaStream(mediaStream ?? null);
  stopMediaStream(cameraStream ?? null);

  // Close audio context
  closeAudioContext(audioContext ?? null);
}
