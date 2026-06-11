import { GAIN_MAX, GAIN_MIN } from './audio-settings';

const TARGET_RMS = 0.16;
const SILENCE_RMS = 0.004;
const ADJUST_INTERVAL_MS = 120;
const SMOOTHING = 0.18;

export type AutoGainController = {
  start: () => void;
  stop: () => void;
  getCurrentGain: () => number;
};

export function createAutoGainController(options: {
  audioContext: AudioContext;
  inputAnalyser: AnalyserNode;
  gainNode: GainNode;
  initialGain: number;
  onGainChange?: (gain: number) => void;
}): AutoGainController {
  const { audioContext, inputAnalyser, gainNode, onGainChange } = options;
  let currentGain = options.initialGain;
  let timer: ReturnType<typeof setInterval> | null = null;
  const buffer = new Float32Array(inputAnalyser.fftSize);

  const applyGain = (next: number) => {
    const clamped = Math.min(GAIN_MAX, Math.max(GAIN_MIN, next));
    if (Math.abs(clamped - currentGain) < 0.01) return;
    currentGain = clamped;
    gainNode.gain.setTargetAtTime(clamped, audioContext.currentTime, 0.08);
    onGainChange?.(clamped);
  };

  const tick = () => {
    inputAnalyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);
    if (rms < SILENCE_RMS) return;

    const desired = Math.min(GAIN_MAX, Math.max(GAIN_MIN, TARGET_RMS / rms));
    applyGain(currentGain + (desired - currentGain) * SMOOTHING);
  };

  return {
    start: () => {
      if (timer) return;
      applyGain(currentGain);
      timer = setInterval(tick, ADJUST_INTERVAL_MS);
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    getCurrentGain: () => currentGain,
  };
}
