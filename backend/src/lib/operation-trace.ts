import { prisma } from './prisma';
import type { Prisma } from '../generated/prisma';

export type TraceCategory = 'recording' | 'summary' | 'socket' | 'system';
export type TraceStatus = 'ok' | 'error';

export type WriteOperationTraceInput = {
  userId?: string | null;
  category: TraceCategory;
  action: string;
  status?: TraceStatus;
  durationMs?: number;
  target?: string;
  detail?: Record<string, unknown>;
};

function isEnabled(): boolean {
  return process.env.OBSERVABILITY_ENABLED !== 'false';
}

function logToConsole(): boolean {
  return process.env.OBSERVABILITY_LOG_TO_CONSOLE !== 'false';
}

/** 结构化写入运行 trace（异步，不阻塞主流程） */
export function writeOperationTrace(input: WriteOperationTraceInput): void {
  const payload = {
    ts: new Date().toISOString(),
    category: input.category,
    action: input.action,
    status: input.status ?? 'ok',
    durationMs: input.durationMs ?? null,
    userId: input.userId ?? null,
    target: input.target ?? null,
    detail: input.detail ?? null,
  };

  if (logToConsole()) {
    const line = JSON.stringify({ level: 'trace', ...payload });
    if (payload.status === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  if (!isEnabled()) return;

  void prisma.operationTrace
    .create({
      data: {
        userId: input.userId ?? null,
        category: input.category,
        action: input.action,
        status: input.status ?? 'ok',
        durationMs: input.durationMs ?? null,
        target: input.target ?? null,
        detail: (input.detail ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
    .catch((err) => {
      console.error('[OperationTrace] write failed:', err);
    });
}

/** 计时辅助：自动记录耗时与错误 */
export async function traceAsync<T>(
  input: Omit<WriteOperationTraceInput, 'durationMs' | 'status'>,
  fn: () => Promise<T>
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    writeOperationTrace({
      ...input,
      status: 'ok',
      durationMs: Date.now() - started,
    });
    return result;
  } catch (err) {
    writeOperationTrace({
      ...input,
      status: 'error',
      durationMs: Date.now() - started,
      detail: {
        ...input.detail,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
