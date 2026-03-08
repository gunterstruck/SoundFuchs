/**
 * ZANOBOT - AUDIO VISUALIZER COMPONENT
 *
 * Professional real-time FFT frequency spectrum visualization.
 *
 * Features:
 * - Frequency domain analysis (0-22kHz)
 * - Smooth gradient (Green → Yellow → Red for intensity)
 * - 60 FPS rendering
 * - High resolution (fftSize = 2048)
 * - Shows machine acoustic signatures (peaks, resonances)
 */

import { logger } from '@utils/logger.js';
import { isIOS } from '@utils/platform.js';
import {
  getVisualizerSettings,
  VISUALIZER_SETTINGS_EVENT,
  type VisualizerSettings,
} from '@utils/visualizerSettings.js';
import { setCanvasSize } from '@utils/canvasUtils.js';

export class AudioVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private analyser: AnalyserNode | null = null;
  private animationFrame: number | null = null;
  private dataArray: Uint8Array | null = null;
  private visualizerSettings: VisualizerSettings;
  private settingsListener: ((event: Event) => void) | null = null;

  // CRITICAL FIX: Store audio source reference to properly disconnect in stop()
  // Without this, the audio graph continues running and causes resource leaks
  private source: MediaStreamAudioSourceNode | null = null;
  // CRITICAL FIX: Add gain node for signal amplification
  private gainNode: GainNode | null = null;

  // Visualization settings
  private fftSize: number = 2048; // High resolution for bass/mid analysis
  private smoothing: number = 0.75; // Smooth transitions (0-1)
  private barCount: number = 128; // Number of frequency bars

  // CRITICAL FIX: Store actual sample rate from AudioContext for correct frequency labels
  private sampleRate: number = 48000; // Default to 48 kHz, updated in start()

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas element not found: ${canvasId}`);
    }

    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context');
    }

    this.ctx = ctx;
    setCanvasSize(this.canvas, this.ctx);

    this.visualizerSettings = getVisualizerSettings();
    this.settingsListener = (event: Event) => {
      const detail = (event as CustomEvent<VisualizerSettings>).detail;
      if (detail) {
        this.visualizerSettings = detail;
      }
    };
    window.addEventListener(VISUALIZER_SETTINGS_EVENT, this.settingsListener);
  }

  /**
   * Start visualization from audio stream
   *
   * @param audioContext - Web Audio API context
   * @param stream - MediaStream from microphone
   */
  public start(audioContext: AudioContext, stream: MediaStream): void {
    // CRITICAL FIX: Stop previous render loop to prevent parallel loops
    this.stop();

    // CRITICAL FIX: Store actual sample rate from AudioContext for correct frequency labels
    this.sampleRate = audioContext.sampleRate;

    // Create analyser node with high resolution
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = this.smoothing;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -10;

    // CRITICAL FIX: Add GainNode for signal amplification to improve visualization
    // Amplify the microphone signal by 3x to make weak signals more visible in the spectrogram
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = isIOS() ? 3.0 : 1.0; // iOS boost only; keep Android/Desktop unchanged

    // CRITICAL FIX: Store source reference for proper cleanup in stop()
    // Without storing the reference, we cannot disconnect it later,
    // causing the audio graph to continue running (resource leak)
    this.source = audioContext.createMediaStreamSource(stream);
    this.source.connect(this.gainNode);
    this.gainNode.connect(this.analyser);

    // Create data array for frequency data
    const bufferLength = this.analyser.frequencyBinCount; // fftSize / 2
    this.dataArray = new Uint8Array(bufferLength);

    logger.debug(
      `📊 FFT Visualizer started: ${this.fftSize} samples, ${bufferLength} bins, sampleRate=${this.sampleRate}Hz`
    );

    // Start rendering at 60 FPS
    this.render();
  }

  /**
   * Stop visualization
   *
   * CRITICAL FIX: Disconnect audio source to prevent resource leaks.
   * Without disconnecting, the audio graph continues running even after
   * visualization stops, consuming CPU and memory resources.
   */
  public stop(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // CRITICAL FIX: Disconnect audio source from audio graph
    // This prevents resource leaks by properly cleaning up the audio connection
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    // CRITICAL FIX: Disconnect and clean up gain node
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    this.analyser = null;
    this.dataArray = null;

    // Clear canvas
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    this.ctx.clearRect(0, 0, width, height);
  }

  /**
   * Render frequency spectrum (60 FPS)
   *
   * Visual strategy:
   * - X-axis: Frequency (0 Hz → ~22 kHz)
   * - Y-axis: Amplitude (dB)
   * - Color: Intensity gradient (Green → Yellow → Red)
   */
  private render(): void {
    if (!this.analyser || !this.dataArray) {
      return;
    }

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    // Get frequency data (0-255 values)
    // @ts-expect-error - Type mismatch between browser types
    this.analyser.getByteFrequencyData(this.dataArray);

    // Clear canvas with theme-aware background
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--viz-bg').trim();
    this.ctx.fillStyle = bgColor || '#0a0a0a';
    this.ctx.fillRect(0, 0, width, height);

    // Draw grid lines (optional, for professional look)
    this.drawGrid(width, height);

    // Draw frequency spectrum
    this.drawSpectrum(width, height);

    // Draw frequency labels
    this.drawFrequencyLabels(width, height);

    // Continue animation at 60 FPS
    this.animationFrame = requestAnimationFrame(() => this.render());
  }

  /**
   * Draw background grid
   */
  private drawGrid(width: number, height: number): void {
    // Use theme-aware grid color
    const gridColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--viz-grid')
      .trim();
    this.ctx.strokeStyle = gridColor || 'rgba(255, 255, 255, 0.05)';
    this.ctx.lineWidth = 1;

    // Horizontal lines (amplitude)
    for (let i = 0; i <= 4; i++) {
      const y = (height / 4) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }

    // Vertical lines (frequency markers)
    const markers = [0, 0.25, 0.5, 0.75, 1]; // 0%, 25%, 50%, 75%, 100%
    markers.forEach((marker) => {
      const x = width * marker;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    });
  }

  /**
   * Draw frequency spectrum as filled bars
   *
   * Strategy: Linear frequency distribution (could be log scale for pro audio)
   */
  private drawSpectrum(width: number, height: number): void {
    if (!this.dataArray) return;

    const barWidth = width / this.barCount;

    for (let i = 0; i < this.barCount; i++) {
      const normalizedValue = this.getNormalizedValueForBar(i);

      // Calculate bar height
      const barHeight = normalizedValue * height;

      // Get color based on INTENSITY (not frequency)
      const color = this.getIntensityColor(normalizedValue);

      // Draw bar
      const x = i * barWidth;
      const y = height - barHeight;

      // Fill bar with gradient
      this.ctx.fillStyle = color;
      this.ctx.fillRect(x, y, barWidth - 1, barHeight);

      // Add subtle glow effect for high values
      if (normalizedValue > 0.7) {
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = color;
        this.ctx.fillRect(x, y, barWidth - 1, barHeight);
        this.ctx.shadowBlur = 0;
      }
    }

    // Optional: Draw filled spectrum (polygon)
    this.drawFilledSpectrum(width, height);
  }

  /**
   * Draw filled spectrum line (alternative style)
   */
  private drawFilledSpectrum(width: number, height: number): void {
    if (!this.dataArray) return;

    const points: { x: number; y: number }[] = [];
    const barWidth = width / this.barCount;

    // Collect points
    for (let i = 0; i < this.barCount; i++) {
      const normalizedValue = this.getNormalizedValueForBar(i);
      const barHeight = normalizedValue * height;

      points.push({
        x: i * barWidth + barWidth / 2,
        y: height - barHeight,
      });
    }

    // Draw smooth line
    if (points.length > 1) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, height);

      // Draw to first point
      this.ctx.lineTo(points[0].x, points[0].y);

      // Draw smooth curve through points
      for (let i = 0; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        this.ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }

      // Last point
      const lastPoint = points[points.length - 1];
      this.ctx.lineTo(lastPoint.x, lastPoint.y);
      this.ctx.lineTo(width, height);
      this.ctx.closePath();

      // Fill with subtle gradient (theme-aware)
      const computedStyle = getComputedStyle(document.documentElement);
      const fillTop = computedStyle.getPropertyValue('--viz-fill-top').trim();
      const fillBottom = computedStyle.getPropertyValue('--viz-fill-bottom').trim();
      const vizPrimary = computedStyle.getPropertyValue('--viz-primary').trim();

      const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, fillTop || 'rgba(59, 130, 246, 0.3)');
      gradient.addColorStop(1, fillBottom || 'rgba(59, 130, 246, 0.05)');

      this.ctx.fillStyle = gradient;
      this.ctx.fill();

      // Stroke line (theme-aware)
      this.ctx.strokeStyle = vizPrimary || 'rgba(59, 130, 246, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }
  }

  /**
   * Get color based on intensity (Theme-aware gradient)
   *
   * @param intensity - Normalized value (0-1)
   * @returns CSS color string
   */
  private getIntensityColor(intensity: number): string {
    // Get theme colors from CSS variables
    const computedStyle = getComputedStyle(document.documentElement);
    const primaryColor = computedStyle.getPropertyValue('--primary-color').trim();
    const accentColor = computedStyle.getPropertyValue('--accent-color').trim();

    // For low intensity, use primary color
    if (intensity < 0.5) {
      // Extract RGB from hex or use fallback
      const rgb = this.hexToRgb(primaryColor) || { r: 0, g: 243, b: 255 };
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.3 + intensity})`;
    }
    // For high intensity, blend to accent color (orange in neon theme)
    else {
      const rgb = this.hexToRgb(accentColor) || { r: 255, g: 136, b: 0 };
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.6 + intensity * 0.4})`;
    }
  }

  /**
   * Convert hex color to RGB
   * @param hex - Hex color string (e.g., "#00f3ff")
   * @returns RGB object or null
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    // Remove # if present
    hex = hex.replace('#', '');

    // Parse hex
    if (hex.length === 6) {
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16),
      };
    }
    return null;
  }

  /**
   * Draw frequency labels (Hz)
   *
   * CRITICAL FIX: Use actual sample rate from AudioContext instead of hardcoded 44.1kHz
   * This ensures labels are correct for 48kHz (or any other sample rate)
   */
  private drawFrequencyLabels(width: number, height: number): void {
    // CRITICAL FIX: Use actual sample rate from AudioContext (e.g., 48000 Hz)
    const maxFreq = this.sampleRate / 2; // Nyquist frequency
    const isLogScale = this.visualizerSettings.frequencyScale === 'log';

    // Calculate frequency labels dynamically based on actual sample rate
    // Format: 0 Hz, 25%, 50%, 75%, 100% of Nyquist frequency
    const formatFreq = (freq: number): string => {
      if (freq === 0) return '0';
      if (freq >= 1000) return `${Math.round(freq / 1000)}k`;
      return freq.toString();
    };

    const labels = isLogScale
      ? [
          { pos: 0, freq: 0 },
          { freq: 20 },
          { freq: 50 },
          { freq: 100 },
          { freq: 500 },
          { freq: 1000 },
          { freq: 5000 },
          { freq: 10000 },
          { freq: maxFreq },
        ].map((label) => {
          if (label.freq === 0) {
            return { pos: 0, freq: 0 };
          }
          const minFreq = Math.min(20, maxFreq);
          const logMin = Math.log10(minFreq);
          const logMax = Math.log10(maxFreq);
          const clamped = Math.min(Math.max(label.freq, minFreq), maxFreq);
          const pos = (Math.log10(clamped) - logMin) / (logMax - logMin);
          return { pos, freq: clamped };
        })
      : [
          { pos: 0, freq: 0 },
          { pos: 0.25, freq: maxFreq * 0.25 },
          { pos: 0.5, freq: maxFreq * 0.5 },
          { pos: 0.75, freq: maxFreq * 0.75 },
          { pos: 1, freq: maxFreq },
        ];

    // Use theme-aware text color
    const textColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--viz-text')
      .trim();

    // Use theme-aware font family from CSS variables
    const fontFamily = getComputedStyle(document.documentElement)
      .getPropertyValue('--font-primary')
      .trim() || 'system-ui, sans-serif';
    this.ctx.font = `10px ${fontFamily}`;
    this.ctx.fillStyle = textColor || 'rgba(255, 255, 255, 0.4)';
    this.ctx.textAlign = 'center';

    labels.forEach((label) => {
      const x = width * label.pos;
      const y = height - 5;
      this.ctx.fillText(formatFreq(label.freq) + ' Hz', x, y);
    });

    // Draw amplitude label
    this.ctx.textAlign = 'left';
    const amplitudeLabel =
      this.visualizerSettings.amplitudeScale === 'log' ? 'Amplitude (dB, log)' : 'Amplitude (dB)';
    this.ctx.fillText(amplitudeLabel, 5, 15);
  }

  /**
   * Draw static waveform from audio buffer (legacy, for reference recording)
   *
   * @param audioBuffer - Recorded audio buffer
   */
  public drawWaveform(audioBuffer: AudioBuffer): void {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    // Clear canvas with theme-aware background
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--viz-bg').trim();
    this.ctx.fillStyle = bgColor || '#0a0a0a';
    this.ctx.fillRect(0, 0, width, height);

    // CRITICAL FIX: Guard against zero width (would cause step=Infinity and NaN coordinates)
    if (width <= 0) {
      return;
    }

    // Get channel data
    const channelData = audioBuffer.getChannelData(0);
    const step = Math.ceil(channelData.length / width);

    // Draw waveform (theme-aware)
    const vizPrimary = getComputedStyle(document.documentElement)
      .getPropertyValue('--viz-primary')
      .trim();
    this.ctx.strokeStyle = vizPrimary || '#3b82f6';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    for (let i = 0; i < width; i++) {
      const index = i * step;
      const value = channelData[index];

      const x = i;
      const y = ((1 + value) * height) / 2; // Normalize to canvas height

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.stroke();

    // Draw center line (theme-aware)
    const gridColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--viz-grid')
      .trim();
    this.ctx.strokeStyle = gridColor || '#333333';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, height / 2);
    this.ctx.lineTo(width, height / 2);
    this.ctx.stroke();
  }

  /**
   * Destroy the component and clean up
   */
  public destroy(): void {
    this.stop();
    if (this.settingsListener) {
      window.removeEventListener(VISUALIZER_SETTINGS_EVENT, this.settingsListener);
    }
  }

  private getNormalizedValueForBar(barIndex: number): number {
    if (!this.dataArray) return 0;

    const { start, end } = this.getFrequencyBinRange(barIndex);
    let sum = 0;
    let count = 0;

    for (let i = start; i < end; i++) {
      if (i >= 0 && i < this.dataArray.length) {
        sum += this.dataArray[i];
        count++;
      }
    }

    const value = count > 0 ? sum / count : 0;
    let normalizedValue = value / 255;

    if (this.visualizerSettings.amplitudeScale === 'log') {
      normalizedValue = Math.log10(1 + normalizedValue * 9);
    }

    return normalizedValue;
  }

  private getFrequencyBinRange(barIndex: number): { start: number; end: number } {
    if (!this.dataArray) {
      return { start: 0, end: 0 };
    }

    const totalBins = this.dataArray.length;
    const maxBinIndex = totalBins - 1;

    if (this.visualizerSettings.frequencyScale !== 'log' || this.sampleRate <= 0) {
      const binStep = Math.max(1, Math.floor(totalBins / this.barCount));
      const start = Math.min(barIndex * binStep, totalBins - 1);
      const end = Math.min(start + binStep, totalBins);
      return { start, end };
    }

    const maxFreq = this.sampleRate / 2;
    const minFreq = Math.min(20, maxFreq);

    if (maxFreq <= minFreq) {
      const binStep = Math.max(1, Math.floor(totalBins / this.barCount));
      const start = Math.min(barIndex * binStep, totalBins - 1);
      const end = Math.min(start + binStep, totalBins);
      return { start, end };
    }

    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const ratioStart = barIndex / this.barCount;
    const ratioEnd = (barIndex + 1) / this.barCount;

    const startFreq =
      barIndex === 0 ? 0 : Math.pow(10, logMin + (logMax - logMin) * ratioStart);
    const endFreq = Math.pow(10, logMin + (logMax - logMin) * ratioEnd);

    const start = Math.floor((startFreq / maxFreq) * maxBinIndex);
    const end = Math.min(
      maxBinIndex + 1,
      Math.max(start + 1, Math.ceil((endFreq / maxFreq) * maxBinIndex))
    );

    return { start, end };
  }
}
