// /hooks/use-audio-recorder.ts
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRecordingStore, AudioMode } from '@/lib/store';
import {
  getSocket, connectSocket, ensureSocketConnected, emitAudioChunk, emitAudioChunkBuffer, emitStopRecording, emitStartRecording,
  emitRecordingInterrupted, emitRecordingRecovered, emitRecordingStale,
  incrementSegmentSeq, emitSegmentEnd, resetSegmentSeq, resetSegmentDisplay,
  DEFAULT_VAD_CONFIG, type VADConfig,
} from '@/lib/socket';
import { MicVAD } from '@ricky0123/vad-web';
import { buildAudioPipeline, preloadRnnoiseWorklet, type AudioPipeline } from '@/lib/audio-pipeline';
import {
  acquireScreenWake,
  releaseScreenWake,
  reacquireScreenWakeIfNeeded,
} from '@/lib/screen-wake';
import {
  getPreferredCaptureMode,
  isNativeCaptureAvailable,
  nativeRecoverRecording,
  nativeStartRecording,
  nativeStopRecording,
  nativeSyncAudioEnhancement,
  subscribeNativeRecording,
  type CaptureMode,
  type NativeLevelPayload,
} from '@/lib/native-recording';
import { useAppConfig } from '@/hooks/use-app-config';

const VAD_ASSET_PATH = '/vad/';
const VAD_WASM_PATH = '/vad/';

/** 音量超过此阈值视为「可能有语音」 */
const SPEECH_LEVEL_THRESHOLD = 0.06;
/** 累计约 7s 有语音电平却无任何 VAD 分段 → 转写管线异常 */
const SPEECH_MS_WITHOUT_SEGMENT = 7000;
/** 录音中健康巡检间隔 */
const HEALTH_POLL_MS = 3000;
/** 轻量自动恢复失败后，才弹窗要求用户介入 */
const MAX_LIGHTWEIGHT_RECOVER_ATTEMPTS = 2;
/** 原生持麦：超过此时间未收到分片视为异常 */
const NATIVE_CHUNK_STALL_MS = 15000;

let lastVadConfig: VADConfig = DEFAULT_VAD_CONFIG;

const ONNX_RUNTIME_NOISE =
  /onnxruntime|CleanUnusedInitializers|worker sent an error|TURBOPACK__imported__module|ort-wasm-threaded/i;

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
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = {
    'ort-wasm.wasm': `${VAD_WASM_PATH}ort-wasm.wasm`,
    'ort-wasm-simd.wasm': `${VAD_WASM_PATH}ort-wasm-simd.wasm`,
  };
  const originalCreate = ort.InferenceSession.create.bind(ort.InferenceSession);
  ort.InferenceSession.create = (model, options) =>
    originalCreate(model, { ...options, logSeverityLevel: 3 });
}

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

type DraftSyncHelpers = {
  ensureDraft?: (recordingIdOverride?: string) => Promise<string | null>;
  flushDraft?: () => Promise<void>;
};

export const useAudioRecorder = (draftSync?: DraftSyncHelpers) => {
  const { nativeChunkMode, nativeChunkSeconds, nativeVad } = useAppConfig();
  const {
    status,
    audioMode,
    audioGain,
    autoGainEnabled,
    noiseSuppressionEnabled,
    setStatus,
    setError,
    setAudioGainLive,
    clearTranscript,
    userId,
    recordingId,
    setRecordingId,
    setRecordingInterrupted,
    setTranscriptionWarning,
    setLastSegmentAgeSec,
  } = useRecordingStore();

  const statusRef = useRef(status);
  statusRef.current = status;
  const draftSyncRef = useRef(draftSync);
  draftSyncRef.current = draftSync;
  const recordingIdRef = useRef(recordingId);
  const userIdRef = useRef(userId);
  recordingIdRef.current = recordingId;
  userIdRef.current = userId;

  const audioGainRef = useRef(audioGain);
  const autoGainRef = useRef(autoGainEnabled);
  const noiseSuppressionRef = useRef(noiseSuppressionEnabled);
  /** 原生电平上报触发的增益更新，避免回写壳内 manualGain */
  const nativeGainEchoRef = useRef(false);
  audioGainRef.current = audioGain;
  autoGainRef.current = autoGainEnabled;
  noiseSuppressionRef.current = noiseSuppressionEnabled;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pipelineRef = useRef<AudioPipeline | null>(null);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listenersAttachedRef = useRef(false);
  const streamMonitorCleanupRef = useRef<(() => void) | null>(null);
  const interruptionHandledRef = useRef(false);
  const lastSegmentAtRef = useRef<number | null>(null);
  const speechAccumMsRef = useRef(0);
  const audioLevelRef = useRef(0);
  const lightweightRecoverAttemptsRef = useRef(0);
  const healthPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureModeRef = useRef<CaptureMode>(getPreferredCaptureMode());
  const nativeUnsubRef = useRef<(() => void) | null>(null);
  const lastNativeChunkAtRef = useRef<number | null>(null);

  const vadRef = useRef<any>(null);
  const vadConfigRef = useRef<VADConfig>(DEFAULT_VAD_CONFIG);
  const vadPendingStreamRef = useRef<MediaStream | null>(null);
  const vadPreloadConfigKeyRef = useRef<string | null>(null);
  const vadPreloadGenRef = useRef(0);

  const [isResetting, setIsResetting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [vadLoading, setVadLoading] = useState(false);
  const [vadStatus, setVadStatus] = useState<'inactive' | 'loading' | 'ready' | 'error'>('inactive');
  const [vadError, setVadError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [rnnoiseReady, setRnnoiseReady] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [nativeAudioStatus, setNativeAudioStatus] = useState<NativeLevelPayload | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const meterAnalyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const meterDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const stopAudioMeter = useCallback(() => {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    meterAnalyserRef.current = null;
    meterDataRef.current = null;
    setAudioLevel(0);
  }, []);

  const startAudioMeter = useCallback((analyser: AnalyserNode) => {
    stopAudioMeter();

    const data = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    meterAnalyserRef.current = analyser;
    meterDataRef.current = data;

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
      audioLevelRef.current = level;
      setAudioLevel((prev) => prev * 0.35 + level * 0.65);

      if (statusRef.current === 'recording') {
        if (level >= SPEECH_LEVEL_THRESHOLD) {
          speechAccumMsRef.current += 16;
        } else {
          speechAccumMsRef.current = Math.max(0, speechAccumMsRef.current - 24);
        }
      }

      meterRafRef.current = requestAnimationFrame(tick);
    };

    meterRafRef.current = requestAnimationFrame(tick);
  }, [stopAudioMeter]);

  const destroyPipeline = useCallback(() => {
    pipelineRef.current?.destroy();
    pipelineRef.current = null;
  }, []);

  const stopRawStream = useCallback(() => {
    if (rawStreamRef.current) {
      rawStreamRef.current.getTracks().forEach((t) => t.stop());
      rawStreamRef.current = null;
    }
    streamRef.current = null;
  }, []);

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
      lastSegmentAtRef.current = Date.now();
      speechAccumMsRef.current = 0;
      lightweightRecoverAttemptsRef.current = 0;
      setTranscriptionWarning(null);
      console.log('[VAD] speech end, seq:', seq, 'duration:', (audio.length / 16000).toFixed(1) + 's');
    },
    onVADMisfire: () => {
      console.log('[VAD] misfire');
    },
  }), [setTranscriptionWarning]);

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

  const preloadVAD = useCallback(async (retryCount = 0) => {
    if (isNativeCaptureAvailable()) {
      setVadLoading(false);
      setVadStatus('inactive');
      return;
    }

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

  const pauseVAD = useCallback(async () => {
    try {
      if (vadRef.current?.listening) {
        await vadRef.current.pause();
      }
    } catch (err) {
      console.error('[VAD] pause error:', err);
    }
  }, []);

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

    const onConnectError = (err: { message?: string }) => {
      console.error('[Socket] connect_error', err);
      setIsReady(false);
      setIsConnecting(false);
      if (err?.message === 'Unauthorized') {
        setError?.('Socket 认证失败，请重新登录');
      }
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
      if (!isNativeCaptureAvailable()) {
        void preloadVAD();
      }
    };

    if (!listenersAttachedRef.current) {
      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('connect_error', onConnectError);
      socket.on('deepgram-ready', onDeepgramReady);
      socket.on('vad-config', onVADConfig);
      listenersAttachedRef.current = true;
    }

    if (!isNativeCaptureAvailable()) {
      void preloadRnnoiseWorklet().then((ok) => {
        setRnnoiseReady(ok);
        if (ok) console.log('[RNNoise] worklet preloaded');
      });
    }

    if (socket.connected) {
      setIsReady(true);
      setIsConnecting(false);
      vadConfigRef.current = lastVadConfig;
      if (isNativeCaptureAvailable()) {
        setVadLoading(false);
        setVadStatus('inactive');
      } else if (!vadRef.current) {
        void preloadVAD();
      } else {
        setVadStatus('ready');
      }
      return;
    }

    setIsConnecting(true);
    if (!connectSocket()) {
      setIsConnecting(false);
      setIsReady(false);
      setError?.('未登录，无法连接转录服务');
    }
  }, [preloadVAD, setError]);

  // 录音中同步自动增益开关
  useEffect(() => {
    if (status !== 'recording') return;
    if (captureModeRef.current === 'native') {
      nativeSyncAudioEnhancement({
        audioGain: audioGainRef.current,
        autoGainEnabled: autoGainRef.current,
        noiseSuppressionEnabled: noiseSuppressionRef.current,
      });
      return;
    }
    if (!pipelineRef.current) return;
    pipelineRef.current.setAutoGain(autoGainEnabled);
  }, [autoGainEnabled, status]);

  // 录音中同步手动增益
  useEffect(() => {
    if (status !== 'recording') return;
    if (captureModeRef.current === 'native') {
      if (nativeGainEchoRef.current) {
        nativeGainEchoRef.current = false;
        return;
      }
      nativeSyncAudioEnhancement({
        audioGain: audioGainRef.current,
        autoGainEnabled: autoGainRef.current,
        noiseSuppressionEnabled: noiseSuppressionRef.current,
      });
      return;
    }
    if (!pipelineRef.current || autoGainEnabled) return;
    pipelineRef.current.setManualGain(audioGain);
  }, [audioGain, autoGainEnabled, status]);

  // 录音中同步降噪（原生持麦）
  useEffect(() => {
    if (status !== 'recording' || captureModeRef.current !== 'native') return;
    nativeSyncAudioEnhancement({
      audioGain: audioGainRef.current,
      autoGainEnabled: autoGainRef.current,
      noiseSuppressionEnabled: noiseSuppressionRef.current,
    });
  }, [noiseSuppressionEnabled, status]);

  const isCapturePipelineHealthy = useCallback((): boolean => {
    const raw = rawStreamRef.current;
    const recorder = mediaRecorderRef.current;
    if (!raw || !recorder) return false;

    const audioTracks = raw.getAudioTracks();
    if (audioTracks.length === 0) return false;
    if (audioTracks.some((t) => t.readyState === 'ended' || t.muted)) return false;
    if (recorder.state !== 'recording') return false;

    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed' || ctx.state === 'suspended') return false;

    return true;
  }, []);

  const isTranscriptionPipelineHealthy = useCallback((): boolean => {
    const vad = vadRef.current;
    if (!vad || vadStatus === 'error') return true;
    if (!vad.listening) return false;
    if (speechAccumMsRef.current >= SPEECH_MS_WITHOUT_SEGMENT) return false;
    return true;
  }, [vadStatus]);

  const isNativePipelineHealthy = useCallback((): boolean => {
    const last = lastNativeChunkAtRef.current;
    if (!last) return true;
    return Date.now() - last < NATIVE_CHUNK_STALL_MS;
  }, []);

  const isPipelineHealthy = useCallback((): boolean => {
    if (captureModeRef.current === 'native') {
      return isNativePipelineHealthy();
    }
    return isCapturePipelineHealthy() && isTranscriptionPipelineHealthy();
  }, [isCapturePipelineHealthy, isTranscriptionPipelineHealthy, isNativePipelineHealthy]);

  const teardownNativeRecording = useCallback(() => {
    nativeUnsubRef.current?.();
    nativeUnsubRef.current = null;
    lastNativeChunkAtRef.current = null;
    setNativeAudioStatus(null);
  }, []);

  const ensureAudioContextRunning = useCallback(async (): Promise<boolean> => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed') return false;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        console.error('[useAudioRecorder] AudioContext resume failed', err);
        return false;
      }
    }
    return ctx.state === 'running';
  }, []);

  const restartVADListening = useCallback(async (): Promise<boolean> => {
    const vad = vadRef.current;
    const stream = streamRef.current;
    const ctx = audioContextRef.current;
    if (!vad || !stream || !ctx || vadStatus === 'error') return false;

    try {
      if (vad.listening) {
        await vad.pause();
      }
      vadPendingStreamRef.current = stream;
      if (vad.initializationState === 'uninitialized') {
        vad.options.audioContext = ctx;
      }
      await vad.start();
      console.log('[useAudioRecorder] VAD restarted');
      return Boolean(vad.listening);
    } catch (err) {
      console.error('[useAudioRecorder] VAD restart failed', err);
      return false;
    }
  }, [vadStatus]);

  const detachStreamMonitor = useCallback(() => {
    streamMonitorCleanupRef.current?.();
    streamMonitorCleanupRef.current = null;
  }, []);

  const handleSystemInterruption = useCallback((reason: string) => {
    if (statusRef.current !== 'recording') return;
    if (interruptionHandledRef.current) return;
    interruptionHandledRef.current = true;

    console.warn('[useAudioRecorder] system interruption:', reason);

    try {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.pause();
      }
    } catch {
      /* ignore */
    }

    void pauseVAD();
    stopAudioMeter();
    void draftSyncRef.current?.flushDraft?.();
    setRecordingInterrupted(true);
    setTranscriptionWarning(null);
    setStatus('paused');

    const rid = recordingIdRef.current;
    const uid = userIdRef.current;
    if (rid && uid) {
      emitRecordingInterrupted(rid, uid, reason);
    }
  }, [pauseVAD, stopAudioMeter, setRecordingInterrupted, setTranscriptionWarning, setStatus]);

  const setupNativeRecording = useCallback(() => {
    teardownNativeRecording();
    lastNativeChunkAtRef.current = Date.now();

    nativeUnsubRef.current = subscribeNativeRecording(
      (buf) => {
        lastNativeChunkAtRef.current = Date.now();
        lastSegmentAtRef.current = Date.now();
        emitAudioChunkBuffer(buf);
      },
      (state, reason) => {
        if (state === 'error') {
          handleSystemInterruption(reason || 'native-error');
          return;
        }
        if (state === 'recording' && reason === 'recovered') {
          interruptionHandledRef.current = false;
          setRecordingInterrupted(false);
          setStatus('recording');
          lastNativeChunkAtRef.current = Date.now();
          const rid = recordingIdRef.current;
          const uid = userIdRef.current;
          if (rid && uid) {
            emitRecordingRecovered(rid, uid);
          }
        }
      },
      (payload) => {
        lastNativeChunkAtRef.current = Date.now();
        audioLevelRef.current = payload.level;
        setAudioLevel((prev) => prev * 0.35 + payload.level * 0.65);
        if (typeof payload.gain === 'number') {
          const prev = audioGainRef.current;
          if (Math.abs(payload.gain - prev) >= 0.01) {
            nativeGainEchoRef.current = true;
            setAudioGainLive(payload.gain);
          }
        }
        setNativeAudioStatus(payload);
      }
    );
  }, [teardownNativeRecording, handleSystemInterruption, setRecordingInterrupted, setStatus, setAudioGainLive]);

  const tryLightweightRecover = useCallback(async (): Promise<boolean> => {
    console.warn('[useAudioRecorder] attempting lightweight transcription recover');
    setTranscriptionWarning('检测到语音但未产生转写，正在尝试自动恢复…');

    const ctxOk = await ensureAudioContextRunning();
    const vadOk = await restartVADListening();

    if (ctxOk && vadOk) {
      speechAccumMsRef.current = 0;
      lightweightRecoverAttemptsRef.current += 1;
      setTranscriptionWarning(null);

      const rid = recordingIdRef.current;
      const uid = userIdRef.current;
      if (rid && uid) {
        emitRecordingRecovered(rid, uid);
      }
      return true;
    }
    return false;
  }, [ensureAudioContextRunning, restartVADListening, setTranscriptionWarning]);

  const handleTranscriptionStall = useCallback(async () => {
    if (statusRef.current !== 'recording' || interruptionHandledRef.current) return;

    if (lightweightRecoverAttemptsRef.current < MAX_LIGHTWEIGHT_RECOVER_ATTEMPTS) {
      const ok = await tryLightweightRecover();
      if (ok) return;
    }

    const rid = recordingIdRef.current;
    const uid = userIdRef.current;
    if (rid && uid) {
      emitRecordingStale(rid, uid, 'transcription-stall', {
        speechAccumMs: speechAccumMsRef.current,
        vadListening: Boolean(vadRef.current?.listening),
        audioContextState: audioContextRef.current?.state,
        recoverAttempts: lightweightRecoverAttemptsRef.current,
      });
    }

    handleSystemInterruption('transcription-stall');
  }, [tryLightweightRecover, handleSystemInterruption]);

  const refreshSegmentAge = useCallback(() => {
    if (statusRef.current !== 'recording' || !lastSegmentAtRef.current) {
      setLastSegmentAgeSec(null);
      return;
    }
    const age = Math.floor((Date.now() - lastSegmentAtRef.current) / 1000);
    setLastSegmentAgeSec(age);
  }, [setLastSegmentAgeSec]);

  const runPipelineHealthCheck = useCallback(async () => {
    if (statusRef.current !== 'recording') return;

    refreshSegmentAge();

    if (captureModeRef.current === 'native') {
      if (!isNativePipelineHealthy()) {
        handleSystemInterruption('native-chunk-stall');
      }
      return;
    }

    if (!isCapturePipelineHealthy()) {
      handleSystemInterruption('capture-unhealthy');
      return;
    }

    await ensureAudioContextRunning();

    if (vadRef.current && !vadRef.current.listening && vadStatus !== 'error') {
      console.warn('[useAudioRecorder] VAD not listening during recording');
      const ok = await restartVADListening();
      if (!ok) {
        await handleTranscriptionStall();
        return;
      }
    }

    if (speechAccumMsRef.current >= SPEECH_MS_WITHOUT_SEGMENT) {
      await handleTranscriptionStall();
      return;
    }

    if (speechAccumMsRef.current >= SPEECH_MS_WITHOUT_SEGMENT * 0.45) {
      setTranscriptionWarning('检测到语音活动，但尚未产生新的转写…');
    } else if (!interruptionHandledRef.current) {
      setTranscriptionWarning(null);
    }
  }, [
    refreshSegmentAge,
    isNativePipelineHealthy,
    isCapturePipelineHealthy,
    ensureAudioContextRunning,
    restartVADListening,
    handleTranscriptionStall,
    handleSystemInterruption,
    vadStatus,
    setTranscriptionWarning,
  ]);

  const attachStreamMonitor = useCallback((stream: MediaStream) => {
    const cleanups: Array<() => void> = [];

    for (const track of stream.getAudioTracks()) {
      const onEnded = () => handleSystemInterruption('track-ended');
      const onMute = () => {
        if (track.muted) handleSystemInterruption('track-muted');
      };
      track.addEventListener('ended', onEnded);
      track.addEventListener('mute', onMute);
      cleanups.push(() => {
        track.removeEventListener('ended', onEnded);
        track.removeEventListener('mute', onMute);
      });
    }

    const prevCleanup = streamMonitorCleanupRef.current;
    streamMonitorCleanupRef.current = () => {
      prevCleanup?.();
      cleanups.forEach((fn) => fn());
    };
  }, [handleSystemInterruption]);

  const wireMediaRecorder = useCallback((mediaRecorder: MediaRecorder) => {
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
      handleSystemInterruption('media-recorder-error');
    };

    mediaRecorder.onstop = () => {
      setStatus('processing');
      setTimeout(() => {
        setStatus('idle');
        chunksRef.current = [];
      }, 500);
    };
  }, [handleSystemInterruption, setStatus]);

  const stopMediaRecorderQuietly = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      mediaRecorderRef.current = null;
      return;
    }
    recorder.onstop = null;
    try {
      recorder.stop();
    } catch {
      /* ignore */
    }
    mediaRecorderRef.current = null;
  }, []);

  const teardownCapturePipeline = useCallback(async () => {
    detachStreamMonitor();
    stopMediaRecorderQuietly();
    destroyPipeline();
    stopRawStream();
    vadPendingStreamRef.current = null;
    await pauseVAD();
  }, [detachStreamMonitor, stopMediaRecorderQuietly, destroyPipeline, stopRawStream, pauseVAD]);

  const setupCapturePipeline = useCallback(async () => {
    const rawStream = await acquireAudioStream(audioMode);
    rawStreamRef.current = rawStream;
    attachStreamMonitor(rawStream);

    let audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContext();
      audioContextRef.current = audioContext;
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const pipeline = await buildAudioPipeline({
      rawStream,
      audioContext,
      gain: audioGainRef.current,
      autoGain: autoGainRef.current,
      noiseSuppression: noiseSuppressionRef.current,
      onGainChange: (gain) => setAudioGainLive(gain),
    });
    pipelineRef.current = pipeline;

    const processedStream = pipeline.processedStream;
    streamRef.current = processedStream;
    attachStreamMonitor(processedStream);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';

    const mediaRecorder = new MediaRecorder(processedStream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = mediaRecorder;
    wireMediaRecorder(mediaRecorder);

    await startVAD(processedStream, audioContext);
    mediaRecorder.start(1000);
    startAudioMeter(pipeline.outputAnalyser);
  }, [
    audioMode,
    attachStreamMonitor,
    wireMediaRecorder,
    startVAD,
    startAudioMeter,
    setAudioGainLive,
  ]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;

      void reacquireScreenWakeIfNeeded(statusRef.current === 'recording');

      if (statusRef.current === 'recording') {
        void ensureAudioContextRunning().then(() => runPipelineHealthCheck());
      }

      if (statusRef.current === 'recording' && !isPipelineHealthy()) {
        handleSystemInterruption('visibility-return');
      }
    };

    const handleDeviceChange = () => {
      if (statusRef.current === 'recording') {
        void runPipelineHealthCheck();
      }
      if (statusRef.current === 'recording' && !isPipelineHealthy()) {
        handleSystemInterruption('devicechange');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [
    handleSystemInterruption,
    isPipelineHealthy,
    ensureAudioContextRunning,
    runPipelineHealthCheck,
  ]);

  useEffect(() => {
    if (status !== 'recording') {
      if (healthPollRef.current) {
        clearInterval(healthPollRef.current);
        healthPollRef.current = null;
      }
      if (status === 'idle') {
        setTranscriptionWarning(null);
        setLastSegmentAgeSec(null);
      }
      return;
    }

    void runPipelineHealthCheck();
    healthPollRef.current = setInterval(() => {
      void runPipelineHealthCheck();
    }, HEALTH_POLL_MS);

    return () => {
      if (healthPollRef.current) {
        clearInterval(healthPollRef.current);
        healthPollRef.current = null;
      }
    };
  }, [status, runPipelineHealthCheck, setTranscriptionWarning, setLastSegmentAgeSec]);

  const recoverRecording = useCallback(async () => {
    if (!isReady) {
      setError?.('转录服务未连接，请稍候后重试');
      return;
    }

    if (captureModeRef.current === 'native' || isNativeCaptureAvailable()) {
      setIsRecovering(true);
      try {
        setError?.(null);
        interruptionHandledRef.current = false;
        nativeRecoverRecording();
        setRecordingInterrupted(false);
        lastNativeChunkAtRef.current = Date.now();
        lastSegmentAtRef.current = Date.now();
        setStatus('recording');
        const rid = recordingIdRef.current;
        const uid = userIdRef.current;
        if (rid && uid) {
          emitRecordingRecovered(rid, uid);
        }
      } catch (err) {
        console.error('[useAudioRecorder] native recoverRecording error', err);
        setError?.('无法恢复录音：' + (err as Error).message);
        setRecordingInterrupted(true);
        setStatus('paused');
      } finally {
        setIsRecovering(false);
      }
      return;
    }

    if (vadLoading || vadStatus === 'loading') {
      setError?.('VAD 模型仍在加载，请稍候...');
      return;
    }
    if (!vadRef.current && vadStatus !== 'error') {
      setError?.('VAD 尚未就绪，请稍候后重试');
      return;
    }

    setIsRecovering(true);
    try {
      setError?.(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError?.('您的浏览器不支持录音功能');
        return;
      }

      await teardownCapturePipeline();
      interruptionHandledRef.current = false;

      if (!socketRef.current) initSocket();
      if (socketRef.current && !socketRef.current.connected) {
        if (!connectSocket()) {
          setError?.('未登录，无法恢复录音');
          return;
        }
      }

      await setupCapturePipeline();
      void acquireScreenWake();
      setRecordingInterrupted(false);
      lastSegmentAtRef.current = Date.now();
      speechAccumMsRef.current = 0;
      lightweightRecoverAttemptsRef.current = 0;
      setTranscriptionWarning(null);
      setStatus('recording');

      const rid = recordingIdRef.current;
      const uid = userIdRef.current;
      if (rid && uid) {
        emitRecordingRecovered(rid, uid);
      }
    } catch (err) {
      console.error('[useAudioRecorder] recoverRecording error', err);
      const message = (err as Error).message;
      setError?.('无法恢复录音：' + message);
      setRecordingInterrupted(true);
      setStatus('paused');

      const rid = recordingIdRef.current;
      const uid = userIdRef.current;
      if (rid && uid) {
        emitRecordingRecovered(rid, uid, message);
      }
    } finally {
      setIsRecovering(false);
    }
  }, [
    isReady,
    vadLoading,
    vadStatus,
    teardownCapturePipeline,
    setupCapturePipeline,
    initSocket,
    setError,
    setRecordingInterrupted,
    setStatus,
  ]);

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

    const useNative = isNativeCaptureAvailable();
    captureModeRef.current = useNative ? 'native' : 'web';

    if (!useNative) {
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
    }

    try {
      setError?.(null);
      interruptionHandledRef.current = false;
      setRecordingInterrupted(false);
      lastSegmentAtRef.current = Date.now();
      speechAccumMsRef.current = 0;
      lightweightRecoverAttemptsRef.current = 0;
      setTranscriptionWarning(null);
      setLastSegmentAgeSec(null);

      if (!useNative && !navigator.mediaDevices?.getUserMedia) {
        setError?.('您的浏览器不支持录音功能，请使用最新版 Chrome 或 Edge，并通过 HTTPS 访问。');
        setStatus('idle');
        return;
      }

      await teardownCapturePipeline();
      teardownNativeRecording();
      chunksRef.current = [];

      resetSegmentSeq();
      resetSegmentDisplay();

      const newRecordingId = crypto.randomUUID();
      setRecordingId(newRecordingId);
      recordingIdRef.current = newRecordingId;
      await draftSync?.ensureDraft?.(newRecordingId);

      if (!socketRef.current) initSocket();
      const socketOk = await ensureSocketConnected();
      if (!socketOk) {
        setError?.('未登录或转录服务未连接，无法开始录音');
        setStatus('idle');
        return;
      }

      if (userId) {
        emitStartRecording(newRecordingId, userId, useNative ? 'native' : 'web');
      } else {
        setError?.('用户信息未加载，请刷新页面后重试');
        setStatus('idle');
        return;
      }

      if (useNative) {
        setupNativeRecording();
        nativeStartRecording(
          newRecordingId,
          {
            audioGain: audioGainRef.current,
            autoGainEnabled: autoGainRef.current,
            noiseSuppressionEnabled: noiseSuppressionRef.current,
          },
          {
            mode: nativeChunkMode,
            chunkSeconds: nativeChunkSeconds,
            vad: nativeVad,
          }
        );
        void acquireScreenWake();
        setStatus('recording');
        console.log('[useAudioRecorder] started native capture');
        return;
      }

      await setupCapturePipeline();
      void acquireScreenWake();
      setStatus('recording');
    } catch (err) {
      console.error('[useAudioRecorder] startRecording error', err);
      await teardownCapturePipeline();
      teardownNativeRecording();
      setStatus('idle');
      setError?.('Failed to start recording: ' + (err as Error).message);
    }
  }, [
    initSocket,
    isReady,
    isResetting,
    setError,
    setStatus,
    userId,
    setRecordingId,
    setRecordingInterrupted,
    vadLoading,
    vadStatus,
    draftSync,
    preloadVAD,
    teardownCapturePipeline,
    teardownNativeRecording,
    setupCapturePipeline,
    setupNativeRecording,
  ]);

  const pauseRecording = useCallback(() => {
    if (captureModeRef.current === 'native') {
      console.warn('[useAudioRecorder] pause not supported in native capture mode');
      return;
    }
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
    if (captureModeRef.current === 'native') {
      console.warn('[useAudioRecorder] resume not supported in native capture mode');
      return;
    }
    if (mediaRecorderRef.current?.state === 'paused') {
      try {
        mediaRecorderRef.current.resume();
        if (vadRef.current && streamRef.current) {
          vadPendingStreamRef.current = streamRef.current;
          void vadRef.current.start();
        }
        if (pipelineRef.current) {
          startAudioMeter(pipelineRef.current.outputAnalyser);
        }
        setStatus('recording');
      } catch (err) {
        console.error('[useAudioRecorder] resume error', err);
      }
    }
  }, [setStatus, startAudioMeter]);

  const finalizeActiveRecording = useCallback(
    (opts?: { notifyBackend?: boolean }) => {
      const nativeActive =
        captureModeRef.current === 'native' && statusRef.current !== 'idle';
      const recorderActive =
        mediaRecorderRef.current != null &&
        mediaRecorderRef.current.state !== 'inactive';
      const wasActive = nativeActive || recorderActive;

      try {
        detachStreamMonitor();
        interruptionHandledRef.current = false;
        setRecordingInterrupted(false);

        if (nativeActive) {
          nativeStopRecording();
          teardownNativeRecording();
        }

        if (recorderActive) {
          mediaRecorderRef.current!.stop();
        }

        destroyPipeline();
        stopRawStream();
        vadPendingStreamRef.current = null;
        audioContextRef.current = null;

        stopAudioMeter();
        void pauseVAD();
        void draftSyncRef.current?.flushDraft?.();
        void releaseScreenWake();

        if (vadRef.current) {
          setVadStatus('ready');
        }

        if (opts?.notifyBackend && wasActive) {
          emitStopRecording();
        }
      } catch (err) {
        console.error('[useAudioRecorder] finalizeActiveRecording error', err);
        setStatus('idle');
      }
    },
    [pauseVAD, stopAudioMeter, setStatus, destroyPipeline, stopRawStream, detachStreamMonitor, setRecordingInterrupted, teardownNativeRecording]
  );

  const stopRecording = useCallback(() => {
    const nativeActive =
      captureModeRef.current === 'native' && statusRef.current !== 'idle';
    const recorderActive =
      mediaRecorderRef.current != null &&
      mediaRecorderRef.current.state !== 'inactive';
    const wasActive = nativeActive || recorderActive;

    finalizeActiveRecording();

    if (nativeActive) {
      interruptionHandledRef.current = false;
      setRecordingInterrupted(false);
      setTranscriptionWarning(null);
      setLastSegmentAgeSec(null);
      setStatus('idle');
    }

    if (wasActive) {
      setTimeout(() => emitStopRecording(), 200);
    }
  }, [finalizeActiveRecording, setStatus, setRecordingInterrupted, setTranscriptionWarning, setLastSegmentAgeSec]);

  useEffect(() => {
    initSocket();

    return () => {
      try {
        vadPreloadGenRef.current += 1;

        const wasActive =
          statusRef.current === 'recording' ||
          statusRef.current === 'paused' ||
          (captureModeRef.current === 'native' && statusRef.current !== 'idle') ||
          (mediaRecorderRef.current != null &&
            mediaRecorderRef.current.state !== 'inactive');

        if (wasActive) {
          finalizeActiveRecording({ notifyBackend: true });
        } else {
          void releaseScreenWake();
        }

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
  }, [initSocket, destroyVAD, finalizeActiveRecording]);

  const resetRecording = useCallback(() => {
    setIsResetting(true);

    const cleanup = () => {
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.stop();
        }
      } catch { /* ignore */ }

      destroyPipeline();
      stopRawStream();
      vadPendingStreamRef.current = null;
      audioContextRef.current = null;

      stopAudioMeter();
      void pauseVAD();
      void releaseScreenWake();
      if (vadRef.current) {
        setVadStatus('ready');
      }

      detachStreamMonitor();
      interruptionHandledRef.current = false;
      setRecordingInterrupted(false);

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
  }, [setStatus, clearTranscript, setRecordingId, pauseVAD, stopAudioMeter, destroyPipeline, stopRawStream, detachStreamMonitor, setRecordingInterrupted]);

  return {
    startRecording,
    pauseRecording,
    resumeRecording,
    recoverRecording,
    stopRecording,
    resetRecording,
    isRecording: status === 'recording',
    isPaused: status === 'paused',
    isProcessing: status === 'processing',
    isResetting,
    isRecovering,
    isReady,
    isConnecting,
    vadLoading,
    vadStatus,
    vadError,
    audioLevel,
    rnnoiseReady,
    captureMode: captureModeRef.current,
    isNativeCapture: captureModeRef.current === 'native',
    nativeAudioStatus,
  };
};
