/**
 * ZANOBOT - QR SHARE MODAL
 *
 * Self-contained controller for the "QR code generator" modal: lets the user
 * create a shareable QR code for the app, a specific machine, a fleet group or
 * a count-only Quick-Compare link, with live preview, download and print.
 *
 * Extracted from the Identify phase. State (the qr* DOM refs / selection) lives
 * here; everything it needs from the phase is passed in via QrShareDeps.
 */

import type { Machine } from '@data/types.js';
import { getAllMachines } from '@data/db.js';
import { ReferenceDbService } from '@data/ReferenceDbService.js';
import { HashRouter, GITHUB_PAGES_BASE_URL } from '../HashRouter.js';
import { escapeHtml } from '@utils/sanitize.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';

/**
 * Lazy-load the QR-generation library on first use.
 *
 * `qrcode` is only needed when the user generates a shareable QR code, so it is
 * kept out of the initial bundle and fetched on demand. The promise is cached so
 * the module is imported only once even across repeated QR renders.
 */
let qrcodeModulePromise: Promise<typeof import('qrcode')> | null = null;
function loadQrcode(): Promise<typeof import('qrcode')> {
  if (!qrcodeModulePromise) {
    qrcodeModulePromise = import('qrcode');
  }
  return qrcodeModulePromise;
}

/** Dependencies the modal needs from the host phase. */
export interface QrShareDeps {
  /** The currently selected machine (or null when none is selected). */
  getCurrentMachine: () => Machine | null;
  /** Base application URL (shared with other phase features). */
  getBaseAppUrl: () => string;
}

export class QrShareModal {
  private qrModal: HTMLElement | null = null;
  private qrCanvas: HTMLCanvasElement | null = null;
  private qrPreviewContainer: HTMLElement | null = null;
  private qrUrlPreview: HTMLElement | null = null;
  private qrLabelInfo: HTMLElement | null = null;
  private qrGenericOption: HTMLInputElement | null = null;
  private qrSpecificOption: HTMLInputElement | null = null;
  private qrSpecificDetail: HTMLElement | null = null;
  private qrCustomerIdInput: HTMLInputElement | null = null;
  private qrCustomerIdSection: HTMLElement | null = null;
  private qrDbUrlPreview: HTMLElement | null = null;
  private qrDownloadBtn: HTMLButtonElement | null = null;
  private qrPrintBtn: HTMLButtonElement | null = null;
  private qrCurrentUrl: string = '';
  private qrRenderToken: number = 0;

  private qrFleetOption: HTMLInputElement | null = null;
  private qrFleetSection: HTMLElement | null = null;
  private qrFleetSelect: HTMLSelectElement | null = null;

  private qrQuickCompareCountOption: HTMLInputElement | null = null;
  private qrQuickCompareCountDetail: HTMLElement | null = null;
  private qrQcCountSection: HTMLElement | null = null;
  private qrQcCountInput: HTMLInputElement | null = null;
  private qrQcCountUrlPreview: HTMLElement | null = null;
  private qrQcCountSelectedValue: number = 0;

  constructor(private deps: QrShareDeps) {}

  public init(): void {
    const openBtn = document.getElementById('open-qr-generator-btn') as HTMLButtonElement | null;
    const settingsBtn = document.getElementById(
      'settings-qr-generator-btn'
    ) as HTMLButtonElement | null;

    this.qrModal = document.getElementById('qr-generator-modal');
    this.qrCanvas = document.getElementById('qr-canvas') as HTMLCanvasElement | null;
    this.qrPreviewContainer = document.getElementById('qr-preview-container');
    this.qrUrlPreview = document.getElementById('qr-url-preview');
    this.qrLabelInfo = document.getElementById('qr-label-info');
    this.qrGenericOption = document.getElementById('qr-option-generic') as HTMLInputElement | null;
    this.qrSpecificOption = document.getElementById(
      'qr-option-specific'
    ) as HTMLInputElement | null;
    this.qrSpecificDetail = document.getElementById('qr-option-specific-detail');
    this.qrCustomerIdInput = document.getElementById(
      'qr-customer-id-input'
    ) as HTMLInputElement | null;
    this.qrCustomerIdSection = document.getElementById('qr-customer-id-section');
    this.qrDbUrlPreview = document.getElementById('qr-db-url-preview');
    this.qrDownloadBtn = document.getElementById('qr-download-btn') as HTMLButtonElement | null;
    this.qrPrintBtn = document.getElementById('qr-print-btn') as HTMLButtonElement | null;

    const closeBtn = document.getElementById('close-qr-generator-modal');
    const cancelBtn = document.getElementById('qr-close-btn');

    if (openBtn) {
      openBtn.addEventListener('click', () => this.openQrModal());
    }
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openQrModal());
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeQrModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeQrModal());
    }
    if (this.qrModal) {
      this.qrModal.addEventListener('click', (event) => {
        if (event.target === this.qrModal) {
          this.closeQrModal();
        }
      });
    }

    // QR Fleet option
    this.qrFleetOption = document.getElementById('qr-option-fleet') as HTMLInputElement | null;
    this.qrFleetSelect = document.getElementById('qr-fleet-select') as HTMLSelectElement | null;
    this.qrFleetSection = document.getElementById('qr-fleet-section');

    // QR Quick Compare count-only option
    this.qrQuickCompareCountOption = document.getElementById(
      'qr-option-quickcompare-count'
    ) as HTMLInputElement | null;
    this.qrQuickCompareCountDetail = document.getElementById('qr-option-quickcompare-count-detail');
    this.qrQcCountSection = document.getElementById('qr-qc-count-section');
    this.qrQcCountInput = document.getElementById('qr-qc-count-input') as HTMLInputElement | null;
    this.qrQcCountUrlPreview = document.getElementById('qr-qc-count-url-preview');

    // Count-only chip buttons for QR
    const qrCountChips = document.getElementById('qr-qc-count-chips');
    if (qrCountChips) {
      qrCountChips.querySelectorAll('.qc-count-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const count = parseInt((chip as HTMLElement).dataset.count || '0', 10);
          if (count >= 2 && count <= 30) {
            this.qrQcCountSelectedValue = count;
            qrCountChips
              .querySelectorAll('.qc-count-chip')
              .forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
            if (this.qrQcCountInput) this.qrQcCountInput.value = '';
            this.updateQrQcCountUrlPreview();
            void this.generateQrPreview();
          }
        });
      });
    }

    if (this.qrQcCountInput) {
      this.qrQcCountInput.addEventListener('input', () => {
        const val = parseInt(this.qrQcCountInput!.value, 10);
        qrCountChips
          ?.querySelectorAll('.qc-count-chip')
          .forEach((c) => c.classList.remove('active'));
        if (!isNaN(val) && val >= 2 && val <= 30) {
          this.qrQcCountSelectedValue = val;
          qrCountChips?.querySelectorAll('.qc-count-chip').forEach((c) => {
            if ((c as HTMLElement).dataset.count === String(val)) c.classList.add('active');
          });
        } else {
          this.qrQcCountSelectedValue = 0;
        }
        this.updateQrQcCountUrlPreview();
        void this.generateQrPreview();
      });
    }

    // Radio button changes trigger QR regeneration
    const qrRadios = [
      this.qrGenericOption,
      this.qrSpecificOption,
      this.qrFleetOption,
      this.qrQuickCompareCountOption,
    ];
    for (const radio of qrRadios) {
      if (radio) {
        radio.addEventListener('change', () => {
          void (async () => {
            // Await fleet dropdown population BEFORE preview/QR generation,
            // otherwise the QR code can encode the base URL instead of the fleet URL
            await this.updateQrFleetVisibility();
            this.updateQrDbUrlPreview();
            this.updateQrQcCountVisibility();
            await this.generateQrPreview();
          })();
        });
      }
    }

    // Fleet select change triggers QR regeneration
    if (this.qrFleetSelect) {
      this.qrFleetSelect.addEventListener('change', () => {
        this.updateQrDbUrlPreview();
        void this.generateQrPreview();
      });
    }

    // Customer ID input changes trigger QR regeneration
    if (this.qrCustomerIdInput) {
      this.qrCustomerIdInput.addEventListener('input', () => {
        this.updateQrDbUrlPreview();
        void this.generateQrPreview();
      });
    }

    // Download button
    if (this.qrDownloadBtn) {
      this.qrDownloadBtn.addEventListener('click', () => this.downloadQrCode());
    }

    // Print button
    if (this.qrPrintBtn) {
      this.qrPrintBtn.addEventListener('click', () => this.printQrCode());
    }
  }

  private openQrModal(): void {
    if (!this.qrModal) {
      return;
    }

    // Close settings modal if open (same pattern as NFC)
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal && window.getComputedStyle(settingsModal).display !== 'none') {
      settingsModal.style.display = 'none';
    }

    this.updateQrSpecificOption();
    this.updateQrQcCountVisibility();
    this.qrModal.style.display = 'flex';

    // Ensure field visibility matches the currently selected radio option.
    // Await fleet dropdown population BEFORE the URL preview and the initial
    // QR code, otherwise the QR can encode the wrong URL (race condition).
    void (async () => {
      await this.updateQrFleetVisibility();
      this.updateQrDbUrlPreview();
      await this.generateQrPreview();
    })();
  }

  private closeQrModal(): void {
    if (this.qrModal) {
      this.qrModal.style.display = 'none';
    }
  }

  private updateQrSpecificOption(): void {
    if (!this.qrSpecificOption || !this.qrSpecificDetail) {
      return;
    }

    const currentMachine = this.deps.getCurrentMachine();
    if (currentMachine) {
      this.qrSpecificOption.disabled = false;
      this.qrSpecificDetail.textContent = t('qrCode.optionSpecificDetail', {
        name: currentMachine.name,
        id: currentMachine.id,
      });
    } else {
      this.qrSpecificOption.disabled = true;
      if (this.qrGenericOption) {
        this.qrGenericOption.checked = true;
      }
      this.qrSpecificDetail.textContent = t('qrCode.optionSpecificUnavailable');
    }
  }

  private updateQrDbUrlPreview(): void {
    if (!this.qrDbUrlPreview || !this.qrCustomerIdInput) {
      return;
    }

    const selectedOption = this.qrQuickCompareCountOption?.checked
      ? 'quickcompare-count'
      : this.qrFleetOption?.checked
        ? 'fleet'
        : this.qrSpecificOption?.checked
          ? 'specific'
          : 'generic';

    // Generic or count-only link: no data URL preview needed
    if (selectedOption === 'generic' || selectedOption === 'quickcompare-count') {
      this.qrDbUrlPreview.style.display = 'none';
      return;
    }

    const customerId = this.qrCustomerIdInput.value.trim();
    if (!customerId) {
      this.qrDbUrlPreview.style.display = 'none';
      return;
    }

    let dataUrl: string;
    if (selectedOption === 'fleet') {
      const fleetName = this.qrFleetSelect?.value;
      if (!fleetName) {
        this.qrDbUrlPreview.style.display = 'none';
        return;
      }
      const fleetId = ReferenceDbService.slugifyFleetName(fleetName);
      dataUrl = `${GITHUB_PAGES_BASE_URL}/${encodeURIComponent(customerId)}/fleet-${fleetId}.json`;
    } else {
      dataUrl = HashRouter.buildDbUrlFromCustomerId(customerId);
    }

    this.qrDbUrlPreview.textContent = t('qrCode.dbUrlPreview', { url: dataUrl });
    this.qrDbUrlPreview.style.display = 'block';
  }

  private async updateQrFleetVisibility(): Promise<void> {
    const isFleet = this.qrFleetOption?.checked;

    if (this.qrFleetSection) {
      this.qrFleetSection.style.display = isFleet ? 'block' : 'none';
    }

    if (isFleet && this.qrFleetSelect) {
      const machines = await getAllMachines();
      const groups = new Map<string, number>();
      for (const m of machines) {
        if (m.fleetGroup) {
          groups.set(m.fleetGroup, (groups.get(m.fleetGroup) || 0) + 1);
        }
      }

      this.qrFleetSelect.innerHTML = '';
      if (groups.size === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = t('nfc.noFleets');
        this.qrFleetSelect.appendChild(opt);
      } else {
        for (const [name, count] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = `${name} (${count} ${count === 1 ? t('nfc.machine') : t('nfc.machines')})`;
          this.qrFleetSelect.appendChild(opt);
        }
      }
    }
  }

  private updateQrQcCountVisibility(): void {
    const isCountOnly = this.qrQuickCompareCountOption?.checked;
    if (this.qrQcCountSection) {
      this.qrQcCountSection.style.display = isCountOnly ? 'block' : 'none';
    }
    // Hide customer ID section when count-only is selected (no internet needed)
    if (this.qrCustomerIdSection) {
      this.qrCustomerIdSection.style.display = isCountOnly ? 'none' : '';
    }
  }

  private updateQrQcCountUrlPreview(): void {
    if (!this.qrQcCountUrlPreview) return;

    if (this.qrQcCountSelectedValue >= 2 && this.qrQcCountSelectedValue <= 30) {
      const url = HashRouter.getFullQuickCompareCountUrl(this.qrQcCountSelectedValue);
      this.qrQcCountUrlPreview.textContent = url;
      this.qrQcCountUrlPreview.style.display = 'block';

      // Update detail text
      if (this.qrQuickCompareCountDetail) {
        this.qrQuickCompareCountDetail.textContent = t('qrCode.optionQuickCompareCountDetail', {
          count: String(this.qrQcCountSelectedValue),
        });
      }
    } else {
      this.qrQcCountUrlPreview.style.display = 'none';
    }
  }

  private getQrUrl(): string {
    const selectedOption = this.qrQuickCompareCountOption?.checked
      ? 'quickcompare-count'
      : this.qrFleetOption?.checked
        ? 'fleet'
        : this.qrSpecificOption?.checked
          ? 'specific'
          : 'generic';
    const baseUrl = this.deps.getBaseAppUrl();

    if (selectedOption === 'quickcompare-count') {
      if (this.qrQcCountSelectedValue >= 2 && this.qrQcCountSelectedValue <= 30) {
        return HashRouter.getFullQuickCompareCountUrl(this.qrQcCountSelectedValue);
      }
      return baseUrl;
    }

    if (selectedOption === 'fleet') {
      const fleetName = this.qrFleetSelect?.value;
      const customerId = this.qrCustomerIdInput?.value.trim();
      if (fleetName && customerId) {
        const fleetId = ReferenceDbService.slugifyFleetName(fleetName);
        return HashRouter.getFullFleetUrl(fleetId, customerId);
      }
      return baseUrl;
    }

    const currentMachine = this.deps.getCurrentMachine();
    if (selectedOption === 'specific' && currentMachine) {
      const customerId = this.qrCustomerIdInput?.value.trim() || '';
      if (customerId) {
        return HashRouter.getFullMachineUrl(currentMachine.id, customerId);
      }
      // Without customerId, use base URL with machine hash only
      return `${baseUrl}#/m/${encodeURIComponent(currentMachine.id)}`;
    }

    return baseUrl;
  }

  private async generateQrPreview(): Promise<void> {
    if (!this.qrCanvas || !this.qrPreviewContainer) {
      return;
    }

    const url = this.getQrUrl();
    this.qrCurrentUrl = url;
    // Sequence token: a slow earlier render must not overwrite a newer one
    const renderToken = ++this.qrRenderToken;

    try {
      // Render offscreen first so a stale render never reaches the visible canvas
      const tempCanvas = document.createElement('canvas');
      const QRCode = await loadQrcode();
      await QRCode.toCanvas(tempCanvas, url, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });

      if (renderToken !== this.qrRenderToken) {
        // A newer render has been started in the meantime – discard this one
        return;
      }

      this.qrCanvas.width = tempCanvas.width;
      this.qrCanvas.height = tempCanvas.height;
      this.qrCanvas.getContext('2d')?.drawImage(tempCanvas, 0, 0);

      // Show preview and action buttons
      this.qrPreviewContainer.style.display = 'block';
      if (this.qrDownloadBtn) this.qrDownloadBtn.style.display = '';
      if (this.qrPrintBtn) this.qrPrintBtn.style.display = '';

      // Update URL preview
      if (this.qrUrlPreview) {
        this.qrUrlPreview.textContent = url;
      }

      // Update label info
      if (this.qrLabelInfo) {
        const selectedOption = this.qrQuickCompareCountOption?.checked
          ? 'quickcompare-count'
          : this.qrFleetOption?.checked
            ? 'fleet'
            : this.qrSpecificOption?.checked
              ? 'specific'
              : 'generic';
        const currentMachine = this.deps.getCurrentMachine();
        if (selectedOption === 'quickcompare-count' && this.qrQcCountSelectedValue >= 2) {
          this.qrLabelInfo.innerHTML = `<strong>${t('quickCompare.startButton')}:</strong> ${this.qrQcCountSelectedValue} ${t('nfc.machines')}`;
        } else if (selectedOption === 'fleet' && this.qrFleetSelect?.value) {
          this.qrLabelInfo.innerHTML = `<strong>${t('qrCode.fleetLabel')}:</strong> ${escapeHtml(this.qrFleetSelect.value)}`;
        } else if (selectedOption === 'specific' && currentMachine) {
          this.qrLabelInfo.innerHTML =
            `<strong>${t('qrCode.machineLabel')}:</strong> ${escapeHtml(currentMachine.name)}<br>` +
            `<strong>${t('qrCode.machineIdLabel')}:</strong> ${escapeHtml(currentMachine.id)}`;
        } else {
          this.qrLabelInfo.innerHTML = `<strong>${t('qrCode.genericLabel')}</strong>`;
        }
      }
    } catch (error) {
      logger.error('Failed to generate QR code:', error);
    }
  }

  private downloadQrCode(): void {
    if (!this.qrCanvas) {
      return;
    }

    const currentMachine = this.deps.getCurrentMachine();
    // Create a higher-resolution canvas for download (400px)
    const downloadCanvas = document.createElement('canvas');
    void loadQrcode().then((QRCode) =>
      QRCode.toCanvas(downloadCanvas, this.qrCurrentUrl, {
        width: 400,
        margin: 3,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      }).then(() => {
        const link = document.createElement('a');
        link.download =
          this.qrQuickCompareCountOption?.checked && this.qrQcCountSelectedValue >= 2
            ? `qr-quickcompare-${this.qrQcCountSelectedValue}.png`
            : this.qrFleetOption?.checked && this.qrFleetSelect?.value
              ? `qr-fleet-${ReferenceDbService.slugifyFleetName(this.qrFleetSelect.value)}.png`
              : currentMachine && this.qrSpecificOption?.checked
                ? `qr-${currentMachine.id}.png`
                : 'qr-soundfuchs.png';
        link.href = downloadCanvas.toDataURL('image/png');
        link.click();
      })
    );
  }

  private printQrCode(): void {
    const printHeader = document.getElementById('qr-print-header');
    const printCanvas = document.getElementById('qr-print-canvas') as HTMLCanvasElement | null;
    const printDetails = document.getElementById('qr-print-details');
    const printFooter = document.getElementById('qr-print-footer');

    if (!printCanvas || !printHeader || !printDetails || !printFooter) {
      return;
    }

    const currentMachine = this.deps.getCurrentMachine();
    const selectedOption = this.qrQuickCompareCountOption?.checked
      ? 'quickcompare-count'
      : this.qrFleetOption?.checked
        ? 'fleet'
        : this.qrSpecificOption?.checked
          ? 'specific'
          : 'generic';
    const isSpecific = selectedOption === 'specific' && currentMachine;
    const isFleet = selectedOption === 'fleet' && this.qrFleetSelect?.value;
    const isCountOnly = selectedOption === 'quickcompare-count' && this.qrQcCountSelectedValue >= 2;
    const now = new Date().toLocaleDateString();

    // Fill print label content
    if (isCountOnly) {
      printHeader.textContent = t('quickCompare.startButton');
      printDetails.innerHTML =
        `<strong>${t('quickCompare.startButton')}:</strong> ${this.qrQcCountSelectedValue} ${t('nfc.machines')}<br>` +
        `<strong>${t('qrCode.dateLabel')}:</strong> ${now}`;
    } else if (isFleet) {
      printHeader.textContent = t('qrCode.fleetPrintTitle');
      printDetails.innerHTML =
        `<strong>${t('qrCode.fleetLabel')}:</strong> ${escapeHtml(this.qrFleetSelect!.value)}<br>` +
        `<strong>${t('qrCode.dateLabel')}:</strong> ${now}`;
    } else if (isSpecific && currentMachine) {
      printHeader.textContent = t('qrCode.printTitle');
      printDetails.innerHTML =
        `<strong>${t('qrCode.machineLabel')}:</strong> ${escapeHtml(currentMachine.name)}<br>` +
        `<strong>${t('qrCode.machineIdLabel')}:</strong> ${escapeHtml(currentMachine.id)}<br>` +
        `<strong>${t('qrCode.dateLabel')}:</strong> ${now}`;
    } else {
      printHeader.textContent = t('qrCode.printTitle');
      printDetails.innerHTML =
        `<strong>${t('qrCode.genericLabel')}</strong><br>` +
        `<strong>${t('qrCode.dateLabel')}:</strong> ${now}`;
    }

    printFooter.textContent = t('qrCode.printInstructions');

    // Generate QR code on the print canvas
    void loadQrcode().then((QRCode) =>
      QRCode.toCanvas(printCanvas, this.qrCurrentUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      }).then(() => {
        // Trigger print with special body class
        document.body.classList.add('qr-printing');
        window.print();
        document.body.classList.remove('qr-printing');
      })
    );
  }
}
