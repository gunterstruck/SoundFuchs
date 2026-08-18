/**
 * SOUNDFUCHS — EIN ANBIETERNEUTRALES GERÄUSCH-BRIEFING
 *
 * Alles entsteht lokal. SoundFuchs lädt nichts hoch und braucht keinen API-Key.
 * Das Ergebnis ist ein nachvollziehbares ZIP: Originale, abgeleitete Hörhilfe,
 * Messwerte, Spektrogramme, Kontext und derselbe Arbeitsauftrag, der zusätzlich
 * in die Zwischenablage gelegt wird.
 */

import { getDifferenceTake } from './differenceTake.js';
import { audioBufferToWav, safeAudioBaseName } from './hearingComparisonShare.js';
import { createSpectralSelectionBuffer, type SpectralSelection } from './spectralSelection.js';
import { getFineSpectrogramMatrix, peakFrequencyFine } from '../dsp/fineSpectrogram.js';
import {
  compensateSpectrogramGain,
  freqToColumn,
  rescaleSpectrogramMatrix,
  type SpectrogramMatrix,
} from '../dsp/spectrogram.js';
import { createZipArchive, type ZipArchiveEntry } from '@utils/zipArchive.js';

export type RecordingSituationKind =
  | 'vehicle-engine-bay'
  | 'household-indoor'
  | 'building-services'
  | 'tool-or-garden'
  | 'other';

export interface AnalysisRecordingSituation {
  kind: RecordingSituationKind;
  description: string;
  details?: string[];
}

/** Was die vorhandenen Töne tatsächlich belegen — nicht, was wir gern hätten. */
export type AnalysisCaseMode = 'baseline-comparison' | 'single-recording' | 'neutral-comparison';

export interface AnalysisPackageOptions {
  mode: AnalysisCaseMode;
  reference?: AudioBuffer | null;
  measurement: AudioBuffer;
  machineName: string;
  includeMachineName: boolean;
  situation: AnalysisRecordingSituation;
  selection?: SpectralSelection | null;
  createdAt?: Date;
}

export interface AnalysisPackageResult {
  blob: Blob;
  filename: string;
  prompt: string;
  warnings: string[];
}

interface PromptContext {
  mode?: AnalysisCaseMode;
  situation: AnalysisRecordingSituation;
  machineName?: string;
  selection?: SpectralSelection | null;
}

export interface RecordingQualityMetrics {
  durationSec: number;
  sampleRate: number;
  channels: number;
  rms: number;
  peak: number;
  crestFactor: number | null;
  clippedSamplePercent: number;
  nearSilentSamplePercent: number;
  dominantPeakHz: number | null;
  notes: string[];
}

function decimal(value: number, digits = 3): number | null {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function situationText(situation: AnalysisRecordingSituation): string {
  return [situation.description.trim(), ...(situation.details ?? [])].filter(Boolean).join(' · ');
}

/** Technische Qualität einer Aufnahme, ohne daraus einen Gesundheitszustand abzuleiten. */
export function measureRecordingQuality(buffer: AudioBuffer): RecordingQualityMetrics {
  let sumSquares = 0;
  let peak = 0;
  let clipped = 0;
  let nearSilent = 0;
  const samples = Math.max(1, buffer.length * buffer.numberOfChannels);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (const raw of data) {
      const value = Number.isFinite(raw) ? raw : 0;
      const absolute = Math.abs(value);
      sumSquares += value * value;
      peak = Math.max(peak, absolute);
      if (absolute >= 0.995) clipped++;
      if (absolute < 0.001) nearSilent++;
    }
  }
  const rms = Math.sqrt(sumSquares / samples);
  const clippedSamplePercent = (clipped / samples) * 100;
  const nearSilentSamplePercent = (nearSilent / samples) * 100;
  const notes: string[] = [];
  if (buffer.duration < 1)
    notes.push('Sehr kurze Aufnahme; zeitliche Muster sind nur eingeschränkt beurteilbar.');
  if (clippedSamplePercent > 0.1)
    notes.push('Mögliche Übersteuerung; Spitzen können verfälscht sein.');
  if (rms < 0.003)
    notes.push('Sehr niedriger Aufnahmepegel; leise Muster können im Eigenrauschen liegen.');
  if (nearSilentSamplePercent > 80) notes.push('Großer Anteil nahezu stiller Samples.');
  if (notes.length === 0)
    notes.push('Keine offensichtliche Übersteuerung oder extreme Stille erkannt.');
  return {
    durationSec: decimal(buffer.duration) ?? 0,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    rms: decimal(rms, 8) ?? 0,
    peak: decimal(peak, 8) ?? 0,
    crestFactor: rms > 1e-12 ? decimal(peak / rms, 3) : null,
    clippedSamplePercent: decimal(clippedSamplePercent, 4) ?? 0,
    nearSilentSamplePercent: decimal(nearSilentSamplePercent, 2) ?? 0,
    dominantPeakHz: peakFrequencyFine(buffer),
    notes,
  };
}

function caseIntroduction(mode: AnalysisCaseMode): string {
  if (mode === 'single-recording') {
    return 'Du erhältst ein lokal von SoundFuchs aufbereitetes Geräusch-Briefing mit genau einer verdächtigen Aufnahme. Es gibt KEINEN bekannten gesunden Normalzustand.';
  }
  if (mode === 'neutral-comparison') {
    return 'Du erhältst ein lokales A/B-Geräusch-Briefing mit zwei Aufnahmen. KEINE der beiden Aufnahmen ist als gesund bestätigt.';
  }
  return 'Du erhältst ein lokal von SoundFuchs aufbereitetes Geräusch-Briefing mit einem akustischen Normalzustand und einer späteren Messung.';
}

function modeBoundaries(mode: AnalysisCaseMode): string[] {
  if (mode === 'single-recording') {
    return [
      'Es gibt keine Vergleichsaufnahme. Verwende deshalb nicht die Begriffe Abweichung, Verschlechterung oder neu hinzugekommen, sofern sie nicht ausdrücklich als Hypothese gekennzeichnet sind.',
      'Eine markierte oder verstärkte Datei ist eine Hörhilfe. Ihre Lautheit ist nicht real und kein Schadensmaß.',
      'Suche nach inneren Mustern derselben Aufnahme: tonale Linien, Impulse, Rhythmik, Modulation und zeitliche Veränderungen.',
    ];
  }
  if (mode === 'neutral-comparison') {
    return [
      'Aufnahme A und Aufnahme B haben einen unbekannten Gesundheitszustand. Ein Kontrast sagt nur, dass sie verschieden sind — nicht, welche richtig oder defekt ist.',
      'Die Datei „kontrast-hoerhilfe.wav“ ist spektral abgeleitet und absichtlich verstärkt. Ihre Lautheit ist nicht real und kein Schadensmaß.',
      'Prüfe zuerst, ob Betriebszustand, Mikrofonposition und Pegel einen fairen A/B-Vergleich erlauben.',
    ];
  }
  return [
    'Die Datei „unterschied-hoerhilfe.wav“ ist eine spektral abgeleitete und absichtlich verstärkte Hörhilfe. Ihre Lautheit entspricht NICHT der realen Lautheit und ist kein Schadensmaß.',
    'Beurteile die reale Stärke nur anhand der unveränderten WAV-Dateien und der Messwerte in „daten/messwerte.json“.',
    'Ein akustischer Unterschied beweist weder Ursache noch Defekt. Umgebungsgeräusche, Mikrofonposition, Drehzahl/Last und Aufnahmepegel können Unterschiede erzeugen.',
  ];
}

/** Anbieterneutraler Arbeitsauftrag; dieselbe Fassung liegt im ZIP und im Clipboard. */
export function createAnalysisPrompt(context: PromptContext): string {
  const mode = context.mode ?? 'baseline-comparison';
  const selection = context.selection
    ? `${context.selection.startSec.toFixed(2)}–${context.selection.endSec.toFixed(2)} s und ${Math.round(context.selection.lowHz)}–${Math.round(context.selection.highHz)} Hz`
    : 'kein Bereich vorab markiert; untersuche die gesamte Aufnahme';
  const machine = context.machineName?.trim() || 'nicht mitgegeben';
  const situation = situationText(context.situation) || 'nicht näher beschrieben';

  const observationTask =
    mode === 'single-recording'
      ? 'Beschreibe hör- und sichtbare Muster konkret mit Zeitbereichen, Frequenzbereichen, Tonalität und Rhythmik. Vergleiche einen markierten Fokus mit dem Rest derselben Aufnahme, ohne daraus eine Verschlechterung zu behaupten.'
      : mode === 'neutral-comparison'
        ? 'Beschreibe Unterschiede zwischen Aufnahme A und B konkret mit Zeitbereichen, Frequenzbereichen und Rhythmik. Benenne dabei nie eine Seite als gesund oder defekt.'
        : 'Beschreibe hör- und sichtbare Unterschiede konkret mit Zeitbereichen, Frequenzbereichen und Rhythmik.';

  return `${caseIntroduction(mode)}

AUFNAHMEKONTEXT
- Situation: ${situation}
- Bezeichnung der Maschine/Anlage: ${machine}
- Vorab markierter Fokus: ${selection}

WICHTIGE GRENZEN
${modeBoundaries(mode)
  .map((line) => `- ${line}`)
  .join('\n')}
- Formuliere keine sichere Diagnose aus Audio allein und erfinde keine Fahrzeug-, Maschinen- oder Bauteildaten.

DEIN AUFTRAG
1. Lies zuerst „daten/aufnahmequalitaet.json“. Benenne technische Grenzen, Störfaktoren und Unsicherheiten.
2. ${observationTask} Trenne Beobachtung, Interpretation und Hypothese klar.
3. Nenne höchstens drei plausible Geräuschfamilien (z. B. Pfeifen, Klopfen, Schleifen, Rasseln) und erkläre jeweils, was dafür und was dagegen spricht. Keine Ferndiagnose.
4. Nutze den markierten Ausschnitt, falls vorhanden, aber kontrolliere ihn gegen die vollständigen Aufnahmen.
5. Wenn du Webquellen verwenden kannst: recherchiere nur belastbare Hersteller-, Fach- oder Primärquellen passend zum beschriebenen Kontext, verlinke sie und kennzeichne Übertragungen als Hypothese.
6. Nutze „NAECHSTE-GEGENAUFNAHME.txt“ und schlage den risikoarmen Vergleichstest vor, der die Hypothesen am stärksten trennt. Bei möglicher Gefahr: Betrieb stoppen und Fachbetrieb empfehlen.
7. Schließe mit einer kurzen, weitergebbaren Werkstatt-/Fachmann-Notiz: „Ich höre … / besonders bei … / bitte prüfen …“.

ANTWORTFORMAT
- Kurzfazit in 3 Sätzen
- Beobachtungen mit Zeit/Frequenz und Sicherheit (hoch/mittel/niedrig)
- Plausible Hypothesen mit Pro/Contra
- Nächster Vergleichstest
- Sicherheits- und Unsicherheitshinweis
- Werkstatt-/Fachmann-Notiz

Beginne mit dem Entpacken und Lesen von „BRIEFING-STARTEN.txt“ und „daten/manifest.json“. Falls deine Oberfläche ZIP-Dateien nicht lesen kann, bitte den Nutzer, die dort genannten Mindestdateien einzeln hochzuladen.`;
}

function downloadName(name: string, date: Date): string {
  const day = date.toISOString().slice(0, 10);
  return `SoundFuchs-Briefing-${safeAudioBaseName(name)}-${day}.zip`;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function selectionJson(selection: SpectralSelection | null | undefined): object | null {
  if (!selection) return null;
  return {
    startSec: decimal(selection.startSec),
    endSec: decimal(selection.endSec),
    lowHz: decimal(selection.lowHz, 1),
    highHz: decimal(selection.highHz, 1),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function color(value: number): [number, number, number] {
  const v = Math.min(1, Math.max(0, value));
  if (v < 0.35)
    return [Math.round(14 + v * 70), Math.round(24 + v * 130), Math.round(42 + v * 245)];
  if (v < 0.72) {
    const p = (v - 0.35) / 0.37;
    return [Math.round(39 + 50 * p), Math.round(91 + 118 * p), Math.round(128 - 63 * p)];
  }
  const p = (v - 0.72) / 0.28;
  return [Math.round(89 + 166 * p), Math.round(209 - 44 * p), Math.round(65 - 20 * p)];
}

async function spectrogramPng(
  matrix: SpectrogramMatrix,
  title: string,
  selection?: SpectralSelection | null
): Promise<Blob | null> {
  const width = 1_040;
  const height = 520;
  const left = 88;
  const top = 72;
  const plotWidth = 920;
  const plotHeight = 390;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#f7f5ef';
  ctx.fillRect(0, 0, width, height);
  const pixels = ctx.createImageData(plotWidth, plotHeight);
  for (let y = 0; y < plotHeight; y++) {
    const col = Math.min(
      matrix.cols - 1,
      Math.floor(((plotHeight - 1 - y) / plotHeight) * matrix.cols)
    );
    for (let x = 0; x < plotWidth; x++) {
      const row = Math.min(matrix.rows - 1, Math.floor((x / plotWidth) * matrix.rows));
      const [r, g, b] = color(matrix.values[row * matrix.cols + col]);
      const offset = (y * plotWidth + x) * 4;
      pixels.data[offset] = r;
      pixels.data[offset + 1] = g;
      pixels.data[offset + 2] = b;
      pixels.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(pixels, left, top);

  if (selection) {
    const x0 = left + (selection.startSec / Math.max(0.001, matrix.durationSec)) * plotWidth;
    const x1 = left + (selection.endSec / Math.max(0.001, matrix.durationSec)) * plotWidth;
    const y0 =
      top + (1 - freqToColumn(selection.highHz, matrix.bandEdgesHz) / matrix.cols) * plotHeight;
    const y1 =
      top + (1 - freqToColumn(selection.lowHz, matrix.bandEdgesHz) / matrix.cols) * plotHeight;
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.setLineDash([]);
  }

  ctx.fillStyle = '#17211c';
  ctx.font = '700 26px system-ui, sans-serif';
  ctx.fillText(title, left, 38);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Zeit →', width - 150, height - 20);
  ctx.save();
  ctx.translate(25, top + plotHeight / 2 + 45);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Frequenz →', 0, 0);
  ctx.restore();
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('0 s', left, top + plotHeight + 22);
  ctx.fillText(`${matrix.durationSec.toFixed(1)} s`, left + plotWidth - 45, top + plotHeight + 22);
  ctx.fillText(`${Math.round(matrix.bandEdgesHz[0])} Hz`, 31, top + plotHeight);
  ctx.fillText(`${Math.round(matrix.maxFreqHz / 1_000)} kHz`, 31, top + 12);
  return canvasToBlob(canvas);
}

function nextCaptureText(situation: AnalysisRecordingSituation): string {
  const specific =
    situation.kind === 'vehicle-engine-bay'
      ? [
          'Motor und Aufnahmegerät zuerst exakt wie bei der ersten Aufnahme positionieren.',
          'Dann genau EINE Bedingung ändern: zum Beispiel warmer Leerlauf → leicht erhöhte Drehzahl ODER Klimaanlage an → aus ODER Motorhaube offen → geschlossen.',
          'Drehzahl und Zeitpunkt der Änderung laut ansagen oder anschließend im Kontext notieren.',
        ]
      : situation.kind === 'household-indoor'
        ? [
            'Gerät und Telefon an derselben Stelle lassen.',
            'Genau eine Betriebsstufe, Beladung oder Funktion ändern und beide Zustände jeweils mindestens zehn Sekunden aufnehmen.',
            'Andere Geräte und Gespräche im Raum möglichst vermeiden.',
          ]
        : situation.kind === 'building-services'
          ? [
              'Mikrofonabstand und Raumtür unverändert lassen.',
              'Wenn gefahrlos möglich genau einen Betriebszustand ändern, etwa Pumpe an/aus oder niedrige/hohe Stufe.',
              'Schaltzeitpunkt und Betriebsanzeige im Kontext notieren.',
            ]
          : [
              'Telefon und Gerät für beide Aufnahmen gleich positionieren.',
              'Nur eine Bedingung ändern, zum Beispiel Leerlauf/Last, niedrige/hohe Stufe oder Werkzeug frei/im Material.',
              'Jeden Zustand mindestens zehn Sekunden aufnehmen und Umgebungsgeräusche vermeiden.',
            ];
  return `SOUNDFUCHS · NÄCHSTE GEGENAUFNAHME

Ziel: Nicht irgendeine zweite Aufnahme, sondern genau den Vergleich erzeugen, der mögliche Ursachen am besten trennt.

${specific.map((line, index) => `${index + 1}. ${line}`).join('\n')}

Wichtig: Nur durchführen, wenn der Betrieb sicher ist. Keine Abdeckungen, Schutzvorrichtungen oder bewegten Teile berühren. Bei Warnleuchten, Brandgeruch, starkem Schlaggeräusch oder anderer Gefahr Betrieb beenden und einen Fachbetrieb hinzuziehen.
`;
}

function startText(mode: AnalysisCaseMode, hasSelection: boolean): string {
  const minimum =
    mode === 'single-recording'
      ? `   - audio/verdaechtige-aufnahme-original.wav
   - daten/aufnahmequalitaet.json
   - daten/aufnahmekontext.json`
      : mode === 'neutral-comparison'
        ? `   - audio/aufnahme-a-original.wav
   - audio/aufnahme-b-original.wav
   - audio/kontrast-hoerhilfe.wav
   - daten/aufnahmequalitaet.json`
        : `   - audio/normalzustand-original.wav
   - audio/messung-original.wav
   - audio/unterschied-hoerhilfe.wav
   - daten/messwerte.json
   - daten/aufnahmequalitaet.json`;
  const truth =
    mode === 'single-recording'
      ? 'Es gibt keinen bekannten gesunden Normalzustand. Das Briefing beschreibt Muster innerhalb einer Aufnahme und darf keine Verschlechterung behaupten.'
      : mode === 'neutral-comparison'
        ? 'Keine der beiden Aufnahmen ist als gesund bestätigt. Der Kontrast zeigt Verschiedenheit, aber keine Fehlerseite.'
        : 'Der Unterschied wird gegen einen als gesund bezeichneten Normalzustand gebildet. Die Differenz-Hörhilfe ist absichtlich verstärkt; ihre Lautheit ist nicht real.';
  return `SOUNDFUCHS · GERÄUSCH-BRIEFING

Zweck: Dieses Briefing macht nachvollziehbar, welches Geräusch der Nutzer meint. SoundFuchs bereitet vor; die fachliche Prüfung und Einordnung erfolgen beim Empfänger.

1. Lies den Arbeitsauftrag in ARBEITSAUFTRAG-DE.txt. Für eine externe KI kopiere ihn in deren Eingabefeld.
2. Übergib dieses ZIP an eine Fachperson oder KI. Falls ZIP nicht unterstützt wird, entpacke es und übergib mindestens:
${minimum}
   - daten/aufnahmekontext.json
${hasSelection ? '   - audio/markierung-* oder audio/markierter-verdacht-* (bearbeitete Hörhilfe des markierten Bereichs)\n' : ''}3. ${truth}
4. „NAECHSTE-GEGENAUFNAHME.txt“ enthält einen kurzen Plan für einen aussagekräftigeren Folgeversuch.

DATENSCHUTZ
Das Briefing wurde lokal im Browser erzeugt. SoundFuchs hat nichts hochgeladen. Bei der Weitergabe gelten die Datenschutzregeln des Empfängers. Audio kann Stimmen oder Ortsgeräusche enthalten — prüfe die Dateien vor dem Weitergeben.

GRENZE
Das Briefing unterstützt das Beschreiben, Hervorheben und Weitergeben eines Geräuschs. SoundFuchs trifft keine Diagnose und ersetzt keine sicherheitsrelevante Prüfung.
`;
}

/** Baut den vollständigen Download. Rechenintensive Differenzbildung läuft genau einmal über den Cache. */
export async function buildAnalysisPackage(
  options: AnalysisPackageOptions
): Promise<AnalysisPackageResult> {
  const createdAt = options.createdAt ?? new Date();
  const reference = options.mode === 'single-recording' ? null : (options.reference ?? null);
  if (options.mode !== 'single-recording' && !reference) {
    throw new Error('Für diesen Vergleich werden zwei Aufnahmen benötigt.');
  }
  const take = reference ? getDifferenceTake(reference, options.measurement) : null;
  if (reference && !take) throw new Error('Aus diesen Aufnahmen lässt sich kein Kontrast bilden.');

  const prompt = createAnalysisPrompt({
    mode: options.mode,
    situation: options.situation,
    machineName: options.includeMachineName ? options.machineName : undefined,
    selection: options.selection,
  });
  const warnings: string[] = [];
  const entries: ZipArchiveEntry[] = [
    {
      name: 'BRIEFING-STARTEN.txt',
      data: startText(options.mode, Boolean(options.selection)),
      modifiedAt: createdAt,
    },
    { name: 'ARBEITSAUFTRAG-DE.txt', data: `${prompt}\n`, modifiedAt: createdAt },
    {
      name: 'NAECHSTE-GEGENAUFNAHME.txt',
      data: nextCaptureText(options.situation),
      modifiedAt: createdAt,
    },
    {
      name: 'daten/aufnahmekontext.json',
      data: json({
        caseMode: options.mode,
        situation: options.situation,
        machineName: options.includeMachineName ? options.machineName : null,
        privacy: options.includeMachineName
          ? 'Maschinenbezeichnung bewusst einbezogen; Standort und Kundendaten ausgeschlossen.'
          : 'Maschinenbezeichnung, Standort und Kundendaten ausgeschlossen.',
      }),
      modifiedAt: createdAt,
    },
    {
      name: 'daten/markierung.json',
      data: json(selectionJson(options.selection)),
      modifiedAt: createdAt,
    },
  ];

  if (options.mode === 'single-recording') {
    entries.push({
      name: 'audio/verdaechtige-aufnahme-original.wav',
      data: audioBufferToWav(options.measurement),
      modifiedAt: createdAt,
    });
  } else if (options.mode === 'neutral-comparison' && reference && take) {
    entries.push(
      {
        name: 'audio/aufnahme-a-original.wav',
        data: audioBufferToWav(reference),
        modifiedAt: createdAt,
      },
      {
        name: 'audio/aufnahme-b-original.wav',
        data: audioBufferToWav(options.measurement),
        modifiedAt: createdAt,
      },
      {
        name: 'audio/kontrast-hoerhilfe.wav',
        data: audioBufferToWav(take.buffer),
        modifiedAt: createdAt,
      }
    );
  } else if (reference && take) {
    entries.push(
      {
        name: 'audio/normalzustand-original.wav',
        data: audioBufferToWav(reference),
        modifiedAt: createdAt,
      },
      {
        name: 'audio/messung-original.wav',
        data: audioBufferToWav(options.measurement),
        modifiedAt: createdAt,
      },
      {
        name: 'audio/unterschied-hoerhilfe.wav',
        data: audioBufferToWav(take.buffer),
        modifiedAt: createdAt,
      }
    );
  }

  entries.push({
    name: 'daten/aufnahmequalitaet.json',
    data: json(
      reference
        ? {
            aufnahmeA: measureRecordingQuality(reference),
            aufnahmeB: measureRecordingQuality(options.measurement),
            interpretation:
              'Technische Aufnahmequalität; daraus wird kein Gesundheitszustand abgeleitet.',
          }
        : {
            aufnahme: measureRecordingQuality(options.measurement),
            interpretation:
              'Technische Aufnahmequalität; daraus wird kein Gesundheitszustand abgeleitet.',
          }
    ),
    modifiedAt: createdAt,
  });

  if (take) {
    entries.push({
      name: 'daten/messwerte.json',
      data: json({
        measurementRms: decimal(take.metrics.measurementRms, 8),
        rawDifferenceRms: decimal(take.metrics.rawDifferenceRms, 8),
        relativeAmplitude: decimal(take.metrics.relativeAmplitude, 6),
        relativeDb: decimal(take.metrics.relativeDb, 2),
        referenceVariationAmplitude: decimal(take.metrics.referenceVariationAmplitude, 6),
        variationMultiple:
          take.metrics.variationMultiple === null
            ? null
            : decimal(take.metrics.variationMultiple, 3),
        listeningGain: decimal(take.metrics.listeningGain, 4),
        explanation:
          options.mode === 'neutral-comparison'
            ? 'Messwerte des gerichteten Kontrasts A→B vor Hörverstärkung. Sie bestimmen nicht, welche Aufnahme gesund ist.'
            : 'Alle Stärkewerte beschreiben das Differenzsignal vor der absichtlichen Hörverstärkung. listeningGain wurde nur auf die Hörhilfe angewendet.',
      }),
      modifiedAt: createdAt,
    });
  }

  if (options.selection) {
    const sources: Array<[string, AudioBuffer]> =
      options.mode === 'single-recording'
        ? [['verdacht', options.measurement]]
        : options.mode === 'neutral-comparison' && reference && take
          ? [
              ['aufnahme-a', reference],
              ['aufnahme-b', options.measurement],
              ['kontrast', take.buffer],
            ]
          : reference && take
            ? [
                ['normalzustand', reference],
                ['messung', options.measurement],
                ['unterschied', take.buffer],
              ]
            : [];
    for (const [name, buffer] of sources) {
      const selected = createSpectralSelectionBuffer(buffer, options.selection);
      if (selected) {
        entries.push({
          name:
            options.mode === 'single-recording'
              ? 'audio/markierter-verdacht-hoerhilfe.wav'
              : `audio/markierung-${name}-hoerhilfe.wav`,
          data: audioBufferToWav(selected.buffer),
          modifiedAt: createdAt,
        });
      } else {
        warnings.push(`Der markierte Bereich aus ${name} konnte nicht als WAV erzeugt werden.`);
      }
    }
  }

  const referenceMatrix = reference ? getFineSpectrogramMatrix(reference) : null;
  const measurementMatrix = getFineSpectrogramMatrix(options.measurement);
  const rawDifferenceMatrix = take ? getFineSpectrogramMatrix(take.buffer) : null;
  const differenceMatrix =
    rawDifferenceMatrix && take
      ? compensateSpectrogramGain(rawDifferenceMatrix, take.metrics.listeningGain)
      : null;
  const matrices = [referenceMatrix, measurementMatrix, differenceMatrix].filter(
    (matrix): matrix is SpectrogramMatrix => Boolean(matrix)
  );
  const ceiling = matrices.length ? Math.max(...matrices.map((matrix) => matrix.maxDb)) : 0;
  const images: Array<[string, string, SpectrogramMatrix | null]> =
    options.mode === 'single-recording'
      ? [['verdaechtige-aufnahme.png', 'Verdächtige Aufnahme · Original', measurementMatrix]]
      : options.mode === 'neutral-comparison'
        ? [
            ['aufnahme-a.png', 'Aufnahme A · Gesundheitszustand unklar', referenceMatrix],
            ['aufnahme-b.png', 'Aufnahme B · Gesundheitszustand unklar', measurementMatrix],
            ['kontrast.png', 'Kontrast A→B · Pegel vor Hörverstärkung', differenceMatrix],
          ]
        : [
            ['normalzustand.png', 'Normalzustand · Original', referenceMatrix],
            ['messung.png', 'Messung · Original', measurementMatrix],
            ['unterschied.png', 'Unterschied · Pegel vor Hörverstärkung', differenceMatrix],
          ];
  for (const [filename, title, matrix] of images) {
    if (!matrix) {
      warnings.push(`Spektrogramm ${filename} konnte nicht erzeugt werden.`);
      continue;
    }
    const image = await spectrogramPng(
      rescaleSpectrogramMatrix(matrix, ceiling),
      title,
      options.selection
    );
    if (image)
      entries.push({ name: `spektrogramme/${filename}`, data: image, modifiedAt: createdAt });
    else warnings.push(`Spektrogramm ${filename} konnte nicht als PNG ausgegeben werden.`);
  }

  if (warnings.length) {
    entries.push({ name: 'HINWEISE.txt', data: `${warnings.join('\n')}\n`, modifiedAt: createdAt });
  }
  const manifest = {
    format: 'SoundFuchs Geräusch-Briefing',
    version: 3,
    purpose: 'Macht nachvollziehbar, welches Geräusch der Nutzer meint.',
    soundFuchsRole: 'Aufnehmen, vergleichen, markieren, hörbar machen und aufbereiten.',
    recipientRole: 'Fachlich prüfen und einordnen; SoundFuchs trifft keine Diagnose.',
    caseMode: options.mode,
    createdAt: createdAt.toISOString(),
    generatedLocally: true,
    uploadedBySoundFuchs: false,
    contents: entries.map((entry) => entry.name).concat('daten/manifest.json'),
    warnings,
    notices:
      options.mode === 'single-recording'
        ? [
            'Es gibt keinen bekannten gesunden Normalzustand.',
            'Die verdächtige Aufnahme ist eine unveränderte PCM-WAV-Datei.',
            'Eine Markierung ist eine bearbeitete Hörhilfe und keine Originalmessung.',
            'Standort- und Kundendaten werden nicht exportiert.',
          ]
        : options.mode === 'neutral-comparison'
          ? [
              'Keine der beiden Originalaufnahmen ist als gesund bestätigt.',
              'Kontrast und Markierungen sind bearbeitete Hörhilfen, keine Originalmessungen.',
              'Der Kontrast bestimmt nicht, welche Aufnahme gesund oder defekt ist.',
              'Standort- und Kundendaten werden nicht exportiert.',
            ]
          : [
              'Normalzustand und Messung sind unveränderte PCM-WAV-Dateien.',
              'Unterschied und Markierungen sind bearbeitete Hörhilfen, keine Originalmessungen.',
              'Die reale Stärke steht in daten/messwerte.json und wurde vor Hörverstärkung bestimmt.',
              'Standort- und Kundendaten werden nicht exportiert.',
            ],
  };
  entries.push({ name: 'daten/manifest.json', data: json(manifest), modifiedAt: createdAt });

  return {
    blob: await createZipArchive(entries),
    filename: downloadName(
      options.includeMachineName ? options.machineName : 'Geraeusch',
      createdAt
    ),
    prompt,
    warnings,
  };
}
