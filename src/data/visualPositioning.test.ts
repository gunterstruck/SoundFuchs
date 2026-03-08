/**
 * VISUAL POSITIONING ASSISTANT - TESTS
 *
 * Tests für das Ghost Image Overlay Feature
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDB, saveMachine, getMachine, clearAllData } from './db.js';
import type { Machine } from './types.js';

// Mock IndexedDB for testing
import 'fake-indexeddb/auto';

describe('Visual Positioning Assistant - Database Integration', () => {
  beforeEach(async () => {
    await initDB();
    await clearAllData();
  });

  afterEach(async () => {
    await clearAllData();
  });

  it('should save and retrieve machine with referenceImage', async () => {
    // Create a test blob (simulating a captured image)
    const imageData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG header
    const testBlob = new Blob([imageData], { type: 'image/jpeg' });

    // Create machine with reference image
    const machine: Machine = {
      id: 'test-machine-001',
      name: 'Test Machine',
      createdAt: Date.now(),
      referenceModels: [],
      referenceImage: testBlob,
    };

    // Save machine
    await saveMachine(machine);

    // Retrieve machine
    const retrieved = await getMachine('test-machine-001');

    // Verify
    expect(retrieved).toBeDefined();
    expect(retrieved?.referenceImage).toBeDefined();
    expect(retrieved?.referenceImage).toBeInstanceOf(Blob);
    expect(retrieved?.referenceImage?.size).toBe(testBlob.size);
    expect(retrieved?.referenceImage?.type).toBe('image/jpeg');
  });

  it('should work without referenceImage (non-breaking change)', async () => {
    // Create machine WITHOUT reference image
    const machine: Machine = {
      id: 'test-machine-002',
      name: 'Legacy Machine',
      createdAt: Date.now(),
      referenceModels: [],
      // No referenceImage field
    };

    // Save machine
    await saveMachine(machine);

    // Retrieve machine
    const retrieved = await getMachine('test-machine-002');

    // Verify - should work fine without referenceImage
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('test-machine-002');
    expect(retrieved?.referenceImage).toBeUndefined();
  });

  it('should update machine with referenceImage later', async () => {
    // Create machine without image
    const machine: Machine = {
      id: 'test-machine-003',
      name: 'Updateable Machine',
      createdAt: Date.now(),
      referenceModels: [],
    };
    await saveMachine(machine);

    // Later: Add reference image
    const imageData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const testBlob = new Blob([imageData], { type: 'image/jpeg' });

    const updatedMachine = await getMachine('test-machine-003');
    if (updatedMachine) {
      updatedMachine.referenceImage = testBlob;
      await saveMachine(updatedMachine);
    }

    // Verify update
    const final = await getMachine('test-machine-003');
    expect(final?.referenceImage).toBeDefined();
    expect(final?.referenceImage?.size).toBe(testBlob.size);
  });

  it('should handle large reference images', async () => {
    // Create a larger blob (simulating a realistic JPEG snapshot)
    const largeImageData = new Uint8Array(50000); // ~50KB
    largeImageData.fill(0xff);
    const largeBlob = new Blob([largeImageData], { type: 'image/jpeg' });

    const machine: Machine = {
      id: 'test-machine-004',
      name: 'Machine with Large Image',
      createdAt: Date.now(),
      referenceModels: [],
      referenceImage: largeBlob,
    };

    await saveMachine(machine);

    const retrieved = await getMachine('test-machine-004');
    expect(retrieved?.referenceImage).toBeDefined();
    expect(retrieved?.referenceImage?.size).toBe(50000);
  });

  it('should replace existing referenceImage', async () => {
    // Create machine with initial image
    const image1 = new Blob([new Uint8Array([0x01, 0x02])], { type: 'image/jpeg' });
    const machine: Machine = {
      id: 'test-machine-005',
      name: 'Replaceable Image Machine',
      createdAt: Date.now(),
      referenceModels: [],
      referenceImage: image1,
    };
    await saveMachine(machine);

    // Replace with new image
    const image2 = new Blob([new Uint8Array([0x03, 0x04, 0x05])], { type: 'image/jpeg' });
    const updated = await getMachine('test-machine-005');
    if (updated) {
      updated.referenceImage = image2;
      await saveMachine(updated);
    }

    // Verify replacement
    const final = await getMachine('test-machine-005');
    expect(final?.referenceImage?.size).toBe(3); // New image size
  });
});

describe('Visual Positioning Assistant - Browser APIs', () => {
  it('should validate Blob API for image storage', () => {
    // Test Blob creation (what snapshot capture does)
    const imageData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const blob = new Blob([imageData], { type: 'image/jpeg' });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(4);
    expect(blob.type).toBe('image/jpeg');
  });

  it('should validate URL.createObjectURL for ghost overlay', () => {
    // Test URL creation (what ghost overlay does)
    const blob = new Blob([new Uint8Array([0x01])], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);

    expect(url).toBeDefined();
    expect(typeof url).toBe('string');
    expect(url.startsWith('blob:')).toBe(true);

    // Cleanup
    URL.revokeObjectURL(url);
  });

  it.skip('should demonstrate canvas-to-blob conversion (requires DOM)', () => {
    // NOTE: This test requires a DOM environment (jsdom/happy-dom)
    // Skipped in Node.js environment
    // In browser, canvas.toBlob would convert video frames to Blob
    expect(true).toBe(true);
  });
});

describe('Visual Positioning Assistant - Error Handling', () => {
  beforeEach(async () => {
    await initDB();
    await clearAllData();
  });

  afterEach(async () => {
    await clearAllData();
  });

  it('should handle missing referenceImage gracefully', async () => {
    const machine: Machine = {
      id: 'test-machine-006',
      name: 'No Image Machine',
      createdAt: Date.now(),
      referenceModels: [],
      // No referenceImage
    };

    await saveMachine(machine);
    const retrieved = await getMachine('test-machine-006');

    // Should work fine - just no overlay shown
    expect(retrieved).toBeDefined();
    expect(retrieved?.referenceImage).toBeUndefined();
  });

  it('should handle null referenceImage', async () => {
    const machine: Machine = {
      id: 'test-machine-007',
      name: 'Null Image Machine',
      createdAt: Date.now(),
      referenceModels: [],
      referenceImage: undefined,
    };

    await saveMachine(machine);
    const retrieved = await getMachine('test-machine-007');

    expect(retrieved).toBeDefined();
    expect(retrieved?.referenceImage).toBeUndefined();
  });
});
