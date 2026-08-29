/**
 * Geführte Live-Schulungen auf der echten SoundFuchs-Oberfläche.
 *
 * Die Vorführung erzeugt ihre Töne mathematisch im Browser. Sie verlangt kein
 * Mikrofon, öffnet keinen Dateidialog und fasst keinen bestehenden Datensatz
 * an. Temporäre Einträge tragen ein reserviertes Präfix und werden nach dem
 * Lauf – oder spätestens beim nächsten Start – entfernt.
 */

import {
  SHOWCASE_STORIES,
  showcaseStory,
  type ShowcaseStory,
} from '../features/showcaseStories.js';
import { t } from '../i18n/index.js';
import { escapeHtml } from '@utils/sanitize.js';
import {
  deleteCustomer,
  deleteMachine,
  getAllCustomers,
  getAllMachines,
  saveCustomer,
  saveDiagnosis,
  saveMachine,
  saveRecording,
} from '@data/db.js';
import type { Customer, DiagnosisResult, GMIAModel, Machine } from '@data/types.js';
import { extractFeatures, DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import { GmiaEngine } from '@core/ml/engine/GmiaEngine.js';
import { classifyHealthStatus } from '@core/ml/scoring.js';
import { NORMALZUSTAND_GESPEICHERT } from './phases/2-Reference.js';
import { merkeErgebnis, vergissErgebnis } from '../stamm/maschine/ergebnis.js';
import { zeigeMitgebrachtesGeraeusch } from '../stamm/ui/maschinenansicht.js';
import {
  schliesseTiefe,
  oeffneTiefe,
  offeneEbene,
  offenerStandortId,
  tiefeIstOffen,
  type Tiefenebene,
} from '../stamm/ui/scharnier.js';
import { zeigeKarte } from '../stamm/ui/schale.js';
import { InfoBottomSheet } from './components/InfoBottomSheet.js';
import { logger } from '@utils/logger.js';

const DEMO_PREFIX = 'sf-showcase-';
const SEEN_KEY = 'sf_showcase_seen_v1';
const SAMPLE_RATE = 48_000;
const DEMO_DURATION = 4.2;

interface ViewSnapshot {
  machine: Machine | null;
  depthOpen: boolean;
  siteId: string | null;
  level: Tiefenebene;
}

export interface ShowcaseDeps {
  currentMachine: () => Machine | null;
  useMachine: (machine: Machine | null) => void;
  openMachine: (machine: Machine) => void;
  refreshMap: () => Promise<void> | void;
}

interface DemoSession {
  id: string;
  customer: Customer;
  machine: Machine;
  reference: AudioBuffer;
  measurement: AudioBuffer;
  score: number | null;
}

let deps: ShowcaseDeps | null = null;
let dialog: HTMLDialogElement | null = null;
let running = false;
let cancelled = false;
let session: DemoSession | null = null;
let snapshot: ViewSnapshot | null = null;
let cursor: HTMLElement | null = null;
let bubble: HTMLElement | null = null;
let shield: HTMLElement | null = null;
let toolbar: HTMLElement | null = null;

function sleep(ms: number): Promise<void> {
  const speed = document.documentElement.dataset.showcaseSpeed === 'fast' ? 0.03 : 1;
  const duration = Math.max(12, ms * speed);
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = (): void => {
      if (running && cancelled) {
        resolve();
        return;
      }
      const remaining = duration - (performance.now() - started);
      if (remaining <= 0) resolve();
      else window.setTimeout(tick, Math.min(remaining, 90));
    };
    window.setTimeout(tick, Math.min(duration, 90));
  });
}

function assertRunning(): void {
  if (cancelled) throw new Error(t('showcase.cancelled'));
}

function seenIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function markSeen(id: string): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...seenIds(), id])]));
  } catch {
    /* Der Fortschritt ist Komfort, die Schulung funktioniert auch ohne ihn. */
  }
}

/** Entfernt ausschließlich Datensätze mit dem reservierten Schulungs-Präfix. */
export async function cleanupStaleShowcaseData(): Promise<void> {
  try {
    const machines = (await getAllMachines()).filter((machine) =>
      machine.id.startsWith(DEMO_PREFIX)
    );
    for (const machine of machines) await deleteMachine(machine.id);
    const customers = (await getAllCustomers()).filter((customer) =>
      customer.id.startsWith(DEMO_PREFIX)
    );
    for (const customer of customers) await deleteCustomer(customer.id);
  } catch (error) {
    logger.warn(
      'Mini-Schulung: alte Vorführdaten konnten nicht vollständig entfernt werden',
      error
    );
  }
}

function syntheticSound(kind: 'reference' | 'deviation'): AudioBuffer {
  const length = Math.round(SAMPLE_RATE * DEMO_DURATION);
  const buffer = new AudioBuffer({ length, numberOfChannels: 1, sampleRate: SAMPLE_RATE });
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index++) {
    const time = index / SAMPLE_RATE;
    const envelope = Math.min(1, time * 7, (DEMO_DURATION - time) * 7);
    const base =
      0.46 * Math.sin(2 * Math.PI * 186 * time) +
      0.23 * Math.sin(2 * Math.PI * 372 * time + 0.18) +
      0.1 * Math.sin(2 * Math.PI * 558 * time + 0.44);
    const slow = 1 + 0.035 * Math.sin(2 * Math.PI * 2.2 * time);
    const deviation =
      0.5 * Math.sin(2 * Math.PI * 915 * time) +
      0.28 *
        Math.sin(2 * Math.PI * 1210 * time + 0.6) *
        (0.45 + 0.55 * Math.max(0, Math.sin(2 * Math.PI * 5.5 * time))) +
      0.13 * Math.sin(2 * Math.PI * 1860 * time + 0.2);
    // Deterministisches, sehr leises Breitbandmuster statt Math.random().
    const texture = 0.012 * Math.sin(2 * Math.PI * 2713 * time + Math.sin(time * 31));
    const signal = kind === 'reference' ? base * slow : deviation;
    data[index] = envelope * Math.max(-0.96, Math.min(0.96, signal + texture));
  }
  return buffer;
}

async function createSession(): Promise<DemoSession> {
  if (session) return session;
  await cleanupStaleShowcaseData();
  const id = `${DEMO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const customer: Customer = {
    id: `${id}-site`,
    name: t('showcase.demo.site'),
    plz: '',
    ort: t('showcase.demo.city'),
    geo: 'none',
    createdAt: Date.now(),
    demo: true,
  };
  const machine: Machine = {
    id: `${id}-machine`,
    name: t('showcase.demo.machine'),
    customerId: customer.id,
    createdAt: Date.now(),
    referenceModels: [],
    demo: true,
  };
  await saveCustomer(customer);
  await saveMachine(machine);
  session = {
    id,
    customer,
    machine,
    reference: syntheticSound('reference'),
    measurement: syntheticSound('deviation'),
    score: null,
  };
  return session;
}

async function ensureReference(): Promise<DemoSession> {
  const current = await createSession();
  if (current.machine.referenceModels.length > 0) return current;

  const features = extractFeatures(current.reference);
  const engine = new GmiaEngine();
  const model = engine.train(
    {
      trainingData: {
        featureVectors: features.map((feature) => feature.features),
        machineId: current.machine.id,
        recordingId: `${current.id}-reference`,
        numSamples: features.length,
        config: { ...DEFAULT_DSP_CONFIG },
      },
      sampleRate: SAMPLE_RATE,
    },
    current.machine.id
  ) as GMIAModel;
  model.label = 'Baseline';
  model.type = 'healthy';
  current.machine = { ...current.machine, referenceModels: [model] };
  await saveMachine(current.machine);
  await saveRecording({
    id: `${current.id}-reference`,
    machineId: current.machine.id,
    type: 'reference',
    audioBuffer: current.reference,
    timestamp: Date.now() - 21 * 24 * 60 * 60 * 1000,
    duration: current.reference.duration,
    sampleRate: current.reference.sampleRate,
  });
  return current;
}

function scoreMeasurement(current: DemoSession): number {
  if (current.score !== null) return current.score;
  const model = current.machine.referenceModels[0];
  if (!model) return 0;
  const engine = new GmiaEngine();
  const scores = extractFeatures(current.measurement).map(
    (feature) =>
      engine.classify([model], { feature, sampleRate: current.measurement.sampleRate }).healthScore
  );
  current.score =
    Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10;
  return current.score;
}

async function seedHistory(current: DemoSession, currentDiagnosis: DiagnosisResult): Promise<void> {
  const day = 24 * 60 * 60 * 1000;
  const previous: DiagnosisResult[] = [
    {
      id: `${current.id}-history-1`,
      machineId: current.machine.id,
      timestamp: Date.now() - 14 * day,
      healthScore: 97,
      status: 'healthy',
      confidence: 95,
    },
    {
      id: `${current.id}-history-2`,
      machineId: current.machine.id,
      timestamp: Date.now() - 7 * day,
      healthScore: 91,
      status: 'healthy',
      confidence: 93,
    },
  ];
  for (const diagnosis of previous) await saveDiagnosis(diagnosis);
  await saveDiagnosis(currentDiagnosis);
  await saveRecording({
    id: currentDiagnosis.id,
    machineId: current.machine.id,
    type: 'diagnosis',
    audioBuffer: current.measurement,
    timestamp: currentDiagnosis.timestamp,
    duration: current.measurement.duration,
    sampleRate: current.measurement.sampleRate,
  });
}

function snapshotView(): ViewSnapshot {
  return {
    machine: deps?.currentMachine() ?? null,
    depthOpen: tiefeIstOffen(),
    siteId: offenerStandortId(),
    level: offeneEbene(),
  };
}

async function waitFor(selector: string, timeout = 5000): Promise<HTMLElement> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    assertRunning();
    const element = document.querySelector<HTMLElement>(selector);
    if (element && element.getClientRects().length > 0) return element;
    await sleep(70);
  }
  throw new Error(t('showcase.missingTarget', { target: selector }));
}

async function moveTo(element: HTMLElement): Promise<void> {
  element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  await sleep(380);
  const rect = element.getBoundingClientRect();
  const x = Math.max(8, Math.min(window.innerWidth - 28, rect.left + rect.width / 2));
  const y = Math.max(8, Math.min(window.innerHeight - 28, rect.top + rect.height / 2));
  cursor?.style.setProperty('--sc-x', `${Math.round(x)}px`);
  cursor?.style.setProperty('--sc-y', `${Math.round(y)}px`);
  if (cursor) cursor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  await sleep(650);
}

function positionBubble(target?: HTMLElement, preferred: 'top' | 'bottom' | 'auto' = 'auto'): void {
  if (!bubble) return;
  const width = Math.min(320, window.innerWidth - 24);
  bubble.style.width = `${width}px`;
  const height = bubble.offsetHeight || 110;
  if (!target) {
    bubble.style.left = `${Math.max(12, (window.innerWidth - width) / 2)}px`;
    bubble.style.top = `${Math.max(76, window.innerHeight * 0.58 - height / 2)}px`;
    return;
  }
  const rect = target.getBoundingClientRect();
  const above = rect.top - height - 14;
  const below = rect.bottom + 14;
  const useTop =
    preferred === 'top' || (preferred === 'auto' && below + height > window.innerHeight - 12);
  bubble.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2))}px`;
  bubble.style.top = `${Math.max(68, useTop ? above : below)}px`;
}

async function say(
  textKey: string,
  selector?: string,
  ms = 3000,
  position: 'top' | 'bottom' | 'auto' = 'auto'
): Promise<void> {
  assertRunning();
  const target = selector ? await waitFor(selector) : undefined;
  if (target) await moveTo(target);
  if (!bubble) return;
  bubble.textContent = t(textKey);
  bubble.classList.remove('sc-show');
  positionBubble(target, position);
  requestAnimationFrame(() => bubble?.classList.add('sc-show'));
  await sleep(ms);
  bubble.classList.remove('sc-show');
  await sleep(180);
}

async function click(selector: string): Promise<void> {
  const element = await waitFor(selector);
  await moveTo(element);
  cursor?.classList.add('sc-click');
  element.click();
  await sleep(520);
  cursor?.classList.remove('sc-click');
}

function showRecordingModal(): HTMLElement | null {
  const modal = document.getElementById('recording-modal');
  if (!modal) return null;
  const machineName = modal.querySelector<HTMLElement>('#machine-id');
  if (machineName && session) machineName.textContent = session.machine.name;
  const countdown = modal.querySelector<HTMLElement>('#recording-countdown-container');
  if (countdown) countdown.style.display = 'block';
  modal.style.display = 'flex';
  return modal;
}

async function simulateReferenceRecording(): Promise<void> {
  const current = await createSession();
  const modal = showRecordingModal();
  for (let n = 10; n >= 0; n -= 2) {
    const number = document.getElementById('recording-countdown-number');
    const fill = document.getElementById('recording-countdown-bar-fill');
    if (number) number.textContent = String(n);
    if (fill) fill.style.width = `${(10 - n) * 10}%`;
    await sleep(260);
  }
  if (modal) modal.style.display = 'none';
  await ensureReference();
  document.dispatchEvent(
    new CustomEvent<{ machineId: string }>(NORMALZUSTAND_GESPEICHERT, {
      detail: { machineId: current.machine.id },
    })
  );
  await waitFor('.maschine-fingerabdruck', 7000);
}

async function showDeviation(): Promise<void> {
  const current = await ensureReference();
  const score = scoreMeasurement(current);
  const diagnosis: DiagnosisResult = {
    id: `${current.id}-diagnosis`,
    machineId: current.machine.id,
    timestamp: Date.now(),
    healthScore: score,
    status: classifyHealthStatus(score),
    confidence: 94,
    metadata: { source: 'showcase-synthetic' },
  };
  await seedHistory(current, diagnosis);
  merkeErgebnis({
    maschinenId: current.machine.id,
    diagnoseId: diagnosis.id,
    wert: score,
    zeitpunkt: diagnosis.timestamp,
    referenz: current.reference,
    messung: current.measurement,
  });
  await waitFor('.maschine-ergebnissatz', 7000);
}

async function runAction(action: string): Promise<void> {
  assertRunning();
  switch (action) {
    case 'showMap':
      schliesseTiefe();
      zeigeKarte();
      await deps?.refreshMap();
      await sleep(450);
      return;
    case 'prepareEmptyMachine': {
      const current = await createSession();
      deps?.useMachine(current.machine);
      deps?.openMachine(current.machine);
      await waitFor('.maschine-aktion');
      return;
    }
    case 'recordReference':
      await simulateReferenceRecording();
      return;
    case 'showDeviation':
      await showDeviation();
      return;
    case 'prepareDeviation': {
      const current = await ensureReference();
      deps?.useMachine(current.machine);
      deps?.openMachine(current.machine);
      await waitFor('.maschine-aktion');
      await showDeviation();
      return;
    }
    case 'selectDifferenceSource': {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>('.klangbild-quelle')];
      const difference = buttons.find(
        (button) => button.textContent === t('klangbild.quelleUnterschied')
      );
      difference?.click();
      await sleep(500);
      return;
    }
    case 'showImportedSound': {
      const current = await createSession();
      deps?.useMachine(current.machine);
      zeigeMitgebrachtesGeraeusch(
        current.machine,
        current.measurement,
        'Motorhaube-2026-08-29.mp4'
      );
      await waitFor('.klangbild', 7000);
      return;
    }
    case 'prepareReferenceOnMap':
      await ensureReference();
      schliesseTiefe();
      zeigeKarte();
      await deps?.refreshMap();
      await sleep(450);
      return;
    case 'showListening': {
      const modal = document.getElementById('auto-detect-modal');
      if (modal) modal.style.display = 'flex';
      const subtitle = document.getElementById('auto-detect-subtitle');
      if (subtitle) subtitle.textContent = t('autoDetect.analyzing');
      return;
    }
    case 'showRecognized': {
      document.getElementById('auto-detect-modal')?.style.setProperty('display', 'none');
      const current = await ensureReference();
      const modal = document.getElementById('machine-recognized-modal');
      const name = document.getElementById('recognized-machine-name');
      const similarity = document.getElementById('recognized-similarity');
      const status = document.getElementById('recognized-status');
      if (name) name.textContent = current.machine.name;
      if (similarity) similarity.textContent = '98%';
      if (status) {
        status.textContent = t('status.healthy');
        status.className = 'recognized-status status-healthy';
      }
      if (modal) modal.style.display = 'flex';
      return;
    }
    default:
      throw new Error(t('showcase.unknownAction', { action }));
  }
}

function ensureRuntimeDom(): void {
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.className = 'sc-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 3l20 17-10 1-5 8z" fill="#fff" stroke="#0f172a" stroke-width="2"/></svg>`;
    document.body.appendChild(cursor);
  }
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'sc-bubble';
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');
    document.body.appendChild(bubble);
  }
  if (!shield) {
    shield = document.createElement('div');
    shield.className = 'sc-shield';
    shield.setAttribute('aria-hidden', 'true');
    document.body.appendChild(shield);
  }
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'sc-toolbar';
    toolbar.innerHTML = `<span class="sc-story-label"></span><span class="sc-progress"></span><button type="button" class="sc-cancel">${escapeHtml(t('showcase.stop'))}</button>`;
    toolbar.querySelector('.sc-cancel')?.addEventListener('click', () => {
      cancelled = true;
    });
    document.body.appendChild(toolbar);
  }
}

function removeRuntimeDom(): void {
  cursor?.remove();
  bubble?.remove();
  shield?.remove();
  toolbar?.remove();
  cursor = bubble = shield = toolbar = null;
}

function closeShowcaseModals(): void {
  document.getElementById('recording-modal')?.style.setProperty('display', 'none');
  document.getElementById('auto-detect-modal')?.style.setProperty('display', 'none');
  document.getElementById('machine-recognized-modal')?.style.setProperty('display', 'none');
  document.querySelector<HTMLButtonElement>('.analysepaket-schliessen')?.click();
}

async function restore(): Promise<void> {
  closeShowcaseModals();
  vergissErgebnis();
  const previous = snapshot;
  snapshot = null;
  deps?.useMachine(previous?.machine ?? null);
  session = null;
  await cleanupStaleShowcaseData();
  await deps?.refreshMap();
  if (previous?.depthOpen) oeffneTiefe(previous.siteId, previous.level);
  else {
    schliesseTiefe();
    zeigeKarte();
  }
}

async function runStory(story: ShowcaseStory): Promise<void> {
  if (running || !deps) return;
  running = true;
  cancelled = false;
  snapshot = snapshotView();
  dialog?.close();
  InfoBottomSheet.close();
  document.body.classList.add('showcase-running');
  ensureRuntimeDom();
  const label = toolbar?.querySelector<HTMLElement>('.sc-story-label');
  if (label) label.innerHTML = `<b>${story.icon}</b> ${escapeHtml(t(story.titleKey))}`;

  let failure: unknown = null;
  try {
    for (let index = 0; index < story.steps.length; index++) {
      assertRunning();
      const progress = toolbar?.querySelector<HTMLElement>('.sc-progress');
      if (progress) progress.textContent = `${index + 1}/${story.steps.length}`;
      const step = story.steps[index];
      if (step.type === 'say') {
        await say(step.textKey, step.selector, step.ms, step.position);
      } else if (step.type === 'run') {
        await runAction(step.action);
      } else if (step.type === 'click') {
        await click(step.selector);
      } else {
        await sleep(step.ms);
      }
    }
    markSeen(story.id);
  } catch (error) {
    failure = error;
    logger.warn('Mini-Schulung unterbrochen', error);
  } finally {
    removeRuntimeDom();
    document.body.classList.remove('showcase-running');
    await restore();
    running = false;
  }
  if (failure && !cancelled) showOutcome(story, false, String(failure));
  else if (cancelled) openShowcase();
  else showOutcome(story, true);
}

function storyTiles(): string {
  const seen = new Set(seenIds());
  return SHOWCASE_STORIES.map(
    (story, index) => `<button type="button" class="sc-tile" data-story="${story.id}">
      <span class="sc-tile-icon" aria-hidden="true">${story.icon}</span>
      <span class="sc-tile-body"><b>${escapeHtml(t(story.titleKey))}</b><span>${escapeHtml(t(story.blurbKey))}</span><small>${index === 0 ? `${escapeHtml(t('showcase.recommended'))} · ` : ''}${escapeHtml(t('showcase.aboutSeconds', { seconds: String(story.duration) }))}</small></span>
      <span class="${seen.has(story.id) ? 'sc-tile-seen' : 'sc-tile-play'}" aria-hidden="true">${seen.has(story.id) ? '✓' : '▶'}</span>
    </button>`
  ).join('');
}

function buildPanel(): void {
  if (!dialog) return;
  dialog.dataset.view = 'intro';
  dialog.innerHTML = `<div class="sc-panel-head"><div class="sc-panel-fox" aria-hidden="true">🦊</div><h2>${escapeHtml(t('showcase.heading'))}</h2><p>${escapeHtml(t('showcase.intro'))}</p></div><div class="sc-tiles">${storyTiles()}</div><div class="sc-panel-foot"><span>${escapeHtml(t('showcase.safeHint'))}</span><button type="button" class="sc-later primary">${escapeHtml(t('showcase.close'))}</button></div>`;
  dialog.querySelectorAll<HTMLButtonElement>('[data-story]').forEach((button) => {
    button.addEventListener('click', () => {
      const story = showcaseStory(button.dataset.story ?? '');
      if (story) void runStory(story);
    });
  });
  dialog
    .querySelector<HTMLButtonElement>('.sc-later')
    ?.addEventListener('click', () => dialog?.close());
}

function showOutcome(story: ShowcaseStory, success: boolean, reason = ''): void {
  if (!dialog) return;
  const stories = [...SHOWCASE_STORIES];
  const next = stories[(stories.findIndex((entry) => entry.id === story.id) + 1) % stories.length];
  dialog.dataset.view = 'outcome';
  dialog.innerHTML = `<div class="sc-outcome-head${success ? '' : ' sc-outcome-failed'}"><div class="sc-outcome-icon" aria-hidden="true">${success ? '✓' : '!'}</div><span>${escapeHtml(t(success ? 'showcase.completed' : 'showcase.interrupted'))}</span><h2>${escapeHtml(t(story.titleKey))}</h2></div><div class="sc-outcome-body"><p>${escapeHtml(success ? t(story.blurbKey) : t('showcase.failure'))}</p>${success ? `<div class="sc-next-story"><span>${escapeHtml(t('showcase.next'))}</span><div><b>${next.icon} ${escapeHtml(t(next.titleKey))}</b><small>${escapeHtml(t(next.blurbKey))}</small></div></div>` : `<p class="sc-failure-reason">${escapeHtml(reason)}</p>`}</div><div class="sc-outcome-actions"><button type="button" class="sc-overview">${escapeHtml(t('showcase.overview'))}</button>${success ? `<button type="button" class="primary sc-next">${escapeHtml(t('showcase.startNext'))}</button>` : `<button type="button" class="primary sc-retry">${escapeHtml(t('showcase.retry'))}</button>`}</div>`;
  dialog.querySelector<HTMLButtonElement>('.sc-overview')?.addEventListener('click', () => {
    buildPanel();
  });
  dialog
    .querySelector<HTMLButtonElement>('.sc-next')
    ?.addEventListener('click', () => void runStory(next));
  dialog
    .querySelector<HTMLButtonElement>('.sc-retry')
    ?.addEventListener('click', () => void runStory(story));
  if (!dialog.open) dialog.showModal();
}

export function openShowcase(): void {
  if (!dialog || running) return;
  void cleanupStaleShowcaseData().finally(() => {
    buildPanel();
    if (!dialog?.open) dialog?.showModal();
  });
}

export function initShowcase(dependencies: ShowcaseDeps): void {
  deps = dependencies;
  dialog = document.getElementById('showcase-dialog') as HTMLDialogElement | null;
  void cleanupStaleShowcaseData();
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && running) {
        event.preventDefault();
        cancelled = true;
      }
    },
    true
  );
}
