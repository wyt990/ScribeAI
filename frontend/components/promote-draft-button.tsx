'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { promoteDraft } from '@/lib/draft-api';
import { useRecordingStore } from '@/lib/store';
import { useCanPromote } from '@/hooks/use-can-promote';

type PromoteDraftButtonProps = {
  className?: string;
};

export function PromoteDraftButton({ className }: PromoteDraftButtonProps) {
  const router = useRouter();
  const { canPromote } = useCanPromote();
  const { draftId, draftTitle, clearTranscript, clearDraft } = useRecordingStore();

  const [saving, setSaving] = useState(false);
  const [openTitleDialog, setOpenTitleDialog] = useState(false);
  const [title, setTitle] = useState('');

  const openSaveDialog = () => {
    setTitle(draftTitle?.startsWith('草稿') ? '' : draftTitle || '');
    setOpenTitleDialog(true);
  };

  const handlePromote = async () => {
    if (!draftId || !canPromote) return;
    if (!title.trim()) return alert('请输入会话标题');

    setSaving(true);
    try {
      await promoteDraft(draftId, title.trim());
      setOpenTitleDialog(false);
      clearTranscript();
      clearDraft();
      router.replace('/sessions');
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        className={className}
        onClick={openSaveDialog}
        disabled={!canPromote}
      >
        保存为正式会话
      </Button>

      <Dialog open={openTitleDialog} onOpenChange={setOpenTitleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存为正式会话</DialogTitle>
          </DialogHeader>

          <Input
            placeholder="例如：团队会议、机器学习讲座、讨论..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenTitleDialog(false)}>
              取消
            </Button>
            <Button onClick={handlePromote} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
