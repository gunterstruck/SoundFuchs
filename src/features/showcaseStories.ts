/**
 * Die fünf kurzen Live-Schulungen.
 *
 * Anders als ein Video laufen sie auf der echten Oberfläche. Diese Datei
 * beschreibt nur die Choreografie; Daten, Audio und Aufräumen gehören der
 * Laufzeit in `ui/showcase.ts`.
 */

export type ShowcasePosition = 'top' | 'bottom' | 'auto';

export type ShowcaseStep =
  | { type: 'say'; textKey: string; selector?: string; ms?: number; position?: ShowcasePosition }
  | { type: 'run'; action: string }
  | { type: 'click'; selector: string }
  | { type: 'wait'; ms: number };

export interface ShowcaseStory {
  id: string;
  icon: string;
  titleKey: string;
  blurbKey: string;
  duration: number;
  steps: ShowcaseStep[];
}

export const SHOWCASE_STORIES: readonly ShowcaseStory[] = Object.freeze([
  {
    id: 'core',
    icon: '🎯',
    titleKey: 'showcase.core.title',
    blurbKey: 'showcase.core.blurb',
    duration: 54,
    steps: [
      { type: 'run', action: 'prepareEmptyMachine' },
      { type: 'say', textKey: 'showcase.core.intro', selector: '.maschine-kopf', ms: 3100 },
      {
        type: 'say',
        textKey: 'showcase.core.reference',
        selector: '.maschine-aktion',
        ms: 3600,
      },
      { type: 'run', action: 'recordReference' },
      {
        type: 'say',
        textKey: 'showcase.core.fingerprint',
        selector: '.maschine-fingerabdruck',
        ms: 3900,
      },
      {
        type: 'say',
        textKey: 'showcase.core.countercheck',
        selector: '.maschine-aktion',
        ms: 3400,
      },
      { type: 'run', action: 'showDeviation' },
      {
        type: 'say',
        textKey: 'showcase.core.result',
        selector: '.maschine-urteil',
        ms: 4300,
      },
      {
        type: 'say',
        textKey: 'showcase.core.history',
        selector: '.maschine-verlauf',
        ms: 3600,
      },
    ],
  },
  {
    id: 'difference',
    icon: '🎧',
    titleKey: 'showcase.difference.title',
    blurbKey: 'showcase.difference.blurb',
    duration: 43,
    steps: [
      { type: 'run', action: 'prepareDeviation' },
      {
        type: 'say',
        textKey: 'showcase.difference.intro',
        selector: '.maschine-ergebnissatz',
        ms: 3200,
      },
      { type: 'click', selector: '.maschine-aktion' },
      { type: 'wait', ms: 700 },
      {
        type: 'say',
        textKey: 'showcase.difference.sources',
        selector: '.klangbild-quellen',
        ms: 3900,
      },
      { type: 'run', action: 'selectDifferenceSource' },
      {
        type: 'say',
        textKey: 'showcase.difference.listen',
        selector: '.hoerlupe',
        ms: 4200,
      },
      { type: 'click', selector: '#tab-button-dreid' },
      { type: 'wait', ms: 850 },
      {
        type: 'say',
        textKey: 'showcase.difference.threeD',
        selector: '#tab-dreid',
        ms: 3900,
      },
      { type: 'say', textKey: 'showcase.difference.limit', ms: 3900 },
    ],
  },
  {
    id: 'import',
    icon: '🎞️',
    titleKey: 'showcase.import.title',
    blurbKey: 'showcase.import.blurb',
    duration: 42,
    steps: [
      { type: 'run', action: 'showMap' },
      {
        type: 'say',
        textKey: 'showcase.import.intro',
        selector: '#btn-schnellcheck',
        ms: 3600,
      },
      { type: 'run', action: 'showImportedSound' },
      {
        type: 'say',
        textKey: 'showcase.import.preview',
        selector: '.klangbild',
        ms: 3900,
      },
      {
        type: 'say',
        textKey: 'showcase.import.noReference',
        selector: '#tab-button-briefing',
        ms: 4300,
      },
      { type: 'click', selector: '#tab-button-briefing' },
      { type: 'wait', ms: 500 },
      {
        type: 'say',
        textKey: 'showcase.import.honest',
        selector: '#tab-briefing',
        ms: 4200,
      },
    ],
  },
  {
    id: 'recognition',
    icon: '🎙️',
    titleKey: 'showcase.recognition.title',
    blurbKey: 'showcase.recognition.blurb',
    duration: 37,
    steps: [
      { type: 'run', action: 'prepareReferenceOnMap' },
      {
        type: 'say',
        textKey: 'showcase.recognition.intro',
        selector: '#btn-sound-detect',
        ms: 3900,
      },
      { type: 'run', action: 'showListening' },
      { type: 'wait', ms: 1000 },
      { type: 'run', action: 'showRecognized' },
      {
        type: 'say',
        textKey: 'showcase.recognition.match',
        selector: '#machine-recognized-modal .recognized-content',
        ms: 4200,
      },
      {
        type: 'say',
        textKey: 'showcase.recognition.boundary',
        selector: '#recognized-different-btn',
        ms: 4200,
      },
    ],
  },
  {
    id: 'briefing',
    icon: '📦',
    titleKey: 'showcase.briefing.title',
    blurbKey: 'showcase.briefing.blurb',
    duration: 49,
    steps: [
      { type: 'run', action: 'prepareDeviation' },
      { type: 'click', selector: '.maschine-aktion' },
      { type: 'wait', ms: 600 },
      { type: 'click', selector: '#tab-button-briefing' },
      { type: 'wait', ms: 450 },
      {
        type: 'say',
        textKey: 'showcase.briefing.intro',
        selector: '#tab-briefing',
        ms: 3600,
      },
      { type: 'click', selector: '.blatt-briefing-knopf' },
      { type: 'wait', ms: 500 },
      {
        type: 'say',
        textKey: 'showcase.briefing.context',
        selector: '.analysepaket-inhalt',
        ms: 4300,
      },
      {
        type: 'say',
        textKey: 'showcase.briefing.local',
        selector: '.analysepaket-lokal',
        ms: 4300,
      },
      {
        type: 'say',
        textKey: 'showcase.briefing.handoff',
        selector: '.analysepaket-erstellen',
        ms: 4300,
      },
    ],
  },
]);

export function showcaseStory(id: string): ShowcaseStory | undefined {
  return SHOWCASE_STORIES.find((story) => story.id === id);
}
