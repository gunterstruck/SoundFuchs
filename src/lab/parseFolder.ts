/**
 * ZANOBOT · Mess-Labor — dataset folder parsing & split planning (pure)
 *
 * A MIMII-style collection encodes the ground truth ONLY in the folder names:
 *
 *   fan/id_00/normal/0000.wav      → machine "fan", section "id_00", normal
 *   fan/id_00/abnormal/0000.wav    → … abnormal
 *
 * Tolerant variants accepted:
 *   - flat   normal/… + abnormal/…            → machine "default"
 *   - split  fan/id_00/train/normal/…  and  fan/id_00/test/{normal,abnormal}/…
 *
 * Only the relative paths are parsed here (pure, unit-tested); the matching
 * File/FileSystemFileHandle objects are joined back by the browser runner.
 */

import { shuffledIndices } from './rng.js';

/** One machine/section bucket with its clip paths. */
export interface ParsedSection {
  /** Display key: "<machine>/<section>" (or "<machine>", or "default"). */
  key: string;
  /** Top-level machine type, e.g. "fan". */
  machine: string;
  /** Sub-id/section, e.g. "id_00" (may be empty). */
  section: string;
  /** Normal clips from an explicit train/ split (empty when none). */
  trainNormalPaths: string[];
  /** Normal clips from an explicit test/ split. */
  testNormalPaths: string[];
  /** Abnormal clips (explicit test/ split or general). */
  abnormalPaths: string[];
  /** Normal clips with NO explicit split — to be split deterministically. */
  normalPaths: string[];
  /** True when the dataset shipped its own train/ + test/ structure. */
  hasExplicitSplit: boolean;
}

export interface ParsedDataset {
  sections: ParsedSection[];
  /** Paths that matched no normal/abnormal folder (ignored). */
  ignored: string[];
  /** Total number of .wav files seen. */
  totalWav: number;
}

function isWav(path: string): boolean {
  return /\.wav$/i.test(path);
}

/** Split a path into clean segments, tolerant of `\` and leading `./`. */
function segmentsOf(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s.length > 0 && s !== '.');
}

/**
 * Parse a flat list of relative paths into per-section normal/abnormal buckets.
 * Non-wav and unlabeled files are ignored (reported in `ignored`).
 */
export function parseFolder(paths: string[]): ParsedDataset {
  const sections = new Map<string, ParsedSection>();
  const ignored: string[] = [];
  let totalWav = 0;

  const ensure = (key: string, machine: string, section: string): ParsedSection => {
    let s = sections.get(key);
    if (!s) {
      s = {
        key,
        machine,
        section,
        trainNormalPaths: [],
        testNormalPaths: [],
        abnormalPaths: [],
        normalPaths: [],
        hasExplicitSplit: false,
      };
      sections.set(key, s);
    }
    return s;
  };

  for (const rawPath of paths) {
    if (!isWav(rawPath)) continue;
    totalWav++;

    const segs = segmentsOf(rawPath);
    // Drop the filename; we only classify by folders.
    const dirs = segs.slice(0, -1);

    // Find the normal/abnormal label folder (deepest match wins).
    let labelIdx = -1;
    let label: 'normal' | 'abnormal' | null = null;
    for (let i = dirs.length - 1; i >= 0; i--) {
      const low = dirs[i].toLowerCase();
      if (low === 'normal' || low === 'abnormal') {
        labelIdx = i;
        label = low as 'normal' | 'abnormal';
        break;
      }
    }
    if (labelIdx < 0 || !label) {
      ignored.push(rawPath);
      continue;
    }

    // Detect an explicit train/test split directly above the label.
    let prefixEnd = labelIdx;
    let split: 'train' | 'test' | null = null;
    if (labelIdx >= 1) {
      const above = dirs[labelIdx - 1].toLowerCase();
      if (above === 'train' || above === 'test') {
        split = above as 'train' | 'test';
        prefixEnd = labelIdx - 1;
      }
    }

    const prefix = dirs.slice(0, prefixEnd);
    const machine = prefix[0] ?? 'default';
    const section = prefix.slice(1).join('/');
    const key = prefix.length > 0 ? prefix.join('/') : 'default';

    const s = ensure(key, machine, section);

    if (split) {
      s.hasExplicitSplit = true;
      if (label === 'normal') {
        if (split === 'train') s.trainNormalPaths.push(rawPath);
        else s.testNormalPaths.push(rawPath);
      } else {
        // Abnormal only exists in test in DCASE/MIMII layouts.
        s.abnormalPaths.push(rawPath);
      }
    } else if (label === 'normal') {
      s.normalPaths.push(rawPath);
    } else {
      s.abnormalPaths.push(rawPath);
    }
  }

  return {
    sections: [...sections.values()].sort((a, b) => a.key.localeCompare(b.key)),
    ignored,
    totalWav,
  };
}

/**
 * How the normal clips are partitioned into train/test when the dataset has no
 * explicit train/ + test/ structure:
 *
 *  - 'sequential'    : first fraction trains, rest tests (clips sorted by name).
 *                      Simple, but on time-numbered WAVs it trains on the early
 *                      session and tests on the late one → slow drift
 *                      (temperature/load) can masquerade as an anomaly.
 *  - 'interleaved'   : every k-th clip trains, evenly spread across the whole
 *                      timeline. Deterministic AND drift-robust → the default.
 *  - 'seeded-random' : reproducible shuffle with a fixed seed.
 */
export type SplitMode = 'sequential' | 'interleaved' | 'seeded-random';

/** Drift-robust default: training clips are spread across the whole session. */
export const SPLIT_MODE_DEFAULT: SplitMode = 'interleaved';

/** Fixed seed so 'seeded-random' is reproducible run to run. */
export const SPLIT_SEED_DEFAULT = 1337;

export interface SplitOptions {
  mode?: SplitMode;
  /** Train fraction in (0,1). Default 0.5. */
  ratio?: number;
  /** Seed for 'seeded-random'. Default SPLIT_SEED_DEFAULT. */
  seed?: number;
}

/** A concrete train/test plan for one section. */
export interface SplitPlan {
  trainNormal: string[];
  testNormal: string[];
  testAbnormal: string[];
  /** How the split was obtained, for honest reporting in the result. */
  source: 'explicit' | 'deterministic';
  /** The partition strategy used (informational when source = 'explicit'). */
  mode: SplitMode;
  /** Train fraction actually used (deterministic only; 1 for explicit). */
  ratio: number;
}

/** Pick the `nTrain` training indices out of `n` for a given mode. */
function selectTrainIndices(n: number, nTrain: number, mode: SplitMode, seed: number): Set<number> {
  const train = new Set<number>();
  if (mode === 'sequential') {
    for (let i = 0; i < nTrain; i++) train.add(i);
    return train;
  }
  if (mode === 'seeded-random') {
    const idx = shuffledIndices(n, seed);
    for (let i = 0; i < nTrain; i++) train.add(idx[i]);
    return train;
  }
  // 'interleaved' — evenly spaced train picks across the whole timeline. With
  // nTrain = n/2 this selects every 2nd clip (even indices train, odd test).
  for (let j = 0; j < nTrain; j++) train.add(Math.floor((j * n) / nTrain));
  return train;
}

/**
 * Decide which normal clips train and which are held back for testing.
 *
 * - Explicit train/ + test/ → use them verbatim (the only honest choice).
 * - Otherwise → deterministic split of the normal clips (sorted by name so the
 *   same folder always yields the same split), partitioned by `mode`.
 *
 * The reserved normal clips are mixed with the abnormal clips at scoring time
 * so the engine never grades itself on its own training data.
 */
export function planSplit(section: ParsedSection, options: SplitOptions = {}): SplitPlan {
  const mode = options.mode ?? SPLIT_MODE_DEFAULT;
  if (section.hasExplicitSplit) {
    return {
      trainNormal: [...section.trainNormalPaths].sort(),
      testNormal: [...section.testNormalPaths].sort(),
      testAbnormal: [...section.abnormalPaths].sort(),
      source: 'explicit',
      mode,
      ratio: 1,
    };
  }

  const sorted = [...section.normalPaths].sort();
  const n = sorted.length;
  const r = Math.min(0.9, Math.max(0.1, options.ratio ?? 0.5));
  // At least one train clip, and always keep at least one normal clip for test
  // when there are ≥ 2 normal clips.
  let nTrain = Math.floor(n * r);
  nTrain = Math.max(1, Math.min(n - (n >= 2 ? 1 : 0), nTrain));

  const trainSet = selectTrainIndices(n, nTrain, mode, options.seed ?? SPLIT_SEED_DEFAULT);
  const trainNormal: string[] = [];
  const testNormal: string[] = [];
  for (let i = 0; i < n; i++) {
    if (trainSet.has(i)) trainNormal.push(sorted[i]);
    else testNormal.push(sorted[i]);
  }

  return {
    trainNormal,
    testNormal,
    testAbnormal: [...section.abnormalPaths].sort(),
    source: 'deterministic',
    mode,
    ratio: r,
  };
}
