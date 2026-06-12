import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireManager } from '../../middleware/managerMiddleware';

const router = Router();
router.use(requireManager);

const CATEGORIES = ['recording', 'summary', 'socket', 'system'] as const;

router.get('/summary', async (_req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total24h, errors24h, traces] = await Promise.all([
      prisma.operationTrace.count({ where: { createdAt: { gte: since } } }),
      prisma.operationTrace.count({
        where: { createdAt: { gte: since }, status: 'error' },
      }),
      prisma.operationTrace.findMany({
        where: { createdAt: { gte: since } },
        select: { category: true, action: true, status: true, durationMs: true },
      }),
    ]);

    const avg = (action: string) => {
      const rows = traces.filter((t) => t.action === action && t.durationMs != null);
      if (rows.length === 0) return null;
      const sum = rows.reduce((acc, r) => acc + (r.durationMs ?? 0), 0);
      return Math.round(sum / rows.length);
    };

    const segmentCount = traces.filter((t) => t.action === 'stt.segment').length;
    const recordingStarts = traces.filter((t) => t.action === 'recording.start').length;
    const recordingInterruptions = traces.filter((t) => t.action === 'recording.interrupted').length;
    const recordingRecoveries = traces.filter((t) => t.action === 'recording.recovered').length;

    res.json({
      windowHours: 24,
      total24h,
      errors24h,
      recordingStarts,
      recordingInterruptions,
      recordingRecoveries,
      vadSegmentCount: segmentCount,
      avgSttSegmentMs: avg('stt.segment'),
      avgSummaryGenerateMs: avg('summary.generate'),
      avgSummaryCacheMs: avg('summary.cache_hit'),
    });
  } catch (err) {
    console.error('[Manager/Observability] summary', err);
    res.status(500).json({ error: 'Failed to load observability summary' });
  }
});

function parseTraceListQuery(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(
    Math.max(1, Number(query.pageSize) || Number(query.limit) || 20),
    100
  );
  const category = typeof query.category === 'string' ? query.category : undefined;
  const status = typeof query.status === 'string' ? query.status : undefined;
  return { page, pageSize, category, status };
}

router.get('/traces', async (req, res) => {
  const { page, pageSize, category, status } = parseTraceListQuery(
    req.query as Record<string, unknown>
  );

  try {
    if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (status && status !== 'ok' && status !== 'error') {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const where = {
      ...(category ? { category } : {}),
      ...(status ? { status } : {}),
    };

    const total = await prisma.operationTrace.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const effectivePage = total === 0 ? 1 : Math.min(page, totalPages);
    const skip = (effectivePage - 1) * pageSize;

    const traces = await prisma.operationTrace.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({
      traces,
      total,
      page: effectivePage,
      pageSize,
      totalPages,
    });
  } catch (err) {
    console.error('[Manager/Observability] traces', err);
    res.status(500).json({ error: 'Failed to load traces' });
  }
});

export default router;
