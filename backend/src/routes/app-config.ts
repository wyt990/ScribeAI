import { Router } from 'express';
import { getSettingValue } from '../lib/system-settings';
import { getStartupSeedStatus } from '../lib/startup-seed';

const router = Router();

function parseSettingInt(value: string, defaultValue: number, min: number, max: number): number {
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.min(max, Math.max(min, n));
}

function parseSettingFloat(value: string, defaultValue: number, min: number, max: number): number {
  const n = Number.parseFloat(value.trim());
  if (!Number.isFinite(n)) return defaultValue;
  return Math.min(max, Math.max(min, n));
}

function parseSettingBool(value: string, defaultValue: boolean): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return defaultValue;
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultValue;
}

function parseChunkMode(value: string): 'timer' | 'auto' {
  const v = value.trim().toLowerCase();
  if (v === 'timer') return 'timer';
  return 'auto';
}

/** 代码兜底（与 frontend/config/audio.ts 一致） */
const AUDIO_GAIN_FALLBACK = { min: 0, max: 3, step: 0.2, default: 1 } as const;

function resolveAudioGainConfig() {
  const min = parseSettingFloat(
    getSettingValue('mobile.audio_gain_min'),
    AUDIO_GAIN_FALLBACK.min,
    0,
    10
  );
  const max = parseSettingFloat(
    getSettingValue('mobile.audio_gain_max'),
    AUDIO_GAIN_FALLBACK.max,
    0.1,
    10
  );
  const step = parseSettingFloat(
    getSettingValue('mobile.audio_gain_step'),
    AUDIO_GAIN_FALLBACK.step,
    0.01,
    1
  );
  const defaultGain = parseSettingFloat(
    getSettingValue('mobile.audio_gain_default'),
    AUDIO_GAIN_FALLBACK.default,
    0,
    10
  );
  const resolvedMin = Math.min(min, max);
  const resolvedMax = Math.max(min, max);
  const resolvedStep = Math.max(0.01, step);
  const resolvedDefault = Math.min(
    resolvedMax,
    Math.max(resolvedMin, defaultGain)
  );
  return {
    min: resolvedMin,
    max: resolvedMax,
    step: resolvedStep,
    default: resolvedDefault,
  };
}

/** 客户端 UI 配置（公开，无需登录） */
router.get('/', (_req, res) => {
  const seed = getStartupSeedStatus();
  const raw = getSettingValue('mobile.show_audio_enhancement_panel');
  const chunkRaw = getSettingValue('mobile.native_chunk_seconds');
  const modeRaw = getSettingValue('mobile.native_chunk_mode');
  const rmsRaw = getSettingValue('mobile.native_vad_rms_threshold');

  res.json({
    startupSeed: {
      ready: seed.ready,
      error: seed.error,
    },
    showAudioEnhancementPanel: parseSettingBool(raw, true),
    audioGain: resolveAudioGainConfig(),
    nativeChunkMode: parseChunkMode(modeRaw),
    nativeChunkSeconds: parseSettingInt(chunkRaw, 3, 1, 30),
    nativeVad: {
      redemptionMs: parseSettingInt(getSettingValue('stt.vad_redemption_ms'), 1400, 200, 10_000),
      minSpeechMs: parseSettingInt(getSettingValue('stt.vad_min_speech_ms'), 400, 100, 10_000),
      preSpeechPadMs: parseSettingInt(getSettingValue('stt.vad_pre_speech_pad_ms'), 800, 0, 3000),
      speechRmsThreshold: parseSettingFloat(rmsRaw, 0.02, 0.001, 0.5),
      maxSegmentMs: 30_000,
    },
  });
});

export default router;
