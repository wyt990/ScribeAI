import fs from 'fs';
import path from 'path';
import { STORAGE_CONFIG } from './storage-config';
import {
  isFfmpegAvailable,
  mergeWavSegmentFiles,
  mergeWebmSegmentFiles,
  patchWavHeaderSizes,
} from './audio-merge';

const WEBM_FILENAME = 'recording.webm';
const WAV_FILENAME = 'recording.wav';
const META_FILENAME = 'meta.json';
const WAV_HEADER_BYTES = 44;

export type RecordingArchiveFormat = 'webm' | 'wav';

export class RecordingInProgressError extends Error {
  constructor() {
    super('录音进行中，请先停止录音后再试听或重跑 ASR');
    this.name = 'RecordingInProgressError';
  }
}

type ChunkTracking = {
  received: Array<{ seq: number; bytes: number; at: string }>;
  gaps: number[];
  lastSeq: number;
  chunkCount: number;
};

type SegmentRecord = {
  index: number;
  file: string;
  startedAt: string;
  finalizedAt?: string | null;
  sizeBytes?: number;
};

type MasterRecord = {
  file: string;
  mergedAt: string | null;
  segmentCount: number;
  stale: boolean;
  mergeError?: string;
};

type ArchiveMeta = {
  format?: RecordingArchiveFormat;
  startedAt?: string;
  finalizedAt?: string | null;
  segments?: SegmentRecord[];
  activeSegmentIndex?: number | null;
  master?: MasterRecord;
  chunkTracking?: ChunkTracking;
  archiveIncomplete?: boolean;
  gapCount?: number;
  finalizedChunkCount?: number;
  finalizedLastSeq?: number;
  sampleRate?: number;
  resumedAt?: string;
  legacy?: boolean;
};

function emptyChunkTracking(): ChunkTracking {
  return { received: [], gaps: [], lastSeq: 0, chunkCount: 0 };
}

function loadChunkTracking(meta: ArchiveMeta): ChunkTracking {
  const raw = meta.chunkTracking;
  return {
    received: Array.isArray(raw?.received) ? raw!.received : [],
    gaps: Array.isArray(raw?.gaps) ? raw!.gaps : [],
    lastSeq: typeof raw?.lastSeq === 'number' ? raw!.lastSeq : 0,
    chunkCount: typeof raw?.chunkCount === 'number' ? raw!.chunkCount : 0,
  };
}

function masterFileName(format: RecordingArchiveFormat): string {
  return format === 'wav' ? WAV_FILENAME : WEBM_FILENAME;
}

function segmentFileName(index: number, format: RecordingArchiveFormat): string {
  const ext = format === 'wav' ? 'wav' : 'webm';
  return `segment-${String(index).padStart(3, '0')}.${ext}`;
}

function defaultMaster(format: RecordingArchiveFormat): MasterRecord {
  return {
    file: masterFileName(format),
    mergedAt: null,
    segmentCount: 0,
    stale: true,
  };
}

function readMetaFile(sessionDir: string): ArchiveMeta {
  const metaPath = path.join(sessionDir, META_FILENAME);
  if (!fs.existsSync(metaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as ArchiveMeta;
  } catch {
    return {};
  }
}

function writeMetaFile(sessionDir: string, meta: ArchiveMeta): void {
  const metaPath = path.join(sessionDir, META_FILENAME);
  fs.writeFileSync(metaPath, JSON.stringify(meta));
}

function recordChunkSeq(
  meta: ArchiveMeta,
  metaPath: string,
  recordingId: string,
  seq: number,
  byteLength: number
): void {
  const tracking = loadChunkTracking(meta);
  const lastSeq = tracking.lastSeq;

  if (lastSeq > 0 && seq > lastSeq + 1) {
    for (let g = lastSeq + 1; g < seq; g++) {
      if (!tracking.gaps.includes(g)) tracking.gaps.push(g);
    }
    console.warn(
      `[AudioArchive] chunk gap recording=${recordingId} missing seq ${lastSeq + 1}..${seq - 1}`
    );
  } else if (lastSeq === 0 && seq > 1) {
    for (let g = 1; g < seq; g++) {
      if (!tracking.gaps.includes(g)) tracking.gaps.push(g);
    }
    console.warn(
      `[AudioArchive] chunk gap recording=${recordingId} first chunk missing, starts at seq=${seq}`
    );
  }

  tracking.lastSeq = seq;
  tracking.chunkCount += 1;
  tracking.received.push({ seq, bytes: byteLength, at: new Date().toISOString() });
  if (tracking.received.length > 200) {
    tracking.received = tracking.received.slice(-200);
  }

  meta.chunkTracking = tracking;
  meta.archiveIncomplete = tracking.gaps.length > 0;
  fs.writeFileSync(metaPath, JSON.stringify(meta));
}

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

function readArchiveFormat(sessionDir: string): RecordingArchiveFormat | null {
  const meta = readMetaFile(sessionDir);
  if (meta.format === 'wav' || meta.format === 'webm') return meta.format;

  if (fs.existsSync(path.join(sessionDir, WAV_FILENAME))) return 'wav';
  if (fs.existsSync(path.join(sessionDir, WEBM_FILENAME))) return 'webm';

  const segments = meta.segments ?? [];
  for (const seg of segments) {
    if (seg.file.endsWith('.wav')) return 'wav';
    if (seg.file.endsWith('.webm')) return 'webm';
  }
  return null;
}

function listSegmentFiles(sessionDir: string, format: RecordingArchiveFormat): string[] {
  const ext = format === 'wav' ? '.wav' : '.webm';
  if (!fs.existsSync(sessionDir)) return [];
  return fs
    .readdirSync(sessionDir)
    .filter((f) => f.startsWith('segment-') && f.endsWith(ext))
    .sort();
}

function migrateLegacyToSegments(sessionDir: string, format: RecordingArchiveFormat): ArchiveMeta {
  const meta = readMetaFile(sessionDir);
  if (meta.segments && meta.segments.length > 0) return meta;

  const masterPath = path.join(sessionDir, masterFileName(format));
  if (!fs.existsSync(masterPath)) return meta;

  const stat = fs.statSync(masterPath);
  if (stat.size === 0) return meta;

  const segFile = segmentFileName(1, format);
  const segPath = path.join(sessionDir, segFile);
  if (!fs.existsSync(segPath)) {
    fs.renameSync(masterPath, segPath);
  }

  const now = new Date().toISOString();
  const migrated: ArchiveMeta = {
    ...meta,
    format,
    legacy: true,
    segments: [
      {
        index: 1,
        file: segFile,
        startedAt: meta.startedAt ?? now,
        finalizedAt: meta.finalizedAt ?? null,
        sizeBytes: stat.size,
      },
    ],
    activeSegmentIndex: meta.finalizedAt ? null : 1,
    master: {
      ...(meta.master ?? defaultMaster(format)),
      stale: true,
    },
  };
  writeMetaFile(sessionDir, migrated);
  return migrated;
}

function getSegmentByIndex(meta: ArchiveMeta, index: number): SegmentRecord | undefined {
  return meta.segments?.find((s) => s.index === index);
}

function resolveActiveSegmentPath(
  sessionDir: string,
  meta: ArchiveMeta,
  format: RecordingArchiveFormat
): string | null {
  const idx = meta.activeSegmentIndex;
  if (idx == null) return null;
  const seg = getSegmentByIndex(meta, idx);
  if (!seg) return null;
  return path.join(sessionDir, seg.file);
}

function openNewSegment(
  sessionDir: string,
  meta: ArchiveMeta,
  format: RecordingArchiveFormat,
  opts?: { resume?: boolean }
): ArchiveMeta {
  const segments = [...(meta.segments ?? [])];
  const nextIndex =
    segments.length === 0 ? 1 : Math.max(...segments.map((s) => s.index)) + 1;
  const now = new Date().toISOString();
  const file = segmentFileName(nextIndex, format);

  segments.push({
    index: nextIndex,
    file,
    startedAt: now,
    finalizedAt: null,
  });

  return {
    ...meta,
    format,
    startedAt: meta.startedAt ?? now,
    ...(opts?.resume ? { resumedAt: now } : {}),
    segments,
    activeSegmentIndex: nextIndex,
    finalizedAt: null,
    chunkTracking: emptyChunkTracking(),
    archiveIncomplete: false,
    master: {
      ...(meta.master ?? defaultMaster(format)),
      stale: true,
      mergeError: undefined,
    },
  };
}

function getFinalizedSegmentRecords(
  sessionDir: string,
  meta: ArchiveMeta
): SegmentRecord[] {
  return (meta.segments ?? [])
    .filter((s) => {
      const p = path.join(sessionDir, s.file);
      return fs.existsSync(p) && fs.statSync(p).size > 0 && s.finalizedAt != null;
    })
    .sort((a, b) => a.index - b.index);
}

function mergeSegmentsToMaster(
  sessionDir: string,
  meta: ArchiveMeta,
  format: RecordingArchiveFormat
): ArchiveMeta {
  const segments = getFinalizedSegmentRecords(sessionDir, meta);
  const master = meta.master ?? defaultMaster(format);
  const masterPath = path.join(sessionDir, master.file);

  if (segments.length === 0) {
    return {
      ...meta,
      master: { ...master, stale: true, mergeError: 'No finalized segments' },
    };
  }

  const segmentPaths = segments.map((s) => path.join(sessionDir, s.file));

  try {
    if (format === 'wav') {
      mergeWavSegmentFiles(segmentPaths, masterPath);
    } else {
      if (!isFfmpegAvailable()) {
        throw new Error('ffmpeg is not installed (required for WebM segment merge)');
      }
      mergeWebmSegmentFiles(segmentPaths, masterPath);
    }

    return {
      ...meta,
      master: {
        ...master,
        mergedAt: new Date().toISOString(),
        segmentCount: segments.length,
        stale: false,
        mergeError: undefined,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AudioArchive] merge failed recording dir=${sessionDir}:`, message);
    return {
      ...meta,
      master: {
        ...master,
        stale: true,
        mergeError: message,
      },
    };
  }
}

function isSegmentBasedArchive(meta: ArchiveMeta): boolean {
  return Boolean(meta.segments && meta.segments.length > 0);
}

function isRecordingInProgress(meta: ArchiveMeta): boolean {
  return meta.activeSegmentIndex != null && meta.finalizedAt == null;
}

/** 开始录音：分配 segment，续录时新建下一段 */
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

    let meta = migrateLegacyToSegments(sessionDir, format);
    meta.format = format;

    if (!meta.master) {
      meta.master = defaultMaster(format);
    }

    const resume =
      meta.finalizedAt != null &&
      meta.activeSegmentIndex == null &&
      (meta.segments?.length ?? 0) > 0;

    if (meta.activeSegmentIndex == null) {
      meta = openNewSegment(sessionDir, meta, format, { resume });
    } else {
      meta.finalizedAt = null;
      meta.master = { ...(meta.master ?? defaultMaster(format)), stale: true };
    }

    writeMetaFile(sessionDir, meta);
  } catch (error) {
    console.error('[AudioArchive] prepare error:', error);
  }
}

/**
 * 追加音频块到当前 active segment：
 * - web：MediaRecorder webm 分片
 * - native：WAV 分片剥头后拼接 PCM
 */
export function appendRecordingChunk(
  userId: string,
  recordingId: string,
  buffer: Buffer,
  format: RecordingArchiveFormat = 'webm',
  opts?: { seq?: number; timestampMs?: number }
): void {
  try {
    const sessionDir = getSessionDir(userId, recordingId);
    fs.mkdirSync(sessionDir, { recursive: true });

    let meta = migrateLegacyToSegments(sessionDir, format);
    const metaPath = path.join(sessionDir, META_FILENAME);

    if (!isSegmentBasedArchive(meta)) {
      meta = openNewSegment(sessionDir, meta, format);
      writeMetaFile(sessionDir, meta);
    }

    if (meta.activeSegmentIndex == null) {
      meta = openNewSegment(sessionDir, meta, format);
      writeMetaFile(sessionDir, meta);
    }

    let segmentPath = resolveActiveSegmentPath(sessionDir, meta, format);
    if (!segmentPath) {
      meta = openNewSegment(sessionDir, meta, format);
      writeMetaFile(sessionDir, meta);
      segmentPath = resolveActiveSegmentPath(sessionDir, meta, format);
    }
    if (!segmentPath) return;

    if (format === 'wav') {
      if (opts?.seq != null) {
        recordChunkSeq(meta, metaPath, recordingId, opts.seq, buffer.length);
        meta = readMetaFile(sessionDir);
      }

      const pcm = extractPcmFromWav(buffer);
      if (!fs.existsSync(segmentPath)) {
        if (!isWavBuffer(buffer)) {
          console.warn('[AudioArchive] native chunk is not WAV, skipping archive append');
          return;
        }
        fs.writeFileSync(segmentPath, buffer);
      } else if (pcm.length > 0) {
        fs.appendFileSync(segmentPath, pcm);
      }
      return;
    }

    fs.appendFileSync(segmentPath, buffer);
  } catch (error) {
    console.error('[AudioArchive] append chunk error:', error);
  }
}

/** 录音结束：finalize 当前 segment 并合并 master */
export function finalizeRecordingArchive(
  userId: string,
  recordingId: string,
  format: RecordingArchiveFormat = 'webm'
): void {
  try {
    const sessionDir = getSessionDir(userId, recordingId);
    if (!fs.existsSync(sessionDir)) return;

    const resolvedFormat = readArchiveFormat(sessionDir) ?? format;
    let meta = migrateLegacyToSegments(sessionDir, resolvedFormat);

    if (!isSegmentBasedArchive(meta)) {
      const legacyPath = path.join(sessionDir, masterFileName(resolvedFormat));
      if (!fs.existsSync(legacyPath)) return;

      if (resolvedFormat === 'wav') {
        patchWavHeaderSizes(legacyPath);
      }

      const tracking = resolvedFormat === 'wav' ? loadChunkTracking(meta) : emptyChunkTracking();
      writeMetaFile(sessionDir, {
        ...meta,
        format: resolvedFormat,
        finalizedAt: new Date().toISOString(),
        sampleRate: resolvedFormat === 'wav' ? 16000 : undefined,
        archiveIncomplete: tracking.gaps.length > 0,
        gapCount: tracking.gaps.length,
        finalizedChunkCount: tracking.chunkCount,
        finalizedLastSeq: tracking.lastSeq,
        master: {
          ...(meta.master ?? defaultMaster(resolvedFormat)),
          mergedAt: new Date().toISOString(),
          segmentCount: 0,
          stale: false,
        },
      });
      cleanupChunkArtifacts(sessionDir);
      return;
    }

    const activeIdx = meta.activeSegmentIndex;
    if (activeIdx != null) {
      const seg = getSegmentByIndex(meta, activeIdx);
      if (seg) {
        const segPath = path.join(sessionDir, seg.file);
        if (fs.existsSync(segPath)) {
          if (resolvedFormat === 'wav') {
            patchWavHeaderSizes(segPath);
          }
          seg.finalizedAt = new Date().toISOString();
          seg.sizeBytes = fs.statSync(segPath).size;
        }
      }
    }

    const tracking =
      resolvedFormat === 'wav' ? loadChunkTracking(meta) : emptyChunkTracking();
    if (resolvedFormat === 'wav' && tracking.gaps.length > 0) {
      console.warn(
        `[AudioArchive] finalize recording=${recordingId} with ${tracking.gaps.length} chunk gap(s)`
      );
    }

    meta.activeSegmentIndex = null;
    meta.finalizedAt = new Date().toISOString();
    meta.sampleRate = resolvedFormat === 'wav' ? 16000 : undefined;
    meta.archiveIncomplete = tracking.gaps.length > 0;
    meta.gapCount = tracking.gaps.length;
    meta.finalizedChunkCount = tracking.chunkCount;
    meta.finalizedLastSeq = tracking.lastSeq;

    meta = mergeSegmentsToMaster(sessionDir, meta, resolvedFormat);
    writeMetaFile(sessionDir, meta);
    cleanupChunkArtifacts(sessionDir);
  } catch (error) {
    console.error('[AudioArchive] finalize error:', error);
  }
}

function cleanupChunkArtifacts(sessionDir: string): void {
  for (const file of fs.readdirSync(sessionDir)) {
    if (file.startsWith('chunk-') && (file.endsWith('.webm') || file.endsWith('.wav'))) {
      fs.unlinkSync(path.join(sessionDir, file));
    }
  }
}

/**
 * 确保存在可播放/可 ASR 的 master 文件；录音进行中时抛出 RecordingInProgressError。
 */
export function ensureMasterRecording(userId: string, recordingId: string): string {
  const sessionDir = getSessionDir(userId, recordingId);
  if (!fs.existsSync(sessionDir)) {
    throw new Error('Recording file not found');
  }

  const format = readArchiveFormat(sessionDir);
  if (!format) {
    throw new Error('Recording file not found');
  }

  let meta = migrateLegacyToSegments(sessionDir, format);

  if (isRecordingInProgress(meta)) {
    throw new RecordingInProgressError();
  }

  if (!isSegmentBasedArchive(meta)) {
    const legacyPath = path.join(sessionDir, masterFileName(format));
    if (!fs.existsSync(legacyPath)) {
      throw new Error('Recording file not found');
    }
    return legacyPath;
  }

  const master = meta.master ?? defaultMaster(format);
  const masterPath = path.join(sessionDir, master.file);

  if (!master.stale && fs.existsSync(masterPath) && fs.statSync(masterPath).size > 0) {
    return masterPath;
  }

  meta = mergeSegmentsToMaster(sessionDir, meta, format);
  writeMetaFile(sessionDir, meta);

  if (meta.master?.mergeError) {
    throw new Error(`Failed to merge recording segments: ${meta.master.mergeError}`);
  }

  if (!fs.existsSync(masterPath) || fs.statSync(masterPath).size === 0) {
    throw new Error('Recording file not found');
  }

  return masterPath;
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
  segmentCount: number;
  masterStale: boolean;
};

export function getRecordingFilePath(userId: string, recordingId: string): string | null {
  const sessionDir = getSessionDir(userId, recordingId);
  if (!fs.existsSync(sessionDir)) return null;

  const format = readArchiveFormat(sessionDir);
  if (!format) return null;

  const meta = migrateLegacyToSegments(sessionDir, format);
  const masterPath = path.join(sessionDir, masterFileName(format));

  if (isSegmentBasedArchive(meta)) {
    if (!meta.master?.stale && fs.existsSync(masterPath) && fs.statSync(masterPath).size > 0) {
      return masterPath;
    }
    const segments = getFinalizedSegmentRecords(sessionDir, meta);
    if (segments.length === 1) {
      return path.join(sessionDir, segments[0]!.file);
    }
    if (segments.length > 1 && fs.existsSync(masterPath) && fs.statSync(masterPath).size > 0) {
      return masterPath;
    }
    if (segments.length > 0) {
      return path.join(sessionDir, segments[segments.length - 1]!.file);
    }
    return null;
  }

  if (fs.existsSync(masterPath)) return masterPath;
  return null;
}

export function getRecordingMeta(userId: string, recordingId: string): RecordingMeta {
  const sessionDir = getSessionDir(userId, recordingId);
  if (!fs.existsSync(sessionDir)) {
    return {
      exists: false,
      finalized: false,
      sizeBytes: null,
      finalizedAt: null,
      format: null,
      segmentCount: 0,
      masterStale: false,
    };
  }

  const format = readArchiveFormat(sessionDir);
  if (!format) {
    return {
      exists: false,
      finalized: false,
      sizeBytes: null,
      finalizedAt: null,
      format: null,
      segmentCount: 0,
      masterStale: false,
    };
  }

  const meta = migrateLegacyToSegments(sessionDir, format);
  const inProgress = isRecordingInProgress(meta);
  const finalized = Boolean(meta.finalizedAt) && !inProgress;
  const segmentCount = meta.segments?.length ?? 0;
  const masterStale = Boolean(meta.master?.stale);

  let sizeBytes: number | null = null;
  try {
    if (!inProgress && finalized) {
      const masterPath = path.join(sessionDir, masterFileName(format));
      if (!masterStale && fs.existsSync(masterPath)) {
        sizeBytes = fs.statSync(masterPath).size;
      } else {
        const segs = getFinalizedSegmentRecords(sessionDir, meta);
        sizeBytes = segs.reduce((sum, s) => sum + (s.sizeBytes ?? 0), 0);
      }
    } else if (isSegmentBasedArchive(meta)) {
      const activeIdx = meta.activeSegmentIndex;
      const segs = (meta.segments ?? []).filter((s) => {
        const p = path.join(sessionDir, s.file);
        return fs.existsSync(p);
      });
      sizeBytes = segs.reduce((sum, s) => {
        const p = path.join(sessionDir, s.file);
        return sum + (fs.existsSync(p) ? fs.statSync(p).size : 0);
      }, 0);
      void activeIdx;
    } else {
      const legacyPath = path.join(sessionDir, masterFileName(format));
      if (fs.existsSync(legacyPath)) {
        sizeBytes = fs.statSync(legacyPath).size;
      }
    }
  } catch {
    sizeBytes = null;
  }

  const exists =
    segmentCount > 0 ||
    fs.existsSync(path.join(sessionDir, masterFileName(format))) ||
    listSegmentFiles(sessionDir, format).length > 0;

  return {
    exists,
    finalized,
    sizeBytes,
    finalizedAt: meta.finalizedAt ?? null,
    format,
    segmentCount,
    masterStale,
  };
}

function isArchiveFinalized(sessionDir: string): boolean {
  const meta = readMetaFile(sessionDir);
  if (isRecordingInProgress(meta)) return false;
  return Boolean(meta.finalizedAt);
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

        const format = readArchiveFormat(sessionDir);
        const hasAudio =
          (format && listSegmentFiles(sessionDir, format).length > 0) ||
          fs.existsSync(path.join(sessionDir, WAV_FILENAME)) ||
          fs.existsSync(path.join(sessionDir, WEBM_FILENAME));
        if (!hasAudio) continue;

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
