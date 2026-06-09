// /hooks/use-audio-recorder.ts
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRecordingStore, AudioMode } from '@/lib/store';
import {
  getSocket, emitAudioChunk, emitStopRecording, emitStartRecording,
  incrementSegmentSeq, emitSegmentEnd, resetSegmentSeq, resetSegmentDisplay,
  DEFAULT_VAD_CONFIG, type VADConfig,
} from '@/lib/socket';
import { MicVAD } from '@ricky0123/vad-web';

const VAD_ASSET_PATH = '/vad/';  // Silero VAD model files served from public/vad/
const VAD_WASM_PATH = '/vad/';   // ONNX Runtime Web WASM files served from public/vad/

/** 跨页面导航缓存服务端下发的 VAD 配置（socket 已连接时不会重发 vad-config） */
let lastVadConfig: VADConfig = DEFAULT_VAD_CONFIG;

/** ONNX Runtime / Worker 噪音（含 Turbopack 多线程 WASM 兼容性警告） */
const ONNX_RUNTIME_NOISE =
  /onnxruntime|CleanUnusedInitializers|worker sent an error|TURBOPACK__imported__module|ort-wasm-threaded/i;

/** 在 VAD 初始化期间临时屏蔽 ONNX Runtime 控制台噪音 */
async function suppressOnnxRuntimeNoise<T>(fn: () => Promise<T>): Promise<T> {
  const origError = console.error;
  const origWarn = console.warn;
  const filter = (original: typeof console.error, ...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    if (ONNX_RUNTIME_NOISE.test(msg)) return;
    original.apply(console, args);
  };
  console.error = (...args) => filter(origError, ...args);
  console.warn = (...args) => filter(origWarn, ...args);
  try {
    return await fn();
  } finally {
    console.error = origError;
    console.warn = origWarn;
  }
}

/** 配置 ONNX Runtime：单线程 WASM + 静默日志（避免 Next.js/Turbopack 下 Worker 报错） */
function configureOrtSilence(ort: {
  env: {
    logLevel: string;
    wasm: {
      numThreads?: number;
      proxy?: boolean;
      wasmPaths?: string | Record<string, string>;
    };
  };
  InferenceSession: { create: (model: unknown, options?: Record<string, unknown>) => Promise<unknown> };
}) {
  ort.env.logLevel = 'error';
  // numThreads=1：不创建 Worker，规避 Turbopack 在 blob Worker 中缺少 process polyfill 的问题
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  // 仅映射非 threaded 的 wasm 文件，防止 ORT 自动选用 ort-wasm-threaded
  ort.env.wasm.wasmPaths = {
    'ort-wasm.wasm': `${VAD_WASM_PATH}ort-wasm.wasm`,
    'ort-wasm-simd.wasm': `${VAD_WASM_PATH}ort-wasm-simd.wasm`,
  };
  const originalCreate = ort.InferenceSession.create.bind(ort.InferenceSession);
  ort.InferenceSession.create = (model, options) =>
    originalCreate(model, { ...options, logSeverityLevel: 3 });
}

/** 按当前音频模式获取 MediaStream */
async function acquireAudioStream(mode: AudioMode): Promise<MediaStream> {
  if (mode === 'mic') {
    return navigator.mediaDevices!.getUserMedia({ audio: true });
  }
  const stream = await navigator.mediaDevices!.getDisplayMedia({ video: true, audio: true });
  stream.getVideoTracks().forEach((vt) => {
    try { vt.stop(); stream.removeTrack(vt); } catch { /* ignore */ }
  });
  return stream;
}

/**
 * Robust audio recorder hook supporting:
 * - microphone (getUserMedia({ audio: true }))
 * - tab/system audio (getDisplayMedia({ video: true, audio: true }) -> stop video track)
 * - Silero VAD (browser-based, via @ricky0123/vad-web)
 *
 * VAD model is preloaded on page open (startOnLoad: false) so recording starts instantly.
 * Before recording: no mic access, no VAD detection, nothing sent to backend.
 * On start: getUserMedia + vad.start() + MediaRecorder in one user gesture.
 */
type DraftSyncHelpers = {
  ensureDraft?: () => Promise<string | null>;
  flushDraft?: () => Promise<void>;
};

export const useAudioRecorder = (draftSync?: DraftSyncHelpers) => {
  const { status, audioMode, setStatus, setError, clearTranscript, userId, setRecordingId } = useRecordingStore();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listenersAttachedRef = useRef(false);

  // VAD refs
  const vadRef = useRef<any>(null);
  const vadConfigRef = useRef<VADConfig>(DEFAULT_VAD_CONFIG);
  /** Stream supplied to MicVAD immediately before start()/resume */
  const vadPendingStreamRef = useRef<MediaStream | null>(null);
  /** Tracks which config was used to build the preloaded instance */
  const vadPreloadConfigKeyRef = useRef<string | null>(null);
  /** Incremented to ignore stale preload results */
  const vadPreloadGenRef = useRef(0);

  const [isResetting, setIsResetting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [vadLoading, setVadLoading] = useState(false);
  const [vadStatus, setVadStatus] = useState<'inactive' | 'loading' | 'ready' | 'error'>('inactive');
  const [vadError, setVadError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const meterAnalyserRef = useRef<AnalyserNode | null>(null);
  const meterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const meterDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const stopAudioMeter = useCallback(() => {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    meterSourceRef.current?.disconnect();
    meterSourceRef.current = null;
    meterAnalyserRef.current = null;
    meterDataRef.current = null;
    setAudioLevel(0);
  }, []);

  const startAudioMeter = useCallback((stream: MediaStream, audioContext: AudioContext) => {
    stopAudioMeter();

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    meterAnalyserRef.current = analyser;
    meterSourceRef.current = source;
    meterDataRef.current = data;
    audioContextRef.current = audioContext;

    const tick = () => {
      const node = meterAnalyserRef.current;
      const buf = meterDataRef.current;
      if (!node || !buf) return;

      node.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const sample = (buf[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / buf.length);
      const level = Math.min(1, rms * 2);
      setAudioLevel((prev) => prev * 0.35 + level * 0.65);
      meterRafRef.current = requestAnimationFrame(tick);
    };

    meterRafRef.current = requestAnimationFrame(tick);
  }, [stopAudioMeter]);

  const buildMicVADOptions = useCallback((config: VADConfig) => ({
    startOnLoad: false,
    baseAssetPath: VAD_ASSET_PATH,
    onnxWASMBasePath: VAD_WASM_PATH,
    ortConfig: configureOrtSilence,
    model: config.model,
    positiveSpeechThreshold: config.probThreshold,
    negativeSpeechThreshold: config.negativeThreshold,
    redemptionMs: config.redemptionMs,
    preSpeechPadMs: config.preSpeechPadMs,
    minSpeechMs: config.minSpeechMs,
    processorType: 'ScriptProcessor' as const,
    getStream: async () => {
      const s = vadPendingStreamRef.current;
      if (!s) throw new Error('[VAD] stream not set before start');
      return s;
    },
    // 仅断开 VAD 管线，不停止音轨（MediaRecorder 可能仍在使用同一 stream）
    pauseStream: async (_s: MediaStream) => { /* no-op */ },
    resumeStream: async (_oldStream: MediaStream) => {
      const s = vadPendingStreamRef.current;
      if (!s) throw new Error('[VAD] stream not set before resume');
      return s;
    },
    onSpeechStart: () => {
      console.log('[VAD] speech start');
    },
    onSpeechEnd: (audio: Float32Array) => {
      const seq = incrementSegmentSeq();
      emitSegmentEnd(seq, audio);
      console.log('[VAD] speech end, seq:', seq, 'duration:', (audio.length / 16000).toFixed(1) + 's');
    },
    onVADMisfire: () => {
      console.log('[VAD] misfire');
    },
  }), []);

  /** 释放 VAD：未 start 的预加载实例只能 release 模型，不能调 destroy() */
  const teardownVAD = useCallback(async (vad: {
    initializationState?: string;
    listening?: boolean;
    destroy: () => Promise<void>;
    model?: { release: () => Promise<void> };
  }) => {
    if (vad.initializationState === 'destroyed') return;

    const started = vad.initializationState === 'initialized' || vad.listening;
    if (started) {
      await vad.destroy();
      return;
    }

    await vad.model?.release();
    vad.initializationState = 'destroyed';
  }, []);

  const destroyVAD = useCallback(async () => {
    const vad = vadRef.current;
    if (!vad) return;

    vadRef.current = null;
    vadPreloadConfigKeyRef.current = null;

    try {
      await teardownVAD(vad);
    } catch (err) {
      console.error('[VAD] destroy error:', err);
    }
  }, [teardownVAD]);

  /** Preload ONNX model on page open — no mic, no detection, no backend traffic */
  const preloadVAD = useCallback(async (retryCount = 0) => {
    const config = vadConfigRef.current;
    const configKey = JSON.stringify(config);

    if (vadRef.current && vadPreloadConfigKeyRef.current === configKey) {
      setVadStatus('ready');
      return;
    }

    const gen = ++vadPreloadGenRef.current;

    if (vadRef.current) {
      await destroyVAD();
      if (gen !== vadPreloadGenRef.current) return;
    }

    setVadLoading(true);
    setVadStatus('loading');
    setVadError(null);

    try {
      const vad = await suppressOnnxRuntimeNoise(() =>
        (MicVAD.new as any)(buildMicVADOptions(config))
      ) as any;

      if (gen !== vadPreloadGenRef.current) {
        await teardownVAD(vad);
        return;
      }

      vadRef.current = vad;
      vadPreloadConfigKeyRef.current = configKey;
      setVadStatus('ready');
      setVadError(null);
      console.log('[VAD] model preloaded (idle, waiting for recording)');
    } catch (err) {
      if (gen !== vadPreloadGenRef.current) return;

      const msg = (err as Error)?.message || String(err);
      if (retryCount < 1 && (msg.includes('aborted') || msg.includes('timeout') || msg.includes('network') || msg.includes('fetch'))) {
        console.log('[VAD] preload failed, retrying after 2s:', msg);
        await new Promise((r) => setTimeout(r, 2000));
        return preloadVAD(retryCount + 1);
      }

      console.error('[VAD] preload failed:', msg);
      setVadError(msg);
      setVadStatus('error');
    } finally {
      if (gen === vadPreloadGenRef.current) {
        setVadLoading(false);
      }
    }
  }, [buildMicVADOptions, destroyVAD, teardownVAD]);

  /** Pause VAD listening but keep the loaded model in memory */
  const pauseVAD = useCallback(async () => {
    try {
      if (vadRef.current?.listening) {
        await vadRef.current.pause();
      }
    } catch (err) {
      console.error('[VAD] pause error:', err);
    }
  }, []);

  /** Attach mic stream and start VAD detection (must run inside user gesture) */
  const startVAD = useCallback(async (stream: MediaStream, audioContext: AudioContext) => {
    if (!vadRef.current || vadStatus === 'error') return;

    vadPendingStreamRef.current = stream;

    if (vadRef.current.initializationState === 'uninitialized') {
      vadRef.current.options.audioContext = audioContext;
    }

    await vadRef.current.start();
    console.log('[VAD] detection started');
  }, [vadStatus]);

  const initSocket = useCallback(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const onConnect = () => {
      console.log('[Socket] connected');
      setIsConnecting(false);
      setIsReady(true);
    };

    const onDisconnect = () => {
      console.log('[Socket] disconnected');
      setIsReady(false);
    };

    const onConnectError = (err: any) => {
      console.error('[Socket] connect_error', err);
      setIsReady(false);
      setIsConnecting(false);
    };

    const onDeepgramReady = () => {
      console.log('[Socket] deepgram-ready');
      setIsReady(true);
      setIsConnecting(false);
    };

    const onVADConfig = (config: VADConfig) => {
      console.log('[Socket] vad-config received:', config);
      lastVadConfig = config;
      vadConfigRef.current = config;
      void preloadVAD();
    };

    if (!listenersAttachedRef.current) {
      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('connect_error', onConnectError);
      socket.on('deepgram-ready', onDeepgramReady);
      socket.on('vad-config', onVADConfig);
      listenersAttachedRef.current = true;
    }

    if (socket.connected) {
      setIsReady(true);
      setIsConnecting(false);
      vadConfigRef.current = lastVadConfig;
      if (!vadRef.current) {
        void preloadVAD();
      } else {
        setVadStatus('ready');
      }
      return;
    }

    setIsConnecting(true);
    socket.connect();
  }, [preloadVAD]);

  useEffect(() => {
    initSocket();

    return () => {
      try {
        vadPreloadGenRef.current += 1;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        stopAudioMeter();
        void destroyVAD();
        if (socketRef.current) {
          socketRef.current.off('connect');
          socketRef.current.off('disconnect');
          socketRef.current.off('connect_error');
          socketRef.current.off('deepgram-ready');
          socketRef.current.off('vad-config');
          listenersAttachedRef.current = false;
        }
      } catch (err) {
        console.error('[useAudioRecorder] cleanup error', err);
      }
    };
  }, [initSocket, destroyVAD, stopAudioMeter]);

  const startRecording = useCallback(async () => {
    if (isResetting) {
      console.warn('[useAudioRecorder] start prevented - resetting in progress');
      return;
    }
    if (!isReady) {
      console.warn('[useAudioRecorder] start prevented - socket not ready');
      setError?.('Still connecting — please wait until connection is ready.');
      return;
    }
    if (vadLoading || vadStatus === 'loading') {
      setError?.('VAD 模型仍在加载，请稍候...');
      return;
    }

    if (!vadRef.current && vadStatus !== 'error') {
      vadConfigRef.current = lastVadConfig;
      await preloadVAD();
    }

    if (!vadRef.current && vadStatus !== 'error') {
      setError?.('VAD 尚未就绪，请稍候后重试');
      return;
    }

    try {
      setError?.(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError?.('您的浏览器不支持录音功能，请使用最新版 Chrome 或 Edge，并通过 HTTPS 访问。');
        setStatus('idle');
        return;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      await pauseVAD();

      resetSegmentSeq();
      resetSegmentDisplay();

      const newRecordingId = crypto.randomUUID();
      setRecordingId(newRecordingId);
      if (userId) {
        emitStartRecording(newRecordingId, userId);
      }
      await draftSync?.ensureDraft?.();

      const stream = await acquireAudioStream(audioMode);
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        try {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data);
            emitAudioChunk(event.data);
          }
        } catch (err) {
          console.error('[useAudioRecorder] ondataavailable error', err);
        }
      };

      mediaRecorder.onerror = (ev) => {
        console.error('[useAudioRecorder] mediaRecorder error', ev);
        setError?.('Recording error occurred');
        setStatus('idle');
      };

      mediaRecorder.onstop = () => {
        setStatus('processing');
        setTimeout(() => {
          setStatus('idle');
          chunksRef.current = [];
        }, 500);
      };

      if (!socketRef.current) initSocket();
      if (socketRef.current && !socketRef.current.connected) socketRef.current.connect();

      // Start VAD + recording together (model already preloaded)
      await startVAD(stream, audioContext);

      mediaRecorder.start(1000);
      startAudioMeter(stream, audioContext);
      setStatus('recording');
    } catch (err) {
      console.error('[useAudioRecorder] startRecording error', err);
      setStatus('idle');
      setError?.('Failed to start recording: ' + (err as Error).message);
    }
  }, [audioMode, initSocket, isReady, isResetting, setError, setStatus, userId, setRecordingId, pauseVAD, startVAD, startAudioMeter, vadLoading, vadStatus, draftSync, preloadVAD]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      try {
        mediaRecorderRef.current.pause();
        void pauseVAD();
        stopAudioMeter();
        void draftSync?.flushDraft?.();
        setStatus('paused');
      } catch (err) {
        console.error('[useAudioRecorder] pause error', err);
      }
    }
  }, [setStatus, pauseVAD, stopAudioMeter, draftSync]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      try {
        mediaRecorderRef.current.resume();
        if (vadRef.current && streamRef.current) {
          vadPendingStreamRef.current = streamRef.current;
          void vadRef.current.start();
        }
        if (streamRef.current && audioContextRef.current) {
          startAudioMeter(streamRef.current, audioContextRef.current);
        }
        setStatus('recording');
      } catch (err) {
        console.error('[useAudioRecorder] resume error', err);
      }
    }
  }, [setStatus, startAudioMeter]);

  const stopRecording = useCallback(() => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      vadPendingStreamRef.current = null;
      audioContextRef.current = null;

      stopAudioMeter();
      void pauseVAD();
      void draftSync?.flushDraft?.();
      // Keep preloaded model in memory for next recording
      if (vadRef.current) {
        setVadStatus('ready');
      }

      setTimeout(() => {
        emitStopRecording();
      }, 200);
    } catch (err) {
      console.error('[useAudioRecorder] stopRecording error', err);
      setStatus('idle');
    }
  }, [pauseVAD, stopAudioMeter, draftSync]);

  const resetRecording = useCallback(() => {
    setIsResetting(true);

    const cleanup = () => {
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.stop();
        }
      } catch { /* ignore */ }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      vadPendingStreamRef.current = null;
      audioContextRef.current = null;

      stopAudioMeter();
      void pauseVAD();
      if (vadRef.current) {
        setVadStatus('ready');
      }

      resetSegmentSeq();
      resetSegmentDisplay();
      mediaRecorderRef.current = null;
      chunksRef.current = [];
      setStatus('idle');
      clearTranscript?.();
      setRecordingId?.(null);
      setIsResetting(false);
    };

    cleanup();
  }, [setStatus, clearTranscript, setRecordingId, pauseVAD, stopAudioMeter]);

  return {
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    isRecording: status === 'recording',
    isPaused: status === 'paused',
    isProcessing: status === 'processing',
    isResetting,
    isReady,
    isConnecting,
    vadLoading,
    vadStatus,
    vadError,
    audioLevel,
  };
};
