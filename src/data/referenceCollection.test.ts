/**
 * Tests für den Bau einer teilbaren Referenz-Sammlung.
 *
 * Die wichtigste Aussage ist die erste: eine selbst angelernte Referenz muss
 * exportierbar sein. Der alte Pfad las nur den `ReferenceDatabase`-Datensatz,
 * den es nur nach einem Download gibt — er hätte für die Person, die etwas zu
 * teilen hat, `null` geliefert. Dieser Test hält das fest.
 */

import { describe, it, expect } from 'vitest';
import type { GMIAModel, Machine, ReferenceDatabase } from './types.js';
import {
  buildReferenceCollection,
  collectModels,
  collectionVersion,
  collectionFilename,
} from './referenceCollection.js';

const DAY_MS = 86_400_000;

function model(label: string, over: Partial<GMIAModel> = {}): GMIAModel {
  return {
    machineId: 'm1',
    label,
    type: 'healthy',
    weightVector: new Float64Array([1, 2, 3]),
    regularization: 1e9,
    scalingConstant: 2.5,
    featureDimension: 3,
    trainingDate: 10 * DAY_MS,
    trainingDuration: 16.5,
    sampleRate: 48000,
    metadata: { meanCosineSimilarity: 0.18, targetScore: 0.9 },
    ...over,
  };
}

function machine(over: Partial<Machine> = {}): Machine {
  return {
    id: 'm1',
    name: 'Golf 7 TDI',
    createdAt: 0,
    referenceModels: [],
    ...over,
  } as Machine;
}

function refDb(over: Partial<ReferenceDatabase> = {}): ReferenceDatabase {
  return {
    machineId: 'm1',
    version: '1.4.2',
    downloadedAt: 0,
    sourceUrl: 'https://example.test/db-latest.json',
    data: {},
    ...over,
  };
}

describe('collectModels', () => {
  it('exports a self-trained reference — no downloaded database needed', () => {
    // Der Fall, für den der alte Pfad null lieferte.
    const models = collectModels(machine({ referenceModels: [model('Normalzustand')] }), null);
    expect(models).toHaveLength(1);
    expect(models[0].label).toBe('Normalzustand');
  });

  it('serializes weightVector to a plain array so JSON keeps the numbers', () => {
    // Float64Array wird von JSON.stringify zu {"0":1,"1":2,…} — der Importpfad
    // erwartet ein Array. Ohne diese Umwandlung ist die Datei stillschweigend
    // unbrauchbar.
    const models = collectModels(machine({ referenceModels: [model('A')] }), null);
    expect(Array.isArray(models[0].weightVector)).toBe(true);
    expect(JSON.parse(JSON.stringify(models[0].weightVector))).toEqual([1, 2, 3]);
  });

  it('merges a downloaded collection so passing it on loses nothing', () => {
    const models = collectModels(
      machine({ referenceModels: [model('Eigene')] }),
      refDb({
        data: { referenceModels: [model('Geladen')] },
        localModels: [model('Lokal')],
      })
    );
    expect(models.map((m) => m.label)).toEqual(['Eigene', 'Lokal', 'Geladen']);
  });

  it('locally trained wins over a downloaded reference with the same label', () => {
    // Derselbe Vorrang wie beim Import (dort überschreibt ein Download lokale
    // Modelle NICHT) — der Export beschreibt damit, was das Gerät benutzt.
    const mine = model('Normalzustand', { scalingConstant: 111 });
    const theirs = model('normalzustand', { scalingConstant: 222 });
    const models = collectModels(
      machine({ referenceModels: [mine] }),
      refDb({
        data: { referenceModels: [theirs] },
      })
    );
    expect(models).toHaveLength(1);
    expect(models[0].scalingConstant).toBe(111);
  });

  it('keeps fault references — they are worth sharing too', () => {
    const models = collectModels(
      machine({
        referenceModels: [model('Normalzustand'), model('Lagerschaden', { type: 'faulty' })],
      }),
      null
    );
    expect(models.map((m) => m.type)).toEqual(['healthy', 'faulty']);
  });
});

describe('collectionVersion', () => {
  it('continues an existing chain by bumping the patch', () => {
    // Die veröffentlichte Kette darf nicht abreißen: ein anderes Schema könnte
    // eine NIEDRIGERE Nummer erzeugen, und dann aktualisiert niemand mehr.
    expect(collectionVersion('1.4.2', [model('A')])).toBe('1.4.3');
    expect(collectionVersion('2', [model('A')])).toBe('2.0.1');
  });

  it('derives a first version from the content, not from the act of exporting', () => {
    const models = [model('A', { trainingDate: 42 * DAY_MS }), model('B')];
    expect(collectionVersion(undefined, models)).toBe('1.2.42');
    expect(collectionVersion('', models)).toBe('1.2.42');
  });

  it('two exports of unchanged data give the same version — nothing to re-fetch', () => {
    const models = [model('A')];
    expect(collectionVersion(undefined, models)).toBe(collectionVersion(undefined, models));
  });

  it('rises when a reference is added or re-recorded', () => {
    const base = [model('A', { trainingDate: 10 * DAY_MS })];
    const added = [...base, model('B', { trainingDate: 10 * DAY_MS })];
    const redone = [model('A', { trainingDate: 11 * DAY_MS })];
    const cmp = (v: string) => v.split('.').map(Number);
    expect(cmp(collectionVersion(undefined, added))[1]).toBeGreaterThan(
      cmp(collectionVersion(undefined, base))[1]
    );
    expect(cmp(collectionVersion(undefined, redone))[2]).toBeGreaterThan(
      cmp(collectionVersion(undefined, base))[2]
    );
  });
});

describe('collectionFilename', () => {
  it('strips characters a filesystem may refuse', () => {
    expect(collectionFilename(machine({ name: 'Golf 7 TDI / warm' }), '1.1.20')).toBe(
      'reference-db_Golf_7_TDI___warm_v1.1.20.json'
    );
  });

  it('falls back to the id when there is no name', () => {
    expect(collectionFilename(machine({ name: '' }), '1.0.0')).toContain('m1');
  });
});

describe('buildReferenceCollection', () => {
  it('produces a file the loader accepts', () => {
    const built = buildReferenceCollection(
      machine({ referenceModels: [model('Normalzustand')], location: 'Einfahrt', notes: 'warm' }),
      null
    )!;
    expect(built.file.db_meta.db_version).toBe(built.version);
    expect(built.file.db_meta.created_by).toBe('user-export');
    expect(built.file.db_meta.created_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(built.file.models).toHaveLength(1);
    expect(built.file.machineName).toBe('Golf 7 TDI');
    expect(built.file.location).toBe('Einfahrt');
    expect(built.file.notes).toBe('warm');
  });

  it('names the sample rate — the most common reason a shared collection does not compute', () => {
    const built = buildReferenceCollection(
      machine({
        referenceModels: [model('A'), model('B', { sampleRate: 44100 })],
      }),
      null
    )!;
    expect(built.file.db_meta.description).toContain('44100');
    expect(built.file.db_meta.description).toContain('48000');
  });

  it('returns null when there is nothing to share instead of an empty file', () => {
    // Eine Sammlung ohne Referenzen wäre beim Empfänger ein stiller Fehlschlag.
    expect(buildReferenceCollection(machine(), null)).toBeNull();
    expect(buildReferenceCollection(machine(), refDb())).toBeNull();
  });

  it('survives JSON round-trip with the numbers intact', () => {
    const built = buildReferenceCollection(
      machine({ referenceModels: [model('Normalzustand')] }),
      null
    )!;
    const parsed = JSON.parse(JSON.stringify(built.file));
    expect(parsed.models[0].weightVector).toEqual([1, 2, 3]);
    expect(parsed.models[0].sampleRate).toBe(48000);
  });
});
