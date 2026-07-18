/**
 * ZANOBOT — EREIGNIS-ZEITLEISTE (Expert Mode, nur Temporal-Engine)
 *
 * Das zeitliche Pendant zu den "schlechten Merkmalen" (Frequenz-Pendant):
 * zeigt die von der Temporal-Engine (Tier 2, T2-a2) erkannten Transienten
 * der letzten 30 Sekunden als Marker — grau = bekanntes Ereignis (matcht
 * die Ereignis-Bank der Referenz, z. B. der normale Ventil-Klack), rot =
 * anomales Ereignis. Darunter die Ereignisdichte (beobachtet vs. Referenz)
 * und ggf. der Dichte-Befund (fehlender Takt / deutlich mehr Ereignisse).
 *
 * Rein präsentierend — alle Erkennung passiert in der TemporalEngine; die
 * Daten kommen als `temporalEvents`-Metadata der Diagnose.
 */

import type {
  TemporalEventsMetadata,
  TemporalCycleMetadata,
} from '@core/ml/engine/TemporalEngine.js';
import { t } from '../../i18n/index.js';

/** Zeitspanne der Zeitleiste (Millisekunden). */
const TIMELINE_SPAN_MS = 30000;

export class EventTimeline {
  private containerEl: HTMLElement | null = null;
  private trackEl: HTMLElement | null = null;
  private rateEl: HTMLElement | null = null;
  private cycleEl: HTMLElement | null = null;
  private findingEl: HTMLElement | null = null;
  private emptyEl: HTMLElement | null = null;
  private parentId: string;
  private isDestroyed = false;

  constructor(parentId: string) {
    this.parentId = parentId;
  }

  /** DOM erzeugen und an den Parent hängen (einmalig, Parent muss im DOM sein). */
  public mount(): void {
    const parent = document.getElementById(this.parentId);
    if (!parent || this.isDestroyed || this.containerEl) return;

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'event-timeline';
    this.containerEl.id = 'event-timeline';
    this.containerEl.innerHTML = `
      <div class="event-timeline-header">
        <span>${t('temporalEvents.title')}</span>
        <span class="event-timeline-legend">
          <span class="event-timeline-dot event-timeline-dot--known"></span>${t('temporalEvents.legendKnown')}
          <span class="event-timeline-dot event-timeline-dot--anomalous"></span>${t('temporalEvents.legendAnomalous')}
        </span>
      </div>
      <div class="event-timeline-track" id="event-timeline-track">
        <span class="event-timeline-empty" id="event-timeline-empty">${t('temporalEvents.noEvents')}</span>
      </div>
      <div class="event-timeline-rate" id="event-timeline-rate"></div>
      <div class="event-timeline-rate" id="event-timeline-cycle" style="display: none;"></div>
      <div class="event-timeline-finding" id="event-timeline-finding" style="display: none;"></div>
    `;
    parent.appendChild(this.containerEl);

    this.trackEl = this.containerEl.querySelector('#event-timeline-track');
    this.rateEl = this.containerEl.querySelector('#event-timeline-rate');
    this.cycleEl = this.containerEl.querySelector('#event-timeline-cycle');
    this.findingEl = this.containerEl.querySelector('#event-timeline-finding');
    this.emptyEl = this.containerEl.querySelector('#event-timeline-empty');
  }

  /** Zyklus-Zeile (T4) aktualisieren; null blendet sie aus. */
  public updateCycle(data: TemporalCycleMetadata | null): void {
    if (this.isDestroyed || !this.cycleEl) return;
    if (!data) {
      this.cycleEl.style.display = 'none';
      return;
    }
    const status =
      data.dtwZ === null
        ? t('temporalEvents.cyclePending')
        : data.anomaly > 0
          ? t('temporalEvents.cycleDeviant')
          : t('temporalEvents.cycleOk');
    this.cycleEl.textContent = t('temporalEvents.cycleLine', {
      period: data.periodSec.toFixed(1),
      status,
    });
    this.cycleEl.style.display = 'block';
  }

  /** Zeitleiste mit frischen Ereignis-Metadata der Diagnose aktualisieren. */
  public update(data: TemporalEventsMetadata): void {
    if (this.isDestroyed || !this.containerEl) return;
    const now = Date.now();

    if (this.trackEl) {
      const markers = data.events
        .filter((ev) => now - ev.at <= TIMELINE_SPAN_MS)
        .map((ev) => {
          const agePct = ((now - ev.at) / TIMELINE_SPAN_MS) * 100;
          const cls = ev.known ? 'event-timeline-dot--known' : 'event-timeline-dot--anomalous';
          return `<span class="event-timeline-marker ${cls}" style="right: ${agePct.toFixed(1)}%" title="cos ${ev.similarity.toFixed(2)}"></span>`;
        });
      if (markers.length > 0) {
        this.trackEl.innerHTML = markers.join('');
        this.emptyEl = null;
      } else if (!this.emptyEl) {
        this.trackEl.innerHTML = `<span class="event-timeline-empty" id="event-timeline-empty">${t('temporalEvents.noEvents')}</span>`;
        this.emptyEl = this.trackEl.querySelector('#event-timeline-empty');
      }
    }

    if (this.rateEl) {
      const observed =
        data.observedRatePerMin === null ? '–' : data.observedRatePerMin.toFixed(0);
      this.rateEl.textContent = t('temporalEvents.rateLine', {
        observed,
        expected: data.expectedRatePerMin.toFixed(0),
      });
    }

    if (this.findingEl) {
      if (data.densityFinding === 'missing') {
        this.findingEl.textContent = t('temporalEvents.densityMissing');
        this.findingEl.style.display = 'block';
      } else if (data.densityFinding === 'excess') {
        this.findingEl.textContent = t('temporalEvents.densityExcess');
        this.findingEl.style.display = 'block';
      } else {
        this.findingEl.style.display = 'none';
      }
    }
  }

  /** Aus dem DOM entfernen und Referenzen freigeben. */
  public destroy(): void {
    this.isDestroyed = true;
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
    this.trackEl = null;
    this.rateEl = null;
    this.findingEl = null;
    this.emptyEl = null;
  }
}
