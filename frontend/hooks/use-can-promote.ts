'use client';

import { useRecordingStore } from '@/lib/store';

const PROMOTABLE_STATUSES = ['idle', 'paused', 'completed', 'processing'] as const;

export function useCanPromote() {
  const { transcript, status, draftId } = useRecordingStore();

  const hasContent =
    (Array.isArray(transcript) ? transcript.join(' ') : transcript || '').trim().length > 0;

  const canPromote =
    !!draftId &&
    hasContent &&
    (PROMOTABLE_STATUSES as readonly string[]).includes(status);

  return { canPromote, hasContent, draftId, status };
}
