import { io, Socket } from 'socket.io-client';
import { float32ToWav } from './audio-utils';

let socket: Socket | null = null;

/** 断连期间暂存音频分片，重连后按序补发（上限防止内存失控） */
const MAX_PENDING_AUDIO_CHUNKS = 240;
const pendingAudioChunks: ArrayBuffer[] = [];

type PendingSegmentEnd = { seq: number; audio?: ArrayBuffer };
const MAX_PENDING_SEGMENT_ENDS = 60;
const pendingSegmentEnds: PendingSegmentEnd[] = [];

let pendingStopRecording = false;

function flushPendingAudioChunks(): void {
  const s = getSocket();
  if (!s.connected || pendingAudioChunks.length === 0) return;
  while (pendingAudioChunks.length > 0) {
    const buf = pendingAudioChunks.shift()!;
    s.emit('audio-chunk', buf);
  }
}

function flushPendingSegmentEnds(): void {
  const s = getSocket();
  if (!s.connected || pendingSegmentEnds.length === 0) return;
  while (pendingSegmentEnds.length > 0) {
    const item = pendingSegmentEnds.shift()!;
    const payload: { seq: number; audio?: ArrayBuffer } = { seq: item.seq };
    if (item.audio && item.audio.byteLength > 0) {
      payload.audio = item.audio;
    }
    s.emit('segment-end', payload);
  }
}

function flushPendingStopRecording(): void {
  const s = getSocket();
  if (!s.connected || !pendingStopRecording) return;
  flushPendingAudioChunks();
  flushPendingSegmentEnds();
  s.emit('stop-recording');
  pendingStopRecording = false;
  clearPendingAudioChunks();
  clearPendingSegmentEnds();
}

export function clearPendingAudioChunks(): void {
  pendingAudioChunks.length = 0;
}

export function clearPendingSegmentEnds(): void {
  pendingSegmentEnds.length = 0;
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export const initializeSocket = () => {
  if (socket) {
    return socket;
  }

  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';

  socket = io(socketUrl, {
    transports: ['polling'],
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('[Socket] connected:', socket?.id);
    flushPendingAudioChunks();
    flushPendingSegmentEnds();
    flushPendingStopRecording();
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] connection error:', error.message);
  });

  return socket;
};

export const getSocket = () => {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
};

/** 携带 JWT 连接 Socket（未登录或无 token 时不连接） */
export const connectSocket = (): boolean => {
  const s = getSocket();
  const token = getAuthToken();
  if (!token) {
    console.warn('[Socket] missing token, skip connect');
    return false;
  }
  s.auth = { token };
  if (!s.connected) {
    s.connect();
  }
  return true;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export type CaptureMode = 'native' | 'web';

/** 等待 Socket 连接（安卓 WebView 上 connect 常为异步） */
export const ensureSocketConnected = (timeoutMs = 15000): Promise<boolean> => {
  if (!connectSocket()) return Promise.resolve(false);
  const s = getSocket();
  if (s.connected) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const onConnect = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      clearTimeout(timer);
      s.off('connect', onConnect);
    };

    s.on('connect', onConnect);
  });
};

export const emitStartRecording = (
  recordingId: string,
  userId: string,
  captureMode: CaptureMode = 'web'
) => {
  pendingStopRecording = false;
  clearPendingAudioChunks();
  clearPendingSegmentEnds();
  const s = getSocket();
  const payload = { recordingId, userId, captureMode };
  const send = () => s.emit('start-recording', payload);
  if (s.connected) {
    send();
  } else {
    s.once('connect', send);
  }
};

export type NativeChunkPurpose = 'archive' | 'stt';

export type AudioChunkMeta = {
  seq?: number;
  timestampMs?: number;
  purpose?: NativeChunkPurpose;
};

export const emitAudioChunkBuffer = (buf: ArrayBuffer, meta?: AudioChunkMeta) => {
  const s = getSocket();
  const payload =
    meta?.seq != null || meta?.purpose
      ? {
          chunk: buf,
          ...(meta?.seq != null ? { seq: meta.seq } : {}),
          ...(meta?.timestampMs != null ? { timestampMs: meta.timestampMs } : {}),
          ...(meta?.purpose ? { purpose: meta.purpose } : {}),
        }
      : buf;
  if (s.connected) {
    s.emit('audio-chunk', payload);
    return;
  }
  if (pendingAudioChunks.length >= MAX_PENDING_AUDIO_CHUNKS) {
    pendingAudioChunks.shift();
  }
  // 离线队列暂存裸 buffer；重连后按 archive 处理（兼容旧壳）
  pendingAudioChunks.push(buf.slice(0));
};

export const emitAudioChunk = (blob: Blob) => {
  void blob
    .arrayBuffer()
    .then((buf) => {
      emitAudioChunkBuffer(buf);
    })
    .catch((err) => {
      console.error('[Socket] audio-chunk encode failed', err);
    });
};

export const emitStopRecording = () => {
  pendingStopRecording = true;
  const s = getSocket();
  if (s.connected) {
    flushPendingStopRecording();
    return;
  }
  s.once('connect', () => {
    flushPendingStopRecording();
  });
};

export const emitRecordingInterrupted = (
  recordingId: string,
  userId: string,
  reason: string
) => {
  const s = getSocket();
  if (s.connected) {
    s.emit('recording-interrupted', { recordingId, userId, reason });
  }
};

export const emitRecordingRecovered = (
  recordingId: string,
  userId: string,
  error?: string
) => {
  const s = getSocket();
  if (s.connected) {
    s.emit('recording-recovered', { recordingId, userId, error });
  }
};

export const emitRecordingStale = (
  recordingId: string,
  userId: string,
  reason: string,
  detail?: Record<string, unknown>
) => {
  const s = getSocket();
  if (s.connected) {
    s.emit('recording-stale', { recordingId, userId, reason, detail });
  }
};

export const onTranscript = (callback: (text: string) => void) => {
  const s = getSocket();
  s.on('transcript', callback);
  return () => s.off('transcript', callback);
};

export const onSocketError = (
  callback: (payload: { code: string; message: string }) => void
) => {
  const s = getSocket();
  s.on('socket-error', callback);
  return () => s.off('socket-error', callback);
};

export const onDeepgramError = (callback: (message: unknown) => void) => {
  const s = getSocket();
  const handler = (message: unknown) => callback(message);
  s.on('deepgram-error', handler);
  return () => s.off('deepgram-error', handler);
};

// ============ VAD events ============

let _segmentSeq = 0;

export const getSegmentSeq = () => _segmentSeq;

export const incrementSegmentSeq = () => ++_segmentSeq;

export const resetSegmentSeq = () => { _segmentSeq = 0; };

let _lastDisplayedSeq = 0;
const _reorderBuffer = new Map<number, string>();
/** 慢分片到达前等待空洞补齐的最长时间 */
const SEGMENT_GAP_WAIT_MS = 15000;
let _gapDetectedAt: number | null = null;

export const resetSegmentDisplay = () => {
  _lastDisplayedSeq = 0;
  _reorderBuffer.clear();
  _gapDetectedAt = null;
};

export const flushSegmentBuffer = (): string[] => {
  const ready: string[] = [];
  while (true) {
    const next = _lastDisplayedSeq + 1;
    if (_reorderBuffer.has(next)) {
      _gapDetectedAt = null;
      _lastDisplayedSeq = next;
      const t = _reorderBuffer.get(next)!;
      _reorderBuffer.delete(next);
      ready.push(t);
      continue;
    }
    // seq 空洞：先等待慢分片，超时后再跳过错号
    let minHigher: number | null = null;
    for (const k of _reorderBuffer.keys()) {
      if (k > next && (minHigher === null || k < minHigher)) {
        minHigher = k;
      }
    }
    if (minHigher !== null) {
      if (_gapDetectedAt === null) {
        _gapDetectedAt = Date.now();
      }
      if (Date.now() - _gapDetectedAt < SEGMENT_GAP_WAIT_MS) {
        break;
      }
      console.warn('[segment-buffer] gap skipped after timeout, missing seq', next, 'continue from', minHigher);
      _lastDisplayedSeq = minHigher - 1;
      _gapDetectedAt = null;
      continue;
    }
    _gapDetectedAt = null;
    break;
  }
  return ready;
};

export const bufferSegmentResult = (seq: number, text: string): string[] => {
  _reorderBuffer.set(seq, text);
  return flushSegmentBuffer();
};

export const emitSegmentEnd = (seq: number, audio?: Float32Array) => {
  const s = getSocket();
  const wav =
    audio && audio.length > 0 ? float32ToWav(audio, 16000) : undefined;
  const payload: { seq: number; audio?: ArrayBuffer } = { seq };
  if (wav && wav.byteLength > 0) {
    payload.audio = wav;
  }
  if (s.connected) {
    s.emit('segment-end', payload);
    return;
  }
  if (pendingSegmentEnds.length >= MAX_PENDING_SEGMENT_ENDS) {
    pendingSegmentEnds.shift();
  }
  pendingSegmentEnds.push({
    seq,
    audio: wav ? wav.slice(0) : undefined,
  });
};

export type VADConfig = {
  probThreshold: number;
  negativeThreshold: number;
  redemptionMs: number;
  preSpeechPadMs: number;
  minSpeechMs: number;
  model: 'v5' | 'legacy';
};

export const DEFAULT_VAD_CONFIG: VADConfig = {
  probThreshold: 0.5,
  negativeThreshold: 0.35,
  redemptionMs: 1400,
  preSpeechPadMs: 800,
  minSpeechMs: 400,
  model: 'v5',
};

export const onVADConfig = (callback: (config: VADConfig) => void) => {
  const s = getSocket();
  s.on('vad-config', callback);
  return () => s.off('vad-config', callback);
};

export const onSegmentResult = (callback: (data: { seq: number; text: string }) => void) => {
  const s = getSocket();
  const handler = (data: { seq: number; text: string }) => callback(data);
  s.on('segment-result', handler);
  return () => s.off('segment-result', handler);
};
