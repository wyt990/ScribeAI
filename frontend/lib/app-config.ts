// /lib/app-config.ts
// 应用配置，通过环境变量或默认值控制

export const APP_CONFIG = {
  /** 是否显示音频源选择器（麦克风/标签页切换） */
  showAudioSource: process.env.NEXT_PUBLIC_SHOW_AUDIO_SOURCE !== 'false',
  /**
   * 是否显示录音页「音频增强」面板（仅隐藏 UI，增益/降噪仍按用户已保存设置生效）
   * 可被服务端 /api/app-config 覆盖（后台优先）
   */
  showAudioEnhancementPanel:
    process.env.NEXT_PUBLIC_SHOW_AUDIO_ENHANCEMENT_PANEL !== 'false',
  /** 安卓壳内分片：timer=定时节，auto=静音后分句 */
  nativeChunkMode:
    (process.env.NEXT_PUBLIC_NATIVE_CHUNK_MODE === 'timer' ? 'timer' : 'auto') as 'timer' | 'auto',
  /** timer 模式：每片 WAV 时长（秒） */
  nativeChunkSeconds: (() => {
    const n = Number.parseInt(process.env.NEXT_PUBLIC_NATIVE_CHUNK_SECONDS ?? '3', 10);
    return Number.isFinite(n) ? Math.min(30, Math.max(1, n)) : 3;
  })(),
  nativeVad: {
    redemptionMs: 1400,
    minSpeechMs: 400,
    preSpeechPadMs: 800,
    speechRmsThreshold: 0.02,
    maxSegmentMs: 30_000,
  },
  /** 默认音频源：'mic'（麦克风）或 'tab'（标签页） */
  defaultAudioSource: (process.env.NEXT_PUBLIC_DEFAULT_AUDIO_SOURCE === 'tab' ? 'tab' : 'mic') as 'mic' | 'tab',
} as const;

export type NativeChunkMode = 'timer' | 'auto';

export type NativeVadConfig = {
  redemptionMs: number;
  minSpeechMs: number;
  preSpeechPadMs: number;
  speechRmsThreshold: number;
  maxSegmentMs: number;
};

export type ClientAppConfig = {
  showAudioEnhancementPanel: boolean;
  nativeChunkMode: NativeChunkMode;
  nativeChunkSeconds: number;
  nativeVad: NativeVadConfig;
};
