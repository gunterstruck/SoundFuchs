import { describe, expect, it } from 'vitest';
import { createZipArchive } from './zipArchive.js';

function text(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(offset, offset + length));
}

describe('createZipArchive', () => {
  it('schreibt mehrere unkomprimierte Dateien mit zentralem Verzeichnis', async () => {
    const blob = await createZipArchive([
      { name: 'BRIEFING-STARTEN.txt', data: 'Hallo' },
      { name: 'daten/manifest.json', data: '{"ok":true}' },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);

    expect(blob.type).toBe('application/zip');
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(text(bytes, 30, view.getUint16(26, true))).toBe('BRIEFING-STARTEN.txt');
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.length - 12, true)).toBe(2);
    expect(text(bytes, 0, bytes.length)).toContain('daten/manifest.json');
  });

  it('weist Pfad-Ausbruch und doppelte Namen zurück', async () => {
    await expect(createZipArchive([{ name: '../privat.txt', data: 'x' }])).rejects.toThrow(
      /Ungültiger ZIP-Dateiname/
    );
    await expect(
      createZipArchive([
        { name: 'gleich.txt', data: 'a' },
        { name: 'gleich.txt', data: 'b' },
      ])
    ).rejects.toThrow(/Doppelter ZIP-Dateiname/);
  });
});
