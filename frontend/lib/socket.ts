import { io, Socket } from 'socket.io-client';
import { float32ToWav } from './audio-utils';

let socket: Socket | null = null;

export const initializeSocket = () => {
  if (socket) {
    return socket;
  }

  // 通过 Next.js rewrite 代理后端（相对路径，浏览器不感知后端端口）
  // 使用 'polling' 确保 HTTP 长轮询可被 Next.js rewrite 代理
  //（WebSocket upgrade rewrite 不支持，故禁用）
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
    console.log('[v0] Socket connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[v0] Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[v0] Socket connection error:', error);
  });

  return socket;
};

export const getSocket = () => {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const emitStartRecording = (recordingId: string, userId: string) => {
  const socket = getSocket();
  if (socket.connected) {
    socket.emit("start-recording", { recordingId, userId });
  }
};

export const emitAudioChunk = (blob: Blob) => {
  const socket = getSocket();
  if (socket.connected) {
    socket.emit('audio-chunk', blob);
  }
};

export const emitStopRecording = () => {
  const socket = getSocket();
  if (socket.connected) {
    socket.emit('stop-recording');
  }
};

export const onTranscript = (callback: (text: string) => void) => {
  const socket = getSocket();
  socket.on('transcript', callback);
  return () => socket.off('transcript', callback);
};

export const onProcessing = (callback: () => void) => {
  const socket = getSocket();
  socket.on('processing', callback);
  return () => socket.off('processing', callback);
};

export const onCompleted = (callback: () => void) => {
  const socket = getSocket();
  socket.on('completed', callback);
  return () => socket.off('completed', callback);
};

// ============ VAD events ============

let _segmentSeq = 0;

export const getSegmentSeq = () => _segmentSeq;

export const incrementSegmentSeq = () => ++_segmentSeq;

export const resetSegmentSeq = () => { _segmentSeq = 0; };

// Segment display reordering state (reset on each new recording)
let _lastDisplayedSeq = 0;
const _reorderBuffer = new Map<number, string>();

export const resetSegmentDisplay = () => {
  _lastDisplayedSeq = 0;
  _reorderBuffer.clear();
};

/** Flush buffered segment results in seq order; returns texts ready to display */
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
  const socket = getSocket();
  if (socket.connected) {
    const payload: { seq: number; audio?: ArrayBuffer } = { seq };
    if (audio && audio.length > 0) {
      payload.audio = float32ToWav(audio, 16000);
    }
    socket.emit('segment-end', payload);
  }
};

export type VADConfig = {
  /** 语音概率阈值（0~1），超过此值判定为有语音 */
  probThreshold: number;
  /** 静音概率阈值（0~1），低于此值判定为无语音 */
  negativeThreshold: number;
  /** 静音宽限时间（毫秒），检测到静音后等待此时长才确认语音结束 */
  redemptionMs: number;
  /** 语音前置填充（毫秒），避免切掉第一个字 */
  preSpeechPadMs: number;
  /** 最短有效语音（毫秒），短于此视为误触发 */
  minSpeechMs: number;
  /** Silero 模型版本：v5（推荐）或 legacy */
  model: 'v5' | 'legacy';
};

/** 默认 VAD 配置（与 backend/.env 默认值一致，后端未下发时使用） */
export const DEFAULT_VAD_CONFIG: VADConfig = {
  probThreshold: 0.5,
  negativeThreshold: 0.35,
  redemptionMs: 1400,
  preSpeechPadMs: 800,
  minSpeechMs: 400,
  model: 'v5',
};

export const onVADConfig = (callback: (config: VADConfig) => void) => {
  const socket = getSocket();
  socket.on('vad-config', callback);
  return () => socket.off('vad-config', callback);
};

export const onSegmentResult = (callback: (data: { seq: number; text: string }) => void) => {
  const socket = getSocket();
  const handler = (data: { seq: number; text: string }) => callback(data);
  socket.on('segment-result', handler);
  return () => socket.off('segment-result', handler);
};
