/**
 * ZANOBOT · Mess-Labor — Desktop/Expert UI (isolated, lazily loaded)
 *
 * A self-contained full-screen overlay that:
 *  1. lets the user pick a MIMII-style folder (File System Access API, with a
 *     <input webkitdirectory> fallback),
 *  2. parses it, runs the engine benchmark, shows a live progress bar with a
 *     cancel button, and
 *  3. renders the AUC "Zeugnis" (machine × engine) and offers CSV / JSON export.
 *
 * It writes NOTHING to the database and never touches a real machine reference.
 * Strings are German and local to this module so the i18n key sets and the
 * main bundle stay untouched (the whole module is code-split / lazy).
 */

import type { EngineId } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { renderMachineFingerprint } from '@ui/components/MachineFingerprint.js';
import { HistoryChart } from '@ui/components/HistoryChart.js';
import { getScoreVerbalStatus } from '@ui/phases/diagnoseScore.js';
import { getRecordingSettings } from '@utils/recordingSettings.js';
import { parseFolder, type ParsedDataset, type ParsedSection, type SplitMode } from './parseFolder.js';
import { runBenchmark, type ClipSource } from './benchmark.js';
import { runClassifyBenchmark } from './classifyBenchmark.js';
import {
  runNoiseBenchmark,
  toCsvNoise,
  toJsonNoise,
  DEFAULT_SNR_LEVELS,
  type NoiseBenchmarkResult,
} from './noiseBenchmark.js';
import { InteractiveSession, type TrainSelection } from './interactive.js';
import { pipelineSummary } from './phonePipeline.js';
import type { BenchmarkResult, ClassifyResult } from './types.js';
import type { ClipAggMode } from './clipAggregate.js';
import { metricsOf } from './classifyEval.js';
import {
  toCsv,
  toJson,
  toCsvClassify,
  toJsonClassify,
  meanAuc,
  splitLabel,
  sectionBasis,
  sumEngineConfusion,
  pct,
  ENGINE_LABEL,
} from './exportResult.js';

/** Which benchmark the lab is set to run. */
type LabMode = 'auc' | 'classify' | 'noise' | 'interactive';

// ── Minimal File System Access typings (independent of the TS lib version) ──
interface FsFileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}
interface FsDirHandleLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterableIterator<FsFileHandleLike | FsDirHandleLike>;
}
type ShowDirectoryPicker = () => Promise<FsDirHandleLike>;

/** True on a desktop browser wide enough and with directory picking available. */
export function isMessLaborSupported(): boolean {
  const hasPicker = typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
  const hasInputFallback = 'webkitdirectory' in document.createElement('input');
  const wideEnough = window.matchMedia('(min-width: 900px)').matches;
  return (hasPicker || hasInputFallback) && wideEnough;
}

const ALL_ENGINES: EngineId[] = ['gmia', 'spectral-cosine', 'yamnet', 'temporal'];

export class MessLaborView {
  private overlay: HTMLElement | null = null;
  private clips = new Map<string, ClipSource>();
  private dataset: ParsedDataset | null = null;
  private abort: AbortController | null = null;
  private running = false;
  private mode: LabMode = 'auc';
  private lastAuc: BenchmarkResult | null = null;
  private lastClassify: ClassifyResult | null = null;
  private lastNoise: NoiseBenchmarkResult | null = null;
  private noiseFile: File | null = null;

  /** Interactive (phone-simulation) session state. */
  private session: InteractiveSession | null = null;
  private historyChart: HistoryChart | null = null;
  private busy = false;

  /** Build the overlay and attach it to the document. */
  open(): void {
    if (this.overlay) return;
    const overlay = document.createElement('div');
    overlay.className = 'mess-labor-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = this.template();
    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.injectStyles();
    this.wire();
  }

  close(): void {
    this.abort?.abort();
    this.historyChart?.destroy();
    this.historyChart = null;
    void this.session?.dispose();
    this.session = null;
    this.overlay?.remove();
    this.overlay = null;
    this.clips.clear();
    this.dataset = null;
    this.lastAuc = null;
    this.lastClassify = null;
    this.lastNoise = null;
    this.noiseFile = null;
  }

  private $(sel: string): HTMLElement | null {
    return this.overlay?.querySelector(sel) ?? null;
  }

  private wire(): void {
    this.$('#ml-close')?.addEventListener('click', () => this.close());
    this.$('#ml-pick')?.addEventListener('click', () => void this.pickFolder());
    this.$('#ml-run')?.addEventListener('click', () => void this.run());
    this.$('#ml-cancel')?.addEventListener('click', () => this.abort?.abort());
    this.$('#ml-csv')?.addEventListener('click', () => this.download('csv'));
    this.$('#ml-json')?.addEventListener('click', () => this.download('json'));

    const fallback = this.$('#ml-fallback-input') as HTMLInputElement | null;
    fallback?.addEventListener('change', () => {
      if (fallback.files) this.ingestFileList(fallback.files);
    });

    this.$('#ml-mode-auc')?.addEventListener('click', () => this.setMode('auc'));
    this.$('#ml-mode-classify')?.addEventListener('click', () => this.setMode('classify'));
    this.$('#ml-mode-noise')?.addEventListener('click', () => this.setMode('noise'));
    this.$('#ml-mode-interactive')?.addEventListener('click', () => this.setMode('interactive'));

    // Lärm-Benchmark: separate Lärm-WAV wählen
    this.$('#ml-noise-pick')?.addEventListener('click', () =>
      (this.$('#ml-noise-file') as HTMLInputElement | null)?.click()
    );
    (this.$('#ml-noise-file') as HTMLInputElement | null)?.addEventListener('change', () => {
      const input = this.$('#ml-noise-file') as HTMLInputElement | null;
      this.noiseFile = input?.files?.[0] ?? null;
      const nameEl = this.$('#ml-noise-name');
      if (nameEl) nameEl.textContent = this.noiseFile ? this.noiseFile.name : 'keine Lärmdatei';
    });

    // Interactive (phone-simulation) controls.
    this.$('#ml-int-section')?.addEventListener('change', () => this.fillInteractiveLists());
    this.$('#ml-int-train')?.addEventListener('click', () => void this.interactiveTrain());
    this.$('#ml-int-check')?.addEventListener('click', () => void this.interactiveCheck());
    this.$('#ml-int-export')?.addEventListener('click', () => this.interactiveExport());
    this.$('#ml-int-reset')?.addEventListener('click', () => void this.interactiveReset());
  }

  /** Switch between AUC, classification, noise-robustness and interactive mode. */
  private setMode(mode: LabMode): void {
    if (this.running || this.busy) return;
    this.mode = mode;
    this.$('#ml-mode-auc')?.classList.toggle('ml-mode-active', mode === 'auc');
    this.$('#ml-mode-classify')?.classList.toggle('ml-mode-active', mode === 'classify');
    this.$('#ml-mode-noise')?.classList.toggle('ml-mode-active', mode === 'noise');
    this.$('#ml-mode-interactive')?.classList.toggle('ml-mode-active', mode === 'interactive');
    const show = (sel: string, on: boolean): void => {
      const el = this.$(sel) as HTMLElement | null;
      if (el) el.style.display = on ? '' : 'none';
    };
    show('#ml-opts-auc', mode === 'auc');
    show('#ml-opts-classify', mode === 'classify');
    show('#ml-opts-noise', mode === 'noise'); // noise WAV + single engine + SNR levels
    show('#ml-opts-engines', mode === 'auc' || mode === 'classify'); // multi-engine checkboxes
    show('#ml-opts-interactive', mode === 'interactive'); // single-engine select
    show('#ml-run', mode !== 'interactive'); // interactive drives itself
    show('#ml-interactive', mode === 'interactive');
    if (mode === 'interactive') this.populateInteractivePanel();
    // Results from the other modes no longer apply → clear the shared view.
    const res = this.$('#ml-result');
    if (res) res.innerHTML = '';
    const exports = this.$('#ml-exports') as HTMLElement | null;
    if (exports) exports.style.display = 'none';
  }

  // ── Folder ingestion ──────────────────────────────────────────────────────

  private async pickFolder(): Promise<void> {
    const picker = (window as unknown as { showDirectoryPicker?: ShowDirectoryPicker })
      .showDirectoryPicker;
    if (typeof picker === 'function') {
      try {
        const dir = await picker();
        await this.ingestDirHandle(dir);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          logger.warn('Mess-Labor: Ordnerwahl fehlgeschlagen:', err);
        }
      }
    } else {
      (this.$('#ml-fallback-input') as HTMLInputElement | null)?.click();
    }
  }

  private async ingestDirHandle(root: FsDirHandleLike): Promise<void> {
    const clips = new Map<string, ClipSource>();
    const paths: string[] = [];
    const walk = async (dir: FsDirHandleLike, prefix: string): Promise<void> => {
      for await (const entry of dir.values()) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.kind === 'directory') {
          await walk(entry, path);
        } else {
          paths.push(path);
          const handle = entry;
          clips.set(path, { read: async () => (await handle.getFile()).arrayBuffer() });
        }
      }
    };
    await walk(root, '');
    this.setDataset(paths, clips);
  }

  private ingestFileList(list: FileList): void {
    const clips = new Map<string, ClipSource>();
    const paths: string[] = [];
    for (const file of Array.from(list)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      paths.push(rel);
      clips.set(rel, { read: () => file.arrayBuffer() });
    }
    this.setDataset(paths, clips);
  }

  private setDataset(paths: string[], clips: Map<string, ClipSource>): void {
    this.clips = clips;
    this.dataset = parseFolder(paths);
    this.renderDatasetSummary();
    const runBtn = this.$('#ml-run') as HTMLButtonElement | null;
    if (runBtn) runBtn.disabled = this.dataset.sections.length === 0;
    if (this.mode === 'interactive') this.populateInteractivePanel();
  }

  private renderDatasetSummary(): void {
    const el = this.$('#ml-summary');
    if (!el || !this.dataset) return;
    const ds = this.dataset;
    if (ds.sections.length === 0) {
      el.innerHTML = `<p class="ml-warn">Keine <code>normal/</code> bzw. <code>abnormal/</code> Ordner gefunden (${ds.totalWav} WAV-Dateien gesehen).</p>`;
      return;
    }
    const rows = ds.sections
      .map(
        (s) =>
          `<tr><td>${esc(s.key)}</td><td>${s.hasExplicitSplit ? 'train/test' : 'auto'}</td><td>${s.trainNormalPaths.length + s.normalPaths.length}</td><td>${s.abnormalPaths.length}</td></tr>`
      )
      .join('');
    el.innerHTML = `
      <p>${ds.sections.length} Bereich(e), ${ds.totalWav} WAV-Dateien.</p>
      <table class="ml-table"><thead><tr><th>Bereich</th><th>Split</th><th>normal</th><th>abnormal</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  private selectedEngines(): EngineId[] {
    return ALL_ENGINES.filter(
      (id) => (this.$(`#ml-eng-${id}`) as HTMLInputElement | null)?.checked
    );
  }

  private async run(): Promise<void> {
    if (this.running || !this.dataset) return;
    const engines = this.mode === 'noise' ? [] : this.selectedEngines();
    if (this.mode !== 'noise' && engines.length === 0) {
      this.setStatus('Bitte mindestens eine Engine auswählen.', true);
      return;
    }
    if (this.mode === 'noise' && !this.noiseFile) {
      this.setStatus('Bitte zuerst eine Lärm-WAV wählen (Hallenlärm, Maschine aus).', true);
      return;
    }

    this.running = true;
    this.abort = new AbortController();
    this.toggleRunningUi(true);
    this.setStatus('Starte Messung…');

    const resolve = (path: string): ClipSource => {
      const src = this.clips.get(path);
      if (!src) throw new Error(`Clip nicht gefunden: ${path}`);
      return src;
    };
    const onProgress = (p: { filesDone: number; filesTotal: number; message: string }): void => {
      const percent = p.filesTotal > 0 ? Math.round((p.filesDone / p.filesTotal) * 100) : 0;
      const bar = this.$('#ml-bar') as HTMLElement | null;
      if (bar) bar.style.width = `${percent}%`;
      this.setStatus(`${p.message} — ${p.filesDone}/${p.filesTotal} (${percent} %)`);
    };
    const num = (sel: string, fallback: number): number => {
      const v = parseInt((this.$(sel) as HTMLInputElement | null)?.value ?? '', 10);
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };

    try {
      if (this.mode === 'auc') {
        const clipAgg = ((this.$('#ml-agg') as HTMLSelectElement | null)?.value ?? 'mean') as ClipAggMode;
        const splitMode = ((this.$('#ml-split') as HTMLSelectElement | null)?.value ?? 'interleaved') as SplitMode;
        const maxRaw = parseInt((this.$('#ml-maxfiles') as HTMLInputElement | null)?.value ?? '0', 10);
        const maxFilesPerSection = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : undefined;
        const result = await runBenchmark(this.dataset, resolve, {
          engines,
          clipAgg,
          splitMode,
          maxFilesPerSection,
          signal: this.abort.signal,
          onProgress,
        });
        this.lastAuc = result;
        this.renderAucResult(result);
        this.setStatus(`Fertig: ${result.totalClipsScored} Prüf-Clips bewertet.`);
      } else if (this.mode === 'classify') {
        const result = await runClassifyBenchmark(this.dataset, resolve, {
          engines,
          nGood: num('#ml-ngood', 10),
          nBad: num('#ml-nbad', 10),
          maxTestPerClass: num('#ml-maxtest', 20),
          runs: num('#ml-runs', 5),
          signal: this.abort.signal,
          onProgress,
        });
        this.lastClassify = result;
        this.renderClassifyResult(result);
        this.setStatus(`Fertig: ${result.totalClipsScored} Prüf-Clips klassifiziert.`);
      }
      if (this.mode === 'noise') {
        const noiseFile = this.noiseFile;
        if (!noiseFile) throw new Error('Keine Lärmdatei gewählt');
        const engineId = ((this.$('#ml-noise-engine') as HTMLSelectElement | null)?.value ??
          'spectral-cosine') as EngineId;
        const snrText = (this.$('#ml-noise-snrs') as HTMLInputElement | null)?.value ?? '';
        const snrLevels = snrText
          .split(',')
          .map((v) => parseFloat(v.trim()))
          .filter((v) => Number.isFinite(v));
        const maxRaw = parseInt(
          (this.$('#ml-noise-maxfiles') as HTMLInputElement | null)?.value ?? '0',
          10
        );
        const result = await runNoiseBenchmark(
          this.dataset,
          resolve,
          { read: () => noiseFile.arrayBuffer() },
          {
            engineId,
            snrLevels: snrLevels.length > 0 ? snrLevels : DEFAULT_SNR_LEVELS,
            maxFilesPerSection: Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : undefined,
            signal: this.abort.signal,
            onProgress,
          }
        );
        this.lastNoise = result;
        this.renderNoiseResult(result);
        this.setStatus(`Fertig: ${result.totalClipsScored} Bewertungen (A/B) durchgeführt.`);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.setStatus('Messung abgebrochen.', true);
      } else {
        logger.error('Mess-Labor: Messung fehlgeschlagen:', err);
        this.setStatus(`Fehler: ${(err as Error).message}`, true);
      }
    } finally {
      this.running = false;
      this.toggleRunningUi(false);
    }
  }

  private toggleRunningUi(running: boolean): void {
    (this.$('#ml-run') as HTMLButtonElement | null)?.toggleAttribute('disabled', running);
    (this.$('#ml-pick') as HTMLButtonElement | null)?.toggleAttribute('disabled', running);
    const cancel = this.$('#ml-cancel') as HTMLButtonElement | null;
    if (cancel) cancel.style.display = running ? '' : 'none';
    const progress = this.$('#ml-progress');
    if (progress) progress.style.display = running ? '' : 'none';
  }

  private setStatus(text: string, warn = false): void {
    const el = this.$('#ml-status');
    if (el) {
      el.textContent = text;
      el.classList.toggle('ml-warn', warn);
    }
  }

  // ── Result rendering & export ───────────────────────────────────────────────

  private renderAucResult(result: BenchmarkResult): void {
    const host = this.$('#ml-result');
    if (!host) return;
    const engines = result.engines;

    const header = `<tr><th>Maschinentyp</th><th>Section</th>${engines
      .map((e) => `<th>${esc(ENGINE_LABEL[e])}</th>`)
      .join('')}<th>Split</th><th>AUC-Basis</th></tr>`;

    const body = result.sections
      .map((s) => {
        const cells = engines
          .map((e) => {
            const r = s.perEngine[e];
            if (!r) return '<td>—</td>';
            if (r.error) return `<td class="ml-err" title="${esc(r.error)}">Fehler</td>`;
            return `<td>${fmtAuc(r.auc)}</td>`;
          })
          .join('');
        const split = `${splitLabel(s)} · ${s.split.testNormal}N/${s.split.testAbnormal}A`;
        return `<tr><td>${esc(s.machine)}</td><td>${esc(s.section)}</td>${cells}<td class="ml-split">${esc(split)}</td><td class="ml-split">${esc(sectionBasis(s))}</td></tr>`;
      })
      .join('');

    const meanCells = engines.map((e) => `<td><strong>${fmtAuc(meanAuc(result, e))}</strong></td>`).join('');
    const meanRow = `<tr class="ml-mean"><td><strong>Mittel</strong></td><td></td>${meanCells}<td></td><td></td></tr>`;

    host.innerHTML = `
      <h3>Zeugnis · AUC je Bereich × Engine <span class="ml-agg-note">(Aggregation: ${esc(result.clipAgg)} · AUC auf Rohähnlichkeit)</span></h3>
      <table class="ml-table ml-result-table"><thead>${header}</thead><tbody>${body}${meanRow}</tbody></table>
      <p class="ml-note">AUC: 1,0 = perfekt · 0,85 = gut · 0,70 = wackelig · 0,50 = raten. AUC/pAUC werden auf der rohen Ähnlichkeit (vor tanh²) gerechnet; der Anzeige-Score bleibt 0–100. Nichts wurde gespeichert.</p>`;
    (this.$('#ml-exports') as HTMLElement | null)?.style.removeProperty('display');
  }

  /**
   * Render the gut/schlecht classification report: per section × engine
   * accuracy + Mittel, plus a per-engine confusion matrix and the hit rates.
   */
  private renderClassifyResult(result: ClassifyResult): void {
    const host = this.$('#ml-result');
    if (!host) return;
    const engines = result.engines;

    const header = `<tr><th>Maschinentyp</th><th>Section</th>${engines
      .map((e) => `<th>${esc(ENGINE_LABEL[e])}</th>`)
      .join('')}</tr>`;
    const body = result.sections
      .map((s) => {
        const cells = engines
          .map((e) => {
            const r = s.perEngine[e];
            if (!r) return '<td>—</td>';
            if (r.error) return `<td class="ml-err" title="${esc(r.error)}">Fehler</td>`;
            return `<td>${pctCell(r.metrics.accuracy)}</td>`;
          })
          .join('');
        return `<tr><td>${esc(s.machine)}</td><td>${esc(s.section)}</td>${cells}</tr>`;
      })
      .join('');
    const meanCells = engines
      .map((e) => `<td><strong>${pctCell(metricsOf(sumEngineConfusion(result, e)).accuracy)}</strong></td>`)
      .join('');
    const meanRow = `<tr class="ml-mean"><td><strong>Mittel</strong></td><td></td>${meanCells}</tr>`;

    // Per-engine confusion matrix + hit rates (summed over all sections/runs).
    const detail = engines
      .map((e) => {
        const c = sumEngineConfusion(result, e);
        const m = metricsOf(c);
        return `
          <div class="ml-confusion">
            <h4>${esc(ENGINE_LABEL[e])}</h4>
            <table class="ml-table">
              <thead><tr><th>wahr ↓ / erkannt →</th><th>gesund</th><th>unsicher</th><th>fehlerhaft</th></tr></thead>
              <tbody>
                <tr><td>gut</td><td class="ml-ok">${c.normal.healthy}</td><td>${c.normal.uncertain}</td><td class="ml-bad">${c.normal.faulty}</td></tr>
                <tr><td>schlecht</td><td class="ml-bad">${c.abnormal.healthy}</td><td>${c.abnormal.uncertain}</td><td class="ml-ok">${c.abnormal.faulty}</td></tr>
              </tbody>
            </table>
            <p class="ml-note">gut→gesund ${pct(m.recallGood)} · schlecht→fehlerhaft ${pct(m.recallBad)} · unsicher ${pct(m.uncertainRate)} · Genauigkeit ${pct(m.accuracy)} <span class="ml-agg-note">(schwellenfrei ${pct(m.accuracyFree)})</span></p>
          </div>`;
      })
      .join('');

    host.innerHTML = `
      <h3>Zeugnis · Gut/Schlecht-Klassifikation <span class="ml-agg-note">(${result.nGood} gut + ${result.nBad} schlecht Fingerprints · ${result.runs} Durchläufe · Schwelle ${result.confidenceThreshold} %)</span></h3>
      <table class="ml-table ml-result-table"><thead>${header}</thead><tbody>${body}${meanRow}</tbody></table>
      ${detail}
      <p class="ml-note">Bewertung an deiner Konfidenzschwelle (${result.confidenceThreshold} %) — wie im echten Zanobot: mehrere gute UND schlechte Fingerprints, Best-Match gewinnt. Nichts wurde gespeichert.</p>`;
    (this.$('#ml-exports') as HTMLElement | null)?.style.removeProperty('display');
  }

  /**
   * Render the noise-robustness (A/B) report: per section a table of SNR
   * levels × (AUC without / with subtraction / delta / estimated SNR).
   */
  private renderNoiseResult(result: NoiseBenchmarkResult): void {
    const host = this.$('#ml-result');
    if (!host) return;

    const fmtAuc = (v: number): string => (Number.isFinite(v) ? v.toFixed(3) : '—');
    const deltaCell = (delta: number): string => {
      if (!Number.isFinite(delta)) return '<td>—</td>';
      const cls = delta > 0.005 ? 'ml-ok' : delta < -0.005 ? 'ml-bad' : '';
      const sign = delta > 0 ? '+' : '';
      return `<td class="${cls}">${sign}${delta.toFixed(3)}</td>`;
    };

    const blocks = result.sections
      .map((s) => {
        if (s.error) {
          return `<h4>${esc(s.machine)} / ${esc(s.section)}</h4><p class="ml-warn">${esc(s.error)}</p>`;
        }
        const rows = s.levels
          .map((l) => {
            const est = Number.isFinite(l.meanEstimatedSnrDb)
              ? `${l.meanEstimatedSnrDb >= 0 ? '+' : ''}${l.meanEstimatedSnrDb.toFixed(1)} dB`
              : '—';
            return (
              `<tr><td>${l.snrDb >= 0 ? '+' : ''}${l.snrDb} dB</td>` +
              `<td>${fmtAuc(l.aucWithout)}</td><td>${fmtAuc(l.aucWith)}</td>` +
              deltaCell(l.aucWith - l.aucWithout) +
              `<td>${fmtAuc(l.pAucWithout)}</td><td>${fmtAuc(l.pAucWith)}</td>` +
              `<td>${est}</td></tr>`
            );
          })
          .join('');
        return `
          <h4>${esc(s.machine)} / ${esc(s.section)} — sauber: AUC ${fmtAuc(s.cleanAuc)}
            <span class="ml-hint">(${s.trainNormal} Train, ${s.testNormal}+${s.testAbnormal} Test)</span></h4>
          <table class="ml-table ml-result-table">
            <thead><tr><th>Misch-SNR</th><th>AUC ohne</th><th>AUC mit</th><th>Δ AUC</th>
              <th>pAUC ohne</th><th>pAUC mit</th><th>geschätzte SNR</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
      })
      .join('');

    host.innerHTML = `
      ${blocks}
      <p class="ml-note">
        A/B je Misch-SNR: dieselben Prüf-Clips, einmal ohne und einmal mit
        Lärmprofil-Subtraktion (β=${result.beta}, Floor=${result.spectralFloor}) —
        Engine ${esc(ENGINE_LABEL[result.engineId] ?? result.engineId)},
        Profil aus 1. Hälfte der Lärmdatei (${result.profileFrames} Frames,
        Stationarität ${result.profileStationarity.toFixed(2)}), gemischt aus der 2. Hälfte.
        „geschätzte SNR" = der Produktions-Schätzer der Konfidenz-Ampel gegen die bekannte
        Misch-SNR. Nichts wurde gespeichert.
      </p>`;
    (this.$('#ml-exports') as HTMLElement | null)?.style.removeProperty('display');
  }

  private download(kind: 'csv' | 'json'): void {
    if (this.mode === 'noise') {
      if (!this.lastNoise) return;
      const content = kind === 'csv' ? toCsvNoise(this.lastNoise) : toJsonNoise(this.lastNoise);
      this.saveBlob(content, kind, 'laerm');
      return;
    }
    const isClassify = this.mode === 'classify';
    const result = isClassify ? this.lastClassify : this.lastAuc;
    if (!result) return;
    let content: string;
    if (isClassify) {
      content = kind === 'csv' ? toCsvClassify(result as ClassifyResult) : toJsonClassify(result as ClassifyResult);
    } else {
      content = kind === 'csv' ? toCsv(result as BenchmarkResult) : toJson(result as BenchmarkResult);
    }
    this.saveBlob(content, kind, isClassify ? 'klassifikation' : 'auc');
  }

  private saveBlob(content: string, kind: 'csv' | 'json', tag: string): void {
    const mime = kind === 'csv' ? 'text/csv' : 'application/json';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zanobot-messlabor-${tag}-${stamp}.${kind}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ── Interactive mode ("Handy-Simulation") ──────────────────────────────────

  /** Currently selected section of the interactive panel. */
  private currentSection(): ParsedSection | null {
    const key = (this.$('#ml-int-section') as HTMLSelectElement | null)?.value;
    return this.dataset?.sections.find((s) => s.key === key) ?? this.dataset?.sections[0] ?? null;
  }

  /** All good clips of a section (explicit-split lists folded in). */
  private static normalsOf(section: ParsedSection): string[] {
    return [...section.normalPaths, ...section.trainNormalPaths, ...section.testNormalPaths].sort();
  }

  /** Show which settings-driven options the NEXT action would use (read live). */
  private refreshPipelineInfo(): void {
    const el = this.$('#ml-int-pipeline');
    if (el) el.textContent = `⚙ Aktive Einstellungen: ${pipelineSummary()}`;
  }

  /** Fill the section dropdown and the file lists once a dataset is loaded. */
  private populateInteractivePanel(): void {
    this.refreshPipelineInfo();
    const select = this.$('#ml-int-section') as HTMLSelectElement | null;
    if (!select) return;
    const sections = this.dataset?.sections ?? [];
    select.innerHTML = sections
      .map((s) => `<option value="${esc(s.key)}">${esc(s.key)}</option>`)
      .join('');
    select.disabled = sections.length === 0;
    this.fillInteractiveLists();
  }

  /** Render the good/bad checkbox lists for the selected section. */
  private fillInteractiveLists(): void {
    const section = this.currentSection();
    const goodHost = this.$('#ml-int-good-list');
    const badHost = this.$('#ml-int-bad-list');
    if (!goodHost || !badHost) return;
    const renderList = (paths: string[], cls: 'good' | 'bad'): string => {
      const capped = paths.slice(0, 200);
      const items = capped
        .map(
          (p) =>
            `<label class="ml-int-file" title="${esc(p)}"><input type="checkbox" data-path="${esc(p)}" data-cls="${cls}" /> ${esc(basename(p))}</label>`
        )
        .join('');
      const more = paths.length > capped.length ? `<p class="ml-hint">… ${paths.length - capped.length} weitere ausgeblendet</p>` : '';
      return items + more || '<p class="ml-hint">keine Dateien</p>';
    };
    goodHost.innerHTML = section ? renderList(MessLaborView.normalsOf(section), 'good') : '';
    badHost.innerHTML = section ? renderList([...section.abnormalPaths].sort(), 'bad') : '';
    this.refreshTestSelect();
  }

  /**
   * Rebuild the check-file dropdown from all section files. Trained files stay
   * selectable (checking a training file is a valid, deliberate self-test —
   * e.g. "does the Referenz score ~100% against itself?") but are marked with
   * which fingerprint they were trained as, so a near-perfect score is not
   * mistaken for the engine generalizing to unseen data.
   */
  private refreshTestSelect(): void {
    const select = this.$('#ml-int-test-file') as HTMLSelectElement | null;
    const section = this.currentSection();
    if (!select) return;
    if (!section) {
      select.innerHTML = '';
      select.disabled = true;
      return;
    }
    const trainedLabelByPath = new Map(
      (this.session?.trainedFingerprints ?? []).map((f) => [f.path, f.label])
    );
    const opts = (paths: string[], cls: 'normal' | 'abnormal'): string =>
      paths
        .map((p) => {
          const trainedAs = trainedLabelByPath.get(p);
          const suffix = trainedAs ? ` — angelernt als ${trainedAs}` : '';
          return `<option value="${esc(p)}" data-cls="${cls}">${esc(basename(p) + suffix)}</option>`;
        })
        .join('');
    const good = opts(MessLaborView.normalsOf(section), 'normal');
    const bad = opts([...section.abnormalPaths].sort(), 'abnormal');
    select.innerHTML =
      `<optgroup label="Gut (normal/)">${good}</optgroup>` +
      `<optgroup label="Schlecht (abnormal/)">${bad}</optgroup>`;
    select.disabled = !(good || bad);
    const checkBtn = this.$('#ml-int-check') as HTMLButtonElement | null;
    if (checkBtn) checkBtn.disabled = !this.session?.isTrained || select.disabled;
  }

  /** Train the hand-picked selection as the session's fingerprints. */
  private async interactiveTrain(): Promise<void> {
    if (this.busy || !this.dataset) return;
    const boxes = [
      ...(this.$('#ml-int-good-list')?.querySelectorAll('input:checked') ?? []),
      ...(this.$('#ml-int-bad-list')?.querySelectorAll('input:checked') ?? []),
    ] as HTMLInputElement[];
    const selection: TrainSelection[] = boxes.map((b) => ({
      path: b.dataset.path ?? '',
      type: b.dataset.cls === 'bad' ? 'faulty' : 'healthy',
    }));
    if (!selection.some((s) => s.type === 'healthy')) {
      this.setStatus('Bitte mindestens eine Gut-Datei anhaken (wird die Referenz).', true);
      return;
    }

    const engineId = ((this.$('#ml-int-engine') as HTMLSelectElement | null)?.value ??
      'gmia') as EngineId;
    // A new engine means a new virtual machine → fresh session (fresh Verlauf).
    if (this.session && this.session.engineId !== engineId) {
      await this.session.dispose();
      this.session = null;
      this.historyChart?.destroy();
      this.historyChart = null;
      for (const sel of ['#ml-int-history-wrap', '#ml-int-resultcard', '#ml-int-iris-row']) {
        const el = this.$(sel) as HTMLElement | null;
        if (el) el.style.display = 'none';
      }
      const proto = this.$('#ml-int-protocol');
      if (proto) proto.innerHTML = '';
    }
    this.session ??= new InteractiveSession(engineId, (path) => {
      const src = this.clips.get(path);
      if (!src) throw new Error(`Clip nicht gefunden: ${path}`);
      return src;
    });

    this.busy = true;
    try {
      const trained = await this.session.train(selection, (done, total, label) =>
        this.setStatus(`Anlernen ${done}/${total} — ${label}…`)
      );
      this.renderTrainedChips();
      const refCanvas = this.$('#ml-int-iris-ref') as HTMLCanvasElement | null;
      const refVec = this.session.referenceIris;
      if (refCanvas && refVec) renderMachineFingerprint(refCanvas, refVec);
      const irisRow = this.$('#ml-int-iris-row');
      if (irisRow) irisRow.style.display = '';
      this.refreshTestSelect();
      this.refreshPipelineInfo();
      const quality = this.session.referenceQuality;
      const qualityText = quality
        ? ` Referenz-Qualität: ${quality.rating} (${Math.round(quality.score)}).`
        : '';
      this.setStatus(
        `Angelernt: ${trained.length} Fingerprint(s) — ` +
          `${trained.filter((f) => f.type === 'healthy').length} gut, ` +
          `${trained.filter((f) => f.type === 'faulty').length} schlecht.` +
          qualityText +
          ' Jetzt prüfen ▶'
      );
    } catch (err) {
      logger.error('Mess-Labor (Interaktiv): Anlernen fehlgeschlagen:', err);
      this.setStatus(`Fehler beim Anlernen: ${(err as Error).message}`, true);
    } finally {
      this.busy = false;
    }
  }

  /** Show the trained fingerprints as chips (with their file names). */
  private renderTrainedChips(): void {
    const host = this.$('#ml-int-trained');
    if (!host) return;
    const chips = (this.session?.trainedFingerprints ?? [])
      .map(
        (f) =>
          `<span class="ml-chip ${f.type === 'healthy' ? 'ml-chip-good' : 'ml-chip-bad'}" title="${esc(f.path)}">${esc(f.label)} · ${esc(basename(f.path))}</span>`
      )
      .join('');
    host.innerHTML = chips;
  }

  /** Run one Prüfung on the selected file — like on the phone. */
  private async interactiveCheck(): Promise<void> {
    if (this.busy || !this.session?.isTrained) return;
    const select = this.$('#ml-int-test-file') as HTMLSelectElement | null;
    const path = select?.value;
    if (!path) return;
    const cls = select?.selectedOptions[0]?.dataset.cls;
    const trueClass = cls === 'abnormal' ? 'abnormal' : cls === 'normal' ? 'normal' : 'unbekannt';

    this.busy = true;
    this.setStatus(`Prüfe ${basename(path)}…`);
    try {
      const { record, iris } = await this.session.check(path, trueClass);

      // Result card — score, verbal status and thresholds like on the phone.
      const card = this.$('#ml-int-resultcard');
      if (card) {
        const d = record.diagnosis;
        const settings = getRecordingSettings();
        card.className = `ml-int-card ml-int-${d.status}`;
        const faultLine =
          d.metadata?.faultDetected === true
            ? `<div class="ml-int-fault">⚠ Fehler-Referenz erkannt: ${esc(String(d.metadata.bestFaultyLabel ?? ''))} (${String(d.metadata.bestFaultyScore ?? '')} %)</div>`
            : '';
        const driftLine = record.drift
          ? `<div class="ml-int-drift ml-int-drift-${record.drift.severity}">⚠ Drift (${record.drift.severity === 'critical' ? 'kritisch' : 'Warnung'}): ${esc(driftDe(record.drift.interpretation))}</div>`
          : '';
        const pipelineLine = record.pipeline.length
          ? `<div class="ml-int-pipenote">Pipeline: ${esc(record.pipeline.join(' · '))}</div>`
          : '';
        card.innerHTML = `
          <div class="ml-int-score">${d.healthScore.toFixed(1).replace('.', ',')} %</div>
          <div class="ml-int-status">${esc(statusDe(d.status))} · ${esc(getScoreVerbalStatus(d.healthScore))}</div>
          ${faultLine}
          ${driftLine}
          <div class="ml-int-meta">
            Datei: <strong title="${esc(record.path)}">${esc(basename(record.path))}</strong>
            (wahr: ${record.trueClass === 'abnormal' ? 'schlecht' : record.trueClass === 'normal' ? 'gut' : '?'})
            · erkannt: ${esc(record.winnerLabel)}${record.winnerPath ? ` (${esc(basename(record.winnerPath))})` : ''}
            · Engine ${esc(ENGINE_LABEL[this.session.engineId])}
            · Schwellen ${settings.confidenceThreshold}/${settings.faultyThreshold} %
          </div>
          ${pipelineLine}`;
        card.style.display = '';
      }
      this.refreshPipelineInfo();

      // Iris of the checked clip next to the reference iris.
      const testCanvas = this.$('#ml-int-iris-test') as HTMLCanvasElement | null;
      if (testCanvas && iris) renderMachineFingerprint(testCanvas, iris);
      const testCaption = this.$('#ml-int-iris-test-caption');
      if (testCaption) testCaption.textContent = `Prüfung: ${basename(path)}`;

      // Verlauf — the real phone HistoryChart over this session's checks.
      const wrap = this.$('#ml-int-history-wrap');
      if (wrap) wrap.style.display = '';
      this.historyChart ??= new HistoryChart('ml-int-history');
      this.historyChart.draw(this.session.history.map((c) => c.diagnosis));

      this.renderProtocol();
      this.setStatus(`Prüfung ${this.session.history.length} abgeschlossen.`);
    } catch (err) {
      logger.error('Mess-Labor (Interaktiv): Prüfung fehlgeschlagen:', err);
      this.setStatus(`Fehler bei der Prüfung: ${(err as Error).message}`, true);
    } finally {
      this.busy = false;
    }
  }

  /** Protocol table: every check with file names, truth, score and verdict. */
  private renderProtocol(): void {
    const host = this.$('#ml-int-protocol');
    if (!host || !this.session) return;
    const rows = this.session.history
      .map((c, i) => {
        const d = c.diagnosis;
        const driftMark = c.drift
          ? ` <span class="ml-int-drift-${c.drift.severity}" title="Drift: ${esc(driftDe(c.drift.interpretation))}">⚠</span>`
          : '';
        return `<tr>
          <td>${i + 1}</td>
          <td title="${esc(c.path)}">${esc(basename(c.path))}</td>
          <td>${c.trueClass === 'abnormal' ? 'schlecht' : c.trueClass === 'normal' ? 'gut' : '?'}</td>
          <td>${d.healthScore.toFixed(1).replace('.', ',')} %</td>
          <td class="ml-int-${d.status}-text">${esc(statusDe(d.status))}${driftMark}</td>
          <td title="${esc(c.winnerPath)}">${esc(c.winnerLabel)}</td>
        </tr>`;
      })
      .join('');
    host.innerHTML = `
      <h4>Protokoll</h4>
      <table class="ml-table">
        <thead><tr><th>#</th><th>Datei</th><th>wahr</th><th>Score</th><th>Status</th><th>erkannt</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    const exportBtn = this.$('#ml-int-export') as HTMLButtonElement | null;
    if (exportBtn) exportBtn.disabled = false;
  }

  /** Download the session protocol as JSON. */
  private interactiveExport(): void {
    if (!this.session) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const blob = new Blob([this.session.toJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zanobot-messlabor-interaktiv-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Reset the whole session (training + Verlauf). */
  private async interactiveReset(): Promise<void> {
    if (this.busy) return;
    await this.session?.dispose();
    this.session = null;
    this.historyChart?.destroy();
    this.historyChart = null;
    for (const sel of ['#ml-int-trained', '#ml-int-protocol']) {
      const el = this.$(sel);
      if (el) el.innerHTML = '';
    }
    for (const sel of ['#ml-int-resultcard', '#ml-int-iris-row', '#ml-int-history-wrap']) {
      const el = this.$(sel) as HTMLElement | null;
      if (el) el.style.display = 'none';
    }
    const exportBtn = this.$('#ml-int-export') as HTMLButtonElement | null;
    if (exportBtn) exportBtn.disabled = true;
    this.refreshTestSelect();
    this.setStatus('Session zurückgesetzt.');
  }

  // ── Template & styles ───────────────────────────────────────────────────────

  private template(): string {
    const engineChecks = ALL_ENGINES.map(
      (id) =>
        `<label class="ml-check"><input type="checkbox" id="ml-eng-${id}" checked /> ${esc(ENGINE_LABEL[id])}</label>`
    ).join('');
    return `
      <div class="ml-panel">
        <div class="ml-head">
          <h2>🔬 Mess-Labor — Engine-Benchmark <span class="ml-badge">Desktop · Experte</span></h2>
          <button id="ml-close" class="ml-x" aria-label="Schließen">✕</button>
        </div>
        <p class="ml-intro">
          Ordner mit echten Maschinengeräuschen (MIMII-Struktur <code>&lt;maschine&gt;/&lt;id&gt;/normal|abnormal</code>)
          auswählen und messen. Strikt lesend — es wird nichts gespeichert.
        </p>

        <div class="ml-modes">
          <button class="ml-mode-btn ml-mode-active" id="ml-mode-auc" type="button">AUC-Benchmark (one-class)</button>
          <button class="ml-mode-btn" id="ml-mode-classify" type="button">Gut/Schlecht-Klassifikation</button>
          <button class="ml-mode-btn" id="ml-mode-noise" type="button">Lärm-Robustheit (A/B)</button>
          <button class="ml-mode-btn" id="ml-mode-interactive" type="button">Interaktiv (Handy-Simulation)</button>
        </div>

        <div class="ml-controls">
          <button id="ml-pick" class="ml-btn">📂 Ordner wählen…</button>
          <input id="ml-fallback-input" type="file" webkitdirectory directory multiple style="display:none" />
          <div class="ml-options">
            <span id="ml-opts-engines" class="ml-opt-group">${engineChecks}</span>
            <span id="ml-opts-interactive" class="ml-opt-group" style="display:none">
              <label class="ml-opt">Engine
                <select id="ml-int-engine"><option value="gmia" selected>GMIA</option><option value="spectral-cosine">Spektral-Cosine</option><option value="yamnet">YAMNet</option></select>
              </label>
              <span class="ml-opt ml-hint">nutzt deine Schwellen aus den Einstellungen — wie am Handy</span>
            </span>
            <span id="ml-opts-auc" class="ml-opt-group">
              <label class="ml-opt">Aggregation
                <select id="ml-agg"><option value="mean" selected>Mittel</option><option value="p90">schlechtestes Zehntel (p90)</option></select>
              </label>
              <label class="ml-opt">Split
                <select id="ml-split"><option value="interleaved" selected>interleaved (drift-robust)</option><option value="sequential">sequenziell</option><option value="seeded-random">seeded-random</option></select>
              </label>
              <label class="ml-opt">Max. Dateien/Bereich
                <input id="ml-maxfiles" type="number" min="0" step="10" value="0" title="0 = alle" />
              </label>
            </span>
            <span id="ml-opts-noise" class="ml-opt-group" style="display:none">
              <button id="ml-noise-pick" class="ml-btn" type="button">🎚️ Lärm-WAV wählen…</button>
              <input id="ml-noise-file" type="file" accept=".wav,audio/wav,audio/x-wav,audio/wave" style="display:none" />
              <span id="ml-noise-name" class="ml-opt ml-hint">keine Lärmdatei</span>
              <label class="ml-opt">Engine
                <select id="ml-noise-engine"><option value="spectral-cosine" selected>Spektral-Cosine</option><option value="gmia">GMIA</option><option value="temporal">Zeitmuster (Tier 2)</option></select>
              </label>
              <label class="ml-opt">SNR-Stufen (dB)
                <input id="ml-noise-snrs" type="text" value="15, 10, 5, 0, -5, -10" size="18" />
              </label>
              <label class="ml-opt">Max. Dateien/Bereich
                <input id="ml-noise-maxfiles" type="number" min="0" step="5" value="10" title="0 = alle" />
              </label>
              <span class="ml-opt ml-hint">Profil = 1. Hälfte der Lärm-WAV, gemischt wird die 2. Hälfte</span>
            </span>
            <span id="ml-opts-classify" class="ml-opt-group" style="display:none">
              <label class="ml-opt">Gut-Fingerprints
                <input id="ml-ngood" type="number" min="1" step="1" value="10" />
              </label>
              <label class="ml-opt">Schlecht-Fingerprints
                <input id="ml-nbad" type="number" min="1" step="1" value="10" />
              </label>
              <label class="ml-opt">Test/Klasse
                <input id="ml-maxtest" type="number" min="1" step="1" value="20" />
              </label>
              <label class="ml-opt">Durchläufe
                <input id="ml-runs" type="number" min="1" step="1" value="5" />
              </label>
              <span class="ml-opt ml-hint">nutzt deine Konfidenzschwelle aus den Einstellungen</span>
            </span>
          </div>
          <button id="ml-run" class="ml-btn ml-primary" disabled>▶ Messen</button>
          <button id="ml-cancel" class="ml-btn ml-danger" style="display:none">⨯ Abbrechen</button>
        </div>

        <div id="ml-summary" class="ml-summary"></div>

        <div id="ml-interactive" class="ml-interactive" style="display:none">
          <p id="ml-int-pipeline" class="ml-int-pipeline"></p>
          <div class="ml-int-setup">
            <label class="ml-opt">Bereich
              <select id="ml-int-section" disabled></select>
            </label>
            <div class="ml-int-lists">
              <div class="ml-int-listcol">
                <h4>Gut-Dateien (normal/)</h4>
                <p class="ml-hint">erste angehakte Datei = Referenz (Baseline)</p>
                <div id="ml-int-good-list" class="ml-int-filelist"></div>
              </div>
              <div class="ml-int-listcol">
                <h4>Schlecht-Dateien (abnormal/)</h4>
                <p class="ml-hint">optional — als bekannte Fehler-Fingerprints</p>
                <div id="ml-int-bad-list" class="ml-int-filelist"></div>
              </div>
            </div>
            <div class="ml-int-actions">
              <button id="ml-int-train" class="ml-btn ml-primary">🧠 Auswahl anlernen</button>
              <button id="ml-int-reset" class="ml-btn">↺ Session zurücksetzen</button>
            </div>
            <div id="ml-int-trained" class="ml-int-chips"></div>
          </div>

          <div class="ml-int-checkrow">
            <label class="ml-opt">Prüf-Datei
              <select id="ml-int-test-file" disabled></select>
            </label>
            <button id="ml-int-check" class="ml-btn ml-primary" disabled>▶ Prüfen</button>
          </div>

          <div id="ml-int-resultcard" class="ml-int-card" style="display:none"></div>

          <div id="ml-int-iris-row" class="ml-int-iris-row" style="display:none">
            <figure>
              <canvas id="ml-int-iris-ref" class="ml-int-iris"></canvas>
              <figcaption>Referenz</figcaption>
            </figure>
            <figure>
              <canvas id="ml-int-iris-test" class="ml-int-iris"></canvas>
              <figcaption id="ml-int-iris-test-caption">Prüfung</figcaption>
            </figure>
          </div>

          <div id="ml-int-history-wrap" style="display:none">
            <h4>Verlauf (Session)</h4>
            <canvas id="ml-int-history" class="ml-int-history"></canvas>
          </div>

          <div id="ml-int-protocol"></div>
          <div class="ml-int-actions">
            <button id="ml-int-export" class="ml-btn" disabled>⬇ Protokoll (JSON)</button>
          </div>
        </div>

        <div id="ml-progress" class="ml-progress" style="display:none">
          <div class="ml-bar-track"><div id="ml-bar" class="ml-bar"></div></div>
        </div>
        <p id="ml-status" class="ml-status"></p>

        <div id="ml-result" class="ml-result"></div>
        <div id="ml-exports" class="ml-exports" style="display:none">
          <button id="ml-csv" class="ml-btn">⬇ CSV</button>
          <button id="ml-json" class="ml-btn">⬇ JSON</button>
        </div>
      </div>`;
  }

  private injectStyles(): void {
    if (document.getElementById('mess-labor-styles')) return;
    const style = document.createElement('style');
    style.id = 'mess-labor-styles';
    style.textContent = `
      .mess-labor-overlay{position:fixed;inset:0;z-index:10000;background:rgba(8,16,28,.92);
        display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px;
        font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e7eef7}
      .ml-panel{background:#0f1f33;border:1px solid #24405f;border-radius:12px;max-width:1000px;width:100%;
        padding:20px 24px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
      .ml-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .ml-head h2{font-size:1.15rem;margin:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .ml-badge{font-size:.65rem;background:#24405f;padding:3px 8px;border-radius:20px;letter-spacing:.04em;text-transform:uppercase}
      .ml-x{background:none;border:none;color:#9fb6d1;font-size:1.2rem;cursor:pointer;padding:4px 8px;border-radius:6px}
      .ml-x:hover{background:#1c3450;color:#fff}
      .ml-intro{font-size:.85rem;color:#9fb6d1;line-height:1.5;margin:8px 0 16px}
      .ml-intro code,.ml-summary code{background:#1c3450;padding:1px 5px;border-radius:4px;font-size:.8em}
      .ml-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px}
      .ml-options{display:flex;flex-wrap:wrap;gap:14px;align-items:center;flex:1;min-width:260px}
      .ml-opt-group{display:flex;gap:12px;flex-wrap:wrap}
      .ml-check,.ml-opt{font-size:.82rem;color:#cfe0f2;display:flex;align-items:center;gap:6px}
      .ml-opt select,.ml-opt input{background:#0a1929;color:#e7eef7;border:1px solid #2a486b;border-radius:6px;padding:4px 6px;font-size:.82rem}
      .ml-opt input[type=number]{width:74px}
      .ml-btn{background:#1c3450;color:#e7eef7;border:1px solid #2a486b;border-radius:8px;padding:8px 14px;
        font-size:.85rem;cursor:pointer;transition:background .15s}
      .ml-btn:hover:not(:disabled){background:#24405f}
      .ml-btn:disabled{opacity:.45;cursor:not-allowed}
      .ml-primary{background:#1f6feb;border-color:#1f6feb;color:#fff}
      .ml-primary:hover:not(:disabled){background:#2f7ffb}
      .ml-danger{background:#5a1f2a;border-color:#7a2a38}
      .ml-summary{font-size:.85rem;color:#9fb6d1;margin-bottom:8px}
      .ml-table{width:100%;border-collapse:collapse;margin:8px 0;font-size:.82rem}
      .ml-table th,.ml-table td{border:1px solid #24405f;padding:6px 10px;text-align:center}
      .ml-table th{background:#16293f;color:#bcd2ec;font-weight:600}
      .ml-result-table td:first-child,.ml-result-table th:first-child{text-align:left}
      .ml-mean td{background:#16293f}
      .ml-split{color:#8ba6c4;font-size:.75rem}
      .ml-err{color:#ff9a9a}
      .ml-progress{margin:10px 0}
      .ml-bar-track{height:8px;background:#16293f;border-radius:6px;overflow:hidden}
      .ml-bar{height:100%;width:0;background:#1f6feb;transition:width .2s}
      .ml-status{font-size:.82rem;color:#9fb6d1;min-height:1.2em;margin:6px 0}
      .ml-status.ml-warn,.ml-warn{color:#ffb454}
      .ml-result h3{font-size:1rem;margin:16px 0 6px}
      .ml-agg-note,.ml-note{font-size:.75rem;color:#8ba6c4;font-weight:400}
      .ml-note{margin-top:6px}
      .ml-exports{display:flex;gap:10px;margin-top:10px}
      .ml-modes{display:flex;gap:8px;margin:0 0 14px}
      .ml-mode-btn{background:#16293f;color:#9fb6d1;border:1px solid #24405f;border-radius:8px;
        padding:7px 14px;font-size:.82rem;cursor:pointer}
      .ml-mode-btn:hover{background:#1c3450}
      .ml-mode-active{background:#1f6feb;border-color:#1f6feb;color:#fff}
      .ml-hint{color:#8ba6c4;font-size:.75rem;font-style:italic}
      .ml-confusion{margin-top:12px}
      .ml-confusion h4{font-size:.9rem;margin:8px 0 4px}
      .ml-confusion table{max-width:520px}
      .ml-ok{color:#7ee2a8}
      .ml-bad{color:#ff9a9a}
      .ml-interactive h4{font-size:.9rem;margin:10px 0 4px}
      .ml-int-lists{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px}
      .ml-int-listcol{flex:1;min-width:260px}
      .ml-int-filelist{max-height:180px;overflow:auto;border:1px solid #24405f;border-radius:8px;
        padding:6px 8px;background:#0a1929;display:flex;flex-direction:column;gap:2px}
      .ml-int-file{font-size:.8rem;color:#cfe0f2;display:flex;gap:6px;align-items:center;cursor:pointer}
      .ml-int-file:hover{color:#fff}
      .ml-int-actions{display:flex;gap:10px;margin:10px 0}
      .ml-int-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
      .ml-chip{font-size:.75rem;padding:3px 9px;border-radius:20px;border:1px solid #2a486b;background:#16293f}
      .ml-chip-good{border-color:#2e9e5b;color:#7ee2a8}
      .ml-chip-bad{border-color:#a94452;color:#ff9a9a}
      .ml-int-checkrow{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:14px 0 8px;
        padding-top:12px;border-top:1px solid #24405f}
      .ml-int-checkrow select{min-width:260px;max-width:420px}
      .ml-int-card{border:1px solid #24405f;border-radius:10px;padding:12px 16px;margin:10px 0;background:#0a1929}
      .ml-int-card.ml-int-healthy{border-color:#2e9e5b}
      .ml-int-card.ml-int-uncertain{border-color:#e9a23b}
      .ml-int-card.ml-int-faulty{border-color:#d9455f}
      .ml-int-score{font-size:1.9rem;font-weight:700}
      .ml-int-healthy .ml-int-score{color:#7ee2a8}
      .ml-int-uncertain .ml-int-score{color:#ffcf7d}
      .ml-int-faulty .ml-int-score{color:#ff9a9a}
      .ml-int-status{font-size:.95rem;margin:2px 0 6px}
      .ml-int-meta{font-size:.78rem;color:#9fb6d1;line-height:1.5}
      .ml-int-healthy-text{color:#7ee2a8}
      .ml-int-uncertain-text{color:#ffcf7d}
      .ml-int-faulty-text{color:#ff9a9a}
      .ml-int-iris-row{display:flex;gap:22px;margin:12px 0;flex-wrap:wrap}
      .ml-int-iris-row figure{margin:0;text-align:center}
      .ml-int-iris-row figcaption{font-size:.75rem;color:#8ba6c4;margin-top:4px;max-width:180px;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ml-int-iris{width:170px;height:170px}
      .ml-int-history{width:100%;height:260px;background:#0a1929;border:1px solid #24405f;border-radius:8px}
      .ml-int-pipeline{font-size:.78rem;color:#8ba6c4;background:#16293f;border:1px solid #24405f;
        border-radius:8px;padding:6px 10px;margin:0 0 12px}
      .ml-int-fault{font-size:.85rem;color:#ff9a9a;margin:2px 0}
      .ml-int-drift{font-size:.8rem;margin:2px 0}
      .ml-int-drift-warning{color:#ffcf7d}
      .ml-int-drift-critical{color:#ff9a9a}
      .ml-int-pipenote{font-size:.72rem;color:#8ba6c4;margin-top:6px;font-style:italic}
    `;
    document.head.appendChild(style);
  }
}

/** File name without its folders (for compact display; full path in title). */
function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/** German status wording, mirroring the phone's verdict colors. */
function statusDe(status: 'healthy' | 'uncertain' | 'faulty'): string {
  return status === 'healthy' ? 'gesund' : status === 'faulty' ? 'fehlerhaft' : 'unsicher';
}

/** German wording for the drift detector's interpretation values. */
function driftDe(interpretation: string): string {
  switch (interpretation) {
    case 'room_change':
      return 'Raum-/Umgebungsänderung';
    case 'machine_change':
      return 'Maschinenänderung';
    case 'both':
      return 'Raum- und Maschinenänderung';
    case 'all_ok':
      return 'unauffällig';
    default:
      return 'unklar';
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

function fmtAuc(v: number): string {
  return Number.isFinite(v) ? v.toFixed(3).replace('.', ',') : '—';
}

function pctCell(v: number): string {
  return Number.isFinite(v) ? `${(v * 100).toFixed(1).replace('.', ',')} %` : '—';
}
