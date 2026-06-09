'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useCanPromote } from '@/hooks/use-can-promote';
import { useDraftSync } from '@/hooks/use-draft-sync';
import { useRecordingStore } from '@/lib/store';
import { promoteDraftAndGenerateSummary } from '@/lib/promote-and-summarize';

type GenerateMeetingSummaryButtonProps = {
  className?: string;
  templateId?: string;
};

export function GenerateMeetingSummaryButton({
  className,
  templateId,
}: GenerateMeetingSummaryButtonProps) {
  const router = useRouter();
  const { flushDraft } = useDraftSync();
  const { canPromote } = useCanPromote();
  const { draftId, clearTranscript, clearDraft } = useRecordingStore();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!draftId || !canPromote || loading) return;

    setLoading(true);
    try {
      await promoteDraftAndGenerateSummary({
        draftId,
        flushDraft,
        templateId,
        router,
      });
      clearTranscript();
      clearDraft();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : '生成会议纪要失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      className={className}
      variant="default"
      onClick={() => void handleClick()}
      disabled={!canPromote || loading}
    >
      {loading ? '生成中（约 1–3 分钟）...' : '生成会议纪要'}
    </Button>
  );
}
