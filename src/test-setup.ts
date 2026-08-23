/**
 * DIE TESTS LAUFEN UNTER DENSELBEN BEDINGUNGEN WIE DIE CI
 *
 * ## Der Anlass
 *
 * Am 23.08.2026 lief `npm run test:run` hier grün und in der CI rot — mit
 * demselben Befehl, demselben Quelltext, demselben Vitest:
 *
 *     hier   Node v22.22.2   →  774 bestanden
 *     CI     Node 20         →  ReferenceError: navigator is not defined
 *
 * **Node 21 hat ein globales `navigator` eingeführt.** Node 20 hat keines. Ein
 * Modul, das auf Modulebene `navigator` liest (`audioHelper.ts` rief dort
 * `isIOS()` auf), lädt auf der einen Fassung und stürzt auf der anderen — und
 * der Entwicklungsrechner sah davon nichts.
 *
 * Drei Zusammenführungen gingen so mit roter CI durch, weil ich meine eigenen
 * Wächter für die ganze Wahrheit gehalten habe.
 *
 * ## Was diese Datei tut
 *
 * Sie nimmt dem Testlauf genau die Globals weg, die die CI-Fassung von Node
 * auch nicht hat. Damit ist `npm run test:run` hier **dieselbe Prüfung** wie
 * dort — und ein Modul, das ohne Browser nicht geladen werden kann, fällt
 * beim ersten Lauf auf, nicht erst nach dem Zusammenführen.
 *
 * Sie ist bewusst klein und ohne Bedingungen: Was die CI nicht hat, hat der
 * Testlauf hier auch nicht. Wer `navigator` in einem Test wirklich braucht,
 * baut ihn sich im Test selbst — dann steht im Test, dass er ihn braucht.
 */

const globals = globalThis as Record<string, unknown>;

/**
 * `navigator` — seit Node 21 global, in Node 20 nicht.
 *
 * Das ist der gemessene Unterschied. Alles andere hier ist Vorsorge derselben
 * Art: Wer eine Browser-Umgebung braucht, soll das sagen müssen.
 */
delete globals.navigator;
