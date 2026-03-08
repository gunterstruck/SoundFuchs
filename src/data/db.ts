/**
 * ZANOBOT - DATABASE LAYER
 *
 * IndexedDB wrapper for offline-first data persistence.
 * Stores machines, recordings, and diagnosis results locally.
 *
 * Uses the idb library for simpler IndexedDB operations.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Machine, Recording, DiagnosisResult, GMIAModel, ReferenceDatabase } from './types.js';
import { logger } from '@utils/logger.js';

export interface AppSetting<T = unknown> {
  key: string;
  value: T;
  updatedAt: number;
}

/**
 * Database schema definition
 */
interface ZanobotDB extends DBSchema {
  machines: {
    key: string;
    value: Machine;
    indexes: {
      'by-name': string;
      'by-created': number;
    };
  };
  recordings: {
    key: string;
    value: Recording;
    indexes: {
      'by-machine': string;
      'by-timestamp': number;
    };
  };
  diagnoses: {
    key: string;
    value: DiagnosisResult;
    indexes: {
      'by-machine': string;
      'by-timestamp': number;
      'by-machine-timestamp': [string, number];
      'by-status': DiagnosisResult['status'];
    };
  };
  app_settings: {
    key: string;
    value: AppSetting;
  };
  reference_data: {
    key: string; // machineId
    value: ReferenceDatabase;
    indexes: {
      'by-version': string;
      'by-downloaded': number;
    };
  };
}

const DB_NAME = 'zanobot-db';
const DB_VERSION = 7; // Incremented for NFC Machine Setup + Reference Database

let dbInstance: IDBPDatabase<ZanobotDB> | null = null;

/**
 * Initialize and open the database
 *
 * @returns Database instance
 */
export async function initDB(): Promise<IDBPDatabase<ZanobotDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<ZanobotDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Create machines store
      if (!db.objectStoreNames.contains('machines')) {
        const machineStore = db.createObjectStore('machines', { keyPath: 'id' });
        machineStore.createIndex('by-name', 'name');
        machineStore.createIndex('by-created', 'createdAt');
      }

      // Create recordings store
      if (!db.objectStoreNames.contains('recordings')) {
        const recordingStore = db.createObjectStore('recordings', { keyPath: 'id' });
        recordingStore.createIndex('by-machine', 'machineId');
        recordingStore.createIndex('by-timestamp', 'timestamp');
      }

      // Create or migrate diagnoses store
      if (!db.objectStoreNames.contains('diagnoses')) {
        // Fresh install: create with correct keyPath
        const diagnosisStore = db.createObjectStore('diagnoses', { keyPath: 'id' });
        diagnosisStore.createIndex('by-machine', 'machineId');
        diagnosisStore.createIndex('by-timestamp', 'timestamp');
        diagnosisStore.createIndex('by-machine-timestamp', ['machineId', 'timestamp']);
        diagnosisStore.createIndex('by-status', 'status');
      }

      // Migration from v1 to v2: Fix keyPath if upgrading from old version
      // SIMPLIFIED MIGRATION: Due to race condition issues with asynchronous cursor operations
      // in the synchronous upgrade callback, we simply recreate the store.
      // This results in data loss for v1 users, but prevents database corruption.
      if (db.objectStoreNames.contains('diagnoses') && oldVersion < 2) {
        logger.warn('🔄 Migrating diagnoses store from v1 to v2');
        logger.warn(
          '   ⚠️ Old diagnosis data will be lost due to schema change (keyPath: timestamp → id)'
        );

        try {
          // Delete old store with incorrect keyPath
          db.deleteObjectStore('diagnoses');

          // Create new store with correct keyPath
          const diagnosisStore = db.createObjectStore('diagnoses', { keyPath: 'id' });
          diagnosisStore.createIndex('by-machine', 'machineId');
          diagnosisStore.createIndex('by-timestamp', 'timestamp');
          diagnosisStore.createIndex('by-machine-timestamp', ['machineId', 'timestamp']);
          diagnosisStore.createIndex('by-status', 'status');

          logger.info('   ✅ Diagnoses store recreated with correct schema');
        } catch (error) {
          logger.error('   ❌ Migration error:', error);
          // Ensure store exists even on error
          if (!db.objectStoreNames.contains('diagnoses')) {
            const diagnosisStore = db.createObjectStore('diagnoses', { keyPath: 'id' });
            diagnosisStore.createIndex('by-machine', 'machineId');
            diagnosisStore.createIndex('by-timestamp', 'timestamp');
            diagnosisStore.createIndex('by-machine-timestamp', ['machineId', 'timestamp']);
            diagnosisStore.createIndex('by-status', 'status');
          }
        }
      }

      // Migration from v2 to v3: Multiclass diagnosis - HARD RESET
      // Breaking change: referenceModel → referenceModels[] + label field
      // We cannot migrate old single-model data to multiclass, so we clear everything
      if (oldVersion < 3) {
        logger.warn('🔄 Migrating database from v2 to v3 (Multiclass Diagnosis)');
        logger.warn('   ⚠️ BREAKING CHANGE: referenceModel → referenceModels[]');
        logger.warn('   ⚠️ All existing data will be cleared (machines, recordings, diagnoses)');

        // CRITICAL: Store migration info in localStorage to show user warning
        // This will be displayed on next page load in main.ts
        try {
          localStorage.setItem('zanobot-migration-v3-occurred', JSON.stringify({
            timestamp: Date.now(),
            oldVersion,
            newVersion: 3,
            dataCleared: true
          }));
        } catch (e) {
          logger.error('   ❌ Could not save migration info to localStorage:', e);
        }

        try {
          // Clear all stores to start fresh
          const machineStore = transaction.objectStore('machines');
          const recordingStore = transaction.objectStore('recordings');
          const diagnosisStore = transaction.objectStore('diagnoses');

          machineStore.clear();
          recordingStore.clear();
          diagnosisStore.clear();

          logger.info('   ✅ Database reset complete - ready for multiclass diagnosis');
          logger.warn('   ⚠️ IMPORTANT: All previous data has been deleted due to schema incompatibility');
          logger.warn('   ℹ️ You will need to re-record reference audio for all machines');
        } catch (error) {
          logger.error('   ❌ Migration error:', error);
        }
      }

      // Migration from v3 to v4: Add compound index for machine + timestamp
      if (oldVersion < 4 && db.objectStoreNames.contains('diagnoses')) {
        const diagnosisStore = transaction.objectStore('diagnoses');
        if (!diagnosisStore.indexNames.contains('by-machine-timestamp')) {
          diagnosisStore.createIndex('by-machine-timestamp', ['machineId', 'timestamp']);
          logger.info('   ✅ Added compound index: by-machine-timestamp');
        }
      }

      // Migration from v4 to v5: Visual Positioning Assistant
      // NON-BREAKING CHANGE: Added optional referenceImage field to Machine interface
      // No data migration required - existing machines will simply not have this field
      if (oldVersion < 5) {
        logger.info('🔄 Migrating database from v4 to v5 (Visual Positioning Assistant)');
        logger.info('   ✅ Added optional referenceImage field to Machine schema');
        logger.info('   ℹ️ Existing machines will work without changes (non-breaking)');
      }

      // Migration from v5 to v6: App settings store for hero banner
      if (!db.objectStoreNames.contains('app_settings')) {
        db.createObjectStore('app_settings', { keyPath: 'key' });
      }

      if (oldVersion < 6) {
        logger.info('🔄 Migrating database from v5 to v6 (App settings store)');
        logger.info('   ✅ Added app_settings store for UI assets');
      }

      // Migration from v6 to v7: Reference database store for NFC Machine Setup
      if (!db.objectStoreNames.contains('reference_data')) {
        const refStore = db.createObjectStore('reference_data', { keyPath: 'machineId' });
        refStore.createIndex('by-version', 'version');
        refStore.createIndex('by-downloaded', 'downloadedAt');
      }

      if (oldVersion < 7) {
        logger.info('🔄 Migrating database from v6 to v7 (NFC Machine Setup)');
        logger.info('   ✅ Added reference_data store for NFC-based setup');
        logger.info('   ✅ Extended Machine model with referenceDbUrl, location, notes');
      }
    },
  });

  logger.info('✅ Database initialized');

  return dbInstance;
}

// ============================================================================
// APP SETTINGS OPERATIONS
// ============================================================================

export async function saveAppSetting<T>(key: string, value: T): Promise<void> {
  const db = await initDB();
  const setting: AppSetting<T> = {
    key,
    value,
    updatedAt: Date.now(),
  };
  await db.put('app_settings', setting);
  logger.info(`💾 App setting saved: ${key}`);
}

export async function getAppSetting<T>(key: string): Promise<AppSetting<T> | undefined> {
  const db = await initDB();
  return await db.get('app_settings', key) as AppSetting<T> | undefined;
}

export async function deleteAppSetting(key: string): Promise<void> {
  const db = await initDB();
  await db.delete('app_settings', key);
  logger.info(`🗑️ App setting deleted: ${key}`);
}

// ============================================================================
// STORAGE QUOTA MANAGEMENT
// ============================================================================

/**
 * Check available storage quota before write operations.
 *
 * Uses the StorageManager API to estimate remaining space.
 * Provides early warning before operations that might exceed quota.
 *
 * @param estimatedSizeBytes - Estimated size of data to write in bytes
 * @throws Error if estimated size exceeds available quota (with 10% safety margin)
 */
export async function checkStorageQuota(estimatedSizeBytes: number): Promise<void> {
  // Check if StorageManager API is available
  if (!navigator.storage || !navigator.storage.estimate) {
    logger.debug('StorageManager API not available - skipping quota check');
    return;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const available = quota - used;

    // Log current storage status
    const usedMB = (used / 1024 / 1024).toFixed(2);
    const quotaMB = (quota / 1024 / 1024).toFixed(2);
    const availableMB = (available / 1024 / 1024).toFixed(2);
    logger.debug(`📊 Storage: ${usedMB}MB used / ${quotaMB}MB quota (${availableMB}MB available)`);

    // Apply 10% safety margin to prevent edge cases
    const safetyMargin = 0.1;
    const requiredSpace = estimatedSizeBytes * (1 + safetyMargin);

    if (requiredSpace > available) {
      const requiredMB = (estimatedSizeBytes / 1024 / 1024).toFixed(2);
      throw new Error(
        `Insufficient storage: Need ${requiredMB}MB but only ${availableMB}MB available. ` +
        `Please free up space by deleting old recordings or machines.`
      );
    }
  } catch (error) {
    // If quota check fails, log warning but don't block the operation
    // This allows the app to work even if StorageManager has issues
    if (error instanceof Error && error.message.includes('Insufficient storage')) {
      throw error; // Re-throw quota exceeded errors
    }
    logger.warn('⚠️ Storage quota check failed:', error);
  }
}

/**
 * Get current storage usage statistics
 *
 * @returns Storage usage info or undefined if not available
 */
export async function getStorageUsage(): Promise<{
  usedBytes: number;
  quotaBytes: number;
  availableBytes: number;
  percentUsed: number;
} | undefined> {
  if (!navigator.storage || !navigator.storage.estimate) {
    return undefined;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const available = quota - used;
    const percentUsed = quota > 0 ? (used / quota) * 100 : 0;

    return {
      usedBytes: used,
      quotaBytes: quota,
      availableBytes: available,
      percentUsed: Math.round(percentUsed * 10) / 10,
    };
  } catch (error) {
    logger.warn('⚠️ Could not get storage usage:', error);
    return undefined;
  }
}

// ============================================================================
// MACHINE OPERATIONS
// ============================================================================

/**
 * Get the next available auto-machine number for zero-friction recording.
 * Scans existing machines with names matching "Maschine XX" pattern and returns
 * the next available number (e.g., if "Maschine 01" and "Maschine 03" exist, returns 2).
 *
 * @returns Next available machine number (1-based)
 */
export async function getNextAutoMachineNumber(): Promise<number> {
  const db = await initDB();
  const machines = await db.getAll('machines');

  // Extract numbers from machine names matching the pattern
  // Matches: "Maschine 01", "Machine 1", "机器 05", etc.
  const usedNumbers = new Set<number>();
  const patterns = [
    /^Maschine\s+(\d+)$/i,    // German
    /^Machine\s+(\d+)$/i,     // English
    /^Máquina\s+(\d+)$/i,     // Spanish
    /^机器\s+(\d+)$/i,         // Chinese
  ];

  for (const machine of machines) {
    for (const pattern of patterns) {
      const match = machine.name.match(pattern);
      if (match) {
        usedNumbers.add(parseInt(match[1], 10));
        break;
      }
    }
  }

  // Find the lowest available number
  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) {
    nextNumber++;
  }

  return nextNumber;
}

/**
 * Create a new machine with auto-generated name for zero-friction recording.
 * Uses the pattern "Maschine XX" where XX is the next available number.
 *
 * @param machineName - Optional custom name (uses auto-generated if not provided)
 * @returns The created machine
 */
export async function createAutoMachine(machineName?: string): Promise<Machine> {
  const nextNumber = await getNextAutoMachineNumber();
  const paddedNumber = nextNumber.toString().padStart(2, '0');

  // Use provided name or generate one
  const name = machineName || `Maschine ${paddedNumber}`;

  // Generate unique ID
  const id = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  const machine: Machine = {
    id,
    name,
    createdAt: Date.now(),
    referenceModels: [],
  };

  await saveMachine(machine);
  logger.info(`🤖 Auto-created machine: ${name} (${id})`);

  return machine;
}

/**
 * Save or update a machine
 *
 * Includes quota check for machines with large reference images.
 *
 * @param machine - Machine object
 * @throws Error if storage quota would be exceeded
 */
export async function saveMachine(machine: Machine): Promise<void> {
  // Estimate size: base machine data + reference image (if present)
  let estimatedSize = 10000; // Base overhead for machine metadata (~10KB)
  if (machine.referenceImage) {
    estimatedSize += machine.referenceImage.size;
  }
  if (machine.referenceModels) {
    // Each model is roughly 1KB + weight vector size
    estimatedSize += machine.referenceModels.length * 5000;
  }

  // Check quota before write
  await checkStorageQuota(estimatedSize);

  const db = await initDB();
  await db.put('machines', machine);
  logger.info(`💾 Machine saved: ${machine.id}`);
}

/**
 * Get machine by ID
 *
 * @param id - Machine ID
 * @returns Machine or undefined
 */
export async function getMachine(id: string): Promise<Machine | undefined> {
  const db = await initDB();
  return await db.get('machines', id);
}

/**
 * Get all machines
 *
 * @returns Array of all machines
 */
export async function getAllMachines(): Promise<Machine[]> {
  const db = await initDB();
  return await db.getAll('machines');
}

/**
 * Delete machine and all associated data
 *
 * @param id - Machine ID
 */
export async function deleteMachine(id: string): Promise<void> {
  const db = await initDB();

  // Delete machine
  await db.delete('machines', id);

  // Delete associated recordings
  const recordings = await db.getAllFromIndex('recordings', 'by-machine', id);
  for (const recording of recordings) {
    await db.delete('recordings', recording.id);
  }

  // Delete associated diagnoses
  const diagnoses = await db.getAllFromIndex('diagnoses', 'by-machine', id);
  for (const diagnosis of diagnoses) {
    await db.delete('diagnoses', diagnosis.id); // id is the key
  }

  // Delete associated reference database (if exists)
  try {
    await db.delete('reference_data', id);
  } catch {
    // reference_data entry may not exist - that's fine
  }

  logger.info(`🗑️ Machine deleted: ${id}`);
}

/**
 * Delete a single reference model from a machine
 *
 * @param machineId - Machine ID
 * @param modelLabel - Label of the model to delete
 * @returns true if model was found and deleted
 */
export async function deleteReferenceModel(machineId: string, modelLabel: string): Promise<boolean> {
  const machine = await getMachine(machineId);
  if (!machine) return false;

  const before = machine.referenceModels?.length || 0;
  machine.referenceModels = (machine.referenceModels || []).filter(
    m => m.label?.toLowerCase().trim() !== modelLabel.toLowerCase().trim()
  );
  const after = machine.referenceModels.length;

  if (before === after) return false; // Nothing was deleted

  await saveMachine(machine);
  logger.info(`🗑️ Reference model "${modelLabel}" deleted from machine ${machineId}`);
  return true;
}

/**
 * Add a reference model to a machine's model collection
 *
 * @param machineId - Machine ID
 * @param model - GMIA model to add
 */
export async function updateMachineModel(machineId: string, model: GMIAModel): Promise<void> {
  const db = await initDB();
  const machine = await db.get('machines', machineId);

  if (!machine) {
    throw new Error(`Machine not found: ${machineId}`);
  }

  // CRITICAL FIX: Initialize referenceModels array if it doesn't exist
  // This handles legacy data from old versions or imported data
  if (!machine.referenceModels) {
    logger.warn(`⚠️ Machine ${machineId} has no referenceModels array - initializing empty array`);
    machine.referenceModels = [];
  }

  // Add model to the collection
  machine.referenceModels.push(model);
  await db.put('machines', machine);

  logger.info(`🧠 Model '${model.label}' added to machine: ${machineId}`);
}

// ============================================================================
// RECORDING OPERATIONS
// ============================================================================

/**
 * Save a recording
 *
 * CRITICAL FIX: Serialize AudioBuffer before storing in IndexedDB
 * AudioBuffer is not structure-cloneable and will cause DataCloneError if stored directly.
 * We serialize it to a plain object that IndexedDB can handle.
 *
 * Includes quota check for large audio recordings.
 *
 * @param recording - Recording object
 * @throws Error if storage quota would be exceeded
 */
export async function saveRecording(recording: Recording): Promise<void> {
  // Estimate size: AudioBuffer data is the main contributor
  // Each sample is 4 bytes (Float32), multiply by channels and length
  const audioBuffer = recording.audioBuffer;
  const estimatedSize = audioBuffer.numberOfChannels * audioBuffer.length * 4 + 10000;

  // Check quota before write
  await checkStorageQuota(estimatedSize);

  const db = await initDB();

  // Serialize AudioBuffer for IndexedDB storage
  const serializedRecording: SerializedRecording = {
    ...recording,
    audioBuffer: serializeAudioBuffer(recording.audioBuffer),
  };

  await db.put('recordings', serializedRecording as unknown as Recording);
  logger.info(`🎙️ Recording saved: ${recording.id}`);
}

/**
 * Get recording by ID
 *
 * CRITICAL FIX: Deserialize AudioBuffer after loading from IndexedDB
 * The stored recording has a serialized AudioBuffer that needs to be converted back.
 *
 * @param id - Recording ID
 * @returns Recording or undefined
 */
export async function getRecording(id: string): Promise<Recording | undefined> {
  const db = await initDB();
  const storedRecording = await db.get('recordings', id);

  if (!storedRecording) {
    return undefined;
  }

  // Deserialize AudioBuffer if it's in serialized format
  if (isSerializedAudioBuffer(storedRecording.audioBuffer)) {
    return {
      ...storedRecording,
      audioBuffer: deserializeAudioBuffer(storedRecording.audioBuffer),
    } as Recording;
  }

  // Already deserialized (shouldn't happen, but handle gracefully)
  return storedRecording as Recording;
}

/**
 * Get all recordings for a machine
 *
 * CRITICAL FIX: Deserialize AudioBuffers after loading from IndexedDB
 * The stored recordings have serialized AudioBuffers that need to be converted back.
 *
 * @param machineId - Machine ID
 * @returns Array of recordings
 */
export async function getRecordingsForMachine(machineId: string): Promise<Recording[]> {
  const db = await initDB();
  const storedRecordings = await db.getAllFromIndex('recordings', 'by-machine', machineId);

  // Deserialize all AudioBuffers
  return storedRecordings.map((recording) => {
    if (isSerializedAudioBuffer(recording.audioBuffer)) {
      return {
        ...recording,
        audioBuffer: deserializeAudioBuffer(recording.audioBuffer),
      } as Recording;
    }
    return recording as Recording;
  });
}

// ============================================================================
// DIAGNOSIS OPERATIONS
// ============================================================================

/**
 * Save a diagnosis result
 *
 * @param diagnosis - Diagnosis result
 */
export async function saveDiagnosis(diagnosis: DiagnosisResult): Promise<void> {
  const db = await initDB();
  await db.put('diagnoses', diagnosis);

  // Update machine's last diagnosis timestamp
  const machine = await db.get('machines', diagnosis.machineId);
  if (machine) {
    machine.lastDiagnosisAt = diagnosis.timestamp;
    await db.put('machines', machine);
  }

  logger.info(`📊 Diagnosis saved for machine: ${diagnosis.machineId}`);
}

/**
 * Get all diagnoses for a machine
 *
 * OPTIMIZED: Uses cursor-based approach when limit is specified to avoid loading
 * all records into memory. This prevents performance issues with large datasets.
 *
 * @param machineId - Machine ID
 * @param limit - Maximum number of results (optional, recommended for large datasets)
 * @returns Array of diagnoses (sorted by timestamp, newest first)
 */
export async function getDiagnosesForMachine(
  machineId: string,
  limit?: number
): Promise<DiagnosisResult[]> {
  const db = await initDB();
  const diagnoses: DiagnosisResult[] = [];
  const maxResults = limit !== undefined ? limit : Number.POSITIVE_INFINITY;

  if (maxResults <= 0) {
    return diagnoses;
  }

  const range = IDBKeyRange.bound([machineId, -Infinity], [machineId, Infinity]);

  let cursor = await db
    .transaction('diagnoses')
    .store.index('by-machine-timestamp')
    .openCursor(range, 'prev');

  while (cursor && diagnoses.length < maxResults) {
    diagnoses.push(cursor.value as DiagnosisResult);
    cursor = await cursor.continue();
  }

  return diagnoses;
}

/**
 * Get latest diagnosis for a machine
 *
 * @param machineId - Machine ID
 * @returns Latest diagnosis or undefined
 */
export async function getLatestDiagnosis(machineId: string): Promise<DiagnosisResult | undefined> {
  const diagnoses = await getDiagnosesForMachine(machineId, 1);
  return diagnoses[0];
}

/**
 * Get diagnoses by status
 *
 * @param status - Health status
 * @returns Array of diagnoses
 */
export async function getDiagnosesByStatus(
  status: DiagnosisResult['status']
): Promise<DiagnosisResult[]> {
  const db = await initDB();
  return await db.getAllFromIndex('diagnoses', 'by-status', status);
}

/**
 * Delete a single diagnosis by ID
 *
 * @param diagnosisId - The diagnosis ID to delete
 */
export async function deleteDiagnosis(diagnosisId: string): Promise<void> {
  const db = await initDB();
  await db.delete('diagnoses', diagnosisId);
}

/**
 * Get all diagnoses sorted by timestamp (newest first)
 *
 * @param limit - Maximum number of results (optional)
 * @returns Array of all diagnoses
 */
export async function getAllDiagnoses(limit?: number): Promise<DiagnosisResult[]> {
  const db = await initDB();
  const allDiagnoses = await db.getAll('diagnoses');

  // Sort by timestamp descending (newest first)
  allDiagnoses.sort((a, b) => b.timestamp - a.timestamp);

  // Apply limit if specified
  if (limit !== undefined && limit > 0) {
    return allDiagnoses.slice(0, limit);
  }

  return allDiagnoses;
}

// ============================================================================
// UTILITY OPERATIONS
// ============================================================================

/**
 * Clear all data from database (for testing/reset)
 */
export async function clearAllData(): Promise<void> {
  const db = await initDB();

  await db.clear('machines');
  await db.clear('recordings');
  await db.clear('diagnoses');
  await db.clear('app_settings');
  await db.clear('reference_data');

  logger.info('🗑️ All data cleared');
}

/**
 * Get database statistics
 *
 * @returns Database statistics
 */
export async function getDBStats(): Promise<{
  machines: number;
  recordings: number;
  diagnoses: number;
}> {
  const db = await initDB();

  const machines = await db.count('machines');
  const recordings = await db.count('recordings');
  const diagnoses = await db.count('diagnoses');

  return { machines, recordings, diagnoses };
}

/**
 * Serialized AudioBuffer for JSON export
 */
interface SerializedAudioBuffer {
  _serialized: true;
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  duration: number;
  channelData: number[][]; // Array of Arrays (Float32Array → number[])
}

/**
 * Serialized Recording for JSON export
 */
interface SerializedRecording extends Omit<Recording, 'audioBuffer'> {
  audioBuffer: SerializedAudioBuffer;
}

/**
 * Serialized Machine for JSON export
 */
interface SerializedBlob {
  _serialized: true;
  type: string;
  data: string;
}

interface SerializedMachine extends Omit<Machine, 'referenceModels' | 'referenceImage'> {
  referenceModels: Array<Omit<GMIAModel, 'weightVector'> & { weightVector: number[] }>;
  referenceImage?: SerializedBlob;
}

/**
 * Serialize AudioBuffer to JSON-compatible format
 *
 * @param audioBuffer - Web Audio API AudioBuffer
 * @returns Serialized format with Float32Array data
 */
function serializeAudioBuffer(audioBuffer: AudioBuffer): SerializedAudioBuffer {
  const channelData: number[][] = [];

  // Extract all channel data
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    const data = audioBuffer.getChannelData(i);
    channelData.push(Array.from(data)); // Float32Array → number[]
  }

  return {
    _serialized: true,
    numberOfChannels: audioBuffer.numberOfChannels,
    sampleRate: audioBuffer.sampleRate,
    length: audioBuffer.length,
    duration: audioBuffer.duration,
    channelData,
  };
}

function encodeBase64(binary: string): string {
  if (typeof btoa === 'function') {
    return btoa(binary);
  }

  return Buffer.from(binary, 'binary').toString('base64');
}

function decodeBase64(base64: string): string {
  if (typeof atob === 'function') {
    return atob(base64);
  }

  return Buffer.from(base64, 'base64').toString('binary');
}

async function serializeBlob(blob: Blob): Promise<SerializedBlob> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return {
    _serialized: true,
    type: blob.type,
    data: encodeBase64(binary),
  };
}

function deserializeBlob(serialized: SerializedBlob): Blob {
  const binary = decodeBase64(serialized.data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: serialized.type });
}

/**
 * Export all data (for backup)
 *
 * @returns All database data with serialized AudioBuffers
 */
export async function exportData(): Promise<{
  machines: SerializedMachine[];
  recordings: SerializedRecording[];
  diagnoses: DiagnosisResult[];
}> {
  const db = await initDB();

  const machines = await db.getAll('machines');
  const serializedMachines: SerializedMachine[] = await Promise.all(
    machines.map(async (machine) => ({
      ...machine,
      referenceImage: machine.referenceImage
        ? await serializeBlob(machine.referenceImage)
        : undefined,
      referenceModels: (machine.referenceModels || []).map((model) => ({
        ...model,
        weightVector: Array.from(model.weightVector),
      })),
    }))
  );
  const recordings = await db.getAll('recordings');
  const diagnoses = await db.getAll('diagnoses');

  // CRITICAL FIX: Check if AudioBuffers are already serialized
  // Recordings in IndexedDB are already serialized by saveRecording()
  // Attempting to serialize again causes crash (no getChannelData method on plain objects)
  const serializedRecordings = recordings.map((recording) => {
    if (isSerializedAudioBuffer(recording.audioBuffer)) {
      // Already serialized - use directly
      // CRITICAL FIX: Use explicit unknown cast to indicate intentional type conversion
      // This is safe because we've verified the audioBuffer is already serialized
      return recording as unknown as SerializedRecording;
    }

    // Not serialized yet - serialize now (shouldn't happen with current saveRecording, but handle gracefully)
    return {
      ...recording,
      audioBuffer: serializeAudioBuffer(recording.audioBuffer),
    };
  });

  logger.info('📦 Data exported successfully');

  return { machines: serializedMachines, recordings: serializedRecordings, diagnoses };
}

/**
 * Deserialize AudioBuffer from JSON format
 *
 * CRITICAL FIX: Close AudioContext after use to prevent resource leaks
 * Each AudioContext consumes browser resources. Creating many without closing
 * can lead to "Too many AudioContexts" errors and instability.
 *
 * @param serialized - Serialized AudioBuffer data
 * @returns Web Audio API AudioBuffer
 */
function deserializeAudioBuffer(serialized: SerializedAudioBuffer): AudioBuffer {
  // Create OfflineAudioContext instead of AudioContext for better resource management
  // OfflineAudioContext is designed for processing and is automatically cleaned up
  const audioContext = new OfflineAudioContext(
    serialized.numberOfChannels,
    serialized.length,
    serialized.sampleRate
  );

  // Create empty AudioBuffer
  const audioBuffer = audioContext.createBuffer(
    serialized.numberOfChannels,
    serialized.length,
    serialized.sampleRate
  );

  // Fill channel data
  for (let i = 0; i < serialized.numberOfChannels; i++) {
    const channelData = audioBuffer.getChannelData(i);
    const sourceData = serialized.channelData[i];

    for (let j = 0; j < sourceData.length; j++) {
      channelData[j] = sourceData[j];
    }
  }

  // OfflineAudioContext doesn't need explicit closing
  // It's designed for synchronous buffer creation and is auto-managed
  // No need for try/finally or async close() calls

  return audioBuffer;
}

/**
 * Check if an object is a serialized AudioBuffer
 *
 * @param obj - Object to check
 * @returns True if object is serialized AudioBuffer
 */
function isSerializedAudioBuffer(obj: unknown): obj is SerializedAudioBuffer {
  return (
    obj !== null &&
    obj !== undefined &&
    typeof obj === 'object' &&
    '_serialized' in obj &&
    obj._serialized === true &&
    'numberOfChannels' in obj &&
    typeof obj.numberOfChannels === 'number' &&
    'sampleRate' in obj &&
    typeof obj.sampleRate === 'number' &&
    'length' in obj &&
    typeof obj.length === 'number' &&
    'channelData' in obj &&
    Array.isArray(obj.channelData)
  );
}

function isSerializedBlob(obj: unknown): obj is SerializedBlob {
  return (
    obj !== null &&
    obj !== undefined &&
    typeof obj === 'object' &&
    '_serialized' in obj &&
    obj._serialized === true &&
    'type' in obj &&
    typeof obj.type === 'string' &&
    'data' in obj &&
    typeof obj.data === 'string'
  );
}

/**
 * Result of an import operation, reporting how many records were imported vs skipped.
 */
export interface ImportResult {
  machinesImported: number;
  machinesSkipped: number;
  recordingsImported: number;
  recordingsSkipped: number;
  diagnosesImported: number;
  diagnosesSkipped: number;
  totalSkipped: number;
}

/**
 * Import data (restore from backup)
 *
 * @param data - Data to import
 * @param merge - If true, merge with existing data; if false, replace all data
 * @returns Import statistics with imported/skipped counts per category
 */
export async function importData(
  data: {
    machines?: Array<Machine | SerializedMachine>;
    recordings?: (Recording | SerializedRecording)[];
    diagnoses?: DiagnosisResult[];
  },
  merge: boolean = false
): Promise<ImportResult> {
  const db = await initDB();

  // If not merging, clear existing data first
  if (!merge) {
    await clearAllData();
    logger.info('🗑️ Existing data cleared for import');
  }

  // Import machines
  let machinesImported = 0;
  let machinesSkipped = 0;
  if (data.machines) {
    for (const machine of data.machines) {
      try {
        const referenceImage = machine.referenceImage;
        let normalizedReferenceImage: Blob | undefined;

        if (referenceImage instanceof Blob) {
          normalizedReferenceImage = referenceImage;
        } else if (isSerializedBlob(referenceImage)) {
          normalizedReferenceImage = deserializeBlob(referenceImage);
        }

        const normalizedReferenceModels = (machine.referenceModels || []).map((model) => ({
          ...model,
          weightVector:
            model.weightVector instanceof Float64Array
              ? model.weightVector
              : new Float64Array(model.weightVector as number[]),
        }));

        const normalizedMachine: Machine = {
          ...machine,
          referenceImage: normalizedReferenceImage,
          referenceModels: normalizedReferenceModels,
        };

        // When merging: if machine already exists, merge referenceModels instead of overwriting
        if (merge && machine.id) {
          const existingMachine = await db.get('machines', machine.id);
          if (existingMachine) {
            // Deduplicate by label (case-insensitive) – same logic as applyModelsToMachine
            const existingNames = new Set(
              (existingMachine.referenceModels || []).map(m => m.label?.toLowerCase().trim())
            );
            const newModels = normalizedReferenceModels.filter(model => {
              const modelName = model.label?.toLowerCase().trim();
              if (modelName && existingNames.has(modelName)) {
                logger.info(`⏭️ Merge: skipping model "${model.label}" – already exists for machine ${machine.id}`);
                return false;
              }
              return true;
            });

            const mergedModels = [...(existingMachine.referenceModels || []), ...newModels];

            // Sprint 6 Fix: Merge preserving existing local data.
            // Existing fields take priority; import only fills gaps.
            // Exception: If the existing name is a placeholder (auto-created),
            // prefer the imported name so NFC provisioning gets the real name.
            const preferImportedName = existingMachine.nameIsPlaceholder && normalizedMachine.name;
            const mergedMachine: Machine = {
              ...normalizedMachine,              // import as base
              ...existingMachine,                // existing data overwrites
              // Explicitly merge fields where we want "fill gaps" behavior:
              name: preferImportedName ? normalizedMachine.name : (existingMachine.name || normalizedMachine.name),
              // Clear placeholder flag after merge (name is now definitive)
              nameIsPlaceholder: preferImportedName ? undefined : existingMachine.nameIsPlaceholder,
              location: existingMachine.location || normalizedMachine.location,
              notes: existingMachine.notes || normalizedMachine.notes,
              fleetGroup: existingMachine.fleetGroup || normalizedMachine.fleetGroup,
              referenceDbUrl: existingMachine.referenceDbUrl || normalizedMachine.referenceDbUrl,
              // Merged reference models (append new ones)
              referenceModels: mergedModels,
              // Preserve existing calibration data (never overwrite)
              refLogMean: existingMachine.refLogMean ?? normalizedMachine.refLogMean,
              refLogStd: existingMachine.refLogStd ?? normalizedMachine.refLogStd,
              refLogResidualStd: existingMachine.refLogResidualStd ?? normalizedMachine.refLogResidualStd,
              refDriftBaseline: existingMachine.refDriftBaseline ?? normalizedMachine.refDriftBaseline,
              refT60: existingMachine.refT60 ?? normalizedMachine.refT60,
              refT60Classification: existingMachine.refT60Classification ?? normalizedMachine.refT60Classification,
              // Keep existing image
              referenceImage: existingMachine.referenceImage || normalizedReferenceImage,
            };
            await db.put('machines', mergedMachine);

            if (newModels.length > 0) {
              logger.info(`📋 Merged machine "${machine.id}": ${newModels.length} new model(s) added, ${normalizedReferenceModels.length - newModels.length} duplicate(s) skipped`);
            } else {
              logger.info(`📋 Merged machine "${machine.id}": no new models (${normalizedReferenceModels.length} duplicate(s) skipped)`);
            }
            machinesImported++;
            continue;
          }
        }

        // New machine (or replace mode): write directly
        await db.put('machines', normalizedMachine);
        machinesImported++;
      } catch (error) {
        machinesSkipped++;
        logger.warn(`⚠️ Skipped machine "${machine.id || 'unknown'}": ${error instanceof Error ? error.message : error}`);
      }
    }
    logger.info(`📥 Imported ${machinesImported} machines${machinesSkipped > 0 ? ` (${machinesSkipped} skipped due to errors)` : ''}`);
  }

  // Import recordings with AudioBuffer rehydration
  let recordingsImported = 0;
  let recordingsSkipped = 0;
  if (data.recordings) {
    for (const recording of data.recordings) {
      try {
        // CRITICAL FIX: IndexedDB requires serialized AudioBuffers, not real AudioBuffer objects
        // AudioBuffer is not structure-cloneable and causes DataCloneError
        let serializedRecording: SerializedRecording;

        if (isSerializedAudioBuffer(recording.audioBuffer)) {
          // Already serialized - use directly (format matches IndexedDB storage)
          serializedRecording = recording as SerializedRecording;
        } else {
          // Real AudioBuffer - serialize it before storing in IndexedDB
          serializedRecording = {
            ...recording,
            audioBuffer: serializeAudioBuffer(recording.audioBuffer as AudioBuffer),
          };
        }

        await db.put('recordings', serializedRecording as unknown as Recording);
        recordingsImported++;
      } catch (error) {
        recordingsSkipped++;
        logger.warn(`⚠️ Skipped recording "${recording.id || 'unknown'}": ${error instanceof Error ? error.message : error}`);
      }
    }
    logger.info(`📥 Imported ${recordingsImported} recordings${recordingsSkipped > 0 ? ` (${recordingsSkipped} skipped due to errors)` : ''}`);
  }

  // Import diagnoses
  let diagnosesImported = 0;
  let diagnosesSkipped = 0;
  if (data.diagnoses) {
    for (const diagnosis of data.diagnoses) {
      try {
        await db.put('diagnoses', diagnosis);
        diagnosesImported++;
      } catch (error) {
        diagnosesSkipped++;
        logger.warn(`⚠️ Skipped diagnosis "${diagnosis.id || 'unknown'}": ${error instanceof Error ? error.message : error}`);
      }
    }
    logger.info(`📥 Imported ${diagnosesImported} diagnoses${diagnosesSkipped > 0 ? ` (${diagnosesSkipped} skipped due to errors)` : ''}`);
  }

  const totalSkipped = machinesSkipped + recordingsSkipped + diagnosesSkipped;
  if (totalSkipped > 0) {
    logger.warn(`⚠️ Data import completed with ${totalSkipped} skipped record(s)`);
  } else {
    logger.info('✅ Data import complete');
  }

  return {
    machinesImported,
    machinesSkipped,
    recordingsImported,
    recordingsSkipped,
    diagnosesImported,
    diagnosesSkipped,
    totalSkipped,
  };
}

// ============================================================================
// REFERENCE DATABASE OPERATIONS (NFC Machine Setup)
// ============================================================================

/**
 * Save reference database for a machine
 *
 * @param refDb - Reference database object
 */
export async function saveReferenceDatabase(refDb: ReferenceDatabase): Promise<void> {
  const db = await initDB();
  await db.put('reference_data', refDb);
  logger.info(`💾 Reference database saved for machine: ${refDb.machineId}`);
}

/**
 * Get reference database for a machine
 *
 * @param machineId - Machine ID
 * @returns Reference database or undefined
 */
export async function getReferenceDatabase(machineId: string): Promise<ReferenceDatabase | undefined> {
  const db = await initDB();
  return await db.get('reference_data', machineId);
}

/**
 * Delete reference database for a machine
 *
 * @param machineId - Machine ID
 */
export async function deleteReferenceDatabase(machineId: string): Promise<void> {
  const db = await initDB();
  await db.delete('reference_data', machineId);
  logger.info(`🗑️ Reference database deleted for machine: ${machineId}`);
}

/**
 * Check if a reference database exists for a machine
 *
 * @param machineId - Machine ID
 * @returns True if reference database exists
 */
export async function hasReferenceDatabase(machineId: string): Promise<boolean> {
  const db = await initDB();
  const refDb = await db.get('reference_data', machineId);
  return refDb !== undefined;
}

/**
 * Get all reference databases
 *
 * @returns Array of all reference databases
 */
export async function getAllReferenceDatabases(): Promise<ReferenceDatabase[]> {
  const db = await initDB();
  return await db.getAll('reference_data');
}
