/**
 * EIN GERÄUSCH MITBRINGEN — AUS EINER DATEI ODER EINEM VIDEO
 *
 * Menschen filmen, was komisch klingt: die offene Motorhaube, die
 * Waschmaschine, den Lüfter. Das Video liegt schon auf dem Telefon. SoundFuchs
 * nimmt es entgegen und löst die Tonspur heraus.
 *
 * ## Warum das ohne neue Werkzeuge geht
 *
 * `decodeAudioData` liest die Tonspur direkt aus dem Video-Container; die
 * Bildspur wird dabei ignoriert. Gemessen am 23.08.2026 im mitgelieferten
 * Chromium:
 *
 *     video/mp4                    →  ok · 1,12 s · 44 100 Hz · 1 Kanal
 *     video/webm;codecs=vp8,opus   →  ok · 1,20 s · 44 100 Hz · 1 Kanal
 *
 * Keine Bibliothek, kein Demuxer, kein Server — derselbe Aufruf, den die
 * Aufnahme ohnehin macht.
 *
 * ## Was NICHT gemessen werden konnte, und was daraus folgt
 *
 * Das Beispielvideo des Auftraggebers ist ein echtes Telefonvideo: MP4 mit
 * HEVC-Bild und **AAC-LC**-Ton, 13,7 s, Stereo 48 kHz, 23,9 MB. Im Testbrowser
 * scheitert es — nicht an der Datei, sondern am Browser:
 *
 *     audio/mp4; codecs="mp4a.40.2"   (nein)
 *     video/mp4; codecs="avc1…"       (nein)
 *     WebCodecs AudioDecoder mp4a…    false
 *
 * Das ist ein Chromium ohne proprietäre Codecs. Jedes Telefon, Chrome, Edge und
 * Safari haben AAC-LC — nachweisen lässt es sich hier nur nicht.
 *
 * **Daraus folgt der wichtigste Teil dieses Moduls:** „Dieser Browser kann
 * diese Datei nicht lesen" ist ein **benannter Fall** mit einem Satz, der sagt,
 * was zu tun ist. Ein stilles „Datei konnte nicht gelesen werden" wäre für den
 * Nutzer nicht von einer kaputten Datei zu unterscheiden.
 *
 * ## Warum die ganze Datei in den Speicher muss
 *
 * `decodeAudioData` nimmt keinen Strom entgegen, und bei MP4 können die
 * Verwaltungsdaten (`moov`) am Ende stehen — beim Beispielvideo tun sie das.
 * Teilweises Lesen ist damit ausgeschlossen. Deshalb gibt es eine Obergrenze
 * mit einem Satz statt eines Absturzes.
 */

/** Was schiefgehen kann — jeder Fall bekommt seinen eigenen Satz. */
export type Dateibefund = 'zu-gross' | 'keine-tonspur' | 'format' | 'zu-kurz' | 'leer' | 'unlesbar';

export class Dateifehler extends Error {
  constructor(
    public readonly befund: Dateibefund,
    public readonly zusatz?: string
  ) {
    super(befund);
    this.name = 'Dateifehler';
  }
}

/**
 * Die Obergrenze.
 *
 * Zwei Minuten 1080p sind schnell 200 MB, und die müssen am Stück in den
 * Arbeitsspeicher. 120 MB sind gemessen an einem 23,9-MB-Video von 13,7 s rund
 * eine Minute Film — deutlich mehr, als man von einem Geräusch braucht, und
 * wenig genug, dass ein Telefon es trägt.
 */
export const HOECHSTGROESSE = 120 * 1024 * 1024;

/** Kürzer als das kann man nicht sinnvoll ansehen oder anhören. */
export const MINDESTDAUER = 1.0;

/** Ist das ein Video? Entscheidet nur, ob die Vorschau ein Bild zeigt. */
export function istVideo(datei: File): boolean {
  if (datei.type.startsWith('video/')) return true;
  if (datei.type.startsWith('audio/')) return false;
  // Manche Telefone liefern einen leeren Typ. Dann entscheidet die Endung.
  return /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(datei.name);
}

/**
 * Woran erkennt man ein Video ohne Tonspur?
 *
 * Nicht an einem Fehler von `decodeAudioData` — der ist derselbe wie bei einem
 * unbekannten Format. Der Unterschied lässt sich aber am Bild ablesen: Kann ein
 * `<video>` die Datei überhaupt öffnen, liegt es nicht am Container; scheitert
 * auch das, kann der Browser das Format nicht.
 *
 * Die Unterscheidung ist wichtig, weil sie zu zwei verschiedenen Sätzen führt:
 * „In diesem Video ist keine Tonspur" verlangt ein anderes Video, „Dieser
 * Browser kann dieses Format nicht lesen" einen anderen Browser.
 */
async function bildSpurLesbar(datei: File): Promise<boolean> {
  const url = URL.createObjectURL(datei);
  try {
    return await new Promise<boolean>((fertig) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      const raus = (wert: boolean) => {
        v.onloadedmetadata = null;
        v.onerror = null;
        v.src = '';
        fertig(wert);
      };
      v.onloadedmetadata = () => raus(v.videoWidth > 0);
      v.onerror = () => raus(false);
      setTimeout(() => raus(false), 8000);
      v.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/**
 * Die Tonspur einer Datei holen.
 *
 * @throws {Dateifehler} mit einem Befund, zu dem es einen Satz gibt.
 */
export async function toneAusDatei(datei: File): Promise<AudioBuffer> {
  if (datei.size === 0) throw new Dateifehler('leer');
  if (datei.size > HOECHSTGROESSE) {
    throw new Dateifehler('zu-gross', `${Math.round(datei.size / 1024 / 1024)} MB`);
  }

  const bytes = await datei.arrayBuffer().catch(() => null);
  if (!bytes) throw new Dateifehler('unlesbar');

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Dateifehler('format');

  const ctx = new AudioCtx();
  try {
    const puffer = await ctx.decodeAudioData(bytes);
    if (puffer.duration < MINDESTDAUER) {
      throw new Dateifehler('zu-kurz', `${puffer.duration.toFixed(1)} s`);
    }
    return puffer;
  } catch (fehler) {
    if (fehler instanceof Dateifehler) throw fehler;
    // Der Ton ging nicht. Liegt es am Container oder am Fehlen einer Tonspur?
    // Das Bild verrät es — siehe `bildSpurLesbar`.
    if (istVideo(datei) && (await bildSpurLesbar(datei))) {
      throw new Dateifehler('keine-tonspur');
    }
    throw new Dateifehler('format', datei.type || datei.name.split('.').pop() || '');
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Einen Ausschnitt herausschneiden.
 *
 * Ein Video ist lang, und das Interessante darin ist kurz. Gespeichert und
 * ausgewertet wird nur der gewählte Abschnitt — der Film selbst wird nie
 * behalten.
 */
export function ausschnitt(puffer: AudioBuffer, vonSekunde: number, dauer: number): AudioBuffer {
  const rate = puffer.sampleRate;
  const von = Math.max(0, Math.min(puffer.length - 1, Math.round(vonSekunde * rate)));
  const laenge = Math.max(1, Math.min(puffer.length - von, Math.round(dauer * rate)));
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const ziel = ctx.createBuffer(puffer.numberOfChannels, laenge, rate);
  for (let k = 0; k < puffer.numberOfChannels; k += 1) {
    ziel.getChannelData(k).set(puffer.getChannelData(k).subarray(von, von + laenge));
  }
  void ctx.close();
  return ziel;
}

/**
 * Wo im Stück ist es am ruhigsten und nicht übersteuert?
 *
 * Der Vorschlag für den Ausschnitt. Gesucht wird das Fenster mit dem
 * gleichmäßigsten Pegel — nicht das lauteste und nicht das leiseste: Ein
 * Übersteuern verdirbt die Analyse ebenso wie eine Pause.
 *
 * Rein und ohne Web-Audio, damit es ohne Browser prüfbar ist.
 */
export function ruhigsteStelle(kanal: Float32Array, rate: number, fensterSekunden: number): number {
  const fenster = Math.max(1, Math.round(fensterSekunden * rate));
  if (kanal.length <= fenster) return 0;
  // In Zehntelsekunden rastern — feiner bringt hier nichts und kostet.
  const schritt = Math.max(1, Math.round(rate / 10));
  const bloecke = Math.floor(kanal.length / schritt);
  const staerke = new Float32Array(bloecke);
  const spitze = new Float32Array(bloecke);
  for (let b = 0; b < bloecke; b += 1) {
    let summe = 0;
    let max = 0;
    for (let i = b * schritt; i < (b + 1) * schritt; i += 1) {
      const a = Math.abs(kanal[i]);
      summe += a * a;
      if (a > max) max = a;
    }
    staerke[b] = Math.sqrt(summe / schritt);
    spitze[b] = max;
  }
  const bloeckeImFenster = Math.max(1, Math.round(fenster / schritt));
  let besterBlock = 0;
  let bestesMass = Number.POSITIVE_INFINITY;
  for (let start = 0; start + bloeckeImFenster <= bloecke; start += 1) {
    let summe = 0;
    let uebersteuert = 0;
    for (let b = start; b < start + bloeckeImFenster; b += 1) {
      summe += staerke[b];
      if (spitze[b] > 0.98) uebersteuert += 1;
    }
    const mittel = summe / bloeckeImFenster;
    if (mittel <= 0) continue;
    let abweichung = 0;
    for (let b = start; b < start + bloeckeImFenster; b += 1) {
      abweichung += Math.abs(staerke[b] - mittel);
    }
    // Gleichmäßigkeit, bezogen auf den Pegel — plus eine Strafe fürs
    // Übersteuern und eine leichte für sehr leise Stellen.
    const mass =
      abweichung / bloeckeImFenster / mittel + uebersteuert * 0.5 + (mittel < 0.01 ? 1 : 0);
    if (mass < bestesMass) {
      bestesMass = mass;
      besterBlock = start;
    }
  }
  return (besterBlock * schritt) / rate;
}
