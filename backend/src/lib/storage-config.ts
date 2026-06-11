import path from "path";

export const STORAGE_CONFIG = {
  uploadsDir: process.env.STORAGE_UPLOADS_DIR || path.join(process.cwd(), "uploads"),
  incompleteAudioRetentionDays: parseInt(process.env.INCOMPLETE_AUDIO_RETENTION_DAYS || "7", 10),
  incompleteAudioCleanupIntervalHours: parseInt(
    process.env.INCOMPLETE_AUDIO_CLEANUP_INTERVAL_HOURS || "24",
    10
  ),
  audioRetentionDays: parseInt(process.env.AUDIO_RETENTION_DAYS || "30", 10),
  audioCleanupIntervalHours: parseInt(process.env.AUDIO_CLEANUP_INTERVAL_HOURS || "24", 10),
};
