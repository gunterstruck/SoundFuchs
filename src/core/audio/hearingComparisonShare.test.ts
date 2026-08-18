import { describe, expect, it } from 'vitest';
import { audioBufferToWav, canShareFiles, safeAudioBaseName } from './hearingComparisonShare.js';

function buffer(channels: Float32Array[], sampleRate = 8_000): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    sampleRate,
    duration: (channels[0]?.length ?? 0) / sampleRate,
    getChannelData: (index: number) => channels[index],
  } as AudioBuffer;
}

describe('audioBufferToWav', () => {
  it('schreibt einen gültigen PCM-WAV-Kopf', async () => {
    const blob = audioBufferToWav(buffer([new Float32Array([0, 0.5, -0.5])]));
    const view = new DataView(await blob.arrayBuffer());
    const text = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(view.buffer, offset, length));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(text(36, 4)).toBe('data');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
  });

  it('verschachtelt Stereo korrekt, begrenzt Spitzen und verändert nichts', async () => {
    const left = new Float32Array([1.2, -1.2]);
    const right = new Float32Array([0.25, Number.NaN]);
    const leftBefore = left.slice();
    const rightBefore = right.slice();
    const view = new DataView(await audioBufferToWav(buffer([left, right])).arrayBuffer());
    expect(view.getInt16(44, true)).toBe(32_767);
    expect(view.getInt16(46, true)).toBe(8_192);
    expect(view.getInt16(48, true)).toBe(-32_768);
    expect(view.getInt16(50, true)).toBe(0);
    expect(left).toEqual(leftBefore);
    expect(right).toEqual(rightBefore);
  });

  it('weist leere oder ungültige Buffer zurück', () => {
    expect(() => audioBufferToWav(buffer([]))).toThrow(/Ungültiger AudioBuffer/);
    expect(() => audioBufferToWav(buffer([new Float32Array(0)]))).toThrow(/Ungültiger AudioBuffer/);
  });
});

describe('safeAudioBaseName', () => {
  it('liefert verständliche, dateisystemtaugliche Namen', () => {
    expect(safeAudioBaseName('Pumpe 7 / Kühlung')).toBe('Pumpe-7-Kuhlung');
    expect(safeAudioBaseName('!!!')).toBe('soundfuchs-vergleich');
  });
});

describe('canShareFiles', () => {
  const files = [] as File[];

  it('fällt sicher zurück, wenn canShare eine Ausnahme wirft', () => {
    expect(
      canShareFiles(
        {
          share: async () => {},
          canShare: () => {
            throw new TypeError('files unsupported');
          },
        },
        files
      )
    ).toBe(false);
  });

  it('verlangt eine Share-Funktion und respektiert canShare', () => {
    expect(canShareFiles({ canShare: () => true }, files)).toBe(false);
    expect(canShareFiles({ share: async () => {}, canShare: () => false }, files)).toBe(false);
    expect(canShareFiles({ share: async () => {}, canShare: () => true }, files)).toBe(true);
  });
});
