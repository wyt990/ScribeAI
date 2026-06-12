import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { requireManager } from '../../middleware/managerMiddleware';
import { writeAuditLog } from '../../lib/audit-log';
import { getRecordingMeta, removeRecordingAudio } from '../../lib/audio-archive';
import { cleanupOrphanRecordingArchivesForUser } from '../../lib/recording-orphan-cleanup';
import {
  RecordingInProgressError,
  respondRecordingMeta,
  retranscribeRecording,
  streamRecording,
} from '../../lib/recording-http';
import { getSttProviderLabel } from '../../lib/asr-transcribe';

const router = Router();
router.use(requireManager);

router.get('/transcripts', async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const items = await prisma.transcript.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        recordingId: true,
        userId: true,
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { summaries: true } },
      },
    });
    res.json({
      transcripts: items.map((t) => ({
        ...t,
        hasRecording: t.recordingId ? getRecordingMeta(t.userId, t.recordingId).exists : false,
      })),
    });
  } catch (err) {
    console.error('[Manager/Content] transcripts', err);
    res.status(500).json({ error: 'Failed to list transcripts' });
  }
});

router.delete('/transcripts/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id: req.params.id },
      select: { userId: true, recordingId: true },
    });
    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.summary.deleteMany({ where: { transcriptId: req.params.id } });
      await tx.transcript.delete({ where: { id: req.params.id } });
    });

    if (transcript.recordingId) {
      removeRecordingAudio(transcript.userId, transcript.recordingId);
    }
    await cleanupOrphanRecordingArchivesForUser(transcript.userId);
    await writeAuditLog({
      userId: req.user!.id,
      action: 'transcript.delete',
      target: req.params.id,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[Manager/Content] delete transcript', err);
    res.status(500).json({ error: 'Failed to delete transcript' });
  }
});

router.get('/drafts', async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const items = await prisma.draft.findMany({
      take,
      orderBy: { lastSavedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        lastSavedAt: true,
        recordingId: true,
        userId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    res.json({
      drafts: items.map((d) => ({
        ...d,
        hasRecording: d.recordingId ? getRecordingMeta(d.userId, d.recordingId).exists : false,
      })),
    });
  } catch (err) {
    console.error('[Manager/Content] drafts', err);
    res.status(500).json({ error: 'Failed to list drafts' });
  }
});

router.delete('/drafts/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const draft = await prisma.draft.findUnique({
      where: { id: req.params.id },
      select: { userId: true, recordingId: true },
    });
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    if (draft.recordingId) {
      removeRecordingAudio(draft.userId, draft.recordingId);
    }
    await prisma.draft.delete({ where: { id: req.params.id } });
    await cleanupOrphanRecordingArchivesForUser(draft.userId);
    await writeAuditLog({
      userId: req.user!.id,
      action: 'draft.delete',
      target: req.params.id,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[Manager/Content] delete draft', err);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

router.get('/transcripts/:id/recording/meta', async (req, res) => {
  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id: req.params.id },
      select: { userId: true, recordingId: true },
    });
    if (!transcript) return res.status(404).json({ error: 'Transcript not found' });
    respondRecordingMeta(res, transcript.userId, transcript.recordingId);
  } catch (err) {
    console.error('[Manager/Content] transcript recording meta', err);
    res.status(500).json({ error: 'Failed to load recording meta' });
  }
});

router.get('/transcripts/:id/recording', async (req, res) => {
  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id: req.params.id },
      select: { userId: true, recordingId: true },
    });
    if (!transcript) return res.status(404).json({ error: 'Transcript not found' });
    streamRecording(res, transcript.userId, transcript.recordingId);
  } catch (err) {
    console.error('[Manager/Content] transcript recording stream', err);
    res.status(500).json({ error: 'Failed to stream recording' });
  }
});

router.post('/transcripts/:id/retranscribe', async (req: AuthenticatedRequest, res) => {
  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, recordingId: true, title: true },
    });
    if (!transcript) return res.status(404).json({ error: 'Transcript not found' });

    const { fullText, durationMs } = await retranscribeRecording(
      transcript.userId,
      transcript.recordingId
    );
    await prisma.transcript.update({ where: { id: transcript.id }, data: { fullText } });

    await writeAuditLog({
      userId: req.user!.id,
      action: 'transcript.retranscribe',
      target: transcript.id,
      detail: { provider: getSttProviderLabel(), durationMs },
    });

    res.json({ success: true, fullText, durationMs });
  } catch (err) {
    if (err instanceof RecordingInProgressError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[Manager/Content] transcript retranscribe', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to retranscribe recording',
    });
  }
});

router.get('/drafts/:id/recording/meta', async (req, res) => {
  try {
    const draft = await prisma.draft.findUnique({
      where: { id: req.params.id },
      select: { userId: true, recordingId: true },
    });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    respondRecordingMeta(res, draft.userId, draft.recordingId);
  } catch (err) {
    console.error('[Manager/Content] draft recording meta', err);
    res.status(500).json({ error: 'Failed to load recording meta' });
  }
});

router.get('/drafts/:id/recording', async (req, res) => {
  try {
    const draft = await prisma.draft.findUnique({
      where: { id: req.params.id },
      select: { userId: true, recordingId: true },
    });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    streamRecording(res, draft.userId, draft.recordingId);
  } catch (err) {
    console.error('[Manager/Content] draft recording stream', err);
    res.status(500).json({ error: 'Failed to stream recording' });
  }
});

router.post('/drafts/:id/retranscribe', async (req: AuthenticatedRequest, res) => {
  try {
    const draft = await prisma.draft.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, recordingId: true },
    });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    const { fullText, durationMs } = await retranscribeRecording(draft.userId, draft.recordingId);
    await prisma.draft.update({
      where: { id: draft.id },
      data: { fullText, lastSavedAt: new Date() },
    });

    await writeAuditLog({
      userId: req.user!.id,
      action: 'draft.retranscribe',
      target: draft.id,
      detail: { provider: getSttProviderLabel(), durationMs },
    });

    res.json({ success: true, fullText, durationMs });
  } catch (err) {
    if (err instanceof RecordingInProgressError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[Manager/Content] draft retranscribe', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to retranscribe recording',
    });
  }
});

export default router;
