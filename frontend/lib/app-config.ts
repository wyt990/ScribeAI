// /lib/app-config.ts
// 应用配置，通过环境变量或默认值控制

export const APP_CONFIG = {
  /** 是否显示音频源选择器（麦克风/标签页切换） */
  showAudioSource: process.env.NEXT_PUBLIC_SHOW_AUDIO_SOURCE !== 'false',
  /** 默认音频源：'mic'（麦克风）或 'tab'（标签页） */
  defaultAudioSource: (process.env.NEXT_PUBLIC_DEFAULT_AUDIO_SOURCE === 'tab' ? 'tab' : 'mic') as 'mic' | 'tab',
} as const;
