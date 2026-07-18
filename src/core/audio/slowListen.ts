/**
 * ZANOBOT - SLOW-MOTION LISTENING
 *
 * "Hör den Unterschied" – Step 2a (Zeitlupe / Transposition).
 *
 * Plays back a recorded AudioBuffer slowed down (and thereby pitched down),
 * so the human ear can examine acoustic detail that is lost at real-time
 * speed. This is purely a perception aid – it makes the sound accessible,
 * it does not judge it (stethoscope principle).
 *
 * Deliberately simple and robust: a single AudioBufferSourceNode whose
 * playbackRate is reduced. No resynthesis, runs everywhere.
 */

export interface SlowListenOptions {
  /** Playback speed factor. 0.5 = half speed (one octave lower). Default 0.5. */
  playbackRate?: number;
  /** Optional additional pitch shift in cents (applied via detune). Default 0. */
  detuneCents?: number;
}

/**
 * Plays a single AudioBuffer in slow motion. One instance plays one sound at a
 * time; calling play() again stops the previous playback first.
 */
export class SlowListenPlayer {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;

  /** True while a buffer is currently playing. */
  public get isPlaying(): boolean {
    return this.source !== null;
  }

  /**
   * Start slow-motion playback of the given buffer.
   *
   * @param buffer - Audio to play
   * @param options - Playback rate / pitch options
   * @param onEnded - Called when playback finishes or is stopped
   */
  public async play(
    buffer: AudioBuffer,
    options: SlowListenOptions = {},
    onEnded?: () => void
  ): Promise<void> {
    this.stop();

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      throw new Error('Web Audio API not available');
    }

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = options.playbackRate ?? 0.5;
    if (options.detuneCents) {
      // detune is not implemented on every engine – ignore if it throws
      try {
        source.detune.value = options.detuneCents;
      } catch {
        /* detune unsupported – playbackRate alone still slows + pitches down */
      }
    }
    source.connect(ctx.destination);

    source.onended = () => {
      this.stop();
      onEnded?.();
    };

    this.source = source;

    // iOS/Safari may start the context suspended until a user gesture resumes it
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    source.start();
  }

  /** Stop playback (if any) and release the audio context. */
  public stop(): void {
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
      } catch {
        /* already stopped */
      }
      try {
        this.source.disconnect();
      } catch {
        /* already disconnected */
      }
      this.source = null;
    }

    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      void ctx.close().catch(() => {
        /* context already closed */
      });
    }
  }
}
