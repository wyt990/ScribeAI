'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  fetchDrafts,
  deleteDraft,
  promoteDraft,
  draftPreviewText,
  DRAFT_STATUS_LABEL,
  type Draft,
  type DraftStatus,
} from '@/lib/draft-api';

const STATUS_VARIANT: Record<DraftStatus, 'default' | 'secondary' | 'outline'> = {
  recording: 'default',
  paused: 'secondary',
  stopped: 'outline',
};

export default function DraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoteTarget, setPromoteTarget] = useState<Draft | null>(null);
  const [promoteTitle, setPromoteTitle] = useState('');
  const [promoting, setPromoting] = useState(false);

  const loadDrafts = async () => {
    try {
      const data = await fetchDrafts();
      setDrafts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDrafts();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此草稿？删除后无法恢复。')) return;
    try {
      await deleteDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error(err);
      alert('删除失败');
    }
  };

  const handleContinue = (id: string) => {
    router.push(`/dashboard?draftId=${id}`);
  };

  const openPromote = (draft: Draft) => {
    setPromoteTarget(draft);
    setPromoteTitle(draft.title.startsWith('草稿') ? '' : draft.title);
  };

  const handlePromote = async () => {
    if (!promoteTarget || !promoteTitle.trim()) return;
    setPromoting(true);
    try {
      await promoteDraft(promoteTarget.id, promoteTitle.trim());
      setDrafts((prev) => prev.filter((d) => d.id !== promoteTarget.id));
      setPromoteTarget(null);
      router.push('/sessions');
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">草稿箱</h2>
        <p className="text-sm text-muted-foreground mt-1">
          录音过程中的转录会自动保存为草稿，可继续录音或转为正式会话。
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">加载中...</p>
      ) : drafts.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <p className="text-lg">暂无草稿</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {drafts.map((draft) => (
            <Card key={draft.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{draft.title}</CardTitle>
                  <Badge variant={STATUS_VARIANT[draft.status as DraftStatus] || 'outline'}>
                    {DRAFT_STATUS_LABEL[draft.status as DraftStatus] || draft.status}
                  </Badge>
                </div>
                <CardDescription>
                  最后保存：{new Date(draft.lastSavedAt).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {draftPreviewText(draft.fullText)}
                </p>
                <div className="flex flex-row flex-wrap gap-2">
                  {(draft.status === 'recording' || draft.status === 'paused' || draft.status === 'stopped') && (
                    <Button className="flex-1" onClick={() => handleContinue(draft.id)}>
                      继续录音
                    </Button>
                  )}
                  {draft.fullText?.trim() && (
                    <Button variant="secondary" className="flex-1" onClick={() => openPromote(draft)}>
                      保存为正式会话
                    </Button>
                  )}
                  <Button variant="outline" className="flex-1" onClick={() => handleDelete(draft.id)}>
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!promoteTarget} onOpenChange={(open) => !open && setPromoteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存为正式会话</DialogTitle>
            <DialogDescription>转正后草稿将移入会议记录，并从此处删除。</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="输入会话标题"
            value={promoteTitle}
            onChange={(e) => setPromoteTitle(e.target.value)}
          />
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setPromoteTarget(null)}>
              取消
            </Button>
            <Button onClick={handlePromote} disabled={promoting || !promoteTitle.trim()}>
              {promoting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
