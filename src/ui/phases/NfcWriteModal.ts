/**
 * ZANOBOT - NFC WRITE MODAL
 *
 * Self-contained controller for the "Write NFC tag" modal: encodes a shareable
 * URL (app / specific machine / fleet group / count-only Quick-Compare) onto an
 * NFC tag via the Web NFC API, with live URL preview and write status.
 *
 * Extracted from the Identify phase. State (the nfc* DOM refs / selection) lives
 * here; everything it needs from the phase is injected via NfcWriteDeps.
 */

import type { Machine } from '@data/types.js';
import { getAllMachines } from '@data/db.js';
import { ReferenceDbService } from '@data/ReferenceDbService.js';
import { HashRouter, GITHUB_PAGES_BASE_URL } from '../HashRouter.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';

type NDEFRecordInit = {
  recordType: 'url';
  data: string;
};

type NDEFMessageInit = {
  records: NDEFRecordInit[];
};

type NDEFReaderConstructor = new () => {
  write: (message: NDEFMessageInit) => Promise<void>;
};

/** Dependencies the modal needs from the host phase. */
export interface NfcWriteDeps {
  /** The currently selected machine (or null when none is selected). */
  getCurrentMachine: () => Machine | null;
  /** Base application URL (shared with other phase features). */
  getBaseAppUrl: () => string;
}

export class NfcWriteModal {
  private nfcModal: HTMLElement | null = null;
  private nfcStatus: HTMLElement | null = null;
  private nfcWriteBtn: HTMLButtonElement | null = null;
  private nfcGenericOption: HTMLInputElement | null = null;
  private nfcSpecificOption: HTMLInputElement | null = null;
  private nfcSpecificDetail: HTMLElement | null = null;
  private nfcSupportDetails: HTMLElement | null = null;

  private nfcCustomerIdInput: HTMLInputElement | null = null;
  private nfcDbUrlPreview: HTMLElement | null = null;

  private nfcFleetOption: HTMLInputElement | null = null;
  private nfcFleetSection: HTMLElement | null = null;
  private nfcFleetSelect: HTMLSelectElement | null = null;
  private nfcFleetDetail: HTMLElement | null = null;
  private nfcFleetUrlPreview: HTMLElement | null = null;

  private nfcQuickCompareCountOption: HTMLInputElement | null = null;
  private nfcQuickCompareCountDetail: HTMLElement | null = null;
  private nfcQcCountSection: HTMLElement | null = null;
  private nfcQcCountInput: HTMLInputElement | null = null;
  private nfcQcCountUrlPreview: HTMLElement | null = null;
  private nfcQcCountSelectedValue: number = 0;

  constructor(private deps: NfcWriteDeps) {}

  public init(): void {
    const openBtn = document.getElementById('open-nfc-writer-btn') as HTMLButtonElement | null;
    const settingsBtn = document.getElementById(
      'settings-nfc-writer-btn'
    ) as HTMLButtonElement | null;
    const availabilityHint = document.getElementById('nfc-availability-hint');
    const settingsAvailabilityHint = document.getElementById('settings-nfc-availability-hint');

    this.nfcModal = document.getElementById('nfc-writer-modal');
    this.nfcStatus = document.getElementById('nfc-status');
    this.nfcWriteBtn = document.getElementById('nfc-write-btn') as HTMLButtonElement | null;
    this.nfcGenericOption = document.getElementById(
      'nfc-option-generic'
    ) as HTMLInputElement | null;
    this.nfcSpecificOption = document.getElementById(
      'nfc-option-specific'
    ) as HTMLInputElement | null;
    this.nfcSpecificDetail = document.getElementById('nfc-option-specific-detail');
    this.nfcSupportDetails = document.getElementById('nfc-support-details');

    // CustomerId input field for Variante B
    this.nfcCustomerIdInput = document.getElementById(
      'nfc-customer-id-input'
    ) as HTMLInputElement | null;
    this.nfcDbUrlPreview = document.getElementById('nfc-db-url-preview');

    const closeBtn = document.getElementById('close-nfc-writer-modal');
    const cancelBtn = document.getElementById('nfc-cancel-btn');

    const { supported: supportsNfc } = this.getNfcSupportStatus();

    if (openBtn) {
      openBtn.addEventListener('click', () => this.openNfcModal());
    }
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openNfcModal());
    }

    if (availabilityHint) {
      availabilityHint.style.display = supportsNfc ? 'none' : 'block';
    }
    if (settingsAvailabilityHint) {
      settingsAvailabilityHint.style.display = supportsNfc ? 'none' : 'block';
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeNfcModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeNfcModal());
    }
    if (this.nfcModal) {
      this.nfcModal.addEventListener('click', (event) => {
        if (event.target === this.nfcModal) {
          this.closeNfcModal();
        }
      });
    }
    if (this.nfcWriteBtn) {
      this.nfcWriteBtn.addEventListener('click', () => {
        void this.handleNfcWrite();
      });
    }

    // Update DB URL preview when customerId changes
    if (this.nfcCustomerIdInput) {
      this.nfcCustomerIdInput.addEventListener('input', () => {
        this.updateNfcDbUrlPreview();
        this.updateNfcFleetDetail();
      });
    }

    // Fleet option
    this.nfcFleetOption = document.getElementById('nfc-option-fleet') as HTMLInputElement | null;
    this.nfcFleetSection = document.getElementById('nfc-fleet-section');
    this.nfcFleetSelect = document.getElementById('nfc-fleet-select') as HTMLSelectElement | null;
    this.nfcFleetDetail = document.getElementById('nfc-option-fleet-detail');
    this.nfcFleetUrlPreview = document.getElementById('nfc-fleet-url-preview');

    // Quick Compare count-only option
    this.nfcQuickCompareCountOption = document.getElementById(
      'nfc-option-quickcompare-count'
    ) as HTMLInputElement | null;
    this.nfcQuickCompareCountDetail = document.getElementById(
      'nfc-option-quickcompare-count-detail'
    );
    this.nfcQcCountSection = document.getElementById('nfc-qc-count-section');
    this.nfcQcCountInput = document.getElementById('nfc-qc-count-input') as HTMLInputElement | null;
    this.nfcQcCountUrlPreview = document.getElementById('nfc-qc-count-url-preview');

    // Count-only chip buttons
    const nfcCountChips = document.getElementById('nfc-qc-count-chips');
    if (nfcCountChips) {
      nfcCountChips.querySelectorAll('.qc-count-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const count = parseInt((chip as HTMLElement).dataset.count || '0', 10);
          if (count >= 2 && count <= 30) {
            this.nfcQcCountSelectedValue = count;
            // Deselect all chips, select this one
            nfcCountChips
              .querySelectorAll('.qc-count-chip')
              .forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
            if (this.nfcQcCountInput) this.nfcQcCountInput.value = '';
            this.updateNfcQcCountUrlPreview();
          }
        });
      });
    }

    // Count-only custom input
    if (this.nfcQcCountInput) {
      this.nfcQcCountInput.addEventListener('input', () => {
        const val = parseInt(this.nfcQcCountInput!.value, 10);
        nfcCountChips
          ?.querySelectorAll('.qc-count-chip')
          .forEach((c) => c.classList.remove('active'));
        if (!isNaN(val) && val >= 2 && val <= 30) {
          this.nfcQcCountSelectedValue = val;
          // Highlight matching preset chip if it exists
          nfcCountChips?.querySelectorAll('.qc-count-chip').forEach((c) => {
            if ((c as HTMLElement).dataset.count === String(val)) c.classList.add('active');
          });
        } else {
          this.nfcQcCountSelectedValue = 0;
        }
        this.updateNfcQcCountUrlPreview();
      });
    }

    // Show/hide fleet section based on radio selection
    [
      this.nfcGenericOption,
      this.nfcSpecificOption,
      this.nfcFleetOption,
      this.nfcQuickCompareCountOption,
    ].forEach((radio) => {
      radio?.addEventListener('change', () => {
        void (async () => {
          // Await fleet dropdown population BEFORE computing the URL preview,
          // otherwise the preview reads an empty select (race condition)
          await this.updateNfcFleetVisibility();
          this.updateNfcDbUrlPreview();
          this.updateNfcQcCountVisibility();
          // Clear any previous validation error when switching radio options
          this.setNfcStatus('');
        })();
      });
    });

    // Fleet select change
    if (this.nfcFleetSelect) {
      this.nfcFleetSelect.addEventListener('change', () => {
        this.updateNfcFleetDetail();
        this.updateNfcDbUrlPreview();
      });
    }

    this.updateNfcSpecificOption();
  }

  /**
   * Update the DB URL preview based on customerId input
   */
  private updateNfcDbUrlPreview(): void {
    if (!this.nfcDbUrlPreview || !this.nfcCustomerIdInput) {
      return;
    }

    const selectedOption = this.nfcQuickCompareCountOption?.checked
      ? 'quickcompare-count'
      : this.nfcFleetOption?.checked
        ? 'fleet'
        : this.nfcSpecificOption?.checked
          ? 'specific'
          : 'generic';

    // Generic or count-only link: no data URL preview needed
    if (selectedOption === 'generic' || selectedOption === 'quickcompare-count') {
      this.nfcDbUrlPreview.style.display = 'none';
      return;
    }

    const customerId = this.nfcCustomerIdInput.value.trim();
    if (!customerId) {
      this.nfcDbUrlPreview.style.display = 'none';
      return;
    }

    let dataUrl: string;
    if (selectedOption === 'fleet') {
      const fleetName = this.nfcFleetSelect?.value;
      if (!fleetName) {
        this.nfcDbUrlPreview.style.display = 'none';
        return;
      }
      const fleetId = ReferenceDbService.slugifyFleetName(fleetName);
      dataUrl = `${GITHUB_PAGES_BASE_URL}/${encodeURIComponent(customerId)}/fleet-${fleetId}.json`;
    } else {
      dataUrl = HashRouter.buildDbUrlFromCustomerId(customerId);
    }

    this.nfcDbUrlPreview.textContent = t('nfc.dbUrlPreview', { url: dataUrl });
    this.nfcDbUrlPreview.style.display = 'block';
  }

  private async updateNfcFleetVisibility(): Promise<void> {
    const isFleet = this.nfcFleetOption?.checked;

    if (this.nfcFleetSection) {
      this.nfcFleetSection.style.display = isFleet ? 'block' : 'none';
    }

    if (isFleet && this.nfcFleetSelect) {
      // Populate fleet dropdown
      const machines = await getAllMachines();
      const groups = new Map<string, number>();
      for (const m of machines) {
        if (m.fleetGroup) {
          groups.set(m.fleetGroup, (groups.get(m.fleetGroup) || 0) + 1);
        }
      }

      this.nfcFleetSelect.innerHTML = '';
      if (groups.size === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = t('nfc.noFleets');
        this.nfcFleetSelect.appendChild(opt);
      } else {
        for (const [name, count] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = `${name} (${count} ${count === 1 ? t('nfc.machine') : t('nfc.machines')})`;
          this.nfcFleetSelect.appendChild(opt);
        }
      }

      this.updateNfcFleetDetail();
    }
  }

  private updateNfcFleetDetail(): void {
    const selected = this.nfcFleetSelect?.value;
    if (this.nfcFleetDetail && selected) {
      this.nfcFleetDetail.textContent = t('nfc.optionFleetDetail', { name: selected });
    }
    // Update URL preview
    if (this.nfcFleetUrlPreview && selected) {
      const customerId = this.nfcCustomerIdInput?.value.trim();
      if (customerId) {
        const fleetId = ReferenceDbService.slugifyFleetName(selected);
        const url = HashRouter.getFullFleetUrl(fleetId, customerId);
        this.nfcFleetUrlPreview.textContent = url;
        this.nfcFleetUrlPreview.style.display = 'block';
      } else {
        this.nfcFleetUrlPreview.style.display = 'none';
      }
    }
  }

  private updateNfcQcCountVisibility(): void {
    const isCountOnly = this.nfcQuickCompareCountOption?.checked;
    if (this.nfcQcCountSection) {
      this.nfcQcCountSection.style.display = isCountOnly ? 'block' : 'none';
    }
    // Hide customer ID section when count-only is selected (no internet needed)
    const nfcCustomerIdSection = document.getElementById('nfc-customer-id-section');
    if (nfcCustomerIdSection) {
      nfcCustomerIdSection.style.display = isCountOnly ? 'none' : '';
    }
  }

  private updateNfcQcCountUrlPreview(): void {
    if (!this.nfcQcCountUrlPreview) return;

    if (this.nfcQcCountSelectedValue >= 2 && this.nfcQcCountSelectedValue <= 30) {
      const url = HashRouter.getFullQuickCompareCountUrl(this.nfcQcCountSelectedValue);
      this.nfcQcCountUrlPreview.textContent = url;
      this.nfcQcCountUrlPreview.style.display = 'block';

      // Update detail text
      if (this.nfcQuickCompareCountDetail) {
        this.nfcQuickCompareCountDetail.textContent = t('nfc.optionQuickCompareCountDetail', {
          count: String(this.nfcQcCountSelectedValue),
        });
      }
    } else {
      this.nfcQcCountUrlPreview.style.display = 'none';
    }
  }

  private getNfcSupportStatus(): { supported: boolean; message?: string } {
    if (!window.isSecureContext) {
      return { supported: false, message: t('nfc.requiresSecureContext') };
    }

    const hasReader =
      typeof (window as typeof window & { NDEFReader?: NDEFReaderConstructor }).NDEFReader !==
      'undefined';
    if (!hasReader) {
      return { supported: false, message: t('nfc.unsupportedBrowser') };
    }

    return { supported: true };
  }

  private openNfcModal(): void {
    if (!this.nfcModal) {
      return;
    }

    // CRITICAL FIX: Close settings modal before opening NFC writer modal
    // This prevents the settings modal from overlaying the NFC writer modal
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal && window.getComputedStyle(settingsModal).display !== 'none') {
      settingsModal.style.display = 'none';
      logger.debug('Settings modal closed before opening NFC writer modal');
    }

    const { supported: supportsNfc, message } = this.getNfcSupportStatus();
    this.updateNfcSpecificOption();
    this.updateNfcSupportDetails();
    // Ensure field visibility matches the currently selected radio option.
    // The URL preview must wait for the fleet dropdown to be populated.
    void this.updateNfcFleetVisibility().then(() => this.updateNfcDbUrlPreview());
    this.updateNfcQcCountVisibility();
    if (this.nfcWriteBtn) {
      this.nfcWriteBtn.disabled = !supportsNfc;
    }
    this.setNfcStatus(
      supportsNfc ? '' : message || t('nfc.unsupported'),
      supportsNfc ? undefined : 'error'
    );
    this.nfcModal.style.display = 'flex';
  }

  private closeNfcModal(): void {
    if (this.nfcModal) {
      this.nfcModal.style.display = 'none';
    }
  }

  /** Refresh the "specific machine" option (called when the selected machine changes). */
  public updateNfcSpecificOption(): void {
    if (!this.nfcSpecificOption || !this.nfcSpecificDetail) {
      return;
    }

    const currentMachine = this.deps.getCurrentMachine();
    if (currentMachine) {
      this.nfcSpecificOption.disabled = false;
      this.nfcSpecificDetail.textContent = t('nfc.optionSpecificDetail', {
        name: currentMachine.name,
        id: currentMachine.id,
      });
    } else {
      this.nfcSpecificOption.disabled = true;
      if (this.nfcGenericOption) {
        this.nfcGenericOption.checked = true;
      }
      this.nfcSpecificDetail.textContent = t('nfc.optionSpecificUnavailable');
    }
  }

  private updateNfcSupportDetails(): void {
    if (!this.nfcSupportDetails) {
      return;
    }

    const hasSecureContext = window.isSecureContext;
    const hasReader =
      typeof (window as typeof window & { NDEFReader?: NDEFReaderConstructor }).NDEFReader !==
      'undefined';
    const yes = t('common.yes');
    const no = t('common.no');

    this.nfcSupportDetails.textContent = t('nfc.supportDetails', {
      secureContext: hasSecureContext ? yes : no,
      ndefReader: hasReader ? yes : no,
    });
  }

  private setNfcStatus(message: string, status?: 'success' | 'error'): void {
    if (!this.nfcStatus) {
      return;
    }
    this.nfcStatus.textContent = message;
    this.nfcStatus.classList.remove('status-success', 'status-error');
    if (status === 'success') {
      this.nfcStatus.classList.add('status-success');
    }
    if (status === 'error') {
      this.nfcStatus.classList.add('status-error');
    }
  }

  private async handleNfcWrite(): Promise<void> {
    if (!this.nfcWriteBtn) {
      return;
    }

    const { supported: supportsNfc, message } = this.getNfcSupportStatus();
    if (!supportsNfc) {
      this.setNfcStatus(message || t('nfc.unsupported'), 'error');
      return;
    }

    const readerConstructor = (window as typeof window & { NDEFReader?: NDEFReaderConstructor })
      .NDEFReader;
    if (!readerConstructor) {
      this.setNfcStatus(t('nfc.unsupported'), 'error');
      return;
    }

    const selectedOption = this.nfcQuickCompareCountOption?.checked
      ? 'quickcompare-count'
      : this.nfcFleetOption?.checked
        ? 'fleet'
        : this.nfcSpecificOption?.checked
          ? 'specific'
          : 'generic';

    const currentMachine = this.deps.getCurrentMachine();
    if (selectedOption === 'specific' && !currentMachine) {
      this.setNfcStatus(t('nfc.optionSpecificUnavailable'), 'error');
      return;
    }

    // Get customerId from input field
    const customerId = this.nfcCustomerIdInput?.value.trim() || '';

    // Validate: customerId is required for machine-specific and fleet links
    if (selectedOption === 'specific' && !customerId) {
      this.setNfcStatus(t('nfc.customerIdRequired'), 'error');
      return;
    }

    if (selectedOption === 'fleet') {
      const fleetName = this.nfcFleetSelect?.value;
      if (!fleetName || !customerId) {
        this.setNfcStatus(t('nfc.fleetRequiresCustomerId'), 'error');
        return;
      }
    }

    // Validate: count-only requires a valid count
    if (selectedOption === 'quickcompare-count') {
      if (this.nfcQcCountSelectedValue < 2 || this.nfcQcCountSelectedValue > 30) {
        this.setNfcStatus(t('quickCompare.wizard.minMachines'), 'error');
        return;
      }
    }

    const baseUrl = this.deps.getBaseAppUrl();
    let url: string;
    if (selectedOption === 'quickcompare-count' && this.nfcQcCountSelectedValue >= 2) {
      url = HashRouter.getFullQuickCompareCountUrl(this.nfcQcCountSelectedValue);
    } else if (selectedOption === 'fleet' && this.nfcFleetSelect?.value) {
      const fleetId = ReferenceDbService.slugifyFleetName(this.nfcFleetSelect.value);
      url = HashRouter.getFullFleetUrl(fleetId, customerId);
    } else if (selectedOption === 'specific' && currentMachine) {
      url = HashRouter.getFullMachineUrl(currentMachine.id, customerId);
    } else {
      url = baseUrl;
    }

    logger.info(`📝 Writing NFC tag: ${url}`);

    this.nfcWriteBtn.disabled = true;
    this.setNfcStatus(t('nfc.statusWriting'));

    try {
      const reader = new readerConstructor();
      await reader.write({
        records: [
          {
            recordType: 'url',
            data: url,
          },
        ],
      });
      this.setNfcStatus(t('nfc.statusSuccess'), 'success');
    } catch (error) {
      const isError = error instanceof Error;
      const errorName = isError ? error.name : '';
      if (errorName === 'AbortError') {
        this.setNfcStatus(t('nfc.statusCancelled'), 'error');
      } else {
        this.setNfcStatus(t('nfc.statusError'), 'error');
      }
      logger.error('NFC write failed:', error);
    } finally {
      this.nfcWriteBtn.disabled = false;
    }
  }
}
