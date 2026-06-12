'use client';

import { useEffect, useState } from 'react';
import { APP_CONFIG, type AudioGainConfig, type ClientAppConfig } from '@/lib/app-config';
import { applyAudioGainConfig, ENV_AUDIO_GAIN_CONFIG } from '@/lib/audio-gain-config';
import { loadAudioSettings, syncAudioSettingsToGainConfig } from '@/lib/audio-settings';
import { useRecordingStore } from '@/lib/store';

const ENV_FALLBACK: ClientAppConfig = {
  showAudioEnhancementPanel: APP_CONFIG.showAudioEnhancementPanel,
  audioGain: APP_CONFIG.audioGain,
  nativeChunkMode: APP_CONFIG.nativeChunkMode,
  nativeChunkSeconds: APP_CONFIG.nativeChunkSeconds,
  nativeVad: APP_CONFIG.nativeVad,
};

function parseAudioGain(
  raw: Partial<AudioGainConfig> | undefined,
  fallback: AudioGainConfig
): AudioGainConfig {
  const min =
    typeof raw?.min === 'number' && Number.isFinite(raw.min)
      ? Math.min(10, Math.max(0, raw.min))
      : fallback.min;
  const max =
    typeof raw?.max === 'number' && Number.isFinite(raw.max)
      ? Math.min(10, Math.max(0.1, raw.max))
      : fallback.max;
  const step =
    typeof raw?.step === 'number' && Number.isFinite(raw.step)
      ? Math.min(1, Math.max(0.01, raw.step))
      : fallback.step;
  const defaultGain =
    typeof raw?.default === 'number' && Number.isFinite(raw.default)
      ? Math.min(10, Math.max(0, raw.default))
      : fallback.default;

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

function mergeClientConfig(data: Partial<ClientAppConfig> | null): ClientAppConfig {
  if (!data) return ENV_FALLBACK;

  const vad = data.nativeVad;
  const audioGain = parseAudioGain(data.audioGain, ENV_FALLBACK.audioGain);

  return {
    showAudioEnhancementPanel:
      typeof data.showAudioEnhancementPanel === 'boolean'
        ? data.showAudioEnhancementPanel
        : ENV_FALLBACK.showAudioEnhancementPanel,
    audioGain,
    nativeChunkMode:
      data.nativeChunkMode === 'timer' || data.nativeChunkMode === 'auto'
        ? data.nativeChunkMode
        : ENV_FALLBACK.nativeChunkMode,
    nativeChunkSeconds:
      typeof data.nativeChunkSeconds === 'number' &&
      Number.isFinite(data.nativeChunkSeconds)
        ? Math.min(30, Math.max(1, Math.round(data.nativeChunkSeconds)))
        : ENV_FALLBACK.nativeChunkSeconds,
    nativeVad: {
      redemptionMs:
        typeof vad?.redemptionMs === 'number'
          ? Math.min(10_000, Math.max(200, Math.round(vad.redemptionMs)))
          : ENV_FALLBACK.nativeVad.redemptionMs,
      minSpeechMs:
        typeof vad?.minSpeechMs === 'number'
          ? Math.min(10_000, Math.max(100, Math.round(vad.minSpeechMs)))
          : ENV_FALLBACK.nativeVad.minSpeechMs,
      preSpeechPadMs:
        typeof vad?.preSpeechPadMs === 'number'
          ? Math.min(3000, Math.max(0, Math.round(vad.preSpeechPadMs)))
          : ENV_FALLBACK.nativeVad.preSpeechPadMs,
      speechRmsThreshold:
        typeof vad?.speechRmsThreshold === 'number'
          ? Math.min(0.5, Math.max(0.001, vad.speechRmsThreshold))
          : ENV_FALLBACK.nativeVad.speechRmsThreshold,
      maxSegmentMs:
        typeof vad?.maxSegmentMs === 'number'
          ? Math.min(120_000, Math.max(5000, Math.round(vad.maxSegmentMs)))
          : ENV_FALLBACK.nativeVad.maxSegmentMs,
    },
  };
}

/**
 * 加载客户端 UI 配置：服务端系统设置优先，其次 .env.local，最后代码默认值。
 */
export type AppConfigState = ClientAppConfig & {
  /** 服务端 /api/app-config 已返回（或请求失败并沿用本地默认） */
  isConfigReady: boolean;
};

export function useAppConfig(): AppConfigState {
  const [config, setConfig] = useState<ClientAppConfig>(ENV_FALLBACK);
  const [isConfigReady, setIsConfigReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void fetch('/api/app-config', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Partial<ClientAppConfig> | null) => {
        if (cancelled) return;
        const merged = mergeClientConfig(data);
        applyAudioGainConfig(merged.audioGain);
        syncAudioSettingsToGainConfig(merged.audioGain);

        if (useRecordingStore.getState().status === 'idle') {
          useRecordingStore.setState({ audioGain: loadAudioSettings().audioGain });
        }

        setConfig(merged);
      })
      .catch(() => {
        if (!cancelled) {
          applyAudioGainConfig(ENV_AUDIO_GAIN_CONFIG);
        }
      })
      .finally(() => {
        if (!cancelled) setIsConfigReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { ...config, isConfigReady };
}
