'use client';

import { useEffect, useState } from 'react';
import { APP_CONFIG, type ClientAppConfig } from '@/lib/app-config';

const ENV_FALLBACK: ClientAppConfig = {
  showAudioEnhancementPanel: APP_CONFIG.showAudioEnhancementPanel,
  nativeChunkMode: APP_CONFIG.nativeChunkMode,
  nativeChunkSeconds: APP_CONFIG.nativeChunkSeconds,
  nativeVad: APP_CONFIG.nativeVad,
};

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
        if (!data) return;
        const vad = data.nativeVad;
        setConfig({
          showAudioEnhancementPanel:
            typeof data.showAudioEnhancementPanel === 'boolean'
              ? data.showAudioEnhancementPanel
              : ENV_FALLBACK.showAudioEnhancementPanel,
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
        });
      })
      .catch(() => {
        /* 请求失败时沿用 .env / 默认值 */
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
