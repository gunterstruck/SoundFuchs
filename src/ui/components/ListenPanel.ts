/**
 * ZANOBOT - LISTEN PANEL (A/B comparison by ear)
 *
 * Reusable controls to compare a reference recording and a measurement by ear:
 * play either one, isolate "what's new" (difference), and listen slower (🐢,
 * lower) or faster (🐇, higher) – the speed applies to whichever clip is
 * playing, so both takes can be compared at the same transposition. This is
 * what surfaces e.g. early bearing faults: high-frequency tones pulled into a
 * comfortable band reveal a characteristic difference between a good and a bad
 * machine.
 *
 * Perception aid only – it makes differences audible, it does not judge.
 */

import { SlowListenPlayer } from '@core/audio/slowListen.js';
import { isolateDifference } from '@core/audio/differenceIsolation.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';
import { notify } from '@utils/notifications.js';

export interface ListenPanelOptions {
  reference?: AudioBuffer | null;
  measurement?: AudioBuffer | null;
}

/** Wrap a mono sample buffer into a playable AudioBuffer. */
function samplesToAudioBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  void ctx.close();
  return buffer;
}

export class ListenPanel {
  /** The root element to insert into the DOM. */
  public readonly element: HTMLElement;
  /** True if there is at least one recording to play. */
  public readonly hasContent: boolean;

  private player = new SlowListenPlayer();
  private speedFactor = 1; // 0.5 = slower/lower, 2 = faster/higher
  private playingKey: string | null = null;
  private buffers: Record<string, AudioBuffer> = {};
  private buttons: Array<{ key: string; el: HTMLButtonElement; label: string }> = [];

  constructor(options: ListenPanelOptions) {
    const reference = options.reference ?? null;
    const measurement = options.measurement ?? null;
    this.hasContent = Boolean(reference || measurement);

    const container = document.createElement('div');
    container.className = 'listen-controls';
    this.element = container;

    if (!this.hasContent) return;

    const slowToggle = document.createElement('button');
    const normalToggle = document.createElement('button');
    const fastToggle = document.createElement('button');

    const resetAll = () => {
      this.playingKey = null;
      for (const b of this.buttons) b.el.textContent = b.label;
    };

    const startPlayback = (key: string) => {
      const buffer = this.buffers[key];
      if (!buffer) return;
      this.player.stop();
      resetAll();
      this.playingKey = key;
      const active = this.buttons.find((b) => b.key === key);
      if (active) active.el.textContent = t('diagnose.display.listenStop');
      void this.player
        .play(buffer, { playbackRate: this.speedFactor }, resetAll)
        .catch((error) => {
          logger.warn('Listen playback failed:', error);
          resetAll();
        });
    };

    const makeButton = (key: string, label: string, buffer: AudioBuffer) => {
      this.buffers[key] = buffer;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'listen-btn';
      btn.textContent = label;
      btn.onclick = () => {
        if (this.playingKey === key) {
          this.player.stop();
          resetAll();
          return;
        }
        startPlayback(key);
      };
      this.buttons.push({ key, el: btn, label });
      container.appendChild(btn);
    };

    if (reference) makeButton('reference', t('diagnose.display.listenReference'), reference);
    if (measurement) makeButton('measurement', t('diagnose.display.listenMeasurement'), measurement);

    // Difference (only when both takes are present): resynthesize what's new
    if (reference && measurement) {
      let computed = false;
      let computing = false;
      const diffLabel = t('diagnose.display.listenDifference');
      const diffBtn = document.createElement('button');
      diffBtn.type = 'button';
      diffBtn.className = 'listen-btn listen-btn-difference';
      diffBtn.textContent = diffLabel;
      this.buttons.push({ key: 'difference', el: diffBtn, label: diffLabel });
      diffBtn.onclick = () => {
        if (this.playingKey === 'difference') {
          this.player.stop();
          resetAll();
          return;
        }
        if (computed) {
          startPlayback('difference');
          return;
        }
        if (computing) return;
        computing = true;
        diffBtn.textContent = t('diagnose.display.listenComputing');
        setTimeout(() => {
          try {
            const result = isolateDifference(reference, measurement);
            if (result.samples.length === 0) {
              notify.info(t('diagnose.display.listenDifferenceTooShort'));
              diffBtn.textContent = diffLabel;
              computing = false;
              return;
            }
            this.buffers['difference'] = samplesToAudioBuffer(result.samples, result.sampleRate);
            computed = true;
            computing = false;
            diffBtn.textContent = diffLabel;
            startPlayback('difference');
          } catch (error) {
            logger.warn('Difference isolation failed:', error);
            diffBtn.textContent = diffLabel;
            computing = false;
          }
        }, 50);
      };
      container.appendChild(diffBtn);
    }

    // Speed selector: slower/lower (🐢), normal (▶), faster/higher (🐇).
    // Exactly one is active; the speed applies to whichever clip is playing.
    const updateSpeedActive = () => {
      slowToggle.classList.toggle('active', this.speedFactor === 0.5);
      normalToggle.classList.toggle('active', this.speedFactor === 1);
      fastToggle.classList.toggle('active', this.speedFactor === 2);
    };
    const applySpeed = (factor: number) => {
      this.speedFactor = factor;
      updateSpeedActive();
      if (this.playingKey) startPlayback(this.playingKey);
    };

    slowToggle.type = 'button';
    slowToggle.className = 'listen-slow-toggle';
    slowToggle.textContent = t('diagnose.display.listenSlow');
    slowToggle.onclick = () => applySpeed(0.5);
    container.appendChild(slowToggle);

    normalToggle.type = 'button';
    normalToggle.className = 'listen-slow-toggle listen-normal-toggle';
    normalToggle.textContent = t('diagnose.display.listenNormal');
    normalToggle.onclick = () => applySpeed(1);
    container.appendChild(normalToggle);

    fastToggle.type = 'button';
    fastToggle.className = 'listen-slow-toggle listen-fast-toggle';
    fastToggle.textContent = t('diagnose.display.listenFaster');
    fastToggle.onclick = () => applySpeed(2);
    container.appendChild(fastToggle);

    updateSpeedActive(); // Normal active by default
  }

  /** Stop playback and release resources. */
  public destroy(): void {
    this.player.stop();
  }
}
