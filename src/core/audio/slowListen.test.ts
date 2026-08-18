import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlowListenPlayer } from './slowListen.js';

class FakeParam {
  value = 1;
  setValueAtTime(value: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number): void {
    this.value = value;
  }
  cancelScheduledValues(): void {}
}

class FakeSource {
  buffer: AudioBuffer | null = null;
  playbackRate = new FakeParam();
  detune = new FakeParam();
  onended: (() => void) | null = null;
  starts = 0;
  connect(): void {}
  disconnect(): void {}
  start(): void {
    this.starts++;
  }
  stop(): void {}
}

class FakeGain {
  gain = new FakeParam();
  connect(): void {}
  disconnect(): void {}
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {} as AudioDestinationNode;
  sources: FakeSource[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    return new FakeGain() as unknown as GainNode;
  }
}

const audio = { duration: 1 } as AudioBuffer;

afterEach(() => {
  vi.unstubAllGlobals();
  FakeAudioContext.instances = [];
});

describe('SlowListenPlayer', () => {
  it('entsperrt und verwendet einen Kontext für mehrere Wiedergaben wieder', async () => {
    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext,
      setTimeout,
    });
    const player = new SlowListenPlayer();

    player.unlock();
    await Promise.resolve();
    await player.play(audio, { playbackRate: 1 });
    await player.play(audio, { playbackRate: 0.5 });

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].sources).toHaveLength(2);
    expect(FakeAudioContext.instances[0].sources[1].playbackRate.value).toBe(0.5);
    player.destroy();
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalledOnce();
  });

  it('hinterlässt nach abgelehntem resume keinen falschen Wiedergabezustand', async () => {
    class RejectingContext extends FakeAudioContext {
      override resume = vi.fn(async () => {
        throw new Error('gesture required');
      });
    }
    vi.stubGlobal('window', {
      AudioContext: RejectingContext,
      setTimeout,
    });
    const player = new SlowListenPlayer();

    await expect(player.play(audio)).rejects.toThrow('gesture required');
    expect(player.isPlaying).toBe(false);
    expect(FakeAudioContext.instances[0].sources).toHaveLength(0);
    player.destroy();
  });

  it('lässt einen verspäteten Fehler nicht die neuere Wiedergabe beenden', async () => {
    let resolveNewer!: () => void;
    let rejectOlder!: (error: Error) => void;
    class RacingContext extends FakeAudioContext {
      private resumeCalls = 0;
      override resume = vi.fn(() => {
        this.resumeCalls++;
        if (this.resumeCalls === 1) {
          return new Promise<void>((_resolve, reject) => {
            rejectOlder = reject;
          });
        }
        return new Promise<void>((resolve) => {
          resolveNewer = () => {
            this.state = 'running';
            resolve();
          };
        });
      });
    }
    vi.stubGlobal('window', {
      AudioContext: RacingContext,
      setTimeout,
    });
    const player = new SlowListenPlayer();

    const older = player.play(audio);
    const newer = player.play(audio);
    resolveNewer();
    await newer;
    rejectOlder(new Error('older resume failed'));

    await expect(older).rejects.toThrow('older resume failed');
    expect(player.isPlaying).toBe(true);
    expect(FakeAudioContext.instances[0].sources).toHaveLength(1);
    player.destroy();
  });
});
