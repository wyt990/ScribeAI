import { prisma } from './prisma';

const EXPIRE_DAYS = parseInt(process.env.DRAFT_EXPIRE_DAYS || '30', 10);

/**
 * 删除超过保留期的已停止草稿（未转正的 stopped 状态）
 */
export async function cleanupExpiredDrafts() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - EXPIRE_DAYS);

  try {
    const result = await prisma.draft.deleteMany({
      where: {
        status: 'stopped',
        lastSavedAt: { lt: cutoff },
      },
    });

    if (result.count > 0) {
      console.log(`[DraftCleanup] Removed ${result.count} expired draft(s) older than ${EXPIRE_DAYS} days`);
    }
  } catch (err) {
    console.error('[DraftCleanup] Error:', err);
  }
}

export function startDraftCleanup() {
  const intervalHours = parseInt(process.env.DRAFT_CLEANUP_INTERVAL_HOURS || '24', 10);
  const intervalMs = intervalHours * 60 * 60 * 1000;

  cleanupExpiredDrafts();
  setInterval(cleanupExpiredDrafts, intervalMs);
  console.log(`[DraftCleanup] Scheduled every ${intervalHours} hour(s), expire after ${EXPIRE_DAYS} day(s)`);
}
