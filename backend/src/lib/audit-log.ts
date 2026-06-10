import { prisma } from './prisma';
import type { Prisma } from '../generated/prisma';

export async function writeAuditLog(opts: {
  userId: string;
  action: string;
  target?: string;
  detail?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId,
        action: opts.action,
        target: opts.target,
        detail: opts.detail,
      },
    });
  } catch (err) {
    console.error('[AuditLog] write failed:', err);
  }
}
