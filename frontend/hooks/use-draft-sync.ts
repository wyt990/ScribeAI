'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRecordingStore } from '@/lib/store';
import { createDraft, updateDraft } from '@/lib/draft-api';

const DEBOUNCE_MS = 3000;

/** 草稿自动保存：转录追加防抖写入，状态变更立即写入，离开页面时刷盘 */
export function useDraftSync() {
  const { transcript, status, draftId, audioMode, recordingId, setDraftId, setDraftTitle } =
    useRecordingStore();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedTextRef = useRef('');
  const draftIdRef = useRef(draftId);
  const recordingIdRef = useRef(recordingId);
  draftIdRef.current = draftId;
  recordingIdRef.current = recordingId;

  const getFullText = useCallback(() => {
    return Array.isArray(transcript) ? transcript.join(' ') : String(transcript || '');
  }, [transcript]);

  const persistDraft = useCallback(
    async (opts?: { fullText?: string; status?: string; force?: boolean; recordingId?: string }) => {
      const id = draftIdRef.current;
      if (!id) return;

      const fullText = opts?.fullText ?? getFullText();
      if (!opts?.force && fullText === lastSavedTextRef.current && !opts?.status) return;

      const rid = opts?.recordingId ?? recordingIdRef.current;

      try {
        await updateDraft(id, {
          fullText,
          ...(opts?.status ? { status: opts.status as 'recording' | 'paused' | 'stopped' } : {}),
          ...(rid ? { recordingId: rid } : {}),
          audioMode,
        });
        lastSavedTextRef.current = fullText;
      } catch (err) {
        console.error('[DraftSync] save failed:', err);
      }
    },
    [getFullText, audioMode]
  );

  const flushDraft = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const id = draftIdRef.current;
    if (!id) return;

    const fullText = getFullText();
    const draftStatus =
      status === 'recording' ? 'recording' : status === 'paused' ? 'paused' : 'stopped';

    await persistDraft({
      fullText,
      status: draftStatus,
      force: true,
      recordingId: recordingIdRef.current || undefined,
    });
  }, [getFullText, status, persistDraft]);

  const ensureDraft = useCallback(
    async (recordingIdOverride?: string) => {
      const rid = recordingIdOverride ?? recordingIdRef.current;

      if (draftIdRef.current) {
        await updateDraft(draftIdRef.current, {
          status: 'recording',
          ...(rid ? { recordingId: rid } : {}),
        });
        if (rid) recordingIdRef.current = rid;
        return draftIdRef.current;
      }

      try {
        const draft = await createDraft({
          audioMode,
          recordingId: rid || undefined,
        });
        setDraftId(draft.id);
        setDraftTitle(draft.title);
        draftIdRef.current = draft.id;
        if (rid) recordingIdRef.current = rid;
        lastSavedTextRef.current = '';
        return draft.id;
      } catch (err) {
        console.error('[DraftSync] create failed:', err);
        return null;
      }
    },
    [audioMode, setDraftId, setDraftTitle]
  );

  // 转录变化：防抖保存
  useEffect(() => {
    if (!draftId) return;
    const fullText = getFullText();
    if (!fullText.trim()) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persistDraft({ fullText });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [transcript, draftId, getFullText, persistDraft]);

  // 录音状态变化：立即保存状态
  useEffect(() => {
    if (!draftId) return;
    if (status === 'recording') void persistDraft({ status: 'recording', force: true });
    else if (status === 'paused') void persistDraft({ status: 'paused', force: true });
    else if (status === 'idle' || status === 'processing' || status === 'completed') {
      const fullText = getFullText();
      if (fullText.trim()) void persistDraft({ status: 'stopped', fullText, force: true });
    }
  }, [status, draftId, getFullText, persistDraft]);

  // 离开页面 / 切到后台：刷盘
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushDraft();
    };
    const onBeforeUnload = () => {
      void flushDraft();
    };

    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void flushDraft();
    };
  }, [flushDraft]);

  return { ensureDraft, flushDraft, persistDraft };
};
