import { describe, expect, it } from 'vitest';
import { SHOWCASE_STORIES, showcaseStory } from './showcaseStories.js';

describe('Mini-Schulungen', () => {
  it('besteht bewusst aus genau fünf kurzen Kernabläufen', () => {
    expect(SHOWCASE_STORIES.map((story) => story.id)).toEqual([
      'core',
      'difference',
      'import',
      'recognition',
      'briefing',
    ]);
    expect(SHOWCASE_STORIES.every((story) => story.duration > 0 && story.duration < 60)).toBe(true);
  });

  it('hat eindeutige Kennungen und auflösbare Texte', () => {
    expect(new Set(SHOWCASE_STORIES.map((story) => story.id)).size).toBe(SHOWCASE_STORIES.length);
    for (const story of SHOWCASE_STORIES) {
      expect(showcaseStory(story.id)).toBe(story);
      expect(story.titleKey).toMatch(/^showcase\./);
      expect(story.blurbKey).toMatch(/^showcase\./);
      expect(story.steps.length).toBeGreaterThan(3);
      for (const step of story.steps) {
        if (step.type === 'say') expect(step.textKey).toMatch(/^showcase\./);
      }
    }
  });

  it('zeigt in der Kernschulung sowohl Normalzustand als auch Gegenprobe', () => {
    const core = showcaseStory('core');
    expect(core?.steps).toContainEqual({ type: 'run', action: 'recordReference' });
    expect(core?.steps).toContainEqual({ type: 'run', action: 'showDeviation' });
  });

  it('löst in der Import-Schulung keinen echten Dateidialog aus', () => {
    const imported = showcaseStory('import');
    expect(
      imported?.steps.some((step) => step.type === 'click' && step.selector === 'input[type=file]')
    ).toBe(false);
    expect(imported?.steps).toContainEqual({ type: 'run', action: 'showImportedSound' });
  });
});
