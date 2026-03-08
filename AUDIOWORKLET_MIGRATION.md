# AudioWorklet Migration Guide

## Overview

Zanobot now supports **AudioWorklet** as a modern replacement for the deprecated `ScriptProcessorNode`.

### Why AudioWorklet?

- **Better Performance**: Runs on separate audio thread (no main thread blocking)
- **Lower Latency**: More efficient audio processing
- **Future-Proof**: ScriptProcessorNode is deprecated since 2014
- **Modern API**: Supported in all modern browsers (Chrome 66+, Firefox 76+, Safari 14.1+)

## Implementation

### Files Created

1. **`public/audio-processor.worklet.js`** - AudioWorklet processor (runs on audio thread)
2. **`src/core/audio/audioWorkletHelper.ts`** - TypeScript helper for managing AudioWorklet

### How It Works

```typescript
import { AudioWorkletManager, isAudioWorkletSupported } from '@core/audio/audioWorkletHelper.js';

// Check support
if (isAudioWorkletSupported()) {
  console.log('✅ AudioWorklet supported');
} else {
  console.warn('⚠️ AudioWorklet not supported, falling back to ScriptProcessorNode');
}

// Initialize
const workletManager = new AudioWorkletManager({
  bufferSize: 16384,
  onAudioData: (writePos) => {
    // Called when new audio data is available
    const chunk = workletManager.readLatestChunk(chunkSize);
    processChunk(chunk);
  },
  onSmartStartComplete: (rms) => {
    console.log('Signal detected:', rms);
  }
});

// Setup
await workletManager.init(audioContext, mediaStream);

// Start Smart Start
workletManager.startSmartStart();

// Cleanup
workletManager.cleanup();
```

## Migration Status

### ✅ Completed
- AudioWorklet processor implementation
- Helper class for managing AudioWorklet
- Smart Start integration
- Ring buffer management

### 🚧 To Do
1. Update `DiagnosePhase` to use AudioWorklet (with ScriptProcessorNode fallback)
2. Update `ReferencePhase` to use AudioWorklet
3. Add feature detection and automatic fallback
4. Test on various browsers

## Browser Support

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 66+ | ✅ Full |
| Firefox | 76+ | ✅ Full |
| Safari | 14.1+ | ✅ Full |
| Edge | 79+ | ✅ Full |
| Older browsers | - | ⚠️ Fallback to ScriptProcessorNode |

## Testing

To test AudioWorklet:

```bash
npm run dev
```

Open browser console and check for:
```
✅ AudioWorklet initialized
```

## Fallback Strategy

The code maintains both implementations:

1. **Try AudioWorklet first** (modern browsers)
2. **Fallback to ScriptProcessorNode** (older browsers)

```typescript
if (isAudioWorkletSupported()) {
  // Use AudioWorklet
  this.workletManager = new AudioWorkletManager(config);
  await this.workletManager.init(audioContext, mediaStream);
} else {
  // Use ScriptProcessorNode (legacy)
  this.scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  // ... legacy code
}
```

## Performance Comparison

| Metric | ScriptProcessorNode | AudioWorklet |
|--------|-------------------|--------------|
| Thread | Main thread | Audio thread |
| Latency | ~20-50ms | ~5-15ms |
| CPU Usage | Higher (blocks main) | Lower (dedicated) |
| Status | Deprecated | Modern |

## Next Steps

1. Update UI phases to use AudioWorklet
2. Add automatic browser compatibility detection
3. Test on mobile browsers (iOS Safari, Chrome Android)
4. Consider SharedArrayBuffer for zero-copy audio data transfer

## References

- [MDN: AudioWorklet API](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [Web Audio API Spec](https://webaudio.github.io/web-audio-api/#AudioWorklet)
- [Google Developers: Enter Audio Worklet](https://developers.google.com/web/updates/2017/12/audio-worklet)
