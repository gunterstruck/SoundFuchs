/**
 * ZANOBOT · Mess-Labor — lazy entry point.
 *
 * Everything below this file (benchmark runner, engines wrapper, UI, TF.js when
 * YAMNet is selected) is reached only through dynamic import(), so the whole lab
 * is code-split out of the main bundle and costs nothing until opened.
 */

import { MessLaborView, isMessLaborSupported } from './MessLaborView.js';

let activeView: MessLaborView | null = null;

/** Open the Mess-Labor overlay (singleton). */
export function launchMessLabor(): void {
  if (activeView) return;
  activeView = new MessLaborView();
  activeView.open();
}

export { isMessLaborSupported };
