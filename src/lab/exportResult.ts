/**
 * ZANOBOT · Mess-Labor — result export (CSV / JSON), pure string builders.
 */

import type { EngineId } from '@data/types.js';
import type { BenchmarkResult, SectionResult, ScoreBasis, ClassifyResult } from './types.js';
import { emptyConfusion, mergeConfusion, metricsOf, type Confusion } from './classifyEval.js';

const ENGINE_LABEL: Record<EngineId, string> = {
  gmia: 'GMIA',
  'spectral-cosine': 'Spektral-Cosine',
  yamnet: 'YAMNet',
  temporal: 'Zeitmuster (Tier 2)',
};

function fmt(v: number): string {
  return Number.isFinite(v) ? v.toFixed(3) : '';
}

/** Mean AUC of one engine across all sections where it produced a value. */
export function meanAuc(result: BenchmarkResult, engine: EngineId): number {
  const vals: number[] = [];
  for (const s of result.sections) {
    const e = s.perEngine[engine];
    if (e && Number.isFinite(e.auc)) vals.push(e.auc);
  }
  if (vals.length === 0) return NaN;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Human label for the split of one section, e.g. "interleaved 50%" or "train/test". */
export function splitLabel(s: SectionResult): string {
  if (s.split.source === 'explicit') return 'train/test';
  return `${s.split.mode} ${Math.round(s.split.ratio * 100)}%`;
}

/** Which quantity AUC/pAUC were computed on across the section's engines. */
export function sectionBasis(s: SectionResult): ScoreBasis | 'mixed' {
  const bases = new Set<ScoreBasis>();
  for (const e of Object.values(s.perEngine)) if (e && !e.error) bases.add(e.scoreBasis);
  if (bases.size === 0) return 'raw-cosine';
  if (bases.size === 1) return [...bases][0];
  return 'mixed';
}

/** Build a CSV "Zeugnis": one row per section, one AUC column per engine + Mittel. */
export function toCsv(result: BenchmarkResult): string {
  const engines = result.engines;
  const head = [
    'Maschinentyp',
    'Section',
    ...engines.map((e) => ENGINE_LABEL[e]),
    'Split',
    'AUC-Basis',
  ];
  const lines = [head.join(',')];

  for (const s of result.sections) {
    const cols = [
      csvCell(s.machine),
      csvCell(s.section),
      ...engines.map((e) => fmt(s.perEngine[e]?.auc ?? NaN)),
      csvCell(`${splitLabel(s)} (Train ${s.split.trainNormal}/Test ${s.split.testNormal}+${s.split.testAbnormal})`),
      csvCell(sectionBasis(s)),
    ];
    lines.push(cols.join(','));
  }

  const meanRow = ['Mittel', '', ...engines.map((e) => fmt(meanAuc(result, e))), '', ''];
  lines.push(meanRow.join(','));
  return lines.join('\n');
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Full machine-readable JSON dump (includes pAUC and per-engine errors). */
export function toJson(result: BenchmarkResult): string {
  return JSON.stringify(
    {
      tool: 'zanobot-mess-labor',
      clipAggregation: result.clipAgg,
      // AUC/pAUC are computed on the raw cosine/similarity (1 − rawCosine, before
      // tanh²) where available; each section.perEngine[*].scoreBasis records the
      // basis actually used, and section.split.mode the partition strategy.
      metricNote: 'AUC/pAUC auf Rohähnlichkeit (scoreBasis je Engine); Anzeige-Score unverändert',
      engines: result.engines,
      startedAt: new Date(result.startedAt).toISOString(),
      finishedAt: new Date(result.finishedAt).toISOString(),
      totalClipsScored: result.totalClipsScored,
      sections: result.sections,
      means: Object.fromEntries(result.engines.map((e) => [e, meanAuc(result, e)])),
    },
    null,
    2
  );
}

// ── Variant B: gut/schlecht classification export ──────────────────────────

/** Sum an engine's confusion across all sections (for the overall metrics). */
export function sumEngineConfusion(result: ClassifyResult, engine: EngineId): Confusion {
  let c = emptyConfusion();
  for (const s of result.sections) {
    const e = s.perEngine[engine];
    if (e && !e.error) c = mergeConfusion(c, e.confusion);
  }
  return c;
}

/** A percent string like "84,2 %" (or "—" for NaN). */
function pct(v: number): string {
  return Number.isFinite(v) ? `${(v * 100).toFixed(1).replace('.', ',')} %` : '—';
}

/** CSV for the classification report: accuracy per section × engine + Mittel. */
export function toCsvClassify(result: ClassifyResult): string {
  const engines = result.engines;
  const head = ['Maschinentyp', 'Section', ...engines.map((e) => `${ENGINE_LABEL[e]} Genauigkeit`)];
  const lines = [
    `# Zanobot Mess-Labor · Gut/Schlecht-Klassifikation · Schwelle=${result.confidenceThreshold}% · ` +
      `${result.nGood} gut + ${result.nBad} schlecht · ${result.runs} Durchläufe`,
    head.join(','),
  ];
  for (const s of result.sections) {
    const cols = [
      csvCell(s.machine),
      csvCell(s.section),
      ...engines.map((e) => {
        const m = s.perEngine[e];
        return m && !m.error ? pctPlain(m.metrics.accuracy) : m?.error ? 'Fehler' : '—';
      }),
    ];
    lines.push(cols.join(','));
  }
  const meanRow = [
    'Mittel',
    '',
    ...engines.map((e) => pctPlain(metricsOf(sumEngineConfusion(result, e)).accuracy)),
  ];
  lines.push(meanRow.join(','));
  return lines.join('\n');
}

function pctPlain(v: number): string {
  return Number.isFinite(v) ? (v * 100).toFixed(1) : '';
}

/** Full machine-readable JSON dump for the classification report. */
export function toJsonClassify(result: ClassifyResult): string {
  return JSON.stringify(
    {
      tool: 'zanobot-mess-labor',
      mode: 'classification',
      note: 'Zanobot-Workflow: N gute + M schlechte Fingerprints, Best-Match + Konfidenzschwelle. Strikt lesend.',
      confidenceThreshold: result.confidenceThreshold,
      nGood: result.nGood,
      nBad: result.nBad,
      runs: result.runs,
      seed: result.seed,
      engines: result.engines,
      startedAt: new Date(result.startedAt).toISOString(),
      finishedAt: new Date(result.finishedAt).toISOString(),
      totalClipsScored: result.totalClipsScored,
      sections: result.sections,
      means: Object.fromEntries(
        result.engines.map((e) => [e, metricsOf(sumEngineConfusion(result, e))])
      ),
    },
    null,
    2
  );
}

export { ENGINE_LABEL, pct };
