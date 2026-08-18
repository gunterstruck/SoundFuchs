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
  private active: {
    source: AudioBufferSourceNode;
    gain: GainNode;
    onEnded?: () => void;
    disposed: boolean;
  } | null = null;
  private context: AudioContext | null = null;
  /** Entwertet einen Start, der noch auf `resume()` wartet. */
  private generation = 0;

  /** Kurz genug für direktes Vergleichen, lang genug gegen Schaltknackser. */
  private static readonly FADE_SECONDS = 0.018;

  /** True while a buffer is currently playing. */
  public get isPlaying(): boolean {
    return this.active !== null;
  }

  private getContext(): AudioContext {
    if (this.context && this.context.state !== 'closed') return this.context;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error('Web Audio API not available');
    this.context = new AudioCtx();
    return this.context;
  }

  /**
   * Den gemeinsamen Kontext noch innerhalb der Nutzergeste entsperren.
   * Rechenintensive Hörhilfen dürfen danach asynchron entstehen, ohne auf iOS
   * einen neuen, nicht mehr autorisierten Kontext öffnen zu müssen.
   */
  public unlock(): void {
    try {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {
          // `play()` versucht es beim eigentlichen Start erneut und meldet dann
          // einen Fehler an die Oberfläche. Hier darf kein unhandled rejection
          // aus dem synchronen Nutzertipp entstehen.
        });
      }
    } catch {
      // Kein Web Audio: `play()` liefert später den für die UI sichtbaren Fehler.
    }
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
    const requestGeneration = this.generation;
    const ctx = this.getContext();
    let playback: NonNullable<SlowListenPlayer['active']> | null = null;
    try {
      // Kann auf iOS nur tragen, wenn `unlock()` bereits im Klick lief. Bleibt
      // der Kontext trotzdem gesperrt, läuft die Fehlerbereinigung vollständig.
      if (ctx.state === 'suspended') await ctx.resume();
      if (requestGeneration !== this.generation) return;

      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.playbackRate.value = options.playbackRate ?? 0.5;
      if (options.detuneCents) {
        try {
          source.detune.value = options.detuneCents;
        } catch {
          /* detune unsupported – playbackRate alone still slows + pitches down */
        }
      }
      source.connect(gain);
      gain.connect(ctx.destination);

      const currentPlayback = { source, gain, onEnded, disposed: false };
      playback = currentPlayback;
      source.onended = () => {
        const warAktiv = this.active === currentPlayback;
        if (warAktiv) this.active = null;
        this.dispose(currentPlayback);
        if (warAktiv) onEnded?.();
      };

      this.active = currentPlayback;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + SlowListenPlayer.FADE_SECONDS);
      source.start();
    } catch (error) {
      // Ein älterer `resume()`-Versuch kann erst scheitern, nachdem ein neuerer
      // Start bereits läuft. Dann gehört `this.active` dem neuen Start und darf
      // von diesem Fehler nicht berührt werden.
      if (playback && this.active === playback) {
        this.active = null;
        this.dispose(playback);
      }
      throw error;
    }
  }

  /** Stop playback (if any) with a short fade; the context remains reusable. */
  public stop(): void {
    this.generation++;
    const playback = this.active;
    if (!playback) return;
    this.active = null;
    playback.source.onended = null;

    const now = this.context?.currentTime ?? 0;
    try {
      playback.gain.gain.cancelScheduledValues(now);
      playback.gain.gain.setValueAtTime(playback.gain.gain.value, now);
      playback.gain.gain.linearRampToValueAtTime(0, now + SlowListenPlayer.FADE_SECONDS);
      playback.source.stop(now + SlowListenPlayer.FADE_SECONDS);
    } catch {
      // War die Quelle schon am Ende, bleibt nur noch das Aufräumen.
    }
    window.setTimeout(
      () => this.dispose(playback),
      Math.ceil(SlowListenPlayer.FADE_SECONDS * 1_000) + 20
    );
  }

  private dispose(playback: NonNullable<SlowListenPlayer['active']>): void {
    if (playback.disposed) return;
    playback.disposed = true;
    playback.source.onended = null;
    try {
      playback.source.disconnect();
      playback.gain.disconnect();
    } catch {
      /* schon getrennt */
    }
  }

  /** Wiedergabe und den pro Hör-Lupe wiederverwendeten Kontext freigeben. */
  public destroy(): void {
    this.stop();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => {
        /* Kontext schon geschlossen */
      });
    }
  }
}
