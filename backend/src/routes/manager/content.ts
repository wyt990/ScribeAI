import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { requireManager } from '../../middleware/managerMiddleware';
import { writeAuditLog } from '../../lib/audit-log';

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
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { summaries: true } },
      },
    });
    res.json({ transcripts: items });
  } catch (err) {
    console.error('[Manager/Content] transcripts', err);
    res.status(500).json({ error: 'Failed to list transcripts' });
  }
});

router.delete('/transcripts/:id', async (req: AuthenticatedRequest, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.summary.deleteMany({ where: { transcriptId: req.params.id } });
      await tx.transcript.delete({ where: { id: req.params.id } });
    });
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
        user: { select: { id: true, name: true, email: true } },
      },
    });
    res.json({ drafts: items });
  } catch (err) {
    console.error('[Manager/Content] drafts', err);
    res.status(500).json({ error: 'Failed to list drafts' });
  }
});

router.delete('/drafts/:id', async (req: AuthenticatedRequest, res) => {
  try {
    await prisma.draft.delete({ where: { id: req.params.id } });
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

export default router;
