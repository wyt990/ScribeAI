import {
  applyAudioGainConfig,
  clampGainValue,
  getAudioGainConfig,
  ENV_AUDIO_GAIN_CONFIG,
} from '@/lib/audio-gain-config';

export type AudioSettings = {
  audioGain: number;
  autoGainEnabled: boolean;
  noiseSuppressionEnabled: boolean;
};

const STORAGE_KEY = 'scribeai-audio-settings';

export function getGainMin() {
  return getAudioGainConfig().min;
}

export function getGainMax() {
  return getAudioGainConfig().max;
}

export function getGainStep() {
  return getAudioGainConfig().step;
}

export function getGainDefault() {
  return getAudioGainConfig().default;
}

/** @deprecated 请使用 getGainMin()，保留以兼容旧引用 */
export const GAIN_MIN = ENV_AUDIO_GAIN_CONFIG.min;
export const GAIN_MAX = ENV_AUDIO_GAIN_CONFIG.max;
export const GAIN_STEP = ENV_AUDIO_GAIN_CONFIG.step;
export const GAIN_DEFAULT = ENV_AUDIO_GAIN_CONFIG.default;

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  audioGain: ENV_AUDIO_GAIN_CONFIG.default,
  autoGainEnabled: true,
  noiseSuppressionEnabled: true,
};

function clampGain(value: number): number {
  return clampGainValue(value);
}

export function loadAudioSettings(): AudioSettings {
  const cfg = getAudioGainConfig();
  if (typeof window === 'undefined') {
    return { ...DEFAULT_AUDIO_SETTINGS, audioGain: cfg.default };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS, audioGain: cfg.default };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      audioGain: clampGain(
        typeof parsed.audioGain === 'number' ? parsed.audioGain : cfg.default
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
    return { ...DEFAULT_AUDIO_SETTINGS, audioGain: cfg.default };
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

/** 系统设置热加载后，按新上下限收敛已保存增益 */
export function syncAudioSettingsToGainConfig(cfg = getAudioGainConfig()): void {
  applyAudioGainConfig(cfg);
  if (typeof window === 'undefined') return;
  const current = loadAudioSettings();
  const clamped = clampGainValue(current.audioGain, cfg);
  if (clamped !== current.audioGain) {
    saveAudioSettings({ audioGain: clamped });
  }
}
