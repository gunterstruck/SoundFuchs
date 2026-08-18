/**
 * SOUNDFUCHS — EIN ANBIETERNEUTRALES KI-ANALYSEPAKET
 *
 * Alles entsteht lokal. SoundFuchs lädt nichts hoch und braucht keinen API-Key.
 * Das Ergebnis ist ein nachvollziehbares ZIP: Originale, abgeleitete Hörhilfe,
 * Messwerte, Spektrogramme, Kontext und derselbe Prompt, der zusätzlich in die
 * Zwischenablage gelegt wird.
 */

import { getDifferenceTake } from './differenceTake.js';
import { audioBufferToWav, safeAudioBaseName } from './hearingComparisonShare.js';
import { createSpectralSelectionBuffer, type SpectralSelection } from './spectralSelection.js';
import { getFineSpectrogramMatrix } from '../dsp/fineSpectrogram.js';
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

export interface AnalysisPackageOptions {
  reference: AudioBuffer;
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
  situation: AnalysisRecordingSituation;
  machineName?: string;
  selection?: SpectralSelection | null;
}

function decimal(value: number, digits = 3): number | null {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function situationText(situation: AnalysisRecordingSituation): string {
  return [situation.description.trim(), ...(situation.details ?? [])].filter(Boolean).join(' · ');
}

/** Anbieterneutraler Arbeitsauftrag; dieselbe Fassung liegt im ZIP und im Clipboard. */
export function createAnalysisPrompt(context: PromptContext): string {
  const selection = context.selection
    ? `${context.selection.startSec.toFixed(2)}–${context.selection.endSec.toFixed(2)} s und ${Math.round(context.selection.lowHz)}–${Math.round(context.selection.highHz)} Hz`
    : 'kein Bereich vorab markiert; untersuche die gesamte Aufnahme';
  const machine = context.machineName?.trim() || 'nicht mitgegeben';
  const situation = situationText(context.situation) || 'nicht näher beschrieben';

  return `Du erhältst ein lokal von SoundFuchs erzeugtes Analysepaket mit einem akustischen Normalzustand und einer späteren Messung.

AUFNAHMEKONTEXT
- Situation: ${situation}
- Bezeichnung der Maschine/Anlage: ${machine}
- Vorab markierter Fokus: ${selection}

WICHTIGE GRENZEN
- Die Datei „unterschied-hoerhilfe.wav“ ist eine spektral abgeleitete und absichtlich verstärkte Hörhilfe. Ihre Lautheit entspricht NICHT der realen Lautheit und ist kein Schadensmaß.
- Beurteile die reale Stärke nur anhand der unveränderten WAV-Dateien und der Messwerte in „daten/messwerte.json“.
- Ein akustischer Unterschied beweist weder Ursache noch Defekt. Umgebungsgeräusche, Mikrofonposition, Drehzahl/Last und Aufnahmepegel können Unterschiede erzeugen.
- Formuliere keine sichere Diagnose aus Audio allein und erfinde keine Fahrzeug-, Maschinen- oder Bauteildaten.

DEIN AUFTRAG
1. Prüfe zuerst, ob Normalzustand und Messung technisch sinnvoll vergleichbar sind. Benenne Störfaktoren und Unsicherheiten.
2. Beschreibe hör- und sichtbare Unterschiede konkret mit Zeitbereichen, Frequenzbereichen und Rhythmik. Trenne Beobachtung, Interpretation und Hypothese klar.
3. Nenne höchstens drei plausible Geräuschfamilien (z. B. Pfeifen, Klopfen, Schleifen, Rasseln) und erkläre jeweils, was dafür und was dagegen spricht. Keine Ferndiagnose.
4. Nutze den markierten Ausschnitt, falls vorhanden, aber kontrolliere ihn gegen die vollständigen Aufnahmen.
5. Wenn du Webquellen verwenden kannst: recherchiere nur belastbare Hersteller-, Fach- oder Primärquellen passend zum beschriebenen Kontext, verlinke sie und kennzeichne Übertragungen als Hypothese.
6. Schlage den nächsten risikoarmen Vergleichstest vor, der die Hypothesen am stärksten trennt (gleiche Mikrofonposition, definierter Betriebszustand). Bei möglicher Gefahr: Betrieb stoppen und Fachbetrieb empfehlen.
7. Schließe mit einer kurzen, weitergebbaren Werkstatt-/Fachmann-Notiz: „Ich höre … / besonders bei … / bitte prüfen …“.

ANTWORTFORMAT
- Kurzfazit in 3 Sätzen
- Beobachtungen mit Zeit/Frequenz und Sicherheit (hoch/mittel/niedrig)
- Plausible Hypothesen mit Pro/Contra
- Nächster Vergleichstest
- Sicherheits- und Unsicherheitshinweis
- Werkstatt-/Fachmann-Notiz

Beginne mit dem Entpacken und Lesen von „ANALYSE-STARTEN.txt“ und „daten/manifest.json“. Falls deine Oberfläche ZIP-Dateien nicht lesen kann, bitte den Nutzer, die dort genannten Mindestdateien einzeln hochzuladen.`;
}

function downloadName(name: string, date: Date): string {
  const day = date.toISOString().slice(0, 10);
  return `SoundFuchs-Analyse-${safeAudioBaseName(name)}-${day}.zip`;
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

function startText(hasSelection: boolean): string {
  return `SOUNDFUCHS · KI-ANALYSEPAKET

1. Kopiere den Inhalt von PROMPT-DE.txt in eine KI deiner Wahl.
2. Lade dieses ZIP dort hoch. Falls ZIP nicht unterstützt wird, entpacke es und lade mindestens hoch:
   - audio/normalzustand-original.wav
   - audio/messung-original.wav
   - audio/unterschied-hoerhilfe.wav
   - daten/messwerte.json
   - daten/aufnahmekontext.json
${hasSelection ? '   - audio/markierung-* (derselbe markierte Bereich aus allen drei Quellen)\n' : ''}3. Spektrogramme sind auf denselben Lautheitsmaßstab gelegt. Die Differenz-Hörhilfe ist absichtlich verstärkt; ihre Lautheit ist nicht real.

DATENSCHUTZ
Das Paket wurde lokal im Browser erzeugt. SoundFuchs hat nichts hochgeladen. Mit dem Weitergeben an eine KI gelten deren Datenschutzregeln. Audio kann Stimmen oder Ortsgeräusche enthalten — prüfe die Dateien vor dem Hochladen.

GRENZE
Das Paket unterstützt das Beschreiben und Eingrenzen eines Geräuschs. Es ersetzt keine sicherheitsrelevante Prüfung und keine Fachdiagnose.
`;
}

/** Baut den vollständigen Download. Rechenintensive Differenzbildung läuft genau einmal über den Cache. */
export async function buildAnalysisPackage(
  options: AnalysisPackageOptions
): Promise<AnalysisPackageResult> {
  const createdAt = options.createdAt ?? new Date();
  const take = getDifferenceTake(options.reference, options.measurement);
  if (!take) throw new Error('Aus diesen Aufnahmen lässt sich keine Differenz bilden.');

  const prompt = createAnalysisPrompt({
    situation: options.situation,
    machineName: options.includeMachineName ? options.machineName : undefined,
    selection: options.selection,
  });
  const warnings: string[] = [];
  const entries: ZipArchiveEntry[] = [
    {
      name: 'ANALYSE-STARTEN.txt',
      data: startText(Boolean(options.selection)),
      modifiedAt: createdAt,
    },
    { name: 'PROMPT-DE.txt', data: `${prompt}\n`, modifiedAt: createdAt },
    {
      name: 'audio/normalzustand-original.wav',
      data: audioBufferToWav(options.reference),
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
    },
    {
      name: 'daten/aufnahmekontext.json',
      data: json({
        situation: options.situation,
        machineName: options.includeMachineName ? options.machineName : null,
        privacy: options.includeMachineName
          ? 'Maschinenbezeichnung bewusst einbezogen; Standort und Kundendaten ausgeschlossen.'
          : 'Maschinenbezeichnung, Standort und Kundendaten ausgeschlossen.',
      }),
      modifiedAt: createdAt,
    },
    {
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
          'Alle Stärkewerte beschreiben das Differenzsignal vor der absichtlichen Hörverstärkung. listeningGain wurde nur auf die Hörhilfe angewendet.',
      }),
      modifiedAt: createdAt,
    },
    {
      name: 'daten/markierung.json',
      data: json(selectionJson(options.selection)),
      modifiedAt: createdAt,
    },
  ];

  if (options.selection) {
    const sources: Array<[string, AudioBuffer]> = [
      ['normalzustand', options.reference],
      ['messung', options.measurement],
      ['unterschied', take.buffer],
    ];
    for (const [name, buffer] of sources) {
      const selected = createSpectralSelectionBuffer(buffer, options.selection);
      if (selected) {
        entries.push({
          name: `audio/markierung-${name}-hoerhilfe.wav`,
          data: audioBufferToWav(selected.buffer),
          modifiedAt: createdAt,
        });
      } else {
        warnings.push(`Der markierte Bereich aus ${name} konnte nicht als WAV erzeugt werden.`);
      }
    }
  }

  const referenceMatrix = getFineSpectrogramMatrix(options.reference);
  const measurementMatrix = getFineSpectrogramMatrix(options.measurement);
  const rawDifferenceMatrix = getFineSpectrogramMatrix(take.buffer);
  const differenceMatrix = rawDifferenceMatrix
    ? compensateSpectrogramGain(rawDifferenceMatrix, take.metrics.listeningGain)
    : null;
  const matrices = [referenceMatrix, measurementMatrix, differenceMatrix].filter(
    (matrix): matrix is SpectrogramMatrix => Boolean(matrix)
  );
  const ceiling = matrices.length ? Math.max(...matrices.map((matrix) => matrix.maxDb)) : 0;
  const images: Array<[string, string, SpectrogramMatrix | null]> = [
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
    format: 'SoundFuchs KI-Analysepaket',
    version: 1,
    createdAt: createdAt.toISOString(),
    generatedLocally: true,
    uploadedBySoundFuchs: false,
    contents: entries.map((entry) => entry.name).concat('daten/manifest.json'),
    warnings,
    notices: [
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
