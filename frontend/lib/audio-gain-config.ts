import {
  GAIN_DEFAULT as ENV_GAIN_DEFAULT,
  GAIN_MAX as ENV_GAIN_MAX,
  GAIN_MIN as ENV_GAIN_MIN,
  GAIN_STEP as ENV_GAIN_STEP,
} from '@/config/audio';

export type AudioGainConfig = {
  min: number;
  max: number;
  step: number;
  default: number;
};

export const ENV_AUDIO_GAIN_CONFIG: AudioGainConfig = {
  min: ENV_GAIN_MIN,
  max: ENV_GAIN_MAX,
  step: ENV_GAIN_STEP,
  default: ENV_GAIN_DEFAULT,
};

function normalize(cfg: AudioGainConfig): AudioGainConfig {
  const min = Math.min(cfg.min, cfg.max);
  const max = Math.max(cfg.min, cfg.max);
  const step = Math.max(0.01, cfg.step);
  const defaultGain = Math.min(max, Math.max(min, cfg.default));
  return { min, max, step, default: defaultGain };
}

let runtime = normalize(ENV_AUDIO_GAIN_CONFIG);

export function getAudioGainConfig(): AudioGainConfig {
  return runtime;
}

/** 应用服务端 / 环境变量解析后的增益参数（进入录音页前调用） */
export function applyAudioGainConfig(cfg: Partial<AudioGainConfig>): AudioGainConfig {
  runtime = normalize({
    min: cfg.min ?? runtime.min,
    max: cfg.max ?? runtime.max,
    step: cfg.step ?? runtime.step,
    default: cfg.default ?? runtime.default,
  });
  return runtime;
}

export function clampGainValue(value: number, cfg: AudioGainConfig = getAudioGainConfig()): number {
  const steps = Math.round(value / cfg.step);
  return Math.min(cfg.max, Math.max(cfg.min, steps * cfg.step));
}
