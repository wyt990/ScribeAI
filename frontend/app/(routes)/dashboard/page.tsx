'use client';

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AudioModeSelector } from "@/components/audio-mode-selector";
import { AudioGainControl } from "@/components/audio-gain-control";
import { RecordingControls } from "@/components/recording-controls";
import { useRecordingStore } from "@/lib/store";
import { TranscriptFeed } from "@/components/transcript-feed";
import { DraftRestoreBanner } from "@/components/draft-restore-banner";
import { connectSocket, onTranscript, onSegmentResult, onDeepgramError, bufferSegmentResult } from '@/lib/socket';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useDraftSync } from "@/hooks/use-draft-sync";
import { fetchActiveDraft, fetchDraft, deleteDraft, type Draft } from "@/lib/draft-api";
import { Button } from "@/components/ui/button";
import { clearAuthSession } from "@/lib/auth-session";
import { navigateReplace } from "@/lib/navigation";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { localizeError } from "@/lib/localize-error";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm, alert, dialogUi } = useAppDialog();
  const draftIdParam = searchParams.get('draftId');

  const {
    error,
    addTranscriptLine,
    setError,
    setStatus,
    audioMode,
    setUserId,
    setTranscript,
    setDraftId,
    setDraftTitle,
    setRecordingId,
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

  const applyDraft = useCallback((draft: Draft) => {
    setDraftId(draft.id);
    setDraftTitle(draft.title);
    setRecordingId(draft.recordingId ?? null);
    if (draft.fullText?.trim()) {
      setTranscript([draft.fullText.trim()]);
    }
    if (draft.audioMode === 'mic' || draft.audioMode === 'tab') {
      setAudioMode(draft.audioMode);
    }
    // 从服务端恢复后本地无 MediaRecorder，统一为 idle，由用户点「开始录音」续录
    setStatus('idle');
  }, [setDraftId, setDraftTitle, setRecordingId, setTranscript, setAudioMode, setStatus]);

  // --- Verify user ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return navigateReplace(router, "/login");

    const verifyUser = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          clearAuthSession();
          return navigateReplace(router, "/login");
        }

        const data = await res.json();
        setUser(data.user);
        setUserId(data.user.id);
      } catch (err) {
        console.error(err);
        clearAuthSession();
        navigateReplace(router, "/login");
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
            navigateReplace(router, '/dashboard');
            return;
          }
          applyDraft(draft);
          setPendingRestore(null);
          router.replace('/dashboard');
          return;
        }

        if (draftId) return;

        const active = await fetchActiveDraft();
        if (active) {
          setPendingRestore(active);
        }
      } catch (err) {
        console.error('[Dashboard] draft load error:', err);
      }
    };

    void loadDraftContext();
  }, [loading, draftIdParam, draftId, applyDraft, router]);

  // --- Socket listeners for live transcription ---
  useEffect(() => {
    connectSocket();

    const unsubscribeTranscript = onTranscript((text) => addTranscriptLine(text));

    const unsubscribeSegmentResult = onSegmentResult(({ seq, text }) => {
      for (const segment of bufferSegmentResult(seq, text)) {
        addTranscriptLine(segment);
      }
    });

    const unsubscribeDeepgramError = onDeepgramError((payload) => {
      const msg =
        typeof payload === 'string'
          ? payload
          : payload instanceof Error
            ? payload.message
            : '转录服务异常，请检查网络或稍后重试';
      setError(msg);
    });

    return () => {
      unsubscribeTranscript();
      unsubscribeSegmentResult();
      unsubscribeDeepgramError();
      void flushDraft();
    };
  }, [addTranscriptLine, setError, flushDraft]);

  const handleRestore = () => {
    if (!pendingRestore) return;
    applyDraft(pendingRestore);
    setPendingRestore(null);
  };

  const handleDiscardDraft = async () => {
    if (!draftId) return;
    const ok = await confirm('确定放弃当前草稿？内容将永久删除。', {
      title: '放弃草稿',
      confirmLabel: '放弃',
      destructive: true,
    });
    if (!ok) return;
    try {
      await flushDraft();
      await deleteDraft(draftId);
      clearDraft();
      clearTranscript();
      setStatus('idle');
    } catch (err) {
      console.error(err);
      await alert(localizeError(err instanceof Error ? err.message : '删除草稿失败'));
    }
  };

  const handleDiscardPendingRestore = async () => {
    if (!pendingRestore) return;
    const ok = await confirm('确定放弃该草稿？内容将永久删除。', {
      title: '放弃草稿',
      confirmLabel: '放弃',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteDraft(pendingRestore.id);
      setPendingRestore(null);
    } catch (err) {
      console.error(err);
      await alert(localizeError(err instanceof Error ? err.message : '删除草稿失败'));
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-lg">加载中...</p>
      </div>
    );
  }

  const showDraftBar = !!draftId && status !== 'recording';

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col gap-2 md:gap-6 px-4 md:px-6 pt-0 pb-2 md:py-2">
      {error && (
        <Alert variant="destructive" className="shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {pendingRestore && !draftId && (
        <DraftRestoreBanner
          draft={pendingRestore}
          onRestore={handleRestore}
          onDiscard={handleDiscardPendingRestore}
        />
      )}

      {/* 移动端隐藏「欢迎回来」以腾出顶栏下方空间；桌面端保留 */}
      <div
        className={
          showDraftBar
            ? 'shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 md:gap-2'
            : 'hidden md:flex md:items-center md:justify-between shrink-0'
        }
      >
        <h2 className="hidden md:block text-xl font-semibold truncate">
          欢迎回来，{user?.name}
        </h2>
        {showDraftBar && (
          <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
            <span className="truncate">当前草稿：{draftTitle}</span>
            <Button variant="outline" size="sm" onClick={handleDiscardDraft}>
              放弃草稿
            </Button>
          </div>
        )}
      </div>

      {/* 移动端：录音控件固定高度 + 实时转录弹性占满剩余空间 */}
      <div className="flex-1 min-h-0 overflow-hidden grid grid-rows-[auto_minmax(0,1fr)] lg:grid-rows-1 lg:grid-cols-3 gap-2 md:gap-6">
        <div className="lg:col-span-1 flex flex-col gap-2 md:gap-6 shrink-0 min-h-0">
          <AudioModeSelector />
          <RecordingControls ensureDraft={ensureDraft} flushDraft={flushDraft} />
          <AudioGainControl />
        </div>

        <div className="min-h-0 h-full overflow-hidden flex flex-col lg:col-span-2">
          <TranscriptFeed />
        </div>
      </div>

      {dialogUi}
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
