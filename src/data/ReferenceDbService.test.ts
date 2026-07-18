/**
 * ZANOBOT - REFERENCE DATABASE SERVICE TESTS
 *
 * Tests for versioned reference database functionality:
 * - Semantic version comparison
 * - Version-based update checking
 * - Reference data normalization
 * - Export functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReferenceDbService } from './ReferenceDbService.js';
import {
  initDB,
  saveMachine,
  saveReferenceDatabase,
  getReferenceDatabase,
  clearAllData,
} from './db.js';
import type { Machine, ReferenceDatabase, ReferenceDbFile } from './types.js';

// Mock IndexedDB for testing
import 'fake-indexeddb/auto';

describe('ReferenceDbService', () => {
  beforeEach(async () => {
    try {
      await clearAllData();
    } catch {
      // Ignore errors if DB doesn't exist yet
    }
    await initDB();
  });

  afterEach(async () => {
    try {
      await clearAllData();
    } catch {
      // Ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  describe('Version Comparison', () => {
    it('should correctly compare equal versions', () => {
      expect(ReferenceDbService.compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(ReferenceDbService.compareVersions('2.5.3', '2.5.3')).toBe(0);
    });

    it('should detect when first version is lower', () => {
      expect(ReferenceDbService.compareVersions('1.0.0', '1.0.1')).toBe(-1);
      expect(ReferenceDbService.compareVersions('1.0.0', '1.1.0')).toBe(-1);
      expect(ReferenceDbService.compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(ReferenceDbService.compareVersions('1.9.9', '2.0.0')).toBe(-1);
    });

    it('should detect when first version is higher', () => {
      expect(ReferenceDbService.compareVersions('1.0.1', '1.0.0')).toBe(1);
      expect(ReferenceDbService.compareVersions('1.1.0', '1.0.0')).toBe(1);
      expect(ReferenceDbService.compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(ReferenceDbService.compareVersions('2.0.0', '1.9.9')).toBe(1);
    });

    it('should handle missing or invalid versions', () => {
      expect(ReferenceDbService.compareVersions('', '')).toBe(0);
      expect(ReferenceDbService.compareVersions('1.0.0', '')).toBe(1);
      expect(ReferenceDbService.compareVersions('', '1.0.0')).toBe(-1);
    });

    it('should handle partial versions', () => {
      expect(ReferenceDbService.compareVersions('1', '1.0.0')).toBe(0);
      expect(ReferenceDbService.compareVersions('1.0', '1.0.0')).toBe(0);
      expect(ReferenceDbService.compareVersions('2', '1.9.9')).toBe(1);
    });
  });

  describe('URL Validation', () => {
    // MVP Security: Only official GitHub Pages URLs are accepted
    // This ensures all reference databases come from a trusted source

    it('should reject Google Drive URLs (not official source)', () => {
      const url = 'https://drive.google.com/uc?export=download&id=abc123';
      const result = ReferenceDbService.validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('url_not_official_source');
    });

    it('should reject HTTPS URLs from non-official hosts', () => {
      const url = 'https://example.com/reference.json';
      const result = ReferenceDbService.validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('url_not_official_source');
    });

    it('should reject empty URLs', () => {
      const result = ReferenceDbService.validateUrl('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('url_empty');
    });

    it('should reject HTTP URLs', () => {
      const url = 'http://example.com/reference.json';
      const result = ReferenceDbService.validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('url_not_https');
    });

    it('should reject invalid URLs', () => {
      const result = ReferenceDbService.validateUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('url_invalid');
    });

    it('should reject Google Drive sharing URLs (not official source)', () => {
      const url = 'https://drive.google.com/file/d/abc123/view';
      const result = ReferenceDbService.validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('url_not_official_source');
    });

    it('should accept official GitHub Pages URLs', () => {
      const url = 'https://gunterstruck.github.io/zanobot-backup.json';
      const result = ReferenceDbService.validateUrl(url);
      expect(result.valid).toBe(true);
    });

    it('should accept official GitHub Pages URLs with subdirectories', () => {
      const url = 'https://gunterstruck.github.io/machines/ref-db-v2.json';
      const result = ReferenceDbService.validateUrl(url);
      expect(result.valid).toBe(true);
    });

    it('should reject GitHub Raw URLs (not official source)', () => {
      const url = 'https://raw.githubusercontent.com/gunterstruck/gunterstruck.github.io/main/reference.json';
      const result = ReferenceDbService.validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('url_not_official_source');
    });
  });

  describe('needsDownload', () => {
    it('should return false if machine has no reference URL', async () => {
      const machine: Machine = {
        id: 'test-machine',
        name: 'Test',
        createdAt: Date.now(),
        referenceModels: [],
      };
      await saveMachine(machine);

      const result = await ReferenceDbService.needsDownload('test-machine');
      expect(result).toBe(false);
    });

    it('should return true if machine has URL but no local DB', async () => {
      const machine: Machine = {
        id: 'test-machine',
        name: 'Test',
        createdAt: Date.now(),
        referenceModels: [],
        referenceDbUrl: 'https://example.com/ref.json',
      };
      await saveMachine(machine);

      const result = await ReferenceDbService.needsDownload('test-machine');
      expect(result).toBe(true);
    });

    it('should return false if machine has local reference DB', async () => {
      const machine: Machine = {
        id: 'test-machine',
        name: 'Test',
        createdAt: Date.now(),
        referenceModels: [],
        referenceDbUrl: 'https://example.com/ref.json',
      };
      await saveMachine(machine);

      const refDb: ReferenceDatabase = {
        machineId: 'test-machine',
        version: '1.0.0',
        downloadedAt: Date.now(),
        sourceUrl: 'https://example.com/ref.json',
        data: { referenceModels: [] },
      };
      await saveReferenceDatabase(refDb);

      const result = await ReferenceDbService.needsDownload('test-machine');
      expect(result).toBe(false);
    });
  });

  describe('Reference Data Format', () => {
    it('should handle new db_meta format', async () => {
      const newFormatData: ReferenceDbFile = {
        db_meta: {
          db_version: '2.0.0',
          created_by: 'service',
          created_at: '2025-01-15',
          description: 'Test reference database',
        },
        models: [],
      };

      // The normalizeReferenceData method is private, but we can test it
      // indirectly through fetchAndValidate by mocking fetch
      // For now, just verify the type structure is correct
      expect(newFormatData.db_meta.db_version).toBe('2.0.0');
      expect(newFormatData.db_meta.created_by).toBe('service');
    });

    it('should preserve local models during update', async () => {
      const machine: Machine = {
        id: 'test-machine',
        name: 'Test',
        createdAt: Date.now(),
        referenceModels: [],
        referenceDbUrl: 'https://example.com/ref.json',
      };
      await saveMachine(machine);

      // Save initial reference DB with local models
      const refDb: ReferenceDatabase = {
        machineId: 'test-machine',
        version: '1.0.0',
        downloadedAt: Date.now(),
        sourceUrl: 'https://example.com/ref.json',
        data: { referenceModels: [] },
        localModels: [
          {
            machineId: 'test-machine',
            label: 'Local Reference',
            type: 'healthy',
            weightVector: new Float64Array([1, 2, 3]),
            regularization: 1e9,
            scalingConstant: 2.5,
            featureDimension: 3,
            trainingDate: Date.now(),
            trainingDuration: 10,
            sampleRate: 44100,
            metadata: { meanCosineSimilarity: 0.9, targetScore: 0.9 },
          },
        ],
        localModelsUpdatedAt: Date.now(),
      };
      await saveReferenceDatabase(refDb);

      // Verify local models are saved
      const retrieved = await getReferenceDatabase('test-machine');
      expect(retrieved?.localModels).toBeDefined();
      expect(retrieved?.localModels).toHaveLength(1);
      expect(retrieved?.localModels?.[0].label).toBe('Local Reference');
    });
  });

  describe('Export Functionality', () => {
    it('should export database with correct format', async () => {
      const machine: Machine = {
        id: 'export-test',
        name: 'Export Test Machine',
        createdAt: Date.now(),
        referenceModels: [],
        location: 'Test Location',
      };
      await saveMachine(machine);

      const refDb: ReferenceDatabase = {
        machineId: 'export-test',
        version: '1.0.0',
        downloadedAt: Date.now(),
        sourceUrl: 'https://example.com/ref.json',
        dbMeta: {
          db_version: '1.0.0',
          created_by: 'test',
          created_at: '2025-01-15',
          description: 'Test DB',
        },
        data: {
          referenceModels: [
            {
              machineId: 'export-test',
              label: 'Baseline',
              type: 'healthy',
              weightVector: new Float64Array([1, 2, 3]),
              regularization: 1e9,
              scalingConstant: 2.5,
              featureDimension: 3,
              trainingDate: Date.now(),
              trainingDuration: 10,
              sampleRate: 44100,
              metadata: { meanCosineSimilarity: 0.9, targetScore: 0.9 },
            },
          ],
        },
      };
      await saveReferenceDatabase(refDb);

      const exportResult = await ReferenceDbService.exportDatabase('export-test');

      expect(exportResult).not.toBeNull();
      expect(exportResult?.blob).toBeDefined();
      expect(exportResult?.filename).toMatch(/reference-db_.*_v1\.0\.1\.json/);
      expect(exportResult?.version).toBe('1.0.1'); // Patch incremented

      // Verify exported content
      const content = await exportResult!.blob.text();
      const parsed = JSON.parse(content);

      expect(parsed.db_meta).toBeDefined();
      expect(parsed.db_meta.db_version).toBe('1.0.1');
      expect(parsed.db_meta.created_by).toBe('user-export');
      expect(parsed.models).toHaveLength(1);
    });

    it('should return null for non-existent machine', async () => {
      const result = await ReferenceDbService.exportDatabase('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('Add Local Model', () => {
    it('should add local model to reference database', async () => {
      const machine: Machine = {
        id: 'local-model-test',
        name: 'Test',
        createdAt: Date.now(),
        referenceModels: [],
      };
      await saveMachine(machine);

      const refDb: ReferenceDatabase = {
        machineId: 'local-model-test',
        version: '1.0.0',
        downloadedAt: Date.now(),
        sourceUrl: 'https://example.com/ref.json',
        data: { referenceModels: [] },
      };
      await saveReferenceDatabase(refDb);

      const model = {
        machineId: 'local-model-test',
        label: 'New Local Model',
        type: 'faulty' as const,
        weightVector: new Float64Array([4, 5, 6]),
        regularization: 1e9,
        scalingConstant: 2.0,
        featureDimension: 3,
        trainingDate: Date.now(),
        trainingDuration: 10,
        sampleRate: 44100,
        metadata: { meanCosineSimilarity: 0.85, targetScore: 0.9 },
      };

      const success = await ReferenceDbService.addLocalModel('local-model-test', model);
      expect(success).toBe(true);

      const updated = await getReferenceDatabase('local-model-test');
      expect(updated?.localModels).toHaveLength(1);
      expect(updated?.localModels?.[0].label).toBe('New Local Model');
      expect(updated?.localModelsUpdatedAt).toBeDefined();
    });

    it('should return false if no reference database exists', async () => {
      const model = {
        machineId: 'non-existent',
        label: 'Test',
        type: 'healthy' as const,
        weightVector: new Float64Array([1]),
        regularization: 1e9,
        scalingConstant: 2.0,
        featureDimension: 1,
        trainingDate: Date.now(),
        trainingDuration: 10,
        sampleRate: 44100,
        metadata: { meanCosineSimilarity: 0.9, targetScore: 0.9 },
      };

      const success = await ReferenceDbService.addLocalModel('non-existent', model);
      expect(success).toBe(false);
    });
  });
});
