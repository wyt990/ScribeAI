import fs from 'fs';
import path from 'path';
import { STORAGE_CONFIG } from './storage-config';

const WEBM_FILENAME = 'recording.webm';
const WAV_FILENAME = 'recording.wav';
const META_FILENAME = 'meta.json';
const WAV_HEADER_BYTES = 44;

export type RecordingArchiveFormat = 'webm' | 'wav';

export function getSessionDir(userId: string, recordingId: string): string {
  return path.join(STORAGE_CONFIG.uploadsDir, userId, recordingId);
}

function isWavBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'RIFF';
}

function extractPcmFromWav(buffer: Buffer): Buffer {
  if (!isWavBuffer(buffer)) return buffer;
  if (buffer.length <= WAV_HEADER_BYTES) return Buffer.alloc(0);
  return buffer.subarray(WAV_HEADER_BYTES);
}

/** 修正 WAV 头中的文件长度字段（追加 PCM 后必须更新） */
function patchWavHeaderSizes(filePath: string): void {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  if (fileSize < WAV_HEADER_BYTES) return;

  const fd = fs.openSync(filePath, 'r+');
  try {
    const riffSize = Buffer.alloc(4);
    riffSize.writeUInt32LE(fileSize - 8, 0);
    fs.writeSync(fd, riffSize, 0, 4, 4);

    const dataSize = Buffer.alloc(4);
    dataSize.writeUInt32LE(fileSize - WAV_HEADER_BYTES, 0);
    fs.writeSync(fd, dataSize, 0, 4, 40);
  } finally {
    fs.closeSync(fd);
  }
}

function readArchiveFormat(sessionDir: string): RecordingArchiveFormat | null {
  const metaPath = path.join(sessionDir, META_FILENAME);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { format?: string };
      if (meta.format === 'wav' || meta.format === 'webm') return meta.format;
    } catch {
      /* ignore */
    }
  }
  if (fs.existsSync(path.join(sessionDir, WAV_FILENAME))) return 'wav';
  if (fs.existsSync(path.join(sessionDir, WEBM_FILENAME))) return 'webm';
  return null;
}

/** 开始录音时初始化归档格式，避免 webm/wav 混写 */
export function prepareRecordingArchive(
  userId: string,
  recordingId: string,
  format: RecordingArchiveFormat
): void {
  try {
    const sessionDir = getSessionDir(userId, recordingId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const other =
      format === 'wav'
        ? path.join(sessionDir, WEBM_FILENAME)
        : path.join(sessionDir, WAV_FILENAME);
    if (fs.existsSync(other)) {
      fs.unlinkSync(other);
    }

    const metaPath = path.join(sessionDir, META_FILENAME);
    const existing = fs.existsSync(metaPath)
      ? (JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<string, unknown>)
      : {};
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        ...existing,
        format,
        startedAt: new Date().toISOString(),
        finalizedAt: null,
      })
    );
  } catch (error) {
    console.error('[AudioArchive] prepare error:', error);
  }
}

/**
 * 追加音频块：
 * - web：MediaRecorder webm 分片直接拼接
 * - native：WAV 分片剥头后拼接 PCM，finalize 时修正 WAV 头
 */
export function appendRecordingChunk(
  userId: string,
  recordingId: string,
  buffer: Buffer,
  format: RecordingArchiveFormat = 'webm'
): void {
  try {
    const sessionDir = getSessionDir(userId, recordingId);
    fs.mkdirSync(sessionDir, { recursive: true });

    if (format === 'wav') {
      const wavPath = path.join(sessionDir, WAV_FILENAME);
      if (!fs.existsSync(wavPath)) {
        if (!isWavBuffer(buffer)) {
          console.warn('[AudioArchive] native chunk is not WAV, skipping archive append');
          return;
        }
        fs.writeFileSync(wavPath, buffer);
      } else {
        const pcm = extractPcmFromWav(buffer);
        if (pcm.length > 0) {
          fs.appendFileSync(wavPath, pcm);
        }
      }
      return;
    }

    fs.appendFileSync(path.join(sessionDir, WEBM_FILENAME), buffer);
  } catch (error) {
    console.error('[AudioArchive] append chunk error:', error);
  }
}

/** 录音结束时标记归档完成，并清理遗留的分片文件 */
export function finalizeRecordingArchive(
  userId: string,
  recordingId: string,
  format: RecordingArchiveFormat = 'webm'
): void {
  try {
    const sessionDir = getSessionDir(userId, recordingId);
    if (!fs.existsSync(sessionDir)) return;

    const resolvedFormat = readArchiveFormat(sessionDir) ?? format;
    const recordingPath = path.join(
      sessionDir,
      resolvedFormat === 'wav' ? WAV_FILENAME : WEBM_FILENAME
    );
    if (!fs.existsSync(recordingPath)) return;

    if (resolvedFormat === 'wav') {
      patchWavHeaderSizes(recordingPath);
    }

    const metaPath = path.join(sessionDir, META_FILENAME);
    const existing = fs.existsSync(metaPath)
      ? (JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<string, unknown>)
      : {};
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        ...existing,
        format: resolvedFormat,
        finalizedAt: new Date().toISOString(),
        sampleRate: resolvedFormat === 'wav' ? 16000 : undefined,
      })
    );

    for (const file of fs.readdirSync(sessionDir)) {
      if (file.startsWith('chunk-') && (file.endsWith('.webm') || file.endsWith('.wav'))) {
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
    removeEmptyUserDir(userId);
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
  format: RecordingArchiveFormat | null;
};

export function getRecordingFilePath(userId: string, recordingId: string): string | null {
  const sessionDir = getSessionDir(userId, recordingId);
  const wavPath = path.join(sessionDir, WAV_FILENAME);
  if (fs.existsSync(wavPath)) return wavPath;
  const webmPath = path.join(sessionDir, WEBM_FILENAME);
  if (fs.existsSync(webmPath)) return webmPath;
  return null;
}

export function getRecordingMeta(userId: string, recordingId: string): RecordingMeta {
  const filePath = getRecordingFilePath(userId, recordingId);
  if (!filePath) {
    return { exists: false, finalized: false, sizeBytes: null, finalizedAt: null, format: null };
  }

  const sessionDir = getSessionDir(userId, recordingId);
  const stat = fs.statSync(filePath);
  let finalizedAt: string | null = null;
  let format: RecordingArchiveFormat | null = filePath.endsWith('.wav') ? 'wav' : 'webm';
  const metaPath = path.join(sessionDir, META_FILENAME);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
        finalizedAt?: string;
        format?: RecordingArchiveFormat;
      };
      finalizedAt = meta.finalizedAt ?? null;
      if (meta.format === 'wav' || meta.format === 'webm') {
        format = meta.format;
      }
    } catch {
      /* ignore */
    }
  }

  return {
    exists: true,
    finalized: Boolean(finalizedAt),
    sizeBytes: stat.size,
    finalizedAt,
    format,
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

export function removeEmptyUserDir(userId: string): void {
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

        const wavPath = path.join(sessionDir, WAV_FILENAME);
        const webmPath = path.join(sessionDir, WEBM_FILENAME);
        if (!fs.existsSync(wavPath) && !fs.existsSync(webmPath)) continue;

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
