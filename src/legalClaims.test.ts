import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Wächter gegen Zusicherungen.
 *
 * Hintergrund: Ein Satz über eine angeblich durchgeführte rechtliche Prüfung
 * lag über sechs Stellen und fünf Sprachen verteilt – in einer Fassung sogar
 * schärfer formuliert als in allen anderen. So etwas findet man beim Aufräumen
 * einmal und beim nächsten Textzuwachs wieder nicht.
 *
 * Die Trennlinie, die dieses Projekt zieht:
 *
 *   Beschreibungen bleiben.  „läuft vollständig offline", „verwendet offen
 *                            beschriebene Verfahren", die IP-Tabelle
 *   Zusicherungen gehen.     „wurde geprüft", „verletzt keine Patente",
 *                            „frei von Schutzrechtskonflikten"
 *
 * Der Unterschied ist nicht Kosmetik: Eine Beschreibung kann man belegen, eine
 * schutzrechtliche Zusicherung kann niemand über sich selbst abgeben. Wer es
 * trotzdem tut, erzeugt genau die Prüfung, die er vermeiden wollte.
 */

const lies = (datei: string) => readFileSync(resolve(process.cwd(), datei), 'utf8');

/**
 * Die nach außen sichtbaren Textquellen. Bewusst NICHT die Rückblicke unter
 * `docs/RUECKBLICK_*`: Das sind Protokolle vergangener Stände. Was dort steht,
 * war einmal so – es zu ändern hieße, die eigene Geschichte zu schönen.
 */
const QUELLEN = [
  'README.md',
  'NOTICE',
  'index.html',
  'docs/about-soundfuchs.md',
  'src/i18n/locales/de.ts',
  'src/i18n/locales/en.ts',
  'src/i18n/locales/es.ts',
  'src/i18n/locales/fr.ts',
  'src/i18n/locales/zh.ts',
];

/** Jede Wendung mit dem Grund, warum sie nicht dastehen darf. */
const VERBOTEN: Array<{ muster: RegExp; grund: string }> = [
  {
    // Wortgrenze davor: „schutzrechtliche Bewertung" ist die AB­LEHNUNG einer
    // solchen Aussage und muss stehen bleiben dürfen. Ohne `\b` fing dieses
    // Muster ausgerechnet den Satz, der die Grenze zieht.
    muster: /\brechtlich(e|en)?\s+(Prüfung|Überprüfung|Bewertung)/i,
    grund: 'Behauptet eine durchgeführte rechtliche Prüfung.',
  },
  {
    muster: /IP-?(Überprüfung|Prüfung)|IP\s+Review/i,
    grund: 'Behauptet eine durchgeführte Schutzrechtsprüfung.',
  },
  {
    muster: /Freedom[-\s]to[-\s]Operate|Design-to-FTO/i,
    grund: 'Fachbegriff der Patentpraxis – klingt wie ein Prüfungsergebnis.',
  },
  {
    muster: /Schutzrechtskonflikt/i,
    grund: 'Aussage über die Schutzrechtslage.',
  },
  {
    muster: /verletzt\s+(dabei\s+)?(nach\s+aktuellem\s+Stand\s+)?kein/i,
    grund: 'Nichtverletzungsaussage – kann niemand über sich selbst treffen.',
  },
  {
    muster: /rechtlich\s+unbedenklich|Lizenzsicherheit/i,
    grund: 'Rechtliche Unbedenklichkeitsaussage.',
  },
  {
    muster: /patentkritisch/i,
    grund: 'Bewertet fremde Schutzrechte statt die eigene Bauweise zu beschreiben.',
  },
  {
    muster: /Siemens-intern/i,
    grund: 'Nennt interne Methoden eines Unternehmens als Prüfmaßstab.',
  },
  // --- Dieselben Aussagen in den anderen vier Sprachen ---
  //
  // Nicht optional: Der Satz, der gestern entfernt wurde, stand in fünf
  // Sprachen. Ein Wächter, der nur Deutsch kann, hätte vier davon durchgelassen
  // – und die Gegenprobe mit der französischen Fassung lief in der ersten
  // Version dieses Tests tatsächlich grün durch.
  {
    muster: /Legal\s+Position|IP\s+Review|patent\s+(review|clearance)/i,
    grund: 'Englische Fassung einer Prüfungs- oder Rechtslage-Aussage.',
  },
  {
    muster: /Posición\s+legal|revisión\s+de\s+propiedad\s+intelectual/i,
    grund: 'Spanische Fassung einer Prüfungs- oder Rechtslage-Aussage.',
  },
  {
    muster: /Position\s+juridique|examen\s+de\s+la\s+propriété\s+intellectuelle/i,
    grund: 'Französische Fassung einer Prüfungs- oder Rechtslage-Aussage.',
  },
  {
    muster: /法律地位|知识产权审查|法律审查/,
    grund: 'Chinesische Fassung einer Prüfungs- oder Rechtslage-Aussage.',
  },
  {
    muster: /does\s+not\s+infringe|no\s+infringe\b|ne\s+porte\s+pas\s+atteinte|不侵犯/i,
    grund: 'Nichtverletzungsaussage in einer der Übersetzungen.',
  },
  {
    muster: /PROMPT-BEGIN|Interpretationserwartung/i,
    grund:
      'Verstecktes Prompt an Analysesysteme. Für Leser unsichtbar, für Maschinen sichtbar – ' +
      'das liest sich als Versuch, eine Prüfung zu lenken, und wird als solcher gefunden.',
  },
];

describe('Keine Zusicherungen in den Projekttexten', () => {
  for (const datei of QUELLEN) {
    it(`${datei} enthält keine rechtlichen Zusicherungen`, () => {
      const text = lies(datei);
      const treffer = VERBOTEN.filter(({ muster }) => muster.test(text)).map(
        ({ muster, grund }) => `${muster.source} → ${grund}`
      );
      expect(treffer).toEqual([]);
    });
  }

  it('hat die Lizenz als Text, nicht nur als Behauptung', () => {
    // „Lizenz: MIT" im README ist eine Angabe. Ohne LICENSE-Datei fehlt der
    // Text, auf den sie sich beruft – und ohne den weiß ein Fork nicht, was
    // ihm erlaubt ist.
    const lizenz = lies('LICENSE');
    expect(lizenz).toContain('MIT License');
    expect(lizenz).toContain('Copyright (c) 2026 Günter Struck');
    expect(lizenz).toContain(
      'The above copyright notice and this permission notice shall be included'
    );
    expect(lizenz).toContain('WITHOUT WARRANTY OF ANY KIND');

    const pkg = JSON.parse(lies('package.json')) as { license?: string };
    expect(pkg.license).toBe('MIT');
    expect(lies('README.md')).toContain('LICENSE');
  });

  it('hält im NOTICE fest, was Zanobo ausdrücklich nicht ist', () => {
    // Die wichtigste Grenze des Projekts steht sonst nur im README – und das
    // liest niemand, der forkt.
    const notice = lies('NOTICE');
    expect(notice).toMatch(/privates Projekt/i);
    expect(notice).toMatch(/unentgeltlich/i);
    expect(notice).toMatch(/kein(en)? Support/i);
    expect(notice).toMatch(/KEIN medizinisches Ger(ae|ä)t/i);
    expect(notice).toMatch(/KEIN technisches Diagnosesystem/i);
    expect(notice).toMatch(/Interpretationshoheit/i);
  });

  it('behält die beschreibenden Teile, die tatsächlich tragen', () => {
    // Gegenprobe zur Regel: Der Wächter darf nicht dazu führen, dass am Ende
    // gar nichts mehr dasteht. Diese Aussagen sind belegbar und bleiben.
    const readme = lies('README.md');
    expect(readme).toContain('offen beschriebenen mathematischen Verfahren');
    expect(readme).toContain('MIT-Lizenz');
    // Die IP-Tabelle ist eine Beschreibung der eigenen Abgrenzung, kein Urteil.
    expect(readme).toContain('Relevante IP und technische Abgrenzung');
    expect(readme).toContain('keine schutzrechtliche Bewertung');
  });
});
