import express from 'express';
import { prisma } from '../lib/prisma';
import { verifyUser, AuthenticatedRequest } from '../middleware/authMiddleware';
import { writeAuditLog } from '../lib/audit-log';
import { generateSummary } from '../lib/summary-llm';
import { buildSuggestSessionTitlePrompt } from '../prompts/suggest-session-title';
import { getRecordingMeta, removeRecordingAudio } from '../lib/audio-archive';
import {
  cleanupOrphanRecordingArchivesForUser,
  releaseRecordingIfUnreferenced,
} from '../lib/recording-orphan-cleanup';
import {
  RecordingInProgressError,
  respondRecordingMeta,
  retranscribeRecording,
  streamRecording,
} from '../lib/recording-http';
import { getSttProviderLabel } from '../lib/asr-transcribe';
import { writeOperationTrace } from '../lib/operation-trace';

const router = express.Router();

const ACTIVE_STATUSES = ['recording', 'paused'] as const;

function formatDraftTitle(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `草稿 ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 列表：用户所有未转正的草稿 */
router.get('/', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const drafts = await prisma.draft.findMany({
      where: { userId },
      orderBy: { lastSavedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        audioMode: true,
        fullText: true,
        startedAt: true,
        lastSavedAt: true,
        orgId: true,
        recordingId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(
      drafts.map((draft) => ({
        ...draft,
        hasRecording: draft.recordingId
          ? getRecordingMeta(userId, draft.recordingId).exists
          : false,
      }))
    );
  } catch (err) {
    console.error('[Drafts] list error:', err);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
});

/** 当前进行中的草稿（recording / paused），无则 404 */
router.get('/active', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const draft = await prisma.draft.findFirst({
      where: { userId, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { lastSavedAt: 'desc' },
    });
    if (!draft) return res.status(404).json({ error: 'No active draft' });
    res.json(draft);
  } catch (err) {
    console.error('[Drafts] active error:', err);
    res.status(500).json({ error: 'Failed to fetch active draft' });
  }
});

/** 单条草稿详情 */
router.get('/:id', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  try {
    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft || draft.userId !== userId) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    res.json(draft);
  } catch (err) {
    console.error('[Drafts] get error:', err);
    res.status(500).json({ error: 'Failed to fetch draft' });
  }
});

/** 创建草稿（开始新录音时） */
router.post('/', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { audioMode = 'mic', recordingId, title, orgId } = req.body as {
    audioMode?: string;
    recordingId?: string;
    title?: string;
    orgId?: string;
  };

  try {
    const existingActive = await prisma.draft.findFirst({
      where: { userId, status: { in: [...ACTIVE_STATUSES] } },
    });
    if (existingActive) {
      return res.status(409).json({
        error: 'Active draft already exists',
        draft: existingActive,
      });
    }

    const draft = await prisma.draft.create({
      data: {
        userId,
        title: title?.trim() || formatDraftTitle(),
        fullText: '',
        status: 'recording',
        audioMode: audioMode === 'tab' ? 'tab' : 'mic',
        recordingId: recordingId || null,
        orgId: orgId || null,
        lastSavedAt: new Date(),
      },
    });

    res.status(201).json(draft);
  } catch (err) {
    console.error('[Drafts] create error:', err);
    res.status(500).json({ error: 'Failed to create draft' });
  }
});

/** 更新草稿（自动保存 / 状态变更） */
router.patch('/:id', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { fullText, status, audioMode, recordingId, title, orgId } = req.body as {
    fullText?: string;
    status?: string;
    audioMode?: string;
    recordingId?: string | null;
    title?: string;
    orgId?: string | null;
  };

  try {
    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft || draft.userId !== userId) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const allowedStatuses = ['recording', 'paused', 'stopped'];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const previousRecordingId = draft.recordingId;
    const updated = await prisma.draft.update({
      where: { id },
      data: {
        ...(fullText !== undefined ? { fullText } : {}),
        ...(status ? { status } : {}),
        ...(audioMode ? { audioMode: audioMode === 'tab' ? 'tab' : 'mic' } : {}),
        ...(recordingId !== undefined ? { recordingId } : {}),
        ...(title?.trim() ? { title: title.trim() } : {}),
        ...(orgId !== undefined ? { orgId: orgId || null } : {}),
        lastSavedAt: new Date(),
      },
    });

    if (
      recordingId !== undefined &&
      previousRecordingId &&
      previousRecordingId !== recordingId
    ) {
      await releaseRecordingIfUnreferenced(userId, previousRecordingId, { draftId: id });
    }

    res.json(updated);
  } catch (err) {
    console.error('[Drafts] update error:', err);
    res.status(500).json({ error: 'Failed to update draft' });
  }
});

router.get('/:id/recording/meta', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  try {
    const draft = await prisma.draft.findUnique({
      where: { id },
      select: { userId: true, recordingId: true },
    });
    if (!draft || draft.userId !== userId) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    respondRecordingMeta(res, userId, draft.recordingId);
  } catch (err) {
    console.error('[Drafts] recording meta', err);
    res.status(500).json({ error: 'Failed to load recording meta' });
  }
});

router.get('/:id/recording', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  try {
    const draft = await prisma.draft.findUnique({
      where: { id },
      select: { userId: true, recordingId: true },
    });
    if (!draft || draft.userId !== userId) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    streamRecording(res, userId, draft.recordingId);
  } catch (err) {
    console.error('[Drafts] recording stream', err);
    res.status(500).json({ error: 'Failed to stream recording' });
  }
});

router.post('/:id/retranscribe', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const started = Date.now();

  try {
    const draft = await prisma.draft.findUnique({
      where: { id },
      select: { id: true, userId: true, recordingId: true },
    });
    if (!draft || draft.userId !== userId) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const { fullText, durationMs } = await retranscribeRecording(userId, draft.recordingId);
    await prisma.draft.update({
      where: { id },
      data: { fullText, lastSavedAt: new Date() },
    });

    writeOperationTrace({
      userId,
      category: 'recording',
      action: 'retranscribe',
      target: id,
      durationMs,
      detail: { provider: getSttProviderLabel(), recordingId: draft.recordingId, scope: 'draft' },
    });

    res.json({ success: true, fullText, durationMs });
  } catch (err) {
    writeOperationTrace({
      userId,
      category: 'recording',
      action: 'retranscribe',
      status: 'error',
      target: id,
      durationMs: Date.now() - started,
      detail: {
        provider: getSttProviderLabel(),
        scope: 'draft',
        error: err instanceof Error ? err.message : String(err),
      },
    });
    if (err instanceof RecordingInProgressError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[Drafts] retranscribe', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to retranscribe recording',
    });
  }
});

/** 删除草稿 */
router.delete('/:id', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  try {
    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft || draft.userId !== userId) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    if (draft.recordingId) {
      removeRecordingAudio(userId, draft.recordingId);
    }
    await prisma.draft.delete({ where: { id } });
    // recordingId 未落库或同草稿多次开录时，顺带清理该用户无引用目录
    await cleanupOrphanRecordingArchivesForUser(userId);
    void writeAuditLog({
      userId,
      action: 'draft.delete',
      target: id,
      detail: draft.recordingId ? { recordingId: draft.recordingId } : undefined,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[Drafts] delete error:', err);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

/** AI 根据转录建议正式会话标题 */
router.post('/:id/suggest-title', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft || draft.userId !== userId) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const fullText = draft.fullText?.trim();
    if (!fullText) {
      return res.status(400).json({ error: 'Draft has no transcript content' });
    }

    const generated = await generateSummary(buildSuggestSessionTitlePrompt(fullText));
    const title = generated
      .trim()
      .split('\n')[0]
      .replace(/^["'「『【\[]+|["'」』】\]]+$/g, '')
      .trim()
      .slice(0, 80);

    if (!title) {
      return res.status(500).json({ error: 'Failed to suggest title' });
    }

    res.json({ title });
  } catch (err) {
    console.error('[Drafts] suggest-title error:', err);
    res.status(500).json({ error: 'Failed to suggest title' });
  }
});

/** 转正：创建 Transcript 并删除草稿 */
router.post('/:id/promote', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { title } = req.body as { title?: string };

  if (!title?.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft || draft.userId !== userId) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const fullText = draft.fullText?.trim();
    if (!fullText) {
      return res.status(400).json({ error: 'Draft has no transcript content' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const transcript = await tx.transcript.create({
        data: {
          userId,
          title: title.trim(),
          fullText,
          recordedAt: draft.startedAt,
          recordingId: draft.recordingId,
          orgId: draft.orgId,
        },
      });
      await tx.draft.delete({ where: { id } });
      return transcript;
    });

    res.status(201).json({ success: true, transcript: result });
  } catch (err) {
    console.error('[Drafts] promote error:', err);
    const message =
      err && typeof err === 'object' && 'code' in err && err.code === 'P2000'
        ? '转录内容过长，数据库字段配置异常，请执行最新数据库迁移'
        : err instanceof Error
          ? err.message
          : 'Failed to promote draft';
    res.status(500).json({ error: message });
  }
});

export default router;
