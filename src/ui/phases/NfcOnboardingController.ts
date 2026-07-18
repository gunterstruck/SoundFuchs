/**
 * ZANOBOT - NFC ONBOARDING CONTROLLER
 *
 * Owns the post-deep-link NFC onboarding UI lifecycle extracted from the
 * Identify phase: the "start test now?" diagnosis prompt and the temporary
 * basic-view / focus-theme restore that happens when the user leaves the flow
 * without starting a test.
 *
 * The deep-link orchestration itself stays in the phase; it only marks the
 * onboarding active (so the view level is restored on cancel) and opens the
 * prompt once a machine has been provisioned.
 */

import { restoreViewLevel, restoreTheme } from '@utils/viewLevelSettings.js';
import { logger } from '@utils/logger.js';

export class NfcOnboardingController {
  private nfcDiagnosisModal: HTMLElement | null = null;
  private nfcDiagnosisConfirmBtn: HTMLButtonElement | null = null;
  private nfcDiagnosisCancelBtn: HTMLButtonElement | null = null;

  // Tracks an active NFC onboarding flow, so the temporary basic view level
  // and focus theme are restored when the user leaves without starting a test.
  private isNfcOnboardingActive: boolean = false;

  /** Mark that an NFC onboarding flow has begun (basic view / focus theme set by caller). */
  public markOnboardingActive(): void {
    this.isNfcOnboardingActive = true;
  }

  /** Wire the static NFC diagnosis prompt's buttons (called once at phase init). */
  public initPrompt(): void {
    this.nfcDiagnosisModal = document.getElementById('nfc-diagnosis-modal');
    this.nfcDiagnosisConfirmBtn = document.getElementById(
      'nfc-diagnosis-confirm-btn'
    ) as HTMLButtonElement | null;
    this.nfcDiagnosisCancelBtn = document.getElementById(
      'nfc-diagnosis-cancel-btn'
    ) as HTMLButtonElement | null;
    const closeBtn = document.getElementById('close-nfc-diagnosis-modal');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closePrompt());
    }
    if (this.nfcDiagnosisCancelBtn) {
      this.nfcDiagnosisCancelBtn.addEventListener('click', () => this.closePrompt());
    }
    if (this.nfcDiagnosisConfirmBtn) {
      this.nfcDiagnosisConfirmBtn.addEventListener('click', () => {
        // startingTest=true: keep basic mode active during test
        this.closePrompt(true);
        this.startDiagnosisFromNfc();
      });
    }
    if (this.nfcDiagnosisModal) {
      this.nfcDiagnosisModal.addEventListener('click', (event) => {
        if (event.target === this.nfcDiagnosisModal) {
          this.closePrompt();
        }
      });
    }
  }

  /** Show the "start test now?" prompt after a machine was provisioned via deep link. */
  public openPrompt(): void {
    if (!this.nfcDiagnosisModal) {
      return;
    }
    this.nfcDiagnosisModal.style.display = 'flex';
  }

  /**
   * Close the NFC diagnosis prompt.
   * @param startingTest - true if closing because test is starting (don't restore view level yet)
   */
  private closePrompt(startingTest: boolean = false): void {
    if (this.nfcDiagnosisModal) {
      this.nfcDiagnosisModal.style.display = 'none';
    }

    // Restore view level after NFC onboarding flow ends
    // But NOT if we're starting the test - keep basic mode during test
    // Restore only happens when user cancels/closes without starting test
    if (this.isNfcOnboardingActive && !startingTest) {
      this.isNfcOnboardingActive = false;
      restoreViewLevel();
      restoreTheme();
      logger.debug(
        '[NFC Onboarding] View level and theme restored to user preference (dialog closed)'
      );
    }
  }

  private startDiagnosisFromNfc(): void {
    const content = document.getElementById('run-diagnosis-content');
    const header = document.querySelector(
      '.section-header[data-target="run-diagnosis-content"]'
    ) as HTMLElement | null;
    if (content && header && window.getComputedStyle(content).display === 'none') {
      header.click();
    }

    // Set flag to force basic view for NFC-initiated diagnosis
    // This ensures simplified inspection modal is shown regardless of user's view level setting
    document.body.setAttribute('data-nfc-diagnosis', 'true');

    const startButton = document.getElementById('diagnose-btn') as HTMLButtonElement | null;

    if (!startButton) {
      return;
    }

    if (!startButton.disabled) {
      startButton.click();
      return;
    }

    const waitForEnableTimeout = 4000;
    const startTime = Date.now();
    const intervalId = window.setInterval(() => {
      if (!startButton.disabled) {
        startButton.click();
        window.clearInterval(intervalId);
        return;
      }
      if (Date.now() - startTime >= waitForEnableTimeout) {
        window.clearInterval(intervalId);
      }
    }, 250);
  }
}
