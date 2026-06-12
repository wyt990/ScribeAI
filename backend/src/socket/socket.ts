import { Server, Socket } from "socket.io";
import fs from "fs";
import path from "path";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { STORAGE_CONFIG } from "../lib/storage-config";
import {
  appendRecordingChunk,
  finalizeRecordingArchive,
  prepareRecordingArchive,
  type RecordingArchiveFormat,
} from "../lib/audio-archive";
import { transcribeAudioBuffer } from "../lib/asr-transcribe";
import { authenticateSocketHandshake } from "../lib/socket-auth";
import { writeOperationTrace } from "../lib/operation-trace";
import { assertSocketUser } from "./socket-types";
import { attachRecordingInterruptHandlers } from "./recording-trace-handlers";

const STT_PROVIDER = process.env.STT_PROVIDER || "deepgram";
const SLICE_INTERVAL_MS = (parseInt(process.env.ASR_SLICE_INTERVAL || "5", 10)) * 1000;

/** Safety flush interval: flush accumulated audio to ASR every N ms even in VAD mode */
const SAFETY_FLUSH_MS = 10000;

export const createSocketServer = (httpServer: any) => {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  io.use(async (socket, next) => {
    const user = await authenticateSocketHandshake(
      socket.handshake.auth?.token,
      socket.handshake.headers.authorization
    );
    if (!user) {
      writeOperationTrace({
        category: "socket",
        action: "auth.denied",
        status: "error",
        detail: { socketId: socket.id },
      });
      return next(new Error("Unauthorized"));
    }
    socket.data.userId = user.id;
    socket.data.userEmail = user.email;
    next();
  });

  io.on("connection", (socket: Socket) => {
    if (STT_PROVIDER === "openai_asr") {
      handleOpenAIASR(socket);
    } else {
      handleDeepgram(socket);
    }

    socket.on("disconnect", () => {
      // per-handler cleanup
    });
  });

  return io;
};

// ============================================================
// Deepgram (real-time streaming)
// ============================================================
function handleDeepgram(socket: Socket) {
  const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);

  let deepgramLive = deepgram.listen.live({
    model: "nova-2-general",
    punctuate: true,
  });

  let isDeepgramOpen = false;
  let currentUserId: string | null = null;
  let currentRecordingId: string | null = null;
  let recordingStartedAt: number | null = null;
  let transcriptEmitCount = 0;

  deepgramLive.on(LiveTranscriptionEvents.Open, () => {
    // console.log("[Deepgram] Connection opened for", socket.id);
    isDeepgramOpen = true;
    socket.emit("deepgram-ready");
  });

  deepgramLive.on(LiveTranscriptionEvents.Close, () => {
    // console.log("[Deepgram] Connection closed for", socket.id);
    isDeepgramOpen = false;
  });

  deepgramLive.on(LiveTranscriptionEvents.Error, (err) => {
    console.error("[Deepgram] ERROR for", socket.id, err);
    isDeepgramOpen = false;
    writeOperationTrace({
      userId: currentUserId,
      category: "recording",
      action: "stt.error",
      status: "error",
      target: currentRecordingId ?? undefined,
      detail: {
        provider: "deepgram",
        error: err instanceof Error ? err.message : String(err),
      },
    });
    socket.emit("deepgram-error", err);
  });

  deepgramLive.on(LiveTranscriptionEvents.Transcript, (response: any) => {
    try {
      const transcript = response.channel.alternatives[0]?.transcript;
      if (transcript && transcript.trim() !== "") {
        transcriptEmitCount += 1;
        socket.emit("transcript", transcript);
      }
    } catch (err) {
      console.error("Deepgram parse error:", err);
    }
  });

  // Receive audio chunks
  socket.on("audio-chunk", async (blob: ArrayBuffer) => {
    try {
      if (!assertSocketUser(socket, currentUserId ?? undefined) || !currentRecordingId) return;
      if (!isDeepgramOpen) return;

      const buffer = Buffer.from(blob);
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );

      deepgramLive.send(arrayBuffer);

      // Save chunk to hierarchical storage
      if (currentUserId && currentRecordingId) {
        appendRecordingChunk(currentUserId, currentRecordingId, buffer);
      }
    } catch (error) {
      console.error("Error processing audio chunk:", error);
    }
  });

  socket.on("start-recording", ({ recordingId, userId }: { recordingId: string; userId?: string }) => {
    const authUserId = assertSocketUser(socket, userId);
    if (!authUserId || !recordingId) {
      socket.emit("socket-error", { code: "FORBIDDEN", message: "Invalid recording session" });
      return;
    }
    currentRecordingId = recordingId;
    currentUserId = authUserId;
    recordingStartedAt = Date.now();
    transcriptEmitCount = 0;
    const sessionDir = path.join(STORAGE_CONFIG.uploadsDir, authUserId, recordingId);
    fs.mkdirSync(sessionDir, { recursive: true });
    writeOperationTrace({
      userId: authUserId,
      category: "recording",
      action: "recording.start",
      target: recordingId,
      detail: { provider: "deepgram" },
    });
  });

  socket.on("reset-recording", () => {
    if (!assertSocketUser(socket, currentUserId ?? undefined)) return;
  });

  socket.on("stop-recording", () => {
    if (!assertSocketUser(socket, currentUserId ?? undefined)) return;
    if (currentUserId && currentRecordingId) {
      finalizeRecordingArchive(currentUserId, currentRecordingId);
      writeOperationTrace({
        userId: currentUserId,
        category: "recording",
        action: "recording.stop",
        target: currentRecordingId,
        durationMs: recordingStartedAt ? Date.now() - recordingStartedAt : undefined,
        detail: {
          provider: "deepgram",
          transcriptEmitCount,
        },
      });
      currentUserId = null;
      currentRecordingId = null;
      recordingStartedAt = null;
      transcriptEmitCount = 0;
    }
  });

  socket.on("disconnect", () => {
    if (deepgramLive && isDeepgramOpen) {
      deepgramLive.finish();
    }
  });

  attachRecordingInterruptHandlers(socket, () => ({
    currentUserId,
    currentRecordingId,
    recordingStartedAt,
    provider: "deepgram",
  }));
}

// ============================================================
// VAD config
// ============================================================
const VAD_ENABLED = process.env.VAD_ENABLED === "true";

const VAD_CONFIG = {
  probThreshold: parseFloat(process.env.VAD_PROB_THRESHOLD || "0.5"),
  negativeThreshold: parseFloat(process.env.VAD_NEGATIVE_THRESHOLD || "0.35"),
  redemptionMs: parseInt(process.env.VAD_REDEMPTION_MS || "1400", 10),
  preSpeechPadMs: parseInt(process.env.VAD_PRE_SPEECH_PAD_MS || "800", 10),
  minSpeechMs: parseInt(process.env.VAD_MIN_SPEECH_MS || "400", 10),
  model: (process.env.VAD_MODEL === "v5" ? "v5" : "legacy") as "v5" | "legacy",
};

// ============================================================
// OpenAI ASR (VAD-driven or timer-based)
// ============================================================
function handleOpenAIASR(socket: Socket) {
  // Buffer management
  let accumulatedChunks: Buffer[] = [];
  let lastFlushedChunkIndex = 0;         // non-VAD / final tail fallback
  let sliceTimer: ReturnType<typeof setInterval> | null = null;
  let safetyTimer: ReturnType<typeof setInterval> | null = null;
  let lastTranscriptLength = 0;          // non-VAD timer mode: length-based incremental dedup
  let currentUserId: string | null = null;
  let currentRecordingId: string | null = null;
  let recordingStartedAt: number | null = null;
  let vadSegmentCount = 0;
  let sessionCaptureMode: "native" | "web" = "web";
  let nativeFlushDebounce: ReturnType<typeof setTimeout> | null = null;

  const usesVadSegments = () => VAD_ENABLED && sessionCaptureMode !== "native";
  const usesTimerSlices = () => sessionCaptureMode === "native" || !VAD_ENABLED;

  const resetSessionBuffers = () => {
    accumulatedChunks = [];
    lastFlushedChunkIndex = 0;
    lastTranscriptLength = 0;
  };

  // Tell frontend we're ready immediately (no streaming connection needed)
  socket.emit("deepgram-ready");

  // Send VAD config for frontend Silero VAD
  socket.emit("vad-config", VAD_CONFIG);
  console.log(`[VAD] enabled=${VAD_ENABLED}, model=${VAD_CONFIG.model}, config sent to ${socket.id}`);

  function nativeChunkFormat(chunkBuf: Buffer): { mimeType: string; extension: string } {
    if (chunkBuf.length >= 4 && chunkBuf.toString("ascii", 0, 4) === "RIFF") {
      return { mimeType: "audio/wav", extension: "wav" };
    }
    return { mimeType: "audio/webm;codecs=opus", extension: "webm" };
  }

  // 原生持麦：每片独立 WAV（定时或静音分句），须逐片转写（不可 Buffer.concat）
  async function flushNativePendingChunks() {
    const pending = accumulatedChunks.slice(lastFlushedChunkIndex);
    if (pending.length === 0) return;

    for (const chunkBuf of pending) {
      const started = Date.now();
      const { mimeType, extension } = nativeChunkFormat(chunkBuf);
      try {
        const text = await transcribeAudioBuffer(chunkBuf, mimeType, extension);
        if (!text?.trim()) continue;

        writeOperationTrace({
          userId: currentUserId,
          category: "recording",
          action: "stt.segment",
          target: currentRecordingId ?? undefined,
          durationMs: Date.now() - started,
          detail: {
            provider: "openai_asr",
            mode: "native_chunk",
            captureMode: "native",
            audioBytes: chunkBuf.length,
          },
        });
        socket.emit("transcript", text.trim());
      } catch (err) {
        console.error(`[OpenAI ASR] Native chunk error for ${socket.id}:`, err);
        writeOperationTrace({
          userId: currentUserId,
          category: "recording",
          action: "stt.error",
          status: "error",
          target: currentRecordingId ?? undefined,
          durationMs: Date.now() - started,
          detail: {
            provider: "openai_asr",
            mode: "native_chunk",
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }

    lastFlushedChunkIndex = accumulatedChunks.length;
  }

  function scheduleNativeFlush() {
    if (nativeFlushDebounce) clearTimeout(nativeFlushDebounce);
    nativeFlushDebounce = setTimeout(() => {
      nativeFlushDebounce = null;
      void flushNativePendingChunks();
    }, 600);
  }

  // ---- Flush audio to ASR ----
  // VAD mode: transcribe only NEW chunks since last flush; emit full segment text.
  // Timer mode: transcribe all audio; emit length-based incremental delta.
  async function flushToASR(seq?: number) {
    if (accumulatedChunks.length === 0) return;

    if (sessionCaptureMode === "native") {
      await flushNativePendingChunks();
      return;
    }

    const started = Date.now();
    try {
      let audioBuffer: Buffer;

      if (usesVadSegments()) {
        const pending = accumulatedChunks.slice(lastFlushedChunkIndex);
        if (pending.length === 0) return;
        audioBuffer = Buffer.concat(pending);
      } else {
        audioBuffer = Buffer.concat(accumulatedChunks);
      }

      const text = await transcribeAudioBuffer(audioBuffer);
      if (!text?.trim()) return;

      const trimmed = text.trim();

      if (usesVadSegments()) {
        lastFlushedChunkIndex = accumulatedChunks.length;

        if (seq !== undefined) {
          vadSegmentCount += 1;
          writeOperationTrace({
            userId: currentUserId,
            category: "recording",
            action: "stt.segment",
            target: currentRecordingId ?? undefined,
            durationMs: Date.now() - started,
            detail: { provider: "openai_asr", seq, mode: "buffer_flush", vad: true },
          });
          socket.emit("segment-result", { seq, text: trimmed });
          // console.log(`[ASR] segment seq=${seq}: "${trimmed.slice(0, 60)}..."`);
        } else {
          // Final tail on stop — only unprocessed audio remains
          socket.emit("transcript", trimmed);
          // console.log(`[ASR] final tail: "${trimmed.slice(0, 60)}..."`);
        }
      } else {
        if (trimmed.length > lastTranscriptLength) {
          const newText = trimmed.slice(lastTranscriptLength).trim();
          lastTranscriptLength = trimmed.length;
          if (newText) {
            writeOperationTrace({
              userId: currentUserId,
              category: "recording",
              action: "stt.segment",
              target: currentRecordingId ?? undefined,
              durationMs: Date.now() - started,
              detail: { provider: "openai_asr", mode: "timer_slice", vad: false },
            });
            socket.emit("transcript", newText);
          }
        }
      }
    } catch (err) {
      console.error(`[OpenAI ASR] Flush error for ${socket.id}:`, err);
      writeOperationTrace({
        userId: currentUserId,
        category: "recording",
        action: "stt.error",
        status: "error",
        target: currentRecordingId ?? undefined,
        durationMs: Date.now() - started,
        detail: {
          provider: "openai_asr",
          seq,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      if (seq !== undefined) {
        socket.emit("deepgram-error", `Segment ${seq} transcription failed`);
      }
    }
  }

  // ---- Fallback timer (only when VAD is disabled) ----
  function startSliceTimer() {
    if (sliceTimer) clearInterval(sliceTimer);
    sliceTimer = setInterval(async () => {
      await flushToASR();
    }, SLICE_INTERVAL_MS);
  }

  // ---- Start recording: set up session context ----
  socket.on("start-recording", ({
    recordingId,
    userId,
    captureMode,
  }: {
    recordingId: string;
    userId?: string;
    captureMode?: "native" | "web";
  }) => {
    const authUserId = assertSocketUser(socket, userId);
    if (!authUserId || !recordingId) {
      socket.emit("socket-error", { code: "FORBIDDEN", message: "Invalid recording session" });
      return;
    }
    if (sliceTimer) { clearInterval(sliceTimer); sliceTimer = null; }
    if (safetyTimer) { clearInterval(safetyTimer); safetyTimer = null; }
    if (nativeFlushDebounce) { clearTimeout(nativeFlushDebounce); nativeFlushDebounce = null; }
    resetSessionBuffers();

    sessionCaptureMode = captureMode === "native" ? "native" : "web";
    currentRecordingId = recordingId;
    currentUserId = authUserId;
    recordingStartedAt = Date.now();
    vadSegmentCount = 0;
    const archiveFormat: RecordingArchiveFormat =
      sessionCaptureMode === "native" ? "wav" : "webm";
    prepareRecordingArchive(authUserId, recordingId, archiveFormat);
    writeOperationTrace({
      userId: authUserId,
      category: "recording",
      action: "recording.start",
      target: recordingId,
      detail: {
        provider: "openai_asr",
        vadEnabled: VAD_ENABLED,
        captureMode: sessionCaptureMode,
      },
    });

    if (usesTimerSlices() && sessionCaptureMode !== "native") {
      startSliceTimer();
      if (!safetyTimer) {
        safetyTimer = setInterval(async () => {
          await flushToASR();
        }, SAFETY_FLUSH_MS);
      }
    }
  });

  // ---- Receive audio chunks ----
  socket.on("audio-chunk", async (blob: ArrayBuffer) => {
    try {
      if (!assertSocketUser(socket, currentUserId ?? undefined) || !currentRecordingId) return;
      const buffer = Buffer.from(blob);
      accumulatedChunks.push(buffer);

      // Save chunk to hierarchical storage
      if (currentUserId && currentRecordingId) {
        appendRecordingChunk(
          currentUserId,
          currentRecordingId,
          buffer,
          sessionCaptureMode === "native" ? "wav" : "webm"
        );
      }

      if (sessionCaptureMode === "native") {
        scheduleNativeFlush();
        return;
      }

      // Timer slices: non-VAD web mode
      if (!sliceTimer && usesTimerSlices()) {
        startSliceTimer();
      }

      if (!safetyTimer && usesTimerSlices()) {
        safetyTimer = setInterval(async () => {
          await flushToASR();
        }, SAFETY_FLUSH_MS);
      }
    } catch (error) {
      console.error("Error processing audio chunk:", error);
    }
  });

  // ---- VAD-triggered segment end: transcribe WAV audio from frontend VAD ----
  socket.on("segment-end", async ({ seq, audio }: { seq: number; audio?: ArrayBuffer }) => {
    if (!usesVadSegments()) return;
    if (!assertSocketUser(socket, currentUserId ?? undefined) || !currentRecordingId) return;

    if (!audio || audio.byteLength === 0) {
      // console.warn(`[VAD] segment-end seq=${seq} missing audio data, skipping`);
      return;
    }

    // console.log(`[VAD] segment-end seq=${seq}, wav=${audio.byteLength}B`);
    const started = Date.now();
    try {
      const text = await transcribeAudioBuffer(
        Buffer.from(audio),
        "audio/wav",
        "wav"
      );
      if (text?.trim()) {
        vadSegmentCount += 1;
        writeOperationTrace({
          userId: currentUserId,
          category: "recording",
          action: "stt.segment",
          target: currentRecordingId ?? undefined,
          durationMs: Date.now() - started,
          detail: {
            provider: "openai_asr",
            seq,
            mode: "vad_segment",
            audioBytes: audio.byteLength,
          },
        });
        socket.emit("segment-result", { seq, text: text.trim() });
        // console.log(`[ASR] segment seq=${seq}: "${text.trim().slice(0, 60)}..."`);
      }
    } catch (err) {
      console.error(`[OpenAI ASR] Segment ${seq} error for ${socket.id}:`, err);
      writeOperationTrace({
        userId: currentUserId,
        category: "recording",
        action: "stt.error",
        status: "error",
        target: currentRecordingId ?? undefined,
        durationMs: Date.now() - started,
        detail: {
          provider: "openai_asr",
          seq,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      socket.emit("deepgram-error", `Segment ${seq} transcription failed`);
    }
  });

  // ---- Client signals recording is complete ----
  socket.on("stop-recording", async () => {
    if (!assertSocketUser(socket, currentUserId ?? undefined)) return;

    // Stop timers
    if (sliceTimer) {
      clearInterval(sliceTimer);
      sliceTimer = null;
    }
    if (safetyTimer) {
      clearInterval(safetyTimer);
      safetyTimer = null;
    }
    if (nativeFlushDebounce) {
      clearTimeout(nativeFlushDebounce);
      nativeFlushDebounce = null;
    }

    // Native: flush remaining chunks. Web timer-slice: final full-buffer flush.
    if (sessionCaptureMode === "native") {
      await flushNativePendingChunks();
    } else if (usesTimerSlices()) {
      await flushToASR();
    }

    resetSessionBuffers();

    const stoppedCaptureMode = sessionCaptureMode;
    sessionCaptureMode = "web";

    // Clean up session directory
    if (currentUserId && currentRecordingId) {
      finalizeRecordingArchive(
        currentUserId,
        currentRecordingId,
        stoppedCaptureMode === "native" ? "wav" : "webm"
      );
      writeOperationTrace({
        userId: currentUserId,
        category: "recording",
        action: "recording.stop",
        target: currentRecordingId,
        durationMs: recordingStartedAt ? Date.now() - recordingStartedAt : undefined,
        detail: {
          provider: "openai_asr",
          vadEnabled: VAD_ENABLED,
          captureMode: stoppedCaptureMode,
          vadSegmentCount,
        },
      });
      currentUserId = null;
      currentRecordingId = null;
      recordingStartedAt = null;
      vadSegmentCount = 0;
    }
  });

  socket.on("reset-recording", () => {
    if (!assertSocketUser(socket, currentUserId ?? undefined)) return;
    resetSessionBuffers();
    if (sliceTimer) {
      clearInterval(sliceTimer);
      sliceTimer = null;
    }
    if (safetyTimer) {
      clearInterval(safetyTimer);
      safetyTimer = null;
    }
  });

  socket.on("disconnect", () => {
    if (sliceTimer) {
      clearInterval(sliceTimer);
      sliceTimer = null;
    }
    if (safetyTimer) {
      clearInterval(safetyTimer);
      safetyTimer = null;
    }
    resetSessionBuffers();
  });

  attachRecordingInterruptHandlers(socket, () => ({
    currentUserId,
    currentRecordingId,
    recordingStartedAt,
    provider: "openai_asr",
  }));
}
