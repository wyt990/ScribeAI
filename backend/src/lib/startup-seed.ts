import { ensureSystemSummaryTemplates } from "./summary-template-seed";
import { ensureSystemSettingsSeeded, applySettingsToEnv } from "./system-settings";

export type StartupSeedStatus = {
  ready: boolean;
  error: string | null;
  completedAt: string | null;
};

let startupSeedStatus: StartupSeedStatus = {
  ready: false,
  error: null,
  completedAt: null,
};

export function getStartupSeedStatus(): StartupSeedStatus {
  return startupSeedStatus;
}

/** 启动时写入系统模板/设置；失败时记录可读错误供 health / app-config 暴露 */
export async function runStartupSeed(): Promise<void> {
  try {
    await ensureSystemSummaryTemplates();
    await ensureSystemSettingsSeeded();
    await applySettingsToEnv();
    startupSeedStatus = {
      ready: true,
      error: null,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    startupSeedStatus = {
      ready: false,
      error: message,
      completedAt: new Date().toISOString(),
    };
    console.error("[Startup seed] failed:", err);
  }
}
