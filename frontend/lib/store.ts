import { create } from 'zustand';
import { APP_CONFIG } from './app-config';

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'processing' | 'completed';
export type AudioMode = 'mic' | 'tab';

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
  }),

  // ✅ Implement setTranscript
  setTranscript: (text) => set({
    transcript: Array.isArray(text) ? text : [text],
  }),
}));

