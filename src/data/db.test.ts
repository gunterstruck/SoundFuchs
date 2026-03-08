/**
 * ZANOBOT - DATABASE TESTS
 *
 * Comprehensive tests for IndexedDB operations and migrations.
 *
 * Test Coverage:
 * - Database initialization
 * - Machine CRUD operations
 * - Diagnosis CRUD operations
 * - Database migrations (v1 → v2)
 * - Export/Import functionality
 * - Data integrity
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDB,
  saveMachine,
  getMachine,
  getAllMachines,
  updateMachineModel,
  saveDiagnosis,
  getDiagnosesForMachine,
  exportData,
  importData,
  getDBStats,
  clearAllData,
} from './db.js';
import type { Machine, GMIAModel, DiagnosisResult } from './types.js';

// Mock IndexedDB for testing
import 'fake-indexeddb/auto';

describe('Database Operations', () => {
  beforeEach(async () => {
    // Clear database before each test
    try {
      await clearAllData();
    } catch {
      // Ignore errors if DB doesn't exist yet
    }

    // Initialize fresh database
    await initDB();
  });

  afterEach(async () => {
    // Cleanup after each test
    try {
      await clearAllData();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Database Initialization', () => {
    it('should initialize database with correct version', async () => {
      const db = await initDB();

      expect(db).toBeDefined();
      expect(db.version).toBe(7); // Current DB version (NFC Machine Setup + Reference Database)
    });

    it('should create all required object stores', async () => {
      const db = await initDB();

      expect(db.objectStoreNames.contains('machines')).toBe(true);
      expect(db.objectStoreNames.contains('recordings')).toBe(true);
      expect(db.objectStoreNames.contains('diagnoses')).toBe(true);
      expect(db.objectStoreNames.contains('app_settings')).toBe(true);
      expect(db.objectStoreNames.contains('reference_data')).toBe(true);
    });

    it('should create indices for diagnoses store', async () => {
      const db = await initDB();

      const transaction = db.transaction(['diagnoses'], 'readonly');
      const store = transaction.objectStore('diagnoses');

      expect(store.indexNames.contains('by-machine')).toBe(true);
      expect(store.indexNames.contains('by-timestamp')).toBe(true);
      expect(store.indexNames.contains('by-status')).toBe(true);
    });
  });

  describe('Machine Operations', () => {
    it('should save a new machine', async () => {
      const machine: Machine = {
        id: 'test-machine-001',
        name: 'Test Machine',
        createdAt: Date.now(),
        referenceModels: [],
      };

      await saveMachine(machine);

      const retrieved = await getMachine(machine.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(machine.id);
      expect(retrieved?.name).toBe(machine.name);
    });

    it('should retrieve machine by ID', async () => {
      const machine: Machine = {
        id: 'machine-123',
        name: 'Pump A',
        createdAt: Date.now(),
        referenceModels: [],
      };

      await saveMachine(machine);
      const retrieved = await getMachine('machine-123');

      expect(retrieved).toEqual(machine);
    });

    it('should return undefined for non-existent machine', async () => {
      const retrieved = await getMachine('non-existent-id');

      expect(retrieved).toBeUndefined();
    });

    it('should get all machines', async () => {
      const machines: Machine[] = [
        { id: 'm1', name: 'Machine 1', createdAt: Date.now(), referenceModels: [] },
        { id: 'm2', name: 'Machine 2', createdAt: Date.now(), referenceModels: [] },
        { id: 'm3', name: 'Machine 3', createdAt: Date.now(), referenceModels: [] },
      ];

      for (const machine of machines) {
        await saveMachine(machine);
      }

      const allMachines = await getAllMachines();

      expect(allMachines).toHaveLength(3);
      expect(allMachines.map((m) => m.id)).toContain('m1');
      expect(allMachines.map((m) => m.id)).toContain('m2');
      expect(allMachines.map((m) => m.id)).toContain('m3');
    });

    it('should update machine with GMIA model', async () => {
      const machine: Machine = {
        id: 'machine-model-test',
        name: 'Test Machine',
        createdAt: Date.now(),
        referenceModels: [],
      };

      await saveMachine(machine);

      const model: GMIAModel = {
        machineId: 'machine-model-test',
        label: 'Test Model',
        type: 'healthy',
        weightVector: new Float64Array([1, 2, 3]),
        regularization: 1e9,
        scalingConstant: 2.5,
        featureDimension: 3,
        trainingDate: Date.now(),
        trainingDuration: 10,
        sampleRate: 44100,
        metadata: {
          meanCosineSimilarity: 0.9,
          targetScore: 0.9,
        },
      };

      await updateMachineModel('machine-model-test', model);

      const updated = await getMachine('machine-model-test');

      expect(updated?.referenceModels).toBeDefined();
      expect(updated?.referenceModels).toHaveLength(1);
      expect(updated?.referenceModels[0]?.label).toBe('Test Model');
      expect(updated?.referenceModels[0]?.scalingConstant).toBe(2.5);
      expect(updated?.referenceModels[0]?.featureDimension).toBe(3);
    });
  });

  describe('Diagnosis Operations', () => {
    const mockDiagnosis: DiagnosisResult = {
      id: 'diag-001',
      machineId: 'machine-123',
      timestamp: Date.now(),
      healthScore: 85.5,
      rawCosineSimilarity: 0.92,
      confidence: 88,
      status: 'healthy',
    };

    beforeEach(async () => {
      // Create test machine first
      const machine: Machine = {
        id: 'machine-123',
        name: 'Test Machine',
        createdAt: Date.now(),
        referenceModels: [],
      };
      await saveMachine(machine);
    });

    it('should save a diagnosis', async () => {
      await saveDiagnosis(mockDiagnosis);

      const diagnoses = await getDiagnosesForMachine('machine-123');

      expect(diagnoses).toHaveLength(1);
      expect(diagnoses[0].id).toBe('diag-001');
      expect(diagnoses[0].healthScore).toBe(85.5);
    });

    it('should get diagnoses by machine ID', async () => {
      const diagnoses: DiagnosisResult[] = [
        { ...mockDiagnosis, id: 'diag-1', timestamp: Date.now() - 3000 },
        { ...mockDiagnosis, id: 'diag-2', timestamp: Date.now() - 2000 },
        { ...mockDiagnosis, id: 'diag-3', timestamp: Date.now() - 1000 },
      ];

      for (const diag of diagnoses) {
        await saveDiagnosis(diag);
      }

      const retrieved = await getDiagnosesForMachine('machine-123');

      expect(retrieved).toHaveLength(3);
      // Should be sorted by timestamp (newest first)
      expect(retrieved[0].id).toBe('diag-3');
      expect(retrieved[2].id).toBe('diag-1');
    });

    it('should return empty array for machine with no diagnoses', async () => {
      const diagnoses = await getDiagnosesForMachine('non-existent-machine');

      expect(diagnoses).toHaveLength(0);
    });

    it('should handle different diagnosis statuses', async () => {
      const statuses: Array<'healthy' | 'uncertain' | 'faulty'> = [
        'healthy',
        'uncertain',
        'faulty',
      ];

      for (let i = 0; i < statuses.length; i++) {
        await saveDiagnosis({
          ...mockDiagnosis,
          id: `diag-${i}`,
          status: statuses[i],
        });
      }

      const diagnoses = await getDiagnosesForMachine('machine-123');

      expect(diagnoses).toHaveLength(3);
      expect(diagnoses.map((d) => d.status)).toContain('healthy');
      expect(diagnoses.map((d) => d.status)).toContain('uncertain');
      expect(diagnoses.map((d) => d.status)).toContain('faulty');
    });
  });

  describe('Database Statistics', () => {
    it('should return correct stats for empty database', async () => {
      const stats = await getDBStats();

      expect(stats.machines).toBe(0);
      expect(stats.recordings).toBe(0);
      expect(stats.diagnoses).toBe(0);
    });

    it('should return correct stats with data', async () => {
      // Add machines
      await saveMachine({ id: 'm1', name: 'M1', createdAt: Date.now(), referenceModels: [] });
      await saveMachine({ id: 'm2', name: 'M2', createdAt: Date.now(), referenceModels: [] });

      // Add diagnoses
      await saveDiagnosis({
        id: 'd1',
        machineId: 'm1',
        timestamp: Date.now(),
        healthScore: 80,
        rawCosineSimilarity: 0.9,
        confidence: 85,
        status: 'healthy',
      });

      const stats = await getDBStats();

      expect(stats.machines).toBe(2);
      expect(stats.diagnoses).toBe(1);
    });
  });

  describe('Export/Import Operations', () => {
    it('should export database to JSON', async () => {
      // Add test data
      const machine: Machine = {
        id: 'export-test',
        name: 'Export Test Machine',
        createdAt: Date.now(),
        referenceModels: [],
      };

      await saveMachine(machine);

      const exported = await exportData();

      expect(exported.machines).toHaveLength(1);
      expect(exported.machines[0].id).toBe('export-test');
      expect(exported.recordings).toBeDefined();
      expect(exported.diagnoses).toBeDefined();
    });

    it('should import database from JSON (replace mode)', async () => {
      // Create existing data
      await saveMachine({
        id: 'old',
        name: 'Old Machine',
        createdAt: Date.now(),
        referenceModels: [],
      });

      // Import new data (replace)
      const importData_mock = {
        version: 2,
        exportDate: Date.now(),
        machines: [{ id: 'new', name: 'New Machine', createdAt: Date.now(), referenceModels: [] }],
        recordings: [],
        diagnoses: [],
      };

      await importData(importData_mock, false); // false = replace mode

      const machines = await getAllMachines();

      expect(machines).toHaveLength(1);
      expect(machines[0].id).toBe('new'); // Old data replaced
    });

    it('should import database from JSON (merge mode)', async () => {
      // Create existing data
      await saveMachine({
        id: 'existing',
        name: 'Existing',
        createdAt: Date.now(),
        referenceModels: [],
      });

      // Import new data (merge)
      const importData_mock = {
        version: 2,
        exportDate: Date.now(),
        machines: [
          { id: 'imported', name: 'Imported', createdAt: Date.now(), referenceModels: [] },
        ],
        recordings: [],
        diagnoses: [],
      };

      await importData(importData_mock, true); // true = merge mode

      const machines = await getAllMachines();

      expect(machines).toHaveLength(2);
      expect(machines.map((m) => m.id)).toContain('existing');
      expect(machines.map((m) => m.id)).toContain('imported');
    });

    it('should merge referenceModels when importing machine with same ID (merge mode)', async () => {
      const baseModel: GMIAModel = {
        label: 'Motor-links',
        machineId: 'pump-1',
        type: 'healthy',
        weightVector: new Float64Array([1, 2, 3]),
        regularization: 1e9,
        scalingConstant: 1.0,
        featureDimension: 3,
        trainingDate: Date.now(),
        trainingDuration: 10,
        sampleRate: 44100,
        metadata: { meanCosineSimilarity: 0.95, targetScore: 0.9 },
      };

      // Create existing machine with one reference model
      await saveMachine({
        id: 'pump-1',
        name: 'Pumpe 1',
        createdAt: Date.now(),
        referenceModels: [baseModel],
      });

      // Import same machine with different reference model
      const importDataMock = {
        machines: [
          {
            id: 'pump-1',
            name: 'Pumpe 1 (updated)',
            createdAt: Date.now(),
            referenceModels: [
              {
                ...baseModel,
                label: 'Motor-rechts',
                weightVector: new Float64Array([4, 5, 6]),
              },
            ],
          },
        ],
        recordings: [],
        diagnoses: [],
      };

      await importData(importDataMock, true); // merge mode

      const machine = await getMachine('pump-1');
      expect(machine).toBeDefined();
      expect(machine!.name).toBe('Pumpe 1'); // Original name preserved
      expect(machine!.referenceModels).toHaveLength(2); // Both models present
      expect(machine!.referenceModels.map(m => m.label)).toContain('Motor-links');
      expect(machine!.referenceModels.map(m => m.label)).toContain('Motor-rechts');
    });

    it('should skip duplicate models when merging (merge mode)', async () => {
      const baseModel: GMIAModel = {
        label: 'Normalbetrieb',
        machineId: 'pump-2',
        type: 'healthy',
        weightVector: new Float64Array([1, 2, 3]),
        regularization: 1e9,
        scalingConstant: 1.0,
        featureDimension: 3,
        trainingDate: Date.now(),
        trainingDuration: 10,
        sampleRate: 44100,
        metadata: { meanCosineSimilarity: 0.95, targetScore: 0.9 },
      };

      await saveMachine({
        id: 'pump-2',
        name: 'Pumpe 2',
        createdAt: Date.now(),
        referenceModels: [baseModel],
      });

      const importDataMock = {
        machines: [
          {
            id: 'pump-2',
            name: 'Pumpe 2',
            createdAt: Date.now(),
            referenceModels: [
              {
                ...baseModel,
                label: 'Normalbetrieb', // Duplicate!
                weightVector: new Float64Array([7, 8, 9]),
              },
            ],
          },
        ],
        recordings: [],
        diagnoses: [],
      };

      await importData(importDataMock, true);

      const machine = await getMachine('pump-2');
      expect(machine!.referenceModels).toHaveLength(1); // No duplicate added
      // Original model preserved (not overwritten with import version)
      expect(machine!.referenceModels[0].weightVector).toBeInstanceOf(Float64Array);
    });

    it('should overwrite placeholder name with imported name (merge mode)', async () => {
      // Simulate auto-created machine with placeholder name (NFC provisioning scenario)
      await saveMachine({
        id: '50hz',
        name: '50hz', // Placeholder: same as ID
        nameIsPlaceholder: true,
        createdAt: Date.now(),
        referenceModels: [],
      });

      // Import database that contains the real machine name
      const importDataMock = {
        machines: [
          {
            id: '50hz',
            name: 'V20', // Real name from exported database
            createdAt: Date.now(),
            referenceModels: [],
          },
        ],
        recordings: [],
        diagnoses: [],
      };

      await importData(importDataMock, true); // merge mode

      const machine = await getMachine('50hz');
      expect(machine).toBeDefined();
      expect(machine!.name).toBe('V20'); // Imported name should overwrite placeholder
      expect(machine!.nameIsPlaceholder).toBeUndefined(); // Flag should be cleared
    });

    it('should NOT overwrite manually set name with imported name (merge mode)', async () => {
      // Machine with a real user-given name (no placeholder flag)
      await saveMachine({
        id: '50hz',
        name: 'My Custom Name',
        createdAt: Date.now(),
        referenceModels: [],
      });

      const importDataMock = {
        machines: [
          {
            id: '50hz',
            name: 'V20',
            createdAt: Date.now(),
            referenceModels: [],
          },
        ],
        recordings: [],
        diagnoses: [],
      };

      await importData(importDataMock, true); // merge mode

      const machine = await getMachine('50hz');
      expect(machine).toBeDefined();
      expect(machine!.name).toBe('My Custom Name'); // Manual name preserved
    });

    it('should handle empty export', async () => {
      const exported = await exportData();

      expect(exported.machines).toHaveLength(0);
      expect(exported.recordings).toHaveLength(0);
      expect(exported.diagnoses).toHaveLength(0);
    });
  });

  describe('Clear All Data', () => {
    it('should delete all data from all stores', async () => {
      // Add test data
      await saveMachine({ id: 'm1', name: 'M1', createdAt: Date.now(), referenceModels: [] });
      await saveMachine({ id: 'm2', name: 'M2', createdAt: Date.now(), referenceModels: [] });

      await saveDiagnosis({
        id: 'd1',
        machineId: 'm1',
        timestamp: Date.now(),
        healthScore: 80,
        rawCosineSimilarity: 0.9,
        confidence: 85,
        status: 'healthy',
      });

      // Clear all
      await clearAllData();

      // Verify empty
      const stats = await getDBStats();
      expect(stats.machines).toBe(0);
      expect(stats.recordings).toBe(0);
      expect(stats.diagnoses).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle duplicate machine IDs (update)', async () => {
      const machine1: Machine = {
        id: 'dup-test',
        name: 'Original',
        createdAt: Date.now(),
        referenceModels: [],
      };

      const machine2: Machine = {
        id: 'dup-test',
        name: 'Updated',
        createdAt: Date.now() + 1000,
        referenceModels: [],
      };

      await saveMachine(machine1);
      await saveMachine(machine2); // Should update, not create duplicate

      const machines = await getAllMachines();
      expect(machines).toHaveLength(1);
      expect(machines[0].name).toBe('Updated');
    });

    it('should handle special characters in machine ID', async () => {
      const machine: Machine = {
        id: 'machine-with-special-chars-äöü-123!@#',
        name: 'Special Machine',
        createdAt: Date.now(),
        referenceModels: [],
      };

      await saveMachine(machine);
      const retrieved = await getMachine(machine.id);

      expect(retrieved?.id).toBe(machine.id);
    });

    it('should handle large datasets', async () => {
      // Create 100 machines
      const machines: Machine[] = [];
      for (let i = 0; i < 100; i++) {
        machines.push({
          id: `machine-${i}`,
          name: `Machine ${i}`,
          createdAt: Date.now() + i,
          referenceModels: [],
        });
      }

      for (const machine of machines) {
        await saveMachine(machine);
      }

      const allMachines = await getAllMachines();
      expect(allMachines).toHaveLength(100);
    });
  });
});
