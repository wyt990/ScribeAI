import path from "path";

export const STORAGE_CONFIG = {
  uploadsDir: process.env.STORAGE_UPLOADS_DIR || path.join(process.cwd(), "uploads"),
  staleThresholdMinutes: parseInt(process.env.STALE_THRESHOLD_MINUTES || "30", 10),
  cleanupIntervalMinutes: parseInt(process.env.CLEANUP_INTERVAL_MINUTES || "15", 10),
};
