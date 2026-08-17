/**
 * DIE ZUSTANDSMASCHINE DER MASCHINENEBENE
 *
 * Eine Maschine ist eine eigene Arbeitsebene, kein Abschnitt am Ende einer
 * langen Bestandsseite. Diese Datei sagt, in welchem Zustand sie sich befindet
 * und welche **eine** Handlung dort dominant ist.
 *
 * ## Warum das hier steht und nicht im DOM
 *
 * Bisher lag der Zustand verstreut in `style.display`-Schaltungen über drei
 * Phasen-Dateien. Gemessen am 16.08.2026 standen dadurch hinter dem Scharnier
 * 130 Maschinenzeilen, 178 fokussierbare Elemente und ein Arbeitsbereich von
 * 10 174 px — und mittendrin die eine Handlung, um die es ging.
 *
 * Wo der Zustand im DOM liegt, kann man ihn nicht prüfen, ohne einen Browser
 * zu starten; und man kann nicht ausschließen, dass zwei Schaltungen einander
 * widersprechen. Hier ist er ein Wert: rein, aufzählbar, testbar.
 *
 * ## Die Regel, die das Ganze trägt
 *
 * **Pro Zustand genau eine dominante Handlung.** Nicht „möglichst wenige",
 * sondern genau eine. Alles andere ist sekundär oder gar nicht da. Die
 * Zustandsmaschine kann diese Regel nicht nur einhalten, sie kann sie
 * *beweisen* — `handlungFuer()` gibt genau eine zurück, und der Test geht
 * jeden Zustand durch.
 *
 * ## Ein Zustand, zwei Gesichter
 *
 * Mobile und Schreibtisch benutzen dieselbe Maschine. Was sich unterscheidet,
 * ist die Anordnung — nie der Ablauf. Zwei Abläufe in zwei Oberflächen sind
 * zwei Produkte, die auseinanderlaufen, sobald jemand nur eines anfasst.
 */

/** Die Zustände der Maschinenebene. Mehr gibt es nicht. */
export const ZUSTAENDE = [
  /** Kein Normalzustand hinterlegt — es gibt nichts, womit man vergleichen könnte. */
  'untrained',
  /** Normalzustand da, Prüfung möglich. Der Alltagsfall. */
  'ready',
  /** Der Normalzustand wird gerade aufgenommen. */
  'capturing-reference',
  /** Eine Prüfung wird gerade aufgenommen. */
  'capturing-check',
  /** Aufnahme fertig, Auswertung läuft. */
  'processing',
  /** Ergebnis: klingt wie der Normalzustand. */
  'result-similar',
  /** Ergebnis: klingt deutlich anders. */
  'result-deviating',
  /** Das Mikrofon ist nicht freigegeben. */
  'permission-blocked',
  /** Die Aufnahme taugt nicht zum Vergleichen. */
  'quality-insufficient',
  /** Kein Netz — für alles, was Netz braucht. */
  'offline',
] as const;

export type Maschinenzustand = (typeof ZUSTAENDE)[number];

/**
 * Was der Nutzer in diesem Zustand tun soll.
 *
 * `schluessel` ist der Übersetzungsschlüssel, nicht der Text: Die Oberfläche
 * spricht fünf Sprachen, die Zustandsmaschine keine.
 *
 * `art` unterscheidet nicht Farbe, sondern Bedeutung. `weiter` ist der
 * Fortschritt, `abbruch` der Notausgang, `beheben` der Weg aus einer Sackgasse
 * heraus. Nur `weiter` und `beheben` dürfen dominant aussehen.
 */
export interface Handlung {
  schluessel: string;
  art: 'weiter' | 'abbruch' | 'beheben';
}

/** Wie es der Maschine geht — die Eingaben, aus denen sich der Zustand ergibt. */
export interface Lage {
  /** Hat die Maschine mindestens einen hinterlegten Normalzustand? */
  hatNormalzustand: boolean;
  /** Läuft gerade eine Aufnahme, und wenn ja, welche? */
  nimmtAuf?: 'referenz' | 'pruefung' | null;
  /** Wird gerade ausgewertet? */
  rechnet?: boolean;
  /**
   * Das letzte Ergebnis dieser Sitzung, 0–100. `null`, solange keines vorliegt.
   * Ein Wert aus der Datenbank zählt hier NICHT — die Ebene öffnet sich im
   * Zustand `ready`, nicht in einem Ergebnis von vorgestern.
   */
  ergebnis?: number | null;
  /** Das Mikrofon wurde abgelehnt. */
  mikrofonAbgelehnt?: boolean;
  /** Die letzte Aufnahme taugte nicht. */
  aufnahmeUntauglich?: boolean;
  /** Kein Netz. */
  offline?: boolean;
}

/**
 * Ab hier gilt eine Messung als „klingt wie der Normalzustand".
 *
 * Dieselbe Schwelle wie im Bestand (`zustandZuWert` in
 * `services/bestandsuebersicht.ts`): 75. Zwei Schwellen für dieselbe Frage
 * wären zwei Antworten, und die Karte würde grün zeigen, wo die Maschinenebene
 * „anders" sagt.
 */
export const AEHNLICH_AB = 75;

/**
 * Aus der Lage den Zustand ableiten.
 *
 * Die Reihenfolge ist die Aussage. Was den Nutzer blockiert, kommt zuerst —
 * ein abgelehntes Mikrofon ist wichtiger als die Frage, ob ein Normalzustand
 * vorliegt, weil ohne Mikrofon beides nicht geht. Danach kommt, was gerade
 * läuft, danach das Ergebnis, und zuletzt der Ruhezustand.
 */
export function zustandAus(lage: Lage): Maschinenzustand {
  if (lage.mikrofonAbgelehnt) return 'permission-blocked';
  if (lage.nimmtAuf === 'referenz') return 'capturing-reference';
  if (lage.nimmtAuf === 'pruefung') return 'capturing-check';
  if (lage.rechnet) return 'processing';
  if (lage.aufnahmeUntauglich) return 'quality-insufficient';
  if (lage.offline) return 'offline';
  if (lage.ergebnis !== null && lage.ergebnis !== undefined) {
    return lage.ergebnis >= AEHNLICH_AB ? 'result-similar' : 'result-deviating';
  }
  return lage.hatNormalzustand ? 'ready' : 'untrained';
}

/**
 * Die eine dominante Handlung eines Zustands.
 *
 * Genau eine, immer. Es gibt keinen Zustand, in dem der Nutzer zwei
 * gleichrangige Angebote bekommt — das ist die Regel, um die es in diesem
 * Umbau geht, und sie steht hier als Funktion, damit ein Test sie durchgehen
 * kann.
 */
export function handlungFuer(zustand: Maschinenzustand): Handlung {
  switch (zustand) {
    case 'untrained':
      return { schluessel: 'maschine.aktionReferenz', art: 'weiter' };
    case 'ready':
      return { schluessel: 'maschine.aktionPruefen', art: 'weiter' };
    case 'capturing-reference':
    case 'capturing-check':
      // Während der Aufnahme ist „Stoppen" der Notausgang, nicht das Ziel:
      // Die Messung endet von selbst, sobald genug stabiles Signal da ist.
      return { schluessel: 'maschine.aktionStoppen', art: 'abbruch' };
    case 'processing':
      // Nichts zu tun — aber es muss etwas dastehen, sonst wirkt die Fläche
      // wie eingefroren. Der „Knopf" ist hier eine Auskunft, kein Angebot.
      return { schluessel: 'maschine.aktionRechnet', art: 'weiter' };
    case 'result-similar':
      return { schluessel: 'maschine.aktionFertig', art: 'weiter' };
    case 'result-deviating':
      // Der Wow-Moment: Bei einer Abweichung ist der hörbare Unterschied das
      // Ziel, nicht die Zahl daneben.
      return { schluessel: 'maschine.aktionUnterschied', art: 'weiter' };
    case 'permission-blocked':
      return { schluessel: 'maschine.aktionMikrofon', art: 'beheben' };
    case 'quality-insufficient':
      return { schluessel: 'maschine.aktionWiederholen', art: 'beheben' };
    case 'offline':
      return { schluessel: 'maschine.aktionErneut', art: 'beheben' };
  }
}

/**
 * Darf die Ebene in diesem Zustand verlassen werden?
 *
 * Während einer laufenden Aufnahme nicht ohne Weiteres: Der Rückweg würde das
 * Mikrofon mitten im Satz abschalten, und der Nutzer stünde ohne Ergebnis da,
 * ohne zu wissen, warum. Der Notausgang heißt „Stoppen" und steht daneben.
 */
export function darfZurueck(zustand: Maschinenzustand): boolean {
  return zustand !== 'capturing-reference' && zustand !== 'capturing-check';
}

/** Steht in diesem Zustand ein Ergebnis im Bild? */
export function istErgebnis(zustand: Maschinenzustand): boolean {
  return zustand === 'result-similar' || zustand === 'result-deviating';
}

/** Läuft gerade eine Aufnahme? */
export function nimmtAuf(zustand: Maschinenzustand): boolean {
  return zustand === 'capturing-reference' || zustand === 'capturing-check';
}
