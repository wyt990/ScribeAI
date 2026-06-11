import { Socket } from "socket.io";
import { writeOperationTrace } from "../lib/operation-trace";
import { assertSocketUser } from "./socket-types";

export type RecordingTraceContext = {
  currentUserId: string | null;
  currentRecordingId: string | null;
  recordingStartedAt: number | null;
  provider: string;
};

/** 来电/系统抢占等录音中断与恢复的可观测性埋点 */
export function attachRecordingInterruptHandlers(
  socket: Socket,
  getCtx: () => RecordingTraceContext
): void {
  socket.on(
    "recording-interrupted",
    ({
      recordingId,
      reason,
      userId,
    }: {
      recordingId?: string;
      reason?: string;
      userId?: string;
    }) => {
      const authUserId = assertSocketUser(socket, userId);
      if (!authUserId) return;

      const ctx = getCtx();
      const target = recordingId ?? ctx.currentRecordingId;
      if (!target) return;

      writeOperationTrace({
        userId: authUserId,
        category: "recording",
        action: "recording.interrupted",
        target,
        durationMs: ctx.recordingStartedAt ? Date.now() - ctx.recordingStartedAt : undefined,
        detail: {
          reason: reason ?? "unknown",
          provider: ctx.provider,
        },
      });
    }
  );

  socket.on(
    "recording-recovered",
    ({
      recordingId,
      userId,
      error,
    }: {
      recordingId?: string;
      userId?: string;
      error?: string;
    }) => {
      const authUserId = assertSocketUser(socket, userId);
      if (!authUserId) return;

      const ctx = getCtx();
      const target = recordingId ?? ctx.currentRecordingId;
      if (!target) return;

      writeOperationTrace({
        userId: authUserId,
        category: "recording",
        action: "recording.recovered",
        status: error ? "error" : "ok",
        target,
        durationMs: ctx.recordingStartedAt ? Date.now() - ctx.recordingStartedAt : undefined,
        detail: {
          provider: ctx.provider,
          ...(error ? { error } : {}),
        },
      });
    }
  );

  socket.on(
    "recording-stale",
    ({
      recordingId,
      reason,
      userId,
      detail,
    }: {
      recordingId?: string;
      reason?: string;
      userId?: string;
      detail?: Record<string, unknown>;
    }) => {
      const authUserId = assertSocketUser(socket, userId);
      if (!authUserId) return;

      const ctx = getCtx();
      const target = recordingId ?? ctx.currentRecordingId;
      if (!target) return;

      writeOperationTrace({
        userId: authUserId,
        category: "recording",
        action: "recording.stale",
        status: "error",
        target,
        durationMs: ctx.recordingStartedAt ? Date.now() - ctx.recordingStartedAt : undefined,
        detail: {
          reason: reason ?? "unknown",
          provider: ctx.provider,
          ...detail,
        },
      });
    }
  );
}
