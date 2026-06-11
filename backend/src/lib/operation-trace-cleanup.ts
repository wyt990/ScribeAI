import { prisma } from './prisma';

function retentionDays(): number {
  const raw = Number(process.env.OBSERVABILITY_RETENTION_DAYS ?? '14');
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 14;
}

function maxRows(): number {
  const raw = Number(process.env.OBSERVABILITY_MAX_ROWS ?? '5000');
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5000;
}

export async function cleanupOperationTraces(): Promise<void> {
  const days = retentionDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const deleted = await prisma.operationTrace.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    const total = await prisma.operationTrace.count();
    const cap = maxRows();
    if (total > cap) {
      const overflow = total - cap;
      const oldest = await prisma.operationTrace.findMany({
        orderBy: { createdAt: 'asc' },
        take: overflow,
        select: { id: true },
      });
      if (oldest.length > 0) {
        await prisma.operationTrace.deleteMany({
          where: { id: { in: oldest.map((r) => r.id) } },
        });
      }
    }

    if (deleted.count > 0) {
      console.log(`[OperationTrace] cleaned ${deleted.count} expired trace(s)`);
    }
  } catch (err) {
    console.error('[OperationTrace] cleanup failed:', err);
  }
}

export function startOperationTraceCleanup(): void {
  void cleanupOperationTraces();
  setInterval(() => void cleanupOperationTraces(), 6 * 60 * 60 * 1000);
}
