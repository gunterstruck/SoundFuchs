/**
 * ZANOBOT · Mess-Labor — Einstieg über die Adresse (`?labor`)
 *
 * Das Mess-Labor ist in der Produkt-Oberfläche absichtlich versteckt
 * (#mess-labor-entry bleibt `hidden`). Für Messungen lässt es sich trotzdem
 * öffnen, indem man die Seite mit dem Parameter `?labor` aufruft, z. B.
 *
 *   https://<host>/?labor
 *
 * Bewusst ein Query-Parameter und keine Hash-Route: Der HashRouter verarbeitet
 * `#/…` für Maschinen-, Flotten- und Import-Links; `?labor` kommt ihm nicht in
 * die Quere und lässt sich mit jedem Hash kombinieren.
 *
 * Diese Datei ist klein und importiert das Labor NUR dynamisch — der Haupt-
 * Bundle bleibt frei vom Labor, bis jemand `?labor` aufruft. Kein sichtbarer
 * Knopf, die normale Oberfläche bleibt unverändert.
 */

/** Name des Adress-Parameters, der das Labor öffnet. */
export const LABOR_PARAM = 'labor';

/** Hinweis, wenn das Gerät für das Labor nicht geeignet ist. */
export const LABOR_UNSUPPORTED_HINT =
  'Das Mess-Labor läuft nur am Desktop-Browser (mind. 900 px breit, mit Ordnerauswahl).';

/** Ist `?labor` in der Adresse gesetzt? (`?labor=0` / `?labor=false` schalten ab.) */
export function wantsMessLabor(search: string): boolean {
  const params = new URLSearchParams(search);
  if (!params.has(LABOR_PARAM)) return false;
  const v = (params.get(LABOR_PARAM) ?? '').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'nein';
}

/** Was das lazy geladene Labor-Modul liefern muss. */
export interface MessLaborModule {
  isMessLaborSupported(): boolean;
  launchMessLabor(): void;
}

export interface MessLaborUrlDeps {
  /** `location.search` (Standard: aktuelle Adresse). */
  search?: string;
  /** Lädt das Labor-Modul (Standard: dynamischer Import, code-split). */
  load?: () => Promise<MessLaborModule>;
  /** Zeigt den kurzen Hinweis bei ungeeignetem Gerät. */
  hint?: (message: string) => void;
}

export type MessLaborUrlOutcome = 'none' | 'opened' | 'unsupported';

/**
 * Öffnet das Mess-Labor direkt, wenn `?labor` gesetzt ist — nur am Desktop
 * (isMessLaborSupported), sonst nur ein kurzer Hinweis.
 */
export async function openMessLaborFromUrl(deps: MessLaborUrlDeps = {}): Promise<MessLaborUrlOutcome> {
  const search = deps.search ?? (typeof location !== 'undefined' ? location.search : '');
  if (!wantsMessLabor(search)) return 'none';
  const load = deps.load ?? (() => import('./index.js'));
  const lab = await load();
  if (!lab.isMessLaborSupported()) {
    deps.hint?.(LABOR_UNSUPPORTED_HINT);
    return 'unsupported';
  }
  lab.launchMessLabor();
  return 'opened';
}
