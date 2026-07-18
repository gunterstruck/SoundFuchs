/**
 * ZANOBOT - REFERENCE LABEL TYPE MODAL
 *
 * The "name this state / healthy or faulty?" modal used when training an
 * additional reference state, extracted from the Reference phase. Self-contained
 * (DOM + i18n only, no phase state); resolves to the chosen label + type, or
 * null when cancelled.
 */

import { notify } from '@utils/notifications.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';

export function showLabelTypeModal(): Promise<{
  label: string;
  type: 'healthy' | 'faulty';
} | null> {
  return new Promise((resolve) => {
    const modal = document.getElementById('reference-label-modal');
    const input = document.getElementById('reference-label-input') as HTMLInputElement | null;
    const healthyBtn = document.getElementById('reference-type-healthy');
    const faultyBtn = document.getElementById('reference-type-faulty');
    const saveBtn = document.getElementById('reference-label-save-btn');
    const cancelBtn = document.getElementById('reference-label-cancel-btn');
    const closeBtn = document.getElementById('close-reference-label-modal');

    if (!modal || !input || !healthyBtn || !faultyBtn || !saveBtn || !cancelBtn) {
      logger.error('Reference label modal elements not found in DOM');
      resolve(null);
      return;
    }

    let selectedType: 'healthy' | 'faulty' = 'healthy';
    const setType = (type: 'healthy' | 'faulty') => {
      selectedType = type;
      healthyBtn.classList.toggle('active', type === 'healthy');
      faultyBtn.classList.toggle('active', type === 'faulty');
    };
    setType('healthy');
    input.value = '';

    const finish = (result: { label: string; type: 'healthy' | 'faulty' } | null) => {
      modal.style.display = 'none';
      resolve(result);
    };

    healthyBtn.onclick = () => setType('healthy');
    faultyBtn.onclick = () => setType('faulty');
    cancelBtn.onclick = () => finish(null);
    if (closeBtn) closeBtn.onclick = () => finish(null);
    modal.onclick = (e) => {
      if (e.target === modal) finish(null);
    };

    const MAX_LABEL_LENGTH = 50;
    const trySave = () => {
      // CRITICAL FIX: Validate and sanitize user input to prevent issues
      // - Remove control characters and excessive whitespace
      // - Limit length to prevent UI overflow
      // eslint-disable-next-line no-control-regex -- intentionally stripping control chars
      const controlCharsRegex = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');
      const sanitized = input.value
        .trim()
        .replace(controlCharsRegex, '')
        .replace(/\s+/g, ' ')
        .slice(0, MAX_LABEL_LENGTH);

      if (!sanitized) {
        notify.warning(t('reference.labels.enterName'));
        input.focus();
        return;
      }

      finish({ label: sanitized, type: selectedType });
    };
    saveBtn.onclick = trySave;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') trySave();
    };

    modal.style.display = 'flex';
    requestAnimationFrame(() => input.focus());
  });
}
