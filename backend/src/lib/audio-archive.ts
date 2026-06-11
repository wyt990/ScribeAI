import fs from 'fs';
import path from 'path';
import { STORAGE_CONFIG } from './storage-config';

const RECORDING_FILENAME = 'recording.webm';
const META_FILENAME = 'meta.json';

export function getSessionDir(userId: string, recordingId: string): string {
  return path.join(STORAGE_CONFIG.uploadsDir, userId, recordingId);
}

/** 追加 MediaRecorder 音频块到完整 recording.webm */
export function appendRecordingChunk(userId: string, recordingId: string, buffer: Buffer): void {
  try {
    const sessionDir = getSessionDir(userId, recordingId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.appendFileSync(path.join(sessionDir, RECORDING_FILENAME), buffer);
  } catch (error) {
    console.error('[AudioArchive] append chunk error:', error);
  }
}

/** 录音结束时标记归档完成，并清理遗留的分片文件 */
export function finalizeRecordingArchive(userId: string, recordingId: string): void {
  try {
    const sessionDir = getSessionDir(userId, recordingId);
    if (!fs.existsSync(sessionDir)) return;

    const recordingPath = path.join(sessionDir, RECORDING_FILENAME);
    if (!fs.existsSync(recordingPath)) return;

    const meta = { finalizedAt: new Date().toISOString(), format: 'webm' };
    fs.writeFileSync(path.join(sessionDir, META_FILENAME), JSON.stringify(meta));

    for (const file of fs.readdirSync(sessionDir)) {
      if (file.startsWith('chunk-') && file.endsWith('.webm')) {
        fs.unlinkSync(path.join(sessionDir, file));
      }
    }
  } catch (error) {
    console.error('[AudioArchive] finalize error:', error);
  }
}

export function removeRecordingAudio(userId: string, recordingId: string): void {
  try {
    const sessionDir = getSessionDir(userId, recordingId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('[AudioArchive] remove session error:', error);
  }
}

export function removeUserRecordingDir(userId: string): void {
  try {
    const userDir = path.join(STORAGE_CONFIG.uploadsDir, userId);
    if (fs.existsSync(userDir)) {
      fs.rmSync(userDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('[AudioArchive] remove user dir error:', error);
  }
}

export type RecordingMeta = {
  exists: boolean;
  finalized: boolean;
  sizeBytes: number | null;
  finalizedAt: string | null;
};

export function getRecordingFilePath(userId: string, recordingId: string): string | null {
  const filePath = path.join(getSessionDir(userId, recordingId), RECORDING_FILENAME);
  return fs.existsSync(filePath) ? filePath : null;
}

export function getRecordingMeta(userId: string, recordingId: string): RecordingMeta {
  const filePath = getRecordingFilePath(userId, recordingId);
  if (!filePath) {
    return { exists: false, finalized: false, sizeBytes: null, finalizedAt: null };
  }

  const sessionDir = getSessionDir(userId, recordingId);
  const stat = fs.statSync(filePath);
  let finalizedAt: string | null = null;
  const metaPath = path.join(sessionDir, META_FILENAME);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { finalizedAt?: string };
      finalizedAt = meta.finalizedAt ?? null;
    } catch {
      /* ignore */
    }
  }

  return {
    exists: true,
    finalized: Boolean(finalizedAt),
    sizeBytes: stat.size,
    finalizedAt,
  };
}

function isArchiveFinalized(sessionDir: string): boolean {
  const metaPath = path.join(sessionDir, META_FILENAME);
  if (!fs.existsSync(metaPath)) return false;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { finalizedAt?: string };
    return Boolean(meta.finalizedAt);
  } catch {
    return false;
  }
}

function sessionLatestMtimeMs(sessionDir: string): number {
  let latest = fs.statSync(sessionDir).mtimeMs;
  try {
    for (const file of fs.readdirSync(sessionDir)) {
      const fileStat = fs.statSync(path.join(sessionDir, file));
      if (fileStat.mtimeMs > latest) latest = fileStat.mtimeMs;
    }
  } catch {
    /* ignore */
  }
  const metaPath = path.join(sessionDir, META_FILENAME);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { finalizedAt?: string };
      if (meta.finalizedAt) {
        latest = Math.max(latest, new Date(meta.finalizedAt).getTime());
      }
    } catch {
      /* ignore */
    }
  }
  return latest;
}

function removeEmptyUserDir(userId: string): void {
  try {
    const userDir = path.join(STORAGE_CONFIG.uploadsDir, userId);
    if (fs.existsSync(userDir) && fs.readdirSync(userDir).length === 0) {
      fs.rmdirSync(userDir);
    }
  } catch {
    /* ignore */
  }
}

/**
 * 清理未完成录音（崩溃/断线/用户新开录音遗留）：超过保留期且未 finalize 的会话目录。
 */
export function cleanupIncompleteSessions(): number {
  const { uploadsDir, incompleteAudioRetentionDays } = STORAGE_CONFIG;
  if (!fs.existsSync(uploadsDir)) return 0;

  const now = Date.now();
  const thresholdMs = incompleteAudioRetentionDays * 24 * 60 * 60 * 1000;
  let cleanedCount = 0;

  try {
    for (const userId of fs.readdirSync(uploadsDir)) {
      const userDir = path.join(uploadsDir, userId);
      if (!fs.statSync(userDir).isDirectory()) continue;

      for (const sessionId of fs.readdirSync(userDir)) {
        const sessionDir = path.join(userDir, sessionId);
        if (!fs.statSync(sessionDir).isDirectory()) continue;

        if (isArchiveFinalized(sessionDir)) continue;

        const latestMtime = sessionLatestMtimeMs(sessionDir);
        if (now - latestMtime > thresholdMs) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          cleanedCount++;
        }
      }

      removeEmptyUserDir(userId);
    }
  } catch (error) {
    console.error('[AudioArchive] incomplete cleanup error:', error);
  }

  return cleanedCount;
}

/**
 * 清理超过保留期的完整录音（默认 30 天），减轻磁盘压力。
 */
export function cleanupExpiredRecordings(): number {
  const { uploadsDir, audioRetentionDays } = STORAGE_CONFIG;
  if (!fs.existsSync(uploadsDir)) return 0;

  const now = Date.now();
  const retentionMs = audioRetentionDays * 24 * 60 * 60 * 1000;
  let cleanedCount = 0;

  try {
    for (const userId of fs.readdirSync(uploadsDir)) {
      const userDir = path.join(uploadsDir, userId);
      if (!fs.statSync(userDir).isDirectory()) continue;

      for (const sessionId of fs.readdirSync(userDir)) {
        const sessionDir = path.join(userDir, sessionId);
        if (!fs.statSync(sessionDir).isDirectory()) continue;

        const recordingPath = path.join(sessionDir, RECORDING_FILENAME);
        if (!fs.existsSync(recordingPath)) continue;

        const latestMtime = sessionLatestMtimeMs(sessionDir);
        if (now - latestMtime > retentionMs) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          cleanedCount++;
        }
      }

      removeEmptyUserDir(userId);
    }
  } catch (error) {
    console.error('[AudioArchive] expired cleanup error:', error);
  }

  return cleanedCount;
}
