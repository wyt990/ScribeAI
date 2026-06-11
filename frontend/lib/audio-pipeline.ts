import { createAutoGainController, type AutoGainController } from './auto-gain';
import { GAIN_DEFAULT } from './audio-settings';

const RNNOISE_WORKLET_URL = '/rnnoise/NoiseSuppressorWorklet.js';
export const RNNOISE_WORKLET_NAME = 'NoiseSuppressorWorklet';

const workletLoadedContexts = new WeakSet<AudioContext>();
let rnnoisePreloadPromise: Promise<boolean> | null = null;

/** 预热 RNNoise worklet（浏览器会缓存脚本） */
export async function preloadRnnoiseWorklet(): Promise<boolean> {
  if (rnnoisePreloadPromise) return rnnoisePreloadPromise;

  rnnoisePreloadPromise = (async () => {
    if (typeof window === 'undefined' || !('audioWorklet' in AudioContext.prototype)) {
      return false;
    }
    const probe = new AudioContext();
    try {
      await probe.audioWorklet.addModule(
        RNNOISE_WORKLET_URL,
        { type: 'module' } as unknown as WorkletOptions
      );
      workletLoadedContexts.add(probe);
      return true;
    } catch (err) {
      console.warn('[RNNoise] preload failed:', err);
      rnnoisePreloadPromise = null;
      return false;
    } finally {
      await probe.close();
    }
  })();

  return rnnoisePreloadPromise;
}

async function ensureRnnoiseWorklet(audioContext: AudioContext): Promise<boolean> {
  if (workletLoadedContexts.has(audioContext)) return true;
  try {
    await audioContext.audioWorklet.addModule(
      RNNOISE_WORKLET_URL,
      { type: 'module' } as unknown as WorkletOptions
    );
    workletLoadedContexts.add(audioContext);
    return true;
  } catch (err) {
    console.warn('[RNNoise] worklet load failed:', err);
    return false;
  }
}

function createCompressor(audioContext: AudioContext): DynamicsCompressorNode {
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -22;
  compressor.knee.value = 28;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.2;
  return compressor;
}

export type BuildAudioPipelineOptions = {
  rawStream: MediaStream;
  audioContext: AudioContext;
  gain: number;
  autoGain: boolean;
  noiseSuppression: boolean;
  onGainChange?: (gain: number) => void;
};

export type AudioPipeline = {
  processedStream: MediaStream;
  audioContext: AudioContext;
  gainNode: GainNode;
  outputAnalyser: AnalyserNode;
  setManualGain: (gain: number) => void;
  setAutoGain: (enabled: boolean) => void;
  destroy: () => void;
};

export async function buildAudioPipeline(
  options: BuildAudioPipelineOptions
): Promise<AudioPipeline> {
  const {
    rawStream,
    audioContext,
    gain: initialGain,
    autoGain,
    noiseSuppression,
    onGainChange,
  } = options;

  const source = audioContext.createMediaStreamSource(rawStream);
  const inputAnalyser = audioContext.createAnalyser();
  inputAnalyser.fftSize = 2048;
  inputAnalyser.smoothingTimeConstant = 0.5;

  const gainNode = audioContext.createGain();
  gainNode.gain.value = initialGain;

  const compressor = createCompressor(audioContext);
  const destination = audioContext.createMediaStreamDestination();
  const outputAnalyser = audioContext.createAnalyser();
  outputAnalyser.fftSize = 256;
  outputAnalyser.smoothingTimeConstant = 0.65;

  source.connect(inputAnalyser);
  inputAnalyser.connect(gainNode);

  let tail: AudioNode = gainNode;

  if (noiseSuppression) {
    const loaded = await ensureRnnoiseWorklet(audioContext);
    if (loaded) {
      try {
        const denoiser = new AudioWorkletNode(audioContext, RNNOISE_WORKLET_NAME);
        gainNode.connect(denoiser);
        tail = denoiser;
      } catch (err) {
        console.warn('[RNNoise] node create failed, skipping denoise:', err);
      }
    }
  }

  tail.connect(compressor);
  compressor.connect(outputAnalyser);
  outputAnalyser.connect(destination);

  let autoGainController: AutoGainController | null = null;
  let autoGainEnabled = autoGain;

  const bindAutoGain = (enabled: boolean) => {
    autoGainController?.stop();
    autoGainController = null;
    autoGainEnabled = enabled;
    if (!enabled) return;

    autoGainController = createAutoGainController({
      audioContext,
      inputAnalyser,
      gainNode,
      initialGain: gainNode.gain.value,
      onGainChange,
    });
    autoGainController.start();
  };

  bindAutoGain(autoGain);

  return {
    processedStream: destination.stream,
    audioContext,
    gainNode,
    outputAnalyser,
    setManualGain: (gain: number) => {
      if (autoGainEnabled) return;
      gainNode.gain.setTargetAtTime(gain, audioContext.currentTime, 0.03);
      onGainChange?.(gain);
    },
    setAutoGain: (enabled: boolean) => {
      if (enabled === autoGainEnabled) return;
      if (enabled) {
        bindAutoGain(true);
      } else {
        autoGainController?.stop();
        autoGainController = null;
        autoGainEnabled = false;
        const current = gainNode.gain.value;
        gainNode.gain.setTargetAtTime(current, audioContext.currentTime, 0.03);
        onGainChange?.(current);
      }
    },
    destroy: () => {
      autoGainController?.stop();
      autoGainController = null;
      try {
        source.disconnect();
        inputAnalyser.disconnect();
        gainNode.disconnect();
        compressor.disconnect();
        outputAnalyser.disconnect();
      } catch {
        /* ignore */
      }
      destination.stream.getTracks().forEach((t) => t.stop());
    },
  };
}

export function getDefaultPipelineGain(): number {
  return GAIN_DEFAULT;
}
