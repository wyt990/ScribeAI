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

type NativeChunkPurpose = "archive" | "stt";

type AudioChunkWire =
  | ArrayBuffer
  | {
      chunk: ArrayBuffer | Buffer;
      seq?: number;
      timestampMs?: number;
      purpose?: NativeChunkPurpose;
    };

function parseAudioChunkWire(data: AudioChunkWire): {
  buffer: Buffer;
  seq?: number;
  timestampMs?: number;
  purpose?: NativeChunkPurpose;
} {
  if (data instanceof ArrayBuffer) {
    return { buffer: Buffer.from(data) };
  }
  if (data && typeof data === "object" && "chunk" in data) {
    const chunk = data.chunk;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer);
    const purpose =
      data.purpose === "archive" || data.purpose === "stt" ? data.purpose : undefined;
    return { buffer, seq: data.seq, timestampMs: data.timestampMs, purpose };
  }
  return { buffer: Buffer.from(data as ArrayBuffer) };
}

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
  const MAX_DEEPGRAM_RECONNECT_ATTEMPTS = 5;

  let deepgramLive: ReturnType<ReturnType<typeof createClient>["listen"]["live"]>;
  let isDeepgramOpen = false;
  let suppressReconnect = false;
  let shuttingDown = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let currentUserId: string | null = null;
  let currentRecordingId: string | null = null;
  let recordingStartedAt: number | null = null;
  let transcriptEmitCount = 0;

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function finishDeepgramLive(live: typeof deepgramLive) {
    suppressReconnect = true;
    try {
      if (isDeepgramOpen) live.finish();
    } catch {
      /* ignore */
    }
    isDeepgramOpen = false;
    suppressReconnect = false;
  }

  function scheduleReconnect(reason: string) {
    if (shuttingDown || suppressReconnect || !currentRecordingId) return;
    if (reconnectTimer) return;
    if (reconnectAttempts >= MAX_DEEPGRAM_RECONNECT_ATTEMPTS) {
      console.error(
        `[Deepgram] max reconnect attempts reached for ${socket.id} (${reason})`
      );
      return;
    }

    reconnectAttempts += 1;
    const delayMs = Math.min(500 * reconnectAttempts, 3000);
    console.warn(
      `[Deepgram] scheduling reconnect (${reason}) attempt ${reconnectAttempts} in ${delayMs}ms for ${socket.id}`
    );

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      try {
        const previous = deepgramLive;
        deepgramLive = createDeepgramConnection();
        finishDeepgramLive(previous);
      } catch (err) {
        console.error(`[Deepgram] reconnect failed for ${socket.id}:`, err);
        scheduleReconnect("reconnect-failed");
      }
    }, delayMs);
  }

  function bindDeepgramEvents(live: typeof deepgramLive) {
    live.on(LiveTranscriptionEvents.Open, () => {
      isDeepgramOpen = true;
      reconnectAttempts = 0;
      clearReconnectTimer();
      socket.emit("deepgram-ready");
    });

    live.on(LiveTranscriptionEvents.Close, () => {
      isDeepgramOpen = false;
      if (!shuttingDown && !suppressReconnect && currentRecordingId) {
        scheduleReconnect("close");
      }
    });

    live.on(LiveTranscriptionEvents.Error, (err) => {
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
      if (!shuttingDown && !suppressReconnect && currentRecordingId) {
        scheduleReconnect("error");
      }
    });

    live.on(LiveTranscriptionEvents.Transcript, (response: any) => {
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
  }

  function createDeepgramConnection() {
    const live = deepgram.listen.live({
      model: "nova-2-general",
      punctuate: true,
    });
    bindDeepgramEvents(live);
    return live;
  }

  deepgramLive = createDeepgramConnection();

  // Receive audio chunks
  socket.on("audio-chunk", async (wire: AudioChunkWire) => {
    try {
      if (!assertSocketUser(socket, currentUserId ?? undefined) || !currentRecordingId) return;
      if (!isDeepgramOpen) return;

      const { buffer, seq, timestampMs } = parseAudioChunkWire(wire);
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );

      deepgramLive.send(arrayBuffer);

      // Save chunk to hierarchical storage
      if (currentUserId && currentRecordingId) {
        appendRecordingChunk(currentUserId, currentRecordingId, buffer, "webm", {
          seq,
          timestampMs,
        });
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
    clearReconnectTimer();
    reconnectAttempts = 0;
    currentRecordingId = recordingId;
    currentUserId = authUserId;
    recordingStartedAt = Date.now();
    transcriptEmitCount = 0;
    prepareRecordingArchive(authUserId, recordingId, "webm");
    writeOperationTrace({
      userId: authUserId,
      category: "recording",
      action: "recording.start",
      target: recordingId,
      detail: { provider: "deepgram" },
    });
  });

  socket.on("stop-recording", () => {
    if (!assertSocketUser(socket, currentUserId ?? undefined)) return;
    clearReconnectTimer();
    reconnectAttempts = 0;
    if (currentUserId && currentRecordingId) {
      finalizeRecordingArchive(currentUserId, currentRecordingId, "webm");
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
    shuttingDown = true;
    clearReconnectTimer();
    finishDeepgramLive(deepgramLive);
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
  let recordingPaused = false;
  const pausedSegmentQueue: Array<{ seq: number; audio: ArrayBuffer }> = [];

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
    if (recordingPaused) return;
    const startIndex = lastFlushedChunkIndex;
    const pending = accumulatedChunks.slice(startIndex);
    if (pending.length === 0) return;

    for (let i = 0; i < pending.length; i++) {
      const chunkBuf = pending[i];
      const chunkIndex = startIndex + i;
      const started = Date.now();
      const { mimeType, extension } = nativeChunkFormat(chunkBuf);
      try {
        const text = await transcribeAudioBuffer(chunkBuf, mimeType, extension);
        lastFlushedChunkIndex = chunkIndex + 1;
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
        break;
      }
    }

    // 已转写分片从内存队列移除，避免长时间原生录音 accumulatedChunks 无限增长
    if (lastFlushedChunkIndex > 0) {
      accumulatedChunks.splice(0, lastFlushedChunkIndex);
      lastFlushedChunkIndex = 0;
    }
  }

  function scheduleNativeFlush() {
    if (recordingPaused) return;
    if (nativeFlushDebounce) clearTimeout(nativeFlushDebounce);
    nativeFlushDebounce = setTimeout(() => {
      nativeFlushDebounce = null;
      void flushNativePendingChunks();
    }, 600);
  }

  async function transcribeVadSegment(seq: number, audio: ArrayBuffer) {
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
  }

  async function flushPausedSegmentQueue() {
    const queue = pausedSegmentQueue.splice(0);
    for (const item of queue) {
      await transcribeVadSegment(item.seq, item.audio);
    }
  }

  // ---- Flush audio to ASR ----
  // VAD mode: transcribe only NEW chunks since last flush; emit full segment text.
  // Timer mode: transcribe all audio; emit length-based incremental delta.
  async function flushToASR(seq?: number) {
    if (recordingPaused) return;
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
    recordingPaused = false;
    pausedSegmentQueue.length = 0;
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
  socket.on("audio-chunk", async (wire: AudioChunkWire) => {
    try {
      if (!assertSocketUser(socket, currentUserId ?? undefined) || !currentRecordingId) return;
      const { buffer, seq, timestampMs, purpose } = parseAudioChunkWire(wire);
      const archiveChunk = purpose !== "stt";
      const sttChunk = purpose !== "archive";

      if (archiveChunk && currentUserId && currentRecordingId) {
        appendRecordingChunk(
          currentUserId,
          currentRecordingId,
          buffer,
          sessionCaptureMode === "native" ? "wav" : "webm",
          { seq, timestampMs }
        );
      }

      if (sttChunk) {
        accumulatedChunks.push(buffer);
      }

      if (sessionCaptureMode === "native") {
        if (sttChunk) {
          scheduleNativeFlush();
        }
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
      return;
    }

    if (recordingPaused) {
      pausedSegmentQueue.push({ seq, audio: audio.slice(0) });
      return;
    }

    await transcribeVadSegment(seq, audio);
  });

  socket.on(
    "recording-interrupted",
  () => {
    recordingPaused = true;
    if (nativeFlushDebounce) {
      clearTimeout(nativeFlushDebounce);
      nativeFlushDebounce = null;
    }
  });

  socket.on("recording-recovered", () => {
    recordingPaused = false;
    void flushPausedSegmentQueue();
    if (sessionCaptureMode === "native") {
      scheduleNativeFlush();
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
    recordingPaused = false;
    pausedSegmentQueue.length = 0;

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
