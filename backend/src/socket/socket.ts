import { Server, Socket } from "socket.io";
import fs from "fs";
import path from "path";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { STORAGE_CONFIG } from "../lib/storage-config";
import { appendRecordingChunk, finalizeRecordingArchive } from "../lib/audio-archive";
import { transcribeAudioBuffer } from "../lib/asr-transcribe";
import { authenticateSocketHandshake } from "../lib/socket-auth";
import { writeOperationTrace } from "../lib/operation-trace";
import { assertSocketUser } from "./socket-types";

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

  // ---- Flush audio to ASR ----
  // VAD mode: transcribe only NEW chunks since last flush; emit full segment text.
  // Timer mode: transcribe all audio; emit length-based incremental delta.
  async function flushToASR(seq?: number) {
    if (accumulatedChunks.length === 0) return;

    const started = Date.now();
    try {
      let audioBuffer: Buffer;

      if (VAD_ENABLED) {
        const pending = accumulatedChunks.slice(lastFlushedChunkIndex);
        if (pending.length === 0) return;
        audioBuffer = Buffer.concat(pending);
      } else {
        audioBuffer = Buffer.concat(accumulatedChunks);
      }

      const text = await transcribeAudioBuffer(audioBuffer);
      if (!text?.trim()) return;

      const trimmed = text.trim();

      if (VAD_ENABLED) {
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
  socket.on("start-recording", ({ recordingId, userId }: { recordingId: string; userId?: string }) => {
    const authUserId = assertSocketUser(socket, userId);
    if (!authUserId || !recordingId) {
      socket.emit("socket-error", { code: "FORBIDDEN", message: "Invalid recording session" });
      return;
    }
    if (sliceTimer) { clearInterval(sliceTimer); sliceTimer = null; }
    if (safetyTimer) { clearInterval(safetyTimer); safetyTimer = null; }
    resetSessionBuffers();

    currentRecordingId = recordingId;
    currentUserId = authUserId;
    recordingStartedAt = Date.now();
    vadSegmentCount = 0;
    const sessionDir = path.join(STORAGE_CONFIG.uploadsDir, authUserId, recordingId);
    fs.mkdirSync(sessionDir, { recursive: true });
    writeOperationTrace({
      userId: authUserId,
      category: "recording",
      action: "recording.start",
      target: recordingId,
      detail: { provider: "openai_asr", vadEnabled: VAD_ENABLED },
    });
  });

  // ---- Receive audio chunks ----
  socket.on("audio-chunk", async (blob: ArrayBuffer) => {
    try {
      if (!assertSocketUser(socket, currentUserId ?? undefined) || !currentRecordingId) return;
      const buffer = Buffer.from(blob);
      accumulatedChunks.push(buffer);

      // Save chunk to hierarchical storage
      if (currentUserId && currentRecordingId) {
        appendRecordingChunk(currentUserId, currentRecordingId, buffer);
      }

      // Fallback timer (only when VAD is disabled)
      if (!sliceTimer && !VAD_ENABLED) {
        startSliceTimer();
      }

      // Safety timer only for non-VAD mode (VAD uses segment-end; safety flush caused duplicate fragments)
      if (!safetyTimer && !VAD_ENABLED) {
        safetyTimer = setInterval(async () => {
          await flushToASR();
        }, SAFETY_FLUSH_MS);
        // console.log(`[Safety] safety flush timer started (${SAFETY_FLUSH_MS}ms interval)`);
      }
    } catch (error) {
      console.error("Error processing audio chunk:", error);
    }
  });

  // ---- VAD-triggered segment end: transcribe WAV audio from frontend VAD ----
  socket.on("segment-end", async ({ seq, audio }: { seq: number; audio?: ArrayBuffer }) => {
    if (!VAD_ENABLED) return;
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

    // Non-VAD mode: final full-buffer flush. VAD mode uses per-segment WAV from frontend.
    if (!VAD_ENABLED) {
      await flushToASR();
    }

    resetSessionBuffers();

    // Clean up session directory
    if (currentUserId && currentRecordingId) {
      finalizeRecordingArchive(currentUserId, currentRecordingId);
      writeOperationTrace({
        userId: currentUserId,
        category: "recording",
        action: "recording.stop",
        target: currentRecordingId,
        durationMs: recordingStartedAt ? Date.now() - recordingStartedAt : undefined,
        detail: {
          provider: "openai_asr",
          vadEnabled: VAD_ENABLED,
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
}
