// 音频增强相关配置（.env.local 层）
// 优先级：系统设置（/api/app-config）> NEXT_PUBLIC_AUDIO_GAIN_* > 本文件代码兜底

/** 代码兜底：环境变量缺失或无效时使用 */
const FALLBACK = {
  /** 增益下限（0 表示可降至静音） */
  gainMin: 0,
  /** 增益上限 */
  gainMax: 3,
  /** 滑条步进（0.2 即五档一格） */
  gainStep: 0.2,
  /** 默认增益（1 为不增不减） */
  gainDefault: 1,
} as const;

function readGainNumber(
  envKey: string,
  fallback: number,
  options?: { min?: number; max?: number }
): number {
  const raw = process.env[envKey]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;

  const min = options?.min ?? -Infinity;
  const max = options?.max ?? Infinity;
  if (value < min || value > max) return fallback;

  return value;
}

/**
 * 增益滑条参数（已解析环境变量，可直接用于 UI 与音频管线）
 *
 * 对应环境变量（均在 .env.local 中配置，需重启 dev 生效）：
 * - NEXT_PUBLIC_AUDIO_GAIN_MIN    增益下限
 * - NEXT_PUBLIC_AUDIO_GAIN_MAX    增益上限
 * - NEXT_PUBLIC_AUDIO_GAIN_STEP   滑条步进
 * - NEXT_PUBLIC_AUDIO_GAIN_DEFAULT 默认增益
 */
export const AUDIO_GAIN_CONFIG = {
  min: readGainNumber('NEXT_PUBLIC_AUDIO_GAIN_MIN', FALLBACK.gainMin, { min: 0, max: 10 }),
  max: readGainNumber('NEXT_PUBLIC_AUDIO_GAIN_MAX', FALLBACK.gainMax, { min: 0.1, max: 10 }),
  step: readGainNumber('NEXT_PUBLIC_AUDIO_GAIN_STEP', FALLBACK.gainStep, { min: 0.01, max: 1 }),
  default: readGainNumber('NEXT_PUBLIC_AUDIO_GAIN_DEFAULT', FALLBACK.gainDefault, { min: 0, max: 10 }),
} as const;

// 保证 min <= default <= max，且 step 合理
const resolvedMin = Math.min(AUDIO_GAIN_CONFIG.min, AUDIO_GAIN_CONFIG.max);
const resolvedMax = Math.max(AUDIO_GAIN_CONFIG.min, AUDIO_GAIN_CONFIG.max);
const resolvedDefault = Math.min(
  resolvedMax,
  Math.max(resolvedMin, AUDIO_GAIN_CONFIG.default)
);
const resolvedStep = Math.max(0.01, AUDIO_GAIN_CONFIG.step);

export const GAIN_MIN = resolvedMin;
export const GAIN_MAX = resolvedMax;
export const GAIN_STEP = resolvedStep;
export const GAIN_DEFAULT = resolvedDefault;
