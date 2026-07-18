/**
 * MIGRATIONS-WÄCHTER (Betreiber-Anforderung: Updates erhalten die Daten).
 *
 * Kernaussage: Eine BEFÜLLTE Datenbank auf Schema v3 (erste Multiclass-
 * Generation) wird beim Öffnen mit der aktuellen DB_VERSION migriert,
 * OHNE dass Maschinen, Prüfungen oder Aufnahmen verloren gehen — und die
 * neuen Stores (app_settings, reference_data) entstehen additiv.
 *
 * Dieser Test schlägt automatisch fehl, sobald irgendeine KÜNFTIGE
 * Migration (v9, v10, …) destruktiv wird (clear/deleteObjectStore auf
 * befüllten Stores). Er ist damit die technische Verankerung der Policy
 * "App-Update ≠ Datenverlust".
 *
 * localStorage-Einstellungen sind von App-Updates ohnehin unberührt
 * (Audit: kein localStorage.clear() im Code; nur gezielte removeItem der
 * jeweils eigenen Feature-Schlüssel).
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

const DB_NAME = 'zanobot-db';
const OLD_VERSION = 3;

/** Roh-IndexedDB: v3-Datenbank mit den drei Ur-Stores anlegen und befüllen. */
function seedV3Database(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, OLD_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const machines = db.createObjectStore('machines', { keyPath: 'id' });
      machines.createIndex('by-name', 'name');
      machines.createIndex('by-created', 'createdAt');
      const recordings = db.createObjectStore('recordings', { keyPath: 'id' });
      recordings.createIndex('by-machine', 'machineId');
      recordings.createIndex('by-timestamp', 'timestamp');
      const diagnoses = db.createObjectStore('diagnoses', { keyPath: 'id' });
      diagnoses.createIndex('by-machine', 'machineId');
      diagnoses.createIndex('by-timestamp', 'timestamp');
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['machines', 'recordings', 'diagnoses'], 'readwrite');
      tx.objectStore('machines').put({
        id: 'legacy-pumpe',
        name: 'Legacy Pumpe',
        createdAt: 1700000000000,
        referenceModels: [
          {
            // GMIA-Modell der v3-Generation (ohne engineId — wird als 'gmia' gelesen)
            machineId: 'legacy-pumpe',
            label: 'Baseline',
            type: 'healthy',
            weightVector: [0.1, 0.2, 0.3],
            scalingConstant: 1.5,
            trainingDate: 1700000000000,
          },
        ],
      });
      tx.objectStore('diagnoses').put({
        id: 'diag-legacy-1',
        machineId: 'legacy-pumpe',
        timestamp: 1700000100000,
        healthScore: 91.5,
        status: 'healthy',
        confidence: 88,
      });
      tx.objectStore('recordings').put({
        id: 'rec-legacy-1',
        machineId: 'legacy-pumpe',
        type: 'reference',
        timestamp: 1700000000000,
        duration: 10,
        sampleRate: 48000,
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe('DB-Migration erhält Bestandsdaten (Update-Policy)', () => {
  beforeEach(async () => {
    // Frische fake-indexeddb pro Test
    indexedDB.deleteDatabase(DB_NAME);
    // Modul-Cache leeren, damit initDB() eine frische dbInstance öffnet
    // (db.ts hält ein Singleton)
    await new Promise((r) => setTimeout(r, 10));
  });

  it('migrates a populated v3 database to the current version without data loss', async () => {
    await seedV3Database();

    // Aktuelles Schema öffnen → Upgrade-Kette v3 → DB_VERSION läuft
    const { initDB, getMachine, getAllMachines } = await import('./db.js');
    const db = await initDB();

    // Alle historischen Stores existieren weiter + neue Stores sind da
    expect([...db.objectStoreNames].sort()).toEqual(
      ['app_settings', 'diagnoses', 'machines', 'recordings', 'reference_data'].sort()
    );

    // Daten haben die Migration überlebt
    const machines = await getAllMachines();
    expect(machines.length).toBe(1);
    const machine = await getMachine('legacy-pumpe');
    expect(machine?.name).toBe('Legacy Pumpe');
    expect(machine?.referenceModels?.length).toBe(1);

    const diag = await db.get('diagnoses', 'diag-legacy-1');
    expect(diag?.healthScore).toBe(91.5);
    const rec = await db.get('recordings', 'rec-legacy-1');
    expect(rec?.machineId).toBe('legacy-pumpe');
  });
});
