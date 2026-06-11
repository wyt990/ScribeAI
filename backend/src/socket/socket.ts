import { Server, Socket } from "socket.io";
import fs from "fs";
import path from "path";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { STORAGE_CONFIG } from "../lib/storage-config";
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
        saveAudioChunk(buffer, currentUserId, currentRecordingId);
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
      removeSessionDir(currentUserId, currentRecordingId);
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
    if (currentUserId && currentRecordingId) {
      removeSessionDir(currentUserId, currentRecordingId);
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
  const apiKey = process.env.OPENAI_ASR_API_KEY || "";
  const baseUrl = process.env.OPENAI_ASR_BASE_URL || "http://10.100.0.130:8000/v1";
  const model = process.env.OPENAI_ASR_MODEL || "funasr-nano";
  const language = process.env.OPENAI_ASR_LANGUAGE || "zh";

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

      const text = await transcribeAudio(audioBuffer, baseUrl, apiKey, model, language);
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
        saveAudioChunk(buffer, currentUserId, currentRecordingId);
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
      const text = await transcribeAudio(
        Buffer.from(audio),
        baseUrl,
        apiKey,
        model,
        language,
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
      removeSessionDir(currentUserId, currentRecordingId);
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
    // Clean up if stop-recording wasn't called (page crash)
    if (currentUserId && currentRecordingId) {
      removeSessionDir(currentUserId, currentRecordingId);
    }
  });
}

// ============================================================
// Shared helpers
// ============================================================

/**
 * Send audio buffer to an OpenAI-compatible ASR endpoint.
 */
async function transcribeAudio(
  audioBuffer: Buffer,
  baseUrl: string,
  apiKey: string,
  model: string,
  language: string,
  mimeType = "audio/webm;codecs=opus",
  extension = "webm"
): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  formData.append("file", blob, `audio-${Date.now()}.${extension}`);
  formData.append("model", model);
  formData.append("language", language);

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`ASR API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  return data.text || "";
}

/**
 * Save audio chunk to hierarchical storage: uploads/{userId}/{recordingId}/
 */
function saveAudioChunk(buffer: Buffer, userId: string, recordingId: string) {
  try {
    const sessionDir = path.join(STORAGE_CONFIG.uploadsDir, userId, recordingId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const filePath = path.join(sessionDir, `chunk-${Date.now()}.webm`);
    fs.writeFileSync(filePath, buffer);
  } catch (error) {
    console.error("Error saving audio chunk:", error);
  }
}

/**
 * Remove an entire session directory.
 */
function removeSessionDir(userId: string, recordingId: string) {
  try {
    const sessionDir = path.join(STORAGE_CONFIG.uploadsDir, userId, recordingId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      // console.log(`[Cleanup] Removed session dir: ${userId}/${recordingId}`);
    }
  } catch (error) {
    console.error("Error removing session dir:", error);
  }
}

/**
 * Scan uploads/ and remove session directories that haven't been modified
 * within the stale threshold. Runs on a timer as a safety net for sessions
 * left behind after a page crash or server restart.
 */
function cleanupStaleSessions() {
  const { uploadsDir, staleThresholdMinutes } = STORAGE_CONFIG;
  if (!fs.existsSync(uploadsDir)) return;

  const now = Date.now();
  const thresholdMs = staleThresholdMinutes * 60 * 1000;
  let cleanedCount = 0;

  try {
    const userDirs = fs.readdirSync(uploadsDir);
    for (const userId of userDirs) {
      const userDir = path.join(uploadsDir, userId);
      if (!fs.statSync(userDir).isDirectory()) continue;

      const sessionDirs = fs.readdirSync(userDir);
      for (const sessionId of sessionDirs) {
        const sessionDir = path.join(userDir, sessionId);
        if (!fs.statSync(sessionDir).isDirectory()) continue;

        // Find the latest mtime across all files in the session dir
        let latestMtime = fs.statSync(sessionDir).mtimeMs;
        try {
          const files = fs.readdirSync(sessionDir);
          for (const file of files) {
            const fileStat = fs.statSync(path.join(sessionDir, file));
            if (fileStat.mtimeMs > latestMtime) latestMtime = fileStat.mtimeMs;
          }
        } catch { /* single file may be deleted during iteration */ }

        if (now - latestMtime > thresholdMs) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          cleanedCount++;
        }
      }

      // Remove empty user dirs
      try {
        if (fs.readdirSync(userDir).length === 0) {
          fs.rmdirSync(userDir);
        }
      } catch { /* ignore */ }
    }
  } catch (error) {
    console.error("[StaleCleanup] Error during scan:", error);
  }

  if (cleanedCount > 0) {
    // console.log(`[StaleCleanup] Cleaned ${cleanedCount} stale session(s)`);
  }
}

/**
 * Start periodic stale session cleanup. Called once at server startup.
 */
export function startStaleSessionCleanup() {
  const { cleanupIntervalMinutes } = STORAGE_CONFIG;
  const intervalMs = cleanupIntervalMinutes * 60 * 1000;

  cleanupStaleSessions(); // run once on startup
  setInterval(cleanupStaleSessions, intervalMs);
  // console.log(`[StaleCleanup] Scheduled every ${cleanupIntervalMinutes} minute(s)`);
}
