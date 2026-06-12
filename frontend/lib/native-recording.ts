/** 安卓壳内原生持麦；浏览器访问时走 getUserMedia（web 模式） */

export type CaptureMode = 'native' | 'web';

export type NativeRecordingState = 'idle' | 'recording' | 'error';

export type NativeAudioSettings = {
  audioGain: number;
  autoGainEnabled: boolean;
  noiseSuppressionEnabled: boolean;
};

interface ScribeAINativeBridge {
  isAvailable(): boolean;
  getCaptureMode(): string;
  getState(): string;
  setAudioEnhancement?(gain: number, autoGain: boolean, noiseSuppression: boolean): void;
  startRecording(recordingId: string, optionsJson?: string): void;
  stopRecording(): void;
  pauseRecording?(): void;
  resumeRecording?(): void;
  recoverRecording(): void;
  retryNoiseSuppression?(): boolean;
}

declare global {
  interface Window {
    ScribeAINative?: ScribeAINativeBridge;
    /** 由 subscribeNativeRecording 注册；壳优先直调，避免 CustomEvent + JSON 包装 */
    __scribeaiOnNativeChunk?: (
      base64: string,
      seq?: number,
      timestampMs?: number,
      purpose?: NativeChunkPurpose | null
    ) => void;
  }
}

const ANDROID_UA_MARKER = 'ScribeAI-Android';

/** UA 辅助识别（壳已注入 ScribeAI-Android）；权威检测以 JS Bridge 为准 */
export function isAndroidShellUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.userAgent.includes(ANDROID_UA_MARKER);
}

/** 壳内且已注入 ScribeAINative 桥 → 使用原生持麦 */
export function isNativeCaptureAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = window.ScribeAINative;
  if (!bridge) return false;
  try {
    return bridge.isAvailable() === true;
  } catch {
    return false;
  }
}

export function getPreferredCaptureMode(): CaptureMode {
  return isNativeCaptureAvailable() ? 'native' : 'web';
}

export function getNativeState(): NativeRecordingState {
  const bridge = window.ScribeAINative;
  if (!bridge) return 'idle';
  try {
    const s = bridge.getState();
    if (s === 'recording' || s === 'error') return s;
    return 'idle';
  } catch {
    return 'idle';
  }
}

export function nativeSyncAudioEnhancement(settings: NativeAudioSettings): void {
  window.ScribeAINative?.setAudioEnhancement?.(
    settings.audioGain,
    settings.autoGainEnabled,
    settings.noiseSuppressionEnabled
  );
}

export type NativeChunkMode = 'timer' | 'auto';

export type NativeChunkPurpose = 'archive' | 'stt';

export type NativeRecordingChunkOptions = {
  mode: NativeChunkMode;
  chunkSeconds: number;
  vad: {
    redemptionMs: number;
    minSpeechMs: number;
    preSpeechPadMs: number;
    speechRmsThreshold: number;
    maxSegmentMs: number;
  };
};

export function nativeStartRecording(
  recordingId: string,
  settings?: NativeAudioSettings,
  chunkOptions?: NativeRecordingChunkOptions
): void {
  if (settings) {
    nativeSyncAudioEnhancement(settings);
  }
  const opts: NativeRecordingChunkOptions = chunkOptions ?? {
    mode: 'auto',
    chunkSeconds: 3,
    vad: {
      redemptionMs: 1400,
      minSpeechMs: 400,
      preSpeechPadMs: 800,
      speechRmsThreshold: 0.02,
      maxSegmentMs: 30_000,
    },
  };
  window.ScribeAINative?.startRecording(recordingId, JSON.stringify(opts));
}

export function nativeStopRecording(): void {
  window.ScribeAINative?.stopRecording();
}

export function nativePauseRecording(): void {
  window.ScribeAINative?.pauseRecording?.();
}

export function nativeResumeRecording(): void {
  window.ScribeAINative?.resumeRecording?.();
}

export function nativeRecoverRecording(): void {
  window.ScribeAINative?.recoverRecording();
}

export function nativeRetryNoiseSuppression(): boolean {
  try {
    return window.ScribeAINative?.retryNoiseSuppression?.() === true;
  } catch {
    return false;
  }
}

export type NativeChunkMeta = {
  seq: number;
  timestampMs: number;
  purpose?: NativeChunkPurpose;
};

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function base64ToBlob(base64: string, mimeType = 'audio/wav'): Blob {
  return new Blob([base64ToArrayBuffer(base64)], { type: mimeType });
}

type ChunkHandler = (buf: ArrayBuffer, meta?: NativeChunkMeta) => void;
type StateHandler = (state: string, reason?: string) => void;
export type NativeLevelPayload = {
  level: number;
  gain?: number;
  autoGainEnabled?: boolean;
  noiseSuppressionEnabled?: boolean;
  noiseSuppressionActive?: boolean;
  noiseSuppressionEngine?: string;
  noiseSuppressionError?: string;
};

type LevelHandler = (payload: NativeLevelPayload) => void;

function deliverNativeChunk(
  base64: string,
  onChunk: ChunkHandler,
  meta?: NativeChunkMeta
): void {
  if (!base64) return;
  try {
    onChunk(base64ToArrayBuffer(base64), meta);
  } catch (err) {
    console.error('[native-recording] chunk decode failed', err);
  }
}

export function subscribeNativeRecording(
  onChunk: ChunkHandler,
  onState: StateHandler,
  onLevel?: LevelHandler
): () => void {
  const directHandler = (
    base64: string,
    seq?: number,
    timestampMs?: number,
    purpose?: NativeChunkPurpose | null
  ) => {
    const meta =
      typeof seq === 'number' && typeof timestampMs === 'number'
        ? {
            seq,
            timestampMs,
            ...(purpose === 'archive' || purpose === 'stt' ? { purpose } : {}),
          }
        : undefined;
    deliverNativeChunk(base64, onChunk, meta);
  };
  window.__scribeaiOnNativeChunk = directHandler;

  const chunkHandler = (e: Event) => {
    const detail = (e as CustomEvent<{
      base64?: string;
      seq?: number;
      timestampMs?: number;
      purpose?: NativeChunkPurpose | null;
    }>).detail;
    if (!detail?.base64) return;
    const meta =
      typeof detail.seq === 'number' && typeof detail.timestampMs === 'number'
        ? {
            seq: detail.seq,
            timestampMs: detail.timestampMs,
            ...(detail.purpose === 'archive' || detail.purpose === 'stt'
              ? { purpose: detail.purpose }
              : {}),
          }
        : undefined;
    deliverNativeChunk(detail.base64, onChunk, meta);
  };

  const stateHandler = (e: Event) => {
    const detail = (e as CustomEvent<{ state?: string; reason?: string }>).detail;
    if (!detail?.state) return;
    onState(detail.state, detail.reason);
  };

  const levelHandler = (e: Event) => {
    if (!onLevel) return;
    const detail = (e as CustomEvent<NativeLevelPayload>).detail;
    if (typeof detail?.level !== 'number') return;
    onLevel(detail);
  };

  window.addEventListener('scribeai-native-chunk', chunkHandler);
  window.addEventListener('scribeai-native-state', stateHandler);
  if (onLevel) {
    window.addEventListener('scribeai-native-level', levelHandler);
  }

  return () => {
    if (window.__scribeaiOnNativeChunk === directHandler) {
      delete window.__scribeaiOnNativeChunk;
    }
    window.removeEventListener('scribeai-native-chunk', chunkHandler);
    window.removeEventListener('scribeai-native-state', stateHandler);
    if (onLevel) {
      window.removeEventListener('scribeai-native-level', levelHandler);
    }
  };
}
