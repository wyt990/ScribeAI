import { io, Socket } from 'socket.io-client';
import { float32ToWav } from './audio-utils';

let socket: Socket | null = null;

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

export const emitStartRecording = (recordingId: string, userId: string) => {
  const s = getSocket();
  if (s.connected) {
    s.emit('start-recording', { recordingId, userId });
  }
};

export const emitAudioChunk = (blob: Blob) => {
  const s = getSocket();
  if (s.connected) {
    s.emit('audio-chunk', blob);
  }
};

export const emitStopRecording = () => {
  const s = getSocket();
  if (s.connected) {
    s.emit('stop-recording');
  }
};

export const onTranscript = (callback: (text: string) => void) => {
  const s = getSocket();
  s.on('transcript', callback);
  return () => s.off('transcript', callback);
};

export const onProcessing = (callback: () => void) => {
  const s = getSocket();
  s.on('processing', callback);
  return () => s.off('processing', callback);
};

export const onCompleted = (callback: () => void) => {
  const s = getSocket();
  s.on('completed', callback);
  return () => s.off('completed', callback);
};

export const onSocketError = (
  callback: (payload: { code: string; message: string }) => void
) => {
  const s = getSocket();
  s.on('socket-error', callback);
  return () => s.off('socket-error', callback);
};

// ============ VAD events ============

let _segmentSeq = 0;

export const getSegmentSeq = () => _segmentSeq;

export const incrementSegmentSeq = () => ++_segmentSeq;

export const resetSegmentSeq = () => { _segmentSeq = 0; };

let _lastDisplayedSeq = 0;
const _reorderBuffer = new Map<number, string>();

export const resetSegmentDisplay = () => {
  _lastDisplayedSeq = 0;
  _reorderBuffer.clear();
};

export const flushSegmentBuffer = (): string[] => {
  const ready: string[] = [];
  while (_reorderBuffer.has(_lastDisplayedSeq + 1)) {
    _lastDisplayedSeq++;
    const t = _reorderBuffer.get(_lastDisplayedSeq)!;
    _reorderBuffer.delete(_lastDisplayedSeq);
    ready.push(t);
  }
  return ready;
};

export const bufferSegmentResult = (seq: number, text: string): string[] => {
  _reorderBuffer.set(seq, text);
  return flushSegmentBuffer();
};

export const emitSegmentEnd = (seq: number, audio?: Float32Array) => {
  const s = getSocket();
  if (s.connected) {
    const payload: { seq: number; audio?: ArrayBuffer } = { seq };
    if (audio && audio.length > 0) {
      payload.audio = float32ToWav(audio, 16000);
    }
    s.emit('segment-end', payload);
  }
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
