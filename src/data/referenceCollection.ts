/**
 * ZANOBOT — EINE REFERENZ-SAMMLUNG ZUM VERÖFFENTLICHEN BAUEN
 *
 * Das Gegenstück zum Laden: aus dem, was auf diesem Gerät liegt, die Datei
 * bauen, die andere unter `https://…/<sammlung>/db-latest.json` laden können
 * (Format `ReferenceDbFile`, siehe `docs/geteilte-referenzen.md`).
 *
 * WARUM ES DIESES MODUL GIBT — und nicht nur einen Knopf an der alten Funktion:
 *
 * `ReferenceDbService.exportDatabase` las die Modelle bisher ausschließlich aus
 * dem `ReferenceDatabase`-Datensatz. Den gibt es aber nur, wenn schon einmal
 * eine Sammlung von einer URL GELADEN wurde (`saveReferenceDatabase` wird nur
 * dort und in `addLocalModel` gerufen, und `addLocalModel` hat keinen Aufrufer).
 * Wer seinen Normalzustand selbst aufnimmt — der ganze Fahrzeugfall, und genau
 * die Person, die etwas zu teilen hat — hat keinen solchen Datensatz. Ein Knopf
 * an der alten Funktion hätte für sie NICHTS getan.
 *
 * Selbst angelernte Referenzen liegen in `machine.referenceModels`
 * (`2-Reference.ts`, `db.addReferenceModel`). Das ist deshalb hier die
 * Hauptquelle; ein vorhandener `ReferenceDatabase` wird dazugemischt, damit eine
 * geladene Sammlung beim Weitergeben nicht ärmer wird als beim Empfangen.
 */

import type { GMIAModel, Machine, ReferenceDatabase, ReferenceDbFile } from './types.js';

/** Ein Tag in Millisekunden — Basis der inhaltsabgeleiteten Patch-Nummer. */
const DAY_MS = 86_400_000;

/**
 * Modelle für JSON: `weightVector` wird zum gewöhnlichen Array.
 *
 * Der Typ behauptet weiterhin `Float64Array`, weil `ReferenceDbFile.models`
 * dieselbe Struktur für beide Richtungen benutzt und der Importpfad
 * (`applyModelsToMachine`) ein Array wieder einliest. Die Lüge steckt in genau
 * dieser Zeile und nicht verstreut im Code.
 */
function serializeModel(model: GMIAModel): GMIAModel {
  return { ...model, weightVector: Array.from(model.weightVector) as unknown as Float64Array };
}

/**
 * Alle Referenzen dieser Maschine, ohne Doppelte.
 *
 * Reihenfolge = Vorrang: was auf diesem Gerät angelernt wurde, gewinnt gegen
 * eine geladene Version desselben Etiketts. Grund: derselbe Vorrang gilt schon
 * beim Import (`applyModelsToMachine` überschreibt lokale Modelle NICHT), also
 * beschreibt der Export damit den Zustand, den das Gerät tatsächlich benutzt.
 */
export function collectModels(machine: Machine, refDb: ReferenceDatabase | null): GMIAModel[] {
  const out: GMIAModel[] = [];
  const seen = new Set<string>();

  const take = (models: readonly GMIAModel[] | undefined) => {
    for (const model of models ?? []) {
      const key = (model.label ?? '').toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(serializeModel(model));
    }
  };

  take(machine.referenceModels as GMIAModel[] | undefined);
  take(refDb?.localModels);
  take(refDb?.data?.referenceModels);

  return out;
}

/**
 * Version der zu veröffentlichenden Datei.
 *
 * Ein Verbraucher lädt nur neu, wenn die entfernte Version HÖHER ist als seine
 * (`compareVersions`). Eine Version, die sich beim Neu-Veröffentlichen nicht
 * ändert, heißt also: niemand bekommt die neue Datei — ein stiller Fehlschlag,
 * und die schlimmste Sorte.
 *
 * Zwei Fälle, absichtlich getrennt:
 *
 *  - **Sammlung stammt von einer URL** (`existingVersion` gesetzt): Patch
 *    hochzählen, wie bisher. Die veröffentlichte Kette darf nicht abreißen — ein
 *    Wechsel des Schemas könnte eine niedrigere Nummer erzeugen als die schon
 *    veröffentlichte, und dann aktualisiert niemand mehr.
 *  - **Selbst angelernt** (keine Vorgängerversion): aus dem INHALT ableiten —
 *    `1.<anzahl referenzen>.<tag der jüngsten anlernung>`. Damit steigt die
 *    Nummer bei jeder hinzugefügten oder neu aufgenommenen Referenz, und sie
 *    bleibt gleich, wenn sich nichts geändert hat. Zweimal dieselbe Datei
 *    exportieren ergibt dieselbe Version — das ist richtig so, es gibt nichts
 *    nachzuladen.
 *
 * Bekannte Kante: eine Referenz löschen und am selben Tag eine andere aufnehmen
 * hält Anzahl und Tag gleich, obwohl der Inhalt sich geändert hat. Dann muss
 * `db_version` beim Veröffentlichen von Hand angehoben werden.
 */
export function collectionVersion(
  existingVersion: string | undefined,
  models: readonly GMIAModel[]
): string {
  if (existingVersion && existingVersion.trim()) {
    const parts = existingVersion
      .trim()
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    parts[2]++;
    return parts.slice(0, 3).join('.');
  }

  const newest = models.reduce((max, m) => Math.max(max, m.trainingDate ?? 0), 0);
  return `1.${models.length}.${Math.floor(newest / DAY_MS)}`;
}

/** Dateiname für den Download. Nur Zeichen, die jedes Dateisystem verträgt. */
export function collectionFilename(machine: Machine, version: string): string {
  const safeName = (machine.name || machine.id).replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
  return `reference-db_${safeName}_v${version}.json`;
}

/**
 * Die vollständige Datei zusammensetzen.
 *
 * `description` nennt die Aufnahmerate, weil sie die häufigste Ursache dafür
 * ist, dass eine geteilte Sammlung beim Empfänger gar nicht rechnet
 * (`partitionModels` schließt fremde Raten aus, statt sie schlecht zu bewerten).
 * Wer die Datei liest, soll den Grund vor dem Fehlschlag sehen.
 */
export function buildReferenceCollection(
  machine: Machine,
  refDb: ReferenceDatabase | null
): { file: ReferenceDbFile; version: string; filename: string } | null {
  const models = collectModels(machine, refDb);
  if (models.length === 0) return null;

  const version = collectionVersion(refDb?.version, models);
  const rates = Array.from(new Set(models.map((m) => m.sampleRate).filter(Boolean))).sort(
    (a, b) => a - b
  );
  const rateNote = rates.length ? `aufgenommen mit ${rates.join(' / ')} Hz` : '';
  const base = refDb?.dbMeta?.description?.trim();

  const file: ReferenceDbFile = {
    db_meta: {
      db_version: version,
      created_by: 'user-export',
      created_at: new Date().toISOString().split('T')[0],
      description: [base, `${machine.name || machine.id}`, rateNote].filter(Boolean).join(' · '),
    },
    models,
    machineName: machine.name,
    location: machine.location,
    notes: machine.notes,
  };

  return { file, version, filename: collectionFilename(machine, version) };
}
