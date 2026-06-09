'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FileAudio, X } from 'lucide-react';
import type { Draft } from '@/lib/draft-api';
import { DRAFT_STATUS_LABEL } from '@/lib/draft-api';

type DraftRestoreBannerProps = {
  draft: Draft;
  onRestore: () => void;
  onDismiss: () => void;
};

export function DraftRestoreBanner({ draft, onRestore, onDismiss }: DraftRestoreBannerProps) {
  return (
    <Alert className="border-amber-500/40 bg-amber-500/10">
      <FileAudio className="h-4 w-4" />
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <span>
          检测到未完成的草稿「{draft.title}」（{DRAFT_STATUS_LABEL[draft.status as keyof typeof DRAFT_STATUS_LABEL] || draft.status}），是否恢复？
        </span>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" onClick={onRestore}>
            恢复草稿
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
