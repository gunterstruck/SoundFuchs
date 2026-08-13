/**
 * ZANOBOT - FLEET RANKING RENDERER
 *
 * Renders the Identify phase's fleet-mode machine ranking: resolves the active
 * fleet (largest fleet group, or a 24h time-fallback), ranks members worst-score
 * first, computes robust fleet statistics, and builds the header, the per-machine
 * ranking bars, and the "check whole fleet" button. Extracted from 1-Identify.ts.
 *
 * Holds the transient Gold-Standard id (derived per render, only used for the
 * ranking badge) but no other phase state. Phase-side behaviour (machine
 * selection, fleet export, the quick-fleet-save CTA, and starting the fleet
 * check queue) is injected via the deps interface.
 */

import { getLatestDiagnosis } from '@data/db.js';
import { t } from '../../i18n/index.js';
import { escapeHtml } from '@utils/sanitize.js';
import { InfoBottomSheet } from '../components/InfoBottomSheet.js';
import { calculateFleetStats, type FleetStats } from './fleetStats.js';
import type { Machine } from '@data/types.js';

/** Phase-side behaviour the fleet ranking renderer needs. */
export interface FleetRankingDeps {
  /** Open a machine (ranking item click). */
  onMachineSelect: (machine: Machine) => void;
  /** Export the current fleet as JSON (header export button). */
  exportFleet: (groupName: string) => void;
  /** Render the "save as fleet" CTA for an untagged time-fallback group. */
  renderQuickFleetSaveCTA: (container: HTMLElement, machines: Machine[]) => void;
  /** Start a fleet check queue for the given machines (no-op when unset). */
  startFleetQueue: (machineIds: string[], groupName: string) => void;
}

export class FleetRankingRenderer {
  /** Sprint 5: Gold Standard machine id for the current ranking (badge display). */
  private currentGoldStandardId: string | null = null;

  constructor(private readonly deps: FleetRankingDeps) {}

  /**
   * Resolve the fleet to rank: the largest explicit fleet group when one
   * exists, otherwise a time-based fallback of machines checked in the last 24h.
   */
  private async getFleetMachines(allMachines: Machine[]): Promise<{
    machines: Machine[];
    groupName: string;
    isTimeFallback: boolean;
  }> {
    // Collect all unique fleet groups
    const groups = new Map<string, Machine[]>();
    for (const m of allMachines) {
      if (m.fleetGroup) {
        const list = groups.get(m.fleetGroup) || [];
        list.push(m);
        groups.set(m.fleetGroup, list);
      }
    }

    // If groups exist, use the largest one
    if (groups.size > 0) {
      let bestGroup = '';
      let bestSize = 0;
      for (const [name, members] of groups) {
        if (members.length > bestSize) {
          bestGroup = name;
          bestSize = members.length;
        }
      }
      return {
        machines: groups.get(bestGroup) || [],
        groupName: bestGroup,
        isTimeFallback: false,
      };
    }

    // Fallback: machines with diagnosis in last 24h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentChecks = await Promise.all(
      allMachines.map(async (m) => {
        // Fast path: lastDiagnosisAt exists and is recent
        if (m.lastDiagnosisAt && m.lastDiagnosisAt > cutoff) {
          return m;
        }
        // Slow path: field missing – query DB for actual latest diagnosis
        if (!m.lastDiagnosisAt) {
          const latest = await getLatestDiagnosis(m.id);
          if (latest && latest.timestamp > cutoff) {
            return m;
          }
        }
        return null;
      })
    );
    const recentMachines = recentChecks.filter((m): m is Machine => m !== null);

    return {
      machines: recentMachines,
      groupName: t('fleet.group.recent24h'),
      isTimeFallback: true,
    };
  }

  /**
   * Sprint 4 UX: Render fleet ranking view.
   */
  public async render(allMachines: Machine[]): Promise<void> {
    const overviewContainer = document.getElementById('machine-overview');
    const emptyState = document.getElementById('machine-overview-empty');
    if (!overviewContainer) return;

    // Get fleet machines
    const { machines, groupName, isTimeFallback } = await this.getFleetMachines(allMachines);

    // Collect scores (parallel DB reads)
    const ranked = await Promise.all(
      machines.map(async (machine) => {
        const diagnosis = await getLatestDiagnosis(machine.id);
        return {
          machine,
          score: diagnosis ? diagnosis.healthScore : null,
          diagnosis: diagnosis ?? null,
        };
      })
    );

    // Sort: lowest score first (outlier at top), null-scores at bottom
    ranked.sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return a.score - b.score;
    });

    // Calculate statistics (only from machines with scores)
    const scores = ranked.map((r) => r.score).filter((s): s is number => s !== null);
    const stats = calculateFleetStats(scores);

    // Fix: Minimum fleet size check – at least 2 machines for meaningful ranking
    if (ranked.length < 2) {
      if (emptyState) {
        emptyState.style.display = ranked.length === 0 ? 'block' : 'none';
      }
      const hint = document.createElement('div');
      hint.className = 'fleet-minimum-hint';
      hint.innerHTML = `<p>${t('fleet.ranking.minimumHint')}</p>`;
      if (emptyState) {
        overviewContainer.insertBefore(hint, emptyState);
      } else {
        overviewContainer.appendChild(hint);
      }
      // Still show the single machine as a regular item (without ranking context)
      if (ranked.length === 1) {
        const item = this.createFleetRankingItem(ranked[0].machine, ranked[0].score, null, false);
        if (emptyState) {
          overviewContainer.insertBefore(item, emptyState);
        } else {
          overviewContainer.appendChild(item);
        }
      }
      return;
    }

    // Sprint 5: Pre-compute Gold Standard for badge display
    this.currentGoldStandardId = null;
    const refSourceIds = machines.map((m) => m.fleetReferenceSourceId).filter(Boolean);
    if (refSourceIds.length > 0) {
      const counts = new Map<string, number>();
      for (const id of refSourceIds) {
        if (id) counts.set(id, (counts.get(id) || 0) + 1);
      }
      let maxCount = 0;
      for (const [id, count] of counts) {
        if (count > maxCount) {
          this.currentGoldStandardId = id;
          maxCount = count;
        }
      }
    }

    // Show/hide empty state
    if (emptyState) {
      emptyState.style.display = ranked.length === 0 ? 'block' : 'none';
    }

    // Update empty state text for fleet mode
    if (ranked.length === 0 && emptyState) {
      const titleEl = emptyState.querySelector('.empty-state-title');
      if (titleEl) {
        titleEl.textContent = t('fleet.group.noMachines');
      }
    }

    // Render fleet header (Maßnahme 4)
    if (stats && ranked.length >= 2) {
      this.renderFleetHeader(overviewContainer, stats, groupName, ranked.length);
    }

    // Sprint 5 Polish: Show hint when only 1 machine in fleet (no meaningful comparison)
    if (ranked.length === 1) {
      const hint = document.createElement('p');
      hint.className = 'fleet-single-machine-hint';
      hint.textContent = t('fleetSelect.singleMachineHint');
      if (emptyState) {
        overviewContainer.insertBefore(hint, emptyState);
      } else {
        overviewContainer.appendChild(hint);
      }
    }

    // Render ranking items
    for (const item of ranked) {
      const isOutlier =
        stats !== null && item.score !== null ? item.score < stats.outlierThreshold : false;
      const rankItem = this.createFleetRankingItem(item.machine, item.score, stats, isOutlier);
      if (emptyState) {
        overviewContainer.insertBefore(rankItem, emptyState);
      } else {
        overviewContainer.appendChild(rankItem);
      }
    }

    // Sprint 4 UX: Quick Fleet – show "Save as fleet" CTA
    if (isTimeFallback && ranked.length >= 2) {
      const untagged = ranked.filter((r) => !r.machine.fleetGroup);
      if (untagged.length >= 2) {
        this.deps.renderQuickFleetSaveCTA(
          overviewContainer,
          untagged.map((r) => r.machine)
        );
      }
    }

    // Sprint 5 UX: "Flotte prüfen" button (only if machines have references)
    const machinesWithRef = ranked.filter(
      (r) => r.machine.referenceModels && r.machine.referenceModels.length > 0
    );
    if (machinesWithRef.length >= 2) {
      const checkAllBtn = document.createElement('button');
      checkAllBtn.className = 'action-btn fleet-check-all-btn';
      checkAllBtn.textContent = t('fleet.queue.startButton', {
        count: String(machinesWithRef.length),
      });
      checkAllBtn.addEventListener('click', () => {
        const ids = machinesWithRef.map((r) => r.machine.id);
        this.deps.startFleetQueue(ids, groupName);
      });
      if (emptyState) {
        overviewContainer.insertBefore(checkAllBtn, emptyState);
      } else {
        overviewContainer.appendChild(checkAllBtn);
      }
    }
  }

  /**
   * Sprint 4 UX: Create a single fleet ranking item.
   */
  private createFleetRankingItem(
    machine: Machine,
    score: number | null,
    stats: FleetStats | null,
    isOutlier: boolean
  ): HTMLElement {
    const item = document.createElement('div');
    item.className = `fleet-rank-item${isOutlier ? ' fleet-outlier' : ''}`;
    item.dataset.machineId = machine.id;

    // Machine name
    const nameEl = document.createElement('div');
    nameEl.className = 'fleet-rank-name';
    nameEl.textContent = machine.name;

    // Sprint 5: Gold Standard indicator
    if (this.currentGoldStandardId === machine.id) {
      const goldBadge = document.createElement('span');
      goldBadge.className = 'fleet-gold-badge';
      goldBadge.textContent = '\u{1F3C6}';
      goldBadge.title = t('fleet.goldStandard.badge');
      nameEl.appendChild(goldBadge);
    }

    // Score bar container
    const barContainer = document.createElement('div');
    barContainer.className = 'fleet-rank-bar-container';

    if (score !== null && stats) {
      // Score bar (width proportional to score, 0–100%)
      const bar = document.createElement('div');
      bar.className = `fleet-rank-bar${isOutlier ? ' fleet-rank-bar-outlier' : ''}`;
      bar.style.width = `${Math.max(score, 2)}%`; // Min 2% for visibility

      barContainer.appendChild(bar);

      // Score label
      const scoreLabel = document.createElement('span');
      scoreLabel.className = `fleet-rank-score${isOutlier ? ' fleet-rank-score-outlier' : ''}`;
      scoreLabel.textContent = isOutlier ? `⚠ ${score.toFixed(0)}%` : `${score.toFixed(0)}%`;

      barContainer.appendChild(scoreLabel);
    } else {
      // No diagnosis
      const noData = document.createElement('span');
      noData.className = 'fleet-rank-nodata';
      noData.textContent = t('fleet.ranking.noData');
      barContainer.appendChild(noData);
    }

    item.appendChild(nameEl);
    item.appendChild(barContainer);

    // Click handler: select machine (same as series mode)
    item.addEventListener('click', () => {
      this.deps.onMachineSelect(machine);
    });

    return item;
  }

  /**
   * Sprint 4 UX: Render fleet statistics header.
   */
  private renderFleetHeader(
    container: HTMLElement,
    stats: FleetStats,
    groupName: string,
    machineCount: number
  ): void {
    // Remove existing header if re-rendering
    const existing = container.querySelector('.fleet-header');
    if (existing) existing.remove();

    const header = document.createElement('div');
    header.className = 'fleet-header';

    // Group name + count
    const titleEl = document.createElement('div');
    titleEl.className = 'fleet-header-title';
    titleEl.textContent = `${groupName} (${machineCount})`;

    // Sprint 5 UX: Help icon in fleet header
    const helpBtn = document.createElement('button');
    helpBtn.className = 'help-icon-btn help-icon-inline';
    helpBtn.setAttribute('aria-label', t('help.fleetRanking.title'));
    helpBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`;
    helpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.fleetRanking.title'),
        content: t('help.fleetRanking.body'),
        icon: 'ℹ️',
      });
    });

    // Fleet export button (for NFC/QR provisioning)
    const exportBtn = document.createElement('button');
    exportBtn.className = 'help-icon-btn help-icon-inline';
    exportBtn.setAttribute('aria-label', t('fleet.export.button'));
    exportBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>`;
    exportBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.deps.exportFleet(groupName);
    });

    const titleRow = document.createElement('div');
    titleRow.className = 'fleet-header-title-row';
    titleRow.appendChild(titleEl);
    titleRow.appendChild(exportBtn);
    titleRow.appendChild(helpBtn);

    // Stats row
    const statsRow = document.createElement('div');
    statsRow.className = 'fleet-header-stats';

    const medianStat = document.createElement('span');
    medianStat.className = 'fleet-stat';
    medianStat.innerHTML = `<span class="fleet-stat-label">${escapeHtml(t('fleet.stats.median'))}</span><span class="fleet-stat-value">${stats.median.toFixed(0)}%</span>`;

    const worstStat = document.createElement('span');
    worstStat.className = 'fleet-stat';
    worstStat.innerHTML = `<span class="fleet-stat-label">${escapeHtml(t('fleet.stats.worst'))}</span><span class="fleet-stat-value fleet-stat-worst">${stats.min.toFixed(0)}%</span>`;

    const spreadStat = document.createElement('span');
    spreadStat.className = 'fleet-stat';
    spreadStat.innerHTML = `<span class="fleet-stat-label">${escapeHtml(t('fleet.stats.spread'))}</span><span class="fleet-stat-value">${stats.spread.toFixed(0)}%</span>`;

    statsRow.appendChild(medianStat);
    statsRow.appendChild(worstStat);
    statsRow.appendChild(spreadStat);

    header.appendChild(titleRow);
    header.appendChild(statsRow);

    // Insert at top of container
    container.insertBefore(header, container.firstChild);
  }
}
