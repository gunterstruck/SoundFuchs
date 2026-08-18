/**
 * SOUNDFUCHS — DEN GEHÖRTEN VERGLEICH WEITERGEBEN
 *
 * Zwei gewöhnliche WAV-Dateien, damit der Empfänger weder SoundFuchs noch ein
 * Spezialformat braucht: die unveränderte Messung und genau die abgeleitete
 * Hörhilfe, die der Nutzer ausgewählt hat. Kein Upload — Web Share öffnet das
 * Systemblatt, am Schreibtisch werden beide Dateien lokal heruntergeladen.
 */

import { logger } from '@utils/logger.js';

export type HearingShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export interface HearingComparisonShareOptions {
  measurement: AudioBuffer;
  highlighted: AudioBuffer;
  baseName: string;
  highlightedSuffix: string;
  title: string;
  text: string;
}

export interface FileShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: { files: File[] }) => boolean;
}

/** Manche WebKit-Versionen werfen bei `canShare({ files })` statt false zu liefern. */
export function canShareFiles(nav: FileShareNavigator, files: File[]): boolean {
  if (!nav.share) return false;
  try {
    return nav.canShare ? nav.canShare({ files }) : true;
  } catch {
    return false;
  }
}

/** AudioBuffer als verbreitetes 16-Bit-PCM-WAV kodieren. */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const sampleRate = buffer.sampleRate;
  if (channels < 1 || frames < 1 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('Ungültiger AudioBuffer für WAV-Export');
  }

  const bytesPerSample = 2;
  const dataBytes = frames * channels * bytesPerSample;
  const bytes = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(bytes);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  const channelData = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index));
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const raw = channelData[channel][frame];
      const finite = Number.isFinite(raw) ? raw : 0;
      const clamped = Math.max(-1, Math.min(1, finite));
      view.setInt16(offset, Math.round(clamped < 0 ? clamped * 32_768 : clamped * 32_767), true);
      offset += bytesPerSample;
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/** Dateisystemtauglich, aber für Menschen noch lesbar. */
export function safeAudioBaseName(name: string): string {
  const safe = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return safe || 'soundfuchs-vergleich';
}

/** Öffnet das System-Teilen-Sheet oder lädt beide WAVs lokal herunter. */
export async function shareHearingComparison(
  options: HearingComparisonShareOptions
): Promise<HearingShareOutcome> {
  const base = safeAudioBaseName(options.baseName);
  const measurementBlob = audioBufferToWav(options.measurement);
  const highlightedBlob = audioBufferToWav(options.highlighted);
  const files = [
    new File([measurementBlob], `${base}-messung-original.wav`, { type: 'audio/wav' }),
    new File(
      [highlightedBlob],
      `${base}-hoerhilfe-${safeAudioBaseName(options.highlightedSuffix)}.wav`,
      {
        type: 'audio/wav',
      }
    ),
  ];
  const nav = navigator as unknown as FileShareNavigator;
  const share = nav.share;
  const fileSharePossible = canShareFiles(nav, files);
  if (share && fileSharePossible) {
    try {
      await share.call(navigator, { title: options.title, text: options.text, files });
      return 'shared';
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled';
      logger.warn('Hörvergleich konnte nicht geteilt werden, lade WAVs herunter:', error);
    }
  }

  for (const file of files) download(file);
  return 'downloaded';
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
