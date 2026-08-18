/**
 * Kleiner ZIP-Schreiber für lokale Geräusch-Briefings.
 *
 * Die Audiodateien sind bereits PCM-WAV und komprimieren kaum. Darum nutzt
 * der Schreiber bewusst die standardisierte STORE-Methode: kein Paket, kein
 * Server, keine versteckte Übertragung und in jedem Betriebssystem entpackbar.
 */

export interface ZipArchiveEntry {
  name: string;
  data: string | Blob | Uint8Array;
  modifiedAt?: Date;
}

const encoder = new TextEncoder();
const CRC_TABLE = new Uint32Array(256);

for (let n = 0; n < CRC_TABLE.length; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[n] = value >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function safeEntryName(input: string): string {
  const name = input.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = name.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Ungültiger ZIP-Dateiname: ${input}`);
  }
  return segments.join('/');
}

async function bytesOf(data: ZipArchiveEntry['data']): Promise<Uint8Array> {
  if (typeof data === 'string') return encoder.encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(await data.arrayBuffer());
}

function dosTimestamp(date: Date): { time: number; day: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/** Erstellt ein ZIP-Archiv im Arbeitsspeicher; die Reihenfolge bleibt erhalten. */
export async function createZipArchive(entries: readonly ZipArchiveEntry[]): Promise<Blob> {
  if (entries.length === 0) throw new Error('Ein ZIP-Archiv braucht mindestens eine Datei.');
  if (entries.length > 65_535) throw new Error('Zu viele Dateien für ein ZIP-Archiv.');

  const names = new Set<string>();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = safeEntryName(entry.name);
    if (names.has(name)) throw new Error(`Doppelter ZIP-Dateiname: ${name}`);
    names.add(name);

    const nameBytes = encoder.encode(name);
    const data = await bytesOf(entry.data);
    if (data.byteLength > 0xffffffff) throw new Error(`Datei ist zu groß für ZIP32: ${name}`);
    const checksum = crc32(data);
    const stamp = dosTimestamp(entry.modifiedAt ?? new Date());

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    u32(localView, 0, 0x04034b50);
    u16(localView, 4, 20);
    u16(localView, 6, 0x0800); // UTF-8-Dateinamen
    u16(localView, 8, 0); // STORE
    u16(localView, 10, stamp.time);
    u16(localView, 12, stamp.day);
    u32(localView, 14, checksum);
    u32(localView, 18, data.byteLength);
    u32(localView, 22, data.byteLength);
    u16(localView, 26, nameBytes.length);
    u16(localView, 28, 0);
    local.set(nameBytes, 30);
    // `BlobPart` verlangt in TS 5.7 einen sicher eigenen ArrayBuffer; ein
    // übergebener Uint8Array könnte theoretisch auf SharedArrayBuffer zeigen.
    localParts.push(local.buffer, Uint8Array.from(data).buffer);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    u32(centralView, 0, 0x02014b50);
    u16(centralView, 4, 20);
    u16(centralView, 6, 20);
    u16(centralView, 8, 0x0800);
    u16(centralView, 10, 0);
    u16(centralView, 12, stamp.time);
    u16(centralView, 14, stamp.day);
    u32(centralView, 16, checksum);
    u32(centralView, 20, data.byteLength);
    u32(centralView, 24, data.byteLength);
    u16(centralView, 28, nameBytes.length);
    u16(centralView, 30, 0);
    u16(centralView, 32, 0);
    u16(centralView, 34, 0);
    u16(centralView, 36, 0);
    u32(centralView, 38, 0);
    u32(centralView, 42, localOffset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    localOffset += local.byteLength + data.byteLength;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + (part as Uint8Array).byteLength, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  u32(endView, 0, 0x06054b50);
  u16(endView, 4, 0);
  u16(endView, 6, 0);
  u16(endView, 8, entries.length);
  u16(endView, 10, entries.length);
  u32(endView, 12, centralSize);
  u32(endView, 16, localOffset);
  u16(endView, 20, 0);

  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}
