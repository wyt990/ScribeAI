'use client';

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AudioModeSelector } from "@/components/audio-mode-selector";
import { RecordingControls } from "@/components/recording-controls";
import { useRecordingStore } from "@/lib/store";
import { TranscriptFeed } from "@/components/transcript-feed";
import { DraftRestoreBanner } from "@/components/draft-restore-banner";
import { getSocket, onTranscript, onProcessing, onCompleted, onSegmentResult, bufferSegmentResult } from '@/lib/socket';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useDraftSync } from "@/hooks/use-draft-sync";
import { fetchActiveDraft, fetchDraft, deleteDraft, type Draft } from "@/lib/draft-api";
import { Button } from "@/components/ui/button";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftIdParam = searchParams.get('draftId');

  const {
    error,
    addTranscriptLine,
    setStatus,
    audioMode,
    setCurrentSessionId,
    setUserId,
    setTranscript,
    setDraftId,
    setDraftTitle,
    clearDraft,
    clearTranscript,
    draftId,
    draftTitle,
    status,
    setAudioMode,
  } = useRecordingStore();

  const { ensureDraft, flushDraft } = useDraftSync();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<Draft | null>(null);
  const [restoreDismissed, setRestoreDismissed] = useState(false);

  const applyDraft = useCallback((draft: Draft) => {
    setDraftId(draft.id);
    setDraftTitle(draft.title);
    if (draft.fullText?.trim()) {
      setTranscript([draft.fullText.trim()]);
    }
    if (draft.audioMode === 'mic' || draft.audioMode === 'tab') {
      setAudioMode(draft.audioMode);
    }
    // 从服务端恢复后本地无 MediaRecorder，统一为 idle，由用户点「开始录音」续录
    setStatus('idle');
  }, [setDraftId, setDraftTitle, setTranscript, setAudioMode, setStatus]);

  // --- Verify user ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return router.replace("/login");

    const verifyUser = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          localStorage.removeItem("token");
          return router.replace("/login");
        }

        const data = await res.json();
        setUser(data.user);
        setUserId(data.user.id);
      } catch (err) {
        console.error(err);
        localStorage.removeItem("token");
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    };

    verifyUser();
  }, [router, setUserId]);

  // --- Load draft from URL or detect active draft ---
  useEffect(() => {
    if (loading) return;

    const loadDraftContext = async () => {
      try {
        if (draftIdParam) {
          // 已加载同一草稿则跳过（避免转正后 clearDraft 触发重复请求）
          if (draftId === draftIdParam) return;

          const draft = await fetchDraft(draftIdParam);
          if (!draft) {
            router.replace('/dashboard');
            return;
          }
          applyDraft(draft);
          setPendingRestore(null);
          router.replace('/dashboard');
          return;
        }

        if (draftId) return;

        const active = await fetchActiveDraft();
        if (active && !restoreDismissed) {
          setPendingRestore(active);
        }
      } catch (err) {
        console.error('[Dashboard] draft load error:', err);
      }
    };

    void loadDraftContext();
  }, [loading, draftIdParam, draftId, restoreDismissed, applyDraft, router]);

  // --- Socket listeners for live transcription ---
  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    const unsubscribeTranscript = onTranscript((text) => addTranscriptLine(text));

    const unsubscribeSegmentResult = onSegmentResult(({ seq, text }) => {
      for (const segment of bufferSegmentResult(seq, text)) {
        addTranscriptLine(segment);
      }
    });

    const unsubscribeProcessing = onProcessing(() => setStatus('processing'));
    const unsubscribeCompleted = onCompleted(() => {
      setStatus('completed');
      const sessionId = `session_${Date.now()}`;
      setCurrentSessionId(sessionId);
    });

    return () => {
      unsubscribeTranscript();
      unsubscribeSegmentResult();
      unsubscribeProcessing();
      unsubscribeCompleted();
      void flushDraft();
    };
  }, [addTranscriptLine, setStatus, setCurrentSessionId, flushDraft]);

  const handleRestore = () => {
    if (!pendingRestore) return;
    applyDraft(pendingRestore);
    setPendingRestore(null);
  };

  const handleDiscardDraft = async () => {
    if (!draftId) return;
    if (!confirm('确定放弃当前草稿？内容将永久删除。')) return;
    try {
      await deleteDraft(draftId);
      clearDraft();
      clearTranscript();
      setStatus('idle');
    } catch (err) {
      console.error(err);
      alert('删除草稿失败');
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-lg">加载中...</p>
      </div>
    );
  }

  return (
    <div className="h-full px-6 py-2 space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {pendingRestore && !draftId && (
        <DraftRestoreBanner
          draft={pendingRestore}
          onRestore={handleRestore}
          onDismiss={() => {
            setRestoreDismissed(true);
            setPendingRestore(null);
          }}
        />
      )}

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-xl font-semibold">欢迎回来，{user?.name}</h2>
        {draftId && status !== 'recording' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="truncate">当前草稿：{draftTitle}</span>
            <Button variant="outline" size="sm" onClick={handleDiscardDraft}>
              放弃草稿
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <AudioModeSelector />
          <RecordingControls ensureDraft={ensureDraft} flushDraft={flushDraft} />
        </div>

        <div className="lg:col-span-2 h-[calc(100vh-12rem)]">
          <TranscriptFeed />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><p className="text-muted-foreground">加载中...</p></div>}>
      <DashboardContent />
    </Suspense>
  );
}
