import { prisma } from './prisma';
import type { Prisma } from '../generated/prisma';
import { writeOperationTrace } from './operation-trace';

export async function writeAuditLog(opts: {
  userId: string;
  action: string;
  target?: string;
  detail?: Prisma.InputJsonValue;
}): Promise<boolean> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId,
        action: opts.action,
        target: opts.target,
        detail: opts.detail,
      },
    });
    return true;
  } catch (err) {
    console.error('[AuditLog] write failed:', err);
    writeOperationTrace({
      category: 'system',
      action: 'audit.write_failed',
      status: 'error',
      userId: opts.userId,
      target: opts.target,
      detail: {
        auditAction: opts.action,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return false;
  }
}

/** 无有效 userId 时写入 OperationTrace，有 userId 时写入 AuditLog */
export async function writeSecurityAuditLog(opts: {
  userId?: string;
  action: string;
  target?: string;
  detail?: Prisma.InputJsonValue;
}): Promise<void> {
  if (opts.userId) {
    await writeAuditLog({
      userId: opts.userId,
      action: opts.action,
      target: opts.target,
      detail: opts.detail,
    });
    return;
  }

  writeOperationTrace({
    category: 'system',
    action: opts.action,
    status: 'error',
    target: opts.target,
    detail: opts.detail as Record<string, unknown> | undefined,
  });
}
