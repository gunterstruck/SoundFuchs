/** Dialog für den lokalen Übergang von SoundFuchs zu einer beliebigen KI. */

import {
  buildAnalysisPackage,
  createAnalysisPrompt,
  type AnalysisCaseMode,
  type AnalysisRecordingSituation,
  type RecordingSituationKind,
} from '@core/audio/analysisPackage.js';
import type { SpectralSelection } from '@core/audio/spectralSelection.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';

export interface AnalysisPackageDialogOptions {
  reference?: AudioBuffer | null;
  measurement: AudioBuffer;
  machineName: string;
  getSelection: () => SpectralSelection | null;
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<{ 0?: { transcript?: string } }>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const situationKinds: RecordingSituationKind[] = [
  'vehicle-engine-bay',
  'household-indoor',
  'building-services',
  'tool-or-garden',
  'other',
];

const situationLabels: Record<RecordingSituationKind, string> = {
  'vehicle-engine-bay': 'analysisPackage.situationVehicle',
  'household-indoor': 'analysisPackage.situationHousehold',
  'building-services': 'analysisPackage.situationBuilding',
  'tool-or-garden': 'analysisPackage.situationTool',
  other: 'analysisPackage.situationOther',
};

function speechConstructor(): SpeechRecognitionConstructor | null {
  const speechWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

async function copyPrompt(prompt: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(prompt);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = prompt;
    field.readOnly = true;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }
}

export class AnalysisPackageDialog {
  private readonly options: AnalysisPackageDialogOptions;
  private readonly overlay: HTMLDivElement;
  private readonly dialog: HTMLDivElement;
  private readonly description: HTMLTextAreaElement;
  private readonly includeName: HTMLInputElement;
  private readonly consent: HTMLInputElement;
  private readonly createButton: HTMLButtonElement;
  private readonly vehicleDetails: HTMLDivElement;
  private mode: AnalysisCaseMode;
  private kind: RecordingSituationKind = 'vehicle-engine-bay';
  private recognition: SpeechRecognitionLike | null = null;
  private lastFocused: HTMLElement | null;
  private closed = false;

  constructor(options: AnalysisPackageDialogOptions) {
    this.options = options;
    this.mode = options.reference ? 'baseline-comparison' : 'single-recording';
    this.lastFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    this.overlay = document.createElement('div');
    this.overlay.className = 'analysepaket-overlay';
    this.overlay.addEventListener('mousedown', (event) => {
      if (event.target === this.overlay) this.close();
    });

    this.dialog = document.createElement('div');
    this.dialog.className = 'analysepaket-dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'analysepaket-titel');
    this.overlay.appendChild(this.dialog);

    const header = document.createElement('header');
    header.className = 'analysepaket-kopf';
    const heading = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'analysepaket-eyebrow';
    eyebrow.textContent = t('analysisPackage.eyebrow');
    heading.appendChild(eyebrow);
    const title = document.createElement('h2');
    title.id = 'analysepaket-titel';
    title.textContent = t('analysisPackage.title');
    heading.appendChild(title);
    const intro = document.createElement('p');
    intro.className = 'muted';
    intro.textContent = t('analysisPackage.intro');
    heading.appendChild(intro);
    header.appendChild(heading);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'analysepaket-schliessen';
    close.setAttribute('aria-label', t('analysisPackage.close'));
    close.textContent = '×';
    close.onclick = () => this.close();
    header.appendChild(close);
    this.dialog.appendChild(header);

    const body = document.createElement('div');
    body.className = 'analysepaket-inhalt';
    this.dialog.appendChild(body);

    const caseMode = document.createElement('section');
    caseMode.className = options.reference
      ? 'analysepaket-falltyp'
      : 'analysepaket-falltyp analysepaket-ohne-referenz';
    if (options.reference) {
      const caseTitle = document.createElement('h3');
      caseTitle.textContent = t('analysisPackage.caseModeTitle');
      const caseHint = document.createElement('p');
      caseHint.className = 'muted small';
      caseHint.textContent = t('analysisPackage.caseModeHint');
      const caseChoices = document.createElement('div');
      caseChoices.className = 'analysepaket-falltypen';
      caseChoices.setAttribute('role', 'radiogroup');
      caseChoices.setAttribute('aria-label', t('analysisPackage.caseModeTitle'));
      const choices: Array<{
        mode: AnalysisCaseMode;
        title: string;
        hint: string;
      }> = [
        {
          mode: 'baseline-comparison',
          title: t('analysisPackage.modeHealthyTitle'),
          hint: t('analysisPackage.modeHealthyHint'),
        },
        {
          mode: 'neutral-comparison',
          title: t('analysisPackage.modeNeutralTitle'),
          hint: t('analysisPackage.modeNeutralHint'),
        },
      ];
      for (const [index, item] of choices.entries()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'analysepaket-falltyp-knopf';
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', index === 0 ? 'true' : 'false');
        const strong = document.createElement('strong');
        strong.textContent = item.title;
        const small = document.createElement('span');
        small.textContent = item.hint;
        button.append(strong, small);
        button.onclick = () => {
          this.mode = item.mode;
          for (const sibling of caseChoices.querySelectorAll<HTMLElement>('[role="radio"]')) {
            sibling.setAttribute('aria-checked', sibling === button ? 'true' : 'false');
          }
        };
        caseChoices.appendChild(button);
      }
      caseMode.append(caseTitle, caseHint, caseChoices);
    } else {
      const icon = document.createElement('span');
      icon.className = 'analysepaket-ohne-referenz-marke';
      icon.textContent = '✦';
      const copy = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = t('analysisPackage.noReferenceTitle');
      const hint = document.createElement('p');
      hint.className = 'muted small';
      hint.textContent = t('analysisPackage.noReferenceHint');
      copy.append(title, hint);
      caseMode.append(icon, copy);
    }
    body.appendChild(caseMode);

    const step = document.createElement('section');
    step.className = 'analysepaket-schritt';
    const stepTitle = document.createElement('h3');
    stepTitle.textContent = t('analysisPackage.situationTitle');
    step.appendChild(stepTitle);
    const stepHint = document.createElement('p');
    stepHint.className = 'muted small';
    stepHint.textContent = t('analysisPackage.situationHint');
    step.appendChild(stepHint);
    const choices = document.createElement('div');
    choices.className = 'analysepaket-situationen';
    choices.setAttribute('role', 'radiogroup');
    choices.setAttribute('aria-label', t('analysisPackage.situationTitle'));
    for (const [index, kind] of situationKinds.entries()) {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'analysepaket-situation';
      choice.setAttribute('role', 'radio');
      choice.setAttribute('aria-checked', index === 0 ? 'true' : 'false');
      choice.dataset.situationKind = kind;
      choice.textContent = t(situationLabels[kind]);
      choice.onclick = () => {
        this.kind = kind;
        for (const sibling of choices.querySelectorAll<HTMLElement>('[role="radio"]')) {
          sibling.setAttribute('aria-checked', sibling === choice ? 'true' : 'false');
        }
        this.vehicleDetails.hidden = kind !== 'vehicle-engine-bay';
        this.description.placeholder = t(
          kind === 'vehicle-engine-bay'
            ? 'analysisPackage.descriptionVehiclePlaceholder'
            : 'analysisPackage.descriptionPlaceholder'
        );
      };
      choices.appendChild(choice);
    }
    step.appendChild(choices);

    this.vehicleDetails = document.createElement('div');
    this.vehicleDetails.className = 'analysepaket-details';
    const detailLabel = document.createElement('p');
    detailLabel.className = 'small';
    detailLabel.textContent = t('analysisPackage.vehicleDetails');
    this.vehicleDetails.appendChild(detailLabel);
    const chips = document.createElement('div');
    chips.className = 'analysepaket-chips';
    for (const key of ['hoodOpen', 'hoodClosed', 'coldStart', 'warmIdle', 'raisedRpm'] as const) {
      const label = document.createElement('label');
      label.className = 'analysepaket-chip';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = t(`analysisPackage.${key}`);
      label.append(input, document.createTextNode(input.value));
      chips.appendChild(label);
    }
    this.vehicleDetails.appendChild(chips);
    step.appendChild(this.vehicleDetails);

    const descriptionLabel = document.createElement('label');
    descriptionLabel.className = 'analysepaket-beschreibung';
    const labelText = document.createElement('span');
    labelText.textContent = t('analysisPackage.descriptionLabel');
    descriptionLabel.appendChild(labelText);
    this.description = document.createElement('textarea');
    this.description.rows = 3;
    this.description.maxLength = 800;
    this.description.placeholder = t('analysisPackage.descriptionVehiclePlaceholder');
    descriptionLabel.appendChild(this.description);
    step.appendChild(descriptionLabel);

    const dictate = document.createElement('button');
    dictate.type = 'button';
    dictate.className = 'listen-btn analysepaket-diktat';
    dictate.textContent = t('analysisPackage.dictate');
    const SpeechRecognition = speechConstructor();
    if (!SpeechRecognition) {
      dictate.hidden = true;
    } else {
      dictate.onclick = () => {
        if (this.recognition) {
          this.recognition.stop();
          return;
        }
        const recognition = new SpeechRecognition();
        this.recognition = recognition;
        recognition.lang = document.documentElement.lang || 'de-DE';
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.onresult = (event) => {
          const transcript = event.results[0]?.[0]?.transcript?.trim();
          if (transcript)
            this.description.value = [this.description.value.trim(), transcript]
              .filter(Boolean)
              .join(' ');
        };
        recognition.onerror = () => {
          dictate.textContent = t('analysisPackage.dictate');
        };
        recognition.onend = () => {
          this.recognition = null;
          dictate.textContent = t('analysisPackage.dictate');
        };
        dictate.textContent = t('analysisPackage.dictating');
        recognition.start();
      };
      const dictationNote = document.createElement('p');
      dictationNote.className = 'muted small analysepaket-diktat-hinweis';
      dictationNote.textContent = t('analysisPackage.dictationNote');
      step.append(dictate, dictationNote);
    }
    body.appendChild(step);

    const selection = options.getSelection();
    if (selection) {
      const focus = document.createElement('p');
      focus.className = 'analysepaket-fokus';
      focus.textContent = t('analysisPackage.selectionIncluded', {
        from: selection.startSec.toFixed(1),
        to: selection.endSec.toFixed(1),
        low: Math.round(selection.lowHz),
        high: Math.round(selection.highHz),
      });
      body.appendChild(focus);
    }

    const privacy = document.createElement('section');
    privacy.className = 'analysepaket-privat';
    const privacyTitle = document.createElement('h3');
    privacyTitle.textContent = t('analysisPackage.privacyTitle');
    const privacyText = document.createElement('p');
    privacyText.className = 'muted small';
    privacyText.textContent = t('analysisPackage.privacyText');
    privacy.append(privacyTitle, privacyText);

    const includeLabel = document.createElement('label');
    includeLabel.className = 'analysepaket-check';
    this.includeName = document.createElement('input');
    this.includeName.type = 'checkbox';
    this.includeName.checked = true;
    includeLabel.append(
      this.includeName,
      document.createTextNode(t('analysisPackage.includeName', { name: options.machineName }))
    );
    privacy.appendChild(includeLabel);

    const consentLabel = document.createElement('label');
    consentLabel.className = 'analysepaket-check analysepaket-zustimmung';
    this.consent = document.createElement('input');
    this.consent.type = 'checkbox';
    this.consent.onchange = () => (this.createButton.disabled = !this.consent.checked);
    consentLabel.append(this.consent, document.createTextNode(t('analysisPackage.consent')));
    privacy.appendChild(consentLabel);
    body.appendChild(privacy);

    const footer = document.createElement('footer');
    footer.className = 'analysepaket-fuss';
    const local = document.createElement('p');
    local.className = 'analysepaket-lokal';
    local.textContent = t('analysisPackage.localPromise');
    footer.appendChild(local);
    this.createButton = document.createElement('button');
    this.createButton.type = 'button';
    this.createButton.className = 'primary-btn analysepaket-erstellen';
    this.createButton.textContent = t('analysisPackage.create');
    this.createButton.disabled = true;
    this.createButton.onclick = () => void this.createPackage();
    footer.appendChild(this.createButton);
    this.dialog.appendChild(footer);

    this.dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close();
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        this.dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([hidden]), textarea, input:not([disabled])'
        )
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  public open(): void {
    document.body.appendChild(this.overlay);
    document.body.classList.add('analysepaket-offen');
    this.dialog.querySelector<HTMLButtonElement>('.analysepaket-schliessen')?.focus();
  }

  private context(): AnalysisRecordingSituation {
    const details =
      this.kind === 'vehicle-engine-bay'
        ? Array.from(this.vehicleDetails.querySelectorAll<HTMLInputElement>('input:checked')).map(
            (input) => input.value
          )
        : [];
    return {
      kind: this.kind,
      description: this.description.value.trim() || t(situationLabels[this.kind]),
      details,
    };
  }

  private async createPackage(): Promise<void> {
    if (!this.consent.checked || this.closed) return;
    this.createButton.disabled = true;
    this.createButton.textContent = t('analysisPackage.working');
    const situation = this.context();
    const selection = this.options.getSelection();
    const prompt = createAnalysisPrompt({
      mode: this.mode,
      situation,
      machineName: this.includeName.checked ? this.options.machineName : undefined,
      selection,
    });
    // Noch innerhalb des bewussten Klicks versuchen: Browser schützen die
    // Zwischenablage stärker als einen Download. Scheitert es, bleibt der
    // identische Prompt im ZIP und erscheint danach zum manuellen Kopieren.
    const copied = await copyPrompt(prompt);
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const result = await buildAnalysisPackage({
        mode: this.mode,
        reference: this.options.reference,
        measurement: this.options.measurement,
        machineName: this.options.machineName,
        includeMachineName: this.includeName.checked,
        situation,
        selection,
      });
      download(result.blob, result.filename);
      this.showSuccess(result.prompt, copied, result.warnings.length);
    } catch (error) {
      logger.warn('Geräusch-Briefing konnte nicht erzeugt werden:', error);
      this.createButton.disabled = false;
      this.createButton.textContent = t('analysisPackage.create');
      const message = document.createElement('p');
      message.className = 'analysepaket-fehler';
      message.setAttribute('role', 'alert');
      message.textContent = t('analysisPackage.failed');
      this.createButton.before(message);
    }
  }

  private showSuccess(prompt: string, copied: boolean, warningCount: number): void {
    this.dialog.replaceChildren();
    const success = document.createElement('div');
    success.className = 'analysepaket-erfolg';
    const mark = document.createElement('div');
    mark.className = 'analysepaket-erfolg-marke';
    mark.textContent = '✓';
    const title = document.createElement('h2');
    title.textContent = t('analysisPackage.successTitle');
    const text = document.createElement('p');
    text.textContent = t(
      copied ? 'analysisPackage.successCopied' : 'analysisPackage.successFallback'
    );
    success.append(mark, title, text);
    if (warningCount) {
      const warning = document.createElement('p');
      warning.className = 'muted small';
      warning.textContent = t('analysisPackage.successWarnings', { count: warningCount });
      success.appendChild(warning);
    }
    const promptLabel = document.createElement('label');
    promptLabel.className = 'analysepaket-prompt';
    const label = document.createElement('span');
    label.textContent = t('analysisPackage.promptBackup');
    const field = document.createElement('textarea');
    field.readOnly = true;
    field.rows = 6;
    field.value = prompt;
    promptLabel.append(label, field);
    success.appendChild(promptLabel);
    const actions = document.createElement('div');
    actions.className = 'analysepaket-erfolg-aktionen';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'listen-btn';
    copy.textContent = t('analysisPackage.copyAgain');
    copy.onclick = async () => {
      const didCopy = await copyPrompt(prompt);
      copy.textContent = didCopy ? t('analysisPackage.copied') : t('analysisPackage.copyManually');
      if (!didCopy) field.select();
    };
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'primary-btn';
    done.textContent = t('analysisPackage.done');
    done.onclick = () => this.close();
    actions.append(copy, done);
    success.appendChild(actions);
    this.dialog.appendChild(success);
    done.focus();
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.recognition?.stop();
    this.overlay.remove();
    document.body.classList.remove('analysepaket-offen');
    this.lastFocused?.focus();
  }
}

export function openAnalysisPackageDialog(options: AnalysisPackageDialogOptions): void {
  new AnalysisPackageDialog(options).open();
}
