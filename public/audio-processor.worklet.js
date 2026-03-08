/**
 * ZANOBOT - AUDIO WORKLET PROCESSOR
 *
 * Modern replacement for deprecated ScriptProcessorNode.
 * Runs on separate audio thread for better performance.
 *
 * Features:
 * - Real-time audio processing without main thread blocking
 * - Lower latency than ScriptProcessorNode
 * - Better performance for DSP operations
 */

// CONFIGURATION CONSTANTS
// These values are tuned for industrial machine diagnostics

// Signal detection threshold (RMS value)
// Reduced from 0.02 to 0.002 for very weak signals
// Testing showed that even "loud enough" machine sounds can be < 0.005 RMS
// Value 0.002 is ~2.5x more sensitive, catching weak machine signals
// while still above typical background noise (~0.0001 - 0.001)
//
// iOS NOTE: iOS applies hardware-level audio filtering that can significantly
// reduce signal strength. The threshold is kept low to accommodate this.
const SIGNAL_THRESHOLD_RMS = 0.002;

// Maximum wait time for signal detection (30 seconds)
const MAX_WAIT_TIME_SECONDS = 30;

// Default sample rate (will be overridden by actual AudioContext rate)
const DEFAULT_SAMPLE_RATE = 44100;

// DSP window size in seconds (matches feature extraction)
const DSP_WINDOW_SIZE_SECONDS = 0.330;

// Ring buffer size multiplier (2x chunk size for safety margin)
const RING_BUFFER_SIZE_MULTIPLIER = 2;

// Minimum ring buffer size in samples
const MIN_RING_BUFFER_SIZE = 32768;

class ZanobotAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Smart Start state
    this.smartStartActive = false;
    this.warmUpStartSample = 0;
    this.warmUpDurationSamples = 0; // Will be set in init based on sample rate
    this.signalThreshold = SIGNAL_THRESHOLD_RMS;
    this.maxWaitSamples = 0; // Will be set in init
    this.waitStartSample = 0;
    this.phase = 'idle'; // idle, warmup, waiting, recording
    this.currentSampleCount = 0; // Track total samples processed

    // Dynamic chunk size based on actual sample rate
    // Will be set via 'init' message from manager
    this.sampleRate = DEFAULT_SAMPLE_RATE;
    this.chunkSize = Math.floor(DSP_WINDOW_SIZE_SECONDS * this.sampleRate);

    // CRITICAL FIX: Ring buffer size must be larger than chunkSize
    // At 96kHz: chunkSize = 31680 samples
    // We need bufferSize >= chunkSize for proper circular buffer operation
    // Use 2x chunkSize as safety margin for high sample rates
    this.bufferSize = Math.max(MIN_RING_BUFFER_SIZE, this.chunkSize * RING_BUFFER_SIZE_MULTIPLIER);
    this.ringBuffer = new Float32Array(this.bufferSize);
    this.writePos = 0;
    this.readPos = 0;
    this.samplesWritten = 0; // Track total samples written to detect wrap-around

    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  /**
   * Handle messages from main thread
   */
  handleMessage(message) {
    switch (message.type) {
      case 'init':
        // Initialize with actual sample rate from AudioContext
        if (message.sampleRate) {
          this.sampleRate = message.sampleRate;
          this.chunkSize = Math.floor(DSP_WINDOW_SIZE_SECONDS * this.sampleRate);

          // CRITICAL FIX: Resize ring buffer based on actual chunk size
          // This ensures bufferSize >= chunkSize at all sample rates
          this.bufferSize = Math.max(MIN_RING_BUFFER_SIZE, this.chunkSize * RING_BUFFER_SIZE_MULTIPLIER);
          this.ringBuffer = new Float32Array(this.bufferSize);
          this.writePos = 0;
          this.readPos = 0;
          this.samplesWritten = 0;

          // CRITICAL FIX: Convert time-based durations to sample-based
          // AudioWorklet doesn't have access to performance.now(), use samples instead
          if (message.warmUpDuration) {
            // Convert milliseconds to samples
            this.warmUpDurationSamples = Math.floor((message.warmUpDuration / 1000) * this.sampleRate);
          } else {
            // Default 5 seconds
            this.warmUpDurationSamples = Math.floor(5 * this.sampleRate);
          }

          // Max wait time in samples
          this.maxWaitSamples = Math.floor(MAX_WAIT_TIME_SECONDS * this.sampleRate);

          // Acknowledge initialization
          this.port.postMessage({
            type: 'init-complete',
            sampleRate: this.sampleRate,
            chunkSize: this.chunkSize,
            bufferSize: this.bufferSize,
            warmUpDurationSamples: this.warmUpDurationSamples
          });
        }
        break;
      case 'start-smart-start':
        this.startSmartStart();
        break;
      case 'skip-to-recording':
        this.skipToRecording();
        break;
      case 'stop':
        this.phase = 'idle';
        this.smartStartActive = false;
        break;
      case 'reset-buffer':
        this.ringBuffer.fill(0);
        this.writePos = 0;
        this.readPos = 0;
        this.samplesWritten = 0;
        break;
    }
  }

  /**
   * Start Smart Start sequence
   */
  startSmartStart() {
    this.smartStartActive = true;
    this.phase = 'warmup';
    this.warmUpStartSample = this.currentSampleCount;
    this.writePos = 0;
    this.readPos = 0;
    this.samplesWritten = 0;
    this.ringBuffer.fill(0);

    this.port.postMessage({
      type: 'smart-start-state',
      phase: 'warmup',
      remainingWarmUp: Math.floor((this.warmUpDurationSamples / this.sampleRate) * 1000)
    });
  }

  /**
   * Skip Smart Start and go directly to recording
   */
  skipToRecording() {
    this.phase = 'recording';
    this.smartStartActive = false;
    this.writePos = 0;
    this.readPos = 0;
    this.samplesWritten = 0;
    this.ringBuffer.fill(0);

    this.port.postMessage({
      type: 'smart-start-state',
      phase: 'recording'
    });
  }

  /**
   * Calculate RMS (Root Mean Square) of audio samples
   */
  calculateRMS(samples) {
    if (!samples || samples.length === 0) {
      return 0;
    }
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  /**
   * Process audio data (called for each audio block)
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];

    // If no input, continue processing
    if (!input || !input[0]) {
      return true;
    }

    const inputChannel = input[0]; // Mono channel

    // Increment sample counter
    this.currentSampleCount += inputChannel.length;

    // Smart Start logic
    if (this.smartStartActive) {
      if (this.phase === 'warmup') {
        const elapsedSamples = this.currentSampleCount - this.warmUpStartSample;
        const remainingSamples = Math.max(0, this.warmUpDurationSamples - elapsedSamples);
        const remainingMs = Math.floor((remainingSamples / this.sampleRate) * 1000);

        // Send status update (throttled - approximately every 100ms worth of samples)
        const samplesPerUpdate = Math.floor(0.1 * this.sampleRate); // ~100ms in samples
        if (Math.floor(elapsedSamples / samplesPerUpdate) !== Math.floor((elapsedSamples - inputChannel.length) / samplesPerUpdate)) {
          this.port.postMessage({
            type: 'smart-start-state',
            phase: 'warmup',
            remainingWarmUp: remainingMs
          });
        }

        if (elapsedSamples >= this.warmUpDurationSamples) {
          // Warm-up complete, start waiting for signal
          this.phase = 'waiting';
          this.waitStartSample = this.currentSampleCount;

          this.port.postMessage({
            type: 'smart-start-state',
            phase: 'waiting'
          });
        }

        // Discard audio during warm-up
        return true;
      }

      if (this.phase === 'waiting') {
        const waitElapsedSamples = this.currentSampleCount - this.waitStartSample;

        // Check for timeout
        if (waitElapsedSamples >= this.maxWaitSamples) {
          // CRITICAL FIX: Clean up ring buffer state before signaling timeout
          // This prevents old audio data from being processed on retry
          this.ringBuffer.fill(0);
          this.writePos = 0;
          this.readPos = 0;
          this.samplesWritten = 0;

          this.port.postMessage({
            type: 'smart-start-timeout'
          });
          this.smartStartActive = false;
          this.phase = 'idle';
          return true;
        }

        // Check signal level
        const rms = this.calculateRMS(inputChannel);

        // DEBUG: Log RMS values periodically to help diagnose signal issues
        // Log every ~1 second (approximately sampleRate / 128 blocks per second)
        const blocksPerSecond = Math.floor(this.sampleRate / 128);
        const waitElapsedBlocks = Math.floor(waitElapsedSamples / 128);
        if (waitElapsedBlocks % blocksPerSecond === 0) {
          this.port.postMessage({
            type: 'debug-rms',
            rms: rms,
            threshold: this.signalThreshold
          });
        }

        if (rms >= this.signalThreshold) {
          // Signal detected!
          this.phase = 'recording';
          this.smartStartActive = false;

          this.port.postMessage({
            type: 'smart-start-complete',
            rms: rms
          });
        }

        // Don't write to buffer during waiting
        if (this.phase === 'waiting') {
          return true;
        }
      }
    }

    // Normal recording mode (write to ring buffer)
    if (this.phase === 'recording') {
      // Write samples to ring buffer
      for (let i = 0; i < inputChannel.length; i++) {
        this.ringBuffer[this.writePos] = inputChannel[i];
        this.writePos = (this.writePos + 1) % this.bufferSize;
        this.samplesWritten++;
      }

      // Send audio chunk to main thread for real-time processing
      // Transfer a copy of the data every ~chunkSize samples (330ms at actual sample rate)
      // This matches the DSP window size for feature extraction
      // CRITICAL FIX: Use dynamic chunk size based on actual sample rate
      // - At 44.1kHz: ~14553 samples
      // - At 48kHz: ~15840 samples

      // CRITICAL FIX: Improved chunk triggering logic
      // Instead of relying on samplesWritten % chunkSize === 0 (which rarely triggers
      // because AudioWorklet processes in 128-sample blocks and chunkSize is not a multiple of 128),
      // we track the last chunk delivery and trigger when enough samples have accumulated.
      // Calculate how many samples have been written since last chunk delivery
      const samplesSinceLastChunk = this.samplesWritten - this.readPos;

      if (samplesSinceLastChunk >= this.chunkSize) {
        // CRITICAL FIX: Ensure we don't read beyond available samples
        // This prevents reading old/invalid data from the ring buffer
        const availableSamples = this.samplesWritten - this.readPos;
        if (availableSamples < this.chunkSize) {
          // Not enough data yet, wait for more (safety check, should not happen)
          return true;
        }

        // Extract chunk from readPos (not from writePos backwards!)
        // This ensures we process all data sequentially without gaps
        const chunk = new Float32Array(this.chunkSize);

        // FIXED: Read from readPos forward, not from writePos backward
        // Calculate read position in circular buffer
        let chunkReadPos = this.readPos % this.bufferSize;

        // Copy data from circular buffer, handling wrap-around
        for (let i = 0; i < this.chunkSize; i++) {
          chunk[i] = this.ringBuffer[chunkReadPos];
          chunkReadPos = (chunkReadPos + 1) % this.bufferSize;
        }

        // FIXED: Increment readPos by chunkSize (not set to samplesWritten)
        // This ensures we process all data without skipping samples
        this.readPos += this.chunkSize;

        // CRITICAL FIX: Send audio-data-ready message BEFORE audio-chunk
        // This maintains API consistency with AudioWorkletManager expectations
        // Manager can sync currentWritePos before receiving the chunk
        this.port.postMessage({
          type: 'audio-data-ready',
          writePos: this.writePos
        });

        // Transfer chunk to main thread (with writePos for redundancy)
        this.port.postMessage({
          type: 'audio-chunk',
          chunk: chunk.buffer,
          writePos: this.writePos
        }, [chunk.buffer]); // Transfer ownership for zero-copy
      }
    }

    // Keep processor alive
    return true;
  }
}

// Register processor
registerProcessor('zanobot-audio-processor', ZanobotAudioProcessor);
