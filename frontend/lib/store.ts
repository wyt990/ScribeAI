import { create } from 'zustand';
import { APP_CONFIG } from './app-config';
import {
  loadAudioSettings,
  saveAudioSettings,
  GAIN_DEFAULT,
} from './audio-settings';
import { GAIN_MIN, GAIN_MAX, GAIN_STEP } from '@/config/audio';

function clampGain(value: number): number {
  const steps = Math.round(value / GAIN_STEP);
  return Math.min(GAIN_MAX, Math.max(GAIN_MIN, steps * GAIN_STEP));
}

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'processing' | 'completed';
export type AudioMode = 'mic' | 'tab';

const persistedAudio = typeof window !== 'undefined' ? loadAudioSettings() : {
  audioGain: GAIN_DEFAULT,
  autoGainEnabled: true,
  noiseSuppressionEnabled: true,
};

interface RecordingState {
  status: RecordingStatus;
  audioMode: AudioMode;
  transcript: string[];
  currentSessionId: string | null;
  error: string | null;
  userId: string | null;
  recordingId: string | null;
  draftId: string | null;
  draftTitle: string | null;
  activeOrgId: string | null;
  audioGain: number;
  autoGainEnabled: boolean;
  noiseSuppressionEnabled: boolean;

  setStatus: (status: RecordingStatus) => void;
  setAudioMode: (mode: AudioMode) => void;
  addTranscriptLine: (line: string) => void;
  clearTranscript: () => void;
  setCurrentSessionId: (id: string | null) => void;
  setError: (error: string | null) => void;
  setUserId: (id: string) => void;
  setRecordingId: (id: string | null) => void;
  setDraftId: (id: string | null) => void;
  setDraftTitle: (title: string | null) => void;
  setActiveOrgId: (id: string | null) => void;
  setAudioGain: (gain: number) => void;
  /** 自动增益实时刷新显示，不写入 localStorage */
  setAudioGainLive: (gain: number) => void;
  setAutoGainEnabled: (enabled: boolean) => void;
  setNoiseSuppressionEnabled: (enabled: boolean) => void;
  clearDraft: () => void;
  reset: () => void;
  setTranscript: (text: string | string[]) => void;
}

export const useRecordingStore = create<RecordingState>((set) => ({
  status: 'idle',
  audioMode: APP_CONFIG.defaultAudioSource,
  transcript: [],
  currentSessionId: null,
  error: null,
  userId: null,
  recordingId: null,
  draftId: null,
  draftTitle: null,
  activeOrgId: null,
  audioGain: persistedAudio.audioGain,
  autoGainEnabled: persistedAudio.autoGainEnabled,
  noiseSuppressionEnabled: persistedAudio.noiseSuppressionEnabled,

  setStatus: (status) => set({ status }),
  setAudioMode: (mode) => set({ audioMode: mode }),
  addTranscriptLine: (line) => set((state) => ({
    transcript: [...state.transcript, line],
  })),
  clearTranscript: () => set({ transcript: [] }),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  setError: (error) => set({ error }),
  setUserId: (id) => set({ userId: id }),
  setRecordingId: (id) => set({ recordingId: id }),
  setDraftId: (id) => set({ draftId: id }),
  setDraftTitle: (title) => set({ draftTitle: title }),
  setActiveOrgId: (id) => set({ activeOrgId: id }),
  setAudioGain: (gain) => {
    const next = saveAudioSettings({ audioGain: gain });
    set({ audioGain: next.audioGain });
  },
  setAudioGainLive: (gain) => set({ audioGain: clampGain(gain) }),
  setAutoGainEnabled: (enabled) => {
    const next = saveAudioSettings({ autoGainEnabled: enabled });
    set({ autoGainEnabled: next.autoGainEnabled });
  },
  setNoiseSuppressionEnabled: (enabled) => {
    const next = saveAudioSettings({ noiseSuppressionEnabled: enabled });
    set({ noiseSuppressionEnabled: next.noiseSuppressionEnabled });
  },
  clearDraft: () => set({ draftId: null, draftTitle: null }),
  reset: () => set({
    status: 'idle',
    transcript: [],
    currentSessionId: null,
    error: null,
    userId: null,
    recordingId: null,
    draftId: null,
    draftTitle: null,
    activeOrgId: null,
  }),

  setTranscript: (text) => set({
    transcript: Array.isArray(text) ? text : [text],
  }),
}));
