import { describe, it, expect } from 'vitest';
import { parseFolder, planSplit, SPLIT_MODE_DEFAULT } from './parseFolder.js';

describe('parseFolder', () => {
  it('parses the canonical MIMII machine/id/normal|abnormal layout', () => {
    const ds = parseFolder([
      'fan/id_00/normal/0000.wav',
      'fan/id_00/normal/0001.wav',
      'fan/id_00/abnormal/0000.wav',
      'fan/id_02/normal/0000.wav',
    ]);
    expect(ds.totalWav).toBe(4);
    expect(ds.sections.map((s) => s.key)).toEqual(['fan/id_00', 'fan/id_02']);

    const s0 = ds.sections[0];
    expect(s0.machine).toBe('fan');
    expect(s0.section).toBe('id_00');
    expect(s0.normalPaths).toHaveLength(2);
    expect(s0.abnormalPaths).toHaveLength(1);
    expect(s0.hasExplicitSplit).toBe(false);
  });

  it('accepts a flat normal/abnormal layout as machine "default"', () => {
    const ds = parseFolder(['normal/a.wav', 'abnormal/b.wav']);
    expect(ds.sections).toHaveLength(1);
    expect(ds.sections[0].key).toBe('default');
    expect(ds.sections[0].machine).toBe('default');
    expect(ds.sections[0].normalPaths).toHaveLength(1);
    expect(ds.sections[0].abnormalPaths).toHaveLength(1);
  });

  it('detects an explicit train/test split', () => {
    const ds = parseFolder([
      'pump/id_00/train/normal/0.wav',
      'pump/id_00/train/normal/1.wav',
      'pump/id_00/test/normal/2.wav',
      'pump/id_00/test/abnormal/3.wav',
    ]);
    const s = ds.sections[0];
    expect(s.hasExplicitSplit).toBe(true);
    expect(s.trainNormalPaths).toHaveLength(2);
    expect(s.testNormalPaths).toHaveLength(1);
    expect(s.abnormalPaths).toHaveLength(1);
    expect(s.normalPaths).toHaveLength(0);
  });

  it('ignores non-wav and unlabeled files', () => {
    const ds = parseFolder([
      'fan/id_00/normal/a.wav',
      'fan/id_00/readme.txt',
      'fan/id_00/other/c.wav',
    ]);
    expect(ds.totalWav).toBe(2); // two .wav (one labeled, one not)
    expect(ds.ignored).toContain('fan/id_00/other/c.wav');
    expect(ds.sections[0].normalPaths).toHaveLength(1);
  });

  it('tolerates backslashes and ./ prefixes', () => {
    const ds = parseFolder(['.\\fan\\id_00\\normal\\a.wav']);
    expect(ds.sections[0].key).toBe('fan/id_00');
    expect(ds.sections[0].normalPaths).toHaveLength(1);
  });
});

describe('planSplit', () => {
  it('uses explicit train/test verbatim', () => {
    const ds = parseFolder([
      'pump/id_00/train/normal/0.wav',
      'pump/id_00/test/normal/1.wav',
      'pump/id_00/test/abnormal/2.wav',
    ]);
    const plan = planSplit(ds.sections[0]);
    expect(plan.source).toBe('explicit');
    expect(plan.trainNormal).toEqual(['pump/id_00/train/normal/0.wav']);
    expect(plan.testNormal).toEqual(['pump/id_00/test/normal/1.wav']);
    expect(plan.testAbnormal).toEqual(['pump/id_00/test/abnormal/2.wav']);
  });

  const fourNormals = () =>
    parseFolder([
      'fan/id_00/normal/3.wav',
      'fan/id_00/normal/1.wav',
      'fan/id_00/normal/4.wav',
      'fan/id_00/normal/2.wav',
      'fan/id_00/abnormal/9.wav',
    ]).sections[0];

  it('defaults to interleaved (every 2nd clip trains, drift-robust)', () => {
    const plan = planSplit(fourNormals(), { ratio: 0.5 });
    expect(plan.source).toBe('deterministic');
    expect(plan.mode).toBe(SPLIT_MODE_DEFAULT);
    expect(plan.mode).toBe('interleaved');
    // sorted normals 1,2,3,4 (idx 0..3) → even idx train, odd idx test
    expect(plan.trainNormal).toEqual(['fan/id_00/normal/1.wav', 'fan/id_00/normal/3.wav']);
    expect(plan.testNormal).toEqual(['fan/id_00/normal/2.wav', 'fan/id_00/normal/4.wav']);
  });

  it('sequential mode keeps the first half for training', () => {
    const plan = planSplit(fourNormals(), { mode: 'sequential', ratio: 0.5 });
    expect(plan.trainNormal).toEqual(['fan/id_00/normal/1.wav', 'fan/id_00/normal/2.wav']);
    expect(plan.testNormal).toEqual(['fan/id_00/normal/3.wav', 'fan/id_00/normal/4.wav']);
  });

  it('seeded-random is deterministic for a fixed seed and disjoint', () => {
    const a = planSplit(fourNormals(), { mode: 'seeded-random', seed: 7 });
    const b = planSplit(fourNormals(), { mode: 'seeded-random', seed: 7 });
    expect(a.trainNormal).toEqual(b.trainNormal);
    expect(a.testNormal).toEqual(b.testNormal);
    // train ∩ test = ∅ and together they cover all normals
    expect(a.trainNormal.filter((p) => a.testNormal.includes(p))).toEqual([]);
    expect(a.trainNormal.length + a.testNormal.length).toBe(4);
  });

  it('every mode yields the requested train fraction and a disjoint split', () => {
    const ds = parseFolder(
      Array.from({ length: 10 }, (_, i) => `m/id/normal/${String(i).padStart(2, '0')}.wav`).concat(
        'm/id/abnormal/x.wav'
      )
    );
    for (const mode of ['sequential', 'interleaved', 'seeded-random'] as const) {
      const plan = planSplit(ds.sections[0], { mode, ratio: 0.5 });
      expect(plan.mode).toBe(mode);
      expect(plan.trainNormal).toHaveLength(5);
      expect(plan.testNormal).toHaveLength(5);
      const overlap = plan.trainNormal.filter((p) => plan.testNormal.includes(p));
      expect(overlap).toEqual([]);
    }
  });

  it('always keeps at least one train and one test normal clip', () => {
    const ds = parseFolder(['m/normal/a.wav', 'm/normal/b.wav', 'm/abnormal/c.wav']);
    const plan = planSplit(ds.sections[0], { ratio: 0.5 });
    expect(plan.trainNormal.length).toBeGreaterThanOrEqual(1);
    expect(plan.testNormal.length).toBeGreaterThanOrEqual(1);
  });
});
