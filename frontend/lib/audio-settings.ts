export type AudioSettings = {
  audioGain: number;
  autoGainEnabled: boolean;
  noiseSuppressionEnabled: boolean;
};

const STORAGE_KEY = 'scribeai-audio-settings';

export const GAIN_MIN = 0;
export const GAIN_MAX = 3;
export const GAIN_STEP = 0.2;
export const GAIN_DEFAULT = 1;

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  audioGain: GAIN_DEFAULT,
  autoGainEnabled: true,
  noiseSuppressionEnabled: true,
};

function clampGain(value: number): number {
  const steps = Math.round(value / GAIN_STEP);
  return Math.min(GAIN_MAX, Math.max(GAIN_MIN, steps * GAIN_STEP));
}

export function loadAudioSettings(): AudioSettings {
  if (typeof window === 'undefined') return DEFAULT_AUDIO_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      audioGain: clampGain(
        typeof parsed.audioGain === 'number' ? parsed.audioGain : GAIN_DEFAULT
      ),
      autoGainEnabled:
        typeof parsed.autoGainEnabled === 'boolean'
          ? parsed.autoGainEnabled
          : DEFAULT_AUDIO_SETTINGS.autoGainEnabled,
      noiseSuppressionEnabled:
        typeof parsed.noiseSuppressionEnabled === 'boolean'
          ? parsed.noiseSuppressionEnabled
          : DEFAULT_AUDIO_SETTINGS.noiseSuppressionEnabled,
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function saveAudioSettings(partial: Partial<AudioSettings>): AudioSettings {
  const current = loadAudioSettings();
  const next: AudioSettings = {
    ...current,
    ...partial,
    ...(partial.audioGain !== undefined
      ? { audioGain: clampGain(partial.audioGain) }
      : {}),
  };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function formatGainLabel(gain: number): string {
  if (gain === 1) return '1.0×（标准）';
  if (gain < 1) return `${gain.toFixed(1)}×（减弱）`;
  return `${gain.toFixed(1)}×（增强）`;
}
