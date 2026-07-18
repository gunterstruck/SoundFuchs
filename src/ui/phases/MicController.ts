/**
 * ZANOBOT - MICROPHONE / HARDWARE CONTROLLER
 *
 * Self-contained controller for microphone selection and hardware-quality
 * feedback, extracted from the Identify phase:
 * - smart auto-selection of the best microphone on startup,
 * - the hardware info card,
 * - the microphone selection modal.
 *
 * Owns the selected device id, the live audio stream and the latest quality
 * report. The host phase exposes the selected device id via getSelectedDeviceId()
 * by delegating here, and forwards user-facing errors via the injected callback.
 */

import { getMicrophones, getRawAudioStream, AUDIO_CONSTRAINTS } from '@core/audio/audioHelper.js';
import {
  HardwareCheck,
  type AudioQualityReport,
  type AudioDeviceInfo,
} from '@core/audio/HardwareCheck.js';
import { getViewLevel } from '@utils/viewLevelSettings.js';
import { notify } from '@utils/notifications.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';

/** Dependencies the controller needs from the host phase. */
export interface MicControllerDeps {
  /** Display a user-facing error message (forwarded to the phase's error UI). */
  onError: (message: string) => void;
}

export class MicController {
  private selectedDeviceId: string | undefined = undefined;
  private audioQualityReport: AudioQualityReport | null = null;
  private currentAudioStream: MediaStream | null = null;

  constructor(private deps: MicControllerDeps) {}

  /** Wire the change-microphone button and run the initial hardware check. */
  public init(): void {
    const changeMicBtn = document.getElementById('change-microphone-btn');
    if (changeMicBtn) {
      changeMicBtn.addEventListener('click', () => this.showMicrophoneSelection());
    }
    void this.initializeHardwareCheck();
  }

  /** Selected microphone device id (used by other phases that record audio). */
  public getSelectedDeviceId(): string | undefined {
    return this.selectedDeviceId;
  }

  /** Stop the live audio stream (keeps the selected device id). */
  public cleanup(): void {
    if (this.currentAudioStream) {
      this.currentAudioStream.getTracks().forEach((track) => track.stop());
      this.currentAudioStream = null;
    }
  }

  /**
   * Initialize hardware check on page load
   *
   * SMART MICROPHONE AUTO-SELECTION:
   * 1. Request initial audio permission (gets device labels)
   * 2. Search for optimal rear/environment microphone
   * 3. Automatically switch to best mic if found
   * 4. Notify user of optimization
   */
  private async initializeHardwareCheck(): Promise<void> {
    let tempStream: MediaStream | null = null;
    try {
      // Step 1: Request initial audio permission to get device labels
      tempStream = await getRawAudioStream(this.selectedDeviceId);

      // Step 2: SMART MICROPHONE AUTO-SELECTION
      // Now that we have permission, device labels are available
      const bestMic = await HardwareCheck.findBestMicrophone();

      if (bestMic && bestMic.deviceId !== this.selectedDeviceId) {
        logger.info(`🎤 Smart Auto-Selection: Switching to "${bestMic.label}"`);

        // Stop the initial stream before switching
        tempStream.getTracks().forEach((track) => track.stop());
        tempStream = null;

        // Set the optimal microphone
        this.selectedDeviceId = bestMic.deviceId;

        // Get new stream with the optimal microphone
        tempStream = await getRawAudioStream(this.selectedDeviceId);

        // Notify user of automatic optimization (technical status, skip in basic mode)
        if (getViewLevel() !== 'basic') {
          notify.success(t('identify.success.microphoneOptimized', { label: bestMic.label }));
        }
      }

      // Step 3: Analyze the (potentially new) hardware
      const currentDevice = await HardwareCheck.getCurrentDevice(tempStream);

      if (currentDevice) {
        // Get audio track settings for sample rate
        const audioTracks = tempStream.getAudioTracks();
        if (audioTracks.length === 0) {
          logger.warn('No audio tracks found on device');
          return;
        }
        const audioTrack = audioTracks[0];
        const settings = audioTrack.getSettings();
        const sampleRate = settings.sampleRate || 44100;

        // Analyze hardware
        this.audioQualityReport = HardwareCheck.analyzeCurrentDevice(
          currentDevice.label,
          sampleRate
        );

        // Update UI
        this.updateHardwareInfoCard();
      }
    } catch (error) {
      logger.error('Failed to initialize hardware check:', error);
      // Don't block user flow - just log the error
    } finally {
      // CRITICAL FIX: Stop temporary stream after hardware check (success or failure)
      // This prevents resource leak and keeps microphone available for actual recordings
      if (tempStream) {
        tempStream.getTracks().forEach((track) => track.stop());
        tempStream = null;
      }
    }
  }

  /**
   * Update hardware info card in UI
   */
  private updateHardwareInfoCard(): void {
    if (!this.audioQualityReport) {
      return;
    }

    const statusIcon = document.getElementById('hardware-status-icon');
    const deviceLabel = document.getElementById('hardware-device-label');
    const statusText = document.getElementById('hardware-status-text');

    if (!statusIcon || !deviceLabel || !statusText) {
      return;
    }

    // Update device label
    deviceLabel.textContent = this.audioQualityReport.deviceLabel;

    // Update status icon and text
    if (this.audioQualityReport.status === 'good') {
      statusIcon.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--status-healthy)" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      `;
      statusText.textContent = this.audioQualityReport.reason;
      statusText.style.color = 'var(--status-healthy)';
    } else {
      statusIcon.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--status-warning)" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      `;
      statusText.textContent = this.audioQualityReport.reason;
      statusText.style.color = 'var(--status-warning)';
    }
  }

  /**
   * Show microphone selection modal
   */
  private async showMicrophoneSelection(): Promise<void> {
    try {
      // CRITICAL FIX: Close settings modal before opening microphone selection
      // This prevents the settings modal from overlaying the microphone selection modal
      const settingsModal = document.getElementById('settings-modal');
      if (settingsModal && window.getComputedStyle(settingsModal).display !== 'none') {
        settingsModal.style.display = 'none';
        logger.debug('Settings modal closed before opening microphone selection');
      }

      const liveDevices = await getMicrophones();
      const devices: AudioDeviceInfo[] = liveDevices.map((device) => ({
        deviceId: device.deviceId,
        label: device.label || t('hardware.microphoneId', { id: device.deviceId.substring(0, 8) }),
        kind: device.kind,
        groupId: device.groupId,
      }));

      // Get or create modal
      const modal = document.getElementById('microphone-selection-modal');
      if (!modal) {
        logger.error('Microphone selection modal not found in DOM');
        return;
      }

      const hasSelectedDevice =
        !!this.selectedDeviceId &&
        (this.selectedDeviceId === HardwareCheck.IOS_REAR_MIC_DEVICE_ID ||
          devices.some((device) => device.deviceId === this.selectedDeviceId));

      if (this.selectedDeviceId && !hasSelectedDevice) {
        logger.warn(
          `🎤 Selected microphone "${this.selectedDeviceId}" not found in live device list.`
        );
        if (getViewLevel() !== 'basic') {
          notify.warning(t('identify.warnings.preferredMicrophoneUnavailable'));
        }
        this.selectedDeviceId = undefined;
      }

      // Populate device list
      const deviceList = document.getElementById('microphone-device-list');
      if (!deviceList) {
        logger.error('Device list container not found');
        return;
      }

      deviceList.innerHTML = '';

      devices.forEach((device) => {
        const deviceItem = document.createElement('div');
        deviceItem.className = 'microphone-device-item';
        deviceItem.dataset.deviceId = device.deviceId;

        // Check if this is the currently selected device
        const isSelected =
          this.selectedDeviceId === device.deviceId ||
          (!this.selectedDeviceId && device.deviceId === 'default');

        if (isSelected) {
          deviceItem.classList.add('selected');
        }

        // Analyze this device
        // CRITICAL FIX: Use sample rate from AUDIO_CONSTRAINTS instead of hardcoded value
        // Note: This is the requested rate - actual rate will be determined when stream is created
        const estimatedSampleRate = AUDIO_CONSTRAINTS.audio.sampleRate;
        const tempReport = HardwareCheck.analyzeCurrentDevice(device.label, estimatedSampleRate);
        const statusClass = tempReport.status === 'good' ? 'status-good' : 'status-warning';

        // CRITICAL FIX: Use safe DOM manipulation instead of innerHTML to prevent XSS
        // Create device info container
        const deviceInfo = document.createElement('div');
        deviceInfo.className = 'device-info';

        // Create device icon with status
        const deviceIcon = document.createElement('div');
        deviceIcon.className = `device-icon ${statusClass}`;

        // Add appropriate SVG based on status (safe static content)
        if (tempReport.status === 'good') {
          deviceIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>`;
        } else {
          deviceIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>`;
        }

        // Create device details container
        const deviceDetails = document.createElement('div');
        deviceDetails.className = 'device-details';

        // Use textContent instead of innerHTML to prevent XSS attacks
        const deviceName = document.createElement('div');
        deviceName.className = 'device-name';
        deviceName.textContent = device.label; // SAFE - textContent escapes HTML

        const deviceStatus = document.createElement('div');
        deviceStatus.className = 'device-status';
        deviceStatus.textContent = tempReport.reason; // SAFE - textContent escapes HTML

        // Assemble the structure
        deviceDetails.appendChild(deviceName);
        deviceDetails.appendChild(deviceStatus);
        deviceInfo.appendChild(deviceIcon);
        deviceInfo.appendChild(deviceDetails);
        deviceItem.appendChild(deviceInfo);

        // Add checkmark for selected device
        if (isSelected) {
          const checkmark = document.createElement('div');
          checkmark.className = 'device-checkmark';
          checkmark.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
          deviceItem.appendChild(checkmark);
        }

        deviceItem.addEventListener('click', () => this.selectMicrophone(device));
        deviceList.appendChild(deviceItem);
      });

      // Show modal
      modal.style.display = 'flex';

      // Setup close handlers
      const closeBtn = document.getElementById('close-microphone-modal');
      if (closeBtn) {
        closeBtn.onclick = () => this.closeMicrophoneModal();
      }

      modal.onclick = (e) => {
        if (e.target === modal) {
          this.closeMicrophoneModal();
        }
      };
    } catch (error) {
      logger.error('Failed to show microphone selection:', error);
      this.deps.onError(t('identify.errors.microphoneLoad'));
    }
  }

  /**
   * Select a microphone
   */
  private async selectMicrophone(device: AudioDeviceInfo): Promise<void> {
    try {
      logger.info(`Selecting microphone: ${device.label}`);

      // Stop current stream
      if (this.currentAudioStream) {
        this.currentAudioStream.getTracks().forEach((track) => track.stop());
      }

      // Update selected device
      this.selectedDeviceId = device.deviceId;

      // Get new stream with selected device
      this.currentAudioStream = await getRawAudioStream(device.deviceId);

      // Re-analyze hardware
      const audioTracks = this.currentAudioStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks available on selected device');
      }
      const audioTrack = audioTracks[0];
      const settings = audioTrack.getSettings();
      const sampleRate = settings.sampleRate || 44100;

      this.audioQualityReport = HardwareCheck.analyzeCurrentDevice(device.label, sampleRate);

      // Update UI
      this.updateHardwareInfoCard();

      // Close modal
      this.closeMicrophoneModal();

      // Notify user
      notify.success(t('identify.success.microphoneChanged', { label: device.label }));
    } catch (error) {
      logger.error('Failed to select microphone:', error);
      this.deps.onError(t('identify.errors.microphoneSwitch'));
    }
  }

  /**
   * Close microphone selection modal
   */
  private closeMicrophoneModal(): void {
    const modal = document.getElementById('microphone-selection-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }
}
