/**
 * ZANOBOT · Mess-Labor — deterministic seeded PRNG (pure)
 *
 * Shared by the split planner ('seeded-random') and the classification runner
 * (reproducible random draws of good/bad fingerprints). Small, fast, and fully
 * deterministic so the same seed always yields the same selection.
 */

/** mulberry32 — a compact, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deterministic permutation of [0..n) for a given seed (Fisher–Yates driven
 * by mulberry32). Same (n, seed) → same order, every run.
 */
export function shuffledIndices(n: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  const rand = mulberry32(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}
