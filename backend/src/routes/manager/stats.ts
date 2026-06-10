import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../lib/prisma';
import { requireManager } from '../../middleware/managerMiddleware';
import { STORAGE_CONFIG } from '../../lib/storage-config';
import { getSummaryProviderLabel } from '../../lib/summary-llm';

const router = Router();
router.use(requireManager);

function dirSizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(p);
    else total += fs.statSync(p).size;
  }
  return total;
}

router.get('/', async (_req, res) => {
  try {
    const [userCount, transcriptCount, draftCount, summaryCount, pendingTemplates] =
      await Promise.all([
        prisma.user.count(),
        prisma.transcript.count(),
        prisma.draft.count(),
        prisma.summary.count(),
        prisma.summaryTemplate.count({ where: { reviewStatus: 'pending', isPublic: true } }),
      ]);

    const uploadsBytes = dirSizeBytes(STORAGE_CONFIG.uploadsDir);

    res.json({
      users: userCount,
      transcripts: transcriptCount,
      drafts: draftCount,
      summaries: summaryCount,
      pendingTemplateReviews: pendingTemplates,
      uploadsBytes,
      uploadsDir: STORAGE_CONFIG.uploadsDir,
      summaryProvider: getSummaryProviderLabel(),
      sttProvider: process.env.STT_PROVIDER || 'deepgram',
    });
  } catch (err) {
    console.error('[Manager/Stats]', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

export default router;
