import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';
import { removeEmptyUserDir, removeRecordingAudio } from './audio-archive';
import { STORAGE_CONFIG } from './storage-config';

export async function isRecordingIdReferenced(
  userId: string,
  recordingId: string,
  exclude?: { draftId?: string; transcriptId?: string }
): Promise<boolean> {
  const [draft, transcript] = await Promise.all([
    prisma.draft.findFirst({
      where: {
        userId,
        recordingId,
        ...(exclude?.draftId ? { NOT: { id: exclude.draftId } } : {}),
      },
      select: { id: true },
    }),
    prisma.transcript.findFirst({
      where: {
        userId,
        recordingId,
        ...(exclude?.transcriptId ? { NOT: { id: exclude.transcriptId } } : {}),
      },
      select: { id: true },
    }),
  ]);
  return Boolean(draft || transcript);
}

/** 若 recordingId 已无草稿/会话引用，则删除磁盘归档 */
export async function releaseRecordingIfUnreferenced(
  userId: string,
  recordingId: string | null | undefined,
  exclude?: { draftId?: string; transcriptId?: string }
): Promise<void> {
  if (!recordingId) return;
  const referenced = await isRecordingIdReferenced(userId, recordingId, exclude);
  if (!referenced) {
    removeRecordingAudio(userId, recordingId);
  }
}

export type OrphanCleanupResult = {
  scanned: number;
  removed: number;
  paths: string[];
};

/**
 * 删除 uploads 中无任何草稿/会话引用的录音目录（含空目录）。
 */
async function collectLinkedRecordingKeys(): Promise<Set<string>> {
  const [drafts, transcripts] = await Promise.all([
    prisma.draft.findMany({
      where: { recordingId: { not: null } },
      select: { userId: true, recordingId: true },
    }),
    prisma.transcript.findMany({
      where: { recordingId: { not: null } },
      select: { userId: true, recordingId: true },
    }),
  ]);

  const linked = new Set<string>();
  for (const row of drafts) {
    if (row.recordingId) linked.add(`${row.userId}/${row.recordingId}`);
  }
  for (const row of transcripts) {
    if (row.recordingId) linked.add(`${row.userId}/${row.recordingId}`);
  }
  return linked;
}

function cleanupOrphansInUserDir(
  userId: string,
  linked: Set<string>,
  result: OrphanCleanupResult
): void {
  const userDir = path.join(STORAGE_CONFIG.uploadsDir, userId);
  if (!fs.existsSync(userDir) || !fs.statSync(userDir).isDirectory()) return;

  for (const recordingId of fs.readdirSync(userDir)) {
    const sessionDir = path.join(userDir, recordingId);
    if (!fs.statSync(sessionDir).isDirectory()) continue;

    result.scanned += 1;
    const key = `${userId}/${recordingId}`;
    if (linked.has(key)) continue;

    removeRecordingAudio(userId, recordingId);
    result.removed += 1;
    result.paths.push(key);
  }
  removeEmptyUserDir(userId);
}

/** 删除 uploads 中无任何草稿/会话引用的录音目录（含空目录）。 */
export async function cleanupOrphanRecordingArchives(): Promise<OrphanCleanupResult> {
  const uploadsDir = STORAGE_CONFIG.uploadsDir;
  const result: OrphanCleanupResult = { scanned: 0, removed: 0, paths: [] };
  if (!fs.existsSync(uploadsDir)) return result;

  const linked = await collectLinkedRecordingKeys();
  for (const userId of fs.readdirSync(uploadsDir)) {
    cleanupOrphansInUserDir(userId, linked, result);
  }
  return result;
}

/** 仅清理指定用户下的无引用录音目录（放弃草稿等场景）。 */
export async function cleanupOrphanRecordingArchivesForUser(
  userId: string
): Promise<OrphanCleanupResult> {
  const result: OrphanCleanupResult = { scanned: 0, removed: 0, paths: [] };
  const linked = await collectLinkedRecordingKeys();
  cleanupOrphansInUserDir(userId, linked, result);
  return result;
}
