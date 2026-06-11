import { prisma } from './prisma';

export type SettingGroup = 'stt' | 'llm' | 'storage' | 'security' | 'mobile' | 'observability';

export type SettingDef = {
  key: string;
  group: SettingGroup;
  envKey: string;
  label: string;
  isSecret?: boolean;
  defaultValue?: string;
};

export const SETTING_DEFINITIONS: SettingDef[] = [
  { key: 'stt.provider', group: 'stt', envKey: 'STT_PROVIDER', label: 'STT 提供商', defaultValue: 'deepgram' },
  { key: 'stt.deepgram_api_key', group: 'stt', envKey: 'DEEPGRAM_API_KEY', label: 'Deepgram API Key', isSecret: true },
  { key: 'stt.asr_api_key', group: 'stt', envKey: 'OPENAI_ASR_API_KEY', label: 'ASR API Key', isSecret: true },
  { key: 'stt.asr_base_url', group: 'stt', envKey: 'OPENAI_ASR_BASE_URL', label: 'ASR Base URL' },
  { key: 'stt.asr_model', group: 'stt', envKey: 'OPENAI_ASR_MODEL', label: 'ASR 模型' },
  { key: 'stt.asr_language', group: 'stt', envKey: 'OPENAI_ASR_LANGUAGE', label: 'ASR 语言', defaultValue: 'zh' },
  { key: 'stt.asr_slice_interval', group: 'stt', envKey: 'ASR_SLICE_INTERVAL', label: '切片间隔(秒)', defaultValue: '5' },
  { key: 'stt.vad_enabled', group: 'stt', envKey: 'VAD_ENABLED', label: '启用 VAD', defaultValue: 'true' },
  { key: 'stt.vad_model', group: 'stt', envKey: 'VAD_MODEL', label: 'VAD 模型', defaultValue: 'v5' },
  { key: 'stt.vad_prob_threshold', group: 'stt', envKey: 'VAD_PROB_THRESHOLD', label: '语音概率阈值', defaultValue: '0.5' },
  { key: 'stt.vad_negative_threshold', group: 'stt', envKey: 'VAD_NEGATIVE_THRESHOLD', label: '静音概率阈值', defaultValue: '0.35' },
  { key: 'stt.vad_redemption_ms', group: 'stt', envKey: 'VAD_REDEMPTION_MS', label: '静音宽限(ms)', defaultValue: '1400' },
  { key: 'stt.vad_pre_speech_pad_ms', group: 'stt', envKey: 'VAD_PRE_SPEECH_PAD_MS', label: '前置填充(ms)', defaultValue: '800' },
  { key: 'stt.vad_min_speech_ms', group: 'stt', envKey: 'VAD_MIN_SPEECH_MS', label: '最短语音(ms)', defaultValue: '400' },
  { key: 'llm.summary_provider', group: 'llm', envKey: 'SUMMARY_PROVIDER', label: '纪要 LLM 提供商', defaultValue: 'openai_compatible' },
  { key: 'llm.gemini_api_key', group: 'llm', envKey: 'GEMINI_API_KEY', label: 'Gemini API Key', isSecret: true },
  { key: 'llm.gemini_model', group: 'llm', envKey: 'GEMINI_MODEL', label: 'Gemini 模型', defaultValue: 'gemini-2.5-flash' },
  { key: 'llm.gemini_api_url', group: 'llm', envKey: 'GEMINI_API_URL', label: 'Gemini API URL' },
  { key: 'llm.openai_api_key', group: 'llm', envKey: 'OPENAI_LLM_API_KEY', label: 'OpenAI 兼容 API Key', isSecret: true },
  { key: 'llm.openai_base_url', group: 'llm', envKey: 'OPENAI_LLM_BASE_URL', label: 'OpenAI 兼容 Base URL' },
  { key: 'llm.openai_model', group: 'llm', envKey: 'OPENAI_LLM_MODEL', label: 'OpenAI 兼容模型' },
  { key: 'llm.openai_max_tokens', group: 'llm', envKey: 'OPENAI_LLM_MAX_TOKENS', label: 'Max Tokens', defaultValue: '32768' },
  { key: 'llm.openai_temperature', group: 'llm', envKey: 'OPENAI_LLM_TEMPERATURE', label: 'Temperature', defaultValue: '0.3' },
  { key: 'llm.summary_route_timeout_ms', group: 'llm', envKey: 'SUMMARY_ROUTE_TIMEOUT_MS', label: '纪要超时(ms)', defaultValue: '300000' },
  { key: 'storage.uploads_dir', group: 'storage', envKey: 'STORAGE_UPLOADS_DIR', label: '上传目录', defaultValue: './uploads' },
  { key: 'storage.incomplete_audio_retention_days', group: 'storage', envKey: 'INCOMPLETE_AUDIO_RETENTION_DAYS', label: '未完成录音保留(天)', defaultValue: '7' },
  { key: 'storage.incomplete_audio_cleanup_hours', group: 'storage', envKey: 'INCOMPLETE_AUDIO_CLEANUP_INTERVAL_HOURS', label: '未完成录音清理间隔(时)', defaultValue: '24' },
  { key: 'storage.draft_expire_days', group: 'storage', envKey: 'DRAFT_EXPIRE_DAYS', label: '草稿保留(天)', defaultValue: '30' },
  { key: 'storage.draft_cleanup_hours', group: 'storage', envKey: 'DRAFT_CLEANUP_INTERVAL_HOURS', label: '草稿清理间隔(时)', defaultValue: '24' },
  { key: 'storage.audio_retention_days', group: 'storage', envKey: 'AUDIO_RETENTION_DAYS', label: '录音保留(天)', defaultValue: '30' },
  { key: 'storage.audio_cleanup_hours', group: 'storage', envKey: 'AUDIO_CLEANUP_INTERVAL_HOURS', label: '录音清理间隔(时)', defaultValue: '24' },
  { key: 'security.share_token_expires', group: 'security', envKey: 'SUMMARY_SHARE_TOKEN_EXPIRES', label: '分享链接有效期', defaultValue: '7d' },
  { key: 'security.http_long_request_ms', group: 'security', envKey: 'HTTP_LONG_REQUEST_MS', label: 'HTTP 长请求超时(ms)', defaultValue: '300000' },
  { key: 'mobile.android_apk_path', group: 'mobile', envKey: 'ANDROID_APK_PATH', label: 'Android APK 路径' },
  { key: 'observability.enabled', group: 'observability', envKey: 'OBSERVABILITY_ENABLED', label: '启用运行 trace 入库', defaultValue: 'true' },
  { key: 'observability.log_to_console', group: 'observability', envKey: 'OBSERVABILITY_LOG_TO_CONSOLE', label: '输出结构化日志到控制台', defaultValue: 'true' },
  { key: 'observability.retention_days', group: 'observability', envKey: 'OBSERVABILITY_RETENTION_DAYS', label: 'Trace 保留天数', defaultValue: '14' },
  { key: 'observability.max_rows', group: 'observability', envKey: 'OBSERVABILITY_MAX_ROWS', label: 'Trace 最大条数', defaultValue: '5000' },
];

const ENV_TO_KEY = new Map(SETTING_DEFINITIONS.map((d) => [d.envKey, d.key]));

export function maskSecret(value: string): string {
  if (!value || value.length < 4) return '****';
  return `****${value.slice(-4)}`;
}

export function getSettingValue(key: string): string {
  const def = SETTING_DEFINITIONS.find((d) => d.key === key);
  if (!def) return '';
  return process.env[def.envKey] ?? def.defaultValue ?? '';
}

/** 启动时从 DB 覆盖 process.env（在 ensure 之后调用） */
export async function applySettingsToEnv(): Promise<void> {
  const rows = await prisma.systemSetting.findMany();
  for (const row of rows) {
    const def = SETTING_DEFINITIONS.find((d) => d.key === row.key);
    if (def) process.env[def.envKey] = row.value;
  }
}

/** 首次启动：将 .env 当前值写入 DB */
export async function ensureSystemSettingsSeeded(): Promise<void> {
  const now = new Date();
  for (const def of SETTING_DEFINITIONS) {
    const value = process.env[def.envKey] ?? def.defaultValue ?? '';
    await prisma.systemSetting.upsert({
      where: { key: def.key },
      create: {
        key: def.key,
        group: def.group,
        value,
        isSecret: def.isSecret ?? false,
        label: def.label,
        updatedAt: now,
      },
      update: {},
    });
  }
}

export async function getSettingsByGroup(group: SettingGroup) {
  const defs = SETTING_DEFINITIONS.filter((d) => d.group === group);
  const keys = defs.map((d) => d.key);
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
  const map = new Map(rows.map((r) => [r.key, r]));

  return defs.map((def) => {
    const row = map.get(def.key);
    const raw = row?.value ?? process.env[def.envKey] ?? def.defaultValue ?? '';
    return {
      key: def.key,
      label: def.label,
      group: def.group,
      isSecret: def.isSecret ?? false,
      value: def.isSecret ? maskSecret(raw) : raw,
      hasValue: Boolean(raw),
    };
  });
}

export async function updateSettings(
  group: SettingGroup,
  updates: Record<string, string>,
  updatedBy: string
) {
  const defs = SETTING_DEFINITIONS.filter((d) => d.group === group);
  const now = new Date();

  for (const def of defs) {
    const newVal = updates[def.key];
    if (newVal === undefined || newVal === '') continue;
    if (def.isSecret && newVal.startsWith('****')) continue;

    await prisma.systemSetting.upsert({
      where: { key: def.key },
      create: {
        key: def.key,
        group: def.group,
        value: newVal,
        isSecret: def.isSecret ?? false,
        label: def.label,
        updatedAt: now,
        updatedBy,
      },
      update: { value: newVal, updatedAt: now, updatedBy },
    });
    process.env[def.envKey] = newVal;
  }
}

export function envKeyForSetting(key: string): string | undefined {
  return SETTING_DEFINITIONS.find((d) => d.key === key)?.envKey;
}
