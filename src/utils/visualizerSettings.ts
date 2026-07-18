export type VisualizerScale = 'linear' | 'log';

export type VisualizerSettings = {
  frequencyScale: VisualizerScale;
  amplitudeScale: VisualizerScale;
};

export const VISUALIZER_SETTINGS_EVENT = 'zanobot:visualizer-settings-change';

const STORAGE_KEY = 'zanobot.visualizer.settings';

// Default to logarithmic on both axes: low/mid frequencies (where machine
// tonal structure lives) and quieter components get more visual weight, which
// matches how we perceive sound and yields a more informative spectrum/ghost.
const defaultSettings: VisualizerSettings = {
  frequencyScale: 'log',
  amplitudeScale: 'log',
};

const readFromStorage = (): VisualizerSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...defaultSettings };
    }
    const parsed = JSON.parse(raw) as Partial<VisualizerSettings>;
    return {
      frequencyScale: parsed.frequencyScale === 'log' ? 'log' : 'linear',
      amplitudeScale: parsed.amplitudeScale === 'log' ? 'log' : 'linear',
    };
  } catch {
    return { ...defaultSettings };
  }
};

export const getVisualizerSettings = (): VisualizerSettings => readFromStorage();

export const setVisualizerSettings = (
  updates: Partial<VisualizerSettings>
): VisualizerSettings => {
  const current = readFromStorage();
  const next: VisualizerSettings = {
    frequencyScale: updates.frequencyScale ?? current.frequencyScale,
    amplitudeScale: updates.amplitudeScale ?? current.amplitudeScale,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors (e.g., private mode) and still broadcast.
  }

  window.dispatchEvent(
    new CustomEvent<VisualizerSettings>(VISUALIZER_SETTINGS_EVENT, { detail: next })
  );

  return next;
};
