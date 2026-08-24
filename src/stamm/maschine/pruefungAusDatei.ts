/**
 * EINE MITGEBRACHTE AUFNAHME ALS BEWERTETE PRÜFUNG
 *
 * Bis hierher konnte ein mitgebrachtes Geräusch dreierlei: angesehen werden,
 * gehört werden, und der Normalzustand werden. Was fehlte, war das, wofür
 * SoundFuchs gebaut ist — **der Vergleich mit einem Urteil**: ein Prozentwert,
 * eine Ampel, ein Eintrag im Verlauf.
 *
 * ## Warum das ohne die Diagnosephase geht
 *
 * `3-Diagnose.ts` ist um das Mikrofon herum gebaut: Aufnahme starten, Bilder
 * live bewerten, Verlauf glätten, Aufnahme stoppen. Von alldem braucht eine
 * fertige Datei nichts — sie liegt schon vollständig vor.
 *
 * Was bleibt, ist die Rechnung selbst, und die steht bereits für sich:
 *
 *     extractFeatures(ton, dspConfig)   →  ein Merkmalsvektor je Zeitfenster
 *     classifyWithEngines(modelle, …)   →  ein Urteil je Fenster
 *     clipAggregate(werte, 'mean')      →  ein Wert für die ganze Aufnahme
 *
 * Alle drei sind reine Funktionen und werden anderswo schon so benutzt: Das
 * Mess-Labor bewertet seine Prüfstücke seit jeher genau auf diesem Weg
 * (`lab/benchmark.ts`, `scoreClip`). Was hier neu ist, ist nicht die Rechnung,
 * sondern dass ihr Ergebnis im **Produkt** ankommt: gespeichert, im Verlauf,
 * auf der Maschinenseite.
 *
 * ## Und warum die Engine dieselbe ist
 *
 * `classifyWithEngines` schaltet nach dem Modell, nicht nach dem Aufrufer. Eine
 * Maschine, die mit GMIA angelernt wurde, wird mit GMIA bewertet — ob der Ton
 * aus dem Mikrofon kam oder aus einer Datei, weiß die Engine nicht und muss es
 * nicht wissen. Ein eigener Bewertungsweg für Dateien wäre eine zweite Antwort
 * auf dieselbe Frage.
 *
 * ## Was es NICHT tut
 *
 * Keine Ampel ohne Maßstab: Ohne Normalzustand gibt es keine Prüfung, sondern
 * einen benannten Satz. Und kein Urteil über die Ursache — „klingt anders als
 * der Normalzustand" ist eine Beobachtung, alles Weitere wäre eine Behauptung.
 */

import type { DiagnosisResult, Machine } from '@data/types.js';
import { extractFeatures, DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import {
  classifyWithEnginesAsync,
  resolveEngineId,
} from '@core/ml/engine/registry.js';
import { classifyHealthStatus } from '@core/ml/scoring.js';
import { clipAggregate } from '../../lab/clipAggregate.js';
import { getRecordingsForMachine, saveDiagnosis, saveRecording } from '@data/db.js';
import { merkeErgebnis } from './ergebnis.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';

/**
 * Was aus dem mitgebrachten Ton wurde.
 *
 * Mit Satz statt mit Fehlercode — derselbe Grund wie beim Normalzustand: Wer
 * eine Datei mitbringt, steht in einem Dialog, und dort muss stehen, was jetzt
 * zu tun ist.
 */
export type Pruefbefund = { ok: true; wert: number } | { ok: false; satz: string };

/**
 * So viel Ton braucht eine Prüfung mindestens.
 *
 * Ein Fenster ist 330 ms lang, der Vorschub 66 ms. Zwei Sekunden sind rund 26
 * Fenster — wenig, aber genug für einen Mittelwert, der nicht von einem
 * einzelnen Knall lebt. Der Normalzustand verlangt mehr (5 s), weil er der
 * Maßstab ist und nicht die Messung.
 */
export const MINDESTDAUER_PRUEFUNG = 2.0;

/**
 * Den mitgebrachten Ton gegen den Normalzustand der Maschine bewerten.
 *
 * Bei Erfolg ist die Prüfung gespeichert, liegt im Verlauf und wird über
 * `merkeErgebnis` auf der Maschinenebene gezeigt — genau wie eine Prüfung am
 * Mikrofon.
 */
export async function pruefeMitgebrachtenTon(
  maschine: Machine,
  ton: AudioBuffer
): Promise<Pruefbefund> {
  const modelle = maschine.referenceModels ?? [];
  if (modelle.length === 0) {
    return { ok: false, satz: t('mitbringen.pruefungOhneNormalzustand') };
  }
  if (ton.duration < MINDESTDAUER_PRUEFUNG) {
    return {
      ok: false,
      satz: t('mitbringen.pruefungZuKurz', {
        dauer: ton.duration.toFixed(1),
        mindest: String(MINDESTDAUER_PRUEFUNG),
      }),
    };
  }

  try {
    /**
     * Die Abtastrate kommt aus dem Ton, nicht aus der Voreinstellung.
     *
     * `decodeAudioData` liefert die Datei in der Rate des AudioContext — und
     * genau in dieser Rate wurde auch der Normalzustand angelernt, weil dort
     * dieselbe Voreinstellung galt. Die Merkmale müssen auf derselben Skala
     * liegen wie die des Modells, sonst vergleicht man zwei Achsen.
     */
    const rate = ton.sampleRate;
    const dspConfig = {
      ...DEFAULT_DSP_CONFIG,
      sampleRate: rate,
      frequencyRange: [0, rate / 2] as [number, number],
    };
    const merkmale = extractFeatures(ton, dspConfig);
    if (merkmale.length === 0) {
      return { ok: false, satz: t('mitbringen.pruefungGingNicht') };
    }

    /**
     * Ein Urteil je Fenster, dann ein Wert für die ganze Aufnahme.
     *
     * `mean` und nicht `p90`: Der Mittelwert ist die ruhigere Auskunft, und
     * eine mitgebrachte Datei ist selten so sauber geschnitten wie eine
     * Aufnahme am Gerät — ein einzelner Griff ans Mikrofon soll sie nicht
     * kippen. Dieselbe Voreinstellung wie im Mess-Labor.
     */
    const werte: number[] = [];
    let letzteVertrauen = 0;
    const mono = mischeMono(ton);
    const mitYamnet = modelle.some((modell) => resolveEngineId(modell) === 'yamnet');
    // YAMNet braucht 0,96-s-Rohfenster. Sein nativer Vorschub von 0,48 s
    // vermeidet dutzende teure, fast identische Inferenzen pro Sekunde. Die
    // synchronen Engines bekommen bei Mischbeständen das zeitlich passende
    // 330-ms-Merkmalsfenster aus derselben Aufnahme.
    const fenster = Math.round((mitYamnet ? 0.96 : DEFAULT_DSP_CONFIG.windowSize) * rate);
    const schritt = Math.max(
      1,
      Math.round((mitYamnet ? 0.48 : DEFAULT_DSP_CONFIG.hopSize) * rate)
    );
    const merkmalsSchritt = Math.max(1, Math.round(DEFAULT_DSP_CONFIG.hopSize * rate));
    for (let start = 0; start + fenster <= mono.length; start += schritt) {
      const feature = merkmale[Math.min(merkmale.length - 1, Math.round(start / merkmalsSchritt))];
      const urteil = await classifyWithEnginesAsync(modelle, {
        feature,
        rawChunk: mitYamnet ? mono.slice(start, start + fenster) : undefined,
        sampleRate: rate,
      });
      werte.push(urteil.healthScore);
      letzteVertrauen = urteil.confidence;
    }
    const wert = clipAggregate(werte, 'mean');
    if (!Number.isFinite(wert)) {
      return { ok: false, satz: t('mitbringen.pruefungGingNicht') };
    }

    const status = classifyHealthStatus(wert);
    const diagnose: DiagnosisResult = {
      id: `diag-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      machineId: maschine.id,
      timestamp: Date.now(),
      healthScore: wert,
      status,
      confidence: letzteVertrauen,
      rawCosineSimilarity: 0,
      metadata: {
        // Damit im Verlauf steht, woher diese Prüfung kam. Eine Prüfung aus
        // einer Datei ist so gültig wie eine am Gerät — aber sie ist nicht
        // dieselbe Sache, und das darf man ihr später ansehen.
        processingMode: 'file',
        totalScores: werte.length,
        evaluatedModels: modelle.length,
        multiclassMode: true,
      },
    };

    await saveDiagnosis(diagnose);
    /**
     * Den Ton aufbewahren — mit der Kennung der Prüfung.
     *
     * Nur so lässt sich das Ergebnis später wieder aufmachen: Klangbild,
     * Hör-Lupe und Gebirge holen ihre Aufnahme über genau diese Kennung.
     * Scheitert es, ist die Prüfung trotzdem gültig; nur nachhören kann man
     * sie dann nicht.
     */
    try {
      await saveRecording({
        id: diagnose.id,
        machineId: maschine.id,
        type: 'diagnosis',
        audioBuffer: ton,
        timestamp: diagnose.timestamp,
        duration: ton.duration,
        sampleRate: rate,
      });
    } catch (fehler) {
      logger.warn('Prüfung aus Datei: Ton nicht aufbewahrt', fehler);
    }

    const referenz = await normalzustandsTon(maschine.id);
    merkeErgebnis({
      maschinenId: maschine.id,
      diagnoseId: diagnose.id,
      wert: diagnose.healthScore,
      zeitpunkt: diagnose.timestamp,
      referenz,
      messung: ton,
    });
    logger.info(`📄 Prüfung aus Datei: ${wert.toFixed(1)} % (${status})`);
    return { ok: true, wert };
  } catch (fehler) {
    logger.error('Prüfung aus Datei fehlgeschlagen:', fehler);
    return { ok: false, satz: t('mitbringen.pruefungGingNicht') };
  }
}

/** Mehrkanal-Dateien so mischen wie die Merkmalsextraktion. */
function mischeMono(ton: AudioBuffer): Float32Array {
  if (ton.numberOfChannels === 1) return ton.getChannelData(0);
  const mono = new Float32Array(ton.length);
  for (let kanal = 0; kanal < ton.numberOfChannels; kanal++) {
    const daten = ton.getChannelData(kanal);
    for (let i = 0; i < mono.length; i++) mono[i] += daten[i] / ton.numberOfChannels;
  }
  return mono;
}

/** Der jüngste aufbewahrte Normalzustand — für Klangbild und Hör-Lupe. */
async function normalzustandsTon(maschinenId: string): Promise<AudioBuffer | null> {
  try {
    const alle = await getRecordingsForMachine(maschinenId);
    return (
      alle
        .filter((r) => r.type === 'reference' && r.audioBuffer)
        .sort((a, b) => b.timestamp - a.timestamp)[0]?.audioBuffer ?? null
    );
  } catch (fehler) {
    logger.warn('Prüfung aus Datei: Normalzustand nicht ladbar', fehler);
    return null;
  }
}
