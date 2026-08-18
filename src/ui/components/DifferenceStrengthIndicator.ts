/** Kompakte, wiederverwendbare Einordnung der akustischen Differenzstärke. */

import type { DifferenceMetrics } from '@core/audio/differenceIsolation.js';
import {
  classifyDifferenceStrength,
  type DifferenceStrengthLevel,
} from '@core/audio/differenceStrength.js';
import { getLanguage, t } from '../../i18n/index.js';

function format(value: number, digits = 1): string {
  return new Intl.NumberFormat(getLanguage(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function levelText(level: DifferenceStrengthLevel): string {
  if (level === 'within') return t('hoerlupe.staerkeInnerhalb');
  if (level === 'slight') return t('hoerlupe.staerkeLeicht');
  if (level === 'clear') return t('hoerlupe.staerkeDeutlich');
  return t('hoerlupe.staerkeStark');
}

export class DifferenceStrengthIndicator {
  public readonly element: HTMLElement;
  private readonly result: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly detail: HTMLElement;

  constructor() {
    const root = document.createElement('section');
    root.className = 'differenz-staerke';
    root.hidden = true;
    root.setAttribute('aria-live', 'polite');
    this.element = root;

    const title = document.createElement('p');
    title.className = 'differenz-staerke-titel';
    title.textContent = t('hoerlupe.staerkeTitel');

    this.result = document.createElement('p');
    this.result.className = 'differenz-staerke-ergebnis';

    const meter = document.createElement('div');
    meter.className = 'differenz-staerke-meter';
    meter.setAttribute('aria-hidden', 'true');
    this.fill = document.createElement('span');
    meter.appendChild(this.fill);

    this.detail = document.createElement('p');
    this.detail.className = 'differenz-staerke-detail muted small';

    const note = document.createElement('p');
    note.className = 'differenz-staerke-hinweis muted small';
    note.textContent = t('hoerlupe.staerkeHinweis');

    root.append(title, this.result, meter, this.detail, note);
  }

  public update(metrics: DifferenceMetrics): void {
    const strength = classifyDifferenceStrength(metrics);
    this.element.hidden = false;
    this.element.dataset.strengthLevel = strength.level;
    this.element.classList.toggle('differenz-staerke-within', strength.level === 'within');
    this.element.classList.toggle('differenz-staerke-slight', strength.level === 'slight');
    this.element.classList.toggle('differenz-staerke-clear', strength.level === 'clear');
    this.element.classList.toggle('differenz-staerke-strong', strength.level === 'strong');
    this.element.dataset.relativeAmplitude = metrics.relativeAmplitude.toFixed(8);
    this.element.dataset.relativeDb = Number.isFinite(metrics.relativeDb)
      ? metrics.relativeDb.toFixed(2)
      : '-Infinity';
    this.result.textContent = levelText(strength.level);
    this.fill.style.width = `${strength.meterPercent.toFixed(1)}%`;
    this.detail.textContent =
      strength.variationMultiple === null
        ? t('hoerlupe.staerkeAnteil', { prozent: format(strength.percent) })
        : t('hoerlupe.staerkeVergleich', {
            prozent: format(strength.percent),
            faktor: format(strength.variationMultiple),
          });
  }
}
