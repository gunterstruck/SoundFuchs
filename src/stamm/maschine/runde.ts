/**
 * DIE RUNDE — WAS IN DIESEM BESUCH SCHON GEPRÜFT IST
 *
 * Seit §S4j bietet die Maschinenseite nach einem Ergebnis an, was ohnehin als
 * Nächstes drankommt: „▸ Nächste: Kompressor 3". Welche das ist, entschied
 * allein die Datenbank — was am längsten nicht geprüft wurde, kommt dran.
 *
 * Damit endete die Runde nie. An einem Standort mit vier Maschinen zeigte sie
 * nach der vierten wieder auf die erste: Die war ja inzwischen die mit der
 * ältesten Prüfung. Ein Karussell, keine Runde.
 *
 * ## Was hier steht
 *
 * Der Unterschied zwischen „lange nicht geprüft" und „gerade eben von mir
 * geprüft" steht nicht in der Datenbank — er ist eine Tatsache über **diesen
 * Besuch**. Also steht er hier, für die Dauer des Besuchs.
 *
 * ## Wann eine Runde neu beginnt
 *
 * Beim Betreten eines anderen Standorts und beim Verlassen der Tiefe. Wer die
 * Maschinen eines Standorts durchgeht, geht eine Runde; wer den Standort
 * verlässt, hat sie beendet — ob vollständig oder nicht. Eine Runde, die über
 * das Verlassen hinweg weiterläuft, wäre eine Buchführung, die niemand
 * angefangen hat.
 */

/** Der Standort, dessen Runde gerade läuft, und was darin erledigt ist. */
let laufend: { standortId: string; erledigt: Set<string> } | null = null;

/**
 * Einen Standort betreten.
 *
 * Ist es ein anderer als der laufende, beginnt eine neue Runde. Ist es
 * derselbe, läuft die alte weiter — sonst setzte jeder Wechsel zwischen
 * Standort- und Maschinenebene die Runde zurück.
 */
export function standortBetreten(standortId: string | null): void {
  if (!standortId) {
    laufend = null;
    return;
  }
  if (laufend?.standortId !== standortId) {
    laufend = { standortId, erledigt: new Set() };
  }
}

/** Die Tiefe ist zu — die Runde ist vorbei, vollständig oder nicht. */
export function rundeBeenden(): void {
  laufend = null;
}

/** Eine Maschine wurde in dieser Runde geprüft. */
export function merkeGeprueft(standortId: string | null, maschinenId: string): void {
  if (!standortId) return;
  standortBetreten(standortId);
  laufend?.erledigt.add(maschinenId);
}

/** Was in dieser Runde schon erledigt ist. */
export function erledigte(standortId: string | null): ReadonlySet<string> {
  if (!standortId || laufend?.standortId !== standortId) return new Set();
  return laufend.erledigt;
}

/** Ein Kandidat für die Runde: eine Maschine und wann sie zuletzt geprüft wurde. */
export interface Kandidat<T> {
  maschine: T & { id: string; name: string };
  /** Zeitpunkt der letzten Prüfung aus der Ablage, oder `null`. */
  zuletzt: number | null;
}

/**
 * Wer als Nächstes drankommt — und ob überhaupt noch jemand.
 *
 * Reihenfolge wie in der Standortliste: Was noch nie geprüft wurde zuerst,
 * danach das am längsten Zurückliegende, bei Gleichstand der Name. Was in
 * DIESER Runde schon dran war, fällt heraus — das ist der ganze Unterschied
 * zur Datenbankfrage.
 *
 * Rein und ohne Ablage, damit die Entscheidung prüfbar ist, ohne einen Browser
 * zu starten.
 */
export function naechsteInDerRunde<T>(
  kandidaten: Array<Kandidat<T>>,
  erledigt: ReadonlySet<string>
): (T & { id: string; name: string }) | null {
  const offen = kandidaten.filter((k) => !erledigt.has(k.maschine.id));
  if (offen.length === 0) return null;
  const sortiert = [...offen].sort((a, b) => {
    if (a.zuletzt === null && b.zuletzt === null)
      return a.maschine.name.localeCompare(b.maschine.name);
    if (a.zuletzt === null) return -1;
    if (b.zuletzt === null) return 1;
    if (a.zuletzt !== b.zuletzt) return a.zuletzt - b.zuletzt;
    return a.maschine.name.localeCompare(b.maschine.name);
  });
  return sortiert[0]?.maschine ?? null;
}
