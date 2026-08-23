export function isIOS(): boolean {
  /**
   * Ohne Browser ist nichts iOS — und vor allem: dann stürzt hier nichts ab.
   *
   * Diese Funktion wird auf **Modulebene** ausgewertet (`audioHelper.ts`,
   * `signalThreshold: isIOS()`). Sie lief damit bei jedem Import der Kette, und
   * ein fehlendes `navigator` riss nicht einen Aufruf um, sondern das Laden des
   * ganzen Moduls.
   *
   * Gefunden am 23.08.2026 in der CI, nicht hier: Sie läuft auf **Node 20**,
   * das kein globales `navigator` kennt. Node 21 hat eines eingeführt, und der
   * Entwicklungsrechner lief auf Node 22 — derselbe Befehl `npm run test:run`,
   * grün hier, rot dort. Ein Test, der `2-Reference.ts` importierte, brachte
   * das ans Licht.
   */
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  // Prüft auf iPhone/iPad UserAgent oder Mac mit Touch (iPadOS 13+)
  return (
    [
      'iPad Simulator',
      'iPhone Simulator',
      'iPod Simulator',
      'iPad',
      'iPhone',
      'iPod',
    ].includes(navigator.platform) ||
    (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
  );
}
