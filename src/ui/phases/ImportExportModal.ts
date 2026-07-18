/**
 * ZANOBOT - IMPORT / EXPORT OPTIONS MODAL
 *
 * Small confirmation dialogs shown before a database export or import, letting
 * the user decide whether the app SETTINGS (banner image, banner text, view
 * level, thresholds …) travel with the machine data.
 *
 * - Export: opt-in to bundle the current settings into the backup file.
 * - Import: machines are always ADDED to the existing database (merge); if the
 *   file carries settings, the user can opt-in to apply them too.
 *
 * Both functions resolve with the user's choice; `proceed: false` means the
 * dialog was cancelled and the caller should abort.
 */

import { t } from '../../i18n/index.js';

export interface ImportExportChoice {
  /** False when the user cancelled (close / escape / overlay / cancel button). */
  proceed: boolean;
  /** Whether settings should be included (export) or applied (import). */
  includeSettings: boolean;
}

interface ModalConfig {
  title: string;
  description: string;
  /** Settings opt-in checkbox; omitted when there is nothing to offer. */
  option?: {
    label: string;
    hint: string;
    defaultChecked: boolean;
  };
  confirmLabel: string;
}

/**
 * Build and show a generic options modal, resolving with the user's choice.
 * Self-contained: creates the DOM, wires close/escape/overlay/focus handling,
 * and cleans up on resolve.
 */
function showOptionsModal(config: ModalConfig): Promise<ImportExportChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'iox-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'iox-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', config.title);

    // Header
    const header = document.createElement('div');
    header.className = 'iox-modal-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'iox-modal-title';
    titleEl.textContent = config.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'bottomsheet-close iox-modal-close';
    closeBtn.setAttribute('aria-label', t('buttons.close'));
    closeBtn.textContent = '✕';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = 'iox-modal-body';

    const desc = document.createElement('p');
    desc.className = 'iox-modal-desc';
    desc.textContent = config.description;
    body.appendChild(desc);

    let checkbox: HTMLInputElement | null = null;
    if (config.option) {
      const optionLabel = document.createElement('label');
      optionLabel.className = 'iox-modal-option';

      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'iox-modal-checkbox';
      checkbox.checked = config.option.defaultChecked;

      const textWrap = document.createElement('span');
      textWrap.className = 'iox-modal-option-text';

      const optTitle = document.createElement('span');
      optTitle.className = 'iox-modal-option-label';
      optTitle.textContent = config.option.label;

      const optHint = document.createElement('span');
      optHint.className = 'iox-modal-option-hint';
      optHint.textContent = config.option.hint;

      textWrap.appendChild(optTitle);
      textWrap.appendChild(optHint);
      optionLabel.appendChild(checkbox);
      optionLabel.appendChild(textWrap);
      body.appendChild(optionLabel);
    }

    // Actions
    const actions = document.createElement('div');
    actions.className = 'iox-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'iox-modal-cancel-btn';
    cancelBtn.textContent = t('buttons.cancel');

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'action-btn iox-modal-confirm-btn';
    confirmBtn.textContent = config.confirmLabel;

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let settled = false;
    const finish = (choice: ImportExportChoice) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', keydownHandler);
      overlay.remove();
      resolve(choice);
    };

    const cancel = () => finish({ proceed: false, includeSettings: false });
    const confirm = () =>
      finish({ proceed: true, includeSettings: !!checkbox && checkbox.checked });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cancel();
    });
    closeBtn.addEventListener('click', cancel);
    cancelBtn.addEventListener('click', cancel);
    confirmBtn.addEventListener('click', confirm);

    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancel();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', keydownHandler);

    requestAnimationFrame(() => confirmBtn.focus());
  });
}

/**
 * Ask whether the current app settings should be bundled into the export.
 * Defaults to "yes" so a backup is complete unless the user opts out.
 */
export function openExportOptionsModal(): Promise<ImportExportChoice> {
  return showOptionsModal({
    title: t('settings.export.modalTitle'),
    description: t('settings.export.modalDescription'),
    option: {
      label: t('settings.export.includeSettings'),
      hint: t('settings.export.includeSettingsHint'),
      defaultChecked: true,
    },
    confirmLabel: t('settings.export.confirmButton'),
  });
}

/**
 * Confirm an import. Machines are always merged into the existing database;
 * when the file carries settings, offer to apply them too (off by default so
 * local settings are kept unless the user asks).
 *
 * @param hasSettings - whether the backup file contains a settings section
 */
export function openImportOptionsModal(hasSettings: boolean): Promise<ImportExportChoice> {
  return showOptionsModal({
    title: t('settings.import.modalTitle'),
    description: t('settings.import.modalDescription'),
    option: hasSettings
      ? {
          label: t('settings.import.includeSettings'),
          hint: t('settings.import.includeSettingsHint'),
          defaultChecked: false,
        }
      : undefined,
    confirmLabel: t('settings.import.confirmButton'),
  });
}
